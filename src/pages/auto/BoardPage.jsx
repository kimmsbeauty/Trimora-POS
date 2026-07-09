// src/pages/auto/BoardPage.jsx
//
// The Queue + Bay board -- one screen, two projections of the same
// auto_jobs/auto_bays state, per the architecture plan's modeling note
// (Check-In, Queue, and Bay Management are one state machine, not three
// separate data models). Tap a waiting job, then tap a free bay, to
// start it. Tap an occupied bay to advance its job through the
// in_bay -> ready_for_collection -> completed sequence, or cancel it.
//
// Deliberately polling (10s interval + manual refresh button), not
// Supabase Realtime -- the kickoff brief's hard constraint requires
// any new real-time infrastructure to be isolated from POS's existing
// setup (separate channels/rate limits), which is real, separate scope.
// Polling is a legitimate, zero-new-infrastructure interim that keeps
// this screen honest about what it actually does.

import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/db";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./theme";

var ACTIVE_STATUSES = "waiting,in_bay,ready_for_collection";
var NEXT_STATUS = { in_bay: "ready_for_collection", ready_for_collection: "completed" };
var STATUS_LABEL = {
  waiting: "Waiting", in_bay: "In bay",
  ready_for_collection: "Ready for collection", completed: "Completed", cancelled: "Cancelled",
};

function vehicleLabel(job) {
  var v = job.auto_vehicles;
  if (!v) return "Vehicle";
  return v.reg_number + (v.make || v.model ? " · " + [v.make, v.model].filter(Boolean).join(" ") : "");
}

function elapsedMinutes(isoString) {
  var mins = Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
  return mins < 1 ? "just now" : mins + " min";
}

