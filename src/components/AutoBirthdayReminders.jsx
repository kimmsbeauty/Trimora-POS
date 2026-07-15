// src/components/AutoBirthdayReminders.jsx
//
// Auto-themed counterpart to components/BirthdayReminders.jsx (POS).
// Rebuilt rather than reused directly -- BirthdayReminders.jsx imports
// its colors straight from lib/constants.js (GOLD/BLACK/WHITE/CREAM/
// DARK), POS's own hardcoded palette, not a shared theme module. That
// would render a gold/black card inside Auto's ink/steel/signal-green
// UI. Matches this codebase's own established convention for exactly
// this situation -- AutoReceipt.jsx and AutoFeedbackModal.jsx were both
// deliberately rebuilt Auto-side for the identical reason (see their
// own header comments / the project handover's "Always reuse before
// creating new" section, which explicitly lists Receipt.jsx and
// FeedbackModal.jsx as the two things NOT to reuse for Auto, for this
// exact theme-divergence reason).
//
// Logic (isBirthdayToday, buildBirthdayMessage, the marketing-engine SMS
// call, the WhatsApp deep link) is otherwise identical to the POS
// version -- marketing_campaigns is Core data, shared, not POS-specific,
// so the same 'birthday' campaign type/table works unchanged from Auto.

import { useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "../lib/constants.js";
import { getValidAccessToken } from "../lib/deviceAuth";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "../pages/auto/theme";

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

export default function AutoBirthdayReminders({ customers, salonName, salon, birthdayCampaign }) {
  salonName = salonName || "your business";
  var sentState = useState({}); var sent = sentState[0]; var setSent = sentState[1];
  var collapsedState = useState(false); var collapsed = collapsedState[0]; var setCollapsed = collapsedState[1];
  var smsStatusState = useState({}); var smsStatus = smsStatusState[0]; var setSmsStatus = smsStatusState[1];

  var birthdayCustomers = (customers || []).filter(function (c) { return isBirthdayToday(c.date_of_birth); });

  function markSent(id) {
    setSent(function (p) { return Object.assign({}, p, { [id]: true }); });
  }

  async function sendBirthdaySms(customer) {
    if (!birthdayCampaign || !customer || !customer.id) return;
    var salonId = salon && salon.id;
    if (!salonId) return;
    setSmsStatus(function (p) { return Object.assign({}, p, { [customer.id]: "sending" }); });
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
          campaign_id: birthdayCampaign.id,
          customer_id: customer.id,
          salon_id: salonId,
        }),
      });
      var data = await res.json().catch(function () { return {}; });
      setSmsStatus(function (p) { return Object.assign({}, p, { [customer.id]: (data && data.success) ? "sent" : "error" }); });
    } catch (e) {
      setSmsStatus(function (p) { return Object.assign({}, p, { [customer.id]: "error" }); });
    }
  }

  if (birthdayCustomers.length === 0) return null;

  var sentCount = birthdayCustomers.filter(function (c) { return sent[c.id]; }).length;

  return (
    <div style={{ background: STEEL, borderRadius: 14, marginBottom: 16, border: "1.5px solid " + SIGNAL + "55", overflow: "hidden" }}>
      <div
        onClick={function () { setCollapsed(function (c) { return !c; }); }}
        style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🎂</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: PAPER }}>Birthdays Today</div>
            <div style={{ fontSize: 11, color: CHROME }}>{birthdayCustomers.length} customer{birthdayCustomers.length !== 1 ? "s" : ""} · {sentCount} sent</div>
          </div>
        </div>
        <span style={{ fontSize: 14, color: CHROME, transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▾</span>
      </div>

      {!collapsed && (
        <div style={{ padding: "0 16px 14px" }}>
          {birthdayCustomers.map(function (c) {
            var isSent = !!sent[c.id];
            var status = smsStatus[c.id] || "idle";
            var canSendSms = !!(birthdayCampaign && c.id && !c.marketing_opt_out);
            return (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid " + CHROME + "22" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: PAPER, display: "flex", alignItems: "center", gap: 6 }}>
                    {c.name}
                    {isSent && <span style={{ fontSize: 9, background: SIGNAL + "33", color: SIGNAL, padding: "2px 6px", borderRadius: 20, fontWeight: 800 }}>✓ Sent</span>}
                  </div>
                  <div style={{ fontSize: 11, color: CHROME }}>{c.phone || "No phone on file"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                  {canSendSms && (
                    <button
                      onClick={function () { sendBirthdaySms(c); }}
                      disabled={status === "sending" || status === "sent"}
                      title={status === "error" ? "Failed — tap to retry" : "Send birthday SMS"}
                      style={{
                        background: status === "sent" ? SIGNAL + "33" : status === "error" ? ALERT + "33" : SIGNAL,
                        color: status === "sent" ? SIGNAL : status === "error" ? ALERT : INK,
                        border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, cursor: (status === "sending" || status === "sent") ? "default" : "pointer", opacity: status === "sending" ? 0.6 : 1,
                      }}
                    >
                      {status === "sent" ? "✅" : status === "error" ? "⚠️" : status === "sending" ? "…" : "📩"}
                    </button>
                  )}
                  {c.phone ? (
                    <a
                      href={"https://wa.me/254" + c.phone.replace(/^0/, "").replace(/\D/g, "") + "?text=" + encodeURIComponent(buildBirthdayMessage(c, salonName))}
                      target="_blank" rel="noreferrer"
                      onClick={function () { markSent(c.id); }}
                      style={{ background: isSent ? CHROME + "33" : "#25D366", color: isSent ? CHROME : "#fff", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, textDecoration: "none" }}
                    >
                      📲
                    </a>
                  ) : (
                    <span style={{ fontSize: 10, color: CHROME }}>No phone</span>
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
