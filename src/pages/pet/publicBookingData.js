// src/pages/pet/publicBookingData.js
//
// Pure logic for online booking requests (migration 108): the public page, the staff
// inbox and the settings card. Times are shown in the BUSINESS's time zone, not the
// visitor's, because the opening hours are the business's.
import { normalizePhone } from "./reminderData";

export var SPECIES = ["Dog", "Cat", "Rabbit", "Other"];
export var WEEKDAYS = [
  { n: 1, short: "Mon", long: "Monday" }, { n: 2, short: "Tue", long: "Tuesday" }, { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" }, { n: 5, short: "Fri", long: "Friday" }, { n: 6, short: "Sat", long: "Saturday" },
  { n: 0, short: "Sun", long: "Sunday" },
];
export var SLOT_CHOICES = [15, 30, 45, 60, 90, 120];

var PUBLIC_ERRORS = {
  NOT_AVAILABLE: "Online booking isn't available right now. Please contact us directly.",
  CONSENT_REQUIRED: "Please tick the box to let us contact you about this request.",
  INVALID_NAME: "Please enter your name (2 to 80 characters).",
  INVALID_PHONE: "Please enter a valid phone number, for example 0712 345 678.",
  INVALID_PET: "Please enter your pet's name.",
  INVALID_SPECIES: "Please choose your pet's type.",
  INVALID_BREED: "The breed is too long (60 characters at most).",
  NOTES_TOO_LONG: "Your note is too long (300 characters at most).",
  INVALID_SERVICES: "Please choose at least one service. Some services can't be booked online.",
  INVALID_DATE: "Please choose a valid date.",
  TOO_SOON: "That time is too soon. Please choose a later time.",
  TOO_FAR: "That date is too far ahead. Please choose an earlier date.",
  CLOSED: "We're closed on that day. Please choose another date.",
  OUTSIDE_HOURS: "That time is outside our opening hours.",
  NOT_A_SLOT: "That isn't an available start time. Please pick one from the list.",
  SLOT_FULL: "Sorry, that time has just been taken. Please pick another.",
  TOO_MANY_REQUESTS: "You've sent several requests already. Please call us to arrange a booking.",
  TRY_AGAIN: "Something went wrong. Please try again.",
};
export function publicErrorMessage(code) {
  return PUBLIC_ERRORS[code] || "Something went wrong. Please try again.";
}
// Errors that mean the chosen time is no longer valid, so the slot list should be refreshed.
export function isSlotError(code) {
  return ["SLOT_FULL", "NOT_A_SLOT", "TOO_SOON", "TOO_FAR", "CLOSED", "OUTSIDE_HOURS"].indexOf(code) !== -1;
}

var STAFF_ERRORS = {
  NOT_AUTHENTICATED: "Your session has ended. Please sign in again.",
  REQUEST_NOT_FOUND: "That request no longer exists. Refresh the list.",
  REQUEST_NOT_NEW: "That request has already been handled.",
  START_IN_PAST: "The requested time has already passed. Choose a new time and try again.",
  PET_ARCHIVED: "This customer's pet is archived. Restore it on the Pets page first, then accept.",
  BOOKING_CONFLICT_STAFF: "That groomer already has a booking at that time. Choose another time or groomer.",
  BOOKING_CONFLICT_PET: "This pet already has a booking at that time. Choose another time.",
  SERVICE_NOT_FOUND: "One of the requested services is no longer available.",
  STAFF_NOT_FOUND: "That staff member could not be found.",
  INVALID_TIMEZONE: "That time zone isn't recognised. Use a name like Africa/Nairobi.",
  INVALID_HOURS: "The opening hours aren't valid: each open day needs a closing time after its opening time.",
  HOURS_REQUIRED: "Choose at least one open day before turning online booking on.",
  INVALID_SETTINGS: "One of the settings is out of range. Check the numbers and try again.",
};
export function staffRequestErrorMessage(raw) {
  var s = String(raw || "");
  var codes = Object.keys(STAFF_ERRORS);
  for (var i = 0; i < codes.length; i++) { if (s.indexOf(codes[i]) !== -1) return STAFF_ERRORS[codes[i]]; }
  return "Couldn't complete that. Check your connection and try again.";
}

// ---- the request form ------------------------------------------------------------------

// Returns "" when fine, otherwise the first problem in plain words (the server checks again).
export function validateRequestForm(f) {
  if (!f.serviceIds || f.serviceIds.length === 0) return "Choose at least one service.";
  if (!f.start) return "Choose a date and a time.";
  var name = String(f.name || "").trim();
  if (name.length < 2 || name.length > 80) return "Please enter your name.";
  if (!normalizePhone(f.phone)) return "Please enter a valid phone number, for example 0712 345 678.";
  var pet = String(f.pet || "").trim();
  if (pet.length < 1 || pet.length > 60) return "Please enter your pet's name.";
  if (SPECIES.indexOf(f.species) === -1) return "Please choose your pet's type.";
  if (String(f.breed || "").trim().length > 60) return "The breed is too long.";
  if (String(f.notes || "").trim().length > 300) return "Your note is too long (300 characters at most).";
  if (!f.consent) return "Please tick the box to let us contact you about this request.";
  return "";
}

export function selectedTotals(services, ids) {
  var minutes = 0; var price = 0;
  (services || []).forEach(function (s) { if (ids.indexOf(s.id) !== -1) { minutes += s.duration_minutes || 0; price += s.price || 0; } });
  return { minutes: minutes, price: price };
}
export function groupByCategory(services) {
  var order = ["Grooming", "Add-on"]; var out = [];
  order.forEach(function (c) {
    var list = (services || []).filter(function (s) { return s.category === c; });
    if (list.length) out.push({ category: c, services: list });
  });
  return out;
}
export function durationLabel(mins) {
  if (!mins) return "";
  var h = Math.floor(mins / 60); var m = mins % 60;
  return (h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : "");
}

// ---- time zones --------------------------------------------------------------------------

// Today's date (YYYY-MM-DD) in the given zone.
export function dateInZone(now, tz) {
  try {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    var g = {}; parts.forEach(function (p) { g[p.type] = p.value; });
    return g.year + "-" + g.month + "-" + g.day;
  } catch (e) {
    return now.toISOString().slice(0, 10);
  }
}
export function addDays(isoDate, n) {
  var p = isoDate.split("-");
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
export function slotTime(iso, tz) {
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)); }
  catch (e) { return ""; }
}
export function slotDateTime(iso, tz) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  } catch (e) { return ""; }
}

