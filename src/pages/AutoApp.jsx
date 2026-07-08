// src/pages/AutoApp.jsx
//
// Entry point for Trimora Auto, mirroring the shape of App.jsx's
// StaffRoute for POS: reuses the exact same LoginPage (staff PIN auth is
// device-session-based via DeviceGate/SalonGate, not Auto-specific --
// nothing about login needed to change). The one thing genuinely new
// here is ModuleGate, checking salon_enabled_modules before showing
// anything, so a salon with Auto disabled sees a clear, calm message
// instead of a broken or half-working screen.

import { useState, useEffect } from "react";
import LoginPage from "./LoginPage";
import CheckInPage from "./auto/CheckInPage";
import { useSalon } from "../lib/SalonContext";
import { db } from "../lib/db";
import { INK, STEEL, CHROME, PAPER } from "./auto/theme";

function ModuleGate({ children }) {
  var salon = useSalon();
  var statusState = useState("checking");
  var status = statusState[0]; var setStatus = statusState[1];

  useEffect(function () {
    if (!salon || !salon.id) return;
    var cancelled = false;
    db("GET", "salon_enabled_modules", null, "?module_key=eq.auto&enabled=eq.true").then(
      function (rows) {
        if (cancelled) return;
        setStatus(rows && rows.length > 0 ? "enabled" : "disabled");
      }
    );
    return function () { cancelled = true; };
  }, [salon]);

  if (status === "checking") {
    return <div style={{ minHeight: "100vh", background: INK }} />;
  }

  if (status === "disabled") {
    return (
      <div style={{
        minHeight: "100vh", background: INK, color: PAPER, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 24, textAlign: "center", fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.02em", marginBottom: 8 }}>
          Trimora Auto isn't turned on for this business yet
        </div>
        <div style={{ fontSize: 13, color: CHROME, maxWidth: 320, lineHeight: 1.6 }}>
          Ask your Trimora account owner to enable it, or reach out to Trimora support.
        </div>
      </div>
    );
  }

  return children;
}

function AutoStaffRoute() {
  var loggedInState = useState(false);
  var loggedIn = loggedInState[0]; var setLoggedIn = loggedInState[1];

  if (!loggedIn) {
    return <LoginPage onLogin={function () { setLoggedIn(true); }} />;
  }
  return <CheckInPage />;
}

export default function AutoApp() {
  return (
    <ModuleGate>
      <AutoStaffRoute />
    </ModuleGate>
  );
}
