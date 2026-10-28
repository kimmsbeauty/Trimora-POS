// Flow tests for the pet-calendar-sync loop (sync.js) using an in-memory database and a fake Google.
import { runSync, makeApi, GoogleError } from "../../../supabase/functions/pet-calendar-sync/sync.js";

// ---- a tiny in-memory stand-in for the parts of the Supabase client the loop uses
function fakeDb(seed) {
  var T = {}; Object.keys(seed).forEach(function (k) { T[k] = seed[k].map(function (r) { return Object.assign({}, r); }); });
  var nextId = 1000;
  function builder(table) {
    var st = { op: "select", filters: [], order: null, lim: null, payload: null, opts: null };
    var b = {
      select: function () { return b; },
      eq: function (c, v) { st.filters.push(function (r) { return r[c] === v; }); return b; },
      is: function (c, v) { st.filters.push(function (r) { return (r[c] == null) === (v === null); }); return b; },
      not: function (c, op, v) { st.filters.push(function (r) { return !((r[c] == null) === (v === null)); }); return b; },
      lt: function (c, v) { st.filters.push(function (r) { return r[c] != null && r[c] < v; }); return b; },
      in: function (c, arr) { st.filters.push(function (r) { return arr.indexOf(r[c]) >= 0; }); return b; },
      order: function (c, o) { st.order = [c, !(o && o.ascending === false)]; return b; },
      limit: function (n) { st.lim = n; return b; },
      delete: function () { st.op = "delete"; return b; },
      update: function (p) { st.op = "update"; st.payload = p; return b; },
      upsert: function (p, o) { st.op = "upsert"; st.payload = p; st.opts = o; return b; },
      maybeSingle: function () { return Promise.resolve(exec(true)); },
      single: function () { return Promise.resolve(exec(true)); },
      then: function (res, rej) { return Promise.resolve(exec(false)).then(res, rej); },
    };
    function match(r) { return st.filters.every(function (f) { return f(r); }); }
    function exec(one) {
      var rows = T[table] = T[table] || [];
      if (st.op === "delete") { T[table] = rows.filter(function (r) { return !match(r); }); return { data: null }; }
      if (st.op === "update") { rows.forEach(function (r) { if (match(r)) Object.assign(r, st.payload); }); return { data: null }; }
      if (st.op === "upsert") {
        var keys = st.opts.onConflict.split(",");
        var hit = rows.filter(function (r) { return keys.every(function (k) { return r[k] === st.payload[k]; }); })[0];
        if (hit) Object.assign(hit, st.payload); else rows.push(Object.assign({ id: "gen" + (nextId++) }, st.payload));
        return { data: null };
      }
      var out = rows.filter(match);
      if (st.order) out = out.slice().sort(function (a, b2) { return (a[st.order[0]] - b2[st.order[0]]) * (st.order[1] ? 1 : -1); });
      if (st.lim != null) out = out.slice(0, st.lim);
      return { data: one ? (out[0] || null) : out.map(function (r) { return Object.assign({}, r); }) };
    }
    return b;
  }
  return { from: builder, T: T };
}

// ---- a fake Google that records calls and can be told to fail
function fakeGoogle() {
  var g = { calls: [], fail: [], events: {} };
  g.call = async function (method, cal, path, body) {
    g.calls.push({ method: method, cal: cal, path: path, body: body });
    var f = g.fail.filter(function (x) { return x.method === method && (!x.cal || x.cal === cal); })[0];
    if (f) { g.fail.splice(g.fail.indexOf(f), 1); throw new GoogleError(f.code); }
    return method === "DELETE" ? null : { id: body && body.id };
  };
  return g;
}

var S = "11111111-0000-0000-0000-000000000001";
var CAL = "pawpals@group.calendar.google.com";
var BK = "bbbbbbbb-1111-0000-0000-000000000001";
var ST = "cccccccc-2222-0000-0000-000000000001";

