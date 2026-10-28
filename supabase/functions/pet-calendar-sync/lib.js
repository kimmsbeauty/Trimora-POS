// supabase/functions/pet-calendar-sync/lib.js
//
// Pure helpers for the pet-calendar-sync edge function (no network, no database), so they can be unit
// tested from the app's test suite. Everything that ends up in a Google event is decided HERE.
//
// What goes to Google (and what never does):
//   Grooming  title "Grooming – Pet (Owner)", timed start/end; description: services, groomer, status,
//             booking reference.
//   Boarding  title "Boarding – Pet (Owner)", ALL-DAY event covering check-in through check-out;
//             description: dates, kennel, service, status, reference, actual check-in/out times.
//   NEVER SENT: booking notes, feeding notes, care notes, phone numbers, emails, prices, medical or
//   vaccination records.

export var SOURCE_BOOKING = "booking";
export var SOURCE_STAY = "stay";
export var MAX_ATTEMPTS = 8;
export var DEFAULT_TZ = "Africa/Nairobi";

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var BOOKING_STATUS = { pending: "Pending", confirmed: "Confirmed", "checked-in": "Checked in", "in-progress": "In progress", completed: "Completed" };
var STAY_STATUS = { reserved: "Reserved", occupied: "Checked in", "checked-out": "Checked out" };
var FOOTER = "Managed in Trimora Pet. Edit it there: changes made here are overwritten the next time the booking changes.";

