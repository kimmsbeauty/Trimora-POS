// src/components/AutoReceipt.jsx
//
// Auto's own receipt, not a reuse of POS's Receipt.jsx. Two real
// reasons it needed to be separate rather than shared:
// - Different theme entirely (Auto's dark INK/STEEL/SIGNAL palette vs
//   POS's gold/black/cream) -- Receipt.jsx is built with POS's
//   constants.js colors baked in throughout, not parameterized.
// - Different data shape -- POS's sale.items is a jsonb array with a
//   service/product type split and possible multi-stylist commission
//   splits; Auto's line items come from the real auto_job_services join
//   table (one row per service, price snapshotted at add-time), and
//   there are no products on a job.
//
// Feature-parity item #8: shows a per-line "attended by" when different
// staff worked different services on the same job (falls back to the
// job's overall assigned staff when a line has no override), and a
// subtotal/discount/total breakdown when a discount was applied.
//
// Deliberately does NOT show commission or commission percentage --
// that's internal staff-facing data (visible in Reports), not
// something a customer receipt should ever display. Matches POS's own
// Receipt.jsx, which shows the stylist's name but never their
// commission.
//
// SalonBrandmark is reused as-is: it's already generic (salon
// name/tagline/logo, no POS-specific styling baked in).

import SalonBrandmark from "./SalonBrandmark";
import LoyaltyBadge from "./LoyaltyBadge";
import { INK, STEEL, CHROME, SIGNAL, PAPER } from "../pages/auto/theme";

function money(n) {
  return "KSh " + (n || 0).toLocaleString();
}

function buildWhatsAppMessage(salon, job, lineItems, staffMember, dateLabel, vehicleLabel) {
  var showStaff = !(salon && salon.receipt_show_staff === false);
  var showVehicle = !(salon && salon.receipt_show_vehicle === false);
  var lines = [];
  lines.push("🧾 *" + (salon && salon.name ? salon.name : "Trimora Auto") + " — Receipt*");
  lines.push(dateLabel);
  lines.push("");
  if (showVehicle && vehicleLabel) lines.push("🚗 " + vehicleLabel);
  if (showStaff && staffMember) lines.push("👤 Attended by: " + staffMember.name);
  lines.push("");
  lineItems.forEach(function (li) {
    var name = (li.auto_services && li.auto_services.name) || "Service";
    lines.push(name + " — " + money(li.price));
  });
  lines.push("");
  if (job.discount_amount > 0) {
    lines.push("Subtotal: " + money(job.total_price));
    lines.push("Discount: −" + money(job.discount_amount));
  }
  var finalTotal = (job.total_price || 0) - (job.discount_amount || 0);
  lines.push("*TOTAL: " + money(finalTotal) + "*");
  if (salon && salon.tax_enabled) {
    var rate = salon.tax_rate || 0;
    var vat = finalTotal - Math.round(finalTotal / (1 + rate / 100));
    lines.push("(Incl. VAT " + rate + "%: " + money(vat) + ")");
  }
  lines.push(job.payment_status === "paid" ? "Paid via " + (job.payment_method || "—") : "Payment not yet collected");
  if (salon && salon.receipt_footer_message) {
    lines.push("");
    lines.push("_" + salon.receipt_footer_message + "_");
  }
  return lines.join("\n");
}

