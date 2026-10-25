// @vitest-environment node
//
// Behavioural test of migration 101 (pet loyalty) against a REAL Postgres engine (PGlite,
// in process). It applies the repo's real migrations 083-088, 089, 090, 092, 094-098 and 101,
// so points are awarded by the real triggers on the real pet_create_invoice /
// pet_record_payment / pet_set_booking_status, and then tries to break the rules:
// double awards, going below zero, someone else's customer, direct writes, a failing
// award blocking a payment.
//
// The stand-in for platform tables (salons, customers, staff, salon_settings,
// auth_salon_id, auth.uid, the anon/authenticated roles) is NOT the live schema. It only
// provides the columns the pet migrations use.
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
var PET_B = "e0000000-0000-0000-0000-0000000000b1";
var SVC_GROOM = "f0000000-0000-0000-0000-000000000001"; // 60 min, 1500
var SVC_B = "f0000000-0000-0000-0000-0000000000b1";

var db;
var keyN = 0;
function key() { keyN += 1; return "00000000-0000-4000-8000-" + String(keyN).padStart(12, "0"); }
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function one(q, p) { return (await db.query(q, p || [])).rows[0]; }
async function settings(enabled, kes, bonus, silver, gold) {
  await db.query("select public.pet_save_loyalty_settings($1,$2,$3,$4,$5)", [enabled, kes === undefined ? 100 : kes, bonus || 0, silver === undefined ? 500 : silver, gold === undefined ? 2000 : gold]);
}
async function invoice(args) {
  var a = Object.assign({ key: key(), customer: CUST_A, pet: PET_A1, lines: [{ service_id: SVC_GROOM, quantity: 1 }], dtype: "amount", dvalue: 0, payments: [] }, args || {});
  return (await one("select public.pet_create_invoice($1,$2,$3,null,$4::jsonb,$5,$6,null,null,$7::jsonb) as id",
    [a.key, a.customer, a.pet, JSON.stringify(a.lines), a.dtype, a.dvalue, JSON.stringify(a.payments)])).id;
}
async function pay(invoiceId, amount) { return db.query("select public.pet_record_payment($1,'cash',$2)", [invoiceId, amount]); }
async function account(customer) { return one("select * from public.pet_loyalty_accounts where salon_id=$1 and customer_id=$2", [A, customer || CUST_A]); }
async function ledger(customer) { return (await db.query("select * from public.pet_loyalty_ledger where salon_id=$1 and customer_id=$2 order by created_at, id", [A, customer || CUST_A])).rows; }
async function reward(name, cost, active) {
  return (await one("insert into public.pet_loyalty_rewards (salon_id, name, points_cost, active) values ($1,$2,$3,$4) returning id", [A, name, cost, active !== false])).id;
}
function at(days, hh) { var d = new Date(Date.now() + days * 86400000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh - 3, 0)); }
async function completedBooking(hour, customer, pet) {
  var start = at(3, hour); var end = new Date(start.getTime() + 3600000);
  var id = (await one("select public.pet_create_booking($1,$2,$3,$4,$5,$6::uuid[],false,null) as id",
    [customer || CUST_A, pet || PET_A1, STAFF_A1, start.toISOString(), end.toISOString(), [SVC_GROOM]])).id;
  for (var s of ["checked-in", "in-progress", "ready", "completed"]) await db.query("select public.pet_set_booking_status($1,$2)", [id, s]);
  return id;
}
// Passes only if the promise REJECTS and the message contains `text` (an empty `text` still requires a rejection).
async function expectErr(promise, text) {
  var threw = false; var msg = "";
  try { await promise; } catch (e) { threw = true; msg = String(e.message || e); }
  expect(threw).toBe(true);
  expect(msg).toContain(text);
}

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
    "087_pet_audit_log.sql", "088_pet_bookings.sql", "092_pet_booking_statuses.sql", "090_pet_invoices.sql", "094_pet_supplies.sql",
    "095_pet_invoice_products.sql", "089_pet_boarding.sql", "096_pet_delete_kennel_fix.sql", "097_pet_archiving.sql", "098_pet_care_reminder_windows.sql", "101_pet_loyalty.sql"]) { await db.exec(sql(f)); }
  await db.exec(`
    insert into public.salons values ('${A}','A'),('${B}','B');
    insert into public.salon_settings (salon_id) values ('${A}'),('${B}');
    insert into public.customers values ('${CUST_A}','${A}','Ann'),('${CUST_A2}','${A}','Amy'),('${CUST_B}','${B}','Bob');
    insert into public.staff values ('${STAFF_A1}','${A}','G1',true);
    insert into public.pet_pets (id, salon_id, customer_id, name, species) values
      ('${PET_A1}','${A}','${CUST_A}','Rex','Dog'), ('${PET_B}','${B}','${CUST_B}','Bo','Dog');
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, species, active) values
      ('${SVC_GROOM}','${A}','Full groom','Grooming',60,1500,'{}',true), ('${SVC_B}','${B}','Bath','Grooming',60,900,'{}',true);
  `);
}, 60000);

