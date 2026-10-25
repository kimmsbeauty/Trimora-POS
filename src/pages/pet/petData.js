// src/pages/pet/petData.js
//
// Pure helpers for the Pets screen (no network, no React) so the rules are
// easy to test. Status values match the approved prototype's VaccStatus:
// "current" | "due-soon" | "overdue".

export var SPECIES = ["Dog", "Cat", "Rabbit", "Other"];
export var SEX = ["Male", "Female", "Unknown"];
// How far ahead a "due soon" reminder shows when nothing else is configured: six
// months. It is a reminder WINDOW, not a due interval: it never implies that a
// record is due every six months, and a record with no due date gets no reminder.
// Each record type (Rabies, Deworming, ...) can have its own window (migration 098).
export var DEFAULT_REMINDER_DAYS = 180;
export var DUE_SOON_DAYS = DEFAULT_REMINDER_DAYS;
export var MAX_REMINDER_DAYS = 730;

function pad(n) { return n < 10 ? "0" + n : "" + n; }

// Local calendar date as YYYY-MM-DD (the business works in one timezone).
export function todayIso(now) {
  var d = now || new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function addDaysIso(iso, days) {
  var p = String(iso).split("-");
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  d.setUTCDate(d.getUTCDate() + days);
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

function norm(t) { return String(t || "").trim().toLowerCase(); }
function isoDayNumber(iso) {
  var p = String(iso).split("-");
  return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000);
}

// The reminder window (days) for a record type: its own setting if there is one,
// otherwise the default. settings: [{ record_type, window_days }].
export function reminderWindowFor(recordType, settings) {
  var key = norm(recordType);
  var list = settings || [];
  for (var i = 0; i < list.length; i++) {
    if (norm(list[i].record_type) === key && Number(list[i].window_days) > 0) return Number(list[i].window_days);
  }
  return DEFAULT_REMINDER_DAYS;
}

// null when there is no due date (we do not guess a status).
// "overdue": the due date has passed (flagged separately from reminders).
// "due-soon": due within the reminder window. "current": further away than that.
export function vaccinationStatus(nextDueOn, today, windowDays) {
  if (!nextDueOn) return null;
  var t = today || todayIso();
  if (nextDueOn < t) return "overdue";
  var w = Number(windowDays) > 0 ? Number(windowDays) : DEFAULT_REMINDER_DAYS;
  if (nextDueOn <= addDaysIso(t, w)) return "due-soon";
  return "current";
}

// Same as vaccinationStatus but looks the window up from the record type.
export function recordStatus(record, today, settings) {
  return vaccinationStatus(record.next_due_on, today, reminderWindowFor(record.vaccine, settings));
}

// "Due in 12 days" / "Due today" / "Expired 3 days ago"; "" without a due date.
export function dueText(nextDueOn, today) {
  if (!nextDueOn) return "";
  var diff = isoDayNumber(nextDueOn) - isoDayNumber(today || todayIso());
  if (diff === 0) return "Due today";
  if (diff > 0) return "Due in " + diff + (diff === 1 ? " day" : " days");
  var ago = -diff;
  return "Expired " + ago + (ago === 1 ? " day" : " days") + " ago";
}

// Worst status across a pet's vaccinations, for the card badges.
export function vaccinationSummary(vaccinations, today, settings) {
  var overdue = 0; var dueSoon = 0;
  (vaccinations || []).forEach(function (v) {
    var s = recordStatus(v, today, settings);
    if (s === "overdue") overdue++;
    else if (s === "due-soon") dueSoon++;
  });
  return { overdue: overdue, dueSoon: dueSoon };
}

// ---- reminder settings (record type -> window) ----
export function validateReminderSetting(recordType, windowDays, existing, editingId) {
  var t = String(recordType || "").trim();
  if (!t) return "Enter the record type, for example Rabies or Deworming.";
  if (t.length > 60) return "The record type is too long (60 characters at most).";
  var n = Number(windowDays);
  if (!/^\d+$/.test(String(windowDays).trim()) || n < 1 || n > MAX_REMINDER_DAYS) {
    return "The reminder window must be a whole number of days from 1 to " + MAX_REMINDER_DAYS + ".";
  }
  var dup = (existing || []).some(function (r) { return r.id !== editingId && norm(r.record_type) === norm(t); });
  if (dup) return "There is already a setting for " + t + ". Edit that one instead.";
  return "";
}
var REMINDER_ERRORS = {
  NOT_AUTHENTICATED: "Please sign in again.",
  INVALID_RECORD_TYPE: "Enter the record type, for example Rabies or Deworming.",
  INVALID_WINDOW: "The reminder window must be a whole number of days from 1 to " + MAX_REMINDER_DAYS + ".",
  SETTING_NOT_FOUND: "That setting no longer exists. Refresh and try again.",
};
export function reminderErrorMessage(raw) {
  var text = String(raw || "");
  var codes = Object.keys(REMINDER_ERRORS);
  for (var i = 0; i < codes.length; i++) if (text.indexOf(codes[i]) !== -1) return REMINDER_ERRORS[codes[i]];
  return "Couldn't save the setting. Check your connection and try again.";
}

// ---- archiving (migration 097) ----
export var ARCHIVE_REASONS = [
  { value: "passed-away", label: "Passed away" },
  { value: "moved-away", label: "Moved away" },
  { value: "inactive", label: "No longer active" },
  { value: "other", label: "Other" },
];
export function archiveReasonLabel(value) {
  var hit = ARCHIVE_REASONS.filter(function (r) { return r.value === value; })[0];
  return hit ? hit.label : "";
}
export function isArchived(pet) { return !!(pet && pet.archived_at); }
var ARCHIVE_ERRORS = {
  NOT_AUTHENTICATED: "Please sign in again.",
  PET_NOT_FOUND: "That pet could not be found. Refresh and try again.",
  INVALID_ARCHIVE_REASON: "Choose why this pet is being archived.",
  PET_HAS_OPEN_BOOKINGS: "This pet still has an upcoming or unfinished booking. Complete or cancel it in Calendar first, then archive the pet.",
  PET_HAS_OPEN_STAY: "This pet still has a reserved or current boarding stay. Check it out or cancel it in Boarding first, then archive the pet.",
};
export function archiveErrorMessage(raw) {
  var text = String(raw || "");
  var codes = Object.keys(ARCHIVE_ERRORS);
  for (var i = 0; i < codes.length; i++) if (text.indexOf(codes[i]) !== -1) return ARCHIVE_ERRORS[codes[i]];
  return "Couldn't update the pet. Check your connection and try again.";
}

export function ageLabel(dateOfBirth, today) {
  if (!dateOfBirth) return "Age unknown";
  var t = today || todayIso();
  var b = String(dateOfBirth).split("-"); var n = String(t).split("-");
  var months = (Number(n[0]) - Number(b[0])) * 12 + (Number(n[1]) - Number(b[1]));
  if (Number(n[2]) < Number(b[2])) months -= 1;
  if (months < 0) return "Age unknown";
  if (months < 1) return "Under 1 month";
  if (months < 24) return months + (months === 1 ? " month" : " months");
  var years = Math.floor(months / 12);
  return years + " years";
}

function clean(v) { return typeof v === "string" ? v.trim() : v; }

export function validatePet(draft, today) {
  if (!clean(draft.name)) return "Pet name is required.";
  if (!draft.customer_id) return "Choose the owner.";
  if (SPECIES.indexOf(draft.species) === -1) return "Choose a species.";
  if (draft.date_of_birth && draft.date_of_birth > (today || todayIso())) return "Date of birth can't be in the future.";
  if (draft.weight_kg !== "" && draft.weight_kg !== null && draft.weight_kg !== undefined) {
    var w = Number(draft.weight_kg);
    if (!isFinite(w) || w <= 0 || w > 999) return "Weight must be a number above 0 (kg).";
  }
  return "";
}

// Turns the form draft into the row sent to the database ("" -> null).
export function petRow(draft) {
  function nul(v) { var c = clean(v); return c === "" || c === undefined ? null : c; }
  return {
    customer_id: draft.customer_id,
    name: clean(draft.name),
    species: draft.species,
    breed: nul(draft.breed),
    sex: draft.sex || "Unknown",
    date_of_birth: nul(draft.date_of_birth),
    color: nul(draft.color),
    weight_kg: draft.weight_kg === "" || draft.weight_kg === null || draft.weight_kg === undefined ? null : Number(draft.weight_kg),
    care_notes: nul(draft.care_notes),
    grooming_notes: nul(draft.grooming_notes),
  };
}

export function isDuplicatePet(pets, row, ignoreId) {
  var key = String(row.name).trim().toLowerCase();
  return (pets || []).some(function (p) {
    return p.id !== ignoreId && p.customer_id === row.customer_id && p.species === row.species &&
      String(p.name).trim().toLowerCase() === key;
  });
}

export function validateVaccination(draft, today) {
  if (!clean(draft.vaccine)) return "Vaccine name is required.";
  if (!draft.given_on) return "Enter the date it was given.";
  if (draft.given_on > (today || todayIso())) return "The given date can't be in the future.";
  if (draft.next_due_on && draft.next_due_on < draft.given_on) return "Next due can't be before the given date.";
  return "";
}

// view: "active" (default: archived pets hidden), "archived" or "all".
export function filterPets(pets, ownersById, q, species, breed, view) {
  var needle = String(q || "").trim().toLowerCase();
  var v = view || "active";
  return (pets || []).filter(function (p) {
    if (v === "active" && p.archived_at) return false;
    if (v === "archived" && !p.archived_at) return false;
    var owner = ownersById[p.customer_id];
    var ownerName = owner ? String(owner.name).toLowerCase() : "";
    var textOk = !needle || String(p.name).toLowerCase().indexOf(needle) !== -1 || ownerName.indexOf(needle) !== -1;
    return textOk && (!species || species === "all" || p.species === species) &&
      (!breed || breed === "all" || (p.breed || "") === breed);
  });
}
