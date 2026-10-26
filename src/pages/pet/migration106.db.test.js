// @vitest-environment node
//
// Behavioural test of migration 106 (species guard in pet_create_booking / pet_create_stay)
// against a REAL Postgres engine (PGlite). Applies the repo's real pet migrations 083-089,
// then 092 and 104 (the live definitions 106 replaces), then 106. Stand-in platform tables are
// NOT the live schema. Checks: the species rule matches the screens (empty list = all species),
// nothing else about the two functions changed, grants are unchanged, and the rollback file
// restores the previous definitions exactly.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

var ROOT = process.cwd();
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function mig(file) { return read("supabase/migrations/" + file); }
var BOOKING_SIG = "public.pet_create_booking(uuid,uuid,uuid,timestamptz,timestamptz,uuid[],boolean,text)";
var STAY_SIG = "public.pet_create_stay(uuid,uuid,uuid,date,date,uuid,text,text,boolean,text,text,text)";

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var CUST_A = "c0000000-0000-0000-0000-00000000000a";
var CUST_B = "c0000000-0000-0000-0000-00000000000b";
var DOG = "e0000000-0000-0000-0000-0000000000a1";
var CAT = "e0000000-0000-0000-0000-0000000000a2";
var PET_B = "e0000000-0000-0000-0000-0000000000b1";
var SVC = {
  dogOnly: "50000000-0000-0000-0000-000000000001",
  all: "50000000-0000-0000-0000-000000000002",
  catOnly: "50000000-0000-0000-0000-000000000003",
  dogCat: "50000000-0000-0000-0000-000000000004",
  boardCat: "50000000-0000-0000-0000-000000000005",
  boardAll: "50000000-0000-0000-0000-000000000006",
  inactiveDog: "50000000-0000-0000-0000-000000000007",
  otherBiz: "50000000-0000-0000-0000-000000000008",
};
var db; var K; var defsBefore; var defsAfter;

async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
function at(h) { return "2030-03-0" + (1 + Math.floor(h / 24)) + "T" + String(h % 24).padStart(2, "0") + ":00:00Z"; }
function day(n) { return new Date(Date.UTC(2030, 0, 1 + n)).toISOString().slice(0, 10); }
async function book(pet, services, extra) {
  var o = Object.assign({ start: 9, end: 10, walkIn: false }, extra || {});
  return (await db.query("select public.pet_create_booking($1,$2,null,$3::timestamptz,$4::timestamptz,$5::uuid[],$6,null) as id",
    [CUST_A, pet, at(o.start), at(o.end), services, o.walkIn])).rows[0].id;
}
async function stay(pet, service, extra) {
  var o = Object.assign({ from: day(0), to: day(3), name: null, phone: null, med: null }, extra || {});
  return (await db.query("select public.pet_create_stay($1,$2,$3,$4,$5,$6,null,null,false,$7,$8,$9) as id",
    [CUST_A, pet, K, o.from, o.to, service, o.name, o.phone, o.med])).rows[0].id;
}
async function count(table) { return Number((await db.query("select count(*)::int n from public." + table)).rows[0].n); }
async function defs() {
  var b = await db.query("select pg_get_functiondef($1::regprocedure) d", [BOOKING_SIG]);
  var s = await db.query("select pg_get_functiondef($1::regprocedure) d", [STAY_SIG]);
  return { booking: b.rows[0].d, stay: s.rows[0].d };
}
async function expectCode(promise, code) {
  var err = null;
  try { await promise; } catch (e) { err = e; }
  expect(err && String(err.message)).toContain(code);
}

