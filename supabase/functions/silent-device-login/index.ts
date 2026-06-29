// supabase/functions/silent-device-login/index.ts
//
// Silently establishes a device session for a salon without requiring
// any human-typed credentials.
//
// Flow:
//  1. Look up salon_auth_users + salon_device_secrets for this salon_id
//  2. Attempt password grant with stored secret
//  3. If password grant fails (secret out of sync — e.g. after a PIN reset
//     which sets a placeholder password), auto-resync: generate a new secret,
//     update Auth password, upsert secret, retry grant
//  4. Return access_token + refresh_token

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function attemptPasswordGrant(supabaseUrl: string, serviceKey: string, email: string, password: string) {
  const res = await fetch(supabaseUrl + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ? data : null;
}

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Check suspension
    const { data: salonRow } = await supabase
      .from("salons")
      .select("suspended")
      .eq("id", salon_id)
      .single();

    if (salonRow && salonRow.suspended) {
      return new Response(JSON.stringify({ error: "This salon's account is currently suspended." }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Get auth user
    const { data: authUserRow, error: authUserError } = await supabase
      .from("salon_auth_users")
      .select("id")
      .eq("salon_id", salon_id)
      .single();

    if (authUserError || !authUserRow) {
      return new Response(JSON.stringify({ error: "No device account found for this salon. Please contact support." }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Get stored secret
    const { data: secretRow, error: secretError } = await supabase
      .from("salon_device_secrets")
      .select("secret")
      .eq("salon_id", salon_id)
      .single();

    if (secretError || !secretRow) {
      return new Response(JSON.stringify({ error: "Device login not set up for this salon yet. Please contact support." }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Get email
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(authUserRow.id);
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "Could not resolve device account. Please contact support." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const email = userData.user.email;

    // Attempt 1: use stored secret
    let tokenData = await attemptPasswordGrant(supabaseUrl, serviceKey, email, secretRow.secret);

    // Attempt 2: if grant failed, auto-resync secret and retry
    // This heals the mismatch caused by PIN reset setting a placeholder password
    if (!tokenData) {
      console.log("Password grant failed for salon", salon_id, "— auto-resyncing device secret");

      const newSecret = randomSecret();

      const { error: updateError } = await supabase.auth.admin.updateUserById(authUserRow.id, {
        password: newSecret,
      });

      if (updateError) {
        console.error("Auto-resync: updateUserById failed:", updateError);
        return new Response(JSON.stringify({ error: "Could not establish device session. Please contact support." }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      const { error: upsertError } = await supabase
        .from("salon_device_secrets")
        .upsert({ salon_id, secret: newSecret });

      if (upsertError) {
        console.error("Auto-resync: upsert failed:", upsertError);
        return new Response(JSON.stringify({ error: "Could not establish device session. Please contact support." }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // Retry grant with new secret
      tokenData = await attemptPasswordGrant(supabaseUrl, serviceKey, email, newSecret);

      if (!tokenData) {
        console.error("Auto-resync: retry grant still failed for salon", salon_id);
        return new Response(JSON.stringify({ error: "Could not establish device session. Please contact support." }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      console.log("Auto-resync successful for salon", salon_id);
    }

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
