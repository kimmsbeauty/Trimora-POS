// @vitest-environment node
//
// Behavioural test of migration 117 (invoice prefix, business phone numbers, permanent delete) against a REAL
// Postgres engine (PGlite). The platform is a minimal stand-in: only the tables and helpers 117 touches. The
// pet_refunds guard is the real one from migration 105, so the delete bypass is tested against the thing it bypasses.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var C = "cccccccc-0000-0000-0000-000000000003";
var CUST = "dddddddd-0000-0000-0000-000000000001";
var ITEM = "eeeeeeee-0000-0000-0000-000000000001";
var db;
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function one(sql, params) { return (await db.query(sql, params || [])).rows[0]; }
var n = 0;
async function mkInvoice(salon, opts) {
  opts = opts || {};
  n++;
  var next = (await one("select next_invoice_number x from public.salon_settings where salon_id=$1", [salon])).x;
  await db.query("update public.salon_settings set next_invoice_number = $2 where salon_id=$1", [salon, next + 1]);
  var id = (await one(
    "insert into public.pet_invoices (salon_id, customer_id, invoice_number, status, total, amount_paid) values ($1,$2,$3,$4,$5,$6) returning id",
    [salon, CUST, "INV-" + String(next).padStart(4, "0"), opts.status || "issued", 1000, opts.paid || 0])).id;
  if (opts.item) await db.query("insert into public.pet_invoice_lines (salon_id, invoice_id, item_id, quantity) values ($1,$2,$3,2)", [salon, id, ITEM]);
  if (opts.paid) await db.query("insert into public.pet_payments (salon_id, invoice_id, amount) values ($1,$2,$3)", [salon, id, opts.paid]);
  if (opts.refund) await db.query("insert into public.pet_refunds (salon_id, invoice_id, amount, stock_returned) values ($1,$2,$3,$4)", [salon, id, opts.refund, !!opts.stockBack]);
  return id;
}
async function numberOf(id) { return (await one("select invoice_number x from public.pet_invoices where id=$1", [id])).x; }
function del(pin, id) { return db.query("select public.pet_delete_invoice($1,$2) r", [pin, id]); }

