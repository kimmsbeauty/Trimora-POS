// src/components/ExportButton.jsx

import { useState } from "react";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, GREEN, DARK } from "../lib/constants.js";
import { fmt } from "../lib/utils.js";// src/components/ExportButton.jsx

import { useState } from "react";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, GREEN, DARK } from "../lib/constants.js";
import { fmt } from "../lib/utils.js";

function downloadCSV(filename, rows) {
  var csv = rows.map(function(row) {
    return row.map(function(cell) {
      var val = cell == null ? "" : String(cell);
      // Wrap in quotes if contains comma, quote or newline
      if (val.indexOf(",") !== -1 || val.indexOf('"') !== -1 || val.indexOf("\n") !== -1) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(",");
  }).join("\n");

  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildSalesCSV(sales, rangeLabel, salonName) {
  var header = [
    "Date", "Time", "Client", "Stylist", "Payment",
    "Services Total (KES)", "Discount (KES)", "Products Total (KES)",
    "Grand Total (KES)", "Commission (KES)", "Items"
  ];

  var rows = sales.map(function(s) {
    var items = Array.isArray(s.items)
      ? s.items.map(function(i) { return i.name + " x" + (i.qty || 1); }).join(" | ")
      : "";
    return [
      s.date || "",
      s.time || "",
      s.client || "",
      s.stylist || "",
      s.payment || "",
      s.service_total != null ? s.service_total : "",
      s.discount_amount != null ? s.discount_amount : 0,
      s.product_total != null ? s.product_total : "",
      s.total || "",
      s.commission != null ? s.commission.toFixed(2) : "",
      items,
    ];
  });

  var totalRow = [
    "TOTAL", "", "", "", "",
    sales.reduce(function(a,s){ return a + (s.service_total||0); }, 0).toFixed(2),
    sales.reduce(function(a,s){ return a + (s.discount_amount||0); }, 0).toFixed(2),
    sales.reduce(function(a,s){ return a + (s.product_total||0); }, 0).toFixed(2),
    sales.reduce(function(a,s){ return a + (s.total||0); }, 0).toFixed(2),
    sales.reduce(function(a,s){ return a + (s.commission||0); }, 0).toFixed(2),
    "",
  ];

  return [
    [salonName + " — Sales Report"],
    ["Period: " + rangeLabel],
    ["Generated: " + new Date().toLocaleString("en-KE")],
    [],
    header,
  ].concat(rows).concat([[], totalRow]);
}

function buildCommissionCSV(sales, staffList, rangeLabel, salonName) {
  var header = [
    "Stylist", "Role", "Commission Rate (%)",
    "Sales Count", "Services Revenue (KES)", "Discounts Given (KES)",
    "Net Service Revenue (KES)", "Commission Earned (KES)"
  ];

  var rows = staffList.map(function(st) {
    var mySales = sales.filter(function(s) { return s.stylist === st.name; });
    var svcRevenue  = mySales.reduce(function(a,s){ return a + (s.service_total||0); }, 0);
    var discounts   = mySales.reduce(function(a,s){ return a + (s.discount_amount||0); }, 0);
    var netSvc      = svcRevenue - discounts;
    var commission  = mySales.reduce(function(a,s){ return a + (s.commission||0); }, 0);
    return [
      st.name,
      st.role || "",
      st.commission_pct || 40,
      mySales.length,
      svcRevenue.toFixed(2),
      discounts.toFixed(2),
      netSvc.toFixed(2),
      commission.toFixed(2),
    ];
  });

  var totalCommission = sales.reduce(function(a,s){ return a + (s.commission||0); }, 0);

  return [
    [salonName + " — Commission Summary"],
    ["Period: " + rangeLabel],
    ["Generated: " + new Date().toLocaleString("en-KE")],
    [],
    header,
  ].concat(rows).concat([
    [],
    ["TOTAL COMMISSION PAYABLE", "", "", "", "", "", "", totalCommission.toFixed(2)],
  ]);
}

export default function ExportButton({ sales, staffList, rangeLabel, salonName }) {
  salonName = salonName || "the salon";
  var openState = useState(false); var open = openState[0]; var setOpen = openState[1];

  function exportSales() {
    var rows = buildSalesCSV(sales, rangeLabel, salonName);
    var date = new Date().toISOString().split("T")[0];
    downloadCSV("kimms-sales-" + date + ".csv", rows);
    setOpen(false);
  }

  function exportCommission() {
    var rows = buildCommissionCSV(sales, staffList, rangeLabel, salonName);
    var date = new Date().toISOString().split("T")[0];
    downloadCSV("kimms-commission-" + date + ".csv", rows);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={function() { setOpen(function(v) { return !v; }); }}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 20,
          border: "1.5px solid " + GOLD_DIM,
          background: "linear-gradient(135deg," + BLACK + ",#2C1F00)",
          color: GOLD_LT, fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}
      >
        ⬇️ Export {sales.length > 0 ? "(" + sales.length + ")" : ""}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: WHITE, borderRadius: 12, padding: 8,
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          border: "1px solid " + GOLD_DIM + "44",
          zIndex: 200, minWidth: 220,
        }}>
          {sales.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#888", textAlign: "center" }}>
              No sales in selected period
            </div>
          )}
          {sales.length > 0 && (
            <div>
              <button onClick={exportSales} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
                onMouseEnter={function(e){ e.currentTarget.style.background = "#F9FAFB"; }}
                onMouseLeave={function(e){ e.currentTarget.style.background = "none"; }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📊</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>Sales Report</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Itemised breakdown · CSV</div>
                </div>
              </button>

              <div style={{ height: 1, background: "#f0f0f0", margin: "4px 0" }} />

              <button onClick={exportCommission} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
                onMouseEnter={function(e){ e.currentTarget.style.background = "#F9FAFB"; }}
                onMouseLeave={function(e){ e.currentTarget.style.background = "none"; }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>👩‍💼</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>Commission Summary</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Per-staff payroll · CSV</div>
                </div>
              </button>
            </div>
          )}

          <div style={{ padding: "6px 12px 2px", fontSize: 10, color: "#bbb", borderTop: "1px solid #f0f0f0", marginTop: 4 }}>
            Opens as a downloadable .csv file
          </div>
        </div>
      )}

      {/* Close on outside click */}
      {open && <div onClick={function() { setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 199 }} />}
    </div>
  );
}


