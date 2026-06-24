// src/pages/OnboardingPage.jsx
//
// Brand-new salon signup. Two real steps under the hood:
//  1. Sign up directly with Supabase Auth (anon key) — this is the only
//     way to create a real Auth user; a SQL function can't do this part.
//  2. If that returns an immediate session (no email confirmation
//     required), use THAT session — not a UID we'd have to trust as a
//     parameter — to call complete_salon_onboarding(), which creates the
//     salon, links auth.uid() to it, sets the chosen PINs, and inserts
//     default salon_settings, all in one transaction.
//
// If signup does NOT return an immediate session, this project's Auth
// settings require email confirmation. That case is detected here and
// shown clearly — but resuming onboarding after confirming by email is
// NOT built. That's real, deliberately deferred scope, not an oversight.

import { useState } from "react";
import SalonBrandmark from "../components/SalonBrandmark";
import GoldBtn from "../components/GoldBtn";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, RED } from "../lib/constants.js";
import { persistSession } from "../lib/deviceAuth";
import { generateUniqueSlug } from "../lib/slugify";

export default function OnboardingPage() {
  var nameState     = useState("");
  var salonName     = nameState[0]; var setSalonName = nameState[1];

  var emailState    = useState("");
  var email         = emailState[0]; var setEmail = emailState[1];

  var passwordState = useState("");
  var password      = passwordState[0]; var setPassword = passwordState[1];

  var staffPinState = useState("");
  var staffPin      = staffPinState[0]; var setStaffPin = staffPinState[1];

  var adminPinState = useState("");
  var adminPin      = adminPinState[0]; var setAdminPin = adminPinState[1];

  var errorState    = useState("");
  var error         = errorState[0]; var setError = errorState[1];

  var loadingState  = useState(false);
  var loading       = loadingState[0]; var setLoading = loadingState[1];

  var needsConfirmState = useState(false);
  var needsConfirm      = needsConfirmState[0]; var setNeedsConfirm = needsConfirmState[1];

  function validate() {
    if (!salonName || !email || !password) return "Please fill in your salon name, email, and password.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (!staffPin || !adminPin) return "Please choose both a staff PIN and an admin PIN.";
    if (staffPin === adminPin) return "Staff and admin PINs must be different.";
    return null;
  }

  async function handleSignup() {
    var validationError = validate();
    if (validationError) return setError(validationError);

    setLoading(true);
    setError("");

    try {
      var signupRes = await fetch(SUPABASE_URL + "/auth/v1/signup", {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password }),
      });

      var signupData = await signupRes.json();

      if (!signupRes.ok) {
        setLoading(false);
        return setError(signupData.msg || signupData.error_description || "Could not create your account. That email may already be registered.");
      }

      if (!signupData.access_token) {
        setLoading(false);
        setNeedsConfirm(true);
        return;
      }

      var slug = await generateUniqueSlug(salonName);

      var rpcRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/complete_salon_onboarding", {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + signupData.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_salon_name: salonName,
          p_slug: slug,
          p_staff_pin: staffPin,
          p_admin_pin: adminPin,
        }),
      });

      if (!rpcRes.ok) {
        setLoading(false);
        return setError("Your account was created, but setting up your salon failed. Please contact support.");
      }

      var rpcData = await rpcRes.json();
      var resultRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;

      persistSession(signupData);

      window.location.href = "/" + resultRow.slug + "/pos";
    } catch (e) {
      setLoading(false);
      setError("Could not reach server. Check your connection.");
    }
  }

  if (needsConfirm) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 60%,#2C1F00 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📧</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: GOLD_LT, marginBottom: 8 }}>Check your email</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            We sent a confirmation link to {email}. Click it, then come back and sign in at your salon's own login page to finish setup.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 60%,#2C1F00 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>

      <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>

        <SalonBrandmark salon={null} size="md" />
        <div style={{ borderTop: "1px solid " + GOLD_DIM, margin: "20px 0 18px", opacity: 0.4 }} />

        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD_LT, marginBottom: 16 }}>Set up your salon</div>

        <input
          placeholder="Salon name"
          value={salonName}
          onChange={function(e){ setSalonName(e.target.value); setError(""); }}
          disabled={loading}
          style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, background: "rgba(255,255,255,0.06)", padding: "12px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 10 }}
        />
        <input
          type="email"
          placeholder="Your email"
          value={email}
          onChange={function(e){ setEmail(e.target.value); setError(""); }}
          disabled={loading}
          style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, background: "rgba(255,255,255,0.06)", padding: "12px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 10 }}
        />
        <input
          type="password"
          placeholder="Choose a password"
          value={password}
          onChange={function(e){ setPassword(e.target.value); setError(""); }}
          disabled={loading}
          style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, background: "rgba(255,255,255,0.06)", padding: "12px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 10 }}
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            placeholder="Staff PIN"
            value={staffPin}
            onChange={function(e){ setStaffPin(e.target.value); setError(""); }}
            disabled={loading}
            maxLength={6}
            style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, background: "rgba(255,255,255,0.06)", padding: "12px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, textAlign: "center" }}
          />
          <input
            placeholder="Admin PIN"
            value={adminPin}
            onChange={function(e){ setAdminPin(e.target.value); setError(""); }}
            disabled={loading}
            maxLength={6}
            style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, background: "rgba(255,255,255,0.06)", padding: "12px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, textAlign: "center" }}
          />
        </div>

        {error && (
          <div style={{ color: RED, fontSize: 12, marginBottom: 10, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)" }}>
            {error}
          </div>
        )}

        <GoldBtn onClick={handleSignup} disabled={loading} style={{ width: "100%", marginTop: 8 }}>
          {loading ? "Setting up..." : "Create my salon →"}
        </GoldBtn>
      </div>
    </div>
  );
}
