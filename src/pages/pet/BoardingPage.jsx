// src/pages/pet/BoardingPage.jsx
//
// Boarding (Phase 7): kennels, stays, check-in / check-out and a 14-day occupancy
// timeline over pet_kennels and pet_boarding_stays (migration 089). The client only
// READS the tables; every change goes through the pet_* database functions, so
// double-booking a kennel or a pet is stopped by the database itself. The clash
// warning in the stay form is advisory.
//
// Kennel status is derived: occupied / reserved / available come from the stays and
// only "maintenance" is stored, so a kennel can't show "available" with a pet in it.
//
// Not built yet: stay invoicing and deposits (invoices phase), blocking boarding for
// overdue vaccinations (a warning is shown), daily care logs.
import React, { useEffect, useState } from "react";
import { db, dbRpcAuth } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { MUTED_FG, MUTED, BORDER, FOREGROUND, PRIMARY, INFO, WARNING } from "./theme";
import { vaccinationStatus } from "./petData";
import {
  KENNEL_LABELS, KENNEL_TONES, STAY_LABELS, kennelStatus, kennelCounts, currentStay, nextReservation,
  upcomingArrivals, timelineDays, timelineCell, findStayConflict, validateStay, validateKennel, isDuplicateKennel,
  boardingErrorMessage, stayLengthLabel, estimatedCost, formatDay, todayKey, addDaysKey, KENNEL_STATUSES,
} from "./boardingData";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";

function emptyStay(today, kennelId, checkInNow) {
  return { customer_id: "", pet_id: "", kennel_id: kennelId || "", service_id: "", check_in_on: today, check_out_on: addDaysKey(today, 1),
    feeding_notes: "", care_notes: "", check_in_now: !!checkInNow };
}
function stayDraft(s) {
  return { customer_id: s.customer_id, pet_id: s.pet_id, kennel_id: s.kennel_id, service_id: s.service_id || "", check_in_on: s.check_in_on,
    check_out_on: s.check_out_on, feeding_notes: s.feeding_notes || "", care_notes: s.care_notes || "", check_in_now: false };
}

async function fetchAll() {
  var res = await Promise.all([
    db("GET", "pet_kennels", null, "?select=*&order=name.asc&limit=500"),
    db("GET", "pet_boarding_stays", null, "?select=*&order=check_in_on.asc&limit=3000"),
    db("GET", "customers", null, "?select=id,name,phone&order=name.asc&limit=2000"),
    db("GET", "pet_pets", null, "?select=id,customer_id,name,species,archived_at&order=name.asc&limit=5000"),
    db("GET", "pet_vaccinations", null, "?select=id,pet_id,next_due_on&limit=5000"),
    db("GET", "pet_services", null, "?select=id,name,category,price,active&order=name.asc&limit=1000"),
  ]);
  // db() returns null when a request failed -- that is an error, not "no data".
  for (var i = 0; i < res.length; i++) if (!Array.isArray(res[i])) return null;
  return { kennels: res[0], stays: res[1], customers: res[2], pets: res[3], vaccs: res[4], services: res[5] };
}

