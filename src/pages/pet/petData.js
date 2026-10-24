// src/pages/pet/petData.js
//
// Pure helpers for the Pets screen (no network, no React) so the rules are
// easy to test. Status values match the approved prototype's VaccStatus:
// "current" | "due-soon" | "overdue".

export var SPECIES = ["Dog", "Cat", "Rabbit", "Other"];
export var SEX = ["Male", "Female", "Unknown"];
export var DUE_SOON_DAYS = 30;

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

// null when there is no due date (we do not guess a status).
export function vaccinationStatus(nextDueOn, today) {
  if (!nextDueOn) return null;
  var t = today || todayIso();
  if (nextDueOn < t) return "overdue";
  if (nextDueOn <= addDaysIso(t, DUE_SOON_DAYS)) return "due-soon";
  return "current";
}

// Worst status across a pet's vaccinations, for the card badges.
export function vaccinationSummary(vaccinations, today) {
  var overdue = 0; var dueSoon = 0;
  (vaccinations || []).forEach(function (v) {
    var s = vaccinationStatus(v.next_due_on, today);
    if (s === "overdue") overdue++;
    else if (s === "due-soon") dueSoon++;
  });
  return { overdue: overdue, dueSoon: dueSoon };
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

export function filterPets(pets, ownersById, q, species, breed) {
  var needle = String(q || "").trim().toLowerCase();
  return (pets || []).filter(function (p) {
    var owner = ownersById[p.customer_id];
    var ownerName = owner ? String(owner.name).toLowerCase() : "";
    var textOk = !needle || String(p.name).toLowerCase().indexOf(needle) !== -1 || ownerName.indexOf(needle) !== -1;
    return textOk && (!species || species === "all" || p.species === species) &&
      (!breed || breed === "all" || (p.breed || "") === breed);
  });
}
