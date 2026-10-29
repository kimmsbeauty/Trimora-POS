// src/pages/pet/daycareData.js
//
// Pure helpers for Daycare (migration 114): no network, no React. The database is the authority for
// capacity, conflicts, lifecycle and billing; everything here is display logic and early, friendly
// validation. Times are East Africa Time (UTC+3, no daylight saving), the same assumption the database makes.

export var PLANS = ["full_day", "half_day", "hourly"];
export var PLAN_LABELS = { full_day: "Full day", half_day: "Half day", hourly: "Hourly" };
export var PRESENT_STATUSES = ["checked-in", "in-daycare", "ready-for-pickup"];
export var ACTIVE_STATUSES = ["booked"].concat(PRESENT_STATUSES);

export var STATUS_LABELS = {
  booked: "Booked", "checked-in": "Checked in", "in-daycare": "In daycare", "ready-for-pickup": "Ready for pickup",
  completed: "Completed", cancelled: "Cancelled", "no-show": "No-show",
};
export var STATUS_TONES = {
  booked: "info", "checked-in": "gold", "in-daycare": "success", "ready-for-pickup": "violet",
  completed: "neutral", cancelled: "neutral", "no-show": "danger",
};
// The one forward step staff can take from each status (checkout handles ready-for-pickup -> completed).
export var NEXT_STEP = {
  booked: { to: "checked-in", label: "Check in" },
  "checked-in": { to: "in-daycare", label: "Move to daycare" },
  "in-daycare": { to: "ready-for-pickup", label: "Ready for pickup" },
};
export var LOG_KINDS = {
  feeding: "Feeding", water: "Water", play: "Supervised play", rest: "Rest", toileting: "Toileting",
  medication: "Medication given", behaviour: "Behaviour", incident: "Incident", note: "Staff note",
};
export var LOG_NEEDS_TEXT = ["behaviour", "incident", "note"];

export function isPresent(v) { return !!v && PRESENT_STATUSES.indexOf(v.status) !== -1; }

export function minutesOverdue(v, now) {
  if (!isPresent(v)) return 0;
  var diff = Math.floor(((now || new Date()).getTime() - new Date(v.scheduled_end).getTime()) / 60000);
  return diff > 0 ? diff : 0;
}
// Overdue = still on site after the scheduled end plus the business's grace period (settings, default 0).
export function isOverdue(v, now, graceMinutes) {
  return isPresent(v) && minutesOverdue(v, now) > (Number(graceMinutes) || 0);
}

var DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" });
var TIME_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", hour12: false });
export function dayKey(d) { return DAY_FMT.format(d instanceof Date ? d : new Date(d)); }
export function timeLabel(iso) { return iso ? TIME_FMT.format(new Date(iso)) : "–"; }
export function hhmm(iso) { return timeLabel(iso); }
// "2026-10-29" + "08:30" -> ISO instant in EAT.
export function toInstant(day, time) { return new Date(day + "T" + time + ":00+03:00").toISOString(); }

export function durationLabel(startIso, endIso) {
  var m = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (!(m > 0)) return "";
  var h = Math.floor(m / 60); var r = m % 60;
  return h ? (r ? h + " h " + r + " min" : h + " h") : r + " min";
}

export function visitsOnDay(visits, key) {
  return (visits || []).filter(function (v) { return dayKey(v.scheduled_start) === key; });
}

// Dashboard numbers. "Present" pets occupy a place, including those past their end time.
export function dashboardCounts(visits, now, settings) {
  var today = dayKey(now || new Date());
  var grace = settings ? settings.overdue_grace_minutes : 0;
  var c = { expected: 0, checkedIn: 0, inDaycare: 0, ready: 0, overdue: 0, present: 0, completedToday: 0, capacity: settings && settings.capacity ? settings.capacity : null };
  (visits || []).forEach(function (v) {
    if (v.status === "booked" && dayKey(v.scheduled_start) === today) c.expected++;
    if (v.status === "checked-in") c.checkedIn++;
    if (v.status === "in-daycare") c.inDaycare++;
    if (v.status === "ready-for-pickup") c.ready++;
    if (isPresent(v)) c.present++;
    if (isOverdue(v, now || new Date(), grace)) c.overdue++;
    if (v.status === "completed" && v.collected_at && dayKey(v.collected_at) === today) c.completedToday++;
  });
  c.available = c.capacity === null ? null : Math.max(0, c.capacity - c.present);
  c.occupancyPct = c.capacity ? Math.min(100, Math.round((c.present / c.capacity) * 100)) : null;
  return c;
}

// Plans the business has set up (a mapped, active Daycare service), with the catalogue price.
export function planOptions(settings, services) {
  if (!settings) return [];
  var map = { full_day: settings.full_day_service_id, half_day: settings.half_day_service_id, hourly: settings.hourly_service_id };
  return PLANS.map(function (p) {
    var svc = (services || []).filter(function (s) { return s.id === map[p] && s.category === "Daycare" && s.active !== false; })[0];
    return svc ? { plan: p, label: PLAN_LABELS[p], name: svc.name, price: svc.price } : null;
  }).filter(Boolean);
}

export function unitsFor(plan, startIso, endIso) {
  if (plan !== "hourly") return 1;
  var m = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
  return Math.max(1, Math.ceil(m / 60));
}

