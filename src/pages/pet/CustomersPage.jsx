// src/pages/pet/CustomersPage.jsx
//
// Real Customers screen (Phase 3). People come from the shared `customers`
// table (name, phone, visits); pet-owner contact details come from
// pet_customer_profiles (migration 084); pets from pet_pets. Nothing here is
// sample data.
//
// Not included on purpose: deleting a customer. `customers` is shared with
// Salon/Auto and deleting would cascade to the owner's pets, so it needs its
// own reviewed flow. Marketing opt-out lives on customers.marketing_opt_out and
// is shown read-only here.
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/db";
import { MUTED_FG, MUTED, BORDER, FOREGROUND } from "./theme";
import {
  CHANNELS, CHANNEL_LABELS, validateCustomer, customerRow, profileRow, isDuplicateCustomer, filterCustomers,
} from "./customerData";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";

var PAGE_SIZE = 12;
var EMPTY_DRAFT = {
  name: "", phone: "", email: "", address: "", emergency_contact_name: "", emergency_contact_phone: "",
  preferred_channels: [], notes: "",
};

function draftFrom(c, prof) {
  prof = prof || {};
  return {
    name: c.name || "", phone: c.phone || "", email: prof.email || "", address: prof.address || "",
    emergency_contact_name: prof.emergency_contact_name || "", emergency_contact_phone: prof.emergency_contact_phone || "",
    preferred_channels: (prof.preferred_channels || []).slice(), notes: prof.notes || "",
  };
}

function sortByName(list) { return list.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); }

