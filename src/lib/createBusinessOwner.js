// src/lib/createBusinessOwner.js
//
// Calls the admin-create-business-owner Edge Function to create a business
// owner's Auth login. The browser must not call /auth/v1/admin/users itself:
// that endpoint needs the service-role key and rejects a super admin's
// session token with "User not allowed".

import { SUPABASE_URL, SUPABASE_KEY } from "./constants";

export async function createBusinessOwner(superAdminToken, email, password) {
  var res;
  try {
    res = await fetch(SUPABASE_URL + "/functions/v1/admin-create-business-owner", {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + superAdminToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email, password: password }),
    });
  } catch (e) {
    return { ok: false, error: "Network error: " + e.message };
  }
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    return { ok: false, error: data.error || data.msg || "Request failed (" + res.status + ")" };
  }
  return { ok: true, userId: data.user_id || null };
}
