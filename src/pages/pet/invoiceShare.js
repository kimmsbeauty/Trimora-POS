// src/pages/pet/invoiceShare.js
//
// Pure helpers for sharing a Trimora Pet invoice by WhatsApp or email (no network, no React).
// What the customer receives is the invoice PDF and nothing else: there is no text summary of the
// invoice any more (it only repeated what the PDF already says). These links just open the chat or
// the email to the right person; the PDF itself is attached by the share sheet (see invoicePdf.js).
import { normalizePhoneForWhatsApp } from "../../lib/utils";

export function invoiceSubject(invoice, salon) {
  var biz = salon && salon.name ? salon.name + " " : "";
  return biz + "invoice " + invoice.invoice_number;
}

// WhatsApp link. With a usable phone number the chat opens straight to that customer; without
// one, WhatsApp opens its contact picker so staff can choose who to send it to. Pass a message only
// when you really want text pre-filled; invoices pass none.
export function whatsappUrl(phone, message) {
  var digits = normalizePhoneForWhatsApp(phone);
  var usable = digits && digits.length >= 11 && digits.length <= 15;
  return "https://wa.me/" + (usable ? digits : "") + (message ? "?text=" + encodeURIComponent(message) : "");
}

export function isEmailLike(email) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(email || "").trim());
}

// Email link: subject only, no body text (the PDF is the message).
export function mailtoUrl(email, subject) {
  var to = isEmailLike(email) ? encodeURIComponent(String(email).trim()).replace(/%40/g, "@") : "";
  return "mailto:" + to + "?subject=" + encodeURIComponent(subject);
}
