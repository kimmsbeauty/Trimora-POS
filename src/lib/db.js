// src/lib/db.js

import { SUPABASE_URL, SUPABASE_KEY } from "./constants";
import { getValidAccessToken } from "./deviceAuth";
import { getCurrentSalonId } from "./currentSalon";

export const TENANT_TABLES = new Set([
  "bookings", "customers", "expenses", "feedback",
  "sales", "services", "staff", "stock", "salon_pins",
  "salon_settings",
  "marketing_campaigns", "salon_marketing_config", "salon_mpesa_config",
  "marketing_messages", "pin_login_attempts", "salon_service_categories",
  "salon_enabled_modules", "auto_vehicles", "vehicle_photos",
  "auto_services", "auto_service_required_stock", "auto_stock_movements",
  "auto_bays", "auto_jobs", "auto_job_services", "auto_job_events",
  "auto_membership_plans", "customer_memberships", "customer_wallet_transactions",
  "auto_referrals",
  "auto_refunds",
  "auto_coupons",
  "auto_invoices",
  "auto_vehicle_inspections",
]);

// See usage in dbDirect() below (M4 fail-closed guard): tables in this
// set are also in TENANT_TABLES, but have a deliberate, audited anon
// RLS policy (read and/or insert) meant to work before any device login
// exists, so the guard must not block them.
//   - salon_enabled_modules: anon SELECT, used pre-login to know which
//     modules a salon has enabled.
//   - feedback: anon INSERT only (feedback_anon_insert, migration 061),
//     used by the public, unauthenticated rating pages at
//     /:slug/rate/:token and /:slug/auto/rate/:token (RatingPage.jsx /
//     AutoRatingPage.jsx). A customer submitting feedback from that link
//     never has a device token -- the M4 guard below was written with
//     device-authenticated tenant tables in mind and, without this entry,
//     wrongly fails every customer feedback submission closed before it
//     ever reaches Postgres, even though the RLS policy on the DB side
//     already scopes the insert correctly (WITH CHECK against a real
//     salon_id). See the 2026-08-29 bug report: "Something went wrong
//     submitting your feedback" on every attempt.
export const PRE_LOGIN_READABLE_TENANT_TABLES = new Set([
  "salon_enabled_modules",
]);

const QUEUE_STORAGE_KEY = "trimora_offline_queue";
const DROPPED_STORAGE_KEY = "trimora_dropped_writes";
const MAX_RETRY_ATTEMPTS = 5;

// L1 (2026-07-30 audit): offline queue payloads sit in localStorage
// unencrypted until synced -- true client-side encryption isn't practical
// here (there's no secret to encrypt with that wouldn't itself have to
// live in localStorage, readable by anything with local device access).
// What was missing and is fixable: there was no cap on how large this
// queue could grow. A POS device stuck offline for a long stretch (or a
// bug that keeps queueing failed writes) had no ceiling. Capping it here
// means a shared/lost device holds a bounded, not unbounded, amount of
// customer data in plaintext.
const MAX_QUEUE_LENGTH = 500;

export const offlineQueue = [];
let isSyncing = false;

// M5 (2026-07-30 audit): dropped offline writes (a sale, a booking) used
// to vanish with only a console.error -- nothing told the staff member
// who made it. This keeps a small persisted, dismissable record of every
// drop, with enough to manually reconcile: which table, an amount/
// customer if the payload had one, when it happened, and why. Persisted
// (survives a refresh) and broadcast via a window event so any mounted
// UI (POSApp.jsx, AutoApp.jsx, ...) can show it without polling.
export const droppedWrites = [];

function persistDropped() {
  try {
    window.localStorage.setItem(DROPPED_STORAGE_KEY, JSON.stringify(droppedWrites));
  } catch (e) {
    console.error("Failed to persist dropped-writes record:", e);
  }
}

function broadcastDroppedWrites() {
  if (typeof window !== "undefined" && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent("trimora:dropped-writes-changed", {
      detail: droppedWrites.slice(),
    }));
  }
}

// Best-effort human-readable summary from whatever shape this table's
// write happens to have -- not every table has the same fields, so this
// just checks the common ones rather than requiring per-table mapping.
function summarizeForReconciliation(item) {
  var d = item.data || {};
  var row = Array.isArray(d) ? (d[0] || {}) : d;
  return {
    amount: row.total != null ? row.total : (row.amount != null ? row.amount : null),
    customer: row.customer_name || row.client_name || row.name || null,
  };
}

