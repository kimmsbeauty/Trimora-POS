// src/pages/pet/GoogleCalendarSettings.jsx
//
// "Google Calendar" card (migration 113, edge function pet-calendar-sync). One-way: grooming bookings
// and boarding stays are copied to the business's Google Calendar and kept up to date. Nothing is read
// back from Google and no invitations are sent. OFF until switched on here.
import React, { useEffect, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { useSalon } from "../../lib/SalonContext";
import { MUTED_FG, SUCCESS, DESTRUCTIVE } from "./theme";
import { Card, Button, Field, ErrorLine, inputStyle } from "./ui";
import { callCalendar, calendarErrorMessage, connectionStatus, syncSummary, validCalendarId } from "./calendarSync";

export default function GoogleCalendarSettings() {
  var salon = useSalon() || {};
  var loadState = useState("loading"); var load = loadState[0]; var setLoad = loadState[1];
  var connState = useState(null); var conn = connState[0]; var setConn = connState[1];
  var enabledState = useState(false); var enabled = enabledState[0]; var setEnabled = enabledState[1];
  var calState = useState(""); var cal = calState[0]; var setCal = calState[1];
  var emailState = useState(""); var email = emailState[0]; var setEmail = emailState[1];
  var availState = useState("checking"); var avail = availState[0]; var setAvail = availState[1];
  var busyState = useState(""); var busy = busyState[0]; var setBusy = busyState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var msgState = useState(""); var msg = msgState[0]; var setMsg = msgState[1];
  var copyState = useState(false); var copied = copyState[0]; var setCopied = copyState[1];

  function refresh() {
    return Promise.resolve(db("GET", "pet_calendar_connections", null, "?select=*&limit=1")).then(function (rows) {
      if (!Array.isArray(rows)) { setLoad("needs-db"); return; }
      var row = rows[0] || null;
      setConn(row); setEnabled(!!(row && row.enabled)); setCal((row && row.calendar_id) || ""); setLoad("ready");
    });
  }

  useEffect(function () {
    var cancelled = false;
    refresh().then(function () {
      if (cancelled) return;
      return callCalendar({ action: "info", salon_id: salon.id }).then(function (r) {
        if (cancelled) return;
        if (r.ok) { setEmail(r.data.service_account_email || ""); setAvail("ready"); }
        else setAvail(r.code === "NOT_CONFIGURED" ? "not-configured" : "unavailable");
      });
    });
    return function () { cancelled = true; };
  }, [salon.id]);

  function touch() { setErr(""); setMsg(""); }

  async function sync() {
    setBusy("sync"); touch();
    var re = await dbRpcAuth("pet_calendar_resync", {});
    if (re && re.error) { setBusy(""); setErr(calendarErrorMessage(re.error)); return; }
    var r = await callCalendar({ action: "flush", salon_id: salon.id });
    setBusy("");
    if (!r.ok) { setErr(r.message); } else { setMsg(syncSummary(r.data)); }
    await refresh();
  }

  async function save() {
    if (busy) return;
    var id = cal.trim();
    if (enabled && !id) { setErr(calendarErrorMessage("CALENDAR_REQUIRED")); return; }
    if (id && !validCalendarId(id)) { setErr(calendarErrorMessage("INVALID_CALENDAR_ID")); return; }
    setBusy("save"); touch();
    var res = await dbRpcAuth("pet_save_calendar_connection", { p_enabled: enabled, p_calendar_id: id || null });
    if (res && res.error) { setBusy(""); setErr(calendarErrorMessage(res.error)); return; }
    if (enabled) {
      var r = await callCalendar({ action: "flush", salon_id: salon.id });
      setMsg(r.ok ? "Saved. " + syncSummary(r.data) : "Saved. " + r.message);
    } else {
      setMsg("Saved. Sync is off. Events already on your calendar are left as they are.");
    }
    setBusy("");
    await refresh();
  }

  async function test() {
    var id = cal.trim();
    if (!validCalendarId(id)) { setErr(calendarErrorMessage("INVALID_CALENDAR_ID")); return; }
    setBusy("test"); touch();
    var r = await callCalendar({ action: "test", salon_id: salon.id, calendar_id: id });
    setBusy("");
    if (r.ok) setMsg("Connected. Trimora can add events to this calendar.");
    else setErr(r.message);
  }

  function copyEmail() {
    try { navigator.clipboard.writeText(email).then(function () { setCopied(true); }, function () { setCopied(false); }); } catch (e) { setCopied(false); }
  }

  var status = connectionStatus(conn);
  var canSync = !!(conn && conn.enabled);

  return (
    <Card style={{ padding: 16, display: "grid", gap: 12, maxWidth: 640, marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>Google Calendar</div>
      <p style={{ margin: 0, color: MUTED_FG, fontSize: 12, lineHeight: 1.5 }}>
        Copies your grooming appointments (with their start and end times) and boarding stays (as all-day events from check-in to check-out) to your Google Calendar, and keeps them up to date. Booking notes and care notes are never sent, and Google does not email customers or staff. Changes made inside Google Calendar are not copied back, and are replaced the next time the booking changes in Trimora.
      </p>
      {load === "loading" ? <p style={{ margin: 0, color: MUTED_FG, fontSize: 13 }}>Loading…</p> : null}
      {load === "needs-db" ? <ErrorLine>Google Calendar sync needs a database update. Ask your administrator to apply migration 113.</ErrorLine> : null}
      {load === "ready" && avail === "not-configured" ? <ErrorLine>{calendarErrorMessage("NOT_CONFIGURED")}</ErrorLine> : null}
      {load === "ready" && avail === "unavailable" ? <ErrorLine>Couldn't reach the Google Calendar service. Check your connection and reload this page.</ErrorLine> : null}
      {load === "ready" && avail === "ready" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Set up</div>
            <ol style={{ margin: 0, paddingLeft: 18, color: MUTED_FG }}>
              <li>In Google Calendar, open the settings of the calendar to use, then <em>Share with specific people</em>.</li>
              <li>Add this email address and choose <strong>Make changes to events</strong>:
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                  <code style={{ fontSize: 12, wordBreak: "break-all", flex: "1 1 260px", color: "inherit" }}>{email}</code>
                  <Button size="sm" variant="outline" onClick={copyEmail}>{copied ? "Copied" : "Copy email"}</Button>
                </div>
              </li>
              <li>Under <em>Integrate calendar</em>, copy the <strong>Calendar ID</strong> and paste it below.</li>
            </ol>
          </div>
          <Field label="Calendar ID" htmlFor="gc-cal">
            <input id="gc-cal" style={inputStyle} value={cal} placeholder="abc123@group.calendar.google.com" autoComplete="off"
              onChange={function (e) { setCal(e.target.value); touch(); }} />
          </Field>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
            <input type="checkbox" checked={enabled} onChange={function (e) { setEnabled(e.target.checked); touch(); }} /> Sync to Google Calendar
          </label>
          <div role="status" style={{ fontSize: 12, fontWeight: 600, color: status.tone === "danger" ? DESTRUCTIVE : status.tone === "success" ? SUCCESS : MUTED_FG }}>{status.text}</div>
          <ErrorLine>{err}</ErrorLine>
          {msg ? <div role="status" style={{ fontSize: 13 }}>{msg}</div> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={save} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save Google Calendar settings"}</Button>
            <Button variant="outline" onClick={test} disabled={!!busy}>{busy === "test" ? "Testing…" : "Test connection"}</Button>
            {canSync ? <Button variant="outline" onClick={sync} disabled={!!busy}>{busy === "sync" ? "Syncing…" : "Sync now"}</Button> : null}
          </div>
          <p style={{ margin: 0, color: MUTED_FG, fontSize: 11, lineHeight: 1.5 }}>
            "Test connection" briefly adds and removes a one-minute event called "Trimora connection test". "Sync now" re-checks everything upcoming, including name changes.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
