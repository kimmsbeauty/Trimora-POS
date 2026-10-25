// src/pages/pet/ReminderSettings.jsx
//
// "Care reminders": how many days before a due date a vaccination, deworming or
// other preventive-care record shows "due soon". Default is six months (180
// days) for every type. Saved per record type in pet_reminder_settings
// (migration 098). Expired dates are always flagged separately.
import React, { useEffect, useState } from "react";
import { db } from "../../lib/db";
import { MUTED_FG } from "./theme";
import { RECORD_TYPES, DEFAULT_WARN_DAYS, windowsFromRows, warnDaysFor, validateWarnDays } from "./petData";
import { Card, Button, Field, ErrorLine, inputStyle } from "./ui";

export default function ReminderSettings() {
  var loadState = useState("loading"); var load = loadState[0]; var setLoad = loadState[1];
  var existsState = useState({}); var exists = existsState[0]; var setExists = existsState[1];
  var dState = useState({}); var d = dState[0]; var setD = dState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var okState = useState(false); var saved = okState[0]; var setSaved = okState[1];

  useEffect(function () {
    var cancelled = false;
    Promise.resolve(db("GET", "pet_reminder_settings", null, "?select=record_type,warn_days")).then(function (rows) {
      if (cancelled) return;
      if (!Array.isArray(rows)) { setLoad("error"); return; }
      var w = windowsFromRows(rows); var e = {}; var draft = {};
      RECORD_TYPES.forEach(function (t) { e[t.key] = w[t.key] !== undefined; draft[t.key] = String(warnDaysFor(w, t.key)); });
      setExists(e); setD(draft); setLoad("ready");
    });
    return function () { cancelled = true; };
  }, []);

  async function save() {
    if (saving) return;
    for (var i = 0; i < RECORD_TYPES.length; i++) {
      var m = validateWarnDays(d[RECORD_TYPES[i].key]);
      if (m) { setErr(RECORD_TYPES[i].label + ": " + m); return; }
    }
    setSaving(true); setErr(""); setSaved(false);
    var nextExists = Object.assign({}, exists);
    for (var j = 0; j < RECORD_TYPES.length; j++) {
      var key = RECORD_TYPES[j].key; var days = Number(d[key]);
      var ok = exists[key]
        ? await db("PATCH", "pet_reminder_settings", { warn_days: days }, "?record_type=eq." + key)
        : await db("POST", "pet_reminder_settings", { record_type: key, warn_days: days });
      if (!ok) { setSaving(false); setErr("Couldn't save the reminder settings. Check your connection and try again."); setExists(nextExists); return; }
      nextExists[key] = true;
    }
    setExists(nextExists); setSaving(false); setSaved(true);
  }

  return (
    <Card style={{ padding: 16, display: "grid", gap: 12, maxWidth: 640, marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>Care reminders</div>
      <p style={{ margin: 0, color: MUTED_FG, fontSize: 12, lineHeight: 1.5 }}>
        Show "due soon" this many days before a due date (default {DEFAULT_WARN_DAYS} days, about six months). This is only a warning window: it does not mean a vaccination or treatment repeats that often. Dates that have passed are shown as expired.
      </p>
      {load === "loading" ? <p style={{ margin: 0, color: MUTED_FG, fontSize: 13 }}>Loading…</p> : null}
      {load === "error" ? <ErrorLine>Couldn't load your reminder settings. The six-month default is being used.</ErrorLine> : null}
      {load === "ready" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {RECORD_TYPES.map(function (t) {
            return (
              <Field key={t.key} label={t.label + " (days)"} htmlFor={"rem-" + t.key}>
                <input id={"rem-" + t.key} inputMode="numeric" style={inputStyle} value={d[t.key]}
                  onChange={function (e) { var n = Object.assign({}, d); n[t.key] = e.target.value; setD(n); setSaved(false); }} />
              </Field>
            );
          })}
        </div>
      ) : null}
      <ErrorLine>{err}</ErrorLine>
      {saved ? <div role="status" style={{ fontSize: 13 }}>Reminder settings saved.</div> : null}
      {load === "ready" ? <div><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save reminder settings"}</Button></div> : null}
    </Card>
  );
}
