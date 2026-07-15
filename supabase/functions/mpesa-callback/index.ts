// supabase/functions/mpesa-callback/index.ts
//
// Receives asynchronous payment result callbacks from Safaricom Daraja
// for STK Push transactions initiated by mpesa-stk-push.
//
// Security note (audit Critical-2): this endpoint has no way to verify
// the caller is actually Safaricom via network-level means we can fully
// trust (no verified, current Safaricom IP list was available to build
// against, and verify_jwt would only require -any- valid Supabase JWT,
// which the public anon key already satisfies -- no real barrier).
// Instead, mpesa-stk-push embeds a per-payment secret token in the
// CallBackURL it registers with Safaricom (?t=...), stored server-side
// only in salon_mpesa_payments.callback_token and never sent to the
// frontend. This function requires that token to match before processing
// any update -- knowing checkout_request_id alone (which the frontend
// legitimately has, for polling) is not sufficient to forge a callback.
//
// Always responds 200 "Accepted" regardless of outcome (including a
// token mismatch) -- both to satisfy Safaricom's retry contract and to
// avoid giving a forger a distinguishing signal between "wrong token"
// and "processed".

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ACCEPTED = new Response(
  JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const providedToken = url.searchParams.get("t");

    const body = await req.json();
    console.log("M-Pesa callback received:", JSON.stringify(body));

    const callback = body?.Body?.stkCallback;
    if (!callback) {
      return ACCEPTED;
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // -- Verify this callback corresponds to a payment we actually
    //    initiated, using the per-payment secret (see note above) --
    const { data: paymentRow, error: lookupError } = await supabase
      .from("salon_mpesa_payments")
      .select("callback_token")
      .eq("checkout_request_id", CheckoutRequestID)
      .maybeSingle();

    if (lookupError) {
      console.error("mpesa-callback: payment lookup failed:", lookupError);
      return ACCEPTED;
    }

    if (!paymentRow) {
      console.warn("mpesa-callback: no payment found for CheckoutRequestID", CheckoutRequestID);
      return ACCEPTED;
    }

    if (!providedToken || !paymentRow.callback_token || providedToken !== paymentRow.callback_token) {
      console.warn(
        "mpesa-callback: token mismatch for CheckoutRequestID", CheckoutRequestID,
        "-- ignoring (possible forged callback, or a pre-migration payment row with no stored token)"
      );
      return ACCEPTED;
    }

    const succeeded = ResultCode === 0 || ResultCode === "0";

    let mpesaReceipt = null;
    if (succeeded && CallbackMetadata?.Item) {
      const receiptItem = CallbackMetadata.Item.find((i) => i.Name === "MpesaReceiptNumber");
      if (receiptItem) mpesaReceipt = receiptItem.Value ?? null;
    }

    await supabase
      .from("salon_mpesa_payments")
      .update({
        status:        succeeded ? "confirmed" : "failed",
        result_code:   String(ResultCode),
        result_desc:   ResultDesc,
        mpesa_receipt: mpesaReceipt,
        updated_at:    new Date().toISOString(),
      })
      .eq("checkout_request_id", CheckoutRequestID);

    return ACCEPTED;

  } catch (err) {
    console.error("mpesa-callback error:", err);
    return ACCEPTED;
  }
});
