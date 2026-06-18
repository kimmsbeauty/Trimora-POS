// src/pages/Dashboard.jsx

import { useState } from "react";
import ExportButton from "../components/ExportButton.jsx";
import EndOfDaySummary from "../components/EndOfDaySummary.jsx";
import {
  BLACK, GOLD, GOLD_LT, GOLD_DIM, CREAM, WHITE,
  GREEN, RED, AMBER,
} from "../lib/constants.js";
import { fmt } from "../lib/utils.js";

// FIX: previously returned "18/06/2026" (DD/MM/YYYY), which Postgres
// date columns reject. Now emits ISO format ("2026-06-18"), matching
// the fixed todayStr() in lib/utils.js. Both old (/) and new (-) format
// sale rows are still handled correctly by parseKEDate() + sameDay()
// below, so historical data keeps displaying properly during the
// transition.
function toKEDate(d) {
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}
function startOfDay(d) { var x = new Date(d); x.setHours(0,0,0,0); return x; }
function todayStr() { return toKEDate(new Date()); }

// Returns true if a sale's date string (either old "18/06/2026" or new
// "2026-06-18" format) falls on the same calendar day as a comparison
// Date object. This lets old and new format rows both match correctly.
function sameDay(dateStr, compareDate) {
  var d = parseKEDate(dateStr);
  if (!d) return false;
  return d.getFullYear() === compareDate.getFullYear() &&
         d.getMonth()    === compareDate.getMonth() &&
         d.getDate()     === compareDate.getDate();
}

function parseKEDate(str) {
  if (!str) return null;
  var parts = str.split("/");
  if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
  return new Date(str);
}

function getRange(preset, customFrom, customTo) {
  var now = new Date(); var today = startOfDay(now);
  if (preset === "today")  return { from: today, to: now };
  if (preset === "week")   { var ws = new Date(today); ws.setDate(today.getDate()-6); return { from: ws, to: now }; }
  if (preset === "month")  { var ms = new Date(today); ms.setDate(today.getDate()-29); return { from: ms, to: now }; }
  if (preset === "custom" && customFrom && customTo) { var cf = new Date(customFrom); var ct = new Date(customTo); ct.setHours(23,59,59,999); return { from: cf, to: ct }; }
  return { from: today, to: now };
}

function filterByRange(items, range, dateField) {
  dateField = dateField || "date";
  return items.filter(function(s) {
    var raw = s[dateField];
    if (!raw) return false;
    var d = raw.includes("/") ? parseKEDate(raw) : new Date(raw);
    if (!d) return false;
    return d >= range.from && d <= range.to;
  });
}