beforeAll(async function () {
  db = new PGlite({ extensions: { btree_gist: btree_gist } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema extensions; create schema auth;
    create table public.salons (id uuid primary key, name text);
    create table public.customers (id uuid primary key, salon_id uuid not null, name text);
    create table public.staff (id uuid primary key, salon_id uuid not null, name text, active boolean default true);
    create table public.salon_settings (salon_id uuid primary key, tax_enabled boolean not null default false,
      tax_rate integer not null default 16, next_invoice_number integer not null default 1 check (next_invoice_number > 0));
    create function public.auth_salon_id() returns uuid language sql stable as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    grant usage on schema public to anon, authenticated;
  `);
  var files = ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql",
    "087_pet_audit_log.sql", "088_pet_bookings.sql", "089_pet_boarding.sql", "092_pet_booking_statuses.sql", "104_pet_boarding_care_details.sql"];
  for (var f of files) await db.exec(mig(f));
  await db.exec(`
    insert into public.salons values ('${A}','A'),('${B}','B');
    insert into public.customers values ('${CUST_A}','${A}','Ann'),('${CUST_B}','${B}','Bob');
    insert into public.pet_pets (id, salon_id, customer_id, name, species) values
      ('${DOG}','${A}','${CUST_A}','Rex','Dog'), ('${CAT}','${A}','${CUST_A}','Tom','Cat'), ('${PET_B}','${B}','${CUST_B}','Bo','Dog');
    insert into public.pet_services (id, salon_id, name, category, price, duration_minutes, species, active) values
      ('${SVC.dogOnly}','${A}','Dog wash','Grooming',1000,60,'{Dog}',true),
      ('${SVC.all}','${A}','Nail trim','Add-on',500,15,'{}',true),
      ('${SVC.catOnly}','${A}','Cat groom','Grooming',1200,60,'{Cat}',true),
      ('${SVC.dogCat}','${A}','Brush','Grooming',800,30,'{Dog,Cat}',true),
      ('${SVC.boardCat}','${A}','Cat suite','Boarding',2000,null,'{Cat}',true),
      ('${SVC.boardAll}','${A}','Standard board','Boarding',1500,null,'{}',true),
      ('${SVC.inactiveDog}','${A}','Old dog service','Grooming',900,45,'{Dog}',false),
      ('${SVC.otherBiz}','${B}','B only','Grooming',700,30,'{}',true);
  `);
  await as(A);
  K = (await db.query("select public.pet_save_kennel(null,'K1','Standard',null) as id")).rows[0].id;
  defsBefore = await defs();
  await db.exec(mig("106_pet_species_guard.sql"));
  defsAfter = await defs();
}, 90000);

beforeEach(async function () {
  await db.exec("delete from public.pet_booking_services; delete from public.pet_bookings; delete from public.pet_boarding_stays");
  await as(A);
});

describe("migration 106: pet_create_booking", function () {
  it("refuses a service restricted to another species, and creates nothing", async function () {
    await expectCode(book(CAT, [SVC.dogOnly]), "SERVICE_SPECIES_MISMATCH");
    expect(await count("pet_bookings")).toBe(0);
    expect(await count("pet_booking_services")).toBe(0);
  });

  it("allows a service restricted to the pet's own species, starting as booked", async function () {
    var id = await book(DOG, [SVC.dogOnly]);
    var r = (await db.query("select status, walk_in from public.pet_bookings where id=$1", [id])).rows[0];
    expect(r).toMatchObject({ status: "booked", walk_in: false });
    expect(await count("pet_booking_services")).toBe(1);
  });

  it("treats an empty species list as every species", async function () {
    await book(DOG, [SVC.all], { start: 9, end: 10 });
    await book(CAT, [SVC.all], { start: 9, end: 10 });
    expect(await count("pet_bookings")).toBe(2);
  });

  it("allows any species named in a multi-species list, and refuses the others", async function () {
    await book(CAT, [SVC.dogCat]);
    await expectCode(book(CAT, [SVC.catOnly, SVC.dogOnly], { start: 12, end: 13 }), "SERVICE_SPECIES_MISMATCH");
  });

  it("refuses the whole booking when only one of several services mismatches", async function () {
    await expectCode(book(CAT, [SVC.catOnly, SVC.all, SVC.dogOnly]), "SERVICE_SPECIES_MISMATCH");
    expect(await count("pet_bookings")).toBe(0);
  });

  it("keeps the earlier errors and their order: unknown pet, another business's or inactive service", async function () {
    await expectCode(book(PET_B, [SVC.all]), "PET_NOT_FOUND");
    await expectCode(book(DOG, [SVC.otherBiz]), "SERVICE_NOT_FOUND");
    await expectCode(book(DOG, [SVC.inactiveDog]), "SERVICE_NOT_FOUND");
    expect(await count("pet_bookings")).toBe(0);
  });

  it("still starts a walk-in as checked-in and still blocks a double-booked pet", async function () {
    var id = await book(DOG, [SVC.dogOnly], { walkIn: true });
    expect((await db.query("select status from public.pet_bookings where id=$1", [id])).rows[0].status).toBe("checked-in");
    await expectCode(book(DOG, [SVC.dogOnly], { start: 9, end: 10 }), "BOOKING_CONFLICT_PET");
  });
});

describe("migration 106: pet_create_stay", function () {
  it("refuses a boarding service restricted to another species, and creates nothing", async function () {
    await expectCode(stay(DOG, SVC.boardCat), "SERVICE_SPECIES_MISMATCH");
    expect(await count("pet_boarding_stays")).toBe(0);
  });

  it("allows a matching species, an all-species service, and no service at all", async function () {
    // one kennel, so the stays use different nights
    await stay(CAT, SVC.boardCat, { from: day(0), to: day(2) });
    await stay(DOG, SVC.boardAll, { from: day(3), to: day(5) });
    await stay(DOG, null, { from: day(7), to: day(8) });
    expect(await count("pet_boarding_stays")).toBe(3);
  });

  it("keeps migration 104's contact and medication fields working", async function () {
    var id = await stay(CAT, SVC.boardCat, { name: "Wanjiru", phone: "+254700000000", med: "Half a tablet at 8am" });
    var r = (await db.query("select emergency_contact_name n, emergency_contact_phone p, medication_notes m, nightly_rate r from public.pet_boarding_stays where id=$1", [id])).rows[0];
    expect(r).toMatchObject({ n: "Wanjiru", p: "+254700000000", m: "Half a tablet at 8am", r: 2000 });
    await expectCode(stay(CAT, SVC.boardCat, { name: "No phone", from: day(10), to: day(11) }), "INVALID_CONTACT");
  });

  it("keeps the earlier errors: another business's pet or service", async function () {
    await expectCode(stay(PET_B, SVC.boardAll), "PET_NOT_FOUND");
    await expectCode(stay(DOG, SVC.otherBiz), "SERVICE_NOT_FOUND");
  });
});

describe("migration 106: scope, grants and rollback", function () {
  it("replaces exactly two functions and touches nothing else", function () {
    function code(t) { return t.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n").toLowerCase(); }
    function n(t, re) { return (t.match(re) || []).length; }
    var text = code(mig("106_pet_species_guard.sql"));
    expect(n(text, /create or replace function/g)).toBe(2);
    // no schema, policy, trigger, index or privilege change of any kind
    ["drop ", "alter table", "create table", "create policy", "create trigger", "create index", "grant ", "revoke "].forEach(function (w) {
      expect(text).not.toContain(w);
    });
    // the data statements inside the two bodies are exactly the ones the live definitions already had
    var live = code(mig("092_pet_booking_statuses.sql").split("create or replace function public.pet_create_booking")[1].split("create or replace function public.pet_update_booking")[0])
      + code(mig("104_pet_boarding_care_details.sql").split("create or replace function public.pet_create_stay")[1].split("create or replace function public.pet_update_stay")[0]);
    ["insert into", "update public", "delete from"].forEach(function (w) {
      expect(n(text, new RegExp(w, "g"))).toBe(n(live, new RegExp(w, "g")));
    });
    expect(n(text, /insert into/g)).toBeGreaterThan(0);
  });

  it("only the species lookup and refusal differ from the previous definitions", function () {
    function norm(s) { return s.replace(/\s+/g, " "); }
    expect(defsAfter.booking).not.toBe(defsBefore.booking);
    expect(defsAfter.stay).not.toBe(defsBefore.stay);
    expect(norm(defsAfter.booking)).toContain("SERVICE_SPECIES_MISMATCH");
    expect(norm(defsBefore.booking)).not.toContain("SERVICE_SPECIES_MISMATCH");
    // everything the previous version raised is still raised
    ["NOT_AUTHENTICATED", "INVALID_TIME_RANGE", "NO_SERVICES", "CUSTOMER_NOT_FOUND", "PET_NOT_FOUND", "STAFF_NOT_FOUND", "SERVICE_NOT_FOUND", "BOOKING_CONFLICT_STAFF", "BOOKING_CONFLICT_PET"]
      .forEach(function (c) { expect(defsAfter.booking).toContain(c); });
    ["NOT_AUTHENTICATED", "INVALID_DATES", "INVALID_CONTACT", "INVALID_NOTES", "CUSTOMER_NOT_FOUND", "PET_NOT_FOUND", "KENNEL_NOT_FOUND", "KENNEL_MAINTENANCE", "SERVICE_NOT_FOUND", "STAY_CONFLICT_KENNEL", "STAY_CONFLICT_PET"]
      .forEach(function (c) { expect(defsAfter.stay).toContain(c); });
  });

  it("keeps the grants: signed-in app can run both, anon cannot", async function () {
    for (var sig of [BOOKING_SIG, STAY_SIG]) {
      var r = (await db.query("select has_function_privilege('authenticated', $1::regprocedure, 'execute') a, has_function_privilege('anon', $1::regprocedure, 'execute') n", [sig])).rows[0];
      expect(r).toEqual({ a: true, n: false });
    }
  });

  it("is safe to apply twice", async function () {
    await db.exec(mig("106_pet_species_guard.sql"));
    expect(await defs()).toEqual(defsAfter);
  });

  it("rolls back to the previous definitions exactly, and can be re-applied", async function () {
    await db.exec(read("supabase/sql/106_rollback_pet_species_guard.sql"));
    expect(await defs()).toEqual(defsBefore);
    await book(CAT, [SVC.dogOnly]); // no database check any more (the screens still check)
    expect(await count("pet_bookings")).toBe(1);
    await db.exec("delete from public.pet_booking_services; delete from public.pet_bookings");
    await db.exec(mig("106_pet_species_guard.sql"));
    expect(await defs()).toEqual(defsAfter);
    await expectCode(book(CAT, [SVC.dogOnly]), "SERVICE_SPECIES_MISMATCH");
  });
});
