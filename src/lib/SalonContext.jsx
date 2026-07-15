// src/lib/SalonContext.jsx
//
// Resolves the :slug in the URL to an actual salon, and makes that
// salon available to whatever's rendered inside it via React Context.
//
// Step 8: also sets the shared currentSalonId (see currentSalon.js)
// whenever it resolves, so db.js can scope every request to it.
//
// Branding step (Phase 2): for mode="authenticated", also fetches the
// matching salon_settings row (primary_color/secondary_color/logo_url/
// tagline) and merges it into the resolved salon object, so consumers
// never need to know it came from a second table. mode="public" already
// gets these fields for free, since public_salon_directory was widened
// to include them directly — no change needed for that path.
//
// fetchPublicSalonBranding() below is a separate, deliberately decoupled
// helper for DeviceLoginPage. It needs salon branding for cosmetic
// purposes BEFORE the device is authenticated, so it can never go
// through the mode="authenticated" path above — that query is real
// access control, gated on the device's own auth, and will correctly
// return nothing for a device that hasn't signed in yet. Instead it
// reads the same safe, anon-readable public_salon_directory view
// BookingPage already relies on. On the legacy unprefixed /pos route
// (no slug param at all), it falls back to KIMMS_SALON_ID directly,
// matching the same fallback convention already used in db.js.

