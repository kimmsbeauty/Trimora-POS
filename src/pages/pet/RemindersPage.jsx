// src/pages/pet/RemindersPage.jsx
//
// Manual reminders (migration 100). The page lists what is due, staff prepare a
// message, open it in WhatsApp or SMS on their own device, then record what happened.
// NOTHING IS SENT AUTOMATICALLY and the app cannot see whether a message was delivered:
// "Sent" means a staff member says they sent it. Automated delivery is a later phase.
import React, { useEffect, useMemo, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { MUTED_FG, MUTED, BORDER, FOREGROUND, PRIMARY, PRIMARY_FG } from "./theme";
import { todayIso, addDaysIso } from "./petData";
import {
  KINDS, kindLabel, STATUS_LABELS, STATUS_TONES, MAX_ATTEMPTS, DEFAULT_OPTS,
  buildCandidates, buildMessage, channelUrl, normalizePhone, reminderErrorMessage,
} from "./reminderData";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";

var HISTORY_PAGE = 25;

function whenLabel(c) {
  var s = String(c.when || "");
  var d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : new Date(s);
  if (isNaN(d.getTime())) return "";
  var date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? date : date + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function RemindersPage() {
  var salon = useSalon();
  var businessName = (salon && salon.name) || "";
  var dataState = useState(null); var data = dataState[0]; var setData = dataState[1];
  var statusState = useState("loading"); var loadStatus = statusState[0]; var setLoadStatus = statusState[1];
  var attemptState = useState(0); var attempt = attemptState[0]; var setAttempt = attemptState[1];
  var tabState = useState("todo"); var tab = tabState[0]; var setTab = tabState[1];
  var optsState = useState({ appointmentHours: DEFAULT_OPTS.appointmentHours, vaccinationDays: DEFAULT_OPTS.vaccinationDays });
  var opts = optsState[0]; var setOpts = optsState[1];
  var kindState = useState("all"); var kindFilter = kindState[0]; var setKindFilter = kindState[1];
  var histState = useState("all"); var histFilter = histState[0]; var setHistFilter = histState[1];
  var shownState = useState(HISTORY_PAGE); var shown = shownState[0]; var setShown = shownState[1];
  var modalState = useState(null); var modal = modalState[0]; var setModal = modalState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    var now = new Date(); var today = todayIso(now);
    var from = new Date(now.getTime() - 100 * 86400000).toISOString();
    var to = new Date(now.getTime() + 5 * 86400000).toISOString();
    Promise.all([
      db("GET", "pet_bookings", null, "?select=id,customer_id,pet_id,starts_at,status&starts_at=gte." + from + "&starts_at=lte." + to + "&order=starts_at.asc&limit=3000"),
      db("GET", "pet_pets", null, "?select=id,customer_id,name,archived_at&limit=3000"),
      db("GET", "customers", null, "?select=id,name,phone,marketing_opt_out&limit=3000"),
      db("GET", "pet_vaccinations", null, "?select=id,pet_id,vaccine,next_due_on&next_due_on=not.is.null&next_due_on=gte." + addDaysIso(today, -365) + "&next_due_on=lte." + addDaysIso(today, 60) + "&limit=3000"),
      db("GET", "pet_boarding_stays", null, "?select=id,customer_id,pet_id,status,check_out_on&status=eq.occupied&limit=1000"),
      db("GET", "pet_reminders", null, "?select=*&order=created_at.desc&limit=1000"),
    ]).then(function (res) {
      if (cancelled) return;
      for (var i = 0; i < 5; i++) { if (!Array.isArray(res[i])) { setLoadStatus("error"); return; } }
      // The reminders table is missing until migration 100 is applied: say so plainly.
      if (!Array.isArray(res[5])) { setLoadStatus("needs-db"); return; }
      setData({ bookings: res[0], pets: res[1], customers: res[2], vaccinations: res[3], stays: res[4], reminders: res[5], now: now });
      setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [attempt]);

  var customersById = useMemo(function () {
    var m = {}; ((data && data.customers) || []).forEach(function (c) { m[c.id] = c; }); return m;
  }, [data]);
  var petsById = useMemo(function () {
    var m = {}; ((data && data.pets) || []).forEach(function (p) { m[p.id] = p; }); return m;
  }, [data]);

  var candidates = useMemo(function () {
    if (!data) return [];
    return buildCandidates({ now: data.now, bookings: data.bookings, pets: data.pets, customers: data.customers,
      vaccinations: data.vaccinations, stays: data.stays, reminders: data.reminders }, opts);
  }, [data, opts]);
  var visible = candidates.filter(function (c) { return kindFilter === "all" || c.kind === kindFilter; });
  var history = ((data && data.reminders) || []).filter(function (r) { return histFilter === "all" || r.status === histFilter; });

  function reload() { setAttempt(attempt + 1); }

  function openModal(c) {
    var channel = "whatsapp";
    setErr("");
    setModal({ cand: c, channel: channel, text: c.reminder ? c.reminder.message : buildMessage(c, businessName), reminder: c.reminder || null, opened: !!c.reminder && c.reminder.status === "pending" });
  }

  // Runs when staff click the WhatsApp / SMS link. The link itself opens immediately (it is a
  // normal anchor, so pop-up blockers don't interfere); this records the reminder alongside it.
  async function onOpenLink() {
    if (!modal) return;
    setBusy(true); setErr("");
    var res = await dbRpcAuth("pet_queue_reminder", { p_kind: modal.cand.kind, p_source_id: modal.cand.sourceId, p_channel: modal.channel, p_message: modal.text });
    if (res && res.error) { setBusy(false); setErr(reminderErrorMessage(res.error)); return; }
    if (res && res.status === "failed") {
      var retry = await dbRpcAuth("pet_set_reminder_status", { p_id: res.id, p_status: "pending", p_error: null });
      if (retry && retry.error) { setBusy(false); setErr(reminderErrorMessage(retry.error)); return; }
      res = retry;
    }
    setBusy(false);
    setModal(Object.assign({}, modal, { reminder: res, opened: true }));
  }

  async function setStatus(status, reason, remOverride) {
    var rem = remOverride || (modal && modal.reminder);
    if (busy || !rem) return;
    setBusy(true); setErr("");
    var res = await dbRpcAuth("pet_set_reminder_status", { p_id: rem.id, p_status: status, p_error: reason || null });
    setBusy(false);
    if (res && res.error) { setErr(reminderErrorMessage(res.error)); return; }
    setModal(null); reload();
  }

  if (loadStatus === "loading") return <div><PageHeader title="Reminders" /><p style={{ color: MUTED_FG, fontSize: 13 }}>Loading…</p></div>;
  if (loadStatus === "error") {
    return (
      <div><PageHeader title="Reminders" />
        <Card><EmptyState title="Couldn't load reminders" description="Check your connection and try again." action={<Button onClick={reload}>Try again</Button>} /></Card>
      </div>
    );
  }
  if (loadStatus === "needs-db") {
    return (
      <div><PageHeader title="Reminders" />
        <Card><EmptyState title="Reminders need a database update" description="The reminder tables haven't been set up for this system yet. Ask your administrator to apply migration 100, then refresh." action={<Button onClick={reload}>Refresh</Button>} /></Card>
      </div>
    );
  }

  var m = modal;
  var link = m ? channelUrl(m.channel, m.cand.customer.phone, m.text) : null;
  var attempts = m && m.reminder ? m.reminder.attempts : (m && m.cand.reminder ? m.cand.reminder.attempts : 0);
  var retryBlocked = !!(m && m.cand.reminder && m.cand.reminder.status === "failed" && attempts >= MAX_ATTEMPTS && !(m.reminder && m.reminder.status === "pending"));
  var linkStyle = { display: "inline-block", padding: "8px 14px", borderRadius: 10, background: PRIMARY, color: PRIMARY_FG, fontWeight: 700, fontSize: 13, textDecoration: "none" };

  return (
    <div>
      <PageHeader title="Reminders" subtitle="Prepare a message, open it in WhatsApp or SMS, then record what happened. Nothing is sent automatically." />

      <div role="tablist" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Button variant={tab === "todo" ? "primary" : "outline"} onClick={function () { setTab("todo"); }}>To send ({candidates.length})</Button>
        <Button variant={tab === "history" ? "primary" : "outline"} onClick={function () { setTab("history"); }}>History ({(data.reminders || []).length})</Button>
      </div>

      {tab === "todo" ? (
        <div>
          <Card style={{ padding: 12, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
            <select aria-label="Reminder type" value={kindFilter} onChange={function (e) { setKindFilter(e.target.value); }} style={Object.assign({}, inputStyle, { width: 200 })}>
              <option value="all">All types</option>
              {KINDS.map(function (k) { return <option key={k.key} value={k.key}>{k.label}</option>; })}
            </select>
            <select aria-label="Appointment window" value={opts.appointmentHours} onChange={function (e) { setOpts(Object.assign({}, opts, { appointmentHours: Number(e.target.value) })); }} style={Object.assign({}, inputStyle, { width: 230 })}>
              {[24, 48, 72].map(function (h) { return <option key={h} value={h}>Appointments within {h} hours</option>; })}
            </select>
            <select aria-label="Vaccination window" value={opts.vaccinationDays} onChange={function (e) { setOpts(Object.assign({}, opts, { vaccinationDays: Number(e.target.value) })); }} style={Object.assign({}, inputStyle, { width: 230 })}>
              {[7, 14, 30, 60].map(function (d) { return <option key={d} value={d}>Vaccinations due within {d} days</option>; })}
            </select>
          </Card>

          {visible.length === 0 ? (
            <Card><EmptyState title="Nothing to send right now" description="Upcoming appointments, vaccinations due, boarding collections, missed appointments and follow-ups will appear here when they need a message." /></Card>
          ) : visible.map(function (c) {
            var rem = c.reminder;
            return (
              <Card key={c.key} style={{ padding: 12, marginBottom: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.customer.name}<span style={{ color: MUTED_FG, fontWeight: 500 }}> · {c.pet.name}</span></div>
                  <div style={{ fontSize: 12, color: MUTED_FG }}>{kindLabel(c.kind)}{c.detail ? " (" + c.detail + ")" : ""} · {whenLabel(c)}{c.overdue ? " · overdue" : ""}</div>
                  {c.blocked ? <div style={{ fontSize: 12, color: MUTED_FG, marginTop: 2 }}>{c.blocked}</div> : null}
                  {c.optedOut && c.kind !== "followup" ? <div style={{ fontSize: 11, color: MUTED_FG, marginTop: 2 }}>Opted out of marketing: service reminders only.</div> : null}
                </div>
                {rem ? <Badge tone={STATUS_TONES[rem.status]}>{STATUS_LABELS[rem.status]}{rem.status === "failed" ? " (" + rem.attempts + "/" + MAX_ATTEMPTS + ")" : ""}</Badge> : null}
                <Button size="sm" variant="outline" disabled={!!c.blocked} onClick={function () { openModal(c); }} ariaLabel={"Message " + c.customer.name + " about " + c.pet.name}>
                  {rem ? "Continue" : "Message"}
                </Button>
              </Card>
            );
          })}
        </div>
      ) : (
        <div>
          <Card style={{ padding: 12, marginBottom: 16 }}>
            <select aria-label="Filter history by status" value={histFilter} onChange={function (e) { setHistFilter(e.target.value); setShown(HISTORY_PAGE); }} style={Object.assign({}, inputStyle, { width: 200 })}>
              <option value="all">All statuses</option>
              {Object.keys(STATUS_LABELS).map(function (s) { return <option key={s} value={s}>{STATUS_LABELS[s]}</option>; })}
            </select>
          </Card>
          {history.length === 0 ? (
            <Card><EmptyState title="No reminders yet" description="Reminders you prepare will be listed here with their outcome." /></Card>
          ) : (
            <div>
              {history.slice(0, shown).map(function (r) {
                var cu = customersById[r.customer_id]; var pe = r.pet_id ? petsById[r.pet_id] : null;
                return (
                  <Card key={r.id} style={{ padding: 12, marginBottom: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{cu ? cu.name : "Customer"}{pe ? <span style={{ color: MUTED_FG, fontWeight: 500 }}> · {pe.name}</span> : null}</div>
                      <div style={{ fontSize: 12, color: MUTED_FG }}>{kindLabel(r.kind)} · {r.channel === "sms" ? "SMS" : "WhatsApp"} · {new Date(r.sent_at || r.created_at).toLocaleString()}</div>
                      {r.last_error ? <div style={{ fontSize: 12, color: MUTED_FG }}>{r.last_error}</div> : null}
                    </div>
                    <Badge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  </Card>
                );
              })}
              {history.length > shown ? <div style={{ textAlign: "center", marginTop: 8 }}><Button size="sm" variant="outline" onClick={function () { setShown(shown + HISTORY_PAGE); }}>Show more</Button></div> : null}
            </div>
          )}
        </div>
      )}

      <Modal open={!!m} onClose={function () { if (!busy) { var had = m && m.opened; setModal(null); setErr(""); if (had) reload(); } }}
        title={m ? kindLabel(m.cand.kind) + ": " + m.cand.customer.name : ""}
        footer={m ? <Button variant="ghost" onClick={function () { var had = m.opened; setModal(null); setErr(""); if (had) reload(); }} disabled={busy}>Close</Button> : null}>
        {m ? (
          <div>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: MUTED_FG }}>
              {m.cand.pet.name} · {m.cand.customer.phone}{normalizePhone(m.cand.customer.phone) ? "" : " (not a valid number)"}
            </p>
            <Field label="Send by" htmlFor="rem-channel">
              <select id="rem-channel" style={inputStyle} value={m.channel} disabled={m.opened} onChange={function (e) { setModal(Object.assign({}, m, { channel: e.target.value })); }}>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </Field>
            <Field label="Message" htmlFor="rem-text">
              <textarea id="rem-text" rows={5} maxLength={600} style={Object.assign({}, inputStyle, { resize: "vertical", fontFamily: "inherit" })} value={m.text} disabled={m.opened}
                onChange={function (e) { setModal(Object.assign({}, m, { text: e.target.value })); }} />
            </Field>

            {!m.opened ? (
              <div>
                {retryBlocked ? (
                  <p style={{ fontSize: 13, color: FOREGROUND }}>This reminder has failed {MAX_ATTEMPTS} times, so it can't be retried. Skip it and contact the customer another way.</p>
                ) : link && m.text.trim() ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" onClick={onOpenLink} style={linkStyle}>{m.channel === "sms" ? "Open SMS" : "Open WhatsApp"}</a>
                ) : <p style={{ fontSize: 12, color: MUTED_FG }}>{m.text.trim() ? "This number can't be used for " + (m.channel === "sms" ? "SMS" : "WhatsApp") + "." : "Write a message to continue."}</p>}
                {m.cand.reminder ? <div style={{ marginTop: 10 }}><Button size="sm" variant="ghost" onClick={function () { setStatus("cancelled", null, m.cand.reminder); }} disabled={busy}>Skip this reminder</Button></div> : null}
              </div>
            ) : (
              <div style={{ padding: 12, border: "1px solid " + BORDER, borderRadius: 12, background: MUTED }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Did the message go through?</div>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: MUTED_FG }}>Trimora can't see whether it was delivered. Record what you did.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button size="sm" onClick={function () { setStatus("sent"); }} disabled={busy || !m.reminder}>Mark as sent</Button>
                  <Button size="sm" variant="outline" onClick={function () { setStatus("failed", "Message did not go through"); }} disabled={busy || !m.reminder}>Didn't go through</Button>
                  <Button size="sm" variant="ghost" onClick={function () { setStatus("cancelled"); }} disabled={busy || !m.reminder}>Skip</Button>
                </div>
              </div>
            )}
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
