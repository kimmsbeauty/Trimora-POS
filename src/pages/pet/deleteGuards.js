// src/pages/pet/deleteGuards.js
//
// Plain-language explanations for why a service or a pet can't be deleted.
// The database (RESTRICT foreign keys) is still the real guard; these helpers
// let the screens check history FIRST, so a doomed delete is never sent and the
// user is told what to do instead. Booking and financial history is never removed.

export var HISTORY_CAP = 100; // how many rows the screens fetch per table when checking

function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
function capped(n, one, many) { return n > HISTORY_CAP ? "more than " + HISTORY_CAP + " " + many : plural(n, one, many); }

// Joins ["a", "b", "c"] -> "a, b and c".
function listText(parts) {
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

export function historyTotal(counts) {
  var c = counts || {};
  return (c.bookings || 0) + (c.stays || 0) + (c.invoices || 0);
}

// counts: { bookings, invoices } for a service; { bookings, stays, invoices } for a pet.
export function serviceBlockMessage(name, counts) {
  var c = counts || {};
  var parts = [];
  if (c.bookings > 0) parts.push(capped(c.bookings, "booking", "bookings"));
  if (c.invoices > 0) parts.push(capped(c.invoices, "invoice line", "invoice lines"));
  if (parts.length === 0) return "";
  return "\u201C" + name + "\u201D is used in " + listText(parts) + ", so it can't be deleted: your booking and invoice history must stay complete. "
    + "Deactivate it instead. It stays on past bookings and invoices but won't be offered for new ones.";
}

export function petBlockMessage(name, counts) {
  var c = counts || {};
  var parts = [];
  if (c.bookings > 0) parts.push(capped(c.bookings, "booking", "bookings"));
  if (c.stays > 0) parts.push(capped(c.stays, "boarding stay", "boarding stays"));
  if (c.invoices > 0) parts.push(capped(c.invoices, "invoice", "invoices"));
  if (parts.length === 0) return "";
  return name + " has " + listText(parts) + ", so the profile can't be deleted: these records are kept for your history and finances. "
    + "Archive the pet instead: it leaves your active lists, and every booking, payment and record is kept. You can restore it any time.";
}

// Message when the delete was rejected although no history was found (a race, or
// a connection problem). Honest about not knowing which.
export function unknownDeleteFailure(what) {
  return "Couldn't delete the " + what + ". It may have been used in the meantime, or the connection dropped. Refresh and try again.";
}
