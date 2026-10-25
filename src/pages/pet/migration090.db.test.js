// @vitest-environment node
//
// Behavioural test of migration 090 (pet invoices, lines and payments) against a
// REAL Postgres engine (PGlite, in process), reusing the approach of
// migration088.db.test.js. It applies the repo's real migrations 083-088 and 090
// and tries to break the invoice functions: price tampering, double issue,
// numbering, overpayment, duplicate payment references, voiding, cross-business
// access, grants and RLS.
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
var CUST_A2 = "c0000000-0000-0000-0000-0000000000a2";
var CUST_B = "c0000000-0000-0000-0000-00000000000b";
var STAFF_A1 = "50000000-0000-0000-0000-0000000000a1";
var PET_A1 = "e0000000-0000-0000-0000-0000000000a1";
var PET_A2 = "e0000000-0000-0000-0000-0000000000a2";
var PET_B = "e0000000-0000-0000-0000-0000000000b1";
var SVC_GROOM = "f0000000-0000-0000-0000-000000000001"; // 1500
var SVC_NIGHT = "f0000000-0000-0000-0000-000000000002"; // 2000 (boarding rate)
var SVC_OFF = "f0000000-0000-0000-0000-000000000004"; // inactive
var SVC_B = "f0000000-0000-0000-0000-0000000000b1";

var db;
var keyN = 0;
function key() { keyN += 1; return "00000000-0000-4000-8000-" + String(keyN).padStart(12, "0"); }
function at(days, hh) { var d = new Date(Date.now() + days * 86400000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh - 3, 0)); }

