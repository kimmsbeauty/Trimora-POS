// @vitest-environment node
//
// Migration 101 (service/species guard) on a REAL Postgres engine (PGlite), applied
// on top of the chain production actually has: 083-089, 092, 097 (archiving) and 098.
// Stand-in platform tables as in migration089.db.test.js (NOT the live schema).
// 101 is written for review and NOT applied to production.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

function read(rel) { return fs.readFileSync(path.join(process.cwd(), rel), "utf8"); }
var CHAIN = ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql",
  "087_pet_audit_log.sql", "088_pet_bookings.sql", "089_pet_boarding.sql", "092_pet_booking_statuses.sql",
  "097_pet_archiving.sql", "098_pet_care_reminder_windows.sql"];
var UP = read("supabase/migrations/101_pet_service_species_guard.sql");
var DOWN = read("supabase/sql/101_rollback_pet_service_species_guard.sql");

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var CUST_A = "c0000000-0000-0000-0000-00000000000a";
var STAFF_A = "50000000-0000-0000-0000-0000000000a1";
var DOG = "e0000000-0000-0000-0000-0000000000a1";
var CAT = "e0000000-0000-0000-0000-0000000000a2";
var DOG_B = "e0000000-0000-0000-0000-0000000000b1";
var CUST_B = "c0000000-0000-0000-0000-00000000000b";
var SVC_ANY = "f0000000-0000-0000-0000-000000000001";
var SVC_DOG = "f0000000-0000-0000-0000-000000000002";
var SVC_CAT = "f0000000-0000-0000-0000-000000000003";
var SVC_NIGHT_DOG = "f0000000-0000-0000-0000-000000000004";
var SVC_NIGHT_ANY = "f0000000-0000-0000-0000-000000000005";
var KENNEL = "a0000000-0000-0000-0000-000000000001";

var db;
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function setup(apply101) {
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
  for (var f of CHAIN) await db.exec(read("supabase/migrations/" + f));
  await db.exec(`
    insert into public.salons values ('${A}','A'),('${B}','B');
    insert into public.customers values ('${CUST_A}','${A}','Ann'),('${CUST_B}','${B}','Bob');
    insert into public.staff values ('${STAFF_A}','${A}','G1',true);
    insert into public.pet_pets (id, salon_id, customer_id, name, species) values
      ('${DOG}','${A}','${CUST_A}','Rex','Dog'), ('${CAT}','${A}','${CUST_A}','Tom','Cat'), ('${DOG_B}','${B}','${CUST_B}','Bo','Dog');
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, species, active) values
      ('${SVC_ANY}','${A}','Nail trim','Grooming',15,400,'{}',true),
      ('${SVC_DOG}','${A}','De-shed','Grooming',60,1800,'{Dog}',true),
      ('${SVC_CAT}','${A}','Cat groom','Grooming',60,2200,'{Cat}',true),
      ('${SVC_NIGHT_DOG}','${A}','Dog night','Boarding',null,900,'{Dog}',true),
      ('${SVC_NIGHT_ANY}','${A}','Any night','Boarding',null,700,'{}',true);
    insert into public.pet_kennels (id, salon_id, name, kind) values ('${KENNEL}','${A}','K1','Standard');
  `);
  if (apply101) await db.exec(UP);
  await as(A);
}
function book(pet, svc, h, opts) {
  opts = opts || {};
  return db.query("select public.pet_create_booking($1,$2,$3,$4,$5,$6::uuid[],$7,null) as id",
    [CUST_A, pet, opts.staff === undefined ? null : opts.staff, "2027-01-10T" + h + ":00Z", "2027-01-10T" + (Number(h.slice(0, 2)) + 1) + ":00Z", [svc], !!opts.walkIn]);
}
function stay(pet, svc, i, o) { return db.query("select public.pet_create_stay($1,$2,$3,$4::date,$5::date,$6,null,null,false) as id", [CUST_A, pet, KENNEL, i, o, svc || null]); }
async function fails(p, code) { var err = null; try { await p; } catch (e) { err = e; } expect(err && err.message).toMatch(new RegExp(code)); }

