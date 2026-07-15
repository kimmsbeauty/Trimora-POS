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
// Feature-parity item #2 (End-of-day summary, matching POS's own
// EndOfDaySummary.jsx): rather than duplicating the aggregation logic
// in a separate component, the Summary card's WhatsApp share button
// reuses whatever's already computed for the currently selected range
// -- only rendered when range === "today", so an end-of-day summary
// can never be shared while actually showing some other range's data.
//
// Inventory usage joins auto_stock_movements against the shared stock
// table for human-readable item names, same as Top Services joins
// against auto_services -- both tables were empty in production when
// this file was first written (job completion didn't deduct stock
// yet), but that's since been built, so this reports on real data now.

import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { db } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import AutoExportButton from "../../components/AutoExportButton";
import AutoAskTrimora from "../../components/AutoAskTrimora";
import AutoInsightSummary from "../../components/AutoInsightSummary";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./theme";

function money(n) {
  return "KSh " + (n || 0).toLocaleString();
}

// Feature-parity item #8: total_price stays the original, undiscounted
// service total; discount_amount is the separate reduction. Revenue
// reporting needs the actual amount charged, matching how the payment
// modal and receipt already compute it in BoardPage.jsx.
function payableAmount(job) {
  return (job.total_price || 0) - (job.discount_amount || 0);
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
  var salon = useSalon();
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var jobsState = useState([]); var jobs = jobsState[0]; var setJobs = jobsState[1];
  var jobServicesState = useState([]); var jobServices = jobServicesState[0]; var setJobServices = jobServicesState[1];
  var baysState = useState([]); var bays = baysState[0]; var setBays = baysState[1];
  var staffState = useState([]); var staff = staffState[0]; var setStaff = staffState[1];
  var stockMovesState = useState([]); var stockMoves = stockMovesState[0]; var setStockMoves = stockMovesState[1];
  var queueCountState = useState(0); var queueCount = queueCountState[0]; var setQueueCount = queueCountState[1];
  var rangeState = useState("7d"); var range = rangeState[0]; var setRange = rangeState[1];
  var customFromState = useState(""); var customFrom = customFromState[0]; var setCustomFrom = customFromState[1];
  var customToState = useState(""); var customTo = customToState[0]; var setCustomTo = customToState[1];

  // Refund: full or partial, always back to whatever method the job was
  // originally paid with (staff hands cash back / notes an M-Pesa
  // reversal themselves -- this doesn't trigger any actual M-Pesa
  // reversal API call, there isn't one for this). Commission is reduced
  // proportionally to what fraction of the payable amount is now
  // refunded in total; stock is only restored on a refund that brings
  // the job to fully refunded (a partial refund can't safely guess
  // which physical stock use it corresponds to, so it's left for manual
  // adjustment via the Stock Log Viewer -- called out in the modal's
  // copy, not just buried in a comment).
  var refundJobState = useState(null); var refundJob = refundJobState[0]; var setRefundJob = refundJobState[1];
  var refundAmountState = useState(""); var refundAmount = refundAmountState[0]; var setRefundAmount = refundAmountState[1];
  var refundReasonState = useState(""); var refundReason = refundReasonState[0]; var setRefundReason = refundReasonState[1];
  var refundSavingState = useState(false); var refundSaving = refundSavingState[0]; var setRefundSaving = refundSavingState[1];
  var refundErrorState = useState(""); var refundError = refundErrorState[0]; var setRefundError = refundErrorState[1];

  var load = useCallback(async function () {
    var results = await Promise.all([
      db("GET", "auto_jobs", null, "?status=eq.completed&order=completed_at.desc&select=*,auto_vehicles(reg_number,make),customers(name)"),
      db("GET", "auto_job_services", null, "?select=*,auto_services(name)"),
      db("GET", "auto_bays", null, "?order=label.asc"),
      db("GET", "staff", null, "?order=name.asc"),
      db("GET", "auto_stock_movements", null, "?order=created_at.desc&limit=200&select=*,stock(name)"),
      // Queue length -- same definition BoardPage.jsx uses for its
      // "Waiting (n)" count: status === 'waiting' specifically (not the
      // full ACTIVE_STATUSES set, which also includes in_bay and
      // ready_for_collection -- those aren't "waiting"). id-only select
      // since only the count is needed here, not full job rows.
      db("GET", "auto_jobs", null, "?status=eq.waiting&select=id"),
    ]);
    setJobs(results[0] || []);
    setJobServices(results[1] || []);
    setBays(results[2] || []);
    setStaff(results[3] || []);
    setStockMoves(results[4] || []);
    setQueueCount((results[5] || []).length);
    setLoading(false);
  }, []);

  useEffect(function () { load(); }, [load]);

  async function processRefund() {
    if (refundSaving || !refundJob) return;
    var job = refundJob;
    var amount = parseInt(refundAmount, 10);
    var payable = payableAmount(job);
    var alreadyRefunded = job.refunded_amount || 0;
    var refundable = payable - alreadyRefunded;
    if (isNaN(amount) || amount <= 0) { setRefundError("Enter an amount greater than 0."); return; }
    if (amount > refundable) { setRefundError("Can't refund more than KSh " + refundable.toLocaleString() + " (already refunded: KSh " + alreadyRefunded.toLocaleString() + ")."); return; }

    setRefundSaving(true);
    setRefundError("");

    var ok = await db("POST", "auto_refunds", {
      salon_id: salon.id, job_id: job.id, amount: amount, reason: refundReason.trim() || null,
    });
    if (ok === null) { setRefundSaving(false); setRefundError("Failed to record refund."); return; }

    var newRefundedAmount = alreadyRefunded + amount;
    var isNowFullyRefunded = newRefundedAmount >= payable;

    // Proportional commission reduction, derived from current state so
    // no separate "original commission" column is needed: if the
    // current commission C already reflects alreadyRefunded out of
    // payable, then C == C0 * (payable - alreadyRefunded) / payable for
    // whatever the true original C0 was. The new commission should be
    // C0 * (payable - newRefundedAmount) / payable. Dividing the two
    // eliminates C0 entirely: C_new = C * (payable - newRefundedAmount)
    // / (payable - alreadyRefunded). Guarded by refundable > 0 above,
    // so (payable - alreadyRefunded) can't be zero here.
    var jobPatch = { refunded_amount: newRefundedAmount };
    if (job.commission != null) {
      jobPatch.commission = Math.round((job.commission * (payable - newRefundedAmount)) / (payable - alreadyRefunded));
    }
    await db("PATCH", "auto_jobs", jobPatch, "?id=eq." + job.id);

    if (isNowFullyRefunded) {
      await restoreStockForJob(job);
    }

    // Loyalty: a partial refund only walks back total_spend by the
    // refunded amount; visit_count only comes down on a full refund,
    // since the visit itself still happened even if the money came back.
    if (job.customer_id) {
      var custRows = await db("GET", "customers", null, "?id=eq." + job.customer_id);
      var cust = custRows && custRows[0];
      if (cust) {
        var custPatch = { total_spend: Math.max(0, (cust.total_spend || 0) - amount) };
        if (isNowFullyRefunded) custPatch.visit_count = Math.max(0, (cust.visit_count || 0) - 1);
        await db("PATCH", "customers", custPatch, "?id=eq." + job.customer_id);
      }
    }

    setRefundSaving(false);
    setRefundJob(null);
    setRefundAmount("");
    setRefundReason("");
    load();
  }

  // Mirrors deductStockForJob in BoardPage.jsx, in reverse -- same
  // best-effort convention (logged, not surfaced as a refund failure;
  // the refund record itself is what matters, stock restoration is a
  // courtesy on top of it). Only called for a refund that brings the
  // job to fully refunded, per the scoping decision above.
  async function restoreStockForJob(job) {
    try {
      var jobServiceRows = await db("GET", "auto_job_services", null, "?job_id=eq." + job.id + "&select=auto_service_id");
      var serviceIds = (jobServiceRows || []).map(function (js) { return js.auto_service_id; });
      if (serviceIds.length === 0) return;

      var requiredRows = await db("GET", "auto_service_required_stock", null,
        "?auto_service_id=in.(" + serviceIds.join(",") + ")");
      if (!requiredRows || requiredRows.length === 0) return;

      var neededByStockId = {};
      requiredRows.forEach(function (r) {
        neededByStockId[r.stock_id] = (neededByStockId[r.stock_id] || 0) + Number(r.quantity);
      });

      var stockIds = Object.keys(neededByStockId);
      var stockRows = await db("GET", "stock", null, "?id=in.(" + stockIds.join(",") + ")");
      var stockById = {};
      (stockRows || []).forEach(function (s) { stockById[s.id] = s; });

      for (var i = 0; i < stockIds.length; i++) {
        var stockId = stockIds[i];
        var current = stockById[stockId];
        if (!current) continue;
        var qty = Math.round(neededByStockId[stockId]);
        await db("PATCH", "stock", { stock: (current.stock || 0) + qty }, "?id=eq." + stockId);
        await db("POST", "auto_stock_movements", {
          stock_id: stockId, change_qty: qty, reason: "auto_job_refund",
          reference_type: "auto_job", reference_id: job.id, created_by: null,
        });
      }
    } catch (err) {
      console.error("Stock restoration failed for job " + job.id + ":", err);
    }
  }

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
  var isCustom = range === "custom";
  var cutoff = isCustom ? null : (preset.days === null ? null : daysAgo(preset.days));
  var customFromDate = isCustom && customFrom ? startOfDay(new Date(customFrom)) : null;
  var customToDate = isCustom && customTo ? (function () {
    var d = new Date(customTo); d.setHours(23, 59, 59, 999); return d;
  })() : null;
  var rangeLabel = isCustom
    ? (customFrom && customTo ? customFrom + " to " + customTo : "Custom (pick both dates)")
    : preset.label;

  var jobsInRange = jobs.filter(function (j) {
    if (isCustom) {
      if (!customFromDate || !customToDate || !j.completed_at) return false;
      var t = new Date(j.completed_at);
      return t >= customFromDate && t <= customToDate;
    }
    if (!cutoff) return true;
    return j.completed_at && new Date(j.completed_at) >= cutoff;
  });

  var jobIdsInRange = {};
  jobsInRange.forEach(function (j) { jobIdsInRange[j.id] = true; });

  var totalRevenue = jobsInRange.reduce(function (a, j) { return a + payableAmount(j); }, 0);
  // VAT-inclusive: each job's payableAmount already contains its tax
  // portion. Honest limitation, not glossed over: this extracts VAT
  // using the CURRENT tax_rate setting applied to every job in range,
  // not whatever rate was configured at the time each job actually
  // completed (no per-job rate is stored). Fine as long as the rate
  // rarely changes; if it ever does, older completed jobs' VAT split
  // shown here will shift retroactively rather than reflect history.
  var taxRateForRange = (salon && salon.tax_rate) || 0;
  var totalVat = (salon && salon.tax_enabled)
    ? jobsInRange.reduce(function (a, j) {
        var amt = payableAmount(j);
        var net = Math.round(amt / (1 + taxRateForRange / 100));
        return a + (amt - net);
      }, 0)
    : 0;
  var totalCommission = jobsInRange.reduce(function (a, j) { return a + (j.commission || 0); }, 0);
  var jobCount = jobsInRange.length;
  var avgTicket = jobCount ? Math.round(totalRevenue / jobCount) : 0;

  // Average wash time -- checked_in_at -> completed_at, i.e. total time
  // a customer's vehicle was in the system end to end (distinct from
  // Bay Utilization's per-bay avgMinutes below, which measures
  // in_bay_at -> completed_at, the narrower "actually in the bay" span).
  // Only counts jobs that have both timestamps -- older/malformed rows
  // without checked_in_at are excluded rather than skewing the average.
  var washTimeJobs = jobsInRange.filter(function (j) { return j.checked_in_at && j.completed_at; });
  var totalWashMinutes = washTimeJobs.reduce(function (a, j) {
    return a + (new Date(j.completed_at) - new Date(j.checked_in_at)) / 60000;
  }, 0);
  var avgWashMinutes = washTimeJobs.length ? Math.round(totalWashMinutes / washTimeJobs.length) : 0;

  // Bays -- Right Now. Deliberately NOT range-filtered, unlike every
  // other Summary stat: current_job_id/active reflect live bay state,
  // not historical data for whatever date range happens to be
  // selected. Kept as its own card (below) rather than folded into the
  // range-scoped Summary card so a selected range never implies these
  // numbers are somehow scoped to it too.
  var occupiedBaysNow = bays.filter(function (b) { return b.current_job_id; }).length;
  var activeBaysCount = bays.filter(function (b) { return b.active; }).length;
  var totalBaysCount = bays.length;

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
  // maxDayRev removed -- was only used by the old hand-rolled div bars,
  // now replaced by recharts (which auto-scales its own Y axis).

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
      byMethod[j.payment_method] = (byMethod[j.payment_method] || 0) + payableAmount(j);
    } else {
      byMethod.unpaid += payableAmount(j);
    }
  });

  // Staff commission leaderboard -- since feature-parity item #8,
  // sourced from per-line staff_id/commission on auto_job_services
  // (different services on the same job can be credited to different
  // people), not the job-level assigned_staff_id/commission, which
  // only ever reflected a single flat rate applied to the whole job.
  var staffById = {};
  staff.forEach(function (s) { staffById[s.id] = s; });
  var staffAgg = {};
  jobServices.forEach(function (js) {
    if (!jobIdsInRange[js.job_id]) return;
    var staffId = js.staff_id;
    if (!staffId) return;
    if (!staffAgg[staffId]) staffAgg[staffId] = { count: 0, commission: 0, revenue: 0 };
    staffAgg[staffId].count += 1;
    staffAgg[staffId].commission += js.commission || 0;
    staffAgg[staffId].revenue += js.price || 0;
  });
  var staffRows = Object.entries(staffAgg).map(function (e) {
    var s = staffById[e[0]];
    return Object.assign({ name: (s && s.name) || "Unknown staff" }, e[1]);
  }).sort(function (a, b) { return b.commission - a.commission; });

  // Active Staff -- distinct staff who worked at least one service line
  // in the selected range. Not an attendance/clock-in metric (no such
  // system exists in this codebase, POS side either) -- "active" here
  // means "credited with a job," same definition as the Staff
  // Commission leaderboard already uses via staffAgg.
  var activeStaffCount = Object.keys(staffAgg).length;

  // Inventory usage -- joined against stock(name) for readability,
  // same pattern as Top Services joining auto_services(name).
  var stockAgg = {};
  stockMoves.forEach(function (m) {
    var name = (m.stock && m.stock.name) || "Unknown item";
    if (!stockAgg[name]) stockAgg[name] = 0;
    stockAgg[name] += m.change_qty || 0;
  });
  var stockRows = Object.entries(stockAgg);

  // End-of-day share -- reuses the exact same jobsInRange/totalRevenue/
  // topServices/staffRows/byMethod computed above for whatever range is
  // selected. Only rendered when range === "today" (see the Summary
  // card below) so it can't be shared while mislabeled as some other
  // range's data.
  function buildEodMessage() {
    var lines = [];
    lines.push("🚗 *" + ((salon && salon.name) || "Trimora Auto") + " — Daily Close*");
    lines.push(new Date().toLocaleDateString("en-KE"));
    lines.push("");
    lines.push("💰 *Revenue*: " + money(totalRevenue));
    lines.push("🧾 Jobs: " + jobCount + " · Avg ticket: " + money(avgTicket));
    lines.push("");
    lines.push("💳 *Payments*");
    lines.push("Cash: " + money(byMethod.Cash));
    lines.push("M-Pesa (Till): " + money(byMethod.Till));
    if (byMethod.unpaid > 0) lines.push("Unpaid: " + money(byMethod.unpaid));
    lines.push("");
    lines.push("👩‍💼 *Commission Owed*: " + money(totalCommission));
    if (staffRows.length > 0) {
      staffRows.forEach(function (s) {
        lines.push(s.name + ": " + money(s.commission) + " (" + s.count + " job" + (s.count !== 1 ? "s" : "") + ")");
      });
    }
    lines.push("");
    lines.push("🧴 *Top Services*");
    if (topServices.length === 0) {
      lines.push("None today.");
    } else {
      topServices.forEach(function (e) {
        lines.push(e[0] + " — " + e[1].count + "× · " + money(e[1].revenue));
      });
    }
    return lines.join("\n");
  }

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
      <AutoInsightSummary />
      <AutoAskTrimora />
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
        <button onClick={function () { setRange("custom"); }} style={{
          padding: "7px 14px", borderRadius: 20, border: "1.5px solid " + (isCustom ? SIGNAL : CHROME + "55"),
          background: isCustom ? SIGNAL : "transparent", color: isCustom ? INK : CHROME,
          fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>
          Custom
        </button>
        <div style={{ marginLeft: "auto" }}>
          <AutoExportButton
            jobs={jobsInRange}
            jobServices={jobServices}
            staffById={staffById}
            staffRows={staffRows}
            rangeLabel={rangeLabel}
            salonName={salon && salon.name}
          />
        </div>
      </div>

      {isCustom && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: CHROME, marginBottom: 4 }}>From</div>
            <input type="date" value={customFrom} onChange={function (e) { setCustomFrom(e.target.value); }}
              style={{
                background: STEEL, color: PAPER, border: "1px solid " + CHROME + "55", borderRadius: 8,
                padding: "8px 10px", fontSize: 13,
              }} />
          </div>
          <div style={{ color: CHROME, marginTop: 16 }}>–</div>
          <div>
            <div style={{ fontSize: 10, color: CHROME, marginBottom: 4 }}>To</div>
            <input type="date" value={customTo} onChange={function (e) { setCustomTo(e.target.value); }}
              style={{
                background: STEEL, color: PAPER, border: "1px solid " + CHROME + "55", borderRadius: 8,
                padding: "8px 10px", fontSize: 13,
              }} />
          </div>
        </div>
      )}

      <Card>
        <CardTitle>Summary — {rangeLabel}</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "Revenue", value: money(totalRevenue) },
            { label: "Jobs", value: jobCount },
            { label: "Avg Ticket", value: money(avgTicket) },
            { label: "Avg Wash Time", value: washTimeJobs.length ? (avgWashMinutes + " min") : "—" },
            { label: "Active Staff", value: activeStaffCount },
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
        {range === "today" && (
          <a
            href={"https://wa.me/254" + ((salon && salon.contact_phone) || "113828280").replace(/^0/, "").replace(/\D/g, "") +
              "?text=" + encodeURIComponent(buildEodMessage())}
            target="_blank" rel="noreferrer"
            style={{
              display: "block", width: "100%", boxSizing: "border-box", marginTop: 12,
              background: "#25D366", color: "#fff", borderRadius: 10, padding: "11px 0",
              fontWeight: 800, fontSize: 13, textDecoration: "none", textAlign: "center",
            }}
          >
            📲 Share End-of-Day Summary
          </a>
        )}
      </Card>

      <Card>
        <CardTitle>Jobs — {rangeLabel}</CardTitle>
        {jobsInRange.length === 0 && (
          <div style={{ fontSize: 13, color: CHROME }}>No completed jobs in this period.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
          {jobsInRange.map(function (j) {
            var completed = j.completed_at ? new Date(j.completed_at) : null;
            var vehicle = j.auto_vehicles || {};
            var vehicleText = [vehicle.reg_number, vehicle.make].filter(Boolean).join(" · ") || "Vehicle";
            var staffMember = staffById[j.assigned_staff_id];
            var lines = jobServices.filter(function (js) { return js.job_id === j.id; });
            var servicesText = lines.map(function (js) { return (js.auto_services && js.auto_services.name) || "Service"; }).join(", ");
            return (
              <div key={j.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid " + CHROME + "22", background: "rgba(255,255,255,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: PAPER }}>{vehicleText}</div>
                    <div style={{ fontSize: 11, color: CHROME }}>
                      {(j.customers && j.customers.name) || "Walk-in"}
                      {completed ? " · " + completed.toLocaleDateString("en-KE") + " " + completed.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: SIGNAL }}>{money(payableAmount(j))}</div>
                    <div style={{ fontSize: 10, color: CHROME }}>{j.payment_method || "—"}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: CHROME, marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{servicesText || "No services"}{staffMember ? " · " + staffMember.name : ""}</span>
                  {(j.refunded_amount || 0) < payableAmount(j) && (
                    <span onClick={function () { setRefundJob(j); setRefundAmount(""); setRefundReason(""); setRefundError(""); }}
                      style={{ color: ALERT, textDecoration: "underline", cursor: "pointer", whiteSpace: "nowrap", marginLeft: 10 }}>
                      Refund
                    </span>
                  )}
                </div>
                {(j.refunded_amount || 0) > 0 && (
                  <div style={{ fontSize: 10, color: ALERT, marginTop: 4 }}>
                    {(j.refunded_amount >= payableAmount(j)) ? "Fully refunded" : "Partially refunded"}: −{money(j.refunded_amount)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle>Right Now</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "Occupied Now", value: occupiedBaysNow + " / " + totalBaysCount },
            { label: "Active Bays", value: activeBaysCount + " / " + totalBaysCount },
            { label: "Queue Length", value: queueCount },
          ].map(function (m, i) {
            return (
              <div key={i} style={{ background: INK, borderRadius: 8, padding: "10px 8px", textAlign: "center", border: "1px solid " + CHROME + "22" }}>
                <div style={{ fontSize: 10, color: CHROME, fontWeight: 700, textTransform: "uppercase" }}>{m.label}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: SIGNAL, marginTop: 2 }}>{m.value}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle>Last 7 days</CardTitle>
        <div style={{ height: 180, marginLeft: -12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last7} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHROME + "22"} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: CHROME, fontSize: 10 }} axisLine={{ stroke: CHROME + "33" }} tickLine={false} />
              <YAxis tick={{ fill: CHROME, fontSize: 10 }} axisLine={false} tickLine={false} width={40}
                tickFormatter={function (v) { return v >= 1000 ? Math.round(v / 1000) + "k" : v; }} />
              <Tooltip
                cursor={{ fill: CHROME + "11" }}
                contentStyle={{ background: INK, border: "1px solid " + CHROME + "33", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: PAPER, fontWeight: 700 }}
                itemStyle={{ color: SIGNAL }}
                formatter={function (value) { return [money(value), "Revenue"]; }}
              />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {last7.map(function (d, i) {
                  return <Cell key={i} fill={d.revenue > 0 ? SIGNAL : CHROME + "33"} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: 11, color: CHROME, marginTop: 4 }}>
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
        <CardTitle>Bay Utilization — {rangeLabel}</CardTitle>
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
        <CardTitle>Payment Methods — {rangeLabel}</CardTitle>
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

      {salon && salon.tax_enabled && (
        <Card>
          <CardTitle>Tax (VAT) — {rangeLabel}</CardTitle>
          <div style={{ fontSize: 10, color: CHROME, marginBottom: 10, marginTop: -4 }}>
            Prices are VAT-inclusive at {salon.tax_rate || 0}% -- this is the tax portion already
            contained in the revenue figures above, not an amount added on top.
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER, padding: "6px 0" }}>
            <span>Gross revenue (incl. VAT)</span><span style={{ color: SIGNAL }}>{money(totalRevenue)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER, padding: "6px 0" }}>
            <span>Net revenue (excl. VAT)</span><span>{money(totalRevenue - totalVat)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800, color: PAPER, padding: "6px 0", borderTop: "1px solid " + CHROME + "22" }}>
            <span>VAT collected</span><span style={{ color: SIGNAL }}>{money(totalVat)}</span>
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>Staff Commission — {rangeLabel}</CardTitle>
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
            No stock movements recorded yet — nothing's been configured to deduct on the Services tab, or no completed jobs have used a mapped service yet.
          </div>
        ) : stockRows.map(function (e, i) {
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER, padding: "6px 0" }}>
              <span>{e[0]}</span><span style={{ color: CHROME }}>{e[1]}</span>
            </div>
          );
        })}
      </Card>
      {refundJob && (function () {
        var payable = payableAmount(refundJob);
        var alreadyRefunded = refundJob.refunded_amount || 0;
        var refundable = payable - alreadyRefunded;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
            <div style={{ width: "100%", maxWidth: 420, background: STEEL, borderRadius: 14, padding: 20, border: "1px solid " + CHROME + "33" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: PAPER, marginBottom: 6 }}>Refund job</div>
              <div style={{ fontSize: 12, color: CHROME, marginBottom: 14 }}>
                Paid {money(payable)} via {refundJob.payment_method || "—"} · refundable: {money(refundable)}
                {alreadyRefunded > 0 ? " (KSh " + alreadyRefunded.toLocaleString() + " already refunded)" : ""}
              </div>
              {refundError && <div style={{ fontSize: 12, color: ALERT, marginBottom: 10 }}>{refundError}</div>}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Amount to refund (KSh)</div>
                <input type="number" value={refundAmount} max={refundable}
                  onChange={function (e) { setRefundAmount(e.target.value); }}
                  placeholder={String(refundable)}
                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }} />
                <span onClick={function () { setRefundAmount(String(refundable)); }}
                  style={{ fontSize: 11, color: SIGNAL, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                  Full refund (KSh {refundable.toLocaleString()})
                </span>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Reason (optional)</div>
                <input value={refundReason} onChange={function (e) { setRefundReason(e.target.value); }}
                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "10px", fontSize: 13 }} />
              </div>
              <div style={{ fontSize: 10, color: CHROME, marginBottom: 16 }}>
                Money goes back the way it was paid (hand back cash / note the M-Pesa reversal yourself --
                this doesn't trigger an actual M-Pesa reversal). Commission is reduced proportionally.
                {parseInt(refundAmount, 10) >= refundable
                  ? " Stock used for this job will be restored automatically since this is a full refund."
                  : " Stock is NOT auto-restored for a partial refund -- adjust manually in the Stock Log Viewer if needed."}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={function () { setRefundJob(null); }} style={{
                  flex: 1, background: "transparent", color: CHROME, border: "1.5px solid " + CHROME + "55",
                  borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                  Cancel
                </button>
                <button onClick={processRefund} disabled={refundSaving} style={{
                  flex: 1, background: ALERT, color: INK, border: "none", borderRadius: 8, padding: "10px",
                  fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: refundSaving ? 0.6 : 1,
                }}>
                  Confirm Refund
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
