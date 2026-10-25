// @vitest-environment node
//
// Behavioural test of migration 097 (archive pets; archived-pet and service/species
// guards) and 098 (reminder settings) against a REAL Postgres engine (PGlite, in
// process). Same stand-in platform tables as migration089.db.test.js (NOT the live
// schema). Both migrations are written for review and NOT applied to production.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

function read(rel) { return fs.readFileSync(path.join(process.cwd(), rel), "utf8"); }
var BASE = ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql",
  "087_pet_audit_log.sql", "088_pet_bookings.sql", "089_pet_boarding.sql", "092_pet_booking_statuses.sql"];
var UP = read("supabase/migrations/097_pet_archive.sql");
var DOWN = read("supabase/sql/097_rollback_pet_archive.sql");
var UP98 = read("supabase/migrations/098_pet_reminder_settings.sql");
var DOWN98 = read("supabase/sql/098_rollback_pet_reminder_settings.sql");
var PREFLIGHT = read("supabase/sql/097_preflight_checks.sql");

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var CUST_A = "c0000000-0000-0000-0000-00000000000a";
var CUST_B = "c0000000-0000-0000-0000-00000000000b";
var STAFF_A = "50000000-0000-0000-0000-0000000000a1";
var DOG = "e0000000-0000-0000-0000-0000000000a1";
var CAT = "e0000000-0000-0000-0000-0000000000a2";
var DOG_B = "e0000000-0000-0000-0000-0000000000b1";
var SVC_ANY = "f0000000-0000-0000-0000-000000000001";
var SVC_DOG = "f0000000-0000-0000-0000-000000000002";
var SVC_CAT = "f0000000-0000-0000-0000-000000000003";
var SVC_NIGHT_DOG = "f0000000-0000-0000-0000-000000000004";
var KENNEL = "a0000000-0000-0000-0000-000000000001";

