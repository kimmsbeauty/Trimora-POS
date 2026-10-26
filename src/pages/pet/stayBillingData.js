// src/pages/pet/stayBillingData.js
//
// Pure helpers for billing a boarding stay (migration 107). The DATABASE decides the real
// charge (pet_invoice_stay); this only previews it. Policy: the full booked stay is always
// charged (leaving early changes nothing), each late day is one extra night at the stay's rate,
// staff may reduce the late days (0 = waive) and add a discount.

export function clampLateDays(value, max) {
  var n = Math.floor(Number(value));
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, Math.max(0, max || 0));
}

// Same arithmetic as the database: percent discounts are rounded, amount discounts are whole shillings.
export function previewTotals(input) {
  var nights = Math.max(1, Math.floor(Number(input.nights) || 0));
  var rate = Math.max(0, Math.floor(Number(input.rate) || 0));
  var late = clampLateDays(input.lateDays, input.maxLateDays);
  var subtotal = (nights + late) * rate;
  var discount = 0;
  if (input.discountType === "percent") discount = Math.round(subtotal * Math.min(100, Math.max(0, Number(input.discountValue) || 0)) / 100);
  else discount = Math.min(subtotal, Math.max(0, Math.floor(Number(input.discountValue) || 0)));
  return { nightsTotal: nights * rate, lateTotal: late * rate, subtotal: subtotal, discount: discount, total: subtotal - discount, lateDays: late };
}

// A stay that can be billed from the "to invoice" list: checked out, has a rate and a service, no live invoice yet.
export function stayNeedsInvoice(stay, invoicedStayIds) {
  return !!stay && stay.status === "checked-out" && !!stay.service_id && Number(stay.nightly_rate) > 0 && !(invoicedStayIds || {})[stay.id];
}

var ERROR_TEXT = {
  NOT_AUTHENTICATED: "Please sign in again.",
  STAY_NOT_FOUND: "That stay could not be found. Refresh and try again.",
  STAY_NOT_CHECKED_OUT: "Check the pet out before billing the stay.",
  STAY_SERVICE_MISSING: "This stay's boarding service was removed, so it can't be billed here. Create the invoice from the Invoices screen.",
  STAY_NO_RATE: "This stay has no nightly rate, so it can't be billed here. Create the invoice from the Invoices screen.",
  STAY_ALREADY_INVOICED: "This stay already has an invoice. Void it first if it needs to be billed again.",
  INVALID_LATE_DAYS: "The late days can't be more than the dates support. Refresh and try again.",
  INVALID_DISCOUNT: "That discount isn't valid for this total.",
  AMOUNT_TOO_LARGE: "That total is too large.",
  SETTINGS_MISSING: "Invoice settings are missing for this business.",
};
export function stayBillingErrorMessage(raw) {
  var text = String(raw || "");
  var codes = Object.keys(ERROR_TEXT);
  for (var i = 0; i < codes.length; i++) if (text.indexOf(codes[i]) !== -1) return ERROR_TEXT[codes[i]];
  if (text === "Network error") return "Couldn't reach the server. Check your connection and try again.";
  return "Couldn't create the invoice. Check your connection and try again.";
}
