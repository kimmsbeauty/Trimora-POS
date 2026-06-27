// src/pages/ResetPasswordPage.jsx
//
// Handles the password reset callback from Supabase.
// Supabase redirects here after the user clicks the reset link in their email.
// The URL contains an access_token in the hash fragment (#access_token=xxx).
// We extract it, let the user enter a new password, then call Supabase to update it.

import { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_DIM, BLACK, WHITE, RED, GREEN } from "../lib/constants.js";

export default function ResetPasswordPage() {
  var [token,      setToken]      = useState("");
  var [password,   setPassword]   = useState("");
  var [confirm,    setConfirm]    = useState("");
  var [showPass,   setShowPass]   = useState(false);
  var [loading,    setLoading]    = useState(false);
  var [done,       setDone]       = useState(false);
  var [error,      setError]      = useState("");
  var [tokenError, setTokenError] = useState(false);

  // Extract slug from query params for redirect after reset
  var slug = new URLSearchParams(window.location.search).get("slug") || "";

  useEffect(function() {
    // Supabase puts the access token in the URL hash after redirect
    var hash   = window.location.hash;
    var params = new URLSearchParams(hash.replace("#", "?"));
    var t      = params.get("access_token");
    if (t) {
      setToken(t);
    } else {
      setTokenError(true);
    }
  }, []);

  async function handleReset() {
    setError("");
    if (!password) return setError("Please enter a new password.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setLoading(true);

    var res = await fetch(SUPABASE_URL + "/auth/v1/user", {
      method: "PUT",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (res.ok) {
      setDone(true);
      // Redirect to their POS after 3 seconds
      setTimeout(function() {
        window.location.href = slug ? "/" + slug + "/pos" : "/pos";
      }, 3000);
    } else {
      var data = await res.json().catch(function() { return {}; });
      setError(data.msg || data.error_description || "Password reset failed. Please request a new reset link.");
    }
  }

  // Invalid or missing token
  if (tokenError) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1A1A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + RED, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: RED, marginBottom: 10 }}>Invalid Reset Link</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.6 }}>
            This link is invalid or has expired. Reset links are valid for 1 hour.
          </div>
          <a href="/pos" style={{ display: "inline-block", background: GOLD, color: BLACK, borderRadius: 10, padding: "12px 24px", fontWeight: 900, fontSize: 14, textDecoration: "none" }}>
            Request New Link
          </a>
        </div>
      </div>
    );
  }

  // Success
  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1A1A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GREEN, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: GREEN, marginBottom: 10 }}>Password Updated!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            Your password has been changed successfully. Redirecting you to the POS...
          </div>
        </div>
      </div>
    );
  }

  // Reset form
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1A1A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>

        <div style={{ fontSize: 36, marginBottom: 12 }}>🔐</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: GOLD, marginBottom: 6 }}>Set New Password</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
          Choose a strong password for your account.
        </div>

        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type={showPass ? "text" : "password"}
            placeholder="New password (min 6 chars)"
            value={password}
            onChange={function(e) { setPassword(e.target.value); setError(""); }}
            disabled={loading}
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (error ? RED : GOLD_DIM + "44"), background: "rgba(255,255,255,0.06)", padding: "13px 44px 13px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE }}
          />
          <button onClick={function() { setShowPass(!showPass); }} type="button"
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "rgba(255,255,255,0.4)", padding: 0, lineHeight: 1 }}>
            {showPass ? "🙈" : "👁"}
          </button>
        </div>

        <input
          type={showPass ? "text" : "password"}
          placeholder="Confirm new password"
          value={confirm}
          onChange={function(e) { setConfirm(e.target.value); setError(""); }}
          onKeyDown={function(e) { if (e.key === "Enter") handleReset(); }}
          disabled={loading}
          style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (error && confirm !== password ? RED : GOLD_DIM + "44"), background: "rgba(255,255,255,0.06)", padding: "13px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 10 }}
        />

        {confirm.length > 0 && confirm !== password && (
          <div style={{ fontSize: 11, color: RED, marginBottom: 8, textAlign: "left" }}>Passwords do not match</div>
        )}
        {confirm.length > 0 && confirm === password && password.length >= 6 && (
          <div style={{ fontSize: 11, color: GREEN, marginBottom: 8, textAlign: "left" }}>✓ Passwords match</div>
        )}

        {error && (
          <div style={{ color: RED, fontSize: 12, marginBottom: 10, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)" }}>
            {error}
          </div>
        )}

        <button
          onClick={handleReset}
          disabled={loading || !password || password !== confirm}
          style={{ width: "100%", background: GOLD, color: BLACK, border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 900, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", opacity: loading || !password || password !== confirm ? 0.6 : 1 }}
        >
          {loading ? "Updating..." : "Update Password →"}
        </button>
      </div>
    </div>
  );
}
