// src/components/Receipt.jsx

import SalonBrandmark from "./SalonBrandmark";
import GoldBtn from "./GoldBtn";
import MpesaInstructions from "./MpesaInstructions";
import { WHITE, DARK, GOLD, CREAM } from "../lib/constants.js";
import { darken } from "../lib/colorUtils";
import { fmt } from "../lib/utils.js";

export default function Receipt({ salon, sale, onClose, onSendFeedback, canSendThankYou, thankYouStatus, onSendThankYou }) {
  var items        = Array.isArray(sale.items) ? sale.items : [];
  var serviceItems = items.filter(function(i){ return i && i.type === "service"; });
  var productItems = items.filter(function(i){ return i && i.type === "product"; });

  var serviceTotal = sale.service_total != null
    ? sale.service_total
    : serviceItems.reduce(function(s,i){ return s + (i.price||0)*(i.qty||1); }, 0);

  var productTotal = sale.product_total != null
    ? sale.product_total
    : productItems.reduce(function(s,i){ return s + (i.price||0)*(i.qty||1); }, 0);

  var discountAmt    = sale.discount_amount || 0;
  var discountReason = sale.discount_reason || "";
  var discountType   = sale.discount_type || "pct";
  var discountValue  = sale.discount_value || 0;
  var hasBreakdown   = serviceItems.length > 0 && productItems.length > 0;

  // logo_url null → SalonBrandmark falls back to a plain text wordmark.
  // Tagline now comes from real salon data, conditionally rendered —
  // the old hardcoded "Beauty That Speaks Confidence" is gone entirely,
  // including for Kimms, per the no-special-casing decision.
  var tagline    = salon && salon.tagline;
  var primary    = (salon && salon.primary_color) || GOLD;
  var primaryDim = darken(primary, 18);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: WHITE, borderRadius: 16, padding: 28, width: 340, maxHeight: "85vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <SalonBrandmark salon={salon} size="sm" dark={true} />
          <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>Receipt · {sale.date} · {sale.time}</div>
          <div style={{ borderBottom: "2px dashed #ddd", margin: "12px 0" }} />
        </div>

        <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}><b>Client:</b> {sale.client}</div>
        {!sale.is_multi_stylist && (
          <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}><b>Stylist:</b> {sale.stylist}</div>
        )}
        {sale.is_multi_stylist && (
          <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}><b>Stylists:</b> {Object.keys(sale.commission_by_stylist || {}).join(", ") || sale.stylist}</div>
        )}
        <div style={{ borderBottom: "1px solid #eee", margin: "10px 0" }} />

        {/* Services */}
        {serviceItems.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {hasBreakdown && <div style={{ fontSize: 10, fontWeight: 800, color: primaryDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Services</div>}
            {serviceItems.map(function(it, i) {
              if (!it || !it.name) return null;
              var qty = it.qty || 1; var price = it.price || 0;
              return (
                <div key={i} style={{ marginBottom: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span>{it.name}{qty > 1 ? " x" + qty : ""}</span>
                    <span style={{ fontWeight: 700 }}>{fmt(price * qty)}</span>
                  </div>
                  {sale.is_multi_stylist && it.stylist && (
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>by {it.stylist}</div>
                  )}
                </div>
              );
            })}
            {(hasBreakdown || discountAmt > 0) && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginTop: 4, paddingTop: 4, borderTop: "1px solid #f0f0f0" }}>
                <span>Services subtotal</span><span style={{ fontWeight: 700 }}>{fmt(serviceTotal)}</span>
              </div>
            )}
          </div>
        )}

        {/* Discount line */}
        {discountAmt > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#166534", fontWeight: 700, marginBottom: 6, background: "#F0FDF4", borderRadius: 6, padding: "5px 8px" }}>
            <span>🏷️ Discount{discountReason ? " — " + discountReason : ""}{discountType === "pct" ? " (" + discountValue + "%)" : ""}</span>
            <span>- {fmt(discountAmt)}</span>
          </div>
        )}

        {/* Products */}
        {productItems.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {hasBreakdown && <div style={{ fontSize: 10, fontWeight: 800, color: "#0EA5E9", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginTop: 8 }}>Products</div>}
            {productItems.map(function(it, i) {
              if (!it || !it.name) return null;
              var qty = it.qty || 1; var price = it.price || 0;
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                  <span>{it.name}{qty > 1 ? " x" + qty : ""}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(price * qty)}</span>
                </div>
              );
            })}
            {hasBreakdown && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginTop: 4, paddingTop: 4, borderTop: "1px solid #f0f0f0" }}>
                <span>Products subtotal</span><span style={{ fontWeight: 700 }}>{fmt(productTotal)}</span>
              </div>
            )}
          </div>
        )}

        {/* Total */}
        <div style={{ borderBottom: "2px dashed #ddd", margin: "10px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 16, color: DARK }}>
          <span>TOTAL</span><span style={{ color: primaryDim }}>{fmt(sale.total)}</span>
        </div>

        <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}><b>Payment:</b> {sale.payment}</div>

        {sale.payment === "M-Pesa" && (
          <div style={{ marginTop: 14 }}>
            <MpesaInstructions amount={sale.total} reference={sale.client} compact={true} salon={salon} />
          </div>
        )}

        <div style={{ borderBottom: "1px solid #eee", margin: "12px 0" }} />
        {tagline && (
          <div style={{ textAlign: "center", fontSize: 12, color: "#aaa", marginBottom: 16, fontStyle: "italic" }}>
            "{tagline}" 👑
          </div>
        )}

        {sale.feedback_token && onSendFeedback && (
          <button
            onClick={onSendFeedback}
            style={{ width: "100%", background: "#25D366", color: WHITE, border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 800, fontSize: 13, cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <span style={{ fontSize: 16 }}>📱</span> Send Feedback Link via WhatsApp
          </button>
        )}

        {canSendThankYou && onSendThankYou && (
          <button
            onClick={onSendThankYou}
            disabled={thankYouStatus === "sending" || thankYouStatus === "sent"}
            style={{
              width: "100%",
              background: thankYouStatus === "sent" ? "#DCFCE7" : thankYouStatus === "error" ? "#FEE2E2" : primaryDim,
              color: thankYouStatus === "sent" ? "#166534" : thankYouStatus === "error" ? "#991B1B" : WHITE,
              border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 800, fontSize: 13,
              cursor: (thankYouStatus === "sending" || thankYouStatus === "sent") ? "default" : "pointer",
              marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: thankYouStatus === "sending" ? 0.7 : 1,
            }}
          >
            <span style={{ fontSize: 16 }}>
              {thankYouStatus === "sent" ? "✅" : thankYouStatus === "error" ? "⚠️" : "💬"}
            </span>
            {thankYouStatus === "sending" ? "Sending…"
              : thankYouStatus === "sent" ? "Thank-You SMS Sent"
              : thankYouStatus === "error" ? "Failed — Tap to Retry"
              : "Send Thank-You SMS"}
          </button>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={function(){ window.print(); }} style={{ flex: 1, background: CREAM, border: "1.5px solid " + primaryDim, borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", color: primaryDim }}>🖨️ Print</button>
          <GoldBtn onClick={onClose} style={{ flex: 2 }}>Close</GoldBtn>
        </div>

        {/* Trimora branding footer */}
        <div style={{ textAlign: "center", marginTop: 16, paddingTop: 12, borderTop: "1px dashed #ddd" }}>
          <div style={{ fontSize: 10, color: "#bbb", letterSpacing: "0.08em" }}>
            Powered by <span style={{ fontWeight: 900, color: "#C9A84C" }}>TRIMORA POS</span>
          </div>
          <div style={{ fontSize: 9, color: "#ccc", marginTop: 2 }}>trimora-pos.vercel.app</div>
        </div>

        <style>{`@media print { body * { visibility: hidden; } .receipt-print, .receipt-print * { visibility: visible; } .receipt-print { position: fixed; top: 0; left: 0; width: 100%; } }`}</style>
      </div>
    </div>
  );
}
