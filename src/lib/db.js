// src/lib/db.js

import { SUPABASE_URL, SUPABASE_KEY } from "./constants";

// ── Offline queue ──────────────────────────────────────────────────────────
export const offlineQueue = [];
let isSyncing = false;

async function dbDirect(method, table, data = null, filters = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}${filters}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: method === "POST" ? "return=representation" : "",
      },
      body: data ? JSON.stringify(data) : undefined,
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
    try {
      await dbDirect(item.method, item.table, item.data, item.filters);
      offlineQueue.shift();
    } catch (e) {
      break;
    }
  }
  isSyncing = false;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", syncOfflineQueue);
}

export async function db(method, table, data = null, filters = "") {
  if (!navigator.onLine && method !== "GET") {
    offlineQueue.push({ method, table, data, filters });
    return null;
  }
  return dbDirect(method, table, data, filters);
}