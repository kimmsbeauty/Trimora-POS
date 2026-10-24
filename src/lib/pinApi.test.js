// src/lib/pinApi.test.js
import { changeSalonPins, resetAdminPinViaRecovery, WRONG_ADMIN_PIN_MESSAGE } from "./pinApi";

var originalFetch = global.fetch;
function reply(status, body) { return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } }); }
function calls() { return global.fetch.mock.calls.map(function (c) { return { url: c[0], body: JSON.parse(c[1].body), headers: c[1].headers }; }); }

describe("changeSalonPins (settings step-up)", function () {
  afterEach(function () { global.fetch = originalFetch; });

  it("sends ONE atomic call to change_salon_pins with the current admin PIN as proof", async function () {
    global.fetch = vi.fn().mockReturnValue(reply(200, true));
    var r = await changeSalonPins({ token: "tok", currentAdminPin: "9999", newStaffPin: "1234", newAdminPin: "5678" });
    expect(r).toEqual({ ok: true });
    var c = calls();
    expect(c.length).toBe(1);
    expect(c[0].url).toMatch(/\/rest\/v1\/rpc\/change_salon_pins$/);
    expect(c[0].body).toEqual({ p_current_admin_pin: "9999", p_new_staff_pin: "1234", p_new_admin_pin: "5678" });
    expect(c[0].headers.Authorization).toBe("Bearer tok");
  });
  it("sends null (not empty string) for a PIN that is not being changed", async function () {
    global.fetch = vi.fn().mockReturnValue(reply(200, true));
    await changeSalonPins({ token: "t", currentAdminPin: "9999", newStaffPin: "1234", newAdminPin: "" });
    expect(calls()[0].body.p_new_admin_pin).toBeNull();
    expect(calls()[0].body.p_new_staff_pin).toBe("1234");
  });
  it("never calls the old unconditional update_salon_pin", async function () {
    global.fetch = vi.fn().mockReturnValue(reply(200, true));
    await changeSalonPins({ token: "t", currentAdminPin: "9999", newAdminPin: "5678" });
    expect(calls().some(function (c) { return /update_salon_pin/.test(c.url); })).toBe(false);
  });
  it("treats a 200 with `false` as a WRONG admin PIN (server records the attempt)", async function () {
    global.fetch = vi.fn().mockReturnValue(reply(200, false));
    var r = await changeSalonPins({ token: "t", currentAdminPin: "0000", newAdminPin: "5678" });
    expect(r.ok).toBe(false); expect(r.wrongPin).toBe(true); expect(r.error).toBe(WRONG_ADMIN_PIN_MESSAGE);
  });
  it("never reports success for anything other than literal true", async function () {
    var odd = [null, "true", 1, {}, []];
    for (var i = 0; i < odd.length; i++) {
      global.fetch = vi.fn().mockReturnValue(reply(200, odd[i]));
      var r = await changeSalonPins({ token: "t", currentAdminPin: "9999", newAdminPin: "5678" });
      expect(r.ok).toBe(false);
    }
  });
  it("maps known server validation messages to friendly text and hides unknown ones", async function () {
    global.fetch = vi.fn().mockReturnValue(reply(400, { message: "PIN must be 4-6 digits" }));
    expect((await changeSalonPins({ token: "t", currentAdminPin: "9999", newAdminPin: "12" })).error).toBe("PIN must be 4–6 digits.");
    global.fetch = vi.fn().mockReturnValue(reply(400, { message: "Not signed in" }));
    expect((await changeSalonPins({ token: "t", currentAdminPin: "9999", newAdminPin: "5678" })).error).toMatch(/sign in again/);
    global.fetch = vi.fn().mockReturnValue(reply(500, { message: "relation salon_pins internal detail" }));
    var r = await changeSalonPins({ token: "t", currentAdminPin: "9999", newAdminPin: "5678" });
    expect(r.error).toBe("PIN update failed. Please try again.");
    expect(r.error).not.toMatch(/salon_pins/);
  });
  it("survives a network failure with a friendly error", async function () {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    var r = await changeSalonPins({ token: "t", currentAdminPin: "9999", newAdminPin: "5678" });
    expect(r.ok).toBe(false); expect(r.error).toMatch(/Network error/);
  });
});

describe("resetAdminPinViaRecovery (forgot-PIN)", function () {
  afterEach(function () { global.fetch = originalFetch; });

  it("uses the email-link function and does NOT touch the legacy one on success", async function () {
    global.fetch = vi.fn().mockReturnValue(reply(200, null));
    var r = await resetAdminPinViaRecovery({ token: "rec", newPin: "4321" });
    expect(r).toEqual({ ok: true, via: "recovery" });
    var c = calls();
    expect(c.length).toBe(1);
    expect(c[0].url).toMatch(/reset_salon_admin_pin_via_recovery$/);
    expect(c[0].body).toEqual({ p_new_pin: "4321" });
    expect(c[0].headers.Authorization).toBe("Bearer rec");
  });
  it("falls back to the legacy function when 090 is not applied yet (404 / PGRST202)", async function () {
    global.fetch = vi.fn().mockReturnValueOnce(reply(404, { code: "PGRST202", message: "Could not find the function" })).mockReturnValueOnce(reply(200, null));
    var r = await resetAdminPinViaRecovery({ token: "rec", newPin: "4321" });
    expect(r).toEqual({ ok: true, via: "legacy-fallback" });
    expect(calls()[1].url).toMatch(/update_salon_pin$/);
    expect(calls()[1].body).toEqual({ p_role: "admin", p_new_pin: "4321" });
  });
  it("falls back when the server does not recognise the session as an email link (owner is never locked out)", async function () {
    global.fetch = vi.fn().mockReturnValueOnce(reply(400, { message: "PIN reset requires a recent recovery email link" })).mockReturnValueOnce(reply(200, null));
    var r = await resetAdminPinViaRecovery({ token: "rec", newPin: "4321" });
    expect(r.ok).toBe(true); expect(r.via).toBe("legacy-fallback");
  });
  it("does NOT fall back for unrelated errors (e.g. invalid PIN)", async function () {
    global.fetch = vi.fn().mockReturnValue(reply(400, { message: "PIN must be 4-6 digits" }));
    var r = await resetAdminPinViaRecovery({ token: "rec", newPin: "12" });
    expect(r.ok).toBe(false); expect(r.error).toBe("PIN must be 4–6 digits.");
    expect(calls().length).toBe(1);
  });
  it("reports failure if the fallback also fails", async function () {
    global.fetch = vi.fn().mockReturnValueOnce(reply(404, { code: "PGRST202" })).mockReturnValueOnce(reply(400, { message: "No admin PIN record" }));
    var r = await resetAdminPinViaRecovery({ token: "rec", newPin: "4321" });
    expect(r.ok).toBe(false);
  });
  it("survives a network failure", async function () {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    expect((await resetAdminPinViaRecovery({ token: "r", newPin: "4321" })).error).toMatch(/Network error/);
  });
});
