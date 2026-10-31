// src/pages/pet/GroomingPage.jsx
//
// Grooming screen, Phase 4: the SERVICE CATALOGUE (pet_services, migration 085)
// covering Grooming, Boarding and Add-on items. The grooming workflow board
// (check-in, groomer, in progress, complete) arrives with bookings and is not
// built yet -- this screen does not pretend otherwise.
//
// canEdit is a UI convenience (admin vs staff), NOT security: the device session
// is shared, so the database cannot yet tell them apart (see PetApp).
import React, { useEffect, useState } from "react";
import { db } from "../../lib/db";
import { fmt } from "../../lib/utils";
import { serviceBlockMessage, unknownDeleteFailure } from "./deleteGuards";
import { SPECIES } from "./petData";
import { MUTED_FG, MUTED, BORDER, FOREGROUND } from "./theme";
import {
  CATEGORIES, validateService, serviceRow, isDuplicateService, durationLabel, speciesLabel, filterServices,
  missingFromOnlineBooking, countMissingFromOnlineBooking,
} from "./serviceData";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, InfoNote, inputStyle } from "./ui";

var EMPTY_DRAFT = { name: "", description: "", category: "Grooming", duration_minutes: "", price: "", species: [], active: true };

function draftFrom(s) {
  return {
    name: s.name || "", description: s.description || "", category: s.category || "Grooming",
    duration_minutes: s.duration_minutes === null || s.duration_minutes === undefined ? "" : String(s.duration_minutes),
    price: s.price === null || s.price === undefined ? "" : String(s.price),
    species: (s.species || []).slice(), active: s.active !== false,
  };
}

function sortServices(list) {
  return list.slice().sort(function (a, b) {
    var c = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
    return c !== 0 ? c : String(a.name).localeCompare(String(b.name));
  });
}

