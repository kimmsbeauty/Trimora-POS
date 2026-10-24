// src/pages/pet/boardingData.js
//
// Pure helpers for Boarding (no network, no React). The database (migration 089)
// is the authority on conflicts, ownership and the allowed status moves; the checks
// here only give faster, friendlier feedback.
//
// Dates are plain "YYYY-MM-DD" strings (business dates), never timestamps, so there
// is no timezone drift. A stay occupies the nights [check_in_on, check_out_on): a
// new stay may check in on the day another checks out. A same-day stay (day care)
// occupies that one day. Same rule as the database's exclusion constraints.

export var KENNEL_STATUSES = ["occupied", "reserved", "available", "maintenance"];
export var KENNEL_LABELS = { occupied: "Occupied", reserved: "Reserved", available: "Available", maintenance: "Maintenance" };
export var KENNEL_TONES = { occupied: "info", reserved: "warning", available: "success", maintenance: "neutral" };

export var STAY_LABELS = { reserved: "Reserved", occupied: "Checked in", "checked-out": "Checked out", cancelled: "Cancelled" };
export var STAY_TONES = { reserved: "warning", occupied: "info", "checked-out": "success", cancelled: "neutral" };
// Same moves the database allows (089_pet_boarding.sql).
export var NEXT_STAY = { reserved: ["occupied", "cancelled"], occupied: ["checked-out"], "checked-out": [], cancelled: [] };
export var EDITABLE = ["reserved", "occupied"];

// A kennel shows "reserved" when a reserved stay arrives today or tomorrow (or is overdue).
export var RESERVED_WINDOW_DAYS = 1;
export var MAX_STAY_DAYS = 365;

export function isActive(stay) { return stay.status === "reserved" || stay.status === "occupied"; }

