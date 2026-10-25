// @vitest-environment node
//
// Behavioural test of migration 094 (supplies and inventory) against a REAL
// Postgres engine (PGlite, in process), reusing the approach of
// migration088.db.test.js. It applies the repo's real migrations and tries to
// break the stock functions: going below zero, doubling a receipt, editing the
// quantity or the ledger directly, mixing businesses, retail vs consumables.
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

function start(d) { var s = new Date(Date.now() + (d + 2) * 86400000); s.setUTCHours(6, 0, 0, 0); return s; }
async function bookingId() {
  var s = start(keyN + 1); var e = new Date(s.getTime() + 3600000); keyN += 1;
  return (await db.query("select public.pet_create_booking($1,$2,null,$3,$4,$5::uuid[],false,null) as id", [CUST_A, PET_A1, s.toISOString(), e.toISOString(), [SVC_GROOM]])).rows[0].id;
}
async function qty(id) { return (await db.query("select quantity_on_hand q from public.pet_items where id=$1", [id])).rows[0].q; }
async function adjust(id, change, reason, note) { return (await db.query("select public.pet_adjust_stock($1,$2,$3,$4) as q", [id, change, reason, note === undefined ? null : note])).rows[0].q; }
async function receive(lines, extra) {
  var a = Object.assign({ key: key(), supplier: SUP_A, ref: "DN-1", note: null }, extra || {});
  return (await db.query("select public.pet_receive_stock($1,$2,$3,$4,$5::jsonb) as id", [a.key, a.supplier, a.ref, a.note, JSON.stringify(lines)])).rows[0].id;
}
async function use(items, booking) { return (await db.query("select public.pet_use_supplies($1,$2::jsonb) as n", [booking || null, JSON.stringify(items)])).rows[0].n; }
async function ledgerSum(id) { return (await db.query("select coalesce(sum(change_qty),0)::int s from public.pet_stock_movements where item_id=$1", [id])).rows[0].s; }

beforeAll(async function () {
  await setupDb(["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql",
    "087_pet_audit_log.sql", "088_pet_bookings.sql", "094_pet_supplies.sql"]);
}, 60000);

beforeEach(async function () {
  await db.exec("alter table public.pet_stock_movements disable trigger pet_stock_movements_no_change");
  await db.exec("delete from public.pet_purchase_lines; delete from public.pet_purchases; delete from public.pet_stock_movements; update public.pet_items set quantity_on_hand = 0, cost = case id when '" + FOOD + "' then 800 when '" + SHAMPOO + "' then 2 else 100 end");
  await db.exec("alter table public.pet_stock_movements enable trigger pet_stock_movements_no_change");
  await as(A);
});

