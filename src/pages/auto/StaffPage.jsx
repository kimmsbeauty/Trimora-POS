// src/pages/auto/StaffPage.jsx
//
// Admin-only. Edits the shared `staff` table -- the exact same table
// POS's own admin Staff tab edits. This is NOT an Auto-specific copy:
// adding, editing, or deactivating a staff member here is immediately
// visible in POS too, same as editing commission_pct here immediately
// affects POS's own commission calculations. That's intentional --
// staff is Core data, not something Auto owns a separate copy of.

import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/db";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./theme";

export default function StaffPage({ isAdmin }) {
  var staffState = useState([]); var staffList = staffState[0]; var setStaffList = staffState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var editingState = useState(null); var editing = editingState[0]; var setEditing = editingState[1];
  var showAddState = useState(false); var showAdd = showAddState[0]; var setShowAdd = showAddState[1];
  var newStaffState = useState({ name: "", role: "Bay Attendant", commission_pct: 40 });
  var newStaff = newStaffState[0]; var setNewStaff = newStaffState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];

  var load = useCallback(async function () {
    var rows = await db("GET", "staff", null, "?order=active.desc,name.asc");
    setStaffList(rows || []);
    setLoading(false);
  }, []);

  useEffect(function () { load(); }, [load]);

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: INK, color: PAPER, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif" }}>
        Staff management is admin-only.
      </div>
    );
  }

  async function saveNew() {
    if (!newStaff.name.trim() || busy) return;
    setBusy(true);
    await db("POST", "staff", {
      name: newStaff.name.trim(), role: newStaff.role.trim() || "Bay Attendant",
      commission_pct: newStaff.commission_pct, active: true,
    });
    setNewStaff({ name: "", role: "Bay Attendant", commission_pct: 40 });
    setShowAdd(false);
    setBusy(false);
    load();
  }

  async function saveEdit() {
    if (!editing || busy) return;
    setBusy(true);
    await db("PATCH", "staff", {
      name: editing.name, role: editing.role, commission_pct: editing.commission_pct,
    }, "?id=eq." + editing.id);
    setEditing(null);
    setBusy(false);
    load();
  }

  async function toggleActive(member) {
    if (busy) return;
    setBusy(true);
    await db("PATCH", "staff", { active: !member.active }, "?id=eq." + member.id);
    setBusy(false);
    load();
  }

  var panelStyle = { background: STEEL, borderRadius: 14, padding: 16, border: "1px solid rgba(143,166,184,0.15)" };
  var inputStyle = {
    width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: PAPER,
    border: "1px solid rgba(143,166,184,0.3)", borderRadius: 8, padding: "9px 12px", fontSize: 13,
  };
  var btnStyle = {
    background: SIGNAL, color: INK, border: "none", borderRadius: 8,
    padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer",
  };

  if (loading) return <div style={{ minHeight: "100vh", background: INK }} />;

  return (
    <div style={{ minHeight: "100vh", background: INK, fontFamily: "system-ui, -apple-system, sans-serif", padding: 20 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={Object.assign({}, panelStyle, { marginBottom: 16 })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHROME }}>
              Staff ({staffList.length})
            </span>
            <span onClick={function () { setShowAdd(!showAdd); }} style={{ cursor: "pointer", color: SIGNAL, fontSize: 12, fontWeight: 800 }}>
              {showAdd ? "Cancel" : "+ Add staff"}
            </span>
          </div>

          {showAdd && (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
              <input placeholder="Name" value={newStaff.name}
                onChange={function (e) { setNewStaff(Object.assign({}, newStaff, { name: e.target.value })); }}
                style={Object.assign({}, inputStyle, { marginBottom: 8 })} />
              <input placeholder="Role (e.g. Bay Attendant, Detailer)" value={newStaff.role}
                onChange={function (e) { setNewStaff(Object.assign({}, newStaff, { role: e.target.value })); }}
                style={Object.assign({}, inputStyle, { marginBottom: 8 })} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: CHROME }}>Commission %</span>
                <input type="number" value={newStaff.commission_pct}
                  onChange={function (e) { setNewStaff(Object.assign({}, newStaff, { commission_pct: parseInt(e.target.value, 10) || 0 })); }}
                  style={Object.assign({}, inputStyle, { width: 80 })} />
              </div>
              <button onClick={saveNew} disabled={busy} style={btnStyle}>Save staff</button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {staffList.map(function (s) {
              var isEditing = editing && editing.id === s.id;
              return (
                <div key={s.id} style={{
                  padding: "10px 14px", borderRadius: 10, border: "1.5px solid rgba(143,166,184,0.2)",
                  background: s.active ? "rgba(255,255,255,0.02)" : "rgba(255,107,74,0.04)",
                }}>
                  {isEditing ? (
                    <div>
                      <input value={editing.name}
                        onChange={function (e) { setEditing(Object.assign({}, editing, { name: e.target.value })); }}
                        style={Object.assign({}, inputStyle, { marginBottom: 8 })} />
                      <input value={editing.role}
                        onChange={function (e) { setEditing(Object.assign({}, editing, { role: e.target.value })); }}
                        style={Object.assign({}, inputStyle, { marginBottom: 8 })} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 12, color: CHROME }}>Commission %</span>
                        <input type="number" value={editing.commission_pct == null ? 40 : editing.commission_pct}
                          onChange={function (e) { setEditing(Object.assign({}, editing, { commission_pct: parseInt(e.target.value, 10) || 0 })); }}
                          style={Object.assign({}, inputStyle, { width: 80 })} />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={saveEdit} disabled={busy} style={btnStyle}>Save</button>
                        <button onClick={function () { setEditing(null); }} style={Object.assign({}, btnStyle, {
                          background: "transparent", color: CHROME, border: "1px solid rgba(143,166,184,0.3)",
                        })}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: PAPER }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: CHROME }}>
                          {s.role} · {s.commission_pct == null ? 40 : s.commission_pct}% commission
                          {!s.active ? " · inactive" : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span onClick={function () { setEditing({ id: s.id, name: s.name, role: s.role, commission_pct: s.commission_pct == null ? 40 : s.commission_pct }); }}
                          style={{ cursor: "pointer", color: SIGNAL, fontSize: 12, fontWeight: 700 }}>Edit</span>
                        <span onClick={function () { toggleActive(s); }}
                          style={{ cursor: "pointer", color: s.active ? ALERT : SIGNAL, fontSize: 12, fontWeight: 700 }}>
                          {s.active ? "Deactivate" : "Activate"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
