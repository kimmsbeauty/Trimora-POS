// src/pages/DeviceLoginPage.jsx

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import SalonBrandmark from "../components/SalonBrandmark";
import GoldBtn from "../components/GoldBtn";
import { signInDevice } from "../lib/deviceAuth";
import { GOLD, BLACK, DARK, WHITE, RED } from "../lib/constants.js";
import { lighten, darken } from "../lib/colorUtils";
import { fetchPublicSalonBranding } from "../lib/SalonContext";

export default function DeviceLoginPage({ onSuccess, reauth }) {
  // This renders BEFORE the device is authenticated, so it can never
  // use SalonGate's mode="authenticated" path — that query is real
  // access control, gated on the device's own auth, and will correctly
  // return nothing for a device that hasn't signed in yet. Independent,
  // cosmetic-only lookup instead, same pattern as LoginPage's legacy
  // fallback. On the legacy unprefixed /pos route there's no :slug
  // param at all, which fetchPublicSalonBranding already handles by
  // falling back to KIMMS_SALON_ID internally — no special-casing
  // needed here.
  var params = useParams();
  var slug = params.slug;

  var salonState = useState(null);
  var salon = salonState[0]; var setSalon = salonState[1];

  useEffect(function() {
    var cancelled = false;
    fetchPublicSalonBranding(slug).then(function(result) {
      if (!cancelled) setSalon(result);
    });
    return function() { cancelled = true; };
  }, [slug]);

  var primary    = (salon && salon.primary_color) || GOLD;
  var secondary  = (salon && salon.secondary_color) || DARK;
  var primaryLt  = lighten(primary, 14);
  var primaryDim = darken(primary, 18);
  var bgStop3    = lighten(secondary, 3.5);
  var salonName  = (salon && salon.name) || "your salon";

  var emailState    = useState("");
  var email         = emailState[0]; var setEmail = emailState[1];

  var passwordState = useState("");
  var password       = passwordState[0]; var setPassword = passwordState[1];

  var showPassState = useState(false);
  var showPass      = showPassState[0]; var setShowPass = showPassState[1];

  var errorState    = useState("");
  var error         = errorState[0]; var setError = errorState[1];

  var loadingState  = useState(false);
  var loading       = loadingState[0]; var setLoading = loadingState[1];

  async function handleLogin() {
    if (!email || !password) return setError("Please enter both email and password.");
    setLoading(true);
    setError("");

    var result = await signInDevice(email, password);
    setLoading(false);

    if (result.ok) {
      onSuccess();
    } else {
      setError(result.error || "Login failed. Please try again.");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%," + secondary + " 60%," + bgStop3 + " 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>

      <div style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%", border: "2px solid " + primary, opacity: 0.1, pointerEvents: "none" }} />

      <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + primaryDim, borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>

        <SalonBrandmark salon={salon} size="lg" />
        <div style={{ borderTop: "1px solid " + primaryDim, margin: "24px 0 20px", opacity: 0.4 }} />

        <div style={{ fontSize: 16, fontWeight: 900, color: primaryLt, marginBottom: 8 }}>
          {reauth ? "Please Sign In Again" : "Activate This Device"}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.6 }}>
          {reauth
            ? "For your security, this device needs to sign in again."
            : "Sign in once to connect this device to " + salonName + "."}
        </div>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={function(e){ setEmail(e.target.value); setError(""); }}
          onKeyDown={function(e){ if (e.key === "Enter") handleLogin(); }}
          disabled={loading}
          style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (error ? RED : primaryDim), background: "rgba(255,255,255,0.06)", padding: "13px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 10 }}
        />

        <div style={{ position: "relative", marginBottom: 8 }}>
          <input
            type={showPass ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={function(e){ setPassword(e.target.value); setError(""); }}
            onKeyDown={function(e){ if (e.key === "Enter") handleLogin(); }}
            disabled={loading}
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (error ? RED : primaryDim), background: "rgba(255,255,255,0.06)", padding: "13px 44px 13px 14px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE }}
          />
          <button
            onClick={function() { setShowPass(!showPass); }}
            type="button"
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "rgba(255,255,255,0.4)", padding: 0, lineHeight: 1 }}
          >
            {showPass ? "🙈" : "👁"}
          </button>
        </div>

        {error && (
          <div style={{ color: RED, fontSize: 12, marginBottom: 8, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)" }}>
            {error}
          </div>
        )}

        <GoldBtn onClick={handleLogin} disabled={loading} style={{ width: "100%", marginTop: 8 }}>
          {loading ? "Signing in..." : "Sign In →"}
        </GoldBtn>

        <a
          href={(slug ? "/" + slug : "") + "/forgot-password"}
          style={{ display: "block", marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 700, textDecoration: "none" }}
        >
          Forgot password?
        </a>
      </div>
    </div>
  );
}
