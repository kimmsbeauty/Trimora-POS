// @vitest-environment node
//
// Behavioural test of migration 088 (pet bookings) against a REAL Postgres
// engine (PGlite, in process). The existing migration088.test.js only checks the
// SQL text; this one applies the repo's real migrations 083-088 and tries to
// break them: overlaps, back-to-back, cancel/no-show releasing slots, concurrent
// attempts, the status flow, cross-business access, grants and RLS.
//
// The stand-in for the platform tables (salons, customers, staff, auth_salon_id,
// auth.uid, the anon/authenticated roles) is NOT the live schema -- the base-table
// DDL is not in the repo. It only provides the columns the pet migrations use.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

var MIG = path.join(process.cwd(), "supabase/migrations");
function sql(file) { return fs.readFileSync(path.join(MIG, file), "utf8"); }

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var CUST_A = "c0000000-0000-0000-0000-00000000000a";
var CUST_A2 = "c0000000-0000-0000-0000-0000000000a2";
var CUST_B = "c0000000-0000-0000-0000-00000000000b";
var STAFF_A1 = "50000000-0000-0000-0000-0000000000a1";
var STAFF_A2 = "50000000-0000-0000-0000-0000000000a2";
var STAFF_OFF = "50000000-0000-0000-0000-0000000000a3"; // inactive
var STAFF_B = "50000000-0000-0000-0000-0000000000b1";
var PET_A1 = "e0000000-0000-0000-0000-0000000000a1";
var PET_A2 = "e0000000-0000-0000-0000-0000000000a2";
var PET_B = "e0000000-0000-0000-0000-0000000000b1";
var SVC_BATH = "f0000000-0000-0000-0000-000000000001"; // 60 min, 1500
var SVC_NAILS = "f0000000-0000-0000-0000-000000000002"; // no duration, 500
var SVC_OFF = "f0000000-0000-0000-0000-000000000004"; // inactive
var SVC_B = "f0000000-0000-0000-0000-0000000000b1";

var db;

// A moment n days from now at hh:mm Nairobi time (UTC+3).
function at(days, hh, mm) {
  var d = new Date(Date.now() + days * 86400000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh - 3, mm || 0));
}
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function create(args) {
  var a = Object.assign({ customer: CUST_A, pet: PET_A1, staff: STAFF_A1, start: at(2, 9), minutes: 60, services: [SVC_BATH], walkIn: false, notes: null }, args || {});
  var end = new Date(a.start.getTime() + a.minutes * 60000);
  var r = await db.query("select public.pet_create_booking($1,$2,$3,$4,$5,$6::uuid[],$7,$8) as id",
    [a.customer, a.pet, a.staff, a.start.toISOString(), end.toISOString(), a.services, a.walkIn, a.notes]);
  return r.rows[0].id;
}
async function update(id, staff, start, minutes, notes) {
  var end = new Date(start.getTime() + minutes * 60000);
  await db.query("select public.pet_update_booking($1,$2,$3,$4,$5)", [id, staff, start.toISOString(), end.toISOString(), notes === undefined ? null : notes]);
}
async function setStatus(id, status) {
  return (await db.query("select public.pet_set_booking_status($1,$2) as s", [id, status])).rows[0].s;
}
async function row(id) { return (await db.query("select * from public.pet_bookings where id=$1", [id])).rows[0]; }