describe("101: service / species guard", function () {
  beforeEach(async function () { await setup(true); });

  it("rejects a service restricted to another species, for bookings and stays, and creates nothing", async function () {
    await fails(book(CAT, SVC_DOG, "09"), "SERVICE_SPECIES_MISMATCH");
    await fails(book(DOG, SVC_CAT, "09"), "SERVICE_SPECIES_MISMATCH");
    await fails(stay(CAT, SVC_NIGHT_DOG, "2027-03-01", "2027-03-02"), "SERVICE_SPECIES_MISMATCH");
    expect((await db.query("select count(*)::int as n from public.pet_bookings")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int as n from public.pet_boarding_stays")).rows[0].n).toBe(0);
  });
  it("allows matching species and services for every species", async function () {
    await book(DOG, SVC_DOG, "09"); await book(CAT, SVC_CAT, "09"); await book(CAT, SVC_ANY, "11");
    await stay(DOG, SVC_NIGHT_DOG, "2027-03-01", "2027-03-02"); await stay(CAT, SVC_NIGHT_ANY, "2027-03-05", "2027-03-06");
    await stay(CAT, null, "2027-04-01", "2027-04-02"); // a stay without a catalogue service is unaffected
  });
  it("refuses when only one of several services does not fit", async function () {
    await fails(db.query("select public.pet_create_booking($1,$2,null,$3,$4,$5::uuid[],false,null)",
      [CUST_A, DOG, "2027-01-11T09:00:00Z", "2027-01-11T10:00:00Z", [SVC_ANY, SVC_CAT]]), "SERVICE_SPECIES_MISMATCH");
  });
  it("keeps every older behaviour (unknown pet, other business, clashes, walk-in status, grants)", async function () {
    await book(DOG, SVC_ANY, "09", { staff: STAFF_A });
    await fails(book(CAT, SVC_ANY, "09", { staff: STAFF_A }), "BOOKING_CONFLICT_STAFF");
    await fails(book(DOG, SVC_ANY, "09"), "BOOKING_CONFLICT_PET");
    await fails(book(DOG_B, SVC_ANY, "13"), "PET_NOT_FOUND");
    var w = await book(CAT, SVC_ANY, "15", { walkIn: true });
    expect((await db.query("select status from public.pet_bookings where id = $1", [w.rows[0].id])).rows[0].status).toBe("checked-in");
    await as("");
    await fails(book(DOG, SVC_ANY, "17"), "NOT_AUTHENTICATED");
    await as(A);
    await db.exec("set role anon");
    await fails(book(DOG, SVC_ANY, "17"), "permission denied");
    await db.exec("reset role");
    var g = await db.query("select has_function_privilege('authenticated','public.pet_create_booking(uuid,uuid,uuid,timestamptz,timestamptz,uuid[],boolean,text)','execute') as x");
    expect(g.rows[0].x).toBe(true);
  });
  it("still refuses archived pets (the 097 triggers, not this migration)", async function () {
    await db.query("update public.pet_pets set archived_at = now(), archived_reason = 'inactive' where id = $1", [DOG]);
    await fails(book(DOG, SVC_ANY, "09"), "PET_ARCHIVED");
    await fails(stay(DOG, null, "2027-03-01", "2027-03-02"), "PET_ARCHIVED");
  });
  it("does not rewrite history when applied to a database that already has bookings", async function () {
    await setup(false);
    await book(CAT, SVC_DOG, "09"); // allowed before 101: the old behaviour
    await db.exec(UP);
    expect((await db.query("select count(*)::int as n from public.pet_bookings")).rows[0].n).toBe(1);
    await fails(book(CAT, SVC_DOG, "12"), "SERVICE_SPECIES_MISMATCH");
  });
  it("rollback restores the previous behaviour", async function () {
    await db.exec(DOWN);
    await book(CAT, SVC_DOG, "09");
    await stay(CAT, SVC_NIGHT_DOG, "2027-03-01", "2027-03-02");
  });
});
