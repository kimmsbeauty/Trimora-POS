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
//   table (one row per service, price snapshotted at add-time), there
//   are no products on a job, and Auto has no discount concept at all
//   (auto_jobs has no discount column -- decision 7.2, not an oversight).
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
import { INK, STEEL, CHROME, SIGNAL, PAPER } from "../pages/auto/theme";

function money(n) {
  return "KSh " + (n || 0).toLocaleString();
}

export default function AutoReceipt({ salon, job, jobServices, staffById, onClose }) {
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

  return (
    <div className="receipt-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: STEEL, borderRadius: 16, padding: 28, width: 340, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", border: "1px solid " + CHROME + "33" }}>

        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <SalonBrandmark salon={salon} size="sm" dark={false} />
          <div style={{ fontSize: 11, color: CHROME, marginTop: 8 }}>Receipt · {dateLabel}</div>
          <div style={{ borderBottom: "2px dashed " + CHROME + "44", margin: "12px 0" }} />
        </div>

        <div style={{ fontSize: 12, color: CHROME, marginBottom: 4 }}>
          <b style={{ color: PAPER }}>Vehicle:</b> {vehicleLabel || "—"}
        </div>
        {customer.name && (
          <div style={{ fontSize: 12, color: CHROME, marginBottom: 4 }}>
            <b style={{ color: PAPER }}>Customer:</b> {customer.name}
          </div>
        )}
        {staffMember && (
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
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAPER, marginBottom: 5 }}>
                <span>{name}</span>
                <span style={{ fontWeight: 700 }}>{money(li.price)}</span>
              </div>
            );
          })}
        </div>

        <div style={{ borderBottom: "2px dashed " + CHROME + "44", margin: "10px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 16, color: PAPER }}>
          <span>TOTAL</span><span style={{ color: SIGNAL }}>{money(job.total_price)}</span>
        </div>

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
            flex: 2, background: SIGNAL, border: "none", borderRadius: 10,
            padding: "11px 0", fontWeight: 800, fontSize: 13, cursor: "pointer", color: INK,
          }}>
            Close
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, paddingTop: 12, borderTop: "1px dashed " + CHROME + "33" }}>
          <div style={{ fontSize: 10, color: CHROME, letterSpacing: "0.08em" }}>
            Powered by <span style={{ fontWeight: 900, color: SIGNAL }}>TRIMORA AUTO</span>
          </div>
        </div>

        <style>{`@media print { body * { visibility: hidden; } .receipt-print, .receipt-print * { visibility: visible; } .receipt-print { position: fixed; top: 0; left: 0; width: 100%; background: white !important; } }`}</style>
      </div>
    </div>
  );
}
