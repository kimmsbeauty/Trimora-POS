// src/pages/pet/InvoiceDocument.jsx
//
// The printable invoice. It always carries the BUSINESS'S OWN branding (PetLetterhead:
// the logo from salon_settings.logo_url, or the business name if there is no logo). Totals, payments
// and the VAT line come from the saved invoice, never recomputed here.
import React from "react";
import PetLetterhead from "./PetLetterhead";
import { fmt } from "../../lib/utils";
import { FOREGROUND, MUTED_FG, MUTED, BORDER, CARD, PRIMARY, DESTRUCTIVE, SUCCESS } from "./theme";
import { METHOD_LABELS, STATUS_LABELS, displayStatus, outstanding } from "./invoiceData";

var PRINT_CSS = "@media print { body * { visibility: hidden; } .invoice-print, .invoice-print * { visibility: visible; } " +
  ".invoice-print { position: fixed; top: 0; left: 0; width: 100%; border: none !important; box-shadow: none !important; } }";

function dateLabel(iso) {
  if (!iso) return "";
  var d = /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) : new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function InvoiceDocument({ invoice, customer, pet, salon }) {
  var accent = (salon && salon.primary_color) || PRIMARY;
  var status = displayStatus(invoice);
  var lines = invoice.pet_invoice_lines || [];
  var payments = (invoice.pet_payments || []).slice().sort(function (a, b) { return new Date(a.paid_at) - new Date(b.paid_at); });
  var isVoid = invoice.status === "void";
  var row = { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" };

  return (
    <div className="invoice-print" style={{ background: CARD, color: FOREGROUND, border: "1px solid " + BORDER, borderRadius: 12, padding: 24, position: "relative" }}>
      <style>{PRINT_CSS}</style>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", paddingBottom: 14, borderBottom: "3px solid " + accent }}>
        <PetLetterhead salon={salon} showTaxPin={!!invoice.tax_enabled} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.08em" }}>INVOICE</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{invoice.invoice_number}</div>
          <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4, color: isVoid || status === "overdue" ? DESTRUCTIVE : status === "paid" ? SUCCESS : MUTED_FG }}>
            {STATUS_LABELS[status].toUpperCase()}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", margin: "14px 0" }}>
        <div>
          <div style={{ fontSize: 11, color: MUTED_FG, fontWeight: 700 }}>BILL TO</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{customer ? customer.name : "Customer"}</div>
          {customer && customer.phone ? <div style={{ fontSize: 12, color: MUTED_FG }}>{customer.phone}</div> : null}
          {pet ? <div style={{ fontSize: 12, color: MUTED_FG }}>Pet: {pet.name}{pet.species ? " (" + pet.species + ")" : ""}</div> : null}
        </div>
        <div style={{ textAlign: "right", fontSize: 12 }}>
          <div><span style={{ color: MUTED_FG }}>Issued:</span> {dateLabel(invoice.issued_at)}</div>
          {invoice.due_date ? <div><span style={{ color: MUTED_FG }}>Due:</span> {dateLabel(invoice.due_date)}</div> : null}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: MUTED, textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Item</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Qty</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Price</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(function (l) {
              return (
                <tr key={l.id} style={{ borderBottom: "1px solid " + BORDER }}>
                  <td style={{ padding: "6px 8px" }}>{l.description}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{l.quantity}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(l.unit_price)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(l.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginLeft: "auto", maxWidth: 280, marginTop: 12 }}>
        <div style={row}><span style={{ color: MUTED_FG }}>Subtotal</span><span>{fmt(invoice.subtotal)}</span></div>
        {invoice.discount_amount > 0 ? <div style={row}><span style={{ color: MUTED_FG }}>Discount</span><span>- {fmt(invoice.discount_amount)}</span></div> : null}
        <div style={Object.assign({}, row, { fontWeight: 800, fontSize: 15, borderTop: "1px solid " + BORDER, marginTop: 4, paddingTop: 6 })}>
          <span>Total</span><span>{fmt(invoice.total)}</span>
        </div>
        {invoice.tax_enabled ? <div style={Object.assign({}, row, { fontSize: 11, color: MUTED_FG })}><span>Includes VAT ({invoice.tax_rate}%)</span><span>{fmt(invoice.tax_amount)}</span></div> : null}
        {!isVoid ? <div style={row}><span style={{ color: MUTED_FG }}>Paid</span><span>{fmt(invoice.amount_paid)}</span></div> : null}
        {!isVoid ? <div style={Object.assign({}, row, { fontWeight: 800 })}><span>Balance due</span><span>{fmt(outstanding(invoice))}</span></div> : null}
      </div>

      {payments.length ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: MUTED_FG, fontWeight: 700, marginBottom: 4 }}>PAYMENTS</div>
          {payments.map(function (p) {
            return (
              <div key={p.id} style={Object.assign({}, row, { fontSize: 12 })}>
                <span>{dateLabel(p.paid_at)} · {METHOD_LABELS[p.method] || p.method}{p.reference ? " · " + p.reference : ""}</span>
                <span>{fmt(p.amount)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {invoice.notes ? <p style={{ margin: "14px 0 0", fontSize: 12, color: MUTED_FG, lineHeight: 1.5 }}>{invoice.notes}</p> : null}
      {isVoid ? <p style={{ margin: "14px 0 0", fontSize: 12, color: DESTRUCTIVE, fontWeight: 700 }}>Voided {dateLabel(invoice.voided_at)}: {invoice.void_reason}</p> : null}
      <div style={{ marginTop: 18, paddingTop: 10, borderTop: "1px dashed " + BORDER, textAlign: "center", fontSize: 12, color: MUTED_FG }}>
        {salon && salon.receipt_footer_message ? salon.receipt_footer_message : "Thank you for your business."}
      </div>
    </div>
  );
}
