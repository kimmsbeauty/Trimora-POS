// src/lib/utils.js

export function fmt(n) {
  return "KES " + Number(n).toLocaleString();
}

// FIX: previously returned "18/06/2026" (DD/MM/YYYY via en-KE locale),
// which Postgres `date` columns rejected with a 400 error because it
// misreads "18" as a month. ISO format (YYYY-MM-DD) is unambiguous
// regardless of the database server's datestyle setting, so this is
// now always safe to insert into any date column.
export function todayStr() {
  var d = new Date();
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

export function nowTime() {
  return new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
}

export function today() {
  return new Date().toLocaleDateString("en-KE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Normalizes a Kenyan phone number into the bare-digits, country-code-
// prefixed form wa.me links require (e.g. "254113828280", no "+", no
// spaces). Handles every format actually found in this database:
// local with leading 0 ("0113828280"), already-international with no
// leading 0 ("254113828280"), and a leading "+" ("+254113828280").
//
// FIX: several places used to build wa.me links as
// "https://wa.me/254" + salon.contact_phone directly. That's only
// correct if contact_phone is stored in local "0..." form -- for any
// salon whose number was saved already including "254" (as Kimms
// Beauty Parlour's is), it double-prepends the country code and
// produces an invalid, unreachable number. Route every contact_phone
// / ownerPhone through this function instead of hand-rolling the
// prefix logic inline.
export function normalizePhoneForWhatsApp(raw) {
  if (!raw) return null;
  var cleaned = String(raw).trim().replace(/\s/g, "").replace(/^\+/, "");
  if (cleaned.indexOf("254") === 0) return cleaned.replace(/\D/g, "");
  return cleaned.replace(/^0/, "254").replace(/\D/g, "");
}
