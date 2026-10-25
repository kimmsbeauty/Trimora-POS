// src/pages/pet/ReceiptDocument.jsx
//
// A printable receipt for one payment. Carries the same business branding as the invoice
// (logo or business name via PetLetterhead). All figures come from the saved invoice and
// payments (receiptData.js); nothing is recalculated from user input.
import React from "react";
import { fmt } from "../../lib/utils";
import PetLetterhead from "./PetLetterhead";
import { FOREGROUND, MUTED_FG, MUTED, BORDER, CARD, PRIMARY, SUCCESS } from "./theme";
import { METHOD_LABELS } from "./invoiceData";
import { receiptFor } from "./receiptData";

var PRINT_CSS = "@media print { body * { visibility: hidden; } .receipt-print, .receipt-print * { visibility: visible; } " +
  ".receipt-print { position: fixed; top: 0; left: 0; width: 100%; border: none !important; box-shadow: none !important; } }";

function dateTime(iso) {
  var d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function ReceiptDocument({ invoice, paymentId, customer, pet, salon }) {
  var r = receiptFor(invoice, paymentId);
  if (!r) return null;
  var accent = (salon && salon.primary_color) || PRIMARY;
  var p = r.payment;
  var row = { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" };
  return (
    <div className="receipt-print" style={{ background: CARD, color: FOREGROUND, border: "1px solid " + BORDER, borderRadius: 12, padding: 24 }}>
      <style>{PRINT_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", paddingBottom: 14, borderBottom: "3px solid " + accent }}>
        <PetLetterhead salon={salon} showTaxPin={!!invoice.tax_enabled} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.08em" }}>RECEIPT</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{r.number}</div>
          <div style={{ fontSize: 12, color: MUTED_FG }}>{dateTime(p.paid_at)}</div>
        </div>
      </div>

      <div style={{ margin: "14px 0" }}>
        <div style={{ fontSize: 11, color: MUTED_FG, fontWeight: 700 }}>RECEIVED FROM</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{customer ? customer.name : "Customer"}</div>
        {customer && customer.phone ? <div style={{ fontSize: 12, color: MUTED_FG }}>{customer.phone}</div> : null}
        {pet ? <div style={{ fontSize: 12, color: MUTED_FG }}>Pet: {pet.name}{pet.species ? " (" + pet.species + ")" : ""}</div> : null}
      </div>

      <div style={{ background: MUTED, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: MUTED_FG, fontWeight: 700 }}>AMOUNT RECEIVED</div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{fmt(p.amount)}</div>
        <div style={{ fontSize: 12, color: MUTED_FG }}>
          {METHOD_LABELS[p.method] || p.method}{p.reference ? " · " + p.reference : ""}
        </div>
      </div>

      <div style={{ maxWidth: 320 }}>
        <div style={row}><span style={{ color: MUTED_FG }}>For invoice</span><span>{invoice.invoice_number}</span></div>
        <div style={row}><span style={{ color: MUTED_FG }}>Invoice total</span><span>{fmt(invoice.total)}</span></div>
        <div style={row}><span style={{ color: MUTED_FG }}>Paid to date</span><span>{fmt(r.paidToDate)}</span></div>
        <div style={Object.assign({}, row, { fontWeight: 800, borderTop: "1px solid " + BORDER, marginTop: 4, paddingTop: 6, color: r.balanceAfter === 0 ? SUCCESS : FOREGROUND })}>
          <span>{r.balanceAfter === 0 ? "Paid in full" : "Balance remaining"}</span>
          <span>{r.balanceAfter === 0 ? "" : fmt(r.balanceAfter)}</span>
        </div>
      </div>

      <div style={{ marginTop: 18, paddingTop: 10, borderTop: "1px dashed " + BORDER, textAlign: "center", fontSize: 12, color: MUTED_FG }}>
        {salon && salon.receipt_footer_message ? salon.receipt_footer_message : "Thank you for your business."}
      </div>
    </div>
  );
}
