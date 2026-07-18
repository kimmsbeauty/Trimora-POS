// src/pages/pos/ServicesView.jsx
//
// Extracted from POSApp.jsx (was the `page === "services"` inline block).
// Mechanical extraction only — no logic changes. servicesList, categories,
// showAddService/newService/editingService state all still live in and are
// owned by POSApp.jsx; this component is purely presentational.

import { useState } from "react";
import { db } from "../../lib/db.js";
import { fmt } from "../../lib/utils.js";
import GoldBtn from "../../components/GoldBtn";
import CsvImportModal from "../../components/CsvImportModal.jsx";
import { SALON_SERVICES_CONFIG } from "../../lib/csvImport.js";
import { GOLD, GOLD_DIM, DARK, WHITE, RED, CREAM } from "../../lib/constants.js";

export default function ServicesView({
  categories,
  servicesList,
  setServicesList,
  showAddService,
  setShowAddService,
  newService,
  setNewService,
  editingService,
  setEditingService,
}) {
  var showImportState = useState(false); var showImport = showImportState[0]; var setShowImport = showImportState[1];

  async function refreshServices() {
    var fresh = await db("GET", "services", null, "?active=eq.true&order=cat.asc,name.asc");
    if (fresh) setServicesList(fresh);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: DARK }}>Services</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={function() { setShowImport(true); }} style={{ background: "none", border: "1.5px solid " + GOLD_DIM, borderRadius: 10, padding: "8px 14px", fontSize: 12, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Import CSV</button>
          <GoldBtn onClick={function() { setShowAddService(true); setNewService({ name: "", cat: "Hair", price: "" }); }} style={{ padding: "8px 16px", fontSize: 12 }}>+ Add Service</GoldBtn>
        </div>
      </div>
      <CsvImportModal
        open={showImport}
        onClose={function() { setShowImport(false); }}
        config={SALON_SERVICES_CONFIG}
        entityLabel="Services"
        existingRows={servicesList}
        onDone={refreshServices}
      />
      {showAddService && (
        <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 16, border: "1.5px solid " + GOLD }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: DARK, marginBottom: 12 }}>New Service</div>
          <input placeholder="Service name" value={newService.name} onChange={function(e) { setNewService(function(p) { return Object.assign({}, p, { name: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
          <select value={newService.cat} onChange={function(e) { setNewService(function(p) { return Object.assign({}, p, { cat: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}>
            {categories.map(function(c) { return <option key={c}>{c}</option>; })}
          </select>
          <input placeholder="Price (KES)" type="number" value={newService.price} onChange={function(e) { setNewService(function(p) { return Object.assign({}, p, { price: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <GoldBtn onClick={async function() { if (!newService.name || !newService.price) return alert("Please enter name and price"); var saved = await db("POST", "services", Object.assign({}, newService, { price: parseInt(newService.price), active: true })); setServicesList(function(p) { return p.concat([(saved && saved[0]) || Object.assign({}, newService, { price: parseInt(newService.price), id: Date.now() })]); }); setShowAddService(false); setNewService({ name: "", cat: "Hair", price: "" }); }} style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>Save Service</GoldBtn>
            <button onClick={function() { setShowAddService(false); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 10, padding: "10px 0", fontSize: 13, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
          </div>
        </div>
      )}
      {categories.map(function(cat) {
        var catServices = servicesList.filter(function(s) { return s.cat === cat; });
        if (catServices.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>{cat}</div>
            {catServices.map(function(s) {
              return (
                <div key={s.id} style={{ background: WHITE, borderRadius: 12, padding: "12px 14px", marginBottom: 6, border: "1px solid " + GOLD_DIM + "33" }}>
                  {editingService && editingService.id === s.id ? (
                    <div>
                      <input value={editingService.name} onChange={function(e) { setEditingService(function(p) { return Object.assign({}, p, { name: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <select value={editingService.cat} onChange={function(e) { setEditingService(function(p) { return Object.assign({}, p, { cat: e.target.value }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                          {categories.map(function(c) { return <option key={c}>{c}</option>; })}
                        </select>
                        <input type="number" value={editingService.price} onChange={function(e) { setEditingService(function(p) { return Object.assign({}, p, { price: parseInt(e.target.value) || 0 }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <GoldBtn onClick={async function() { await db("PATCH", "services", { name: editingService.name, cat: editingService.cat, price: editingService.price }, "?id=eq." + editingService.id); setServicesList(function(p) { return p.map(function(x) { return x.id === editingService.id ? Object.assign({}, x, editingService) : x; }); }); setEditingService(null); }} style={{ flex: 1, padding: "8px 0", fontSize: 12 }}>Save</GoldBtn>
                        <button onClick={function() { setEditingService(null); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 10, padding: "8px 0", fontSize: 12, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div><div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{s.name}</div><div style={{ fontSize: 12, fontWeight: 900, color: GOLD_DIM, marginTop: 2 }}>{fmt(s.price)}</div></div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={function() { setEditingService(Object.assign({}, s)); }} style={{ background: CREAM, border: "1px solid " + GOLD_DIM, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>✏️ Edit</button>
                        <button onClick={async function() { if (!window.confirm("Remove " + s.name + "?")) return; await db("PATCH", "services", { active: false }, "?id=eq." + s.id); setServicesList(function(p) { return p.filter(function(x) { return x.id !== s.id; }); }); }} style={{ background: "#FEE2E2", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: RED, cursor: "pointer", fontWeight: 700 }}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