beforeAll(async function () {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create table public.salons (id uuid primary key, name text);
    create table public.salon_settings (salon_id uuid primary key references public.salons(id), contact_phone text, next_invoice_number integer not null default 1);
    create function public.auth_salon_id() returns uuid language sql stable as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function public.verify_staff_pin(p_role text, p_pin text) returns boolean language sql as $$ select p_pin = '9999' $$;
    create table public.pet_invoices (id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), customer_id uuid not null,
      invoice_number text not null, status text not null default 'issued', total integer not null default 0, amount_paid integer not null default 0,
      constraint pet_invoices_number_uidx unique (salon_id, invoice_number));
    create table public.pet_invoice_lines (id uuid primary key default gen_random_uuid(), salon_id uuid not null, invoice_id uuid not null references public.pet_invoices(id) on delete cascade, item_id uuid, quantity integer not null);
    create table public.pet_payments (id uuid primary key default gen_random_uuid(), salon_id uuid not null, invoice_id uuid not null references public.pet_invoices(id) on delete restrict, amount integer not null);
    create table public.pet_refunds (id uuid primary key default gen_random_uuid(), salon_id uuid not null, invoice_id uuid not null references public.pet_invoices(id) on delete restrict, amount integer not null, stock_returned boolean not null default false);
    create function public.pet_refunds_immutable() returns trigger language plpgsql as $f$
      begin if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then raise exception 'pet_refunds is append-only'; end if; return old; end; $f$;
    create trigger pet_refunds_no_change before update or delete on public.pet_refunds for each row execute function public.pet_refunds_immutable();
    create table public.pet_invoice_messages (id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.pet_invoices(id) on delete cascade);
    create table public.stock_calls (invoice_id uuid, qty integer, reason text);
    create function public.pet_apply_stock(p_salon uuid, p_item uuid, p_qty integer, p_reason text, p_note text, p_ref_type text, p_ref uuid) returns void language sql
      as $f$ insert into public.stock_calls values (p_ref, p_qty, p_reason) $f$;
    create table public.pet_loyalty_ledger (id serial primary key, salon_id uuid, customer_id uuid, points integer, reason text, reference_id uuid);
    create table public.pet_loyalty_accounts (salon_id uuid, customer_id uuid, points_balance integer not null default 0);
    create function public.pet_loyalty_apply(p_salon uuid, p_customer uuid, p_points integer, p_reason text, p_note text, p_ref_type text, p_ref uuid) returns integer language plpgsql
      as $f$ begin insert into public.pet_loyalty_ledger (salon_id, customer_id, points, reason, reference_id) values (p_salon, p_customer, p_points, p_reason, p_ref);
        update public.pet_loyalty_accounts set points_balance = points_balance + p_points where salon_id = p_salon and customer_id = p_customer; return 0; end; $f$;
    grant usage on schema public to anon, authenticated;
    insert into public.salons values ('${A}', 'Pawpalske'), ('${B}', 'Glam & Shine Studio'), ('${C}', '!!!');
    insert into public.salon_settings (salon_id, contact_phone) values ('${A}', '0712 345 678'), ('${B}', null), ('${C}', 'n/a');
  `);
  await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/117_invoice_prefix_phones_hard_delete.sql"), "utf8"));
});
afterAll(async function () { await db.close(); });

describe("migration 117: invoice prefix", function () {
  it("numbers an invoice with the business's own name, nothing hardcoded", async function () {
    await as(A);
    expect(await numberOf(await mkInvoice(A))).toBe("PAWPALSKE-INV-0001");
    expect(await numberOf(await mkInvoice(B))).toBe("GLAMSHINESTUDIO-INV-0001");
  });
  it("lets the owner set a shorter prefix; it applies to new invoices only", async function () {
    var old = await mkInvoice(A);
    await db.query("update public.salon_settings set invoice_prefix = 'PAWPALS' where salon_id = $1", [A]);
    var fresh = await mkInvoice(A);
    expect(await numberOf(old)).toMatch(/^PAWPALSKE-INV-/);
    expect(await numberOf(fresh)).toMatch(/^PAWPALS-INV-0003$/);
  });
  it("keeps plain INV- when the business has no usable name", async function () {
    expect(await numberOf(await mkInvoice(C))).toBe("INV-0001");
  });
  it("refuses a prefix with symbols or over 20 characters", async function () {
    await expect(db.query("update public.salon_settings set invoice_prefix = 'PAW-PALS' where salon_id = $1", [A])).rejects.toThrow();
    await expect(db.query("update public.salon_settings set invoice_prefix = 'a' where salon_id = $1", [A])).rejects.toThrow();
    await expect(db.query("update public.salon_settings set invoice_prefix = $2 where salon_id = $1", [A, "A".repeat(21)])).rejects.toThrow();
  });
});

describe("migration 117: business phone numbers", function () {
  it("carried the number already on file in as a shown number, and skipped junk", async function () {
    var a = await db.query("select phone, show_on_invoice from public.salon_phone_numbers where salon_id = $1", [A]);
    expect(a.rows).toEqual([{ phone: "0712 345 678", show_on_invoice: true }]);
    expect((await db.query("select 1 from public.salon_phone_numbers where salon_id = $1", [C])).rows.length).toBe(0);
  });
  it("saves any number of numbers in order, with the show switch, replacing the old list", async function () {
    await as(B);
    var list = [];
    for (var i = 0; i < 25; i++) list.push({ phone: "07" + String(20000000 + i), show_on_invoice: i % 2 === 0 });
    expect((await one("select public.salon_save_phone_numbers($1::jsonb) r", [JSON.stringify(list)])).r).toBe(25);
    var r = await db.query("select phone, show_on_invoice from public.salon_phone_numbers where salon_id = $1 order by position", [B]);
    expect(r.rows.length).toBe(25);
    expect(r.rows[0]).toEqual({ phone: "0720000000", show_on_invoice: true });
    expect(r.rows[1].show_on_invoice).toBe(false);
    await one("select public.salon_save_phone_numbers($1::jsonb) r", [JSON.stringify([{ phone: "0733 111 222" }])]);
    var again = await db.query("select phone, show_on_invoice from public.salon_phone_numbers where salon_id = $1", [B]);
    expect(again.rows).toEqual([{ phone: "0733 111 222", show_on_invoice: true }]);
  });
  it("saves all or nothing: a bad or repeated number leaves the old list untouched", async function () {
    await as(B);
    await expect(one("select public.salon_save_phone_numbers($1::jsonb)", [JSON.stringify([{ phone: "0744 111 222" }, { phone: "12" }])])).rejects.toThrow(/INVALID_PHONE/);
    await expect(one("select public.salon_save_phone_numbers($1::jsonb)", [JSON.stringify([{ phone: "0744 111 222" }, { phone: "0744-111-222" }])])).rejects.toThrow(/DUPLICATE_PHONE/);
    expect((await db.query("select phone from public.salon_phone_numbers where salon_id = $1", [B])).rows).toEqual([{ phone: "0733 111 222" }]);
  });
  it("needs a signed-in business, and each business sees only its own list", async function () {
    await as("");
    await expect(one("select public.salon_save_phone_numbers('[]'::jsonb)")).rejects.toThrow(/NOT_AUTHENTICATED/);
    await db.exec("set role authenticated");
    try {
      await as(A);
      var r = await db.query("select phone from public.salon_phone_numbers");
      expect(r.rows).toEqual([{ phone: "0712 345 678" }]);
      await expect(db.query("insert into public.salon_phone_numbers (salon_id, phone) values ($1,'0700000000')", [A])).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
    await db.exec("set role anon");
    try { await expect(db.query("select * from public.salon_phone_numbers")).rejects.toThrow(/permission denied/); }
    finally { await db.exec("reset role"); }
  });
});

describe("migration 117: permanent delete", function () {
  beforeEach(async function () { await as(A); });

  it("a wrong PIN deletes nothing and returns null", async function () {
    var id = await mkInvoice(A);
    expect((await del("0000", id)).rows[0].r).toBeNull();
    expect((await del("", id)).rows[0].r).toBeNull();
    expect((await one("select count(*)::int c from public.pet_invoices where id=$1", [id])).c).toBe(1);
  });
  it("needs a signed-in business and an invoice of its own", async function () {
    var mine = await mkInvoice(B);
    await expect(del("9999", mine)).rejects.toThrow(/INVOICE_NOT_FOUND/); // signed in as A, invoice belongs to B
    await as("");
    await expect(del("9999", mine)).rejects.toThrow(/NOT_AUTHENTICATED/);
    await as(B); await del("9999", mine);
  });
  it("removes a paid, refunded invoice with its payments, refunds, lines and delivery log", async function () {
    var id = await mkInvoice(A, { status: "refunded", paid: 1000, refund: 1000 });
    await db.query("insert into public.pet_invoice_messages (invoice_id) values ($1)", [id]);
    expect((await del("9999", id)).rows[0].r).toBe(true);
    for (var t of ["pet_invoices where id", "pet_payments where invoice_id", "pet_refunds where invoice_id", "pet_invoice_lines where invoice_id", "pet_invoice_messages where invoice_id"]) {
      expect((await one("select count(*)::int c from public." + t + " = $1", [id])).c).toBe(0);
    }
  });
  it("only works inside the function: refunds stay append-only for everyone else", async function () {
    var id = await mkInvoice(A, { status: "paid", paid: 1000, refund: 100 });
    await expect(db.query("delete from public.pet_refunds where invoice_id = $1", [id])).rejects.toThrow(/append-only/);
    await expect(db.query("update public.pet_refunds set amount = 1 where invoice_id = $1", [id])).rejects.toThrow(/append-only/);
    await del("9999", id);
  });
  it("puts product lines back into stock, except when void or already restocked by a refund", async function () {
    await db.query("delete from public.stock_calls");
    var live = await mkInvoice(A, { item: true });
    var voided = await mkInvoice(A, { item: true, status: "void" });
    var restocked = await mkInvoice(A, { item: true, status: "refunded", paid: 1000, refund: 1000, stockBack: true });
    for (var id of [live, voided, restocked]) await del("9999", id);
    var calls = (await db.query("select invoice_id, qty, reason from public.stock_calls")).rows;
    expect(calls).toEqual([{ invoice_id: live, qty: 2, reason: "sale_void" }]);
  });
  it("takes back the loyalty points the invoice earned, never below a zero balance", async function () {
    await db.query("insert into public.pet_loyalty_accounts values ($1,$2,30)", [A, CUST]);
    var id = await mkInvoice(A, { status: "paid", paid: 1000 });
    await db.query("insert into public.pet_loyalty_ledger (salon_id, customer_id, points, reason, reference_id) values ($1,$2,100,'earn_invoice',$3)", [A, CUST, id]);
    await del("9999", id);
    expect((await one("select points_balance b from public.pet_loyalty_accounts where salon_id=$1", [A])).b).toBe(0); // 30 available, not 100
    await db.query("delete from public.pet_loyalty_accounts");
  });
  it("restarts numbering at 0001 only when no invoice is left, and never reuses a number before that", async function () {
    await db.query("delete from public.pet_invoices where salon_id = $1", [A]);
    await db.query("update public.salon_settings set next_invoice_number = 1 where salon_id = $1", [A]);
    var first = await mkInvoice(A); var second = await mkInvoice(A); var third = await mkInvoice(A);
    await del("9999", second);
    expect((await one("select next_invoice_number x from public.salon_settings where salon_id=$1", [A])).x).toBe(4); // still others: no reuse
    await del("9999", first); await del("9999", third);
    expect((await one("select next_invoice_number x from public.salon_settings where salon_id=$1", [A])).x).toBe(1);
    expect(await numberOf(await mkInvoice(A))).toBe("PAWPALS-INV-0001");
  });
  it("never touches another business's numbering", async function () {
    var b = await mkInvoice(B);
    var before = (await one("select next_invoice_number x from public.salon_settings where salon_id=$1", [B])).x;
    var a = await mkInvoice(A); await del("9999", a);
    expect((await one("select next_invoice_number x from public.salon_settings where salon_id=$1", [B])).x).toBe(before);
    expect((await one("select count(*)::int c from public.pet_invoices where id=$1", [b])).c).toBe(1);
  });
  it("is callable by signed-in businesses only", async function () {
    await db.exec("set role anon");
    try { await expect(del("9999", A)).rejects.toThrow(/permission denied/); } finally { await db.exec("reset role"); }
  });
});
