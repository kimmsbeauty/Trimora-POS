// @vitest-environment node
//
// Behavioural test of migration 099 (Pet M-Pesa STK) against a REAL Postgres engine (PGlite).
// salon_mpesa_payments is a stand-in with only the columns 099 and the Edge Functions use.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

var MIG = path.join(process.cwd(), "supabase/migrations");
function sql(file) { return fs.readFileSync(path.join(MIG, file), "utf8"); }
var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var CUST_A = "c0000000-0000-0000-0000-00000000000a";
var SVC = "f0000000-0000-0000-0000-000000000001"; // 1500
var db; var keyN = 0;
function key() { keyN += 1; return "00000000-0000-4000-8000-" + String(keyN).padStart(12, "0"); }
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function invoice(qty) {
  var r = await db.query("select public.pet_create_invoice($1,$2,null,null,$3::jsonb,'amount',0,null,null,'[]'::jsonb) as id", [key(), CUST_A, JSON.stringify([{ service_id: SVC, quantity: qty || 1 }])]);
  return r.rows[0].id;
}
async function push(id, o) {
  o = Object.assign({ salon: A, inv: null, status: "confirmed", amount: 1500, receipt: "R" + id.slice(0, 6) }, o || {});
  await db.query("insert into public.salon_mpesa_payments (salon_id, checkout_request_id, amount, status, mpesa_receipt, pet_invoice_id) values ($1,$2,$3,$4,$5,$6)",
    [o.salon, id, o.amount, o.status, o.status === "confirmed" ? o.receipt : null, o.inv]);
}
async function inv(id) { return (await db.query("select status, amount_paid from public.pet_invoices where id=$1", [id])).rows[0]; }

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
  for (var f of ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql", "087_pet_audit_log.sql", "088_pet_bookings.sql", "092_pet_booking_statuses.sql", "090_pet_invoices.sql"]) await db.exec(sql(f));
  await db.exec(`
    create table public.salon_mpesa_payments (id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
      checkout_request_id text unique, amount numeric, status text default 'pending', result_desc text, mpesa_receipt text, updated_at timestamptz default now());
  `);
  await db.exec(sql("099_pet_mpesa_stk.sql"));
  await db.exec(`
    insert into public.salons values ('${A}','A'),('${B}','B');
    insert into public.salon_settings (salon_id) values ('${A}'),('${B}');
    insert into public.customers values ('${CUST_A}','${A}','Ann');
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, species, active) values ('${SVC}','${A}','Full groom','Grooming',60,1500,'{}',true);
  `);
}, 60000);

beforeEach(async function () {
  await db.exec("delete from public.pet_payments; delete from public.salon_mpesa_payments; delete from public.pet_invoice_lines; delete from public.pet_invoices");
  await as(A);
});

