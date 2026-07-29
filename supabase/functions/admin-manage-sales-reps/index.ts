// supabase/functions/admin-manage-sales-reps/index.ts
//
// Lists, suspends, unsuspends, and deletes sales rep accounts. Same
// auth pattern as admin-create-sales-rep: the CALLER's own access
// token is verified (must carry app_metadata.is_super_admin === true)
// before any privileged Admin API call is made with the function's own
// service-role client. The caller never sees the service role key.
//
// Receives: { op, user_id? }
//   op === "list"        -> no user_id needed; returns every user with
//                           app_metadata.is_sales_rep === true
//   op === "suspend"     -> requires user_id; bans the account
//                           (auth.admin.updateUserById with a long
//                           ban_duration) -- reversible, login just
//                           stops working until unsuspended
//   op === "unsuspend"   -> requires user_id; clears the ban
//   op === "delete"      -> requires user_id; permanently removes the
//                           auth user (auth.admin.deleteUserById) --
//                           NOT reversible
//
// Requires: Authorization: Bearer <the calling superadmin's own access token>
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── AUTH GUARD ─────────────────────────────────────────────────
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
    const { op, user_id } = await req.json();

    if (op === "list") {
      // Admin API only paginates -- walk pages until exhausted. Reps
      // are a small list in practice, but don't silently truncate.
      const reps = [];
      let page = 1;
      while (true) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }),
            { status: 400, headers: CORS });
        }
        for (const u of data.users) {
          if (u.app_metadata?.is_sales_rep === true) {
            reps.push({
              id: u.id,
              email: u.email,
              created_at: u.created_at,
              last_sign_in_at: u.last_sign_in_at,
              banned_until: u.banned_until || null,
            });
          }
        }
        if (data.users.length < 200) break;
        page += 1;
      }
      return new Response(JSON.stringify({ success: true, reps }),
        { status: 200, headers: CORS });
    }

    if (op === "suspend" || op === "unsuspend") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }),
          { status: 400, headers: CORS });
      }
      // Guard: only ever act on genuine sales rep accounts, never any
      // other account type, regardless of what user_id is passed in.
      const { data: target, error: getError } = await adminClient.auth.admin.getUserById(user_id);
      if (getError || !target?.user || target.user.app_metadata?.is_sales_rep !== true) {
        return new Response(JSON.stringify({ error: "Not a sales rep account" }),
          { status: 400, headers: CORS });
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: op === "suspend" ? "876000h" : "none", // ~100 years, i.e. indefinite, vs. lifting the ban
      });
      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }),
          { status: 400, headers: CORS });
      }
      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: CORS });
    }

    if (op === "delete") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }),
          { status: 400, headers: CORS });
      }
      const { data: target, error: getError } = await adminClient.auth.admin.getUserById(user_id);
      if (getError || !target?.user || target.user.app_metadata?.is_sales_rep !== true) {
        return new Response(JSON.stringify({ error: "Not a sales rep account" }),
          { status: 400, headers: CORS });
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }),
          { status: 400, headers: CORS });
      }
      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ error: "Unknown op" }),
      { status: 400, headers: CORS });

  } catch (err) {
    console.error("admin-manage-sales-reps error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: CORS });
  }
});
