// src/lib/db.tenantFilterInjection.test.js
//
// Audit Critical #2: "db.js's TENANT_TABLES injection logic has no
// dedicated test... Write tests that directly exercise db.js's
// GET/POST/PATCH filter injection for a TENANT_TABLES entry, not just
// the narrower KIMMS_SALON_ID-fallback test that exists today
// (db.tenantResolution.test.js)." This file is that missing coverage.
//
// db.tenantResolution.test.js already covers: refusal with no resolved
// salon, and that a resolved salon's id lands in the GET query string.
// This file covers what that one doesn't: the actual POST/PATCH BODY
// injection (not just GET's query-string injection), array-of-rows
// handling, and non-tenant tables being left alone on write.
//
// It also documents two real behaviors found while writing this
// coverage, neither of which existed as a test (or, in the second
// case, as documented behavior) before now -- flagged in the test
// descriptions themselves, not silently fixed, since changing either
// is a tenant-isolation-relevant code change that needs its own
// sign-off, not a side effect of adding tests.

import { setCurrentSalonId } from "./currentSalon";

var originalFetch = global.fetch;

describe("db.js TENANT_TABLES filter/body injection", () => {
  beforeEach(() => {
    setCurrentSalonId("real-salon-uuid-123");
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([{ id: 1 }]) });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error.mockRestore();
    setCurrentSalonId(null);
  });

  test("POST on a tenant table injects salon_id into the request body", async () => {
    var { db } = await import("./db");
    await db("POST", "customers", { name: "Mary", phone: "0712345678" });
    var callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody).toEqual({ salon_id: "real-salon-uuid-123", name: "Mary", phone: "0712345678" });
  });

  test("POST with an array of rows injects salon_id into every row", async () => {
    var { db } = await import("./db");
    await db("POST", "sales", [{ total: 500 }, { total: 800 }]);
    var callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody).toEqual([
      { salon_id: "real-salon-uuid-123", total: 500 },
      { salon_id: "real-salon-uuid-123", total: 800 },
    ]);
  });

  test("PATCH on a tenant table also injects salon_id into the body (same as POST)", async () => {
    var { db } = await import("./db");
    await db("PATCH", "staff", { commission_pct: 45 }, "?id=eq.staff-1");
    var callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody).toEqual({ salon_id: "real-salon-uuid-123", commission_pct: 45 });
  });

  test("GET on a tenant table merges the salon_id filter onto existing filters with '&'", async () => {
    var { db } = await import("./db");
    await db("GET", "sales", null, "?order=created_at.desc&limit=100");
    var calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("?order=created_at.desc&limit=100&salon_id=eq.real-salon-uuid-123");
  });

  test("a non-tenant table's POST body is left completely unmodified (no salon_id added)", async () => {
    var { db } = await import("./db");
    await db("POST", "subscription_plans", { key: "pro", price_kes: 2000 });
    var callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody).toEqual({ key: "pro", price_kes: 2000 });
  });

  // --- Findings below: real current behavior, proven here, not yet
  // acted on -- for review, not silently patched.

  test("FINDING: PATCH does NOT get an automatic salon_id filter appended to the URL (unlike GET)", async () => {
    // Unlike GET (tested above), dbDirect() only appends the salon_id
    // query-string filter when method === "GET". A PATCH/DELETE caller
    // must supply its own scoping filter (e.g. "?id=eq.X") by hand --
    // there is no automatic salon_id=eq.<resolved> safety net on the
    // URL for writes, only on the injected body. Verified live against
    // this Supabase project's actual schema before writing this: every
    // TENANT_TABLES table has `id` as its primary key (uuid via
    // gen_random_uuid() for most; `stock`/`products` use a
    // client-generated `text` id instead, but it's still the primary
    // key, so Postgres enforces it's globally unique regardless of
    // type) -- so a PATCH scoped only by "?id=eq.X" can't collide
    // across tenants today. But it means the filter string itself
    // carries no tenant boundary for PATCH/DELETE, only the body's
    // salon_id column does (relevant for PATCH; DELETE has no body at
    // all, so DELETE calls rely entirely on RLS plus a correctly-
    // scoped hand-written filter).
    var { db } = await import("./db");
    await db("PATCH", "staff", { commission_pct: 45 }, "?id=eq.staff-1");
    var calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).not.toContain("salon_id");
    expect(calledUrl).toContain("?id=eq.staff-1");
  });

  test("FINDING: if caller-supplied data already has a salon_id field, it OVERRIDES the resolved one", async () => {
    // dbDirect() builds the body as `{ salon_id: activeSalonId, ...row }`.
    // Object spread means keys in `row` are applied AFTER `salon_id`, so
    // if `row` itself already contains a `salon_id` key, that value wins
    // -- the resolved tenant id is silently discarded in favor of
    // whatever the caller passed.
    //
    // This is NOT hypothetical: grepping the codebase before writing
    // this test found it's already the norm for marketing-related
    // writes. POSApp.jsx's saveCampaignSettings(), toggleSmsActive(),
    // and sendBroadcast() (and their line-for-line duplicates in
    // src/pages/auto/AutoMarketingPage.jsx) all build a `body` object
    // containing `salon_id: salonId` themselves, then pass it straight
    // to db("POST"/"PATCH", "marketing_campaigns" / "salon_marketing_config", body)
    // -- e.g. POSApp.jsx's toggleSmsActive(): `db("POST",
    // "salon_marketing_config", { salon_id: salonId, is_sms_active: newVal })`.
    // In every one of those call sites `salonId` is resolved from the
    // same `salon` object db.js's own getCurrentSalonId() would
    // resolve to, so today this is a harmless no-op override, not an
    // active bug. But it means db.js's injection is not a hard
    // enforcement boundary against a future caller (buggy or
    // malicious) that includes a *different* salon_id in the data
    // object -- that value would silently win over the real tenant,
    // exactly as this test demonstrates with a deliberately different
    // value.
    var { db } = await import("./db");
    await db("POST", "customers", { name: "Mary", salon_id: "attacker-supplied-salon-id" });
    var callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.salon_id).toBe("attacker-supplied-salon-id");
    expect(callBody.salon_id).not.toBe("real-salon-uuid-123");
  });
});
