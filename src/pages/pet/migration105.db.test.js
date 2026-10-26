// @vitest-environment node
//
// Behavioural test of migration 105 (boarding billing) against a REAL Postgres engine (PGlite).
// Policy under test: early check-out pays the FULL booked stay; each whole day past the planned
// check-out is one extra night at the stay's nightly rate; staff may reduce (not raise) the late
// days and may add a discount. Dates are fixed in 2020 and the actual check-out instant is set
// directly, so nothing depends on today's date. Stand-in platform tables are NOT the live schema.
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
var PET_A = "e0000000-0000-0000-0000-0000000000a1";
var PET_B = "e0000000-0000-0000-0000-0000000000b1";
var SVC = "f0000000-0000-0000-0000-000000000002"; // Standard night, 2000
var SVC_FREE = "f0000000-0000-0000-0000-000000000003"; // price 0
var db; var K; var K2; var keyN = 0; var petN = 0;
function key() { keyN += 1; return "00000000-0000-4000-8000-" + String(keyN).padStart(12, "0"); }
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }

// A stay IN 2020-01-01 .. OUT (default 2020-01-05 = 4 nights), checked in and out, collected at `outAt`.
async function stay(o) {
  o = Object.assign({ from: "2020-01-01", to: "2020-01-05", svc: SVC, outAt: "2020-01-05 10:00:00+03", finish: true, kennel: K }, o || {});
  var id = (await db.query("select public.pet_create_stay($1,$2,$3,$4,$5,$6,null,null,false) as id", [CUST_A, PET_A, o.kennel, o.from, o.to, o.svc])).rows[0].id;
  if (o.finish) {
    await db.query("select public.pet_set_stay_status($1,'occupied')", [id]);
    await db.query("select public.pet_set_stay_status($1,'checked-out')", [id]);
    await db.query("update public.pet_boarding_stays set checked_out_at = $2::timestamptz where id = $1", [id, o.outAt]);
  }
  return id;
}
async function invoice(id, o) {
  o = Object.assign({ late: null, dtype: "amount", dval: 0, notes: null }, o || {});
  return (await db.query("select public.pet_invoice_stay($1,$2,$3,$4,$5,null,$6) as id", [o.key || key(), id, o.late, o.dtype, o.dval, o.notes])).rows[0].id;
}
async function inv(id) { return (await db.query("select invoice_number, status, subtotal, discount_amount, total, tax_amount, amount_paid, stay_id, pet_id, customer_id, notes from public.pet_invoices where id=$1", [id])).rows[0]; }
async function lines(id) { return (await db.query("select description, quantity, unit_price, line_total from public.pet_invoice_lines where invoice_id=$1 order by description, quantity desc", [id])).rows; }

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
  for (var f of ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql", "087_pet_audit_log.sql", "088_pet_bookings.sql", "089_pet_boarding.sql", "092_pet_booking_statuses.sql", "090_pet_invoices.sql", "104_pet_boarding_care_details.sql", "105_pet_boarding_billing.sql"]) await db.exec(sql(f));
  await db.exec(`
    insert into public.salons values ('${A}','A'),('${B}','B');
    insert into public.salon_settings (salon_id) values ('${A}'),('${B}');
    insert into public.customers values ('${CUST_A}','${A}','Ann'),('${CUST_B}','${B}','Bob');
    insert into public.pet_pets (id, salon_id, customer_id, name, species) values ('${PET_A}','${A}','${CUST_A}','Rex','Dog'), ('${PET_B}','${B}','${CUST_B}','Bo','Dog');
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, species, active) values
      ('${SVC}','${A}','Standard night','Boarding',null,2000,'{}',true),
      ('${SVC_FREE}','${A}','Free night','Boarding',null,0,'{}',true);
  `);
  await as(A);
  K = (await db.query("select public.pet_save_kennel(null,'K1','Standard',null) as id")).rows[0].id;
}, 90000);

beforeEach(async function () {
  await db.exec("delete from public.pet_invoice_lines; delete from public.pet_payments; delete from public.pet_invoices; delete from public.pet_boarding_stays; update public.salon_settings set tax_enabled=false");
  await as(A);
});

