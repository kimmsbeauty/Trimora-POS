// src/pages/pet/InvoiceDocument.jsx
//
// The printable invoice, laid out exactly like the approved PawPals Kenya invoice: logo with a
// coloured strapline bar, "INVOICE" with the number and balance due at the top right, business
// details, Bill To and dates, a dark item table, totals, notes, and a boxed thank-you footer.
// It carries the BUSINESS'S OWN branding: logo and colours from Settings, or the built-in preset
// in brands.js (PawPals Kenya). The footer thank-you and paw use the logo's two colours.
// Totals, payments and the VAT line come from the saved invoice, never recomputed here (prices are
// VAT inclusive, so VAT is shown as "included", not added).
import React, { useState } from "react";
import InvoiceIcon from "./InvoiceIcons";
import { resolveBrand } from "./brands";
import {
  FOREGROUND, MUTED_FG, BORDER, CARD, PRIMARY, INFO, DESTRUCTIVE, FONT_BODY,
} from "./theme";
import { METHOD_LABELS, outstanding, netPaid } from "./invoiceData";
import { sortedRefunds } from "./receiptData";

var PRINT_CSS = "@media print { body * { visibility: hidden; } .invoice-print, .invoice-print * { visibility: visible; } " +
  ".invoice-print { position: fixed; top: 0; left: 0; width: 100%; border: none !important; box-shadow: none !important; } } " +
  ".invoice-print, .invoice-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }";

var BODY = "#1A1A1A"; // printed text is black, like the approved design (the brand navy is kept for the footer links)
var TABLE_HEAD = "#3C3C3C";
var RULE = "#D9D9D9";
var LABEL = "#555555";
var BALANCE_BG = "#F5F2F0";
var FOOTER_RULE = "#D9D6F2";

// 2,000.00 (always two decimals, like the approved design).
export function money(n) {
  return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function kes(n) { return "KES" + money(n); }

function parseDate(iso) {
  if (!iso) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) : new Date(iso);
}
// 04 Nov 2026
export function dateLabel(iso) {
  var d = parseDate(iso);
  if (!d || isNaN(d.getTime())) return "";
  return String(d.getDate()).padStart(2, "0") + " " + d.toLocaleDateString("en-GB", { month: "short" }) + " " + d.getFullYear();
}
function dayKey(iso) {
  var d = parseDate(iso);
  return d && !isNaN(d.getTime()) ? d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate() : "";
}
// "Due on Receipt" when it falls due the day it is issued (or has no due date), otherwise "Net 7".
export function termsLabel(invoice) {
  if (!invoice.due_date || dayKey(invoice.due_date) === dayKey(invoice.issued_at)) return "Due on Receipt";
  var a = parseDate(invoice.issued_at); var b = parseDate(invoice.due_date);
  if (!a || !b || isNaN(a.getTime()) || isNaN(b.getTime())) return "Due on Receipt";
  var days = Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  return days > 0 ? "Net " + days : "Due on Receipt";
}

// One address line per row: keep the owner's own line breaks, else split "Kabete Central, Kenya" on commas.
function addressLines(addr) {
  var s = String(addr || "").trim();
  if (!s) return [];
  var parts = /\n/.test(s) ? s.split(/\n+/) : s.split(",");
  return parts.map(function (x) { return x.trim(); }).filter(Boolean);
}

// Payment instructions printed under Notes while money is still owed (from the business's Settings).
function paymentNoteLines(salon) {
  var s = salon || {};
  var out = [];
  if (s.mpesa_paybill) {
    out.push("PAYBILL:" + String(s.mpesa_paybill).trim());
    if (s.mpesa_account) out.push("ACC NO:" + String(s.mpesa_account).trim());
  } else if (s.mpesa_till) {
    out.push("TILL:" + String(s.mpesa_till).trim());
  }
  return out;
}

// Split the thank-you line so the business name picks up the logo's second colour.
export function thanksParts(thanks, name) {
  var t = String(thanks || "");
  var n = String(name || "").trim();
  var i = n ? t.toLowerCase().indexOf(n.toLowerCase()) : -1;
  if (i < 0) return [{ text: t, tone: "primary" }];
  var parts = [];
  if (i > 0) parts.push({ text: t.slice(0, i), tone: "primary" });
  parts.push({ text: t.slice(i, i + n.length), tone: "secondary" });
  if (i + n.length < t.length) parts.push({ text: t.slice(i + n.length), tone: "primary" });
  return parts;
}

