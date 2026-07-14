// src/pages/pos/StaffView.jsx
//
// Extracted from POSApp.jsx (was the `page === "staff"` inline block).
// Mechanical extraction only — no logic changes. All state (staffList,
// showAddStaff, newStaff, editingStaff) and the derived `staffStats` /
// `loadingStaffStats` values still live in and are computed by POSApp.jsx;
// this component is purely presentational and receives them as props.

import { db } from "../../lib/db.js";
import { fmt } from "../../lib/utils.js";
import GoldBtn from "../../components/GoldBtn";
import {
  BLACK, GOLD, GOLD_LT, GOLD_DIM, CREAM, DARK, WHITE, RED,
} from "../../lib/constants.js";

export default function StaffView({
  staffStats,
  loadingStaffStats,
  showAddStaff,
  setShowAddStaff,
  newStaff,
  setNewStaff,
  editingStaff,
  setEditingStaff,
  setStaffList,
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: DARK }}>Staff & Commissions</div>
        <GoldBtn onClick={function() { setShowAddStaff(true); setNewStaff({ name: "", role: "Stylist", commission_pct: 40 }); }} style={{ padding: "8px 16px", fontSize: 12 }}>+ Add Staff</GoldBtn>
      </div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 16 }}>
        📅 Today's figures only · resets automatically at midnight{loadingStaffStats ? " · refreshing..." : ""}
      </div>
      {showAddStaff && (
        <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 16, border: "1.5px solid " + GOLD }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: DARK, marginBottom: 12 }}>New Staff Member</div>
          <input placeholder="Full name" value={newStaff.name} onChange={function(e) { setNewStaff(function(p) { return Object.assign({}, p, { name: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
          <select value={newStaff.role} onChange={function(e) { setNewStaff(function(p) { return Object.assign({}, p, { role: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}>
            <option>Stylist</option><option>Barber</option><option>Nail Technician</option><option>Makeup Artist</option><option>Receptionist</option>
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>Commission %:</span>
            <input type="number" value={newStaff.commission_pct} onChange={function(e) { setNewStaff(function(p) { return Object.assign({}, p, { commission_pct: parseInt(e.target.value) || 0 }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <GoldBtn onClick={async function() { if (!newStaff.name) return alert("Please enter staff name"); var saved = await db("POST", "staff", Object.assign({}, newStaff, { active: true })); setStaffList(function(p) { return p.concat([(saved && saved[0]) || Object.assign({}, newStaff, { id: Date.now() })]); }); setShowAddStaff(false); setNewStaff({ name: "", role: "Stylist", commission_pct: 40 }); }} style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>Save Staff</GoldBtn>
            <button onClick={function() { setShowAddStaff(false); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 10, padding: "10px 0", fontSize: 13, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
          </div>
        </div>
      )}
      {staffStats.map(function(s) {
        return (
          <div key={s.id} style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 12, border: "1px solid " + GOLD_DIM + "44" }}>
            {editingStaff && editingStaff.id === s.id ? (
              <div>
                <input value={editingStaff.name} onChange={function(e) { setEditingStaff(function(p) { return Object.assign({}, p, { name: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                <select value={editingStaff.role} onChange={function(e) { setEditingStaff(function(p) { return Object.assign({}, p, { role: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}>
                  <option>Stylist</option><option>Barber</option><option>Nail Technician</option><option>Makeup Artist</option><option>Receptionist</option>
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "#888" }}>Commission %:</span>
                  <input type="number" value={editingStaff.commission_pct} onChange={function(e) { setEditingStaff(function(p) { return Object.assign({}, p, { commission_pct: parseInt(e.target.value) || 0 }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <GoldBtn onClick={async function() { await db("PATCH", "staff", { name: editingStaff.name, role: editingStaff.role, commission_pct: editingStaff.commission_pct }, "?id=eq." + editingStaff.id); setStaffList(function(p) { return p.map(function(x) { return x.id === editingStaff.id ? Object.assign({}, x, editingStaff) : x; }); }); setEditingStaff(null); }} style={{ flex: 1, padding: "9px 0", fontSize: 12 }}>Save</GoldBtn>
                  <button onClick={function() { setEditingStaff(null); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 10, padding: "9px 0", fontSize: 12, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg," + BLACK + ",#2C1F00)", border: "2px solid " + GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: GOLD_LT, fontSize: 18, flexShrink: 0 }}>{s.name[0]}</div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 15, color: DARK }}>{s.name}</div><div style={{ fontSize: 12, color: "#888" }}>{s.role} · {s.commission_pct || 40}% commission</div></div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={function() { setEditingStaff(Object.assign({}, s)); }} style={{ background: CREAM, border: "1px solid " + GOLD_DIM, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>✏️ Edit</button>
                    <button onClick={async function() { if (!window.confirm("Deactivate " + s.name + "?")) return; await db("PATCH", "staff", { active: false }, "?id=eq." + s.id); setStaffList(function(p) { return p.filter(function(x) { return x.id !== s.id; }); }); }} style={{ background: "#FEE2E2", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: RED, cursor: "pointer", fontWeight: 700 }}>Remove</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[{ label: "Services", value: s.salesCount }, { label: "Revenue", value: fmt(s.revenue) }, { label: "Commission", value: fmt(s.commission) }].map(function(m, i) {
                    return <div key={i} style={{ background: CREAM, borderRadius: 8, padding: "8px 10px", textAlign: "center", border: "1px solid " + GOLD_DIM + "33" }}><div style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase" }}>{m.label}</div><div style={{ fontSize: 13, fontWeight: 900, color: GOLD_DIM, marginTop: 2 }}>{m.value}</div></div>;
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
