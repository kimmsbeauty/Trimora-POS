// src/lib/SalonContext.jsx
//
// Resolves the :slug in the URL to an actual salon, and makes that
// salon available to whatever's rendered inside it via React Context.
//
// This is plumbing only for now (Step 7) — nothing consumes the
// resolved salon yet. Step 8 is what actually wires it into real
// data-fetching. Until then, the pages rendered inside this wrapper
// behave exactly as they did before.

import { createContext, useContext, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { db } from "./db";

var SalonContext = createContext(null);

export function useSalon() {
  return useContext(SalonContext);
}

// mode="public"        -> resolves via the public_salon_directory view
//                          (works with no login at all — booking/rating pages)
// mode="authenticated"  -> resolves via the salons table itself. RLS
//                          already scopes this to the signed-in device's
//                          own row, so a slug that doesn't match the
//                          device's own salon returns nothing — by
//                          design, not as a special case we have to
//                          code separately.
export function SalonGate({ mode, children }) {
  var params = useParams();
  var slug = params.slug;

  var statusState = useState("checking"); // "checking" | "ok" | "not-found"
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
        setSalon(rows[0]);
        setStatus("ok");
      } else {
        setSalon(null);
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
