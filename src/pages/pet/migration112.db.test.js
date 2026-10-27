// @vitest-environment node
//
// Behavioural test of migration 112 (invoice delivery log) against a REAL Postgres engine (PGlite).
// The platform stand-in (salons, pet_invoices, auth_salon_id) is minimal, not the live schema: 112 only
// needs the two tables to reference and the tenant helper. The edge function writes with the service
// role (here: the superuser); the app role may only read its own business's rows.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var INV_A = "1a000000-0000-0000-0000-000000000001";
var INV_B = "1b000000-0000-0000-0000-000000000002";
var db;
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
function log(salon, inv, extra) {
  var e = Object.assign({ channel: "email", recipient: "a@b.co", status: "sent", provider_message_id: "m1", error: null }, extra || {});
  return db.query("insert into public.pet_invoice_messages (salon_id, invoice_id, channel, recipient, status, provider_message_id, error) values ($1,$2,$3,$4,$5,$6,$7) returning id",
    [salon, inv, e.channel, e.recipient, e.status, e.provider_message_id, e.error]);
}

beforeAll(async function () {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create table public.salons (id uuid primary key, name text);
    create table public.pet_invoices (id uuid primary key, salon_id uuid not null references public.salons(id));
    create function public.auth_salon_id() returns uuid language sql stable
      as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    grant usage on schema public to anon, authenticated;
    insert into public.salons values ('${A}', 'A'), ('${B}', 'B');
    insert into public.pet_invoices values ('${INV_A}', '${A}'), ('${INV_B}', '${B}');
  `);
  await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/112_pet_invoice_messages.sql"), "utf8"));
});
afterAll(async function () { await db.close(); });

describe("migration 112: pet_invoice_messages", function () {
  it("records a sent and a failed attempt", async function () {
    await log(A, INV_A);
    await log(A, INV_A, { channel: "whatsapp", recipient: "254712345678", status: "failed", provider_message_id: null, error: "WHATSAPP_WINDOW_CLOSED" });
    var r = await db.query("select count(*)::int n from public.pet_invoice_messages where invoice_id = $1", [INV_A]);
    expect(r.rows[0].n).toBe(2);
  });

  it("rejects unknown channels and statuses, and blank recipients", async function () {
    await expect(log(A, INV_A, { channel: "sms" })).rejects.toThrow();
    await expect(log(A, INV_A, { status: "delivered" })).rejects.toThrow();
    await expect(log(A, INV_A, { recipient: "   " })).rejects.toThrow();
  });

  it("is append-only", async function () {
    await expect(db.query("update public.pet_invoice_messages set status = 'failed'")).rejects.toThrow(/append-only/);
  });

  it("lets a business read only its own rows", async function () {
    await log(B, INV_B, { recipient: "b@b.co" });
    await db.exec("set role authenticated");
    try {
      await as(A);
      var a = await db.query("select recipient from public.pet_invoice_messages");
      expect(a.rows.length).toBe(2);
      expect(a.rows.every(function (r) { return r.recipient !== "b@b.co"; })).toBe(true);
      await as(B);
      var b = await db.query("select recipient from public.pet_invoice_messages");
      expect(b.rows.map(function (r) { return r.recipient; })).toEqual(["b@b.co"]);
    } finally { await db.exec("reset role"); }
  });

  it("gives the app no way to write, and anon nothing at all", async function () {
    await db.exec("set role authenticated");
    try {
      await as(A);
      await expect(db.query("insert into public.pet_invoice_messages (salon_id, invoice_id, channel, recipient, status) values ($1,$2,'email','x@y.co','sent')", [A, INV_A])).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from public.pet_invoice_messages")).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
    await db.exec("set role anon");
    try { await expect(db.query("select * from public.pet_invoice_messages")).rejects.toThrow(/permission denied/); }
    finally { await db.exec("reset role"); }
  });

  it("goes when its invoice goes", async function () {
    await db.query("delete from public.pet_invoices where id = $1", [INV_B]);
    var r = await db.query("select count(*)::int n from public.pet_invoice_messages where invoice_id = $1", [INV_B]);
    expect(r.rows[0].n).toBe(0);
  });
});
