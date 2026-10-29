// src/pages/pet/settingsData.js
//
// Pure validation for the Settings screen (logo, tax, invoice footer).

export function isValidLogoUrl(url) {
  var u = String(url || "").trim();
  if (!u) return true; // empty = no logo
  if (u.length > 500) return false;
  return /^https:\/\/[^\s]+$/i.test(u);
}

// Invoice number prefix. Left blank, it comes from the business name (letters and digits only, upper case),
// so each business's invoices carry its own name: "Pawpalske" -> PAWPALSKE-INV-0001. The database does the
// same derivation when it numbers an invoice; this copy only previews it.
export function derivePrefix(name) {
  return String(name || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}
export function normalizePrefix(v) {
  return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}
export function invoiceNumberPreview(prefix, name) {
  var p = normalizePrefix(prefix) || derivePrefix(name);
  return (p ? p + "-" : "") + "INV-0001";
}

// Business phone numbers: any number of them, each can be left off the invoice.
export function digitsOf(v) { return String(v || "").replace(/[^0-9]/g, ""); }
export function validatePhone(v) {
  var t = String(v || "").trim();
  if (!/^[0-9+() -]{7,20}$/.test(t) || digitsOf(t).length < 9) return "Enter a valid phone number (digits, spaces, + ( ) and - only).";
  return "";
}
export function validatePhones(list) {
  var seen = {};
  for (var i = 0; i < (list || []).length; i++) {
    var msg = validatePhone(list[i].phone);
    if (msg) return msg;
    var k = digitsOf(list[i].phone);
    if (seen[k]) return "The number " + String(list[i].phone).trim() + " is in the list twice.";
    seen[k] = true;
  }
  return "";
}
export function phonesPayload(list) {
  return (list || []).map(function (p) { return { phone: String(p.phone).trim(), show_on_invoice: p.show_on_invoice !== false }; });
}

export function validateSettings(d) {
  if (!isValidLogoUrl(d.logo_url)) return "The logo link must start with https:// and be under 500 characters.";
  var rate = Number(d.tax_rate);
  if (d.tax_enabled && (d.tax_rate === "" || !isFinite(rate) || Math.floor(rate) !== rate || rate < 0 || rate > 100)) return "The tax rate must be a whole number from 0 to 100.";
  if (String(d.tax_pin || "").trim().length > 30) return "The tax PIN is too long.";
  if (String(d.tagline || "").length > 120) return "The tagline is too long (120 characters at most).";
  if (String(d.receipt_footer_message || "").length > 200) return "The invoice footer is too long (200 characters at most).";
  if (d.invoice_prefix != null && String(d.invoice_prefix).trim() !== "" && !/^[A-Za-z0-9]{1,20}$/.test(String(d.invoice_prefix).trim())) return "The invoice prefix can only use letters and numbers (20 at most).";
  var phoneMsg = validatePhones(d.phones);
  if (phoneMsg) return phoneMsg;
  var phone = String(d.contact_phone || "").trim();
  if (phone && phone.replace(/[^0-9]/g, "").length < 9) return "Enter a valid phone number.";
  return "";
}

export function settingsRow(d) {
  function nul(v) { var t = String(v || "").trim(); return t === "" ? null : t; }
  return {
    logo_url: nul(d.logo_url),
    tagline: nul(d.tagline),
    contact_phone: nul(d.contact_phone),
    tax_enabled: !!d.tax_enabled,
    tax_rate: d.tax_enabled || String(d.tax_rate).trim() !== "" ? Number(d.tax_rate) || 0 : 16,
    tax_pin: nul(d.tax_pin) ? String(d.tax_pin).trim().toUpperCase() : null,
    receipt_footer_message: nul(d.receipt_footer_message),
    invoice_prefix: normalizePrefix(d.invoice_prefix) || null,
  };
}