export default function InvoiceDocument({ invoice, customer, pet, salon }) {
  var failState = useState(false); var logoFailed = failState[0]; var setLogoFailed = failState[1];
  var brand = resolveBrand(salon, { primary: PRIMARY, secondary: INFO, ink: FOREGROUND });
  var primary = brand.invoicePrimary; var secondary = brand.invoiceSecondary; var ink = brand.ink;
  var lines = invoice.pet_invoice_lines || [];
  var payments = (invoice.pet_payments || []).slice().sort(function (a, b) { return new Date(a.paid_at) - new Date(b.paid_at); });
  var isVoid = invoice.status === "void";
  var refunds = sortedRefunds(invoice);
  var hasLogo = !!brand.logo && !logoFailed;
  var owed = outstanding(invoice);
  var addr = addressLines(brand.location);
  var noteLines = String(invoice.notes || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
  if (!isVoid && owed > 0) {
    paymentNoteLines(salon).forEach(function (l) {
      var already = noteLines.some(function (n) { return n.toLowerCase().indexOf(l.toLowerCase()) !== -1; });
      if (!already) noteLines.push(l);
    });
  }
  var footEmail = brand.footerEmail; var footWeb = brand.footerWebsite;
  var tone = { primary: primary, secondary: secondary };

  var small = { fontSize: 11, color: BODY, lineHeight: 1.35 };
  var metaRow = { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 11, lineHeight: 1.9 };
  var th = { padding: "10px 6px", fontWeight: 400, fontSize: 11, color: CARD, background: TABLE_HEAD };
  var td = { padding: "12px 6px", fontSize: 11, color: BODY, verticalAlign: "top", borderBottom: "1px solid " + RULE };
  var totalRow = { display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 10px", fontSize: 11, color: BODY };

  return (
    <div className="invoice-print" style={{ background: CARD, color: ink, border: "1px solid " + BORDER, borderRadius: 4, padding: "28px 32px", position: "relative", fontFamily: FONT_BODY }}>
      <style>{PRINT_CSS}</style>

      {/* Top: logo with strapline bar (left) | INVOICE, number and balance due (right) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "0 1 240px", minWidth: 0 }}>
          {hasLogo ? (
            <img src={brand.logo} alt={brand.name + " logo"} onError={function () { setLogoFailed(true); }}
              style={{ width: "100%", maxWidth: 230, maxHeight: 190, objectFit: "contain", display: "block" }} />
          ) : (
            <div style={{ fontSize: 20, fontWeight: 800, color: ink, lineHeight: 1.2, overflowWrap: "anywhere" }}>{brand.name}</div>
          )}
          {brand.invoiceTagline ? (
            <div style={{ marginTop: 6, background: primary, color: CARD, textAlign: "center", fontSize: 11, padding: "3px 6px", overflowWrap: "anywhere" }}>{brand.invoiceTagline}</div>
          ) : null}
        </div>
        <div style={{ textAlign: "right", minWidth: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 500, color: "#1A1A1A", letterSpacing: "0.01em", lineHeight: 1.1 }}>INVOICE</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1A1A1A", marginTop: 8, overflowWrap: "anywhere" }}># {invoice.invoice_number}</div>
          {!isVoid ? (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1A1A1A" }}>Balance Due</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", marginTop: 4 }}>{kes(owed)}</div>
            </div>
          ) : (
            <div style={{ marginTop: 22, fontSize: 13, fontWeight: 800, color: DESTRUCTIVE, letterSpacing: "0.04em" }}>VOID</div>
          )}
        </div>
      </div>

      {/* Business details (left) | invoice dates (right) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginTop: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          {hasLogo ? <div style={{ fontSize: 11, fontWeight: 700, color: "#1A1A1A", overflowWrap: "anywhere" }}>{brand.name}</div> : null}
          {addr.map(function (l, i) { return <div key={i} style={Object.assign({}, small, { overflowWrap: "anywhere" })}>{l}</div>; })}
          {brand.phones.length ? <div style={Object.assign({}, small, { overflowWrap: "anywhere" })}>{brand.phones.join("*")}</div> : null}
          {brand.email ? <div style={Object.assign({}, small, { overflowWrap: "anywhere", minWidth: 0 })}>{brand.email}</div> : null}
          {invoice.tax_enabled && salon && salon.tax_pin ? <div style={small}>KRA PIN: {salon.tax_pin}</div> : null}
        </div>
        <div style={{ flex: "0 1 270px", minWidth: 200 }}>
          <div style={Object.assign({}, metaRow, { color: BODY })}><span style={{ color: LABEL }}>Invoice Date :</span><span>{dateLabel(invoice.issued_at)}</span></div>
          <div style={Object.assign({}, metaRow, { color: BODY })}><span style={{ color: LABEL }}>Terms :</span><span>{termsLabel(invoice)}</span></div>
          <div style={Object.assign({}, metaRow, { color: BODY })}><span style={{ color: LABEL }}>Due Date :</span><span>{dateLabel(invoice.due_date || invoice.issued_at)}</span></div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, color: LABEL }}>Bill To</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1A1A1A", overflowWrap: "anywhere" }}>{customer ? customer.name : "Customer"}</div>
        {pet ? <div style={{ fontSize: 10, color: LABEL, marginTop: 2 }}>Pet: {pet.name}{pet.species ? " (" + pet.species + ")" : ""}</div> : null}
      </div>

      {/* Items */}
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginTop: 16 }}>
        <colgroup><col style={{ width: 30 }} /><col /><col style={{ width: 46 }} /><col style={{ width: 82 }} /><col style={{ width: 92 }} /></colgroup>
        <thead>
          <tr>
            <th style={Object.assign({}, th, { textAlign: "left", paddingLeft: 10 })}>#</th>
            <th style={Object.assign({}, th, { textAlign: "left" })}>Item &amp; Description</th>
            <th style={Object.assign({}, th, { textAlign: "right" })}>Qty</th>
            <th style={Object.assign({}, th, { textAlign: "right" })}>Rate</th>
            <th style={Object.assign({}, th, { textAlign: "right", paddingRight: 10, whiteSpace: "nowrap" })}>Vatable<br />Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(function (l, i) {
            var parts = String(l.description || "").split(/\n+/);
            return (
              <tr key={l.id}>
                <td style={Object.assign({}, td, { paddingLeft: 10 })}>{i + 1}</td>
                <td style={Object.assign({}, td, { overflowWrap: "anywhere" })}>
                  <div>{parts[0]}</div>
                  {parts.slice(1).map(function (x, j) { return <div key={j} style={{ color: MUTED_FG, marginTop: 2 }}>{x}</div>; })}
                </td>
                <td style={Object.assign({}, td, { textAlign: "right", whiteSpace: "nowrap" })}>{money(l.quantity)}</td>
                <td style={Object.assign({}, td, { textAlign: "right", whiteSpace: "nowrap" })}>{money(l.unit_price)}</td>
                <td style={Object.assign({}, td, { textAlign: "right", paddingRight: 10, whiteSpace: "nowrap" })}>{money(l.line_total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ marginLeft: "auto", width: "55%", minWidth: 230, maxWidth: "100%", marginTop: 4 }}>
        <div style={Object.assign({}, totalRow, { borderBottom: "1px solid " + RULE })}><span style={{ fontWeight: 700, flex: 1, textAlign: "right" }}>Sub Total</span><span style={{ width: "34%", textAlign: "right", whiteSpace: "nowrap" }}>{money(invoice.subtotal)}</span></div>
        {invoice.discount_amount > 0 ? <div style={Object.assign({}, totalRow, { borderBottom: "1px solid " + RULE })}><span style={{ flex: 1, textAlign: "right" }}>Discount</span><span style={{ width: "34%", textAlign: "right", whiteSpace: "nowrap" }}>- {money(invoice.discount_amount)}</span></div> : null}
        {invoice.tax_enabled ? <div style={Object.assign({}, totalRow, { borderBottom: "1px solid " + RULE })}><span style={{ flex: 1, textAlign: "right" }}>VAT ({invoice.tax_rate}%) included</span><span style={{ width: "34%", textAlign: "right", whiteSpace: "nowrap" }}>{money(invoice.tax_amount)}</span></div> : null}
        <div style={Object.assign({}, totalRow, { borderBottom: "1px solid " + RULE, fontWeight: 700 })}><span style={{ flex: 1, textAlign: "right" }}>Total</span><span style={{ width: "34%", textAlign: "right", whiteSpace: "nowrap" }}>{kes(invoice.total)}</span></div>
        {!isVoid && invoice.amount_paid > 0 ? <div style={Object.assign({}, totalRow, { borderBottom: "1px solid " + RULE })}><span style={{ flex: 1, textAlign: "right" }}>Payment Made</span><span style={{ width: "34%", textAlign: "right", whiteSpace: "nowrap" }}>(-) {money(invoice.amount_paid)}</span></div> : null}
        {!isVoid && invoice.amount_refunded > 0 ? <div style={Object.assign({}, totalRow, { borderBottom: "1px solid " + RULE })}><span style={{ flex: 1, textAlign: "right" }}>Refunded</span><span style={{ width: "34%", textAlign: "right", whiteSpace: "nowrap" }}>{money(invoice.amount_refunded)}</span></div> : null}
        {!isVoid && invoice.amount_refunded > 0 ? <div style={Object.assign({}, totalRow, { borderBottom: "1px solid " + RULE })}><span style={{ flex: 1, textAlign: "right" }}>Kept after refunds</span><span style={{ width: "34%", textAlign: "right", whiteSpace: "nowrap" }}>{kes(netPaid(invoice))}</span></div> : null}
        {!isVoid ? (
          <div style={Object.assign({}, totalRow, { background: BALANCE_BG, fontWeight: 700 })}>
            <span style={{ flex: 1, textAlign: "right" }}>Balance Due</span><span style={{ width: "34%", textAlign: "right", whiteSpace: "nowrap" }}>{kes(owed)}</span>
          </div>
        ) : null}
      </div>

      {/* Payments received (only once there are any) and refunds */}
      {!isVoid && payments.length ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, color: LABEL, marginBottom: 3 }}>Payments received</div>
          {payments.map(function (p) {
            return (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 10, color: BODY, padding: "2px 0" }}>
                <span style={{ overflowWrap: "anywhere" }}>{dateLabel(p.paid_at)} · {METHOD_LABELS[p.method] || p.method}{p.reference ? " · " + p.reference : ""}</span>
                <span>{kes(p.amount)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
      {refunds.length ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: LABEL, marginBottom: 3 }}>Refunds</div>
          {refunds.map(function (f) {
            return (
              <div key={f.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 10, color: BODY, padding: "2px 0" }}>
                <span style={{ overflowWrap: "anywhere" }}>{dateLabel(f.refunded_at)} · {METHOD_LABELS[f.method] || f.method}{f.reference ? " · " + f.reference : ""} · {f.reason}</span>
                <span>- {kes(f.amount)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {noteLines.length ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1A1A1A", marginBottom: 6 }}>Notes</div>
          {noteLines.map(function (l, i) { return <div key={i} style={{ fontSize: 10, color: LABEL, lineHeight: 1.9, overflowWrap: "anywhere" }}>{l}</div>; })}
        </div>
      ) : null}
      {isVoid ? <p style={{ margin: "14px 0 0", fontSize: 11, color: DESTRUCTIVE, fontWeight: 700 }}>Voided {dateLabel(invoice.voided_at)}: {invoice.void_reason}</p> : null}

      {/* Footer: boxed thank-you in the logo's two colours */}
      <div style={{ marginTop: 26, border: "1px solid " + FOOTER_RULE, borderTop: "3px solid " + FOOTER_RULE, borderRadius: 18, padding: "14px 22px", display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ flex: "none" }}><InvoiceIcon name="paw" size={40} color={primary} color2={secondary} /></div>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <div style={{ textAlign: "center", fontSize: 24, lineHeight: 1.25, fontFamily: "'Dancing Script', 'Brush Script MT', cursive", fontWeight: 600, overflowWrap: "anywhere" }}>
            {thanksParts(brand.thanks, brand.name).map(function (p, i) { return <span key={i} style={{ color: tone[p.tone] }}>{p.text}</span>; })}
          </div>
          {footEmail || footWeb ? (
            <div style={{ marginTop: 8, display: "grid", gap: 6, justifyContent: "center" }}>
              {footEmail ? <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: ink }}><InvoiceIcon name="mail" size={20} color={primary} /><span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{footEmail}</span></div> : null}
              {footWeb ? <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: ink }}><InvoiceIcon name="globe" size={20} color={secondary} /><span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{footWeb}</span></div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
