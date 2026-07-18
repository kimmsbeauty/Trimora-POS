// src/pages/auto/ServicesPage.jsx
//
// Admin-only. CRUD for auto_services -- Auto's own catalog table
// (deliberately separate from POS's `services` table, see the
// architecture plan Section 6, objection 1). POS's Services tab has
// no reach into this table at all, so unlike staff editing, this
// needed a genuinely new screen.
//
// Also manages auto_bays (added later) -- no bay-creation UI existed
// anywhere before this, bays had to be seeded directly via SQL to
// unblock testing the Board's assign flow. Living here rather than a
// separate tab since this is already Auto's "setup/config" home.

import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/db";
import CsvImportModal from "../../components/CsvImportModal.jsx";
import { AUTO_SERVICES_CONFIG, STOCK_CONFIG } from "../../lib/csvImport.js";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./theme";

export default function ServicesPage({ isAdmin }) {
  var servicesState = useState([]); var services = servicesState[0]; var setServices = servicesState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var editingState = useState(null); var editing = editingState[0]; var setEditing = editingState[1];
  var showAddState = useState(false); var showAdd = showAddState[0]; var setShowAdd = showAddState[1];
  var newServiceState = useState({ name: "", description: "", duration_minutes: 30, price: "" });
  var newService = newServiceState[0]; var setNewService = newServiceState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];

  // Stock-deduction config (Phase 6 follow-up): which stock items, and
  // how much of each, a service consumes when a job completes. Lives on
  // auto_service_required_stock, joined against the existing shared
  // `stock` table (the same one POS's own Products/Stock tab manages --
  // car-wash consumables like shampoo/wax/towels are just more rows in
  // that table, not an Auto-specific copy, per the architecture plan).
  var stockListState = useState([]); var stockList = stockListState[0]; var setStockList = stockListState[1];
  var requiredStockState = useState([]); var requiredStock = requiredStockState[0]; var setRequiredStock = requiredStockState[1];
  var managingStockForState = useState(null); // service.id currently expanded
  var managingStockFor = managingStockForState[0]; var setManagingStockFor = managingStockForState[1];
  var newReqStockState = useState({ stock_id: "", quantity: 1 });
  var newReqStock = newReqStockState[0]; var setNewReqStock = newReqStockState[1];

  // Bays: no creation UI existed anywhere in the codebase until now --
  // flagged as a real gap earlier this session (bays were seeded
  // directly via SQL to unblock testing the Board's assign flow).
  // Added here rather than a new tab, since Services is already the
  // "salon setup/config" home for Auto's admin screens.
  var baysState = useState([]); var bays = baysState[0]; var setBays = baysState[1];
  var showAddBayState = useState(false); var showAddBay = showAddBayState[0]; var setShowAddBay = showAddBayState[1];
  var newBayLabelState = useState(""); var newBayLabel = newBayLabelState[0]; var setNewBayLabel = newBayLabelState[1];

  // CSV import (see src/lib/csvImport.js) -- stock/parts import is the
  // first stock-creation entry point Auto has ever had; nothing else in
  // this app lets an Auto business add a new stock/parts item.
  var showImportServicesState = useState(false);
  var showImportServices = showImportServicesState[0]; var setShowImportServices = showImportServicesState[1];
  var showImportStockState = useState(false);
  var showImportStock = showImportStockState[0]; var setShowImportStock = showImportStockState[1];

  var load = useCallback(async function () {
    var results = await Promise.all([
      db("GET", "auto_services", null, "?order=active.desc,name.asc"),
      db("GET", "stock", null, "?order=name.asc"),
      db("GET", "auto_service_required_stock", null, "?select=*,stock(name)"),
      db("GET", "auto_bays", null, "?order=label.asc"),
    ]);
    setServices(results[0] || []);
    setStockList(results[1] || []);
    setRequiredStock(results[2] || []);
    setBays(results[3] || []);
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

  function requiredStockFor(serviceId) {
    return requiredStock.filter(function (r) { return r.auto_service_id === serviceId; });
  }

  async function addRequiredStock(service) {
    if (!newReqStock.stock_id || busy) return;
    var qty = parseInt(newReqStock.quantity, 10) || 1;
    var already = requiredStockFor(service.id).filter(function (r) { return r.stock_id === newReqStock.stock_id; })[0];
    setBusy(true);
    if (already) {
      // unique(auto_service_id, stock_id) -- re-adding an already-mapped
      // item updates its quantity instead of erroring.
      await db("PATCH", "auto_service_required_stock", { quantity: qty }, "?id=eq." + already.id);
    } else {
      await db("POST", "auto_service_required_stock", {
        auto_service_id: service.id, stock_id: newReqStock.stock_id, quantity: qty,
      });
    }
    setNewReqStock({ stock_id: "", quantity: 1 });
    setBusy(false);
    load();
  }

  async function removeRequiredStock(row) {
    if (busy) return;
    setBusy(true);
    await db("DELETE", "auto_service_required_stock", null, "?id=eq." + row.id);
    setBusy(false);
    load();
  }

  async function addBay() {
    var label = newBayLabel.trim();
    if (!label || busy) return;
    // auto_bays has a unique(salon_id, label) constraint -- guard
    // client-side with a clear message rather than letting a raw
    // constraint-violation error surface.
    if (bays.some(function (b) { return b.label.toLowerCase() === label.toLowerCase(); })) {
      window.alert("A bay named \"" + label + "\" already exists.");
      return;
    }
    setBusy(true);
    await db("POST", "auto_bays", { label: label });
    setNewBayLabel("");
    setShowAddBay(false);
    setBusy(false);
    load();
  }

  async function toggleBayActive(bay) {
    if (busy) return;
    setBusy(true);
    await db("PATCH", "auto_bays", { active: !bay.active }, "?id=eq." + bay.id);
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
            <div style={{ display: "flex", gap: 12 }}>
              <span onClick={function () { setShowImportServices(true); }} style={{ cursor: "pointer", color: CHROME, fontSize: 12, fontWeight: 800 }}>
                Import CSV
              </span>
              <span onClick={function () { setShowAdd(!showAdd); }} style={{ cursor: "pointer", color: SIGNAL, fontSize: 12, fontWeight: 800 }}>
                {showAdd ? "Cancel" : "+ Add service"}
              </span>
            </div>
          </div>
          <CsvImportModal
            open={showImportServices}
            onClose={function () { setShowImportServices(false); }}
            config={AUTO_SERVICES_CONFIG}
            entityLabel="Auto Services"
            existingRows={services}
            onDone={load}
          />

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
                        <span onClick={function () { setManagingStockFor(managingStockFor === svc.id ? null : svc.id); }}
                          style={{ cursor: "pointer", color: CHROME, fontSize: 12, fontWeight: 700 }}>
                          {managingStockFor === svc.id ? "Hide stock" : "Manage stock"}
                        </span>
                      </div>
                    </div>
                  )}

                  {managingStockFor === svc.id && (function () {
                    var mappings = requiredStockFor(svc.id);
                    return (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(143,166,184,0.15)" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: CHROME, marginBottom: 8 }}>
                          Stock used per job
                        </div>
                        {mappings.length === 0 && (
                          <div style={{ fontSize: 12, color: CHROME, marginBottom: 10 }}>
                            No stock configured -- completing this service won't deduct anything yet.
                          </div>
                        )}
                        {mappings.map(function (r) {
                          return (
                            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: PAPER, padding: "4px 0" }}>
                              <span>{(r.stock && r.stock.name) || "Unknown item"} × {r.quantity}</span>
                              <span onClick={function () { removeRequiredStock(r); }} style={{ cursor: "pointer", color: ALERT, fontWeight: 700 }}>Remove</span>
                            </div>
                          );
                        })}
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <select value={newReqStock.stock_id}
                            onChange={function (e) { setNewReqStock(Object.assign({}, newReqStock, { stock_id: e.target.value })); }}
                            style={Object.assign({}, inputStyle, { flex: 2 })}>
                            <option value="">Select stock item…</option>
                            {stockList.map(function (s) { return <option key={s.id} value={s.id}>{s.name} ({s.stock} in stock)</option>; })}
                          </select>
                          <input type="number" min="1" step="1" value={newReqStock.quantity}
                            onChange={function (e) { setNewReqStock(Object.assign({}, newReqStock, { quantity: e.target.value })); }}
                            style={Object.assign({}, inputStyle, { flex: 1 })} />
                          <button onClick={function () { addRequiredStock(svc); }} disabled={busy || !newReqStock.stock_id} style={btnStyle}>Add</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        <div style={Object.assign({}, panelStyle, { marginTop: 16 })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHROME }}>
              Stock / Parts ({stockList.length})
            </span>
            <span onClick={function () { setShowImportStock(true); }} style={{ cursor: "pointer", color: SIGNAL, fontSize: 12, fontWeight: 800 }}>
              Import CSV
            </span>
          </div>
          <div style={{ fontSize: 12, color: CHROME }}>
            Bulk-add or update parts and consumables (shampoo, wax, towels, etc.) via CSV -- these show up in
            "Manage stock" above to link to a service, and in the Board/Reports stock counts.
          </div>
          <CsvImportModal
            open={showImportStock}
            onClose={function () { setShowImportStock(false); }}
            config={STOCK_CONFIG}
            entityLabel="Stock/Parts"
            existingRows={stockList}
            onDone={load}
          />
        </div>

        <div style={Object.assign({}, panelStyle, { marginTop: 16 })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHROME }}>
              Bays ({bays.length})
            </span>
            <span onClick={function () { setShowAddBay(!showAddBay); }} style={{ cursor: "pointer", color: SIGNAL, fontSize: 12, fontWeight: 800 }}>
              {showAddBay ? "Cancel" : "+ Add bay"}
            </span>
          </div>

          {showAddBay && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input placeholder="e.g. Bay 3" value={newBayLabel}
                onChange={function (e) { setNewBayLabel(e.target.value); }}
                style={Object.assign({}, inputStyle, { flex: 1 })} />
              <button onClick={addBay} disabled={busy || !newBayLabel.trim()} style={btnStyle}>Save</button>
            </div>
          )}

          {bays.length === 0 ? (
            <div style={{ fontSize: 12, color: CHROME }}>No bays yet — add one to start assigning jobs on the Board.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bays.map(function (bay) {
                return (
                  <div key={bay.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", borderRadius: 10, border: "1.5px solid rgba(143,166,184,0.2)",
                    background: bay.active ? "rgba(255,255,255,0.02)" : "rgba(255,107,74,0.04)",
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: PAPER }}>{bay.label}</div>
                      <div style={{ fontSize: 11, color: CHROME }}>
                        {bay.current_job_id ? "Occupied" : "Free"}{!bay.active ? " · inactive" : ""}
                      </div>
                    </div>
                    <span onClick={function () { toggleBayActive(bay); }}
                      style={{ cursor: "pointer", color: bay.active ? ALERT : SIGNAL, fontSize: 12, fontWeight: 700 }}>
                      {bay.active ? "Deactivate" : "Activate"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
