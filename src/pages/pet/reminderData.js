// src/pages/pet/reminderData.js
//
// Pure logic for the manual reminders screen (migration 100). Works out what is due
// from bookings, vaccinations and boarding stays, builds message text and WhatsApp /
// SMS links, and translates database errors. Nothing here sends anything: a link only
// opens the staff member's own WhatsApp or SMS app, and staff then record the result.
import { addDaysIso, todayIso } from "./petData";

export var KINDS = [
  { key: "appointment", label: "Appointment reminder" },
  { key: "vaccination", label: "Vaccination due" },
  { key: "boarding_collection", label: "Boarding collection" },
  { key: "missed_appointment", label: "Missed appointment" },
  { key: "followup", label: "Follow-up" },
];
export function kindLabel(key) {
  var k = KINDS.filter(function (x) { return x.key === key; })[0];
  return k ? k.label : key;
}
export var STATUS_LABELS = { pending: "Waiting", sent: "Sent", failed: "Didn't go through", cancelled: "Skipped" };
export var STATUS_TONES = { pending: "warning", sent: "success", failed: "danger", cancelled: "neutral" };
export var MAX_ATTEMPTS = 3;

export var DEFAULT_OPTS = {
  appointmentHours: 48,   // booked appointments starting within this many hours
  vaccinationDays: 14,    // vaccinations due within this many days (overdue ones always listed)
  collectionDays: 1,      // boarding stays due out within this many days (overdue ones always listed)
  missedDays: 7,          // no-shows from the last N days
  followupMinDays: 28,    // completed visits at least this old ...
  followupMaxDays: 90,    // ... and at most this old, with no later booking
};

// ---- phone numbers and links -------------------------------------------------------

// Kenyan numbers (07xx, 01xx, 7xx, 254..., +254...) become 254XXXXXXXXX. A number typed
// with a leading + and another country code is kept. Anything else returns null.
export function normalizePhone(raw) {
  var s = String(raw || "").trim();
  if (!s) return null;
  var plus = s.charAt(0) === "+";
  var d = s.replace(/\D/g, "");
  if (/^254[17]\d{8}$/.test(d)) return d;
  if (/^0[17]\d{8}$/.test(d)) return "254" + d.slice(1);
  if (/^[17]\d{8}$/.test(d) && !plus) return "254" + d;
  if (plus && d.length >= 8 && d.length <= 15 && d.charAt(0) !== "0") return d;
  return null;
}
export function whatsappUrl(phone, text) {
  var n = normalizePhone(phone);
  return n ? "https://wa.me/" + n + "?text=" + encodeURIComponent(text || "") : null;
}
export function smsUrl(phone, text) {
  var n = normalizePhone(phone);
  return n ? "sms:+" + n + "?body=" + encodeURIComponent(text || "") : null;
}
export function channelUrl(channel, phone, text) {
  return channel === "sms" ? smsUrl(phone, text) : whatsappUrl(phone, text);
}

// ---- stable keys (must match pet_queue_reminder in migration 100) ------------------

export function bookingBasis(startsAtIso) {
  var d = new Date(startsAtIso);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}
export function dedupeKey(kind, sourceId, basis) { return kind + ":" + sourceId + ":" + basis; }

// ---- message text ------------------------------------------------------------------

