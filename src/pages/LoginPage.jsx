// src/pages/LoginPage.jsx

import { useState, useEffect } from "react";
import SalonBrandmark from "../components/SalonBrandmark";
import GoldBtn from "../components/GoldBtn";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, BLACK, DARK, WHITE, RED } from "../lib/constants.js";
import { lighten, darken } from "../lib/colorUtils";
import { useSalon, fetchPublicSalonBranding } from "../lib/SalonContext";
import { getValidAccessToken } from "../lib/deviceAuth";

var MAX_ATTEMPTS  = 3;
var LOCKOUT_SECS  = 30;

async function verifyPin(role, pin) {
  try {
    var deviceToken = await getValidAccessToken();
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/verify_staff_pin", {
      method: "POST",
      headers: {
        "apikey":        SUPABASE_KEY,
        "Authorization": "Bearer " + (deviceToken || SUPABASE_KEY),
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ p_role: role, p_pin: pin }),
    });
    if (!res.ok) return null;
    var result = await res.json();
    return result === true;
  } catch (e) {
    console.error("PIN verify error:", e);
    return null;
  }
}

export default function LoginPage({ onLogin }) {
  // This component also renders on the legacy unprefixed /pos route,
  // which is never wrapped in SalonGate — so contextSalon is genuinely
  // null there, not just missing fields. Mirror the same fallback
  // DeviceLoginPage uses: an independent, cosmetic-only lookup via
  // fetchPublicSalonBranding(null), which resolves to KIMMS_SALON_ID
  // internally. This never touches the real authenticated
  // access-control path — it's purely so the legacy route doesn't lose
  // its real branding and fall back to generic chrome.
  var contextSalon = useSalon();

  var legacyBrandingState = useState(null);
  var legacyBranding = legacyBrandingState[0]; var setLegacyBranding = legacyBrandingState[1];

  useEffect(function() {
    if (contextSalon) return;
    var cancelled = false;
    fetchPublicSalonBranding(null).then(function(result) {
      if (!cancelled) setLegacyBranding(result);
    });
    return function() { cancelled = true; };
  }, [contextSalon]);

  var salon = contextSalon || legacyBranding;

  var primary   = (salon && salon.primary_color) || GOLD;
  var secondary = (salon && salon.secondary_color) || DARK;
  var primaryLt = lighten(primary, 14);
  var primaryDim = darken(primary, 18);
  var bgStop3   = lighten(secondary, 3.5);
  var bookingHref = (salon && salon.slug) ? "/" + salon.slug + "/booking" : "/booking";

  var pinState     = useState("");
  var pin          = pinState[0]; var setPin = pinState[1];

  var roleState    = useState("staff");
  var role         = roleState[0]; var setRole = roleState[1];

  var errorState   = useState("");
  var error        = errorState[0]; var setError = errorState[1];

  var attemptsState = useState(0);
  var attempts      = attemptsState[0]; var setAttempts = attemptsState[1];

  var lockedState  = useState(false);
  var locked       = lockedState[0]; var setLocked = lockedState[1];

  var countState   = useState(0);
  var countdown    = countState[0]; var setCountdown = countState[1];

  var loadingState = useState(false);
  var loading      = loadingState[0]; var setLoading = loadingState[1];

  var shakeState   = useState(false);
  var shake        = shakeState[0]; var setShake = shakeState[1];

  // Countdown timer when locked
  useEffect(function() {
    if (!locked) return;
    setCountdown(LOCKOUT_SECS);
    var interval = setInterval(function() {
      setCountdown(function(c) {
        if (c <= 1) {
          clearInterval(interval);
          setLocked(false);
          setAttempts(0);
          setError("");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return function() { clearInterval(interval); };
  }, [locked]);

  function triggerShake() {
    setShake(true);
    setTimeout(function() { setShake(false); }, 600);
  }

  async function handleLogin() {
    if (locked) return;
    if (!pin) return setError("Please enter your PIN");
    setLoading(true);
    setError("");

    var ok = await verifyPin(role, pin);
    setLoading(false);

    if (ok === true) {
      // Success
      setAttempts(0);
      setError("");
      onLogin(role);
    } else if (ok === false) {
      // Wrong PIN
      var newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin("");
      triggerShake();

      if (newAttempts >= MAX_ATTEMPTS) {
        setLocked(true);
        setError("");
      } else {
        var remaining = MAX_ATTEMPTS - newAttempts;
        setError("Incorrect PIN. " + remaining + " attempt" + (remaining !== 1 ? "s" : "") + " remaining.");
      }
    } else {
      // Network error — fall back to hardcoded check for offline resilience
      // (pins are still not exposed in source since we remove STAFF_PIN/ADMIN_PIN from constants)
      setPin("");
      setError("Could not reach server. Check your connection.");
      triggerShake();
    }
  }

  function switchRole(r) {
    setRole(r);
    setPin("");
    setError("");
    // Don't reset lockout when switching roles — lockout is per-session
  }

  var lockIconStyle = {
    fontSize: 48,
    display: "block",
    textAlign: "center",
    marginBottom: 8,
    animation: locked ? "lockPulse 1.5s ease-in-out infinite" : "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%," + secondary + " 60%," + bgStop3 + " 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>

      {/* Animated CSS */}
      <style>{`
        @keyframes lockPulse {
          0%   { transform: scale(1);    opacity: 1;   }
          50%  { transform: scale(1.15); opacity: 0.7; }
          100% { transform: scale(1);    opacity: 1;   }
        }
        @keyframes shake {
          0%,100% { transform: translateX(0);   }
          20%     { transform: translateX(-8px); }
          40%     { transform: translateX(8px);  }
          60%     { transform: translateX(-6px); }
          80%     { transform: translateX(6px);  }
        }
        .shake { animation: shake 0.6s ease; }
      `}</style>

      <div style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%", border: "2px solid " + primary, opacity: 0.1, pointerEvents: "none" }} />

      <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid " + (locked ? RED : primaryDim), borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.6)", transition: "border-color 0.3s" }}>

        <SalonBrandmark salon={salon} size="lg" />
        <div style={{ borderTop: "1px solid " + primaryDim, margin: "24px 0 20px", opacity: 0.4 }} />

        {/* Lockout screen */}
        {locked ? (
          <div>
            <span style={lockIconStyle}>🔒</span>
            <div style={{ fontSize: 16, fontWeight: 900, color: RED, marginBottom: 8 }}>Too many attempts</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.6 }}>
              Please wait before trying again.
            </div>
            <div style={{ background: "rgba(239,68,68,0.15)", border: "1.5px solid " + RED, borderRadius: 14, padding: "18px 0", marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: RED, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Retry in</div>
              <div style={{ fontSize: 42, fontWeight: 900, color: RED, fontFamily: "Georgia,serif" }}>{countdown}s</div>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Access will restore automatically</div>
          </div>
        ) : (
          <div>
            {/* Role selector */}
            <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 3, marginBottom: 20, border: "1px solid " + primaryDim }}>
              {["staff", "admin"].map(function(r) {
                return (
                  <button key={r} onClick={function(){ switchRole(r); }} style={{
                    flex: 1, border: "none", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 700,
                    background: role === r ? "linear-gradient(135deg," + primary + "," + primaryLt + ")" : "transparent",
                    color: role === r ? BLACK : "rgba(255,255,255,0.4)",
                    cursor: "pointer", transition: "all 0.2s",
                  }}>
                    {r === "admin" ? "👑 Admin" : "✂ Staff"}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {role === "admin" ? "Owner PIN" : "Staff PIN"}
            </div>

            {/* Attempt dots */}
            {attempts > 0 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 10 }}>
                {[0,1,2].map(function(i) {
                  return (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < attempts ? RED : "rgba(255,255,255,0.15)", transition: "background 0.3s" }} />
                  );
                })}
              </div>
            )}

            <input
              type="password"
              placeholder="Enter PIN"
              value={pin}
              onChange={function(e){ setPin(e.target.value); setError(""); }}
              onKeyDown={function(e){ if(e.key === "Enter") handleLogin(); }}
              maxLength={6}
              disabled={loading}
              className={shake ? "shake" : ""}
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (error ? RED : primaryDim), background: "rgba(255,255,255,0.06)", padding: "13px 14px", fontSize: 24, textAlign: "center", letterSpacing: "0.4em", boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 8, transition: "border-color 0.2s" }}
            />

            {error && (
              <div style={{ color: RED, fontSize: 12, marginBottom: 8, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)" }}>
                {error}
              </div>
            )}

            <GoldBtn onClick={handleLogin} disabled={loading} style={{ width: "100%", marginTop: 8 }}>
              {loading ? "Verifying..." : "Login →"}
            </GoldBtn>

            {role === "admin" && (
              <div style={{ display: "block", marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 700 }}>
                Forgot admin PIN? Contact Trimora support to reset it.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 24, borderTop: "1px solid rgba(201,168,76,0.2)", paddingTop: 16 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Are you a customer?</div>
          <a href={bookingHref} style={{ fontSize: 13, color: primaryLt, fontWeight: 700, textDecoration: "none" }}>Book an appointment →</a>
        </div>
      </div>
    </div>
  );
}
