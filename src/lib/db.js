// src/lib/db.js

import { SUPABASE_URL, SUPABASE_KEY, KIMMS_SALON_ID } from "./constants";
import { getValidAccessToken } from "./deviceAuth";
import { getCurrentSalonId } from "./currentSalon";// src/lib/db.js

import { SUPABASE_URL, SUPABASE_KEY, KIMMS_SALON_ID } from "./constants";
import { getValidAccessToken } from "./deviceAuth";
import { getCurrentSalonId } from "./currentSalon";

const TENANT_TABLES = new Set([
  "bookings", "customers", "expenses", "feedback",
  "sales", "services", "staff", "stock", "salon_pins",
  "public_staff_directory",
]);

export const offlineQueue = [];
let isSyncing = false;

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

const TENANT_TABLES = new Set([
  "bookings", "customers", "expenses", "feedback",
  "sales", "services", "staff", "stock", "salon_pins",
]);

export const offlineQueue = [];
let isSyncing = false;

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
