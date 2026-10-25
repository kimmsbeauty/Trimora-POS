// @vitest-environment node
//
// Behavioural test of migration 099 (manual reminder queue) against a REAL Postgres
// engine (PGlite, in process), using the repo's real pet migrations 083-097 and 099.
// The platform stand-in (salons, customers, staff, auth) is NOT the live schema; the
// customers stand-in carries the two columns 099 reads (phone, marketing_opt_out),
// verified against the live table on 2026-10-25.
// Note: PGlite is a single connection, so "double submit" is tested as two sequential
// calls, not true parallel sessions; the unique index is what guarantees it in production.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

var MIG = path.join(process.cwd(), "supabase/migrations");
function sql(file) { return fs.readFileSync(path.join(MIG, file), "utf8"); }

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var CUST_A = "c0000000-0000-0000-0000-00000000000a"; // phone, not opted out
var CUST_OUT = "c0000000-0000-0000-0000-0000000000a2"; // opted out of marketing
var CUST_NOPHONE = "c0000000-0000-0000-0000-0000000000a3";
var CUST_B = "c0000000-0000-0000-0000-00000000000b";
var PET1 = "e0000000-0000-0000-0000-0000000000a1";
var PET_OUT = "e0000000-0000-0000-0000-0000000000a2";
var PET_NOPHONE = "e0000000-0000-0000-0000-0000000000a3";
var PET_ARCH = "e0000000-0000-0000-0000-0000000000a4";
var PET_B = "e0000000-0000-0000-0000-0000000000b1";
var KENNEL = "d0000000-0000-0000-0000-0000000000a1";

var db;
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
function q(kind, src, channel, msg) {
  return db.query("select * from public.pet_queue_reminder($1,$2,$3,$4)", [kind, src, channel || "whatsapp", msg === undefined ? "Hello from the shop" : msg]);
}
function setStatus(id, st, err) { return db.query("select * from public.pet_set_reminder_status($1,$2,$3)", [id, st, err || null]); }
async function booking(pet, cust, status, startsAt, salon) {
  var r = await db.query(
    "insert into public.pet_bookings (salon_id, customer_id, pet_id, starts_at, ends_at, status) values ($1,$2,$3,$4::timestamptz,$4::timestamptz + interval '1 hour',$5) returning id",
    [salon || A, cust, pet, startsAt, status]);
  return r.rows[0].id;
}
async function count() { return Number((await db.query("select count(*)::int n from public.pet_reminders")).rows[0].n); }