beforeEach(async function () {
  // reset loyalty and money state between tests (ledger is append-only, so lift the guard just for cleanup)
  await db.exec("alter table public.pet_loyalty_ledger disable trigger pet_loyalty_ledger_no_change");
  await db.exec("delete from public.pet_loyalty_ledger; delete from public.pet_loyalty_redemptions; delete from public.pet_loyalty_accounts; delete from public.pet_loyalty_rewards; delete from public.pet_loyalty_settings");
  await db.exec("alter table public.pet_loyalty_ledger enable trigger pet_loyalty_ledger_no_change");
  await db.exec("delete from public.pet_payments; delete from public.pet_invoice_lines; delete from public.pet_invoices; delete from public.pet_bookings");
  await db.exec("update public.salon_settings set next_invoice_number = 1, tax_enabled = false");
  await as(A);
});

describe("earning points", function () {
  it("awards nothing while the programme is off (the default)", async function () {
    await invoice({ payments: [{ method: "cash", amount: 1500 }] });
    expect(await account()).toBeUndefined();
    expect((await ledger()).length).toBe(0);
  });

  it("awards floor(total / KES-per-point) when an invoice is created fully paid", async function () {
    await settings(true, 100);
    var id = await invoice({ payments: [{ method: "cash", amount: 1500 }] });
    var acc = await account();
    expect(acc).toMatchObject({ points_balance: 15, lifetime_earned: 15, lifetime_redeemed: 0 });
    var l = await ledger();
    expect(l.length).toBe(1);
    expect(l[0]).toMatchObject({ points: 15, balance_after: 15, reason: "earn_invoice", reference_type: "invoice", reference_id: id });
  });

  it("awards only when the invoice becomes PAID, once, even across several payments", async function () {
    await settings(true, 100);
    var id = await invoice();
    expect(await account()).toBeUndefined();
    await pay(id, 500);
    expect(await account()).toBeUndefined();
    await pay(id, 1000);
    expect((await account()).points_balance).toBe(15);
    expect((await ledger()).length).toBe(1);
  });

  it("uses the amount actually owed after a discount, and rounds down", async function () {
    await settings(true, 250);
    await invoice({ dvalue: 500, payments: [{ method: "cash", amount: 1000 }] }); // total 1000 -> 4
    expect((await account()).points_balance).toBe(4);
    await invoice({ payments: [{ method: "cash", amount: 1500 }] }); // 6 more (floor 1500/250)
    expect((await account()).points_balance).toBe(10);
  });

  it("awards nothing when the points would round to zero or the invoice is voided unpaid", async function () {
    await settings(true, 5000);
    await invoice({ payments: [{ method: "cash", amount: 1500 }] }); // 0.3 points
    expect(await account()).toBeUndefined();
    await settings(true, 100);
    var id = await invoice();
    await db.query("select public.pet_void_invoice($1,'mistake')", [id]);
    expect(await account()).toBeUndefined();
  });

  it("gives the visit bonus once per completed booking, and none when it is 0", async function () {
    await settings(true, 100, 0);
    await completedBooking(9);
    expect(await account()).toBeUndefined();
    await settings(true, 100, 50);
    var b = await completedBooking(11);
    var acc = await account();
    expect(acc).toMatchObject({ points_balance: 50, lifetime_earned: 50 });
    var l = await ledger();
    expect(l[0]).toMatchObject({ reason: "visit_bonus", reference_type: "booking", reference_id: b, points: 50 });
    // the award key is unique per booking, so a repeat can never double it
    var again = await one("select public.pet_loyalty_apply($1,$2,50,'visit_bonus',null,'booking',$3) as r", [A, CUST_A, b]);
    expect(again.r).toBeNull();
    expect((await account()).points_balance).toBe(50);
  });

  it("never awards the same invoice twice", async function () {
    await settings(true, 100);
    var id = await invoice({ payments: [{ method: "cash", amount: 1500 }] });
    var again = await one("select public.pet_loyalty_apply($1,$2,15,'earn_invoice',null,'invoice',$3) as r", [A, CUST_A, id]);
    expect(again.r).toBeNull();
    expect((await account()).points_balance).toBe(15);
    expect((await ledger()).length).toBe(1);
  });

  it("FAILS OPEN: a broken award never blocks the payment", async function () {
    await settings(true, 100);
    await db.exec("alter function public.pet_loyalty_apply(uuid, uuid, integer, text, text, text, uuid) rename to pet_loyalty_apply_broken");
    try {
      var id = await invoice({ payments: [{ method: "cash", amount: 1500 }] });
      var inv = await one("select status, amount_paid from public.pet_invoices where id=$1", [id]);
      expect(inv).toMatchObject({ status: "paid", amount_paid: 1500 });
      expect((await db.query("select 1 from public.pet_payments where invoice_id=$1", [id])).rows.length).toBe(1);
    } finally {
      await db.exec("alter function public.pet_loyalty_apply_broken(uuid, uuid, integer, text, text, text, uuid) rename to pet_loyalty_apply");
    }
    expect(await account()).toBeUndefined(); // missed award, fixable with an adjustment
  });
});

