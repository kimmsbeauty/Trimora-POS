// src/components/MpesaInstructions.jsx

import { MPESA_TILL, MPESA_NAME, MPESA_GREEN, WHITE, DARK } from "../lib/constants";
import { fmt } from "../lib/utils";

export default function MpesaInstructions({ amount, reference, compact = false }) {
  const steps = [
    `Go to M-Pesa on your phone`,
    `Select "Lipa na M-Pesa"`,
    `Select "Buy Goods & Services"`,
    `Enter Till Number: ${MPESA_TILL}`,
    `Enter Amount: KES ${Number(amount).toLocaleString()}`,
    reference ? `Enter Reference: ${reference}` : null,
    `Enter your M-Pesa PIN & confirm`,
  ].filter(Boolean);

  if (compact) {
    return (
      <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>📱</span>
          <span style={{ fontWeight: 800, fontSize: 13, color: "#166534" }}>Lipa na M-Pesa</span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ background: WHITE, borderRadius: 8, padding: "8px 12px", border: "1px solid #BBF7D0", flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase" }}>Till Number</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: MPESA_GREEN }}>{MPESA_TILL}</div>
          </div>
          <div style={{ background: WHITE, borderRadius: 8, padding: "8px 12px", border: "1px solid #BBF7D0", flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase" }}>Amount</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: DARK }}>{fmt(amount)}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#166534", marginTop: 8, fontWeight: 600 }}>{MPESA_NAME}</div>
      </div>
    );
  }

  return (
    <div style={{ background: "#F0FDF4", border: "2px solid #BBF7D0", borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 24 }}>📱</span>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#166534" }}>Lipa na M-Pesa</div>
          <div style={{ fontSize: 12, color: "#4ADE80" }}>Buy Goods &amp; Services</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: WHITE, borderRadius: 12, padding: "14px 16px", border: "2px solid #4ADE80", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Till Number</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: MPESA_GREEN, letterSpacing: "0.12em" }}>{MPESA_TILL}</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{MPESA_NAME}</div>
        </div>
        <div style={{ flex: 1, background: WHITE, borderRadius: 12, padding: "14px 16px", border: "2px solid #4ADE80", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Amount</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: DARK }}>{fmt(amount)}</div>
          {reference && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Ref: {reference}</div>}
        </div>
      </div>
      <div style={{ borderTop: "1px solid #BBF7D0", paddingTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#166534", marginBottom: 10, textTransform: "uppercase" }}>
          How to pay
        </div>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: MPESA_GREEN, color: WHITE, fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ fontSize: 13, color: DARK, paddingTop: 2, lineHeight: 1.4 }}>{step}</div>
          </div>
        ))}
      </div>
    </div>
  );
}