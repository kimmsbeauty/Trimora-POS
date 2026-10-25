// src/pages/pet/PetsPage.jsx
//
// Real Pets screen (Phase 2): pets registered at the business, owned by rows of
// the shared `customers` table, with vaccination records. All data comes from
// the tenant-scoped pet_pets / pet_vaccinations tables via db(); nothing here
// is sample data.
//
// Permissions note: admin/staff is a UI split only (shared device session).
// No allergy/medical field exists yet by design -- see migration 083.
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/db";
import { petBlockMessage, unknownDeleteFailure } from "./deleteGuards";
import {
  MUTED_FG, MUTED, BORDER, FOREGROUND,
} from "./theme";
import {
  SPECIES, SEX, ageLabel, validatePet, petRow, isDuplicatePet, vaccinationSummary, filterPets, filterByArchive, isArchived, ARCHIVE_REASONS, archiveReasonLabel, windowsFromRows,
} from "./petData";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";
import PetProfile from "./PetProfile";

var PAGE_SIZE = 12;
var EMPTY_DRAFT = {
  name: "", customer_id: "", species: "Dog", breed: "", sex: "Unknown", date_of_birth: "",
  color: "", weight_kg: "", care_notes: "", grooming_notes: "",
};

function draftFromPet(p) {
  return {
    name: p.name || "", customer_id: p.customer_id || "", species: p.species || "Dog", breed: p.breed || "",
    sex: p.sex || "Unknown", date_of_birth: p.date_of_birth || "", color: p.color || "",
    weight_kg: p.weight_kg === null || p.weight_kg === undefined ? "" : String(p.weight_kg),
    care_notes: p.care_notes || "", grooming_notes: p.grooming_notes || "",
  };
}

