// src/pages/LoginPage.jsx

import { useState, useEffect } from "react";
import SalonBrandmark from "../components/SalonBrandmark";
import GoldBtn from "../components/GoldBtn";
import { SUPABASE_URL, SUPABASE_KEY, GOLD, BLACK, DARK, WHITE, RED } from "../lib/constants.js";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./auto/theme";
import { lighten, darken } from "../lib/colorUtils";
import { useParams } from "react-router-dom";
import { useSalon, fetchPublicSalonBranding } from "../lib/SalonContext";
import { persistSession } from "../lib/deviceAuth";

var MAX_ATTEMPTS  = 3;
var LOCKOUT_SECS  = 30;

// Real fix for audit Critical-1: PIN entry itself now both verifies
// identity AND establishes the device session, in one step, via
// device-pin-login -- rather than a session being silently established
// beforehand (the old, vulnerable flow) and the PIN only checked after.
// No pre-existing session is required or used here.
async function verifyPin(salonId, role, pin) {
  try {
    var res = await fetch(SUPABASE_URL + "/functions/v1/device-pin-login", {
      method: "POST",
      headers: {
        "apikey":       SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ salon_id: salonId, role: role, pin: pin }),
    });
    var result = await res.json().catch(function() { return {}; });

    if (res.ok && result && result.success) {
      return { ok: true, session: result };
    }
    if (res.status === 401) {
      // Deliberately generic on the server (doesn't distinguish "wrong
      // PIN" from "locked out") -- treated the same here as an
      // incorrect attempt for the existing attempt-counter UI below.
      return { ok: false, wrong: true };
    }
    return { ok: false, wrong: false, error: result && result.error };
  } catch (e) {
    console.error("PIN verify error:", e);
    return { ok: false, wrong: false, networkError: true };
  }
}

