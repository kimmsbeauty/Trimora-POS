// src/pages/auto/AutoMarketingPage.jsx
//
// Feature-parity item #11, the last unstarted item from the original
// list. Ported from POSApp.jsx's inline "marketing" page (eligibleFor,
// sendBroadcast, saveCampaignSettings, toggleSmsActive, and the
// frequentCustomers/atRiskCustomers/winbackThreshold computations are
// all line-for-line identical logic, not reinvented) plus
// CampaignEditorCard.jsx (rebuilt as AutoCampaignEditorCard.jsx for the
// same theme-mismatch reason as every other Auto-rebuilt component this
// session -- see that file's own header comment).
//
// Deliberately 3 campaign types, not 4: appointment_reminder is
// excluded -- Auto has no booking/appointment system, item #10 is
// explicitly out of scope for this whole project, so there is nothing
// for that campaign type to trigger on.
//
// Customer list built from auto_vehicles grouped by customer, same
// approach as CustomersPage.jsx (and for the same reason: customers is
// shared with POS, so pulling from the full table directly would let a
// mixed salon+car-wash business broadcast to haircut-only customers who
// have never brought a vehicle in).
//
// This can send real SMS to real customers (via the existing
// send-marketing-message edge function, same one Birthday Reminders
// already uses) -- flagged explicitly before building, not something
// to treat casually.

import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/constants";
import { getValidAccessToken } from "../../lib/deviceAuth";
import AutoCampaignEditorCard from "../../components/AutoCampaignEditorCard";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./theme";

