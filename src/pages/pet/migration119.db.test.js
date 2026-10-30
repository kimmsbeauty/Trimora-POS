// @vitest-environment node
//
// Behavioural test of migration 119 (owner may delete paid trial invoices) against a REAL Postgres engine
// (PGlite). 117 and 118 are applied first, exactly as in production, then 119 on top. The platform is a
// minimal stand-in: only the tables and helpers these migrations touch.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

var A = "aaaaaaaa-0000-0000-0000-000000000001"; // "PawPals KE"
var B = "bbbbbbbb-0000-0000-0000-000000000002"; // "Kimms Beauty Parlour"
var C = "cccccccc-0000-0000-0000-000000000003"; // "The Happy Paws" -> skips "The"
var D = "dddddddd-0000-0000-0000-000000000004"; // "!!!" -> falls back to the slug
var E = "eeeeeeee-0000-0000-0000-000000000005"; // nothing usable -> BIZ
var F = "ffffffff-0000-0000-0000-000000000006"; // "Paws Pets"   } same first word:
var G = "99999999-0000-0000-0000-000000000007"; // "Paws & Claws" } independent sequences
var CUST = "11111111-0000-0000-0000-000000000001";
var ITEM = "22222222-0000-0000-0000-000000000001";
var db;
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function one(sql, params) { return (await db.query(sql, params || [])).rows[0]; }
async function mk(salon, opts) {
  opts = opts || {};
  var next = (await one("select next_invoice_number x from public.salon_settings where salon_id=$1", [salon])).x;
  await db.query("update public.salon_settings set next_invoice_number = $2 where salon_id=$1", [salon, next + 1]);
  var id = (await one(
    "insert into public.pet_invoices (salon_id, customer_id, invoice_number, status, total) values ($1,$2,$3,$4,1000) returning id",
    [salon, CUST, "INV-" + String(next).padStart(4, "0"), opts.status || "issued"])).id;
  if (opts.item) await db.query("insert into public.pet_invoice_lines (salon_id, invoice_id, item_id, quantity) values ($1,$2,$3,2)", [salon, id, ITEM]);
  if (opts.paid) await db.query("insert into public.pet_payments (salon_id, invoice_id, amount) values ($1,$2,$3)", [salon, id, opts.paid]);
  if (opts.refund) await db.query("insert into public.pet_refunds (salon_id, invoice_id, amount, stock_returned) values ($1,$2,$3,$4)", [salon, id, opts.refund, !!opts.stockBack]);
  if (opts.mpesa) await db.query("insert into public.salon_mpesa_payments (salon_id, pet_invoice_id, status) values ($1,$2,$3)", [salon, id, opts.mpesa]);
  return id;
}
async function numOf(id) { return (await one("select invoice_number x from public.pet_invoices where id=$1", [id])).x; }
function del(pin, id) { return db.query("select public.pet_delete_invoice($1,$2) r", [pin, id]); }
function savePhones(pin, list) { return one("select public.salon_save_phone_numbers($1, $2::jsonb) r", [pin, JSON.stringify(list)]); }

