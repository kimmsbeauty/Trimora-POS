// src/pages/ExpensesPage.jsx

import { useState, useEffect } from "react";
import GoldBtn from "../components/GoldBtn.jsx";
import { db } from "../lib/db.js";
import { fmt, todayStr, nowTime } from "../lib/utils.js";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, RED, GREEN, AMBER } from "../lib/constants.js";

var CATEGORIES = ["Rent", "Utilities", "Supplies", "Staff", "Marketing", "Equipment", "Maintenance", "Other"];

export default function ExpensesPage({ darkMode }) {
  var CARD    = darkMode ? "#1A1400" : WHITE;
  var TEXT    = darkMode ? WHITE     : DARK;
  var BORDER  = darkMode ? GOLD_DIM + "55" : GOLD_DIM + "33";
  var SUBTEXT = darkMode ? "rgba(255,255,255,0.5)" : "#888";
  var BG      = darkMode ? "#0A0A0A" : CREAM;

  var expensesState = useState([]); var expenses = expensesState[0]; var setExpenses = expensesState[1];
  var loadingState  = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var showFormState = useState(false); var showForm = showFormState[0]; var setShowForm = showFormState[1];
  var savingState   = useState(false); var saving = savingState[0]; var setSaving = savingState[1];
  var toastState    = useState(null); var toast = toastState[0]; var setToast = toastState[1];

  var formState = useState({ date: todayStr(), category: "Supplies", amount: "", notes: "" });
  var form = formState[0]; var setForm = formState[1];

  var filterMonthState = useState(function() {
    var now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
  });
  var filterMonth = filterMonthState[0]; var setFilterMonth = filterMonthState[1];

  function showToast(msg, type) {
    type = type || "success";
    setToast({ msg: msg, type: type });
    setTimeout(function() { setToast(null); }, 3000);
  }

  useEffect(function() {
    async function load() {
      try {
        var data = await db("GET", "expenses", null, "?order=date.desc,created_at.desc&limit=200");
        setExpenses(Array.isArray(data) ? data : []);
      } catch (e) { console.error("Expenses load error:", e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function saveExpense() {
    if (!form.amount || parseFloat(form.amount) <= 0) return alert("Please enter a valid amount");
    if (!form.date) return alert("Please select a date");
    setSaving(true);
    try {
      var data = { date: form.date, category: form.category, amount: parseFloat(form.amount), notes: form.notes };
      var saved = await db("POST", "expenses", data);
      var newExp = (saved && saved[0]) || Object.assign({}, data, { id: Date.now() });
      setExpenses(function(p) { return [newExp].concat(p); });
      setForm({ date: todayStr(), category: "Supplies", amount: "", notes: "" });
      setShowForm(false);
      showToast("Expense saved ✅");
    } catch (e) {
      console.error("Save expense error:", e);
      showToast("Failed to save — check connection", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(id) {
    if (!window.confirm("Delete this expense?")) return;
    try {
      await db("DELETE", "expenses", null, "?id=eq." + id);
      setExpenses(function(p) { return p.filter(function(e) { return e.id !== id; }); });
      showToast("Expense deleted", "info");
    } catch (e) { showToast("Delete failed", "error"); }
  }

  // Filter by selected month
  var filteredExpenses = expenses.filter(function(e) {
    if (!e.date) return false;
    // date stored as en-KE (DD/MM/YYYY) or ISO (YYYY-MM-DD)
    var d = new Date(e.date.includes("/") ? e.date.split("/").reverse().join("-") : e.date);
    var eMonth = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
    return eMonth === filterMonth;
  });

  var totalExpenses = filteredExpenses.reduce(function(a,e){ return a + (e.amount||0); }, 0);

  // Category breakdown
  var catTotals = {};
  filteredExpenses.forEach(function(e) { catTotals[e.category] = (catTotals[e.category]||0) + (e.amount||0); });
  var catBreakdown = Object.entries(catTotals).sort(function(a,b){ return b[1]-a[1]; });
  var maxCat = catBreakdown.length > 0 ? catBreakdown[0][1] : 1;

  var catColors = { Rent:"#7C3AED", Utilities:"#0EA5E9", Supplies:"#F59E0B", Staff:"#10B981", Marketing:"#EC4899", Equipment:"#6366F1", Maintenance:"#F97316", Other:"#6B7280" };

  var inputStyle = { width:"100%", borderRadius:10, border:"1.5px solid "+GOLD_DIM, padding:"10px 12px", fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box", background:WHITE, color:DARK };

  return (
    <div style={{ padding:16, background:BG, minHeight:"100%" }}>

      {toast && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", zIndex:9999, borderRadius:12, padding:"12px 20px", background:toast.type==="success"?GREEN:toast.type==="error"?RED:GOLD, color:WHITE, fontWeight:800, fontSize:13, boxShadow:"0 4px 20px rgba(0,0,0,0.3)", display:"flex", alignItems:"center", gap:8, maxWidth:"90vw" }}>
          <span>{toast.type==="success"?"✅":toast.type==="error"?"❌":"ℹ️"}</span>{toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <div style={{ fontWeight:900, fontSize:18, color:TEXT }}>Expenses</div>
          <div style={{ fontSize:12, color:SUBTEXT }}>Track salon running costs</div>
        </div>
        <GoldBtn onClick={function(){ setShowForm(function(v){ return !v; }); }} style={{ padding:"8px 16px", fontSize:12 }}>
          {showForm ? "Cancel" : "+ Add Expense"}
        </GoldBtn>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ background:CARD, borderRadius:14, padding:16, marginBottom:16, border:"1.5px solid "+GOLD, boxShadow:"0 2px 16px rgba(201,168,76,0.12)" }}>
          <div style={{ fontWeight:800, fontSize:14, color:TEXT, marginBottom:12 }}>New Expense</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:SUBTEXT, marginBottom:4 }}>Date</div>
              <input type="date" value={form.date} onChange={function(e){ setForm(function(p){ return Object.assign({},p,{date:e.target.value}); }); }} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:SUBTEXT, marginBottom:4 }}>Category</div>
              <select value={form.category} onChange={function(e){ setForm(function(p){ return Object.assign({},p,{category:e.target.value}); }); }} style={inputStyle}>
                {CATEGORIES.map(function(c){ return <option key={c}>{c}</option>; })}
              </select>
            </div>
          </div>
          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:11, fontWeight:700, color:SUBTEXT, marginBottom:4 }}>Amount (KES)</div>
            <input type="number" placeholder="e.g. 5000" value={form.amount} onChange={function(e){ setForm(function(p){ return Object.assign({},p,{amount:e.target.value}); }); }} style={inputStyle} />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:SUBTEXT, marginBottom:4 }}>Notes (optional)</div>
            <input type="text" placeholder="e.g. Monthly rent payment" value={form.notes} onChange={function(e){ setForm(function(p){ return Object.assign({},p,{notes:e.target.value}); }); }} style={inputStyle} />
          </div>
          <GoldBtn onClick={saveExpense} disabled={saving} style={{ width:"100%" }}>
            {saving ? "Saving..." : "Save Expense"}
          </GoldBtn>
        </div>
      )}

      {/* Month filter */}
      <div style={{ background:CARD, borderRadius:12, padding:"10px 14px", marginBottom:14, border:"1px solid "+BORDER, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:11, color:SUBTEXT, fontWeight:700, whiteSpace:"nowrap" }}>📅 Month</span>
        <input type="month" value={filterMonth} onChange={function(e){ setFilterMonth(e.target.value); }} style={{ flex:1, borderRadius:8, border:"1.5px solid "+GOLD_DIM, padding:"6px 10px", fontSize:13, fontFamily:"inherit", outline:"none", color:DARK }} />
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontSize:16, fontWeight:900, color:RED }}>{fmt(totalExpenses)}</div>
          <div style={{ fontSize:10, color:SUBTEXT }}>{filteredExpenses.length} entries</div>
        </div>
      </div>

      {/* Category breakdown chart */}
      {catBreakdown.length > 0 && (
        <div style={{ background:CARD, borderRadius:14, padding:14, marginBottom:14, border:"1px solid "+BORDER }}>
          <div style={{ fontWeight:800, fontSize:13, color:TEXT, marginBottom:10 }}>By Category</div>
          {catBreakdown.map(function(entry, i) {
            var cat = entry[0]; var amt = entry[1];
            var color = catColors[cat] || "#6B7280";
            return (
              <div key={i} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:color, flexShrink:0 }} />
                    <span style={{ fontSize:12, fontWeight:700, color:TEXT }}>{cat}</span>
                  </div>
                  <span style={{ fontSize:12, fontWeight:800, color:color }}>{fmt(amt)}</span>
                </div>
                <div style={{ background:darkMode?"#2C1F00":"#F5F0E8", borderRadius:20, height:6 }}>
                  <div style={{ width:((amt/maxCat)*100)+"%", height:"100%", borderRadius:20, background:color, transition:"width 0.5s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expense list */}
      {loading && <div style={{ textAlign:"center", padding:"40px 0", color:SUBTEXT }}><div style={{ fontSize:24 }}>⏳</div><div style={{ fontSize:13, marginTop:8 }}>Loading expenses...</div></div>}

      {!loading && filteredExpenses.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 20px", color:SUBTEXT }}>
          <div style={{ fontSize:36, marginBottom:8 }}>💸</div>
          <div style={{ fontSize:14, marginBottom:4 }}>No expenses for this month</div>
          <div style={{ fontSize:12 }}>Tap "+ Add Expense" to record one</div>
        </div>
      )}

      {!loading && filteredExpenses.map(function(e) {
        var color = catColors[e.category] || "#6B7280";
        return (
          <div key={e.id} style={{ background:CARD, borderRadius:12, padding:"12px 14px", marginBottom:8, border:"1px solid "+BORDER, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, flex:1 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:color+"22", border:"1.5px solid "+color+"66", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:color }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13, color:TEXT }}>{e.category}</div>
                <div style={{ fontSize:11, color:SUBTEXT }}>{e.date}{e.notes ? " · " + e.notes : ""}</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:14, fontWeight:900, color:RED }}>{fmt(e.amount)}</div>
              </div>
              <button onClick={function(){ deleteExpense(e.id); }} style={{ background:"#FEE2E2", border:"none", borderRadius:8, padding:"5px 8px", fontSize:11, color:RED, cursor:"pointer", fontWeight:700, flexShrink:0 }}>🗑</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
