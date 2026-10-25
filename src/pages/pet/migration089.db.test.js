// @vitest-environment node
//
// Behavioural test of migration 089 (boarding: kennels and stays) against a REAL
// Postgres engine (PGlite, in process), reusing the approach of
// migration088.db.test.js. It applies the repo's real migrations and tries to
// break the boarding functions: overlapping stays in a kennel, one pet in two
// kennels, day-care stays, back-to-back arrivals, maintenance, the status path,
// copying the boarding rate, mixing businesses, grants and RLS. (Migration 089
// is already applied in production; this is an independent check of that SQL,
// plus the small delete-kennel fix in 096.)
//
// The stand-in for platform tables (salons, customers, staff, salon_settings,
// auth_salon_id, auth.uid, the anon/authenticated roles) is NOT the live schema.
// It only provides the columns the pet migrations use.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

var MIG = path.join(process.cwd(), "supabase/migrations");
function sql(file) { return fs.readFileSync(path.join(MIG, file), "utf8"); }

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var CUST_A = "c0000000-0000-0000-0000-00000000000a";
var CUST_B = "c0000000-0000-0000-0000-00000000000b";
var STAFF_A1 = "50000000-0000-0000-0000-0000000000a1";
var PET_A1 = "e0000000-0000-0000-0000-0000000000a1";
var PET_B = "e0000000-0000-0000-0000-0000000000b1";
var SVC_GROOM = "f0000000-0000-0000-0000-000000000001"; // 1500
var SVC_B = "f0000000-0000-0000-0000-0000000000b1";
var SVC_NIGHT = "f0000000-0000-0000-0000-000000000002";
var PET_A2 = "e0000000-0000-0000-0000-0000000000a2";


var SUP_A = "50550000-0000-0000-0000-0000000000a1";
var SUP_B = "50550000-0000-0000-0000-0000000000b1";
var SHAMPOO = "17e30000-0000-0000-0000-000000000001";
var FOOD = "17e30000-0000-0000-0000-000000000002";
var TOY = "17e30000-0000-0000-0000-000000000003";
var FOOD_B = "17e30000-0000-0000-0000-0000000000b1";

