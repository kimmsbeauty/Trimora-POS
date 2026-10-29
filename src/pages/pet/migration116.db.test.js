// @vitest-environment node
//
// Behavioural test of migration 116 (daycare visits join the Google Calendar sync) against a REAL Postgres
// engine (PGlite), applied on top of migration 113. The platform stand-ins carry only what 113 and 116 use;
// they are NOT the live schema.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

var A = "aaaaaaaa-0000-0000-0000-000000000001";   // calendar switched on BEFORE 116 is applied
var B = "bbbbbbbb-0000-0000-0000-000000000002";   // no calendar
var CAL = "pawpals@group.calendar.google.com";
var db;
async function n(q, p) { return Number((await db.query(q, p || [])).rows[0].n); }
function outbox(salon, type) { return n("select count(*)::int n from public.pet_calendar_outbox where salon_id = $1 and source_type = $2", [salon, type]); }
function visit(salon, startOffset) {
  return db.query("insert into public.pet_daycare_visits (salon_id, scheduled_start, scheduled_end, status) values ($1, now() + $2::interval, now() + $2::interval + interval '8 hours', 'booked') returning id", [salon, startOffset]);
}
async function appCall(salon, q) {
  await db.exec("set role authenticated");
  try { await db.query("select set_config('app.salon_id', $1, false)", [salon]); return await db.query(q); } finally { await db.exec("reset role"); }
}

beforeAll(async function () {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create table public.salons (id uuid primary key, name text);
    create table public.pet_bookings (id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'booked', updated_at timestamptz default now());
    create table public.pet_boarding_stays (id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), check_in_on date not null, check_out_on date not null, status text not null default 'reserved');
    create table public.pet_daycare_visits (id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), scheduled_start timestamptz not null, scheduled_end timestamptz not null, status text not null default 'booked');
    create table public.audit_probe (tbl text, op text);
    create function public.auth_salon_id() returns uuid language sql stable as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function public.pet_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
    create function public.pet_audit_row() returns trigger language plpgsql as $$ begin insert into public.audit_probe values (tg_table_name, tg_op); return null; end; $$;
    grant usage on schema public to anon, authenticated;
    insert into public.salons values ('${A}', 'A'), ('${B}', 'B');
  `);
  await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/113_pet_google_calendar.sql"), "utf8"));
  // State BEFORE 116: A already has the calendar on and some daycare visits; B has visits but no calendar.
  await db.query("insert into public.pet_calendar_connections (salon_id, enabled, calendar_id) values ($1, true, $2)", [A, CAL]);
  await visit(A, "1 day");        // upcoming  -> must be caught up
  await visit(A, "-10 days");     // long past -> must not
  await visit(B, "1 day");        // other business, no calendar -> must not
  await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/116_pet_calendar_daycare.sql"), "utf8"));
});
afterAll(async function () { await db.close(); });

describe("migration 116: catching up businesses that already have the calendar on", function () {
  it("queues only the upcoming daycare visits of businesses with sync on", async function () {
    expect(await outbox(A, "daycare")).toBe(1);
    expect(await outbox(B, "daycare")).toBe(0);
  });
});

describe("migration 116: daycare changes are queued like bookings and stays", function () {
  it("queues a new, changed and deleted visit for a business with sync on", async function () {
    var before = await outbox(A, "daycare");
    var id = (await visit(A, "2 days")).rows[0].id;
    expect(await outbox(A, "daycare")).toBe(before + 1);
    await db.query("update public.pet_daycare_visits set status = 'checked-in' where id = $1", [id]);
    expect(await outbox(A, "daycare")).toBe(before + 2);
    await db.query("delete from public.pet_daycare_visits where id = $1", [id]);
    expect(await outbox(A, "daycare")).toBe(before + 3);
  });

  it("queues nothing for a business that has not switched the calendar on", async function () {
    await visit(B, "3 days");
    expect(await outbox(B, "daycare")).toBe(0);
  });

  it("stops queueing when the business switches sync off", async function () {
    await db.query("update public.pet_calendar_connections set enabled = false where salon_id = $1", [A]);
    var before = await outbox(A, "daycare");
    await visit(A, "4 days");
    expect(await outbox(A, "daycare")).toBe(before);
    await db.query("update public.pet_calendar_connections set enabled = true where salon_id = $1", [A]);
  });
});

describe("migration 116: Sync now re-queues daycare too", function () {
  it("includes upcoming daycare visits, still includes bookings and stays", async function () {
    await db.query("insert into public.pet_bookings (salon_id, starts_at, ends_at) values ($1, now() + interval '1 day', now() + interval '1 day 1 hour')", [A]);
    await db.query("insert into public.pet_boarding_stays (salon_id, check_in_on, check_out_on) values ($1, current_date + 1, current_date + 3)", [A]);
    await db.query("delete from public.pet_calendar_outbox");
    await appCall(A, "select public.pet_calendar_resync()");
    expect(await outbox(A, "booking")).toBeGreaterThanOrEqual(1);
    expect(await outbox(A, "stay")).toBeGreaterThanOrEqual(1);
    expect(await outbox(A, "daycare")).toBeGreaterThanOrEqual(1);
    // the long-past visit is not re-queued
    expect(await n("select count(*)::int n from public.pet_calendar_outbox o join public.pet_daycare_visits d on d.id = o.source_id where o.source_type = 'daycare' and d.scheduled_end < now() - interval '2 days'")).toBe(0);
  });
});

describe("migration 116: the tables accept daycare links but nothing else new", function () {
  it("allows source_type daycare in the events and outbox tables, still rejects others", async function () {
    await db.query("insert into public.pet_calendar_events (salon_id, source_type, source_id, google_event_id, calendar_id, content_hash) values ($1, 'daycare', gen_random_uuid(), 'tkdabcdef0123', $2, 'h')", [A, CAL]);
    await expect(db.query("insert into public.pet_calendar_events (salon_id, source_type, source_id, google_event_id, calendar_id, content_hash) values ($1, 'junk', gen_random_uuid(), 'tkdabcdef9999', $2, 'h')", [A, CAL])).rejects.toThrow();
    await expect(db.query("insert into public.pet_calendar_outbox (salon_id, source_type, source_id) values ($1, 'junk', gen_random_uuid())", [A])).rejects.toThrow();
  });

  it("keeps the app locked out of the queue tables", async function () {
    await expect(appCall(A, "select * from public.pet_calendar_outbox")).rejects.toThrow();
    await expect(appCall(A, "select * from public.pet_calendar_events")).rejects.toThrow();
  });
});
