// src/pages/pet/StaffPage.jsx
//
// Staff & Permissions, Phase 5: the business admin defines roles (pet_roles) and
// assigns one role to each staff member (pet_staff_roles), migration 086.
// Roles are data the admin manages; Owner/Admin, Manager, Groomer and
// Receptionist are only suggested presets.
//
// HONEST LIMIT, shown on screen: login is the shared device PIN, so the database
// cannot tell which staff member is acting. Roles are recorded here but not yet
// enforced. This screen is admin-only navigation (a UI convenience, not security).
import React, { useEffect, useState } from "react";
import { db } from "../../lib/db";
import { MUTED_FG, MUTED, BORDER, FOREGROUND } from "./theme";
import {
  PERMISSIONS, PRESETS, validateRole, roleRow, isDuplicateRole, missingPresets,
  assignmentByStaff, countAssigned, permissionSummary, sortRoles,
} from "./roleData";
import { PageHeader, Card, Button, Field, Badge, Modal, ErrorLine, EmptyState, inputStyle } from "./ui";

function emptyDraft() { return { name: "", description: "", permissions: {} }; }

function draftFrom(r) {
  var perms = {};
  PERMISSIONS.forEach(function (p) { perms[p.key] = !!(r.permissions && r.permissions[p.key] === true); });
  return { name: r.name || "", description: r.description || "", permissions: perms };
}

