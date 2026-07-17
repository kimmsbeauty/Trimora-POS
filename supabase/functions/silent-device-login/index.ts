// supabase/functions/silent-device-login/index.ts
//
// DEPRECATED -- audit Critical-1 (device impersonation): this endpoint
// minted a real device session from nothing but a public salon_id, no
// proof of caller legitimacy whatsoever. It was already frontend-dead
// (nothing in the app calls it anymore -- see LoginPage.jsx /
// device-pin-login, which verifies the PIN and establishes the
// session in one atomic step instead). It was deliberately left
// deployed as a fallback until the new PIN-first flow had a real,
// human-tested login on an actual device -- that test has now been
// done and confirmed working (normal login, lockout at 5 failed
// attempts / 15 min window, lockout expiry, device persistence all
// verified live).
//
// All the original session-minting logic (self-provisioning device
// secrets, password grants against Supabase Auth using the
// service_role key) has been removed entirely, not just gated behind
// an early return, so a future edit can't accidentally resurrect it by
// moving a conditional. The endpoint now unconditionally rejects.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  return new Response(
    JSON.stringify({
      error: "This endpoint has been deprecated. Please use the PIN login screen.",
    }),
    { status: 410, headers: { ...CORS, "Content-Type": "application/json" } }
  );
});
