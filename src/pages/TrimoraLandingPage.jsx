// src/pages/TrimoraLandingPage.jsx
//
// Shown at /, /pos, /booking, and any unrecognised URL.
// No salon data or branding is loaded here.

import { GOLD, GOLD_DIM, BLACK, WHITE } from "../lib/constants";

// Contact info split to deter simple bot scraping — assembled at
// render time so it appears normally to real visitors.
var PHONE_PARTS = ["+254", "702", "904", "562"];
var EMAIL_USER  = "admin";
var EMAIL_DOM   = "trimorasystems.com";

export default function TrimoraLandingPage() {
  var phone = PHONE_PARTS.join(" ");
  var email = EMAIL_USER + "@" + EMAIL_DOM;

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
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 52, fontWeight: 900, color: GOLD, letterSpacing: "-0.02em", lineHeight: 1 }}>
          TRIMORA
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: GOLD_DIM, letterSpacing: "0.3em", textTransform: "uppercase", marginTop: 4 }}>
          SYSTEMS
        </div>
      </div>

      {/* Tagline */}
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 28, maxWidth: 300, lineHeight: 1.8 }}>
        Smart POS. Seamless Operations.<br />
        Built for beauty parlours, salons &amp; barbershops.
      </div>

      {/* Divider */}
      <div style={{ width: 40, height: 2, background: GOLD_DIM, borderRadius: 2, marginBottom: 28, opacity: 0.4 }} />

      {/* Salon owner CTA */}
      <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
        Already a client?
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.9, maxWidth: 280, marginBottom: 10 }}>
        Log in using your salon's unique portal.
      </div>
      <div style={{ fontSize: 12, color: GOLD_DIM, fontWeight: 700, marginBottom: 36 }}>
        Need an account? Contact us for setup.
      </div>

      {/* Contact card */}
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid " + GOLD_DIM + "33",
        borderRadius: 16,
        padding: "20px 28px",
        maxWidth: 300,
        width: "100%",
        marginBottom: 32,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 14 }}>
          Get in touch
        </div>

        <a href={"tel:" + PHONE_PARTS.join("")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, fontWeight: 800, color: WHITE, textDecoration: "none", marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>📞</span>
          {phone}
        </a>

        <a href={"mailto:" + email}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 700, color: GOLD_DIM, textDecoration: "none" }}>
          <span style={{ fontSize: 14 }}>✉️</span>
          {email}
        </a>
      </div>

      {/* Footer */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.12)" }}>
        © {new Date().getFullYear()} Trimora Systems · All rights reserved
      </div>
    </div>
  );
}