describe("migration 105 against a real Postgres engine", function () {
  it("on time: bills the booked nights from the rate saved on the stay", async function () {
    var s = await stay();
    var id = await invoice(s);
    var i = await inv(id);
    expect(i).toMatchObject({ status: "issued", subtotal: 8000, discount_amount: 0, total: 8000, amount_paid: 0, stay_id: s, pet_id: PET_A, customer_id: CUST_A });
    expect(await lines(id)).toEqual([{ description: "Standard night", quantity: 4, unit_price: 2000, line_total: 8000 }]);
    expect(i.notes).toMatch(/4 nights/);
  });

  it("uses the rate copied onto the stay even if the catalogue price changes later", async function () {
    var s = await stay();
    await db.query("update public.pet_services set price = 9999 where id = $1", [SVC]);
    expect((await inv(await invoice(s))).total).toBe(8000);
    await db.query("update public.pet_services set price = 2000 where id = $1", [SVC]);
  });

  it("early check-out still pays the FULL booked stay", async function () {
    var s = await stay({ outAt: "2020-01-02 09:00:00+03" });
    var b = (await db.query("select * from public.pet_stay_billing($1)", [s])).rows[0];
    expect(b).toMatchObject({ nights: 4, late_days: 0, total: 8000 });
    expect((await inv(await invoice(s))).total).toBe(8000);
  });

  it("late collection adds one extra night per whole day late", async function () {
    var s = await stay({ outAt: "2020-01-08 12:00:00+03" });
    var b = (await db.query("select * from public.pet_stay_billing($1)", [s])).rows[0];
    expect(b).toMatchObject({ nights: 4, late_days: 3, nights_total: 8000, late_total: 6000, total: 14000 });
    var id = await invoice(s);
    expect((await inv(id)).total).toBe(14000);
    expect(await lines(id)).toEqual([
      { description: "Standard night", quantity: 4, unit_price: 2000, line_total: 8000 },
      { description: "Standard night - late collection", quantity: 3, unit_price: 2000, line_total: 6000 },
    ]);
    expect((await inv(id)).notes).toMatch(/3 days late/);
  });

  it("counts the day in East Africa Time, not UTC", async function () {
    var s1 = await stay({ outAt: "2020-01-05 22:30:00+00" }); // 01:30 on the 6th in Nairobi -> 1 day late
    expect((await db.query("select late_days from public.pet_stay_billing($1)", [s1])).rows[0].late_days).toBe(1);
    await db.query("update public.pet_boarding_stays set status='cancelled' where id=$1", [s1]);
    var s2 = await stay({ from: "2020-02-01", to: "2020-02-05", outAt: "2020-02-05 20:30:00+00" }); // 23:30 on the 5th -> on time
    expect((await db.query("select late_days from public.pet_stay_billing($1)", [s2])).rows[0].late_days).toBe(0);
  });

  it("lets staff reduce or waive the late days, but never raise them", async function () {
    var s = await stay({ outAt: "2020-01-08 12:00:00+03" });
    await expect(invoice(s, { late: 4 })).rejects.toThrow(/INVALID_LATE_DAYS/);
    await expect(invoice(s, { late: -1 })).rejects.toThrow(/INVALID_LATE_DAYS/);
    var id = await invoice(s, { late: 1 });
    expect((await inv(id)).total).toBe(10000);
    expect((await inv(id)).notes).toMatch(/reduced from 3/);
    await db.query("select public.pet_void_invoice($1,'redo')", [id]);
    var id2 = await invoice(s, { late: 0 });
    expect((await inv(id2)).total).toBe(8000);
    expect(await lines(id2)).toEqual([{ description: "Standard night", quantity: 4, unit_price: 2000, line_total: 8000 }]);
  });

  it("applies a discount like any other invoice and refuses a bad one", async function () {
    var s = await stay();
    await expect(invoice(s, { dval: 8001 })).rejects.toThrow(/INVALID_DISCOUNT/);
    await expect(invoice(s, { dtype: "percent", dval: 101 })).rejects.toThrow(/INVALID_DISCOUNT/);
    await expect(invoice(s, { dtype: "bogus", dval: 1 })).rejects.toThrow(/INVALID_DISCOUNT/);
    var id = await invoice(s, { dtype: "percent", dval: 25 });
    expect(await inv(id)).toMatchObject({ subtotal: 8000, discount_amount: 2000, total: 6000 });
  });

  it("works out tax the same way as other Pet invoices", async function () {
    await db.query("update public.salon_settings set tax_enabled=true, tax_rate=16 where salon_id=$1", [A]);
    var s = await stay();
    var i = await inv(await invoice(s));
    expect(i.tax_amount).toBe(8000 - Math.round(8000 / 1.16));
  });

  it("is idempotent, and one stay has only one live invoice (a void frees it)", async function () {
    var s = await stay(); var k = key();
    var id = await invoice(s, { key: k });
    expect(await invoice(s, { key: k })).toBe(id);
    await expect(invoice(s)).rejects.toThrow(/STAY_ALREADY_INVOICED/);
    expect((await db.query("select count(*)::int n from public.pet_invoices")).rows[0].n).toBe(1);
    await db.query("select public.pet_void_invoice($1,'mistake')", [id]);
    expect(await invoice(s)).not.toBe(id);
  });

  it("only bills a stay that has been checked out", async function () {
    var reserved = await stay({ finish: false });
    await expect(invoice(reserved)).rejects.toThrow(/STAY_NOT_CHECKED_OUT/);
    await db.query("select public.pet_set_stay_status($1,'occupied')", [reserved]);
    await expect(invoice(reserved)).rejects.toThrow(/STAY_NOT_CHECKED_OUT/);
    var cancelled = await stay({ finish: false, from: "2020-03-01", to: "2020-03-03" });
    await db.query("select public.pet_set_stay_status($1,'cancelled')", [cancelled]);
    await expect(invoice(cancelled)).rejects.toThrow(/STAY_NOT_CHECKED_OUT/);
  });

  it("refuses a stay with no rate to bill", async function () {
    var none = await stay({ svc: null });
    await expect(invoice(none)).rejects.toThrow(/STAY_SERVICE_MISSING/);
    var free = await stay({ svc: SVC_FREE, from: "2020-04-01", to: "2020-04-03", outAt: "2020-04-03 10:00:00+03" });
    await expect(invoice(free)).rejects.toThrow(/STAY_NO_RATE/);
  });

  it("splits a very long stay into lines of at most 100 nights", async function () {
    var s = await stay({ from: "2020-01-01", to: "2020-05-30", outAt: "2020-05-30 10:00:00+03" }); // 150 nights
    var id = await invoice(s);
    expect((await inv(id)).total).toBe(150 * 2000);
    expect((await lines(id)).map(function (l) { return l.quantity; }).sort(function (a, b) { return b - a; })).toEqual([100, 50]);
  });

  it("billing view shows the invoice once one exists, and a checked-in stay is previewed against today", async function () {
    var s = await stay();
    expect((await db.query("select invoice_id from public.pet_stay_billing($1)", [s])).rows[0].invoice_id).toBeNull();
    var id = await invoice(s);
    var b = (await db.query("select invoice_id, invoice_number from public.pet_stay_billing($1)", [s])).rows[0];
    expect(b.invoice_id).toBe(id);
    expect(b.invoice_number).toBe((await inv(id)).invoice_number);
    var live = await stay({ finish: false, from: "2020-06-01", to: "2020-06-03" });
    await db.query("select public.pet_set_stay_status($1,'occupied')", [live]);
    expect((await db.query("select status, late_days from public.pet_stay_billing($1)", [live])).rows[0].status).toBe("occupied");
  });

  it("keeps businesses apart", async function () {
    var s = await stay();
    await as(B);
    await expect(invoice(s)).rejects.toThrow(/STAY_NOT_FOUND/);
    await expect(db.query("select * from public.pet_stay_billing($1)", [s])).rejects.toThrow(/STAY_NOT_FOUND/);
  });

  it("protects a billed stay from deletion, and is not callable by anon or without a business", async function () {
    var s = await stay(); await invoice(s);
    await expect(db.query("delete from public.pet_boarding_stays where id=$1", [s])).rejects.toThrow(/violates foreign key|pet_invoices/i);
    var g = (await db.query("select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u from pg_proc p where proname in ('pet_invoice_stay','pet_stay_billing','pet_stay_late_days')")).rows;
    expect(g.length).toBe(3);
    g.forEach(function (r) { expect([r.a, r.u]).toEqual([false, true]); });
    await as("");
    await expect(invoice(s)).rejects.toThrow(/NOT_AUTHENTICATED/);
    await expect(db.query("select * from public.pet_stay_billing($1)", [s])).rejects.toThrow(/NOT_AUTHENTICATED/);
  });
});
