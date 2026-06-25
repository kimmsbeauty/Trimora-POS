// src/components/SetupChecklist.jsx
//
// Shown to admin users on a freshly onboarded salon that hasn't
// completed basic setup yet. Detected by checking whether key
// salon_settings fields and services/staff are populated.
//
// Each checklist item deep-links to the relevant tab.
// Dismissed permanently once all items are complete, or manually.

import { useState } from "react";
import { GOLD, GOLD_DIM, GOLD_LT, WHITE, DARK, GREEN, AMBER } from "../lib/constants";

export default function SetupChecklist({ salon, servicesList, staffList, onNavigate }) {
  var [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  var checks = [
    {
      id:       "services",
      label:    "Add your first service",
      detail:   "Clients can't book without services listed.",
      done:     servicesList && servicesList.length > 0,
      tab:      "services",
      icon:     "✂️",
    },
    {
      id:       "staff",
      label:    "Add your first staff member",
      detail:   "Staff are needed for bookings and commission tracking.",
      done:     staffList && staffList.length > 0,
      tab:      "staff",
      icon:     "👥",
    },
    {
      id:       "branding",
      label:    "Set your logo and brand colors",
      detail:   "Make the app look like your salon.",
      done:     !!(salon && (salon.logo_url || salon.primary_color !== "#C9A84C")),
      tab:      "settings",
      icon:     "🎨",
    },
    {
      id:       "mpesa",
      label:    "Add your M-Pesa till number",
      detail:   "Required so customers can pay via M-Pesa.",
      done:     !!(salon && salon.mpesa_till),
      tab:      "settings",
      icon:     "📱",
    },
    {
      id:       "phone",
      label:    "Add your contact phone number",
      detail:   "Used for WhatsApp booking confirmations.",
      done:     !!(salon && salon.contact_phone),
      tab:      "settings",
      icon:     "📞",
    },
  ];

  var doneCount = checks.filter(function(c) { return c.done; }).length;
  var allDone   = doneCount === checks.length;

  // Auto-hide once everything is done
  if (allDone) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #FFFBEB, #FEF3C7)",
      border: "1.5px solid " + AMBER + "88",
      borderRadius: 14,
      padding: "14px 16px",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#92400E", display: "flex", alignItems: "center", gap: 6 }}>
            🚀 Finish setting up your salon
          </div>
          <div style={{ fontSize: 11, color: "#B45309", marginTop: 2 }}>
            {doneCount} of {checks.length} steps complete
          </div>
        </div>
        <button
          onClick={function() { setDismissed(true); }}
          style={{ background: "none", border: "none", fontSize: 16, color: "#B45309", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "rgba(180,83,9,0.15)", borderRadius: 4, marginBottom: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", width: (doneCount / checks.length * 100) + "%", background: "#F59E0B", borderRadius: 4, transition: "width 0.4s" }} />
      </div>

      {checks.map(function(c) {
        return (
          <div
            key={c.id}
            onClick={c.done ? undefined : function() { onNavigate(c.tab); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderBottom: "1px solid rgba(180,83,9,0.08)",
              cursor: c.done ? "default" : "pointer",
              opacity: c.done ? 0.6 : 1,
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
              background: c.done ? GREEN : "rgba(180,83,9,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 900, color: c.done ? WHITE : "#92400E",
            }}>
              {c.done ? "✓" : c.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", textDecoration: c.done ? "line-through" : "none" }}>
                {c.label}
              </div>
              {!c.done && <div style={{ fontSize: 10, color: "#B45309" }}>{c.detail}</div>}
            </div>
            {!c.done && (
              <div style={{ fontSize: 11, color: GOLD_DIM, fontWeight: 800 }}>Go →</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
