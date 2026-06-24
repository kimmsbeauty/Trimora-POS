// src/components/EndOfDaySummary.jsx

import { useState } from "react";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, GREEN, RED, AMBER } from "../lib/constants.js";
import { fmt, todayStr } from "../lib/utils.js";

export default function EndOfDaySummary({ sales, expenses, staffList, customers, ownerPhone, salonName }) {
  salonName = salonName || "the salon";
  var openState = useState(false); var open = openState[0]; var setOpen = openState[1];

  var today        = todayStr();
  var todaySales    = sales.filter(function(s) { return s.date === today; });
  var todayExpenses = (expenses || []).filter(function(e) { return e.date === today; });

  var serviceRevenue = todaySales.reduce(function(a,s){ return a + (s.service_total||0); }, 0);
  var productRevenue = todaySales.reduce(function(a,s){ return a + (s.product_total||0); }, 0);
  var discountTotal  = todaySales.reduce(function(a,s){ return a + (s.discount_amount||0); }, 0);
  var grossRevenue   = todaySales.reduce(function(a,s){ return a + (s.total||0); }, 0);
  var totalExpenses  = todayExpenses.reduce(function(a,e){ return a + (e.amount||0); }, 0);
  var netProfit      = grossRevenue - totalExpenses;

  var mpesaTotal = todaySales.filter(function(s){ return s.payment === "M-Pesa"; }).reduce(function(a,s){ return a+s.total; }, 0);
  var cashTotal  = todaySales.filter(function(s){ return s.payment === "Cash"; }).reduce(function(a,s){ return a+s.total; }, 0);

  var uniqueClients = new Set(todaySales.map(function(s){ return s.client; })).size;

  // Commission per staff member: for multi-stylist sales, read the
  // per-staff breakdown saved in commission_by_stylist. For older
  // single-stylist sales (or sales where that field is absent), fall
  // back to the sale-level commission attributed to sale.stylist.
  // This ensures the end-of-day report is accurate for both sale types.
  var staffCommissions = staffList.map(function(st) {
    var mySales = todaySales.filter(function(s) {
      if (s.commission_by_stylist && s.commission_by_stylist[st.name] != null) return true;
      return s.stylist === st.name;
    });
    var commission = mySales.reduce(function(a, s) {
      if (s.commission_by_stylist && s.commission_by_stylist[st.name] != null) {
        return a + s.commission_by_stylist[st.name];
      }
      return a + (s.commission || 0);
    }, 0);
    var revenue = mySales.reduce(function(a, s) { return a + s.total; }, 0);
    return {
      name: st.name,
      sales: mySales.length,
      revenue: revenue,
      commission: commission,
    };
  }).filter(function(s){ return s.sales > 0; }).sort(function(a,b){ return b.commission - a.commission; });

  var totalCommissionOwed = staffCommissions.reduce(function(a,s){ return a+s.commission; }, 0);

  // Flatten every cart item across today's sales, attributing each item
  // to the stylist who actually performed it (per-item stylist if the
  // sale was multi-stylist, otherwise the sale's single stylist field —
  // this keeps older single-stylist sales working the same as before).
  var itemizedSales = [];
  todaySales.forEach(function(s) {
    (s.items || []).forEach(function(it) {
      if (!it || !it.name) return;
      itemizedSales.push({
        staff: it.stylist || s.stylist || "Unassigned",
        name: it.name,
        type: it.type,
        qty: it.qty || 1,
        price: it.price || 0,
        client: s.client,
        time: s.time,
      });
    });
  });

  // Grouped-by-staff view: each staff member with their list of items
  var itemizedByStaff = {};
  itemizedSales.forEach(function(it) {
    if (!itemizedByStaff[it.staff]) itemizedByStaff[it.staff] = [];
    itemizedByStaff[it.staff].push(it);
  });
  var itemizedStaffNames = Object.keys(itemizedByStaff).sort();

  var itemizedViewState = useState("grouped"); var itemizedView = itemizedViewState[0]; var setItemizedView = itemizedViewState[1];

  function buildWhatsAppMessage() {
    var lines = [];
    lines.push("📊 *" + salonName + " — Daily Close*");
    lines.push(today);
    lines.push("");
    lines.push("💰 *Revenue*");
    lines.push("Services: " + fmt(serviceRevenue));
    lines.push("Products: " + fmt(productRevenue));
    if (discountTotal > 0) lines.push("Discounts given: -" + fmt(discountTotal));
    lines.push("Gross Total: " + fmt(grossRevenue));
    lines.push("");
    lines.push("💸 *Expenses*: " + fmt(totalExpenses));
    lines.push("📈 *Net Profit*: " + fmt(netProfit));
    lines.push("");
    lines.push("💳 *Payments*");
    lines.push("M-Pesa: " + fmt(mpesaTotal));
    lines.push("Cash: " + fmt(cashTotal));
    lines.push("");
    lines.push("👥 Clients served: " + uniqueClients);
    lines.push("🧾 Transactions: " + todaySales.length);
    lines.push("");
    lines.push("👩‍💼 *Commission Owed*");
    if (staffCommissions.length === 0) {
      lines.push("No sales recorded today.");
    } else {
      staffCommissions.forEach(function(s) {
        lines.push(s.name + ": " + fmt(s.commission) + " (" + s.sales + " sale" + (s.sales !== 1 ? "s" : "") + ")");
      });
      lines.push("Total: " + fmt(totalCommissionOwed));
    }
    lines.push("");
    lines.push("🧾 *Items Sold by Staff*");
    if (itemizedStaffNames.length === 0) {
      lines.push("No items recorded today.");
    } else {
      itemizedStaffNames.forEach(function(staffName) {
        lines.push("");
        lines.push("*" + staffName + "*");
        itemizedByStaff[staffName].forEach(function(it) {
          var icon = it.type === "service" ? "✂" : "🧴";
          lines.push(icon + " " + it.name + (it.qty > 1 ? " x" + it.qty : "") + " — " + fmt(it.price * it.qty));
        });
      });
    }
    return lines.join("\n");
  }

  return (
    <div>
      <button
        onClick={function() { setOpen(true); }}
        style={{
          width: "100%", background: "linear-gradient(135deg," + BLACK + ",#2C1F00)",
          color: GOLD_LT, border: "1.5px solid " + GOLD_DIM, borderRadius: 12,
          padding: "12px 0", fontSize: 13, fontWeight: 800, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        🌙 Generate End-of-Day Summary
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: WHITE, borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto" }}>

            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 28 }}>🌙</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: DARK, marginTop: 4 }}>Daily Close</div>
              <div style={{ fontSize: 12, color: "#888" }}>{today}</div>
            </div>

            {/* Revenue breakdown */}
            <div style={{ background: CREAM, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, textTransform: "uppercase", marginBottom: 8 }}>Revenue</div>
              <Row label="Services" value={fmt(serviceRevenue)} />
              <Row label="Products" value={fmt(productRevenue)} />
              {discountTotal > 0 && <Row label="Discounts given" value={"-" + fmt(discountTotal)} color={RED} />}
              <div style={{ borderTop: "1px dashed #ddd", marginTop: 6, paddingTop: 6 }}>
                <Row label="Gross Total" value={fmt(grossRevenue)} bold />
              </div>
            </div>

            {/* Profit */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div style={{ background: "#FFF5F5", borderRadius: 10, padding: "10px 12px", textAlign: "center", border: "1px solid #FEE2E2" }}>
                <div style={{ fontSize: 10, color: "#888", fontWeight: 700 }}>EXPENSES</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: RED }}>{fmt(totalExpenses)}</div>
              </div>
              <div style={{ background: netProfit >= 0 ? "#F0FDF4" : "#FFF5F5", borderRadius: 10, padding: "10px 12px", textAlign: "center", border: "1px solid " + (netProfit >= 0 ? "#BBF7D0" : "#FEE2E2") }}>
                <div style={{ fontSize: 10, color: "#888", fontWeight: 700 }}>NET PROFIT</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: netProfit >= 0 ? GREEN : RED }}>{fmt(Math.abs(netProfit))}</div>
              </div>
            </div>

            {/* Payments */}
            <div style={{ background: CREAM, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, textTransform: "uppercase", marginBottom: 8 }}>Payments</div>
              <Row label="📱 M-Pesa" value={fmt(mpesaTotal)} />
              <Row label="💵 Cash" value={fmt(cashTotal)} />
            </div>

            {/* Clients */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, background: CREAM, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: DARK }}>{uniqueClients}</div>
                <div style={{ fontSize: 10, color: "#888" }}>Clients Served</div>
              </div>
              <div style={{ flex: 1, background: CREAM, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: DARK }}>{todaySales.length}</div>
                <div style={{ fontSize: 10, color: "#888" }}>Transactions</div>
              </div>
            </div>

            {/* Commission owed */}
            <div style={{ background: "#FFFBEB", borderRadius: 10, padding: "12px 14px", marginBottom: 16, border: "1px solid #FDE68A" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#92400E", textTransform: "uppercase", marginBottom: 8 }}>Commission Owed</div>
              {staffCommissions.length === 0 ? (
                <div style={{ fontSize: 12, color: "#888" }}>No sales recorded today.</div>
              ) : (
                <div>
                  {staffCommissions.map(function(s, i) {
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: "#92400E" }}>{s.name} <span style={{ color: "#B45309" }}>({s.sales})</span></span>
                        <span style={{ fontWeight: 800, color: "#92400E" }}>{fmt(s.commission)}</span>
                      </div>
                    );
                  })}
                  <div style={{ borderTop: "1px dashed #FDE68A", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 900 }}>
                    <span style={{ color: "#92400E" }}>Total</span>
                    <span style={{ color: "#92400E" }}>{fmt(totalCommissionOwed)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Itemized services/products sold, by staff */}
            <div style={{ background: CREAM, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, textTransform: "uppercase" }}>Items Sold</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={function() { setItemizedView("grouped"); }}
                    style={{ fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 6, border: "1px solid " + GOLD_DIM, background: itemizedView === "grouped" ? GOLD_DIM : "transparent", color: itemizedView === "grouped" ? WHITE : GOLD_DIM, cursor: "pointer" }}
                  >By Staff</button>
                  <button
                    onClick={function() { setItemizedView("flat"); }}
                    style={{ fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 6, border: "1px solid " + GOLD_DIM, background: itemizedView === "flat" ? GOLD_DIM : "transparent", color: itemizedView === "flat" ? WHITE : GOLD_DIM, cursor: "pointer" }}
                  >Flat List</button>
                </div>
              </div>

              {itemizedSales.length === 0 ? (
                <div style={{ fontSize: 12, color: "#888" }}>No items recorded today.</div>
              ) : itemizedView === "grouped" ? (
                <div>
                  {itemizedStaffNames.map(function(staffName, gi) {
                    return (
                      <div key={gi} style={{ marginBottom: gi < itemizedStaffNames.length - 1 ? 10 : 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: DARK, marginBottom: 4 }}>{staffName}</div>
                        {itemizedByStaff[staffName].map(function(it, ii) {
                          return (
                            <div key={ii} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555", marginBottom: 3, paddingLeft: 8 }}>
                              <span>{it.type === "service" ? "✂" : "🧴"} {it.name}{it.qty > 1 ? " x" + it.qty : ""}</span>
                              <span style={{ fontWeight: 700 }}>{fmt(it.price * it.qty)}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div>
                  {itemizedSales.map(function(it, i) {
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555", marginBottom: 4 }}>
                        <span>{it.type === "service" ? "✂" : "🧴"} {it.name}{it.qty > 1 ? " x" + it.qty : ""} <span style={{ color: "#aaa" }}>· {it.staff}</span></span>
                        <span style={{ fontWeight: 700 }}>{fmt(it.price * it.qty)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a
                href={"https://wa.me/254" + (ownerPhone || "113828280") + "?text=" + encodeURIComponent(buildWhatsAppMessage())}
                target="_blank" rel="noreferrer"
                style={{ display: "block", width: "100%", background: "#25D366", color: WHITE, borderRadius: 12, padding: "13px 0", fontWeight: 900, fontSize: 14, textDecoration: "none", textAlign: "center", boxSizing: "border-box" }}
              >
                📲 Share via WhatsApp to Owner
              </a>
              <button onClick={function() { setOpen(false); }} style={{ width: "100%", background: "none", border: "1.5px solid " + GOLD_DIM, borderRadius: 12, padding: "11px 0", fontWeight: 700, fontSize: 13, color: GOLD_DIM, cursor: "pointer" }}>
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function Row(props) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: props.bold ? 13 : 12, fontWeight: props.bold ? 900 : 600, color: props.color || DARK, marginBottom: 4 }}>
      <span>{props.label}</span>
      <span>{props.value}</span>
    </div>
  );
}
