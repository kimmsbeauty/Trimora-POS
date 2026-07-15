// src/pages/auto/BoardPage.jsx
//
// The Queue + Bay board -- one screen, two projections of the same
// auto_jobs/auto_bays state, per the architecture plan's modeling note
// (Check-In, Queue, and Bay Management are one state machine, not three
// separate data models). Tap a waiting job, pick a staff member (required
// -- Phase 4), then tap a free bay, to start it. Tap an occupied bay to
// advance its job through the in_bay -> ready_for_collection -> completed
// sequence, or cancel it.
//
// Feature-parity item #8: at ready_for_collection, commission is edited
// per service line (each line gets its own staff picker and %/KSh,
// defaulting to that line's assigned staff -- falling back to the job's
// overall assigned_staff_id -- at their commission_pct), not as a
// single flat rate on the whole job. A job-level discount (% or fixed,
// matching POS's own cart-level discount -- POS's isn't per-line
// either) is entered alongside it. Tapping "Complete" saves both
// immediately (auto_jobs.discount_*, each line's staff_id/
// commission_override/commission) before the Cash/Till/Pay-later choice
// opens, since that choice needs the discounted payable amount, not
// the raw total_price. total_price itself is never mutated -- it stays
// the original, undiscounted service total for audit purposes;
// payableAmount() computes total_price - discount_amount wherever the
// actual charged amount is needed (payment modal, receipt, loyalty
// credit, revenue reporting).
//
// Completing a job offers Cash, M-Pesa (Till), or Pay later -- matching
// POS's own pay-later convention (explicit decision: Auto should not be
// stricter than POS on this). Pay later completes the job with
// payment_status left as 'unpaid'; Cash/Till set payment_status='paid'
// immediately.
//
// Deliberately polling (10s interval + manual refresh button), not
// Supabase Realtime -- the kickoff brief's hard constraint requires
// any new real-time infrastructure to be isolated from POS's existing
// setup (separate channels/rate limits), which is real, separate scope.
// Polling is a legitimate, zero-new-infrastructure interim that keeps
// this screen honest about what it actually does.

import { useState, useEffect, useCallback } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import AutoMpesaPaymentModal from "../../components/AutoMpesaPaymentModal";
import AutoReceipt from "../../components/AutoReceipt";
import AutoFeedbackModal from "../../components/AutoFeedbackModal";
import VehiclePhotoUpload from "../../components/VehiclePhotoUpload";
import { computeStockAfterDeduction } from "../../lib/saleLogic";
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

// Per-line commission rate: the line's own staff assignment if set,
// falling back to the job's assigned_staff_id, falling back to 40% --
// same fallback chain as POS's cartMath.js (item.stylist || selStaff,
// then rateForStylistName's own 40% default).
function defaultLineStaffId(line, job) {
  return line.staff_id || job.assigned_staff_id || null;
}
function defaultLinePct(line, job, staffById) {
  var staffId = defaultLineStaffId(line, job);
  var staffMember = staffById[staffId];
  return staffMember && staffMember.commission_pct != null ? staffMember.commission_pct : 40;
}
function defaultLineCommission(line, job, staffById) {
  var pct = defaultLinePct(line, job, staffById);
  return Math.round((line.price || 0) * pct / 100);
}

// discount_amount is clamped to total_price -- a discount can never
// make a job's payable amount negative, same clamp cartMath.js applies
// (Math.min(serviceTotal, ...)).
function computeDiscountAmount(job, discountType, discountValue) {
  var total = job.total_price || 0;
  var value = parseFloat(discountValue) || 0;
  if (!discountType || value <= 0 || total <= 0) return 0;
  var amount = discountType === "pct" ? total * (value / 100) : value;
  return Math.min(total, Math.round(amount));
}

// The actual amount to charge/report/credit-to-loyalty -- total_price
// stays the original, immutable service total (matches Check-In's
// value, auditable); discount_amount is a separate, subtracted figure,
// deliberately not baked back into total_price the way POS's cartTotal
// bakes its discount in -- keeps "what services cost" and "what got
// discounted" independently visible everywhere downstream.
function payableAmount(job) {
  return (job.total_price || 0) - (job.discount_amount || 0);
}