function pad(n) { return n < 10 ? "0" + n : "" + n; }
export function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
export function todayKey(now) { return dateKey(now || new Date()); }
function parseKey(key) { var p = String(key).split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
export function addDaysKey(key, n) { var d = parseKey(key); return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }
export function daysBetween(fromKey, toKey) {
  var a = parseKey(fromKey); var b = parseKey(toKey);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
export function formatDay(key) {
  if (!key) return "";
  return parseKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function nightsOf(stay) { return Math.max(0, daysBetween(stay.check_in_on, stay.check_out_on)); }
export function stayLengthLabel(stay) {
  var n = nightsOf(stay);
  return n === 0 ? "Day stay" : n + (n === 1 ? " night" : " nights");
}
// Rough cost for display only (invoicing is a later phase): nightly rate x nights, a day stay counts once.
export function estimatedCost(stay) {
  if (stay.nightly_rate === null || stay.nightly_rate === undefined) return null;
  return Number(stay.nightly_rate) * Math.max(1, nightsOf(stay));
}

// First day AFTER the last occupied day, as the database computes the range.
function rangeEnd(inKey, outKey) { return outKey === inKey ? addDaysKey(inKey, 1) : outKey; }
export function rangesOverlap(aIn, aOut, bIn, bOut) {
  return aIn < rangeEnd(bIn, bOut) && bIn < rangeEnd(aIn, aOut);
}
export function occupiesDay(stay, key) {
  return key >= stay.check_in_on && key < rangeEnd(stay.check_in_on, stay.check_out_on);
}

export function currentStay(kennelId, stays) {
  return (stays || []).filter(function (s) { return s.kennel_id === kennelId && s.status === "occupied"; })[0] || null;
}
export function nextReservation(kennelId, stays, today) {
  var list = (stays || []).filter(function (s) { return s.kennel_id === kennelId && s.status === "reserved" && s.check_out_on >= today; });
  list.sort(function (a, b) { return a.check_in_on < b.check_in_on ? -1 : a.check_in_on > b.check_in_on ? 1 : 0; });
  return list[0] || null;
}

// occupied / reserved / available are DERIVED from the stays; only maintenance is stored.
export function kennelStatus(kennel, stays, today) {
  if (kennel.maintenance) return "maintenance";
  if (currentStay(kennel.id, stays)) return "occupied";
  var next = nextReservation(kennel.id, stays, today);
  if (next && next.check_in_on <= addDaysKey(today, RESERVED_WINDOW_DAYS)) return "reserved";
  return "available";
}

export function kennelCounts(kennels, stays, today) {
  var out = { occupied: 0, reserved: 0, available: 0, maintenance: 0 };
  (kennels || []).forEach(function (k) { out[kennelStatus(k, stays, today)] += 1; });
  return out;
}

export function upcomingArrivals(stays, today) {
  return (stays || []).filter(function (s) { return s.status === "reserved" && s.check_out_on >= today; })
    .sort(function (a, b) { return a.check_in_on < b.check_in_on ? -1 : a.check_in_on > b.check_in_on ? 1 : 0; });
}

export function timelineDays(startKey, count) {
  var out = [];
  for (var i = 0; i < (count || 14); i++) out.push(addDaysKey(startKey, i));
  return out;
}
// The active stay occupying a kennel on a day, or null.
export function timelineCell(kennelId, stays, key) {
  return (stays || []).filter(function (s) { return s.kennel_id === kennelId && isActive(s) && occupiesDay(s, key); })[0] || null;
}

// Advisory clash check (the database decides). Returns "kennel", "pet" or null.
export function findStayConflict(stays, candidate, ignoreId) {
  var list = (stays || []).filter(function (s) { return isActive(s) && s.id !== ignoreId; });
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (!rangesOverlap(candidate.check_in_on, candidate.check_out_on, s.check_in_on, s.check_out_on)) continue;
    if (candidate.kennel_id && s.kennel_id === candidate.kennel_id) return "kennel";
    if (candidate.pet_id && s.pet_id === candidate.pet_id) return "pet";
  }
  return null;
}

export function validateStay(draft) {
  if (!draft.customer_id) return "Choose a customer.";
  if (!draft.pet_id) return "Choose a pet.";
  if (!draft.kennel_id) return "Choose a kennel.";
  if (!draft.check_in_on) return "Choose a check-in date.";
  if (!draft.check_out_on) return "Choose a check-out date.";
  if (draft.check_out_on < draft.check_in_on) return "Check-out can't be before check-in.";
  if (daysBetween(draft.check_in_on, draft.check_out_on) > MAX_STAY_DAYS) return "A stay can be at most " + MAX_STAY_DAYS + " days.";
  return "";
}

export function validateKennel(draft) {
  var name = String(draft.name || "").trim();
  if (!name) return "Kennel name is required.";
  if (name.length > 60) return "Kennel name must be 60 characters or fewer.";
  if (String(draft.kind || "").trim().length > 40) return "Kennel type must be 40 characters or fewer.";
  return "";
}
export function isDuplicateKennel(kennels, name, ignoreId) {
  var key = String(name || "").trim().toLowerCase();
  return (kennels || []).some(function (k) { return k.id !== ignoreId && String(k.name).trim().toLowerCase() === key; });
}

var ERROR_TEXT = {
  NOT_AUTHENTICATED: "Please sign in again.",
  KENNEL_NAME_REQUIRED: "Kennel name is required (60 characters or fewer).",
  KENNEL_NAME_TAKEN: "You already have a kennel with that name.",
  KENNEL_NOT_FOUND: "That kennel could not be found. Refresh and try again.",
  KENNEL_OCCUPIED: "A pet is checked in to that kennel. Check them out first.",
  KENNEL_HAS_STAYS: "This kennel has stay history, so it can't be deleted. Put it in maintenance instead.",
  KENNEL_MAINTENANCE: "That kennel is in maintenance.",
  INVALID_DATES: "Check-out can't be before check-in, and a stay can be at most 365 days.",
  CUSTOMER_NOT_FOUND: "That customer could not be found.",
  PET_NOT_FOUND: "That pet doesn't belong to the chosen customer.",
  SERVICE_NOT_FOUND: "That boarding service is no longer available.",
  STAY_CONFLICT_KENNEL: "That kennel is already taken for some of those dates.",
  STAY_CONFLICT_PET: "This pet already has a stay on some of those dates.",
  STAY_NOT_FOUND: "That stay could not be found. Refresh and try again.",
  STAY_NOT_EDITABLE: "This stay can no longer be changed.",
  STAY_CHECKIN_LOCKED: "The check-in date can't change after the pet has checked in.",
  INVALID_STATUS_CHANGE: "That change isn't allowed for this stay.",
};
// Turns the message returned by the database function into friendly wording.
export function boardingErrorMessage(raw) {
  var text = String(raw || "");
  var codes = Object.keys(ERROR_TEXT);
  for (var i = 0; i < codes.length; i++) if (text.indexOf(codes[i]) !== -1) return ERROR_TEXT[codes[i]];
  if (text === "Network error") return "Couldn't reach the server. Check your connection and try again.";
  return "Couldn't save that. Check your connection and try again.";
}
