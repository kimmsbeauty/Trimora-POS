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
// (including one on the staff PIN) with no proof. It is only used below as a TEMPORARY
// fallback for the recovery flow (see resetAdminPinViaRecovery).

import { SUPABASE_URL, SUPABASE_KEY } from "./constants";

export var WRONG_ADMIN_PIN_MESSAGE =
  "Incorrect admin PIN. Several wrong attempts in a row temporarily lock admin sign-in.";

var SAFE_MESSAGES = [
  [/PIN must be 4-6 digits/i, "PIN must be 4–6 digits."],
  [/Staff and admin PINs must be different/i, "Staff and admin PINs must be different."],
  [/Not signed in/i, "Your session has expired. Please sign in again."],
  [/Nothing to change/i, "Enter at least one new PIN to update."],
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

// Forgot-PIN pages (the owner cannot supply the current PIN). Uses the email-link-only function.
//
// TEMPORARY FALLBACK: until migration 093 removes it, fall back to the old update_salon_pin if the
// new function is missing (404 / PGRST202: 091 not applied yet) or reports that it does not
// recognise the session as an email-link session. The recovery check relies on the JWT amr
// claim, which has been verified against production's recorded session methods but not with a
// real recovery email. The fallback guarantees an owner can never be locked out of recovery.
// Once the owner has completed a real recovery through the new path and 093 is applied, delete
// the fallback and the legacy call.
export async function resetAdminPinViaRecovery(opts) {
  var res;
  try {
    res = await rpc("reset_salon_admin_pin_via_recovery", opts.token, { p_new_pin: opts.newPin });
  } catch (e) {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
  if (res.ok) return { ok: true, via: "recovery" };

  var body = await res.json().catch(function () { return {}; });
  var msg = (body && (body.message || "")) + "";
  var missing = res.status === 404 || (body && body.code === "PGRST202");
  var notRecognised = /recent recovery email link/i.test(msg);

  if (missing || notRecognised) {
    var legacy;
    try {
      legacy = await rpc("update_salon_pin", opts.token, { p_role: "admin", p_new_pin: opts.newPin });
    } catch (e) {
      return { ok: false, error: "Network error. Check your connection and try again." };
    }
    if (legacy.ok) return { ok: true, via: "legacy-fallback" };
    var lb = await legacy.json().catch(function () { return {}; });
    return { ok: false, error: friendly(lb && lb.message) };
  }
  return { ok: false, error: friendly(msg) };
}