beforeAll(async function () {
  db = new PGlite({ extensions: { btree_gist: btree_gist } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema extensions; create schema auth;
    create table public.salons (id uuid primary key, name text);
    create table public.customers (id uuid primary key, salon_id uuid not null, name text, phone text, marketing_opt_out boolean default false);
    create table public.staff (id uuid primary key, salon_id uuid not null, name text, active boolean default true);
    create table public.salon_settings (salon_id uuid primary key, tax_enabled boolean not null default false,
      tax_rate integer not null default 16, next_invoice_number integer not null default 1 check (next_invoice_number > 0));
    create function public.auth_salon_id() returns uuid language sql stable
      as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    grant usage on schema public to anon, authenticated;
  `);
  var files = ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql",
    "087_pet_audit_log.sql", "088_pet_bookings.sql", "092_pet_booking_statuses.sql", "089_pet_boarding.sql",
    "096_pet_delete_kennel_fix.sql", "097_pet_archiving.sql", "099_pet_reminders.sql"];
  for (var f of files) { await db.exec(sql(f)); }
  await db.exec(`
    insert into public.salons values ('${A}','A'),('${B}','B');
    insert into public.customers values
      ('${CUST_A}','${A}','Ann','0711000001',false), ('${CUST_OUT}','${A}','Opt Out','0711000002',true),
      ('${CUST_NOPHONE}','${A}','No Phone',null,false), ('${CUST_B}','${B}','Bob','0722000001',false);
    insert into public.pet_pets (id, salon_id, customer_id, name, species) values
      ('${PET1}','${A}','${CUST_A}','Rex','Dog'), ('${PET_OUT}','${A}','${CUST_OUT}','Zed','Dog'),
      ('${PET_NOPHONE}','${A}','${CUST_NOPHONE}','Nip','Cat'), ('${PET_ARCH}','${A}','${CUST_A}','Old','Dog'),
      ('${PET_B}','${B}','${CUST_B}','Bo','Dog');
    insert into public.pet_kennels (id, salon_id, name) values ('${KENNEL}','${A}','Suite 1');
  `);
}, 60000);

describe("migration 099: queueing is derived, validated and idempotent", function () {
  it("queues an appointment reminder, deriving customer, pet and key from the booking", async function () {
    await as(A);
    var b = await booking(PET1, CUST_A, "booked", "2026-12-01T09:00:00Z");
    var r = (await q("appointment", b)).rows[0];
    expect(r.status).toBe("pending");
    expect(r.customer_id).toBe(CUST_A); expect(r.pet_id).toBe(PET1);
    expect(r.source_type).toBe("booking"); expect(r.delivery).toBe("manual"); expect(r.attempts).toBe(0);
    expect(r.dedupe_key).toBe("appointment:" + b + ":2026-12-01T09:00");
  });

  it("a second submit returns the same reminder (no duplicate); edited text updates an open one", async function () {
    await as(A);
    var b = await booking(PET1, CUST_A, "booked", "2026-12-02T09:00:00Z");
    var before = await count();
    var r1 = (await q("appointment", b, "whatsapp", "First text")).rows[0];
    var r2 = (await q("appointment", b, "sms", "Edited text")).rows[0];
    expect(r2.id).toBe(r1.id);
    expect(r2.message).toBe("Edited text"); expect(r2.channel).toBe("sms");
    expect(await count()).toBe(before + 1);
  });

  it("a rescheduled booking gets a new reminder; a sent one is not rewritten", async function () {
    await as(A);
    var b = await booking(PET1, CUST_A, "booked", "2026-12-03T09:00:00Z");
    var r1 = (await q("appointment", b, "whatsapp", "Original")).rows[0];
    await setStatus(r1.id, "sent");
    var again = (await q("appointment", b, "whatsapp", "Different")).rows[0];
    expect(again.id).toBe(r1.id); expect(again.message).toBe("Original"); expect(again.status).toBe("sent");
    await db.query("update public.pet_bookings set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = $1", [b]);
    var moved = (await q("appointment", b)).rows[0];
    expect(moved.id).not.toBe(r1.id); expect(moved.status).toBe("pending");
  });

  it("only eligible sources can be queued for each kind", async function () {
    await as(A);
    var done = await booking(PET1, CUST_A, "completed", "2026-10-01T09:00:00Z");
    var miss = await booking(PET1, CUST_A, "no-show", "2026-10-05T09:00:00Z");
    await expect(q("appointment", done)).rejects.toThrow(/SOURCE_NOT_ELIGIBLE/);
    await expect(q("appointment", miss)).rejects.toThrow(/SOURCE_NOT_ELIGIBLE/);
    await expect(q("missed_appointment", done)).rejects.toThrow(/SOURCE_NOT_ELIGIBLE/);
    expect((await q("missed_appointment", miss)).rows[0].kind).toBe("missed_appointment");
    expect((await q("followup", done)).rows[0].kind).toBe("followup");
  });

  it("vaccination reminders need a due date; a new due date is a new reminder", async function () {
    await as(A);
    var v1 = (await db.query("insert into public.pet_vaccinations (salon_id, pet_id, vaccine, given_on, next_due_on) values ($1,$2,'Rabies','2026-01-01','2026-11-20') returning id", [A, PET1])).rows[0].id;
    var v0 = (await db.query("insert into public.pet_vaccinations (salon_id, pet_id, vaccine, given_on) values ($1,$2,'Booster','2026-01-01') returning id", [A, PET1])).rows[0].id;
    await expect(q("vaccination", v0)).rejects.toThrow(/SOURCE_NOT_ELIGIBLE/);
    var r1 = (await q("vaccination", v1)).rows[0];
    expect(r1.customer_id).toBe(CUST_A); expect(r1.dedupe_key).toBe("vaccination:" + v1 + ":2026-11-20");
    await db.query("update public.pet_vaccinations set next_due_on = '2027-02-01' where id = $1", [v1]);
    var r2 = (await q("vaccination", v1)).rows[0];
    expect(r2.id).not.toBe(r1.id);
  });

  it("boarding collection reminders need an occupied stay", async function () {
    await as(A);
    var s = (await db.query("insert into public.pet_boarding_stays (salon_id, customer_id, pet_id, kennel_id, check_in_on, check_out_on, status) values ($1,$2,$3,$4,'2026-11-01','2026-11-05','reserved') returning id", [A, CUST_A, PET1, KENNEL])).rows[0].id;
    await expect(q("boarding_collection", s)).rejects.toThrow(/SOURCE_NOT_ELIGIBLE/);
    await db.query("update public.pet_boarding_stays set status = 'occupied' where id = $1", [s]);
    var r = (await q("boarding_collection", s)).rows[0];
    expect(r.source_type).toBe("stay"); expect(r.dedupe_key).toBe("boarding_collection:" + s + ":2026-11-05");
  });
});

describe("migration 099: consent, contact and archive rules", function () {
  it("refuses follow-ups for customers who opted out of marketing, but allows service reminders", async function () {
    await as(A);
    var done = await booking(PET_OUT, CUST_OUT, "completed", "2026-09-01T09:00:00Z");
    await expect(q("followup", done)).rejects.toThrow(/CUSTOMER_OPTED_OUT/);
    var upcoming = await booking(PET_OUT, CUST_OUT, "booked", "2026-12-10T09:00:00Z");
    expect((await q("appointment", upcoming)).rows[0].status).toBe("pending");
  });

  it("refuses WhatsApp/SMS when the customer has no phone", async function () {
    await as(A);
    var b = await booking(PET_NOPHONE, CUST_NOPHONE, "booked", "2026-12-11T09:00:00Z");
    await expect(q("appointment", b, "whatsapp")).rejects.toThrow(/NO_PHONE/);
    await expect(q("appointment", b, "sms")).rejects.toThrow(/NO_PHONE/);
    expect((await q("appointment", b, "email")).rows[0].channel).toBe("email");
  });

  it("refuses archived pets", async function () {
    await as(A);
    var done = await booking(PET_ARCH, CUST_A, "no-show", "2026-09-12T09:00:00Z");
    await expect(q("missed_appointment", done)).resolves.toBeTruthy(); // fine while the pet is active
    var later = await booking(PET_ARCH, CUST_A, "no-show", "2026-09-20T09:00:00Z");
    await db.query("update public.pet_pets set archived_at = now() where id = $1", [PET_ARCH]);
    await expect(q("missed_appointment", later)).rejects.toThrow(/PET_ARCHIVED/);
    // and the 097 guard stops NEW bookings for it, so the two features agree
    await expect(booking(PET_ARCH, CUST_A, "booked", "2026-12-12T09:00:00Z")).rejects.toThrow(/PET_ARCHIVED/);
  });

  it("validates kind, channel and message", async function () {
    await as(A);
    var b = await booking(PET1, CUST_A, "booked", "2026-12-13T09:00:00Z");
    await expect(q("marketing", b)).rejects.toThrow(/INVALID_KIND/);
    await expect(q("appointment", b, "fax")).rejects.toThrow(/INVALID_CHANNEL/);
    await expect(q("appointment", b, "whatsapp", "   ")).rejects.toThrow(/MESSAGE_REQUIRED/);
    await expect(q("appointment", b, "whatsapp", "x".repeat(601))).rejects.toThrow(/MESSAGE_TOO_LONG/);
    await expect(q("appointment", "00000000-0000-0000-0000-00000000ffff")).rejects.toThrow(/SOURCE_NOT_FOUND/);
  });
});

describe("migration 099: status workflow", function () {
  async function fresh(day) {
    await as(A);
    var b = await booking(PET1, CUST_A, "booked", "2027-01-" + day + "T09:00:00Z");
    return (await q("appointment", b)).rows[0];
  }

  it("pending -> sent records the time and is final; repeating is harmless", async function () {
    var r = await fresh("05");
    var s = (await setStatus(r.id, "sent")).rows[0];
    expect(s.status).toBe("sent"); expect(s.sent_at).not.toBeNull();
    expect((await setStatus(r.id, "sent")).rows[0].sent_at).toEqual(s.sent_at);
    await expect(setStatus(r.id, "cancelled")).rejects.toThrow(/REMINDER_FINAL/);
    await expect(setStatus(r.id, "failed")).rejects.toThrow(/REMINDER_FINAL/);
  });

  it("failures count attempts, can be retried, and stop after three", async function () {
    var r = await fresh("06");
    for (var i = 1; i <= 3; i++) {
      var f = (await setStatus(r.id, "failed", "no answer " + i)).rows[0];
      expect(f.attempts).toBe(i); expect(f.last_error).toBe("no answer " + i);
      if (i < 3) expect((await setStatus(r.id, "pending")).rows[0].status).toBe("pending");
    }
    await expect(setStatus(r.id, "pending")).rejects.toThrow(/MAX_ATTEMPTS/);
    expect((await setStatus(r.id, "cancelled")).rows[0].status).toBe("cancelled");
  });

  it("pending can be cancelled; pending cannot jump to a nonsense state", async function () {
    var r = await fresh("07");
    await expect(setStatus(r.id, "archived")).rejects.toThrow(/INVALID_STATUS/);
    expect((await setStatus(r.id, "cancelled")).rows[0].status).toBe("cancelled");
  });
});

describe("migration 099: tenant isolation and grants", function () {
  it("another business can neither queue nor see these reminders", async function () {
    await as(A);
    var b = await booking(PET1, CUST_A, "booked", "2027-02-01T09:00:00Z");
    var r = (await q("appointment", b)).rows[0];
    await as(B);
    await expect(q("appointment", b)).rejects.toThrow(/SOURCE_NOT_FOUND/);
    await expect(setStatus(r.id, "sent")).rejects.toThrow(/REMINDER_NOT_FOUND/);
    await db.exec("set role authenticated");
    try {
      expect((await db.query("select count(*)::int n from public.pet_reminders")).rows[0].n).toBe(0);
      await as(A);
      expect((await db.query("select count(*)::int n from public.pet_reminders")).rows[0].n).toBeGreaterThan(0);
    } finally { await db.exec("reset role"); }
  });

  it("signed-out calls are refused", async function () {
    await as("");
    var b = "00000000-0000-0000-0000-00000000aaaa";
    await expect(q("appointment", b)).rejects.toThrow(/NOT_AUTHENTICATED/);
  });

  it("the app can read but not write the table directly; anon has no access at all", async function () {
    await as(A);
    await db.exec("set role authenticated");
    try {
      await expect(db.query("insert into public.pet_reminders (salon_id, customer_id, kind, source_type, source_id, basis, dedupe_key, channel, message) values ($1,$2,'appointment','booking',gen_random_uuid(),'x','x','sms','hi')", [A, CUST_A])).rejects.toThrow(/permission denied/);
      await expect(db.query("update public.pet_reminders set status = 'sent'")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from public.pet_reminders")).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.pet_reminders")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.pet_queue_reminder('appointment', gen_random_uuid(), 'sms', 'hi')")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.pet_set_reminder_status(gen_random_uuid(), 'sent', null)")).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
  });
});
