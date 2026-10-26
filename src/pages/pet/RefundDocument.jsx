// src/pages/pet/RefundDocument.jsx
//
// A printable refund receipt (credit note) for one refund (pet_refunds, migration 105). Same business
// branding as the invoice and payment receipts. All figures come from the saved invoice and its
// refunds (receiptData.js); nothing is recalculated from user input.
import React from "react";
import { fmt } from "../../lib/utils";
import PetLetterhead from "./PetLetterhead";
import { FOREGROUND, MUTED_FG, MUTED, BORDER, CARD, PRIMARY } from "./theme";
import { METHOD_LABELS } from "./invoiceData";
import { refundReceiptFor } from "./receiptData";

var PRINT_CSS = "@media print { body * { visibility: hidden; } .refund-print, .refund-print * { visibility: visible; } " +
  ".refund-print { position: fixed; top: 0; left: 0; width: 100%; border: none !important; box-shadow: none !important; } }";

function dateTime(iso) {
  var d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function RefundDocument({ invoice, refundId, customer, pet, salon }) {
  var r = refundReceiptFor(invoice, refundId);
  if (!r) return null;
  var accent = (salon && salon.primary_color) || PRIMARY;
  var f = r.refund;
  var row = { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" };
  return (
    <div className="refund-print" style={{ background: CARD, color: FOREGROUND, border: "1px solid " + BORDER, borderRadius: 12, padding: 24 }}>
      <style>{PRINT_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", paddingBottom: 14, borderBottom: "3px solid " + accent }}>
        <PetLetterhead salon={salon} showTaxPin={!!invoice.tax_enabled} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.08em" }}>REFUND</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{r.number}</div>
          <div style={{ fontSize: 12, color: MUTED_FG }}>{dateTime(f.refunded_at)}</div>
        </div>
      </div>

      <div style={{ margin: "14px 0" }}>
        <div style={{ fontSize: 11, color: MUTED_FG, fontWeight: 700 }}>REFUNDED TO</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{customer ? customer.name : "Customer"}</div>
        {customer && customer.phone ? <div style={{ fontSize: 12, color: MUTED_FG }}>{customer.phone}</div> : null}
        {pet ? <div style={{ fontSize: 12, color: MUTED_FG }}>Pet: {pet.name}{pet.species ? " (" + pet.species + ")" : ""}</div> : null}
      </div>

      <div style={{ background: MUTED, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: MUTED_FG, fontWeight: 700 }}>AMOUNT REFUNDED</div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{fmt(f.amount)}</div>
        <div style={{ fontSize: 12, color: MUTED_FG }}>
          {METHOD_LABELS[f.method] || f.method}{f.reference ? " · " + f.reference : ""}
        </div>
        <div style={{ fontSize: 12, color: MUTED_FG, marginTop: 4 }}>Reason: {f.reason}</div>
      </div>

      <div style={{ maxWidth: 320 }}>
        <div style={row}><span style={{ color: MUTED_FG }}>For invoice</span><span>{invoice.invoice_number}</span></div>
        <div style={row}><span style={{ color: MUTED_FG }}>Invoice total</span><span>{fmt(invoice.total)}</span></div>
        <div style={row}><span style={{ color: MUTED_FG }}>Paid in total</span><span>{fmt(invoice.amount_paid)}</span></div>
        <div style={row}><span style={{ color: MUTED_FG }}>Refunded to date</span><span>{fmt(r.refundedToDate)}</span></div>
        <div style={Object.assign({}, row, { fontWeight: 800, borderTop: "1px solid " + BORDER, marginTop: 4, paddingTop: 6 })}>
          <span>{r.keptAfter === 0 ? "Fully refunded" : "Kept after refunds"}</span>
          <span>{r.keptAfter === 0 ? "" : fmt(r.keptAfter)}</span>
        </div>
      </div>

      <div style={{ marginTop: 18, paddingTop: 10, borderTop: "1px dashed " + BORDER, textAlign: "center", fontSize: 12, color: MUTED_FG }}>
        This is a record of money returned to the customer. It is not a tax invoice.
      </div>
    </div>
  );
}
