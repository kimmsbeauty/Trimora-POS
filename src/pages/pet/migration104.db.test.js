// @vitest-environment node
//
// Behavioural test of migration 104 (boarding: emergency contact + medication notes)
// against a REAL Postgres engine (PGlite). Applies the repo's real migrations 083-089
// then 104, and checks the stay functions still behave as before AND the new fields are
// stored, validated, kept when an old screen doesn't send them, and never leak across
// businesses. Stand-in platform tables are NOT the live schema.
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
var PET_A1 = "e0000000-0000-0000-0000-0000000000a1";
var PET_B = "e0000000-0000-0000-0000-0000000000b1";
var db; var K;
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
function day(n) { return new Date(Date.UTC(2030, 0, 1 + n)).toISOString().slice(0, 10); }
async function create(extra) {
  var a = Object.assign({ pet: PET_A1, from: day(0), to: day(3), name: null, phone: null, med: null }, extra || {});
  return (await db.query("select public.pet_create_stay($1,$2,$3,$4,$5,null,null,null,false,$6,$7,$8) as id", [CUST_A, a.pet, K, a.from, a.to, a.name, a.phone, a.med])).rows[0].id;
}
async function row(id) { return (await db.query("select emergency_contact_name n, emergency_contact_phone p, medication_notes m, feeding_notes f from public.pet_boarding_stays where id=$1", [id])).rows[0]; }

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
  for (var f of ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql", "087_pet_audit_log.sql", "088_pet_bookings.sql", "089_pet_boarding.sql", "104_pet_boarding_care_details.sql"]) await db.exec(sql(f));
  await db.exec(`
    insert into public.salons values ('${A}','A'),('${B}','B');
    insert into public.customers values ('${CUST_A}','${A}','Ann'),('${CUST_B}','${B}','Bob');
    insert into public.pet_pets (id, salon_id, customer_id, name, species) values ('${PET_A1}','${A}','${CUST_A}','Rex','Dog'), ('${PET_B}','${B}','${CUST_B}','Bo','Dog');
  `);
  await as(A);
  K = (await db.query("select public.pet_save_kennel(null,'K1','Standard',null) as id")).rows[0].id;
}, 60000);

beforeEach(async function () { await db.exec("delete from public.pet_boarding_stays"); await as(A); });

describe("migration 104 against a real Postgres engine", function () {
  it("keeps the old nine-argument call working, with the new fields empty", async function () {
    var id = (await db.query("select public.pet_create_stay($1,$2,$3,$4,$5,null,'Twice a day','Calm',false) as id", [CUST_A, PET_A1, K, day(0), day(2)])).rows[0].id;
    expect(await row(id)).toEqual({ n: null, p: null, m: null, f: "Twice a day" });
  });

  it("stores the emergency contact and medication instructions, trimmed", async function () {
    var id = await create({ name: "  Mary Wanjiku ", phone: " +254 712 345 678 ", med: " Half a tablet at 8am with food " });
    expect(await row(id)).toEqual({ n: "Mary Wanjiku", p: "+254 712 345 678", m: "Half a tablet at 8am with food", f: null });
  });

  it("requires both a name and a number, or neither, and a sane number", async function () {
    await expect(create({ name: "Mary" })).rejects.toThrow(/INVALID_CONTACT/);
    await expect(create({ phone: "0712345678" })).rejects.toThrow(/INVALID_CONTACT/);
    await expect(create({ name: "Mary", phone: "call me!" })).rejects.toThrow(/INVALID_CONTACT/);
    await expect(create({ name: "x".repeat(81), phone: "0712345678" })).rejects.toThrow(/INVALID_CONTACT/);
    await expect(create({ med: "x".repeat(501) })).rejects.toThrow(/INVALID_NOTES/);
    expect((await db.query("select count(*)::int n from public.pet_boarding_stays")).rows[0].n).toBe(0);
  });

  it("update: a call that omits the new fields leaves them untouched (stale screens cannot wipe them)", async function () {
    var id = await create({ name: "Mary", phone: "0712345678", med: "Insulin 2 units at 7am" });
    await db.query("select public.pet_update_stay($1,$2,$3,$4,'Fed','Calm')", [id, K, day(0), day(4)]);
    expect(await row(id)).toMatchObject({ n: "Mary", p: "0712345678", m: "Insulin 2 units at 7am", f: "Fed" });
  });

  it("update: new values replace, and an empty string clears", async function () {
    var id = await create({ name: "Mary", phone: "0712345678", med: "Old" });
    await db.query("select public.pet_update_stay($1,$2,$3,$4,null,null,'John','0722000000','New')", [id, K, day(0), day(3)]);
    expect(await row(id)).toMatchObject({ n: "John", p: "0722000000", m: "New" });
    await db.query("select public.pet_update_stay($1,$2,$3,$4,null,null,'','','')", [id, K, day(0), day(3)]);
    expect(await row(id)).toMatchObject({ n: null, p: null, m: null });
  });

  it("update: refuses a half-contact, even when only one half is sent", async function () {
    var id = await create({ name: "Mary", phone: "0712345678" });
    await expect(db.query("select public.pet_update_stay($1,$2,$3,$4,null,null,'',null,null)", [id, K, day(0), day(3)])).rejects.toThrow(/INVALID_CONTACT/);
    expect(await row(id)).toMatchObject({ n: "Mary", p: "0712345678" });
  });

  it("still blocks a finished stay from being edited and keeps the double-booking guard", async function () {
    var id = await create({ med: "x" });
    await expect(create({ med: "y", from: day(1), to: day(2) })).rejects.toThrow(/STAY_CONFLICT/);
    await db.query("select public.pet_set_stay_status($1,'occupied')", [id]);
    await db.query("select public.pet_set_stay_status($1,'checked-out')", [id]);
    await expect(db.query("select public.pet_update_stay($1,$2,$3,$4,null,null,null,null,'z')", [id, K, day(0), day(3)])).rejects.toThrow(/STAY_NOT_EDITABLE/);
  });

  it("has no ambiguous overloads and is not callable by anon or without a business", async function () {
    var n = (await db.query("select count(*)::int n from pg_proc where proname in ('pet_create_stay','pet_update_stay')")).rows[0].n;
    expect(n).toBe(2);
    var g = (await db.query("select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u from pg_proc p where proname in ('pet_create_stay','pet_update_stay')")).rows;
    g.forEach(function (r) { expect([r.a, r.u]).toEqual([false, true]); });
    await as("");
    await expect(create({})).rejects.toThrow(/NOT_AUTHENTICATED/);
  });

  it("will not create a stay for another business's pet", async function () {
    await expect(create({ pet: PET_B, med: "secret" })).rejects.toThrow(/PET_NOT_FOUND/);
  });
});
