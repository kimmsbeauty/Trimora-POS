// src/pages/auto/ServicesPage.jsx
//
// Admin-only. CRUD for auto_services -- Auto's own catalog table
// (deliberately separate from POS's `services` table, see the
// architecture plan Section 6, objection 1). POS's Services tab has
// no reach into this table at all, so unlike staff editing, this
// needed a genuinely new screen.

import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/db";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./theme";

export default function ServicesPage({ isAdmin }) {
  var servicesState = useState([]); var services = servicesState[0]; var setServices = servicesState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var editingState = useState(null); var editing = editingState[0]; var setEditing = editingState[1];
  var showAddState = useState(false); var showAdd = showAddState[0]; var setShowAdd = showAddState[1];
  var newServiceState = useState({ name: "", description: "", duration_minutes: 30, price: "" });
  var newService = newServiceState[0]; var setNewService = newServiceState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];

  var load = useCallback(async function () {
    var rows = await db("GET", "auto_services", null, "?order=active.desc,name.asc");
    setServices(rows || []);
    setLoading(false);
  }, []);

  useEffect(function () { load(); }, [load]);

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: INK, color: PAPER, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif" }}>
        Service management is admin-only.
      </div>
    );
  }

  async function saveNew() {
    if (!newService.name.trim() || !newService.price || busy) return;
    setBusy(true);
    await db("POST", "auto_services", {
      name: newService.name.trim(),
      description: newService.description.trim() || null,
      duration_minutes: parseInt(newService.duration_minutes, 10) || null,
      price: parseInt(newService.price, 10),
      active: true,
    });
    setNewService({ name: "", description: "", duration_minutes: 30, price: "" });
    setShowAdd(false);
    setBusy(false);
    load();
  }

  async function saveEdit() {
    if (!editing || busy) return;
    setBusy(true);
    await db("PATCH", "auto_services", {
      name: editing.name, description: editing.description || null,
      duration_minutes: parseInt(editing.duration_minutes, 10) || null,
      price: parseInt(editing.price, 10) || 0,
    }, "?id=eq." + editing.id);
    setEditing(null);
    setBusy(false);
    load();
  }

  async function toggleActive(service) {
    if (busy) return;
    setBusy(true);
    await db("PATCH", "auto_services", { active: !service.active }, "?id=eq." + service.id);
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
              Services ({services.length})
            </span>
            <span onClick={function () { setShowAdd(!showAdd); }} style={{ cursor: "pointer", color: SIGNAL, fontSize: 12, fontWeight: 800 }}>
              {showAdd ? "Cancel" : "+ Add service"}
            </span>
          </div>

          {showAdd && (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
              <input placeholder="Service name" value={newService.name}
                onChange={function (e) { setNewService(Object.assign({}, newService, { name: e.target.value })); }}
                style={Object.assign({}, inputStyle, { marginBottom: 8 })} />
              <input placeholder="Description (optional)" value={newService.description}
                onChange={function (e) { setNewService(Object.assign({}, newService, { description: e.target.value })); }}
                style={Object.assign({}, inputStyle, { marginBottom: 8 })} />
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: CHROME }}>Duration (min)</span>
                  <input type="number" value={newService.duration_minutes}
                    onChange={function (e) { setNewService(Object.assign({}, newService, { duration_minutes: e.target.value })); }}
                    style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: CHROME }}>Price (KSh)</span>
                  <input type="number" value={newService.price}
                    onChange={function (e) { setNewService(Object.assign({}, newService, { price: e.target.value })); }}
                    style={inputStyle} />
                </div>
              </div>
              <button onClick={saveNew} disabled={busy} style={btnStyle}>Save service</button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {services.map(function (svc) {
              var isEditing = editing && editing.id === svc.id;
              return (
                <div key={svc.id} style={{
                  padding: "10px 14px", borderRadius: 10, border: "1.5px solid rgba(143,166,184,0.2)",
                  background: svc.active ? "rgba(255,255,255,0.02)" : "rgba(255,107,74,0.04)",
                }}>
                  {isEditing ? (
                    <div>
                      <input value={editing.name}
                        onChange={function (e) { setEditing(Object.assign({}, editing, { name: e.target.value })); }}
                        style={Object.assign({}, inputStyle, { marginBottom: 8 })} />
                      <input value={editing.description || ""} placeholder="Description (optional)"
                        onChange={function (e) { setEditing(Object.assign({}, editing, { description: e.target.value })); }}
                        style={Object.assign({}, inputStyle, { marginBottom: 8 })} />
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 11, color: CHROME }}>Duration (min)</span>
                          <input type="number" value={editing.duration_minutes || ""}
                            onChange={function (e) { setEditing(Object.assign({}, editing, { duration_minutes: e.target.value })); }}
                            style={inputStyle} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 11, color: CHROME }}>Price (KSh)</span>
                          <input type="number" value={editing.price}
                            onChange={function (e) { setEditing(Object.assign({}, editing, { price: e.target.value })); }}
                            style={inputStyle} />
                        </div>
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
                        <div style={{ fontSize: 14, fontWeight: 700, color: PAPER }}>{svc.name}</div>
                        <div style={{ fontSize: 11, color: CHROME }}>
                          {svc.duration_minutes ? svc.duration_minutes + " min · " : ""}KSh {svc.price}
                          {!svc.active ? " · inactive" : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span onClick={function () { setEditing({
                          id: svc.id, name: svc.name, description: svc.description,
                          duration_minutes: svc.duration_minutes, price: svc.price,
                        }); }} style={{ cursor: "pointer", color: SIGNAL, fontSize: 12, fontWeight: 700 }}>Edit</span>
                        <span onClick={function () { toggleActive(svc); }}
                          style={{ cursor: "pointer", color: svc.active ? ALERT : SIGNAL, fontSize: 12, fontWeight: 700 }}>
                          {svc.active ? "Deactivate" : "Activate"}
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
