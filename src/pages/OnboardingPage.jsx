// src/pages/OnboardingPage.jsx
//
// Invite-only salon signup. Requires a valid ?token= in the URL.
// Token is validated via validate_invite() RPC (anon-callable).
// On successful signup, consume_invite() marks the token as used.
//
// Two real steps under the hood:
//  1. Sign up directly with Supabase Auth (anon key)
//  2. Use the returned session to call complete_salon_onboarding()
//
// If no token or invalid/expired token → shows "Invalid invite" screen.

import { useState, useEffect } from "react";
import SalonBrandmark from "../components/SalonBrandmark";
import GoldBtn from "../components/GoldBtn";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, RED, GREEN } from "../lib/constants.js";
import { persistSession } from "../lib/deviceAuth";
import { generateUniqueSlug } from "../lib/slugify";

var inputStyle = {
  width: "100%", borderRadius: 10,
  border: "1.5px solid " + GOLD_DIM,
  background: "rgba(255,255,255,0.06)",
  padding: "12px 14px", fontSize: 14,
  boxSizing: "border-box", fontFamily: "inherit",
  outline: "none", color: WHITE, marginBottom: 10,
};

export default function OnboardingPage() {
  // ── Invite token state ───────────────────────────────────────────
  var [tokenStatus, setTokenStatus] = useState("checking"); // checking | valid | invalid
  var [inviteToken, setInviteToken] = useState("");

  // ── Form fields ──────────────────────────────────────────────────
  var [salonName, setSalonName] = useState("");
  var [email,     setEmail]     = useState("");
  var [password,  setPassword]  = useState("");
  var [staffPin,  setStaffPin]  = useState("");
  var [adminPin,  setAdminPin]  = useState("");

  // ── UI state ─────────────────────────────────────────────────────
  var [showPass,  setShowPass]  = useState(false);
  var [termsAccepted, setTermsAccepted] = useState(false);
  var [fatalError, setFatalError] = useState("");
  var [loading,      setLoading]      = useState(false);
  var [needsConfirm, setNeedsConfirm] = useState(false);
  var [error,        setError]        = useState("");

  // ── Validate token on mount ──────────────────────────────────────
  useEffect(function() {
    async function checkToken() {
      var params = new URLSearchParams(window.location.search);
      var token  = params.get("token");

      if (!token) {
        setTokenStatus("invalid");
        return;
      }

      try {
        var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/validate_invite", {
          method: "POST",
          headers: {
            apikey:         SUPABASE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_token: token }),
        });

        if (!res.ok) {
          setTokenStatus("invalid");
          return;
        }

        var data = await res.json();

        if (data && data.valid) {
          setInviteToken(token);
          if (data.email)      setEmail(data.email);
          if (data.salon_name) setSalonName(data.salon_name);
          setTokenStatus("valid");
        } else {
          setTokenStatus("invalid");
        }
      } catch (e) {
        console.error("Token validation error:", e);
        setTokenStatus("invalid");
      }
    }

    checkToken();
  }, []);

  function validate() {
    if (!salonName.trim()) return "Please enter your salon name.";
    if (!email.trim())     return "Please enter your email address.";
    if (!password || password.length < 6) return "Password must be at least 6 characters.";
    if (!staffPin || !adminPin) return "Please choose both a staff PIN and an admin PIN.";
    if (!/^\d{4,6}$/.test(staffPin)) return "Staff PIN must be 4–6 digits.";
    if (!/^\d{4,6}$/.test(adminPin)) return "Admin PIN must be 4–6 digits.";
    if (staffPin === adminPin) return "Staff and admin PINs must be different.";
    if (!termsAccepted) return "Please read and accept the Terms & Conditions to continue.";
    return null;
  }

  async function handleSignup() {
    var err = validate();
    if (err) return setError(err);

    setLoading(true);
    setError("");

    try {
      // Step 1: Create Supabase Auth user
      var signupRes = await fetch(SUPABASE_URL + "/auth/v1/signup", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
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

      // Step 2: Create salon via RPC
      var slug;
      try {
        slug = await generateUniqueSlug(salonName);
      } catch (slugErr) {
        setLoading(false);
        return setError("Failed to generate salon URL. Please try again. (" + slugErr.message + ")");
      }

      var rpcRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/complete_salon_onboarding", {
        method: "POST",
        headers: {
          apikey:          SUPABASE_KEY,
          Authorization:   "Bearer " + signupData.access_token,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          p_salon_name: salonName.trim(),
          p_slug:       slug,
          p_staff_pin:  staffPin,
          p_admin_pin:  adminPin,
        }),
      });

      if (!rpcRes.ok) {
        var rpcErr = await rpcRes.json().catch(function() { return {}; });
        setLoading(false);
        return setError("Salon setup failed: " + (rpcErr.message || rpcErr.hint || rpcErr.details || JSON.stringify(rpcErr) || "Unknown error. Contact support."));
      }

      var rpcData   = await rpcRes.json();
      // The RPC returns a composite type (salon_id, slug) which Supabase
      // wraps as [{"complete_salon_onboarding":"(uuid,slug-value)"}]
      // Parse the composite string to extract the slug.
      var resultRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      var slug_result  = null;
      var salonId_result = null;

      if (resultRow) {
        // Try direct object first (in case it returns named columns)
        if (resultRow.slug) {
          slug_result    = resultRow.slug;
          salonId_result = resultRow.salon_id || null;
        } else if (resultRow.p_slug) {
          slug_result = resultRow.p_slug;
        } else {
          // Parse composite type string: "(uuid-value,slug-value)"
          var composite = resultRow.complete_salon_onboarding || Object.values(resultRow)[0] || "";
          var match = String(composite).match(/^\(([^,]+),(.+)\)$/);
          if (match) {
            salonId_result = match[1].trim();
            slug_result    = match[2].trim();
          }
        }
      }

      if (!slug_result) {
        setLoading(false);
        return setError("Salon was created but redirect failed. Your salon is active — contact support to get your login link. Raw: " + JSON.stringify(rpcData));
      }

      // Step 3: Mark invite as used
      await fetch(SUPABASE_URL + "/rest/v1/rpc/consume_invite", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_token: inviteToken }),
      });

      // Step 3.5: Set up silent device login for this new salon.
      // Fire-and-forget — a failure here must NOT block the salon from
      // getting their login link. If it silently fails, the auto-resync
      // in silent-device-login will recover it on first access anyway.
      // NOTE: admin-set-device-secret now requires the Supabase SERVICE
      // ROLE key (hardened for security), which the browser never has
      // access to. We deliberately do NOT call it from here anymore —
      // calling it with the anon key would just get a 401 every time.
      // This is safe to skip: silent-device-login auto-resyncs the
      // device secret on the salon's very first /pos visit anyway, so
      // the new owner's first login transparently sets it up with zero
      // manual steps and zero broken state in between.

      // Step 4: Persist device session and redirect
      persistSession(signupData);
      window.location.href = "/" + slug_result + "/pos";

    } catch (e) {
      setLoading(false);
      console.error("Onboarding error:", e);
      setError("Unexpected error: " + (e.message || "Please try again or contact support."));
    }
  }

  // ── FATAL ERROR ──────────────────────────────────────────────────
  if (fatalError) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + RED, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: RED, marginBottom: 10 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.6 }}>{fatalError}</div>
          <a href="mailto:admin@trimorasystems.com" style={{ color: GOLD, fontWeight: 800, fontSize: 13 }}>Contact support →</a>
        </div>
      </div>
    );
  }

  // ── CHECKING token ───────────────────────────────────────────────
  if (tokenStatus === "checking") {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 60%,#2C1F00 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: GOLD_DIM, fontSize: 14 }}>Validating invite...</div>
      </div>
    );
  }

  // ── INVALID token ────────────────────────────────────────────────
  if (tokenStatus === "invalid") {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 60%,#2C1F00 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <SalonBrandmark salon={null} size="md" />
          <div style={{ borderTop: "1px solid " + GOLD_DIM, margin: "20px 0 18px", opacity: 0.4 }} />
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: GOLD_LT, marginBottom: 10 }}>Invite Required</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
            This link is invalid or has already been used.<br /><br />
            To get started with Trimora POS, contact us:
          </div>
          <a href="mailto:admin@trimorasystems.com"
            style={{ display: "inline-block", marginTop: 16, color: GOLD, fontWeight: 800, fontSize: 13 }}>
            admin@trimorasystems.com
          </a>
        </div>
      </div>
    );
  }

  // ── NEEDS EMAIL CONFIRMATION ─────────────────────────────────────
  if (needsConfirm) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 60%,#2C1F00 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📧</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: GOLD_LT, marginBottom: 8 }}>Check your email</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            We sent a confirmation link to <b style={{ color: GOLD_DIM }}>{email}</b>. Click it, then contact us to complete your salon setup.
          </div>
          <a href="mailto:admin@trimorasystems.com"
            style={{ display: "inline-block", marginTop: 16, color: GOLD, fontWeight: 800, fontSize: 13 }}>
            admin@trimorasystems.com
          </a>
        </div>
      </div>
    );
  }

  // ── VALID INVITE — show signup form ──────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 60%,#2C1F00 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + GOLD_DIM, borderRadius: 24, padding: 36, maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>

        <SalonBrandmark salon={null} size="md" />
        <div style={{ borderTop: "1px solid " + GOLD_DIM, margin: "20px 0 18px", opacity: 0.4 }} />

        <div style={{ fontSize: 16, fontWeight: 900, color: GOLD_LT, marginBottom: 4 }}>Set up your salon</div>
        <div style={{ fontSize: 11, color: GOLD_DIM + "88", marginBottom: 20 }}>
          ✓ Invite verified — you're good to go
        </div>

        <input placeholder="Salon name" value={salonName}
          onChange={function(e) { setSalonName(e.target.value); setError(""); }}
          disabled={loading} style={inputStyle} />

        <input type="email" placeholder="Your email" value={email}
          onChange={function(e) { setEmail(e.target.value); setError(""); }}
          disabled={loading} style={inputStyle} />

        <div style={{ position: "relative", marginBottom: 10 }}>
          <input type={showPass ? "text" : "password"} placeholder="Choose a password (min 6 chars)" value={password}
            onChange={function(e) { setPassword(e.target.value); setError(""); }}
            disabled={loading}
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, background: "rgba(255,255,255,0.06)", padding: "12px 44px 12px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE }}
          />
          <button onClick={function() { setShowPass(!showPass); }} type="button"
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "rgba(255,255,255,0.4)", padding: 0, lineHeight: 1 }}>
            {showPass ? "🙈" : "👁"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 8, width: "100%" }}>
          <input
            placeholder="Staff PIN" value={staffPin} maxLength={6} inputMode="numeric"
            onChange={function(e) { setStaffPin(e.target.value.replace(/\D/g, "")); setError(""); }}
            disabled={loading}
            style={{ flex: 1, minWidth: 0, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, background: "rgba(255,255,255,0.06)", padding: "12px 8px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, textAlign: "center" }}
          />
          <input
            placeholder="Admin PIN" value={adminPin} maxLength={6} inputMode="numeric"
            onChange={function(e) { setAdminPin(e.target.value.replace(/\D/g, "")); setError(""); }}
            disabled={loading}
            style={{ flex: 1, minWidth: 0, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, background: "rgba(255,255,255,0.06)", padding: "12px 8px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, textAlign: "center" }}
          />
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 14, textAlign: "left" }}>
          Staff PIN: for all staff · Admin PIN: for salon owner only. Both 4–6 digits, must be different.
        </div>

        {error && (
          <div style={{ color: RED, fontSize: 12, marginBottom: 10, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)" }}>
            {error}
          </div>
        )}

        {/* T&C checkbox */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, textAlign: "left" }}>
          <input
            type="checkbox"
            id="terms"
            checked={termsAccepted}
            onChange={function(e) { setTermsAccepted(e.target.checked); setError(""); }}
            style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: "#C9A84C", cursor: "pointer" }}
          />
          <label htmlFor="terms" style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, cursor: "pointer" }}>
            I have read and agree to the{" "}
            <a href="/terms" target="_blank" rel="noreferrer"
              style={{ color: "#C9A84C", fontWeight: 800, textDecoration: "underline" }}>
              Terms & Conditions
            </a>
            {" "}of Trimora POS. I understand the subscription plans, data ownership policy, and the 7-day grace period for late payments.
          </label>
        </div>

        <GoldBtn onClick={handleSignup} disabled={loading || !termsAccepted} style={{ width: "100%", marginTop: 4, opacity: !termsAccepted ? 0.5 : 1 }}>
          {loading ? "Setting up your salon..." : "Create my salon →"}
        </GoldBtn>

        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 16 }}>
          © 2026 Trimora Systems · Nairobi, Kenya
        </div>
      </div>
    </div>
  );
}


