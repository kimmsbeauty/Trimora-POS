// src/lib/salesRepAuth.js
//
// Handles sales rep authentication, completely separate from super admin
// auth and salon device auth. Sales reps log in with email/password via
// Supabase Auth, same as super admin. Access is gated on the
// is_sales_rep flag in app_metadata (never user_metadata -- that field
// is self-editable by any authenticated user via the client SDK, so it
// can't be trusted as a role gate -- see the 2026-07-02/07-05
// privilege-escalation fixes for exactly why this distinction matters).
//
// This file is a deliberate parallel of superAdminAuth.js, not a shared
// abstraction -- kept separate so nothing about the existing, working
// super admin auth path is touched by this addition.
// Session stored in sessionStorage (not localStorage) -- expires when
// the browser tab is closed, appropriate for a rep's own device/session.

import { SUPABASE_URL, SUPABASE_KEY } from "./constants";

var SESSION_KEY = "trimora_salesrep_session";

export async function salesRepLogin(email, password) {
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

    // Verify the is_sales_rep flag in app metadata (service-role-only,
    // not self-editable -- see comment above)
    var isSalesRep = data.user &&
      data.user.app_metadata &&
      data.user.app_metadata.is_sales_rep === true;

    if (!isSalesRep) {
      return { ok: false, error: "Access denied. This account is not a sales rep." };
    }

    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Date.now() + (data.expires_in * 1000),
      email:         data.user.email,
      uid:           data.user.id,
    }));

    return { ok: true };

  } catch (err) {
    console.error("salesRepLogin error:", err);
    return { ok: false, error: "Network error. Please try again." };
  }
}

export function getSalesRepSession() {
  try {
    var raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    var session = JSON.parse(raw);
    if (Date.now() > session.expires_at) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch (e) {
    return null;
  }
}

export function isSalesRepLoggedIn() {
  return getSalesRepSession() !== null;
}

export function salesRepLogout() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getSalesRepToken() {
  var session = getSalesRepSession();
  return session ? session.access_token : null;
}

// Authenticated fetch wrapper for sales rep API calls
export async function repFetch(method, table, filters, body) {
  var token = getSalesRepToken();
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
