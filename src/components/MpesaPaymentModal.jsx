// src/components/MpesaPaymentModal.jsx

import { useState } from "react";
import KimmsLogo from "./KimmsLogo";
import GoldBtn from "./GoldBtn";
import MpesaInstructions from "./MpesaInstructions";
import { WHITE, DARK, GOLD, GOLD_DIM, MPESA_GREEN, GRAY } from "../lib/constants";
import { fmt } from "../lib/utils";

export default function MpesaPaymentModal({ booking, onPaid, onPayLater }) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: WHITE, borderRadius: 20, padding: 28, maxWidth: 360, width: "100%", textAlign: "center", border: `2px solid ${GOLD}` }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#166534", marginBottom: 8 }}>Payment Confirmed!</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 20, lineHeight: 1.7 }}>
            Thank you, <b>{booking.name}</b>!<br />
            Your <b>{booking.service}</b> is fully paid.<br />
            See you on <b>{booking.date} at {booking.time}</b> 💕
          </div>
          <GoldBtn onClick={onPaid} style={{ width: "100%" }}>Done 🎉</GoldBtn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: WHITE, borderRadius: 20, padding: 24, maxWidth: 380, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <KimmsLogo size="sm" dark={true} />
          <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Pay for your booking</div>
        </div>
        <div style={{ background: GRAY, borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, border: `1px solid ${GOLD_DIM}` }}>
          <div style={{ fontWeight: 800, color: DARK, marginBottom: 4 }}>{booking.service}</div>
          <div style={{ color: "#888" }}>📅 {booking.date} at {booking.time} · {booking.stylist}</div>
        </div>
        <MpesaInstructions amount={booking.price} reference={booking.name} />
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => setConfirmed(true)}
            style={{ width: "100%", background: MPESA_GREEN, color: WHITE, border: "none", borderRadius: 12, padding: "13px 0", fontWeight: 900, fontSize: 15, cursor: "pointer" }}
          >
            ✅ I've Sent the Payment
          </button>
          <button
            onClick={onPayLater}
            style={{ width: "100%", background: WHITE, color: "#888", border: `1.5px solid ${GOLD_DIM}`, borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            Pay at the Salon Instead →
          </button>
        </div>
        <div style={{ marginTop: 14, textAlign: "center", fontSize: 11, color: "#bbb", lineHeight: 1.6 }}>
          Your booking is confirmed either way.
        </div>
      </div>
    </div>
  );
}