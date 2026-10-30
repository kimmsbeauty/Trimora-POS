// src/pages/pet/invoiceData.js
//
// Pure helpers for Checkout and Invoices (no network, no React).
// The DATABASE (migration 089) is the authority on totals, numbering and what
// may be paid or voided. computeTotals() only previews the same arithmetic so
// the cashier sees the total before pressing "Complete sale".
//
// Money: whole Kenya shillings (integers). Tax: prices are VAT INCLUSIVE, like
// the existing receipts (migration 068).

export var METHODS = ["cash", "mpesa", "card", "other"];
export var METHOD_LABELS = { cash: "Cash", mpesa: "M-Pesa", card: "Card", other: "Other" };
export var STATUS_LABELS = { issued: "Unpaid", partial: "Part paid", paid: "Paid", void: "Void", overdue: "Overdue", refunded: "Refunded" };
export var STATUS_TONES = { issued: "warning", partial: "info", paid: "success", void: "neutral", overdue: "danger", refunded: "neutral" };

var ERROR_TEXT = {
  NOT_AUTHENTICATED: "Please sign in again.",
  INVALID_KEY: "Something went wrong preparing this sale. Refresh and try again.",
  CUSTOMER_NOT_FOUND: "That customer could not be found.",
  PET_NOT_FOUND: "That pet doesn't belong to the chosen customer.",
  BOOKING_NOT_FOUND: "That booking could not be found for this customer.",
  BOOKING_NOT_READY: "Only a checked-in, in-progress, ready or completed booking can be invoiced.",
  BOOKING_ALREADY_INVOICED: "This booking already has an invoice.",
  INVALID_LINES: "Check the items: add at least one, with a quantity from 1 to 100.",
  SERVICE_NOT_FOUND: "One of the chosen services is no longer available.",
  ITEM_NOT_FOUND: "One of the chosen products is no longer available for sale.",
  INSUFFICIENT_STOCK: "There isn't enough stock of a product on this sale. Check the quantities and try again.",
  INVALID_DISCOUNT: "The discount isn't valid. It can't be negative or more than the subtotal.",
  AMOUNT_TOO_LARGE: "That total is too large.",
  SETTINGS_MISSING: "This business has no invoice settings yet. Contact support.",
  INVALID_PAYMENT: "Check the payment: choose a method and enter a positive whole amount.",
  OVERPAYMENT: "The payment is more than the amount still owed.",
  DUPLICATE_PAYMENT_REFERENCE: "A payment with that reference has already been recorded.",
  MPESA_NOT_CONFIRMED: "Safaricom hasn't confirmed this payment yet.",
  MPESA_PAYMENT_NOT_FOUND: "That M-Pesa payment could not be found.",
  MPESA_PAYMENT_MISMATCH: "That M-Pesa payment was requested for a different invoice.",
  INVOICE_NOT_FOUND: "That invoice could not be found. Refresh and try again.",
  INVOICE_NOT_PAYABLE: "This invoice can't take more payments.",
  INVOICE_NOT_VOIDABLE: "This invoice is already void.",
  INVOICE_HAS_PAYMENTS: "An invoice with payments can't be voided. Refund it instead.",
  INVOICE_HAS_PENDING_MPESA: "An M-Pesa payment for this invoice is still waiting for the customer. Wait for it to finish or fail, then try again.",
  REASON_REQUIRED: "Enter a reason.",
  INVALID_REFUND: "Check the refund: choose a method and enter a positive whole amount.",
  INVOICE_NOT_REFUNDABLE: "This invoice can't be refunded. Only invoices with payments can, and not ones already fully refunded or void.",
  REFUND_EXCEEDS_PAID: "That is more than can still be refunded on this invoice.",
  PARTIAL_INVOICE_FULL_REFUND_ONLY: "This invoice is only part paid, so it can only be refunded in full.",
  RETURN_STOCK_NEEDS_FULL_REFUND: "Products can only be put back into stock on the refund that completes the invoice.",
  DUPLICATE_REFUND_REFERENCE: "A refund with that reference has already been recorded.",
  IDEMPOTENCY_CONFLICT: "This refund request doesn't match an earlier one. Close this window and start again.",
};
export var REFUND_PIN_REFUSED = "That admin PIN wasn't accepted. After 5 wrong tries it is locked for 15 minutes.";
export function invoiceErrorMessage(raw) {
  var text = String(raw || "");
  var codes = Object.keys(ERROR_TEXT);
  for (var i = 0; i < codes.length; i++) if (text.indexOf(codes[i]) !== -1) return ERROR_TEXT[codes[i]];
  if (text === "Network error") return "Couldn't reach the server. Check your connection and try again.";
  return "Something went wrong. Check your connection and try again.";
}

// One key per checkout attempt: a retry or double click returns the same invoice.
export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  var s = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = Math.floor(Math.random() * 16); return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
  return s;
}

function intOrNaN(v) {
  if (v === "" || v === null || v === undefined) return NaN;
  var n = Number(v);
  return isFinite(n) && Math.floor(n) === n ? n : NaN;
}

