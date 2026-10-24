// @vitest-environment node
//
// Behavioural test of migration 090 (booking statuses) against a REAL Postgres engine
// (PGlite, in process): upgrading a database that already holds bookings in every old
// status, the full from/to status matrix, and the manual rollback script. The stand-in
// platform tables are NOT the live schema; they only provide the columns the pet
// migrations use (same stand-in as migration088.db.test.js).
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

function read(rel) { return fs.readFileSync(path.join(process.cwd(), rel), "utf8"); }
var BASE = ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql",
  "087_pet_audit_log.sql", "088_pet_bookings.sql"];
var UP = read("supabase/migrations/090_pet_booking_statuses.sql");
var DOWN = read("supabase/sql/090_rollback_pet_booking_statuses.sql");

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var CUST = "c0000000-0000-0000-0000-00000000000a";
var STAFF1 = "50000000-0000-0000-0000-0000000000a1";
var SVC = "f0000000-0000-0000-0000-000000000001";
var OLD = ["pending", "confirmed", "checked-in", "in-progress", "completed", "cancelled", "no-show"];
var NEW = ["booked", "checked-in", "in-progress", "ready", "completed", "cancelled", "no-show"];
var ALLOWED = ["booked>checked-in", "booked>cancelled", "booked>no-show", "checked-in>in-progress", "checked-in>cancelled", "in-progress>ready", "ready>completed"];

