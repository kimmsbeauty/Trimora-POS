// src/pages/ForgotPinPage.jsx
//
// Allows a salon owner to reset their admin PIN when locked out.
// Flow:
//  1. Owner enters their email
//  2. We verify the email belongs to this salon's Auth user
//  3. Send a PIN reset link (custom token stored in salon_invites with type=pin_reset)
//  4. Owner clicks link → lands on /reset-pin?token=xxx
//  5. Enters new admin PIN → saved via update_salon_pin RPC
//
// For simplicity (no extra DB table), we reuse the password reset email
// flow — the owner proves identity by resetting their password, then
// we show a PIN reset form immediately after.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_DIM, BLACK, WHITE, RED, GREEN } from "../lib/constants.js";

export default function ForgotPinPage() {
  var params = useParams();
  var slug   = params.slug || "";

  var [step,      setStep]      = useState("email"); // email | sent | reset
  var [email,     setEmail]     = useState("");
  var [newPin,    setNewPin]    = useState("");
  var [confirmPin,setConfirmPin]= useState("");
  var [token,     setToken]     = useState("");
  var [loading,   setLoading]   = useState(false);
  var [error,     setError]     = useState("");
  var [done,      setDone]      = useState(false);

  // Check if we arrived here from a reset email (token in hash)
  if (step === "email" && window.location.hash.includes("type=recovery")) {
    var hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));
    var t = hashParams.get("access_token");
    if (t) { setToken(t); setStep("reset"); }
  }

  async function sendResetEmail() {
    if (!email.trim()) return setError("Please enter your email address.");
    setLoading(true); setError("");

    var redirectTo = window.location.origin + "/" + (slug ? slug + "/" : "") + "forgot-pin#";

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

  async function resetPin() {
    setError("");
    if (!newPin || !/^\d{4,6}$/.test(newPin)) return setError("PIN must be 4–6 digits.");
    if (newPin !== confirmPin) return setError("PINs do not match.");

    setLoading(true);

    // First update the password (required to use the token)
    // We use a placeholder — owner can change later in Settings
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

    // Now reset the admin PIN
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

  var backHref = slug ? "/" + slug + "/pos" : "/pos";

  // ── SUCCESS ─────────────────────────────────────────────────────
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

  // ── RESET PIN FORM ───────────────────────────────────────────────
  if (step === "reset") {
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
            onKeyDown={function(e) { if (e.key === "Enter") resetPin(); }}
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (confirmPin.length > 0 && confirmPin !== newPin ? RED : GOLD_DIM + "44"), background: "rgba(255,255,255,0.06)", padding: "13px 14px", fontSize: 22, textAlign: "center", letterSpacing: "0.4em", boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 10 }}
          />

          {confirmPin.length > 0 && confirmPin === newPin && newPin.length >= 4 && (
            <div style={{ fontSize: 11, color: GREEN, marginBottom: 8 }}>✓ PINs match</div>
          )}

          {error && (
            <div style={{ color: RED, fontSize: 12, marginBottom: 10, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8 }}>{error}</div>
          )}

          <button
            onClick={resetPin}
            disabled={loading || !newPin || newPin !== confirmPin}
            style={{ width: "100%", background: GOLD, color: BLACK, border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 900, fontSize: 15, cursor: "pointer", opacity: loading || !newPin || newPin !== confirmPin ? 0.6 : 1 }}
          >
            {loading ? "Saving..." : "Save New PIN →"}
          </button>
        </div>
      </div>
    );
  }

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