// "Mon-Fri 09:00-17:00, Sat 09:00-13:00" from the settings hours.
export function hoursSummary(hours) {
  var byDay = {}; (hours || []).forEach(function (h) { byDay[h.weekday] = h.open + "-" + h.close; });
  var groups = []; var cur = null;
  WEEKDAYS.forEach(function (d) {
    var span = byDay[d.n];
    if (!span) { cur = null; return; }
    if (cur && cur.span === span) { cur.to = d.short; } else { cur = { from: d.short, to: d.short, span: span }; groups.push(cur); }
  });
  return groups.map(function (g) { return (g.from === g.to ? g.from : g.from + "-" + g.to) + " " + g.span; }).join(", ");
}

// ---- settings form <-> database ----------------------------------------------------------

export function defaultSettings() {
  return {
    enabled: false, timezone: "Africa/Nairobi", slot_minutes: 30, lead_hours: 4, max_days_ahead: 30, capacity: 1,
    hours: [1, 2, 3, 4, 5, 6].map(function (n) { return { weekday: n, open: "09:00", close: n === 6 ? "13:00" : "17:00" }; }),
  };
}
// hours -> { 0..6: {open, close} | null }
export function hoursToDays(hours) {
  var days = {}; WEEKDAYS.forEach(function (d) { days[d.n] = null; });
  (hours || []).forEach(function (h) { days[h.weekday] = { open: h.open, close: h.close }; });
  return days;
}
export function daysToHours(days) {
  return WEEKDAYS.filter(function (d) { return days[d.n]; }).map(function (d) { return { weekday: d.n, open: days[d.n].open, close: days[d.n].close }; });
}
function mins(t) { var p = String(t).split(":"); return Number(p[0]) * 60 + Number(p[1]); }
export function validateSettings(s) {
  var open = (s.hours || []).length;
  if (s.enabled && open === 0) return "Choose at least one open day before turning online booking on.";
  for (var i = 0; i < s.hours.length; i++) {
    var h = s.hours[i];
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h.open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.close)) return "Enter opening and closing times like 09:00.";
    if (mins(h.close) <= mins(h.open)) return "Each open day needs a closing time after its opening time.";
  }
  function int(v, lo, hi) { var n = Number(v); return isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi; }
  if (SLOT_CHOICES.indexOf(Number(s.slot_minutes)) === -1) return "Choose a time-slot length from the list.";
  if (!int(s.lead_hours, 0, 168)) return "Minimum notice must be a whole number of hours from 0 to 168.";
  if (!int(s.max_days_ahead, 1, 180)) return "Days ahead must be a whole number from 1 to 180.";
  if (!int(s.capacity, 1, 20)) return "Appointments at the same time must be a whole number from 1 to 20.";
  if (!String(s.timezone || "").trim()) return "Enter a time zone, for example Africa/Nairobi.";
  return "";
}
