// src/pages/pet/PlaceholderPage.jsx
// Honest placeholder for sections that are not built yet. Deliberately shows
// no numbers or sample records: nothing here pretends to be real data.
import React from "react";
import { CARD, BORDER, MUTED_FG, FONT_HEADING, ACCENT, ACCENT_FG } from "./theme";

export default function PlaceholderPage({ title, phase }) {
  return (
    <div>
      <h1 style={{ fontFamily: FONT_HEADING, fontSize: 26, fontWeight: 600, margin: "0 0 16px" }}>{title}</h1>
      <div style={{ background: CARD, border: "1px solid " + BORDER, borderRadius: 16, padding: 24, maxWidth: 560 }}>
        <span style={{ display: "inline-block", background: ACCENT, color: ACCENT_FG, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>
          Coming soon
        </span>
        <p style={{ margin: 0, color: MUTED_FG, fontSize: 14, lineHeight: 1.6 }}>
          This section isn't available yet{phase ? " (planned for " + phase + ")" : ""}. Nothing on this screen is saved or sent anywhere.
        </p>
      </div>
    </div>
  );
}
