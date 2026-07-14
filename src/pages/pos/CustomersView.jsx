// src/pages/pos/CustomersView.jsx
//
// Extracted from POSApp.jsx (was the `page === "customers"` inline
// block). Mechanical extraction only — no logic changes. The JSX body
// below was extracted directly from the original file via script (not
// retyped) to guarantee byte-for-byte fidelity. `customers` state and
// the derived frequentCustomers/atRiskCustomers/winbackThreshold values,
// plus the sendWinbackSms/deleteCustomer handlers, still live in and
// are owned by POSApp.jsx; this component is purely presentational.

import LoyaltyBadge from "../../components/LoyaltyBadge.jsx";
import { fmt } from "../../lib/utils.js";
import { GOLD, GOLD_DIM, DARK, WHITE, RED, BLACK } from "../../lib/constants.js";

export default function CustomersView({
  customers,
  frequentCustomers,
  atRiskCustomers,
  winbackThreshold,
  winbackSmsStatus,
  winbackCampaign,
  sendWinbackSms,
  salonName,
  bookingHref,
  isAdmin,
  deleteCustomer,
}) {
  return (
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: DARK, marginBottom: 4 }}>Clients</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>{customers.length} total · {frequentCustomers.length} regulars · {atRiskCustomers.length} not seen in {winbackThreshold}+ days</div>

            {/* Loyalty tier summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
                { tier: "Bronze", icon: "🥉", color: "#92400E", bg: "#FFF7ED", min: 1, max: 3 },
                { tier: "Silver", icon: "🥈", color: "#475569", bg: "#F1F5F9", min: 4, max: 7 },
                { tier: "Gold",   icon: "🥇", color: "#92400E", bg: "#FEF3C7", min: 8, max: 14 },
                { tier: "VIP",    icon: "💎", color: "#7C3AED", bg: "#F3E8FF", min: 15, max: Infinity },
              ].map(function(t, i) {
                var count = customers.filter(function(c) {
                  var v = c.visit_count || 0; var sp = c.total_spend || 0;
                  if (t.tier === "VIP") return v >= 15 || sp >= 30000;
                  return v >= t.min && v <= t.max;
                }).length;
                return (
                  <div key={i} style={{ background: t.bg, borderRadius: 10, padding: "10px 6px", textAlign: "center", border: "1px solid " + t.color + "33" }}>
                    <div style={{ fontSize: 16 }}>{t.icon}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: t.color, marginTop: 2 }}>{count}</div>
                    <div style={{ fontSize: 9, color: t.color, fontWeight: 700, marginTop: 1 }}>{t.tier}</div>
                  </div>
                );
              })}
            </div>
            {atRiskCustomers.length > 0 && (
              <div style={{ background: "#FFF5F5", borderRadius: 12, padding: 14, marginBottom: 14, border: "1.5px solid #FEE2E2" }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: RED, marginBottom: 10 }}>⚠️ Not seen in {winbackThreshold}+ days</div>
                {atRiskCustomers.map(function(c) {
                  var wbStatus = winbackSmsStatus[c.id] || "idle";
                  var canSendWinbackSms = !!(winbackCampaign && c.id && !c.marketing_opt_out);
                  return (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "8px 10px", background: WHITE, borderRadius: 8, border: "1px solid #FEE2E2" }}>
                      <div><div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{c.name}</div><div style={{ fontSize: 11, color: "#888" }}>{c.phone} · Last: {c.last_visit || "unknown"}</div></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {canSendWinbackSms && (
                          <button
                            onClick={function() { sendWinbackSms(c); }}
                            disabled={wbStatus === "sending" || wbStatus === "sent"}
                            title={wbStatus === "error" ? "Failed — tap to retry" : "Send winback SMS"}
                            style={{
                              background: wbStatus === "sent" ? "#D1FAE5" : wbStatus === "error" ? "#FEE2E2" : GOLD,
                              color: wbStatus === "sent" ? "#065F46" : wbStatus === "error" ? "#991B1B" : BLACK,
                              border: "none", borderRadius: 20, padding: "7px 12px", fontSize: 11, fontWeight: 800,
                              cursor: (wbStatus === "sending" || wbStatus === "sent") ? "default" : "pointer", whiteSpace: "nowrap",
                            }}
                          >
                            {wbStatus === "sent" ? "✅ Sent" : wbStatus === "error" ? "⚠️ Retry" : wbStatus === "sending" ? "Sending…" : "📩 SMS"}
                          </button>
                        )}
                        {c.phone && <a href={"https://wa.me/254" + c.phone.replace(/^0/,"").replace(/\D/g,"") + "?text=" + encodeURIComponent("Hi " + c.name + "! We miss you at " + salonName + " 💕\nBook: " + window.location.origin + bookingHref)} target="_blank" rel="noreferrer" style={{ background: "#25D366", color: WHITE, borderRadius: 20, padding: "7px 12px", fontSize: 11, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" }}>📲 WhatsApp</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontWeight: 800, fontSize: 14, color: DARK, marginBottom: 10 }}>All Clients</div>
            {customers.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: "#aaa" }}><div style={{ fontSize: 36, marginBottom: 8 }}>👤</div><div>No clients yet.</div></div>}
            {customers.map(function(c) {
              return (
                <div key={c.id} style={{ background: WHITE, borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: "1px solid " + GOLD_DIM + "33" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: DARK, display: "flex", alignItems: "center", gap: 6 }}>
                        {c.name}
                        <LoyaltyBadge customer={c} size="sm" />
                      </div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{c.phone} · Last: {c.last_visit || "—"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ textAlign: "right" }}><div style={{ fontSize: 13, fontWeight: 800, color: GOLD_DIM }}>{fmt(c.total_spend)}</div><div style={{ fontSize: 10, color: "#aaa" }}>{c.visit_count} visit{c.visit_count !== 1 ? "s" : ""}</div></div>
                      {c.phone && <a href={"https://wa.me/254" + c.phone.replace(/^0/,"").replace(/\D/g,"") + "?text=" + encodeURIComponent("Hi " + c.name + "! 💕 Book: " + window.location.origin + bookingHref)} target="_blank" rel="noreferrer" style={{ background: "#25D366", color: WHITE, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, textDecoration: "none", flexShrink: 0 }}>📲</a>}
                      {isAdmin && (
                        <button
                          onClick={function() { deleteCustomer(c); }}
                          style={{ background: "none", border: "1px solid #fca5a5", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, cursor: "pointer", flexShrink: 0, color: RED }}
                          title="Delete customer"
                        >🗑</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
  );
}
