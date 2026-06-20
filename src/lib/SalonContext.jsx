// src/lib/SalonContext.jsx
//
// Resolves the :slug in the URL to an actual salon, and makes that
// salon available to whatever's rendered inside it via React Context.
//
// Step 8: also sets the shared currentSalonId (see currentSalon.js)
// whenever it resolves, so db.js can scope every request to it.

import { createContext, useContext, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { db } from "./db";
import { setCurrentSalonId } from "./currentSalon";

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
        setSalon(rows[0]);
        setCurrentSalonId(rows[0].id);
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
