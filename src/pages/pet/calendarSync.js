// src/pages/pet/calendarSync.js
//
// Client for the pet-calendar-sync edge function and the plain-language messages for Google Calendar
// sync (Settings > Google Calendar). The browser sends only the business id and, when testing, the
// calendar id; every event is built on the server from the saved booking or stay.
import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/constants";
import { getValidAccessToken } from "../../lib/deviceAuth";

var TEXT = {
  NOT_CONFIGURED: "Google Calendar sync isn't switched on for Trimora yet. Please contact support.",
  CALENDAR_NOT_FOUND: "Google couldn't find that calendar. Check the calendar ID, and make sure the calendar is shared with the email address shown above.",
  CALENDAR_FORBIDDEN: "Trimora can see that calendar but isn't allowed to change it. In Google Calendar, give the email address shown above the permission \"Make changes to events\".",
  GOOGLE_AUTH: "Trimora couldn't sign in to Google. Please contact support.",
  RATE_LIMITED: "Google asked us to slow down. Trimora will try again automatically.",
  GOOGLE_UNAVAILABLE: "Google Calendar isn't responding right now. Trimora will try again automatically.",
  INVALID_CALENDAR_ID: "That doesn't look like a calendar ID. Copy it from the calendar's settings in Google Calendar (Integrate calendar > Calendar ID).",
  CALENDAR_REQUIRED: "Enter the calendar ID before switching sync on.",
  NOT_CONNECTED: "Switch Google Calendar sync on and save first.",
  NOT_AUTHENTICATED: "Your session has ended. Please sign in again.",
  SYNC_FAILED: "Something went wrong while syncing. Try again in a moment.",
  GOOGLE_ERROR: "Google Calendar returned an error. Try again in a moment.",
};

export function calendarErrorMessage(code) {
  var c = String(code || "");
  for (var k in TEXT) { if (c === k || c.indexOf(k) >= 0) return TEXT[k]; }
  if (c === "Network error") return "Couldn't reach the server. Check your connection and try again.";
  return TEXT.SYNC_FAILED;
}

export function validCalendarId(id) {
  return typeof id === "string" && /^[A-Za-z0-9._%+@#-]{3,254}$/.test(id.trim());
}

function when(ts) {
  try { return new Date(ts).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return String(ts); }
}

// The one-line status under the switch. conn is the saved pet_calendar_connections row (or null).
export function connectionStatus(conn) {
  if (!conn || !conn.enabled) return { tone: "neutral", text: "Sync is off." };
  if (conn.last_error) return { tone: "danger", text: "The last sync had a problem. " + calendarErrorMessage(conn.last_error) };
  if (conn.last_ok_at) return { tone: "success", text: "Last synced " + when(conn.last_ok_at) + "." };
  return { tone: "neutral", text: "Waiting for the first sync." };
}

export function syncSummary(r) {
  if (!r) return "";
  if (r.failed > 0) return "Some items couldn't be synced yet. See the status above; Trimora will keep trying.";
  if (r.remaining > 0) return "Syncing. More items are queued and will follow shortly.";
  return "Everything is up to date.";
}

// action: "info" | "test" | "flush". -> { ok: true, data } | { ok: false, code, message }
export async function callCalendar(body) {
  try {
    var token = await getValidAccessToken();
    var res = await fetch(SUPABASE_URL + "/functions/v1/pet-calendar-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + (token || SUPABASE_KEY) },
      body: JSON.stringify(body),
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.success) return { ok: true, data: data };
    var code = (data && data.error) || "SYNC_FAILED";
    return { ok: false, code: code, message: calendarErrorMessage(code) };
  } catch (e) {
    return { ok: false, code: "Network error", message: calendarErrorMessage("Network error") };
  }
}
