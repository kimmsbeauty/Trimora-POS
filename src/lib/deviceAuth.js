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
var REFRESH_SKEW_MS = 60 * 1000; // refresh slightly before actual expiry

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
  } catch (e) {
    // ignore (e.g. private browsing storage restrictions)
  }
}

export function clearDeviceAuth() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}

function isLoginExpired(auth) {
  if (!auth || !auth.login_at) return true;
  return Date.now() - auth.login_at > THIRTY_DAYS_MS;
}

// "none"    -> never signed in on this device
// "expired" -> signed in before, but 30 days have passed
// "active"  -> signed in and still within the 30-day window
export function getDeviceLoginStatus() {
  var auth = readAuth();
  if (!auth) return "none";
  if (isLoginExpired(auth)) return "expired";
  return "active";
}

// Called only from the device login screen, with the email/password
// for this salon's Supabase Auth user.
export async function signInDevice(email, password) {
  try {
    var res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email, password: password }),
    });

    if (!res.ok) {
      return { ok: false, error: "Incorrect email or password." };
    }

    var data = await res.json();
    if (!data.access_token) {
      return { ok: false, error: "Login failed. Please try again." };
    }

    writeAuth({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      login_at: Date.now(), // resets the 30-day clock
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Could not reach server. Check your connection." };
  }
}

// Silently exchanges the stored refresh_token for a fresh access_token.
// Does NOT touch login_at — only a real email/password login resets
// the 30-day clock, exactly as agreed.
async function refreshAccessToken(auth) {
  try {
    var res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
      },
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
    return null; // offline, most likely — try again next time, don't force a logout
  }
}

// Used by db.js on every request. Returns a usable access_token, or
// null if this device has no active login (e.g. the customer-facing
// booking/rating pages, which never sign in at all — that's normal).
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
