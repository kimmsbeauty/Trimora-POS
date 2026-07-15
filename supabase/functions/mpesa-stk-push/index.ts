// supabase/functions/mpesa-stk-push/index.ts
//
// Initiates an M-Pesa STK Push (Lipa na M-Pesa Express) for a given salon.
//
// Called by the POS frontend when the customer selects M-Pesa and the
// staff taps "Send STK Push". The frontend passes the salon_id, amount,
// and customer phone. This function:
//   1. Verifies the caller is an authenticated device belonging to the
//      requested salon_id (audit High-1)
//   2. Loads that salon's Daraja credentials from salon_mpesa_config
//   3. Gets a Daraja OAuth token
//   4. Calls the STK Push API
//   5. Saves a pending record to salon_mpesa_payments
//   6. Returns the CheckoutRequestID so the frontend can poll for status
//
// The actual payment confirmation arrives asynchronously via the
// mpesa-callback function -- this function only initiates the push.
//
// Security note (audit Critical-2): the CallBackURL we register with
// Safaricom includes a per-payment secret token (?t=...), generated
// here and stored server-side only in salon_mpesa_payments.callback_token.
// It is NEVER included in this function's response to the frontend --
// only checkout_request_id/merchant_request_id (needed for polling) are.
// mpesa-callback requires this token to match before processing an
// update, so knowing checkout_request_id alone (which the frontend does
// legitimately need, for polling) is not enough to forge a callback.
//
// Security note (audit High-1): previously this function accepted any
// salon_id in the request body with no proof the caller belonged to that
// salon -- salon_id is intentionally public (resolved from the booking-
// page slug), so anyone could trigger unwanted M-Pesa payment prompts to
// arbitrary phone numbers "as" any salon. The caller's device-auth
// bearer token is now required to resolve (via salon_auth_users) to the
// same salon_id present in the request body.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // job_id is optional -- present when this push was initiated from
    // Trimora Auto's Board page (Section: Auto Phase 5). POS's checkout
    // never sends it, so this is purely additive.
    const { salon_id, amount, phone, reference, job_id } = await req.json();

    if (!salon_id || !amount || !phone) {
      return new Response(
        JSON.stringify({ error: "salon_id, amount and phone are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Use service role client to read credentials (bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // -- Verify the caller is an authenticated device for this salon
    //    (audit High-1) -----------------------------------------------
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
        "mpesa-stk-push: salon mismatch -- caller belongs to", callerAuthRow?.salon_id,
        "requested", salon_id
      );
      return new Response(
        JSON.stringify({ error: "Not authorized for this salon." }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // This client uses the service role key, which bypasses RLS entirely -
    // suspension must be checked explicitly here, RLS won't catch it.
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

    // Normalise phone to 254XXXXXXXXX format
    const cleanPhone = phone.replace(/\D/g, "").replace(/^0/, "254").replace(/^(\+254)/, "254");
    if (!/^2547\d{8}$/.test(cleanPhone) && !/^2541\d{8}$/.test(cleanPhone)) {
      return new Response(
        JSON.stringify({ error: "Invalid Kenyan phone number" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Basic abuse guard: cap STK pushes to the same phone number, since
    // each one is an unwanted payment prompt on someone's real phone if
    // misused, separate from any cost concern.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: recentPushCount } = await supabase
      .from("salon_mpesa_payments")
      .select("*", { count: "exact", head: true })
      .eq("phone", cleanPhone)
      .gte("created_at", tenMinutesAgo);

    if ((recentPushCount || 0) >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many payment requests to this number recently. Please wait a few minutes and try again." }),
        { status: 429, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Load this salon's Daraja credentials
    const { data: config, error: configError } = await supabase
      .from("salon_mpesa_config")
      .select("consumer_key, consumer_secret, shortcode, transaction_type")
      .eq("salon_id", salon_id)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ error: "M-Pesa not configured for this salon" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // -- Step 1: Get OAuth token from Daraja --------------------------
    const authString = btoa(`${config.consumer_key}:${config.consumer_secret}`);
    const tokenRes = await fetch(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        method: "GET",
        headers: { Authorization: `Basic ${authString}` },
      }
    );

    if (!tokenRes.ok) {
      const tokenErr = await tokenRes.text();
      console.error("Daraja token error:", tokenErr);
      return new Response(
        JSON.stringify({ error: "Failed to authenticate with Daraja" }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { access_token } = await tokenRes.json();

    // -- Step 2: Build STK Push payload --------------------------------
    // For Buy Goods (CustomerBuyGoodsOnline):
    //   - BusinessShortCode = the Till number
    //   - Password = base64(shortcode + shortcode + timestamp)
    //     Note: for Buy Goods, Safaricom uses shortcode+shortcode (not passkey)
    //   - PartyB = the Till number (same as BusinessShortCode)
    //   - AccountReference = not used but must be present (use salon name or ref)

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .slice(0, 14); // YYYYMMDDHHmmss

    // Buy Goods password: base64(shortcode + shortcode + timestamp)
    const password = btoa(`${config.shortcode}${config.shortcode}${timestamp}`);

    // Per-payment callback secret -- see security note at top of file.
    const callbackToken = randomToken();

    // Callback URL -- points to our mpesa-callback Edge Function, with
    // the per-payment secret token appended.
    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mpesa-callback?t=${callbackToken}`;

    const stkPayload = {
      BusinessShortCode: config.shortcode,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   config.transaction_type, // CustomerBuyGoodsOnline
      Amount:            Math.ceil(amount),        // Must be integer
      PartyA:            cleanPhone,               // Customer phone
      PartyB:            config.shortcode,         // Till number
      PhoneNumber:       cleanPhone,               // Customer phone (same)
      CallBackURL:       callbackUrl,
      AccountReference:  (reference || "Payment").slice(0, 12),
      TransactionDesc:   "Payment",
    };

    // -- Step 3: Initiate STK Push ---------------------------------------
    const stkRes = await fetch(
      "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(stkPayload),
      }
    );

    const stkData = await stkRes.json();
    console.log("STK Push response:", JSON.stringify(stkData));

    if (!stkRes.ok || stkData.ResponseCode !== "0") {
      return new Response(
        JSON.stringify({
          error: stkData.errorMessage || stkData.ResponseDescription || "STK Push failed",
          details: stkData,
        }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // -- Step 4: Save pending payment record ------------------------------
    const { error: insertError } = await supabase
      .from("salon_mpesa_payments")
      .insert({
        salon_id,
        checkout_request_id: stkData.CheckoutRequestID,
        merchant_request_id: stkData.MerchantRequestID,
        amount:    Math.ceil(amount),
        phone:     cleanPhone,
        reference: reference || null,
        job_id:    job_id || null,
        status:    "pending",
        callback_token: callbackToken,
      });

    if (insertError) {
      console.error("Insert payment record error:", insertError);
      // Don't fail the request -- STK was already sent. Log and continue.
    }

    // -- Step 5: Return CheckoutRequestID for frontend polling ------------
    // Note: callback_token is intentionally NOT included here -- it must
    // never reach the client. See security note at top of file.
    return new Response(
      JSON.stringify({
        success:              true,
        checkout_request_id:  stkData.CheckoutRequestID,
        merchant_request_id:  stkData.MerchantRequestID,
        response_description: stkData.ResponseDescription,
        customer_message:     stkData.CustomerMessage,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("mpesa-stk-push error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
