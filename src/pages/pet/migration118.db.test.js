// @vitest-environment node
//
// Behavioural test of migration 118 (first-word prefix, per-business sequences, accounting-safe delete,
// admin-PIN phone list) against a REAL Postgres engine (PGlite). 117 is applied first, exactly as in
// production, then 118 on top. The platform is a minimal stand-in: only the tables and helpers these two
// migrations touch. No business name, prefix or number below is known to the migrations: they are test data.
//
// PGlite is a single connection, so the "simultaneous" test proves the numbering is unique and gap-free
// when many invoices arrive back to back; it cannot prove row-lock behaviour across real connections.
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
  if (opts.refund) await db.query("insert into public.pet_refunds (salon_id, invoice_id, amount) values ($1,$2,$3)", [salon, id, opts.refund]);
  if (opts.mpesa) await db.query("insert into public.salon_mpesa_payments (salon_id, pet_invoice_id, status) values ($1,$2,'pending')", [salon, id]);
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
    create table public.pet_payments (id uuid primary key default gen_random_uuid(), salon_id uuid not null, invoice_id uuid not null references public.pet_invoices(id) on delete restrict, amount integer not null);
    create table public.pet_refunds (id uuid primary key default gen_random_uuid(), salon_id uuid not null, invoice_id uuid not null references public.pet_invoices(id) on delete restrict, amount integer not null, stock_returned boolean not null default false);
    create function public.pet_refunds_immutable() returns trigger language plpgsql as $f$
      begin if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then raise exception 'pet_refunds is append-only'; end if; return old; end; $f$;
    create trigger pet_refunds_no_change before update or delete on public.pet_refunds for each row execute function public.pet_refunds_immutable();
    create table public.pet_invoice_messages (id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.pet_invoices(id) on delete cascade, salon_id uuid not null);
    create table public.salon_mpesa_payments (id uuid primary key default gen_random_uuid(), salon_id uuid not null, pet_invoice_id uuid references public.pet_invoices(id) on delete set null, status text);
    create table public.stock_calls (invoice_id uuid, qty integer, reason text);
    create function public.pet_apply_stock(p_salon uuid, p_item uuid, p_qty integer, p_reason text, p_note text, p_ref_type text, p_ref uuid) returns void language sql
      as $f$ insert into public.stock_calls values (p_ref, p_qty, p_reason) $f$;
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
});
afterAll(async function () { await db.close(); });

describe("migration 118: prefix is the first meaningful word of the business name", function () {
  it("derives it from each business's own name, nothing hardcoded", async function () {
    expect(await numOf(await mk(A))).toBe("PAWPALS-INV-0001");
    expect(await numOf(await mk(B))).toBe("KIMMS-INV-0001");
    expect(await numOf(await mk(C))).toBe("HAPPY-INV-0001");
  });
  it("falls back to the web-address slug, then to BIZ", async function () {
    expect(await numOf(await mk(D))).toBe("SUNNY-INV-0001");
    expect(await numOf(await mk(E))).toBe("BIZ-INV-0001");
  });
  it("the owner's own prefix wins; the sequence of each prefix resumes where it stopped", async function () {
    await db.query("update public.salon_settings set invoice_prefix = 'PP' where salon_id = $1", [A]);
    expect(await numOf(await mk(A))).toBe("PP-INV-0001");
    await db.query("update public.salon_settings set invoice_prefix = null where salon_id = $1", [A]);
    expect(await numOf(await mk(A))).toBe("PAWPALS-INV-0002");
  });
  it("refuses a prefix with symbols or over 20 characters", async function () {
    await expect(db.query("update public.salon_settings set invoice_prefix = 'PAW-PALS' where salon_id = $1", [A])).rejects.toThrow();
    await expect(db.query("update public.salon_settings set invoice_prefix = $2 where salon_id = $1", [A, "A".repeat(21)])).rejects.toThrow();
  });
  it("two businesses with the same first word each get their own numbering", async function () {
    expect(await numOf(await mk(F))).toBe("PAWS-INV-0001");
    expect(await numOf(await mk(G))).toBe("PAWS-INV-0001");
    expect(await numOf(await mk(F))).toBe("PAWS-INV-0002");
  });
  it("leaves the old invoice numbers exactly as they were", async function () {
    var r = await db.query("select invoice_number from public.pet_invoices where salon_id = $1 and invoice_number like 'INV-%' order by invoice_number", [A]);
    expect(r.rows.map(function (x) { return x.invoice_number; })).toEqual(["INV-0001", "INV-0002"]);
  });
});

