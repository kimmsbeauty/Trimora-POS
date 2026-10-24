// src/pages/pet/theme.js
//
// Single source of truth for Trimora Pet's look. Values come from the owner-
// approved prototype's design tokens (hex conversions of its oklch palette),
// per PET_MODULE_SPEC section 4. Pet code must import colours from here and
// never hardcode a hex anywhere else.

// The product/module name (owner decision D4). Keep it in this one constant.
export var PET_NAME = "Trimora Pet";
export var PET_MODULE_KEY = "pet";
export var PET_BRAND_CAPTION = "BY TRIMORA SYSTEMS";

export var BACKGROUND = "#FAF9F6";
export var FOREGROUND = "#1B1E24";
export var CARD = "#FFFFFF";
export var PRIMARY = "#E1AC41";
export var PRIMARY_FG = "#201707";
export var MUTED = "#F3F1ED";
export var MUTED_FG = "#61666E";
export var ACCENT = "#F3ECDB";
export var ACCENT_FG = "#382C15";
export var BORDER = "#E5E3DD";
export var DESTRUCTIVE = "#CC2827";
export var SUCCESS = "#14874E";
export var WARNING = "#D0852D";
export var INFO = "#3082B5";
export var VIOLET = "#8864C0";
export var SIDEBAR = "#101318";
export var SIDEBAR_FG = "#ECEBE7";
export var SIDEBAR_MUTED = "#8F9298";

export var RADIUS = 12;
export var FONT_BODY = "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif";
export var FONT_HEADING = "'Fraunces', Georgia, 'Times New Roman', serif";