function firstName(name) { return String(name || "").trim().split(/\s+/)[0] || "there"; }
function dateText(iso) {
  var s = String(iso || "");
  var d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function timeText(iso) {
  var d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
export function buildMessage(c, businessName) {
  var biz = businessName || "us";
  var hi = "Hi " + firstName(c.customer && c.customer.name) + ", ";
  var pet = (c.pet && c.pet.name) || "your pet";
  if (c.kind === "appointment") {
    return hi + "this is a reminder from " + biz + ": " + pet + " is booked for " + dateText(c.when) + " at " + timeText(c.when) + ". Please reply to confirm or to reschedule. Thank you!";
  }
  if (c.kind === "vaccination") {
    var what = c.detail || "vaccination";
    return hi + pet + "'s " + what + (c.overdue ? " was due on " : " is due on ") + dateText(c.when) + ". Please contact " + biz + " to book. Thank you!";
  }
  if (c.kind === "boarding_collection") {
    return hi + pet + " is due for collection from " + biz + (c.overdue ? " (the collection date, " : " on ") + dateText(c.when) + (c.overdue ? " has passed)" : "") + ". Please let us know when you will pick up. Thank you!";
  }
  if (c.kind === "missed_appointment") {
    return hi + "we missed " + pet + " at their appointment on " + dateText(c.when) + ". Would you like to book another time? - " + biz;
  }
  return hi + "it has been a while since " + pet + "'s last visit on " + dateText(c.when) + ". Would you like to book their next appointment with " + biz + "?";
}

// ---- what is due -------------------------------------------------------------------

// Everything is derived from live rows. A reminder already SENT or SKIPPED for the same
// key is left out (it shows in history); PENDING and FAILED ones stay in the list so
// staff can finish or retry them. Archived pets are never listed.
export function buildCandidates(input, optsIn) {
  var o = Object.assign({}, DEFAULT_OPTS, optsIn || {});
  var now = input.now instanceof Date ? input.now : new Date();
  var today = input.today || todayIso();
  var pets = {}; (input.pets || []).forEach(function (p) { pets[p.id] = p; });
  var customers = {}; (input.customers || []).forEach(function (c) { customers[c.id] = c; });
  var byKey = {}; (input.reminders || []).forEach(function (r) { byKey[r.dedupe_key] = r; });
  var bookings = input.bookings || [];
  var out = [];

  function add(kind, sourceType, sourceId, basis, customerId, petId, when, extra) {
    var pet = pets[petId]; var customer = customers[customerId];
    if (!pet || !customer || pet.archived_at) return;
    var key = dedupeKey(kind, sourceId, basis);
    var existing = byKey[key] || null;
    if (existing && (existing.status === "sent" || existing.status === "cancelled")) return;
    var blocked = null;
    if (kind === "followup" && customer.marketing_opt_out) blocked = "Opted out of marketing messages";
    else if (!normalizePhone(customer.phone)) blocked = "No valid phone number";
    out.push(Object.assign({ key: key, kind: kind, sourceType: sourceType, sourceId: sourceId, customer: customer, pet: pet,
      when: when, reminder: existing, blocked: blocked, optedOut: !!customer.marketing_opt_out }, extra || {}));
  }

  var hoursMs = o.appointmentHours * 3600000;
  var missedFrom = now.getTime() - o.missedDays * 86400000;
  bookings.forEach(function (b) {
    var t = new Date(b.starts_at).getTime();
    if (isNaN(t)) return;
    var basis = bookingBasis(b.starts_at);
    if (b.status === "booked" && t >= now.getTime() && t <= now.getTime() + hoursMs) {
      add("appointment", "booking", b.id, basis, b.customer_id, b.pet_id, b.starts_at);
    } else if (b.status === "no-show" && t >= missedFrom && t <= now.getTime()) {
      add("missed_appointment", "booking", b.id, basis, b.customer_id, b.pet_id, b.starts_at);
    } else if (b.status === "completed") {
      var ageDays = (now.getTime() - t) / 86400000;
      if (ageDays >= o.followupMinDays && ageDays <= o.followupMaxDays) {
        var hasLater = bookings.some(function (x) {
          return x.pet_id === b.pet_id && x.id !== b.id && x.status !== "cancelled" && x.status !== "no-show" && new Date(x.starts_at).getTime() > t;
        });
        if (!hasLater) add("followup", "booking", b.id, basis, b.customer_id, b.pet_id, b.starts_at);
      }
    }
  });

  var vaxTo = addDaysIso(today, o.vaccinationDays);
  (input.vaccinations || []).forEach(function (v) {
    if (!v.next_due_on || v.next_due_on > vaxTo) return;
    var pet = pets[v.pet_id];
    if (!pet) return;
    add("vaccination", "vaccination", v.id, v.next_due_on, pet.customer_id, v.pet_id, v.next_due_on,
      { detail: v.vaccine, overdue: v.next_due_on < today });
  });

  var stayTo = addDaysIso(today, o.collectionDays);
  (input.stays || []).forEach(function (s) {
    if (s.status !== "occupied" || !s.check_out_on || s.check_out_on > stayTo) return;
    add("boarding_collection", "stay", s.id, s.check_out_on, s.customer_id, s.pet_id, s.check_out_on, { overdue: s.check_out_on < today });
  });

  var order = { appointment: 0, boarding_collection: 1, vaccination: 2, missed_appointment: 3, followup: 4 };
  out.sort(function (a, b) {
    if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
    return String(a.when) < String(b.when) ? -1 : String(a.when) > String(b.when) ? 1 : 0;
  });
  return out;
}

// ---- errors ------------------------------------------------------------------------

var ERRORS = {
  NOT_AUTHENTICATED: "Your session has ended. Please sign in again.",
  SOURCE_NOT_FOUND: "That booking, vaccination or stay no longer exists. Refresh the list.",
  SOURCE_NOT_ELIGIBLE: "This no longer needs a reminder (it may have been completed, cancelled or changed). Refresh the list.",
  PET_ARCHIVED: "This pet is archived, so reminders can't be sent for it.",
  CUSTOMER_OPTED_OUT: "This customer has opted out of marketing messages, so follow-ups can't be sent.",
  NO_PHONE: "This customer has no phone number on file. Add one in Customers first.",
  MESSAGE_REQUIRED: "Write a message first.",
  MESSAGE_TOO_LONG: "That message is too long. Keep it under 600 characters.",
  REMINDER_NOT_FOUND: "That reminder no longer exists. Refresh the list.",
  REMINDER_FINAL: "That reminder is already finished (sent or skipped) and can't be changed.",
  MAX_ATTEMPTS: "This reminder has failed 3 times, so it can't be retried. Skip it and contact the customer another way.",
  INVALID_TRANSITION: "That change isn't allowed for this reminder.",
};
export function reminderErrorMessage(raw) {
  var s = String(raw || "");
  var codes = Object.keys(ERRORS);
  for (var i = 0; i < codes.length; i++) { if (s.indexOf(codes[i]) !== -1) return ERRORS[codes[i]]; }
  return "Couldn't update the reminder. Check your connection and try again.";
}