describe("migration 118: sequence behaviour", function () {
  it("grows past four digits without truncating or colliding", async function () {
    await db.query("update public.pet_invoice_sequences set last_value = 9998 where salon_id = $1 and prefix = 'KIMMS'", [B]);
    expect(await numOf(await mk(B))).toBe("KIMMS-INV-9999");
    expect(await numOf(await mk(B))).toBe("KIMMS-INV-10000");
    expect(await numOf(await mk(B))).toBe("KIMMS-INV-10001");
  });
  it("many invoices back to back are all distinct and in order", async function () {
    var ids = [];
    for (var i = 0; i < 30; i++) ids.push(await mk(C));
    var nums = [];
    for (var j = 0; j < ids.length; j++) nums.push(await numOf(ids[j]));
    expect(new Set(nums).size).toBe(30);
    expect(nums[0]).toBe("HAPPY-INV-0002");
    expect(nums[29]).toBe("HAPPY-INV-0031");
  });
  it("skips a number that is already taken instead of failing", async function () {
    await db.query("update public.pet_invoice_sequences set last_value = 49 where salon_id = $1 and prefix = 'SUNNY'", [D]);
    await db.query("insert into public.pet_invoices (salon_id, customer_id, invoice_number) values ($1,$2,'SUNNY-INV-0050')", [D, CUST]);
    expect(await numOf(await mk(D))).toBe("SUNNY-INV-0051");
  });
});