// a database in the state production is in today: 083-088 applied, 088 statuses, one booking per old status
async function productionLikeDb() {
  var db = new PGlite({ extensions: { btree_gist: btree_gist } });
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
    insert into public.salons values ('${A}','A');
    insert into public.customers values ('${CUST}','${A}','Ann');
    insert into public.staff values ('${STAFF1}','${A}','G1',true);
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, species, active)
      values ('${SVC}','${A}','Bath','Grooming',60,1500,'{}',true);
  `);
  for (var i = 0; i < OLD.length; i++) {
    var pet = "e0000000-0000-0000-0000-00000000000" + (i + 1);
    await db.exec(`insert into public.pet_pets (id, salon_id, customer_id, name, species) values ('${pet}','${A}','${CUST}','Pet${i}','Dog')`);
    await db.query("insert into public.pet_bookings (id, salon_id, customer_id, pet_id, staff_id, starts_at, ends_at, status, notes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      ["b0000000-0000-0000-0000-00000000000" + (i + 1), A, CUST, pet, STAFF1,
        new Date(Date.UTC(2030, 0, 10, 6 + i)).toISOString(), new Date(Date.UTC(2030, 0, 10, 6 + i, 45)).toISOString(), OLD[i], "was " + OLD[i]]);
    await db.query("insert into public.pet_booking_services (salon_id, booking_id, service_id, service_name, price, duration_minutes) values ($1,$2,$3,'Bath',1500,60)",
      [A, "b0000000-0000-0000-0000-00000000000" + (i + 1), SVC]);
  }
  await db.query("select set_config('app.salon_id', $1, false)", [A]);
  return db;
}
async function statusesByNote(db) {
  var rows = (await db.query("select notes, status from public.pet_bookings order by notes")).rows;
  var m = {}; rows.forEach(function (r) { m[r.notes] = r.status; }); return m;
}
async function shape(db) {
  var con = (await db.query("select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.pet_bookings'::regclass and conname='pet_bookings_status_check'")).rows[0].d;
  var def = (await db.query("select column_default d from information_schema.columns where table_name='pet_bookings' and column_name='status'")).rows[0].d;
  var fns = (await db.query("select proname, md5(pg_get_functiondef(oid)) h from pg_proc where pronamespace='public'::regnamespace and proname in ('pet_create_booking','pet_update_booking','pet_set_booking_status') order by proname")).rows;
  var ov = (await db.query("select conname, md5(pg_get_constraintdef(oid)) h from pg_constraint where conrelid='public.pet_bookings'::regclass and contype='x' order by conname")).rows;
  return { con: con, def: def, fns: fns, ov: ov };
}

describe("migration 090: upgrading a database that already holds bookings", function () {
  var db, before;
  beforeAll(async function () {
    db = await productionLikeDb();
    before = await shape(db);
    await db.exec("begin;\n" + UP + "\ncommit;");
  }, 90000);

  it("turns pending and confirmed into booked and leaves every other status exactly as it was", async function () {
    expect(await statusesByNote(db)).toEqual({
      "was pending": "booked", "was confirmed": "booked", "was checked-in": "checked-in", "was in-progress": "in-progress",
      "was completed": "completed", "was cancelled": "cancelled", "was no-show": "no-show",
    });
  });

  it("keeps every booking and every service line (nothing is lost or rewritten)", async function () {
    expect((await db.query("select count(*)::int n from public.pet_bookings")).rows[0].n).toBe(7);
    expect((await db.query("select count(*)::int n from public.pet_booking_services")).rows[0].n).toBe(7);
    expect((await db.query("select count(*)::int n from public.pet_booking_services where service_name='Bath' and price=1500 and duration_minutes=60")).rows[0].n).toBe(7);
  });

  it("allows exactly the seven new statuses and defaults new rows to booked", async function () {
    var s = await shape(db);
    NEW.forEach(function (n) { expect(s.con).toContain("'" + n + "'"); });
    expect(s.con).not.toContain("'pending'"); expect(s.con).not.toContain("'confirmed'");
    expect(s.def).toContain("'booked'");
  });

  it("does not touch the no-double-booking rules", async function () {
    var s = await shape(db);
    expect(s.ov).toEqual(before.ov);
  });

  it("changes the three functions and nothing else about them", async function () {
    var s = await shape(db);
    s.fns.forEach(function (f, i) { expect(f.proname).toBe(before.fns[i].proname); expect(f.h).not.toBe(before.fns[i].h); });
    var grants = (await db.query(`select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u, p.prosecdef d
      from pg_proc p where pronamespace='public'::regnamespace and proname in ('pet_create_booking','pet_update_booking','pet_set_booking_status')`)).rows;
    grants.forEach(function (g) { expect(g.a).toBe(false); expect(g.u).toBe(true); expect(g.d).toBe(true); });
  });

  it("refuses the old status names on the table itself", async function () {
    for (var bad of ["pending", "confirmed", "nonsense"]) {
      await expect(db.query("update public.pet_bookings set status=$1 where notes='was no-show'", [bad])).rejects.toThrow(/check constraint|violates/i);
    }
  });

  it("allows exactly the intended status moves, for every from/to pair", async function () {
    var n = 0;
    for (var from of NEW) {
      for (var to of NEW) {
        var pet = "e0000000-0000-0000-0000-0000000000" + String(10 + n).padStart(2, "0");
        await db.exec(`insert into public.pet_pets (id, salon_id, customer_id, name, species) values ('${pet}','${A}','${CUST}','M${n}','Dog')`);
        var id = (await db.query("insert into public.pet_bookings (salon_id, customer_id, pet_id, starts_at, ends_at, status) values ($1,$2,$3,$4,$5,$6) returning id",
          [A, CUST, pet, new Date(Date.UTC(2031, 0, 1 + n)).toISOString(), new Date(Date.UTC(2031, 0, 1 + n, 1)).toISOString(), from])).rows[0].id;
        n++;
        var shouldWork = ALLOWED.indexOf(from + ">" + to) !== -1;
        var p = db.query("select public.pet_set_booking_status($1,$2) as s", [id, to]);
        if (shouldWork) {
          expect((await p).rows[0].s).toBe(to);
          expect((await db.query("select status from public.pet_bookings where id=$1", [id])).rows[0].status).toBe(to);
        } else {
          await expect(p).rejects.toThrow(/INVALID_STATUS_CHANGE/);
          expect((await db.query("select status from public.pet_bookings where id=$1", [id])).rows[0].status).toBe(from);
        }
      }
    }
    expect(n).toBe(49);
  }, 90000);
});

describe("migration 090: the manual rollback script", function () {
  it("restores the exact 088 structure and relabels booked -> confirmed and ready -> in-progress (no row lost)", async function () {
    var db = await productionLikeDb();
    var before = await shape(db);
    await db.exec("begin;\n" + UP + "\ncommit;");
    // use the new workflow so there is a ready row to roll back
    var ready = "b0000000-0000-0000-0000-000000000004"; // was in-progress
    await db.query("select public.pet_set_booking_status($1,'ready')", [ready]);
    expect((await statusesByNote(db))["was in-progress"]).toBe("ready");

    await db.exec(DOWN);

    var after = await shape(db);
    expect(after.con).toBe(before.con);
    expect(after.def).toBe(before.def);
    expect(after.fns).toEqual(before.fns); // function bodies byte-identical to 088
    expect(after.ov).toEqual(before.ov);
    expect(await statusesByNote(db)).toEqual({
      "was pending": "confirmed", "was confirmed": "confirmed", "was checked-in": "checked-in", "was in-progress": "in-progress",
      "was completed": "completed", "was cancelled": "cancelled", "was no-show": "no-show",
    });
    expect((await db.query("select count(*)::int n from public.pet_bookings")).rows[0].n).toBe(7);
    expect((await db.query("select count(*)::int n from public.pet_booking_services")).rows[0].n).toBe(7);
    // the 088 workflow works again
    await expect(db.query("select public.pet_set_booking_status($1,'ready')", [ready])).rejects.toThrow(/INVALID_STATUS_CHANGE/);
    expect((await db.query("select public.pet_set_booking_status($1,'completed') as s", [ready])).rows[0].s).toBe("completed");
  }, 90000);

  it("can be followed by applying 090 again (a full round trip)", async function () {
    var db = await productionLikeDb();
    await db.exec("begin;\n" + UP + "\ncommit;");
    await db.exec(DOWN);
    await db.exec("begin;\n" + UP + "\ncommit;");
    var s = await shape(db);
    NEW.forEach(function (n) { expect(s.con).toContain("'" + n + "'"); });
    expect((await statusesByNote(db))["was confirmed"]).toBe("booked");
  }, 90000);

  it("leaves everything unchanged when a step fails (single transaction)", async function () {
    var db = await productionLikeDb();
    await db.exec("begin;\n" + UP + "\ncommit;");
    // sabotage: make the rollback fail midway by removing the constraint it expects to drop
    await db.exec("alter table public.pet_bookings drop constraint pet_bookings_status_check");
    await expect(db.exec(DOWN)).rejects.toThrow();
    await db.exec("rollback");
    var rows = (await db.query("select count(*)::int n from public.pet_bookings")).rows[0].n;
    expect(rows).toBe(7);
  }, 90000);
});
