// src/lib/superAdminAuth.js
//
// Handles super admin authentication separately from salon device auth.
// Super admin logs in with email/password via Supabase Auth.
// Access is gated on the is_super_admin flag in app_metadata (not
// user_metadata — that field is self-editable by any authenticated
// user via the client SDK, so it can't be trusted as an admin gate).
// Session stored in sessionStorage (not localStorage) — expires when
// browser tab is closed, which is appropriate for an admin console.

import { SUPABASE_URL, SUPABASE_KEY } from "./constants";

var SESSION_KEY = "trimora_superadmin_session";

export async function superAdminLogin(email, password) {
  try {
    var res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: {
        apikey:          SUPABASE_KEY,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    var data = await res.json();

    if (!res.ok || !data.access_token) {
      return { ok: false, error: data.error_description || data.msg || "Login failed" };
    }

    // Verify the is_super_admin flag in app metadata (service-role-only,
    // not self-editable — see comment above)
    var isSuperAdmin = data.user &&
      data.user.app_metadata &&
      data.user.app_metadata.is_super_admin === true;

    if (!isSuperAdmin) {
      return { ok: false, error: "Access denied. This account is not a super admin." };
    }

    // Store session in sessionStorage — gone when tab closes
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Date.now() + (data.expires_in * 1000),
      email:         data.user.email,
      uid:           data.user.id,
    }));

    return { ok: true };

  } catch (err) {
    console.error("superAdminLogin error:", err);
    return { ok: false, error: "Network error. Please try again." };
  }
}

export function getSuperAdminSession() {
  try {
    var raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    var session = JSON.parse(raw);
    // Check expiry
    if (Date.now() > session.expires_at) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch (e) {
    return null;
  }
}

export function isSuperAdminLoggedIn() {
  return getSuperAdminSession() !== null;
}

export function superAdminLogout() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getSuperAdminToken() {
  var session = getSuperAdminSession();
  return session ? session.access_token : null;
}

// Authenticated fetch wrapper for super admin API calls
export async function saFetch(method, table, filters, body) {
  var token = getSuperAdminToken();
  if (!token) throw new Error("Not authenticated");

  var url = SUPABASE_URL + "/rest/v1/" + table + (filters || "");
  var res = await fetch(url, {
    method: method || "GET",
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   "Bearer " + token,
      "Content-Type":  "application/json",
      Prefer:          method === "POST" ? "return=representation" : "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) return null;
  if (method === "PATCH" || method === "DELETE") return true;
  return res.json();
}