describe("migration 099 against a real Postgres engine", function () {
  it("records a confirmed push on its invoice, taking amount and receipt from the push", async function () {
    var id = await invoice(1); await push("co1", { inv: id });
    expect((await db.query("select public.pet_record_mpesa_payment($1,'co1') as s", [id])).rows[0].s).toBe("paid");
    expect(await inv(id)).toEqual({ status: "paid", amount_paid: 1500 });
    var p = (await db.query("select method, amount, reference from public.pet_payments where invoice_id=$1", [id])).rows;
    expect(p).toEqual([{ method: "mpesa", amount: 1500, reference: "Rco1" }]);
  });

  it("is safe to retry: the same push is never recorded twice", async function () {
    var id = await invoice(1); await push("co1", { inv: id });
    await db.query("select public.pet_record_mpesa_payment($1,'co1')", [id]);
    expect((await db.query("select public.pet_record_mpesa_payment($1,'co1') as s", [id])).rows[0].s).toBe("paid");
    expect((await db.query("select count(*)::int n from public.pet_payments")).rows[0].n).toBe(1);
  });

  it("refuses a push that is pending or failed", async function () {
    var id = await invoice(1);
    await push("p1", { inv: id, status: "pending" }); await push("f1", { inv: id, status: "failed" });
    await expect(db.query("select public.pet_record_mpesa_payment($1,'p1')", [id])).rejects.toThrow(/MPESA_NOT_CONFIRMED/);
    await expect(db.query("select public.pet_record_mpesa_payment($1,'f1')", [id])).rejects.toThrow(/MPESA_NOT_CONFIRMED/);
    expect((await inv(id)).amount_paid).toBe(0);
  });

  it("refuses a push made for another invoice, another business, or an unknown id", async function () {
    var i1 = await invoice(1); var i2 = await invoice(1);
    await push("co1", { inv: i1 });
    await expect(db.query("select public.pet_record_mpesa_payment($1,'co1')", [i2])).rejects.toThrow(/MPESA_PAYMENT_MISMATCH/);
    await push("coB", { salon: B, inv: i1 });
    await expect(db.query("select public.pet_record_mpesa_payment($1,'coB')", [i1])).rejects.toThrow(/MPESA_PAYMENT_NOT_FOUND/);
    await expect(db.query("select public.pet_record_mpesa_payment($1,'nope')", [i1])).rejects.toThrow(/MPESA_PAYMENT_NOT_FOUND/);
    await as(B);
    await expect(db.query("select public.pet_record_mpesa_payment($1,'co1')", [i1])).rejects.toThrow(/INVOICE_NOT_FOUND/);
  });

  it("refuses a second receipt that would overpay, and a push without a receipt", async function () {
    var id = await invoice(1); await push("a", { inv: id }); await push("b", { inv: id, receipt: "OTHER1" });
    await db.query("select public.pet_record_mpesa_payment($1,'a')", [id]);
    await expect(db.query("select public.pet_record_mpesa_payment($1,'b')", [id])).rejects.toThrow(/INVOICE_NOT_PAYABLE|OVERPAYMENT/);
    var id2 = await invoice(1);
    await db.query("insert into public.salon_mpesa_payments (salon_id, checkout_request_id, amount, status, mpesa_receipt, pet_invoice_id) values ($1,'norc',1500,'confirmed',null,$2)", [A, id2]);
    await expect(db.query("select public.pet_record_mpesa_payment($1,'norc')", [id2])).rejects.toThrow(/MPESA_NOT_CONFIRMED/);
  });

  it("records a part payment as partial", async function () {
    var id = await invoice(2); await push("co1", { inv: id, amount: 1000 });
    expect((await db.query("select public.pet_record_mpesa_payment($1,'co1') as s", [id])).rows[0].s).toBe("partial");
    expect(await inv(id)).toEqual({ status: "partial", amount_paid: 1000 });
  });

  it("status polling only sees this business's Pet pushes", async function () {
    var id = await invoice(1); await push("co1", { inv: id }); await push("salon1", { inv: null });
    expect((await db.query("select * from public.pet_mpesa_status('co1')")).rows.length).toBe(1);
    expect((await db.query("select * from public.pet_mpesa_status('salon1')")).rows.length).toBe(0);
    await as(B);
    expect((await db.query("select * from public.pet_mpesa_status('co1')")).rows.length).toBe(0);
  });

  it("lists confirmed pushes that were never recorded, and stops listing them once recorded", async function () {
    var id = await invoice(1); await push("co1", { inv: id }); await push("p1", { inv: id, status: "pending" });
    expect((await db.query("select checkout_request_id from public.pet_mpesa_unrecorded($1)", [id])).rows).toEqual([{ checkout_request_id: "co1" }]);
    await db.query("select public.pet_record_mpesa_payment($1,'co1')", [id]);
    expect((await db.query("select * from public.pet_mpesa_unrecorded($1)", [id])).rows.length).toBe(0);
  });

  it("is not callable without a business session", async function () {
    await as("");
    await expect(db.query("select public.pet_record_mpesa_payment($1,'x')", [A])).rejects.toThrow(/NOT_AUTHENTICATED/);
    await expect(db.query("select * from public.pet_mpesa_status('x')")).rejects.toThrow(/NOT_AUTHENTICATED/);
  });
});
