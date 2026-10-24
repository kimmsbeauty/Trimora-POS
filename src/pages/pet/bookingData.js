// src/pages/pet/bookingData.js
//
// Pure helpers for Calendar & Bookings (no network, no React). The database
// (migration 088) is the authority on conflicts and on allowed status changes;
// the checks here only give faster, friendlier feedback.
//
// Statuses follow the approved prototype (booked / checked-in / in-progress / ready /
// completed / cancelled) plus no-show (migration 090).
//
// Dates: bookings are stored as timestamptz. These helpers use the browser's
// local time for display and input, via plain Date objects.

export var STATUSES = ["booked", "checked-in", "in-progress", "ready", "completed", "cancelled", "no-show"];
// Labels and badge colours copied from the prototype's bookingStatusMeta (no-show is new).
export var STATUS_LABELS = {
  booked: "Booked", "checked-in": "Checked In", "in-progress": "In Progress", ready: "Ready for Collection",
  completed: "Completed", cancelled: "Cancelled", "no-show": "No-show",
};
export var STATUS_TONES = {
  booked: "info", "checked-in": "gold", "in-progress": "warning", ready: "violet",
  completed: "success", cancelled: "danger", "no-show": "neutral",
};
// Same moves the database allows (090_pet_booking_statuses.sql).
export var NEXT_STATUSES = {
  booked: ["checked-in", "cancelled", "no-show"],
  "checked-in": ["in-progress", "cancelled"],
  "in-progress": ["ready"],
  ready: ["completed"],
  completed: [], cancelled: [], "no-show": [],
};
// Button wording for moving a booking to each status.
export var STATUS_ACTIONS = {
  "checked-in": "Check in", "in-progress": "Start", ready: "Mark ready", completed: "Complete", "no-show": "Mark no-show",
};
export var EDITABLE = ["booked", "checked-in"];
// Cancelled and no-show bookings free their slot.
export function isActive(b) { return b.status !== "cancelled" && b.status !== "no-show"; }

var ERROR_TEXT = {
  NOT_AUTHENTICATED: "Please sign in again.",
  INVALID_TIME_RANGE: "The end time must be after the start time, within 24 hours.",
  NO_SERVICES: "Choose at least one service.",
  CUSTOMER_NOT_FOUND: "That customer could not be found.",
  PET_NOT_FOUND: "That pet doesn't belong to the chosen customer.",
  STAFF_NOT_FOUND: "That staff member isn't available.",
  SERVICE_NOT_FOUND: "One of the chosen services is no longer available.",
  BOOKING_CONFLICT_STAFF: "That staff member already has a booking at that time.",
  BOOKING_CONFLICT_PET: "This pet already has a booking at that time.",
  BOOKING_NOT_FOUND: "That booking could not be found. Refresh and try again.",
  BOOKING_NOT_EDITABLE: "This booking can no longer be changed.",
  INVALID_STATUS_CHANGE: "That status change isn't allowed for this booking.",
};
// Turns the message returned by the database function into friendly wording.
export function bookingErrorMessage(raw) {
  var text = String(raw || "");
  var codes = Object.keys(ERROR_TEXT);
  for (var i = 0; i < codes.length; i++) if (text.indexOf(codes[i]) !== -1) return ERROR_TEXT[codes[i]];
  if (text === "Network error") return "Couldn't reach the server. Check your connection and try again.";
  return "Couldn't save the booking. Check your connection and try again.";
}

export function bookingTotal(lines) {
  return (lines || []).reduce(function (sum, l) { return sum + (Number(l.price) || 0); }, 0);
}
export function totalMinutes(lines) {
  return (lines || []).reduce(function (sum, l) { return sum + (Number(l.duration_minutes) || 0); }, 0);
}