export default function CustomersPage() {
  var custState = useState(null); var customers = custState[0]; var setCustomers = custState[1];
  var profState = useState([]); var profiles = profState[0]; var setProfiles = profState[1];
  var petsState = useState([]); var pets = petsState[0]; var setPets = petsState[1];
  var loadState = useState("loading"); var loadStatus = loadState[0]; var setLoadStatus = loadState[1];
  var attemptState = useState(0); var attempt = attemptState[0]; var setAttempt = attemptState[1];
  var qState = useState(""); var q = qState[0]; var setQ = qState[1];
  var pageState = useState(0); var page = pageState[0]; var setPage = pageState[1];
  var formState = useState(null); var form = formState[0]; var setForm = formState[1]; // {mode, id, draft}
  var detailState = useState(null); var detailId = detailState[0]; var setDetailId = detailState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    Promise.all([
      db("GET", "customers", null, "?select=id,name,phone,visit_count,total_spend,last_visit,marketing_opt_out&order=name.asc&limit=2000"),
      db("GET", "pet_customer_profiles", null, "?select=*&limit=2000"),
      db("GET", "pet_pets", null, "?select=id,customer_id,name,species,breed&order=name.asc&limit=5000"),
    ]).then(function (res) {
      if (cancelled) return;
      // db() returns null when a request failed -- that is an error, not "no data".
      if (!Array.isArray(res[0]) || !Array.isArray(res[1]) || !Array.isArray(res[2])) { setLoadStatus("error"); return; }
      setCustomers(res[0]); setProfiles(res[1]); setPets(res[2]); setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [attempt]);

  var profilesByCustomer = useMemo(function () {
    var m = {}; profiles.forEach(function (p) { m[p.customer_id] = p; }); return m;
  }, [profiles]);
  var petsByCustomer = useMemo(function () {
    var m = {}; pets.forEach(function (p) { (m[p.customer_id] = m[p.customer_id] || []).push(p); }); return m;
  }, [pets]);

  if (loadStatus === "loading") {
    return <div><PageHeader title="Customers" subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading customers…</Card></div>;
  }
  if (loadStatus === "error") {
    return (
      <div>
        <PageHeader title="Customers" />
        <Card style={{ padding: 8 }}>
          <EmptyState title="Couldn't load customers" description="Check your connection and try again."
            action={<Button onClick={function () { setAttempt(attempt + 1); }}>Try again</Button>} />
        </Card>
      </div>
    );
  }

  var filtered = filterCustomers(customers, profilesByCustomer, petsByCustomer, q);
  var pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  var safePage = Math.min(page, pageCount - 1);
  var visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  var detail = detailId ? customers.filter(function (c) { return c.id === detailId; })[0] : null;
  var draft = form ? form.draft : null;

  function openAdd() { setForm({ mode: "add", id: null, draft: Object.assign({}, EMPTY_DRAFT, { preferred_channels: [] }) }); setErr(""); }
  function openEdit(c) { setForm({ mode: "edit", id: c.id, draft: draftFrom(c, profilesByCustomer[c.id]) }); setErr(""); }
  function closeForm() { if (!saving) { setForm(null); setErr(""); } }
  function setField(k, v) { var o = {}; o[k] = v; setForm(Object.assign({}, form, { draft: Object.assign({}, form.draft, o) })); }
  function toggleChannel(ch) {
    var cur = form.draft.preferred_channels;
    setField("preferred_channels", cur.indexOf(ch) === -1 ? cur.concat([ch]) : cur.filter(function (c) { return c !== ch; }));
  }

  async function saveCustomer() {
    if (saving) return;
    var msg = validateCustomer(form.draft);
    if (msg) { setErr(msg); return; }
    var crow = customerRow(form.draft);
    if (isDuplicateCustomer(customers, crow, form.id)) { setErr("A customer with that phone number already exists."); return; }
    var prow = profileRow(form.draft);
    setSaving(true); setErr("");

    var customerId = form.id; var savedCustomer;
    if (form.mode === "add") {
      var created = await db("POST", "customers", crow);
      if (!Array.isArray(created) || !created[0]) { setSaving(false); setErr("Couldn't save the customer. Check your connection and try again."); return; }
      savedCustomer = created[0]; customerId = savedCustomer.id;
    } else {
      var okC = await db("PATCH", "customers", crow, "?id=eq." + form.id);
      if (!okC) { setSaving(false); setErr("Couldn't save changes. Check your connection and try again."); return; }
      savedCustomer = Object.assign({}, customers.filter(function (c) { return c.id === form.id; })[0], crow);
    }

    // Contact details: only write a profile row when there is something to keep,
    // or when an existing row must be updated/cleared.
    var existing = profilesByCustomer[customerId];
    var hasContent = !!(prow.email || prow.address || prow.emergency_contact_name || prow.emergency_contact_phone ||
      prow.notes || prow.preferred_channels.length);
    var nextProfile = existing || null; var profileOk = true;
    if (existing) {
      profileOk = !!(await db("PATCH", "pet_customer_profiles", prow, "?id=eq." + existing.id));
      if (profileOk) nextProfile = Object.assign({}, existing, prow);
    } else if (hasContent) {
      var pc = await db("POST", "pet_customer_profiles", Object.assign({ customer_id: customerId }, prow));
      profileOk = Array.isArray(pc) && !!pc[0];
      if (profileOk) nextProfile = pc[0];
    }
    setSaving(false);

    // Reflect what actually saved so the list never shows data the database lacks.
    setCustomers(sortByName(form.mode === "add" ? customers.concat([savedCustomer]) :
      customers.map(function (c) { return c.id === customerId ? savedCustomer : c; })));
    if (nextProfile) {
      setProfiles(profiles.filter(function (p) { return p.customer_id !== customerId; }).concat([nextProfile]));
    }
    if (!profileOk) {
      // The customer saved; keep the form open on the same record so a retry only repeats the contact details.
      setForm({ mode: "edit", id: customerId, draft: form.draft });
      setErr("The customer was saved, but the contact details weren't. Press Save again to retry.");
      return;
    }
    setForm(null);
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Pet owners, their contact details and their pets"
        actions={<Button onClick={openAdd}>+ Add customer</Button>}
      />

      <Card style={{ padding: 12, marginBottom: 16 }}>
        <input aria-label="Search customers by name, phone, email or pet" placeholder="Search by name, phone, email or pet name" value={q}
          onChange={function (e) { setQ(e.target.value); setPage(0); }} style={inputStyle} />
      </Card>

      {customers.length === 0 ? (
        <Card><EmptyState title="No customers yet" description="Add your first customer to start registering their pets."
          action={<Button onClick={openAdd}>+ Add customer</Button>} /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState title="No customers found" description="Try a different name, phone number, email or pet name." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {visible.map(function (c) {
            var prof = profilesByCustomer[c.id] || {};
            var cpets = petsByCustomer[c.id] || [];
            return (
              <Card key={c.id} style={{ overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid " + BORDER, background: MUTED }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                  <div style={{ color: MUTED_FG, fontSize: 12 }}>{c.phone || "No phone"}{prof.email ? " · " + prof.email : ""}</div>
                </div>
                <div style={{ padding: "12px 16px", minHeight: 56, fontSize: 12, color: MUTED_FG, lineHeight: 1.5 }}>
                  {cpets.length === 0 ? "No pets registered." : "Pets: " + cpets.map(function (p) { return p.name; }).join(", ")}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {c.marketing_opt_out ? <Badge tone="warning">Opted out of marketing</Badge> : null}
                    {(prof.preferred_channels || []).map(function (ch) { return <Badge key={ch} tone="info">{CHANNEL_LABELS[ch]}</Badge>; })}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderTop: "1px solid " + BORDER }}>
                  <Button size="sm" variant="outline" onClick={function () { setDetailId(c.id); }} ariaLabel={"View " + c.name}>View</Button>
                  <Button size="sm" variant="ghost" onClick={function () { openEdit(c); }} ariaLabel={"Edit " + c.name}>Edit</Button>
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

      <Modal open={!!form} onClose={closeForm} title={form && form.mode === "edit" ? "Edit customer" : "Add customer"}
        description="Contact details are used for reminders and in emergencies."
        footer={<>
          <Button variant="ghost" onClick={closeForm} disabled={saving}>Cancel</Button>
          <Button onClick={saveCustomer} disabled={saving}>{saving ? "Saving…" : form && form.mode === "edit" ? "Save changes" : "Add customer"}</Button>
        </>}>
        {draft ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Full name" htmlFor="cust-name"><input id="cust-name" style={inputStyle} value={draft.name} onChange={function (e) { setField("name", e.target.value); }} /></Field>
              <Field label="Phone" htmlFor="cust-phone"><input id="cust-phone" inputMode="tel" style={inputStyle} value={draft.phone} onChange={function (e) { setField("phone", e.target.value); }} /></Field>
              <Field label="Email (optional)" htmlFor="cust-email"><input id="cust-email" type="email" style={inputStyle} value={draft.email} onChange={function (e) { setField("email", e.target.value); }} /></Field>
              <Field label="Address (optional)" htmlFor="cust-address"><input id="cust-address" style={inputStyle} value={draft.address} onChange={function (e) { setField("address", e.target.value); }} /></Field>
              <Field label="Emergency contact name" htmlFor="cust-ec-name"><input id="cust-ec-name" style={inputStyle} value={draft.emergency_contact_name} onChange={function (e) { setField("emergency_contact_name", e.target.value); }} /></Field>
              <Field label="Emergency contact phone" htmlFor="cust-ec-phone"><input id="cust-ec-phone" inputMode="tel" style={inputStyle} value={draft.emergency_contact_phone} onChange={function (e) { setField("emergency_contact_phone", e.target.value); }} /></Field>
            </div>
            <fieldset style={{ border: "1px solid " + BORDER, borderRadius: 12, padding: "8px 12px", margin: 0 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, color: MUTED_FG, padding: "0 4px" }}>Preferred ways to reach them</legend>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {CHANNELS.map(function (ch) {
                  return (
                    <label key={ch} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: FOREGROUND }}>
                      <input type="checkbox" checked={draft.preferred_channels.indexOf(ch) !== -1} onChange={function () { toggleChannel(ch); }} />
                      {CHANNEL_LABELS[ch]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Field label="Notes" htmlFor="cust-notes"><textarea id="cust-notes" rows={2} style={inputStyle} value={draft.notes} onChange={function (e) { setField("notes", e.target.value); }} /></Field>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!detail} onClose={function () { setDetailId(null); }} title={detail ? detail.name : ""}
        description={detail && detail.phone ? detail.phone : "No phone number"}
        footer={detail ? <>
          <Button variant="ghost" onClick={function () { setDetailId(null); }}>Close</Button>
          <Button onClick={function () { var c = detail; setDetailId(null); openEdit(c); }}>Edit</Button>
        </> : null}>
        {detail ? (function () {
          var prof = profilesByCustomer[detail.id] || {};
          var cpets = petsByCustomer[detail.id] || [];
          function row(label, value) {
            return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "4px 0" }}><span style={{ color: MUTED_FG }}>{label}</span><span style={{ textAlign: "right" }}>{value || "—"}</span></div>;
          }
          return (
            <div>
              {row("Email", prof.email)}
              {row("Address", prof.address)}
              {row("Emergency contact", prof.emergency_contact_name ? prof.emergency_contact_name + (prof.emergency_contact_phone ? " · " + prof.emergency_contact_phone : "") : prof.emergency_contact_phone)}
              {row("Preferred channels", (prof.preferred_channels || []).map(function (ch) { return CHANNEL_LABELS[ch]; }).join(", "))}
              {row("Marketing messages", detail.marketing_opt_out ? "Opted out" : "Allowed")}
              {row("Visits", detail.visit_count)}
              {row("Last visit", detail.last_visit)}
              {prof.notes ? <p style={{ margin: "8px 0 0", fontSize: 12, color: MUTED_FG, lineHeight: 1.5 }}>{prof.notes}</p> : null}
              <div style={{ fontWeight: 700, fontSize: 13, margin: "14px 0 6px" }}>Pets</div>
              {cpets.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: MUTED_FG }}>No pets registered for this customer.</p> : cpets.map(function (p) {
                return <div key={p.id} style={{ fontSize: 13, padding: "4px 0" }}>{p.name} <span style={{ color: MUTED_FG }}>· {p.species}{p.breed ? " · " + p.breed : ""}</span></div>;
              })}
            </div>
          );
        })() : null}
      </Modal>
    </div>
  );
}
