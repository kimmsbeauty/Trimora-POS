// src/pages/pet/loyaltyData.js
//
// Pure helpers for the Loyalty Programme (no network, no React). The database
// (migration 101) is the authority: points are awarded by triggers when an invoice is
// paid or a booking is completed, balances change only through database functions, and
// the ledger is append-only. The checks here only give faster, friendlier feedback.

export var TIERS = ["Bronze", "Silver", "Gold"];
export var TIER_TONES = { Bronze: "neutral", Silver: "info", Gold: "warning" };
// Same defaults the database uses before an owner saves anything. The programme starts OFF.
export var DEFAULT_SETTINGS = { enabled: false, kes_per_point: 100, visit_bonus: 0, silver_at: 500, gold_at: 2000 };

export var REASON_LABELS = {
  earn_invoice: "Paid invoice", visit_bonus: "Visit bonus", redeem: "Reward redeemed",
  redeem_refund: "Reward cancelled (points refunded)", adjustment: "Manual adjustment",
};
export var VOUCHER_LABELS = { issued: "Ready to use", used: "Used", cancelled: "Cancelled" };
export var VOUCHER_TONES = { issued: "warning", used: "success", cancelled: "neutral" };

export function withDefaults(row) { return Object.assign({}, DEFAULT_SETTINGS, row || {}); }

// Tier comes from LIFETIME points earned, so spending points never lowers it.
export function tierFor(lifetimeEarned, settings) {
  var s = withDefaults(settings); var n = Number(lifetimeEarned) || 0;
  if (n >= s.gold_at) return "Gold";
  if (n >= s.silver_at) return "Silver";
  return "Bronze";
}
// { next, pointsNeeded, pct } toward the next tier, or null at the top.
export function tierProgress(lifetimeEarned, settings) {
  var s = withDefaults(settings); var n = Number(lifetimeEarned) || 0;
  if (n >= s.gold_at) return null;
  var from = n >= s.silver_at ? s.silver_at : 0;
  var to = n >= s.silver_at ? s.gold_at : s.silver_at;
  return { next: n >= s.silver_at ? "Gold" : "Silver", pointsNeeded: to - n, pct: Math.max(0, Math.min(100, Math.round(((n - from) / (to - from)) * 100))) };
}
// Points a paid amount earns (what the database trigger awards).
export function pointsFor(amount, settings) {
  var s = withDefaults(settings);
  return Math.max(0, Math.floor((Number(amount) || 0) / s.kes_per_point));
}

function int(v) { var t = String(v === undefined || v === null ? "" : v).trim(); return /^-?\d+$/.test(t) ? Number(t) : NaN; }
export function parseInts(draft) {
  return { enabled: !!draft.enabled, kes_per_point: int(draft.kes_per_point), visit_bonus: int(draft.visit_bonus), silver_at: int(draft.silver_at), gold_at: int(draft.gold_at) };
}
export function validateSettings(draft) {
  var s = parseInts(draft);
  if (!(s.kes_per_point >= 1 && s.kes_per_point <= 100000)) return "Spend per point must be a whole number from 1 to 100,000.";
  if (!(s.visit_bonus >= 0 && s.visit_bonus <= 100000)) return "Visit bonus must be a whole number from 0 to 100,000.";
  if (!(s.silver_at >= 0 && s.silver_at <= 100000000)) return "Silver threshold must be a whole number of points, 0 or more.";
  if (!(s.gold_at >= 1 && s.gold_at <= 100000000)) return "Gold threshold must be a whole number of points, 1 or more.";
  if (s.gold_at <= s.silver_at) return "The Gold threshold must be higher than Silver.";
  return "";
}

export function validateReward(draft) {
  var name = String(draft.name || "").trim(); var cost = int(draft.points_cost);
  if (!name) return "Reward name is required.";
  if (name.length > 80) return "Reward name must be 80 characters or fewer.";
  if (!(cost >= 1 && cost <= 10000000)) return "Points cost must be a whole number of at least 1.";
  return "";
}
export function isDuplicateReward(rewards, name, ignoreId) {
  var key = String(name || "").trim().toLowerCase();
  return (rewards || []).some(function (r) { return r.id !== ignoreId && String(r.name).trim().toLowerCase() === key; });
}
export function validateAdjustment(points, note, balance) {
  var n = int(points);
  if (!Number.isFinite(n) || n === 0) return "Enter a whole number of points, other than 0.";
  if (Math.abs(n) > 1000000) return "That is too many points for one adjustment.";
  if (!String(note || "").trim()) return "Add a note saying why.";
  if (balance !== undefined && n < 0 && balance + n < 0) return "That would take the balance below zero.";
  return "";
}

export function accountOf(accounts, customerId) {
  return (accounts || []).filter(function (a) { return a.customer_id === customerId; })[0] || null;
}
// Members = customers with an account, richest balance first; optional name/phone search.
export function memberRows(customers, accounts, settings, query) {
  var q = String(query || "").trim().toLowerCase();
  var byId = {}; (customers || []).forEach(function (c) { byId[c.id] = c; });
  return (accounts || []).map(function (a) {
    var c = byId[a.customer_id] || { id: a.customer_id, name: "Unknown customer", phone: "" };
    return { customer: c, account: a, tier: tierFor(a.lifetime_earned, settings) };
  }).filter(function (m) {
    return !q || String(m.customer.name).toLowerCase().indexOf(q) !== -1 || String(m.customer.phone || "").replace(/\s/g, "").indexOf(q.replace(/\s/g, "")) !== -1;
  }).sort(function (a, b) { return b.account.points_balance - a.account.points_balance || (a.customer.name < b.customer.name ? -1 : 1); });
}
export function summary(accounts, redemptions) {
  var sum = function (list, k) { return (list || []).reduce(function (n, x) { return n + (Number(x[k]) || 0); }, 0); };
  return {
    members: (accounts || []).length, outstanding: sum(accounts, "points_balance"), earned: sum(accounts, "lifetime_earned"),
    redeemed: sum(accounts, "lifetime_redeemed"), vouchersReady: (redemptions || []).filter(function (r) { return r.status === "issued"; }).length,
  };
}

var ERROR_TEXT = {
  NOT_AUTHENTICATED: "Please sign in again.",
  INVALID_SETTINGS: "Those settings aren't valid. Check the numbers and that Gold is above Silver.",
  INVALID_ADJUSTMENT: "Enter a whole number of points, other than 0.",
  NOTE_REQUIRED: "Add a note saying why.",
  CUSTOMER_NOT_FOUND: "That customer could not be found.",
  PROGRAM_DISABLED: "The loyalty programme is switched off. Turn it on under Rules first.",
  REWARD_NOT_FOUND: "That reward is no longer available.",
  INSUFFICIENT_POINTS: "Not enough points for that.",
  POINTS_TOO_LARGE: "That would make the balance too large.",
  REDEMPTION_NOT_FOUND: "That voucher could not be found. Refresh and try again.",
  INVALID_STATUS_CHANGE: "That voucher has already been used or cancelled.",
};
export function loyaltyErrorMessage(raw) {
  var text = String(raw || ""); var codes = Object.keys(ERROR_TEXT);
  for (var i = 0; i < codes.length; i++) if (text.indexOf(codes[i]) !== -1) return ERROR_TEXT[codes[i]];
  if (text === "Network error") return "Couldn't reach the server. Check your connection and try again.";
  return "Couldn't save that. Check your connection and try again.";
}
