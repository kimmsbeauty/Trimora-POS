// supabase/functions/admin-create-sales-rep/index.ts
//
// Creates a new sales rep account. Sales reps are gated on
// app_metadata.is_sales_rep (never user_metadata -- that field is
// self-editable by any authenticated user via the client SDK, exactly
// the pattern already fixed in the 2026-07-02/07-05 privilege-escalation
// work). Setting app_metadata requires the Auth Admin API (service
// role), which is why this needs to be an Edge Function rather than a
// plain client-side signup call.
//
// DIFFERENT auth pattern from admin-set-device-secret (which requires
// the raw service role key as the bearer token, dashboard/manual-only).
// This function is meant to be called FROM the actual superadmin
// dashboard by a logged-in superadmin -- so it verifies the CALLER's own
// JWT claims first (same check as the create_invite RPC), then uses its
// OWN internal service-role client for the actual privileged action. The
// caller never sees or needs the service role key itself.
//
// Receives: { email, password }
// Requires: Authorization: Bearer <the calling superadmin's own access token>
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── AUTH GUARD ─────────────────────────────────────────────────
    // Verify the CALLER (whoever sent this request) is genuinely a
    // superadmin, by validating their own access token and checking
    // app_metadata -- not the raw service role key, which the browser
    // client never has.
    const authHeader = req.headers.get("Authorization") || "";
    const callerToken = authHeader.replace(/^Bearer\s+/i, "");

    if (!callerToken) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: CORS });
    }

    const { data: callerData, error: callerError } = await adminClient.auth.getUser(callerToken);

    if (callerError || !callerData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: CORS });
    }

    const isSuperAdmin = callerData.user.app_metadata?.is_super_admin === true;
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Access denied: super admin only" }),
        { status: 403, headers: CORS });
    }

    // ── ACTUAL ACTION ──────────────────────────────────────────────
    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "email and password are required" }),
        { status: 400, headers: CORS });
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: CORS });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { is_sales_rep: true },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }),
        { status: 400, headers: CORS });
    }

    return new Response(JSON.stringify({ success: true, user_id: created.user?.id }),
      { status: 200, headers: CORS });

  } catch (err) {
    console.error("admin-create-sales-rep error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: CORS });
  }
});