function recordDroppedWrite(item, reason) {
  var summary = summarizeForReconciliation(item);
  droppedWrites.push({
    id: (Date.now().toString(36) + Math.random().toString(36).slice(2)),
    table: item.table,
    method: item.method,
    amount: summary.amount,
    customer: summary.customer,
    droppedAt: new Date().toISOString(),
    reason: reason,
  });
  persistDropped();
  broadcastDroppedWrites();
}

export function getDroppedWrites() {
  return droppedWrites.slice();
}

export function clearDroppedWrite(id) {
  var idx = droppedWrites.findIndex(function (w) { return w.id === id; });
  if (idx !== -1) droppedWrites.splice(idx, 1);
  persistDropped();
  broadcastDroppedWrites();
}

export function clearAllDroppedWrites() {
  droppedWrites.length = 0;
  persistDropped();
  broadcastDroppedWrites();
}

function persistQueue() {
  try {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(offlineQueue));
  } catch (e) {
    console.error("Failed to persist offline queue:", e);
  }
}

// Push a new offline-queued write, then enforce MAX_QUEUE_LENGTH by
// dropping the OLDEST entries first -- the same call sites that already
// accept losing an item after MAX_RETRY_ATTEMPTS failures (see
// syncOfflineQueue below) already have a documented never-throws
// contract that tolerates a write occasionally not surviving offline
// queueing; this is the same tradeoff, just triggered by size instead of
// retry count.
function pushQueueItem(item) {
  offlineQueue.push(item);
  while (offlineQueue.length > MAX_QUEUE_LENGTH) {
    const dropped = offlineQueue.shift();
    console.error(
      "[db.js] Offline queue exceeded " + MAX_QUEUE_LENGTH + " items -- " +
      "dropping oldest queued write to make room:", dropped
    );
    recordDroppedWrite(dropped, "queue_full");
  }
  persistQueue();
}

// Restore any dropped-write records left from a previous session, so a
// refresh doesn't clear an unreconciled alert before staff have seen it.
if (typeof window !== "undefined") {
  try {
    const rawDropped = window.localStorage.getItem(DROPPED_STORAGE_KEY);
    if (rawDropped) {
      const restoredDropped = JSON.parse(rawDropped);
      if (Array.isArray(restoredDropped)) droppedWrites.push(...restoredDropped);
    }
  } catch (e) {
    console.error("Failed to restore dropped-writes record:", e);
  }
}

// Restore any writes that were still pending when the page last closed or
// refreshed, so a dropped connection never silently loses a sale.
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (raw) {
      const restored = JSON.parse(raw);
      if (Array.isArray(restored)) offlineQueue.push(...restored);
    }
  } catch (e) {
    console.error("Failed to restore offline queue:", e);
  }
}

