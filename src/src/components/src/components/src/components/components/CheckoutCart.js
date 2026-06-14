import React from "react";

const WHITE = "#FFFFFF";
const DARK = "#1A1400";
const GOLD = "#C9A84C";
const GOLD_LT = "#F0CC6E";
const BLACK = "#0A0A0A";
const GRAY = "#F5F0E8";
const RED = "#EF4444";

function GoldBtn({ children, onClick, style = {}, disabled = false, outline = false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: outline ? "transparent" : `linear-gradient(135deg,${GOLD} 0%,${GOLD_LT} 50%,${GOLD} 100%)`,
      color: outline ? GOLD : BLACK, border: `2px solid ${GOLD}`, borderRadius: 10,
      padding: "12px 0", fontWeight: 900, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1, letterSpacing: "0.04em",
      boxShadow: outline ? "none" : `0 2px 12px rgba(201,168,76,0.35)`, transition: "all 0.2s", ...style
    }}>{children}</button>
  );
}

export default function CheckoutCart({ cart, onRemoveItem, clientName, setClientName, clientPhone, setClientPhone, selectedStylist, setSelectedStylist, staff, paymentMethod, setPaymentMethod, total, onCheckout, processing }) {
  function fmt(n) { return "KES " + Number(n).toLocaleString(); }

  // Grouping duplicate items visually to calculate quantity totals nicely
  const groupedCart = cart.reduce((acc, curr) => {
    const existing = acc.find(item => item.id === curr.id);
    if (existing) { existing.qty += 1; } 
    else { acc.push({ ...curr, qty: 1 }); }
    return acc;
  }, []);

  return (
    <div style={{ width: 340, background: WHITE, borderLeft: "1px solid #EAE5D9", padding: 20, display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
      <div style={{ fontWeight: 900, fontSize: 16, color: DARK, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Current Cart</span>
        <span style={{ fontSize: 12, background: GRAY, padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>{cart.length} service{cart.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Cart Items List */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
        {groupedCart.length === 0 ? (
          <div style={{ textAlign: "center", color: "#aaa", padding: "40px 0", fontSize: 13 }}>Cart is completely empty.<br/>Tap services to add.</div>
        ) : (
          groupedCart.map((item, index) => (
            <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F5F0E8" }}>
              <div style={{ flex: 1, paddingRight: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{fmt(item.price)} {item.qty > 1 ? `× ${item.qty}` : ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: DARK }}>{fmt(item.price * item.qty)}</span>
                <button onClick={() => onRemoveItem(item.id)} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 14, fontWeight: 800 }}>✕</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Checkout Options Inputs */}
      <div style={{ borderTop: "1px solid #EAE5D9", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 800, color: "#8A6F2E", textTransform: "uppercase" }}>Client Phone (Loyalty Sync)</label>
          <input type="text" placeholder="e.g. 0712345678" value={clientPhone} onChange={e => setClientPhone(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #C9A84C", padding: "8px 10px", fontSize: 13, marginTop: 4, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 800, color: "#8A6F2E", textTransform: "uppercase" }}>Client Name</label>
          <input type="text" placeholder="Walk-in Client" value={clientName} onChange={e => setClientName(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #C9A84C", padding: "8px 10px", fontSize: 13, marginTop: 4, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 800, color: "#8A6F2E", textTransform: "uppercase" }}>Stylist Assigned</label>
          <select value={selectedStylist} onChange={e => setSelectedStylist(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #C9A84C", padding: "8px 10px", fontSize: 13, marginTop: 4, background: WHITE }}>
            <option value="">Select Stylist</option>
            {staff.map(s => <option key={s.id} value={s.name}>{s.name} ({s.role})</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 800, color: "#8A6F2E", textTransform: "uppercase" }}>Payment Mode</label>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {["M-Pesa", "Cash"].map(m => (
              <button key={m} onClick={() => setPaymentMethod(m)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, border: `1.5px solid ${paymentMethod === m ? GOLD : "#EAE5D9"}`, background: paymentMethod === m ? `linear-gradient(135deg,${BLACK},#2C1F00)` : WHITE, color: paymentMethod === m ? GOLD_LT : DARK, cursor: "pointer" }}>
                {m === "M-Pesa" ? "📱 M-Pesa" : "💵 Cash"}
              </button>
            ))}
          </div>
        </div>

        {/* Total Summary & Call To Action */}
        <div style={{ background: GRAY, borderRadius: 10, padding: 12, marginTop: 6 }}>
          <div style={{ display: "flex", justifycontent: "space-between", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>Gross Due:</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: DARK }}>{fmt(total)}</span>
          </div>
        </div>

        <GoldBtn onClick={onCheckout} disabled={cart.length === 0 || !selectedStylist || processing} style={{ width: "100%" }}>
          {processing ? "Posting Order..." : "Complete & Print Receipt 🧾"}
        </GoldBtn>
      </div>
    </div>
  );
}
export { GoldBtn };
