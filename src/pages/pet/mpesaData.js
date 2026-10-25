// src/pages/pet/mpesaData.js
//
// Pure helpers for Pet's M-Pesa STK Push (no network, no React). The push itself is
// started by the mpesa-stk-push Edge Function; Safaricom's result arrives at
// mpesa-callback; the DATABASE (migration 099) decides whether a payment is confirmed.
// Nothing here ever decides that money arrived.

export var POLL_MS = 3000;
export var MAX_POLLS = 40; // 40 x 3s = 120s, same as Salon and Auto

// Safaricom numbers only, as the Edge Function accepts them: 2547XXXXXXXX or 2541XXXXXXXX.
export function normalizeKenyanPhone(raw) {
  var d = String(raw || "").replace(/\D/g, "");
  if (d.indexOf("0") === 0) d = "254" + d.slice(1);
  else if ((d.indexOf("7") === 0 || d.indexOf("1") === 0) && d.length === 9) d = "254" + d;
  return /^254[17]\d{8}$/.test(d) ? d : null;
}

// A poll result from pet_mpesa_status -> what the screen should do.
export function interpretStatus(rows) {
  var row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return { state: "waiting" };
  if (row.status === "confirmed" && row.mpesa_receipt) return { state: "confirmed", receipt: row.mpesa_receipt, amount: row.amount };
  if (row.status === "failed") return { state: "failed", reason: row.result_desc || "" };
  return { state: "waiting" };
}

var ERROR_TEXT = {
  MPESA_NOT_CONFIRMED: "Safaricom hasn't confirmed this payment yet.",
  MPESA_PAYMENT_NOT_FOUND: "That M-Pesa payment could not be found.",
  MPESA_PAYMENT_MISMATCH: "That M-Pesa payment was requested for a different invoice.",
  "M-Pesa not configured": "M-Pesa isn't set up for this business yet. Add the Till number in Settings, or record the payment by its M-Pesa code.",
  "Invalid Kenyan phone number": "That isn't a valid Safaricom number.",
  "Too many payment requests": "Too many payment requests to this number recently. Wait a few minutes and try again.",
  "more than is still owed": "That is more than is still owed on this invoice.",
  "can't take a payment": "This invoice can't take a payment.",
  "currently suspended": "This account is suspended.",
};
export function mpesaErrorMessage(raw) {
  var text = String(raw || "");
  var keys = Object.keys(ERROR_TEXT);
  for (var i = 0; i < keys.length; i++) if (text.indexOf(keys[i]) !== -1) return ERROR_TEXT[keys[i]];
  if (text === "Network error") return "Couldn't reach the server. If the customer was prompted, check below before sending again.";
  return "The M-Pesa request didn't go through. Try again, or record the payment by its M-Pesa code.";
}
