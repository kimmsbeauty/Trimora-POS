// src/pages/pet/publicBrand.js
//
// Brand colours for the public pet booking page. A business sets primary/secondary
// colours in its settings (salon_settings.primary_color / secondary_color) and the salon
// booking page already uses them; the pet booking page does the same. Anything that is not
// a plain hex colour is ignored and the standard Trimora Pet look is used instead.
import { brandFor } from "./brands";
import { BACKGROUND, FOREGROUND, MUTED_FG, PRIMARY } from "./theme";

var DARK_TEXT = "#1B1E24";
var LIGHT_TEXT = "#FFFFFF";

export function cleanHex(v) {
  var s = String(v == null ? "" : v).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return ("#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toUpperCase();
  return null;
}

// Relative luminance 0 (black) .. 1 (white).
export function luminance(hex) {
  var h = cleanHex(hex);
  if (!h) return 1;
  var ch = [1, 3, 5].map(function (i) {
    var c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// Text colour that stays readable on the given background.
export function readableOn(hex) {
  return luminance(hex) > 0.4 ? DARK_TEXT : LIGHT_TEXT;
}

export function publicBrand(salon) {
  // Businesses with a shipped preset (e.g. PawPals Kenya) get the same colours here as on their
  // invoices. Colours the business saved itself in Settings always win over the preset.
  var preset = brandFor(salon);
  var ownPrimary = cleanHex(salon && salon.primary_color);
  var primary = ownPrimary || (preset && cleanHex(preset.primary)) || PRIMARY;
  var secondary = cleanHex(salon && salon.secondary_color);
  var presetPage = !secondary && preset ? cleanHex(preset.page) : null;
  var presetInk = presetPage ? cleanHex(preset.ink) : null;
  var bg = secondary || presetPage || BACKGROUND;
  var dark = luminance(bg) <= 0.4;
  return {
    primary: primary,
    onPrimary: readableOn(primary),
    bg: bg,
    onBg: secondary ? (dark ? LIGHT_TEXT : FOREGROUND) : (presetInk || FOREGROUND),
    onBgMuted: secondary ? (dark ? "#C4C4C4" : MUTED_FG) : MUTED_FG,
    // On a dark page the brand colour doubles as the heading colour; on a light page the
    // text stays dark so it never gets hard to read.
    accentOnBg: dark ? primary : (presetInk || FOREGROUND),
    branded: !!(ownPrimary || secondary || preset),
  };
}
