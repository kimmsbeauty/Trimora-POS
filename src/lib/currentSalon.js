// src/lib/currentSalon.js
//
// Holds which salon is "active" right now, so db.js (a plain module,
// not a React component) can read it on every request without needing
// React Context. Set by SalonGate whenever it resolves a slug; read by
// db.js to scope every GET/POST/PATCH against the tenant tables.
//
// If nothing has set it, db.js refuses the query rather than guessing
// (see the comment in dbDirect()) -- there is no fallback salon id.

var currentSalonId = null;

export function setCurrentSalonId(id) {
  currentSalonId = id;
}

export function getCurrentSalonId() {
  return currentSalonId;
}