function downloadCSV(filename, rows) {
  var csv = rows.map(function(row) {
    return row.map(function(cell) {
      var val = cell == null ? "" : String(cell);
      // Wrap in quotes if contains comma, quote or newline
      if (val.indexOf(",") !== -1 || val.indexOf('"') !== -1 || val.indexOf("\n") !== -1) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(",");
  }).join("\n");

  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildSalesCSV(sales, rangeLabel) {
  var header = [
    "Date", "Time", "Client", "Stylist", "Payment",
    "Services Total (KES)", "Discount (KES)", "Products Total (KES)",
    "Grand Total (KES)", "Commission (KES)", "Items"
  ];

  var rows = sales.map(function(s) {
    var items = Array.isArray(s.items)
      ? s.items.map(function(i) { return i.name + " x" + (i.qty || 1); }).join(" | ")
      : "";
    return [
      s.date || "",
      s.time || "",
      s.client || "",
      s.stylist || "",
      s.payment || "",
      s.service_total != null ? s.service_total : "",
      s.discount_amount != null ? s.discount_amount : 0,
      s.product_total != null ? s.product_total : "",
      s.total || "",
      s.commission != null ? s.commission.toFixed(2) : "",
      items,
    ];
  });

  var totalRow = [
    "TOTAL", "", "", "", "",
    sales.reduce(function(a,s){ return a + (s.service_total||0); }, 0).toFixed(2),
    sales.reduce(function(a,s){ return a + (s.discount_amount||0); }, 0).toFixed(2),
    sales.reduce(function(a,s){ return a + (s.product_total||0); }, 0).toFixed(2),
    sales.reduce(function(a,s){ return a + (s.total||0); }, 0).toFixed(2),
    sales.reduce(function(a,s){ return a + (s.commission||0); }, 0).toFixed(2),
    "",
  ];

  return [
    ["Kimm's Beauty Parlour — Sales Report"],
    ["Period: " + rangeLabel],
    ["Generated: " + new Date().toLocaleString("en-KE")],
    [],
    header,
  ].concat(rows).concat([[], totalRow]);
}

function buildCommissionCSV(sales, staffList, rangeLabel) {
  var header = [
    "Stylist", "Role", "Commission Rate (%)",
    "Sales Count", "Services Revenue (KES)", "Discounts Given (KES)",
    "Net Service Revenue (KES)", "Commission Earned (KES)"
  ];

  var rows = staffList.map(function(st) {
    var mySales = sales.filter(function(s) { return s.stylist === st.name; });
    var svcRevenue  = mySales.reduce(function(a,s){ return a + (s.service_total||0); }, 0);
    var discounts   = mySales.reduce(function(a,s){ return a + (s.discount_amount||0); }, 0);
    var netSvc      = svcRevenue - discounts;
    var commission  = mySales.reduce(function(a,s){ return a + (s.commission||0); }, 0);
    return [
      st.name,
      st.role || "",
      st.commission_pct || 40,
      mySales.length,
      svcRevenue.toFixed(2),
      discounts.toFixed(2),
      netSvc.toFixed(2),
      commission.toFixed(2),
    ];
  });

  var totalCommission = sales.reduce(function(a,s){ return a + (s.commission||0); }, 0);

  return [
    ["Kimm's Beauty Parlour — Commission Summary"],
    ["Period: " + rangeLabel],
    ["Generated: " + new Date().toLocaleString("en-KE")],
    [],
    header,
  ].concat(rows).concat([
    [],
    ["TOTAL COMMISSION PAYABLE", "", "", "", "", "", "", totalCommission.toFixed(2)],
  ]);
}

export default function ExportButton({ sales, staffList, rangeLabel }) {
  var openState = useState(false); var open = openState[0]; var setOpen = openState[1];

  function exportSales() {
    var rows = buildSalesCSV(sales, rangeLabel);
    var date = new Date().toISOString().split("T")[0];
    downloadCSV("kimms-sales-" + date + ".csv", rows);
    setOpen(false);
  }

  function exportCommission() {
    var rows = buildCommissionCSV(sales, staffList, rangeLabel);
    var date = new Date().toISOString().split("T")[0];
    downloadCSV("kimms-commission-" + date + ".csv", rows);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={function() { setOpen(function(v) { return !v; }); }}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 20,
          border: "1.5px solid " + GOLD_DIM,
          background: "linear-gradient(135deg," + BLACK + ",#2C1F00)",
          color: GOLD_LT, fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}
      >
        ⬇️ Export {sales.length > 0 ? "(" + sales.length + ")" : ""}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: WHITE, borderRadius: 12, padding: 8,
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          border: "1px solid " + GOLD_DIM + "44",
          zIndex: 200, minWidth: 220,
        }}>
          {sales.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#888", textAlign: "center" }}>
              No sales in selected period
            </div>
          )}
          {sales.length > 0 && (
            <div>
              <button onClick={exportSales} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
                onMouseEnter={function(e){ e.currentTarget.style.background = "#F9FAFB"; }}
                onMouseLeave={function(e){ e.currentTarget.style.background = "none"; }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📊</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>Sales Report</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Itemised breakdown · CSV</div>
                </div>
              </button>

              <div style={{ height: 1, background: "#f0f0f0", margin: "4px 0" }} />

              <button onClick={exportCommission} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
                onMouseEnter={function(e){ e.currentTarget.style.background = "#F9FAFB"; }}
                onMouseLeave={function(e){ e.currentTarget.style.background = "none"; }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>👩‍💼</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>Commission Summary</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Per-staff payroll · CSV</div>
                </div>
              </button>
            </div>
          )}

          <div style={{ padding: "6px 12px 2px", fontSize: 10, color: "#bbb", borderTop: "1px solid #f0f0f0", marginTop: 4 }}>
            Opens as a downloadable .csv file
          </div>
        </div>
      )}

      {/* Close on outside click */}
      {open && <div onClick={function() { setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 199 }} />}
    </div>
  );
}
