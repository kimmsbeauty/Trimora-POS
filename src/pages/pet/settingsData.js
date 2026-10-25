// src/pages/pet/settingsData.js
//
// Pure validation for the Settings screen (logo, tax, invoice footer).

export function isValidLogoUrl(url) {
  var u = String(url || "").trim();
  if (!u) return true; // empty = no logo
  if (u.length > 500) return false;
  return /^https:\/\/[^\s]+$/i.test(u);
}

export function validateSettings(d) {
  if (!isValidLogoUrl(d.logo_url)) return "The logo link must start with https:// and be under 500 characters.";
  var rate = Number(d.tax_rate);
  if (d.tax_enabled && (d.tax_rate === "" || !isFinite(rate) || Math.floor(rate) !== rate || rate < 0 || rate > 100)) return "The tax rate must be a whole number from 0 to 100.";
  if (String(d.tax_pin || "").trim().length > 30) return "The tax PIN is too long.";
  if (String(d.tagline || "").length > 120) return "The tagline is too long (120 characters at most).";
  if (String(d.receipt_footer_message || "").length > 200) return "The invoice footer is too long (200 characters at most).";
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
  };
}
