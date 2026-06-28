// src/pages/ForgotPasswordPage.jsx
//
// Allows a salon owner to request a password reset email.
// Calls Supabase Auth /auth/v1/recover endpoint with their email.
// The email contains a link to /reset-password which handles the new password.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_DIM, BLACK, DARK, WHITE, RED, GREEN } from "../lib/constants.js";

export default function ForgotPasswordPage() {
  var params = useParams();
  var slug   = params.slug || "";

  var [email,   setEmail]   = useState("");
  var [sent,    setSent]    = useState(false);
  var [loading, setLoading] = useState(false);
  var [error,   setError]   = useState("");

  async function handleReset() {
    if (!email.trim()) return setError("Please enter your email address.");
    setLoading(true);
    setError("");

    // The slug is passed as a query param below, but query strings are
    // not reliably preserved once Supabase reconstructs the final
    // redirect URL with its own auth token attached - storing it here
    // too means ResetPasswordPage can still find it even if that happens.
    window.localStorage.setItem("trimora_password_reset_slug", slug || "");

    var redirectTo = window.location.origin + "/reset-password" + (slug ? "?slug=" + slug : "");

    var res = await fetch(SUPABASE_URL + "/auth/v1/recover", {
      method: "POST",
      headers: {
        apikey:         SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email:       email.trim(),
        redirectTo:  redirectTo,
      }),
    });

    setLoading(false);

    if (res.ok) {
      setSent(true);
    } else {
      var data = await res.json().catch(function() { return {}; });
      setError(data.msg || data.error_description || "Could not send reset email. Please try again.");
    }
  }

  var backHref = slug ? "/" + slug + "/pos" : "/pos";

  if (sent) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1A1A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: GOLD, marginBottom: 10 }}>Check your email</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: 20 }}>
            We sent a password reset link to <b style={{ color: GOLD_DIM }}>{email}</b>.<br /><br />
            Click the link in the email to set a new password. The link expires in 1 hour.
          </div>
          <a href={backHref} style={{ display: "block", color: GOLD_DIM, fontSize: 13, fontWeight: 700 }}>
            ← Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1A1A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>

        <div style={{ fontSize: 36, marginBottom: 12 }}>🔑</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: GOLD, marginBottom: 6 }}>Reset Password</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24, lineHeight: 1.6 }}>
          Enter your account email and we'll send you a reset link.
        </div>

        <input
          type="email"
          placeholder="Your account email"
          value={email}
          onChange={function(e) { setEmail(e.target.value); setError(""); }}
          onKeyDown={function(e) { if (e.key === "Enter") handleReset(); }}
          disabled={loading}
          style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (error ? RED : GOLD_DIM + "44"), background: "rgba(255,255,255,0.06)", padding: "13px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 10 }}
        />

        {error && (
          <div style={{ color: RED, fontSize: 12, marginBottom: 10, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)" }}>
            {error}
          </div>
        )}

        <button
          onClick={handleReset}
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
