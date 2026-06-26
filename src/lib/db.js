// src/lib/db.js

import { SUPABASE_URL, SUPABASE_KEY, KIMMS_SALON_ID } from "./constants";
import { getValidAccessToken } from "./deviceAuth";
import { getCurrentSalonId } from "./currentSalon";

const TENANT_TABLES = new Set([
  "bookings", "customers", "expenses", "feedback",
  "sales", "services", "staff", "stock", "salon_pins",
  "public_staff_directory", "salon_settings",
]);

const QUEUE_STORAGE_KEY = "trimora_offline_queue";
const MAX_RETRY_ATTEMPTS = 5;

export const offlineQueue = [];
let isSyncing = false;

function persistQueue() {
  try {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(offlineQueue));
  } catch (e) {
    console.error("Failed to persist offline queue:", e);
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
  // Resolved by SalonGate for slug-prefixed routes; falls back to
  // Kimms' fixed ID on the legacy unprefixed routes, where nothing
  // ever resolves a slug at all.
  const activeSalonId = getCurrentSalonId() || KIMMS_SALON_ID;

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
    offlineQueue.push({ method, table, data, filters, attempts: 0 });
    persistQueue();
    return null;
  }

  const result = await dbDirect(method, table, data, filters);
  if (result === null) {
    // The browser thought it was online, but the write still failed —
    // queue it rather than losing it silently.
    offlineQueue.push({ method, table, data, filters, attempts: 0 });
    persistQueue();
  }
  return result;
}
