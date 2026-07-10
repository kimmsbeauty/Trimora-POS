// src/components/AutoSetupChecklist.jsx
//
// Matches POS's SetupChecklist.jsx pattern (dismissible, progress bar,
// deep-links to the relevant tab, auto-hides once complete) but scoped
// to what's genuinely Auto-specific. Staff/branding/M-Pesa/phone are
// all Core setup POS's own checklist already covers -- a salon with
// Auto enabled already has staff and M-Pesa configured from onboarding
// POS in the first place, so re-checking those here would almost
// always show as already done and add noise, not signal.
//
// Self-contained: fetches its own minimal counts on mount rather than
// depending on data already loaded by whichever tab happens to be
// active, since this renders above the tab bar in AutoApp.jsx.

import { useState, useEffect } from "react";
import { db } from "../lib/db";
import { STEEL, CHROME, SIGNAL, PAPER, ALERT } from "../pages/auto/theme";

export default function AutoSetupChecklist({ onNavigate }) {
  var dismissedState = useState(false); var dismissed = dismissedState[0]; var setDismissed = dismissedState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var countsState = useState({ services: 0, bays: 0, staff: 0 });
  var counts = countsState[0]; var setCounts = countsState[1];

  useEffect(function () {
    async function load() {
      var results = await Promise.all([
        db("GET", "auto_services", null, "?active=eq.true&select=id"),
        db("GET", "auto_bays", null, "?active=eq.true&select=id"),
        db("GET", "staff", null, "?active=eq.true&select=id"),
      ]);
      setCounts({
        services: (results[0] || []).length,
        bays: (results[1] || []).length,
        staff: (results[2] || []).length,
      });
      setLoading(false);
    }
    load();
  }, []);

  if (dismissed || loading) return null;

  var checks = [
    { id: "services", label: "Add your first service", detail: "Jobs can't be created without services listed.", done: counts.services > 0, tab: "services", icon: "🧴" },
    { id: "bays", label: "Add your first bay", detail: "Jobs can't be assigned or started without a bay.", done: counts.bays > 0, tab: "services", icon: "🅿️" },
    { id: "staff", label: "Have at least one active staff member", detail: "Staff assignment is required before a job can start (Phase 4).", done: counts.staff > 0, tab: "staff", icon: "👤" },
  ];

  var doneCount = checks.filter(function (c) { return c.done; }).length;
  if (doneCount === checks.length) return null;

  return (
    <div style={{
      background: STEEL, border: "1.5px solid " + SIGNAL + "88", borderRadius: 14,
      padding: "14px 16px", margin: "16px", marginBottom: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: PAPER }}>🚀 Finish setting up Trimora Auto</div>
          <div style={{ fontSize: 11, color: CHROME, marginTop: 2 }}>{doneCount} of {checks.length} steps complete</div>
        </div>
        <span onClick={function () { setDismissed(true); }} style={{ cursor: "pointer", fontSize: 16, color: CHROME, padding: "0 4px" }}>×</span>
      </div>

      <div style={{ height: 4, background: CHROME + "22", borderRadius: 4, marginBottom: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", width: (doneCount / checks.length * 100) + "%", background: SIGNAL, borderRadius: 4 }} />
      </div>

      {checks.map(function (c) {
        return (
          <div key={c.id}
            onClick={c.done ? undefined : function () { onNavigate(c.tab); }}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
              borderBottom: "1px solid " + CHROME + "22", cursor: c.done ? "default" : "pointer", opacity: c.done ? 0.55 : 1,
            }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
              background: c.done ? SIGNAL : ALERT + "22", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 900, color: c.done ? STEEL : ALERT,
            }}>
              {c.done ? "✓" : c.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PAPER, textDecoration: c.done ? "line-through" : "none" }}>{c.label}</div>
              {!c.done && <div style={{ fontSize: 10, color: CHROME }}>{c.detail}</div>}
            </div>
            {!c.done && <div style={{ fontSize: 11, color: SIGNAL, fontWeight: 800 }}>Go →</div>}
          </div>
        );
      })}
    </div>
  );
}
