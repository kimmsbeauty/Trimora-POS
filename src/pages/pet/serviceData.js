// src/pages/pet/serviceData.js
//
// Pure helpers for the service catalogue (no network, no React).
// Prices are whole KES (integer), the same convention as auto_services.price.

import { SPECIES } from "./petData";

export var CATEGORIES = ["Grooming", "Boarding", "Add-on"];
export var MAX_PRICE = 10000000;

function clean(v) { return typeof v === "string" ? v.trim() : v; }
function nul(v) { var c = clean(v); return c === "" || c === undefined ? null : c; }
function isBlank(v) { return v === "" || v === null || v === undefined; }

export function validateService(draft) {
  if (!clean(draft.name)) return "Service name is required.";
  if (CATEGORIES.indexOf(draft.category) === -1) return "Choose a category.";
  if (isBlank(draft.price)) return "Enter a price (0 for free).";
  var price = Number(draft.price);
  if (!isFinite(price) || Math.floor(price) !== price || price < 0 || price > MAX_PRICE) return "Price must be a whole number of shillings, 0 or more.";
  if (!isBlank(draft.duration_minutes)) {
    var d = Number(draft.duration_minutes);
    if (!isFinite(d) || Math.floor(d) !== d || d <= 0 || d > 1440) return "Duration must be a whole number of minutes between 1 and 1440.";
  }
  var sp = draft.species || [];
  for (var i = 0; i < sp.length; i++) if (SPECIES.indexOf(sp[i]) === -1) return "Unknown species.";
  return "";
}

// Form draft -> database row ("" -> null; every species ticked is the same as "all", stored as empty).
export function serviceRow(draft) {
  var species = (draft.species || []).filter(function (s, i, a) { return a.indexOf(s) === i; });
  if (species.length === SPECIES.length) species = [];
  return {
    name: clean(draft.name),
    description: nul(draft.description),
    category: draft.category,
    duration_minutes: isBlank(draft.duration_minutes) ? null : Number(draft.duration_minutes),
    price: Number(draft.price),
    species: species,
    active: draft.active !== false,
  };
}

export function isDuplicateService(services, row, ignoreId) {
  var key = String(row.name).trim().toLowerCase();
  return (services || []).some(function (s) {
    return s.id !== ignoreId && s.category === row.category && String(s.name).trim().toLowerCase() === key;
  });
}

export function durationLabel(minutes) {
  if (!minutes) return "";
  if (minutes < 60) return minutes + " min";
  var h = Math.floor(minutes / 60); var m = minutes % 60;
  return m ? h + " h " + m + " min" : h + " h";
}

export function speciesLabel(species) {
  return !species || species.length === 0 ? "All species" : species.join(", ");
}

export function filterServices(services, q, category, showInactive) {
  var needle = String(q || "").trim().toLowerCase();
  return (services || []).filter(function (s) {
    if (!showInactive && !s.active) return false;
    if (category && category !== "all" && s.category !== category) return false;
    return !needle || String(s.name).toLowerCase().indexOf(needle) !== -1 ||
      String(s.description || "").toLowerCase().indexOf(needle) !== -1;
  });
}
