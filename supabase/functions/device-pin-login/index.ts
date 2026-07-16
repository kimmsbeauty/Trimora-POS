// supabase/functions/device-pin-login/index.ts
//
// Real fix for audit Critical-1 (device impersonation via
// silent-device-login, which minted a full session for any salon_id
// with zero proof of caller legitimacy -- salon_id is intentionally
// public, resolved from the booking-page slug).
//
// This function makes PIN entry itself both verify identity AND
// establish the device session, in one step -- instead of silently
// establishing a session first (old flow) and checking the PIN only
// after, which made the PIN screen cosmetic on top of an already-open
// session.
//
// Receives: { salon_id, role, pin }
// Flow:
//   1. Check salon isn't suspended
//   2. Verify the PIN via verify_pin_for_device_login (handles lockout,
//      bcrypt/legacy-md5 comparison, attempt logging -- see that
//      function's own comments). That RPC is service_role-only; it
//      cannot be called directly by a client.
//   3. On a correct PIN: mint a device session for this salon (same
//      self-healing password-grant logic silent-device-login uses --
//      look up / provision a device secret, get an Auth token for it).
//   4. Return access_token + refresh_token + role.
//   5. On an incorrect PIN (or lockout): generic failure, no session
//      minted, no distinguishing detail leaked about why.
//
// NOTE: this deliberately does NOT repeat the old (already remediated)
// device-pin-login mistake found during the audit, where a client-side
// test snippet -- containing a live salon_id, role, and PIN in plaintext
// -- was accidentally deployed as this function's body. This is a fresh,
// real implementation.

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
    const { salon_id, role, pin } = await req.json();

    if (!salon_id || !role || !pin) {
      return new Response(JSON.stringify({ error: "salon_id, role and pin are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check suspension before even checking the PIN
    const { data: salonRow } = await supabase
      .from("salons")
      .select("suspended")
      .eq("id", salon_id)
      .single();

    if (salonRow && salonRow.suspended) {
      return new Response(JSON.stringify({ error: "This salon's account is currently suspended." }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Verify the PIN (lockout, bcrypt/legacy-md5, attempt logging all
    // handled inside this service_role-only RPC -- see its own comments)
    const { data: pinOk, error: pinError } = await supabase.rpc("verify_pin_for_device_login", {
      p_salon_id: salon_id,
      p_role: role,
      p_pin: pin,
    });

    if (pinError) {
      console.error("device-pin-login: verify_pin_for_device_login error:", pinError);
      return new Response(JSON.stringify({ error: "Could not verify PIN. Please try again." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (pinOk !== true) {
      // Deliberately generic -- don't distinguish "wrong PIN" from
      // "locked out" from "no such role" here.
      return new Response(JSON.stringify({ error: "Incorrect PIN." }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // -- PIN correct: establish the device session -----------------------
    const { data: authUserRow, error: authUserError } = await supabase
      .from("salon_auth_users")
      .select("id")
      .eq("salon_id", salon_id)
      .single();

    if (authUserError || !authUserRow) {
      return new Response(JSON.stringify({ error: "No device account found for this salon. Please contact support." }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(authUserRow.id);
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "Could not resolve device account. Please contact support." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const email = userData.user.email;

    const { data: secretRow } = await supabase
      .from("salon_device_secrets")
      .select("secret")
      .eq("salon_id", salon_id)
      .maybeSingle();

    let tokenData = secretRow ? await attemptPasswordGrant(supabaseUrl, serviceKey, email, secretRow.secret) : null;

    if (!tokenData) {
      // No secret yet, or it's stale -- (re)provision, same self-healing
      // logic silent-device-login uses.
      const newSecret = randomSecret();

      const { error: updateError } = await supabase.auth.admin.updateUserById(authUserRow.id, {
        password: newSecret,
      });
      if (updateError) {
        console.error("device-pin-login: updateUserById failed:", updateError);
        return new Response(JSON.stringify({ error: "Could not establish device session. Please contact support." }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      const { error: upsertError } = await supabase
        .from("salon_device_secrets")
        .upsert({ salon_id, secret: newSecret });
      if (upsertError) {
        console.error("device-pin-login: upsert failed:", upsertError);
        return new Response(JSON.stringify({ error: "Could not establish device session. Please contact support." }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      tokenData = await attemptPasswordGrant(supabaseUrl, serviceKey, email, newSecret);
      if (!tokenData) {
        console.error("device-pin-login: retry grant still failed for salon", salon_id);
        return new Response(JSON.stringify({ error: "Could not establish device session. Please contact support." }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
      }
    }

    return new Response(
      JSON.stringify({
        success:       true,
        access_token:  tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in:    tokenData.expires_in,
        role:          role,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("device-pin-login error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