export default function LoginPage({ onLogin, isAuto }) {
  // This component also renders on the legacy unprefixed /pos route,
  // which is never wrapped in SalonGate — so contextSalon is genuinely
  // null there, not just missing fields. We do an independent,
  // cosmetic-only lookup via fetchPublicSalonBranding(null), which
  // resolves to KIMMS_SALON_ID internally. This never touches the real
  // authenticated access-control path — it's purely so the legacy
  // route doesn't lose its real branding and fall back to generic chrome.
  var contextSalon = useSalon();

  // On slugged routes (/:slug/pos), SalonGate is in the tree and will provide
  // contextSalon once it resolves. We must NOT fall back to Kimms branding while
  // it is still loading — that causes the cross-salon branding flash.
  // On the legacy /pos route there is no SalonGate so contextSalon is always null;
  // that is the only case where we do the independent Kimms lookup.
  var routeParams = useParams();
  var isSlugRoute = !!(routeParams && routeParams.slug);

  var legacyBrandingState = useState(null);
  var legacyBranding = legacyBrandingState[0]; var setLegacyBranding = legacyBrandingState[1];

  useEffect(function() {
    // Only fetch fallback branding on the legacy /pos route (no slug in URL).
    if (contextSalon || isSlugRoute) return;
    var cancelled = false;
    fetchPublicSalonBranding(null).then(function(result) {
      if (!cancelled) setLegacyBranding(result);
    });
    return function() { cancelled = true; };
  }, [contextSalon, isSlugRoute]);

  var salon = contextSalon || (!isSlugRoute ? legacyBranding : null);

  // Update browser tab title to match the actual salon — prevents the
  // generic/stale title from showing in the tab while on a salon's page.
  useEffect(function() {
    if (salon && salon.name) {
      document.title = salon.name + " — Trimora POS";
    } else {
      document.title = "Trimora POS";
    }
  }, [salon]);

  var primary   = (salon && salon.primary_color) || GOLD;
  var secondary = (salon && salon.secondary_color) || DARK;
  var primaryLt = lighten(primary, 14);
  var primaryDim = darken(primary, 18);
  var bgStop3   = lighten(secondary, 3.5);
  var bookingHref = (salon && salon.slug) ? "/" + salon.slug + "/booking" : "/booking";

  // Feature-parity fix: Auto's login uses its own fixed theme.js
  // palette (same as every other Auto screen -- Board, Check-In,
  // Services), not per-salon custom branding the way POS's own login
  // does. Mirrors the exact isAuto pattern OnboardingPage.jsx already
  // established for the same distinction.
  var pageBg     = isAuto ? INK : "linear-gradient(160deg," + BLACK + " 0%," + secondary + " 60%," + bgStop3 + " 100%)";
  var panelBg    = isAuto ? STEEL : "rgba(255,255,255,0.04)";
  var panelBorder = isAuto ? CHROME + "44" : primaryDim;
  var accentColor = isAuto ? SIGNAL : primary;
  var accentColorLt = isAuto ? SIGNAL : primaryLt;
  var errorColor = isAuto ? ALERT : RED;
  var textColor  = isAuto ? PAPER : WHITE;
  var dimColor   = isAuto ? CHROME : "rgba(255,255,255,0.5)";
  var faintColor = isAuto ? CHROME + "88" : "rgba(255,255,255,0.25)";
  var inputBg    = isAuto ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)";
  var buttonTextColor = isAuto ? INK : BLACK;

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
    if (!salon || !salon.id) return setError("Salon context unavailable. Please refresh and try again.");
    setLoading(true);
    setError("");

    var result = await verifyPin(salon.id, role, pin);
    setLoading(false);

    if (result.ok) {
      // PIN correct — device-pin-login already established the session;
      // persist it here so the rest of the app (db.js, getValidAccessToken)
      // picks it up exactly as it would have from the old silent flow.
      persistSession(result.session, salon.id);
      setAttempts(0);
      setError("");
      onLogin(role);
    } else if (result.wrong) {
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
      // Network error or other failure — fall back to hardcoded check for offline resilience
      setPin("");
      setError(result.error || "Could not reach server. Check your connection.");
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
    <div style={{ minHeight: "100vh", background: pageBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>

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

      <div style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%", border: "2px solid " + accentColor, opacity: 0.1, pointerEvents: "none" }} />

      <div style={{ background: panelBg, border: "1.5px solid " + (locked ? errorColor : panelBorder), borderRadius: 24, padding: 36, maxWidth: 340, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.6)", transition: "border-color 0.3s" }}>

        <SalonBrandmark salon={salon} size="lg" />
        <div style={{ borderTop: "1px solid " + panelBorder, margin: "24px 0 20px", opacity: 0.4 }} />

        {/* Lockout screen */}
        {locked ? (
          <div>
            <span style={lockIconStyle}>🔒</span>
            <div style={{ fontSize: 16, fontWeight: 900, color: errorColor, marginBottom: 8 }}>Too many attempts</div>
            <div style={{ fontSize: 13, color: dimColor, marginBottom: 20, lineHeight: 1.6 }}>
              Please wait before trying again.
            </div>
            <div style={{ background: isAuto ? ALERT + "22" : "rgba(239,68,68,0.15)", border: "1.5px solid " + errorColor, borderRadius: 14, padding: "18px 0", marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: errorColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Retry in</div>
              <div style={{ fontSize: 42, fontWeight: 900, color: errorColor, fontFamily: "Georgia,serif" }}>{countdown}s</div>
            </div>
            <div style={{ fontSize: 11, color: faintColor }}>Access will restore automatically</div>
          </div>
        ) : (
          <div>
            {/* Role selector */}
            <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 3, marginBottom: 20, border: "1px solid " + panelBorder }}>
              {["staff", "admin"].map(function(r) {
                return (
                  <button key={r} onClick={function(){ switchRole(r); }} style={{
                    flex: 1, border: "none", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 700,
                    background: role === r ? "linear-gradient(135deg," + accentColor + "," + accentColorLt + ")" : "transparent",
                    color: role === r ? buttonTextColor : dimColor,
                    cursor: "pointer", transition: "all 0.2s",
                  }}>
                    {r === "admin" ? "👑 Admin" : "✂ Staff"}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 12, color: dimColor, marginBottom: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {role === "admin" ? "Owner PIN" : "Staff PIN"}
            </div>

            {/* Attempt dots */}
            {attempts > 0 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 10 }}>
                {[0,1,2].map(function(i) {
                  return (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < attempts ? errorColor : "rgba(255,255,255,0.15)", transition: "background 0.3s" }} />
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
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + (error ? errorColor : panelBorder), background: inputBg, padding: "13px 14px", fontSize: 24, textAlign: "center", letterSpacing: "0.4em", boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: textColor, marginBottom: 8, transition: "border-color 0.2s" }}
            />

            {error && (
              <div style={{ color: errorColor, fontSize: 12, marginBottom: 8, padding: "6px 10px", background: isAuto ? ALERT + "1a" : "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid " + (isAuto ? errorColor + "55" : "rgba(239,68,68,0.3)") }}>
                {error}
              </div>
            )}

            {isAuto ? (
              <button onClick={handleLogin} disabled={loading} style={{
                width: "100%", marginTop: 8, background: SIGNAL, color: INK, border: "none", borderRadius: 10,
                padding: "13px 0", fontWeight: 900, fontSize: 15, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
              }}>
                {loading ? "Verifying..." : "Login →"}
              </button>
            ) : (
              <GoldBtn onClick={handleLogin} disabled={loading} style={{ width: "100%", marginTop: 8 }}>
                {loading ? "Verifying..." : "Login →"}
              </GoldBtn>
            )}

            {role === "admin" && (
              <a
                href={(salon && salon.slug) ? "/" + salon.slug + "/forgot-pin" : "/forgot-pin"}
                style={{ display: "block", marginTop: 12, fontSize: 11, color: faintColor, fontWeight: 700, textDecoration: "none" }}
              >
                Forgot admin PIN? Click here to reset it.
              </a>
            )}
          </div>
        )}

        {!isAuto && (
          <div style={{ marginTop: 24, borderTop: "1px solid rgba(201,168,76,0.2)", paddingTop: 16 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Are you a customer?</div>
            <a href={bookingHref} style={{ fontSize: 13, color: primaryLt, fontWeight: 700, textDecoration: "none" }}>Book an appointment →</a>
          </div>
        )}
      </div>
    </div>
  );
}
