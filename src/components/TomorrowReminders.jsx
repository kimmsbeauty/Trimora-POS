// src/components/TomorrowReminders.jsx

import { useState } from "react";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, GREEN, AMBER } from "../lib/constants.js";

function tomorrowStr() {
  var d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

function buildReminderMessage(a, salonName) {
  return "Hi " + a.name + "! 👋\n\n" +
    "This is a friendly reminder of your appointment tomorrow at *" + salonName + "*:\n\n" +
    "💇 " + a.service + "\n" +
    "👩‍💼 with " + a.stylist + "\n" +
    "🕐 " + a.time + "\n\n" +
    "We look forward to seeing you! Reply if you need to reschedule. 💕";
}

export default function TomorrowReminders({ appointments, salonName }) {
  salonName = salonName || "Kimm's Beauty Parlour";
  var sentState = useState({}); var sent = sentState[0]; var setSent = sentState[1];
  var collapsedState = useState(false); var collapsed = collapsedState[0]; var setCollapsed = collapsedState[1];

  var tomorrow = tomorrowStr();
  var tomorrowAppts = appointments
    .filter(function(a) { return a.date === tomorrow && a.status !== "cancelled"; })
    .sort(function(a, b) { return (a.time || "").localeCompare(b.time || ""); });

  function markSent(id) {
    setSent(function(p) { return Object.assign({}, p, { [id]: true }); });
  }

  if (tomorrowAppts.length === 0) {
    return (
      <div style={{ background: WHITE, borderRadius: 14, padding: "16px 18px", marginBottom: 14, border: "1px solid " + GOLD_DIM + "33", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 24 }}>✅</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>No appointments tomorrow</div>
          <div style={{ fontSize: 11, color: "#888" }}>Nothing to remind anyone about yet</div>
        </div>
      </div>
    );
  }

  var sentCount = tomorrowAppts.filter(function(a) { return sent[a.id]; }).length;

  return (
    <div style={{ background: WHITE, borderRadius: 14, marginBottom: 14, border: "1.5px solid " + AMBER + "66", overflow: "hidden" }}>
      <div
        onClick={function() { setCollapsed(function(c) { return !c; }); }}
        style={{ background: "linear-gradient(135deg,#FFFBEB,#FEF3C7)", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#92400E" }}>Tomorrow's Reminders</div>
            <div style={{ fontSize: 11, color: "#B45309" }}>{tomorrowAppts.length} appointment{tomorrowAppts.length !== 1 ? "s" : ""} · {sentCount} sent</div>
          </div>
        </div>
        <span style={{ fontSize: 14, color: "#92400E", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▾</span>
      </div>

      {!collapsed && (
        <div style={{ padding: "10px 14px 14px" }}>
          {tomorrowAppts.map(function(a) {
            var isSent = !!sent[a.id];
            return (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK, display: "flex", alignItems: "center", gap: 6 }}>
                    {a.name}
                    {isSent && <span style={{ fontSize: 9, background: "#D1FAE5", color: "#065F46", padding: "2px 6px", borderRadius: 20, fontWeight: 800 }}>✓ Sent</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#888" }}>{a.time} · {a.service} · {a.stylist}</div>
                </div>
                {a.phone ? (
                  <a
                    href={"https://wa.me/254" + a.phone.replace(/^0/,"").replace(/\D/g,"") + "?text=" + encodeURIComponent(buildReminderMessage(a, salonName))}
                    target="_blank" rel="noreferrer"
                    onClick={function() { markSent(a.id); }}
                    style={{ background: isSent ? "#E5E7EB" : "#25D366", color: isSent ? "#888" : WHITE, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, textDecoration: "none", flexShrink: 0, marginLeft: 8 }}
                  >
                    📲
                  </a>
                ) : (
                  <span style={{ fontSize: 10, color: "#aaa", flexShrink: 0 }}>No phone</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
