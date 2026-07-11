// supabase/functions/silent-device-login/index.ts
//
// Silently establishes a device session for a salon without requiring
// any human-typed credentials.
//
// Flow:
//  1. Look up salon_auth_users for this salon_id (this one IS a hard
//     requirement -- if it's missing, something is fundamentally wrong
//     with how the salon was provisioned, not something this function
//     should try to self-heal).
//  2. Look up salon_device_secrets for this salon_id.
//  3. Attempt password grant with the stored secret, if one exists.
//  4. Auto-resync whenever attempt 3 didn't succeed -- either because
//     no secret row existed yet at all (e.g. a salon whose onboarding
//     created the Auth user but never provisioned an initial secret --
//     found and fixed 2026-07-11 for a newly onboarded car wash), or
//     because a stored secret is stale (e.g. after a PIN reset sets a
//     placeholder password). Both cases get the same fix: generate a
//     new secret, set it as the Auth user's password, upsert the
//     secret row, retry the grant.
//  5. Return access_token + refresh_token.

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

    // Get auth user -- still a hard requirement, not auto-healed. If
    // this row is missing, the salon was never provisioned with a
    // Supabase Auth user at all, which is a different, deeper problem
    // than a missing/stale secret.
    const { data: authUserRow, error: authUserError } = await supabase
      .from("salon_auth_users")
      .select("id")
      .eq("salon_id", salon_id)
      .single();

    if (authUserError || !authUserRow) {
      return new Response(JSON.stringify({ error: "No device account found for this salon. Please contact support." }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Get email
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(authUserRow.id);
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "Could not resolve device account. Please contact support." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const email = userData.user.email;

    // Get stored secret -- no longer a hard failure if missing. A
    // missing secret row and a stale/wrong secret get the same fix
    // below (auto-resync), so both fall through to that same path
    // instead of the missing-row case being a dead end.
    const { data: secretRow } = await supabase
      .from("salon_device_secrets")
      .select("secret")
      .eq("salon_id", salon_id)
      .single();

    // Attempt 1: use stored secret, if one exists
    let tokenData = secretRow ? await attemptPasswordGrant(supabaseUrl, serviceKey, email, secretRow.secret) : null;

    // Attempt 2: no secret existed yet, or the grant failed with the
    // stored one -- auto-resync: generate a new secret, set it as the
    // Auth user's password, upsert the secret row, retry.
    if (!tokenData) {
      console.log(
        secretRow
          ? "Password grant failed for salon " + salon_id + " — auto-resyncing device secret"
          : "No device secret on file for salon " + salon_id + " — provisioning one now"
      );

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