describe("settings", function () {
  it("saves the rules once per business and rejects nonsense", async function () {
    await settings(true, 100, 10, 500, 2000);
    await settings(false, 200, 20, 600, 3000);
    var rows = (await db.query("select * from public.pet_loyalty_settings where salon_id=$1", [A])).rows;
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ enabled: false, kes_per_point: 200, visit_bonus: 20, silver_at: 600, gold_at: 3000 });
    await expectErr(settings(true, 0), "INVALID_SETTINGS");
    await expectErr(settings(true, 100, -1), "INVALID_SETTINGS");
    await expectErr(settings(true, 100, 0, 500, 500), "INVALID_SETTINGS"); // gold must be above silver
    await expectErr(settings(true, 100, 0, 900, 100), "INVALID_SETTINGS");
    await expectErr(db.query("select public.pet_save_loyalty_settings(null,100,0,500,2000)"), "INVALID_SETTINGS");
  });
});

describe("adjusting, redeeming and vouchers", function () {
  it("adjusts points with a required note, never below zero", async function () {
    await settings(true);
    expect((await one("select public.pet_adjust_loyalty($1,300,'Goodwill') as b", [CUST_A])).b).toBe(300);
    await expectErr(db.query("select public.pet_adjust_loyalty($1,50,'  ')", [CUST_A]), "NOTE_REQUIRED");
    await expectErr(db.query("select public.pet_adjust_loyalty($1,0,'x')", [CUST_A]), "INVALID_ADJUSTMENT");
    await expectErr(db.query("select public.pet_adjust_loyalty($1,-301,'too much')", [CUST_A]), "INSUFFICIENT_POINTS");
    expect((await one("select public.pet_adjust_loyalty($1,-100,'Correction') as b", [CUST_A])).b).toBe(200);
    expect(await account()).toMatchObject({ points_balance: 200, lifetime_earned: 200 });
    await expectErr(db.query("select public.pet_adjust_loyalty($1,10,'x')", [CUST_B]), "CUSTOMER_NOT_FOUND");
  });

  it("redeems a reward: deducts points, issues a voucher with a copied name and cost, keeps lifetime points", async function () {
    await settings(true);
    await db.query("select public.pet_adjust_loyalty($1,1200,'Opening')", [CUST_A]);
    var rw = await reward("Free nail trim", 1000);
    var id = (await one("select public.pet_redeem_reward($1,$2) as id", [CUST_A, rw])).id;
    expect(await account()).toMatchObject({ points_balance: 200, lifetime_earned: 1200, lifetime_redeemed: 1000 });
    var v = await one("select * from public.pet_loyalty_redemptions where id=$1", [id]);
    expect(v).toMatchObject({ status: "issued", reward_name: "Free nail trim", points_cost: 1000, customer_id: CUST_A });
    var l = (await ledger()).pop();
    expect(l).toMatchObject({ reason: "redeem", points: -1000, balance_after: 200, reference_type: "redemption", reference_id: id });
    await db.query("update public.pet_loyalty_rewards set name='Renamed', points_cost=1 where id=$1", [rw]);
    expect(await one("select reward_name, points_cost from public.pet_loyalty_redemptions where id=$1", [id])).toMatchObject({ reward_name: "Free nail trim", points_cost: 1000 });
  });

  it("refuses to redeem without enough points, leaving no voucher behind", async function () {
    await settings(true);
    await db.query("select public.pet_adjust_loyalty($1,100,'Opening')", [CUST_A]);
    var rw = await reward("Free bath", 2000);
    await expectErr(db.query("select public.pet_redeem_reward($1,$2)", [CUST_A, rw]), "INSUFFICIENT_POINTS");
    expect((await db.query("select 1 from public.pet_loyalty_redemptions")).rows.length).toBe(0);
    expect((await account()).points_balance).toBe(100);
    await expectErr(db.query("select public.pet_redeem_reward($1,$2)", [CUST_A2, rw]), "INSUFFICIENT_POINTS"); // customer with no account yet
  });

  it("checks the programme is on and the reward and customer are valid and the caller's own", async function () {
    await settings(true);
    await db.query("select public.pet_adjust_loyalty($1,5000,'Opening')", [CUST_A]);
    var off = await reward("Old reward", 100, false);
    var ok = await reward("Active reward", 100, true);
    await expectErr(db.query("select public.pet_redeem_reward($1,$2)", [CUST_A, off]), "REWARD_NOT_FOUND");
    await expectErr(db.query("select public.pet_redeem_reward($1,$2)", [CUST_A, "00000000-0000-0000-0000-00000000dead"]), "REWARD_NOT_FOUND");
    await expectErr(db.query("select public.pet_redeem_reward($1,$2)", [CUST_B, ok]), "CUSTOMER_NOT_FOUND");
    await settings(false);
    await expectErr(db.query("select public.pet_redeem_reward($1,$2)", [CUST_A, ok]), "PROGRAM_DISABLED");
    await as(B);
    await expectErr(db.query("select public.pet_redeem_reward($1,$2)", [CUST_B, ok]), "PROGRAM_DISABLED");
  });

  it("marks a voucher used, or cancels it and refunds; only an issued voucher can change", async function () {
    await settings(true);
    await db.query("select public.pet_adjust_loyalty($1,3000,'Opening')", [CUST_A]);
    var rw = await reward("Half off", 1000);
    var v1 = (await one("select public.pet_redeem_reward($1,$2) as id", [CUST_A, rw])).id;
    var v2 = (await one("select public.pet_redeem_reward($1,$2) as id", [CUST_A, rw])).id;
    expect((await account()).points_balance).toBe(1000);
    expect((await one("select public.pet_set_redemption_status($1,'used') as s", [v1])).s).toBe("used");
    expect((await account()).points_balance).toBe(1000);
    await expectErr(db.query("select public.pet_set_redemption_status($1,'cancelled')", [v1]), "INVALID_STATUS_CHANGE");
    await expectErr(db.query("select public.pet_set_redemption_status($1,'used')", [v1]), "INVALID_STATUS_CHANGE");
    expect((await one("select public.pet_set_redemption_status($1,'cancelled') as s", [v2])).s).toBe("cancelled");
    expect(await account()).toMatchObject({ points_balance: 2000, lifetime_redeemed: 1000 });
    var last = (await ledger()).pop();
    expect(last).toMatchObject({ reason: "redeem_refund", points: 1000, balance_after: 2000, reference_id: v2 });
    await expectErr(db.query("select public.pet_set_redemption_status($1,'issued')", [v2]), "INVALID_STATUS_CHANGE");
    await expectErr(db.query("select public.pet_set_redemption_status($1,'bogus')", [v2]), "INVALID_STATUS_CHANGE");
    await as(B);
    await expectErr(db.query("select public.pet_set_redemption_status($1,'used')", [v1]), "REDEMPTION_NOT_FOUND");
  });

  it("serialises simultaneous redemptions so points cannot be spent twice", async function () {
    await settings(true);
    await db.query("select public.pet_adjust_loyalty($1,1000,'Opening')", [CUST_A]);
    var rw = await reward("Big reward", 1000);
    var results = await Promise.allSettled([
      db.query("select public.pet_redeem_reward($1,$2)", [CUST_A, rw]),
      db.query("select public.pet_redeem_reward($1,$2)", [CUST_A, rw]),
    ]);
    expect(results.filter(function (r) { return r.status === "fulfilled"; }).length).toBe(1);
    expect((await account()).points_balance).toBe(0);
    expect((await db.query("select 1 from public.pet_loyalty_redemptions")).rows.length).toBe(1);
  });
});

