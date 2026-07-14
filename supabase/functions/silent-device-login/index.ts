// supabase/functions/silent-device-login/index.ts
//
// Silently establishes a device session for a salon without requiring
// any human-typed credentials.
//
// Flow:
//  1. Rate-limit check (stopgap mitigation -- see audit Critical-1;
//     this endpoint still has no proof of caller legitimacy beyond
//     salon_id, which is intentionally public. Real fix is a device-
//     bound credential, tracked separately. This only throttles
//     bulk/automated hammering of a single salon_id.)
//  2. Look up salon_auth_users for this salon_id
//  3. Look up salon_device_secrets (may not exist yet -- a brand-new
//     salon has never logged in, so has no secret row at all)
//  4. If a secret exists, attempt a password grant with it
//  5. If that failed, OR no secret existed yet: provision a fresh one
//     (generate secret, update Auth password, upsert), then retry the
//     grant. One self-healing path covers both "never provisioned" and
//     "out of sync" (e.g. after a PIN reset sets a placeholder
//     password) -- they're the same underlying problem (no working
//     secret right now), not two different ones.
//  6. Return access_token + refresh_token

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

    // ── RATE LIMIT (stopgap -- see comment at top of file) ──────────
    // A real shop's tab re-checks every 5 minutes, so even several
    // devices/tabs open at once falls well under this threshold.
    // Logged (not silent) so repeated hits are visible for follow-up.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: recentCallCount } = await supabase
      .from("device_login_events")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salon_id)
      .gte("created_at", tenMinutesAgo);

    if ((recentCallCount || 0) >= 20) {
      console.warn("silent-device-login rate limit hit for salon", salon_id, "-", recentCallCount, "calls in last 10 min");
      return new Response(JSON.stringify({ error: "Too many login attempts. Please wait a few minutes and try again." }),
        { status: 429, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const { error: eventInsertError } = await supabase
      .from("device_login_events")
      .insert({ salon_id });
    if (eventInsertError) {
      // Don't block login over a logging failure -- just note it.
      console.error("device_login_events insert failed:", eventInsertError);
    }

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

    // Get email (needed either way, so resolve it before checking the
    // secret -- a brand-new salon with zero salon_device_secrets rows
    // isn't a failure case, it just means we go straight to
    // provisioning one below via the same self-healing path already
    // used for a stale/mismatched secret, rather than treating "never
    // provisioned" and "out of sync" as two different problems needing
    // two different code paths.)
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(authUserRow.id);
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "Could not resolve device account. Please contact support." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const email = userData.user.email;

    // Get stored secret -- maybeSingle, not single: zero rows is an
    // expected, normal state for a salon that has never logged in yet,
    // not a query error.
    const { data: secretRow } = await supabase
      .from("salon_device_secrets")
      .select("secret")
      .eq("salon_id", salon_id)
      .maybeSingle();

    // Attempt 1: use stored secret, if one exists
    let tokenData = secretRow ? await attemptPasswordGrant(supabaseUrl, serviceKey, email, secretRow.secret) : null;

    // Attempt 2: either no secret existed yet, or the grant with it
    // failed -- (re)provision and retry. Same self-healing logic that
    // already existed for the "stale secret" case; a salon with zero
    // secret rows now goes through this exact path too instead of
    // hitting a dead end on its very first login attempt.
    if (!tokenData) {
      console.log(secretRow ? "Password grant failed for salon" : "No device secret yet for salon", salon_id, "— provisioning/resyncing");

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
