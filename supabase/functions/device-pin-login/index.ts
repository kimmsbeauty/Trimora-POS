// This function was found deployed with a broken, non-functional body
// (a client-side test snippet containing a hardcoded salon_id, role, and
// what appeared to be a live admin PIN, mistakenly pasted in as the
// function source instead of real server code). It was never a working
// Deno.serve() handler and was not referenced anywhere in the frontend.
// It also wasn't tracked in this repo at all -- deployed directly,
// outside migration/function history.
//
// Replaced with this inert stub to remove the exposed credential from the
// deployed source. The affected salon's PIN has been rotated separately.
// If a combined salon+PIN device-login endpoint is still wanted (see the
// Critical-1 remediation plan), it should be implemented fresh here rather
// than resurrecting the previous body.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (_req) => {
  return new Response(
    JSON.stringify({ error: "Not implemented" }),
    { status: 501, headers: { "Content-Type": "application/json" } }
  );
});