export default function BoardingPage({ canEdit }) {
  var dataState = useState(null); var data = dataState[0]; var setData = dataState[1];
  var loadState = useState("loading"); var loadStatus = loadState[0]; var setLoadStatus = loadState[1];
  var attemptState = useState(0); var attempt = attemptState[0]; var setAttempt = attemptState[1];
  var stayFormState = useState(null); var stayForm = stayFormState[0]; var setStayForm = stayFormState[1]; // {mode, id, draft}
  var kennelFormState = useState(null); var kennelForm = kennelFormState[0]; var setKennelForm = kennelFormState[1]; // {id, draft}
  var confirmState = useState(null); var confirm = confirmState[0]; var setConfirm = confirmState[1]; // {kind, stay?, kennel?}
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    fetchAll().then(function (d) {
      if (cancelled) return;
      if (!d) { setLoadStatus("error"); return; }
      setData(d); setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [attempt]);

  if (loadStatus === "loading") {
    return <div><PageHeader title="Boarding" subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading kennels and stays…</Card></div>;
  }
  if (loadStatus === "error") {
    return (
      <div>
        <PageHeader title="Boarding" />
        <Card style={{ padding: 8 }}>
          <EmptyState title="Couldn't load boarding" description="Check your connection and try again."
            action={<Button onClick={function () { setAttempt(attempt + 1); }}>Try again</Button>} />
        </Card>
      </div>
    );
  }

  var today = todayKey();
  var kennels = data.kennels; var stays = data.stays;
  var customersById = {}; data.customers.forEach(function (c) { customersById[c.id] = c; });
  var petsById = {}; data.pets.forEach(function (p) { petsById[p.id] = p; });
  var kennelsById = {}; kennels.forEach(function (k) { kennelsById[k.id] = k; });
  var boardingServices = data.services.filter(function (s) { return s.category === "Boarding" && s.active; });
  var counts = kennelCounts(kennels, stays, today);
  var arrivals = upcomingArrivals(stays, today);
  var days = timelineDays(today, 14);
  var petName = function (id) { return petsById[id] ? petsById[id].name : "Unknown pet"; };
  var ownerName = function (id) { return customersById[id] ? customersById[id].name : "Unknown owner"; };

  async function reload() {
    var d = await fetchAll();
    if (d) setData(d);
  }
  // Runs a database function; on success reloads, on failure shows the friendly message.
  async function run(fnName, args, onDone) {
    if (busy) return false;
    setBusy(true); setErr("");
    var res = await dbRpcAuth(fnName, args);
    if (res && res.error) { setBusy(false); setErr(boardingErrorMessage(res.error)); return false; }
    await reload();
    setBusy(false);
    if (onDone) onDone();
    return true;
  }

  function overdueVaccine(petId) {
    return data.vaccs.some(function (v) { return v.pet_id === petId && vaccinationStatus(v.next_due_on, today) === "overdue"; });
  }

  // ---- stays ----
  function openNewStay(kennelId, checkInNow) { setErr(""); setStayForm({ mode: "add", id: null, draft: emptyStay(today, kennelId, checkInNow) }); }
  function openEditStay(s) { setErr(""); setStayForm({ mode: "edit", id: s.id, draft: stayDraft(s) }); }
  function closeStay() { if (!busy) { setStayForm(null); setErr(""); } }
  function setStayField(k, v) {
    var next = Object.assign({}, stayForm.draft); next[k] = v;
    if (k === "customer_id") next.pet_id = "";
    if (k === "check_in_on" && next.check_out_on < v) next.check_out_on = v;
    setStayForm(Object.assign({}, stayForm, { draft: next }));
  }
  async function saveStay() {
    var msg = validateStay(stayForm.draft);
    if (msg) { setErr(msg); return; }
    var d = stayForm.draft;
    var ok = stayForm.mode === "add"
      ? await run("pet_create_stay", {
          p_customer_id: d.customer_id, p_pet_id: d.pet_id, p_kennel_id: d.kennel_id, p_check_in: d.check_in_on, p_check_out: d.check_out_on,
          p_service_id: d.service_id || null, p_feeding: d.feeding_notes, p_notes: d.care_notes, p_check_in_now: !!d.check_in_now,
        })
      : await run("pet_update_stay", {
          p_id: stayForm.id, p_kennel_id: d.kennel_id, p_check_in: d.check_in_on, p_check_out: d.check_out_on,
          p_feeding: d.feeding_notes, p_notes: d.care_notes,
        });
    if (ok) setStayForm(null);
  }
  async function changeStatus(stay, status) {
    var ok = await run("pet_set_stay_status", { p_id: stay.id, p_status: status });
    if (ok) setConfirm(null);
  }

  // ---- kennels ----
  function openKennel(k) { setErr(""); setKennelForm({ id: k ? k.id : null, draft: { name: k ? k.name : "", kind: k ? k.kind : "Standard", notes: k ? k.notes || "" : "" } }); }
  function closeKennel() { if (!busy) { setKennelForm(null); setErr(""); } }
  function setKennelField(k, v) { var d = Object.assign({}, kennelForm.draft); d[k] = v; setKennelForm(Object.assign({}, kennelForm, { draft: d })); }
  async function saveKennel() {
    var msg = validateKennel(kennelForm.draft);
    if (msg) { setErr(msg); return; }
    if (isDuplicateKennel(kennels, kennelForm.draft.name, kennelForm.id)) { setErr("You already have a kennel with that name."); return; }
    var d = kennelForm.draft;
    var ok = await run("pet_save_kennel", { p_id: kennelForm.id, p_name: d.name, p_kind: d.kind, p_notes: d.notes });
    if (ok) setKennelForm(null);
  }
  async function deleteKennel(k) {
    var ok = await run("pet_delete_kennel", { p_id: k.id });
    if (ok) setConfirm(null);
  }

  // ---- form helpers ----
  var draft = stayForm ? stayForm.draft : null;
  var ownerPets = draft ? data.pets.filter(function (p) { return p.customer_id === draft.customer_id && !p.archived_at; }) : [];
  var formKennels = kennels.filter(function (k) { return !k.maintenance || (draft && k.id === draft.kennel_id); });
  var conflict = draft && draft.kennel_id && draft.check_in_on && draft.check_out_on >= draft.check_in_on
    ? findStayConflict(stays, draft, stayForm.id) : null;
  var warnVaccine = draft && draft.pet_id && overdueVaccine(draft.pet_id);

  function StayDetails(props) {
    var s = props.stay;
    var cost = estimatedCost(s);
    return (
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{petName(s.pet_id)} <span style={{ fontWeight: 400, color: MUTED_FG }}>· {ownerName(s.customer_id)}</span></div>
        <div style={{ color: MUTED_FG, fontSize: 12 }}>{formatDay(s.check_in_on)} → {formatDay(s.check_out_on)} · {stayLengthLabel(s)}{cost !== null ? " · est. " + fmt(cost) : ""}</div>
        {s.feeding_notes ? <div style={{ color: MUTED_FG, fontSize: 12, marginTop: 4 }}><strong>Feeding:</strong> {s.feeding_notes}</div> : null}
        {s.care_notes ? <div style={{ color: MUTED_FG, fontSize: 12, marginTop: 2 }}><strong>Notes:</strong> {s.care_notes}</div> : null}
        {overdueVaccine(s.pet_id) ? <div style={{ marginTop: 6 }}><Badge tone="danger">Vaccination overdue</Badge></div> : null}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Boarding"
        subtitle="Kennels, current stays and check-in / check-out."
        actions={<div style={{ display: "flex", gap: 8 }}>
          {canEdit ? <Button variant="outline" onClick={function () { openKennel(null); }}>+ Add kennel</Button> : null}
          <Button onClick={function () { openNewStay("", false); }}>+ New stay</Button>
        </div>}
      />
      {!stayForm && !kennelForm && !confirm ? <ErrorLine>{err}</ErrorLine> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        {KENNEL_STATUSES.map(function (st) {
          return (
            <Card key={st} style={{ padding: "12px 16px" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{counts[st]}</div>
              <div style={{ fontSize: 12, color: MUTED_FG }}>{KENNEL_LABELS[st]}</div>
            </Card>
          );
        })}
      </div>

      {kennels.length === 0 ? (
        <Card><EmptyState title="No kennels yet"
          description={canEdit ? "Add the kennels, suites or condos you board in. Pets are placed in a kennel when you create a stay." : "An administrator needs to add your kennels first."}
          action={canEdit ? <Button onClick={function () { openKennel(null); }}>+ Add kennel</Button> : null} /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
          {kennels.map(function (k) {
            var st = kennelStatus(k, stays, today);
            var cur = currentStay(k.id, stays);
            var nxt = cur ? null : nextReservation(k.id, stays, today);
            return (
              <Card key={k.id} style={{ overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid " + BORDER, background: MUTED, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{k.name}</div>
                    <div style={{ color: MUTED_FG, fontSize: 12 }}>{k.kind}</div>
                  </div>
                  <Badge tone={KENNEL_TONES[st]}>{KENNEL_LABELS[st]}</Badge>
                </div>
                <div style={{ padding: "12px 16px", minHeight: 70 }}>
                  {cur ? <StayDetails stay={cur} /> : nxt ? (
                    <div><div style={{ fontSize: 11, fontWeight: 700, color: WARNING, marginBottom: 4 }}>ARRIVING</div><StayDetails stay={nxt} /></div>
                  ) : (
                    <p style={{ margin: 0, color: MUTED_FG, fontSize: 12 }}>
                      {st === "maintenance" ? "Out of service." : "Ready for a new arrival."}{k.notes ? " " + k.notes : ""}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "8px 12px", borderTop: "1px solid " + BORDER, justifyContent: "flex-end" }}>
                  {cur ? <Button size="sm" variant="outline" ariaLabel={"Check out " + petName(cur.pet_id)} onClick={function () { setErr(""); setConfirm({ kind: "checkout", stay: cur }); }}>Check out</Button> : null}
                  {cur ? <Button size="sm" variant="ghost" ariaLabel={"Edit stay for " + petName(cur.pet_id)} onClick={function () { openEditStay(cur); }}>Edit</Button> : null}
                  {!cur && nxt ? <Button size="sm" variant="outline" ariaLabel={"Check in " + petName(nxt.pet_id)} onClick={function () { setErr(""); setConfirm({ kind: "checkin", stay: nxt }); }}>Check in</Button> : null}
                  {!cur && nxt ? <Button size="sm" variant="ghost" ariaLabel={"Edit stay for " + petName(nxt.pet_id)} onClick={function () { openEditStay(nxt); }}>Edit</Button> : null}
                  {!cur && !nxt && st === "available" ? <Button size="sm" variant="outline" ariaLabel={"Check in a pet to " + k.name} onClick={function () { openNewStay(k.id, true); }}>Check in a pet</Button> : null}
                  {canEdit && !cur ? (
                    <Button size="sm" variant="ghost" ariaLabel={(k.maintenance ? "End maintenance on " : "Maintenance on ") + k.name}
                      onClick={function () { run("pet_set_kennel_maintenance", { p_id: k.id, p_maintenance: !k.maintenance }); }}>
                      {k.maintenance ? "End maintenance" : "Maintenance"}
                    </Button>
                  ) : null}
                  {canEdit ? <Button size="sm" variant="ghost" ariaLabel={"Edit kennel " + k.name} onClick={function () { openKennel(k); }}>Edit kennel</Button> : null}
                  {canEdit ? <Button size="sm" variant="ghost-danger" ariaLabel={"Delete kennel " + k.name} onClick={function () { setErr(""); setConfirm({ kind: "delete", kennel: k }); }}>Delete</Button> : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <h2 style={{ fontSize: 15, margin: "0 0 8px", color: FOREGROUND }}>Arrivals</h2>
      {arrivals.length === 0 ? (
        <Card style={{ padding: 16, marginBottom: 24, color: MUTED_FG, fontSize: 13 }}>No reserved stays.</Card>
      ) : (
        <Card style={{ marginBottom: 24 }}>
          {arrivals.map(function (s, i) {
            return (
              <div key={s.id} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid " + BORDER }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{petName(s.pet_id)} <span style={{ fontWeight: 400, color: MUTED_FG }}>· {ownerName(s.customer_id)}</span></div>
                  <div style={{ color: MUTED_FG, fontSize: 12 }}>
                    {(kennelsById[s.kennel_id] || { name: "Unknown kennel" }).name} · {formatDay(s.check_in_on)} → {formatDay(s.check_out_on)} · {stayLengthLabel(s)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <Badge tone="warning">{STAY_LABELS[s.status]}</Badge>
                  <Button size="sm" variant="outline" ariaLabel={"Check in " + petName(s.pet_id) + " now"} onClick={function () { setErr(""); setConfirm({ kind: "checkin", stay: s }); }}>Check in</Button>
                  <Button size="sm" variant="ghost-danger" ariaLabel={"Cancel stay for " + petName(s.pet_id)} onClick={function () { setErr(""); setConfirm({ kind: "cancel", stay: s }); }}>Cancel</Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {kennels.length > 0 ? (
        <div>
          <h2 style={{ fontSize: 15, margin: "0 0 8px", color: FOREGROUND }}>Occupancy, next 14 days</h2>
          <Card style={{ padding: 16, overflowX: "auto" }}>
            <div style={{ minWidth: 640, display: "grid", gridTemplateColumns: "110px repeat(14, 1fr)", gap: 2, fontSize: 10 }}>
              <div />
              {days.map(function (d) { return <div key={d} style={{ textAlign: "center", color: MUTED_FG }}>{d.slice(8)}</div>; })}
              {kennels.map(function (k) {
                return (
                  <React.Fragment key={k.id}>
                    <div style={{ fontSize: 12, fontWeight: 600, padding: "2px 6px 2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</div>
                    {days.map(function (d) {
                      var cell = timelineCell(k.id, stays, d);
                      var bg = cell ? (cell.status === "occupied" ? PRIMARY + "B3" : INFO + "80") : k.maintenance ? BORDER : MUTED;
                      var title = cell ? petName(cell.pet_id) + " (" + STAY_LABELS[cell.status] + ")" : k.maintenance ? "Maintenance" : "Free";
                      return <div key={d} title={k.name + ", " + d + ": " + title} style={{ height: 18, borderRadius: 3, background: bg }} />;
                    })}
                  </React.Fragment>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, fontSize: 12, color: MUTED_FG }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: PRIMARY + "B3", marginRight: 6 }} />Checked in</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: INFO + "80", marginRight: 6 }} />Reserved</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: MUTED, border: "1px solid " + BORDER, marginRight: 6 }} />Free</span>
            </div>
          </Card>
        </div>
      ) : null}

      <Modal open={!!stayForm} onClose={closeStay} title={stayForm && stayForm.mode === "edit" ? "Edit stay" : "New stay"}
        description="The system checks the kennel and the pet are free for these dates before saving."
        footer={<>
          <Button variant="ghost" onClick={closeStay} disabled={busy}>Cancel</Button>
          <Button onClick={saveStay} disabled={busy}>{busy ? "Saving…" : stayForm && stayForm.mode === "edit" ? "Save changes" : draft && draft.check_in_now ? "Check in" : "Reserve"}</Button>
        </>}>
        {draft ? (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Customer" htmlFor="stay-customer">
              <select id="stay-customer" style={inputStyle} value={draft.customer_id} disabled={stayForm.mode === "edit"} onChange={function (e) { setStayField("customer_id", e.target.value); }}>
                <option value="">Choose a customer…</option>
                {data.customers.map(function (c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
              </select>
            </Field>
            <Field label="Pet" htmlFor="stay-pet">
              <select id="stay-pet" style={inputStyle} value={draft.pet_id} disabled={stayForm.mode === "edit" || !draft.customer_id} onChange={function (e) { setStayField("pet_id", e.target.value); }}>
                <option value="">{draft.customer_id && ownerPets.length === 0 ? "This customer has no pets yet" : "Choose a pet…"}</option>
                {ownerPets.map(function (p) { return <option key={p.id} value={p.id}>{p.name} ({p.species})</option>; })}
              </select>
            </Field>
            {warnVaccine ? <Badge tone="danger">This pet has an overdue vaccination</Badge> : null}
            <Field label="Kennel" htmlFor="stay-kennel">
              <select id="stay-kennel" style={inputStyle} value={draft.kennel_id} onChange={function (e) { setStayField("kennel_id", e.target.value); }}>
                <option value="">Choose a kennel…</option>
                {formKennels.map(function (k) { return <option key={k.id} value={k.id}>{k.name} · {k.kind}</option>; })}
              </select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Check-in" htmlFor="stay-in"><input id="stay-in" type="date" style={inputStyle} value={draft.check_in_on} onChange={function (e) { setStayField("check_in_on", e.target.value); }} /></Field>
              <Field label="Check-out" htmlFor="stay-out"><input id="stay-out" type="date" style={inputStyle} value={draft.check_out_on} min={draft.check_in_on} onChange={function (e) { setStayField("check_out_on", e.target.value); }} /></Field>
            </div>
            {stayForm.mode === "add" ? (
              <Field label="Boarding rate (optional)" htmlFor="stay-service">
                <select id="stay-service" style={inputStyle} value={draft.service_id} onChange={function (e) { setStayField("service_id", e.target.value); }}>
                  <option value="">No rate</option>
                  {boardingServices.map(function (s) { return <option key={s.id} value={s.id}>{s.name} ({fmt(s.price)})</option>; })}
                </select>
              </Field>
            ) : null}
            <Field label="Feeding (optional)" htmlFor="stay-feeding"><textarea id="stay-feeding" rows={2} style={inputStyle} value={draft.feeding_notes} onChange={function (e) { setStayField("feeding_notes", e.target.value); }} /></Field>
            <Field label="Care notes (optional)" htmlFor="stay-notes"><textarea id="stay-notes" rows={2} style={inputStyle} value={draft.care_notes} onChange={function (e) { setStayField("care_notes", e.target.value); }} /></Field>
            {stayForm.mode === "add" ? (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={!!draft.check_in_now} onChange={function (e) { setStayField("check_in_now", e.target.checked); }} />
                Check in now (the pet is arriving)
              </label>
            ) : null}
            {conflict ? <ErrorLine>{conflict === "kennel" ? "That kennel looks taken for some of these dates." : "This pet already has a stay on some of these dates."} The system will confirm when you save.</ErrorLine> : null}
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!kennelForm} onClose={closeKennel} title={kennelForm && kennelForm.id ? "Edit kennel" : "Add kennel"}
        footer={<>
          <Button variant="ghost" onClick={closeKennel} disabled={busy}>Cancel</Button>
          <Button onClick={saveKennel} disabled={busy}>{busy ? "Saving…" : kennelForm && kennelForm.id ? "Save changes" : "Add kennel"}</Button>
        </>}>
        {kennelForm ? (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Kennel name" htmlFor="kennel-name"><input id="kennel-name" style={inputStyle} value={kennelForm.draft.name} onChange={function (e) { setKennelField("name", e.target.value); }} placeholder="e.g. Suite 1" /></Field>
            <Field label="Type" htmlFor="kennel-kind"><input id="kennel-kind" style={inputStyle} value={kennelForm.draft.kind} onChange={function (e) { setKennelField("kind", e.target.value); }} placeholder="e.g. Deluxe suite, Standard, Feline" /></Field>
            <Field label="Notes (optional)" htmlFor="kennel-notes"><textarea id="kennel-notes" rows={2} style={inputStyle} value={kennelForm.draft.notes} onChange={function (e) { setKennelField("notes", e.target.value); }} /></Field>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!confirm} onClose={function () { if (!busy) { setConfirm(null); setErr(""); } }}
        title={!confirm ? "" : confirm.kind === "checkout" ? "Check out " + petName(confirm.stay.pet_id) + "?"
          : confirm.kind === "checkin" ? "Check in " + petName(confirm.stay.pet_id) + "?"
          : confirm.kind === "cancel" ? "Cancel this reservation?" : "Delete " + confirm.kennel.name + "?"}
        footer={<>
          <Button variant="ghost" onClick={function () { setConfirm(null); setErr(""); }} disabled={busy}>Keep as is</Button>
          {confirm ? (
            <Button variant={confirm.kind === "cancel" || confirm.kind === "delete" ? "danger" : "primary"} disabled={busy}
              onClick={function () {
                if (confirm.kind === "delete") deleteKennel(confirm.kennel);
                else changeStatus(confirm.stay, confirm.kind === "checkout" ? "checked-out" : confirm.kind === "checkin" ? "occupied" : "cancelled");
              }}>
              {busy ? "Working…" : confirm.kind === "checkout" ? "Check out" : confirm.kind === "checkin" ? "Check in" : confirm.kind === "cancel" ? "Cancel reservation" : "Delete kennel"}
            </Button>
          ) : null}
        </>}>
        <p style={{ margin: 0, fontSize: 13, color: FOREGROUND, lineHeight: 1.5 }}>
          {!confirm ? "" : confirm.kind === "checkout" ? "This frees the kennel straight away, even if the planned check-out date is later."
            : confirm.kind === "checkin" ? "The kennel will show as occupied from now."
            : confirm.kind === "cancel" ? "This frees the kennel for those dates. A cancelled stay can't be restored."
            : "Only kennels with no stay history can be deleted. Otherwise put it in maintenance."}
        </p>
        <ErrorLine>{err}</ErrorLine>
      </Modal>
    </div>
  );
}