var db;
var keyN = 0;
function key() { keyN += 1; return "00000000-0000-4000-8000-" + String(keyN).padStart(12, "0"); }
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function setupDb(files) {
  db = new PGlite({ extensions: { btree_gist: btree_gist } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema extensions; create schema auth;
    create table public.salons (id uuid primary key, name text);
    create table public.customers (id uuid primary key, salon_id uuid not null, name text);
    create table public.staff (id uuid primary key, salon_id uuid not null, name text, active boolean default true);
    create table public.salon_settings (salon_id uuid primary key, tax_enabled boolean not null default false,
      tax_rate integer not null default 16, next_invoice_number integer not null default 1 check (next_invoice_number > 0));
    create function public.auth_salon_id() returns uuid language sql stable
      as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    grant usage on schema public to anon, authenticated;
  `);
  for (var f of files) { await db.exec(sql(f)); }
  await db.exec(`
    insert into public.salons values ('${A}','A'),('${B}','B');
    insert into public.customers values ('${CUST_A}','${A}','Ann'),('${CUST_B}','${B}','Bob');
    insert into public.pet_pets (id, salon_id, customer_id, name, species) values
      ('${PET_A1}','${A}','${CUST_A}','Rex','Dog'), ('${PET_A2}','${A}','${CUST_A}','Tom','Cat'), ('${PET_B}','${B}','${CUST_B}','Bo','Dog');
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, species, active) values
      ('${SVC_GROOM}','${A}','Full groom','Grooming',60,1500,'{}',true),
      ('${SVC_NIGHT}','${A}','Standard night','Boarding',null,2000,'{}',true),
      ('${SVC_B}','${B}','Bath','Grooming',60,900,'{}',true);
  `);
}


function day(n) { var d = new Date(Date.UTC(2030, 0, 1 + n)); return d.toISOString().slice(0, 10); } // fixed future dates, no clock dependence
async function kennel(name, kind, id) { return (await db.query("select public.pet_save_kennel($1,$2,$3,null) as id", [id || null, name, kind || "Standard"])).rows[0].id; }
async function stay(o) {
  var a = Object.assign({ cust: CUST_A, pet: PET_A1, kennel: null, from: day(0), to: day(3), svc: null, feed: null, notes: null, now: false }, o || {});
  return (await db.query("select public.pet_create_stay($1,$2,$3,$4,$5,$6,$7,$8,$9) as id", [a.cust, a.pet, a.kennel, a.from, a.to, a.svc, a.feed, a.notes, a.now])).rows[0].id;
}
async function setStatus(id, s) { return (await db.query("select public.pet_set_stay_status($1,$2) as s", [id, s])).rows[0].s; }
async function row(id) { return (await db.query("select * from public.pet_boarding_stays where id=$1", [id])).rows[0]; }
async function maint(id, on) { return (await db.query("select public.pet_set_kennel_maintenance($1,$2) as m", [id, on])).rows[0].m; }

var K_A; var K_A2;
beforeAll(async function () {
  await setupDb(["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql",
    "087_pet_audit_log.sql", "088_pet_bookings.sql", "092_pet_booking_statuses.sql", "089_pet_boarding.sql", "096_pet_delete_kennel_fix.sql"]);
}, 60000);

beforeEach(async function () {
  await db.exec("delete from public.pet_boarding_stays; delete from public.pet_kennels");
  await as(A);
  K_A = await kennel("Suite 1", "Deluxe suite");
  K_A2 = await kennel("Suite 2");
});

describe("migration 089 against a real Postgres engine", function () {
  it("creates kennels with a unique name per business, ignoring case and spaces", async function () {
    await expect(kennel(" suite 1 ")).rejects.toThrow(/KENNEL_NAME_TAKEN/);
    await expect(kennel("  ")).rejects.toThrow(/KENNEL_NAME_REQUIRED/);
    await expect(kennel("x".repeat(61))).rejects.toThrow(/KENNEL_NAME_REQUIRED/);
    await as(B);
    expect(await kennel("Suite 1")).toBeTruthy(); // another business may reuse the name
    await as(A);
    expect(await kennel("Suite 1 renamed", "Standard", K_A)).toBe(K_A);
    await expect(kennel("Suite 2", "Standard", K_A)).rejects.toThrow(/KENNEL_NAME_TAKEN/);
    await expect(kennel("Nope", "Standard", "d0000000-0000-0000-0000-0000000000ff")).rejects.toThrow(/KENNEL_NOT_FOUND/);
  });

  it("reserves a stay, copying the boarding service's name and nightly rate", async function () {
    var id = await stay({ kennel: K_A, svc: SVC_NIGHT, feed: "Twice daily", notes: "Shy" });
    var s = await row(id);
    expect([s.status, s.service_name, s.nightly_rate, s.feeding_notes, s.care_notes]).toEqual(["reserved", "Standard night", 2000, "Twice daily", "Shy"]);
    await db.exec(`update public.pet_services set price = 9999, name = 'Renamed' where id = '${SVC_NIGHT}'`);
    var after = await row(id);
    expect([after.service_name, after.nightly_rate]).toEqual(["Standard night", 2000]);
    await db.exec(`update public.pet_services set price = 2000, name = 'Standard night' where id = '${SVC_NIGHT}'`);
  });

  it("only accepts an active Boarding service of this business", async function () {
    await expect(stay({ kennel: K_A, svc: SVC_GROOM })).rejects.toThrow(/SERVICE_NOT_FOUND/); // a grooming service
    await expect(stay({ kennel: K_A, svc: SVC_B })).rejects.toThrow(/SERVICE_NOT_FOUND/); // another business
    await db.exec(`update public.pet_services set active = false where id = '${SVC_NIGHT}'`);
    await expect(stay({ kennel: K_A, svc: SVC_NIGHT })).rejects.toThrow(/SERVICE_NOT_FOUND/);
    await db.exec(`update public.pet_services set active = true where id = '${SVC_NIGHT}'`);
  });

  it("rejects overlapping stays in one kennel, but allows back-to-back arrivals", async function () {
    await stay({ kennel: K_A, from: day(0), to: day(3) });
    await expect(stay({ pet: PET_A2, kennel: K_A, from: day(2), to: day(5) })).rejects.toThrow(/STAY_CONFLICT_KENNEL/);
    await expect(stay({ pet: PET_A2, kennel: K_A, from: day(0), to: day(3) })).rejects.toThrow(/STAY_CONFLICT_KENNEL/);
    await expect(stay({ pet: PET_A2, kennel: K_A, from: day(1), to: day(2) })).rejects.toThrow(/STAY_CONFLICT_KENNEL/);
    expect(await stay({ pet: PET_A2, kennel: K_A, from: day(3), to: day(6) })).toBeTruthy(); // arrives the day the first leaves
    expect(await stay({ pet: PET_A2, kennel: K_A2, from: day(-4), to: day(0) })).toBeTruthy(); // leaves the day the first arrives
  });

  it("will not put one pet in two kennels at once", async function () {
    await stay({ kennel: K_A, from: day(0), to: day(3) });
    await expect(stay({ kennel: K_A2, from: day(1), to: day(4) })).rejects.toThrow(/STAY_CONFLICT_PET/);
    expect(await stay({ kennel: K_A2, from: day(3), to: day(5) })).toBeTruthy();
  });

  it("treats a same-day (day care) stay as occupying that one day", async function () {
    await stay({ kennel: K_A, from: day(0), to: day(0) });
    await expect(stay({ pet: PET_A2, kennel: K_A, from: day(0), to: day(0) })).rejects.toThrow(/STAY_CONFLICT_KENNEL/);
    await expect(stay({ pet: PET_A2, kennel: K_A, from: day(-1), to: day(2) })).rejects.toThrow(/STAY_CONFLICT_KENNEL/);
    expect(await stay({ pet: PET_A2, kennel: K_A, from: day(1), to: day(2) })).toBeTruthy();
  });

  it("validates dates", async function () {
    await expect(stay({ kennel: K_A, from: day(5), to: day(4) })).rejects.toThrow(/INVALID_DATES/);
    await expect(stay({ kennel: K_A, from: day(0), to: day(400) })).rejects.toThrow(/INVALID_DATES/);
    await expect(stay({ kennel: K_A, from: null, to: day(1) })).rejects.toThrow(/INVALID_DATES/);
    expect(await stay({ kennel: K_A, from: day(0), to: day(365) })).toBeTruthy();
  });

  it("walks a stay through reserved, occupied and checked-out, and only that way", async function () {
    var id = await stay({ kennel: K_A });
    await expect(setStatus(id, "checked-out")).rejects.toThrow(/INVALID_STATUS_CHANGE/);
    expect(await setStatus(id, "occupied")).toBe("occupied");
    var s = await row(id); expect(s.checked_in_at).not.toBeNull(); expect(s.checked_out_at).toBeNull();
    await expect(setStatus(id, "cancelled")).rejects.toThrow(/INVALID_STATUS_CHANGE/); // can't cancel once the pet is in
    await expect(setStatus(id, "reserved")).rejects.toThrow(/INVALID_STATUS_CHANGE/);
    expect(await setStatus(id, "checked-out")).toBe("checked-out");
    expect((await row(id)).checked_out_at).not.toBeNull();
    for (var bad of ["occupied", "cancelled", "reserved"]) await expect(setStatus(id, bad)).rejects.toThrow(/INVALID_STATUS_CHANGE/);
    await expect(setStatus("d0000000-0000-0000-0000-0000000000ff", "occupied")).rejects.toThrow(/STAY_NOT_FOUND/);
  });

  it("frees the kennel and the pet at check-out and on cancellation", async function () {
    var a = await stay({ kennel: K_A, from: day(0), to: day(5), now: true });
    await expect(stay({ pet: PET_A2, kennel: K_A, from: day(1), to: day(2) })).rejects.toThrow(/STAY_CONFLICT_KENNEL/);
    await setStatus(a, "checked-out"); // early departure
    expect(await stay({ pet: PET_A2, kennel: K_A, from: day(1), to: day(2) })).toBeTruthy();
    var r = await stay({ kennel: K_A2, from: day(10), to: day(12) });
    await expect(stay({ pet: PET_A1, kennel: K_A2, from: day(11), to: day(13) })).rejects.toThrow(/STAY_CONFLICT_/);
    await setStatus(r, "cancelled");
    expect(await stay({ pet: PET_A1, kennel: K_A2, from: day(11), to: day(13) })).toBeTruthy();
  });

  it("creates a walk-in stay already checked in", async function () {
    var s = await row(await stay({ kennel: K_A, now: true }));
    expect(s.status).toBe("occupied"); expect(s.checked_in_at).not.toBeNull();
  });

  it("reschedules and moves a stay, with the same conflict rules", async function () {
    var a = await stay({ kennel: K_A, from: day(0), to: day(3) });
    await stay({ pet: PET_A2, kennel: K_A2, from: day(0), to: day(3) });
    var upd = function (id, k, f, t) { return db.query("select public.pet_update_stay($1,$2,$3,$4,'Fed twice','Calm')", [id, k, f, t]); };
    await expect(upd(a, K_A2, day(0), day(3))).rejects.toThrow(/STAY_CONFLICT_KENNEL/);
    await upd(a, K_A, day(1), day(4));
    var s = await row(a); expect([s.check_in_on.toISOString().slice(0, 10), s.feeding_notes, s.care_notes]).toEqual([day(1), "Fed twice", "Calm"]);
    await expect(upd(a, K_A, day(4), day(2))).rejects.toThrow(/INVALID_DATES/);
    await expect(upd(a, "d0000000-0000-0000-0000-0000000000ff", day(1), day(4))).rejects.toThrow(/KENNEL_NOT_FOUND/);
  });

  it("locks the check-in date of a pet that has already arrived, but allows extending the stay", async function () {
    var a = await stay({ kennel: K_A, from: day(0), to: day(3), now: true });
    var upd = function (f, t) { return db.query("select public.pet_update_stay($1,$2,$3,$4,null,null)", [a, K_A, f, t]); };
    await expect(upd(day(1), day(3))).rejects.toThrow(/STAY_CHECKIN_LOCKED/);
    await upd(day(0), day(6));
    expect((await row(a)).check_out_on.toISOString().slice(0, 10)).toBe(day(6));
    await setStatus(a, "checked-out");
    await expect(upd(day(0), day(7))).rejects.toThrow(/STAY_NOT_EDITABLE/);
  });

  it("keeps stays out of a kennel under maintenance, and won't put an occupied kennel into maintenance", async function () {
    expect(await maint(K_A, true)).toBe(true);
    await expect(stay({ kennel: K_A })).rejects.toThrow(/KENNEL_MAINTENANCE/);
    var res = await stay({ kennel: K_A2 });
    await expect(db.query("select public.pet_update_stay($1,$2,$3,$4,null,null)", [res, K_A, day(0), day(3)])).rejects.toThrow(/KENNEL_MAINTENANCE/);
    await maint(K_A, false);
    var inn = await stay({ kennel: K_A, pet: PET_A2, now: true });
    await expect(maint(K_A, true)).rejects.toThrow(/KENNEL_OCCUPIED/);
    await setStatus(inn, "checked-out");
    expect(await maint(K_A, true)).toBe(true);
    var booked = await stay({ kennel: K_A2, pet: PET_A2, from: day(20), to: day(22) });
    await maint(K_A2, true);
    await expect(setStatus(booked, "occupied")).rejects.toThrow(/KENNEL_MAINTENANCE/);
  });

  it("deletes an unused kennel but keeps any kennel with stay history", async function () {
    var spare = await kennel("Spare");
    await db.query("select public.pet_delete_kennel($1)", [spare]);
    expect((await db.query("select count(*)::int n from public.pet_kennels where id=$1", [spare])).rows[0].n).toBe(0);
    await stay({ kennel: K_A });
    await expect(db.query("select public.pet_delete_kennel($1)", [K_A])).rejects.toThrow(/KENNEL_HAS_STAYS/);
    await expect(db.query("select public.pet_delete_kennel($1)", ["d0000000-0000-0000-0000-0000000000ff"])).rejects.toThrow(/KENNEL_NOT_FOUND/);
  });

  it("never mixes businesses", async function () {
    var mine = await stay({ kennel: K_A });
    await expect(stay({ cust: CUST_B, pet: PET_B, kennel: K_A })).rejects.toThrow(/CUSTOMER_NOT_FOUND/);
    await expect(stay({ pet: PET_B, kennel: K_A })).rejects.toThrow(/PET_NOT_FOUND/);
    await as(B);
    var kb = await kennel("B kennel");
    await expect(stay({ cust: CUST_B, pet: PET_B, kennel: K_A })).rejects.toThrow(/KENNEL_NOT_FOUND/);
    await expect(setStatus(mine, "occupied")).rejects.toThrow(/STAY_NOT_FOUND/);
    await expect(db.query("select public.pet_update_stay($1,$2,$3,$4,null,null)", [mine, kb, day(0), day(2)])).rejects.toThrow(/STAY_NOT_FOUND/);
    await expect(db.query("select public.pet_delete_kennel($1)", [K_A])).rejects.toThrow(/KENNEL_NOT_FOUND/);
    await expect(maint(K_A, true)).rejects.toThrow(/KENNEL_NOT_FOUND/);
    await expect(kennel("Hijack", "Standard", K_A)).rejects.toThrow(/KENNEL_NOT_FOUND/);
    await as(null);
    await expect(kennel("Anon")).rejects.toThrow(/NOT_AUTHENTICATED/);
  });

  it("keeps a pet's other-customer stay impossible (pet must belong to the customer)", async function () {
    await db.exec(`insert into public.customers values ('c0000000-0000-0000-0000-0000000000a2','${A}','Cy')`);
    await expect(stay({ cust: "c0000000-0000-0000-0000-0000000000a2", kennel: K_A })).rejects.toThrow(/PET_NOT_FOUND/);
  });

  it("gives the signed-in app read-only access scoped to its own business", async function () {
    await stay({ kennel: K_A }); await as(B); var kb = await kennel("B kennel"); await stay({ cust: CUST_B, pet: PET_B, kennel: kb }); await as(A);
    await db.exec("set role authenticated");
    try {
      expect((await db.query("select salon_id from public.pet_boarding_stays")).rows.every(function (r) { return r.salon_id === A; })).toBe(true);
      expect((await db.query("select salon_id from public.pet_kennels")).rows.every(function (r) { return r.salon_id === A; })).toBe(true);
      await expect(db.query("update public.pet_boarding_stays set status = 'checked-out'")).rejects.toThrow(/permission denied/i);
      await expect(db.query("update public.pet_boarding_stays set nightly_rate = 1")).rejects.toThrow(/permission denied/i);
      await expect(db.query("delete from public.pet_boarding_stays")).rejects.toThrow(/permission denied/i);
      await expect(db.query("insert into public.pet_kennels (salon_id, name) values ($1,'Sneaky')", [A])).rejects.toThrow(/permission denied/i);
      await expect(db.query("update public.pet_kennels set maintenance = true")).rejects.toThrow(/permission denied/i);
      await expect(db.query("delete from public.pet_kennels")).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("keeps anonymous visitors out", async function () {
    var id = await stay({ kennel: K_A });
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.pet_boarding_stays")).rejects.toThrow(/permission denied/i);
      await expect(db.query("select public.pet_set_stay_status($1,'occupied')", [id])).rejects.toThrow(/permission denied/i);
      await expect(db.query("select public.pet_save_kennel(null,'x','Standard',null)")).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("protects stay history: a customer or pet with a stay cannot be deleted", async function () {
    await stay({ kennel: K_A });
    await expect(db.query("delete from public.pet_pets where id=$1", [PET_A1])).rejects.toThrow(/foreign key|violates/i);
    await expect(db.query("delete from public.customers where id=$1", [CUST_A])).rejects.toThrow(/foreign key|violates/i);
  });

  it("writes audit rows for kennels and stays", async function () {
    var id = await stay({ kennel: K_A }); await setStatus(id, "occupied");
    var t = (await db.query("select distinct table_name from public.pet_audit_log where table_name in ('pet_kennels','pet_boarding_stays') order by 1")).rows.map(function (r) { return r.table_name; });
    expect(t).toEqual(["pet_boarding_stays", "pet_kennels"]);
  });

  it("does not let a boarding stay and a grooming booking collide: they are independent", async function () {
    await stay({ kennel: K_A, from: day(0), to: day(3), now: true });
    var s = new Date("2030-01-02T06:00:00Z"); var e = new Date("2030-01-02T07:00:00Z");
    var b = await db.query("select public.pet_create_booking($1,$2,null,$3,$4,$5::uuid[],false,null) as id", [CUST_A, PET_A1, s.toISOString(), e.toISOString(), [SVC_GROOM]]);
    expect(b.rows[0].id).toBeTruthy(); // a boarded dog can be groomed during its stay
  });
});
