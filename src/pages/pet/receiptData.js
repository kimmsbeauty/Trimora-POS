// src/pages/pet/receiptData.js
//
// Receipt figures for ONE payment against an invoice. A receipt shows what was paid
// in that payment, what had been paid up to and including it, and what is still owed
// after it. Payments are append-only (clients cannot change them), so these figures
// are stable. The receipt reference is DERIVED from the invoice number and the
// payment's position (RCT-0007-1, RCT-0007-2, ...); it is not a separately numbered
// series in the database.

export function sortedPayments(invoice) {
  return ((invoice && invoice.pet_payments) || []).slice().sort(function (a, b) {
    var d = new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime();
    if (d !== 0) return d;
    var c = new Date(a.created_at || a.paid_at).getTime() - new Date(b.created_at || b.paid_at).getTime();
    if (c !== 0) return c;
    return String(a.id) < String(b.id) ? -1 : 1;
  });
}

export function receiptFor(invoice, paymentId) {
  var list = sortedPayments(invoice);
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].id === paymentId) { idx = i; break; } }
  if (idx === -1) return null;
  var paidToDate = 0;
  for (var j = 0; j <= idx; j++) paidToDate += list[j].amount;
  var num = String((invoice && invoice.invoice_number) || "");
  var base = /^INV-/i.test(num) ? num.replace(/^INV-/i, "") : num;
  return {
    payment: list[idx],
    number: "RCT-" + base + "-" + (idx + 1),
    paidToDate: paidToDate,
    balanceAfter: Math.max(0, (invoice.total || 0) - paidToDate),
    isLatest: idx === list.length - 1,
  };
}

export function latestPaymentId(invoice) {
  var list = sortedPayments(invoice);
  return list.length ? list[list.length - 1].id : null;
}

// ---- Refund receipts (credit notes), migration 105. One per pet_refunds row. The reference is derived
// like receipts: RFD-0007-1, RFD-0007-2 ... by refund order on the invoice. ----
export function sortedRefunds(invoice) {
  return ((invoice && invoice.pet_refunds) || []).slice().sort(function (a, b) {
    var d = new Date(a.refunded_at).getTime() - new Date(b.refunded_at).getTime();
    if (d !== 0) return d;
    var c = new Date(a.created_at || a.refunded_at).getTime() - new Date(b.created_at || b.refunded_at).getTime();
    if (c !== 0) return c;
    return String(a.id) < String(b.id) ? -1 : 1;
  });
}

export function refundReceiptFor(invoice, refundId) {
  var list = sortedRefunds(invoice);
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].id === refundId) { idx = i; break; } }
  if (idx === -1) return null;
  var refundedToDate = 0;
  for (var j = 0; j <= idx; j++) refundedToDate += list[j].amount;
  var num = String((invoice && invoice.invoice_number) || "");
  var base = /^INV-/i.test(num) ? num.replace(/^INV-/i, "") : num;
  var paid = (invoice && invoice.amount_paid) || 0;
  return {
    refund: list[idx],
    number: "RFD-" + base + "-" + (idx + 1),
    refundedToDate: refundedToDate,
    keptAfter: Math.max(0, paid - refundedToDate),
    isLatest: idx === list.length - 1,
  };
}

export function latestRefundId(invoice) {
  var list = sortedRefunds(invoice);
  return list.length ? list[list.length - 1].id : null;
}
