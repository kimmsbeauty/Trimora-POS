// src/pages/pet/SettingsPage.jsx
//
// Business details that appear on every invoice: logo, tagline, phone, VAT and
// the invoice footer. Saved to the existing salon_settings row (the same columns
// the Salon and Auto apps use). The app reads these once at sign-in, so after a
// successful save the page reloads to pick them up. Admin only (UI-level, like
// the rest of Pet until roles are enforced in the database).
import React, { useState, useRef } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { MUTED_FG, BORDER, FOREGROUND } from "./theme";
import { REFUND_PIN_REFUSED } from "./invoiceData";
import { validateSettings, settingsRow, phonesPayload, derivePrefix, normalizePrefix, invoiceNumberPreview } from "./settingsData";
import ReminderSettings from "./ReminderSettings";
import PublicBookingSettings from "./PublicBookingSettings";
import GoogleCalendarSettings from "./GoogleCalendarSettings";
import { PageHeader, Card, Button, Field, ErrorLine, Modal, inputStyle } from "./ui";

function defaultReload() { try { window.location.reload(); } catch (e) { /* ignore */ } }

export default function SettingsPage({ onSaved }) {
  var salon = useSalon() || {};
  var dState = useState({
    logo_url: salon.logo_url || "", tagline: salon.tagline || "", contact_phone: salon.contact_phone || "",
    tax_enabled: !!salon.tax_enabled, tax_rate: salon.tax_rate != null ? String(salon.tax_rate) : "16",
    tax_pin: salon.tax_pin || "", receipt_footer_message: salon.receipt_footer_message || "",
    invoice_prefix: salon.invoice_prefix || "",
    contact_email: salon.contact_email || "", website: salon.website || "", address: salon.address || "",
    // Every number the owner adds, each with a "show on invoice" switch. No limit and none built in.
    phones: (Array.isArray(salon.phones) ? salon.phones : []).map(function (p) { return { phone: p.phone, show_on_invoice: p.show_on_invoice !== false }; }),
  });
  // The list as loaded, to know whether it changed (only a changed list needs the admin PIN).
  var loadedPhones = useRef(JSON.stringify(phonesPayload(Array.isArray(salon.phones) ? salon.phones : [])));
  var pinAskState = useState(false); var pinAsk = pinAskState[0]; var setPinAsk = pinAskState[1];
  var pinValState = useState(""); var pinVal = pinValState[0]; var setPinVal = pinValState[1];
  var pinErrState = useState(""); var pinErr = pinErrState[0]; var setPinErr = pinErrState[1];
  var pinResolver = useRef(null);
  function askPin() {
    return new Promise(function (resolve) { pinResolver.current = resolve; setPinVal(""); setPinErr(""); setPinAsk(true); });
  }
  function answerPin(value) {
    var r = pinResolver.current; pinResolver.current = null;
    setPinAsk(false); setPinVal(""); setPinErr("");
    if (r) r(value);
  }
  function submitPin() {
    if (!/^[0-9]{4,6}$/.test(pinVal)) { setPinErr("Enter the admin PIN (4 to 6 digits)."); return; }
    answerPin(pinVal);
  }
  var newPhoneState = useState(""); var newPhone = newPhoneState[0]; var setNewPhone = newPhoneState[1];
  var d = dState[0]; var setD = dState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var okState = useState(false); var saved = okState[0]; var setSaved = okState[1];
  var logoFailState = useState(false); var logoFailed = logoFailState[0]; var setLogoFailed = logoFailState[1];

  function set(k, v) { var o = {}; o[k] = v; setD(Object.assign({}, d, o)); setErr(""); setSaved(false); if (k === "logo_url") setLogoFailed(false); }

  function addPhone() {
    var t = newPhone.trim();
    if (!t) return;
    var msg = validateSettings(Object.assign({}, d, { phones: d.phones.concat([{ phone: t, show_on_invoice: true }]) }));
    if (msg) { setErr(msg); return; }
    setD(Object.assign({}, d, { phones: d.phones.concat([{ phone: t, show_on_invoice: true }]) }));
    setNewPhone(""); setErr(""); setSaved(false);
  }
  function setPhone(i, patch) {
    setD(Object.assign({}, d, { phones: d.phones.map(function (p, j) { return j === i ? Object.assign({}, p, patch) : p; }) }));
    setErr(""); setSaved(false);
  }
  function removePhone(i) {
    setD(Object.assign({}, d, { phones: d.phones.filter(function (p, j) { return j !== i; }) }));
    setErr(""); setSaved(false);
  }

  async function save() {
    if (saving) return;
    var msg = validateSettings(d);
    if (msg) { setErr(msg); return; }
    if (!salon.id) { setErr("Couldn't identify this business. Sign in again."); return; }
    // Changing the phone list needs the admin PIN, like refunds and deletes. Ask first so a cancelled prompt saves nothing.
    var payload = phonesPayload(d.phones);
    var phonesChanged = JSON.stringify(payload) !== loadedPhones.current;
    var pin = null;
    if (phonesChanged) {
      pin = await askPin();
      if (pin === null) return;
    }
    setSaving(true); setErr("");
    var ok = await db("PATCH", "salon_settings", settingsRow(d), "?salon_id=eq." + salon.id);
    if (ok === null || ok === undefined || ok === false) { pin = null; setSaving(false); setErr("Couldn't save. Check your connection and try again."); return; }
    if (phonesChanged) {
      // The phone list is replaced in one database call, so it is saved whole or not at all.
      var ph = await dbRpcAuth("salon_save_phone_numbers", { p_admin_pin: pin, p_phones: payload });
      pin = null;
      setSaving(false);
      if (ph.error) { setErr(/DUPLICATE_PHONE/.test(ph.error) ? "The same phone number is in the list twice." : /INVALID_PHONE/.test(ph.error) ? "One of the phone numbers isn't valid." : "Your settings were saved, but the phone numbers weren't. Check your connection and try again."); return; }
      if (ph.data === null || ph.data === undefined) { setErr("Your other settings were saved, but the phone numbers weren't. " + REFUND_PIN_REFUSED); return; }
    } else {
      setSaving(false);
    }
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
        <Field label="Business email (optional)" htmlFor="set-email"><input id="set-email" inputMode="email" style={inputStyle} value={d.contact_email} onChange={function (e) { set("contact_email", e.target.value); }} /></Field>
        <Field label="Website (optional)" htmlFor="set-website"><input id="set-website" style={inputStyle} value={d.website} placeholder="www.your-site.com" onChange={function (e) { set("website", e.target.value); }} /></Field>
        <Field label="Address / location (optional)" htmlFor="set-address"><input id="set-address" style={inputStyle} value={d.address} placeholder="Town, Country" onChange={function (e) { set("address", e.target.value); }} /></Field>
        <Field label="Business WhatsApp number" htmlFor="set-phone"><input id="set-phone" inputMode="tel" style={inputStyle} value={d.contact_phone} onChange={function (e) { set("contact_phone", e.target.value); }} /></Field>
        <p style={{ margin: "-6px 0 0", fontSize: 12, color: MUTED_FG }}>Customers who send an online booking request are offered WhatsApp buttons that message this number (e.g. 0712345678). Leave blank to hide them.</p>

        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 6 }}>Business phone numbers</div>
        <p style={{ margin: "-6px 0 0", fontSize: 12, color: MUTED_FG }}>Add as many numbers as you need (for example each partner's). Choose which ones are printed on invoices. Changing this list asks for the admin PIN.</p>
        {d.phones.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>No numbers yet: invoices won't show a phone number.</p> : null}
        {d.phones.map(function (p, i) {
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input aria-label={"Phone number " + (i + 1)} inputMode="tel" style={Object.assign({}, inputStyle, { flex: "1 1 160px", width: "auto" })} value={p.phone}
                onChange={function (e) { setPhone(i, { phone: e.target.value }); }} />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: FOREGROUND }}>
                <input type="checkbox" aria-label={"Show " + (p.phone || "number " + (i + 1)) + " on invoices"} checked={p.show_on_invoice} onChange={function (e) { setPhone(i, { show_on_invoice: e.target.checked }); }} />
                Show on invoice
              </label>
              <Button size="sm" variant="ghost-danger" onClick={function () { removePhone(i); }} ariaLabel={"Remove " + (p.phone || "number " + (i + 1))}>Remove</Button>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input aria-label="New phone number" inputMode="tel" placeholder="e.g. 0712 345 678" style={Object.assign({}, inputStyle, { flex: "1 1 160px", width: "auto" })} value={newPhone}
            onChange={function (e) { setNewPhone(e.target.value); setErr(""); }} onKeyDown={function (e) { if (e.key === "Enter") { e.preventDefault(); addPhone(); } }} />
          <Button size="sm" variant="outline" onClick={addPhone}>Add number</Button>
        </div>

        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 6 }}>Invoice numbers</div>
        <Field label="Invoice number prefix (optional)" htmlFor="set-prefix">
          <input id="set-prefix" style={inputStyle} value={d.invoice_prefix} placeholder={derivePrefix(salon.name, salon.slug)} maxLength={20}
            onChange={function (e) { set("invoice_prefix", normalizePrefix(e.target.value)); }} />
        </Field>
        <p style={{ margin: "-6px 0 0", fontSize: 12, color: MUTED_FG }}>
          Your next invoices will read <strong>{invoiceNumberPreview(d.invoice_prefix, salon.name, salon.slug)}</strong>. Leave the prefix blank to use the first word of your business name. Invoices already issued keep their numbers.
        </p>

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
      <PublicBookingSettings />
      <GoogleCalendarSettings />

      <Modal open={pinAsk} onClose={function () { answerPin(null); }} title="Confirm with admin PIN"
        description="Enter the admin PIN to save your business phone numbers."
        footer={<>
          <Button variant="ghost" onClick={function () { answerPin(null); }}>Cancel</Button>
          <Button onClick={submitPin}>Confirm</Button>
        </>}>
        <Field label="Admin PIN" htmlFor="settings-admin-pin">
          <input id="settings-admin-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={6} style={inputStyle} value={pinVal}
            onChange={function (e) { setPinVal(e.target.value.replace(/[^0-9]/g, "")); setPinErr(""); }}
            onKeyDown={function (e) { if (e.key === "Enter") submitPin(); }} autoFocus />
        </Field>
        <ErrorLine>{pinErr}</ErrorLine>
      </Modal>
    </div>
  );
}