describe("migration 118: permanent delete is accounting-safe", function () {
  beforeEach(async function () { await as(A); });

  it("a wrong PIN deletes nothing and returns null", async function () {
    var id = await mk(A);
    expect((await del("0000", id)).rows[0].r).toBeNull();
    expect((await del("", id)).rows[0].r).toBeNull();
    expect(await numOf(id)).toMatch(/^PAWPALS-INV-/);
  });
  it("refuses an invoice that has a payment, a refund or an M-Pesa record, before any PIN", async function () {
    var paid = await mk(A, { paid: 500 });
    await expect(del("9999", paid)).rejects.toThrow(/INVOICE_HAS_PAYMENTS/);
    var refunded = await mk(A, { refund: 100 });
    await expect(del("9999", refunded)).rejects.toThrow(/INVOICE_HAS_REFUNDS/);
    var mpesa = await mk(A, { mpesa: true });
    await expect(del("9999", mpesa)).rejects.toThrow(/INVOICE_HAS_MPESA/);
    await expect(del("wrong", paid)).rejects.toThrow(/INVOICE_HAS_PAYMENTS/);
    expect((await one("select count(*)::int c from public.pet_payments where invoice_id = $1", [paid])).c).toBe(1);
    expect((await one("select count(*)::int c from public.pet_invoices where id = $1", [paid])).c).toBe(1);
  });
  it("deletes an eligible invoice with the PIN, returns its products to stock and keeps a copy", async function () {
    var id = await mk(A, { item: true });
    var number = await numOf(id);
    expect((await del("9999", id)).rows[0].r).toBe(true);
    expect((await db.query("select 1 from public.pet_invoices where id = $1", [id])).rows.length).toBe(0);
    expect((await db.query("select 1 from public.pet_invoice_lines where invoice_id = $1", [id])).rows.length).toBe(0);
    expect((await db.query("select * from public.stock_calls where invoice_id = $1", [id])).rows).toEqual([{ invoice_id: id, qty: 2, reason: "sale_void" }]);
    var kept = await one("select invoice_number, snapshot from public.pet_deleted_invoices where invoice_id = $1", [id]);
    expect(kept.invoice_number).toBe(number);
    expect(kept.snapshot.lines.length).toBe(1);
    expect(kept.snapshot.total).toBe(1000);
  });
  it("does not return stock twice for an invoice that was already voided", async function () {
    var id = await mk(A, { item: true, status: "void" });
    expect((await del("9999", id)).rows[0].r).toBe(true);
    expect((await db.query("select * from public.stock_calls where invoice_id = $1", [id])).rows.length).toBe(0);
  });
  it("never hands the deleted number out again, even when every invoice is deleted", async function () {
    await as(G);
    var one1 = await mk(G); var two = await mk(G);
    var n1 = await numOf(one1); var n2 = await numOf(two);
    await del("9999", one1); await del("9999", two);
    expect((await one("select count(*)::int c from public.pet_invoices where salon_id = $1", [G])).c).toBe(1); // only the earlier one remains
    var next = await numOf(await mk(G));
    expect([n1, n2]).not.toContain(next);
    expect(next).toBe("PAWS-INV-0004");
  });
  it("cannot delete another business's invoice, and needs a signed-in business", async function () {
    var other = await mk(B);
    await expect(del("9999", other)).rejects.toThrow(/INVOICE_NOT_FOUND/);
    await as("");
    await expect(del("9999", other)).rejects.toThrow(/NOT_AUTHENTICATED/);
  });
  it("a refund can never be deleted or changed", async function () {
    await expect(db.query("delete from public.pet_refunds")).rejects.toThrow(/append-only/);
    await expect(db.query("update public.pet_refunds set amount = 1")).rejects.toThrow(/append-only/);
  });
  it("the deleted-invoice record is read-only and private to its business", async function () {
    await db.exec("set role authenticated");
    try {
      await as(B);
      expect((await db.query("select 1 from public.pet_deleted_invoices")).rows.length).toBe(0);
      await expect(db.query("delete from public.pet_deleted_invoices")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.pet_invoice_sequences")).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
  });
});

describe("migration 118: business phone numbers need the admin PIN and have no cap", function () {
  it("a wrong PIN changes nothing", async function () {
    await as(B);
    expect((await savePhones("9999", [{ phone: "0733 111 222" }])).r).toBe(1);
    expect((await savePhones("0000", [{ phone: "0799 999 999" }])).r).toBeNull();
    expect((await savePhones("", [])).r).toBeNull();
    expect((await db.query("select phone from public.salon_phone_numbers where salon_id = $1", [B])).rows).toEqual([{ phone: "0733 111 222" }]);
  });
  it("saves far more than 100 numbers, in order, with the show switch", async function () {
    await as(B);
    var list = [];
    for (var i = 0; i < 250; i++) list.push({ phone: "07" + String(20000000 + i), show_on_invoice: i % 2 === 0 });
    expect((await savePhones("9999", list)).r).toBe(250);
    var r = await db.query("select phone, show_on_invoice from public.salon_phone_numbers where salon_id = $1 order by position", [B]);
    expect(r.rows.length).toBe(250);
    expect(r.rows[0]).toEqual({ phone: "0720000000", show_on_invoice: true });
    expect(r.rows[1].show_on_invoice).toBe(false);
  });
  it("saves all or nothing, and each business keeps its own list", async function () {
    await as(B);
    await expect(savePhones("9999", [{ phone: "0744 111 222" }, { phone: "12" }])).rejects.toThrow(/INVALID_PHONE/);
    await expect(savePhones("9999", [{ phone: "0744 111 222" }, { phone: "0744-111-222" }])).rejects.toThrow(/DUPLICATE_PHONE/);
    expect((await one("select count(*)::int c from public.salon_phone_numbers where salon_id = $1", [B])).c).toBe(250);
    await as(A);
    expect((await savePhones("9999", [{ phone: "0712 000 111" }])).r).toBe(1);
    expect((await one("select count(*)::int c from public.salon_phone_numbers where salon_id = $1", [B])).c).toBe(250);
    await as("");
    await expect(savePhones("9999", [])).rejects.toThrow(/NOT_AUTHENTICATED/);
  });
});

describe("migration 118: business details", function () {
  it("accepts email, website and address and caps their length", async function () {
    await db.query("update public.salon_settings set contact_email = 'hello@example.com', website = 'www.example.com', address = 'Some Road, Town' where salon_id = $1", [A]);
    await expect(db.query("update public.salon_settings set website = $2 where salon_id = $1", [A, "w".repeat(201)])).rejects.toThrow();
  });
});
