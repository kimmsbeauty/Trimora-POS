// src/pages/BookingPage.jsx

import { useState, useEffect } from "react";
import KimmsLogo from "../components/KimmsLogo";
import GoldBtn from "../components/GoldBtn";
import MpesaPaymentModal from "../components/MpesaPaymentModal";
import MpesaInstructions from "../components/MpesaInstructions";
import { db } from "../lib/db";
import { fmt, todayStr, nowTime } from "../lib/utils";
import {
  DEFAULT_SERVICES, DEFAULT_STAFF, CATS,
  BLACK, GOLD, GOLD_LT, GOLD_DIM, WHITE, DARK, GREEN, MPESA_GREEN, MPESA_TILL, MPESA_NAME,
} from "../lib/constants";

export default function BookingPage() {
  const [step, setStep]             = useState(1);
  const [sel, setSel]               = useState({ service: null, stylist: null, date: "", time: "", name: "", phone: "" });
  const [done, setDone]             = useState(false);
  const [saving, setSaving]         = useState(false);
  const [showMpesa, setShowMpesa]   = useState(false);
  const [savedBooking, setSavedBooking] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [bookingServices, setBookingServices] = useState(DEFAULT_SERVICES);
  const [bookingStaff, setBookingStaff]       = useState(DEFAULT_STAFF);

  useEffect(() => {
    async function loadBookingData() {
      const [sv, st] = await Promise.all([
        db("GET", "services", null, "?active=eq.true&order=cat.asc,name.asc"),
        db("GET", "staff",    null, "?active=eq.true&order=created_at.asc"),
      ]);
      if (sv && sv.length > 0) setBookingServices(sv);
      if (st && st.length > 0) setBookingStaff(st);
    }
    loadBookingData();
  }, []);

  async function confirm() {
    if (!sel.name || !sel.phone) return alert("Please enter your name and phone number");
    setSaving(true);
    const result = await db("POST", "bookings", {
      name: sel.name, phone: sel.phone,
      service: sel.service?.name, price: sel.service?.price,
      stylist: sel.stylist || "Any available",
      date: sel.date, time: sel.time,
      status: "pending", payment_status: "pending",
    });
    const existing = await db("GET", "customers", null, `?phone=eq.${sel.phone}&limit=1`);
    if (existing && existing.length === 0) {
      await db("POST", "customers", { name: sel.name, phone: sel.phone, visit_count: 0, total_spend: 0, last_visit: sel.date });
    }
    setSaving(false);
    setSavedBooking({ id: result?.[0]?.id, name: sel.name, phone: sel.phone, service: sel.service?.name, price: sel.service?.price, stylist: sel.stylist || "Any available", date: sel.date, time: sel.time });
    setShowMpesa(true);
  }

  async function handlePaid() {
    if (savedBooking?.id) await db("PATCH", "bookings", { payment_status: "paid_upfront" }, `?id=eq.${savedBooking.id}`);
    setPaymentStatus("paid");
    setShowMpesa(false);
    setDone(true);
  }

  async function handlePayLater() {
    if (savedBooking?.id) await db("PATCH", "bookings", { payment_status: "pay_later" }, `?id=eq.${savedBooking.id}`);
    setPaymentStatus("pay_later");
    setShowMpesa(false);
    setDone(true);
  }

  if (showMpesa && savedBooking) {
    return <MpesaPaymentModal booking={savedBooking} onPaid={handlePaid} onPayLater={handlePayLater} />;
  }

  if (done) {
    const waMessage = encodeURIComponent(
      `✂ Kimm's Beauty Parlour\n\nHi ${sel.name}! Your booking is confirmed 💕\n\nService: ${sel.service?.name}\nStylist: ${sel.stylist || "Any available"}\nDate: ${sel.date}\nTime: ${sel.time}\nPrice: KES ${sel.service?.price?.toLocaleString()}\nPayment: ${paymentStatus === "paid" ? "✅ Paid via M-Pesa" : "Pay at salon"}\n\nWe look forward to seeing you!\nFor enquiries: 0113828280`
    );
    return (
      <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,${BLACK} 0%,#1A1400 100%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.05)", border: `1.5px solid ${GOLD_DIM}`, borderRadius: 20, padding: 36, maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{paymentStatus === "paid" ? "💚" : "👑"}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: GOLD_LT, fontFamily: "Georgia,serif", fontStyle: "italic", marginBottom: 8 }}>
            {paymentStatus === "paid" ? "Booked & Paid!" : "You're booked!"}
          </div>
          <div style={{ display: "inline-block", padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 800, marginBottom: 16, background: paymentStatus === "paid" ? "#D1FAE5" : `rgba(201,168,76,0.15)`, color: paymentStatus === "paid" ? "#065F46" : GOLD_LT }}>
            {paymentStatus === "paid" ? "✅ Paid via M-Pesa" : "🕐 Pay at Salon"}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.8, marginBottom: 20 }}>
            <b style={{ color: WHITE }}>{sel.service?.name}</b> with <b style={{ color: WHITE }}>{sel.stylist || "any available stylist"}</b><br />
            📅 {sel.date} at {sel.time}<br />
            💰 KES {sel.service?.price?.toLocaleString()}
          </div>
          {paymentStatus === "pay_later" && (
            <div style={{ background: "rgba(76,175,80,0.1)", border: "1.5px solid #4ADE80", borderRadius: 12, padding: "14px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4ADE80", marginBottom: 8 }}>Want to pay now?</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>Till: <b style={{ color: MPESA_GREEN }}>{MPESA_TILL}</b> · {fmt(sel.service?.price)}</div>
              <button onClick={() => setShowMpesa(true)} style={{ width: "100%", background: MPESA_GREEN, color: WHITE, border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>📱 Pay via M-Pesa</button>
            </div>
          )}
          <a href={`https://wa.me/254113828280?text=${waMessage}`} target="_blank" rel="noreferrer"
            style={{ display: "block", background: "#25D366", color: WHITE, borderRadius: 12, padding: "13px 0", fontWeight: 800, fontSize: 15, textDecoration: "none", marginBottom: 10 }}>
            📲 Confirm via WhatsApp
          </a>
          <button onClick={() => { setSel({ service: null, stylist: null, date: "", time: "", name: "", phone: "" }); setStep(1); setDone(false); setPaymentStatus(null); setSavedBooking(null); }}
            style={{ background: "transparent", border: `1px solid ${GOLD_DIM}`, borderRadius: 10, padding: "10px 24px", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "rgba(255,255,255,0.5)" }}>
            Book another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,${BLACK} 0%,#1A1400 100%)`, paddingBottom: 40 }}>
      <div style={{ background: `linear-gradient(135deg,${BLACK},#2C1F00)`, borderBottom: `2px solid ${GOLD}`, padding: "22px 20px 18px", textAlign: "center" }}>
        <KimmsLogo size="md" dark={false} />
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>Book your appointment</div>
      </div>

      {/* Progress steps */}
      <div style={{ display: "flex", justifyContent: "center", gap: 0, padding: "16px 20px 0" }}>
        {["Service", "Stylist", "Date & Time", "Your Details"].map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: step > i + 1 ? GREEN : step === i + 1 ? GOLD : "rgba(255,255,255,0.1)", color: step === i + 1 ? BLACK : WHITE, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${step >= i + 1 ? GOLD : "rgba(255,255,255,0.2)"}` }}>
              {step > i + 1 ? "✓" : i + 1}
            </div>
            {i < 3 && <div style={{ width: 20, height: 2, background: step > i + 1 ? GOLD : "rgba(255,255,255,0.1)" }} />}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "20px 16px 0" }}>

        {/* Step 1 — Service */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: WHITE, marginBottom: 14 }}>Choose a service</div>
            {CATS.filter(c => c !== "All").map(cat => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_LT, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{cat}</div>
                {bookingServices.filter(s => s.cat === cat).map(s => (
                  <div key={s.id} onClick={() => { setSel(p => ({ ...p, service: s })); setStep(2); }}
                    style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", border: `1.5px solid ${sel.service?.id === s.id ? GOLD : "rgba(255,255,255,0.1)"}` }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: WHITE }}>{s.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: GOLD_LT }}>{fmt(s.price)}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ marginTop: 24, padding: "14px 16px", background: "rgba(255,255,255,0.05)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Can't find what you're looking for?</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>Our team is happy to help you book the right service</div>
              <a href="https://wa.me/254113828280?text=Help%20me%20book%20at%20Kimms%20Beauty%20Parlour" target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#25D366", color: WHITE, borderRadius: 24, padding: "10px 20px", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
                <span style={{ fontSize: 18 }}>💬</span> Chat on WhatsApp
              </a>
            </div>
          </div>
        )}

        {/* Step 2 — Stylist */}
        {step === 2 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: WHITE, marginBottom: 14 }}>Choose your stylist</div>
            {[...bookingStaff, { id: "any", name: "Any available", role: "We'll assign the best match" }].map(s => (
              <div key={s.id} onClick={() => { setSel(p => ({ ...p, stylist: s.name })); setStep(3); }}
                style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 16px", marginBottom: 10, cursor: "pointer", border: `1.5px solid ${sel.stylist === s.name ? GOLD : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg,${BLACK},#2C1F00)`, border: `1.5px solid ${GOLD_DIM}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: GOLD_LT, fontSize: 14, flexShrink: 0 }}>{s.name[0]}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: WHITE }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{s.role}</div>
                </div>
              </div>
            ))}
            <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: GOLD_LT, fontSize: 13, cursor: "pointer", marginTop: 4 }}>← Back</button>
          </div>
        )}

        {/* Step 3 — Date & Time */}
        {step === 3 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: WHITE, marginBottom: 14 }}>Pick a date &amp; time</div>
            <input type="date" value={sel.date} onChange={e => setSel(p => ({ ...p, date: e.target.value }))} min={new Date().toISOString().split("T")[0]}
              style={{ width: "100%", borderRadius: 10, border: `1.5px solid ${GOLD_DIM}`, background: "rgba(255,255,255,0.06)", padding: "11px 14px", fontSize: 14, boxSizing: "border-box", marginBottom: 14, fontFamily: "inherit", outline: "none", color: WHITE }} />
            <div style={{ fontWeight: 700, fontSize: 13, color: WHITE, marginBottom: 10 }}>Available slots</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"].map(t => (
                <button key={t} onClick={() => setSel(p => ({ ...p, time: t }))} style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${sel.time === t ? GOLD : "rgba(255,255,255,0.15)"}`, background: sel.time === t ? `linear-gradient(135deg,${GOLD},${GOLD_LT})` : "rgba(255,255,255,0.05)", color: sel.time === t ? BLACK : WHITE, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t}</button>
              ))}
            </div>
            <GoldBtn onClick={() => { if (!sel.date || !sel.time) return alert("Please select date and time"); setStep(4); }} style={{ width: "100%" }}>Continue →</GoldBtn>
            <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: GOLD_LT, fontSize: 13, cursor: "pointer", marginTop: 8, display: "block" }}>← Back</button>
          </div>
        )}

        {/* Step 4 — Your Details */}
        {step === 4 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: WHITE, marginBottom: 14 }}>Your details</div>
            <div style={{ background: `rgba(201,168,76,0.1)`, border: `1px solid ${GOLD_DIM}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: WHITE }}>
              <b style={{ color: GOLD_LT }}>{sel.service?.name}</b> · {fmt(sel.service?.price)} · {sel.stylist} · {sel.date} at {sel.time}
            </div>
            <input placeholder="Your name" value={sel.name} onChange={e => setSel(p => ({ ...p, name: e.target.value }))}
              style={{ width: "100%", borderRadius: 10, border: `1.5px solid ${GOLD_DIM}`, background: "rgba(255,255,255,0.06)", padding: "11px 14px", fontSize: 14, boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit", outline: "none", color: WHITE }} />
            <input placeholder="Phone number (e.g. 0712345678)" value={sel.phone} onChange={e => setSel(p => ({ ...p, phone: e.target.value }))}
              style={{ width: "100%", borderRadius: 10, border: `1.5px solid ${GOLD_DIM}`, background: "rgba(255,255,255,0.06)", padding: "11px 14px", fontSize: 14, boxSizing: "border-box", marginBottom: 16, fontFamily: "inherit", outline: "none", color: WHITE }} />
            <div style={{ background: "rgba(76,175,80,0.1)", border: "1.5px solid #4ADE80", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#4ADE80", marginBottom: 4 }}>💳 Payment Options</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>📱 <b>Lipa na M-Pesa</b> — Pay upfront or at the salon</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Till: <b style={{ color: MPESA_GREEN }}>{MPESA_TILL}</b> · {MPESA_NAME}</div>
            </div>
            <GoldBtn onClick={confirm} disabled={saving} style={{ width: "100%" }}>{saving ? "Saving..." : "Confirm Booking 👑"}</GoldBtn>
            <button onClick={() => setStep(3)} style={{ background: "none", border: "none", color: GOLD_LT, fontSize: 13, cursor: "pointer", marginTop: 8, display: "block" }}>← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}