// supabase/functions/silent-device-login/index.ts
//
// Replaces the human-facing email+password device login entirely.
// Receives: { salon_id }
//
// Looks up the salon's Auth user and its stored secret (set once via
// admin-set-device-secret), then signs in using the exact same plain
// password-grant endpoint the old human-typed login already used
// successfully - just triggered server-side, with a secret nobody ever
// sees or types. Deliberately lightweight: one DB lookup, one Admin API
// call, one plain HTTP fetch - no generateLink/verifyOtp, which is the
// likely cause of device-pin-login's resource-limit failures.
//
// No PIN involved at this stage at all - the PIN screen continues to
// work exactly as it always has, completely unchanged, once this has
// silently established a device session in the background.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { salon_id } = await req.json();
    if (!salon_id) {
      return new Response(JSON.stringify({ error: "salon_id is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: salonRow } = await supabase
      .from("salons")
      .select("suspended")
      .eq("id", salon_id)
      .single();

    if (salonRow && salonRow.suspended) {
      return new Response(JSON.stringify({ error: "This salon's account is currently suspended." }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const { data: authUserRow, error: authUserError } = await supabase
      .from("salon_auth_users")
      .select("id")
      .eq("salon_id", salon_id)
      .single();

    if (authUserError || !authUserRow) {
      return new Response(JSON.stringify({ error: "No device account found for this salon. Please contact support." }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const { data: secretRow, error: secretError } = await supabase
      .from("salon_device_secrets")
      .select("secret")
      .eq("salon_id", salon_id)
      .single();

    if (secretError || !secretRow) {
      return new Response(JSON.stringify({ error: "Device login not set up for this salon yet. Please contact support." }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(authUserRow.id);
    if (userError || !userData || !userData.user || !userData.user.email) {
      console.error("getUserById error:", userError);
      return new Response(JSON.stringify({ error: "Could not resolve device account. Please contact support." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Same exact endpoint the human-typed login already uses successfully -
    // just called server-side with a secret nobody ever needs to know.
    const tokenRes = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: {
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: userData.user.email, password: secretRow.secret }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("password grant failed:", errBody);
      return new Response(JSON.stringify({ error: "Could not establish device session. Please contact support." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const tokenData = await tokenRes.json();

    return new Response(
      JSON.stringify({
        success: true,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("silent-device-login error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