// Matches POSApp.jsx's generateFeedbackToken exactly -- same 12 random
// bytes hex-encoded, same source of randomness (window.crypto).
function generateFeedbackToken() {
  var bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function elapsedMinutes(isoString) {
  var mins = Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
  return mins < 1 ? "just now" : mins + " min";
}

export default function BoardPage() {
  var jobsState = useState([]); var jobs = jobsState[0]; var setJobs = jobsState[1];
  var baysState = useState([]); var bays = baysState[0]; var setBays = baysState[1];
  var staffState = useState([]); var staff = staffState[0]; var setStaff = staffState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var selectedJobIdState = useState(null);
  var selectedJobId = selectedJobIdState[0]; var setSelectedJobId = selectedJobIdState[1];
  var selectedStaffIdState = useState(null);
  var selectedStaffId = selectedStaffIdState[0]; var setSelectedStaffId = selectedStaffIdState[1];
  // One-at-a-time expanded photo panel -- same pattern as selectedJobId,
  // works for any job (waiting or in-progress) since the panel is keyed
  // off vehicle_id, not job status.
  var expandedPhotosJobIdState = useState(null);
  var expandedPhotosJobId = expandedPhotosJobIdState[0]; var setExpandedPhotosJobId = expandedPhotosJobIdState[1];
  var commissionEditsState = useState({}); // job.id -> { discountType, discountValue, lines: { lineId: { staffId, pct, amount } } }
  var commissionEdits = commissionEditsState[0]; var setCommissionEdits = commissionEditsState[1];
  var jobServicesState = useState({}); // job.id -> array of auto_job_services rows (with auto_services join)
  var jobServicesByJobId = jobServicesState[0]; var setJobServicesByJobId = jobServicesState[1];
  // customer_id -> array of active customer_memberships rows (with auto_membership_plans join),
  // used to offer "Apply Membership" at ready_for_collection when a job's line matches the
  // membership's covered_service_id. Fetched fresh each load() so an expiry crossing midnight
  // between visits is never stale.
  var membershipsState = useState({}); var membershipsByCustomerId = membershipsState[0]; var setMembershipsByCustomerId = membershipsState[1];
  var referralsState = useState([]); var referrals = referralsState[0]; var setReferrals = referralsState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];
  var salon = useSalon();
  // Phase 5: completing a job requires collecting payment first --
  // paymentJobId is the job currently in the payment step (Cash/Till
  // choice); showMpesaModal is whether the STK-push sub-modal is open
  // on top of that choice.
  var paymentJobIdState = useState(null);
  var paymentJobId = paymentJobIdState[0]; var setPaymentJobId = paymentJobIdState[1];
  // How much of this job's payable amount the staff has chosen to draw
  // from the customer's wallet, at the Cash/Till choice step. Reset to 0
  // whenever a new job enters the payment step (see startCompleteFlow).
  // Actually deducting it happens in spendWalletAndAdvance() below, right
  // before the remaining balance (if any) is charged via the normal
  // Cash/Till/M-Pesa path -- wallet spend is applied first so a failed
  // wallet call (e.g. a race against another concurrent spend) never
  // completes the job while silently skipping the wallet debit.
  var walletAmountState = useState(0);
  var walletAmount = walletAmountState[0]; var setWalletAmount = walletAmountState[1];
  var walletErrorState = useState("");
  var walletError = walletErrorState[0]; var setWalletError = walletErrorState[1];

  // Split payment: an optional second method for whatever's left after
  // wallet. splitMode toggles the two-method picker in place of the
  // single-method button list; the breakdown itself (amounts, methods)
  // only gets built at confirm time from these two slots, and stashed
  // separately (pendingSplitBreakdown) if a Till leg needs to wait on
  // STK confirmation first.
  var splitModeState = useState(false);
  var splitMode = splitModeState[0]; var setSplitMode = splitModeState[1];
  var splitMethodAState = useState("Cash");
  var splitMethodA = splitMethodAState[0]; var setSplitMethodA = splitMethodAState[1];
  var splitAmountAState = useState("");
  var splitAmountA = splitAmountAState[0]; var setSplitAmountA = splitAmountAState[1];
  var splitMethodBState = useState("Till");
  var splitMethodB = splitMethodBState[0]; var setSplitMethodB = splitMethodBState[1];
  var splitAmountBState = useState("");
  var splitAmountB = splitAmountBState[0]; var setSplitAmountB = splitAmountBState[1];
  var pendingSplitBreakdownState = useState(null);
  var pendingSplitBreakdown = pendingSplitBreakdownState[0]; var setPendingSplitBreakdown = pendingSplitBreakdownState[1];
  var showMpesaModalState = useState(false);
  var showMpesaModal = showMpesaModalState[0]; var setShowMpesaModal = showMpesaModalState[1];
  // Receipt: shown automatically right after a job completes, matching
  // POS's own completeSale() -> Receipt convention. Holds the finalized
  // job + its line items fetched fresh right after completion, since
  // the completed job drops out of `jobs` on the next load() (it's
  // filtered out by ACTIVE_STATUSES) before a receipt could otherwise
  // read its final commission/payment_method/completed_at.
  var receiptJobState = useState(null); var receiptJob = receiptJobState[0]; var setReceiptJob = receiptJobState[1];
  var receiptServicesState = useState([]); var receiptServices = receiptServicesState[0]; var setReceiptServices = receiptServicesState[1];
  var showInPersonFeedbackState = useState(false);
  var showInPersonFeedback = showInPersonFeedbackState[0]; var setShowInPersonFeedback = showInPersonFeedbackState[1];
  var feedbackSentNoticeState = useState(false);
  var feedbackSentNotice = feedbackSentNoticeState[0]; var setFeedbackSentNotice = feedbackSentNoticeState[1];

  var load = useCallback(async function () {
    var results = await Promise.all([
      db("GET", "auto_bays", null, "?order=label.asc"),
      db("GET", "auto_jobs", null,
        "?status=in.(" + ACTIVE_STATUSES + ")&order=checked_in_at.asc" +
        "&select=*,auto_vehicles(reg_number,make,model,color),customers(id,name,phone,visit_count,total_spend,wallet_balance)"),
      db("GET", "staff", null, "?active=eq.true&order=name.asc"),
    ]);
    var bayRows = results[0] || [];
    var jobRows = results[1] || [];
    var staffRows = results[2] || [];
    setBays(bayRows);
    setJobs(jobRows);
    setStaff(staffRows);

    // Line items -- needed for the per-line commission editor (feature-
    // parity item #8). Only fetched for jobs that can reach the
    // ready_for_collection editor, batched into one call rather than
    // one request per job.
    var jobIds = jobRows.map(function (j) { return j.id; });
    if (jobIds.length > 0) {
      var lineRows = await db("GET", "auto_job_services", null,
        "?job_id=in.(" + jobIds.join(",") + ")&select=*,auto_services(name)");
      var byJob = {};
      (lineRows || []).forEach(function (row) {
        if (!byJob[row.job_id]) byJob[row.job_id] = [];
        byJob[row.job_id].push(row);
      });
      setJobServicesByJobId(byJob);
    } else {
      setJobServicesByJobId({});
    }

    var custIds = jobRows.map(function (j) { return j.customer_id; }).filter(Boolean);
    if (custIds.length > 0) {
      var membershipRows = await db("GET", "customer_memberships", null,
        "?customer_id=in.(" + custIds.join(",") + ")&status=eq.active&expires_at=gt." + new Date().toISOString() +
        "&select=*,auto_membership_plans(id,name,covered_service_id)");
      var byCustomer = {};
      (membershipRows || []).forEach(function (row) {
        if (!byCustomer[row.customer_id]) byCustomer[row.customer_id] = [];
        byCustomer[row.customer_id].push(row);
      });
      setMembershipsByCustomerId(byCustomer);

      // Two independent ways a job can carry a pending referral reward:
      // (a) this customer is a referrer with ANY pending reward waiting
      //     for their next visit (could be redeemed on this job or a
      //     later one -- whichever comes first), or
      // (b) this exact job IS the referred customer's rewarded first
      //     visit (referred_job_id was stamped at check-in).
      // Both checked in one query via an OR filter rather than two round
      // trips.
      var jobIds = jobRows.map(function (j) { return j.id; });
      var referralRows = await db("GET", "auto_referrals", null,
        "?or=(and(referrer_customer_id.in.(" + custIds.join(",") + "),referrer_reward_status.eq.pending)," +
        "and(referred_job_id.in.(" + jobIds.join(",") + "),referred_reward_status.eq.pending))");
      setReferrals(referralRows || []);
    } else {
      setMembershipsByCustomerId({});
      setReferrals([]);
    }

    setLoading(false);
  }, []);

  // Finds whether this job qualifies for a membership discount: the
  // customer must hold an active membership whose plan's covered_service_id
  // matches one of this job's line items. Returns the matching line (so its
  // price becomes the flat discount amount -- other, non-covered lines on
  // the same job stay charged in full) or null. First match wins; a
  // customer stacking two memberships covering the same service is an edge
  // case not handled specially -- either one covers it.
  function findMembershipMatch(job) {
    var memberships = (job.customer_id && membershipsByCustomerId[job.customer_id]) || [];
    if (memberships.length === 0) return null;
    var lines = jobServicesByJobId[job.id] || [];
    for (var i = 0; i < memberships.length; i++) {
      var plan = memberships[i].auto_membership_plans;
      if (!plan) continue;
      var matchedLine = lines.filter(function (l) { return l.auto_service_id === plan.covered_service_id; })[0];
      if (matchedLine) return { line: matchedLine, plan: plan };
    }
    return null;
  }

  // Finds a pending referral reward applicable to this job -- checked
  // separately from membership and given lower priority (see the render
  // site below): this job's schema only has one discount slot, so if a
  // job somehow qualifies for both a membership AND a referral reward at
  // once, membership wins and the referral stays pending for a future
  // visit rather than being silently dropped.
  function findReferralMatch(job) {
    if (!job.customer_id) return null;
    var direct = referrals.filter(function (r) { return r.referred_job_id === job.id && r.referred_reward_status === "pending"; })[0];
    if (direct) return { referral: direct, role: "referred" };
    var asReferrer = referrals.filter(function (r) { return r.referrer_customer_id === job.customer_id && r.referrer_reward_status === "pending"; })[0];
    if (asReferrer) return { referral: asReferrer, role: "referrer" };
    return null;
  }

  // Referral rewards apply automatically, unlike Membership's manual
  // "Apply" tap -- per the product decision, staff shouldn't need to
  // remember to do anything. Runs whenever a job's referral/membership
  // data changes; only ever fills in a job's discount when staff haven't
  // touched it yet (edits.discountType === undefined, not merely falsy --
  // an explicit "Remove" click sets it to null, which must stay removed,
  // not get re-applied on the next tick). Membership still wins if a job
  // somehow qualifies for both, since only one discount slot exists.
  useEffect(function () {
    var toApply = null;
    jobs.forEach(function (job) {
      if (job.status !== "ready_for_collection") return;
      var existing = commissionEdits[job.id];
      if (existing && existing.discountType !== undefined) return;
      if (findMembershipMatch(job)) return;
      var match = findReferralMatch(job);
      if (!match) return;
      if (!toApply) toApply = {};
      toApply[job.id] = { discountType: "pct", discountValue: String(match.referral.reward_pct) };
    });
    if (toApply) {
      setCommissionEdits(function (prev) {
        var next = Object.assign({}, prev);
        Object.keys(toApply).forEach(function (jobId) {
          next[jobId] = Object.assign({}, next[jobId], toApply[jobId]);
        });
        return next;
      });
    }
  }, [jobs, referrals, membershipsByCustomerId, jobServicesByJobId]);

  useEffect(function () {
    load();
    var interval = setInterval(load, 10000);
    return function () { clearInterval(interval); };
  }, [load]);

  var jobsById = {};
  jobs.forEach(function (j) { jobsById[j.id] = j; });

  var staffById = {};
  staff.forEach(function (s) { staffById[s.id] = s; });

  // Priority queue: high-priority jobs surface first, FIFO within each
  // tier. jobs is already fetched order=checked_in_at.asc (see load()
  // above), and Array.prototype.sort is a stable sort in every modern
  // JS engine (guaranteed by spec since ES2019), so this preserves
  // check-in order within the "high" group and within the "normal"
  // group -- it doesn't need a secondary checked_in_at comparator.
  var waitingJobs = jobs
    .filter(function (j) { return j.status === "waiting"; })
    .sort(function (a, b) {
      var aHigh = a.priority === "high" ? 0 : 1;
      var bHigh = b.priority === "high" ? 0 : 1;
      return aHigh - bHigh;
    });
  var activeJobs = jobs.filter(function (j) { return j.status !== "waiting"; });

  async function togglePriority(job, e) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    var next = job.priority === "high" ? "normal" : "high";
    await db("PATCH", "auto_jobs", { priority: next }, "?id=eq." + job.id);
    await db("POST", "auto_job_events", { job_id: job.id, event_type: "priority_changed", payload: { priority: next } });
    setBusy(false);
    load();
  }

  async function assignBay(bayId) {
    if (!selectedJobId || !selectedStaffId || busy) return;
    setBusy(true);
    await db("PATCH", "auto_jobs",
      { status: "in_bay", bay_id: bayId, in_bay_at: new Date().toISOString(), assigned_staff_id: selectedStaffId },
      "?id=eq." + selectedJobId);
    await db("PATCH", "auto_bays", { current_job_id: selectedJobId }, "?id=eq." + bayId);
    await db("POST", "auto_job_events", {
      job_id: selectedJobId, event_type: "started", payload: { bay_id: bayId, staff_id: selectedStaffId },
    });
    setSelectedJobId(null);
    setSelectedStaffId(null);
    setBusy(false);
    load();
  }

  // Stock deduction on job completion -- reads which services were on
  // this job (auto_job_services), what each requires
  // (auto_service_required_stock, configured in the Services tab), and
  // deducts from the shared `stock` table + logs an auto_stock_movements
  // row per item. Best-effort: mirrors POS's own completeSale() pattern
  // of deducting stock *after* the primary record is already saved, and
  // not rolling anything back if a deduction step fails partway --
  // logged, not surfaced as a job-completion failure. Multiple line
  // items requiring the same stock item correctly sum their deductions
  // (computeStockAfterDeduction is applied cumulatively, not per-line
  // against a stale starting figure).
  async function deductStockForJob(job) {
    try {
      var jobServices = await db("GET", "auto_job_services", null, "?job_id=eq." + job.id + "&select=auto_service_id");
      var serviceIds = (jobServices || []).map(function (js) { return js.auto_service_id; });
      if (serviceIds.length === 0) return;

      var requiredRows = await db("GET", "auto_service_required_stock", null,
        "?auto_service_id=in.(" + serviceIds.join(",") + ")");
      if (!requiredRows || requiredRows.length === 0) return;

      // Sum required quantity per stock_id across all services on this
      // job (a job can have multiple line items needing the same item).
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
        if (!current) continue; // stock item deleted since being configured -- skip, don't throw
        // stock.stock and auto_stock_movements.change_qty are both
        // integer columns, but auto_service_required_stock.quantity is
        // numeric (the UI used to allow fractional entry). Round once,
        // here, and use the same rounded value for both writes below --
        // rounding qty itself rather than letting each write round
        // independently at the DB layer keeps the stock total and its
        // movement log from ever being able to drift apart.
        var qty = Math.round(neededByStockId[stockId]);
        var newStock = computeStockAfterDeduction(current.stock, qty);
        await db("PATCH", "stock", { stock: newStock }, "?id=eq." + stockId);
        await db("POST", "auto_stock_movements", {
          stock_id: stockId, change_qty: -qty, reason: "auto_job_completion",
          reference_type: "auto_job", reference_id: job.id, created_by: job.assigned_staff_id || null,
        });
      }
    } catch (err) {
      console.error("Stock deduction failed for job " + job.id + ":", err);
    }
  }

  // Shared by startCompleteFlow (writes the DB) and advanceJob (needs
  // the summed total for auto_jobs.commission) -- computed once from
  // the same in-memory edit state both read, so they can never disagree.
  function computeLinePricing(job) {
    var edits = commissionEdits[job.id] || {};
    var lines = jobServicesByJobId[job.id] || [];
    var discountType = edits.discountType || null;
    var discountValue = edits.discountValue || "";
    var discountAmount = computeDiscountAmount(job, discountType, discountValue);

    var totalCommission = 0;
    var lineResults = lines.map(function (line) {
      var lineEdit = (edits.lines && edits.lines[line.id]) || {};
      var staffId = lineEdit.staffId !== undefined ? lineEdit.staffId : defaultLineStaffId(line, job);
      var pctStr = lineEdit.pct;
      var amountStr = lineEdit.amount;
      var commission;
      if (amountStr !== undefined) {
        var parsedAmount = parseInt(amountStr, 10);
        commission = isNaN(parsedAmount) ? 0 : parsedAmount;
      } else if (pctStr !== undefined) {
        var parsedPct = parseInt(pctStr, 10);
        commission = isNaN(parsedPct) ? 0 : Math.round((line.price || 0) * parsedPct / 100);
      } else {
        commission = defaultLineCommission(line, job, staffById);
      }
      totalCommission += commission;
      var override = pctStr !== undefined ? (parseInt(pctStr, 10) || 0) : null;
      return { lineId: line.id, staffId: staffId, commission_override: override, commission: commission };
    });

    return {
      discountType: discountType, discountValue: discountValue ? parseInt(discountValue, 10) : null,
      discountAmount: discountAmount, lineResults: lineResults, totalCommission: totalCommission,
    };
  }

  async function advanceJob(job, paymentMethod, walletAmountUsed, paymentBreakdown) {
    if (busy) return;
    var next = NEXT_STATUS[job.status];
    if (!next) return;
    setBusy(true);

    var patch = { status: next };
    if (next === "ready_for_collection") patch.ready_at = new Date().toISOString();
    if (next === "completed") {
      patch.completed_at = new Date().toISOString();
      patch.feedback_token = generateFeedbackToken();
      patch.commission = computeLinePricing(job).totalCommission;
      patch.wallet_amount_used = walletAmountUsed || 0;
      // Cash/Till pass a paymentMethod and mark the job paid immediately.
      // Pay later (explicit decision, matching POS's own convention)
      // calls advanceJob with no paymentMethod at all -- payment_status
      // stays 'unpaid', payment_method stays null, and nothing about
      // completion is blocked on it.
      if (paymentBreakdown) {
        patch.payment_method = "Split";
        patch.payment_breakdown = paymentBreakdown;
        patch.payment_status = "paid";
      } else if (paymentMethod) {
        patch.payment_method = paymentMethod;
        patch.payment_status = "paid";
      }
    }
    // Captured before the post-completion setCommissionEdits cleanup
    // below deletes this job's edits -- only marks the reward redeemed
    // if it was actually still applied at the moment of completion (a
    // staff "Remove" click clears discountSource, so a removed referral
    // correctly stays pending for a future visit instead of being
    // burned here).
    var editsAtCompletion = commissionEdits[job.id] || {};
    var referralToRedeem = (next === "completed" && editsAtCompletion.discountSource === "referral")
      ? findReferralMatch(job) : null;
    await db("PATCH", "auto_jobs", patch, "?id=eq." + job.id);

    if (next === "completed") {
      // Fire-and-continue: deductStockForJob has its own try/catch and
      // never throws, so a stock-config issue can't block the job from
      // completing -- matches POS's own completeSale() precedent of not
      // rolling back the primary record over a stock-side failure.
      await deductStockForJob(job);
    }

    if (next === "completed" && job.bay_id) {
      await db("PATCH", "auto_bays", { current_job_id: null }, "?id=eq." + job.bay_id);
    }

    if (referralToRedeem) {
      var field = referralToRedeem.role === "referred" ? "referred_reward_status" : "referrer_reward_status";
      var jobField = referralToRedeem.role === "referred" ? "referred_job_id" : "referrer_job_id";
      var referralPatch = {};
      referralPatch[field] = "redeemed";
      referralPatch[jobField] = job.id;
      await db("PATCH", "auto_referrals", referralPatch, "?id=eq." + referralToRedeem.referral.id);
    }

    // Loyalty (feature-parity item #7): credits the customer's total
    // spend with what they actually paid (total_price - discount),
    // not the pre-discount service total -- matches POS's own
    // convention of crediting loyalty against the discounted cartTotal,
    // not the undiscounted serviceTotal.
    if (next === "completed" && job.customer_id) {
      var cust = job.customers || {};
      var newVisits = (cust.visit_count || 0) + 1;
      var newSpend = (cust.total_spend || 0) + payableAmount(job);
      await db("PATCH", "customers", { visit_count: newVisits, total_spend: newSpend }, "?id=eq." + job.customer_id);
    }

    await db("POST", "auto_job_events", {
      job_id: job.id, event_type: next === "completed" ? "completed" : "status_changed",
      payload: { from: job.status, to: next },
    });

    if (next === "completed") {
      setCommissionEdits(function (prev) {
        var copy = Object.assign({}, prev);
        delete copy[job.id];
        return copy;
      });

      var finalized = await db("GET", "auto_jobs", null,
        "?id=eq." + job.id + "&select=*,auto_vehicles(reg_number,make,model,color),customers(id,name,phone,visit_count,total_spend,wallet_balance)");
      var services = await db("GET", "auto_job_services", null,
        "?job_id=eq." + job.id + "&select=*,auto_services(name),staff(name)");
      if (finalized && finalized[0]) {
        setReceiptJob(finalized[0]);
        setReceiptServices(services || []);
      }
    }

    setBusy(false);
    load();
  }

  // Phase 5: "Complete" no longer advances the job directly -- it opens
  // the Cash/Till choice below. Cash completes immediately; Till opens
  // the STK-push modal and only completes once payment is confirmed.
  //
  // Feature-parity item #8: before opening that choice, the currently-
  // edited discount and per-line staff/commission are saved to the DB
  // immediately -- the payment modal needs the discounted payable
  // amount (not the raw total_price), and per-line commission
  // attribution is "finalizing the job's pricing", a genuinely
  // different action from "recording how payment was received".
  async function startCompleteFlow(job) {
    if (busy) return;
    setBusy(true);
    var pricing = computeLinePricing(job);

    await db("PATCH", "auto_jobs", {
      discount_type: pricing.discountType, discount_value: pricing.discountValue,
      discount_amount: pricing.discountAmount,
    }, "?id=eq." + job.id);

    for (var i = 0; i < pricing.lineResults.length; i++) {
      var lr = pricing.lineResults[i];
      await db("PATCH", "auto_job_services", {
        staff_id: lr.staffId, commission_override: lr.commission_override, commission: lr.commission,
      }, "?id=eq." + lr.lineId);
    }

    await load();
    setBusy(false);
    setWalletAmount(0);
    setWalletError("");
    setSplitMode(false);
    setSplitAmountA("");
    setSplitAmountB("");
    setPendingSplitBreakdown(null);
    setPaymentJobId(job.id);
  }

  // Applies the chosen wallet amount via the atomic RPC (reference_type/id
  // point back at this job so the ledger is traceable from either side),
  // then either completes the job outright (wallet covered it in full) or
  // hands off to whichever remainder-payment path the staff picked. If the
  // wallet call fails (insufficient balance -- e.g. another concurrent
  // spend beat this one to it -- or a network error), the job is NOT
  // completed and the modal stays open with the error shown, exactly like
  // a declined M-Pesa payment already behaves.
  async function spendWalletThenAdvance(job, remainderMethod, paymentBreakdown) {
    var amount = walletAmount;
    if (amount > 0) {
      setBusy(true);
      var result = await dbRpcAuth("apply_wallet_transaction", {
        p_customer_id: job.customer_id, p_type: "spend", p_amount: amount,
        p_reference_type: "auto_job", p_reference_id: job.id,
        p_created_by: job.assigned_staff_id || null,
      });
      setBusy(false);
      if (result.error) { setWalletError(result.error); return; }
    }
    setPaymentJobId(null);
    setWalletError("");
    var walletUsed = amount;
    setWalletAmount(0);
    setSplitMode(false);
    setSplitAmountA("");
    setSplitAmountB("");
    if (paymentBreakdown) {
      advanceJob(job, undefined, walletUsed, paymentBreakdown);
    } else if (remainderMethod === "wallet_full") {
      advanceJob(job, "Wallet", walletUsed);
    } else if (remainderMethod === "later") {
      advanceJob(job, undefined, walletUsed);
    } else {
      advanceJob(job, remainderMethod, walletUsed);
    }
  }

  function payCash(job) {
    spendWalletThenAdvance(job, "Cash");
  }

  // Paybill, Send Money, and Card are all recorded the same way Cash
  // already is -- a manual, staff-attested label, no processing behind
  // it. Only Till is different (real STK push, see payTill below).
  function payManual(job, method) {
    spendWalletThenAdvance(job, method);
  }

  function payWalletFull(job) {
    spendWalletThenAdvance(job, "wallet_full");
  }

  function payLater(job) {
    spendWalletThenAdvance(job, "later");
  }

  function payTill() {
    setShowMpesaModal(true);
  }

  // Confirms a two-method split of the (post-wallet) remainder. If
  // neither leg is Till, both are just staff-attested labels like Cash
  // already is -- completes immediately. If one leg IS Till, the flow
  // defers exactly like Wallet+Till already does: only that leg's STK
  // push is opened (for just its amount, not the whole remainder), and
  // the split is only persisted once that push actually confirms -- a
  // cancelled/failed prompt leaves nothing recorded, same safety
  // property Wallet+Till already has.
  function paySplit(job, breakdown) {
    var tillLeg = breakdown.filter(function (b) { return b.method === "Till"; })[0];
    if (tillLeg) {
      setPendingSplitBreakdown(breakdown);
      setShowMpesaModal(true);
    } else {
      spendWalletThenAdvance(job, null, breakdown);
    }
  }

  // Matches POSApp.jsx's sendFeedbackRequest exactly: same refusal
  // rather than sending a link guaranteed to fail if slug is somehow
  // missing, same wa.me phone-cleaning convention, same message shape.
  function sendFeedbackRequest(phone, clientFirstName, token) {
    if (!phone) return;
    if (!salon || !salon.slug) {
      console.error(
        "[BoardPage] Refusing to send a feedback rating link: salon or " +
        "salon.slug is missing. This should never happen for a loaded salon."
      );
      return;
    }
    var cleanPhone = phone.replace(/^0/, "254").replace(/\D/g, "");
    var ratingPath = "/" + salon.slug + "/auto/rate/" + token;
    var ratingUrl = window.location.origin + ratingPath;
    var message = "Hi " + clientFirstName + "! 👋 Thank you for visiting " + (salon.name || "us") + " 🚗\n\n" +
      "We'd love to hear how your wash went — it only takes a few seconds:\n" + ratingUrl + "\n\n" +
      "— " + (salon.name || "Trimora Auto");
    var waLink = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(message);
    window.open(waLink, "_blank");
  }

  async function submitInPersonFeedback(data) {
    if (!receiptJob) return;
    var customer = receiptJob.customers || {};
    var saved = await db("POST", "feedback", {
      rating: data.rating, note: data.note || null, stylist: data.staffName || null,
      client: customer.name || null, feedback_token: receiptJob.feedback_token || null,
      date: data.date, time: data.time,
    });
    if (!saved) { alert("Couldn't save this feedback right now. Please try again."); return; }
    setShowInPersonFeedback(false);
  }

  function handleMpesaPaid(job, method) {
    setShowMpesaModal(false);
    if (pendingSplitBreakdown) {
      var breakdown = pendingSplitBreakdown;
      setPendingSplitBreakdown(null);
      spendWalletThenAdvance(job, null, breakdown);
    } else {
      spendWalletThenAdvance(job, method);
    }
  }

  function handleMpesaCancel() {
    setShowMpesaModal(false);
    setPendingSplitBreakdown(null);
    // Leave paymentJobId set so staff lands back on the Cash/Till choice
    // rather than the modal silently closing them out of completing the
    // job at all.
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
            {selectedJobId && selectedStaffId && <span style={{ color: SIGNAL }}>Tap a free bay to assign</span>}
            {selectedJobId && !selectedStaffId && <span style={{ color: CHROME }}>Select a staff member first</span>}
          </div>
          {bays.length === 0 && (
            <div style={{ fontSize: 13, color: CHROME }}>No bays set up yet for this business.</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {bays.map(function (bay) {
              var occupiedJob = bay.current_job_id ? jobsById[bay.current_job_id] : null;
              var isFree = bay.active && !bay.current_job_id;
              var clickable = isFree && !!selectedJobId && !!selectedStaffId;
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
              var isHigh = job.priority === "high";
              return (
                <div key={job.id} style={{ display: "contents" }}>
                <div
                  onClick={function () {
                    setSelectedJobId(isSelected ? null : job.id);
                    setSelectedStaffId(null);
                  }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                    border: "1.5px solid " + (isSelected ? SIGNAL : (isHigh ? ALERT + "88" : "rgba(143,166,184,0.2)")),
                    background: isSelected ? "rgba(61,220,151,0.1)" : "rgba(255,255,255,0.02)",
                  }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: PAPER }}>
                      {isHigh && <span style={{ color: ALERT, marginRight: 6 }}>⚡</span>}
                      {vehicleLabel(job)}
                    </div>
                    <div style={{ fontSize: 11, color: CHROME }}>
                      {job.customers ? job.customers.name + " · " : ""}waiting {elapsedMinutes(job.checked_in_at)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={function (e) { e.stopPropagation(); setExpandedPhotosJobId(expandedPhotosJobId === job.id ? null : job.id); }}
                      style={{
                        fontSize: 10, fontWeight: 700, padding: "5px 9px", borderRadius: 8,
                        border: "1.5px solid " + CHROME + "55", background: "transparent", color: CHROME,
                        cursor: "pointer",
                      }}>
                      📷 Photos
                    </button>
                    <button
                      onClick={function (e) { togglePriority(job, e); }}
                      disabled={busy}
                      style={{
                        fontSize: 10, fontWeight: 800, padding: "5px 9px", borderRadius: 8,
                        border: "1.5px solid " + (isHigh ? ALERT : CHROME + "55"),
                        background: isHigh ? ALERT : "transparent",
                        color: isHigh ? INK : CHROME,
                        cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
                      }}>
                      {isHigh ? "★ Priority" : "Mark priority"}
                    </button>
                    {isSelected && <div style={{ fontSize: 11, fontWeight: 800, color: SIGNAL }}>Selected</div>}
                  </div>
                </div>
                {expandedPhotosJobId === job.id && (
                  <div onClick={function (e) { e.stopPropagation(); }} style={{ marginTop: -4, marginBottom: 4, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1.5px solid rgba(143,166,184,0.2)" }}>
                    <VehiclePhotoUpload vehicleId={job.vehicle_id} />
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Staff picker -- required before a bay can be assigned */}
        {selectedJobId && (
          <div style={Object.assign({}, panelStyle, { marginBottom: 16 })}>
            <div style={sectionLabel}><span>Assign to staff member</span></div>
            {staff.length === 0 && (
              <div style={{ fontSize: 13, color: CHROME }}>No active staff found for this business.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {staff.map(function (s) {
                var isSelected = selectedStaffId === s.id;
                return (
                  <div key={s.id}
                    onClick={function () { setSelectedStaffId(isSelected ? null : s.id); }}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                      border: "1.5px solid " + (isSelected ? SIGNAL : "rgba(143,166,184,0.2)"),
                      background: isSelected ? "rgba(61,220,151,0.1)" : "rgba(255,255,255,0.02)",
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: PAPER }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: CHROME }}>{s.role}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* In progress */}
        <div style={panelStyle}>
          <div style={sectionLabel}><span>In progress ({activeJobs.length})</span></div>
          {activeJobs.length === 0 && (
            <div style={{ fontSize: 13, color: CHROME }}>No vehicles in progress.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeJobs.map(function (job) {
              var assignedStaff = staffById[job.assigned_staff_id];
              var isReadyForCollection = job.status === "ready_for_collection";
              var lines = jobServicesByJobId[job.id] || [];
              var edits = commissionEdits[job.id] || {};
              var lineEdits = edits.lines || {};

              function setDiscount(patch) {
                setCommissionEdits(function (prev) {
                  var jobEdit = Object.assign({}, prev[job.id], patch);
                  return Object.assign({}, prev, (function () { var o = {}; o[job.id] = jobEdit; return o; })());
                });
              }
              function setLineEdit(lineId, patch) {
                setCommissionEdits(function (prev) {
                  var jobEdit = Object.assign({}, prev[job.id]);
                  jobEdit.lines = Object.assign({}, jobEdit.lines);
                  jobEdit.lines[lineId] = Object.assign({}, jobEdit.lines[lineId], patch);
                  return Object.assign({}, prev, (function () { var o = {}; o[job.id] = jobEdit; return o; })());
                });
              }

              var pricing = isReadyForCollection ? computeLinePricing(job) : null;
              var membershipMatch = isReadyForCollection ? findMembershipMatch(job) : null;
              var membershipApplied = edits.discountType === "membership";
              var referralMatch = isReadyForCollection ? findReferralMatch(job) : null;
              var referralApplied = edits.discountSource === "referral";

              return (
                <div key={job.id} style={{
                  padding: "12px 14px", borderRadius: 10,
                  border: "1.5px solid rgba(143,166,184,0.2)", background: "rgba(255,255,255,0.02)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isReadyForCollection ? 12 : 0 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: PAPER }}>{vehicleLabel(job)}</div>
                      <div style={{ fontSize: 11, color: CHROME }}>
                        {STATUS_LABEL[job.status]}{assignedStaff ? " · " + assignedStaff.name : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={function () { setExpandedPhotosJobId(expandedPhotosJobId === job.id ? null : job.id); }} style={{
                        background: "transparent", color: CHROME, border: "1.5px solid " + CHROME + "55",
                        borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}>
                        📷
                      </button>
                      {NEXT_STATUS[job.status] && (
                        <button onClick={function () {
                          if (NEXT_STATUS[job.status] === "completed") { startCompleteFlow(job); }
                          else { advanceJob(job); }
                        }} disabled={busy} style={{
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

                  {isReadyForCollection && (
                    <div style={{ borderTop: "1px solid " + CHROME + "22", paddingTop: 10 }}>
                      {lines.length === 0 && (
                        <div style={{ fontSize: 11, color: CHROME, marginBottom: 8 }}>No line items on this job.</div>
                      )}
                      {lines.map(function (line) {
                        var lineEdit = lineEdits[line.id] || {};
                        var staffId = lineEdit.staffId !== undefined ? lineEdit.staffId : defaultLineStaffId(line, job);
                        var pctValue = lineEdit.pct !== undefined ? lineEdit.pct : String(defaultLinePct(line, job, staffById));
                        var amountValue = lineEdit.amount !== undefined ? lineEdit.amount : String(defaultLineCommission(line, job, staffById));
                        var name = (line.auto_services && line.auto_services.name) || "Service";

                        return (
                          <div key={line.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid " + CHROME + "15" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: PAPER }}>{name}</span>
                              <span style={{ fontSize: 12, color: CHROME }}>KSh {(line.price || 0).toLocaleString()}</span>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              <select value={staffId || ""}
                                onChange={function (e) { setLineEdit(line.id, { staffId: e.target.value || null }); }}
                                style={{
                                  flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)", color: PAPER,
                                  border: "1px solid rgba(143,166,184,0.3)", borderRadius: 6, padding: "6px 6px", fontSize: 11,
                                }}>
                                <option value="">Unassigned</option>
                                {staff.map(function (s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
                              </select>
                              <input type="number" value={pctValue}
                                onChange={function (e) {
                                  var pctStr = e.target.value;
                                  var pctNum = parseInt(pctStr, 10);
                                  setLineEdit(line.id, {
                                    pct: pctStr,
                                    amount: isNaN(pctNum) ? "0" : String(Math.round((line.price || 0) * pctNum / 100)),
                                  });
                                }}
                                style={{
                                  width: 40, background: "rgba(255,255,255,0.04)", color: PAPER,
                                  border: "1px solid rgba(143,166,184,0.3)", borderRadius: 6,
                                  padding: "6px 4px", fontSize: 11, textAlign: "right",
                                }} />
                              <span style={{ fontSize: 10, color: CHROME }}>% =</span>
                              <input type="number" value={amountValue}
                                onChange={function (e) { setLineEdit(line.id, { amount: e.target.value }); }}
                                style={{
                                  width: 56, background: "rgba(255,255,255,0.04)", color: PAPER,
                                  border: "1px solid rgba(143,166,184,0.3)", borderRadius: 6,
                                  padding: "6px 6px", fontSize: 11,
                                }} />
                            </div>
                          </div>
                        );
                      })}

                      {!membershipApplied && !referralApplied && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: CHROME, whiteSpace: "nowrap" }}>Discount</span>
                          <select value={edits.discountType || ""}
                            onChange={function (e) { setDiscount({ discountType: e.target.value || null, discountSource: undefined }); }}
                            style={{
                              background: "rgba(255,255,255,0.04)", color: PAPER,
                              border: "1px solid rgba(143,166,184,0.3)", borderRadius: 6, padding: "6px 6px", fontSize: 11,
                            }}>
                            <option value="">None</option>
                            <option value="pct">%</option>
                            <option value="fixed">KSh</option>
                          </select>
                          {edits.discountType && (
                            <input type="number" value={edits.discountValue || ""}
                              onChange={function (e) { setDiscount({ discountValue: e.target.value, discountSource: undefined }); }}
                              placeholder="0"
                              style={{
                                width: 64, background: "rgba(255,255,255,0.04)", color: PAPER,
                                border: "1px solid rgba(143,166,184,0.3)", borderRadius: 6, padding: "6px 8px", fontSize: 11,
                              }} />
                          )}
                          {pricing && pricing.discountAmount > 0 && (
                            <span style={{ fontSize: 11, color: SIGNAL, fontWeight: 700 }}>−KSh {pricing.discountAmount.toLocaleString()}</span>
                          )}
                          {membershipMatch && (
                            <button onClick={function () {
                              setDiscount({ discountType: "membership", discountValue: String(membershipMatch.line.price || 0) });
                            }} style={{
                              background: "transparent", color: SIGNAL, border: "1.5px solid " + SIGNAL,
                              borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                            }}>
                              ✓ Apply Membership — {membershipMatch.plan.name}
                            </button>
                          )}
                        </div>
                      )}
                      {membershipApplied && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 11, color: SIGNAL, fontWeight: 700 }}>
                            ✓ Membership applied{membershipMatch ? " — " + membershipMatch.plan.name : ""} (−KSh {(pricing ? pricing.discountAmount : 0).toLocaleString()})
                          </span>
                          <span onClick={function () { setDiscount({ discountType: null, discountValue: "" }); }}
                            style={{ fontSize: 11, color: CHROME, textDecoration: "underline", cursor: "pointer" }}>
                            Remove
                          </span>
                        </div>
                      )}
                      {referralApplied && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 11, color: SIGNAL, fontWeight: 700 }}>
                            ✓ Referral reward applied — {edits.discountValue}% off (−KSh {(pricing ? pricing.discountAmount : 0).toLocaleString()})
                          </span>
                          <span onClick={function () { setDiscount({ discountType: null, discountValue: "", discountSource: undefined }); }}
                            style={{ fontSize: 11, color: CHROME, textDecoration: "underline", cursor: "pointer" }}>
                            Remove
                          </span>
                        </div>
                      )}

                      {pricing && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800 }}>
                          <span style={{ color: CHROME }}>Payable: <span style={{ color: PAPER }}>KSh {((job.total_price || 0) - pricing.discountAmount).toLocaleString()}</span></span>
                          <span style={{ color: CHROME }}>Commission: <span style={{ color: SIGNAL }}>KSh {pricing.totalCommission.toLocaleString()}</span></span>
                        </div>
                      )}
                    </div>
                  )}
                  {expandedPhotosJobId === job.id && (
                    <div style={{ borderTop: "1px solid " + CHROME + "22", paddingTop: 10, marginTop: 10 }}>
                      <VehiclePhotoUpload vehicleId={job.vehicle_id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {paymentJobId && !showMpesaModal && (function () {
        var payJob = jobsById[paymentJobId];
        if (!payJob) return null;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1900, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: STEEL, borderRadius: 16, padding: 28, maxWidth: 340, width: "100%", border: "1px solid " + CHROME + "44" }}>
              <div style={{ fontSize: 13, color: CHROME, marginBottom: 4 }}>Collect Payment</div>
              {payJob.discount_amount > 0 && (
                <div style={{ fontSize: 13, color: CHROME, textDecoration: "line-through", marginBottom: 2 }}>
                  {"KSh " + (payJob.total_price || 0).toLocaleString()}
                </div>
              )}
              <div style={{ fontSize: 24, fontWeight: 900, color: PAPER, marginBottom: 20 }}>
                {"KSh " + payableAmount(payJob).toLocaleString()}
                {payJob.discount_amount > 0 && (
                  <span style={{ fontSize: 12, color: SIGNAL, fontWeight: 700, marginLeft: 8 }}>
                    (−KSh {payJob.discount_amount.toLocaleString()})
                  </span>
                )}
              </div>
              {(function () {
                var cust = payJob.customers || {};
                var balance = cust.wallet_balance || 0;
                var payable = payableAmount(payJob);
                var maxApplicable = Math.min(balance, payable);
                var remaining = payable - walletAmount;
                if (balance <= 0) return null;
                return (
                  <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: "1px solid " + SIGNAL + "55", background: "rgba(61,220,151,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: CHROME }}>Wallet balance</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: SIGNAL }}>KSh {balance.toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="number" min="0" max={maxApplicable} value={walletAmount || ""}
                        onChange={function (e) {
                          var v = parseInt(e.target.value, 10);
                          if (isNaN(v) || v < 0) v = 0;
                          if (v > maxApplicable) v = maxApplicable;
                          setWalletAmount(v);
                        }}
                        placeholder="0"
                        style={{ width: 90, background: "rgba(255,255,255,0.06)", color: PAPER, border: "1px solid " + SIGNAL + "55", borderRadius: 6, padding: "6px 8px", fontSize: 13 }} />
                      <span onClick={function () { setWalletAmount(maxApplicable); }} style={{ fontSize: 11, color: SIGNAL, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                        Use max (KSh {maxApplicable.toLocaleString()})
                      </span>
                    </div>
                    {walletAmount > 0 && (
                      <div style={{ fontSize: 11, color: CHROME, marginTop: 6 }}>
                        {remaining > 0 ? "KSh " + remaining.toLocaleString() + " remaining after wallet" : "Fully covered by wallet"}
                      </div>
                    )}
                  </div>
                );
              })()}
              {walletError && (
                <div style={{ fontSize: 12, color: ALERT, marginBottom: 12 }}>{walletError}</div>
              )}
              {walletAmount > 0 && walletAmount >= payableAmount(payJob) ? (
                <button onClick={function () { payWalletFull(payJob); }} disabled={busy} style={{
                  width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
                  background: SIGNAL, color: INK, fontWeight: 800, fontSize: 15, cursor: "pointer", marginBottom: 10,
                }}>
                  ✓ Complete with Wallet
                </button>
              ) : splitMode ? (function () {
                var enabled = (salon && salon.enabled_payment_methods) || ["Cash", "Till"];
                var methods = ["Cash"].concat(enabled.filter(function (m) { return m !== "Cash"; }));
                var remaining = payableAmount(payJob) - walletAmount;
                var amtA = parseInt(splitAmountA, 10) || 0;
                var amtB = parseInt(splitAmountB, 10) || 0;
                var sumMatches = amtA > 0 && amtB > 0 && (amtA + amtB) === remaining;
                var sameMethod = splitMethodA === splitMethodB;
                return (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: CHROME, marginBottom: 8 }}>
                      Split KSh {remaining.toLocaleString()} between two methods:
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <select value={splitMethodA} onChange={function (e) { setSplitMethodA(e.target.value); }}
                        style={{ flex: 1, background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 6, padding: "8px", fontSize: 13 }}>
                        {methods.map(function (m) { return <option key={m} value={m}>{m}</option>; })}
                      </select>
                      <input type="number" value={splitAmountA} onChange={function (e) { setSplitAmountA(e.target.value); }}
                        placeholder="0"
                        style={{ width: 90, background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 6, padding: "8px", fontSize: 13 }} />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <select value={splitMethodB} onChange={function (e) { setSplitMethodB(e.target.value); }}
                        style={{ flex: 1, background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 6, padding: "8px", fontSize: 13 }}>
                        {methods.map(function (m) { return <option key={m} value={m}>{m}</option>; })}
                      </select>
                      <input type="number" value={splitAmountB} onChange={function (e) { setSplitAmountB(e.target.value); }}
                        placeholder="0"
                        style={{ width: 90, background: "rgba(255,255,255,0.04)", color: PAPER, border: "1px solid rgba(143,166,184,0.3)", borderRadius: 6, padding: "8px", fontSize: 13 }} />
                    </div>
                    {sameMethod && (
                      <div style={{ fontSize: 11, color: ALERT, marginBottom: 8 }}>Pick two different methods.</div>
                    )}
                    {!sameMethod && (amtA > 0 || amtB > 0) && !sumMatches && (
                      <div style={{ fontSize: 11, color: ALERT, marginBottom: 8 }}>
                        Amounts must add up to exactly KSh {remaining.toLocaleString()}.
                      </div>
                    )}
                    <button onClick={function () {
                      paySplit(payJob, [{ method: splitMethodA, amount: amtA }, { method: splitMethodB, amount: amtB }]);
                    }} disabled={busy || sameMethod || !sumMatches} style={{
                      width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
                      background: SIGNAL, color: INK, fontWeight: 800, fontSize: 15, cursor: "pointer", marginBottom: 8,
                      opacity: (busy || sameMethod || !sumMatches) ? 0.5 : 1,
                    }}>
                      Confirm Split
                    </button>
                    <div onClick={function () { setSplitMode(false); setSplitAmountA(""); setSplitAmountB(""); }}
                      style={{ fontSize: 12, color: CHROME, textDecoration: "underline", cursor: "pointer", textAlign: "center", marginBottom: 10 }}>
                      Cancel split
                    </div>
                  </div>
                );
              })() : (function () {
                var enabled = (salon && salon.enabled_payment_methods) || ["Cash", "Till"];
                // Cash always available regardless of settings, matching
                // POS's own checkout convention (see POSApp.jsx) and this
                // page's pre-existing behavior before this change.
                var methods = ["Cash"].concat(enabled.filter(function (m) { return m !== "Cash"; }));
                var icons = { Cash: "💵", Till: "📲", Paybill: "🏦", "Send Money": "📱", Card: "💳" };
                var labels = { Cash: "Cash", Till: "M-Pesa (Till)", Paybill: "Paybill", "Send Money": "Send Money", Card: "Card" };
                return methods.map(function (m) {
                  var isPrimary = m === "Cash";
                  var onClick = m === "Cash" ? function () { payCash(payJob); }
                    : m === "Till" ? payTill
                    : function () { payManual(payJob, m); };
                  return (
                    <button key={m} onClick={onClick} disabled={busy} style={{
                      width: "100%", padding: isPrimary ? "14px 0" : "12px 0", borderRadius: 10,
                      border: isPrimary ? "none" : "1px solid " + SIGNAL,
                      background: isPrimary ? SIGNAL : "transparent",
                      color: isPrimary ? INK : SIGNAL,
                      fontWeight: 800, fontSize: isPrimary ? 15 : 14, cursor: "pointer", marginBottom: 10,
                    }}>
                      {icons[m] || "💳"} {labels[m] || m}{walletAmount > 0 ? " (KSh " + (payableAmount(payJob) - walletAmount).toLocaleString() + ")" : ""}
                    </button>
                  );
                });
              })()}
              {!(walletAmount > 0 && walletAmount >= payableAmount(payJob)) && !splitMode && (
                <div onClick={function () {
                  setSplitMode(true);
                  var remaining = payableAmount(payJob) - walletAmount;
                  setSplitAmountA(String(Math.ceil(remaining / 2)));
                  setSplitAmountB(String(Math.floor(remaining / 2)));
                }} style={{ fontSize: 12, color: CHROME, textDecoration: "underline", cursor: "pointer", textAlign: "center", marginBottom: 10 }}>
                  Split between two methods
                </div>
              )}
              {!(walletAmount > 0) && (
                <button onClick={function () { payLater(payJob); }} disabled={busy} style={{
                  width: "100%", padding: "10px 0", borderRadius: 10, border: "none",
                  background: "transparent", color: CHROME, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10,
                  textDecoration: "underline",
                }}>
                  Pay later
                </button>
              )}
              <button onClick={function () {
                setPaymentJobId(null); setWalletAmount(0); setWalletError("");
                setSplitMode(false); setSplitAmountA(""); setSplitAmountB("");
              }} style={{
                width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid " + CHROME + "55",
                background: "transparent", color: CHROME, fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}>
                Back
              </button>
            </div>
          </div>
        );
      })()}

      {paymentJobId && showMpesaModal && (function () {
        var payJob = jobsById[paymentJobId];
        if (!payJob) return null;
        return (
          <AutoMpesaPaymentModal
            salon={salon}
            job={Object.assign({}, payJob, {
              total_price: pendingSplitBreakdown
                ? (pendingSplitBreakdown.filter(function (b) { return b.method === "Till"; })[0] || {}).amount || 0
                : payableAmount(payJob) - walletAmount,
            })}
            onPaid={function (method) { handleMpesaPaid(payJob, method); }}
            onCancel={handleMpesaCancel}
          />
        );
      })()}

      {receiptJob && (
        <AutoReceipt
          salon={salon}
          job={receiptJob}
          jobServices={receiptServices}
          staffById={staffById}
          onClose={function () { setReceiptJob(null); setReceiptServices([]); }}
          onSendFeedback={function () {
            var customer = receiptJob.customers || {};
            if (!customer.phone) { alert("No phone number on file for this customer."); return; }
            sendFeedbackRequest(customer.phone, (customer.name || "").split(" ")[0], receiptJob.feedback_token);
            setFeedbackSentNotice(true);
            setTimeout(function () { setFeedbackSentNotice(false); }, 4000);
          }}
          onInPersonFeedback={function () { setShowInPersonFeedback(true); }}
        />
      )}

      {showInPersonFeedback && receiptJob && (
        <AutoFeedbackModal
          staffList={staff}
          onClose={function () { setShowInPersonFeedback(false); }}
          onSubmit={submitInPersonFeedback}
        />
      )}

      {feedbackSentNotice && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 2100,
          background: STEEL, border: "1.5px solid " + SIGNAL, borderRadius: 12, padding: "12px 20px",
          display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: PAPER,
        }}>
          <span style={{ fontSize: 16 }}>🚗</span> Feedback request sent!
        </div>
      )}
    </div>
  );
}