var db;
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function setup(apply097) {
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
  for (var f of BASE) await db.exec(read("supabase/migrations/" + f));
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
      ('${SVC_NIGHT_DOG}','${A}','Dog night','Boarding',null,900,'{Dog}',true);
    insert into public.pet_kennels (id, salon_id, name, kind) values ('${KENNEL}','${A}','K1','Standard');
  `);
  if (apply097) await db.exec(UP);
  await as(A);
}
function book(pet, svc, h, opts) {
  opts = opts || {};
  return db.query("select public.pet_create_booking($1,$2,$3,$4,$5,$6::uuid[],$7,null) as id",
    [CUST_A, pet, opts.staff === undefined ? null : opts.staff, "2027-01-10T" + h + ":00Z", "2027-01-10T" + (Number(h.slice(0, 2)) + 1) + ":00Z", [svc], !!opts.walkIn]);
}
function stay(pet, svc, i, o) { return db.query("select public.pet_create_stay($1,$2,$3,$4::date,$5::date,$6,null,null,false) as id", [CUST_A, pet, KENNEL, i, o, svc || null]); }
async function fails(p, code) { var err = null; try { await p; } catch (e) { err = e; } expect(err && err.message).toMatch(new RegExp(code)); }

describe("097: archive columns and the direct-write guard", function () {
  beforeEach(async function () { await setup(true); });

  it("adds the columns, nothing is archived by default", async function () {
    var r = await db.query("select count(*)::int as n from public.pet_pets where archived_at is not null");
    expect(r.rows[0].n).toBe(0);
  });
  it("refuses to set the archive columns directly (even by the table owner)", async function () {
    await fails(db.query("update public.pet_pets set archived_at = now(), archived_reason = 'inactive' where id = $1", [DOG]), "ARCHIVE_VIA_FUNCTION_ONLY");
    await fails(db.query("update public.pet_pets set archived_reason = 'other' where id = $1", [DOG]), "ARCHIVE_VIA_FUNCTION_ONLY");
    await fails(db.query("insert into public.pet_pets (salon_id, customer_id, name, species, archived_at, archived_reason) values ($1,$2,'X','Dog',now(),'other')", [A, CUST_A]), "ARCHIVE_VIA_FUNCTION_ONLY");
  });
  it("still allows ordinary edits to a pet", async function () {
    await db.query("update public.pet_pets set breed = 'Lab', care_notes = 'calm' where id = $1", [DOG]);
    var r = await db.query("select breed from public.pet_pets where id = $1", [DOG]);
    expect(r.rows[0].breed).toBe("Lab");
  });
  it("keeps the species values restricted (arbitrary species are still rejected)", async function () {
    await fails(db.query("insert into public.pet_pets (salon_id, customer_id, name, species) values ($1,$2,'Z','Dragon')", [A, CUST_A]), "pet_pets_species_check");
    await db.query("insert into public.pet_pets (salon_id, customer_id, name, species) values ($1,$2,'Hammy','Other')", [A, CUST_A]);
  });
});

describe("097: pet_set_archived", function () {
  beforeEach(async function () { await setup(true); });

  it("archives with a reason, is idempotent, and restores; nothing is deleted", async function () {
    await book(DOG, SVC_ANY, "09");
    await db.query("update public.pet_bookings set status = 'cancelled'");
    await db.query("select public.pet_set_archived($1, true, 'passed-away')", [DOG]);
    var r = await db.query("select archived_reason, archived_at is not null as a from public.pet_pets where id = $1", [DOG]);
    expect(r.rows[0]).toEqual({ archived_reason: "passed-away", a: true });
    var at1 = (await db.query("select archived_at from public.pet_pets where id = $1", [DOG])).rows[0].archived_at;
    await db.query("select public.pet_set_archived($1, true, 'moved-away')", [DOG]); // already archived: unchanged
    var r2 = await db.query("select archived_reason, archived_at from public.pet_pets where id = $1", [DOG]);
    expect(r2.rows[0].archived_reason).toBe("passed-away"); expect(String(r2.rows[0].archived_at)).toBe(String(at1));
    expect((await db.query("select count(*)::int as n from public.pet_bookings where pet_id = $1", [DOG])).rows[0].n).toBe(1);
    await db.query("select public.pet_set_archived($1, false)", [DOG]);
    var r3 = await db.query("select archived_reason, archived_at from public.pet_pets where id = $1", [DOG]);
    expect(r3.rows[0]).toEqual({ archived_reason: null, archived_at: null });
    await db.query("select public.pet_set_archived($1, false)", [DOG]); // already active: fine
  });
  it("requires a valid reason", async function () {
    await fails(db.query("select public.pet_set_archived($1, true, null)", [DOG]), "INVALID_ARCHIVE_REASON");
    await fails(db.query("select public.pet_set_archived($1, true, 'bored')", [DOG]), "INVALID_ARCHIVE_REASON");
  });
  it("is tenant-checked and needs a signed-in business", async function () {
    await fails(db.query("select public.pet_set_archived($1, true, 'other')", [DOG_B]), "PET_NOT_FOUND");
    await as("");
    await fails(db.query("select public.pet_set_archived($1, true, 'other')", [DOG]), "NOT_AUTHENTICATED");
  });
  it("refuses while the pet has an open booking, allows it once the booking is finished", async function () {
    await book(DOG, SVC_ANY, "09");
    for (var st of ["booked", "checked-in", "in-progress", "ready"]) {
      await db.query("update public.pet_bookings set status = $1", [st]);
      await fails(db.query("select public.pet_set_archived($1, true, 'inactive')", [DOG]), "PET_HAS_OPEN_BOOKINGS");
    }
    for (var done of ["completed", "cancelled", "no-show"]) {
      await db.query("update public.pet_bookings set status = $1", [done]);
      await db.query("select public.pet_set_archived($1, true, 'inactive')", [DOG]);
      await db.query("select public.pet_set_archived($1, false)", [DOG]);
    }
  });
  it("refuses while the pet has an open stay", async function () {
    await stay(DOG, null, "2027-02-01", "2027-02-03");
    await fails(db.query("select public.pet_set_archived($1, true, 'moved-away')", [DOG]), "PET_HAS_OPEN_STAY");
    await db.query("update public.pet_boarding_stays set status = 'checked-out'");
    await db.query("select public.pet_set_archived($1, true, 'moved-away')", [DOG]);
  });
  it("is not executable by anon and is executable by authenticated", async function () {
    await db.exec("set role anon");
    await fails(db.query("select public.pet_set_archived($1, true, 'other')", [DOG]), "permission denied");
    await db.exec("reset role");
    var r = await db.query("select has_function_privilege('authenticated', 'public.pet_set_archived(uuid, boolean, text)', 'execute') as x");
    expect(r.rows[0].x).toBe(true);
  });
});

describe("097: guards inside the booking and stay functions", function () {
  beforeEach(async function () { await setup(true); });

  it("refuses to book or board an archived pet, and works again after restoring", async function () {
    await db.query("select public.pet_set_archived($1, true, 'inactive')", [DOG]);
    await fails(book(DOG, SVC_ANY, "09"), "PET_ARCHIVED");
    await fails(stay(DOG, null, "2027-03-01", "2027-03-02"), "PET_ARCHIVED");
    await db.query("select public.pet_set_archived($1, false)", [DOG]);
    await book(DOG, SVC_ANY, "09"); await stay(DOG, null, "2027-03-01", "2027-03-02");
  });
  it("rejects a service restricted to another species, in both functions", async function () {
    await fails(book(CAT, SVC_DOG, "09"), "SERVICE_SPECIES_MISMATCH");
    await fails(book(DOG, SVC_CAT, "09"), "SERVICE_SPECIES_MISMATCH");
    await fails(stay(CAT, SVC_NIGHT_DOG, "2027-03-01", "2027-03-02"), "SERVICE_SPECIES_MISMATCH");
    expect((await db.query("select count(*)::int as n from public.pet_bookings")).rows[0].n).toBe(0);
  });
  it("allows matching species and unrestricted services", async function () {
    await book(DOG, SVC_DOG, "09"); await book(CAT, SVC_CAT, "09"); await book(CAT, SVC_ANY, "11");
    await stay(DOG, SVC_NIGHT_DOG, "2027-03-01", "2027-03-02");
  });
  it("checks one bad service among several", async function () {
    await fails(db.query("select public.pet_create_booking($1,$2,null,$3,$4,$5::uuid[],false,null)",
      [CUST_A, DOG, "2027-01-11T09:00:00Z", "2027-01-11T10:00:00Z", [SVC_ANY, SVC_CAT]]), "SERVICE_SPECIES_MISMATCH");
  });
  it("keeps the older behaviour: clashes, unknown pet, walk-in status, grants", async function () {
    await book(DOG, SVC_ANY, "09", { staff: STAFF_A });
    await fails(book(CAT, SVC_ANY, "09", { staff: STAFF_A }), "BOOKING_CONFLICT_STAFF");
    await fails(book(DOG, SVC_ANY, "09"), "BOOKING_CONFLICT_PET");
    await fails(book(DOG_B, SVC_ANY, "13"), "PET_NOT_FOUND");
    var w = await book(CAT, SVC_ANY, "15", { walkIn: true });
    expect((await db.query("select status from public.pet_bookings where id = $1", [w.rows[0].id])).rows[0].status).toBe("checked-in");
    await db.exec("set role anon");
    await fails(book(DOG, SVC_ANY, "17"), "permission denied");
    await db.exec("reset role");
  });
  it("leaves existing history untouched when applied to a database that already has bookings", async function () {
    await setup(false);
    await book(CAT, SVC_ANY, "09");
    await db.exec(UP);
    expect((await db.query("select count(*)::int as n from public.pet_bookings")).rows[0].n).toBe(1);
  });
});

describe("097: preflight and rollback scripts", function () {
  it("the preflight script is read-only and reports sensible numbers", async function () {
    await setup(false);
    var r = await db.query(PREFLIGHT);
    expect(r.rows.length).toBe(5);
    expect(/\b(insert|update|delete|drop|alter|create)\b/i.test(PREFLIGHT.replace(/--.*$/gm, ""))).toBe(false);
    var byName = {}; r.rows.forEach(function (x) { byName[x.check_name.slice(0, 20)] = x.n; });
    expect(Number(r.rows[0].n)).toBe(0);
  });
  it("rollback refuses while a pet is archived, then restores the original functions and removes the columns", async function () {
    await setup(true);
    await db.query("select public.pet_set_archived($1, true, 'passed-away')", [DOG]);
    await fails(db.exec(DOWN), "Some pets are archived");
    await db.query("select public.pet_set_archived($1, false)", [DOG]);
    await db.exec(DOWN);
    var cols = await db.query("select count(*)::int as n from information_schema.columns where table_name = 'pet_pets' and column_name like 'archived%'");
    expect(cols.rows[0].n).toBe(0);
    // the old behaviour is back: a species-restricted service is accepted again (that was the 092 behaviour)
    await book(CAT, SVC_DOG, "09");
    var fn = await db.query("select count(*)::int as n from pg_proc where proname in ('pet_set_archived','pet_pets_guard_archive')");
    expect(fn.rows[0].n).toBe(0);
  });
});

describe("098: reminder settings", function () {
  beforeEach(async function () { await setup(true); await db.exec(UP98); });

  it("saves, updates (case-insensitive per type) and deletes through the functions", async function () {
    var id1 = (await db.query("select public.pet_save_reminder_setting('Rabies', 90) as id")).rows[0].id;
    var id2 = (await db.query("select public.pet_save_reminder_setting('  rabies ', 120) as id")).rows[0].id;
    expect(id2).toBe(id1);
    var r = await db.query("select record_type, window_days from public.pet_reminder_settings");
    expect(r.rows).toEqual([{ record_type: "rabies", window_days: 120 }]);
    await db.query("select public.pet_save_reminder_setting('Deworming', 30)");
    expect((await db.query("select count(*)::int as n from public.pet_reminder_settings")).rows[0].n).toBe(2);
    await db.query("select public.pet_delete_reminder_setting($1)", [id1]);
    expect((await db.query("select count(*)::int as n from public.pet_reminder_settings")).rows[0].n).toBe(1);
  });
  it("validates input", async function () {
    await fails(db.query("select public.pet_save_reminder_setting('', 30)"), "INVALID_RECORD_TYPE");
    await fails(db.query("select public.pet_save_reminder_setting('x', 0)"), "INVALID_WINDOW");
    await fails(db.query("select public.pet_save_reminder_setting('x', 731)"), "INVALID_WINDOW");
    await fails(db.query("select public.pet_save_reminder_setting('x', null)"), "INVALID_WINDOW");
    await fails(db.query("select public.pet_delete_reminder_setting($1)", [A]), "SETTING_NOT_FOUND");
    await as("");
    await fails(db.query("select public.pet_save_reminder_setting('x', 30)"), "NOT_AUTHENTICATED");
  });
  it("is private to each business and the app cannot write the table directly", async function () {
    var id = (await db.query("select public.pet_save_reminder_setting('Rabies', 90) as id")).rows[0].id;
    await as(B);
    await fails(db.query("select public.pet_delete_reminder_setting($1)", [id]), "SETTING_NOT_FOUND");
    await db.exec("set role authenticated");
    expect((await db.query("select count(*)::int as n from public.pet_reminder_settings")).rows[0].n).toBe(0); // RLS: B sees none
    await fails(db.query("insert into public.pet_reminder_settings (salon_id, record_type, window_days) values ($1,'X',30)", [B]), "permission denied");
    await fails(db.query("delete from public.pet_reminder_settings"), "permission denied");
    await db.exec("reset role");
    await db.exec("set role anon");
    await fails(db.query("select count(*) from public.pet_reminder_settings"), "permission denied");
    await db.exec("reset role");
  });
  it("rollback removes the table and functions", async function () {
    await db.exec(DOWN98);
    var r = await db.query("select count(*)::int as n from pg_proc where proname like 'pet_%reminder_setting'");
    expect(r.rows[0].n).toBe(0);
    await fails(db.query("select * from public.pet_reminder_settings"), "does not exist");
  });
});
