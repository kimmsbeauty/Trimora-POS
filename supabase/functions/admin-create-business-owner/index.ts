// supabase/functions/admin-create-business-owner/index.ts
//
// Creates the Auth login for a business owner during the superadmin
// console's manual "+ Onboard" flow (Salon, Auto and Pet).
//
// Why this exists: the console used to call /auth/v1/admin/users straight
// from the browser with the super admin's own session token. That endpoint
// only accepts the service-role key, so Supabase answered "User not
// allowed". The service-role key must never reach the browser (the repo is
// public), so the privileged step lives here.
//
// Same auth pattern as admin-create-sales-rep: verify the CALLER's own JWT
// is a super admin (app_metadata.is_super_admin, never user_metadata), then
// use this function's own service-role client for the privileged action.
//
// Receives: { email, password }
// Requires: Authorization: Bearer <the calling superadmin's own access token>
// Returns:  { success: true, user_id }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const callerToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!callerToken) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: CORS });
    }

    const { data: callerData, error: callerError } = await adminClient.auth.getUser(callerToken);
    if (callerError || !callerData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: CORS });
    }
    if (callerData.user.app_metadata?.is_super_admin !== true) {
      return new Response(JSON.stringify({ error: "Access denied: super admin only" }),
        { status: 403, headers: CORS });
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "email and password are required" }),
        { status: 400, headers: CORS });
    }
    if (String(password).length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: CORS });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }),
        { status: 400, headers: CORS });
    }

    return new Response(JSON.stringify({ success: true, user_id: created.user?.id }),
      { status: 200, headers: CORS });
  } catch (err) {
    console.error("admin-create-business-owner error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: CORS });
  }
});
