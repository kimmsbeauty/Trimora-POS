// src/pages/pet/InvoiceDocument.jsx
//
// The printable invoice, laid out like the approved PawPals Kenya design. It carries the BUSINESS'S
// OWN branding: logo and colours from Settings, or the built-in preset in brands.js (PawPals Kenya),
// or the business name in text. Totals, payments and the VAT line come from the saved invoice,
// never recomputed here (prices are VAT inclusive, so VAT is shown as "included", not added).
import React, { useState } from "react";
import InvoiceIcon from "./InvoiceIcons";
import { resolveBrand } from "./brands";
import { fmt } from "../../lib/utils";
import {
  FOREGROUND, MUTED_FG, BORDER, CARD, PRIMARY, INFO, DESTRUCTIVE, FONT_BODY,
} from "./theme";
import { PAWPALS_TINT, PAWPALS_TINT_BORDER, PAWPALS_PURPLE_TINT } from "./brandColors";
import { METHOD_LABELS, STATUS_LABELS, displayStatus, outstanding, netPaid } from "./invoiceData";
import { sortedRefunds } from "./receiptData";

var PRINT_CSS = "@media print { body * { visibility: hidden; } .invoice-print, .invoice-print * { visibility: visible; } " +
  ".invoice-print { position: fixed; top: 0; left: 0; width: 100%; border: none !important; box-shadow: none !important; } } " +
  ".invoice-print, .invoice-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }";

