// src/pages/pet/reportData.js
//
// Pure calculations for Reports (no network, no React). Reports reads existing Pet
// tables only (payments, invoices, invoice lines, bookings, stays, kennels); there is
// no reporting migration. Money is whole KES, exactly as stored.
//
// Meaning of the numbers (the screen repeats these in plain words):
//   Collected   = payments received (paid_at) in the period, by day and method.
//   Invoiced    = total of invoices ISSUED in the period, excluding void ones.
//   Outstanding = what open (unpaid / part-paid) invoices still owe, whatever their
//                 date, because an old unpaid invoice is still money owed.
// Collected and Invoiced differ on purpose: a payment can arrive in a later period.
//
// Days are local calendar days. Kenya has no daylight saving, so a timestamp maps to
// one stable day.
import { METHODS, METHOD_LABELS, outstanding, isOverdue } from "./invoiceData";
import { STATUSES as BOOKING_STATUSES } from "./bookingData";
import { dateKey, addDaysKey, daysBetween, occupiesDay } from "./boardingData";

export var PRESETS = [
  ["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["month", "This month"], ["lastmonth", "Last month"], ["custom", "Custom"],
];
export var MAX_RANGE_DAYS = 366;

function monthStartKey(d) { return dateKey(new Date(d.getFullYear(), d.getMonth(), 1)); }
function nextMonthStartKey(d) { return dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)); }
function prevMonthStartKey(d) { return dateKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
function keyToLocalDate(key) { var p = key.split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }

// Bounds are [fromKey, toKey): toKey is the first day AFTER the period.
export function periodBounds(preset, now, custom) {
  now = now || new Date();
  var today = dateKey(now);
  var tomorrow = addDaysKey(today, 1);
  var fromKey; var toKey;
  if (preset === "today") { fromKey = today; toKey = tomorrow; }
  else if (preset === "7d") { fromKey = addDaysKey(today, -6); toKey = tomorrow; }
  else if (preset === "30d") { fromKey = addDaysKey(today, -29); toKey = tomorrow; }
  else if (preset === "month") { fromKey = monthStartKey(now); toKey = tomorrow; }
  else if (preset === "lastmonth") { fromKey = prevMonthStartKey(now); toKey = monthStartKey(now); }
  else if (preset === "custom" && custom && custom.from && custom.to) { fromKey = custom.from; toKey = addDaysKey(custom.to, 1); }
  else { fromKey = today; toKey = tomorrow; }
  return {
    fromKey: fromKey, toKey: toKey, days: daysBetween(fromKey, toKey),
    fromIso: keyToLocalDate(fromKey).toISOString(), toIso: keyToLocalDate(toKey).toISOString(),
  };
}

export function validateCustomRange(from, to) {
  if (!from || !to) return "Choose both dates.";
  if (to < from) return "The end date can't be before the start date.";
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) return "Choose a period of at most " + MAX_RANGE_DAYS + " days.";
  return "";
}

function sum(list, pick) { return (list || []).reduce(function (n, x) { return n + (Number(pick(x)) || 0); }, 0); }

// ---- money ----
export function collectedTotal(payments) { return sum(payments, function (p) { return p.amount; }); }

// Money paid back to customers in the period (pet_refunds, by refunded_at). Collected stays the gross
// payments received; Net = Collected - Refunded can be negative on a day or period with big refunds.
export function refundedTotal(refunds) { return sum(refunds, function (r) { return r.amount; }); }
export function netCollected(payments, refunds) { return collectedTotal(payments) - refundedTotal(refunds); }

export function revenueByDay(payments, fromKey, toKey) {
  var totals = {};
  (payments || []).forEach(function (p) {
    var k = dateKey(new Date(p.paid_at));
    totals[k] = (totals[k] || 0) + (Number(p.amount) || 0);
  });
  var out = [];
  for (var k = fromKey; k < toKey; k = addDaysKey(k, 1)) {
    out.push({ key: k, label: Number(k.slice(8)) + "/" + Number(k.slice(5, 7)), total: totals[k] || 0 });
  }
  return out;
}

export function collectedByMethod(payments) {
  var rows = METHODS.map(function (m) { return { method: m, label: METHOD_LABELS[m], total: 0, count: 0 }; });
  var byKey = {}; rows.forEach(function (r) { byKey[r.method] = r; });
  (payments || []).forEach(function (p) {
    var r = byKey[p.method];
    if (!r) { r = { method: p.method, label: String(p.method), total: 0, count: 0 }; byKey[p.method] = r; rows.push(r); }
    r.total += Number(p.amount) || 0; r.count += 1;
  });
  var all = sum(rows, function (r) { return r.total; });
  return rows.map(function (r) { return Object.assign({}, r, { share: all > 0 ? Math.round((r.total / all) * 100) : 0 }); })
    .filter(function (r) { return r.total > 0 || METHODS.indexOf(r.method) !== -1; });
}