export default function GroomingPage({ canEdit }) {
  var svcState = useState(null); var services = svcState[0]; var setServices = svcState[1];
  var loadState = useState("loading"); var loadStatus = loadState[0]; var setLoadStatus = loadState[1];
  var attemptState = useState(0); var attempt = attemptState[0]; var setAttempt = attemptState[1];
  var qState = useState(""); var q = qState[0]; var setQ = qState[1];
  var catState = useState("all"); var category = catState[0]; var setCategory = catState[1];
  var inactiveState = useState(false); var showInactive = inactiveState[0]; var setShowInactive = inactiveState[1];
  var formState = useState(null); var form = formState[0]; var setForm = formState[1]; // {mode, id, draft}
  var deletingState = useState(null); var deleting = deletingState[0]; var setDeleting = deletingState[1];
  var blockedState = useState(""); var blocked = blockedState[0]; var setBlocked = blockedState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    db("GET", "pet_services", null, "?select=*&order=name.asc&limit=1000").then(function (res) {
      if (cancelled) return;
      // db() returns null when a request failed -- that is an error, not "no data".
      if (!Array.isArray(res)) { setLoadStatus("error"); return; }
      setServices(sortServices(res)); setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [attempt]);

  if (loadStatus === "loading") {
    return <div><PageHeader title="Grooming" subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading the service catalogue…</Card></div>;
  }
  if (loadStatus === "error") {
    return (
      <div>
        <PageHeader title="Grooming" />
        <Card style={{ padding: 8 }}>
          <EmptyState title="Couldn't load services" description="Check your connection and try again."
            action={<Button onClick={function () { setAttempt(attempt + 1); }}>Try again</Button>} />
        </Card>
      </div>
    );
  }

  var visible = filterServices(services, q, category, showInactive);
  var missingCount = countMissingFromOnlineBooking(services);
  var draft = form ? form.draft : null;

  function openAdd() { setForm({ mode: "add", id: null, draft: Object.assign({}, EMPTY_DRAFT, { species: [] }) }); setErr(""); }
  function openEdit(s) { setForm({ mode: "edit", id: s.id, draft: draftFrom(s) }); setErr(""); }
  function closeForm() { if (!saving) { setForm(null); setErr(""); } }
  function setField(k, v) { var o = {}; o[k] = v; setForm(Object.assign({}, form, { draft: Object.assign({}, form.draft, o) })); }
  function toggleSpecies(sp) {
    var cur = form.draft.species;
    setField("species", cur.indexOf(sp) === -1 ? cur.concat([sp]) : cur.filter(function (x) { return x !== sp; }));
  }

  async function saveService() {
    if (saving) return;
    var msg = validateService(form.draft);
    if (msg) { setErr(msg); return; }
    var row = serviceRow(form.draft);
    if (isDuplicateService(services, row, form.id)) { setErr("There is already a " + row.category + " service called " + row.name + "."); return; }
    setSaving(true); setErr("");
    if (form.mode === "add") {
      var created = await db("POST", "pet_services", row);
      setSaving(false);
      if (!Array.isArray(created) || !created[0]) { setErr("Couldn't save the service. Check your connection and try again."); return; }
      setServices(sortServices(services.concat([created[0]])));
    } else {
      var ok = await db("PATCH", "pet_services", row, "?id=eq." + form.id);
      setSaving(false);
      if (!ok) { setErr("Couldn't save changes. Check your connection and try again."); return; }
      setServices(sortServices(services.map(function (s) { return s.id === form.id ? Object.assign({}, s, row) : s; })));
    }
    setForm(null);
  }

  async function toggleActive(s) {
    if (saving) return;
    setSaving(true); setErr("");
    var ok = await db("PATCH", "pet_services", { active: !s.active }, "?id=eq." + s.id);
    setSaving(false);
    if (!ok) { setErr("Couldn't update " + s.name + ". Try again."); return; }
    setServices(services.map(function (x) { return x.id === s.id ? Object.assign({}, x, { active: !s.active }) : x; }));
  }

  // Checks history FIRST, so a delete that the database would refuse is never sent
  // (a failed delete would also be queued for retry by the generic db() helper).
  async function confirmDelete() {
    if (saving) return;
    setSaving(true); setErr(""); setBlocked("");
    var id = deleting.id;
    var inBookings = await db("GET", "pet_booking_services", null, "?service_id=eq." + id + "&select=id&limit=101");
    var inInvoices = await db("GET", "pet_invoice_lines", null, "?service_id=eq." + id + "&select=id&limit=101");
    if (!Array.isArray(inBookings) || !Array.isArray(inInvoices)) {
      setSaving(false);
      setErr("Couldn't check whether this service has booking or invoice history, so nothing was deleted. Check your connection and try again.");
      return;
    }
    var msg = serviceBlockMessage(deleting.name, { bookings: inBookings.length, invoices: inInvoices.length });
    if (msg) { setSaving(false); setBlocked(msg); return; }
    var ok = await db("DELETE", "pet_services", null, "?id=eq." + id);
    setSaving(false);
    if (!ok) { setErr(unknownDeleteFailure("service")); return; }
    setServices(services.filter(function (s) { return s.id !== id; }));
    setDeleting(null);
  }
  function closeDelete() { if (!saving) { setDeleting(null); setErr(""); setBlocked(""); } }
  async function deactivateInstead() {
    var s = deleting;
    await toggleActive(s);
    setDeleting(null); setBlocked("");
  }

  return (
    <div>
      <PageHeader
        title="Grooming"
        subtitle="Service catalogue: grooming, boarding rates and add-ons. The grooming workflow board comes with bookings."
        actions={canEdit ? <Button onClick={openAdd}>+ Add service</Button> : null}
      />

      <Card style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <input aria-label="Search services" placeholder="Search services" value={q}
          onChange={function (e) { setQ(e.target.value); }} style={Object.assign({}, inputStyle, { flex: "1 1 220px", width: "auto" })} />
        <select aria-label="Filter by category" value={category} onChange={function (e) { setCategory(e.target.value); }}
          style={Object.assign({}, inputStyle, { width: 160 })}>
          <option value="all">All categories</option>
          {CATEGORIES.map(function (c) { return <option key={c} value={c}>{c}</option>; })}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED_FG }}>
          <input type="checkbox" checked={showInactive} onChange={function (e) { setShowInactive(e.target.checked); }} />
          Show inactive
        </label>
      </Card>
      {!form && !deleting ? <ErrorLine>{err}</ErrorLine> : null}
      {missingCount > 0 ? (
        <div role="note" style={{ marginBottom: 16, fontSize: 13, color: MUTED_FG }}>
          {missingCount === 1 ? "1 service isn't" : missingCount + " services aren't"} on the online booking page because {missingCount === 1 ? "it has" : "they have"} no duration. Add a duration to show {missingCount === 1 ? "it" : "them"}.
        </div>
      ) : null}

      {services.length === 0 ? (
        <Card><EmptyState title="No services yet"
          description={canEdit ? "Add your first service, such as a bath, a nail trim or a nightly boarding rate." : "An administrator can add the first services."}
          action={canEdit ? <Button onClick={openAdd}>+ Add service</Button> : null} /></Card>
      ) : visible.length === 0 ? (
        <Card><EmptyState title="No services found" description="Try a different search, category, or show inactive services." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {visible.map(function (s) {
            return (
              <Card key={s.id} style={{ overflow: "hidden", opacity: s.active ? 1 : 0.7 }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid " + BORDER, background: MUTED }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(s.price)}</div>
                  </div>
                  <div style={{ color: MUTED_FG, fontSize: 12 }}>
                    {s.category}{s.duration_minutes ? " · " + durationLabel(s.duration_minutes) : ""} · {speciesLabel(s.species)}
                  </div>
                </div>
                <div style={{ padding: "12px 16px", minHeight: 48 }}>
                  <p style={{ margin: 0, color: MUTED_FG, fontSize: 12, lineHeight: 1.5 }}>{s.description || "No description."}</p>
                  {!s.active ? <div style={{ marginTop: 8 }}><Badge tone="neutral">Inactive</Badge></div> : null}
                  {missingFromOnlineBooking(s) ? <div style={{ marginTop: 8 }}><Badge tone="warning">Not on online booking: add a duration</Badge></div> : null}
                </div>
                {canEdit ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderTop: "1px solid " + BORDER }}>
                    <Button size="sm" variant="outline" onClick={function () { toggleActive(s); }} disabled={saving}
                      ariaLabel={(s.active ? "Deactivate " : "Activate ") + s.name}>{s.active ? "Deactivate" : "Activate"}</Button>
                    <div style={{ display: "flex", gap: 4 }}>
                      <Button size="sm" variant="ghost" onClick={function () { openEdit(s); }} ariaLabel={"Edit " + s.name}>Edit</Button>
                      <Button size="sm" variant="ghost-danger" onClick={function () { setErr(""); setBlocked(""); setDeleting(s); }} ariaLabel={"Delete " + s.name}>Delete</Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!form} onClose={closeForm} title={form && form.mode === "edit" ? "Edit service" : "Add service"}
        description="Prices are in whole Kenya shillings."
        footer={<>
          <Button variant="ghost" onClick={closeForm} disabled={saving}>Cancel</Button>
          <Button onClick={saveService} disabled={saving}>{saving ? "Saving…" : form && form.mode === "edit" ? "Save changes" : "Add service"}</Button>
        </>}>
        {draft ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Service name" htmlFor="svc-name"><input id="svc-name" style={inputStyle} value={draft.name} onChange={function (e) { setField("name", e.target.value); }} placeholder="e.g. Full groom" /></Field>
              <Field label="Category" htmlFor="svc-category">
                <select id="svc-category" style={inputStyle} value={draft.category} onChange={function (e) { setField("category", e.target.value); }}>
                  {CATEGORIES.map(function (c) { return <option key={c} value={c}>{c}</option>; })}
                </select>
              </Field>
              <Field label="Price (KES)" htmlFor="svc-price"><input id="svc-price" inputMode="numeric" style={inputStyle} value={draft.price} onChange={function (e) { setField("price", e.target.value); }} /></Field>
              <Field label="Duration in minutes (needed to show on online booking)" htmlFor="svc-duration"><input id="svc-duration" inputMode="numeric" style={inputStyle} value={draft.duration_minutes} onChange={function (e) { setField("duration_minutes", e.target.value); }} /></Field>
            </div>
            {draft.category === "Daycare" ? (
              <InfoNote title="How Daycare services are billed">
                A Daycare service is a rate, not something you add to an invoice one at a time, so it won't appear in Checkout.
                After saving, choose it as the Full-day, Half-day or Hourly rate in Daycare → Settings. The invoice is then created automatically when a dog is checked out.
              </InfoNote>
            ) : null}
            <fieldset style={{ border: "1px solid " + BORDER, borderRadius: 12, padding: "8px 12px", margin: 0 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, color: MUTED_FG, padding: "0 4px" }}>Applies to (none ticked = all species)</legend>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {SPECIES.map(function (sp) {
                  return (
                    <label key={sp} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: FOREGROUND }}>
                      <input type="checkbox" checked={draft.species.indexOf(sp) !== -1} onChange={function () { toggleSpecies(sp); }} />
                      {sp}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Field label="Description (optional)" htmlFor="svc-desc"><textarea id="svc-desc" rows={2} style={inputStyle} value={draft.description} onChange={function (e) { setField("description", e.target.value); }} /></Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: FOREGROUND }}>
              <input type="checkbox" checked={draft.active} onChange={function (e) { setField("active", e.target.checked); }} />
              Active (available to book and sell)
            </label>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!deleting} onClose={closeDelete}
        title={deleting ? "Delete " + deleting.name + "?" : ""}
        footer={<>
          <Button variant="ghost" onClick={closeDelete} disabled={saving}>Keep service</Button>
          {blocked && deleting && deleting.active
            ? <Button onClick={deactivateInstead} disabled={saving}>Deactivate instead</Button>
            : null}
          {!blocked ? <Button variant="danger" onClick={confirmDelete} disabled={saving}>{saving ? "Checking…" : "Delete service"}</Button> : null}
        </>}>
        {blocked ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: FOREGROUND, lineHeight: 1.5 }}>{blocked}</p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: FOREGROUND, lineHeight: 1.5 }}>
            This removes the service from the catalogue. If it has been used in a booking or invoice it can't be deleted; you'll be offered Deactivate instead.
          </p>
        )}
        <ErrorLine>{err}</ErrorLine>
      </Modal>
    </div>
  );
}