describe("integrity, privileges and tenancy", function () {
  it("keeps the ledger append-only", async function () {
    await settings(true);
    await db.query("select public.pet_adjust_loyalty($1,10,'x')", [CUST_A]);
    await expectErr(db.exec("update public.pet_loyalty_ledger set points = 99"), "append-only");
    await expectErr(db.exec("delete from public.pet_loyalty_ledger"), "append-only");
  });

  it("keeps balance equal to the sum of the ledger and the last balance_after", async function () {
    await settings(true);
    await invoice({ payments: [{ method: "cash", amount: 1500 }] });
    await db.query("select public.pet_adjust_loyalty($1,100,'bonus')", [CUST_A]);
    var rw = await reward("R", 50);
    await db.query("select public.pet_redeem_reward($1,$2)", [CUST_A, rw]);
    var rows = await ledger();
    var sum = rows.reduce(function (n, r) { return n + r.points; }, 0);
    expect(sum).toBe((await account()).points_balance);
    expect(rows[rows.length - 1].balance_after).toBe(sum);
  });

  it("lets the app only READ the tables (plus add and edit rewards) and never run the internal function", async function () {
    await settings(true);
    await db.query("select public.pet_adjust_loyalty($1,10,'x')", [CUST_A]);
    await db.exec("set role authenticated");
    try {
      expect((await db.query("select * from public.pet_loyalty_accounts")).rows.length).toBe(1);
      for (var q of [
        "insert into public.pet_loyalty_accounts (salon_id, customer_id, points_balance) values ('" + A + "','" + CUST_A2 + "',99999)",
        "update public.pet_loyalty_accounts set points_balance = 99999",
        "insert into public.pet_loyalty_ledger (salon_id, customer_id, points, balance_after, reason) values ('" + A + "','" + CUST_A + "',5,5,'adjustment')",
        "insert into public.pet_loyalty_redemptions (salon_id, customer_id, reward_id, reward_name, points_cost) values ('" + A + "','" + CUST_A + "','" + B + "','x',1)",
        "insert into public.pet_loyalty_settings (salon_id, enabled) values ('" + B + "', true)",
        "update public.pet_loyalty_settings set enabled = false",
        "delete from public.pet_loyalty_settings",
        "delete from public.pet_loyalty_rewards",
        "select public.pet_loyalty_apply('" + A + "','" + CUST_A + "',1000,'adjustment',null,null,null)",
        "select public.pet_loyalty_on_invoice_paid()",
      ]) { await expectErr(db.query(q), ""); expect(await db.query("select 1").then(function () { return true; }, function () { return false; })).toBe(true); }
    } finally { await db.exec("reset role"); }
    expect((await account()).points_balance).toBe(10);
  });

  it("lets the app add and edit rewards for its own business only, never delete them", async function () {
    await db.exec("set role authenticated");
    try {
      await db.query("insert into public.pet_loyalty_rewards (salon_id, name, points_cost) values ($1,'Treat bag',300)", [A]);
      await db.query("update public.pet_loyalty_rewards set points_cost = 350, active = false where name = 'Treat bag'");
      await expectErr(db.query("insert into public.pet_loyalty_rewards (salon_id, name, points_cost) values ($1,'Sneaky',1)", [B]), "row-level security");
      await expectErr(db.query("update public.pet_loyalty_rewards set salon_id = $1", [B]), "permission denied");
      await expectErr(db.query("insert into public.pet_loyalty_rewards (salon_id, name, points_cost) values ($1,'  treat BAG ',1)", [A]), "duplicate key");
      await expectErr(db.query("insert into public.pet_loyalty_rewards (salon_id, name, points_cost) values ($1,'Free',0)", [A]), "check constraint");
    } finally { await db.exec("reset role"); }
    expect((await one("select points_cost, active from public.pet_loyalty_rewards where name='Treat bag'"))).toMatchObject({ points_cost: 350, active: false });
  });

  it("gives anon nothing", async function () {
    await settings(true);
    await db.exec("set role anon");
    try {
      await expectErr(db.query("select * from public.pet_loyalty_accounts"), "permission denied");
      await expectErr(db.query("select * from public.pet_loyalty_rewards"), "permission denied");
      await expectErr(db.query("select public.pet_adjust_loyalty($1,10,'x')", [CUST_A]), "permission denied");
      await expectErr(db.query("select public.pet_redeem_reward($1,$2)", [CUST_A, B]), "permission denied");
      await expectErr(db.query("select public.pet_save_loyalty_settings(true,100,0,500,2000)"), "permission denied");
    } finally { await db.exec("reset role"); }
  });

  it("keeps one business's loyalty data invisible to another", async function () {
    await settings(true);
    await db.query("select public.pet_adjust_loyalty($1,10,'x')", [CUST_A]);
    await reward("A reward", 5);
    await as(B);
    await db.exec("set role authenticated");
    try {
      for (var t of ["pet_loyalty_accounts", "pet_loyalty_ledger", "pet_loyalty_settings", "pet_loyalty_rewards", "pet_loyalty_redemptions"]) {
        expect((await db.query("select * from public." + t)).rows.length).toBe(0);
      }
      await expectErr(db.query("select public.pet_adjust_loyalty($1,10,'x')", [CUST_A]), "CUSTOMER_NOT_FOUND");
    } finally { await db.exec("reset role"); }
  });

  it("writes audit rows for loyalty changes under the right business", async function () {
    await settings(true);
    await db.query("select public.pet_adjust_loyalty($1,10,'x')", [CUST_A]);
    var rows = (await db.query("select distinct table_name from public.pet_audit_log where salon_id=$1 and table_name like 'pet_loyalty_%' order by 1", [A])).rows.map(function (r) { return r.table_name; });
    expect(rows).toEqual(expect.arrayContaining(["pet_loyalty_accounts", "pet_loyalty_ledger", "pet_loyalty_settings"]));
    expect((await db.query("select 1 from public.pet_audit_log where salon_id=$1 and table_name='pet_loyalty_ledger'", [B])).rows.length).toBe(0);
  });
});
