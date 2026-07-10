// src/lib/ai/AutoLocalIntelligenceProvider.js
//
// Auto's own local intelligence provider -- NOT a reuse of
// LocalIntelligenceProvider.js. That provider's summarize* functions
// are hard-coded to sales-row shapes (row.total, row.payment,
// row.client_phone, row.items[].type/name/qty) that don't exist on an
// auto_jobs row at all. More importantly, its classifier explicitly
// treats "staff", "commission", "stock", "rating" as UNSUPPORTED
// keywords -- exactly the questions most relevant to a car wash
// business (who's earning the most commission, what's low on stock).
// Reusing it as-is would silently reject the most useful Auto
// questions rather than answer them.
//
// Deliberately local-only, not wired to Gemini -- CLASSIFIER_PROVIDER
// already falls back to local for any reason (unconfigured, network
// error, timeout), so shipping Auto with local-only classification is
// a safe, complete MVP rather than a shortcut. Gemini wiring can be
// added later without changing this file's interface.

export function summarizeRevenue(jobRows, options) {
  options = options || {};
  var rows = jobRows || [];

  var totalRevenue = 0;
  var byPaymentMethod = {};

  rows.forEach(function (row) {
    var amount = Number(row.total_price || 0);
    totalRevenue += amount;

    var method = row.payment_status === "paid" ? (row.payment_method || "Unknown") : "Unpaid";
    if (!byPaymentMethod[method]) {
      byPaymentMethod[method] = { method: method, total: 0, count: 0 };
    }
    byPaymentMethod[method].total += amount;
    byPaymentMethod[method].count += 1;
  });

  var jobCount = rows.length;
  var avgTicket = jobCount > 0 ? totalRevenue / jobCount : 0;

  var byPaymentMethodList = Object.keys(byPaymentMethod)
    .map(function (key) { return byPaymentMethod[key]; })
    .sort(function (a, b) { return b.total - a.total; });

  return {
    provider: "auto-local",
    dateFrom: options.dateFrom || null,
    dateTo: options.dateTo || null,
    totalRevenue: totalRevenue,
    jobCount: jobCount,
    avgTicket: avgTicket,
    byPaymentMethod: byPaymentMethodList,
  };
}

export function summarizeCustomers(jobRows, newCustomerRows, options) {
  options = options || {};
  var jobs = jobRows || [];
  var newCustomers = newCustomerRows || [];

  var seenVisitors = {};
  jobs.forEach(function (row) {
    if (row.customer_id) seenVisitors[row.customer_id] = true;
  });

  return {
    provider: "auto-local",
    dateFrom: options.dateFrom || null,
    dateTo: options.dateTo || null,
    visitorCount: Object.keys(seenVisitors).length,
    newCustomerCount: newCustomers.length,
  };
}

export function summarizeTopServices(jobServiceRows, options) {
  options = options || {};
  var rows = jobServiceRows || [];
  var limit = options.limit || 5;

  var counts = {};
  rows.forEach(function (row) {
    var name = (row.auto_services && row.auto_services.name) || null;
    if (!name) return;
    if (!counts[name]) counts[name] = { name: name, qty: 0, revenue: 0 };
    counts[name].qty += 1;
    counts[name].revenue += Number(row.price || 0);
  });

  var items = Object.keys(counts)
    .map(function (key) { return counts[key]; })
    .sort(function (a, b) { return b.qty - a.qty; })
    .slice(0, limit);

  return {
    provider: "auto-local",
    dateFrom: options.dateFrom || null,
    dateTo: options.dateTo || null,
    items: items,
  };
}

// No equivalent in POS's AIService -- staff/commission questions were
// explicitly unsupported there. Legitimate and valuable for Auto.
export function summarizeCommission(jobRows, staffById, options) {
  options = options || {};
  var rows = jobRows || [];

  var totalCommission = 0;
  var byStaff = {};

  rows.forEach(function (row) {
    var amount = Number(row.commission || 0);
    totalCommission += amount;
    var staffMember = staffById[row.assigned_staff_id];
    var name = staffMember ? staffMember.name : "Unassigned";
    if (!byStaff[name]) byStaff[name] = { name: name, commission: 0, count: 0 };
    byStaff[name].commission += amount;
    byStaff[name].count += 1;
  });

  var staffList = Object.keys(byStaff)
    .map(function (key) { return byStaff[key]; })
    .sort(function (a, b) { return b.commission - a.commission; });

  return {
    provider: "auto-local",
    dateFrom: options.dateFrom || null,
    dateTo: options.dateTo || null,
    totalCommission: totalCommission,
    byStaff: staffList,
  };
}

// Classification vocabulary genuinely different from POS's -- these
// are the questions a car wash admin actually asks, not a copy-paste
// of the salon list with "product" swapped for "service".
var TOP_SERVICES_KEYWORDS = [
  "service", "best seller", "bestseller", "best-selling", "best selling",
  "most washed", "popular", "which service", "top service",
];
var COMMISSION_KEYWORDS = [
  "commission", "staff", "who earned", "who washed", "top earner", "payroll",
];
var CUSTOMER_KEYWORDS = [
  "customer", "client", "visitor", "visited", "returning",
];
var UNSUPPORTED_KEYWORDS = [
  "booking", "appointment", "schedule", "calendar",
  "review", "rating", "feedback",
  "expense", "expenses",
];

function matchesAny(q, keywords) {
  return keywords.some(function (kw) { return q.indexOf(kw) !== -1; });
}

export function classifyQuestion(question) {
  var q = (question || "").toLowerCase();

  var capability;
  if (matchesAny(q, COMMISSION_KEYWORDS)) capability = "commission";
  else if (matchesAny(q, TOP_SERVICES_KEYWORDS)) capability = "topServices";
  else if (matchesAny(q, UNSUPPORTED_KEYWORDS)) capability = "unsupported";
  else if (matchesAny(q, CUSTOMER_KEYWORDS)) capability = "customers";
  else capability = "revenue";

  var range = "today";
  if (q.indexOf("week") !== -1) range = "week";
  else if (q.indexOf("month") !== -1) range = "month";
  else if (q.indexOf("yesterday") !== -1) range = "yesterday";

  return { capability: capability, range: range };
}

export default {
  name: "auto-local",
  summarizeRevenue: summarizeRevenue,
  summarizeCustomers: summarizeCustomers,
  summarizeTopServices: summarizeTopServices,
  summarizeCommission: summarizeCommission,
  classifyQuestion: classifyQuestion,
};
