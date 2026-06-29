// src/pages/ForgotPinPage.jsx
//
// Allows a salon owner to reset their admin PIN when locked out.
// Flow:
//  1. Owner enters their email
//  2. Send a recovery email with redirectTo = /reset-password?mode=pin&slug={slug}
//  3. Owner clicks link → Supabase redirects to /reset-password with token in hash
//  4. ResetPasswordPage detects mode=pin in query params → shows PIN reset form
//  5. Enters new admin PIN → saved via update_salon_pin RPC
//
// The slug is embedded in the redirectTo URL so it survives across browsers/tabs
// without depending on localStorage being present in the destination tab.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_DIM, BLACK, WHITE, RED, GREEN } from "../lib/constants.js";

export default function ForgotPinPage() {
  var params = useParams();
  var slug   = params.slug || "";

  var [step,    setStep]    = useState("email"); // email | sent
  var [email,   setEmail]   = useState("");
  var [loading, setLoading] = useState(false);
  var [error,   setError]   = useState("");

  async function sendResetEmail() {
    if (!email.trim()) return setError("Please enter your email address.");
    setLoading(true); setError("");

    // Embed mode=pin and slug in the redirectTo URL so ResetPasswordPage
    // knows to show the PIN reset form regardless of which tab/browser opens it.
    var redirectTo = window.location.origin + "/reset-password?mode=pin" + (slug ? "&slug=" + slug : "");

    var res = await fetch(SUPABASE_URL + "/auth/v1/recover", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), redirectTo }),
    });

    setLoading(false);
    if (res.ok) {
      setStep("sent");
    } else {
      var d = await res.json().catch(function() { return {}; });
      setError(d.msg || d.error_description || "Could not send reset email. Please try again.");
    }
  }

  var backHref = slug ? "/" + slug + "/pos" : "/pos";

  // ── EMAIL SENT ───────────────────────────────────────────────────
  if (step === "sent") {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1A1A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: GOLD, marginBottom: 10 }}>Check your email</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 20 }}>
            We sent a PIN reset link to <b style={{ color: GOLD_DIM }}>{email}</b>.<br /><br />
            Click the link to set a new admin PIN.
          </div>
          <a href={backHref} style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>← Back to login</a>
        </div>
      </div>
    );
  }

  // ── EMAIL FORM ───────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1A1A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔑</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: GOLD, marginBottom: 6 }}>Forgot Admin PIN?</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24, lineHeight: 1.6 }}>
          Enter your account email and we'll send you a PIN reset link.
        </div>

        <input
          type="email"
          placeholder="Your account email"
          value={email}
          onChange={function(e) { setEmail(e.target.value); setError(""); }}
          onKeyDown={function(e) { if (e.key === "Enter") sendResetEmail(); }}
          disabled={loading}
          style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (error ? RED : GOLD_DIM + "44"), background: "rgba(255,255,255,0.06)", padding: "13px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 10 }}
        />

        {error && (
          <div style={{ color: RED, fontSize: 12, marginBottom: 10, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8 }}>{error}</div>
        )}

        <button
          onClick={sendResetEmail}
          disabled={loading}
          style={{ width: "100%", background: GOLD, color: BLACK, border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 900, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, marginBottom: 14 }}
        >
          {loading ? "Sending..." : "Send Reset Link →"}
        </button>

        <a href={backHref} style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
          ← Back to login
        </a>
      </div>
    </div>
  );
}
