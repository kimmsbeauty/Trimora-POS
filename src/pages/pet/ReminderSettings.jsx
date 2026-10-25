// src/pages/pet/ReminderSettings.jsx
//
// How far ahead a "due soon" reminder shows for each record type (Rabies,
// Deworming, ...). The default is six months. This is a reminder WINDOW only: it
// does not say how often anything is due, and an expired date is always flagged
// separately. Reads and writes use pet_reminder_settings (migration 098), writes
// through pet_save_reminder_setting / pet_delete_reminder_setting.
import React, { useEffect, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { MUTED_FG, BORDER, FOREGROUND } from "./theme";
import { DEFAULT_REMINDER_DAYS, validateReminderSetting, reminderErrorMessage } from "./petData";
import { Card, Button, Field, ErrorLine, inputStyle } from "./ui";

export default function ReminderSettings() {
  var listState = useState(null); var list = listState[0]; var setList = listState[1]; // null = loading
  var loadErrState = useState(false); var loadFailed = loadErrState[0]; var setLoadFailed = loadErrState[1];
  var typeState = useState(""); var recordType = typeState[0]; var setRecordType = typeState[1];
  var daysState = useState(""); var days = daysState[0]; var setDays = daysState[1];
  var editState = useState(null); var editing = editState[0]; var setEditing = editState[1]; // row id being edited
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];

  function load() {
    return db("GET", "pet_reminder_settings", null, "?select=id,record_type,window_days&order=record_type.asc&limit=200").then(function (res) {
      if (Array.isArray(res)) { setList(res); setLoadFailed(false); } else { setList([]); setLoadFailed(true); }
    });
  }
  useEffect(function () { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(row) { setEditing(row.id); setRecordType(row.record_type); setDays(String(row.window_days)); setErr(""); }
  function cancelEdit() { setEditing(null); setRecordType(""); setDays(""); setErr(""); }

  async function save() {
    if (saving) return;
    var msg = validateReminderSetting(recordType, days, list || [], editing);
    if (msg) { setErr(msg); return; }
    setSaving(true); setErr("");
    var res = await dbRpcAuth("pet_save_reminder_setting", { p_record_type: recordType.trim(), p_window_days: Number(days) });
    setSaving(false);
    if (res.error) { setErr(reminderErrorMessage(res.error)); return; }
    cancelEdit();
    await load();
  }

  async function remove(row) {
    if (saving) return;
    setSaving(true); setErr("");
    var res = await dbRpcAuth("pet_delete_reminder_setting", { p_id: row.id });
    setSaving(false);
    if (res.error) { setErr(reminderErrorMessage(res.error)); return; }
    await load();
  }

  return (
    <Card style={{ padding: 16, display: "grid", gap: 12, maxWidth: 640, marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>Vaccination and care reminders</div>
      <p style={{ margin: 0, fontSize: 12, color: MUTED_FG, lineHeight: 1.5 }}>
        A reminder shows when a record's due date is within its reminder window. Unless you set one below, the window is {DEFAULT_REMINDER_DAYS} days (six months).
        This is only how early the reminder appears; it does not mean anything is due every six months. Records without a due date never show a reminder, and a due date that has passed is flagged separately as overdue.
      </p>
      {loadFailed ? <p role="status" style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>Couldn't load your reminder settings, so the {DEFAULT_REMINDER_DAYS}-day default is being used. Refresh to try again.</p> : null}
      {list === null ? <p style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>Loading…</p> : list.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>No custom windows yet: every record type uses {DEFAULT_REMINDER_DAYS} days.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {list.map(function (row) {
            return (
              <li key={row.id} style={{ border: "1px solid " + BORDER, borderRadius: 12, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: FOREGROUND }}>
                <span><strong>{row.record_type}</strong> · {row.window_days} days</span>
                <span style={{ display: "flex", gap: 4 }}>
                  <Button size="sm" variant="ghost" onClick={function () { startEdit(row); }} disabled={saving} ariaLabel={"Edit reminder window for " + row.record_type}>Edit</Button>
                  <Button size="sm" variant="ghost-danger" onClick={function () { remove(row); }} disabled={saving} ariaLabel={"Remove reminder window for " + row.record_type}>Remove</Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Field label="Record type" htmlFor="rem-type"><input id="rem-type" style={inputStyle} value={recordType} placeholder="e.g. Rabies" onChange={function (e) { setRecordType(e.target.value); setErr(""); }} /></Field>
        <Field label="Remind (days before)" htmlFor="rem-days"><input id="rem-days" inputMode="numeric" style={inputStyle} value={days} placeholder={String(DEFAULT_REMINDER_DAYS)} onChange={function (e) { setDays(e.target.value); setErr(""); }} /></Field>
      </div>
      <ErrorLine>{err}</ErrorLine>
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add reminder window"}</Button>
        {editing ? <Button variant="ghost" onClick={cancelEdit} disabled={saving}>Cancel</Button> : null}
      </div>
    </Card>
  );
}