// lines: [{ unit_price, quantity }] -> same arithmetic as pet_create_invoice().
export function computeTotals(opts) {
  var subtotal = (opts.lines || []).reduce(function (sum, l) { return sum + (Number(l.unit_price) || 0) * (Number(l.quantity) || 0); }, 0);
  var value = Number(opts.discountValue) || 0;
  var discount = opts.discountType === "percent" ? Math.round(subtotal * value / 100) : Math.round(value);
  var valid = discount >= 0 && discount <= subtotal && (opts.discountType !== "percent" || (value >= 0 && value <= 100));
  if (!valid) discount = 0;
  var total = subtotal - discount;
  var taxAmount = opts.taxEnabled ? total - Math.round(total / (1 + (Number(opts.taxRate) || 0) / 100)) : 0;
  return { subtotal: subtotal, discount: discount, total: total, taxAmount: taxAmount, discountValid: valid };
}

export function paymentsSum(payments) {
  return (payments || []).reduce(function (sum, p) { var n = intOrNaN(p.amount); return sum + (isNaN(n) ? 0 : n); }, 0);
}

// draft: { customer_id, lines:[{service_id, quantity}], discountType, discountValue, payments:[{method, amount}] }
export function validateCheckout(draft, totals) {
  if (!draft.customer_id) return "Choose a customer.";
  if (!draft.lines || draft.lines.length === 0) return "Add at least one service.";
  for (var i = 0; i < draft.lines.length; i++) {
    var q = intOrNaN(draft.lines[i].quantity);
    if (isNaN(q) || q < 1 || q > 100) return "Quantities must be whole numbers from 1 to 100.";
  }
  if (!totals.discountValid) return "The discount can't be negative or more than the subtotal (percent: 0 to 100).";
  var payments = draft.payments || [];
  for (var j = 0; j < payments.length; j++) {
    var a = intOrNaN(payments[j].amount);
    if (isNaN(a) || a <= 0) return "Each payment must be a positive whole amount.";
    if (METHODS.indexOf(payments[j].method) === -1) return "Choose a payment method.";
  }
  if (paymentsSum(payments) > totals.total) return "Payments are more than the total.";
  return "";
}

export function paymentRows(payments) {
  return (payments || []).map(function (p) {
    return { method: p.method, amount: Number(p.amount), reference: p.reference && String(p.reference).trim() ? String(p.reference).trim() : null };
  });
}

export function outstanding(inv) { return inv.status === "void" || inv.status === "refunded" ? 0 : Math.max(0, inv.total - inv.amount_paid); }

// ---- refunds (migration 105). The database is the authority; these only preview its rules. ----
// Money still refundable: what was paid minus what has been paid back. Only paid and part-paid invoices.
export function refundable(inv) {
  if (!inv || (inv.status !== "paid" && inv.status !== "partial")) return 0;
  return Math.max(0, (inv.amount_paid || 0) - (inv.amount_refunded || 0));
}
// Money kept after refunds.
export function netPaid(inv) { return Math.max(0, ((inv && inv.amount_paid) || 0) - ((inv && inv.amount_refunded) || 0)); }
export function hasProductLines(inv) { return ((inv && inv.pet_invoice_lines) || []).some(function (l) { return !!l.item_id; }); }

// draft: { amount, method, reason }. Returns "" when valid.
export function validateRefund(inv, draft) {
  var left = refundable(inv);
  if (left <= 0) return "This invoice has nothing left to refund.";
  var a = intOrNaN(draft.amount);
  if (isNaN(a) || a <= 0) return "Enter a positive whole amount.";
  if (a > left) return "That is more than can still be refunded (" + left + ").";
  if (inv.status === "partial" && a !== left) return "A part-paid invoice can only be refunded in full.";
  if (METHODS.indexOf(draft.method) === -1) return "Choose how the money was returned.";
  if (!String(draft.reason || "").trim()) return "Enter a reason for the refund.";
  return "";
}

function startOfToday(now) { var d = now || new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
// Overdue is derived, never stored: unpaid or part-paid and past its due date.
export function isOverdue(inv, now) {
  if (!inv.due_date || (inv.status !== "issued" && inv.status !== "partial")) return false;
  var p = String(inv.due_date).split("-");
  var due = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return due < startOfToday(now);
}
export function displayStatus(inv, now) { return isOverdue(inv, now) ? "overdue" : inv.status; }

export function filterInvoices(invoices, f, names, now) {
  var needle = String((f && f.q) || "").trim().toLowerCase();
  return (invoices || []).filter(function (inv) {
    if (f && f.status === "outstanding") { if (outstanding(inv) <= 0) return false; }
    else if (f && f.status && f.status !== "all" && displayStatus(inv, now) !== f.status) return false;
    if (!needle) return true;
    var n = names(inv);
    return String(inv.invoice_number).toLowerCase().indexOf(needle) !== -1 ||
      String(n.customer || "").toLowerCase().indexOf(needle) !== -1 ||
      String(n.pet || "").toLowerCase().indexOf(needle) !== -1;
  });
}

export function summarize(invoices, now) {
  var owed = 0; var overdue = 0; var overdueCount = 0;
  (invoices || []).forEach(function (inv) {
    var o = outstanding(inv); owed += o;
    if (isOverdue(inv, now)) { overdue += o; overdueCount += 1; }
  });
  return { outstanding: owed, overdue: overdue, overdueCount: overdueCount };
}
