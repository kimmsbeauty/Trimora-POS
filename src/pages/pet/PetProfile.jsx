// src/pages/pet/PetProfile.jsx
// Pet profile with vaccination records (add / remove). Status badges use the
// prototype's values: current / due-soon / overdue (computed from next due date).
import React, { useState } from "react";
import { db } from "../../lib/db";
import { MUTED_FG, BORDER, FOREGROUND } from "./theme";
import { ageLabel, recordStatus, dueText, reminderWindowFor, validateVaccination } from "./petData";
import { Modal, Button, Field, Badge, ErrorLine, inputStyle } from "./ui";

var STATUS_BADGE = {
  current: { tone: "success", label: "Current" },
  "due-soon": { tone: "warning", label: "Due soon" },
  overdue: { tone: "danger", label: "Overdue" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  var p = String(iso).split("-");
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "4px 0" }}>
      <span style={{ color: MUTED_FG }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
}

export default function PetProfile({ pet, owner, vaccinations, onVaccinationsChange, onClose, onEdit, reminderSettings }) {
  var draftState = useState({ vaccine: "", given_on: "", next_due_on: "" });
  var draft = draftState[0]; var setDraft = draftState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var removingState = useState(null); var removing = removingState[0]; var setRemoving = removingState[1];

  function setField(k, v) { var o = Object.assign({}, draft); o[k] = v; setDraft(o); }

  async function addVaccination() {
    if (saving) return;
    var msg = validateVaccination(draft);
    if (msg) { setErr(msg); return; }
    setSaving(true); setErr("");
    var row = { pet_id: pet.id, vaccine: draft.vaccine.trim(), given_on: draft.given_on, next_due_on: draft.next_due_on || null };
    var res = await db("POST", "pet_vaccinations", row);
    setSaving(false);
    if (!Array.isArray(res) || !res[0]) { setErr("Couldn't save the vaccination. Check your connection and try again."); return; }
    onVaccinationsChange(vaccinations.concat([res[0]]));
    setDraft({ vaccine: "", given_on: "", next_due_on: "" });
  }

  async function removeVaccination(v) {
    if (saving) return;
    setSaving(true); setErr("");
    var ok = await db("DELETE", "pet_vaccinations", null, "?id=eq." + v.id);
    setSaving(false);
    if (!ok) { setErr("Couldn't remove the record. Check your connection and try again."); return; }
    onVaccinationsChange(vaccinations.filter(function (x) { return x.id !== v.id; }));
    setRemoving(null);
  }

  var sorted = vaccinations.slice().sort(function (a, b) { return String(b.given_on).localeCompare(String(a.given_on)); });

  return (
    <Modal open={true} onClose={onClose} title={pet.name} width={600}
      description={pet.species + (pet.breed ? " · " + pet.breed : "") + " · " + ageLabel(pet.date_of_birth)}
      footer={<><Button variant="outline" onClick={onEdit}>Edit pet</Button><Button onClick={onClose}>Close</Button></>}>
      <div style={{ borderBottom: "1px solid " + BORDER, paddingBottom: 8, marginBottom: 12 }}>
        <Row label="Owner" value={owner ? owner.name + (owner.phone ? " · " + owner.phone : "") : "Unknown"} />
        <Row label="Sex" value={pet.sex} />
        <Row label="Colour" value={pet.color} />
        <Row label="Weight" value={pet.weight_kg ? pet.weight_kg + " kg" : ""} />
        <Row label="Care notes" value={pet.care_notes} />
        <Row label="Grooming notes" value={pet.grooming_notes} />
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: FOREGROUND }}>Vaccinations</div>
      {sorted.length === 0 ? (
        <p style={{ margin: "0 0 12px", color: MUTED_FG, fontSize: 13 }}>No vaccinations recorded yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "grid", gap: 8 }}>
          {sorted.map(function (v) {
            var s = recordStatus(v, undefined, reminderSettings);
            var badge = s ? STATUS_BADGE[s] : null;
            return (
              <li key={v.id} style={{ border: "1px solid " + BORDER, borderRadius: 12, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{v.vaccine}</div>
                  <div style={{ fontSize: 12, color: MUTED_FG }}>Given {fmtDate(v.given_on)} · Next due {v.next_due_on ? fmtDate(v.next_due_on) : "not set"}</div>
                  {v.next_due_on ? <div style={{ fontSize: 12, color: s === "overdue" ? "#b42318" : MUTED_FG }}>{dueText(v.next_due_on)}{s === "due-soon" ? " · reminder window " + reminderWindowFor(v.vaccine, reminderSettings) + " days" : ""}</div> : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : <Badge tone="neutral">No due date</Badge>}
                  {removing === v.id ? (
                    <>
                      <Button size="sm" variant="danger" onClick={function () { removeVaccination(v); }} disabled={saving}>Confirm remove</Button>
                      <Button size="sm" variant="ghost" onClick={function () { setRemoving(null); }} disabled={saving}>Cancel</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost-danger" onClick={function () { setRemoving(v.id); setErr(""); }} ariaLabel={"Remove " + v.vaccine + " record"}>Remove</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ border: "1px solid " + BORDER, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Add a vaccination</div>
        <Field label="Vaccine" htmlFor="vacc-name"><input id="vacc-name" style={inputStyle} value={draft.vaccine} onChange={function (e) { setField("vaccine", e.target.value); }} placeholder="e.g. Rabies" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Given on" htmlFor="vacc-given"><input id="vacc-given" type="date" style={inputStyle} value={draft.given_on} onChange={function (e) { setField("given_on", e.target.value); }} /></Field>
          <Field label="Next due (optional)" htmlFor="vacc-due"><input id="vacc-due" type="date" style={inputStyle} value={draft.next_due_on} onChange={function (e) { setField("next_due_on", e.target.value); }} /></Field>
        </div>
        <div><Button size="sm" onClick={addVaccination} disabled={saving}>{saving ? "Saving…" : "Add vaccination"}</Button></div>
        <ErrorLine>{err}</ErrorLine>
      </div>
    </Modal>
  );
}