beforeAll(async function () {
  db = new PGlite({ extensions: { btree_gist: btree_gist } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema extensions; create schema auth;
    create table public.salons (id uuid primary key, name text);
    create table public.customers (id uuid primary key, salon_id uuid not null, name text);
    create table public.staff (id uuid primary key, salon_id uuid not null, name text, active boolean default true);
    create function public.auth_salon_id() returns uuid language sql stable
      as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    grant usage on schema public to anon, authenticated;
  `);
  // The pet migrations, in repo order (088 triggers the audit function from 087).
  for (var f of ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql",
    "087_pet_audit_log.sql", "088_pet_bookings.sql"]) { await db.exec(sql(f)); }
  await db.exec(`
    insert into public.salons values ('${A}','A'),('${B}','B');
    insert into public.customers values ('${CUST_A}','${A}','Ann'),('${CUST_A2}','${A}','Cy'),('${CUST_B}','${B}','Bob');
    insert into public.staff values ('${STAFF_A1}','${A}','G1',true),('${STAFF_A2}','${A}','G2',true),('${STAFF_OFF}','${A}','Old',false),('${STAFF_B}','${B}','BG',true);
    insert into public.pet_pets (id, salon_id, customer_id, name, species) values
      ('${PET_A1}','${A}','${CUST_A}','Rex','Dog'), ('${PET_A2}','${A}','${CUST_A}','Tom','Cat'), ('${PET_B}','${B}','${CUST_B}','Bo','Dog');
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, species, active) values
      ('${SVC_BATH}','${A}','Bath','Grooming',60,1500,'{}',true),
      ('${SVC_NAILS}','${A}','Nails','Add-on',null,500,'{}',true),
      ('${SVC_OFF}','${A}','Retired','Grooming',30,100,'{}',false),
      ('${SVC_B}','${B}','Bath','Grooming',60,1500,'{}',true);
  `);
}, 60000);

beforeEach(async function () {
  await db.exec("delete from public.pet_bookings");
  await as(A);
});

describe("migration 088 against a real Postgres engine", function () {
  it("creates a booking, takes prices from the database and snapshots the service lines", async function () {
    var id = await create({ services: [SVC_BATH, SVC_NAILS], minutes: 90 });
    var b = await row(id);
    expect(b.status).toBe("confirmed");
    expect(b.walk_in).toBe(false);
    var lines = (await db.query("select service_name, price, duration_minutes from public.pet_booking_services where booking_id=$1 order by service_name", [id])).rows;
    expect(lines).toEqual([{ service_name: "Bath", price: 1500, duration_minutes: 60 }, { service_name: "Nails", price: 500, duration_minutes: null }]);
  });

  it("rejects an overlapping booking for the same staff member", async function () {
    await create({ start: at(2, 9) });
    await expect(create({ pet: PET_A2, start: at(2, 9, 30), minutes: 30 })).rejects.toThrow(/BOOKING_CONFLICT_STAFF/);
  });

  it("rejects the same pet in two places at once, even with different staff", async function () {
    await create({ start: at(2, 9) });
    await expect(create({ staff: STAFF_A2, start: at(2, 9, 30), minutes: 30 })).rejects.toThrow(/BOOKING_CONFLICT_PET/);
  });

  it("allows back-to-back bookings and different staff at the same time", async function () {
    await create({ start: at(2, 9) });
    await create({ start: at(2, 10) }); // starts exactly when the first ends
    await create({ pet: PET_A2, staff: STAFF_A2, start: at(2, 9) });
    expect((await db.query("select count(*)::int n from public.pet_bookings")).rows[0].n).toBe(3);
  });

  it("lets unassigned bookings share a time (different pets) but never the same pet", async function () {
    await create({ staff: null, start: at(2, 9) });
    await create({ staff: null, pet: PET_A2, start: at(2, 9) });
    await expect(create({ staff: null, start: at(2, 9, 15), minutes: 30 })).rejects.toThrow(/BOOKING_CONFLICT_PET/);
  });

  it("releases the slot when a booking is cancelled or marked no-show", async function () {
    var a = await create({ start: at(2, 9) });
    await expect(create({ start: at(2, 9) })).rejects.toThrow(/BOOKING_CONFLICT/);
    await setStatus(a, "cancelled");
    var b = await create({ start: at(2, 9) });
    await setStatus(b, "no-show");
    await create({ start: at(2, 9) });
  });

  it("serialises concurrent attempts for one slot: exactly one wins", async function () {
    var results = await Promise.allSettled([create({ start: at(3, 14) }), create({ start: at(3, 14) }), create({ start: at(3, 14) })]);
    expect(results.filter(function (r) { return r.status === "fulfilled"; }).length).toBe(1);
    results.filter(function (r) { return r.status === "rejected"; }).forEach(function (r) { expect(String(r.reason.message)).toMatch(/BOOKING_CONFLICT/); });
    expect((await db.query("select count(*)::int n from public.pet_bookings")).rows[0].n).toBe(1);
  });

  it("books walk-ins as checked in", async function () {
    var id = await create({ walkIn: true, start: at(0, 12) });
    var b = await row(id);
    expect(b.status).toBe("checked-in"); expect(b.walk_in).toBe(true);
  });

  it("updates a booking and refuses to move it into a clash, leaving it unchanged", async function () {
    var a = await create({ start: at(2, 9) });
    await create({ pet: PET_A2, start: at(2, 13), minutes: 30 });
    await update(a, STAFF_A1, at(2, 11), 60, "short trim");
    expect(new Date((await row(a)).starts_at).toISOString()).toBe(at(2, 11).toISOString());
    await expect(update(a, STAFF_A1, at(2, 12, 45), 60, null)).rejects.toThrow(/BOOKING_CONFLICT_STAFF/);
    var after = await row(a);
    expect(new Date(after.starts_at).toISOString()).toBe(at(2, 11).toISOString());
    expect(after.notes).toBe("short trim");
  });

  it("only lets pending, confirmed and checked-in bookings be edited", async function () {
    var a = await create(); await setStatus(a, "checked-in"); await setStatus(a, "in-progress");
    await expect(update(a, STAFF_A1, at(2, 15), 60)).rejects.toThrow(/BOOKING_NOT_EDITABLE/);
    var c = await create({ start: at(4, 9) }); await setStatus(c, "cancelled");
    await expect(update(c, STAFF_A1, at(4, 15), 60)).rejects.toThrow(/BOOKING_NOT_EDITABLE/);
  });

  it("enforces the status flow", async function () {
    var a = await create();
    await expect(setStatus(a, "completed")).rejects.toThrow(/INVALID_STATUS_CHANGE/);
    expect(await setStatus(a, "checked-in")).toBe("checked-in");
    expect(await setStatus(a, "in-progress")).toBe("in-progress");
    expect(await setStatus(a, "completed")).toBe("completed");
    await expect(setStatus(a, "cancelled")).rejects.toThrow(/INVALID_STATUS_CHANGE/); // final
    var c = await create({ start: at(4, 9) });
    await setStatus(c, "cancelled");
    await expect(setStatus(c, "confirmed")).rejects.toThrow(/INVALID_STATUS_CHANGE/);
    await expect(setStatus(c, "bogus")).rejects.toThrow(/INVALID_STATUS_CHANGE/);
  });

  it("will not mix businesses: another business's customer, pet, staff, service or booking is refused", async function () {
    var mine = await create();
    await as(B);
    await expect(create({ customer: CUST_A, pet: PET_A1, staff: STAFF_B, services: [SVC_B] })).rejects.toThrow(/CUSTOMER_NOT_FOUND/);
    await expect(create({ customer: CUST_B, pet: PET_A1, staff: STAFF_B, services: [SVC_B] })).rejects.toThrow(/PET_NOT_FOUND/);
    await expect(create({ customer: CUST_B, pet: PET_B, staff: STAFF_A1, services: [SVC_B] })).rejects.toThrow(/STAFF_NOT_FOUND/);
    await expect(create({ customer: CUST_B, pet: PET_B, staff: STAFF_B, services: [SVC_BATH] })).rejects.toThrow(/SERVICE_NOT_FOUND/);
    await expect(setStatus(mine, "cancelled")).rejects.toThrow(/BOOKING_NOT_FOUND/);
    await expect(update(mine, STAFF_B, at(5, 9), 60)).rejects.toThrow(/BOOKING_NOT_FOUND/);
    await as(A);
    await expect(create({ customer: CUST_A2, pet: PET_A1 })).rejects.toThrow(/PET_NOT_FOUND/); // pet belongs to a different customer of the same business
  });

  it("refuses inactive staff and services, and bad input", async function () {
    await expect(create({ staff: STAFF_OFF })).rejects.toThrow(/STAFF_NOT_FOUND/);
    await expect(create({ services: [SVC_OFF] })).rejects.toThrow(/SERVICE_NOT_FOUND/);
    await expect(create({ services: [] })).rejects.toThrow(/NO_SERVICES/);
    await expect(create({ minutes: 0 })).rejects.toThrow(/INVALID_TIME_RANGE/);
    await expect(create({ minutes: 25 * 60 })).rejects.toThrow(/INVALID_TIME_RANGE/);
    await as("");
    await expect(create()).rejects.toThrow(/NOT_AUTHENTICATED/);
  });

  it("gives the signed-in app read-only access, scoped to its own business", async function () {
    await create(); await as(B); await create({ customer: CUST_B, pet: PET_B, staff: STAFF_B, services: [SVC_B] }); await as(A);
    await db.exec("set role authenticated");
    try {
      var own = (await db.query("select salon_id from public.pet_bookings")).rows;
      expect(own.map(function (r) { return r.salon_id; })).toEqual([A]);
      await expect(db.query("insert into public.pet_bookings (salon_id, customer_id, pet_id, starts_at, ends_at) values ($1,$2,$3, now(), now() + interval '1 hour')", [A, CUST_A, PET_A1])).rejects.toThrow(/permission denied/i);
      await expect(db.query("update public.pet_bookings set status = 'completed'")).rejects.toThrow(/permission denied/i);
      await expect(db.query("delete from public.pet_bookings")).rejects.toThrow(/permission denied/i);
      await expect(db.query("delete from public.pet_booking_services")).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("keeps anonymous visitors out entirely", async function () {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.pet_bookings")).rejects.toThrow(/permission denied/i);
      await expect(db.query("select public.pet_set_booking_status($1,'cancelled')", [CUST_A])).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("writes an audit row for each booking change", async function () {
    var id = await create();
    await setStatus(id, "checked-in");
    var log = (await db.query("select op, changed_columns from public.pet_audit_log where table_name='pet_bookings' and row_id=$1 order by id", [id])).rows;
    expect(log.map(function (l) { return l.op; })).toEqual(["INSERT", "UPDATE"]);
    expect(log[1].changed_columns).toContain("status");
  });

  it("protects booking history: a customer, pet or booked service cannot be deleted from under a booking", async function () {
    // Documents the 'restrict' foreign keys in 088. If the owner decides customers/services
    // may be deleted, change the migration and this test together.
    await create();
    await expect(db.query("delete from public.customers where id=$1", [CUST_A])).rejects.toThrow(/foreign key|violates/i);
    await expect(db.query("delete from public.pet_pets where id=$1", [PET_A1])).rejects.toThrow(/foreign key|violates/i);
    await expect(db.query("delete from public.pet_services where id=$1", [SVC_BATH])).rejects.toThrow(/foreign key|violates/i);
  });
});
