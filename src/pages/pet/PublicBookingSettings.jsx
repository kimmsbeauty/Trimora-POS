// src/pages/pet/PublicBookingSettings.jsx
//
// Settings card for the online booking page (migration 108): the on/off switch, opening
// hours, slot length, minimum notice, how far ahead people can book, and how many
// appointments the business can run at once. Online booking is OFF until switched on here.
import React, { useEffect, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { MUTED_FG } from "./theme";
import { Card, Button, Field, ErrorLine, inputStyle } from "./ui";
import {
  WEEKDAYS, SLOT_CHOICES, defaultSettings, hoursToDays, daysToHours, validateSettings, staffRequestErrorMessage,
} from "./publicBookingData";

export default function PublicBookingSettings() {
  var salon = useSalon() || {};
  var loadState = useState("loading"); var load = loadState[0]; var setLoad = loadState[1];
  var sState = useState(null); var s = sState[0]; var setS = sState[1];
  var daysState = useState({}); var days = daysState[0]; var setDays = daysState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var okState = useState(false); var saved = okState[0]; var setSaved = okState[1];
  var copyState = useState(false); var copied = copyState[0]; var setCopied = copyState[1];

  useEffect(function () {
    var cancelled = false;
    Promise.resolve(db("GET", "pet_public_booking_settings", null, "?select=*&limit=1")).then(function (rows) {
      if (cancelled) return;
      if (!Array.isArray(rows)) { setLoad("needs-db"); return; }
      var cur = rows[0] ? Object.assign(defaultSettings(), rows[0]) : defaultSettings();
      setS(cur); setDays(hoursToDays(cur.hours)); setLoad("ready");
    });
    return function () { cancelled = true; };
  }, []);

  function set(k, v) { var o = {}; o[k] = v; setS(Object.assign({}, s, o)); setErr(""); setSaved(false); }
  function setDay(n, patch) {
    var o = Object.assign({}, days); o[n] = patch === null ? null : Object.assign({ open: "09:00", close: "17:00" }, days[n] || {}, patch);
    setDays(o); setErr(""); setSaved(false);
  }

  var link = (typeof window !== "undefined" ? window.location.origin : "") + "/" + (salon.slug || "") + "/pet/book";

  async function save() {
    if (saving) return;
    var next = Object.assign({}, s, { hours: daysToHours(days) });
    var problem = validateSettings(next);
    if (problem) { setErr(problem); return; }
    setSaving(true); setErr(""); setSaved(false);
    var res = await dbRpcAuth("pet_save_public_booking_settings", {
      p_enabled: !!next.enabled, p_timezone: String(next.timezone).trim(), p_slot_minutes: Number(next.slot_minutes), p_lead_hours: Number(next.lead_hours),
      p_max_days_ahead: Number(next.max_days_ahead), p_capacity: Number(next.capacity), p_hours: next.hours,
    });
    setSaving(false);
    if (res && res.error) { setErr(staffRequestErrorMessage(res.error)); return; }
    setS(next); setSaved(true);
  }
  function copy() {
    try { navigator.clipboard.writeText(link).then(function () { setCopied(true); }, function () { setCopied(false); }); } catch (e) { setCopied(false); }
  }

  return (
    <Card style={{ padding: 16, display: "grid", gap: 12, maxWidth: 640, marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>Online booking page</div>
      <p style={{ margin: 0, color: MUTED_FG, fontSize: 12, lineHeight: 1.5 }}>
        Lets customers request a grooming appointment from a link you share. Requests do not book anything by themselves: you accept or decline each one under Online Requests. Boarding can't be booked online.
      </p>
      {load === "loading" ? <p style={{ margin: 0, color: MUTED_FG, fontSize: 13 }}>Loading…</p> : null}
      {load === "needs-db" ? <ErrorLine>Online booking needs a database update. Ask your administrator to apply migration 108.</ErrorLine> : null}
      {load === "ready" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
            <input type="checkbox" checked={!!s.enabled} onChange={function (e) { set("enabled", e.target.checked); }} /> Accept online booking requests
          </label>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Opening hours (when appointments can start and must finish)</div>
            {WEEKDAYS.map(function (d) {
              var day = days[d.n];
              return (
                <div key={d.n} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 13 }}>
                  <label style={{ width: 110, display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={!!day} onChange={function (e) { setDay(d.n, e.target.checked ? {} : null); }} aria-label={d.long + " open"} /> {d.long}
                  </label>
                  {day ? (
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="time" aria-label={d.long + " opens"} style={Object.assign({}, inputStyle, { width: 120 })} value={day.open} onChange={function (e) { setDay(d.n, { open: e.target.value }); }} />
                      to
                      <input type="time" aria-label={d.long + " closes"} style={Object.assign({}, inputStyle, { width: 120 })} value={day.close} onChange={function (e) { setDay(d.n, { close: e.target.value }); }} />
                    </span>
                  ) : <span style={{ color: MUTED_FG }}>Closed</span>}
                </div>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Time-slot length" htmlFor="pb-slot">
              <select id="pb-slot" style={inputStyle} value={s.slot_minutes} onChange={function (e) { set("slot_minutes", Number(e.target.value)); }}>
                {SLOT_CHOICES.map(function (m) { return <option key={m} value={m}>{m} minutes</option>; })}
              </select>
            </Field>
            <Field label="Appointments at the same time" htmlFor="pb-cap"><input id="pb-cap" inputMode="numeric" style={inputStyle} value={s.capacity} onChange={function (e) { set("capacity", e.target.value); }} /></Field>
            <Field label="Minimum notice (hours)" htmlFor="pb-lead"><input id="pb-lead" inputMode="numeric" style={inputStyle} value={s.lead_hours} onChange={function (e) { set("lead_hours", e.target.value); }} /></Field>
            <Field label="Book up to (days ahead)" htmlFor="pb-ahead"><input id="pb-ahead" inputMode="numeric" style={inputStyle} value={s.max_days_ahead} onChange={function (e) { set("max_days_ahead", e.target.value); }} /></Field>
          </div>
          <Field label="Time zone" htmlFor="pb-tz"><input id="pb-tz" style={inputStyle} value={s.timezone} onChange={function (e) { set("timezone", e.target.value); }} /></Field>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Your booking link</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <code style={{ fontSize: 12, wordBreak: "break-all", flex: "1 1 260px" }}>{link}</code>
              <Button size="sm" variant="outline" onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>
            </div>
            {!s.enabled ? <p style={{ margin: "6px 0 0", fontSize: 12, color: MUTED_FG }}>The link shows "not available" until you switch online booking on and save.</p> : null}
          </div>
          {!salon.contact_phone ? <p style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>No business WhatsApp number is set, so customers won't see the WhatsApp buttons after booking. Add one under Settings → Business WhatsApp number.</p> : null}
          <ErrorLine>{err}</ErrorLine>
          {saved ? <div role="status" style={{ fontSize: 13 }}>Online booking settings saved.</div> : null}
          <div><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save online booking settings"}</Button></div>
        </div>
      ) : null}
    </Card>
  );
}