export default function BoardPage() {
  var jobsState = useState([]); var jobs = jobsState[0]; var setJobs = jobsState[1];
  var baysState = useState([]); var bays = baysState[0]; var setBays = baysState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var selectedJobIdState = useState(null);
  var selectedJobId = selectedJobIdState[0]; var setSelectedJobId = selectedJobIdState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];

  var load = useCallback(async function () {
    var results = await Promise.all([
      db("GET", "auto_bays", null, "?order=label.asc"),
      db("GET", "auto_jobs", null,
        "?status=in.(" + ACTIVE_STATUSES + ")&order=checked_in_at.asc" +
        "&select=*,auto_vehicles(reg_number,make,model,color),customers(name,phone)"),
    ]);
    setBays(results[0] || []);
    setJobs(results[1] || []);
    setLoading(false);
  }, []);

  useEffect(function () {
    load();
    var interval = setInterval(load, 10000);
    return function () { clearInterval(interval); };
  }, [load]);

  var jobsById = {};
  jobs.forEach(function (j) { jobsById[j.id] = j; });

  var waitingJobs = jobs.filter(function (j) { return j.status === "waiting"; });
  var activeJobs = jobs.filter(function (j) { return j.status !== "waiting"; });

  async function assignBay(bayId) {
    if (!selectedJobId || busy) return;
    setBusy(true);
    await db("PATCH", "auto_jobs",
      { status: "in_bay", bay_id: bayId, in_bay_at: new Date().toISOString() },
      "?id=eq." + selectedJobId);
    await db("PATCH", "auto_bays", { current_job_id: selectedJobId }, "?id=eq." + bayId);
    await db("POST", "auto_job_events", {
      job_id: selectedJobId, event_type: "started", payload: { bay_id: bayId },
    });
    setSelectedJobId(null);
    setBusy(false);
    load();
  }

  async function advanceJob(job) {
    if (busy) return;
    var next = NEXT_STATUS[job.status];
    if (!next) return;
    setBusy(true);

    var patch = { status: next };
    if (next === "ready_for_collection") patch.ready_at = new Date().toISOString();
    if (next === "completed") patch.completed_at = new Date().toISOString();
    await db("PATCH", "auto_jobs", patch, "?id=eq." + job.id);

    if (next === "completed" && job.bay_id) {
      await db("PATCH", "auto_bays", { current_job_id: null }, "?id=eq." + job.bay_id);
    }

    await db("POST", "auto_job_events", {
      job_id: job.id, event_type: next === "completed" ? "completed" : "status_changed",
      payload: { from: job.status, to: next },
    });

    setBusy(false);
    load();
  }

  async function cancelJob(job) {
    if (busy) return;
    setBusy(true);
    await db("PATCH", "auto_jobs", { status: "cancelled" }, "?id=eq." + job.id);
    if (job.bay_id) {
      await db("PATCH", "auto_bays", { current_job_id: null }, "?id=eq." + job.bay_id);
    }
    await db("POST", "auto_job_events", { job_id: job.id, event_type: "cancelled" });
    setBusy(false);
    load();
  }

  var panelStyle = {
    background: STEEL, borderRadius: 14, padding: 16,
    border: "1px solid rgba(143,166,184,0.15)",
  };
  var sectionLabel = {
    fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
    color: CHROME, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", background: INK }} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: INK, fontFamily: "system-ui, -apple-system, sans-serif",
      padding: 20 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Bays */}
        <div style={Object.assign({}, panelStyle, { marginBottom: 16 })}>
          <div style={sectionLabel}>
            <span>Bays</span>
            {selectedJobId && <span style={{ color: SIGNAL }}>Tap a free bay to assign</span>}
          </div>
          {bays.length === 0 && (
            <div style={{ fontSize: 13, color: CHROME }}>No bays set up yet for this business.</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {bays.map(function (bay) {
              var occupiedJob = bay.current_job_id ? jobsById[bay.current_job_id] : null;
              var isFree = bay.active && !bay.current_job_id;
              var clickable = isFree && !!selectedJobId;
              return (
                <div key={bay.id}
                  onClick={function () { if (clickable) assignBay(bay.id); }}
                  style={{
                    borderRadius: 10, padding: 12, minHeight: 74,
                    border: "1.5px solid " + (clickable ? SIGNAL : "rgba(143,166,184,0.2)"),
                    background: isFree ? "rgba(255,255,255,0.02)" : "rgba(255,107,74,0.06)",
                    cursor: clickable ? "pointer" : "default",
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: PAPER, marginBottom: 4 }}>{bay.label}</div>
                  {occupiedJob ? (
                    <div style={{ fontSize: 11, color: CHROME }}>{vehicleLabel(occupiedJob)}</div>
                  ) : (
                    <div style={{ fontSize: 11, color: SIGNAL }}>Free</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Waiting queue */}
        <div style={Object.assign({}, panelStyle, { marginBottom: 16 })}>
          <div style={sectionLabel}>
            <span>Waiting ({waitingJobs.length})</span>
            <span onClick={load} style={{ cursor: "pointer", color: CHROME }}>↻ refresh</span>
          </div>
          {waitingJobs.length === 0 && (
            <div style={{ fontSize: 13, color: CHROME }}>No vehicles waiting.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {waitingJobs.map(function (job) {
              var isSelected = selectedJobId === job.id;
              return (
                <div key={job.id}
                  onClick={function () { setSelectedJobId(isSelected ? null : job.id); }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                    border: "1.5px solid " + (isSelected ? SIGNAL : "rgba(143,166,184,0.2)"),
                    background: isSelected ? "rgba(61,220,151,0.1)" : "rgba(255,255,255,0.02)",
                  }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: PAPER }}>{vehicleLabel(job)}</div>
                    <div style={{ fontSize: 11, color: CHROME }}>
                      {job.customers ? job.customers.name + " · " : ""}waiting {elapsedMinutes(job.checked_in_at)}
                    </div>
                  </div>
                  {isSelected && <div style={{ fontSize: 11, fontWeight: 800, color: SIGNAL }}>Selected</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* In progress */}
        <div style={panelStyle}>
          <div style={sectionLabel}><span>In progress ({activeJobs.length})</span></div>
          {activeJobs.length === 0 && (
            <div style={{ fontSize: 13, color: CHROME }}>No vehicles in progress.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeJobs.map(function (job) {
              return (
                <div key={job.id} style={{
                  padding: "12px 14px", borderRadius: 10,
                  border: "1.5px solid rgba(143,166,184,0.2)", background: "rgba(255,255,255,0.02)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: PAPER }}>{vehicleLabel(job)}</div>
                      <div style={{ fontSize: 11, color: CHROME }}>{STATUS_LABEL[job.status]}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {NEXT_STATUS[job.status] && (
                        <button onClick={function () { advanceJob(job); }} disabled={busy} style={{
                          background: SIGNAL, color: INK, border: "none", borderRadius: 8,
                          padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer",
                        }}>
                          {NEXT_STATUS[job.status] === "completed" ? "Complete" : "Next: " + STATUS_LABEL[NEXT_STATUS[job.status]]}
                        </button>
                      )}
                      <button onClick={function () { cancelJob(job); }} disabled={busy} style={{
                        background: "transparent", color: ALERT, border: "1px solid " + ALERT,
                        borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