async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function invoice(args) {
  var a = Object.assign({ key: key(), customer: CUST_A, pet: PET_A1, booking: null,
    lines: [{ service_id: SVC_GROOM, quantity: 1 }], dtype: "amount", dvalue: 0, due: null, notes: null, payments: [] }, args || {});
  var r = await db.query("select public.pet_create_invoice($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb) as id",
    [a.key, a.customer, a.pet, a.booking, JSON.stringify(a.lines), a.dtype, a.dvalue, a.due, a.notes, JSON.stringify(a.payments)]);
  return r.rows[0].id;
}
async function inv(id) { return (await db.query("select * from public.pet_invoices where id=$1", [id])).rows[0]; }
async function pay(id, method, amount, ref) {
  return (await db.query("select public.pet_record_payment($1,$2,$3,$4) as s", [id, method, amount, ref === undefined ? null : ref])).rows[0].s;
}
async function voidIt(id, reason) { return (await db.query("select public.pet_void_invoice($1,$2) as s", [id, reason])).rows[0].s; }
async function booking(status) {
  var start = at(3 + keyN, 9); var end = new Date(start.getTime() + 3600000);
  var id = (await db.query("select public.pet_create_booking($1,$2,null,$3,$4,$5::uuid[],false,null) as id", [CUST_A, PET_A1, start.toISOString(), end.toISOString(), [SVC_GROOM]])).rows[0].id;
  keyN += 1;
  var path = { "checked-in": ["checked-in"], "in-progress": ["checked-in", "in-progress"], completed: ["checked-in", "in-progress", "completed"], confirmed: [] }[status] || [];
  for (var s of path) await db.query("select public.pet_set_booking_status($1,$2)", [id, s]);
  return id;
}
async function setTax(salon, enabled, rate) { await db.query("update public.salon_settings set tax_enabled=$2, tax_rate=$3 where salon_id=$1", [salon, enabled, rate]); }

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
    create function public.auth_salon_id() returns uuid language sql stable
      as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    grant usage on schema public to anon, authenticated;
  `);
  for (var f of ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql",
    "087_pet_audit_log.sql", "088_pet_bookings.sql", "090_pet_invoices.sql"]) { await db.exec(sql(f)); }
  await db.exec(`
    insert into public.salons values ('${A}','A'),('${B}','B');
    insert into public.salon_settings (salon_id) values ('${A}'),('${B}');
    insert into public.customers values ('${CUST_A}','${A}','Ann'),('${CUST_A2}','${A}','Cy'),('${CUST_B}','${B}','Bob');
    insert into public.staff values ('${STAFF_A1}','${A}','G1',true);
    insert into public.pet_pets (id, salon_id, customer_id, name, species) values
      ('${PET_A1}','${A}','${CUST_A}','Rex','Dog'), ('${PET_A2}','${A}','${CUST_A}','Tom','Cat'), ('${PET_B}','${B}','${CUST_B}','Bo','Dog');
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, species, active) values
      ('${SVC_GROOM}','${A}','Full groom','Grooming',60,1500,'{}',true),
      ('${SVC_NIGHT}','${A}','Night stay','Boarding',null,2000,'{}',true),
      ('${SVC_OFF}','${A}','Retired','Grooming',30,100,'{}',false),
      ('${SVC_B}','${B}','Bath','Grooming',60,900,'{}',true);
  `);
}, 60000);

beforeEach(async function () {
  await db.exec("delete from public.pet_payments; delete from public.pet_invoice_lines; delete from public.pet_invoices; delete from public.pet_bookings");
  await db.exec("update public.salon_settings set next_invoice_number = 1, tax_enabled = false, tax_rate = 16");
  await as(A);
});

describe("migration 090 against a real Postgres engine", function () {
  it("issues an invoice with totals worked out from the catalogue, never from the caller", async function () {
    var id = await invoice({ lines: [{ service_id: SVC_GROOM, quantity: 1 }, { service_id: SVC_NIGHT, quantity: 3 }] });
    var i = await inv(id);
    expect(i.invoice_number).toBe("INV-0001");
    expect(i.status).toBe("issued");
    expect([i.subtotal, i.discount_amount, i.total, i.amount_paid]).toEqual([7500, 0, 7500, 0]);
    var lines = (await db.query("select description, quantity, unit_price, line_total from public.pet_invoice_lines where invoice_id=$1 order by description", [id])).rows;
    expect(lines).toEqual([{ description: "Full groom", quantity: 1, unit_price: 1500, line_total: 1500 }, { description: "Night stay", quantity: 3, unit_price: 2000, line_total: 6000 }]);
  });

  it("ignores any price a caller tries to slip into a line", async function () {
    var id = await invoice({ lines: [{ service_id: SVC_GROOM, quantity: 1, price: 1, unit_price: 1, line_total: 1 }] });
    expect((await inv(id)).total).toBe(1500);
  });

  it("keeps a service's price on an invoice even after the catalogue changes", async function () {
    var id = await invoice();
    await db.exec(`update public.pet_services set price = 9999 where id = '${SVC_GROOM}'`);
    var l = (await db.query("select unit_price from public.pet_invoice_lines where invoice_id=$1", [id])).rows[0];
    expect(l.unit_price).toBe(1500);
    await db.exec(`update public.pet_services set price = 1500 where id = '${SVC_GROOM}'`);
  });

  it("numbers invoices sequentially, even when created at the same time", async function () {
    var ids = await Promise.all([invoice(), invoice(), invoice(), invoice()]);
    var numbers = (await Promise.all(ids.map(inv))).map(function (i) { return i.invoice_number; }).sort();
    expect(numbers).toEqual(["INV-0001", "INV-0002", "INV-0003", "INV-0004"]);
    expect((await db.query("select next_invoice_number n from public.salon_settings where salon_id=$1", [A])).rows[0].n).toBe(5);
  });

  it("numbers each business separately", async function () {
    await invoice(); await invoice();
    await as(B);
    var id = await invoice({ customer: CUST_B, pet: PET_B, lines: [{ service_id: SVC_B, quantity: 1 }] });
    expect((await inv(id)).invoice_number).toBe("INV-0001");
  });

  it("returns the same invoice when the same key is sent again, and uses one number", async function () {
    var k = key();
    var first = await invoice({ key: k });
    var second = await invoice({ key: k });
    expect(second).toBe(first);
    expect((await db.query("select count(*)::int n from public.pet_invoices")).rows[0].n).toBe(1);
    expect((await db.query("select next_invoice_number n from public.salon_settings where salon_id=$1", [A])).rows[0].n).toBe(2);
  });

  it("applies an amount or a percent discount and rejects invalid ones without using a number", async function () {
    expect((await inv(await invoice({ dvalue: 500 }))).total).toBe(1000);
    var p = await inv(await invoice({ dtype: "percent", dvalue: 10 }));
    expect([p.discount_amount, p.total]).toEqual([150, 1350]);
    await expect(invoice({ dvalue: 1501 })).rejects.toThrow(/INVALID_DISCOUNT/);
    await expect(invoice({ dtype: "percent", dvalue: 101 })).rejects.toThrow(/INVALID_DISCOUNT/);
    await expect(invoice({ dvalue: -1 })).rejects.toThrow(/INVALID_DISCOUNT/);
    await expect(invoice({ dtype: "bogus", dvalue: 1 })).rejects.toThrow(/INVALID_DISCOUNT/);
    expect((await db.query("select next_invoice_number n from public.salon_settings where salon_id=$1", [A])).rows[0].n).toBe(3);
  });

  it("treats prices as VAT inclusive and records the rate used", async function () {
    await setTax(A, true, 16);
    var i = await inv(await invoice({ lines: [{ service_id: SVC_NIGHT, quantity: 1 }], dvalue: 840 }));
    expect([i.total, i.tax_enabled, i.tax_rate, i.tax_amount]).toEqual([1160, true, 16, 160]);
    await setTax(A, false, 16);
    var j = await inv(await invoice());
    expect([j.tax_enabled, j.tax_rate, j.tax_amount]).toEqual([false, 0, 0]);
  });

  it("records payments taken at checkout and sets the status from them", async function () {
    var paid = await inv(await invoice({ payments: [{ method: "cash", amount: 1000 }, { method: "mpesa", amount: 500, reference: "QWE1" }] }));
    expect([paid.status, paid.amount_paid]).toEqual(["paid", 1500]);
    expect(paid.paid_at).not.toBeNull();
    var part = await inv(await invoice({ payments: [{ method: "cash", amount: 400 }] }));
    expect([part.status, part.amount_paid, part.paid_at]).toEqual(["partial", 400, null]);
    var free = await inv(await invoice({ dvalue: 1500 }));
    expect([free.total, free.status]).toEqual([0, "paid"]);
  });

  it("refuses a payment above the total at checkout and keeps nothing", async function () {
    await expect(invoice({ payments: [{ method: "cash", amount: 1000 }, { method: "card", amount: 600 }] })).rejects.toThrow(/OVERPAYMENT/);
    expect((await db.query("select count(*)::int n from public.pet_invoices")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from public.pet_payments")).rows[0].n).toBe(0);
    expect((await db.query("select next_invoice_number n from public.salon_settings where salon_id=$1", [A])).rows[0].n).toBe(1);
  });

  it("refuses bad payments and bad lines", async function () {
    await expect(invoice({ payments: [{ method: "bitcoin", amount: 100 }] })).rejects.toThrow(/INVALID_PAYMENT/);
    await expect(invoice({ payments: [{ method: "cash", amount: 0 }] })).rejects.toThrow(/INVALID_PAYMENT/);
    await expect(invoice({ payments: [{ method: "cash", amount: "abc" }] })).rejects.toThrow(/INVALID_PAYMENT/);
    await expect(invoice({ lines: [] })).rejects.toThrow(/INVALID_LINES/);
    await expect(invoice({ lines: [{ service_id: SVC_GROOM, quantity: 0 }] })).rejects.toThrow(/INVALID_LINES/);
    await expect(invoice({ lines: [{ service_id: SVC_GROOM, quantity: 101 }] })).rejects.toThrow(/INVALID_LINES/);
    await expect(invoice({ lines: [{ service_id: "not-a-uuid", quantity: 1 }] })).rejects.toThrow(/INVALID_LINES/);
    await expect(invoice({ lines: [{ service_id: SVC_OFF, quantity: 1 }] })).rejects.toThrow(/SERVICE_NOT_FOUND/);
  });

  it("takes later payments, moves partial to paid, and never lets the total be exceeded", async function () {
    var id = await invoice();
    expect(await pay(id, "cash", 500)).toBe("partial");
    await expect(pay(id, "cash", 1100)).rejects.toThrow(/OVERPAYMENT/);
    expect(await pay(id, "mpesa", 1000, "ABC999")).toBe("paid");
    var i = await inv(id);
    expect([i.status, i.amount_paid]).toEqual(["paid", 1500]);
    await expect(pay(id, "cash", 1)).rejects.toThrow(/INVOICE_NOT_PAYABLE/);
  });

  it("derives the paid amount from the payment rows", async function () {
    var id = await invoice();
    await pay(id, "cash", 300); await pay(id, "card", 200);
    var sum = (await db.query("select sum(amount)::int s from public.pet_payments where invoice_id=$1", [id])).rows[0].s;
    expect((await inv(id)).amount_paid).toBe(sum);
  });

  it("counts a repeated M-Pesa code once, whatever the spacing or case", async function () {
    var id = await invoice({ lines: [{ service_id: SVC_NIGHT, quantity: 2 }] });
    await pay(id, "mpesa", 1000, "QWE123");
    await expect(pay(id, "mpesa", 1000, " qwe123 ")).rejects.toThrow(/DUPLICATE_PAYMENT_REFERENCE/);
    expect((await inv(id)).amount_paid).toBe(1000);
    await pay(id, "cash", 500, "QWE123"); // a different method may reuse the text
    await pay(id, "cash", 500); await pay(id, "cash", 500); // no reference: never a duplicate
    expect((await inv(id)).amount_paid).toBe(2500);
  });

  it("rejects an invalid payment method or amount on a later payment", async function () {
    var id = await invoice();
    await expect(pay(id, "bitcoin", 100)).rejects.toThrow(/INVALID_PAYMENT/);
    await expect(pay(id, "cash", 0)).rejects.toThrow(/INVALID_PAYMENT/);
    await expect(pay(id, "cash", -5)).rejects.toThrow(/INVALID_PAYMENT/);
  });

  it("voids an unpaid invoice with a reason, keeps its number, and refuses to void twice", async function () {
    var id = await invoice();
    await expect(voidIt(id, "  ")).rejects.toThrow(/REASON_REQUIRED/);
    expect(await voidIt(id, "Entered in error")).toBe("void");
    var i = await inv(id);
    expect([i.status, i.void_reason, i.invoice_number]).toEqual(["void", "Entered in error", "INV-0001"]);
    expect(i.voided_at).not.toBeNull();
    await expect(voidIt(id, "again")).rejects.toThrow(/INVOICE_NOT_VOIDABLE/);
    await expect(pay(id, "cash", 100)).rejects.toThrow(/INVOICE_NOT_PAYABLE/);
  });

  it("will not void an invoice that has any payment", async function () {
    var id = await invoice();
    await pay(id, "cash", 100);
    await expect(voidIt(id, "oops")).rejects.toThrow(/INVOICE_HAS_PAYMENTS/);
    var paid = await invoice({ payments: [{ method: "cash", amount: 1500 }] });
    await expect(voidIt(paid, "oops")).rejects.toThrow(/INVOICE_HAS_PAYMENTS/);
  });

  it("invoices a booking once, frees it when the invoice is voided, and needs a started visit", async function () {
    var done = await booking("completed");
    var id = await invoice({ booking: done });
    expect((await inv(id)).pet_id).toBe(PET_A1);
    await expect(invoice({ booking: done })).rejects.toThrow(/BOOKING_ALREADY_INVOICED/);
    await voidIt(id, "wrong services");
    var again = await invoice({ booking: done });
    expect(again).not.toBe(id);
    await expect(invoice({ booking: await booking("confirmed") })).rejects.toThrow(/BOOKING_NOT_READY/);
    expect((await inv(await invoice({ booking: await booking("checked-in") }))).status).toBe("issued");
    expect((await inv(await invoice({ booking: await booking("in-progress") }))).status).toBe("issued");
  });

  it("will not mix businesses or customers", async function () {
    var mine = await invoice();
    await expect(invoice({ customer: CUST_B, pet: PET_B, lines: [{ service_id: SVC_B, quantity: 1 }] })).rejects.toThrow(/CUSTOMER_NOT_FOUND/);
    await expect(invoice({ pet: PET_B })).rejects.toThrow(/PET_NOT_FOUND/);
    await expect(invoice({ customer: CUST_A2, pet: PET_A1 })).rejects.toThrow(/PET_NOT_FOUND/); // another customer's pet
    await expect(invoice({ lines: [{ service_id: SVC_B, quantity: 1 }] })).rejects.toThrow(/SERVICE_NOT_FOUND/);
    await as(B);
    await expect(pay(mine, "cash", 100)).rejects.toThrow(/INVOICE_NOT_FOUND/);
    await expect(voidIt(mine, "x")).rejects.toThrow(/INVOICE_NOT_FOUND/);
    await expect(invoice({ customer: CUST_B, pet: PET_B, booking: await (async function () { await as(A); var b = await booking("completed"); await as(B); return b; })(), lines: [{ service_id: SVC_B, quantity: 1 }] })).rejects.toThrow(/BOOKING_NOT_FOUND/);
  });

  it("requires a signed-in business and a key", async function () {
    await as(null);
    await expect(invoice()).rejects.toThrow(/NOT_AUTHENTICATED/);
    await as(A);
    await expect(invoice({ key: null })).rejects.toThrow(/INVALID_KEY/);
  });

  it("explains a missing settings row instead of guessing", async function () {
    await db.exec(`delete from public.salon_settings where salon_id = '${B}'`);
    await as(B);
    await expect(invoice({ customer: CUST_B, pet: PET_B, lines: [{ service_id: SVC_B, quantity: 1 }] })).rejects.toThrow(/SETTINGS_MISSING/);
    await db.exec(`insert into public.salon_settings (salon_id) values ('${B}')`);
  });

  it("gives the signed-in app read-only access, scoped to its own business", async function () {
    await invoice(); await as(B);
    await invoice({ customer: CUST_B, pet: PET_B, lines: [{ service_id: SVC_B, quantity: 1 }] }); await as(A);
    await db.exec("set role authenticated");
    try {
      expect((await db.query("select salon_id from public.pet_invoices")).rows.map(function (r) { return r.salon_id; })).toEqual([A]);
      expect((await db.query("select salon_id from public.pet_invoice_lines")).rows.every(function (r) { return r.salon_id === A; })).toBe(true);
      await expect(db.query("update public.pet_invoices set total = 1")).rejects.toThrow(/permission denied/i);
      await expect(db.query("update public.pet_invoices set status = 'paid'")).rejects.toThrow(/permission denied/i);
      await expect(db.query("delete from public.pet_invoices")).rejects.toThrow(/permission denied/i);
      await expect(db.query("insert into public.pet_payments (salon_id, invoice_id, method, amount) select salon_id, id, 'cash', 1 from public.pet_invoices")).rejects.toThrow(/permission denied/i);
      await expect(db.query("delete from public.pet_payments")).rejects.toThrow(/permission denied/i);
      await expect(db.query("update public.pet_payments set amount = 1")).rejects.toThrow(/permission denied/i);
      await expect(db.query("delete from public.pet_invoice_lines")).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("keeps anonymous visitors out entirely", async function () {
    var id = await invoice();
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.pet_invoices")).rejects.toThrow(/permission denied/i);
      await expect(db.query("select * from public.pet_payments")).rejects.toThrow(/permission denied/i);
      await expect(db.query("select public.pet_record_payment($1,'cash',1,null)", [id])).rejects.toThrow(/permission denied/i);
      await expect(db.query("select public.pet_void_invoice($1,'x')", [id])).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("rejects an inconsistent invoice even if something wrote it directly", async function () {
    var id = await invoice();
    await expect(db.exec(`update public.pet_invoices set status = 'paid' where id = '${id}'`)).rejects.toThrow(/pet_invoices_status_ok|check constraint/i);
    await expect(db.exec(`update public.pet_invoices set total = 1 where id = '${id}'`)).rejects.toThrow(/pet_invoices_totals_ok|check constraint/i);
    await expect(db.exec(`update public.pet_invoices set status = 'void' where id = '${id}'`)).rejects.toThrow(/pet_invoices_void_ok|check constraint/i);
  });

  it("writes an audit row for invoices and payments", async function () {
    var id = await invoice(); await pay(id, "cash", 100);
    var tables = (await db.query("select distinct table_name from public.pet_audit_log where table_name in ('pet_invoices','pet_invoice_lines','pet_payments') order by 1")).rows;
    expect(tables.map(function (t) { return t.table_name; })).toEqual(["pet_invoice_lines", "pet_invoices", "pet_payments"]);
  });

  it("protects invoice history: a customer, pet, booking or sold service cannot be deleted from under an invoice", async function () {
    var done = await booking("completed");
    await invoice({ booking: done });
    await expect(db.query("delete from public.customers where id=$1", [CUST_A])).rejects.toThrow(/foreign key|violates/i);
    await expect(db.query("delete from public.pet_services where id=$1", [SVC_GROOM])).rejects.toThrow(/foreign key|violates/i);
    await expect(db.query("delete from public.pet_bookings where id=$1", [done])).rejects.toThrow(/foreign key|violates/i);
  });
});
