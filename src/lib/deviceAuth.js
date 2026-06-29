// src/lib/deviceAuth.js
//
// Handles the once-per-device (or once-every-30-days) sign-in that proves
// this device belongs to this salon, so Supabase can see a real auth.uid()
// on requests instead of everyone sharing the same anon key.
//
// This is separate from the staff/admin PIN screen. The PIN still gates
// the POS UI exactly as before — this layer sits underneath it and is
// invisible to staff day-to-day.

import { SUPABASE_URL, SUPABASE_KEY } from "./constants";

var STORAGE_KEY = "trimora_device_auth";
var THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
var REFRESH_SKEW_MS = 60 * 1000;

function readAuth() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeAuth(auth) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  } catch (e) {}
}

export function clearDeviceAuth() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

function isLoginExpired(auth) {
  if (!auth || !auth.login_at) return true;
  return Date.now() - auth.login_at > THIRTY_DAYS_MS;
}

export function getDeviceLoginStatus() {
  var auth = readAuth();
  if (!auth) return "none";
  if (isLoginExpired(auth)) return "expired";
  return "active";
}

// Persists a Supabase Auth session to this device. Used by signInDevice()
// below, and also by the onboarding flow (OnboardingPage.jsx) right after
// a brand-new salon owner signs up — same storage, same shape, one place
// that knows how to write it.
export function persistSession(data) {
  writeAuth({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    login_at: Date.now(),
  });
}

export async function signInDevice(email, password) {
  try {
    var res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password }),
    });

    if (!res.ok) return { ok: false, error: "Incorrect email or password." };

    var data = await res.json();
    if (!data.access_token) return { ok: false, error: "Login failed. Please try again." };

    persistSession(data);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Could not reach server. Check your connection." };
  }
}

// Replaces the human-facing email+password device login. Given just the
// salon_id (already resolvable from the URL slug before any auth exists),
// silently establishes a device session in the background - no email,
// no password, anywhere, ever, for normal use.
export async function silentDeviceLogin(salonId) {
  try {
    var res = await fetch(SUPABASE_URL + "/functions/v1/silent-device-login", {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ salon_id: salonId }),
    });

    var data = await res.json().catch(function() { return {}; });

    if (!res.ok || !data.access_token) {
      return { ok: false, error: (data && data.error) || "Could not connect to this salon. Please contact support." };
    }

    persistSession(data);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Could not reach server. Check your connection." };
  }
}

async function refreshAccessToken(auth) {
  try {
    var res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: auth.refresh_token }),
    });

    if (!res.ok) return null;

    var data = await res.json();
    if (!data.access_token) return null;

    var updated = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || auth.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      login_at: auth.login_at,
    };
    writeAuth(updated);
    return updated;
  } catch (e) {
    return null;
  }
}

export async function getValidAccessToken() {
  var auth = readAuth();
  if (!auth) return null;

  if (isLoginExpired(auth)) {
    clearDeviceAuth();
    return null;
  }

  if (Date.now() > auth.expires_at - REFRESH_SKEW_MS) {
    var refreshed = await refreshAccessToken(auth);
    if (!refreshed) {
      if (Date.now() < auth.expires_at) return auth.access_token;
      return null;
    }
    return refreshed.access_token;
  }

  return auth.access_token;
}
