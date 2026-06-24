// src/pages/CalendarView.jsx

import { useState } from "react";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, RED, GREEN, AMBER } from "../lib/constants.js";
import { fmt } from "../lib/utils.js";
// src/pages/CalendarView.jsx

import { useState } from "react";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, RED, GREEN, AMBER } from "../lib/constants.js";
import { fmt } from "../lib/utils.js";

var SLOT_HEIGHT = 52;
var START_HOUR  = 8;
var END_HOUR    = 19;

function generateSlots() {
  var slots = [];
  for (var h = START_HOUR; h < END_HOUR; h++) {
    slots.push({ hour: h, min: 0,  label: pad(h) + ":00", key: h + ":00"  });
    slots.push({ hour: h, min: 30, label: pad(h) + ":30", key: h + ":30" });
  }
  return slots;
}

function pad(n) { return String(n).padStart(2, "0"); }

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  var parts = timeStr.split(":");
  return parseInt(parts[0]) * 60 + (parseInt(parts[1]) || 0);
}

function getStatusStyle(status) {
  if (status === "done")      return { bg: "#E5E7EB", border: "#9CA3AF", text: "#6B7280", label: "✅ Done" };
  if (status === "cancelled") return { bg: "#FEE2E2", border: "#FCA5A5", text: "#991B1B", label: "❌" };
  if (status === "confirmed") return { bg: "#D1FAE5", border: "#6EE7B7", text: "#065F46", label: "✅ Confirmed" };
  // pending
  return { bg: "#FEF3C7", border: "#FCD34D", text: "#92400E", label: "⏳ Pending" };
}

