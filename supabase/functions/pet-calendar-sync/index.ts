// supabase/functions/pet-calendar-sync/index.ts
//
// One-way sync of Trimora Pet grooming bookings and boarding stays to the business's Google Calendar.
// Trimora is the source of truth: events are created, updated and deleted to match; changes made in
// Google are overwritten the next time the booking changes. No invitations are ever sent.
//
// Actions (JSON body, POST):
//   { action: "info", salon_id }                      device caller: the service-account email the business
//                                                     must share its calendar with
//   { action: "test", salon_id, calendar_id? }        device caller: checks the calendar can be read and
//                                                     written (adds then removes one short event)
//   { action: "flush", salon_id }                     device caller: sync this business's pending changes now
//   { action: "process" }                             scheduler (header x-cron-secret): sync pending changes
//                                                     for every business
//
// Device callers must be an authenticated device of the requested salon (same gate as pet-send-invoice).
//
// Secrets:
//   GOOGLE_SERVICE_ACCOUNT_JSON   the service account's JSON key, as one string (Edge Function secret)
//   Scheduler secret              the scheduler sends it as x-cron-secret. It is accepted if it equals the Vault
//                                 secret `calendar_sync_cron_secret` (checked in the database by
//                                 pet_calendar_cron_secret_ok, migration 115) OR the optional function secret
//                                 CALENDAR_SYNC_CRON_SECRET.
// Missing GOOGLE_SERVICE_ACCOUNT_JSON answers 503 NOT_CONFIGURED and changes nothing.
//
// Needs migration 113 applied first. See README.md.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validCalendarId, classifyGoogleError, parseServiceAccount, base64url, pemToDer, safeEqual } from "./lib.js";
import { GoogleError, makeApi, runSync } from "./sync.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const API = "https://www.googleapis.com/calendar/v3/calendars/";

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---- Google auth (service account, signed JWT -> access token, cached until shortly before expiry)
let cachedToken: { value: string; exp: number } | null = null;

async function accessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(header + "." + claims)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + header + "." + claims + "." + base64url(sig),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new GoogleError("GOOGLE_AUTH");
  cachedToken = { value: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.value;
}

async function google(sa: any, method: string, calendarId: string, path: string, body?: unknown) {
  const token = await accessToken(sa);
  const res = await fetch(API + encodeURIComponent(calendarId) + path, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return res.status === 204 ? null : await res.json().catch(() => null);
  const err = await res.json().catch(() => ({}));
  const reason = err?.error?.errors?.[0]?.reason;
  throw new GoogleError(classifyGoogleError(res.status, reason));
}

function apiFor(sa: any) {
  return makeApi((method: string, calendarId: string, path: string, body?: unknown) => google(sa, method, calendarId, path, body));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    if (!["info", "test", "flush", "process"].includes(action)) return reply(400, { error: "action must be info, test, flush or process" });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const sa = parseServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "");
    if (!sa) return reply(503, { error: "NOT_CONFIGURED" });

    // -- scheduler
    if (action === "process") {
      const given = req.headers.get("x-cron-secret") || "";
      const envSecret = Deno.env.get("CALENDAR_SYNC_CRON_SECRET") || "";
      let allowed = !!envSecret && safeEqual(given, envSecret);
      if (!allowed && given) {
        const { data } = await supabase.rpc("pet_calendar_cron_secret_ok", { p_secret: given });
        allowed = data === true;
      }
      if (!allowed) return reply(401, { error: "Not authorized." });
      return reply(200, { success: true, ...(await runSync(supabase, apiFor(sa), null)) });
    }

    // -- device callers: authenticated device of this salon
    const salon_id = body.salon_id;
    if (!salon_id) return reply(400, { error: "salon_id is required" });
    const callerToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!callerToken) return reply(401, { error: "Missing Authorization header" });
    const { data: callerData, error: callerError } = await supabase.auth.getUser(callerToken);
    if (callerError || !callerData?.user?.id) return reply(401, { error: "Invalid or expired session. Please refresh and try again." });
    const { data: authRow } = await supabase.from("salon_auth_users").select("salon_id").eq("id", callerData.user.id).maybeSingle();
    if (!authRow || authRow.salon_id !== salon_id) return reply(403, { error: "Not authorized for this salon." });
    const { data: salonRow } = await supabase.from("salons").select("suspended").eq("id", salon_id).single();
    if (salonRow && salonRow.suspended) return reply(403, { error: "This salon's account is currently suspended." });

    if (action === "info") return reply(200, { success: true, service_account_email: sa.client_email });

    if (action === "flush") {
      const { data: c } = await supabase.from("pet_calendar_connections").select("enabled").eq("salon_id", salon_id).maybeSingle();
      if (!c || !c.enabled) return reply(409, { error: "NOT_CONNECTED" });
      return reply(200, { success: true, ...(await runSync(supabase, apiFor(sa), salon_id)) });
    }

    // test: read, then write and remove one short event, so a "view only" share is caught here.
    let calendarId = typeof body.calendar_id === "string" && body.calendar_id.trim() ? body.calendar_id.trim() : "";
    if (!calendarId) {
      const { data: c } = await supabase.from("pet_calendar_connections").select("calendar_id").eq("salon_id", salon_id).maybeSingle();
      calendarId = c?.calendar_id || "";
    }
    if (!validCalendarId(calendarId)) return reply(400, { error: "INVALID_CALENDAR_ID" });
    try {
      await google(sa, "GET", calendarId, "/events?maxResults=1&singleEvents=true");
      const start = new Date(Date.now() + 60 * 1000);
      const made = await google(sa, "POST", calendarId, "/events?sendUpdates=none", {
        summary: "Trimora connection test (safe to ignore)",
        start: { dateTime: start.toISOString() }, end: { dateTime: new Date(start.getTime() + 60 * 1000).toISOString() },
      });
      if (made?.id) await apiFor(sa).remove(calendarId, made.id);
      return reply(200, { success: true });
    } catch (e) {
      return reply(200, { success: false, error: e instanceof GoogleError ? e.code : "GOOGLE_ERROR" });
    }
  } catch (e) {
    console.error("pet-calendar-sync", e);
    return reply(500, { error: "SYNC_FAILED" });
  }
});
