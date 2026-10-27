// src/pages/pet/invoiceSend.js
//
// Client for the pet-send-invoice edge function: Trimora sends the invoice itself, by email or
// WhatsApp. The browser sends only the invoice id, the channel and (optionally) a corrected
// address/number; the message is built on the server from the saved invoice.
import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/constants";
import { getValidAccessToken } from "../../lib/deviceAuth";

var TEXT = {
  NOT_CONFIGURED: "Sending straight from Trimora isn't switched on yet.",
  INVALID_EMAIL: "That email address doesn't look right. Check it and try again.",
  INVALID_PHONE: "That phone number doesn't look right. Use a number like 0712 345 678.",
  INVOICE_VOID: "A void invoice can't be sent.",
  INVOICE_NOT_FOUND: "That invoice could not be found. Refresh and try again.",
  RATE_LIMITED: "Too many messages have been sent in the last hour. Please try again later.",
  RATE_LIMITED_INVOICE: "This invoice has already been sent several times today. Please try again tomorrow.",
  WHATSAPP_WINDOW_CLOSED: "WhatsApp only lets us message this customer after they have written to the business first. Send it by email instead, or print it.",
  WHATSAPP_NOT_REACHABLE: "That number isn't on WhatsApp. Check the number, or send it by email instead.",
  WHATSAPP_TEMPLATE_PROBLEM: "The WhatsApp message template isn't working. Contact support, or send it by email instead.",
  SEND_FAILED: "The invoice could not be sent. Nothing reached the customer. Try again, or print it instead.",
};
export function sendErrorMessage(code) {
  var c = String(code || "");
  if (TEXT[c]) return TEXT[c];
  if (c === "Network error") return "Couldn't reach the server. Check your connection and try again.";
  return TEXT.SEND_FAILED;
}

// -> { ok: true, recipient } | { ok: false, code, message }
export async function sendInvoice(args) {
  try {
    var token = await getValidAccessToken();
    var res = await fetch(SUPABASE_URL + "/functions/v1/pet-send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + (token || SUPABASE_KEY) },
      body: JSON.stringify({ salon_id: args.salonId, invoice_id: args.invoiceId, channel: args.channel, to: args.to || undefined }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.success) return { ok: true, recipient: data.recipient };
    var code = data && data.error ? data.error : "SEND_FAILED";
    return { ok: false, code: code, message: sendErrorMessage(code) };
  } catch (e) {
    return { ok: false, code: "Network error", message: sendErrorMessage("Network error") };
  }
}