// ---- date helpers (local time) ----
function pad(n) { return n < 10 ? "0" + n : "" + n; }
export function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
export function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
export function startOfWeek(d) { var s = startOfDay(d); var dow = (s.getDay() + 6) % 7; return addDays(s, -dow); } // Monday
export function weekDays(d) { var s = startOfWeek(d); var out = []; for (var i = 0; i < 7; i++) out.push(addDays(s, i)); return out; }
export function monthGrid(d) {
  var first = new Date(d.getFullYear(), d.getMonth(), 1);
  var start = startOfWeek(first);
  var weeks = [];
  for (var w = 0; w < 6; w++) {
    var row = [];
    for (var i = 0; i < 7; i++) row.push(addDays(start, w * 7 + i));
    if (w >= 4 && row[0].getMonth() !== d.getMonth()) break;
    weeks.push(row);
  }
  return weeks;
}
export function toDateInput(d) { return dateKey(d); }
export function toTimeInput(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
// "2026-10-25" + "14:30" -> local Date, or null when invalid.
export function fromInputs(dateStr, timeStr) {
  var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  var tm = /^(\d{2}):(\d{2})$/.exec(String(timeStr || ""));
  if (!dm || !tm) return null;
  var d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
  return isNaN(d.getTime()) || d.getMonth() !== Number(dm[2]) - 1 ? null : d;
}
export function addMinutes(d, m) { return new Date(d.getTime() + m * 60000); }
export function formatTime(iso) { var d = new Date(iso); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
export function formatRange(b) { return formatTime(b.starts_at) + " – " + formatTime(b.ends_at); }

export function bookingsOnDay(bookings, day) {
  var key = dateKey(day);
  return (bookings || []).filter(function (b) { return dateKey(new Date(b.starts_at)) === key; })
    .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
}
export function rangeBounds(view, anchor) {
  if (view === "day") { var s = startOfDay(anchor); return { from: s, to: addDays(s, 1) }; }
  if (view === "week") { var w = startOfWeek(anchor); return { from: w, to: addDays(w, 7) }; }
  var g = monthGrid(anchor); return { from: g[0][0], to: addDays(g[g.length - 1][6], 1) };
}

// Advisory only: tells the user about a clash before they submit. Half-open
// ranges, same as the database. The database remains the real guard.
export function findConflict(bookings, candidate, ignoreId) {
  var s = candidate.starts.getTime(); var e = candidate.ends.getTime();
  var hit = null;
  (bookings || []).forEach(function (b) {
    if (hit || b.id === ignoreId || !isActive(b)) return;
    var bs = new Date(b.starts_at).getTime(); var be = new Date(b.ends_at).getTime();
    if (!(s < be && bs < e)) return;
    if (candidate.pet_id && b.pet_id === candidate.pet_id) hit = "pet";
    else if (candidate.staff_id && b.staff_id === candidate.staff_id) hit = "staff";
  });
  return hit;
}

export function validateBooking(draft) {
  if (!draft.customer_id) return "Choose a customer.";
  if (!draft.pet_id) return "Choose a pet.";
  if (!draft.service_ids || draft.service_ids.length === 0) return "Choose at least one service.";
  var start = fromInputs(draft.date, draft.start_time);
  if (!start) return "Enter a valid date and start time.";
  var end = fromInputs(draft.date, draft.end_time);
  if (!end) return "Enter a valid end time.";
  if (end <= start) return "The end time must be after the start time.";
  if (end - start > 24 * 3600000) return "A booking can't be longer than 24 hours.";
  return "";
}

export function filterBookings(bookings, f, names) {
  var needle = String((f && f.q) || "").trim().toLowerCase();
  return (bookings || []).filter(function (b) {
    if (f && f.status && f.status !== "all" && b.status !== f.status) return false;
    if (f && f.staff_id && f.staff_id !== "all" && b.staff_id !== f.staff_id) return false;
    if (!needle) return true;
    var n = names(b);
    return String(n.pet || "").toLowerCase().indexOf(needle) !== -1 ||
      String(n.customer || "").toLowerCase().indexOf(needle) !== -1 ||
      (b.pet_booking_services || []).some(function (l) { return String(l.service_name).toLowerCase().indexOf(needle) !== -1; });
  });
}
