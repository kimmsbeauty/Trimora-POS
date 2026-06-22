// src/lib/colorUtils.js
//
// Small hex color helpers used to derive lighter/dimmer variants of an
// arbitrary salon-chosen primary_color — generalizing the relationship
// Kimms' old hardcoded GOLD/GOLD_LT/GOLD_DIM constants used to encode
// directly as separate, hand-picked hex values.
//
// Verified against the real numbers: GOLD (#C9A84C) -> GOLD_LT
// (#F0CC6E) is +14.3 lightness *and* +27.7 saturation in HSL terms;
// GOLD -> GOLD_DIM (#8A6F2E) is -18.2 lightness with saturation roughly
// unchanged. We deliberately only replicate the lightness shift, not
// the saturation boost, since boosting saturation on an arbitrary,
// unknown future salon color could produce unpredictable, overly vivid
// results. lighten(GOLD, 14) lands close to but visibly more muted
// than the real GOLD_LT; darken(GOLD, 18) lands almost exactly on the
// real GOLD_DIM, since that relationship was lightness-only already.
// This is a known, accepted tradeoff — see project decision: applies
// to Kimms' own colors too, no special-casing.

function hexToRgb(hex) {
  var clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean.split("").map(function(c) { return c + c; }).join("");
  }
  var num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r, g, b) {
  function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
  return "#" + [clamp(r), clamp(g), clamp(b)].map(function(v) {
    var s = v.toString(16);
    return s.length === 1 ? "0" + s : s;
  }).join("");
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, l = (max + min) / 2;

  if (max === min) {
    h = 0; s = 0;
  } else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d) + (g < b ? 6 : 0);
    else if (max === g) h = ((b - r) / d) + 2;
    else h = ((r - g) / d) + 4;
    h /= 6;
  }
  return { h: h, s: s, l: l };
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    var v = l * 255;
    return { r: v, g: v, b: v };
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  var p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
}

// Returns a lighter tint of the given hex color by raising HSL
// lightness by `amount` (0-100 scale, same units as CSS hsl()).
export function lighten(hex, amount) {
  if (!hex) return hex;
  var rgb = hexToRgb(hex);
  var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  hsl.l = Math.min(1, hsl.l + amount / 100);
  var out = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(out.r, out.g, out.b);
}

// Returns a darker/dimmer shade of the given hex color by lowering HSL
// lightness by `amount` (0-100 scale).
export function darken(hex, amount) {
  if (!hex) return hex;
  var rgb = hexToRgb(hex);
  var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  hsl.l = Math.max(0, hsl.l - amount / 100);
  var out = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(out.r, out.g, out.b);
}
