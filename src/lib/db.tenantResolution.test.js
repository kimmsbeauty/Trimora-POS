// src/lib/db.tenantResolution.test.js
//
// Covers the one behavior change at the heart of removing the
// KIMMS_SALON_ID fallback: a tenant-scoped GET/POST/PATCH with no
// resolved salon id must return null and log loudly, never guess
// another salon's id and never throw (db()/dbDirect() have a
// documented never-throws contract other call sites across the app
// rely on -- see syncOfflineQueue and every existing db() caller that
// doesn't wrap calls in try/catch).

import { setCurrentSalonId } from "./currentSalon";

var originalFetch = global.fetch;

describe("db.js tenant resolution refusal", () => {
  beforeEach(() => {
    setCurrentSalonId(null);
    global.fetch = jest.fn();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error.mockRestore();
    setCurrentSalonId(null);
  });

  test("GET on a tenant-scoped table with no resolved salon returns null and never calls fetch", async () => {
    var { db } = await import("./db");
    var result = await db("GET", "services");
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("SECURITY"));
  });

  test("POST on a tenant-scoped table with no resolved salon does not throw, and never calls fetch", async () => {
    var { db } = await import("./db");
    await expect(db("POST", "feedback", { rating: 5 })).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("GET on a tenant-scoped table WITH a resolved salon proceeds to call fetch, scoped by that salon", async () => {
    setCurrentSalonId("real-salon-uuid-123");
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    var { db } = await import("./db");
    await db("GET", "services");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    var calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("salon_id=eq.real-salon-uuid-123");
  });

  test("a non-tenant table with no resolved salon is unaffected (proceeds without a salon_id filter)", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    var { db } = await import("./db");
    await db("GET", "subscription_plans");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    var calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).not.toContain("salon_id");
  });
});