function seed(over) {
  return Object.assign({
    pet_calendar_connections: [{ salon_id: S, enabled: true, calendar_id: CAL, last_ok_at: null, last_error: null }],
    salons: [{ id: S, suspended: false }],
    pet_public_booking_settings: [{ salon_id: S, timezone: "Africa/Nairobi" }],
    customers: [{ id: "cu1", salon_id: S, name: "Jane Wanjiru" }],
    pet_pets: [{ id: "p1", salon_id: S, name: "Bella" }],
    staff: [{ id: "sf1", salon_id: S, name: "Amina" }],
    pet_kennels: [{ id: "k1", salon_id: S, name: "Kennel 3" }],
    pet_booking_services: [{ salon_id: S, booking_id: BK, service_name: "Full groom" }],
    pet_bookings: [{ id: BK, salon_id: S, customer_id: "cu1", pet_id: "p1", staff_id: "sf1", starts_at: "2026-11-02T06:00:00Z", ends_at: "2026-11-02T07:00:00Z", status: "confirmed", notes: "PRIVATE NOTE" }],
    pet_boarding_stays: [{ id: ST, salon_id: S, customer_id: "cu1", pet_id: "p1", kennel_id: "k1", check_in_on: "2026-11-02", check_out_on: "2026-11-05", status: "reserved", service_name: "Boarding", feeding_notes: "SECRET", care_notes: "SECRET" }],
    pet_calendar_events: [],
    pet_calendar_outbox: [],
  }, over || {});
}
var rowN = 0;
function q(db, type, id, extra) { db.T.pet_calendar_outbox.push(Object.assign({ id: ++rowN, salon_id: S, source_type: type, source_id: id, attempts: 0, processed_at: null, last_error: null }, extra || {})); }
function pending(db) { return db.T.pet_calendar_outbox.filter(function (r) { return !r.processed_at; }); }
async function go(db, g, salon) { return runSync(db, makeApi(g.call), salon || null, Date.parse("2026-10-30T10:00:00Z")); }

describe("creating events", function () {
  it("creates a grooming event with a fixed id, no guests and no emails, then records the link", async function () {
    var db = fakeDb(seed()); var g = fakeGoogle(); q(db, "booking", BK);
    var r = await go(db, g);
    expect(r).toEqual({ synced: 1, skipped: 0, failed: 0, remaining: 0 });
    expect(g.calls.length).toBe(1);
    var c = g.calls[0];
    expect(c.method).toBe("POST"); expect(c.cal).toBe(CAL); expect(c.path).toBe("/events?sendUpdates=none");
    expect(c.body.id).toMatch(/^tkb/); expect(c.body.summary).toBe("Grooming – Bella (Jane Wanjiru)");
    expect(c.body.attendees).toBeUndefined();
    expect(c.body.description).toContain("Groomer: Amina"); expect(c.body.description).toContain("Service: Full groom");
    expect(JSON.stringify(c.body)).not.toContain("PRIVATE NOTE");
    expect(db.T.pet_calendar_events.length).toBe(1);
    expect(db.T.pet_calendar_events[0]).toMatchObject({ source_type: "booking", source_id: BK, calendar_id: CAL, google_event_id: c.body.id });
    expect(pending(db).length).toBe(0);
    expect(db.T.pet_calendar_connections[0].last_ok_at).toBeTruthy();
    expect(db.T.pet_calendar_connections[0].last_error).toBeNull();
  });

  it("creates a boarding stay as an all-day event and never sends the care notes", async function () {
    var db = fakeDb(seed()); var g = fakeGoogle(); q(db, "stay", ST);
    await go(db, g);
    var b = g.calls[0].body;
    expect(b.summary).toBe("Boarding – Bella (Jane Wanjiru)");
    expect(b.start).toEqual({ date: "2026-11-02" }); expect(b.end).toEqual({ date: "2026-11-06" });
    expect(b.id).toMatch(/^tks/); expect(b.description).toContain("Kennel: Kennel 3");
    expect(JSON.stringify(b)).not.toContain("SECRET");
  });

  it("turns several queued changes to one booking into a single Google call", async function () {
    var db = fakeDb(seed()); var g = fakeGoogle();
    q(db, "booking", BK); q(db, "booking", BK); q(db, "booking", BK);
    await go(db, g);
    expect(g.calls.length).toBe(1);
    expect(pending(db).length).toBe(0);
  });
});

