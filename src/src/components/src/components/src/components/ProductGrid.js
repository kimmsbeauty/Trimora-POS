import React from "react";

const BLACK = "#0A0A0A";
const GOLD = "#C9A84C";
const GOLD_LT = "#F0CC6E";
const WHITE = "#FFFFFF";
const DARK = "#1A1400";

export default function ProductGrid({ services, selectedCat, setSelectedCat, categories, onAddService, cart }) {
  function fmt(n) { return "KES " + Number(n).toLocaleString(); }

  return (
    <div style={{ flex: 1, paddingRight: 20, display: "flex", flexDirection: "column" }}>
      {/* Category Navigation Tabs */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 14, marginBottom: 16, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        {categories.map(c => (
          <button key={c} onClick={() => setSelectedCat(c)} style={{ border: "none", borderRadius: 20, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: selectedCat === c ? `linear-gradient(135deg,${BLACK},#2C1F00)` : WHITE, color: selectedCat === c ? GOLD_LT : DARK, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", whiteSpace: "nowrap" }}>
            {c}
          </button>
        ))}
      </div>

      {/* Services Grid layout */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, overflowY: "auto", flex: 1, paddingBottom: 20 }}>
        {services.filter(s => selectedCat === "All" || s.cat === selectedCat).map(s => {
          const inCartCount = cart.filter(item => item.id === s.id).length;
          return (
            <div key={s.id} onClick={() => onAddService(s)} style={{ background: WHITE, border: inCartCount ? `2px solid ${GOLD}` : "1px solid #EAE5D9", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: "pointer", transition: "all 0.15s", boxShadow: inCartCount ? "0 4px 12px rgba(201,168,76,0.15)" : "0 1px 3px rgba(0,0,0,0.02)" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, background: "#F5F0E8", padding: "2px 6px", borderRadius: 4, color: "#8A6F2E", textTransform: "uppercase" }}>{s.cat}</span>
                  {inCartCount > 0 && <span style={{ background: `linear-gradient(135deg,${BLACK},#2C1F00)`, color: GOLD_LT, width: 18, height: 18, borderRadius: "50%", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{inCartCount}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: DARK, lineHeight: 1.3, marginBottom: 8 }}>{s.name}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: GOLD }}>{fmt(s.price)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
