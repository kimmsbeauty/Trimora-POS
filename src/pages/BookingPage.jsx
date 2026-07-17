// src/pages/BookingPage.jsx

import { useState, useEffect } from "react";
import SalonBrandmark from "../components/SalonBrandmark";
import GoldBtn from "../components/GoldBtn";
import MpesaPaymentModal from "../components/MpesaPaymentModal";
import { db, dbRpc } from "../lib/db";
import { fmt, todayStr, nowTime } from "../lib/utils";
import { useSalon, fetchPublicSalonBranding } from "../lib/SalonContext";
import { lighten, darken } from "../lib/colorUtils";
import {
  CATS,
  BLACK, GOLD, DARK, WHITE, GREEN, MPESA_GREEN,
} from "../lib/constants";

export default function BookingPage() {
  // Only ever rendered at /:slug/booking, inside SalonGate mode="public"
  // (see App.jsx) -- the unprefixed /booking route renders
  // TrimoraLandingPage instead, not this component. contextSalon is
  // therefore always resolved by the time this renders in practice; the
  // legacyBranding fallback below is a defensive no-op kept for safety,
  // not something any current route actually exercises.
  const contextSalon = useSalon();
  const [legacyBranding, setLegacyBranding] = useState(null);

  useEffect(() => {
    if (contextSalon) return;
    let cancelled = false;
    fetchPublicSalonBranding(null).then((result) => {
      if (!cancelled) setLegacyBranding(result);
    });
    return () => { cancelled = true; };
  }, [contextSalon]);

  const salon = contextSalon || legacyBranding;
  const primary    = (salon && salon.primary_color) || GOLD;
  const secondary  = (salon && salon.secondary_color) || DARK;
  const primaryLt  = lighten(primary, 14);
  const primaryDim = darken(primary, 18);
  const bgStop3    = lighten(secondary, 3.5);
  const salonName  = (salon && salon.name) || "your salon";
  const mpesaTill        = (salon && salon.mpesa_till)               || null;
  const mpesaName        = (salon && salon.mpesa_name)               || salonName;
  const mpesaPaybill     = (salon && salon.mpesa_paybill)            || null;
  const mpesaAccount     = (salon && salon.mpesa_account)            || null;
  const mpesaSendMoney   = (salon && salon.mpesa_send_money_phone)   || null;
  const enabledMethods   = (salon && salon.enabled_payment_methods)  || ["Cash", "Till"];
  const contactPhoneRaw  = (salon && salon.contact_phone)            || null;
  // Normalize to international format for WhatsApp links (wa.me requires no + and country code)
  const contactPhone = contactPhoneRaw
    ? contactPhoneRaw.replace(/\s/g, "").replace(/^\+/, "").replace(/^0/, "254")
    : null;

  // Derive which payment methods are actually configured for this salon
  const hasTill      = enabledMethods.includes("Till")      && !!mpesaTill;
  const hasPaybill   = enabledMethods.includes("Paybill")   && !!mpesaPaybill;
  const hasSendMoney = enabledMethods.includes("Send Money") && !!mpesaSendMoney;
  const hasCash      = enabledMethods.includes("Cash");

  const [step, setStep]             = useState(1);
  const [sel, setSel]               = useState({ service: null, stylist: null, date: "", time: "", name: "", phone: "" });
  const [done, setDone]             = useState(false);
  const [saving, setSaving]         = useState(false);
  const [showMpesa, setShowMpesa]   = useState(false);
  const [savedBooking, setSavedBooking] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [bookingServices, setBookingServices] = useState([]);
  const [bookingStaff, setBookingStaff]       = useState([]);
  // Same default-then-upgrade pattern as POSApp.jsx: starts as the
  // fixed CATS list so behavior is identical if the fetch is
  // empty/slow/fails, then takes the real per-salon list once loaded.
  const [categories, setCategories] = useState(CATS.filter(c => c !== "All"));

  useEffect(() => {
    async function loadBookingData() {
      // public_staff_directory (the old raw view) is no longer anon-readable
      // -- it had no per-salon scoping built in, so any caller could omit
      // the salon_id filter and enumerate every salon's staff. This calls
      // staff_directory_lookup instead, which requires salon.id as a
      // mandatory RPC argument.
      //
      // services now goes through the same pattern (public_services_lookup),
      // for the identical structural reason -- services_anon_select had no
      // salon_id scoping either, so any caller could bypass the app's own
      // client-side filter and dump every salon's full service catalog and
      // pricing in one unauthenticated call. A prior version of this
      // comment argued services/categories "don't carry that same risk" as
      // staff data and left it unscoped; the product owner disagreed
      // (competitive-intelligence exposure, and inconsistent with staff/
      // bookings being closed the same session for weaker reasoning) --
      // closed here the same way.
      const staffPromise = salon?.id
        ? dbRpc("staff_directory_lookup", { p_salon_id: salon.id })
        : Promise.resolve(null);
      const servicesPromise = salon?.id
        ? dbRpc("public_services_lookup", { p_salon_id: salon.id })
        : Promise.resolve(null);
      const categoriesPromise = salon?.id
        ? dbRpc("public_service_categories_lookup", { p_salon_id: salon.id })
        : Promise.resolve(null);
      const [sv, st, cats] = await Promise.all([
        servicesPromise,
        staffPromise,
        categoriesPromise,
      ]);
      if (Array.isArray(sv)) setBookingServices(sv);
      if (Array.isArray(st)) setBookingStaff(st);
      if (Array.isArray(cats) && cats.length > 0) setCategories(cats.map(c => c.name));
    }
    loadBookingData();
  }, [salon?.id]);

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
    // Uses the public_customer_lookup RPC rather than a direct table SELECT —
    // the booking page is unauthenticated (no staff login), so there's no
    // session for RLS to scope by. The RPC does the same one-phone lookup
    // this flow always needed, without exposing the whole customers table
    // to anyone holding the public anon key.
    //
    // salon.id is expected to always be resolved here: BookingPage only
    // ever renders inside SalonGate (see App.jsx's /:slug/booking route),
    // which blocks rendering its children until a salon is resolved. If
    // that guarantee is ever broken, skip the lookup/create rather than
    // guessing a salon id -- same principle as db.js's tenant resolution.
    if (!salon?.id) {
      console.error(
        "[BookingPage] Refusing customer lookup/create: no resolved salon id. This should " +
        "never happen -- investigate SalonGate before assuming this is safe to ignore."
      );
    } else {
      const existing = await dbRpc("public_customer_lookup", { p_salon_id: salon.id, p_phone: sel.phone });
      if (Array.isArray(existing) && existing.length === 0) {
        await db("POST", "customers", { name: sel.name, phone: sel.phone, visit_count: 0, total_spend: 0, last_visit: sel.date });
      }
    }
    setSaving(false);
    setSavedBooking({ id: result?.[0]?.id, name: sel.name, phone: sel.phone, service: sel.service?.name, price: sel.service?.price, stylist: sel.stylist || "Any available", date: sel.date, time: sel.time });
    setShowMpesa(true);
  }

  async function handlePaid() {
    // This no longer directly confirms payment -- it records the customer's
    // CLAIM that they paid, timestamped, and staff confirm it from the POS
    // app after checking their own M-Pesa SMS/app (see POSApp.jsx's
    // confirmPayment()). claim_booking_payment_status only allows this
    // exact transition (pending -> awaiting_confirmation), never straight
    // to paid_upfront -- that requires an authenticated staff action now.
    // The RPC also requires the caller to know the booking's phone number,
    // closing the old gap where bookings.id's sequential bigint made the
    // row guessable (see migration 049).
    if (savedBooking?.id) {
      await dbRpc("claim_booking_payment_status", {
        p_booking_id: savedBooking.id,
        p_phone: savedBooking.phone,
        p_new_status: "awaiting_confirmation",
      });
    }
    setPaymentStatus("awaiting_confirmation");
    setShowMpesa(false);
    setDone(true);
  }

  async function handlePayLater() {
    if (savedBooking?.id) {
      await dbRpc("claim_booking_payment_status", {
        p_booking_id: savedBooking.id,
        p_phone: savedBooking.phone,
        p_new_status: "pay_later",
      });
    }
    setPaymentStatus("pay_later");
    setShowMpesa(false);
    setDone(true);
  }

  if (showMpesa && savedBooking) {
    return <MpesaPaymentModal salon={salon} booking={savedBooking} onPaid={handlePaid} onPayLater={handlePayLater} />;
  }

  if (done) {
    const waMessage = encodeURIComponent(
      `✂ ${salonName}\n\nHi ${sel.name}! Your booking is confirmed 💕\n\nService: ${sel.service?.name}\nStylist: ${sel.stylist || "Any available"}\nDate: ${sel.date}\nTime: ${sel.time}\nPrice: KES ${sel.service?.price?.toLocaleString()}\nPayment: ${paymentStatus === "awaiting_confirmation" ? "🕓 Confirming your M-Pesa payment" : "Pay at salon"}\n\nWe look forward to seeing you!`
    );

    // Owner notification message — sent TO the salon
    const ownerMessage = encodeURIComponent(
      `📅 New Booking — ${salonName}\n\nClient: ${sel.name}${sel.phone ? " (" + sel.phone + ")" : ""}\nService: ${sel.service?.name}\nStylist: ${sel.stylist || "Any available"}\nDate: ${sel.date} at ${sel.time}\nPrice: KES ${sel.service?.price?.toLocaleString()}\nPayment: ${paymentStatus === "awaiting_confirmation" ? "🕓 Customer claims paid via M-Pesa — please confirm and mark it in the app" : "Pay at salon"}`
    );

    return (
      <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,${BLACK} 0%,${secondary} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.05)", border: `1.5px solid ${primaryDim}`, borderRadius: 20, padding: 36, maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{paymentStatus === "awaiting_confirmation" ? "🕓" : "👑"}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: primaryLt, fontFamily: "Georgia,serif", fontStyle: "italic", marginBottom: 8 }}>
            {paymentStatus === "awaiting_confirmation" ? "You're booked — confirming payment" : "You're booked!"}
          </div>
          <div style={{ display: "inline-block", padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 800, marginBottom: 16, background: paymentStatus === "awaiting_confirmation" ? "rgba(234,179,8,0.15)" : `rgba(201,168,76,0.15)`, color: paymentStatus === "awaiting_confirmation" ? "#CA8A04" : primaryLt }}>
            {paymentStatus === "awaiting_confirmation" ? "🕓 Confirming your payment" : "🕐 Pay at Salon"}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.8, marginBottom: 20 }}>
            <b style={{ color: WHITE }}>{sel.service?.name}</b> with <b style={{ color: WHITE }}>{sel.stylist || "any available stylist"}</b><br />
            📅 {sel.date} at {sel.time}<br />
            💰 KES {sel.service?.price?.toLocaleString()}
          </div>
          {paymentStatus === "pay_later" && (hasTill || hasPaybill || hasSendMoney) && (
            <div style={{ background: "rgba(76,175,80,0.1)", border: "1.5px solid #4ADE80", borderRadius: 12, padding: "14px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4ADE80", marginBottom: 8 }}>Want to pay now?</div>
              {hasTill && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>Till: <b style={{ color: MPESA_GREEN }}>{mpesaTill}</b> · {fmt(sel.service?.price)}</div>}
              {hasPaybill && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>Paybill: <b style={{ color: MPESA_GREEN }}>{mpesaPaybill}</b>{mpesaAccount ? " · Account: " + mpesaAccount : ""} · {fmt(sel.service?.price)}</div>}
              {hasSendMoney && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>Send to: <b style={{ color: MPESA_GREEN }}>{mpesaSendMoney}</b> · {fmt(sel.service?.price)}</div>}
              <button onClick={() => setShowMpesa(true)} style={{ width: "100%", background: MPESA_GREEN, color: WHITE, border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>📱 Pay via M-Pesa</button>
            </div>
          )}
          {contactPhone && <a href={`https://wa.me/${contactPhone}?text=${waMessage}`} target="_blank" rel="noreferrer"
            style={{ display: "block", background: "#25D366", color: WHITE, borderRadius: 12, padding: "13px 0", fontWeight: 800, fontSize: 15, textDecoration: "none", marginBottom: 10 }}>
            📲 Message us on WhatsApp
          </a>}

          {/* Owner notification — opens on salon's phone automatically */}
          {contactPhone && (
            <a href={`https://wa.me/${contactPhone}?text=${ownerMessage}`} target="_blank" rel="noreferrer"
              style={{ display: "block", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", borderRadius: 10, padding: "9px 0", fontWeight: 700, fontSize: 11, textDecoration: "none", marginBottom: 14 }}>
              📩 Send booking details to salon
            </a>
          )}

          <button onClick={() => { setSel({ service: null, stylist: null, date: "", time: "", name: "", phone: "" }); setStep(1); setDone(false); setPaymentStatus(null); setSavedBooking(null); }}
            style={{ background: "transparent", border: `1px solid ${primaryDim}`, borderRadius: 10, padding: "10px 24px", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "rgba(255,255,255,0.5)" }}>
            Book another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,${BLACK} 0%,${secondary} 100%)`, paddingBottom: 40 }}>
      <div style={{ background: `linear-gradient(135deg,${BLACK},${bgStop3})`, borderBottom: `2px solid ${primary}`, padding: "22px 20px 18px", textAlign: "center" }}>
        <SalonBrandmark salon={salon} size="md" />
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>Book your appointment</div>
      </div>

      {/* Progress steps */}
      <div style={{ display: "flex", justifyContent: "center", gap: 0, padding: "16px 20px 0" }}>
        {["Service", "Stylist", "Date & Time", "Your Details"].map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: step > i + 1 ? GREEN : step === i + 1 ? primary : "rgba(255,255,255,0.1)", color: step === i + 1 ? BLACK : WHITE, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${step >= i + 1 ? primary : "rgba(255,255,255,0.2)"}` }}>
              {step > i + 1 ? "✓" : i + 1}
            </div>
            {i < 3 && <div style={{ width: 20, height: 2, background: step > i + 1 ? primary : "rgba(255,255,255,0.1)" }} />}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "20px 16px 0" }}>

        {/* Step 1 — Service */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: WHITE, marginBottom: 14 }}>Choose a service</div>
            {bookingServices.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 20px", background: "rgba(255,255,255,0.05)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✂️</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: WHITE, marginBottom: 6 }}>Services coming soon</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>This salon is still setting up. Chat with us to book directly.</div>
                <a href={`https://wa.me/?text=${encodeURIComponent("I'd like to book at " + salonName)}`} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#25D366", color: WHITE, borderRadius: 24, padding: "10px 20px", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
                  <span style={{ fontSize: 18 }}>💬</span> Chat on WhatsApp
                </a>
              </div>
            ) : categories.map(cat => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: primaryLt, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{cat}</div>
                {bookingServices.filter(s => s.cat === cat).map(s => (
                  <div key={s.id} onClick={() => { setSel(p => ({ ...p, service: s })); setStep(2); }}
                    style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", border: `1.5px solid ${sel.service?.id === s.id ? primary : "rgba(255,255,255,0.1)"}` }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: WHITE }}>{s.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: primaryLt }}>{fmt(s.price)}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ marginTop: 24, padding: "14px 16px", background: "rgba(255,255,255,0.05)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Can't find what you're looking for?</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>Our team is happy to help you book the right service</div>
              {contactPhone && <a href={`https://wa.me/${contactPhone}?text=${encodeURIComponent("Help me book at " + salonName)}`} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#25D366", color: WHITE, borderRadius: 24, padding: "10px 20px", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
                <span style={{ fontSize: 18 }}>💬</span> Chat on WhatsApp
              </a>}
            </div>
          </div>
        )}

        {/* Step 2 — Stylist */}
        {step === 2 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: WHITE, marginBottom: 14 }}>Choose your stylist</div>
            {[...bookingStaff, { id: "any", name: "Any available", role: "We'll assign the best match" }].map(s => (
              <div key={s.id} onClick={() => { setSel(p => ({ ...p, stylist: s.name })); setStep(3); }}
                style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 16px", marginBottom: 10, cursor: "pointer", border: `1.5px solid ${sel.stylist === s.name ? primary : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg,${BLACK},${bgStop3})`, border: `1.5px solid ${primaryDim}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: primaryLt, fontSize: 14, flexShrink: 0 }}>{s.name[0]}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: WHITE }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{s.role}</div>
                </div>
              </div>
            ))}
            <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: primaryLt, fontSize: 13, cursor: "pointer", marginTop: 4 }}>← Back</button>
          </div>
        )}

        {/* Step 3 — Date & Time */}
        {step === 3 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: WHITE, marginBottom: 14 }}>Pick a date &amp; time</div>
            <input type="date" value={sel.date} onChange={e => setSel(p => ({ ...p, date: e.target.value }))} min={new Date().toISOString().split("T")[0]}
              style={{ width: "100%", borderRadius: 10, border: `1.5px solid ${primaryDim}`, background: "rgba(255,255,255,0.06)", padding: "11px 14px", fontSize: 14, boxSizing: "border-box", marginBottom: 14, fontFamily: "inherit", outline: "none", color: WHITE }} />
            <div style={{ fontWeight: 700, fontSize: 13, color: WHITE, marginBottom: 10 }}>Available slots</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"].map(t => (
                <button key={t} onClick={() => setSel(p => ({ ...p, time: t }))} style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${sel.time === t ? primary : "rgba(255,255,255,0.15)"}`, background: sel.time === t ? `linear-gradient(135deg,${primary},${primaryLt})` : "rgba(255,255,255,0.05)", color: sel.time === t ? BLACK : WHITE, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t}</button>
              ))}
            </div>
            <GoldBtn onClick={() => { if (!sel.date || !sel.time) return alert("Please select date and time"); setStep(4); }} style={{ width: "100%" }}>Continue →</GoldBtn>
            <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: primaryLt, fontSize: 13, cursor: "pointer", marginTop: 8, display: "block" }}>← Back</button>
          </div>
        )}

        {/* Step 4 — Your Details */}
        {step === 4 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: WHITE, marginBottom: 14 }}>Your details</div>
            <div style={{ background: `rgba(201,168,76,0.1)`, border: `1px solid ${primaryDim}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: WHITE }}>
              <b style={{ color: primaryLt }}>{sel.service?.name}</b> · {fmt(sel.service?.price)} · {sel.stylist} · {sel.date} at {sel.time}
            </div>
            <input placeholder="Your name" value={sel.name} onChange={e => setSel(p => ({ ...p, name: e.target.value }))}
              style={{ width: "100%", borderRadius: 10, border: `1.5px solid ${primaryDim}`, background: "rgba(255,255,255,0.06)", padding: "11px 14px", fontSize: 14, boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit", outline: "none", color: WHITE }} />
            <input placeholder="Phone number (e.g. 0712345678)" value={sel.phone} onChange={e => setSel(p => ({ ...p, phone: e.target.value }))}
              style={{ width: "100%", borderRadius: 10, border: `1.5px solid ${primaryDim}`, background: "rgba(255,255,255,0.06)", padding: "11px 14px", fontSize: 14, boxSizing: "border-box", marginBottom: 16, fontFamily: "inherit", outline: "none", color: WHITE }} />
            <div style={{ background: "rgba(76,175,80,0.1)", border: "1.5px solid #4ADE80", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#4ADE80", marginBottom: 8 }}>💳 Payment Options</div>

              {/* Buy Goods (Till) — existing flow, preserved exactly */}
              {hasTill && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>📱 Lipa na M-Pesa — Buy Goods</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Till: <b style={{ color: MPESA_GREEN }}>{mpesaTill}</b> · {mpesaName}</div>
                </div>
              )}

              {/* Paybill */}
              {hasPaybill && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>📱 Lipa na M-Pesa — Paybill</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    Paybill: <b style={{ color: MPESA_GREEN }}>{mpesaPaybill}</b>
                    {mpesaAccount && <span> · Account: <b style={{ color: MPESA_GREEN }}>{mpesaAccount}</b></span>}
                  </div>
                </div>
              )}

              {/* Send Money */}
              {hasSendMoney && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>📲 Send Money (Person to Person)</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Send to: <b style={{ color: MPESA_GREEN }}>{mpesaSendMoney}</b></div>
                </div>
              )}

              {/* Cash */}
              {hasCash && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>💵 Cash — Pay at the salon</div>
              )}

              {/* Fallback if nothing configured */}
              {!hasTill && !hasPaybill && !hasSendMoney && !hasCash && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Pay at the salon</div>
              )}
            </div>
            <GoldBtn onClick={confirm} disabled={saving} style={{ width: "100%" }}>{saving ? "Saving..." : "Confirm Booking 👑"}</GoldBtn>
            <button onClick={() => setStep(3)} style={{ background: "none", border: "none", color: primaryLt, fontSize: 13, cursor: "pointer", marginTop: 8, display: "block" }}>← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
