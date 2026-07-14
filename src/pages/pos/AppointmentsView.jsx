// src/pages/pos/AppointmentsView.jsx
//
// Extracted from POSApp.jsx (was the `page === "appointments"` inline
// block). Mechanical extraction only — no logic changes. The JSX body
// below was extracted directly from the original file via script (not
// retyped) to guarantee byte-for-byte fidelity. All state (appointments,
// calView, apptDate, showAllAppts, loadingAppts) and handlers
// (loadAppointments, convertToSale, markDone, markCancelled,
// confirmPayment) still live in and are owned by POSApp.jsx; this
// component is purely presentational.

import CalendarView from "../CalendarView.jsx";
import TomorrowReminders from "../../components/TomorrowReminders.jsx";
import BirthdayReminders from "../../components/BirthdayReminders.jsx";
import {
  BLACK, GOLD, GOLD_LT, GOLD_DIM, CREAM, DARK, WHITE,
} from "../../lib/constants.js";

export default function AppointmentsView({
  appointments,
  salonName,
  customers,
  salon,
  appointmentCampaign,
  birthdayCampaign,
  calView,
  setCalView,
  loadAppointments,
  apptDate,
  setApptDate,
  showAllAppts,
  setShowAllAppts,
  visibleAppointments,
  staffList,
  convertToSale,
  markDone,
  markCancelled,
  confirmPayment,
  loadingAppts,
}) {
  return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: DARK }}>Bookings</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={function(){ setCalView(function(v){ return !v; }); }} style={{ background: calView ? "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")" : CREAM, color: calView ? BLACK : GOLD_DIM, border: "1px solid " + GOLD_DIM, borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {calView ? "📋 List" : "📅 Calendar"}
                </button>
                <button onClick={loadAppointments} style={{ background: CREAM, color: GOLD_DIM, border: "1px solid " + GOLD_DIM, borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↻</button>
              </div>
            </div>

            <TomorrowReminders appointments={appointments} salonName={salonName} customers={customers} salon={salon} appointmentCampaign={appointmentCampaign} />

            <BirthdayReminders customers={customers} salonName={salonName} salon={salon} birthdayCampaign={birthdayCampaign} />

            {!calView && (
              <div style={{ background: WHITE, borderRadius: 12, padding: "12px 14px", marginBottom: 14, border: "1px solid " + GOLD_DIM + "44" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 160 }}>
                    <span style={{ fontSize: 11, color: "#888", fontWeight: 700, whiteSpace: "nowrap" }}>📅 Date</span>
                    <input type="date" value={apptDate} onChange={function(e) { setApptDate(e.target.value); setShowAllAppts(false); }} style={{ flex: 1, borderRadius: 8, border: "1.5px solid " + GOLD_DIM, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", color: DARK }} />
                  </div>
                  <button onClick={function() { var t = new Date(); setApptDate(t.getFullYear() + "-" + String(t.getMonth()+1).padStart(2,"0") + "-" + String(t.getDate()).padStart(2,"0")); setShowAllAppts(false); }} style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px solid " + GOLD, background: "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")", color: BLACK, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Today</button>
                  <button onClick={function() { setShowAllAppts(function(v) { return !v; }); }} style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px solid " + (showAllAppts ? GOLD_DIM : GOLD_DIM + "66"), background: showAllAppts ? GOLD_DIM : "transparent", color: showAllAppts ? WHITE : GOLD_DIM, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{showAllAppts ? "Showing All" : "Show All"}</button>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  {[{ label: "Pending", color: "#92400E", bg: "#FEF3C7", status: "pending" }, { label: "Done", color: "#065F46", bg: "#D1FAE5", status: "done" }, { label: "Cancelled", color: "#991B1B", bg: "#FEE2E2", status: "cancelled" }].map(function(s, i) {
                    return <div key={i} style={{ padding: "4px 10px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 800 }}>{s.label}: {visibleAppointments.filter(function(a) { return a.status === s.status; }).length}</div>;
                  })}
                </div>
              </div>
            )}

            {calView && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ background: WHITE, borderRadius: 12, padding: "10px 14px", marginBottom: 10, border: "1px solid " + GOLD_DIM + "44", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, color: "#888", fontWeight: 700, whiteSpace: "nowrap" }}>📅 Date</span>
                  <input type="date" value={apptDate} onChange={function(e) { setApptDate(e.target.value); }} style={{ flex: 1, borderRadius: 8, border: "1.5px solid " + GOLD_DIM, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", color: DARK }} />
                </div>
                <CalendarView
                  appointments={appointments}
                  staffList={staffList}
                  date={apptDate}
                  salonName={salonName}
                  onAction={function(action, a) {
                    if (action === "convert") convertToSale(a);
                    if (action === "done")    markDone(a.id);
                    if (action === "cancel")  markCancelled(a.id);
                  }}
                />
              </div>
            )}

            {!calView && (
              <div>
                {loadingAppts && <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa" }}><div style={{ fontSize: 24 }}>⏳</div><div style={{ fontSize: 13 }}>Loading...</div></div>}
                {!loadingAppts && visibleAppointments.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "#aaa" }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>{showAllAppts ? "No bookings found" : "No bookings for this date"}</div>
                    {!showAllAppts && <button onClick={function() { setShowAllAppts(true); }} style={{ background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 20, padding: "8px 16px", color: GOLD_DIM, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Show all bookings</button>}
                  </div>
                )}
                {!loadingAppts && visibleAppointments.map(function(a) {
                  return (
                    <div key={a.id} style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 10, border: "1.5px solid " + (a.status === "pending" ? GOLD_DIM + "88" : a.status === "done" ? "#BBF7D0" : "#FEE2E2") }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div><div style={{ fontWeight: 800, fontSize: 15, color: DARK }}>{a.name}</div><div style={{ fontSize: 12, color: "#888" }}>📞 {a.phone}</div></div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <div style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: a.status === "pending" ? "#FEF3C7" : a.status === "done" ? "#D1FAE5" : "#FEE2E2", color: a.status === "pending" ? "#92400E" : a.status === "done" ? "#065F46" : "#991B1B" }}>
                            {a.status === "pending" ? "⏳ Pending" : a.status === "done" ? "✅ Done" : "❌ Cancelled"}
                          </div>
                          <div style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: a.payment_status === "paid_upfront" ? "#D1FAE5" : a.payment_status === "awaiting_confirmation" ? "#FEF9C3" : "#FEF3C7", color: a.payment_status === "paid_upfront" ? "#065F46" : a.payment_status === "awaiting_confirmation" ? "#854D0E" : "#92400E" }}>
                            {a.payment_status === "paid_upfront" ? "💚 Paid" : a.payment_status === "awaiting_confirmation" ? "🕓 Confirm Payment" : "🕐 Pay at Salon"}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: DARK, marginBottom: 4 }}>💇 <b>{a.service}</b> {a.price ? "· KES " + Number(a.price).toLocaleString() : ""}</div>
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>👩‍💼 {a.stylist}</div>
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>📅 {a.date} at {a.time}</div>
                      {a.status === "pending" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {a.payment_status === "awaiting_confirmation" && (
                            <button onClick={function() { confirmPayment(a.id); }} style={{ width: "100%", background: "#FEF9C3", color: "#854D0E", border: "1.5px solid #EAB308", borderRadius: 8, padding: "10px 0", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>🕓 Confirm Payment Received (check your M-Pesa)</button>
                          )}
                          <button onClick={function() { convertToSale(a); }} style={{ width: "100%", background: "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")", color: BLACK, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>🛒 Client Arrived — Convert to Sale</button>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={function() { markDone(a.id); }} style={{ flex: 1, background: "#D1FAE5", color: "#065F46", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>✅ Mark Done</button>
                            <button onClick={function() { markCancelled(a.id); }} style={{ flex: 1, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>❌ Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
  );
}
