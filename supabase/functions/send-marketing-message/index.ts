// supabase/functions/send-marketing-message/index.ts
//
// Sends one marketing SMS for a given campaign + customer.
// Receives: { campaign_id, customer_id, salon_id }
//
// Steps:
//   0. Verifies the caller is an authenticated device belonging to the
//      requested salon_id (audit High-2).
//   1. Confirms the salon isn't suspended (service-role calls bypass RLS,
//      so this has to be checked explicitly here, not left to RLS).
//   2. Basic abuse guard: caps sends to 300/salon/rolling hour.
//   3. Confirms SMS marketing is switched on for this salon.
//   4. Loads the campaign (template, active flag) and customer (name,
//      phone, opt-out).
//   5. Refuses to send if the customer has opted out.
//   6. Renders {{customer_name}} / {{salon_name}}, appends the compliance
//      opt-out line.
//   7. Sends via Africa's Talking using Trimora's shared credentials.
//   8. Logs the result to marketing_messages.
//
// Security note (audit High-2): previously this function accepted any
// salon_id/campaign_id/customer_id in the request body with no proof the
// caller belonged to that salon -- salon_id is intentionally public, so
// anyone could trigger SMS sends billed to Trimora's shared Africa's
// Talking credentials, up to the per-salon hourly cap, across every
// tenant. The caller's device-auth bearer token is now required to
// resolve (via salon_auth_users) to the same salon_id present in the
// request body.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_PER_HOUR = 300;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { campaign_id, customer_id, salon_id } = await req.json();

    if (!campaign_id || !customer_id || !salon_id) {
      return new Response(
        JSON.stringify({ error: "campaign_id, customer_id and salon_id are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Gate 0: verify the caller is an authenticated device for this
    //    salon (audit High-2) ────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    const callerToken = authHeader.replace(/^Bearer\s+/i, "");

    if (!callerToken) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { data: callerData, error: callerError } = await supabase.auth.getUser(callerToken);
    if (callerError || !callerData?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session. Please refresh and try again." }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { data: callerAuthRow } = await supabase
      .from("salon_auth_users")
      .select("salon_id")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (!callerAuthRow || callerAuthRow.salon_id !== salon_id) {
      console.warn(
        "send-marketing-message: salon mismatch -- caller belongs to", callerAuthRow?.salon_id,
        "requested", salon_id
      );
      return new Response(
        JSON.stringify({ error: "Not authorized for this salon." }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Gate 1: suspension — checked explicitly, RLS doesn't apply here ──
    const { data: salonRow } = await supabase
      .from("salons")
      .select("suspended")
      .eq("id", salon_id)
      .single();

    if (salonRow && salonRow.suspended) {
      return new Response(
        JSON.stringify({ error: "This salon's account is currently suspended." }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Gate 2: basic abuse guard ────────────────────────────────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("marketing_messages")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salon_id)
      .gte("created_at", oneHourAgo);

    if ((recentCount || 0) >= RATE_LIMIT_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: "Hourly sending limit reached for this salon. Please try again later." }),
        { status: 429, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Gate 3: is SMS marketing switched on for this salon? ───────────
    const { data: config } = await supabase
      .from("salon_marketing_config")
      .select("is_sms_active")
      .eq("salon_id", salon_id)
      .single();

    if (!config || !config.is_sms_active) {
      return new Response(
        JSON.stringify({ error: "SMS marketing is not active for this salon" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Load campaign ───────────────────────────────────────────────────
    const { data: campaign, error: campaignError } = await supabase
      .from("marketing_campaigns")
      .select("id, message_template, is_active")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign || !campaign.is_active) {
      return new Response(
        JSON.stringify({ error: "Campaign not found or inactive" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Load customer ───────────────────────────────────────────────────
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, name, phone, marketing_opt_out")
      .eq("id", customer_id)
      .single();

    if (customerError || !customer) {
      return new Response(
        JSON.stringify({ error: "Customer not found" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Gate 4: opt-out check (non-negotiable, per the Brief) ──────────
    if (customer.marketing_opt_out) {
      return new Response(
        JSON.stringify({ error: "Customer has opted out of marketing messages" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Load salon name for {{salon_name}} ──────────────────────────────
    const { data: salon } = await supabase
      .from("salons")
      .select("name")
      .eq("id", salon_id)
      .single();

    // ── Render template ──────────────────────────────────────────────────
    let message = campaign.message_template
      .replace(/\{\{customer_name\}\}/g, customer.name || "")
      .replace(/\{\{salon_name\}\}/g, (salon && salon.name) || "");

    if (!/stop/i.test(message)) {
      message += " Reply STOP to unsubscribe.";
    }

    // ── Normalise phone to 254XXXXXXXXX ─────────────────────────────────
    const cleanPhone = (customer.phone || "")
      .replace(/\D/g, "")
      .replace(/^0/, "254")
      .replace(/^(\+254)/, "254");

    if (!/^2547\d{8}$/.test(cleanPhone) && !/^2541\d{8}$/.test(cleanPhone)) {
      return new Response(
        JSON.stringify({ error: "Customer has no valid Kenyan phone number on file" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Log a pending row before sending, so a crash mid-send is still recorded ──
    const { data: msgRow } = await supabase
      .from("marketing_messages")
      .insert({
        salon_id, campaign_id, customer_id,
        channel: "sms",
        phone_number: cleanPhone,
        message_body: message,
        status: "pending",
      })
      .select()
      .single();

    // ── Send via Africa's Talking (shared Trimora credentials) ──────────
    const atRes = await fetch("https://api.sandbox.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        apiKey: Deno.env.get("AT_API_KEY")!,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        username: Deno.env.get("AT_USERNAME")!,
        to: `+${cleanPhone}`,
        message,
      }),
    });

    const atData = await atRes.json();
    const recipient = atData?.SMSMessageData?.Recipients?.[0];
    const sendSucceeded = !!recipient && (recipient.status === "Success" || recipient.statusCode === 101);

    if (msgRow) {
      await supabase
        .from("marketing_messages")
        .update({
          status: sendSucceeded ? "sent" : "failed",
          provider_message_id: recipient?.messageId || null,
          sent_at: sendSucceeded ? new Date().toISOString() : null,
          error_message: sendSucceeded ? null : (recipient?.status || atData?.error || "Unknown error"),
        })
        .eq("id", msgRow.id);
    }

    return new Response(
      JSON.stringify({ success: sendSucceeded, provider_response: atData }),
      { status: sendSucceeded ? 200 : 502, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("send-marketing-message error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