export default function PetsPage() {
  var petsState = useState(null); var pets = petsState[0]; var setPets = petsState[1];
  var ownersState = useState([]); var owners = ownersState[0]; var setOwners = ownersState[1];
  var vaccState = useState([]); var vaccs = vaccState[0]; var setVaccs = vaccState[1];
  var loadState = useState("loading"); var loadStatus = loadState[0]; var setLoadStatus = loadState[1];
  var attemptState = useState(0); var attempt = attemptState[0]; var setAttempt = attemptState[1];

  var qState = useState(""); var q = qState[0]; var setQ = qState[1];
  var speciesState = useState("all"); var species = speciesState[0]; var setSpecies = speciesState[1];
  var breedState = useState("all"); var breed = breedState[0]; var setBreed = breedState[1];
  var pageState = useState(0); var page = pageState[0]; var setPage = pageState[1];

  var formState = useState(null); var form = formState[0]; var setForm = formState[1]; // {mode, id, draft}
  var deletingState = useState(null); var deleting = deletingState[0]; var setDeleting = deletingState[1];
  var blockedState = useState(""); var blocked = blockedState[0]; var setBlocked = blockedState[1];
  var profileState = useState(null); var profileId = profileState[0]; var setProfileId = profileState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];

  var windowsState = useState({}); var windows = windowsState[0]; var setWindows = windowsState[1];
  var viewState = useState("active"); var view = viewState[0]; var setView = viewState[1];
  var archivingState = useState(null); var archiving = archivingState[0]; var setArchiving = archivingState[1];
  var reasonState = useState("inactive"); var reason = reasonState[0]; var setReason = reasonState[1];

  var newOwnerState = useState(null); var newOwner = newOwnerState[0]; var setNewOwner = newOwnerState[1];

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    Promise.all([
      db("GET", "pet_pets", null, "?select=*&order=name.asc&limit=1000"),
      db("GET", "customers", null, "?select=id,name,phone&order=name.asc&limit=1000"),
      db("GET", "pet_vaccinations", null, "?select=id,pet_id,record_type,vaccine,given_on,next_due_on&order=given_on.desc&limit=5000"),
      db("GET", "pet_reminder_settings", null, "?select=record_type,warn_days"),
    ]).then(function (res) {
      if (cancelled) return;
      // db() returns null when a request failed -- that is an error, not "no data".
      if (!Array.isArray(res[0]) || !Array.isArray(res[1]) || !Array.isArray(res[2])) { setLoadStatus("error"); return; }
      // Reminder windows are optional: if they can't be read, the six-month default applies.
      setWindows(Array.isArray(res[3]) ? windowsFromRows(res[3]) : {});
      setPets(res[0]); setOwners(res[1]); setVaccs(res[2]); setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [attempt]);

  var ownersById = useMemo(function () {
    var m = {}; owners.forEach(function (o) { m[o.id] = o; }); return m;
  }, [owners]);
  var vaccsByPet = useMemo(function () {
    var m = {}; vaccs.forEach(function (v) { (m[v.pet_id] = m[v.pet_id] || []).push(v); }); return m;
  }, [vaccs]);
  var breeds = useMemo(function () {
    var set = {}; (pets || []).forEach(function (p) { if (p.breed) set[p.breed] = true; });
    return Object.keys(set).sort();
  }, [pets]);

  var archivedCount = (pets || []).filter(isArchived).length;
  var filtered = filterPets(filterByArchive(pets || [], view), ownersById, q, species, breed);
  var pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  var safePage = Math.min(page, pageCount - 1);
  var visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function openAdd() { setForm({ mode: "add", id: null, draft: Object.assign({}, EMPTY_DRAFT) }); setErr(""); setNewOwner(null); }
  function openEdit(p) { setForm({ mode: "edit", id: p.id, draft: draftFromPet(p) }); setErr(""); setNewOwner(null); }
  function closeForm() { if (!saving) { setForm(null); setErr(""); setNewOwner(null); } }
  function setField(k, v) { setForm(Object.assign({}, form, { draft: Object.assign({}, form.draft, (function () { var o = {}; o[k] = v; return o; })()) })); }

  async function addOwnerInline() {
    var name = (newOwner.name || "").trim();
    var phone = (newOwner.phone || "").trim();
    if (!name) { setErr("Enter the owner's name."); return; }
    if (phone && owners.some(function (o) { return (o.phone || "").replace(/\s+/g, "") === phone.replace(/\s+/g, ""); })) {
      setErr("A customer with that phone number already exists -- pick them from the list instead."); return;
    }
    setSaving(true); setErr("");
    var res = await db("POST", "customers", { name: name, phone: phone || null });
    setSaving(false);
    if (!Array.isArray(res) || !res[0]) { setErr("Couldn't add the owner. Check your connection and try again."); return; }
    setOwners(owners.concat([{ id: res[0].id, name: res[0].name, phone: res[0].phone }]).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }));
    setField("customer_id", res[0].id);
    setNewOwner(null);
  }

  async function savePet() {
    if (saving) return;
    var msg = validatePet(form.draft);
    if (msg) { setErr(msg); return; }
    var row = petRow(form.draft);
    if (isDuplicatePet(pets, row, form.id)) { setErr("This owner already has a " + row.species.toLowerCase() + " named " + row.name + "."); return; }
    setSaving(true); setErr("");
    if (form.mode === "add") {
      var created = await db("POST", "pet_pets", row);
      setSaving(false);
      if (!Array.isArray(created) || !created[0]) { setErr("Couldn't save the pet. Check your connection and try again."); return; }
      setPets(pets.concat([created[0]]).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }));
    } else {
      var ok = await db("PATCH", "pet_pets", row, "?id=eq." + form.id);
      setSaving(false);
      if (!ok) { setErr("Couldn't save the changes. Check your connection and try again."); return; }
      setPets(pets.map(function (p) { return p.id === form.id ? Object.assign({}, p, row) : p; }));
    }
    setForm(null);
  }

  // Checks history first so a delete the database would refuse is never sent.
  async function confirmDelete() {
    if (saving || !deleting) return;
    setSaving(true); setErr(""); setBlocked("");
    var id = deleting.id;
    var q = "?pet_id=eq." + id + "&select=id&limit=101";
    var hb = await db("GET", "pet_bookings", null, q);
    var hs = await db("GET", "pet_boarding_stays", null, q);
    var hi = await db("GET", "pet_invoices", null, q);
    if (!Array.isArray(hb) || !Array.isArray(hs) || !Array.isArray(hi)) {
      setSaving(false);
      setErr("Couldn't check this pet's booking and invoice history, so nothing was deleted. Check your connection and try again.");
      return;
    }
    var msg = petBlockMessage(deleting.name, { bookings: hb.length, stays: hs.length, invoices: hi.length });
    if (msg) { setSaving(false); setBlocked(msg); return; }
    var ok = await db("DELETE", "pet_pets", null, "?id=eq." + id);
    setSaving(false);
    if (!ok) { setErr(unknownDeleteFailure("pet")); return; }
    setPets(pets.filter(function (p) { return p.id !== deleting.id; }));
    setVaccs(vaccs.filter(function (v) { return v.pet_id !== deleting.id; }));
    setDeleting(null);
  }

  async function confirmArchive() {
    if (saving || !archiving) return;
    setSaving(true); setErr("");
    var res = await db("PATCH", "pet_pets", { archived_at: new Date().toISOString(), archived_reason: reason }, "?id=eq." + archiving.id);
    setSaving(false);
    if (!res) { setErr("Couldn't archive the pet. If it has an upcoming booking or boarding stay, complete or cancel that first; otherwise check your connection and try again."); return; }
    var row = Array.isArray(res) && res[0] ? res[0] : { archived_at: new Date().toISOString(), archived_reason: reason };
    setPets(pets.map(function (p) { return p.id === archiving.id ? Object.assign({}, p, { archived_at: row.archived_at, archived_reason: row.archived_reason }) : p; }));
    setArchiving(null);
  }
  async function restorePet(p) {
    if (saving) return;
    setSaving(true); setErr("");
    var ok = await db("PATCH", "pet_pets", { archived_at: null, archived_reason: null }, "?id=eq." + p.id);
    setSaving(false);
    if (!ok) { setErr("Couldn't restore " + p.name + ". Check your connection and try again."); return; }
    setPets(pets.map(function (x) { return x.id === p.id ? Object.assign({}, x, { archived_at: null, archived_reason: null }) : x; }));
  }

  var profilePet = profileId && pets ? pets.filter(function (p) { return p.id === profileId; })[0] : null;

  if (loadStatus === "loading") {
    return (<div><PageHeader title="Pets" /><p style={{ color: MUTED_FG, fontSize: 13 }}>Loading pets…</p></div>);
  }
  if (loadStatus === "error") {
    return (
      <div>
        <PageHeader title="Pets" />
        <Card style={{ padding: 8 }}>
          <EmptyState title="Couldn't load pets" description="Check your connection and try again."
            action={<Button onClick={function () { setAttempt(attempt + 1); }}>Try again</Button>} />
        </Card>
      </div>
    );
  }

  var draft = form ? form.draft : null;
  return (
    <div>
      <PageHeader
        title="Pets"
        subtitle="Every pet registered with the business, with care notes and vaccination status"
        actions={<Button onClick={openAdd}>+ Add pet</Button>}
      />

      <Card style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <input aria-label="Search pets by pet or owner name" placeholder="Search by pet or owner name" value={q}
          onChange={function (e) { setQ(e.target.value); setPage(0); }}
          style={Object.assign({}, inputStyle, { flex: "1 1 220px", width: "auto" })} />
        <select aria-label="Filter by species" value={species} onChange={function (e) { setSpecies(e.target.value); setPage(0); }}
          style={Object.assign({}, inputStyle, { width: 150 })}>
          <option value="all">All species</option>
          {SPECIES.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
        </select>
        <select aria-label="Show pets" value={view} onChange={function (e) { setView(e.target.value); setPage(0); }}
          style={Object.assign({}, inputStyle, { width: 170 })}>
          <option value="active">Active pets</option>
          <option value="archived">Archived ({archivedCount})</option>
          <option value="all">All pets</option>
        </select>
        <select aria-label="Filter by breed" value={breed} onChange={function (e) { setBreed(e.target.value); setPage(0); }}
          style={Object.assign({}, inputStyle, { width: 180 })}>
          <option value="all">All breeds</option>
          {breeds.map(function (b) { return <option key={b} value={b}>{b}</option>; })}
        </select>
      </Card>

      {view === "active" && pets.length === archivedCount && pets.length > 0 ? (
        <Card><EmptyState title="No active pets" description="All of your pets are archived. Switch to Archived pets to restore one, or add a new pet." /></Card>
      ) : pets.length === 0 ? (
        <Card><EmptyState title="No pets yet" description="Add your first pet to start building the pet and vaccination records."
          action={<Button onClick={openAdd}>+ Add pet</Button>} /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState title="No pets found" description="Try a different name, species or breed filter." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {visible.map(function (p) {
            var owner = ownersById[p.customer_id];
            var sum = vaccinationSummary(vaccsByPet[p.id], undefined, windows);
            return (
              <Card key={p.id} style={{ overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid " + BORDER, background: MUTED }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}{isArchived(p) ? <span style={{ marginLeft: 8 }}><Badge tone="neutral">Archived · {archiveReasonLabel(p.archived_reason)}</Badge></span> : null}</div>
                  <div style={{ color: MUTED_FG, fontSize: 12 }}>{p.species}{p.breed ? " · " + p.breed : ""} · {ageLabel(p.date_of_birth)}</div>
                  <div style={{ color: MUTED_FG, fontSize: 12 }}>Owner: {owner ? owner.name : "Unknown"}</div>
                </div>
                <div style={{ padding: "12px 16px", minHeight: 56 }}>
                  <p style={{ margin: 0, color: MUTED_FG, fontSize: 12, lineHeight: 1.5 }}>{p.care_notes || "No care notes yet."}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {sum.overdue > 0 ? <Badge tone="danger">Vaccination overdue</Badge> : null}
                    {sum.dueSoon > 0 ? <Badge tone="warning">Vaccine due soon</Badge> : null}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderTop: "1px solid " + BORDER }}>
                  <Button size="sm" variant="outline" onClick={function () { setProfileId(p.id); }} ariaLabel={"View profile of " + p.name}>View profile</Button>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Button size="sm" variant="ghost" onClick={function () { openEdit(p); }} ariaLabel={"Edit " + p.name}>Edit</Button>
                    {isArchived(p) ? (
                      <Button size="sm" variant="outline" onClick={function () { restorePet(p); }} disabled={saving} ariaLabel={"Restore " + p.name}>Restore</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={function () { setErr(""); setReason("inactive"); setArchiving(p); }} ariaLabel={"Archive " + p.name}>Archive</Button>
                    )}
                    <Button size="sm" variant="ghost-danger" onClick={function () { setErr(""); setDeleting(p); }} ariaLabel={"Delete " + p.name}>Delete</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {filtered.length > PAGE_SIZE ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16, fontSize: 12, color: MUTED_FG }}>
          <Button size="sm" variant="outline" disabled={safePage === 0} onClick={function () { setPage(safePage - 1); }}>Previous</Button>
          <span>Page {safePage + 1} of {pageCount}</span>
          <Button size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={function () { setPage(safePage + 1); }}>Next</Button>
        </div>
      ) : null}

      <Modal open={!!form} onClose={closeForm} title={form && form.mode === "edit" ? "Edit pet" : "Add pet"}
        description="Basic details. Vaccinations are added from the pet's profile."
        footer={<>
          <Button variant="ghost" onClick={closeForm} disabled={saving}>Cancel</Button>
          <Button onClick={savePet} disabled={saving}>{saving ? "Saving…" : form && form.mode === "edit" ? "Save changes" : "Add pet"}</Button>
        </>}>
        {draft ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Name" htmlFor="pet-name"><input id="pet-name" style={inputStyle} value={draft.name} onChange={function (e) { setField("name", e.target.value); }} placeholder="e.g. Simba" /></Field>
              <Field label="Species" htmlFor="pet-species">
                <select id="pet-species" style={inputStyle} value={draft.species} onChange={function (e) { setField("species", e.target.value); }}>
                  {SPECIES.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
                </select>
              </Field>
              <Field label="Breed" htmlFor="pet-breed"><input id="pet-breed" style={inputStyle} value={draft.breed} onChange={function (e) { setField("breed", e.target.value); }} placeholder="e.g. Golden Retriever" /></Field>
              <Field label="Sex" htmlFor="pet-sex">
                <select id="pet-sex" style={inputStyle} value={draft.sex} onChange={function (e) { setField("sex", e.target.value); }}>
                  {SEX.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
                </select>
              </Field>
              <Field label="Date of birth (optional)" htmlFor="pet-dob"><input id="pet-dob" type="date" style={inputStyle} value={draft.date_of_birth} onChange={function (e) { setField("date_of_birth", e.target.value); }} /></Field>
              <Field label="Weight in kg (optional)" htmlFor="pet-weight"><input id="pet-weight" inputMode="decimal" style={inputStyle} value={draft.weight_kg} onChange={function (e) { setField("weight_kg", e.target.value); }} /></Field>
            </div>
            <Field label="Colour (optional)" htmlFor="pet-color"><input id="pet-color" style={inputStyle} value={draft.color} onChange={function (e) { setField("color", e.target.value); }} /></Field>

            <Field label="Owner" htmlFor="pet-owner">
              <select id="pet-owner" style={inputStyle} value={draft.customer_id} onChange={function (e) { setField("customer_id", e.target.value); }}>
                <option value="">Choose the owner…</option>
                {owners.map(function (o) { return <option key={o.id} value={o.id}>{o.name}{o.phone ? " · " + o.phone : ""}</option>; })}
              </select>
            </Field>
            {newOwner ? (
              <div style={{ border: "1px solid " + BORDER, borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>New owner</div>
                <input aria-label="New owner name" style={inputStyle} placeholder="Owner's full name" value={newOwner.name} onChange={function (e) { setNewOwner({ name: e.target.value, phone: newOwner.phone }); }} />
                <input aria-label="New owner phone" style={inputStyle} placeholder="Phone (optional)" value={newOwner.phone} onChange={function (e) { setNewOwner({ name: newOwner.name, phone: e.target.value }); }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="sm" onClick={addOwnerInline} disabled={saving}>Save owner</Button>
                  <Button size="sm" variant="ghost" onClick={function () { setNewOwner(null); setErr(""); }} disabled={saving}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div><Button size="sm" variant="outline" onClick={function () { setNewOwner({ name: "", phone: "" }); setErr(""); }}>+ New owner</Button></div>
            )}

            <Field label="Care notes (temperament, handling)" htmlFor="pet-care"><textarea id="pet-care" rows={2} style={inputStyle} value={draft.care_notes} onChange={function (e) { setField("care_notes", e.target.value); }} /></Field>
            <Field label="Grooming notes" htmlFor="pet-groom"><textarea id="pet-groom" rows={2} style={inputStyle} value={draft.grooming_notes} onChange={function (e) { setField("grooming_notes", e.target.value); }} /></Field>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!deleting} onClose={function () { if (!saving) { setDeleting(null); setErr(""); setBlocked(""); } }}
        title={deleting ? "Delete " + deleting.name + "?" : ""}
        footer={<>
          <Button variant="ghost" onClick={function () { setDeleting(null); setErr(""); setBlocked(""); }} disabled={saving}>Keep pet</Button>
          {!blocked ? <Button variant="danger" onClick={confirmDelete} disabled={saving}>{saving ? "Checking…" : "Delete pet"}</Button> : null}
          {blocked && !isArchived(deleting) ? <Button onClick={function () { var p = deleting; setDeleting(null); setBlocked(""); setErr(""); setReason("inactive"); setArchiving(p); }}>Archive instead</Button> : null}
        </>}>
        {blocked ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: FOREGROUND, lineHeight: 1.5 }}>{blocked}</p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: FOREGROUND, lineHeight: 1.5 }}>
            This permanently removes the pet and all of its vaccination records. This can't be undone. A pet with bookings, boarding stays or invoices can't be deleted.
          </p>
        )}
        <ErrorLine>{err}</ErrorLine>
      </Modal>

      <Modal open={!!archiving} onClose={function () { if (!saving) { setArchiving(null); setErr(""); } }}
        title={archiving ? "Archive " + archiving.name + "?" : ""}
        footer={<>
          <Button variant="ghost" onClick={function () { setArchiving(null); setErr(""); }} disabled={saving}>Cancel</Button>
          <Button onClick={confirmArchive} disabled={saving}>{saving ? "Archiving…" : "Archive pet"}</Button>
        </>}>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: FOREGROUND, lineHeight: 1.5 }}>
          The pet is hidden from active lists and can't be booked or boarded. Its bookings, payments, grooming and vaccination or medical history are all kept, and you can restore it at any time.
        </p>
        <Field label="Reason" htmlFor="archive-reason">
          <select id="archive-reason" style={inputStyle} value={reason} onChange={function (e) { setReason(e.target.value); }}>
            {ARCHIVE_REASONS.map(function (r) { return <option key={r.key} value={r.key}>{r.label}</option>; })}
          </select>
        </Field>
        <ErrorLine>{err}</ErrorLine>
      </Modal>

      {profilePet ? (
        <PetProfile pet={profilePet} windows={windows} owner={ownersById[profilePet.customer_id]} vaccinations={vaccsByPet[profilePet.id] || []}
          onVaccinationsChange={function (list) {
            setVaccs(vaccs.filter(function (v) { return v.pet_id !== profilePet.id; }).concat(list));
          }}
          onClose={function () { setProfileId(null); }}
          onEdit={function () { setProfileId(null); openEdit(profilePet); }} />
      ) : null}
    </div>
  );
}