export function emptyVisit(day) {
  return { customer_id: "", pet_id: "", plan: "", date: day, start: "08:00", end: "17:00", staff_id: "", instructions: "", notes: "", check_in_now: false };
}

export function validateVisit(d) {
  if (!d.customer_id) return "Choose a customer.";
  if (!d.pet_id) return "Choose a pet.";
  if (!d.plan) return "Choose a daycare option.";
  if (!d.date || !d.start || !d.end) return "Enter the date and the drop-off and pickup times.";
  var s = new Date(toInstant(d.date, d.start)).getTime(); var e = new Date(toInstant(d.date, d.end)).getTime();
  if (!isFinite(s) || !isFinite(e)) return "Enter a valid date and times.";
  if (e <= s) return "Pickup must be after drop-off.";
  if (e - s > 24 * 3600000) return "A daycare visit can be at most 24 hours.";
  if (e <= Date.now()) return "Pickup time is already in the past.";
  if ((d.instructions || "").length > 500 || (d.notes || "").length > 500) return "Instructions and notes must be 500 characters or fewer.";
  return "";
}

export function validateLog(d) {
  if (!d.kind || !LOG_KINDS[d.kind]) return "Choose what you are recording.";
  if (d.kind === "medication" && (!(d.medication_name || "").trim() || !(d.dose || "").trim())) return "Enter the medication name and the dose given.";
  if (LOG_NEEDS_TEXT.indexOf(d.kind) !== -1 && !(d.details || "").trim()) return "Add a short description.";
  if ((d.details || "").length > 500) return "Details must be 500 characters or fewer.";
  return "";
}

export function clampLateHours(v, max) {
  var n = Math.floor(Number(v));
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, Number(max) || 0);
}

// Preview of pet_daycare_checkout's maths (the database recomputes; this only shows the staff member).
export function previewTotals(info, lateHours, discountType, discountValue) {
  var base = Number(info.units) * Number(info.unit_price);
  var late = clampLateHours(lateHours, info.late_hours);
  var lateTotal = late * Number(info.late_unit_price || 0);
  var sub = base + lateTotal;
  var dv = Number(discountValue) || 0;
  var discount = discountType === "percent" ? Math.round(sub * Math.min(Math.max(dv, 0), 100) / 100) : Math.min(Math.max(Math.floor(dv), 0), sub);
  return { base: base, lateHours: late, lateTotal: lateTotal, subtotal: sub, discount: discount, total: sub - discount };
}

var ERROR_TEXT = {
  NOT_AUTHENTICATED: "Your session has expired. Please sign in again.",
  DAYCARE_NOT_CONFIGURED: "Daycare isn't set up yet. An admin needs to set the capacity in Daycare settings.",
  PLAN_NOT_CONFIGURED: "That daycare option has no rate yet. An admin can set it in Daycare settings.",
  SERVICE_NOT_FOUND: "That daycare service is no longer available.",
  DAYCARE_FULL: "Daycare is full for that time. Choose another time or day.",
  PET_BOARDED: "This pet is booked into boarding on that day.",
  VISIT_CONFLICT_PET: "This pet already has a daycare visit at that time.",
  INVALID_TIMES: "Check the times: pickup must be after drop-off, within 24 hours, and not in the past.",
  INVALID_PLAN: "Choose a daycare option.",
  CUSTOMER_NOT_FOUND: "That customer couldn't be found.",
  PET_NOT_FOUND: "That pet couldn't be found for this customer.",
  STAFF_NOT_FOUND: "That staff member couldn't be found.",
  VISIT_NOT_FOUND: "That visit couldn't be found. It may have been changed on another device.",
  VISIT_NOT_EDITABLE: "This visit can no longer be edited.",
  INVALID_STATUS_CHANGE: "That step isn't available for this visit. Refresh to see its current status.",
  NO_SHOW_TOO_EARLY: "A visit can only be marked no-show after its scheduled start.",
  USE_CHECKOUT: "Use Check out to complete a visit.",
  VISIT_NOT_ACTIVE: "Care records can only be added while the pet is checked in.",
  INVALID_LOG: "Check the entry: medication needs a name and dose, and notes need a description.",
  INVALID_KIND: "Choose what you are recording.",
  VISIT_NOT_READY: "Mark the pet ready for pickup before checking out.",
  VISIT_ALREADY_INVOICED: "This visit already has an invoice.",
  VISIT_SERVICE_MISSING: "This visit's daycare service was deleted, so it can't be invoiced automatically.",
  INVALID_LATE_HOURS: "The late hours are more than the rules allow.",
  INVALID_DISCOUNT: "Check the discount.",
  SETTINGS_MISSING: "This business's invoice settings are missing. Contact support.",
  INVALID_SETTINGS: "Check the settings: capacity must be 1 to 500.",
  LATE_FEE_NEEDS_HOURLY_RATE: "Choose an hourly rate before switching on late-pickup charges.",
  archived: "This pet is archived. Restore the pet first.",
};
export function daycareErrorMessage(raw) {
  var text = String(raw || "");
  var codes = Object.keys(ERROR_TEXT);
  for (var i = 0; i < codes.length; i++) if (text.indexOf(codes[i]) !== -1) return ERROR_TEXT[codes[i]];
  if (text === "Network error") return "Couldn't reach the server. Check your connection and try again.";
  return "Couldn't save that. Check your connection and try again.";
}
