// src/pages/auto/ExpensesPage.jsx
//
// Admin-only. Reuses the shared `expenses` table -- same table POS's
// own ExpensesPage.jsx writes to (already in TENANT_TABLES, no schema
// change needed). This is a genuinely shared ledger, not an Auto-only
// copy: an expense logged here shows up in POS's Expenses tab too, and
// vice versa. That's intentional for a single business with two
// service lines, same reasoning as Staff being shared rather than
// duplicated (Phase 4).
//
// Built fresh in Auto's own theme rather than reusing POS's
// ExpensesPage.jsx directly -- that component has POS's gold/cream
// palette and GoldBtn baked in throughout, not parameterized the way
// SalonBrandmark or fmt() are.

import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/db";
import { INK, STEEL, CHROME, SIGNAL, ALERT, PAPER } from "./theme";

var CATEGORIES = ["Rent", "Utilities", "Supplies", "Staff", "Marketing", "Equipment", "Maintenance", "Other"];

function money(n) {
  return "KSh " + (n || 0).toLocaleString();
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function ExpensesPage({ isAdmin }) {
  var expensesState = useState([]); var expenses = expensesState[0]; var setExpenses = expensesState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var showFormState = useState(false); var showForm = showFormState[0]; var setShowForm = showFormState[1];
  var busyState = useState(false); var busy = busyState[0]; var setBusy = busyState[1];
  var formState = useState({ date: todayStr(), category: "Supplies", amount: "", notes: "" });
  var form = formState[0]; var setForm = formState[1];

  var filterMonthState = useState(function () {
    var now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  });
  var filterMonth = filterMonthState[0]; var setFilterMonth = filterMonthState[1];

  var load = useCallback(async function () {
    var rows = await db("GET", "expenses", null, "?order=date.desc,created_at.desc&limit=200");
    setExpenses(rows || []);
    setLoading(false);
  }, []);

  useEffect(function () { load(); }, [load]);

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: INK, color: PAPER, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif" }}>
        Expenses are admin-only.
      </div>
    );
  }

  async function saveExpense() {
    if (!form.amount || parseFloat(form.amount) <= 0 || !form.date || busy) return;
    setBusy(true);
    await db("POST", "expenses", {
      date: form.date, category: form.category, amount: parseFloat(form.amount), notes: form.notes || null,
    });
    setForm({ date: todayStr(), category: "Supplies", amount: "", notes: "" });
    setShowForm(false);
    setBusy(false);
    load();
  }

  async function deleteExpense(id) {
    if (busy) return;
    setBusy(true);
    await db("DELETE", "expenses", null, "?id=eq." + id);
    setBusy(false);
    load();
  }

  // date is stored as free text (en-KE DD/MM/YYYY or ISO YYYY-MM-DD,
  // same ambiguity POS's own ExpensesPage.jsx already handles) --
  // matching that exact parsing so Auto and POS agree on which month
  // an expense belongs to.
  var filteredExpenses = expenses.filter(function (e) {
    if (!e.date) return false;
    var d = new Date(e.date.indexOf("/") >= 0 ? e.date.split("/").reverse().join("-") : e.date);
    var eMonth = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    return eMonth === filterMonth;
  });

  var totalExpenses = filteredExpenses.reduce(function (a, e) { return a + (e.amount || 0); }, 0);

  var catTotals = {};
  filteredExpenses.forEach(function (e) { catTotals[e.category] = (catTotals[e.category] || 0) + (e.amount || 0); });
  var catBreakdown = Object.entries(catTotals).sort(function (a, b) { return b[1] - a[1]; });
  var maxCat = catBreakdown.length > 0 ? catBreakdown[0][1] : 1;

  var panelStyle = { background: STEEL, borderRadius: 14, padding: 16, border: "1px solid " + CHROME + "33", marginBottom: 14 };
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
    <div style={{ minHeight: "100vh", background: INK, padding: 16, paddingBottom: 40, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: PAPER }}>Expenses</div>
            <div style={{ fontSize: 12, color: CHROME }}>Shared ledger — same as POS's own Expenses tab</div>
          </div>
          <span onClick={function () { setShowForm(!showForm); }} style={{ cursor: "pointer", color: SIGNAL, fontSize: 12, fontWeight: 800 }}>
            {showForm ? "Cancel" : "+ Add expense"}
          </span>
        </div>

        {showForm && (
          <div style={panelStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Date</div>
                <input type="date" value={form.date}
                  onChange={function (e) { setForm(Object.assign({}, form, { date: e.target.value })); }}
                  style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Category</div>
                <select value={form.category}
                  onChange={function (e) { setForm(Object.assign({}, form, { category: e.target.value })); }}
                  style={inputStyle}>
                  {CATEGORIES.map(function (c) { return <option key={c} value={c}>{c}</option>; })}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Amount (KSh)</div>
              <input type="number" placeholder="e.g. 5000" value={form.amount}
                onChange={function (e) { setForm(Object.assign({}, form, { amount: e.target.value })); }}
                style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: CHROME, marginBottom: 4 }}>Notes (optional)</div>
              <input type="text" placeholder="e.g. Diesel for pressure washer" value={form.notes}
                onChange={function (e) { setForm(Object.assign({}, form, { notes: e.target.value })); }}
                style={inputStyle} />
            </div>
            <button onClick={saveExpense} disabled={busy} style={btnStyle}>Save expense</button>
          </div>
        )}

        <div style={Object.assign({}, panelStyle, { display: "flex", alignItems: "center", gap: 10 })}>
          <span style={{ fontSize: 11, color: CHROME, fontWeight: 700, whiteSpace: "nowrap" }}>📅 Month</span>
          <input type="month" value={filterMonth} onChange={function (e) { setFilterMonth(e.target.value); }}
            style={Object.assign({}, inputStyle, { flex: 1 })} />
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: ALERT }}>{money(totalExpenses)}</div>
            <div style={{ fontSize: 10, color: CHROME }}>{filteredExpenses.length} entries</div>
          </div>
        </div>

        {catBreakdown.length > 0 && (
          <div style={panelStyle}>
            <div style={{ fontWeight: 800, fontSize: 13, color: PAPER, marginBottom: 10 }}>By Category</div>
            {catBreakdown.map(function (entry, i) {
              var cat = entry[0]; var amt = entry[1];
              return (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: PAPER }}>{cat}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: SIGNAL }}>{money(amt)}</span>
                  </div>
                  <div style={{ background: CHROME + "22", borderRadius: 20, height: 6 }}>
                    <div style={{ width: ((amt / maxCat) * 100) + "%", height: "100%", borderRadius: 20, background: SIGNAL }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredExpenses.length === 0 ? (
          <div style={{ fontSize: 12, color: CHROME, textAlign: "center", padding: "30px 0" }}>No expenses for this month.</div>
        ) : filteredExpenses.map(function (e) {
          return (
            <div key={e.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", borderRadius: 10, border: "1.5px solid " + CHROME + "33",
              background: "rgba(255,255,255,0.02)", marginBottom: 8,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: PAPER }}>{e.category}</div>
                <div style={{ fontSize: 11, color: CHROME }}>{e.date}{e.notes ? " · " + e.notes : ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: ALERT }}>{money(e.amount)}</div>
                <span onClick={function () { deleteExpense(e.id); }} style={{ cursor: "pointer", color: ALERT, fontSize: 12, fontWeight: 700 }}>🗑</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
