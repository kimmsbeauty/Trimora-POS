// src/pages/TrimoraLandingPage.jsx
//
// Shown at /pos (the old legacy unprefixed route) now that every salon
// has a proper slug-based URL (/{slug}/pos). Directs visitors to the
// right place without leaking any salon's data or branding.

import { GOLD, GOLD_DIM, BLACK, WHITE } from "../lib/constants";

export default function TrimoraLandingPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg," + BLACK + " 0%, #1A1A00 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "inherit",
      textAlign: "center",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 48, fontWeight: 900, color: GOLD, letterSpacing: "-0.02em", lineHeight: 1 }}>
          TRIMORA
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: GOLD_DIM, letterSpacing: "0.25em", textTransform: "uppercase", marginTop: 4 }}>
          POS
        </div>
      </div>

      {/* Tagline */}
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 32, maxWidth: 300, lineHeight: 1.7 }}>
        Smart POS. Seamless Operations.<br />
        Built for beauty parlours, salons &amp; barbershops.
      </div>

      {/* Divider */}
      <div style={{ width: 40, height: 2, background: GOLD_DIM, borderRadius: 2, marginBottom: 32, opacity: 0.4 }} />

      {/* CTA */}
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>
        Are you a salon owner?
      </div>

      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.8, maxWidth: 280 }}>
        Log in using your salon's link.<br />
        It looks like:<br />
        <span style={{ color: GOLD_DIM, fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>
          trimora-pos.vercel.app/<br />your-salon-name/pos
        </span>
      </div>

      {/* Footer */}
      <div style={{ position: "fixed", bottom: 20, fontSize: 11, color: "rgba(255,255,255,0.15)" }}>
        © {new Date().getFullYear()} Trimora Systems
      </div>
    </div>
  );
}
