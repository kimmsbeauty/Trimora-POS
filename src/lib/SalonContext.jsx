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
      var table = mode === "public" ? "public_salon_directory" : "salons";
      var rows = await db("GET", table, null, "?slug=eq." + encodeURIComponent(slug) + "&limit=1");
      if (cancelled) return;

      if (rows && rows.length > 0) {
        var resolvedSalon = rows[0];

        // Block suspended salons — show suspended screen regardless of mode
        if (resolvedSalon.suspended) {
          setSalon(resolvedSalon);
          setCurrentSalonId(null);
          setStatus("suspended");
          return;
        }

        if (mode === "authenticated") {
          var settingsRows = await db("GET", "salon_settings", null, "?salon_id=eq." + encodeURIComponent(resolvedSalon.id) + "&limit=1");
          if (cancelled) return;

          if (settingsRows && settingsRows.length > 0) {
            resolvedSalon = Object.assign({}, resolvedSalon, {
              primary_color:   settingsRows[0].primary_color,
              secondary_color: settingsRows[0].secondary_color,
              logo_url:        settingsRows[0].logo_url,
              tagline:         settingsRows[0].tagline,
              mpesa_till:      settingsRows[0].mpesa_till,
              mpesa_name:      settingsRows[0].mpesa_name,
              contact_phone:   settingsRows[0].contact_phone,
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