export default function CalendarView({ appointments, staffList, date, onAction, salonName }) {
  salonName = salonName || "the salon";
  var slots = generateSlots();
  var selectedApptState = useState(null);
  var selectedAppt = selectedApptState[0]; var setSelectedAppt = selectedApptState[1];

  // Filter appointments for this date
  var dayAppts = appointments.filter(function(a) { return a.date === date && a.status !== "cancelled"; });

  // Active stylists — those with bookings today OR all active staff
  var activeStylists = staffList.length > 0 ? staffList : [{ id: "any", name: "Any" }];

  // Detect double bookings: same stylist, overlapping slots
  function isDoubleBooked(stylist, timeKey) {
  var stylistAppts = dayAppts.filter(function(a) {
      return (a.stylist === stylist || stylist === "Any available") && a.time === timeKey;
    });
    return stylistAppts.length > 1;
  }

  // Get appointment for a stylist at a given time slot
  function getAppt(stylist, timeKey) {
    return dayAppts.filter(function(a) {
      return (a.stylist === stylist.name || a.stylist === "Any available") && a.time === timeKey;
    });
  }

  var COL_W = Math.max(90, Math.floor((window.innerWidth - 64) / (activeStylists.length + 1)));
  COL_W = Math.min(COL_W, 140);

  return (
    <div>
      {/* Quick-action sheet */}
      {selectedAppt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={function() { setSelectedAppt(null); }}>
          <div style={{ background: WHITE, borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 480, borderTop: "3px solid " + GOLD }} onClick={function(e){ e.stopPropagation(); }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: DARK }}>{selectedAppt.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>📞 {selectedAppt.phone}</div>
              </div>
              <button onClick={function(){ setSelectedAppt(null); }} style={{ background: "none", border: "none", fontSize: 22, color: "#aaa", cursor: "pointer", padding: 0 }}>×</button>
            </div>

            <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 2 }}>💇 {selectedAppt.service}</div>
              <div style={{ fontSize: 12, color: "#888" }}>👩‍💼 {selectedAppt.stylist} · 📅 {selectedAppt.date} at {selectedAppt.time}</div>
              {selectedAppt.price && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>💰 KES {Number(selectedAppt.price).toLocaleString()}</div>}
            </div>

            {/* Status badge */}
            {(function(){
              var st = getStatusStyle(selectedAppt.status);
              return <div style={{ display: "inline-block", padding: "5px 12px", borderRadius: 20, background: st.bg, color: st.text, fontSize: 12, fontWeight: 800, marginBottom: 14, border: "1px solid " + st.border }}>{st.label}</div>;
            })()}

            {selectedAppt.status === "pending" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={function(){ onAction("convert", selectedAppt); setSelectedAppt(null); }} style={{ width: "100%", background: "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")", color: BLACK, border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
                  🛒 Client Arrived — Convert to Sale
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={function(){ onAction("done", selectedAppt); setSelectedAppt(null); }} style={{ flex: 1, background: "#D1FAE5", color: "#065F46", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✅ Mark Done</button>
                  <button onClick={function(){ onAction("cancel", selectedAppt); setSelectedAppt(null); }} style={{ flex: 1, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>❌ Cancel</button>
                </div>
                {selectedAppt.phone && (
                  <a href={"https://wa.me/254" + selectedAppt.phone.replace(/^0/,"").replace(/\D/g,"") + "?text=" + encodeURIComponent("Hi " + selectedAppt.name + "! Reminder: you have a " + selectedAppt.service + " appointment today at " + selectedAppt.time + " with " + selectedAppt.stylist + " at " + salonName + ". See you soon! 💕")}
                    target="_blank" rel="noreferrer"
                    style={{ display: "block", width: "100%", background: "#25D366", color: WHITE, borderRadius: 10, padding: "10px 0", fontWeight: 800, fontSize: 13, textDecoration: "none", textAlign: "center", boxSizing: "border-box" }}>
                    📲 Send WhatsApp Reminder
                  </a>
                )}
              </div>
            )}

            {selectedAppt.status === "done" && (
              <div style={{ fontSize: 13, color: "#888", textAlign: "center", padding: "8px 0" }}>This appointment is complete.</div>
            )}
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
        <div style={{ minWidth: (activeStylists.length + 1) * COL_W + "px" }}>

          {/* Header row — stylist names */}
          <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 10, background: WHITE, borderBottom: "2px solid " + GOLD_DIM + "44" }}>
            {/* Time column header */}
            <div style={{ width: 52, flexShrink: 0, padding: "8px 4px", fontSize: 10, color: "#aaa", fontWeight: 700, textAlign: "center", textTransform: "uppercase" }}>Time</div>
            {activeStylists.map(function(st) {
              var hasAppts = dayAppts.filter(function(a){ return a.stylist===st.name || a.stylist==="Any available"; }).length;
              return (
                <div key={st.id} style={{ width: COL_W + "px", flexShrink: 0, padding: "8px 6px", textAlign: "center", borderLeft: "1px solid " + GOLD_DIM + "22" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg," + BLACK + ",#2C1F00)", border: "1.5px solid " + GOLD_DIM, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: GOLD_LT, margin: "0 auto 4px" }}>{st.name[0]}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: DARK, lineHeight: 1.2 }}>{st.name}</div>
                  {hasAppts > 0 && <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>{hasAppts} appt{hasAppts !== 1 ? "s" : ""}</div>}
                </div>
              );
            })}
          </div>

          {/* Time slots */}
          {slots.map(function(slot) {
            var isHour = slot.min === 0;
            return (
              <div key={slot.key} style={{ display: "flex", height: SLOT_HEIGHT + "px", borderBottom: "1px solid " + (isHour ? GOLD_DIM + "22" : "#f0f0f0") }}>
                {/* Time label */}
                <div style={{ width: 52, flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 4 }}>
                  {isHour && <span style={{ fontSize: 10, color: "#aaa", fontWeight: 700 }}>{slot.label}</span>}
                </div>

                {/* Stylist columns */}
                {activeStylists.map(function(st) {
                  var appts = getAppt(st, slot.key);
                  var conflict = appts.length > 1;

                  return (
                    <div key={st.id} style={{ width: COL_W + "px", flexShrink: 0, borderLeft: "1px solid " + GOLD_DIM + "22", padding: "2px 3px", position: "relative", background: conflict ? "#FFF5F5" : "transparent" }}>
                      {conflict && (
                        <div style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, borderRadius: "50%", background: RED, zIndex: 2 }} title="Double booking!" />
                      )}
                      {appts.map(function(a, ai) {
                        var st2 = getStatusStyle(a.status);
                        return (
                          <div key={a.id || ai} onClick={function(){ setSelectedAppt(a); }}
                            style={{ background: st2.bg, border: "1.5px solid " + st2.border, borderRadius: 6, padding: "3px 5px", marginBottom: 2, cursor: "pointer", overflow: "hidden" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: st2.text, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                            <div style={{ fontSize: 9, color: st2.text, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.service}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, padding: "10px 0 2px", flexWrap: "wrap" }}>
        {[
          { label: "Pending",   bg: "#FEF3C7", border: "#FCD34D", text: "#92400E" },
          { label: "Confirmed", bg: "#D1FAE5", border: "#6EE7B7", text: "#065F46" },
          { label: "Done",      bg: "#E5E7EB", border: "#9CA3AF", text: "#6B7280" },
          { label: "Conflict",  bg: "#FEE2E2", border: RED,       text: RED       },
        ].map(function(l, i) {
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: l.bg, border: "1.5px solid " + l.border }} />
              <span style={{ fontSize: 10, color: "#888", fontWeight: 600 }}>{l.label}</span>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: RED }} />
          <span style={{ fontSize: 10, color: RED, fontWeight: 600 }}>Double booked</span>
        </div>
      </div>
    </div>
  );
}

var SLOT_HEIGHT = 52;
var START_HOUR  = 8;
var END_HOUR    = 19;

function generateSlots() {
  var slots = [];
  for (var h = START_HOUR; h < END_HOUR; h++) {
    slots.push({ hour: h, min: 0,  label: pad(h) + ":00", key: h + ":00"  });
    slots.push({ hour: h, min: 30, label: pad(h) + ":30", key: h + ":30" });
  }
  return slots;
}

function pad(n) { return String(n).padStart(2, "0"); }

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  var parts = timeStr.split(":");
  return parseInt(parts[0]) * 60 + (parseInt(parts[1]) || 0);
}

function getStatusStyle(status) {
  if (status === "done")      return { bg: "#E5E7EB", border: "#9CA3AF", text: "#6B7280", label: "✅ Done" };
  if (status === "cancelled") return { bg: "#FEE2E2", border: "#FCA5A5", text: "#991B1B", label: "❌" };
  if (status === "confirmed") return { bg: "#D1FAE5", border: "#6EE7B7", text: "#065F46", label: "✅ Confirmed" };
  // pending
  return { bg: "#FEF3C7", border: "#FCD34D", text: "#92400E", label: "⏳ Pending" };
}

export default function CalendarView({ appointments, staffList, date, onAction }) {
  var slots = generateSlots();
  var selectedApptState = useState(null);
  var selectedAppt = selectedApptState[0]; var setSelectedAppt = selectedApptState[1];

  // Filter appointments for this date
  var dayAppts = appointments.filter(function(a) { return a.date === date && a.status !== "cancelled"; });

  // Active stylists — those with bookings today OR all active staff
  var activeStylists = staffList.length > 0 ? staffList : [{ id: "any", name: "Any" }];

  // Detect double bookings: same stylist, overlapping slots
  function isDoubleBooked(stylist, timeKey) {
  var stylistAppts = dayAppts.filter(function(a) {
      return (a.stylist === stylist || stylist === "Any available") && a.time === timeKey;
    });
    return stylistAppts.length > 1;
  }

  // Get appointment for a stylist at a given time slot
  function getAppt(stylist, timeKey) {
    return dayAppts.filter(function(a) {
      return (a.stylist === stylist.name || a.stylist === "Any available") && a.time === timeKey;
    });
  }

  var COL_W = Math.max(90, Math.floor((window.innerWidth - 64) / (activeStylists.length + 1)));
  COL_W = Math.min(COL_W, 140);

  return (
    <div>
      {/* Quick-action sheet */}
      {selectedAppt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={function() { setSelectedAppt(null); }}>
          <div style={{ background: WHITE, borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 480, borderTop: "3px solid " + GOLD }} onClick={function(e){ e.stopPropagation(); }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: DARK }}>{selectedAppt.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>📞 {selectedAppt.phone}</div>
              </div>
              <button onClick={function(){ setSelectedAppt(null); }} style={{ background: "none", border: "none", fontSize: 22, color: "#aaa", cursor: "pointer", padding: 0 }}>×</button>
            </div>

            <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 2 }}>💇 {selectedAppt.service}</div>
              <div style={{ fontSize: 12, color: "#888" }}>👩‍💼 {selectedAppt.stylist} · 📅 {selectedAppt.date} at {selectedAppt.time}</div>
              {selectedAppt.price && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>💰 KES {Number(selectedAppt.price).toLocaleString()}</div>}
            </div>

            {/* Status badge */}
            {(function(){
              var st = getStatusStyle(selectedAppt.status);
              return <div style={{ display: "inline-block", padding: "5px 12px", borderRadius: 20, background: st.bg, color: st.text, fontSize: 12, fontWeight: 800, marginBottom: 14, border: "1px solid " + st.border }}>{st.label}</div>;
            })()}

            {selectedAppt.status === "pending" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={function(){ onAction("convert", selectedAppt); setSelectedAppt(null); }} style={{ width: "100%", background: "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")", color: BLACK, border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
                  🛒 Client Arrived — Convert to Sale
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={function(){ onAction("done", selectedAppt); setSelectedAppt(null); }} style={{ flex: 1, background: "#D1FAE5", color: "#065F46", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✅ Mark Done</button>
                  <button onClick={function(){ onAction("cancel", selectedAppt); setSelectedAppt(null); }} style={{ flex: 1, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>❌ Cancel</button>
                </div>
                {selectedAppt.phone && (
                  <a href={"https://wa.me/254" + selectedAppt.phone.replace(/^0/,"").replace(/\D/g,"") + "?text=" + encodeURIComponent("Hi " + selectedAppt.name + "! Reminder: you have a " + selectedAppt.service + " appointment today at " + selectedAppt.time + " with " + selectedAppt.stylist + " at Kimm's Beauty Parlour. See you soon! 💕")}
                    target="_blank" rel="noreferrer"
                    style={{ display: "block", width: "100%", background: "#25D366", color: WHITE, borderRadius: 10, padding: "10px 0", fontWeight: 800, fontSize: 13, textDecoration: "none", textAlign: "center", boxSizing: "border-box" }}>
                    📲 Send WhatsApp Reminder
                  </a>
                )}
              </div>
            )}

            {selectedAppt.status === "done" && (
              <div style={{ fontSize: 13, color: "#888", textAlign: "center", padding: "8px 0" }}>This appointment is complete.</div>
            )}
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
        <div style={{ minWidth: (activeStylists.length + 1) * COL_W + "px" }}>

          {/* Header row — stylist names */}
          <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 10, background: WHITE, borderBottom: "2px solid " + GOLD_DIM + "44" }}>
            {/* Time column header */}
            <div style={{ width: 52, flexShrink: 0, padding: "8px 4px", fontSize: 10, color: "#aaa", fontWeight: 700, textAlign: "center", textTransform: "uppercase" }}>Time</div>
            {activeStylists.map(function(st) {
              var hasAppts = dayAppts.filter(function(a){ return a.stylist===st.name || a.stylist==="Any available"; }).length;
              return (
                <div key={st.id} style={{ width: COL_W + "px", flexShrink: 0, padding: "8px 6px", textAlign: "center", borderLeft: "1px solid " + GOLD_DIM + "22" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg," + BLACK + ",#2C1F00)", border: "1.5px solid " + GOLD_DIM, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: GOLD_LT, margin: "0 auto 4px" }}>{st.name[0]}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: DARK, lineHeight: 1.2 }}>{st.name}</div>
                  {hasAppts > 0 && <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>{hasAppts} appt{hasAppts !== 1 ? "s" : ""}</div>}
                </div>
              );
            })}
          </div>

          {/* Time slots */}
          {slots.map(function(slot) {
            var isHour = slot.min === 0;
            return (
              <div key={slot.key} style={{ display: "flex", height: SLOT_HEIGHT + "px", borderBottom: "1px solid " + (isHour ? GOLD_DIM + "22" : "#f0f0f0") }}>
                {/* Time label */}
                <div style={{ width: 52, flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 4 }}>
                  {isHour && <span style={{ fontSize: 10, color: "#aaa", fontWeight: 700 }}>{slot.label}</span>}
                </div>

                {/* Stylist columns */}
                {activeStylists.map(function(st) {
                  var appts = getAppt(st, slot.key);
                  var conflict = appts.length > 1;

                  return (
                    <div key={st.id} style={{ width: COL_W + "px", flexShrink: 0, borderLeft: "1px solid " + GOLD_DIM + "22", padding: "2px 3px", position: "relative", background: conflict ? "#FFF5F5" : "transparent" }}>
                      {conflict && (
                        <div style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, borderRadius: "50%", background: RED, zIndex: 2 }} title="Double booking!" />
                      )}
                      {appts.map(function(a, ai) {
                        var st2 = getStatusStyle(a.status);
                        return (
                          <div key={a.id || ai} onClick={function(){ setSelectedAppt(a); }}
                            style={{ background: st2.bg, border: "1.5px solid " + st2.border, borderRadius: 6, padding: "3px 5px", marginBottom: 2, cursor: "pointer", overflow: "hidden" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: st2.text, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                            <div style={{ fontSize: 9, color: st2.text, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.service}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, padding: "10px 0 2px", flexWrap: "wrap" }}>
        {[
          { label: "Pending",   bg: "#FEF3C7", border: "#FCD34D", text: "#92400E" },
          { label: "Confirmed", bg: "#D1FAE5", border: "#6EE7B7", text: "#065F46" },
          { label: "Done",      bg: "#E5E7EB", border: "#9CA3AF", text: "#6B7280" },
          { label: "Conflict",  bg: "#FEE2E2", border: RED,       text: RED       },
        ].map(function(l, i) {
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: l.bg, border: "1.5px solid " + l.border }} />
              <span style={{ fontSize: 10, color: "#888", fontWeight: 600 }}>{l.label}</span>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: RED }} />
          <span style={{ fontSize: 10, color: RED, fontWeight: 600 }}>Double booked</span>
        </div>
      </div>
    </div>
  );
}