beforeAll(async function () {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '33333333-0000-0000-0000-000000000009'::uuid $$;
    create table public.salons (id uuid primary key, name text, slug text);
    create table public.salon_settings (salon_id uuid primary key references public.salons(id), contact_phone text, next_invoice_number integer not null default 1);
    create function public.auth_salon_id() returns uuid language sql stable as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function public.verify_staff_pin(p_role text, p_pin text) returns boolean language sql as $$ select p_pin = '9999' $$;
    create table public.pet_invoices (id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), customer_id uuid not null,
      invoice_number text not null, status text not null default 'issued', total integer not null default 0,
      constraint pet_invoices_number_uidx unique (salon_id, invoice_number));
    create table public.pet_invoice_lines (id uuid primary key default gen_random_uuid(), salon_id uuid not null, invoice_id uuid not null references public.pet_invoices(id) on delete cascade, item_id uuid, quantity integer not null);
    create table public.pet_payments (id uuid primary key default gen_random_uuid(), salon_id uuid not null, invoice_id uuid not null references public.pet_invoices(id) on delete restrict, amount integer not null, paid_at timestamptz not null default now());
    create table public.pet_refunds (id uuid primary key default gen_random_uuid(), salon_id uuid not null, invoice_id uuid not null references public.pet_invoices(id) on delete restrict, amount integer not null, stock_returned boolean not null default false);
    create function public.pet_refunds_immutable() returns trigger language plpgsql as $f$
      begin if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then raise exception 'pet_refunds is append-only'; end if; return old; end; $f$;
    create trigger pet_refunds_no_change before update or delete on public.pet_refunds for each row execute function public.pet_refunds_immutable();
    create table public.pet_invoice_messages (id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.pet_invoices(id) on delete cascade, salon_id uuid not null);
    create table public.salon_mpesa_payments (id uuid primary key default gen_random_uuid(), salon_id uuid not null, pet_invoice_id uuid references public.pet_invoices(id) on delete set null, status text);
    create table public.stock_calls (invoice_id uuid, qty integer, reason text);
    create function public.pet_apply_stock(p_salon uuid, p_item uuid, p_qty integer, p_reason text, p_note text, p_ref_type text, p_ref uuid) returns void language sql
      as $f$ insert into public.stock_calls values (p_ref, p_qty, p_reason) $f$;
    create table public.pet_loyalty_ledger (id serial primary key, salon_id uuid, customer_id uuid, points integer, reason text, reference_id uuid);
    create table public.pet_loyalty_accounts (salon_id uuid, customer_id uuid, points_balance integer not null default 0);
    create function public.pet_loyalty_apply(p_salon uuid, p_customer uuid, p_points integer, p_reason text, p_note text, p_ref_type text, p_ref uuid) returns integer language plpgsql
      as $f$ begin insert into public.pet_loyalty_ledger (salon_id, customer_id, points, reason, reference_id) values (p_salon, p_customer, p_points, p_reason, p_ref);
        update public.pet_loyalty_accounts set points_balance = points_balance + p_points where salon_id = p_salon and customer_id = p_customer; return 0; end; $f$;
    grant usage on schema public to anon, authenticated;
    insert into public.salons values
      ('${A}', 'PawPals KE', 'pawpals-ke'), ('${B}', 'Kimms Beauty Parlour', 'kimms'), ('${C}', 'The Happy Paws', 'happy'),
      ('${D}', '!!!', 'sunny-pets'), ('${E}', null, null), ('${F}', 'Paws Pets', 'paws-pets'), ('${G}', 'Paws & Claws', 'paws-claws');
    insert into public.salon_settings (salon_id) values ('${A}'), ('${B}'), ('${C}'), ('${D}'), ('${E}'), ('${F}'), ('${G}');
  `);
  // Two OLD-format invoices exist before the new numbering does (as they do in production).
  await db.exec(`
    insert into public.pet_invoices (salon_id, customer_id, invoice_number) values ('${A}', '${CUST}', 'INV-0001'), ('${A}', '${CUST}', 'INV-0002');
    update public.salon_settings set next_invoice_number = 3 where salon_id = '${A}';
  `);
  await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/117_invoice_prefix_phones_hard_delete.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/118_invoice_numbering_delete_safeguards.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/119_delete_trial_invoices.sql"), "utf8"));
});
afterAll(async function () { await db.close(); });

describe("migration 119: the admin can delete paid trial invoices", function () {
  beforeEach(async function () { await as(A); });

  it("a wrong PIN deletes nothing, even on a paid invoice", async function () {
    var id = await mk(A, { paid: 500 });
    expect((await del("0000", id)).rows[0].r).toBeNull();
    expect((await del("", id)).rows[0].r).toBeNull();
    expect((await one("select count(*)::int c from public.pet_invoices where id = $1", [id])).c).toBe(1);
    expect((await one("select count(*)::int c from public.pet_payments where invoice_id = $1", [id])).c).toBe(1);
  });

  it("with the PIN, deletes a paid and refunded invoice with its payments and refunds, and keeps a full copy", async function () {
    var id = await mk(A, { item: true, paid: 500, refund: 200 });
    var number = await numOf(id);
    expect((await del("9999", id)).rows[0].r).toBe(true);
    expect((await db.query("select 1 from public.pet_invoices where id = $1", [id])).rows.length).toBe(0);
    expect((await db.query("select 1 from public.pet_payments where invoice_id = $1", [id])).rows.length).toBe(0);
    expect((await db.query("select 1 from public.pet_refunds where invoice_id = $1", [id])).rows.length).toBe(0);
    var kept = await one("select invoice_number, snapshot from public.pet_deleted_invoices where invoice_id = $1", [id]);
    expect(kept.invoice_number).toBe(number);
    expect(kept.snapshot.total).toBe(1000);
    expect(kept.snapshot.lines.length).toBe(1);
    expect(kept.snapshot.payments.map(function (p) { return p.amount; })).toEqual([500]);
    expect(kept.snapshot.refunds.map(function (r) { return r.amount; })).toEqual([200]);
  });

  it("never gives the number out again, even after every invoice is deleted", async function () {
    await as(G);
    var first = await mk(G, { paid: 100 }); var second = await mk(G);
    var used = [await numOf(first), await numOf(second)];
    await del("9999", first); await del("9999", second);
    expect((await one("select count(*)::int c from public.pet_invoices where salon_id = $1", [G])).c).toBe(0);
    var next = await numOf(await mk(G));
    expect(used).not.toContain(next);
    expect(next).toBe("PAWS-INV-0003");
  });

  it("refuses while an M-Pesa push is still waiting, but allows a confirmed or failed one and keeps that record", async function () {
    var waiting = await mk(A, { mpesa: "pending" });
    await expect(del("9999", waiting)).rejects.toThrow(/INVOICE_HAS_PENDING_MPESA/);
    expect((await one("select count(*)::int c from public.pet_invoices where id = $1", [waiting])).c).toBe(1);
    var done = await mk(A, { paid: 300, mpesa: "confirmed" });
    expect((await del("9999", done)).rows[0].r).toBe(true);
    var rec = await one("select pet_invoice_id, status from public.salon_mpesa_payments where status = 'confirmed' and salon_id = $1", [A]);
    expect(rec.pet_invoice_id).toBeNull(); // the money record stays, its link is cleared
    var kept = await one("select snapshot from public.pet_deleted_invoices where invoice_id = $1", [done]);
    expect(kept.snapshot.mpesa_record_ids.length).toBe(1);
  });

  it("puts products back into stock once, unless the invoice was void or a refund already returned them", async function () {
    var paid = await mk(A, { item: true, paid: 500 });
    var voided = await mk(A, { item: true, status: "void" });
    var returned = await mk(A, { item: true, paid: 500, refund: 500, stockBack: true });
    await del("9999", paid); await del("9999", voided); await del("9999", returned);
    expect((await db.query("select * from public.stock_calls where invoice_id = $1", [paid])).rows).toEqual([{ invoice_id: paid, qty: 2, reason: "sale_void" }]);
    expect((await db.query("select * from public.stock_calls where invoice_id = $1", [voided])).rows.length).toBe(0);
    expect((await db.query("select * from public.stock_calls where invoice_id = $1", [returned])).rows.length).toBe(0);
  });

  it("takes back the loyalty points the invoice earned, never below the balance", async function () {
    await db.query("insert into public.pet_loyalty_accounts (salon_id, customer_id, points_balance) values ($1,$2,50)", [A, CUST]);
    var id = await mk(A, { paid: 500 });
    await db.query("insert into public.pet_loyalty_ledger (salon_id, customer_id, points, reason, reference_id) values ($1,$2,80,'earn_invoice',$3)", [A, CUST, id]);
    await del("9999", id);
    expect((await one("select points_balance b from public.pet_loyalty_accounts where salon_id = $1", [A])).b).toBe(0); // 80 earned, only 50 left to take back
  });

  it("a refund can still never be edited or deleted outside the delete function", async function () {
    await mk(A, { paid: 400, refund: 100 });
    await expect(db.query("delete from public.pet_refunds")).rejects.toThrow(/append-only/);
    await expect(db.query("update public.pet_refunds set amount = 1")).rejects.toThrow(/append-only/);
  });

  it("cannot delete another business's invoice, needs a signed-in business, and leaves other businesses alone", async function () {
    var other = await mk(B, { paid: 700 });
    await expect(del("9999", other)).rejects.toThrow(/INVOICE_NOT_FOUND/);
    await as("");
    await expect(del("9999", other)).rejects.toThrow(/NOT_AUTHENTICATED/);
    await as(B);
    expect((await one("select count(*)::int c from public.pet_payments where invoice_id = $1", [other])).c).toBe(1);
    expect((await one("select count(*)::int c from public.pet_deleted_invoices where salon_id = $1", [B])).c).toBe(0);
  });

  it("the copy is private to its business and read-only to the app", async function () {
    await db.exec("set role authenticated");
    try {
      await as(A);
      expect((await db.query("select 1 from public.pet_deleted_invoices")).rows.length).toBeGreaterThan(0);
      await as(B);
      expect((await db.query("select 1 from public.pet_deleted_invoices")).rows.length).toBe(0);
      await expect(db.query("delete from public.pet_deleted_invoices")).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
  });
});
