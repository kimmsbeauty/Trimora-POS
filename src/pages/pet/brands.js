// src/pages/pet/brands.js
//
// Built-in brand presets for pet businesses whose branding is shipped with the app.
// A preset only fills in what the business has NOT set itself in Settings: a logo or
// colour saved in salon_settings always wins. Businesses with no preset are unaffected.
import pawpalsLogo from "./assets/pawpals-kenya-logo.png";
import { PAWPALS_PURPLE, PAWPALS_BLUE, PAWPALS_NAVY, PAWPALS_TINT } from "./brandColors";

var PRESETS = [
  {
    match: function (salon) {
      var key = String((salon && (salon.slug || salon.name)) || "").toLowerCase().replace(/[^a-z]/g, "");
      return key.indexOf("pawpals") !== -1;
    },
    brand: {
      logo: pawpalsLogo,
      primary: PAWPALS_PURPLE,
      secondary: PAWPALS_BLUE,
      ink: PAWPALS_NAVY,
      // Light page tint for the public booking page (the blue is an accent, too loud as a background).
      page: PAWPALS_TINT,
      tagline: "Pet Grooming & Pet Care",
      location: "Nairobi, Kenya",
      email: "info@pawpalskenya.co.ke",
      website: "www.pawpalskenya.co.ke",
      thanks: "Thank you for trusting PawPals Kenya with your pet.",
    },
  },
];

export function brandFor(salon) {
  for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].match(salon)) return PRESETS[i].brand;
  return null;
}

// Phone numbers to print on an invoice: the owner's own list (Settings), only the ones switched on.
// When the list has not been loaded at all (older callers), fall back to the single saved contact number.
// No number is built in: a business shows exactly what its owner entered.
export function invoicePhones(salon) {
  var s = salon || {};
  if (Array.isArray(s.phones)) {
    return s.phones.filter(function (p) { return p && p.show_on_invoice !== false && String(p.phone || "").trim(); })
      .map(function (p) { return String(p.phone).trim(); });
  }
  return s.contact_phone ? [String(s.contact_phone).trim()] : [];
}

// Merge a salon with its preset: the salon's own saved values win.
export function resolveBrand(salon, defaults) {
  var p = brandFor(salon) || {};
  var s = salon || {};
  var presetColours = !!brandFor(salon);
  return {
    name: s.name || "",
    logo: s.logo_url || p.logo || null,
    primary: s.primary_color || p.primary || defaults.primary,
    secondary: s.secondary_color || p.secondary || defaults.secondary,
    // The preset's colours belong to its logo, so they only apply with it.
    ink: p.ink || defaults.ink,
    tagline: s.tagline || p.tagline || "",
    location: p.location || "",
    email: p.email || "",
    website: p.website || "",
    phones: invoicePhones(s),
    thanks: s.receipt_footer_message || p.thanks || "Thank you for your business.",
    isPreset: presetColours,
  };
}
