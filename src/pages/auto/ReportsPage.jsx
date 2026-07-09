// src/pages/auto/ReportsPage.jsx
//
// Trimora Auto Phase 6 -- Reporting. Per the architecture plan (Section
// 1, point 3): there's no shared "Core Reporting" service to plug into
// in this codebase -- POS's own Dashboard.jsx is a bespoke client-side
// aggregation over data pulled into state, not a call into some
// reusable reporting layer. This follows that exact same pattern,
// scoped to Auto's own tables, rather than inventing new server-side
// aggregation infrastructure for a job volume currently small enough
// that client-side reduce() is more than fast enough.
//
// Four metrics per the architecture plan's Phase 6 scope: daily
// revenue, top services, bay utilization, inventory usage. Two more
// added since they're now real, thanks to Phases 4/5 landing since the
// plan was written: a staff commission leaderboard (Phase 4) and a
// payment method breakdown (Phase 5).
//
// Inventory usage is included and correctly shows an empty state --
// auto_stock_movements has zero rows in production as of this build
// (no job-completion code deducts stock yet; that's separate,
// unbuilt scope per the Phase 2 migration's own note). Reporting on
// zero real activity honestly, rather than omitting the section, is
// the more accurate choice: it'll start showing real data the moment
// that's built, with no reporting-side change needed.

import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/db";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./theme";

function money(n) {
  return "KSh " + (n || 0).toLocaleString();
}

function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function daysAgo(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

var RANGE_PRESETS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "7 days", days: 6 },
  { key: "30d", label: "30 days", days: 29 },
  { key: "all", label: "All time", days: null },
];

