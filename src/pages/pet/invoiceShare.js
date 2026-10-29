// src/pages/pet/invoiceShare.js
//
// Pure helpers for sharing a Trimora Pet invoice by WhatsApp or email (no network, no React).
// The message is built from the SAVED invoice (total, paid, refunds and balance come from the
// database row, never recomputed here). WhatsApp and email links open the sender's own app with
// the text filled in; nothing is sent by Trimora and no file is attached.
import { fmt, normalizePhoneForWhatsApp } from "../../lib/utils";
import { STATUS_LABELS, displayStatus, outstanding } from "./invoiceData";
import { invoicePhones } from "./brands";

function dateLabel(iso) {
  if (!iso) return "";
  var s = String(iso);
  var d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function firstName(name) {
  var n = String(name || "").trim().split(/\s+/)[0];
  return n || "";
}

export function invoiceSubject(invoice, salon) {
  var biz = salon && salon.name ? salon.name + " " : "";
  return biz + "invoice " + invoice.invoice_number;
}

// Plain-text invoice summary. Works for WhatsApp and email bodies alike.
export function buildInvoiceMessage(invoice, customer, pet, salon) {
  var lines = invoice.pet_invoice_lines || [];
  var status = displayStatus(invoice);
  var isVoid = invoice.status === "void";
  var biz = salon && salon.name ? salon.name : "us";
  var out = [];
  var hello = customer && firstName(customer.name) ? "Hello " + firstName(customer.name) + "," : "Hello,";
  out.push(hello);
  out.push("");
  out.push("Here is your invoice " + invoice.invoice_number + " from " + biz + (pet && pet.name ? " for " + pet.name : "") + ".");
  out.push("");
  lines.forEach(function (l) {
    out.push("- " + l.description + " x" + l.quantity + ": " + fmt(l.line_total));
  });
  out.push("");
  if (invoice.discount_amount > 0) out.push("Discount: -" + fmt(invoice.discount_amount));
  out.push("Total: " + fmt(invoice.total));
  if (invoice.tax_enabled) out.push("Includes VAT (" + invoice.tax_rate + "%): " + fmt(invoice.tax_amount));
  if (!isVoid) {
    out.push("Paid: " + fmt(invoice.amount_paid || 0));
    if (invoice.amount_refunded > 0) out.push("Refunded: -" + fmt(invoice.amount_refunded));
    out.push("Balance due: " + fmt(outstanding(invoice)));
  }
  out.push("Status: " + STATUS_LABELS[status]);
  if (invoice.due_date && !isVoid) out.push("Due: " + dateLabel(invoice.due_date));
  if (invoice.notes) { out.push(""); out.push(invoice.notes); }
  out.push("");
  out.push((salon && salon.receipt_footer_message) || "Thank you for your business.");
  var tel = invoicePhones(salon);
  if (salon && salon.name) out.push(salon.name + (tel.length ? " - Tel: " + tel.join(", ") : ""));
  return out.join("\n");
}

// WhatsApp link. With a usable phone number the chat opens straight to that customer; without
// one, WhatsApp opens its contact picker so staff can choose who to send it to.
export function whatsappUrl(phone, message) {
  var digits = normalizePhoneForWhatsApp(phone);
  var usable = digits && digits.length >= 11 && digits.length <= 15;
  return "https://wa.me/" + (usable ? digits : "") + "?text=" + encodeURIComponent(message);
}

export function isEmailLike(email) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(email || "").trim());
}

// Email link. mailto: bodies are percent-encoded with %0D%0A line breaks (encodeURIComponent
// keeps "+" and spaces correct, unlike URLSearchParams).
export function mailtoUrl(email, subject, body) {
  var to = isEmailLike(email) ? encodeURIComponent(String(email).trim()).replace(/%40/g, "@") : "";
  return "mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body).replace(/%0A/g, "%0D%0A");
}
