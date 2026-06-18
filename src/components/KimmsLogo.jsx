// src/components/KimmsLogo.jsx

import { GOLD_LT, GOLD_DIM, DARK, WHITE } from "../lib/constants.js";

export default function KimmsLogo({ size, dark }) {
  size = size || "md";
  dark = dark || false;
  var s = {
    sm: { crown: 18, name: 15, tag: 9,  sub: 8  },
    md: { crown: 26, name: 22, tag: 12, sub: 10 },
    lg: { crown: 38, name: 32, tag: 16, sub: 12 },
  }[size] || { crown: 26, name: 22, tag: 12, sub: 10 };

  var goldColor = dark ? GOLD_DIM : GOLD_LT;
  var textColor = dark ? DARK : WHITE;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1 }}>
      <svg width={s.crown * 2} height={s.crown} viewBox="0 0 60 30" fill="none" style={{ marginBottom: 2 }}>
        <polygon points="5,28 15,8 30,20 45,8 55,28" fill="none" stroke={goldColor} strokeWidth="3" strokeLinejoin="round" />
        <circle cx="5"  cy="28" r="3" fill={goldColor} />
        <circle cx="30" cy="20" r="3" fill={goldColor} />
        <circle cx="55" cy="28" r="3" fill={goldColor} />
        <line x1="5" y1="28" x2="55" y2="28" stroke={goldColor} strokeWidth="3" />
      </svg>
      <div style={{ fontFamily: "Georgia,serif", fontSize: s.name, fontWeight: 900, color: goldColor, letterSpacing: "0.04em", fontStyle: "italic" }}>
        Kimm's
      </div>
      <div style={{ fontSize: s.tag, fontWeight: 800, color: textColor, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 1 }}>
        Beauty Parlour
      </div>
      <div style={{ fontSize: s.sub, color: goldColor, letterSpacing: "0.1em", fontStyle: "italic", marginTop: 1, opacity: 0.85 }}>
        Beauty That Speaks Confidence
      </div>
    </div>
  );
}
