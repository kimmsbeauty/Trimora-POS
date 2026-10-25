// src/pages/pet/SettingsPage.jsx
//
// Business details that appear on every invoice: logo, tagline, phone, VAT and
// the invoice footer. Saved to the existing salon_settings row (the same columns
// the Salon and Auto apps use). The app reads these once at sign-in, so after a
// successful save the page reloads to pick them up. Admin only (UI-level, like
// the rest of Pet until roles are enforced in the database).
import React, { useState } from "react";
import { db } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { MUTED_FG, BORDER, FOREGROUND } from "./theme";
import { validateSettings, settingsRow } from "./settingsData";
import { PageHeader, Card, Button, Field, ErrorLine, inputStyle } from "./ui";
import ReminderSettings from "./ReminderSettings";

function defaultReload() { try { window.location.reload(); } catch (e) { /* ignore */ } }

export default function SettingsPage({ onSaved }) {
  var salon = useSalon() || {};
  var dState = useState({
    logo_url: salon.logo_url || "", tagline: salon.tagline || "", contact_phone: salon.contact_phone || "",
    tax_enabled: !!salon.tax_enabled, tax_rate: salon.tax_rate != null ? String(salon.tax_rate) : "16",
    tax_pin: salon.tax_pin || "", receipt_footer_message: salon.receipt_footer_message || "",
  });
  var d = dState[0]; var setD = dState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var okState = useState(false); var saved = okState[0]; var setSaved = okState[1];
  var logoFailState = useState(false); var logoFailed = logoFailState[0]; var setLogoFailed = logoFailState[1];

  function set(k, v) { var o = {}; o[k] = v; setD(Object.assign({}, d, o)); setErr(""); setSaved(false); if (k === "logo_url") setLogoFailed(false); }

  async function save() {
    if (saving) return;
    var msg = validateSettings(d);
    if (msg) { setErr(msg); return; }
    if (!salon.id) { setErr("Couldn't identify this business. Sign in again."); return; }
    setSaving(true); setErr("");
    var ok = await db("PATCH", "salon_settings", settingsRow(d), "?salon_id=eq." + salon.id);
    setSaving(false);
    if (ok === null || ok === undefined || ok === false) { setErr("Couldn't save. Check your connection and try again."); return; }
    setSaved(true);
    setTimeout(onSaved || defaultReload, 700);
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your logo and business details appear on every invoice" />
      <Card style={{ padding: 16, display: "grid", gap: 12, maxWidth: 640 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Branding</div>
        <Field label="Logo link (https://…)" htmlFor="set-logo">
          <input id="set-logo" style={inputStyle} value={d.logo_url} placeholder="https://your-site.com/logo.png" onChange={function (e) { set("logo_url", e.target.value); }} />
        </Field>
        {d.logo_url.trim() ? (
          <div style={{ border: "1px dashed " + BORDER, borderRadius: 12, padding: 12, textAlign: "center" }}>
            {logoFailed ? <span style={{ fontSize: 12, color: MUTED_FG }}>That link didn't load as an image. Check the address.</span> : (
              <img src={d.logo_url.trim()} alt="Logo preview" onError={function () { setLogoFailed(true); }} style={{ maxHeight: 64, maxWidth: "100%", objectFit: "contain" }} />
            )}
          </div>
        ) : <p style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>No logo yet: invoices will show your business name instead.</p>}
        <Field label="Tagline (optional)" htmlFor="set-tagline"><input id="set-tagline" style={inputStyle} value={d.tagline} onChange={function (e) { set("tagline", e.target.value); }} /></Field>
        <Field label="Business phone (optional)" htmlFor="set-phone"><input id="set-phone" inputMode="tel" style={inputStyle} value={d.contact_phone} onChange={function (e) { set("contact_phone", e.target.value); }} /></Field>

        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 6 }}>Tax</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: FOREGROUND }}>
          <input type="checkbox" checked={d.tax_enabled} onChange={function (e) { set("tax_enabled", e.target.checked); }} />
          Prices include VAT (show it on invoices)
        </label>
        {d.tax_enabled ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="VAT rate (%)" htmlFor="set-rate"><input id="set-rate" inputMode="numeric" style={inputStyle} value={d.tax_rate} onChange={function (e) { set("tax_rate", e.target.value); }} /></Field>
            <Field label="KRA PIN" htmlFor="set-pin"><input id="set-pin" style={inputStyle} value={d.tax_pin} onChange={function (e) { set("tax_pin", e.target.value); }} /></Field>
          </div>
        ) : null}

        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 6 }}>Invoice footer</div>
        <Field label="Message at the bottom of each invoice (optional)" htmlFor="set-footer">
          <input id="set-footer" style={inputStyle} value={d.receipt_footer_message} onChange={function (e) { set("receipt_footer_message", e.target.value); }} />
        </Field>

        <ErrorLine>{err}</ErrorLine>
        {saved ? <p role="status" style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>Saved. Refreshing to apply your changes…</p> : null}
        <div><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></div>
      </Card>
      <ReminderSettings />
    </div>
  );
}
