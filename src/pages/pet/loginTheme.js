// src/pages/pet/loginTheme.js
//
// Colours and shadows for the Trimora Pet sign-in screen only, converted (oklch -> sRGB hex) from the
// owner-approved "Pixel Perfect Scene" login design. Kept apart from theme.js, which holds only the
// spec tokens (theme.test.js pins it to exactly those), the same way brandColors.js holds PawPals colours.
export var LOGIN_BG = "#FCFAF5";
export var LOGIN_INK = "#111419";
export var LOGIN_CHARCOAL = "#1E2229";
export var LOGIN_GOLD = "#E7B140";
export var LOGIN_GOLD_DEEP = "#C68C27";
export var LOGIN_SECONDARY = "#F3F0EA";
export var LOGIN_MUTED_FG = "#5F636C";
export var LOGIN_BORDER = "#E4E1DA";
export var LOGIN_DESTRUCTIVE = "#E7000B";
export var LOGIN_CARD = "#FFFFFF";

// RGB triplets of the tokens above, for translucent variants (rings, overlays, borders).
export var LOGIN_INK_RGB = "17,20,25";
export var LOGIN_GOLD_RGB = "231,177,64";
export var LOGIN_DESTRUCTIVE_RGB = "231,0,11";
export var LOGIN_BORDER_RGB = "228,225,218";
export var LOGIN_MUTED_FG_RGB = "95,99,108";

export var LOGIN_SHADOW_CARD = "0 24px 60px -24px rgba(17,20,25,0.35)";
export var LOGIN_SHADOW_GOLD = "0 12px 30px -12px rgba(228,173,60,0.55)";
