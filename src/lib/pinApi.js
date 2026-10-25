// src/lib/pinApi.js
//
// The ONLY client code that changes a salon PIN. Shared by SalonSettingsPage, AutoSettingsPage,
// ResetPinPage and ResetPasswordPage so the security-sensitive calls live in one tested place.
//
// Server side: supabase/migrations/091_pin_step_up.sql (and 093, held).
//   change_salon_pins(current_admin_pin, new_staff_pin?, new_admin_pin?) -> boolean
//       Settings pages. Needs the CURRENT admin PIN. true = changed, false = wrong PIN.
//   reset_salon_admin_pin_via_recovery(new_pin)
//       Forgot-PIN pages. Needs a recent email-link session (JWT amr method 'otp').
//
// The old update_salon_pin(role, new_pin) accepted a PIN change from any signed-in device
// (including one on the staff PIN) with no proof. Migration 093 revoked it from the API and this
// module no longer references it; a static test fails if any client code does.

import { SUPABASE_URL, SUPABASE_KEY } from "./constants";

export var WRONG_ADMIN_PIN_MESSAGE =
  "Incorrect admin PIN. Several wrong attempts in a row temporarily lock admin sign-in.";

var SAFE_MESSAGES = [
  [/PIN must be 4-6 digits/i, "PIN must be 4–6 digits."],
  [/Staff and admin PINs must be different/i, "Staff and admin PINs must be different."],
  [/Not signed in/i, "Your session has expired. Please sign in again."],
  [/Nothing to change/i, "Enter at least one new PIN to update."],
  [/recent recovery email link/i, "This reset link is no longer valid. Request a new PIN reset email and try again."],
];

function friendly(serverMessage) {
  for (var i = 0; i < SAFE_MESSAGES.length; i++) {
    if (SAFE_MESSAGES[i][0].test(serverMessage || "")) return SAFE_MESSAGES[i][1];
  }
  return "PIN update failed. Please try again.";
}

function rpc(name, token, body) {
  return fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + (token || SUPABASE_KEY),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// Settings pages. Both PINs go in ONE atomic call (two parallel calls would race: the second
// would be checked against an admin PIN the first had just changed).
export async function changeSalonPins(opts) {
  var res;
  try {
    res = await rpc("change_salon_pins", opts.token, {
      p_current_admin_pin: opts.currentAdminPin || "",
      p_new_staff_pin: opts.newStaffPin || null,
      p_new_admin_pin: opts.newAdminPin || null,
    });
  } catch (e) {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
  var body = await res.json().catch(function () { return null; });
  if (res.ok && body === true) return { ok: true };
  if (res.ok && body === false) return { ok: false, wrongPin: true, error: WRONG_ADMIN_PIN_MESSAGE };
  return { ok: false, error: friendly(body && body.message) };
}

// Forgot-PIN pages (the owner cannot supply the current PIN). Uses the email-link-only function:
// the server accepts it only for a session started by an email link within the last hour, so a
// device signed in with a PIN cannot use it. There is deliberately no fallback to anything else.
export async function resetAdminPinViaRecovery(opts) {
  var res;
  try {
    res = await rpc("reset_salon_admin_pin_via_recovery", opts.token, { p_new_pin: opts.newPin });
  } catch (e) {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
  if (res.ok) return { ok: true };
  var body = await res.json().catch(function () { return {}; });
  return { ok: false, error: friendly(body && body.message) };
}
