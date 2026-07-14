// src/pages/pos/InventoryView.jsx
//
// Extracted from POSApp.jsx (was the `page === "inventory"` inline block).
// Mechanical extraction only — no logic changes. `products` state and the
// `adjustStock` handler still live in and are owned by POSApp.jsx; this
// component is purely presentational.

import { db } from "../../lib/db.js";
import { fmt } from "../../lib/utils.js";
import GoldBtn from "../../components/GoldBtn";
import { GOLD, GOLD_DIM, DARK, WHITE, RED, GREEN, AMBER } from "../../lib/constants.js";

export default function InventoryView({
  products,
  setProducts,
  showAddProduct,
  setShowAddProduct,
  newProduct,
  setNewProduct,
  adjustStock,
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: DARK }}>Product Stock</div>
        <GoldBtn onClick={function() { setShowAddProduct(function(p) { return !p; }); }} style={{ padding: "8px 16px", fontSize: 12 }}>+ Add Product</GoldBtn>
      </div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>Tap + or − to adjust stock</div>
      {showAddProduct && (
        <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 16, border: "1.5px solid " + GOLD }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: DARK, marginBottom: 12 }}>New Product</div>
          <input placeholder="Product name" value={newProduct.name} onChange={function(e) { setNewProduct(function(p) { return Object.assign({}, p, { name: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
          <select value={newProduct.cat} onChange={function(e) { setNewProduct(function(p) { return Object.assign({}, p, { cat: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}>
            <option>Hair</option><option>Nails</option><option>Beauty</option><option>Spa</option>
          </select>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input placeholder="Price (KES)" type="number" value={newProduct.price} onChange={function(e) { setNewProduct(function(p) { return Object.assign({}, p, { price: e.target.value }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            <input placeholder="Stock qty" type="number" value={newProduct.stock} onChange={function(e) { setNewProduct(function(p) { return Object.assign({}, p, { stock: e.target.value }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <GoldBtn onClick={async function() { if (!newProduct.name || !newProduct.price) return alert("Please enter name and price"); var prod = { id: "PRD" + Date.now(), name: newProduct.name, cat: newProduct.cat, price: parseInt(newProduct.price), stock: parseInt(newProduct.stock) || 0 }; var saved = await db("POST", "stock", prod); setProducts(function(p) { return p.concat([(saved && saved[0]) || prod]); }); setShowAddProduct(false); setNewProduct({ name: "", cat: "Hair", price: "", stock: "" }); }} style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>Save Product</GoldBtn>
            <button onClick={function() { setShowAddProduct(false); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 10, padding: "10px 0", fontSize: 13, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
          </div>
        </div>
      )}
      {products.map(function(p) {
        var isCritical = p.stock <= 3;
        var isLow      = p.stock > 3 && p.stock <= 5;
        return (
          <div key={p.id} style={{ background: WHITE, borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: "1.5px solid " + (isCritical ? RED : isLow ? "#FEE2E2" : GOLD_DIM + "44") }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: DARK, display: "flex", alignItems: "center", gap: 6 }}>
                  {p.name}
                  {isCritical && <span style={{ fontSize: 9, background: RED, color: WHITE, padding: "2px 6px", borderRadius: 20, fontWeight: 800 }}>🔔 CRITICAL</span>}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>{p.cat} · <span style={{ color: GOLD_DIM, fontWeight: 700 }}>{fmt(p.price)}</span></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={function() { adjustStock(p.id, -1); }} style={{ width: 30, height: 30, borderRadius: "50%", border: "1.5px solid " + RED, background: WHITE, color: RED, fontSize: 18, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <div style={{ textAlign: "center", minWidth: 36 }}><div style={{ fontSize: 18, fontWeight: 900, color: isCritical ? RED : isLow ? AMBER : GREEN }}>{p.stock}</div><div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase" }}>units</div></div>
                <button onClick={function() { adjustStock(p.id, 1); }} style={{ width: 30, height: 30, borderRadius: "50%", border: "1.5px solid " + GREEN, background: WHITE, color: GREEN, fontSize: 18, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>
            </div>
            {isCritical && <div style={{ marginTop: 8, background: "#FEE2E2", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: RED, fontWeight: 700 }}>🔔 Critical — appears in notification bell, reorder now</div>}
            {isLow && <div style={{ marginTop: 8, background: "#FFF5F5", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: RED, fontWeight: 700 }}>⚠️ Low stock — consider reordering</div>}
          </div>
        );
      })}
    </div>
  );
}
