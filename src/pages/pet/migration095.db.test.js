// @vitest-environment node
//
// Behavioural test of migration 095 (retail products on invoices) against a REAL
// Postgres engine (PGlite, in process). It applies the repo's real migrations
// 083-088, 090 and 094-095 and checks that selling products takes stock out safely,
// refuses to oversell, undoes everything when a sale fails, and puts stock back
// when an unpaid invoice is voided, while service-only invoices still behave as
// before.
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
    insert into public.salon_settings (salon_id) values ('${A}'),('${B}');
    insert into public.customers values ('${CUST_A}','${A}','Ann'),('${CUST_B}','${B}','Bob');
    insert into public.staff values ('${STAFF_A1}','${A}','G1',true);
    insert into public.pet_pets (id, salon_id, customer_id, name, species) values
      ('${PET_A1}','${A}','${CUST_A}','Rex','Dog'), ('${PET_B}','${B}','${CUST_B}','Bo','Dog');
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, species, active) values
      ('${SVC_GROOM}','${A}','Full groom','Grooming',60,1500,'{}',true),
      ('${SVC_B}','${B}','Bath','Grooming',60,900,'{}',true);
    insert into public.pet_suppliers (id, salon_id, name) values ('${SUP_A}','${A}','PetCo'), ('${SUP_B}','${B}','OtherCo');
    insert into public.pet_items (id, salon_id, kind, name, sku, unit, price, cost, reorder_level, supplier_id) values
      ('${SHAMPOO}','${A}','consumable','Shampoo','SH-1','ml',null,2,500,'${SUP_A}'),
      ('${FOOD}','${A}','retail','Dog food 2kg','DF-2','each',1200,800,5,'${SUP_A}'),
      ('${TOY}','${A}','retail','Rope toy',null,'each',300,100,2,null),
      ('${FOOD_B}','${B}','retail','Cat litter','CL-1','each',700,400,1,null);
  `);
}

async function invoice(args) {
  var a = Object.assign({ key: key(), customer: CUST_A, pet: PET_A1, lines: [{ service_id: SVC_GROOM, quantity: 1 }], dtype: "amount", dvalue: 0, payments: [] }, args || {});
  var r = await db.query("select public.pet_create_invoice($1,$2,$3,null,$4::jsonb,$5,$6,null,null,$7::jsonb) as id",
    [a.key, a.customer, a.pet, JSON.stringify(a.lines), a.dtype, a.dvalue, JSON.stringify(a.payments)]);
  return r.rows[0].id;
}
async function inv(id) { return (await db.query("select * from public.pet_invoices where id=$1", [id])).rows[0]; }
async function qty(id) { return (await db.query("select quantity_on_hand q from public.pet_items where id=$1", [id])).rows[0].q; }
async function stockUp(id, n) { return db.query("select public.pet_adjust_stock($1,$2,'opening',null)", [id, n]); }
async function nextNo() { return (await db.query("select next_invoice_number n from public.salon_settings where salon_id=$1", [A])).rows[0].n; }

beforeAll(async function () {
  await setupDb(["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql",
    "087_pet_audit_log.sql", "088_pet_bookings.sql", "090_pet_invoices.sql", "094_pet_supplies.sql", "095_pet_invoice_products.sql"]);
}, 60000);

beforeEach(async function () {
  await db.exec("alter table public.pet_stock_movements disable trigger pet_stock_movements_no_change");
  await db.exec("delete from public.pet_payments; delete from public.pet_invoice_lines; delete from public.pet_invoices; delete from public.pet_bookings; delete from public.pet_stock_movements; update public.pet_items set quantity_on_hand = 0, active = true, price = case id when '" + FOOD + "' then 1200 when '" + TOY + "' then 300 else price end");
  await db.exec("alter table public.pet_stock_movements enable trigger pet_stock_movements_no_change");
  await db.exec("update public.salon_settings set next_invoice_number = 1, tax_enabled = false");
  await as(A);
});

describe("migration 095 against a real Postgres engine", function () {
  it("sells a product with a service, takes the stock out and records the sale in the ledger", async function () {
    await stockUp(FOOD, 10);
    var id = await invoice({ lines: [{ service_id: SVC_GROOM, quantity: 1 }, { item_id: FOOD, quantity: 3 }] });
    var i = await inv(id);
    expect([i.subtotal, i.total, i.invoice_number]).toEqual([1500 + 3 * 1200, 5100, "INV-0001"]);
    expect(await qty(FOOD)).toBe(7);
    var lines = (await db.query("select description, quantity, unit_price, line_total, service_id is null as is_item, item_id from public.pet_invoice_lines where invoice_id=$1 order by description", [id])).rows;
    expect(lines).toEqual([
      { description: "Dog food 2kg", quantity: 3, unit_price: 1200, line_total: 3600, is_item: true, item_id: FOOD },
      { description: "Full groom", quantity: 1, unit_price: 1500, line_total: 1500, is_item: false, item_id: null }]);
    var mv = (await db.query("select change_qty, quantity_after, reason, reference_type, reference_id from public.pet_stock_movements where item_id=$1 and reason='sale'", [FOOD])).rows;
    expect(mv).toEqual([{ change_qty: -3, quantity_after: 7, reason: "sale", reference_type: "invoice", reference_id: id }]);
  });

  it("ignores any price the caller sends for a product, and keeps the sale price after a later change", async function () {
    await stockUp(FOOD, 5);
    var id = await invoice({ lines: [{ item_id: FOOD, quantity: 1, price: 1, unit_price: 1 }] });
    expect((await inv(id)).total).toBe(1200);
    await db.exec(`update public.pet_items set price = 5000 where id = '${FOOD}'`);
    expect((await db.query("select unit_price u from public.pet_invoice_lines where invoice_id=$1", [id])).rows[0].u).toBe(1200);
  });

  it("refuses to oversell and undoes the whole sale, including the invoice number", async function () {
    await stockUp(FOOD, 2);
    await expect(invoice({ lines: [{ service_id: SVC_GROOM, quantity: 1 }, { item_id: FOOD, quantity: 3 }] })).rejects.toThrow(/INSUFFICIENT_STOCK/);
    expect(await qty(FOOD)).toBe(2);
    expect((await db.query("select count(*)::int n from public.pet_invoices")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from public.pet_stock_movements where reason='sale'")).rows[0].n).toBe(0);
    expect(await nextNo()).toBe(1);
  });

  it("takes nothing out when a later part of the sale fails", async function () {
    await stockUp(FOOD, 5);
    await expect(invoice({ lines: [{ item_id: FOOD, quantity: 2 }], payments: [{ method: "cash", amount: 99999 }] })).rejects.toThrow(/OVERPAYMENT/);
    expect(await qty(FOOD)).toBe(5);
    expect((await db.query("select count(*)::int n from public.pet_stock_movements where reason='sale'")).rows[0].n).toBe(0);
  });

  it("takes stock out once when the same sale key is sent again", async function () {
    await stockUp(FOOD, 5);
    var k = key();
    var a = await invoice({ key: k, lines: [{ item_id: FOOD, quantity: 2 }] });
    var b = await invoice({ key: k, lines: [{ item_id: FOOD, quantity: 2 }] });
    expect(b).toBe(a); expect(await qty(FOOD)).toBe(3);
  });

  it("lets only one of two simultaneous sales take the last unit", async function () {
    await stockUp(TOY, 1);
    var r = await Promise.allSettled([invoice({ lines: [{ item_id: TOY, quantity: 1 }] }), invoice({ lines: [{ item_id: TOY, quantity: 1 }] })]);
    expect(r.filter(function (x) { return x.status === "fulfilled"; }).length).toBe(1);
    expect(await qty(TOY)).toBe(0);
  });

  it("only sells active retail products from this business", async function () {
    await stockUp(FOOD, 5); await stockUp(SHAMPOO, 5);
    await expect(invoice({ lines: [{ item_id: SHAMPOO, quantity: 1 }] })).rejects.toThrow(/ITEM_NOT_FOUND/); // consumable
    await expect(invoice({ lines: [{ item_id: FOOD_B, quantity: 1 }] })).rejects.toThrow(/ITEM_NOT_FOUND/); // other business
    await db.exec(`update public.pet_items set active = false where id = '${FOOD}'`);
    await expect(invoice({ lines: [{ item_id: FOOD, quantity: 1 }] })).rejects.toThrow(/ITEM_NOT_FOUND/);
    expect(await qty(FOOD)).toBe(5);
  });

  it("insists each line is a service or a product, not both and not neither", async function () {
    await stockUp(FOOD, 5);
    await expect(invoice({ lines: [{ service_id: SVC_GROOM, item_id: FOOD, quantity: 1 }] })).rejects.toThrow(/INVALID_LINES/);
    await expect(invoice({ lines: [{ quantity: 1 }] })).rejects.toThrow(/INVALID_LINES/);
    await expect(invoice({ lines: [{ item_id: FOOD, quantity: 0 }] })).rejects.toThrow(/INVALID_LINES/);
    await expect(invoice({ lines: [{ item_id: "nope", quantity: 1 }] })).rejects.toThrow(/INVALID_LINES/);
    await expect(db.exec(`insert into public.pet_invoice_lines (salon_id, invoice_id, service_id, item_id, description, quantity, unit_price, line_total)
      select salon_id, id, '${SVC_GROOM}', '${FOOD}', 'x', 1, 1, 1 from public.pet_invoices limit 1`)).resolves.toBeDefined(); // no invoice rows: nothing inserted
    var id = await invoice();
    await expect(db.exec(`insert into public.pet_invoice_lines (salon_id, invoice_id, service_id, item_id, description, quantity, unit_price, line_total)
      values ('${A}', '${id}', '${SVC_GROOM}', '${FOOD}', 'x', 1, 1, 1)`)).rejects.toThrow(/pet_invoice_lines_one_source/);
    await expect(db.exec(`insert into public.pet_invoice_lines (salon_id, invoice_id, description, quantity, unit_price, line_total)
      values ('${A}', '${id}', 'x', 1, 1, 1)`)).rejects.toThrow(/pet_invoice_lines_one_source/);
  });

  it("puts product stock back when an unpaid invoice is voided", async function () {
    await stockUp(FOOD, 10);
    var id = await invoice({ lines: [{ item_id: FOOD, quantity: 4 }, { service_id: SVC_GROOM, quantity: 1 }] });
    expect(await qty(FOOD)).toBe(6);
    await db.query("select public.pet_void_invoice($1,'Entered in error')", [id]);
    expect(await qty(FOOD)).toBe(10);
    var mv = (await db.query("select change_qty, reason, reference_type, reference_id from public.pet_stock_movements where reason='sale_void'")).rows;
    expect(mv).toEqual([{ change_qty: 4, reason: "sale_void", reference_type: "invoice", reference_id: id }]);
    await expect(db.query("select public.pet_void_invoice($1,'again')", [id])).rejects.toThrow(/INVOICE_NOT_VOIDABLE/);
    expect(await qty(FOOD)).toBe(10); // a second void does not return stock again
  });

  it("keeps stock out when a paid or part-paid invoice cannot be voided", async function () {
    await stockUp(FOOD, 10);
    var paid = await invoice({ lines: [{ item_id: FOOD, quantity: 2 }], payments: [{ method: "cash", amount: 2400 }] });
    await expect(db.query("select public.pet_void_invoice($1,'oops')", [paid])).rejects.toThrow(/INVOICE_HAS_PAYMENTS/);
    expect(await qty(FOOD)).toBe(8);
  });

  it("keeps the quantity equal to the ledger total across sales, voids and receipts", async function () {
    await stockUp(FOOD, 10);
    var a = await invoice({ lines: [{ item_id: FOOD, quantity: 3 }] });
    await invoice({ lines: [{ item_id: FOOD, quantity: 2 }] });
    await db.query("select public.pet_void_invoice($1,'x')", [a]);
    await db.query("select public.pet_receive_stock($1,null,null,null,$2::jsonb)", [key(), JSON.stringify([{ item_id: FOOD, quantity: 5 }])]);
    var sum = (await db.query("select sum(change_qty)::int s from public.pet_stock_movements where item_id=$1", [FOOD])).rows[0].s;
    expect(await qty(FOOD)).toBe(sum);
    expect(sum).toBe(10 - 3 - 2 + 3 + 5);
  });

  it("leaves service-only invoices working exactly as before", async function () {
    var id = await invoice({ lines: [{ service_id: SVC_GROOM, quantity: 2 }], dtype: "percent", dvalue: 10, payments: [{ method: "mpesa", amount: 1000, reference: "ZX1" }] });
    var i = await inv(id);
    expect([i.subtotal, i.discount_amount, i.total, i.status, i.amount_paid]).toEqual([3000, 300, 2700, "partial", 1000]);
    expect((await db.query("select count(*)::int n from public.pet_stock_movements")).rows[0].n).toBe(0);
  });

  it("keeps grants as they were: the app can run the functions, anonymous visitors cannot", async function () {
    var id = await invoice();
    await db.exec("set role anon");
    try {
      await expect(db.query("select public.pet_void_invoice($1,'x')", [id])).rejects.toThrow(/permission denied/i);
      await expect(db.query("select public.pet_create_invoice($1,$2,null,null,'[]','amount',0,null,null,'[]')", [key(), CUST_A])).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
    await db.exec("set role authenticated");
    try {
      await expect(db.query("update public.pet_invoice_lines set quantity = 9")).rejects.toThrow(/permission denied/i);
      expect((await db.query("select count(*)::int n from public.pet_invoice_lines")).rows[0].n).toBeGreaterThan(0);
    } finally { await db.exec("reset role"); }
  });
});
