// src/components/NotificationBell.jsx

import { useState } from "react";
import { GOLD, GOLD_LT, GOLD_DIM, WHITE, DARK, RED, AMBER } from "../lib/constants.js";
import { fmt } from "../lib/utils.js";

var LOW_STOCK_THRESHOLD = 3;

export default function NotificationBell({ products, ownerPhone, salonName, feedbacks }) {
  salonName = salonName || "the salon";
  feedbacks = feedbacks || [];
  var openState = useState(false); var open = openState[0]; var setOpen = openState[1];

  var lowStockItems = products.filter(function(p) { return p.stock <= LOW_STOCK_THRESHOLD; });

  var oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  var newFeedbacks = feedbacks.filter(function(f) {
    return f.created_at ? f.created_at.slice(0, 10) >= oneDayAgo : f.date >= oneDayAgo;
  });

  var count = lowStockItems.length + newFeedbacks.length;

  function buildAlertMessage(item) {
    return "Warning: Low Stock Alert for " + salonName + "\n\n" +
      item.name + " is down to " + item.stock + " unit" + (item.stock !== 1 ? "s" : "") + ".\n" +
      "Category: " + item.cat + "\n\nPlease reorder soon to avoid running out.";
  }

  function buildAllAlertsMessage() {
    var lines = lowStockItems.map(function(p) { return "- " + p.name + " : " + p.stock + " left"; }).join("\n");
    return "Warning: Low Stock Alert for " + salonName + "\n\nProducts needing restock:\n\n" + lines + "\n\nPlease arrange reorder soon.";
  }

  function starStr(rating) {
    var s = "";
    for (var i = 1; i <= 5; i++) s += i <= rating ? "⭐" : "☆";
    return s;
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
          <span style={{ position: "absolute", top: -4, right: -4, background: RED, color: WHITE, borderRadius: "50%", width: 16, height: 16, fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid " + DARK }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: WHITE, borderRadius: 12, padding: 0, boxShadow: "0 4px 24px rgba(0,0,0,0.2)", border: "1px solid " + GOLD_DIM + "44", zIndex: 300, minWidth: 280, maxWidth: 320, maxHeight: 480, overflowY: "auto" }}>

          {newFeedbacks.length > 0 && (
            <div>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #f0f0f0", background: "#FFFBEB" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#92400E" }}>New Reviews ({newFeedbacks.length})</div>
              </div>
              {newFeedbacks.map(function(f, i) {
                return (
                  <div key={f.id || i} style={{ padding: "10px 14px", borderBottom: "1px solid #f5f5f5" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 12 }}>{starStr(f.rating)}</span>
                      <span style={{ fontSize: 10, color: "#aaa" }}>{f.date || ""}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: DARK }}>{f.client || "Anonymous"}{f.stylist ? " · " + f.stylist : ""}</div>
                    {f.note && <div style={{ fontSize: 11, color: "#888", fontStyle: "italic", marginTop: 2 }}>"{f.note}"</div>}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ padding: "10px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: DARK }}>
              {lowStockItems.length > 0 ? "Low Stock (" + lowStockItems.length + ")" : "All Stocked Up"}
            </div>
            {lowStockItems.length > 0 && (
              <a href={"https://wa.me/254" + (ownerPhone || "113828280") + "?text=" + encodeURIComponent(buildAllAlertsMessage())} target="_blank" rel="noreferrer" onClick={function() { setOpen(false); }} style={{ background: "#25D366", color: WHITE, borderRadius: 16, padding: "4px 10px", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>
                Send All
              </a>
            )}
          </div>

          {lowStockItems.length === 0 && newFeedbacks.length === 0 && (
            <div style={{ padding: "20px 14px", textAlign: "center", color: "#888", fontSize: 12 }}>No new alerts.</div>
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
                <a href={"https://wa.me/254" + (ownerPhone || "113828280") + "?text=" + encodeURIComponent(buildAlertMessage(p))} target="_blank" rel="noreferrer" onClick={function() { setOpen(false); }} style={{ background: "#25D366", color: WHITE, borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>
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