export function invoiceTotals(invoices) {
  // A fully refunded invoice is not a sale that stood, so it is left out of "invoiced" like a void one.
  var live = (invoices || []).filter(function (i) { return i.status !== "void" && i.status !== "refunded"; });
  var invoiced = sum(live, function (i) { return i.total; });
  return {
    count: live.length, voidCount: (invoices || []).filter(function (i) { return i.status === "void"; }).length,
    refundedCount: (invoices || []).filter(function (i) { return i.status === "refunded"; }).length, invoiced: invoiced,
    discounts: sum(live, function (i) { return i.discount_amount; }), tax: sum(live, function (i) { return i.tax_amount; }),
    average: live.length ? Math.round(invoiced / live.length) : 0,
  };
}

// Open (unpaid / part-paid) invoices, worst first: overdue, then oldest due date, then no due date.
export function openInvoiceSummary(open, now) {
  var list = (open || []).filter(function (i) { return outstanding(i) > 0; });
  var owed = sum(list, function (i) { return outstanding(i); });
  var overdueList = list.filter(function (i) { return isOverdue(i, now); });
  var sorted = list.slice().sort(function (a, b) {
    var ao = isOverdue(a, now) ? 0 : 1; var bo = isOverdue(b, now) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    var ad = a.due_date || "9999-12-31"; var bd = b.due_date || "9999-12-31";
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });
  return { count: list.length, owed: owed, overdueCount: overdueList.length, overdueOwed: sum(overdueList, function (i) { return outstanding(i); }), list: sorted };
}

// Revenue by service, from invoice lines of invoices in the period (void and fully refunded invoices excluded).
export function topServices(lines, invoicesById, limit) {
  var groups = {};
  (lines || []).forEach(function (l) {
    var inv = invoicesById[l.invoice_id];
    if (!inv || inv.status === "void" || inv.status === "refunded") return;
    var key = l.service_id || l.description;
    var g = groups[key] || (groups[key] = { key: key, name: l.description, quantity: 0, revenue: 0 });
    g.quantity += Number(l.quantity) || 0; g.revenue += Number(l.line_total) || 0;
  });
  return Object.keys(groups).map(function (k) { return groups[k]; })
    .sort(function (a, b) { return b.revenue - a.revenue || (a.name < b.name ? -1 : 1); }).slice(0, limit || 8);
}

// ---- bookings ----
export function bookingStats(bookings, staffNames) {
  var byStatus = {};
  BOOKING_STATUSES.forEach(function (s) { byStatus[s] = 0; });
  var byStaff = {};
  (bookings || []).forEach(function (b) {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    if (b.status === "cancelled" || b.status === "no-show") return;
    var name = b.staff_id ? ((staffNames && staffNames[b.staff_id]) || "Former staff") : "Unassigned";
    byStaff[name] = (byStaff[name] || 0) + 1;
  });
  var total = (bookings || []).length;
  var lost = (byStatus.cancelled || 0) + (byStatus["no-show"] || 0);
  return {
    total: total, byStatus: byStatus, lost: lost, lostRate: total ? Math.round((lost / total) * 100) : 0,
    byStaff: Object.keys(byStaff).map(function (n) { return { name: n, count: byStaff[n] }; }).sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); }),
  };
}

// ---- boarding ----
// Kennel-days used in the period / (kennels x days). Cancelled stays are ignored. Kennel
// maintenance is only known as of today, so every kennel counts toward capacity.
export function boardingStats(stays, kennels, fromKey, toKey) {
  var days = daysBetween(fromKey, toKey);
  var used = 0; var staysTouching = 0;
  (stays || []).forEach(function (s) {
    if (s.status === "cancelled") return;
    var hit = 0;
    for (var k = fromKey; k < toKey; k = addDaysKey(k, 1)) if (occupiesDay(s, k)) hit += 1;
    if (hit > 0) { used += hit; staysTouching += 1; }
  });
  var capacity = (kennels || []).length * days;
  return { kennelDays: used, stays: staysTouching, capacity: capacity, occupancyPct: capacity > 0 ? Math.round((used / capacity) * 100) : 0 };
}

export function hasAnyData(d) {
  return d.payments.length + d.invoices.length + d.bookings.length + d.stays.length > 0;
}