function parseDate(iso) {
  if (!iso) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) : new Date(iso);
}
function dateLabel(iso) {
  var d = parseDate(iso);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
}
function dateTimeLabel(iso) {
  var d = parseDate(iso);
  if (!d) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function InvoiceDocument({ invoice, customer, pet, salon }) {
  var failState = useState(false); var logoFailed = failState[0]; var setLogoFailed = failState[1];
  var brand = resolveBrand(salon, { primary: PRIMARY, secondary: INFO, ink: FOREGROUND });
  var accent = brand.primary; var ink = brand.ink;
  var status = displayStatus(invoice);
  var lines = invoice.pet_invoice_lines || [];
  var payments = (invoice.pet_payments || []).slice().sort(function (a, b) { return new Date(a.paid_at) - new Date(b.paid_at); });
  var isVoid = invoice.status === "void";
  var refunds = sortedRefunds(invoice);
  var hasLogo = !!brand.logo && !logoFailed;
  var pillColor = isVoid || status === "overdue" ? DESTRUCTIVE : status === "paid" ? accent : MUTED_FG;

  var row = { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "7px 0", borderBottom: "1px solid " + PAWPALS_TINT_BORDER };
  var panel = { background: PAWPALS_TINT, borderRadius: 12, padding: "14px 18px" };
  var heading = { fontSize: 15, fontWeight: 800, color: accent, marginBottom: 8 };
  var contactRow = { display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11, color: ink, marginTop: 4, lineHeight: 1.3 };
  var contactText = { minWidth: 0, overflowWrap: "anywhere" };
  var th = { padding: "10px 12px", fontWeight: 800, color: ink };

  return (
    <div className="invoice-print" style={{ background: CARD, color: ink, border: "1px solid " + BORDER, borderRadius: 12, padding: 24, position: "relative", fontFamily: FONT_BODY }}>
      <style>{PRINT_CSS}</style>

      {/* Header: logo | business details. Everything is sized to fit the card, never cut off at the edge. */}
      <div style={{ display: "flex", gap: 14, alignItems: "stretch", paddingBottom: 14 }}>
        {hasLogo ? (
          <img src={brand.logo} alt={brand.name + " logo"} onError={function () { setLogoFailed(true); }}
            style={{ width: "40%", maxWidth: 150, minWidth: 0, maxHeight: 120, objectFit: "contain", display: "block", alignSelf: "center", flex: "0 1 auto" }} />
        ) : null}
        {hasLogo ? <div style={{ width: 2, background: accent, opacity: 0.35, borderRadius: 2, flex: "0 0 2px" }} /> : null}
        <div style={{ minWidth: 0, flex: "1 1 0", alignSelf: "center", overflowWrap: "anywhere" }}>
          <div style={{ fontSize: hasLogo ? 16 : 20, fontWeight: 800, color: ink, lineHeight: 1.2 }}>{brand.name}</div>
          {brand.tagline ? <div style={{ fontSize: 11, color: MUTED_FG, lineHeight: 1.3 }}>{brand.tagline}</div> : null}
          <div style={{ marginTop: 5 }}>
            {brand.location ? <div style={contactRow}><InvoiceIcon name="pin" size={13} color={accent} /><span style={contactText}>{brand.location}</span></div> : null}
            {brand.phones.map(function (ph) { return <div key={ph} style={contactRow}><InvoiceIcon name="phone" size={13} color={accent} /><span style={contactText}>{ph}</span></div>; })}
            {brand.email ? <div style={contactRow}><InvoiceIcon name="mail" size={13} color={accent} /><span style={contactText}>{brand.email}</span></div> : null}
            {brand.website ? <div style={contactRow}><InvoiceIcon name="globe" size={13} color={accent} /><span style={contactText}>{brand.website}</span></div> : null}
            {invoice.tax_enabled && salon && salon.tax_pin ? <div style={{ fontSize: 11, color: MUTED_FG, marginTop: 4 }}>KRA PIN: {salon.tax_pin}</div> : null}
          </div>
        </div>
      </div>

      {/* Invoice number + status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0", borderTop: "2px solid " + PAWPALS_TINT_BORDER, borderBottom: "2px solid " + PAWPALS_TINT_BORDER }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: MUTED_FG }}>Invoice No.</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: ink, overflowWrap: "anywhere" }}>{invoice.invoice_number}</div>
        </div>
        <div style={{ display: "inline-block", padding: "5px 20px", borderRadius: 999, background: pillColor, color: CARD, fontSize: 13, fontWeight: 800, letterSpacing: "0.04em" }}>
          {STATUS_LABELS[status].toUpperCase()}
        </div>
      </div>

      {/* Dates */}
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", padding: "14px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <InvoiceIcon name="calendar" size={26} color={ink} />
          <div><div style={{ fontSize: 12, color: MUTED_FG }}>Invoice Date</div><div style={{ fontSize: 14, color: ink }}>{dateLabel(invoice.issued_at)}</div></div>
        </div>
        {invoice.due_date ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <InvoiceIcon name="calendar" size={26} color={ink} />
            <div><div style={{ fontSize: 12, color: MUTED_FG }}>Due Date</div><div style={{ fontSize: 14, color: ink }}>{dateLabel(invoice.due_date)}</div></div>
          </div>
        ) : null}
      </div>

      {/* Customer + pet */}
      <div style={Object.assign({}, panel, { display: "flex", gap: 24, flexWrap: "wrap" })}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={heading}>Customer Information</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}><InvoiceIcon name="user" size={20} color={ink} />{customer ? customer.name : "Customer"}</div>
          {customer && customer.phone ? <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, marginTop: 8 }}><InvoiceIcon name="phone" size={20} color={ink} />{customer.phone}</div> : null}
        </div>
        {pet ? (
          <div style={{ flex: "1 1 220px", minWidth: 0, borderLeft: "1px solid " + PAWPALS_TINT_BORDER, paddingLeft: 24 }}>
            <div style={heading}>Pet Information</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}><InvoiceIcon name="paw" size={20} color={ink} />{pet.name}</div>
            {pet.species ? <div style={{ fontSize: 14, marginTop: 8, paddingLeft: 30 }}>{pet.species}</div> : null}
          </div>
        ) : null}
      </div>

      {/* Items */}
      <div style={{ overflowX: "auto", marginTop: 16, border: "1px solid " + PAWPALS_TINT_BORDER, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: PAWPALS_TINT, textAlign: "left" }}>
              <th style={th}>Service / Description</th>
              <th style={Object.assign({}, th, { textAlign: "center" })}>Qty</th>
              <th style={Object.assign({}, th, { textAlign: "right" })}>Unit Price (KES)</th>
              <th style={Object.assign({}, th, { textAlign: "right" })}>Amount (KES)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(function (l) {
              return (
                <tr key={l.id} style={{ borderTop: "1px solid " + PAWPALS_TINT_BORDER }}>
                  <td style={{ padding: "12px", fontWeight: 600 }}>{l.description}</td>
                  <td style={{ padding: "12px", textAlign: "center" }}>{l.quantity}</td>
                  <td style={{ padding: "12px", textAlign: "right" }}>{fmt(l.unit_price)}</td>
                  <td style={{ padding: "12px", textAlign: "right" }}>{fmt(l.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Payment details (left) + totals (right) */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          {payments.length ? (
            <div style={panel}>
              <div style={heading}>Payment Details</div>
              {payments.map(function (p, i) {
                var cell = { display: "flex", gap: 12, fontSize: 13, padding: "6px 0", borderBottom: "1px solid " + PAWPALS_TINT_BORDER };
                return (
                  <div key={p.id} style={{ marginTop: i ? 10 : 0 }}>
                    <div style={cell}><span style={{ color: MUTED_FG, flex: "0 0 130px" }}>Payment Method</span><span>{METHOD_LABELS[p.method] || p.method}</span></div>
                    {p.reference ? <div style={cell}><span style={{ color: MUTED_FG, flex: "0 0 130px" }}>Transaction Reference</span><span style={{ wordBreak: "break-all" }}>{p.reference}</span></div> : null}
                    <div style={Object.assign({}, cell, { borderBottom: "none" })}><span style={{ color: MUTED_FG, flex: "0 0 130px" }}>Payment Date</span><span>{dateTimeLabel(p.paid_at)}</span></div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div style={{ flex: "1 1 280px", maxWidth: 380, marginLeft: "auto" }}>
          <div style={row}><span>Subtotal</span><span>{fmt(invoice.subtotal)}</span></div>
          {invoice.discount_amount > 0 ? <div style={row}><span>Discount</span><span>- {fmt(invoice.discount_amount)}</span></div> : null}
          {invoice.tax_enabled ? (
            <div style={row}>
              <span>VAT / Tax (included) <span style={{ marginLeft: 8, padding: "2px 18px", borderRadius: 6, background: PAWPALS_TINT, border: "1px solid " + PAWPALS_TINT_BORDER, fontSize: 12 }}>{invoice.tax_rate}%</span></span>
              <span>{fmt(invoice.tax_amount)}</span>
            </div>
          ) : null}
          <div style={Object.assign({}, row, { fontWeight: 800 })}><span>Total</span><span>{fmt(invoice.total)}</span></div>
          {!isVoid ? <div style={row}><span>Amount Paid</span><span>{fmt(invoice.amount_paid)}</span></div> : null}
          {!isVoid && invoice.amount_refunded > 0 ? <div style={row}><span>Refunded</span><span>- {fmt(invoice.amount_refunded)}</span></div> : null}
          {!isVoid && invoice.amount_refunded > 0 ? <div style={Object.assign({}, row, { fontWeight: 700 })}><span>Kept after refunds</span><span>{fmt(netPaid(invoice))}</span></div> : null}
          {!isVoid ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, padding: "12px 14px", borderRadius: 10, background: PAWPALS_PURPLE_TINT, color: accent }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>Balance Due</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{fmt(outstanding(invoice))}</span>
            </div>
          ) : null}
        </div>
      </div>

      {refunds.length ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: MUTED_FG, fontWeight: 700, marginBottom: 4 }}>REFUNDS</div>
          {refunds.map(function (f) {
            return (
              <div key={f.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                <span>{dateLabel(f.refunded_at)} · {METHOD_LABELS[f.method] || f.method}{f.reference ? " · " + f.reference : ""} · {f.reason}</span>
                <span>- {fmt(f.amount)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {invoice.notes ? <p style={{ margin: "14px 0 0", fontSize: 12, color: MUTED_FG, lineHeight: 1.5 }}>{invoice.notes}</p> : null}
      {isVoid ? <p style={{ margin: "14px 0 0", fontSize: 12, color: DESTRUCTIVE, fontWeight: 700 }}>Voided {dateLabel(invoice.voided_at)}: {invoice.void_reason}</p> : null}

      {/* Footer */}
      <div style={{ marginTop: 22, paddingTop: 14, borderTop: "2px solid " + PAWPALS_TINT_BORDER, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: accent, fontSize: 20, fontFamily: "'Dancing Script', 'Brush Script MT', cursive", fontWeight: 600 }}>
          <InvoiceIcon name="paw" size={22} color={accent} /><span>{brand.thanks}</span>
        </div>
        {brand.phones.length || brand.email || brand.website ? (
          <div style={{ display: "flex", justifyContent: "center", gap: 18, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: ink }}>
            {brand.phones.length ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><InvoiceIcon name="phone" size={14} color={accent} />{brand.phones.join(" · ")}</span> : null}
            {brand.email ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><InvoiceIcon name="mail" size={14} color={accent} />{brand.email}</span> : null}
            {brand.website ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><InvoiceIcon name="globe" size={14} color={accent} />{brand.website}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