export function validCalendarId(id) {
  return typeof id === "string" && /^[A-Za-z0-9._%+@#-]{3,254}$/.test(id.trim());
}

// Google lets us choose the event id: lowercase a-v and 0-9, 5-1024 characters. A fixed id per booking
// means a retry can never create a duplicate.
export function eventIdFor(type, id) {
  var hex = String(id || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  return (type === SOURCE_STAY ? "tks" : "tkb") + hex;
}

export function shortRef(id) {
  return String(id || "").replace(/[^0-9a-fA-F]/g, "").slice(0, 8).toUpperCase();
}

// "2026-11-05" + 1 -> "2026-11-06" (calendar arithmetic only, no timezone involved)
export function addDays(iso, n) {
  var p = String(iso).slice(0, 10).split("-").map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

export function prettyDate(iso) {
  var p = String(iso).slice(0, 10).split("-").map(Number);
  return p[2] + " " + MONTHS[p[1] - 1] + " " + p[0];
}

// Local date and time of an instant in the business's timezone, e.g. { date: "2026-11-02", time: "09:30" }
export function localParts(ts, tz) {
  var zone = tz || DEFAULT_TZ;
  var d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  try {
    var date = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    var time = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    return { date: date, time: time };
  } catch (e) {
    return localParts(ts, DEFAULT_TZ === zone ? "UTC" : DEFAULT_TZ);
  }
}

// A booking or stay that should NOT be on the calendar (or no longer is).
export function shouldRemove(type, row) {
  if (!row) return true;
  if (type === SOURCE_STAY) return row.status === "cancelled";
  return row.status === "cancelled" || row.status === "no-show";
}

function clean(s, max) {
  var t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export function eventTitle(kind, petName, ownerName) {
  var pet = clean(petName, 60) || "Pet";
  var owner = clean(ownerName, 60);
  return kind + " – " + pet + (owner ? " (" + owner + ")" : "");
}

function staffMeta(b) { return b.staff_id ? String(b.staff_id) : ""; }

// b: a pet_bookings row. ctx: { petName, ownerName, groomerName, services: [names], timezone }
export function bookingEvent(b, ctx) {
  var c = ctx || {};
  var tz = c.timezone || DEFAULT_TZ;
  var services = (c.services || []).map(function (s) { return clean(s, 80); }).filter(Boolean);
  var lines = [
    "Service: " + (services.length ? services.join(", ") : "Not specified"),
    "Groomer: " + (clean(c.groomerName, 60) || "Unassigned"),
    "Status: " + (BOOKING_STATUS[b.status] || clean(b.status, 20)),
    "Booking ref: " + shortRef(b.id),
    "",
    FOOTER,
  ];
  return {
    summary: eventTitle("Grooming", c.petName, c.ownerName),
    description: lines.join("\n"),
    start: { dateTime: new Date(b.starts_at).toISOString(), timeZone: tz },
    end: { dateTime: new Date(b.ends_at).toISOString(), timeZone: tz },
    extendedProperties: { private: { trimora_source: SOURCE_BOOKING, trimora_id: String(b.id), trimora_salon: String(b.salon_id), trimora_staff: staffMeta(b) } },
  };
}

// s: a pet_boarding_stays row. ctx: { petName, ownerName, kennelName, timezone }
// All-day events end on an EXCLUSIVE date in Google, so the end is check-out + 1 day: the calendar then
// shows both the check-in day and the check-out day (a same-day stay shows as one day).
export function stayEvent(s, ctx) {
  var c = ctx || {};
  var tz = c.timezone || DEFAULT_TZ;
  var lines = [
    "Check-in: " + prettyDate(s.check_in_on),
    "Check-out: " + prettyDate(s.check_out_on),
    "Kennel: " + (clean(c.kennelName, 60) || "Not assigned"),
  ];
  var svc = clean(s.service_name, 80);
  if (svc) lines.push("Service: " + svc);
  lines.push("Status: " + (STAY_STATUS[s.status] || clean(s.status, 20)));
  var inAt = s.checked_in_at ? localParts(s.checked_in_at, tz) : null;
  var outAt = s.checked_out_at ? localParts(s.checked_out_at, tz) : null;
  if (inAt) lines.push("Checked in at: " + prettyDate(inAt.date) + " " + inAt.time);
  if (outAt) lines.push("Checked out at: " + prettyDate(outAt.date) + " " + outAt.time);
  lines.push("Boarding ref: " + shortRef(s.id), "", FOOTER);
  return {
    summary: eventTitle("Boarding", c.petName, c.ownerName),
    description: lines.join("\n"),
    start: { date: String(s.check_in_on).slice(0, 10) },
    end: { date: addDays(s.check_out_on, 1) },
    extendedProperties: { private: { trimora_source: SOURCE_STAY, trimora_id: String(s.id), trimora_salon: String(s.salon_id), trimora_staff: "" } },
  };
}

// Small, stable fingerprint (cyrb53) of exactly what would be sent. Used only to skip a Google call
// when nothing visible changed (for example a note edit, which is never sent).
export function contentHash(event) {
  var str = JSON.stringify([event.summary, event.description, event.start, event.end, event.extendedProperties]);
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (var i = 0; i < str.length; i++) {
    var ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// Google's HTTP status (and, for 403, the first error reason) -> a short code the app can explain.
export function classifyGoogleError(status, reason) {
  if (status === 401) return "GOOGLE_AUTH";
  if (status === 404) return "CALENDAR_NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 410) return "GONE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) {
    var r = String(reason || "");
    return /rateLimit|quotaExceeded|userRateLimit/i.test(r) ? "RATE_LIMITED" : "CALENDAR_FORBIDDEN";
  }
  if (status >= 500) return "GOOGLE_UNAVAILABLE";
  return "GOOGLE_ERROR";
}

export function parseServiceAccount(raw) {
  try {
    var o = JSON.parse(raw);
    if (o && typeof o.client_email === "string" && typeof o.private_key === "string" && o.private_key.indexOf("BEGIN PRIVATE KEY") >= 0) {
      return { client_email: o.client_email, private_key: o.private_key };
    }
  } catch (e) { /* fall through */ }
  return null;
}

export function base64url(input) {
  var bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pemToDer(pem) {
  var b64 = String(pem).replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Constant-time string compare for the scheduler's shared secret.
export function safeEqual(a, b) {
  var x = String(a || ""), y = String(b || "");
  if (x.length !== y.length) return false;
  var diff = 0;
  for (var i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
