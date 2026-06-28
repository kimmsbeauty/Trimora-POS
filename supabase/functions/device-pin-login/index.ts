// supabase/functions/device-pin-login/index.ts
//
// PIN-only device login - replaces email+password device login entirely.
// Receives: { salon_id, role, pin }
//
// 1. Confirms the salon isn't suspended (service-role bypasses RLS, so
//    this is checked explicitly, same as the other hardened functions).
// 2. Checks for an active lockout (5 failed attempts in 15 minutes) via
//    check_pin_lockout() - refuses immediately without even touching
//    the PIN if locked out.
// 3. Verifies the PIN against salon_pins via verify_pin_for_salon().
// 4. Logs the attempt either way, success or failure, so the lockout
//    counter stays accurate.
// 5. On success, looks up the salon's Auth user via salon_auth_users,
//    then mints a real session for that user via the Admin API -
//    without ever knowing, storing, or needing that user's actual
//    password. No email is sent; the magic-link token is generated and
//    immediately redeemed server-side in the same request.

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
    const { salon_id, role, pin } = await req.json();

    if (!salon_id || !role || !pin) {
      return new Response(
        JSON.stringify({ error: "salon_id, role and pin are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    if (role !== "admin" && role !== "staff") {
      return new Response(
        JSON.stringify({ error: "Invalid role" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Suspension check ────────────────────────────────────────────────
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

    // ── Lockout check - before touching the PIN at all ──────────────────
    const { data: isLockedOut } = await supabase.rpc("check_pin_lockout", {
      p_salon_id: salon_id,
      p_role: role,
    });

    if (isLockedOut) {
      return new Response(
        JSON.stringify({ error: "Too many failed attempts. Please wait 15 minutes and try again." }),
        { status: 429, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Verify the PIN ───────────────────────────────────────────────────
    const { data: pinValid } = await supabase.rpc("verify_pin_for_salon", {
      p_salon_id: salon_id,
      p_role: role,
      p_pin: pin,
    });

    // Log this attempt either way, before responding.
    await supabase.from("pin_login_attempts").insert({
      salon_id, role, success: !!pinValid,
    });

    if (!pinValid) {
      return new Response(
        JSON.stringify({ error: "Incorrect PIN" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Look up this salon's Auth user ──────────────────────────────────
    const { data: authUserRow, error: authUserError } = await supabase
      .from("salon_auth_users")
      .select("id")
      .eq("salon_id", salon_id)
      .single();

    if (authUserError || !authUserRow) {
      return new Response(
        JSON.stringify({ error: "No device account found for this salon. Please contact support." }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(authUserRow.id);
    if (userError || !userData || !userData.user || !userData.user.email) {
      console.error("getUserById error:", userError);
      return new Response(
        JSON.stringify({ error: "Could not resolve device account. Please contact support." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Mint a real session, server-side, without needing the password ──
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });

    if (linkError || !linkData || !linkData.properties || !linkData.properties.hashed_token) {
      console.error("generateLink error:", linkError);
      return new Response(
        JSON.stringify({ error: "Could not create session. Please contact support." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });

    if (sessionError || !sessionData || !sessionData.session) {
      console.error("verifyOtp error:", sessionError);
      return new Response(
        JSON.stringify({ error: "Could not create session. Please contact support." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_at: sessionData.session.expires_at,
        role,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("device-pin-login error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