describe("keeping events up to date", function () {
  async function synced() { var db = fakeDb(seed()); var g = fakeGoogle(); q(db, "booking", BK); await go(db, g); g.calls.length = 0; return { db: db, g: g }; }

  it("does not call Google again when nothing sent has changed (e.g. a private note edit)", async function () {
    var x = await synced();
    x.db.T.pet_bookings[0].notes = "a different private note"; q(x.db, "booking", BK);
    var r = await go(x.db, x.g);
    expect(x.g.calls.length).toBe(0); expect(r.skipped).toBe(1);
    expect(pending(x.db).length).toBe(0);
  });

  it("updates the same event when the time or groomer changes", async function () {
    var x = await synced();
    x.db.T.pet_bookings[0].starts_at = "2026-11-02T08:00:00Z"; x.db.T.pet_bookings[0].ends_at = "2026-11-02T09:00:00Z"; q(x.db, "booking", BK);
    await go(x.db, x.g);
    expect(x.g.calls.length).toBe(1);
    expect(x.g.calls[0].method).toBe("PUT");
    expect(x.g.calls[0].path).toBe("/events/" + x.db.T.pet_calendar_events[0].google_event_id + "?sendUpdates=none");
    expect(x.g.calls[0].body.start.dateTime).toBe("2026-11-02T08:00:00.000Z");
    expect(x.db.T.pet_calendar_events.length).toBe(1);
  });

  it("removes the event when the booking is cancelled or marked no-show", async function () {
    var x = await synced();
    x.db.T.pet_bookings[0].status = "cancelled"; q(x.db, "booking", BK);
    await go(x.db, x.g);
    expect(x.g.calls.map(function (c) { return c.method; })).toEqual(["DELETE"]);
    expect(x.db.T.pet_calendar_events.length).toBe(0);
  });

  it("removes the event when the booking is deleted outright", async function () {
    var x = await synced();
    x.db.T.pet_bookings.length = 0; q(x.db, "booking", BK);
    await go(x.db, x.g);
    expect(x.g.calls.map(function (c) { return c.method; })).toEqual(["DELETE"]);
    expect(x.db.T.pet_calendar_events.length).toBe(0);
  });

  it("is fine if Google says the event is already gone", async function () {
    var x = await synced();
    x.db.T.pet_bookings[0].status = "no-show"; q(x.db, "booking", BK);
    x.g.fail.push({ method: "DELETE", code: "GONE" });
    var r = await go(x.db, x.g);
    expect(r.failed).toBe(0); expect(x.db.T.pet_calendar_events.length).toBe(0); expect(pending(x.db).length).toBe(0);
  });

  it("brings a cancelled booking back if it is reinstated (Google keeps the deleted id)", async function () {
    var x = await synced();
    x.db.T.pet_bookings[0].status = "cancelled"; q(x.db, "booking", BK); await go(x.db, x.g);
    x.g.calls.length = 0;
    x.db.T.pet_bookings[0].status = "confirmed"; q(x.db, "booking", BK);
    x.g.fail.push({ method: "POST", code: "CONFLICT" });
    var r = await go(x.db, x.g);
    expect(x.g.calls.map(function (c) { return c.method; })).toEqual(["POST", "PUT"]);
    expect(x.g.calls[1].body.status).toBe("confirmed");
    expect(r.failed).toBe(0); expect(x.db.T.pet_calendar_events.length).toBe(1);
  });

  it("recreates an event someone deleted by hand in Google, on the next change", async function () {
    var x = await synced();
    x.db.T.pet_bookings[0].ends_at = "2026-11-02T07:30:00Z"; q(x.db, "booking", BK);
    x.g.fail.push({ method: "PUT", code: "CALENDAR_NOT_FOUND" });
    await go(x.db, x.g);
    expect(x.g.calls.map(function (c) { return c.method; })).toEqual(["PUT", "POST"]);
  });

  it("moves events to the new calendar when the business changes its calendar", async function () {
    var x = await synced();
    x.db.T.pet_calendar_connections[0].calendar_id = "new@group.calendar.google.com"; q(x.db, "booking", BK);
    await go(x.db, x.g);
    expect(x.g.calls.map(function (c) { return c.method + " " + c.cal; })).toEqual(["DELETE " + CAL, "POST new@group.calendar.google.com"]);
    expect(x.db.T.pet_calendar_events[0].calendar_id).toBe("new@group.calendar.google.com");
  });
});