import { createContext, useContext, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { db } from "./db";
import { setCurrentSalonId } from "./currentSalon";
import { KIMMS_SALON_ID } from "./constants";

var SalonContext = createContext(null);

export function useSalon() {
  return useContext(SalonContext);
}

export function SalonGate({ mode, children }) {
  var params = useParams();
  var slug = params.slug;

  var statusState = useState("checking");
  var status = statusState[0]; var setStatus = statusState[1];

  var salonState = useState(null);
  var salon = salonState[0]; var setSalon = salonState[1];

  useEffect(function() {
    var cancelled = false;

    async function resolve() {
      setStatus("checking");
      var rows = await db("GET", "public_salon_directory", null, "?slug=eq." + encodeURIComponent(slug) + "&limit=1");
      if (cancelled) return;

      if (rows && rows.length > 0) {
        var resolvedSalon = Object.assign({}, rows[0], {
          enabled_payment_methods: rows[0].enabled_payment_methods || ["Cash", "Till"],
        });

        // Block suspended salons — show suspended screen regardless of mode
        if (resolvedSalon.suspended) {
          setSalon(resolvedSalon);
          setCurrentSalonId(null);
          setStatus("suspended");
          return;
        }

        // Check subscription expiry (only block on POS/authenticated routes)
        // Public booking page is never blocked — only warn admin inside POS
        if (mode === "authenticated") {
          var subStatus    = resolvedSalon.subscription_status;
          var subExpires   = resolvedSalon.subscription_expires_at;
          var isLifetime   = subStatus === "lifetime";
          var hasNoSub     = !subStatus; // new salon, no subscription yet

          if (!isLifetime && !hasNoSub && subStatus !== "active" && subExpires) {
            var expiresAt  = new Date(subExpires);
            var now        = new Date();
            var daysPast   = Math.floor((now - expiresAt) / (1000 * 60 * 60 * 24));
            // Grace period: 7 days after expiry
            if (daysPast > 7) {
              setSalon(resolvedSalon);
              setCurrentSalonId(null);
              setStatus("subscription_expired");
              return;
            }
            // Within grace period — let them in but flag it
            resolvedSalon = Object.assign({}, resolvedSalon, { subscription_grace: true, subscription_days_overdue: daysPast });
          }
        }

        if (mode === "authenticated") {
          var settingsRows = await db("GET", "salon_settings", null, "?salon_id=eq." + encodeURIComponent(resolvedSalon.id) + "&limit=1");
          if (cancelled) return;

          if (settingsRows && settingsRows.length > 0) {
            resolvedSalon = Object.assign({}, resolvedSalon, {
              primary_color:        settingsRows[0].primary_color,
              secondary_color:      settingsRows[0].secondary_color,
              logo_url:             settingsRows[0].logo_url,
              tagline:              settingsRows[0].tagline,
              mpesa_till:           settingsRows[0].mpesa_till,
              mpesa_name:           settingsRows[0].mpesa_name,
              contact_phone:        settingsRows[0].contact_phone,
              mpesa_paybill:        settingsRows[0].mpesa_paybill,
              mpesa_account:        settingsRows[0].mpesa_account,
              mpesa_send_money_phone: settingsRows[0].mpesa_send_money_phone,
              enabled_payment_methods: settingsRows[0].enabled_payment_methods || ["Cash", "Till"],
              referral_reward_pct: settingsRows[0].referral_reward_pct != null ? settingsRows[0].referral_reward_pct : 10,
              tax_enabled: !!settingsRows[0].tax_enabled,
              tax_rate: settingsRows[0].tax_rate != null ? settingsRows[0].tax_rate : 16,
              tax_pin: settingsRows[0].tax_pin || null,
              // subscription fields already on resolvedSalon from public_salon_directory
              // — preserve them explicitly so they aren't lost in the merge
              subscription_plan:       resolvedSalon.subscription_plan,
              subscription_status:     resolvedSalon.subscription_status,
              subscription_expires_at: resolvedSalon.subscription_expires_at,
            });
          }
        }

        setSalon(resolvedSalon);
        setCurrentSalonId(resolvedSalon.id);
        setStatus("ok");
      } else {
        setSalon(null);
        setCurrentSalonId(null);
        setStatus("not-found");
      }
    }

    if (slug) {
      resolve();
    } else {
      setStatus("not-found");
    }

    return function() {
      cancelled = true;
      // Defensive: if this gate is torn down (slug/mode changed, or the
      // component unmounts entirely), don't let a stale salon id outlive
      // it. Nothing in the app currently navigates between a slug route
      // and the legacy unprefixed routes without a full page reload
      // (checked: no useNavigate/<Link>/history.push anywhere, only
      // window.location.href and plain <a href>, which already reset
      // all module state) — but this costs nothing and removes the risk
      // permanently rather than relying on that staying true forever.
      setCurrentSalonId(null);
    };
  }, [slug, mode]);

  if (status === "checking") return null;

  if (status === "not-found") {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0A0A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, fontFamily: "sans-serif", padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Salon not found</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", maxWidth: 320 }}>
          This page doesn't exist, or this device doesn't have access to it.
        </div>
      </div>
    );
  }

  if (status === "suspended") {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0A0A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, fontFamily: "sans-serif", padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>⛔</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#EF4444" }}>Account Suspended</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", maxWidth: 320, lineHeight: 1.6 }}>
          This salon's account has been suspended. Please contact Trimora Systems to resolve this.
        </div>
        <a href="mailto:admin@trimorasystems.com" style={{ marginTop: 8, color: "#C9A84C", fontSize: 13, fontWeight: 700 }}>
          admin@trimorasystems.com
        </a>
      </div>
    );
  }

  if (status === "subscription_expired") {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0A0A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, fontFamily: "sans-serif", padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>⏰</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#F59E0B" }}>Subscription Expired</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", maxWidth: 320, lineHeight: 1.6 }}>
          Your Trimora POS subscription has expired. Please renew to continue using the system.
        </div>
        <a href="mailto:admin@trimorasystems.com" style={{ marginTop: 8, display: "inline-block", background: "#C9A84C", color: "#000", borderRadius: 10, padding: "12px 24px", fontWeight: 900, fontSize: 14, textDecoration: "none" }}>
          Contact us to Renew
        </a>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>admin@trimorasystems.com</div>
      </div>
    );
  }

  return (
    <SalonContext.Provider value={salon}>
      {children}
    </SalonContext.Provider>
  );
}

// Independent, decoupled lookup for DeviceLoginPage. Never goes through
// the authenticated path above — must work for a device that hasn't
// signed in yet. Reads the same safe, anon-readable view BookingPage
// already uses. Returns null if not found, so the caller can render a
// sensible fallback rather than nothing at all.
export async function fetchPublicSalonBranding(slug) {
  var filters = slug
    ? "?slug=eq." + encodeURIComponent(slug) + "&limit=1"
    : "?id=eq." + KIMMS_SALON_ID + "&limit=1";

  var rows = await db("GET", "public_salon_directory", null, filters);
  if (rows && rows.length > 0) return rows[0];
  return null;
}
