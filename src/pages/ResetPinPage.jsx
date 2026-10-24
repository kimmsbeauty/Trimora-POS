// src/pages/ResetPinPage.jsx
//
// Dedicated page for admin PIN reset via recovery email.
// ForgotPinPage sets redirectTo = /reset-pin (no query params needed —
// the path itself signals PIN reset mode to avoid Supabase stripping query strings).
//
// Flow: recovery email → /reset-pin#access_token=xxx&type=recovery
//       → extract token → show PIN form → call reset_salon_admin_pin_via_recovery RPC (bcrypt server-side; see src/lib/pinApi.js)

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_DIM, BLACK, WHITE, RED, GREEN } from "../lib/constants.js";
import { resetAdminPinViaRecovery } from "../lib/pinApi.js";

export default function ResetPinPage() {
  var [token,      setToken]      = useState("");
  var [tokenError, setTokenError] = useState(false);
  var [newPin,     setNewPin]     = useState("");
  var [confirmPin, setConfirmPin] = useState("");
  var [loading,    setLoading]    = useState(false);
  var [error,      setError]      = useState("");
  var [done,       setDone]       = useState(false);

  // Slug from route path (/reset-pin/:slug) — works cross-browser/incognito.
  // Falls back to localStorage for same-browser sessions.
  var routeParams = useParams();
  function validSlug(s) { return !!(s && /^[a-z0-9][a-z0-9-]{2,}$/.test(s)); }
  var slug = (validSlug(routeParams.slug) ? routeParams.slug : null)
          || (validSlug(window.localStorage.getItem("trimora_pin_reset_slug")) ? window.localStorage.getItem("trimora_pin_reset_slug") : null)
          || "";
  var backHref = slug ? "/" + slug + "/pos" : "/pos";

  useEffect(function() {
    var hash         = window.location.hash || "";
    var search       = window.location.search || "";
    var hashParams   = new URLSearchParams(hash.replace(/^#/, ""));
    var searchParams = new URLSearchParams(search.replace(/^\?/, ""));
    var t = hashParams.get("access_token") || searchParams.get("access_token");
    if (t) {
      setToken(t);
    } else {
      setTokenError(true);
    }
  }, []);

  async function handlePinReset() {
    setError("");
    if (!newPin || !/^\d{4,6}$/.test(newPin)) return setError("PIN must be 4–6 digits.");
    if (newPin !== confirmPin) return setError("PINs do not match.");

    setLoading(true);

    // Consume the recovery token by setting a placeholder password
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

    // Reset the admin PIN. Needs the email-link session (migration 090); see src/lib/pinApi.js
    // for the temporary legacy fallback.
    var pinResult = await resetAdminPinViaRecovery({ token: token, newPin: newPin });

    setLoading(false);

    if (pinResult.ok) {
      window.localStorage.removeItem("trimora_pin_reset_slug");
      setDone(true);
    } else {
      setError("PIN reset failed: " + (pinResult.error || "Please contact support."));
    }
  }

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
          <div style={{ fontSize: 17, fontWeight: 900, color: GREEN, marginBottom: 10 }}>Admin PIN Reset!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.6 }}>
            Your admin PIN has been updated. You can now log in with your new PIN.
          </div>
          <a href={backHref} style={{ display: "inline-block", background: GOLD, color: BLACK, borderRadius: 10, padding: "12px 24px", fontWeight: 900, fontSize: 14, textDecoration: "none" }}>
            Go to Login →
          </a>
        </div>
      </div>
    );
  }

  // ── PIN RESET FORM ───────────────────────────────────────────────
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
          disabled={loading || newPin.length < 4 || newPin !== confirmPin}
          style={{ width: "100%", background: GOLD, color: BLACK, border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 900, fontSize: 15, cursor: "pointer", opacity: loading || newPin.length < 4 || newPin !== confirmPin ? 0.6 : 1 }}
        >
          {loading ? "Saving..." : "Save New PIN →"}
        </button>
      </div>
    </div>
  );
}
