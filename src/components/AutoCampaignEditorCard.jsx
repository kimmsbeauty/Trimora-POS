// src/components/AutoCampaignEditorCard.jsx
//
// Auto-themed counterpart to components/CampaignEditorCard.jsx (POS).
// Rebuilt rather than reused directly for the same reason as
// AutoBirthdayReminders.jsx: the source imports colors straight from
// lib/constants.js (POS's own hardcoded GOLD/WHITE/DARK/BLACK), not a
// shared theme module. Logic (template/isActive/winbackDays state,
// handleSave, the onSave contract) is otherwise identical.

import { useState, useEffect } from "react";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "../pages/auto/theme";

export default function AutoCampaignEditorCard({ type, label, icon, placeholder, existingCampaign, onSave, showWinbackDays }) {
  var templateState = useState(""); var template = templateState[0]; var setTemplate = templateState[1];
  var activeState = useState(false); var isActive = activeState[0]; var setIsActive = activeState[1];
  var daysState = useState(30); var winbackDays = daysState[0]; var setWinbackDays = daysState[1];
  var statusState = useState("idle"); var status = statusState[0]; var setStatus = statusState[1];

  var existingId = existingCampaign && existingCampaign.id;

  useEffect(function () {
    if (existingCampaign) {
      setTemplate(existingCampaign.message_template || "");
      setIsActive(!!existingCampaign.is_active);
      if (showWinbackDays) setWinbackDays(existingCampaign.winback_days || 30);
    }
  }, [existingId]);

  async function handleSave() {
    if (!template.trim()) return;
    setStatus("saving");
    var extra = showWinbackDays ? { winback_days: Number(winbackDays) || 30 } : {};
    var ok = await onSave(template.trim(), isActive, extra);
    setStatus(ok ? "saved" : "error");
    if (ok) setTimeout(function () { setStatus("idle"); }, 2500);
  }

  return (
    <div style={{ background: STEEL, borderRadius: 12, border: "1.5px solid " + CHROME + "33", padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: PAPER }}>{icon} {label}</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: isActive ? SIGNAL : CHROME, cursor: "pointer" }}>
          <input type="checkbox" checked={isActive} onChange={function (e) { setIsActive(e.target.checked); }} />
          {isActive ? "Active" : "Off"}
        </label>
      </div>

      {showWinbackDays && (
        <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: CHROME }}>Send after</label>
          <input type="number" min="1" value={winbackDays} onChange={function (e) { setWinbackDays(e.target.value); }}
            style={{ width: 60, padding: "4px 8px", borderRadius: 6, border: "1px solid " + CHROME + "55", fontSize: 12, background: "rgba(255,255,255,0.04)", color: PAPER }} />
          <label style={{ fontSize: 12, color: CHROME }}>days with no visit</label>
        </div>
      )}

      <textarea value={template} onChange={function (e) { setTemplate(e.target.value); }} placeholder={placeholder} rows={3}
        style={{ width: "100%", borderRadius: 8, border: "1.5px solid " + CHROME + "33", padding: 10, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", marginBottom: 8, boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER }} />
      <div style={{ fontSize: 10, color: CHROME, marginBottom: 10 }}>Variables: <code>{"{{customer_name}}"}</code> · <code>{"{{salon_name}}"}</code></div>

      <button onClick={handleSave} disabled={!template.trim() || status === "saving"} style={{
        background: status === "saved" ? "#22C55E33" : status === "error" ? ALERT + "33" : SIGNAL,
        color: status === "saved" ? "#22C55E" : status === "error" ? ALERT : INK,
        border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 800,
        cursor: (!template.trim() || status === "saving") ? "default" : "pointer",
        opacity: (!template.trim()) ? 0.6 : 1,
      }}>
        {status === "saving" ? "Saving…" : status === "saved" ? "✅ Saved" : status === "error" ? "⚠️ Failed — Retry" : "Save"}
      </button>
    </div>
  );
}
