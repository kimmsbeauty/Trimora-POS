// src/pages/pet/customerData.js
//
// Pure helpers for the Customers screen (no network, no React).
// A customer lives in the shared `customers` table (name, phone, visit counts).
// Extra pet-owner contact details live in pet_customer_profiles (migration 084).

export var CHANNELS = ["sms", "whatsapp", "email"];
export var CHANNEL_LABELS = { sms: "SMS", whatsapp: "WhatsApp", email: "Email" };

function clean(v) { return typeof v === "string" ? v.trim() : v; }
function nul(v) { var c = clean(v); return c === "" || c === undefined ? null : c; }
function digits(p) { return String(p || "").replace(/[^0-9]/g, ""); }

export function isValidEmail(email) {
  var e = String(email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function validateCustomer(draft) {
  if (!clean(draft.name)) return "Customer name is required.";
  if (clean(draft.phone) && digits(draft.phone).length < 9) return "Enter a valid phone number.";
  if (clean(draft.email) && !isValidEmail(draft.email)) return "Enter a valid email address.";
  if (clean(draft.emergency_contact_phone) && digits(draft.emergency_contact_phone).length < 9) return "Enter a valid emergency contact number.";
  var channels = draft.preferred_channels || [];
  for (var i = 0; i < channels.length; i++) {
    if (CHANNELS.indexOf(channels[i]) === -1) return "Unknown contact channel.";
  }
  if (channels.indexOf("email") !== -1 && !clean(draft.email)) return "Add an email address to use email as a channel.";
  return "";
}

// Row for the shared customers table.
export function customerRow(draft) {
  return { name: clean(draft.name), phone: nul(draft.phone) };
}

// Row for pet_customer_profiles ("" -> null). customer_id is added by the caller.
export function profileRow(draft) {
  return {
    email: nul(draft.email) ? String(clean(draft.email)).toLowerCase() : null,
    address: nul(draft.address),
    emergency_contact_name: nul(draft.emergency_contact_name),
    emergency_contact_phone: nul(draft.emergency_contact_phone),
    preferred_channels: (draft.preferred_channels || []).filter(function (c, i, a) { return a.indexOf(c) === i; }),
    notes: nul(draft.notes),
  };
}

// Same phone (ignoring spaces, +, dashes) on a different customer is a likely duplicate.
export function isDuplicateCustomer(customers, row, ignoreId) {
  var d = digits(row.phone);
  if (!d) return false;
  return (customers || []).some(function (c) {
    return c.id !== ignoreId && digits(c.phone) === d;
  });
}

export function filterCustomers(customers, profilesByCustomer, petsByCustomer, q) {
  var needle = String(q || "").trim().toLowerCase();
  if (!needle) return customers || [];
  var needleDigits = digits(needle);
  return (customers || []).filter(function (c) {
    var prof = profilesByCustomer[c.id] || {};
    var pets = petsByCustomer[c.id] || [];
    if (String(c.name || "").toLowerCase().indexOf(needle) !== -1) return true;
    if (needleDigits && digits(c.phone).indexOf(needleDigits) !== -1) return true;
    if (String(prof.email || "").toLowerCase().indexOf(needle) !== -1) return true;
    return pets.some(function (p) { return String(p.name || "").toLowerCase().indexOf(needle) !== -1; });
  });
}
