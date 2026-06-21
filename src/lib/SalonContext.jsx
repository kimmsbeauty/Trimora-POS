// src/lib/SalonContext.jsx
//
// Resolves the :slug in the URL to an actual salon, and makes that
// salon available to whatever's rendered inside it via React Context.
//
// Step 8: also sets the shared currentSalonId (see currentSalon.js)
// whenever it resolves, so db.js can scope every request to it.
//
// Branding step (Phase 2): for mode="authenticated", also fetches the
// matching salon_settings row (primary_color/secondary_color/logo_url)
// and merges it into the resolved salon object, so consumers never need
// to know it came from a second table. mode="public" already gets these
// fields for free, since public_salon_directory was widened to include
// them directly — no change needed for that path.// src/lib/SalonContext.jsx
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

        if (mode === "authenticated") {
          var settingsRows = await db("GET", "salon_settings", null, "?salon_id=eq." + encodeURIComponent(resolvedSalon.id) + "&limit=1");
          if (cancelled) return;

          if (settingsRows && settingsRows.length > 0) {
            resolvedSalon = Object.assign({}, resolvedSalon, {
              primary_color: settingsRows[0].primary_color,
              secondary_color: settingsRows[0].secondary_color,
              logo_url: settingsRows[0].logo_url,
              tagline: settingsRows[0].tagline,
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

    return function() { cancelled = true; };
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

        if (mode === "authenticated") {
          var settingsRows = await db("GET", "salon_settings", null, "?salon_id=eq." + encodeURIComponent(resolvedSalon.id) + "&limit=1");
          if (cancelled) return;

          if (settingsRows && settingsRows.length > 0) {
            resolvedSalon = Object.assign({}, resolvedSalon, {
              primary_color: settingsRows[0].primary_color,
              secondary_color: settingsRows[0].secondary_color,
              logo_url: settingsRows[0].logo_url,
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

    return function() { cancelled = true; };
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