export default function AutoMarketingPage() {
  var salon = useSalon();

  var vehiclesState = useState([]); var vehicles = vehiclesState[0]; var setVehicles = vehiclesState[1];
  var allCampaignsState = useState([]); var allCampaigns = allCampaignsState[0]; var setAllCampaigns = allCampaignsState[1];
  var marketingConfigState = useState(null); var marketingConfig = marketingConfigState[0]; var setMarketingConfig = marketingConfigState[1];
  var postSaleCampaignState = useState(null); var postSaleCampaign = postSaleCampaignState[0]; var setPostSaleCampaign = postSaleCampaignState[1];
  var birthdayCampaignState = useState(null); var birthdayCampaign = birthdayCampaignState[0]; var setBirthdayCampaign = birthdayCampaignState[1];
  var winbackCampaignState = useState(null); var winbackCampaign = winbackCampaignState[0]; var setWinbackCampaign = winbackCampaignState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];

  var broadcastMessageState = useState(""); var broadcastMessage = broadcastMessageState[0]; var setBroadcastMessage = broadcastMessageState[1];
  var broadcastSegmentState = useState("all"); var broadcastSegment = broadcastSegmentState[0]; var setBroadcastSegment = broadcastSegmentState[1];
  var broadcastSendingState = useState(false); var broadcastSending = broadcastSendingState[0]; var setBroadcastSending = broadcastSendingState[1];
  var broadcastProgressState = useState({ sent: 0, failed: 0, total: 0 }); var broadcastProgress = broadcastProgressState[0]; var setBroadcastProgress = broadcastProgressState[1];
  var broadcastDoneState = useState(false); var broadcastDone = broadcastDoneState[0]; var setBroadcastDone = broadcastDoneState[1];

  var load = useCallback(async function () {
    var results = await Promise.all([
      db("GET", "auto_vehicles", null, "?select=*,customers(*)&order=created_at.desc"),
      db("GET", "marketing_campaigns", null, "?order=created_at.desc"),
      db("GET", "salon_marketing_config", null, "?limit=1"),
      db("GET", "marketing_campaigns", null, "?type=eq.post_sale&is_active=eq.true&limit=1"),
      db("GET", "marketing_campaigns", null, "?type=eq.birthday&is_active=eq.true&limit=1"),
      db("GET", "marketing_campaigns", null, "?type=eq.winback&is_active=eq.true&limit=1"),
    ]);
    setVehicles(results[0] || []);
    if (Array.isArray(results[1])) setAllCampaigns(results[1]);
    if (Array.isArray(results[2]) && results[2][0]) setMarketingConfig(results[2][0]);
    if (Array.isArray(results[3]) && results[3][0]) setPostSaleCampaign(results[3][0]);
    if (Array.isArray(results[4]) && results[4][0]) setBirthdayCampaign(results[4][0]);
    if (Array.isArray(results[5]) && results[5][0]) setWinbackCampaign(results[5][0]);
    setLoading(false);
  }, []);

  useEffect(function () { load(); }, [load]);

  // Distinct Auto customers, one row per customer (a customer can have
  // multiple vehicles but should only receive one broadcast).
  var customersById = {};
  vehicles.forEach(function (v) {
    var c = v.customers;
    if (c && !customersById[c.id]) customersById[c.id] = c;
  });
  var customers = Object.values(customersById);

  var winbackThreshold = (winbackCampaign && winbackCampaign.winback_days) || 28;
  var frequentCustomers = customers.filter(function (c) { return c.visit_count >= 4; });
  var atRiskCustomers = customers.filter(function (c) {
    if (!c.last_visit) return false;
    return (new Date() - new Date(c.last_visit)) / (1000 * 60 * 60 * 24) >= winbackThreshold;
  });

  function eligibleFor(segment) {
    var base = segment === "frequent" ? frequentCustomers : segment === "atrisk" ? atRiskCustomers : customers;
    return base.filter(function (c) { return c.phone && !c.marketing_opt_out; });
  }
  var broadcastRecipients = eligibleFor(broadcastSegment);

  async function sendBroadcast() {
    if (!broadcastMessage.trim() || broadcastRecipients.length === 0) return;
    var salonId = salon && salon.id;
    if (!salonId) return;
    setBroadcastSending(true); setBroadcastDone(false);
    setBroadcastProgress({ sent: 0, failed: 0, total: broadcastRecipients.length });
    var campaignResult = await db("POST", "marketing_campaigns", {
      salon_id: salonId, name: "Broadcast " + new Date().toLocaleString(),
      type: "manual_broadcast", message_template: broadcastMessage.trim(), is_active: true,
    });
    var campaign = campaignResult && campaignResult[0];
    if (!campaign) { setBroadcastSending(false); alert("Could not create broadcast. Check your connection."); return; }
    var sentCount = 0, failedCount = 0;
    var deviceToken = await getValidAccessToken();
    for (var i = 0; i < broadcastRecipients.length; i++) {
      var c = broadcastRecipients[i];
      try {
        var res = await fetch(SUPABASE_URL + "/functions/v1/send-marketing-message", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + (deviceToken || SUPABASE_KEY) },
          body: JSON.stringify({ campaign_id: campaign.id, customer_id: c.id, salon_id: salonId }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (data && data.success) sentCount++; else failedCount++;
      } catch (e) { failedCount++; }
      setBroadcastProgress({ sent: sentCount, failed: failedCount, total: broadcastRecipients.length });
      await new Promise(function (resolve) { setTimeout(resolve, 300); });
    }
    setBroadcastSending(false); setBroadcastDone(true);
  }

  async function saveCampaignSettings(type, defaultName, template, isActive, extra) {
    var salonId = salon && salon.id; if (!salonId) return false;
    var existing = allCampaigns.find(function (c) { return c.type === type; });
    var body = Object.assign({ salon_id: salonId, name: defaultName, type: type, message_template: template, is_active: isActive }, extra || {});
    var ok;
    if (existing && existing.id) {
      ok = await db("PATCH", "marketing_campaigns", body, "?id=eq." + existing.id);
    } else {
      ok = await db("POST", "marketing_campaigns", body);
    }
    var fresh = await db("GET", "marketing_campaigns", null, "?order=created_at.desc");
    if (Array.isArray(fresh)) setAllCampaigns(fresh);
    var freshActive = await db("GET", "marketing_campaigns", null, "?type=eq." + type + "&is_active=eq.true&limit=1");
    if (type === "post_sale" && Array.isArray(freshActive) && freshActive[0]) setPostSaleCampaign(freshActive[0]);
    if (type === "birthday" && Array.isArray(freshActive) && freshActive[0]) setBirthdayCampaign(freshActive[0]);
    if (type === "winback" && Array.isArray(freshActive) && freshActive[0]) setWinbackCampaign(freshActive[0]);
    return ok !== null;
  }

  async function toggleSmsActive() {
    var salonId = salon && salon.id; if (!salonId) return;
    var newVal = !(marketingConfig && marketingConfig.is_sms_active);
    if (marketingConfig && marketingConfig.id) {
      await db("PATCH", "salon_marketing_config", { is_sms_active: newVal }, "?salon_id=eq." + salonId);
    } else {
      await db("POST", "salon_marketing_config", { salon_id: salonId, is_sms_active: newVal });
    }
    var fresh = await db("GET", "salon_marketing_config", null, "?limit=1");
    if (Array.isArray(fresh) && fresh[0]) setMarketingConfig(fresh[0]);
  }

  if (loading) {
    return <div style={{ minHeight: "100vh", background: INK }} />;
  }

  var sectionStyle = { background: STEEL, borderRadius: 14, padding: 18, border: "1px solid rgba(143,166,184,0.15)", marginBottom: 16 };

  return (
    <div style={{ minHeight: "100vh", background: INK, fontFamily: "system-ui, -apple-system, sans-serif", paddingBottom: 40 }}>
      <div style={{ padding: "20px 20px 4px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: PAPER }}>Marketing</div>
      </div>
      <div style={{ padding: 20, maxWidth: 520, margin: "0 auto" }}>

        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: PAPER }}>⚙️ Automated Messages</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: (marketingConfig && marketingConfig.is_sms_active) ? SIGNAL : CHROME, cursor: "pointer" }}>
              SMS Marketing: {(marketingConfig && marketingConfig.is_sms_active) ? "ON" : "OFF"}
              <input type="checkbox" checked={!!(marketingConfig && marketingConfig.is_sms_active)} onChange={toggleSmsActive} />
            </label>
          </div>
          <div style={{ fontSize: 12, color: CHROME, marginBottom: 16 }}>
            Master switch for all automated SMS below. Turning this off stops every automated and manual SMS send for this business, instantly.
          </div>

          <AutoCampaignEditorCard
            type="post_sale" label="Post-Wash Thank You" icon="💬"
            placeholder="Thanks for visiting {{salon_name}} today, {{customer_name}}! We hope your ride is shining ✨"
            existingCampaign={postSaleCampaign || allCampaigns.find(function (c) { return c.type === "post_sale"; })}
            onSave={function (t, a, e) { return saveCampaignSettings("post_sale", "Post-Wash Thank You", t, a, e); }}
          />
          <AutoCampaignEditorCard
            type="birthday" label="Birthday Wishes" icon="🎂"
            placeholder="Happy Birthday, {{customer_name}}! 🎉 Everyone at {{salon_name}} wishes you a wonderful day."
            existingCampaign={birthdayCampaign || allCampaigns.find(function (c) { return c.type === "birthday"; })}
            onSave={function (t, a, e) { return saveCampaignSettings("birthday", "Birthday Wishes", t, a, e); }}
          />
          <AutoCampaignEditorCard
            type="winback" label="Winback (lapsed customers)" icon="💔" showWinbackDays
            placeholder="Hi {{customer_name}}, we miss you at {{salon_name}}! Come back soon for a wash 💦"
            existingCampaign={winbackCampaign || allCampaigns.find(function (c) { return c.type === "winback"; })}
            onSave={function (t, a, e) { return saveCampaignSettings("winback", "Winback", t, a, e); }}
          />
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: 16, fontWeight: 800, color: PAPER, marginBottom: 4 }}>📣 Send a Broadcast Message</div>
          <div style={{ fontSize: 12, color: CHROME, marginBottom: 16 }}>Write a one-off message and send it to a group of customers via SMS, right now.</div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All Customers (" + eligibleFor("all").length + ")" },
              { id: "frequent", label: "Frequent (" + eligibleFor("frequent").length + ")" },
              { id: "atrisk", label: "At-Risk (" + eligibleFor("atrisk").length + ")" },
            ].map(function (seg) {
              return (
                <button key={seg.id} onClick={function () { setBroadcastSegment(seg.id); }} disabled={broadcastSending} style={{
                  padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: broadcastSending ? "default" : "pointer",
                  border: "1.5px solid " + (broadcastSegment === seg.id ? SIGNAL : CHROME + "55"),
                  background: broadcastSegment === seg.id ? SIGNAL : "transparent",
                  color: broadcastSegment === seg.id ? INK : CHROME,
                }}>
                  {seg.label}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: CHROME, marginBottom: 10 }}>
            This will reach <b style={{ color: PAPER }}>{broadcastRecipients.length}</b> {broadcastRecipients.length === 1 ? "customer" : "customers"} (customers with no phone on file or who have opted out are automatically excluded).
          </div>

          <textarea value={broadcastMessage} onChange={function (e) { setBroadcastMessage(e.target.value); }} disabled={broadcastSending}
            placeholder="e.g. We are running a 20% off wash special this weekend — come treat your ride! 🚗"
            rows={4}
            style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + CHROME + "55", padding: 12, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", marginBottom: 14, boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER }} />

          {!broadcastSending && !broadcastDone && (
            <button onClick={sendBroadcast} disabled={!broadcastMessage.trim() || broadcastRecipients.length === 0} style={{
              background: (!broadcastMessage.trim() || broadcastRecipients.length === 0) ? CHROME + "33" : SIGNAL,
              color: (!broadcastMessage.trim() || broadcastRecipients.length === 0) ? CHROME : INK,
              border: "none", borderRadius: 10, padding: "12px 24px", fontWeight: 800, fontSize: 13,
              cursor: (!broadcastMessage.trim() || broadcastRecipients.length === 0) ? "default" : "pointer",
            }}>
              Send to {broadcastRecipients.length} {broadcastRecipients.length === 1 ? "Customer" : "Customers"}
            </button>
          )}

          {broadcastSending && (
            <div style={{ fontSize: 13, fontWeight: 700, color: PAPER }}>
              Sending… {broadcastProgress.sent + broadcastProgress.failed} / {broadcastProgress.total}
              {broadcastProgress.failed > 0 && <span style={{ color: ALERT }}> ({broadcastProgress.failed} failed)</span>}
            </div>
          )}

          {broadcastDone && !broadcastSending && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: broadcastProgress.failed === 0 ? SIGNAL : ALERT, marginBottom: 10 }}>
                {broadcastProgress.failed === 0
                  ? "✅ Done — " + broadcastProgress.sent + " sent."
                  : "⚠️ Done — " + broadcastProgress.sent + " sent, " + broadcastProgress.failed + " failed."}
              </div>
              <button onClick={function () { setBroadcastMessage(""); setBroadcastDone(false); setBroadcastProgress({ sent: 0, failed: 0, total: 0 }); }}
                style={{ background: "transparent", border: "1.5px solid " + CHROME + "55", color: CHROME, borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Send Another
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
