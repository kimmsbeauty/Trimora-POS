// src/components/BirthdayReminders.jsx

import { useState } from "react";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, GREEN, AMBER, SUPABASE_URL, SUPABASE_KEY } from "../lib/constants.js";

function isBirthdayToday(dob) {
  if (!dob) return false;
  var d = new Date(dob + "T00:00:00");
  var today = new Date();
  return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

function buildBirthdayMessage(c, salonName) {
  return "Happy Birthday " + (c.name || "").split(" ")[0] + "! 🎉\n\n" +
    "Everyone at *" + salonName + "* is wishing you a wonderful day. " +
    "Come treat yourself soon — we'd love to see you! 💛";
}

export default function BirthdayReminders({ customers, salonName, salon, birthdayCampaign }) {
  salonName = salonName || "your salon";
  var sentState = useState({}); var sent = sentState[0]; var setSent = sentState[1];
  var collapsedState = useState(false); var collapsed = collapsedState[0]; var setCollapsed = collapsedState[1];
  var smsStatusState = useState({}); var smsStatus = smsStatusState[0]; var setSmsStatus = smsStatusState[1];

  var birthdayCustomers = (customers || []).filter(function(c) { return isBirthdayToday(c.date_of_birth); });

  function markSent(id) {
    setSent(function(p) { return Object.assign({}, p, { [id]: true }); });
  }

  // Manual, operator-triggered birthday SMS via the marketing engine — same
  // pattern as the post-sale and appointment-reminder buttons. Dormant
  // until a birthday campaign is created and switched on.
  async function sendBirthdaySms(customer) {
    if (!birthdayCampaign || !customer || !customer.id) return;
    var salonId = salon && salon.id;
    if (!salonId) return;
    setSmsStatus(function(p) { return Object.assign({}, p, { [customer.id]: "sending" }); });
    try {
      var res = await fetch(SUPABASE_URL + "/functions/v1/send-marketing-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
        },
        body: JSON.stringify({
          campaign_id: birthdayCampaign.id,
          customer_id: customer.id,
          salon_id: salonId,
        }),
      });
      var data = await res.json().catch(function() { return {}; });
      setSmsStatus(function(p) { return Object.assign({}, p, { [customer.id]: (data && data.success) ? "sent" : "error" }); });
    } catch (e) {
      console.error("Birthday SMS error:", e);
      setSmsStatus(function(p) { return Object.assign({}, p, { [customer.id]: "error" }); });
    }
  }

  if (birthdayCustomers.length === 0) {
    return null;
  }

  var sentCount = birthdayCustomers.filter(function(c) { return sent[c.id]; }).length;

  return (
    <div style={{ background: WHITE, borderRadius: 14, marginBottom: 14, border: "1.5px solid " + GOLD + "66", overflow: "hidden" }}>
      <div
        onClick={function() { setCollapsed(function(c) { return !c; }); }}
        style={{ background: "linear-gradient(135deg,#FFF7ED,#FEF3C7)", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🎂</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#92400E" }}>Birthdays Today</div>
            <div style={{ fontSize: 11, color: "#B45309" }}>{birthdayCustomers.length} customer{birthdayCustomers.length !== 1 ? "s" : ""} · {sentCount} sent</div>
          </div>
        </div>
        <span style={{ fontSize: 14, color: "#92400E", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▾</span>
      </div>

      {!collapsed && (
        <div style={{ padding: "10px 14px 14px" }}>
          {birthdayCustomers.map(function(c) {
            var isSent = !!sent[c.id];
            var status = smsStatus[c.id] || "idle";
            var canSendSms = !!(birthdayCampaign && c.id && !c.marketing_opt_out);
            return (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK, display: "flex", alignItems: "center", gap: 6 }}>
                    {c.name}
                    {isSent && <span style={{ fontSize: 9, background: "#D1FAE5", color: "#065F46", padding: "2px 6px", borderRadius: 20, fontWeight: 800 }}>✓ Sent</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#888" }}>{c.phone || "No phone on file"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                  {canSendSms && (
                    <button
                      onClick={function() { sendBirthdaySms(c); }}
                      disabled={status === "sending" || status === "sent"}
                      title={status === "error" ? "Failed — tap to retry" : "Send birthday SMS"}
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
                  {c.phone ? (
                    <a
                      href={"https://wa.me/254" + c.phone.replace(/^0/,"").replace(/\D/g,"") + "?text=" + encodeURIComponent(buildBirthdayMessage(c, salonName))}
                      target="_blank" rel="noreferrer"
                      onClick={function() { markSent(c.id); }}
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
