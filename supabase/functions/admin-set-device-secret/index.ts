// supabase/functions/admin-set-device-secret/index.ts
//
// ADMIN-ONLY TOOL — requires the Supabase service role key as the
// Authorization bearer token. Generates a random secret, sets it as
// that salon's actual Supabase Auth password (via Admin API — no human
// ever sees or needs this value), and stores it in salon_device_secrets
// so silent-device-login can use it later without anyone typing anything.
//
// This function is no longer called from the frontend at all — the
// silent-device-login function now auto-resyncs secrets internally
// when needed. This endpoint remains only for manual/emergency use
// via the Supabase dashboard or authenticated server-side tooling.
//
// Receives: { salon_id }
// Requires: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomSecret() {
  var bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // ── AUTH GUARD ─────────────────────────────────────────────────
  // Only the service role key may call this function. The public anon
  // key (visible in every browser bundle) is explicitly rejected.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  const providedToken = authHeader.replace(/^Bearer\s+/i, "");

  if (providedToken !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  try {
    const { salon_id } = await req.json();
    if (!salon_id) {
      return new Response(JSON.stringify({ error: "salon_id is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey
    );

    const { data: authUserRow, error: authUserError } = await supabase
      .from("salon_auth_users")
      .select("id")
      .eq("salon_id", salon_id)
      .single();

    if (authUserError || !authUserRow) {
      return new Response(JSON.stringify({ error: "No device account found for this salon_id" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const secret = randomSecret();

    const { error: updateError } = await supabase.auth.admin.updateUserById(authUserRow.id, {
      password: secret,
    });

    if (updateError) {
      console.error("updateUserById error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to set password", details: updateError.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const { error: upsertError } = await supabase
      .from("salon_device_secrets")
      .upsert({ salon_id, secret });

    if (upsertError) {
      console.error("upsert error:", upsertError);
      return new Response(JSON.stringify({ error: "Password was set but failed to store secret", details: upsertError.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, salon_id }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("admin-set-device-secret error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
