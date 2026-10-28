// @vitest-environment node
//
// Behavioural test of migration 113 (Google Calendar sync) against a REAL Postgres engine (PGlite).
// The platform stand-ins (salons, pet_bookings, pet_boarding_stays, auth_salon_id, the touch/audit
// helpers) carry only what 113 uses; they are NOT the live schema. The edge function writes with the
// service role (here: the superuser); the app role can only read its own connection row and call the
// two save/resync functions.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var db;
var CAL = "pawpals@group.calendar.google.com";
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function n(q, p) { return Number((await db.query(q, p || [])).rows[0].n); }
function outbox(salon) { return n("select count(*)::int n from public.pet_calendar_outbox where salon_id = $1", [salon]); }
async function appCall(salon, q, p) {
  await db.exec("set role authenticated");
  try { await as(salon); return await db.query(q, p || []); } finally { await db.exec("reset role"); }
}
function booking(salon, startsOffset) {
  return db.query("insert into public.pet_bookings (salon_id, starts_at, ends_at, status) values ($1, now() + $2::interval, now() + $2::interval + interval '1 hour', 'confirmed') returning id", [salon, startsOffset]);
}

beforeAll(async function () {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create table public.salons (id uuid primary key, name text);
    create table public.pet_bookings (id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'confirmed', notes text, updated_at timestamptz default now());
    create table public.pet_boarding_stays (id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), check_in_on date not null, check_out_on date not null, status text not null default 'reserved');
    create table public.audit_probe (tbl text, op text);
    create function public.auth_salon_id() returns uuid language sql stable
      as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function public.pet_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
    create function public.pet_audit_row() returns trigger language plpgsql as $$ begin insert into public.audit_probe values (tg_table_name, tg_op); return null; end; $$;
    grant usage on schema public to anon, authenticated;
    insert into public.salons values ('${A}', 'A'), ('${B}', 'B');
  `);
  await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/113_pet_google_calendar.sql"), "utf8"));
});
afterAll(async function () { await db.close(); });

describe("migration 113: saving the connection", function () {
  it("needs a signed-in business, a valid calendar id, and a calendar when switched on", async function () {
    await expect(appCall(null, "select public.pet_save_calendar_connection(true, $1)", [CAL])).rejects.toThrow(/NOT_AUTHENTICATED/);
    await expect(appCall(A, "select public.pet_save_calendar_connection(true, 'bad id with spaces')")).rejects.toThrow(/INVALID_CALENDAR_ID/);
    await expect(appCall(A, "select public.pet_save_calendar_connection(true, '  ')")).rejects.toThrow(/CALENDAR_REQUIRED/);
    await expect(appCall(A, "select public.pet_save_calendar_connection(true, null)")).rejects.toThrow(/CALENDAR_REQUIRED/);
    expect(await n("select count(*)::int n from public.pet_calendar_connections")).toBe(0);
  });

  it("table rules also reject an enabled row without a calendar and a malformed id", async function () {
    await expect(db.query("insert into public.pet_calendar_connections (salon_id, enabled) values ($1, true)", [A])).rejects.toThrow();
    await expect(db.query("insert into public.pet_calendar_connections (salon_id, enabled, calendar_id) values ($1, false, 'a b')", [A])).rejects.toThrow();
  });

  it("can be saved switched off without a calendar, and records nothing to sync", async function () {
    await appCall(A, "select public.pet_save_calendar_connection(false, null)");
    var r = await db.query("select enabled, calendar_id from public.pet_calendar_connections where salon_id = $1", [A]);
    expect(r.rows[0]).toEqual({ enabled: false, calendar_id: null });
    expect(await outbox(A)).toBe(0);
  });
});

describe("migration 113: change capture", function () {
  it("queues nothing while sync is off", async function () {
    var b = await booking(A, "1 day");
    await db.query("update public.pet_bookings set status = 'cancelled' where id = $1", [b.rows[0].id]);
    await db.query("delete from public.pet_bookings where id = $1", [b.rows[0].id]);
    expect(await outbox(A)).toBe(0);
  });

  it("switching on queues the upcoming bookings and stays, not old ones", async function () {
    await booking(A, "2 days"); await booking(A, "-10 days"); await booking(B, "2 days");
    await db.query("insert into public.pet_boarding_stays (salon_id, check_in_on, check_out_on) values ($1, current_date + 3, current_date + 6), ($1, current_date - 30, current_date - 27)", [A]);
    await appCall(A, "select public.pet_save_calendar_connection(true, $1)", [CAL]);
    var rows = (await db.query("select source_type from public.pet_calendar_outbox where salon_id = $1 order by source_type", [A])).rows.map(function (r) { return r.source_type; });
    expect(rows).toEqual(["booking", "stay"]);
    expect(await outbox(B)).toBe(0);
  });

  it("saving the same settings again does not queue everything twice, changing the calendar does", async function () {
    await appCall(A, "select public.pet_save_calendar_connection(true, $1)", [CAL]);
    expect(await outbox(A)).toBe(2);
    await appCall(A, "select public.pet_save_calendar_connection(true, 'other@group.calendar.google.com')");
    expect(await outbox(A)).toBe(4);
  });

  it("queues a row for each insert, update and delete once sync is on", async function () {
    var before = await outbox(A);
    var b = await booking(A, "5 days");
    await db.query("update public.pet_bookings set status = 'cancelled' where id = $1", [b.rows[0].id]);
    await db.query("delete from public.pet_bookings where id = $1", [b.rows[0].id]);
    expect(await outbox(A)).toBe(before + 3);
    var s = await db.query("insert into public.pet_boarding_stays (salon_id, check_in_on, check_out_on) values ($1, current_date + 9, current_date + 10) returning id", [A]);
    await db.query("update public.pet_boarding_stays set status = 'occupied' where id = $1", [s.rows[0].id]);
    expect(await outbox(A)).toBe(before + 5);
  });

  it("never queues for a business that has not switched it on", async function () {
    await booking(B, "6 days");
    expect(await outbox(B)).toBe(0);
  });

  it("stops queuing when switched off", async function () {
    await appCall(A, "select public.pet_save_calendar_connection(false, null)");
    var before = await outbox(A);
    await booking(A, "7 days");
    expect(await outbox(A)).toBe(before);
  });
});

describe("migration 113: resync", function () {
  it("is refused unless sync is on, and queues linked items too", async function () {
    await expect(appCall(A, "select public.pet_calendar_resync()")).rejects.toThrow(/NOT_CONNECTED/);
    await expect(appCall(null, "select public.pet_calendar_resync()")).rejects.toThrow(/NOT_AUTHENTICATED/);
    await appCall(A, "select public.pet_save_calendar_connection(true, $1)", [CAL]);
    var gone = "99999999-0000-0000-0000-000000000009";
    await db.query("insert into public.pet_calendar_events (salon_id, source_type, source_id, google_event_id, calendar_id, content_hash) values ($1, 'booking', $2, 'tkb99999999000000000000000000000009', $3, 'h')", [A, gone, CAL]);
    await db.query("delete from public.pet_calendar_outbox");
    await appCall(A, "select public.pet_calendar_resync()");
    var ids = (await db.query("select source_id from public.pet_calendar_outbox where salon_id = $1", [A])).rows.map(function (r) { return r.source_id; });
    expect(ids).toContain(gone);
  });
});

describe("migration 113: access and audit", function () {
  it("shows a business only its own connection row and lets it change nothing directly", async function () {
    await appCall(B, "select public.pet_save_calendar_connection(false, null)");
    var a = await appCall(A, "select salon_id from public.pet_calendar_connections");
    expect(a.rows.map(function (r) { return r.salon_id; })).toEqual([A]);
    await expect(appCall(A, "update public.pet_calendar_connections set enabled = false")).rejects.toThrow(/permission denied/);
    await expect(appCall(A, "insert into public.pet_calendar_connections (salon_id) values ($1)", [B])).rejects.toThrow(/permission denied/);
  });

  it("hides the outbox and the event links from the app and anon completely", async function () {
    for (var t of ["pet_calendar_outbox", "pet_calendar_events"]) {
      await expect(appCall(A, "select * from public." + t)).rejects.toThrow(/permission denied/);
      await db.exec("set role anon");
      try { await expect(db.query("select * from public." + t)).rejects.toThrow(/permission denied/); } finally { await db.exec("reset role"); }
    }
  });

  it("keeps the internal functions and the app functions away from anon", async function () {
    await expect(appCall(A, "select public.pet_calendar_queue_resync($1)", [A])).rejects.toThrow(/permission denied/);
    await db.exec("set role anon");
    try {
      await expect(db.query("select public.pet_save_calendar_connection(false, null)")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.pet_calendar_resync()")).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
  });

  it("audits switching on/off and the calendar, but not the status written after each sync", async function () {
    await db.query("delete from public.audit_probe");
    await db.query("update public.pet_calendar_connections set last_ok_at = now(), last_error = null where salon_id = $1", [A]);
    expect(await n("select count(*)::int n from public.audit_probe")).toBe(0);
    await appCall(A, "select public.pet_save_calendar_connection(false, null)");
    expect(await n("select count(*)::int n from public.audit_probe where tbl = 'pet_calendar_connections'")).toBe(1);
  });

  it("deletes a business's sync data with the business", async function () {
    await db.query("delete from public.pet_calendar_outbox where salon_id = $1", [B]);
    await db.query("delete from public.pet_calendar_connections where salon_id = $1", [B]);
    expect(await n("select count(*)::int n from public.pet_calendar_connections where salon_id = $1", [B])).toBe(0);
  });
});
