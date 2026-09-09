// src/lib/db.preLoginGuard.test.js
//
// Regression test for a real bug that shipped and reached production:
// M4 (2026-07-30 audit) made dbDirect() fail closed on any TENANT_TABLES
// table when there's no device token. That's correct for genuinely
// sensitive tenant tables, but salon_enabled_modules ALSO has a
// deliberate, audited anon-read RLS policy (M8) specifically so
// AutoApp.jsx can check "is this module turned on" BEFORE login exists.
// M4 didn't account for that and started blocking the check for every
// Auto-type salon -- caught live against a real salon (high-point-carwash)
// showing "Trimora Auto isn't turned on" despite the module actually
// being enabled in the database.
//
// This test exists so that regression can't silently ship again: it
// pins down that (a) ordinary tenant tables still fail closed with no
// token, and (b) PRE_LOGIN_READABLE_TENANT_TABLES members do NOT --
// they still proceed to fetch, so a pre-login check against them keeps
// working. If a future pre-login check needs a new tenant table, this
// test will fail until that table is deliberately added to
// PRE_LOGIN_READABLE_TENANT_TABLES (and, in practice, until a matching
// anon-read/anon-insert RLS policy exists for it -- see M8's reasoning).
//
// 2026-08-29: the same M4 guard shipped a second instance of this exact
// bug, this time against `feedback`. The public rating pages
// (RatingPage.jsx / AutoRatingPage.jsx, routes /:slug/rate/:token and
// /:slug/auto/rate/:token) POSTed to `feedback` with no device token by
// design -- the customer filling them out has never logged in. M4 didn't
// account for that either and started failing closed on every feedback
// submission. `feedback` was added to PRE_LOGIN_READABLE_TENANT_TABLES
// as the fix at the time, alongside a matching anon-INSERT RLS policy
// (feedback_anon_insert, migration 061).
//
// 2026-09-09: that same guard turned out to have a second, separate
// failure mode this exemption never covered -- see migration 080 and
// RatingPage.feedbackSubmission.test.jsx. The real fix replaced direct
// feedback writes with a token-validated RPC (submit_sale_feedback /
// submit_auto_job_feedback) that resolves salon_id server-side, so
// db("POST", "feedback", ...) is no longer called from anywhere, and
// feedback_anon_insert was retired along with it. `feedback` is
// removed from PRE_LOGIN_READABLE_TENANT_TABLES accordingly -- nothing
// legitimate needs it exempt anymore, and leaving it in place would
// just be a needless anon-write door on a table that no longer has an
// RLS policy behind it to actually allow that write. If feedback ever
// needs a pre-login db() call again, add it back deliberately alongside
// a real RLS policy, the same way salon_enabled_modules has one.

import { setCurrentSalonId } from "./currentSalon";
import { getValidAccessToken } from "./deviceAuth";
import { db, PRE_LOGIN_READABLE_TENANT_TABLES } from "./db";

vi.mock("./deviceAuth", () => ({
  getValidAccessToken: vi.fn(),
}));

var originalFetch = global.fetch;

describe("db.js pre-login tenant-table guard (M4 regression)", () => {
  beforeEach(() => {
    setCurrentSalonId("test-salon-id");
    getValidAccessToken.mockReset();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error.mockRestore();
    setCurrentSalonId(null);
  });

  test("PRE_LOGIN_READABLE_TENANT_TABLES currently contains exactly salon_enabled_modules", () => {
    expect(Array.from(PRE_LOGIN_READABLE_TENANT_TABLES).sort()).toEqual(
      ["salon_enabled_modules"]
    );
  });

  test("an ordinary tenant table with no device token still fails closed (real M4 behavior, unaffected)", async () => {
    getValidAccessToken.mockResolvedValue(null);

    var result = await db("GET", "services");

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("salon_enabled_modules with no device token still proceeds to fetch (the pre-login case M4 broke)", async () => {
    getValidAccessToken.mockResolvedValue(null);

    var result = await db("GET", "salon_enabled_modules", null, "?module_key=eq.auto&enabled=eq.true");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  test("salon_enabled_modules with a real device token also proceeds normally (unaffected by the exemption)", async () => {
    getValidAccessToken.mockResolvedValue("fake-device-token");

    var result = await db("GET", "salon_enabled_modules", null, "?module_key=eq.auto&enabled=eq.true");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  test("feedback POST with no device token now fails closed like any ordinary tenant table (no longer exempt -- see migration 080)", async () => {
    getValidAccessToken.mockResolvedValue(null);

    var result = await db("POST", "feedback", {
      rating: 5,
      note: "It was amazing will be coming back soon",
      client: "Mercy",
      feedback_token: "some-token",
      date: "2026-08-29",
      time: "10:13",
    });

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