export default function Dashboard({ sales, customers, staffList, products, feedbacks, expenses, darkMode }) {
  expenses = expenses || [];

  var presetState = useState("today"); var preset = presetState[0]; var setPreset = presetState[1];
  var customFromState = useState(""); var customFrom = customFromState[0]; var setCustomFrom = customFromState[1];
  var customToState = useState(""); var customTo = customToState[0]; var setCustomTo = customToState[1];
  var showCustomState = useState(false); var showCustom = showCustomState[0]; var setShowCustom = showCustomState[1];

  var CARD    = darkMode ? "#1A1400" : WHITE;
  var TEXT    = darkMode ? WHITE     : "#1A1400";
  var BORDER  = darkMode ? GOLD_DIM + "55" : GOLD_DIM + "33";
  var SUBTEXT = darkMode ? "rgba(255,255,255,0.5)" : "#888";
  var TRACK   = darkMode ? "#2C1F00" : "#F5F0E8";

  var range            = getRange(preset, customFrom, customTo);
  var filteredSales    = filterByRange(sales, range, "date");
  var filteredExpenses = filterByRange(expenses, range, "date");

  var totalRevenue    = filteredSales.reduce(function(a,x){ return a+x.total; }, 0);
  var totalExpenses   = filteredExpenses.reduce(function(a,x){ return a+(x.amount||0); }, 0);
  var netProfit       = totalRevenue - totalExpenses;
  var totalCommission = filteredSales.reduce(function(a,x){ return a+(x.commission||0); }, 0);
  var txCount         = filteredSales.length;
  var todaySales      = sales.filter(function(s){ return sameDay(s.date, new Date()); });
  var todayRevenue    = todaySales.reduce(function(a,x){ return a+x.total; }, 0);

  var last7 = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(); d.setDate(d.getDate()-i);
    var str = toKEDate(d);
    var dCopy = new Date(d);
    var ds = sales.filter(function(s){ return sameDay(s.date, dCopy); });
    last7.push({ day:d.toLocaleDateString("en-KE",{weekday:"short"}), date:str, revenue:ds.reduce(function(a,x){ return a+x.total; },0), count:ds.length });
  }
  var maxDayRev = Math.max.apply(null, last7.map(function(d){ return d.revenue; }).concat([1]));

  var svcCount = {};
  filteredSales.forEach(function(s){ if(Array.isArray(s.items)) s.items.filter(function(i){ return i&&i.type==="service"; }).forEach(function(i){ svcCount[i.name]=(svcCount[i.name]||0)+1; }); });
  var topServices = Object.entries(svcCount).sort(function(a,b){ return b[1]-a[1]; }).slice(0,5);
  var maxSvc = topServices.length>0?topServices[0][1]:1;

  var prdCount = {};
  filteredSales.forEach(function(s){ if(Array.isArray(s.items)) s.items.filter(function(i){ return i&&i.type==="product"; }).forEach(function(i){ prdCount[i.name]=(prdCount[i.name]||0)+(i.qty||1); }); });
  var topProducts = Object.entries(prdCount).sort(function(a,b){ return b[1]-a[1]; }).slice(0,3);

  var hourCount = {};
  filteredSales.forEach(function(s){ if(s.time){ var h=parseInt(s.time.split(":")[0]); hourCount[h]=(hourCount[h]||0)+1; } });
  var peakHours = Object.entries(hourCount).sort(function(a,b){ return b[1]-a[1]; }).slice(0,4).map(function(e){ return {label:e[0]+":00",count:e[1]}; });

  var mpesa  = filteredSales.filter(function(s){ return s.payment==="M-Pesa"; }).reduce(function(a,x){ return a+x.total; },0);
  var cash   = filteredSales.filter(function(s){ return s.payment==="Cash"; }).reduce(function(a,x){ return a+x.total; },0);
  var allPay = mpesa+cash||1;

  var staffStats = staffList.map(function(st){ var my=filteredSales.filter(function(s){ return s.stylist===st.name; }); return Object.assign({},st,{ salesCount:my.length, revenue:my.reduce(function(a,x){ return a+x.total; },0), commission:my.reduce(function(a,x){ return a+(x.commission||0); },0) }); });
  var sortedStaff = staffStats.slice().sort(function(a,b){ return b.revenue-a.revenue; });
  var maxStaffRev = sortedStaff.length>0?(sortedStaff[0].revenue||1):1;

  var newThisWeek = customers.filter(function(c){ if(!c.created_at) return false; return (new Date()-new Date(c.created_at))/(1000*60*60*24)<=7; }).length;
  var avgRating   = feedbacks.length?(feedbacks.reduce(function(s,f){ return s+f.rating; },0)/feedbacks.length).toFixed(1):"—";
  var lowStock    = products.filter(function(p){ return p.stock<=5; });
  var atRisk      = customers.filter(function(c){ if(!c.last_visit) return false; return (new Date()-new Date(c.last_visit))/(1000*60*60*24)>=28; });

  var segments = [
    { label:"Active",  color:GREEN,     value:customers.filter(function(c){ if(!c.last_visit) return false; return (new Date()-new Date(c.last_visit))/(1000*60*60*24)<=14; }).length },
    { label:"Warm",    color:AMBER,     value:customers.filter(function(c){ if(!c.last_visit) return false; var d=(new Date()-new Date(c.last_visit))/(1000*60*60*24); return d>14&&d<=27; }).length },
    { label:"Due",     color:"#EA580C", value:customers.filter(function(c){ if(!c.last_visit) return false; var d=(new Date()-new Date(c.last_visit))/(1000*60*60*24); return d>=28&&d<=44; }).length },
    { label:"At Risk", color:RED,       value:atRisk.filter(function(c){ return (new Date()-new Date(c.last_visit))/(1000*60*60*24)>44; }).length },
  ];

  var rangeLabels = { today:"Today", week:"Last 7 Days", month:"Last 30 Days", custom:"Custom Range" };
  var rangeLabel  = rangeLabels[preset]||"Today";

  function Card(props){ return <div style={Object.assign({ background:CARD, borderRadius:14, padding:16, marginBottom:12, border:"1px solid "+BORDER },props.style||{})}>{props.children}</div>; }
  function CardTitle(props){ return <div style={{ fontWeight:800, fontSize:14, color:TEXT, marginBottom:12 }}>{props.children}</div>; }

  var presets = [{ id:"today",label:"Today" },{ id:"week",label:"This Week" },{ id:"month",label:"This Month" },{ id:"custom",label:"Custom" }];

  return (
    <div>
      {/* Sticky Filter Bar */}
      <div style={{ position:"sticky", top:0, zIndex:50, background:darkMode?"#0A0A0A":CREAM, paddingBottom:12, marginBottom:4, borderBottom:"1px solid "+BORDER }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:2, flex:1 }}>
            {presets.map(function(p){
              var isActive=preset===p.id;
              return <button key={p.id} onClick={function(){ setPreset(p.id); setShowCustom(p.id==="custom"); }} style={{ padding:"7px 14px", borderRadius:20, border:"1.5px solid "+(isActive?GOLD:GOLD_DIM+"66"), background:isActive?"linear-gradient(135deg,"+GOLD+","+GOLD_LT+")":"transparent", color:isActive?BLACK:TEXT, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>{p.label}</button>;
            })}
          </div>
          <ExportButton sales={filteredSales} staffList={staffList} rangeLabel={rangeLabel} />
        </div>
        {showCustom && (
          <div style={{ display:"flex", gap:8, marginTop:10, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:140 }}>
              <span style={{ fontSize:11, color:SUBTEXT, whiteSpace:"nowrap" }}>From</span>
              <input type="date" value={customFrom} onChange={function(e){ setCustomFrom(e.target.value); }} style={{ flex:1, borderRadius:8, border:"1.5px solid "+GOLD_DIM, padding:"6px 10px", fontSize:12, fontFamily:"inherit", outline:"none", background:CARD, color:TEXT }} />
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:140 }}>
              <span style={{ fontSize:11, color:SUBTEXT, whiteSpace:"nowrap" }}>To</span>
              <input type="date" value={customTo} onChange={function(e){ setCustomTo(e.target.value); }} style={{ flex:1, borderRadius:8, border:"1.5px solid "+GOLD_DIM, padding:"6px 10px", fontSize:12, fontFamily:"inherit", outline:"none", background:CARD, color:TEXT }} />
            </div>
          </div>
        )}
        <div style={{ fontSize:11, color:SUBTEXT, marginTop:8 }}>
          Showing: <b style={{ color:TEXT }}>{rangeLabel}</b>
          {filteredSales.length>0?" · "+filteredSales.length+" sale"+(filteredSales.length!==1?"s":""):" · No sales in this period"}
        </div>
      </div>

      {/* ── Profit Headline ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
        <div style={{ background:"linear-gradient(135deg,"+BLACK+",#2C1F00)", borderRadius:14, padding:14, border:"1px solid "+GOLD_DIM, textAlign:"center" }}>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.5)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Revenue</div>
          <div style={{ fontSize:20, fontWeight:900, color:GOLD_LT }}>{fmt(totalRevenue)}</div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:2 }}>{txCount} sales</div>
        </div>
        <div style={{ background:"linear-gradient(135deg,#450A0A,#7F1D1D)", borderRadius:14, padding:14, border:"1px solid "+RED+"66", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.5)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Expenses</div>
          <div style={{ fontSize:20, fontWeight:900, color:"#FCA5A5" }}>{fmt(totalExpenses)}</div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:2 }}>{filteredExpenses.length} entries</div>
        </div>
        <div style={{ background:netProfit>=0?"linear-gradient(135deg,#052E16,#14532D)":"linear-gradient(135deg,#450A0A,#7F1D1D)", borderRadius:14, padding:14, border:"1px solid "+(netProfit>=0?GREEN+"66":RED+"66"), textAlign:"center" }}>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.5)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Net Profit</div>
          <div style={{ fontSize:20, fontWeight:900, color:netProfit>=0?"#86EFAC":"#FCA5A5" }}>{fmt(Math.abs(netProfit))}</div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:2 }}>{netProfit>=0?"▲ Profit":"▼ Loss"}</div>
        </div>
      </div>

      {/* End-of-Day Summary button */}
      <div style={{ marginBottom:12 }}>
        <EndOfDaySummary sales={sales} expenses={expenses} staffList={staffList} customers={customers} />
      </div>

      {/* KPI Grid */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
        {[
          { label:"Commission",       value:fmt(totalCommission), icon:"👩‍💼", color:GREEN     },
          { label:"Transactions",     value:txCount,              icon:"🧾", color:GOLD      },
          { label:"New Clients (7d)", value:newThisWeek,          icon:"👤", color:"#0EA5E9" },
          { label:"Total Clients",    value:customers.length,     icon:"👥", color:GOLD_DIM  },
          { label:"Avg. Rating",      value:avgRating+"★",        icon:"⭐", color:AMBER     },
          { label:"Low Stock Items",  value:lowStock.length,      icon:"📦", color:lowStock.length>0?RED:GREEN },
        ].map(function(s,i){
          return (
            <div key={i} style={{ background:CARD, borderRadius:12, padding:"12px 14px", borderLeft:"4px solid "+s.color }}>
              <div style={{ fontSize:18 }}>{s.icon}</div>
              <div style={{ fontSize:10, color:SUBTEXT, fontWeight:700, marginTop:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>{s.label}</div>
              <div style={{ fontSize:17, fontWeight:900, color:TEXT, marginTop:2 }}>{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* 7-Day Chart */}
      <Card>
        <CardTitle>Revenue Trend — Last 7 Days</CardTitle>
        <div style={{ fontSize:11, color:SUBTEXT, marginBottom:14 }}>Total: {fmt(last7.reduce(function(a,d){ return a+d.revenue; },0))}</div>
        {sales.length===0?(
          <div style={{ textAlign:"center", padding:"20px 0", color:SUBTEXT, fontSize:13 }}>Complete sales to see your chart</div>
        ):(
          <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:100, marginBottom:6 }}>
            {last7.map(function(d,i){
              var isToday=sameDay(d.date, new Date());
              return (
                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                  <div style={{ fontSize:8, color:GOLD_DIM, fontWeight:700, minHeight:12 }}>{d.revenue>0?Math.round(d.revenue/1000)+"k":""}</div>
                  <div style={{ width:"100%", borderRadius:"4px 4px 0 0", background:isToday?"linear-gradient(180deg,"+GOLD_LT+","+GOLD+")":"linear-gradient(180deg,"+GOLD_DIM+"66,"+GOLD_DIM+"33)", height:Math.max(4,(d.revenue/maxDayRev)*76)+"px", transition:"height 0.5s ease", position:"relative" }}>
                    {isToday&&<div style={{ position:"absolute", top:-16, left:"50%", transform:"translateX(-50%)", fontSize:8, color:GOLD_LT, fontWeight:800, whiteSpace:"nowrap" }}>TODAY</div>}
                  </div>
                  <div style={{ fontSize:9, color:SUBTEXT, fontWeight:600 }}>{d.day}</div>
                  <div style={{ fontSize:8, color:SUBTEXT }}>{d.count}tx</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Staff Performance */}
      <Card>
        <CardTitle>Staff Performance · {rangeLabel}</CardTitle>
        {sortedStaff.length===0||filteredSales.length===0?(
          <div style={{ fontSize:12, color:SUBTEXT, textAlign:"center", padding:"10px 0" }}>No sales in this period</div>
        ):sortedStaff.filter(function(s){ return s.revenue>0; }).map(function(s,i){
          return (
            <div key={s.id} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:22, height:22, borderRadius:"50%", background:i===0?"linear-gradient(135deg,"+GOLD+","+GOLD_LT+")":CREAM, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:900, color:i===0?BLACK:GOLD_DIM, flexShrink:0 }}>{i+1}</div>
                  <span style={{ fontSize:13, fontWeight:700, color:TEXT }}>{s.name}</span>
                  <span style={{ fontSize:10, color:SUBTEXT }}>{s.salesCount} sales</span>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:12, fontWeight:800, color:GOLD_DIM }}>{fmt(s.revenue)}</div>
                  <div style={{ fontSize:10, color:SUBTEXT }}>comm: {fmt(s.commission)}</div>
                </div>
              </div>
              <div style={{ background:TRACK, borderRadius:20, height:8, overflow:"hidden" }}>
                <div style={{ width:((s.revenue/maxStaffRev)*100)+"%", height:"100%", borderRadius:20, background:i===0?"linear-gradient(90deg,"+GOLD+","+GOLD_LT+")":GOLD_DIM+"88", transition:"width 0.5s" }} />
              </div>
            </div>
          );
        })}
      </Card>

      {/* Top Services + Products */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
        <div style={{ background:CARD, borderRadius:14, padding:14, border:"1px solid "+BORDER }}>
          <div style={{ fontWeight:800, fontSize:13, color:TEXT, marginBottom:10 }}>Top Services</div>
          {topServices.length===0?<div style={{ fontSize:12, color:SUBTEXT, textAlign:"center", padding:"10px 0" }}>No data</div>:
            topServices.map(function(e,i){ return (
              <div key={i} style={{ marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:11, color:TEXT, fontWeight:600, lineHeight:1.3 }}>{e[0]}</span>
                  <span style={{ fontSize:11, fontWeight:800, color:GOLD_DIM, flexShrink:0, marginLeft:4 }}>{e[1]}x</span>
                </div>
                <div style={{ background:TRACK, borderRadius:20, height:5 }}><div style={{ width:((e[1]/maxSvc)*100)+"%", height:"100%", borderRadius:20, background:"linear-gradient(90deg,"+GOLD+","+GOLD_LT+")" }} /></div>
              </div>
            ); })
          }
        </div>
        <div style={{ background:CARD, borderRadius:14, padding:14, border:"1px solid "+BORDER }}>
          <div style={{ fontWeight:800, fontSize:13, color:TEXT, marginBottom:10 }}>Top Products</div>
          {topProducts.length===0?<div style={{ fontSize:12, color:SUBTEXT, textAlign:"center", padding:"10px 0" }}>No data</div>:
            topProducts.map(function(e,i){ return (
              <div key={i} style={{ marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:11, color:TEXT, fontWeight:600 }}>{e[0]}</span>
                <span style={{ fontSize:11, fontWeight:800, color:GREEN }}>{e[1]} sold</span>
              </div>
            ); })
          }
          {lowStock.length>0&&(
            <div style={{ marginTop:10, borderTop:"1px solid "+BORDER, paddingTop:8 }}>
              <div style={{ fontSize:10, color:RED, fontWeight:800, marginBottom:4 }}>Low Stock</div>
              {lowStock.slice(0,3).map(function(p){ return <div key={p.id} style={{ fontSize:10, color:SUBTEXT, marginBottom:2 }}>{p.name}: {p.stock} left</div>; })}
            </div>
          )}
        </div>
      </div>

      {/* Peak Hours + Payments */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
        <div style={{ background:CARD, borderRadius:14, padding:14, border:"1px solid "+BORDER }}>
          <div style={{ fontWeight:800, fontSize:13, color:TEXT, marginBottom:10 }}>Peak Hours</div>
          {peakHours.length===0?<div style={{ fontSize:12, color:SUBTEXT, textAlign:"center", padding:"10px 0" }}>No data</div>:
            peakHours.map(function(h,i){ return (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, padding:"6px 8px", borderRadius:8, background:i===0?"linear-gradient(135deg,"+BLACK+",#2C1F00)":"transparent", border:i===0?"1px solid "+GOLD_DIM:"none" }}>
                <span style={{ fontSize:12, fontWeight:700, color:i===0?GOLD_LT:TEXT }}>{h.label}</span>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ fontSize:11, color:i===0?GOLD:SUBTEXT }}>{h.count} sales</span>
                  {i===0&&<span style={{ fontSize:9, color:GOLD, fontWeight:800 }}>PEAK</span>}
                </div>
              </div>
            ); })
          }
        </div>
        <div style={{ background:CARD, borderRadius:14, padding:14, border:"1px solid "+BORDER }}>
          <div style={{ fontWeight:800, fontSize:13, color:TEXT, marginBottom:10 }}>Payments</div>
          {[{ label:"M-Pesa", value:mpesa, pct:Math.round(mpesa/allPay*100), color:GREEN },{ label:"Cash", value:cash, pct:Math.round(cash/allPay*100), color:GOLD_DIM }].map(function(p,i){ return (
            <div key={i} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                <span style={{ fontSize:11, fontWeight:700, color:TEXT }}>{p.label}</span>
                <span style={{ fontSize:11, fontWeight:800, color:p.color }}>{p.pct}%</span>
              </div>
              <div style={{ background:TRACK, borderRadius:20, height:8 }}><div style={{ width:p.pct+"%", height:"100%", borderRadius:20, background:p.color }} /></div>
              <div style={{ fontSize:10, color:SUBTEXT, marginTop:2 }}>{fmt(p.value)}</div>
            </div>
          ); })}
        </div>
      </div>

      {/* Customer Intelligence */}
      <Card>
        <CardTitle>Customer Intelligence</CardTitle>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8 }}>
          {segments.map(function(s,i){ return (
            <div key={i} style={{ textAlign:"center", padding:"10px 6px", borderRadius:10, background:darkMode?"#1A1400":CREAM, border:"1.5px solid "+s.color+"44" }}>
              <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:10, color:SUBTEXT, fontWeight:700, marginTop:2 }}>{s.label}</div>
            </div>
          ); })}
        </div>
      </Card>

    </div>
  );
}