describe("when it cannot or should not sync", function () {
  it("drops work queued before the business switched sync off, without calling Google", async function () {
    var db = fakeDb(seed()); var g = fakeGoogle(); q(db, "booking", BK);
    db.T.pet_calendar_connections[0].enabled = false;
    var r = await go(db, g);
    expect(g.calls.length).toBe(0); expect(r.skipped).toBe(1); expect(pending(db).length).toBe(0);
  });

  it("skips a suspended business", async function () {
    var db = fakeDb(seed()); var g = fakeGoogle(); q(db, "booking", BK);
    db.T.salons[0].suspended = true;
    await go(db, g);
    expect(g.calls.length).toBe(0); expect(pending(db).length).toBe(0);
  });

  it("keeps a failed item queued, counts the attempt, and shows the reason in Settings", async function () {
    var db = fakeDb(seed()); var g = fakeGoogle(); q(db, "booking", BK);
    g.fail.push({ method: "POST", code: "CALENDAR_FORBIDDEN" });
    var r = await go(db, g);
    expect(r.failed).toBe(1);
    expect(db.T.pet_calendar_outbox[0]).toMatchObject({ attempts: 1, last_error: "CALENDAR_FORBIDDEN", processed_at: null });
    expect(db.T.pet_calendar_connections[0].last_error).toBe("CALENDAR_FORBIDDEN");
    expect(db.T.pet_calendar_events.length).toBe(0);
    // fixed on Google's side: the next run succeeds and clears the error
    var r2 = await go(db, g);
    expect(r2.synced).toBe(1); expect(pending(db).length).toBe(0);
    expect(db.T.pet_calendar_connections[0].last_error).toBeNull();
  });

  it("gives up on an item after 8 attempts", async function () {
    var db = fakeDb(seed()); var g = fakeGoogle(); q(db, "booking", BK, { attempts: 8, last_error: "RATE_LIMITED" });
    var r = await go(db, g);
    expect(g.calls.length).toBe(0); expect(r.synced + r.skipped + r.failed).toBe(0);
  });

  it("one item failing does not stop the others", async function () {
    var db = fakeDb(seed()); var g = fakeGoogle(); q(db, "booking", BK); q(db, "stay", ST);
    g.fail.push({ method: "POST", code: "RATE_LIMITED" });
    var r = await go(db, g);
    expect(r).toMatchObject({ synced: 1, failed: 1 });
  });

  it("only touches the business asked for when flushing one", async function () {
    var other = "22222222-0000-0000-0000-000000000002";
    var db = fakeDb(seed()); var g = fakeGoogle();
    q(db, "booking", BK); q(db, "booking", "dddddddd-0000-0000-0000-000000000009", { salon_id: other });
    await go(db, g, S);
    expect(g.calls.length).toBe(1);
    expect(pending(db).map(function (r) { return r.salon_id; })).toEqual([other]);
  });

  it("clears out processed rows older than a week", async function () {
    var db = fakeDb(seed()); var g = fakeGoogle();
    q(db, "booking", BK, { processed_at: "2026-10-01T00:00:00Z" }); q(db, "booking", BK, { processed_at: "2026-10-29T00:00:00Z" });
    await go(db, g);
    expect(db.T.pet_calendar_outbox.length).toBe(1);
  });
});

describe("makeApi", function () {
  it("treats a missing calendar or an already-deleted event as fine when removing", async function () {
    var calls = [];
    var api = makeApi(async function (m, c, p) { calls.push(m); throw new GoogleError("CALENDAR_NOT_FOUND"); });
    await expect(api.remove(CAL, "tkb1")).resolves.toBeUndefined();
  });
  it("lets other errors through when removing", async function () {
    var api = makeApi(async function () { throw new GoogleError("CALENDAR_FORBIDDEN"); });
    await expect(api.remove(CAL, "tkb1")).rejects.toThrow("CALENDAR_FORBIDDEN");
  });
});
