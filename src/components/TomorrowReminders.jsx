// src/components/TomorrowReminders.jsx

import { useState } from "react";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, GREEN, AMBER, SUPABASE_URL, SUPABASE_KEY } from "../lib/constants.js";
import { getValidAccessToken } from "../lib/deviceAuth";

function normalizePhone(p) {
  return (p || "").replace(/\D/g, "").replace(/^0/, "254");
}

function findCustomerForAppointment(a, customers) {
  if (!a.phone || !customers) return null;
  var target = normalizePhone(a.phone);
  return customers.find(function(c) { return normalizePhone(c.phone) === target; }) || null;
}

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

export default function TomorrowReminders({ appointments, salonName, customers, salon, appointmentCampaign }) {
  salonName = salonName || "your salon";
  var sentState = useState({}); var sent = sentState[0]; var setSent = sentState[1];
  var collapsedState = useState(false); var collapsed = collapsedState[0]; var setCollapsed = collapsedState[1];
  var smsStatusState = useState({}); var smsStatus = smsStatusState[0]; var setSmsStatus = smsStatusState[1];

  var tomorrow = tomorrowStr();
  var tomorrowAppts = appointments
    .filter(function(a) { return a.date === tomorrow && a.status !== "cancelled"; })
    .sort(function(a, b) { return (a.time || "").localeCompare(b.time || ""); });

  function markSent(id) {
    setSent(function(p) { return Object.assign({}, p, { [id]: true }); });
  }

  // Manual, operator-triggered SMS reminder via the marketing engine — same
  // pattern as the post-sale thank-you button. Only offered when a matching
  // customer record exists (so opt-out can actually be checked) and an
  // appointment_reminder campaign is active for this salon.
  async function sendSmsReminder(appt, customer) {
    if (!appointmentCampaign || !customer || !customer.id) return;
    var salonId = salon && salon.id;
    if (!salonId) return;
    setSmsStatus(function(p) { return Object.assign({}, p, { [appt.id]: "sending" }); });
    try {
      var deviceToken = await getValidAccessToken();
      var res = await fetch(SUPABASE_URL + "/functions/v1/send-marketing-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + (deviceToken || SUPABASE_KEY),
        },
        body: JSON.stringify({
          campaign_id: appointmentCampaign.id,
          customer_id: customer.id,
          salon_id: salonId,
        }),
      });
      var data = await res.json().catch(function() { return {}; });
      setSmsStatus(function(p) { return Object.assign({}, p, { [appt.id]: (data && data.success) ? "sent" : "error" }); });
    } catch (e) {
      console.error("Appointment reminder SMS error:", e);
      setSmsStatus(function(p) { return Object.assign({}, p, { [appt.id]: "error" }); });
    }
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
            var matchedCustomer = findCustomerForAppointment(a, customers);
            var status = smsStatus[a.id] || "idle";
            var canSendSms = !!(appointmentCampaign && matchedCustomer && matchedCustomer.id && !matchedCustomer.marketing_opt_out);
            return (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK, display: "flex", alignItems: "center", gap: 6 }}>
                    {a.name}
                    {isSent && <span style={{ fontSize: 9, background: "#D1FAE5", color: "#065F46", padding: "2px 6px", borderRadius: 20, fontWeight: 800 }}>✓ Sent</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#888" }}>{a.time} · {a.service} · {a.stylist}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                  {canSendSms && (
                    <button
                      onClick={function() { sendSmsReminder(a, matchedCustomer); }}
                      disabled={status === "sending" || status === "sent"}
                      title={status === "error" ? "Failed — tap to retry" : "Send SMS reminder"}
                      style={{
                        background: status === "sent" ? "#D1FAE5" : status === "error" ? "#FEE2E2" : GOLD,
                        color: status === "sent" ? "#065F46" : status === "error" ? "#991B1B" : BLACK,
                        border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, cursor: (status === "sending" || status === "sent") ? "default" : "pointer", opacity: status === "sending" ? 0.6 : 1,
                      }}
                    >
                      {status === "sent" ? "✅" : status === "error" ? "⚠️" : status === "sending" ? "…" : "📩"}
                    </button>
                  )}
                  {a.phone ? (
                    <a
                      href={"https://wa.me/254" + a.phone.replace(/^0/,"").replace(/\D/g,"") + "?text=" + encodeURIComponent(buildReminderMessage(a, salonName))}
                      target="_blank" rel="noreferrer"
                      onClick={function() { markSent(a.id); }}
                      style={{ background: isSent ? "#E5E7EB" : "#25D366", color: isSent ? "#888" : WHITE, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, textDecoration: "none" }}
                    >
                      📲
                    </a>
                  ) : (
                    <span style={{ fontSize: 10, color: "#aaa" }}>No phone</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