export default function ReportsPage({ isAdmin }) {
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var jobsState = useState([]); var jobs = jobsState[0]; var setJobs = jobsState[1];
  var jobServicesState = useState([]); var jobServices = jobServicesState[0]; var setJobServices = jobServicesState[1];
  var baysState = useState([]); var bays = baysState[0]; var setBays = baysState[1];
  var staffState = useState([]); var staff = staffState[0]; var setStaff = staffState[1];
  var stockMovesState = useState([]); var stockMoves = stockMovesState[0]; var setStockMoves = stockMovesState[1];
  var rangeState = useState("7d"); var range = rangeState[0]; var setRange = rangeState[1];

  var load = useCallback(async function () {
    var results = await Promise.all([
      db("GET", "auto_jobs", null, "?status=eq.completed&order=completed_at.desc&select=*,auto_vehicles(reg_number)"),
      db("GET", "auto_job_services", null, "?select=*,auto_services(name)"),
      db("GET", "auto_bays", null, "?order=label.asc"),
      db("GET", "staff", null, "?order=name.asc"),
      db("GET", "auto_stock_movements", null, "?order=created_at.desc&limit=200"),
    ]);
    setJobs(results[0] || []);
    setJobServices(results[1] || []);
    setBays(results[2] || []);
    setStaff(results[3] || []);
    setStockMoves(results[4] || []);
    setLoading(false);
  }, []);

  useEffect(function () { load(); }, [load]);

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: INK, color: PAPER, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif" }}>
        Reports are admin-only.
      </div>
    );
  }

  var preset = RANGE_PRESETS.filter(function (p) { return p.key === range; })[0];
  var cutoff = preset.days === null ? null : daysAgo(preset.days);

  var jobsInRange = jobs.filter(function (j) {
    if (!cutoff) return true;
    return j.completed_at && new Date(j.completed_at) >= cutoff;
  });

  var jobIdsInRange = {};
  jobsInRange.forEach(function (j) { jobIdsInRange[j.id] = true; });

  var totalRevenue = jobsInRange.reduce(function (a, j) { return a + (j.total_price || 0); }, 0);
  var totalCommission = jobsInRange.reduce(function (a, j) { return a + (j.commission || 0); }, 0);
  var jobCount = jobsInRange.length;
  var avgTicket = jobCount ? Math.round(totalRevenue / jobCount) : 0;

  // 7-day trend, always by calendar day regardless of the selected
  // range filter -- matches POS Dashboard's convention of the trend
  // chart being independent of the summary cards' range.
  var last7 = [];
  for (var i = 6; i >= 0; i--) {
    var d = daysAgo(i);
    var nextD = daysAgo(i - 1);
    var dayJobs = jobs.filter(function (j) {
      if (!j.completed_at) return false;
      var t = new Date(j.completed_at);
      return t >= d && t < nextD;
    });
    last7.push({
      label: d.toLocaleDateString("en-KE", { weekday: "short" }),
      revenue: dayJobs.reduce(function (a, j) { return a + (j.total_price || 0); }, 0),
      count: dayJobs.length,
    });
  }
  var maxDayRev = Math.max.apply(null, last7.map(function (d) { return d.revenue; }).concat([1]));

  // Top services -- via the real join table, not a jsonb parse.
  var svcAgg = {};
  jobServices.forEach(function (js) {
    if (!jobIdsInRange[js.job_id]) return;
    var name = (js.auto_services && js.auto_services.name) || "Unknown service";
    if (!svcAgg[name]) svcAgg[name] = { count: 0, revenue: 0 };
    svcAgg[name].count += 1;
    svcAgg[name].revenue += js.price || 0;
  });
  var topServices = Object.entries(svcAgg).sort(function (a, b) { return b[1].count - a[1].count; }).slice(0, 5);

  // Bay utilization -- completed-job count and average turnaround
  // (in_bay_at -> completed_at) per bay.
  var bayAgg = {};
  bays.forEach(function (b) { bayAgg[b.id] = { label: b.label, count: 0, totalMinutes: 0 }; });
  jobsInRange.forEach(function (j) {
    if (!j.bay_id || !bayAgg[j.bay_id]) return;
    bayAgg[j.bay_id].count += 1;
    if (j.in_bay_at && j.completed_at) {
      bayAgg[j.bay_id].totalMinutes += Math.round((new Date(j.completed_at) - new Date(j.in_bay_at)) / 60000);
    }
  });
  var bayRows = Object.values(bayAgg).map(function (b) {
    return Object.assign({}, b, { avgMinutes: b.count ? Math.round(b.totalMinutes / b.count) : 0 });
  });

  // Payment method breakdown -- new since Phase 5.
  var byMethod = { Cash: 0, Till: 0, unpaid: 0 };
  jobsInRange.forEach(function (j) {
    if (j.payment_status === "paid" && j.payment_method) {
      byMethod[j.payment_method] = (byMethod[j.payment_method] || 0) + (j.total_price || 0);
    } else {
      byMethod.unpaid += (j.total_price || 0);
    }
  });

  // Staff commission leaderboard -- new since Phase 4.
  var staffById = {};
  staff.forEach(function (s) { staffById[s.id] = s; });
  var staffAgg = {};
  jobsInRange.forEach(function (j) {
    if (!j.assigned_staff_id) return;
    if (!staffAgg[j.assigned_staff_id]) staffAgg[j.assigned_staff_id] = { count: 0, commission: 0, revenue: 0 };
    staffAgg[j.assigned_staff_id].count += 1;
    staffAgg[j.assigned_staff_id].commission += j.commission || 0;
    staffAgg[j.assigned_staff_id].revenue += j.total_price || 0;
  });
  var staffRows = Object.entries(staffAgg).map(function (e) {
    var s = staffById[e[0]];
    return Object.assign({ name: (s && s.name) || "Unknown staff" }, e[1]);
  }).sort(function (a, b) { return b.commission - a.commission; });

  // Inventory usage -- honestly empty right now (see file header note).
  var stockAgg = {};
  stockMoves.forEach(function (m) {
    if (!stockAgg[m.stock_id]) stockAgg[m.stock_id] = 0;
    stockAgg[m.stock_id] += m.change_qty || 0;
  });
  var stockRows = Object.entries(stockAgg);

  function Card(props) {
    return <div style={Object.assign({ background: STEEL, borderRadius: 14, padding: 16, marginBottom: 12, border: "1px solid " + CHROME + "33" }, props.style || {})}>{props.children}</div>;
  }
  function CardTitle(props) {
    return <div style={{ fontWeight: 800, fontSize: 14, color: PAPER, marginBottom: 12 }}>{props.children}</div>;
  }

  if (loading) {
    return <div style={{ minHeight: "100vh", background: INK, color: CHROME, padding: 24 }}>Loading…</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: INK, padding: 16, paddingBottom: 40, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {RANGE_PRESETS.map(function (p) {
          var active = p.key === range;
          return (
            <button key={p.key} onClick={function () { setRange(p.key); }} style={{
              padding: "7px 14px", borderRadius: 20, border: "1.5px solid " + (active ? SIGNAL : CHROME + "55"),
              background: active ? SIGNAL : "transparent", color: active ? INK : CHROME,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>
              {p.label}
            </button>
          );
        })}
      </div>

      <Card>
        <CardTitle>Summary — {preset.label}</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "Revenue", value: money(totalRevenue) },
            { label: "Jobs", value: jobCount },
            { label: "Avg Ticket", value: money(avgTicket) },
          ].map(function (m, i) {
            return (
              <div key={i} style={{ background: INK, borderRadius: 8, padding: "10px 8px", textAlign: "center", border: "1px solid " + CHROME + "22" }}>
                <div style={{ fontSize: 10, color: CHROME, fontWeight: 700, textTransform: "uppercase" }}>{m.label}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: SIGNAL, marginTop: 2 }}>{m.value}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: CHROME, marginTop: 10 }}>Total commission owed: {money(totalCommission)}</div>
      </Card>

      <Card>
        <CardTitle>Last 7 days</CardTitle>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
          {last7.map(function (d, i) {
            var h = Math.max(4, Math.round((d.revenue / maxDayRev) * 74));
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "100%", height: h, background: d.revenue > 0 ? SIGNAL : CHROME + "33", borderRadius: 4 }} title={money(d.revenue)} />
                <div style={{ fontSize: 10, color: CHROME, marginTop: 4 }}>{d.label}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: CHROME, marginTop: 10 }}>
          Total: {money(last7.reduce(function (a, d) { return a + d.revenue; }, 0))}
        </div>
      </Card>

      <Card>
        <CardTitle>Top Services</CardTitle>
        {topServices.length === 0 ? (
          <div style={{ fontSize: 12, color: CHROME }}>No completed jobs with services in this range.</div>
        ) : topServices.map(function (e, i) {
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER, padding: "6px 0", borderBottom: i < topServices.length - 1 ? "1px solid " + CHROME + "22" : "none" }}>
              <span>{e[0]}</span>
              <span style={{ color: CHROME }}>{e[1].count}× · {money(e[1].revenue)}</span>
            </div>
          );
        })}
      </Card>

      <Card>
        <CardTitle>Bay Utilization — {preset.label}</CardTitle>
        {bayRows.length === 0 ? (
          <div style={{ fontSize: 12, color: CHROME }}>No bays configured.</div>
        ) : bayRows.map(function (b, i) {
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER, padding: "6px 0", borderBottom: i < bayRows.length - 1 ? "1px solid " + CHROME + "22" : "none" }}>
              <span>{b.label}</span>
              <span style={{ color: CHROME }}>{b.count} jobs{b.avgMinutes ? " · avg " + b.avgMinutes + " min" : ""}</span>
            </div>
          );
        })}
      </Card>

      <Card>
        <CardTitle>Payment Methods — {preset.label}</CardTitle>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER, padding: "6px 0" }}>
          <span>Cash</span><span style={{ color: SIGNAL }}>{money(byMethod.Cash)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER, padding: "6px 0" }}>
          <span>M-Pesa (Till)</span><span style={{ color: SIGNAL }}>{money(byMethod.Till)}</span>
        </div>
        {byMethod.unpaid > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: ALERT, padding: "6px 0" }}>
            <span>Unpaid</span><span>{money(byMethod.unpaid)}</span>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Staff Commission — {preset.label}</CardTitle>
        {staffRows.length === 0 ? (
          <div style={{ fontSize: 12, color: CHROME }}>No completed jobs with an assigned staff member in this range.</div>
        ) : staffRows.map(function (s, i) {
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER, padding: "6px 0", borderBottom: i < staffRows.length - 1 ? "1px solid " + CHROME + "22" : "none" }}>
              <span>{s.name}</span>
              <span style={{ color: CHROME }}>{s.count} jobs · {money(s.commission)}</span>
            </div>
          );
        })}
      </Card>

      <Card>
        <CardTitle>Inventory Usage</CardTitle>
        {stockRows.length === 0 ? (
          <div style={{ fontSize: 12, color: CHROME }}>
            No stock movements recorded yet — job completion doesn't deduct stock automatically yet, so this stays empty until that's built.
          </div>
        ) : stockRows.map(function (e, i) {
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER, padding: "6px 0" }}>
              <span>{e[0]}</span><span style={{ color: CHROME }}>{e[1]}</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