export default function StaffPage({ canEdit }) {
  var dataState = useState(null); var data = dataState[0]; var setData = dataState[1]; // {roles, staff, assignments}
  var loadState = useState("loading"); var loadStatus = loadState[0]; var setLoadStatus = loadState[1];
  var attemptState = useState(0); var attempt = attemptState[0]; var setAttempt = attemptState[1];
  var formState = useState(null); var form = formState[0]; var setForm = formState[1]; // {mode, id, draft}
  var deletingState = useState(null); var deleting = deletingState[0]; var setDeleting = deletingState[1];
  var savingState = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var errState = useState(""); var err = errState[0]; var setErr = errState[1];

  useEffect(function () {
    var cancelled = false;
    setLoadStatus("loading");
    Promise.all([
      db("GET", "pet_roles", null, "?select=*&order=name.asc&limit=1000"),
      db("GET", "staff", null, "?select=id,name,role,active&order=name.asc&limit=1000"),
      db("GET", "pet_staff_roles", null, "?select=*&limit=1000"),
    ]).then(function (res) {
      if (cancelled) return;
      // db() returns null when a request failed -- that is an error, not "no data".
      if (!Array.isArray(res[0]) || !Array.isArray(res[1]) || !Array.isArray(res[2])) { setLoadStatus("error"); return; }
      setData({
        roles: sortRoles(res[0]),
        staff: res[1].filter(function (s) { return s.active !== false; }),
        assignments: res[2],
      });
      setLoadStatus("ready");
    });
    return function () { cancelled = true; };
  }, [attempt]);

  if (loadStatus === "loading") {
    return <div><PageHeader title="Staff & Permissions" subtitle="Loading…" /><Card style={{ padding: 24, color: MUTED_FG, fontSize: 13 }}>Loading roles and staff…</Card></div>;
  }
  if (loadStatus === "error") {
    return (
      <div>
        <PageHeader title="Staff & Permissions" />
        <Card style={{ padding: 8 }}>
          <EmptyState title="Couldn't load roles" description="Check your connection and try again."
            action={<Button onClick={function () { setAttempt(attempt + 1); }}>Try again</Button>} />
        </Card>
      </div>
    );
  }

  var roles = data.roles; var staff = data.staff; var assignments = data.assignments;
  var byStaff = assignmentByStaff(assignments);
  var draft = form ? form.draft : null;
  var presetsLeft = missingPresets(roles);

  function patchData(next) { setData(Object.assign({}, data, next)); }

  function openAdd() { setForm({ mode: "add", id: null, draft: emptyDraft() }); setErr(""); }
  function openEdit(r) { setForm({ mode: "edit", id: r.id, draft: draftFrom(r) }); setErr(""); }
  function closeForm() { if (!saving) { setForm(null); setErr(""); } }
  function setField(k, v) { var o = {}; o[k] = v; setForm(Object.assign({}, form, { draft: Object.assign({}, form.draft, o) })); }
  function togglePerm(key) {
    var perms = Object.assign({}, form.draft.permissions);
    perms[key] = !perms[key];
    setField("permissions", perms);
  }

  async function saveRole() {
    if (saving) return;
    var msg = validateRole(form.draft);
    if (msg) { setErr(msg); return; }
    var row = roleRow(form.draft);
    if (isDuplicateRole(roles, row.name, form.id)) { setErr("There is already a role called " + row.name + "."); return; }
    setSaving(true); setErr("");
    if (form.mode === "add") {
      var created = await db("POST", "pet_roles", row);
      setSaving(false);
      if (!Array.isArray(created) || !created[0]) { setErr("Couldn't save the role. Check your connection and try again."); return; }
      patchData({ roles: sortRoles(roles.concat([created[0]])) });
    } else {
      var ok = await db("PATCH", "pet_roles", row, "?id=eq." + form.id);
      setSaving(false);
      if (!ok) { setErr("Couldn't save changes. Check your connection and try again."); return; }
      patchData({ roles: sortRoles(roles.map(function (r) { return r.id === form.id ? Object.assign({}, r, row) : r; })) });
    }
    setForm(null);
  }

  async function addPreset(p) {
    if (saving) return;
    setSaving(true); setErr("");
    var created = await db("POST", "pet_roles", { name: p.name, description: p.description, permissions: p.permissions });
    setSaving(false);
    if (!Array.isArray(created) || !created[0]) { setErr("Couldn't add " + p.name + ". Check your connection and try again."); return; }
    patchData({ roles: sortRoles(roles.concat([created[0]])) });
  }

  async function confirmDelete() {
    if (saving) return;
    setSaving(true); setErr("");
    var ok = await db("DELETE", "pet_roles", null, "?id=eq." + deleting.id);
    setSaving(false);
    if (!ok) { setErr("Couldn't delete the role. Check your connection and try again."); return; }
    patchData({ roles: roles.filter(function (r) { return r.id !== deleting.id; }) });
    setDeleting(null);
  }

  async function assign(member, roleId) {
    if (saving) return;
    var current = byStaff[member.id];
    if ((current ? current.role_id : "") === roleId) return;
    setSaving(true); setErr("");
    if (roleId === "") {
      if (!current) { setSaving(false); return; }
      var removed = await db("DELETE", "pet_staff_roles", null, "?id=eq." + current.id);
      setSaving(false);
      if (!removed) { setErr("Couldn't clear the role for " + member.name + ". Try again."); return; }
      patchData({ assignments: assignments.filter(function (a) { return a.id !== current.id; }) });
    } else if (current) {
      var updated = await db("PATCH", "pet_staff_roles", { role_id: roleId }, "?id=eq." + current.id);
      setSaving(false);
      if (!updated) { setErr("Couldn't change the role for " + member.name + ". Try again."); return; }
      patchData({ assignments: assignments.map(function (a) { return a.id === current.id ? Object.assign({}, a, { role_id: roleId }) : a; }) });
    } else {
      var made = await db("POST", "pet_staff_roles", { staff_id: member.id, role_id: roleId });
      setSaving(false);
      if (!Array.isArray(made) || !made[0]) { setErr("Couldn't assign the role to " + member.name + ". Try again."); return; }
      patchData({ assignments: assignments.concat([made[0]]) });
    }
  }

  var deletingCount = deleting ? countAssigned(assignments, deleting.id) : 0;

  return (
    <div>
      <PageHeader
        title="Staff & Permissions"
        subtitle="Define the roles your business uses and give each staff member one."
        actions={canEdit ? <Button onClick={openAdd}>+ Add role</Button> : null}
      />

      <Card style={{ padding: "10px 14px", marginBottom: 16, background: MUTED, fontSize: 12, color: MUTED_FG, lineHeight: 1.5 }}>
        Roles are recorded here but not yet enforced. Everyone signs in with the shared PIN, so the system can't yet restrict
        what an individual staff member sees. Don't rely on roles to protect sensitive information.
      </Card>
      {!form && !deleting ? <ErrorLine>{err}</ErrorLine> : null}

      <h2 style={{ fontSize: 15, margin: "0 0 8px", color: FOREGROUND }}>Roles</h2>
      {canEdit && presetsLeft.length > 0 ? (
        <Card style={{ padding: 12, marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: MUTED_FG }}>Suggested roles (you can edit them after adding):</span>
          {presetsLeft.map(function (p) {
            return <Button key={p.name} size="sm" variant="outline" disabled={saving} onClick={function () { addPreset(p); }}
              ariaLabel={"Add suggested role " + p.name}>+ {p.name}</Button>;
          })}
        </Card>
      ) : null}

      {roles.length === 0 ? (
        <Card><EmptyState title="No roles yet"
          description={canEdit ? "Add the roles your business uses, or start from the suggested ones above." : "An administrator can define roles."}
          action={canEdit ? <Button onClick={openAdd}>+ Add role</Button> : null} /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginBottom: 24 }}>
          {roles.map(function (r) {
            var n = countAssigned(assignments, r.id);
            return (
              <Card key={r.id} style={{ overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid " + BORDER, background: MUTED }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                  <div style={{ color: MUTED_FG, fontSize: 12 }}>{permissionSummary(r)} · {n} {n === 1 ? "person" : "people"}</div>
                </div>
                <div style={{ padding: "12px 16px", minHeight: 40 }}>
                  <p style={{ margin: 0, color: MUTED_FG, fontSize: 12, lineHeight: 1.5 }}>{r.description || "No description."}</p>
                </div>
                {canEdit ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, padding: "8px 12px", borderTop: "1px solid " + BORDER }}>
                    <Button size="sm" variant="ghost" onClick={function () { openEdit(r); }} ariaLabel={"Edit " + r.name}>Edit</Button>
                    <Button size="sm" variant="ghost-danger" onClick={function () { setErr(""); setDeleting(r); }} ariaLabel={"Delete " + r.name}>Delete</Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <h2 style={{ fontSize: 15, margin: "0 0 8px", color: FOREGROUND }}>Team</h2>
      {staff.length === 0 ? (
        <Card><EmptyState title="No staff yet" description="Staff added to your business appear here so you can give each one a role." /></Card>
      ) : (
        <Card>
          {staff.map(function (m, i) {
            var a = byStaff[m.id];
            return (
              <div key={m.id} style={{
                display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between",
                padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid " + BORDER,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                  {m.role ? <div style={{ color: MUTED_FG, fontSize: 12 }}>{m.role}</div> : null}
                </div>
                {canEdit ? (
                  <select aria-label={"Role for " + m.name} value={a ? a.role_id : ""} disabled={saving || roles.length === 0}
                    onChange={function (e) { assign(m, e.target.value); }} style={Object.assign({}, inputStyle, { width: 200 })}>
                    <option value="">No role</option>
                    {roles.map(function (r) { return <option key={r.id} value={r.id}>{r.name}</option>; })}
                  </select>
                ) : (
                  <Badge tone="neutral">{a ? (roles.filter(function (r) { return r.id === a.role_id; })[0] || { name: "No role" }).name : "No role"}</Badge>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <Modal open={!!form} onClose={closeForm} title={form && form.mode === "edit" ? "Edit role" : "Add role"}
        description="Tick what this role is meant to be able to do."
        footer={<>
          <Button variant="ghost" onClick={closeForm} disabled={saving}>Cancel</Button>
          <Button onClick={saveRole} disabled={saving}>{saving ? "Saving…" : form && form.mode === "edit" ? "Save changes" : "Add role"}</Button>
        </>}>
        {draft ? (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Role name" htmlFor="role-name"><input id="role-name" style={inputStyle} value={draft.name} onChange={function (e) { setField("name", e.target.value); }} placeholder="e.g. Senior groomer" /></Field>
            <Field label="Description (optional)" htmlFor="role-desc"><textarea id="role-desc" rows={2} style={inputStyle} value={draft.description} onChange={function (e) { setField("description", e.target.value); }} /></Field>
            <fieldset style={{ border: "1px solid " + BORDER, borderRadius: 12, padding: "8px 12px", margin: 0 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, color: MUTED_FG, padding: "0 4px" }}>Permissions</legend>
              <div style={{ display: "grid", gap: 8 }}>
                {PERMISSIONS.map(function (p) {
                  return (
                    <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: FOREGROUND }}>
                      <input type="checkbox" checked={!!draft.permissions[p.key]} onChange={function () { togglePerm(p.key); }} />
                      {p.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <ErrorLine>{err}</ErrorLine>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!deleting} onClose={function () { if (!saving) { setDeleting(null); setErr(""); } }}
        title={deleting ? (deletingCount > 0 ? "Can't delete " : "Delete ") + deleting.name + (deletingCount > 0 ? " yet" : "?") : ""}
        footer={<>
          <Button variant="ghost" onClick={function () { setDeleting(null); setErr(""); }} disabled={saving}>{deletingCount > 0 ? "Close" : "Keep role"}</Button>
          {deletingCount === 0 ? <Button variant="danger" onClick={confirmDelete} disabled={saving}>{saving ? "Deleting…" : "Delete role"}</Button> : null}
        </>}>
        <p style={{ margin: 0, fontSize: 13, color: FOREGROUND, lineHeight: 1.5 }}>
          {deletingCount > 0
            ? deletingCount + (deletingCount === 1 ? " staff member still has" : " staff members still have") + " this role. Give them a different role first, then delete it."
            : "This removes the role. No staff member currently has it."}
        </p>
        <ErrorLine>{err}</ErrorLine>
      </Modal>
    </div>
  );
}