async function dbDirect(method, table, data = null, filters = "") {
  // Previously fell back to Kimms' fixed salon ID whenever no tenant was
  // resolved, on the theory that only the (now-confirmed-dead)
  // unprefixed /pos and /booking routes ever hit this. That was wrong in
  // one live case: POSApp.jsx's feedback rating link falls back to an
  // unprefixed /rate/:token URL if `salon.slug` is ever falsy, and that
  // route has no SalonGate -- so a customer of any OTHER salon hitting
  // that edge case would have had their feedback silently written with
  // salon_id = Kimms' ID. Removed entirely: no salon should ever be
  // guessed. This returns null (matching this function's existing
  // never-throws contract -- see db()'s offline-queue handling below,
  // which every other write failure already funnels through) rather
  // than throwing, so a genuine future SalonGate timing bug degrades
  // the same way any other write failure does, instead of crashing the
  // live POS screen for a real member of staff mid-transaction.
  const resolvedId = getCurrentSalonId();
  if (!resolvedId && TENANT_TABLES.has(table)) {
    console.error(
      "[db.js] SECURITY: no resolved salon id for tenant-scoped table '" + table + "' " +
      "on route '" + window.location.pathname + "'. Refusing to guess which salon this " +
      "belongs to -- returning null rather than substituting another salon's data."
    );
    return null;
  }
  const activeSalonId = resolvedId;

  let body = data;
  if (data && (method === "POST" || method === "PATCH") && TENANT_TABLES.has(table)) {
    body = Array.isArray(data)
      ? data.map((row) => ({ salon_id: activeSalonId, ...row }))
      : { salon_id: activeSalonId, ...data };
  }

  let finalFilters = filters;
  if (method === "GET" && TENANT_TABLES.has(table)) {
    const salonFilter = "salon_id=eq." + activeSalonId;
    finalFilters = filters ? (filters + "&" + salonFilter) : ("?" + salonFilter);
  }

  const deviceToken = await getValidAccessToken();

  // Security note (audit M4, 2026-07-30): this used to fall through to
  // the anon key whenever deviceToken was missing, for every table --
  // that only ever "worked safely" because RLS happens to reject anon on
  // every tenant-scoped table today, with zero defense-in-depth at this
  // layer if a future RLS policy were ever misconfigured. Tenant tables
  // now fail closed here explicitly instead of relying on that. Non-tenant
  // tables (public_salon_directory, bookings' anon insert, etc.) are
  // deliberately unaffected -- anon access to those is real, intended
  // design, not a fallback. PRE_LOGIN_READABLE_TENANT_TABLES (defined
  // above, next to TENANT_TABLES) is the one further exception: tables
  // that ARE tenant-scoped but also have a deliberate anon-read policy
  // meant to work before login.

  if (!deviceToken && TENANT_TABLES.has(table) && !PRE_LOGIN_READABLE_TENANT_TABLES.has(table)) {
    console.error(
      "[db.js] SECURITY: no device token for tenant-scoped table '" + table + "'. " +
      "Refusing to fall back to the anon key -- returning null."
    );
    return null;
  }

  const url = `${SUPABASE_URL}/rest/v1/${table}${finalFilters}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${deviceToken || SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: method === "POST" ? "return=representation" : "",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    if (method === "DELETE" || method === "PATCH") return true;
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}

// Calls a Postgres RPC function as the currently authenticated device/staff
// session (Bearer deviceToken, same auth path as dbDirect's table writes) --
// unlike dbRpc() below, which is deliberately anon-only for narrow public
// lookups. Use this variant for any RPC whose Postgres body relies on
// auth_salon_id()/auth.uid() to scope itself (e.g. apply_wallet_transaction),
// since calling those with the anon key would always resolve to "no salon
// session" and fail every time, not just when actually unauthorized.
export async function dbRpcAuth(functionName, args = {}) {
  const deviceToken = await getValidAccessToken();

  // audit M4: this function exists specifically for RPCs that rely on
  // auth_salon_id()/auth.uid() -- there's no legitimate anonymous use of
  // it (see dbRpc() above for that case), so a missing token fails closed
  // instead of silently calling through with the anon key.
  if (!deviceToken) {
    return { error: "Not authenticated. Please sign in again." };
  }

  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${deviceToken || SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errBody = await res.json().catch(function () { return null; });
      return { error: (errBody && (errBody.message || errBody.error)) || "Request failed" };
    }
    const result = await res.json();
    return { data: result };
  } catch (e) {
    clearTimeout(timeout);
    return { error: "Network error" };
  }
}

// Calls a Postgres RPC function (POST /rest/v1/rpc/<name>) rather than a
// table. Used for narrow, server-defined lookups (e.g. public_customer_lookup)
// where a direct table SELECT would be too permissive for an unauthenticated
// caller. Returns the parsed JSON array/object on success, or null on any
// failure — callers should treat null the same as "not found", not a crash.
export async function dbRpc(functionName, args = {}) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}

export async function syncOfflineQueue() {
  if (isSyncing || offlineQueue.length === 0 || !navigator.onLine) return;
  isSyncing = true;
  while (offlineQueue.length > 0) {
    const item = offlineQueue[0];
    const result = await dbDirect(item.method, item.table, item.data, item.filters);
    if (result !== null) {
      // Confirmed success — safe to drop.
      offlineQueue.shift();
      persistQueue();
    } else {
      // Still failing. Count the attempt and stop this pass rather than
      // looping forever on one bad item — it'll be retried on the next
      // pass (online event or periodic check) unless it's hit the cap.
      item.attempts = (item.attempts || 0) + 1;
      if (item.attempts >= MAX_RETRY_ATTEMPTS) {
        console.error("Dropping offline-queued write after repeated failures:", item);
        recordDroppedWrite(item, "retries_exhausted");
        offlineQueue.shift();
      }
      persistQueue();
      break;
    }
  }
  isSyncing = false;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", syncOfflineQueue);
  // navigator.onLine can report true even when the connection is actually
  // unusable (weak signal, captive portal, etc.), so the "online" event
  // alone isn't reliable enough — a periodic check catches what it misses.
  setInterval(syncOfflineQueue, 30000);
}

export async function db(method, table, data = null, filters = "") {
  if (method === "GET") {
    return dbDirect(method, table, data, filters);
  }

  if (!navigator.onLine) {
    pushQueueItem({ method, table, data, filters, attempts: 0 });
    return null;
  }

  const result = await dbDirect(method, table, data, filters);
  if (result === null) {
    // The browser thought it was online, but the write still failed —
    // queue it rather than losing it silently.
    pushQueueItem({ method, table, data, filters, attempts: 0 });
  }
  return result;
}
