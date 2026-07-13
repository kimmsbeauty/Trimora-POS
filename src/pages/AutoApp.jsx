// src/pages/AutoApp.jsx
//
// Entry point for Trimora Auto, mirroring the shape of App.jsx's
// StaffRoute for POS: reuses the exact same LoginPage (staff PIN auth is
// device-session-based via DeviceGate/SalonGate, not Auto-specific --
// nothing about login needed to change). ModuleGate checks
// salon_enabled_modules before showing anything, so a salon with Auto
// disabled sees a clear, calm message instead of a broken or
// half-working screen.
//
// LoginPage's onLogin(role) is captured (role is "staff" or "admin",
// same distinction POS uses) to gate the Staff/Services tabs -- these
// are genuinely admin-only, matching POS's own admin-only nav items.
// Staff edits here operate on the same shared `staff` table POS uses
// (Core data, not an Auto-specific copy); Services edits operate on
// auto_services, which has no POS equivalent.

import { useState, useEffect } from "react";
import LoginPage from "./LoginPage";
import CheckInPage from "./auto/CheckInPage";
import BoardPage from "./auto/BoardPage";
import StaffPage from "./auto/StaffPage";
import ServicesPage from "./auto/ServicesPage";
import ReportsPage from "./auto/ReportsPage";
import ExpensesPage from "./auto/ExpensesPage";
import CustomersPage from "./auto/CustomersPage";
import AutoSettingsPage from "./auto/AutoSettingsPage";
import AutoSetupChecklist from "../components/AutoSetupChecklist";
import { useSalon } from "../lib/SalonContext";
import { db } from "../lib/db";
import { INK, STEEL, CHROME, PAPER, SIGNAL } from "./auto/theme";

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
  var isAdminState = useState(false);
  var isAdmin = isAdminState[0]; var setIsAdmin = isAdminState[1];
  var tabState = useState("checkin");
  var tab = tabState[0]; var setTab = tabState[1];

  if (!loggedIn) {
    return <LoginPage isAuto={true} onLogin={function (role) { setIsAdmin(role === "admin"); setLoggedIn(true); }} />;
  }

  var tabStyle = function (key) {
    var active = tab === key;
    return {
      flexShrink: 0, whiteSpace: "nowrap", textAlign: "center", padding: "12px 18px", fontSize: 13, fontWeight: 800,
      cursor: "pointer", color: active ? INK : CHROME, background: active ? SIGNAL : "transparent",
    };
  };

  var TABS = [
    { key: "checkin", label: "Check-In", adminOnly: false },
    { key: "board", label: "Queue & Bays", adminOnly: false },
    { key: "customers", label: "Customers", adminOnly: true },
    { key: "staff", label: "Staff", adminOnly: true },
    { key: "services", label: "Services", adminOnly: true },
    { key: "reports", label: "Reports", adminOnly: true },
    { key: "expenses", label: "Expenses", adminOnly: true },
    { key: "settings", label: "Settings", adminOnly: true },
  ];
  var visibleTabs = TABS.filter(function (t) { return !t.adminOnly || isAdmin; });

  var page;
  if (tab === "checkin") page = <CheckInPage />;
  else if (tab === "board") page = <BoardPage />;
  else if (tab === "customers") page = <CustomersPage />;
  else if (tab === "staff") page = <StaffPage isAdmin={isAdmin} />;
  else if (tab === "services") page = <ServicesPage isAdmin={isAdmin} />;
  else if (tab === "reports") page = <ReportsPage isAdmin={isAdmin} />;
  else if (tab === "settings") page = <AutoSettingsPage />;
  else page = <ExpensesPage isAdmin={isAdmin} />;

  return (
    <div>
      {isAdmin && <AutoSetupChecklist onNavigate={setTab} />}
      <div className="auto-tab-scroll" style={{
        display: "flex", background: STEEL, borderBottom: "1px solid rgba(143,166,184,0.15)",
        overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
      }}>
        {visibleTabs.map(function (t) {
          return <div key={t.key} className="auto-tab-item" style={tabStyle(t.key)} onClick={function () { setTab(t.key); }}>{t.label}</div>;
        })}
      </div>
      <style>{`
        .auto-tab-scroll::-webkit-scrollbar { display: none; }
        @media (min-width: 640px) {
          .auto-tab-item { flex: 1 1 0 !important; white-space: normal !important; }
        }
      `}</style>
      {page}
    </div>
  );
}

export default function AutoApp() {
  return (
    <ModuleGate>
      <AutoStaffRoute />
    </ModuleGate>
  );
}
