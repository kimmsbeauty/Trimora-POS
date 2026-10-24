// src/lib/createBusinessOwner.test.js
import { describe, it, expect, vi, afterEach } from "vitest";
import { createBusinessOwner } from "./createBusinessOwner";

function mockFetch(status, body) {
  var fn = vi.fn(function () {
    return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(function () { vi.unstubAllGlobals(); });

describe("createBusinessOwner", function () {
  it("calls the Edge Function, never the Auth admin endpoint", async function () {
    var fn = mockFetch(200, { success: true, user_id: "u1" });
    var r = await createBusinessOwner("tok", "a@b.co", "password123");
    var call = fn.mock.calls[0];
    expect(call[0]).toMatch(/\/functions\/v1\/admin-create-business-owner$/);
    expect(call[0]).not.toMatch(/auth\/v1\/admin/);
    expect(call[1].headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(call[1].body)).toEqual({ email: "a@b.co", password: "password123" });
    expect(r).toEqual({ ok: true, userId: "u1" });
  });

  it("surfaces the function's error message", async function () {
    mockFetch(403, { error: "Access denied: super admin only" });
    var r = await createBusinessOwner("tok", "a@b.co", "password123");
    expect(r).toEqual({ ok: false, error: "Access denied: super admin only" });
  });

  it("handles a non-JSON error response", async function () {
    vi.stubGlobal("fetch", vi.fn(function () {
      return Promise.resolve({ ok: false, status: 502, json: function () { return Promise.reject(new Error("x")); } });
    }));
    var r = await createBusinessOwner("tok", "a@b.co", "password123");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/502/);
  });

  it("handles a network failure", async function () {
    vi.stubGlobal("fetch", vi.fn(function () { return Promise.reject(new Error("offline")); }));
    var r = await createBusinessOwner("tok", "a@b.co", "password123");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/offline/);
  });
});
