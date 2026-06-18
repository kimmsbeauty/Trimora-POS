// src/components/NotificationBell.jsx

import { useState } from "react";
import { GOLD, GOLD_LT, GOLD_DIM, WHITE, DARK, RED, AMBER } from "../lib/constants.js";
import { fmt } from "../lib/utils.js";

var LOW_STOCK_THRESHOLD = 3;

export default function NotificationBell({ products, ownerPhone }) {
  var openState = useState(false); var open = openState[0]; var setOpen = openState[1];

  var lowStockItems = products.filter(function(p) { return p.stock <= LOW_STOCK_THRESHOLD; });
  var count = lowStockItems.length;

  function buildAlertMessage(item) {
    return "⚠️ Low Stock Alert — Kimm's Beauty Parlour\n\n" +
      item.name + " is down to " + item.stock + " unit" + (item.stock !== 1 ? "s" : "") + ".\n" +
      "Category: " + item.cat + "\n\n" +
      "Please reorder soon to avoid running out.";
  }

  function buildAllAlertsMessage() {
    var lines = lowStockItems.map(function(p) {
      return "• " + p.name + " — " + p.stock + " left";
    }).join("\n");
    return "⚠️ Low Stock Alert — Kimm's Beauty Parlour\n\n" +
      "The following products need restocking:\n\n" + lines +
      "\n\nPlease arrange reorder soon.";
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={function() { setOpen(function(v) { return !v; }); }}
        style={{
          background: "rgba(255,255,255,0.1)", color: count > 0 ? AMBER : "rgba(255,255,255,0.7)",
          border: "1px solid " + (count > 0 ? AMBER : GOLD_DIM),
          borderRadius: "50%", width: 32, height: 32, fontSize: 14, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
        }}
      >
        🔔
        {count > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: RED, color: WHITE, borderRadius: "50%",
            width: 16, height: 16, fontSize: 9, fontWeight: 900,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1.5px solid " + DARK,
          }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: WHITE, borderRadius: 12, padding: 0,
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          border: "1px solid " + GOLD_DIM + "44",
          zIndex: 300, minWidth: 280, maxWidth: 320,
          maxHeight: 400, overflowY: "auto",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: DARK }}>
              {count > 0 ? "⚠️ Low Stock (" + count + ")" : "✅ All Stocked Up"}
            </div>
            {count > 0 && (
              <a
                href={"https://wa.me/254" + (ownerPhone || "113828280") + "?text=" + encodeURIComponent(buildAllAlertsMessage())}
                target="_blank" rel="noreferrer"
                onClick={function() { setOpen(false); }}
                style={{ background: "#25D366", color: WHITE, borderRadius: 16, padding: "4px 10px", fontSize: 10, fontWeight: 700, textDecoration: "none" }}
              >
                📲 Send All
              </a>
            )}
          </div>

          {count === 0 && (
            <div style={{ padding: "20px 14px", textAlign: "center", color: "#888", fontSize: 12 }}>
              All products are above the low-stock threshold.
            </div>
          )}

          {lowStockItems.map(function(p) {
            return (
              <div key={p.id} style={{ padding: "10px 14px", borderBottom: "1px solid #f5f5f5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: DARK }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: p.stock === 0 ? RED : AMBER, fontWeight: 700 }}>
                    {p.stock === 0 ? "OUT OF STOCK" : p.stock + " unit" + (p.stock !== 1 ? "s" : "") + " left"}
                  </div>
                </div>
                <a
                  href={"https://wa.me/254" + (ownerPhone || "113828280") + "?text=" + encodeURIComponent(buildAlertMessage(p))}
                  target="_blank" rel="noreferrer"
                  onClick={function() { setOpen(false); }}
                  style={{ background: "#25D366", color: WHITE, borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, textDecoration: "none", flexShrink: 0 }}
                >
                  📲
                </a>
              </div>
            );
          })}
        </div>
      )}

      {open && <div onClick={function() { setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 299 }} />}
    </div>
  );
}