describe("migration 094 against a real Postgres engine", function () {
  it("sets opening stock once and records it in the ledger with the quantity after", async function () {
    expect(await adjust(FOOD, 20, "opening", null)).toBe(20);
    var m = (await db.query("select change_qty, quantity_after, reason from public.pet_stock_movements where item_id=$1", [FOOD])).rows;
    expect(m).toEqual([{ change_qty: 20, quantity_after: 20, reason: "opening" }]);
    await expect(adjust(FOOD, 5, "opening", null)).rejects.toThrow(/OPENING_NOT_ALLOWED/);
    await expect(adjust(TOY, -3, "opening", null)).rejects.toThrow(/INVALID_ADJUSTMENT/);
  });

  it("needs a note for a count correction, and validates reasons and direction", async function () {
    await adjust(FOOD, 10, "opening", null);
    await expect(adjust(FOOD, -1, "adjustment", "  ")).rejects.toThrow(/NOTE_REQUIRED/);
    expect(await adjust(FOOD, -1, "adjustment", "Recount")).toBe(9);
    expect(await adjust(FOOD, -2, "damaged", null)).toBe(7);
    expect(await adjust(FOOD, -1, "expired", null)).toBe(6);
    await expect(adjust(FOOD, 3, "damaged", null)).rejects.toThrow(/INVALID_ADJUSTMENT/);
    await expect(adjust(FOOD, 0, "adjustment", "x")).rejects.toThrow(/INVALID_ADJUSTMENT/);
    await expect(adjust(FOOD, 1, "sale", "x")).rejects.toThrow(/INVALID_ADJUSTMENT/);
    await expect(adjust(FOOD, 1, "purchase", "x")).rejects.toThrow(/INVALID_ADJUSTMENT/);
  });

  it("never lets stock go below zero and leaves everything unchanged when it refuses", async function () {
    await adjust(FOOD, 3, "opening", null);
    await expect(adjust(FOOD, -4, "adjustment", "too many")).rejects.toThrow(/INSUFFICIENT_STOCK/);
    expect(await qty(FOOD)).toBe(3);
    expect((await db.query("select count(*)::int n from public.pet_stock_movements where item_id=$1", [FOOD])).rows[0].n).toBe(1);
  });

  it("receives stock from a supplier: quantities, cost, total and ledger", async function () {
    var id = await receive([{ item_id: FOOD, quantity: 12, unit_cost: 850 }, { item_id: SHAMPOO, quantity: 2000 }], { ref: "DN-77" });
    expect(await qty(FOOD)).toBe(12); expect(await qty(SHAMPOO)).toBe(2000);
    var p = (await db.query("select total_cost, reference, supplier_id from public.pet_purchases where id=$1", [id])).rows[0];
    expect(p).toEqual({ total_cost: 12 * 850, reference: "DN-77", supplier_id: SUP_A });
    expect((await db.query("select cost from public.pet_items where id=$1", [FOOD])).rows[0].cost).toBe(850);
    expect((await db.query("select cost from public.pet_items where id=$1", [SHAMPOO])).rows[0].cost).toBe(2); // no cost sent: unchanged
    var mv = (await db.query("select reason, reference_type, reference_id from public.pet_stock_movements where item_id=$1", [FOOD])).rows[0];
    expect(mv).toEqual({ reason: "purchase", reference_type: "purchase", reference_id: id });
    expect((await db.query("select count(*)::int n from public.pet_purchase_lines where purchase_id=$1", [id])).rows[0].n).toBe(2);
  });

  it("counts a receipt once when the same key is sent again", async function () {
    var k = key();
    var a = await receive([{ item_id: FOOD, quantity: 5 }], { key: k });
    var b = await receive([{ item_id: FOOD, quantity: 5 }], { key: k });
    expect(b).toBe(a); expect(await qty(FOOD)).toBe(5);
    expect((await db.query("select count(*)::int n from public.pet_purchases")).rows[0].n).toBe(1);
  });

  it("is all or nothing, and rejects bad receipts", async function () {
    await expect(receive([{ item_id: FOOD, quantity: 5 }, { item_id: "17e30000-0000-0000-0000-0000000000ff", quantity: 1 }])).rejects.toThrow(/ITEM_NOT_FOUND/);
    expect(await qty(FOOD)).toBe(0);
    expect((await db.query("select count(*)::int n from public.pet_purchases")).rows[0].n).toBe(0);
    await expect(receive([{ item_id: FOOD, quantity: 0 }])).rejects.toThrow(/INVALID_LINES/);
    await expect(receive([{ item_id: FOOD, quantity: 1.5 }])).rejects.toThrow(/INVALID_LINES/);
    await expect(receive([{ item_id: FOOD, quantity: 1 }, { item_id: FOOD, quantity: 2 }])).rejects.toThrow(/INVALID_LINES/);
    await expect(receive([{ item_id: FOOD, quantity: 1, unit_cost: -5 }])).rejects.toThrow(/INVALID_LINES/);
    await expect(receive([])).rejects.toThrow(/INVALID_LINES/);
    await expect(receive([{ item_id: "nope", quantity: 1 }])).rejects.toThrow(/INVALID_LINES/);
    await expect(receive([{ item_id: FOOD, quantity: 1 }], { key: null })).rejects.toThrow(/INVALID_KEY/);
  });

  it("records consumables used, optionally against a booking, and keeps retail apart", async function () {
    await receive([{ item_id: SHAMPOO, quantity: 1000 }, { item_id: FOOD, quantity: 5 }]);
    var b = await bookingId();
    expect(await use([{ item_id: SHAMPOO, quantity: 50 }], b)).toBe(1);
    expect(await qty(SHAMPOO)).toBe(950);
    var mv = (await db.query("select reason, reference_type, reference_id from public.pet_stock_movements where item_id=$1 and reason='used'", [SHAMPOO])).rows[0];
    expect(mv).toEqual({ reason: "used", reference_type: "booking", reference_id: b });
    await use([{ item_id: SHAMPOO, quantity: 10 }], null);
    expect(await qty(SHAMPOO)).toBe(940);
    await expect(use([{ item_id: FOOD, quantity: 1 }])).rejects.toThrow(/NOT_A_CONSUMABLE/);
    await expect(use([{ item_id: SHAMPOO, quantity: 5000 }])).rejects.toThrow(/INSUFFICIENT_STOCK/);
    expect(await qty(SHAMPOO)).toBe(940);
    await expect(use([{ item_id: SHAMPOO, quantity: 1 }], "e0000000-0000-0000-0000-0000000000ee")).rejects.toThrow(/BOOKING_NOT_FOUND/);
    // a failing second line undoes the first
    await expect(use([{ item_id: SHAMPOO, quantity: 10 }, { item_id: SHAMPOO, quantity: 99999 }])).rejects.toThrow(/INSUFFICIENT_STOCK/);
    expect(await qty(SHAMPOO)).toBe(940);
  });

  it("keeps the quantity equal to the ledger total after a mix of changes", async function () {
    await adjust(FOOD, 10, "opening", null);
    await receive([{ item_id: FOOD, quantity: 6 }]);
    await adjust(FOOD, -3, "adjustment", "count");
    await adjust(FOOD, -2, "damaged", null);
    expect(await qty(FOOD)).toBe(11);
    expect(await ledgerSum(FOOD)).toBe(11);
    var last = (await db.query("select quantity_after q from public.pet_stock_movements where item_id=$1 order by created_at desc, id limit 1", [FOOD])).rows[0].q;
    expect(typeof last).toBe("number");
  });

  it("never mixes businesses", async function () {
    await expect(adjust(FOOD_B, 5, "opening", null)).rejects.toThrow(/ITEM_NOT_FOUND/);
    await expect(receive([{ item_id: FOOD_B, quantity: 1 }])).rejects.toThrow(/ITEM_NOT_FOUND/);
    await expect(receive([{ item_id: FOOD, quantity: 1 }], { supplier: SUP_B })).rejects.toThrow(/SUPPLIER_NOT_FOUND/);
    await expect(use([{ item_id: FOOD_B, quantity: 1 }])).rejects.toThrow(/ITEM_NOT_FOUND/);
    await as(null);
    await expect(adjust(FOOD, 1, "opening", null)).rejects.toThrow(/NOT_AUTHENTICATED/);
  });

  it("serialises two sales of the last unit: one wins, one is refused", async function () {
    await adjust(TOY, 1, "opening", null);
    var results = await Promise.allSettled([adjust(TOY, -1, "adjustment", "a"), adjust(TOY, -1, "adjustment", "b")]);
    expect(results.filter(function (r) { return r.status === "fulfilled"; }).length).toBe(1);
    expect(await qty(TOY)).toBe(0);
  });

  it("lets the signed-in app add and edit items but never touch the quantity or the ledger", async function () {
    await adjust(FOOD, 4, "opening", null);
    await db.exec("set role authenticated");
    try {
      await db.query("insert into public.pet_items (salon_id, kind, name, price, unit) values ($1,'retail','Leash',900,'each')", [A]);
      await db.query("update public.pet_items set price = 1300, reorder_level = 7 where id = $1", [FOOD]);
      await expect(db.query("update public.pet_items set quantity_on_hand = 999 where id = $1", [FOOD])).rejects.toThrow(/permission denied/i);
      await expect(db.query("insert into public.pet_items (salon_id, name, price, quantity_on_hand) values ($1,'Cheat',1,50)", [A])).rejects.toThrow(/permission denied/i);
      await expect(db.query("delete from public.pet_items where id = $1", [FOOD])).rejects.toThrow(/permission denied/i);
      await expect(db.query("update public.pet_items set salon_id = $2 where id = $1", [FOOD, B])).rejects.toThrow(/permission denied/i);
      await expect(db.query("insert into public.pet_stock_movements (salon_id, item_id, change_qty, quantity_after, reason) values ($1,$2,1,5,'adjustment')", [A, FOOD])).rejects.toThrow(/permission denied/i);
      await expect(db.query("delete from public.pet_stock_movements")).rejects.toThrow(/permission denied/i);
      await expect(db.query("insert into public.pet_purchases (salon_id, idempotency_key) values ($1,$2)", [A, key()])).rejects.toThrow(/permission denied/i);
      await expect(db.query("select public.pet_apply_stock($1,$2,5,'adjustment',null,null,null)", [A, FOOD])).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
    expect(await qty(FOOD)).toBe(4);
  });

  it("scopes what the app can read and write to its own business", async function () {
    await db.exec("set role authenticated");
    try {
      expect((await db.query("select salon_id from public.pet_items")).rows.every(function (r) { return r.salon_id === A; })).toBe(true);
      await expect(db.query("insert into public.pet_items (salon_id, name, price) values ($1,'Sneaky',1)", [B])).rejects.toThrow(/row-level security/i);
      await expect(db.query("insert into public.pet_items (salon_id, name, price, supplier_id) values ($1,'Sneaky',1,$2)", [A, SUP_B])).rejects.toThrow(/row-level security/i);
      await expect(db.query("insert into public.pet_suppliers (salon_id, name) values ($1,'Sneaky')", [B])).rejects.toThrow(/row-level security/i);
      var upd = await db.query("update public.pet_items set price = 1 where id = $1", [FOOD_B]);
      expect(upd.affectedRows).toBe(0);
    } finally { await db.exec("reset role"); }
  });

  it("keeps anonymous visitors out", async function () {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.pet_items")).rejects.toThrow(/permission denied/i);
      await expect(db.query("select public.pet_adjust_stock($1,1,'opening',null)", [FOOD])).rejects.toThrow(/permission denied/i);
      await expect(db.query("select public.pet_receive_stock($1,null,null,null,'[]')", [key()])).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("enforces item rules in the table: retail needs a price, names and SKUs are unique", async function () {
    await expect(db.exec(`insert into public.pet_items (salon_id, kind, name) values ('${A}','retail','No price')`)).rejects.toThrow(/pet_items_retail_has_price/);
    await expect(db.exec(`insert into public.pet_items (salon_id, kind, name, price) values ('${A}','retail',' dog FOOD 2kg ',1)`)).rejects.toThrow(/pet_items_salon_kind_name_uidx|unique/i);
    await expect(db.exec(`insert into public.pet_items (salon_id, kind, name, price, sku) values ('${A}','retail','Other',1,' df-2 ')`)).rejects.toThrow(/pet_items_salon_sku_uidx|unique/i);
    await db.exec(`insert into public.pet_items (salon_id, kind, name) values ('${A}','consumable','Gloves')`); // consumables need no price
    await expect(db.exec(`update public.pet_items set quantity_on_hand = -1 where id = '${FOOD}'`)).rejects.toThrow(/check constraint|quantity_on_hand/i);
  });

  it("makes the ledger append-only, even for the owner", async function () {
    await adjust(FOOD, 4, "opening", null);
    await expect(db.exec("update public.pet_stock_movements set change_qty = 99")).rejects.toThrow(/append-only/);
    await expect(db.exec("delete from public.pet_stock_movements")).rejects.toThrow(/append-only/);
  });

  it("does not block removing a whole business because of its own stock history", async function () {
    // NOTE: the audit triggers from migration 087 currently stop ANY pet business with
    // pet data from being deleted (they try to log a row for the business that is
    // being removed). That is separate from this ledger, so they are switched off
    // here to check that the ledger's own append-only rule lets a cascade through.
    await as(B);
    await adjust(FOOD_B, 3, "opening", null);
    var audited = (await db.query("select c.relname t, tg.tgname n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid where tg.tgname like '%\\_audit' and not tg.tgisinternal")).rows;
    for (var a of audited) await db.exec('alter table public.' + a.t + ' disable trigger ' + a.n);
    try {
      await db.exec(`delete from public.salons where id = '${B}'`);
    } finally {
      for (var b of audited) await db.exec('alter table public.' + b.t + ' enable trigger ' + b.n);
    }
    expect((await db.query("select count(*)::int n from public.pet_stock_movements where salon_id=$1", [B])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from public.pet_items where salon_id=$1", [B])).rows[0].n).toBe(0);
  });

  it("audits stock changes", async function () {
    await adjust(FOOD, 4, "opening", null);
    var t = (await db.query("select distinct table_name from public.pet_audit_log where table_name in ('pet_items','pet_stock_movements') order by 1")).rows.map(function (r) { return r.table_name; });
    expect(t).toEqual(["pet_items", "pet_stock_movements"]);
  });
});
