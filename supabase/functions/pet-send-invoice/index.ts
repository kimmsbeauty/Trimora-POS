// supabase/functions/pet-send-invoice/index.ts
//
// Sends one Trimora Pet invoice to the customer by EMAIL (Resend) or WHATSAPP (Meta WhatsApp Cloud API).
// Receives: { salon_id, invoice_id, channel: "email" | "whatsapp", to?: string }
//
//   0. The caller must be an authenticated device of the requested salon (same gate as mpesa-stk-push).
//   1. The business must not be suspended.
//   2. The invoice is loaded from the database for THIS salon. The message text and amounts are built
//      here from the saved row; nothing the browser says about the invoice is trusted. Void invoices
//      are refused.
//   3. The recipient is `to` if given (staff can correct a number or address), else the customer's
//      email (pet profile) or phone. It is validated.
//   4. Sending limits, from pet_invoice_messages: 100 attempts per business per hour and 10 per
//      invoice per day. Every attempt, sent or failed, is logged there.
//   5. The provider call. If the provider's secrets are not set the answer is 503 NOT_CONFIGURED and
//      nothing is logged (the app then offers to open the customer's own app instead).
//
// Secrets (Supabase function secrets, set by Trimora, shared across businesses):
//   RESEND_API_KEY, RESEND_FROM  (a sender address on a domain verified in Resend)
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, optional WHATSAPP_INVOICE_TEMPLATE, WHATSAPP_TEMPLATE_LANG
//
// "sent" means the provider accepted the message. It does not confirm the customer received or read it.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildText, buildHtml, emailSubject, isEmail, normalizePhone, resendPayload, whatsappPayload, whatsappParams,
} from "./lib.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SALON_PER_HOUR = 100;
const INVOICE_PER_DAY = 10;

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// WhatsApp error codes worth a plain-language answer.
function whatsappError(code: number | undefined): string {
  if (code === 131047 || code === 131051) return "WHATSAPP_WINDOW_CLOSED";
  if (code === 131026) return "WHATSAPP_NOT_REACHABLE";
  if (code === 132001 || code === 132000) return "WHATSAPP_TEMPLATE_PROBLEM";
  return "SEND_FAILED";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { salon_id, invoice_id, channel, to } = await req.json();
    if (!salon_id || !invoice_id || (channel !== "email" && channel !== "whatsapp")) {
      return reply(400, { error: "salon_id, invoice_id and channel (email or whatsapp) are required" });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // -- Gate 0: caller is an authenticated device of this salon
    const callerToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!callerToken) return reply(401, { error: "Missing Authorization header" });
    const { data: callerData, error: callerError } = await supabase.auth.getUser(callerToken);
    if (callerError || !callerData?.user?.id) return reply(401, { error: "Invalid or expired session. Please refresh and try again." });
    const { data: callerAuthRow } = await supabase.from("salon_auth_users").select("salon_id").eq("id", callerData.user.id).maybeSingle();
    if (!callerAuthRow || callerAuthRow.salon_id !== salon_id) return reply(403, { error: "Not authorized for this salon." });

    // -- Gate 1: suspension (the service role bypasses RLS, so check it here)
    const { data: salonRow } = await supabase.from("salons").select("name, suspended").eq("id", salon_id).single();
    if (salonRow && salonRow.suspended) return reply(403, { error: "This salon's account is currently suspended." });

    // -- Provider configured? Checked before anything is logged.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM");
    const waToken = Deno.env.get("WHATSAPP_TOKEN");
    const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    if (channel === "email" && (!resendKey || !resendFrom)) return reply(503, { error: "NOT_CONFIGURED" });
    if (channel === "whatsapp" && (!waToken || !waPhoneId)) return reply(503, { error: "NOT_CONFIGURED" });

    // -- Gate 2: the invoice, from the database, for this salon
    const { data: invoice } = await supabase
      .from("pet_invoices")
      .select("*, pet_invoice_lines(*)")
      .eq("id", invoice_id).eq("salon_id", salon_id).maybeSingle();
    if (!invoice) return reply(404, { error: "INVOICE_NOT_FOUND" });
    if (invoice.status === "void") return reply(409, { error: "INVOICE_VOID" });

    const { data: customer } = await supabase.from("customers").select("name, phone").eq("id", invoice.customer_id).eq("salon_id", salon_id).maybeSingle();
    const { data: profile } = await supabase.from("pet_customer_profiles").select("email").eq("customer_id", invoice.customer_id).eq("salon_id", salon_id).maybeSingle();
    const { data: pet } = invoice.pet_id
      ? await supabase.from("pet_pets").select("name").eq("id", invoice.pet_id).eq("salon_id", salon_id).maybeSingle()
      : { data: null };
    const { data: settings } = await supabase.from("salon_settings").select("contact_phone, receipt_footer_message").eq("salon_id", salon_id).maybeSingle();
    const biz = { name: salonRow?.name, contact_phone: settings?.contact_phone, receipt_footer_message: settings?.receipt_footer_message };

    // -- Gate 3: recipient
    let recipient: string;
    if (channel === "email") {
      const candidate = (typeof to === "string" && to.trim()) ? to.trim() : (profile?.email || "");
      if (!isEmail(candidate)) return reply(400, { error: "INVALID_EMAIL" });
      recipient = candidate;
    } else {
      const candidate = normalizePhone((typeof to === "string" && to.trim()) ? to : customer?.phone);
      if (!candidate) return reply(400, { error: "INVALID_PHONE" });
      recipient = candidate;
    }

    // -- Gate 4: sending limits
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: salonCount } = await supabase.from("pet_invoice_messages").select("*", { count: "exact", head: true }).eq("salon_id", salon_id).gte("created_at", hourAgo);
    if ((salonCount || 0) >= SALON_PER_HOUR) return reply(429, { error: "RATE_LIMITED" });
    const { count: invoiceCount } = await supabase.from("pet_invoice_messages").select("*", { count: "exact", head: true }).eq("salon_id", salon_id).eq("invoice_id", invoice_id).gte("created_at", dayAgo);
    if ((invoiceCount || 0) >= INVOICE_PER_DAY) return reply(429, { error: "RATE_LIMITED_INVOICE" });

    // -- Send
    const today = new Date().toISOString().slice(0, 10);
    const text = buildText(invoice, customer?.name ?? null, pet?.name ?? null, biz, today);
    let providerId: string | null = null;
    let failure: string | null = null;

    try {
      if (channel === "email") {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
          body: JSON.stringify(resendPayload(resendFrom!, biz.name, recipient, emailSubject(invoice, biz), text,
            buildHtml(invoice, customer?.name ?? null, pet?.name ?? null, biz, today))),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { console.error("pet-send-invoice resend", r.status, JSON.stringify(j).slice(0, 300)); failure = "SEND_FAILED"; }
        else providerId = j.id || null;
      } else {
        const r = await fetch("https://graph.facebook.com/v21.0/" + waPhoneId + "/messages", {
          method: "POST",
          headers: { Authorization: "Bearer " + waToken, "Content-Type": "application/json" },
          body: JSON.stringify(whatsappPayload(recipient, Deno.env.get("WHATSAPP_INVOICE_TEMPLATE") || null,
            Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "en", text, whatsappParams(invoice, customer?.name ?? null, biz))),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { console.error("pet-send-invoice whatsapp", r.status, JSON.stringify(j).slice(0, 300)); failure = whatsappError(j?.error?.code); }
        else providerId = j?.messages?.[0]?.id || null;
      }
    } catch (e) {
      console.error("pet-send-invoice network", String(e));
      failure = "SEND_FAILED";
    }

    await supabase.from("pet_invoice_messages").insert({
      salon_id, invoice_id, channel, recipient, status: failure ? "failed" : "sent",
      provider_message_id: providerId, error: failure,
    });

    if (failure) return reply(502, { error: failure });
    return reply(200, { success: true, channel, recipient });
  } catch (e) {
    console.error("pet-send-invoice", String(e));
    return reply(500, { error: "SEND_FAILED" });
  }
});
