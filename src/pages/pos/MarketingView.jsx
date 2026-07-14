// src/pages/pos/MarketingView.jsx
//
// Extracted from POSApp.jsx (was the `page === "marketing"` inline
// block). Mechanical extraction only — no logic changes. The JSX body
// below was extracted directly from the original file via script (not
// retyped) to guarantee byte-for-byte fidelity. Campaign/broadcast
// state and the eligibleFor/sendBroadcast/saveCampaignSettings/
// toggleSmsActive handlers still live in and are owned by POSApp.jsx;
// this component is purely presentational.

import CampaignEditorCard from "../../components/CampaignEditorCard.jsx";
import { BLACK, GOLD, GOLD_DIM, DARK, WHITE } from "../../lib/constants.js";

export default function MarketingView({
  marketingConfig,
  toggleSmsActive,
  allCampaigns,
  saveCampaignSettings,
  broadcastSegment,
  setBroadcastSegment,
  broadcastSending,
  eligibleFor,
  broadcastRecipients,
  broadcastMessage,
  setBroadcastMessage,
  broadcastDone,
  setBroadcastDone,
  broadcastProgress,
  setBroadcastProgress,
  sendBroadcast,
}) {
  return (
          <div style={{ padding: "4px 0" }}>

            <div style={{ background: WHITE, borderRadius: 14, padding: 18, border: "1.5px solid " + GOLD_DIM + "66", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>⚙️ Automated Messages</div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: (marketingConfig && marketingConfig.is_sms_active) ? "#065F46" : "#999", cursor: "pointer" }}>
                  SMS Marketing: {(marketingConfig && marketingConfig.is_sms_active) ? "ON" : "OFF"}
                  <input type="checkbox" checked={!!(marketingConfig && marketingConfig.is_sms_active)} onChange={toggleSmsActive} />
                </label>
              </div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
                Master switch for all automated SMS below. Turning this off stops every automated and manual SMS send for this salon, instantly.
              </div>

              <CampaignEditorCard
                type="post_sale" label="Post-Sale Thank You" icon="💬"
                placeholder="Thanks for visiting {{salon_name}} today, {{customer_name}}! We hope you loved your visit 💛"
                existingCampaign={allCampaigns.find(function(c) { return c.type === "post_sale"; })}
                onSave={function(t, a, e) { return saveCampaignSettings("post_sale", "Post-Sale Thank You", t, a, e); }}
              />
              <CampaignEditorCard
                type="appointment_reminder" label="Appointment Reminder" icon="📅"
                placeholder="Hi {{customer_name}}! Friendly reminder of your appointment tomorrow at {{salon_name}}. See you then 💛"
                existingCampaign={allCampaigns.find(function(c) { return c.type === "appointment_reminder"; })}
                onSave={function(t, a, e) { return saveCampaignSettings("appointment_reminder", "Appointment Reminder", t, a, e); }}
              />
              <CampaignEditorCard
                type="birthday" label="Birthday Wishes" icon="🎂"
                placeholder="Happy Birthday, {{customer_name}}! 🎉 Everyone at {{salon_name}} wishes you a wonderful day."
                existingCampaign={allCampaigns.find(function(c) { return c.type === "birthday"; })}
                onSave={function(t, a, e) { return saveCampaignSettings("birthday", "Birthday Wishes", t, a, e); }}
              />
              <CampaignEditorCard
                type="winback" label="Winback (lapsed customers)" icon="💔" showWinbackDays
                placeholder="Hi {{customer_name}}, we miss you at {{salon_name}}! Come back soon, we'd love to see you again 💕"
                existingCampaign={allCampaigns.find(function(c) { return c.type === "winback"; })}
                onSave={function(t, a, e) { return saveCampaignSettings("winback", "Winback", t, a, e); }}
              />
            </div>

            <div style={{ background: WHITE, borderRadius: 14, padding: 18, border: "1.5px solid " + GOLD_DIM + "66" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: DARK, marginBottom: 4 }}>📣 Send a Broadcast Message</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Write a one-off message and send it to a group of customers via SMS, right now.</div>

              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {[
                  { id: "all", label: "All Customers (" + eligibleFor("all").length + ")" },
                  { id: "frequent", label: "Frequent (" + eligibleFor("frequent").length + ")" },
                  { id: "atrisk", label: "At-Risk (" + eligibleFor("atrisk").length + ")" },
                ].map(function(seg) {
                  return (
                    <button
                      key={seg.id}
                      onClick={function() { setBroadcastSegment(seg.id); }}
                      disabled={broadcastSending}
                      style={{
                        padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: broadcastSending ? "default" : "pointer",
                        border: "1.5px solid " + (broadcastSegment === seg.id ? GOLD : GOLD_DIM),
                        background: broadcastSegment === seg.id ? GOLD : WHITE,
                        color: broadcastSegment === seg.id ? BLACK : DARK,
                      }}
                    >
                      {seg.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
                This will reach <b>{broadcastRecipients.length}</b> {broadcastRecipients.length === 1 ? "customer" : "customers"} (customers with no phone on file or who have opted out are automatically excluded).
              </div>

              <textarea
                value={broadcastMessage}
                onChange={function(e) { setBroadcastMessage(e.target.value); }}
                disabled={broadcastSending}
                placeholder="e.g. We are running a 20% off special this weekend — come treat yourself! 💛"
                rows={4}
                style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "12px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", marginBottom: 14, boxSizing: "border-box" }}
              />

              {!broadcastSending && !broadcastDone && (
                <button
                  onClick={sendBroadcast}
                  disabled={!broadcastMessage.trim() || broadcastRecipients.length === 0}
                  style={{
                    background: (!broadcastMessage.trim() || broadcastRecipients.length === 0) ? "#E5E7EB" : GOLD,
                    color: (!broadcastMessage.trim() || broadcastRecipients.length === 0) ? "#999" : BLACK,
                    border: "none", borderRadius: 10, padding: "12px 24px", fontWeight: 800, fontSize: 13,
                    cursor: (!broadcastMessage.trim() || broadcastRecipients.length === 0) ? "default" : "pointer",
                  }}
                >
                  Send to {broadcastRecipients.length} {broadcastRecipients.length === 1 ? "Customer" : "Customers"}
                </button>
              )}

              {broadcastSending && (
                <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>
                  Sending… {broadcastProgress.sent + broadcastProgress.failed} / {broadcastProgress.total}
                  {broadcastProgress.failed > 0 && <span style={{ color: "#991B1B" }}> ({broadcastProgress.failed} failed)</span>}
                </div>
              )}

              {broadcastDone && !broadcastSending && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: broadcastProgress.failed === 0 ? "#065F46" : "#991B1B", marginBottom: 10 }}>
                    {broadcastProgress.failed === 0
                      ? "✅ Done — " + broadcastProgress.sent + " sent."
                      : "⚠️ Done — " + broadcastProgress.sent + " sent, " + broadcastProgress.failed + " failed."}
                  </div>
                  <button
                    onClick={function() { setBroadcastMessage(""); setBroadcastDone(false); setBroadcastProgress({ sent: 0, failed: 0, total: 0 }); }}
                    style={{ background: WHITE, border: "1.5px solid " + GOLD_DIM, borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                  >
                    Send Another
                  </button>
                </div>
              )}
            </div>
          </div>
  );
}