export default function AutoReceipt({ salon, job, jobServices, staffById, onClose, onSendFeedback, onInPersonFeedback }) {
  var vehicle = job.auto_vehicles || {};
  var customer = job.customers || {};
  var staffMember = staffById ? staffById[job.assigned_staff_id] : null;
  var lineItems = (jobServices || []).filter(function (js) { return js.job_id === job.id; });

  var completedDate = job.completed_at ? new Date(job.completed_at) : null;
  var dateLabel = completedDate
    ? completedDate.toLocaleDateString("en-KE") + " · " + completedDate.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })
    : "";

  var vehicleLabel = [vehicle.reg_number, [vehicle.make, vehicle.model].filter(Boolean).join(" ")]
    .filter(Boolean).join(" · ");

  var isPaid = job.payment_status === "paid";
  var showStaff = !(salon && salon.receipt_show_staff === false);
  var showVehicle = !(salon && salon.receipt_show_vehicle === false);
  var footerMessage = salon && salon.receipt_footer_message;

  // VAT-inclusive: the listed/total price already includes tax, so this
  // is purely an extraction for display -- no change to what's actually
  // charged. finalTotal matches the TOTAL line below exactly.
  var finalTotal = (job.total_price || 0) - (job.discount_amount || 0);
  var taxEnabled = !!(salon && salon.tax_enabled);
  var taxRate = (salon && salon.tax_rate) || 0;
  var netAmount = taxEnabled ? Math.round(finalTotal / (1 + taxRate / 100)) : 0;
  var vatAmount = taxEnabled ? finalTotal - netAmount : 0;

  return (
    <div className="receipt-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: STEEL, borderRadius: 16, padding: 28, width: 340, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", border: "1px solid " + CHROME + "33" }}>

        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <SalonBrandmark salon={salon} size="sm" dark={false} />
          <div style={{ fontSize: 11, color: CHROME, marginTop: 8 }}>Receipt · {dateLabel}</div>
          {taxEnabled && salon && salon.tax_pin && (
            <div style={{ fontSize: 10, color: CHROME, marginTop: 2 }}>KRA PIN: {salon.tax_pin}</div>
          )}
          <div style={{ borderBottom: "2px dashed " + CHROME + "44", margin: "12px 0" }} />
        </div>

        {showVehicle && (
          <div style={{ fontSize: 12, color: CHROME, marginBottom: 4 }}>
            <b style={{ color: PAPER }}>Vehicle:</b> {vehicleLabel || "—"}
          </div>
        )}
        {customer.name && (
          <div style={{ fontSize: 12, color: CHROME, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <b style={{ color: PAPER }}>Customer:</b> {customer.name}
            <LoyaltyBadge customer={customer} size="sm" />
          </div>
        )}
        {showStaff && staffMember && (
          <div style={{ fontSize: 12, color: CHROME, marginBottom: 4 }}>
            <b style={{ color: PAPER }}>Attended by:</b> {staffMember.name}
          </div>
        )}
        <div style={{ borderBottom: "1px solid " + CHROME + "22", margin: "10px 0" }} />

        <div style={{ marginBottom: 8 }}>
          {lineItems.length === 0 ? (
            <div style={{ fontSize: 12, color: CHROME }}>No service line items recorded.</div>
          ) : lineItems.map(function (li, i) {
            var name = (li.auto_services && li.auto_services.name) || "Service";
            var lineStaffName = li.staff && li.staff.name;
            return (
              <div key={i} style={{ marginBottom: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER }}>
                  <span>{name}</span>
                  <span style={{ fontWeight: 700 }}>{money(li.price)}</span>
                </div>
                {showStaff && lineStaffName && lineStaffName !== (staffMember && staffMember.name) && (
                  <div style={{ fontSize: 10, color: CHROME }}>by {lineStaffName}</div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ borderBottom: "1px dashed " + CHROME + "33", margin: "8px 0" }} />
        {job.discount_amount > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: CHROME }}>
              <span>Subtotal</span><span>{money(job.total_price)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: SIGNAL }}>
              <span>Discount</span><span>−{money(job.discount_amount)}</span>
            </div>
          </div>
        )}
        <div style={{ borderBottom: "2px dashed " + CHROME + "44", margin: "10px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 16, color: PAPER }}>
          <span>TOTAL</span><span style={{ color: SIGNAL }}>{money(finalTotal)}</span>
        </div>
        {taxEnabled && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: CHROME, marginTop: 4 }}>
            <span>Incl. VAT ({taxRate}%)</span><span>{money(vatAmount)}</span>
          </div>
        )}

        <div style={{ fontSize: 12, color: CHROME, marginTop: 8 }}>
          <b style={{ color: PAPER }}>Payment:</b>{" "}
          {isPaid ? (job.payment_method || "Paid") : "Not yet collected"}
        </div>

        <div style={{ borderBottom: "1px solid " + CHROME + "22", margin: "12px 0" }} />

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={function () { window.print(); }} style={{
            flex: 1, background: "transparent", border: "1.5px solid " + SIGNAL, borderRadius: 10,
            padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", color: SIGNAL,
          }}>
            🖨️ Print
          </button>
          <button onClick={onClose} style={{
            flex: 1, background: SIGNAL, border: "none", borderRadius: 10,
            padding: "11px 0", fontWeight: 800, fontSize: 13, cursor: "pointer", color: INK,
          }}>
            Close
          </button>
        </div>

        {customer.phone && (
          <a
            href={"https://wa.me/254" + customer.phone.replace(/^0/, "").replace(/\D/g, "") +
              "?text=" + encodeURIComponent(buildWhatsAppMessage(salon, job, lineItems, staffMember, dateLabel, vehicleLabel))}
            target="_blank" rel="noreferrer"
            style={{
              display: "block", width: "100%", boxSizing: "border-box", marginTop: 8,
              background: "#25D366", color: "#fff", borderRadius: 10, padding: "11px 0",
              fontWeight: 800, fontSize: 13, textDecoration: "none", textAlign: "center",
            }}
          >
            📲 Share via WhatsApp
          </a>
        )}

        {job.feedback_token && (onSendFeedback || onInPersonFeedback) && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {onSendFeedback && (
              <button onClick={onSendFeedback} style={{
                flex: 1, background: "transparent", border: "1px solid " + CHROME + "55", borderRadius: 10,
                padding: "9px 0", fontWeight: 700, fontSize: 12, cursor: "pointer", color: CHROME,
              }}>
                💬 Send Feedback Link
              </button>
            )}
            {onInPersonFeedback && (
              <button onClick={onInPersonFeedback} style={{
                flex: 1, background: "transparent", border: "1px solid " + CHROME + "55", borderRadius: 10,
                padding: "9px 0", fontWeight: 700, fontSize: 12, cursor: "pointer", color: CHROME,
              }}>
                ⭐ Rate Now
              </button>
            )}
          </div>
        )}

        {footerMessage && (
          <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: PAPER, fontStyle: "italic" }}>
            {footerMessage}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: footerMessage ? 8 : 16, paddingTop: 12, borderTop: "1px dashed " + CHROME + "33" }}>
          <div style={{ fontSize: 10, color: CHROME, letterSpacing: "0.08em" }}>
            Powered by <span style={{ fontWeight: 900, color: SIGNAL }}>TRIMORA AUTO</span>
          </div>
        </div>

        <style>{`@media print { body * { visibility: hidden; } .receipt-print, .receipt-print * { visibility: visible; } .receipt-print { position: fixed; top: 0; left: 0; width: 100%; background: white !important; } }`}</style>
      </div>
    </div>
  );
}
