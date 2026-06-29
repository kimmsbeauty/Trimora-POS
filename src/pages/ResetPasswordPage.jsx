// src/pages/ResetPasswordPage.jsx
//
// Handles TWO reset flows depending on query params:
//
//  1. PASSWORD RESET (default)
//     URL: /reset-password#access_token=xxx&type=recovery
//     Shows: "Set New Password" form
//
//  2. PIN RESET (when mode=pin in query string)
//     URL: /reset-password?mode=pin&slug=xxx#access_token=xxx&type=recovery
//     Shows: "Set New Admin PIN" form
//     The slug and mode are embedded in the redirectTo by ForgotPinPage so
//     this works correctly even when the email is opened in a different
//     browser or incognito tab (no localStorage dependency).

import { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_DIM, BLACK, WHITE, RED, GREEN } from "../lib/constants.js";

export default function ResetPasswordPage() {
  // Detect mode from query params (set by ForgotPinPage in redirectTo)
  var queryParams = new URLSearchParams(window.location.search);
  var isPinReset  = queryParams.get("mode") === "pin";
  var slug        = queryParams.get("slug") || window.localStorage.getItem("trimora_password_reset_slug") || "";

  var [token,      setToken]      = useState("");
  var [loading,    setLoading]    = useState(false);
  var [done,       setDone]       = useState(false);
  var [error,      setError]      = useState("");
  var [tokenError, setTokenError] = useState(false);

  // Password reset state
  var [password,  setPassword]  = useState("");
  var [confirm,   setConfirm]   = useState("");
  var [showPass,  setShowPass]  = useState(false);

  // PIN reset state
  var [newPin,     setNewPin]     = useState("");
  var [confirmPin, setConfirmPin] = useState("");

  useEffect(function() {
    var hash   = window.location.hash;
    var params = new URLSearchParams(hash.replace("#", "?"));
    var t      = params.get("access_token");
    if (t) {
      setToken(t);
    } else {
      setTokenError(true);
    }
  }, []);

  // ── PIN RESET HANDLER ────────────────────────────────────────────
  async function handlePinReset() {
    setError("");
    if (!newPin || !/^\d{4,6}$/.test(newPin)) return setError("PIN must be 4–6 digits.");
    if (newPin !== confirmPin) return setError("PINs do not match.");

    setLoading(true);

    // Consume the recovery token by updating the password to a placeholder
    var pwRes = await fetch(SUPABASE_URL + "/auth/v1/user", {
      method: "PUT",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "TrimPOS_" + newPin + "_reset" }),
    });

    if (!pwRes.ok) {
      setLoading(false);
      return setError("Session expired. Please request a new reset link.");
    }

    // Now update the admin PIN via RPC
    var pinRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/update_salon_pin", {
      method: "POST",
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_role: "admin", p_new_pin: newPin }),
    });

    setLoading(false);

    if (pinRes.ok) {
      setDone(true);
    } else {
      var pinErr = await pinRes.json().catch(function() { return {}; });
      setError("PIN reset failed: " + (pinErr.message || "Please contact support."));
    }
  }

  // ── PASSWORD RESET HANDLER ───────────────────────────────────────
  async function handlePasswordReset() {
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
      window.localStorage.removeItem("trimora_password_reset_slug");
      setTimeout(function() {
        window.location.href = slug ? "/" + slug + "/pos" : "/pos";
      }, 3000);
    } else {
      var data = await res.json().catch(function() { return {}; });
      setError(data.msg || data.error_description || "Password reset failed. Please request a new reset link.");
    }
  }

  var backHref = slug ? "/" + slug + "/pos" : "/pos";

  // ── INVALID TOKEN ────────────────────────────────────────────────
  if (tokenError) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1A1A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + RED, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: RED, marginBottom: 10 }}>Invalid Reset Link</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.6 }}>
            This link is invalid or has expired. Reset links are valid for 1 hour.
          </div>
          <a href={backHref} style={{ display: "inline-block", background: GOLD, color: BLACK, borderRadius: 10, padding: "12px 24px", fontWeight: 900, fontSize: 14, textDecoration: "none" }}>
            Request New Link
          </a>
        </div>
      </div>
    );
  }

  // ── SUCCESS ──────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1A1A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GREEN, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: GREEN, marginBottom: 10 }}>
            {isPinReset ? "Admin PIN Reset!" : "Password Updated!"}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: isPinReset ? 20 : 0 }}>
            {isPinReset
              ? "Your admin PIN has been updated. You can now log in with your new PIN."
              : "Your password has been changed successfully. Redirecting you to the POS..."}
          </div>
          {isPinReset && (
            <a href={backHref} style={{ display: "inline-block", background: GOLD, color: BLACK, borderRadius: 10, padding: "12px 24px", fontWeight: 900, fontSize: 14, textDecoration: "none" }}>
              Go to Login →
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── PIN RESET FORM ───────────────────────────────────────────────
  if (isPinReset) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1A1A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔐</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: GOLD, marginBottom: 6 }}>Set New Admin PIN</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>4–6 digits</div>

          <input
            type="password" inputMode="numeric" maxLength={6}
            placeholder="New admin PIN"
            value={newPin}
            onChange={function(e) { setNewPin(e.target.value.replace(/\D/g, "")); setError(""); }}
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM + "44", background: "rgba(255,255,255,0.06)", padding: "13px 14px", fontSize: 22, textAlign: "center", letterSpacing: "0.4em", boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 10 }}
          />

          <input
            type="password" inputMode="numeric" maxLength={6}
            placeholder="Confirm PIN"
            value={confirmPin}
            onChange={function(e) { setConfirmPin(e.target.value.replace(/\D/g, "")); setError(""); }}
            onKeyDown={function(e) { if (e.key === "Enter") handlePinReset(); }}
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (confirmPin.length > 0 && confirmPin !== newPin ? RED : GOLD_DIM + "44"), background: "rgba(255,255,255,0.06)", padding: "13px 14px", fontSize: 22, textAlign: "center", letterSpacing: "0.4em", boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 10 }}
          />

          {confirmPin.length > 0 && confirmPin === newPin && newPin.length >= 4 && (
            <div style={{ fontSize: 11, color: GREEN, marginBottom: 8 }}>✓ PINs match</div>
          )}

          {error && (
            <div style={{ color: RED, fontSize: 12, marginBottom: 10, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8 }}>{error}</div>
          )}

          <button
            onClick={handlePinReset}
            disabled={loading || !newPin || newPin !== confirmPin}
            style={{ width: "100%", background: GOLD, color: BLACK, border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 900, fontSize: 15, cursor: "pointer", opacity: loading || !newPin || newPin !== confirmPin ? 0.6 : 1 }}
          >
            {loading ? "Saving..." : "Save New PIN →"}
          </button>
        </div>
      </div>
    );
  }

  // ── PASSWORD RESET FORM (default) ────────────────────────────────
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
          onKeyDown={function(e) { if (e.key === "Enter") handlePasswordReset(); }}
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
          onClick={handlePasswordReset}
          disabled={loading || !password || password !== confirm}
          style={{ width: "100%", background: GOLD, color: BLACK, border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 900, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", opacity: loading || !password || password !== confirm ? 0.6 : 1 }}
        >
          {loading ? "Updating..." : "Update Password →"}
        </button>
      </div>
    </div>
  );
}
