// @vitest-environment node
//
// Behavioural test of migration 114 (daycare) on a REAL Postgres engine (PGlite). Platform tables are minimal
// stand-ins carrying only what 114 touches; they are NOT the live schema.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var db; var S = {};
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function app(salon, q, p, actor) {
  await db.exec("set role authenticated");
  try {
    await as(salon);
    await db.query("select set_config('request.headers', $1, false)", [actor ? JSON.stringify({ "x-pet-actor": actor }) : "{}"]);
    return await db.query(q, p || []);
  } finally { await db.exec("reset role"); }
}
async function one(q, p) { return (await db.query(q, p || [])).rows[0]; }
function mk(salon, pet, plan, startH, endH, extra) {
  return app(salon, "select public.pet_daycare_create_visit($1,$2,$3, now() + $4::interval, now() + $5::interval, $6, null, null, false) id",
    [S[salon].cust, pet, plan, startH + " hours", endH + " hours", (extra && extra.staff) || null]);
}
async function ins(table, cols, vals) {
  var r = await db.query("insert into " + table + " (" + cols + ") values (" + vals.map(function (_, i) { return "$" + (i + 1); }).join(",") + ") returning id", vals);
  return r.rows[0].id;
}

beforeAll(async function () {
  db = new PGlite({ extensions: { btree_gist: btree_gist } });
  await db.exec(`
    create extension if not exists btree_gist;
    create schema if not exists extensions;
    create role anon nologin; create role authenticated nologin;
    create table public.salons (id uuid primary key, name text);
    create table public.customers (id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id), name text);
    create table public.staff (id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), name text);
    create table public.pet_pets (id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id), customer_id uuid references public.customers(id), name text, archived_at timestamptz);
    create table public.pet_services (id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id), name text not null, category text not null default 'Grooming', duration_minutes integer, price integer not null, active boolean not null default true);
    create table public.pet_boarding_stays (id uuid primary key default gen_random_uuid(), salon_id uuid, pet_id uuid, check_in_on date, check_out_on date, status text);
    create table public.salon_settings (salon_id uuid primary key, tax_enabled boolean default false, tax_rate integer default 0, next_invoice_number integer default 1);
    create table public.pet_invoices (id uuid primary key default gen_random_uuid(), salon_id uuid not null, customer_id uuid, pet_id uuid, booking_id uuid, invoice_number text not null, idempotency_key uuid not null,
      status text not null default 'issued', subtotal integer not null, discount_amount integer not null default 0, total integer not null, tax_enabled boolean, tax_rate integer, tax_amount integer, amount_paid integer not null default 0, due_date date, notes text,
      constraint pet_invoices_idempotency_uidx unique (salon_id, idempotency_key));
    create table public.pet_invoice_lines (id uuid primary key default gen_random_uuid(), salon_id uuid, invoice_id uuid references public.pet_invoices(id) on delete cascade, service_id uuid not null references public.pet_services(id), description text, quantity integer, unit_price integer, line_total integer check (line_total = quantity * unit_price));
    create table public.audit_probe (tbl text, op text);
    create function public.auth_salon_id() returns uuid language sql stable as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function public.pet_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
    create function public.pet_audit_row() returns trigger language plpgsql as $$ begin insert into public.audit_probe values (tg_table_name, tg_op); return null; end; $$;
    create function public.pet_block_archived_pet() returns trigger language plpgsql as $$ begin if exists (select 1 from public.pet_pets p where p.id = new.pet_id and p.archived_at is not null) then raise exception 'PET_ARCHIVED'; end if; return new; end; $$;
    create function public.verify_staff_pin(r text, p text) returns boolean language sql as $$ select p = '1234' $$;
    grant usage on schema public to anon, authenticated;
    insert into public.salons values ('${A}', 'A'), ('${B}', 'B');
    insert into public.salon_settings (salon_id) values ('${A}'), ('${B}');
  `);
  // The live schema's category check is the 3-value one that migration 114 replaces.
  await db.exec("alter table public.pet_services add constraint pet_services_category_check check (category in ('Grooming','Boarding','Add-on'))");
  await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/114_pet_daycare.sql"), "utf8"));
  for (var salon of [A, B]) {
    var cust = await ins("public.customers", "salon_id,name", [salon, "Owner " + salon.slice(0, 1)]);
    var pets = [];
    for (var i = 0; i < 4; i++) pets.push(await ins("public.pet_pets", "salon_id,customer_id,name", [salon, cust, "Pet" + i]));
    var full = await ins("public.pet_services", "salon_id,name,category,price", [salon, "Full day", "Daycare", 2000]);
    var half = await ins("public.pet_services", "salon_id,name,category,price", [salon, "Half day", "Daycare", 1200]);
    var hr = await ins("public.pet_services", "salon_id,name,category,price", [salon, "Hourly", "Daycare", 300]);
    var staff = await ins("public.staff", "salon_id,name", [salon, "Sam"]);
    S[salon] = { cust: cust, pets: pets, full: full, half: half, hr: hr, staff: staff };
  }
});
afterAll(async function () { await db.close(); });

async function configure(salon, cap, late, grace) {
  var s = S[salon];
  return app(salon, "select public.pet_daycare_save_settings('1234', $1, $2, $3, $4, $5, $6) ok", [cap, s.full, s.half, s.hr, grace || 0, !!late]);
}
async function reset(salon) {
  await db.exec("delete from public.pet_invoice_lines; delete from public.pet_invoices; delete from public.pet_daycare_visits;");
}

describe("catalogue", function () {
  it("accepts Daycare services but never with a duration", async function () {
    await expect(db.query("insert into public.pet_services (salon_id,name,category,price,duration_minutes) values ($1,'x','Daycare',1,30)", [A])).rejects.toThrow();
    await expect(db.query("insert into public.pet_services (salon_id,name,category,price) values ($1,'x','Nope',1)", [A])).rejects.toThrow();
  });
});

describe("settings", function () {
  it("needs auth, a valid config and the admin PIN (wrong PIN returns null)", async function () {
    await expect(app(null, "select public.pet_daycare_save_settings('1234',5,null,null,null,0,false)")).rejects.toThrow(/NOT_AUTHENTICATED/);
    await expect(app(A, "select public.pet_daycare_save_settings('1234',0,null,null,null,0,false)")).rejects.toThrow(/INVALID_SETTINGS/);
    await expect(app(A, "select public.pet_daycare_save_settings('1234',5,null,null,null,0,true)")).rejects.toThrow(/LATE_FEE_NEEDS_HOURLY_RATE/);
    await expect(app(A, "select public.pet_daycare_save_settings('1234',5,$1,null,null,0,false)", [S[B].full])).rejects.toThrow(/SERVICE_NOT_FOUND/);
    expect((await app(A, "select public.pet_daycare_save_settings('0000',5,null,null,null,0,false) ok")).rows[0].ok).toBeNull();
    expect(Number((await one("select count(*)::int n from public.pet_daycare_settings")).n)).toBe(0);
  });
  it("refuses bookings until capacity and the plan's rate are configured", async function () {
    await expect(mk(A, S[A].pets[0], "full_day", 1, 5)).rejects.toThrow(/DAYCARE_NOT_CONFIGURED/);
    await app(A, "select public.pet_daycare_save_settings('1234',2,$1,null,null,0,false)", [S[A].full]);
    await expect(mk(A, S[A].pets[0], "half_day", 1, 5)).rejects.toThrow(/PLAN_NOT_CONFIGURED/);
  });
});

describe("booking rules", function () {
  beforeAll(async function () { await configure(A, 2, false, 0); });
  it("copies the catalogue price and enforces capacity by peak concurrency", async function () {
    var v1 = await mk(A, S[A].pets[0], "full_day", 1, 6);
    await mk(A, S[A].pets[1], "full_day", 2, 7);
    await expect(mk(A, S[A].pets[2], "full_day", 3, 5)).rejects.toThrow(/DAYCARE_FULL/);
    await mk(A, S[A].pets[2], "full_day", 8, 10); // after both end: fine
    var row = await one("select unit_price, units, service_name from public.pet_daycare_visits where id = $1", [v1.rows[0].id]);
    expect(row).toEqual({ unit_price: 2000, units: 1, service_name: "Full day" });
    await reset(A);
  });
  it("hourly visits bill each started booked hour", async function () {
    var v = await app(A, "select public.pet_daycare_create_visit($1,$2,'hourly', now() + interval '1 hour', now() + interval '3 hours 10 minutes', null, null, null, false) id", [S[A].cust, S[A].pets[0]]);
    expect((await one("select units from public.pet_daycare_visits where id = $1", [v.rows[0].id])).units).toBe(3);
    await reset(A);
  });
  it("blocks the same pet twice at overlapping times, and a pet that is boarding", async function () {
    await mk(A, S[A].pets[0], "full_day", 1, 5);
    await expect(mk(A, S[A].pets[0], "full_day", 3, 8)).rejects.toThrow(/VISIT_CONFLICT_PET|DAYCARE_FULL/);
    await db.query("insert into public.pet_boarding_stays (salon_id, pet_id, check_in_on, check_out_on, status) values ($1,$2,current_date - 1, current_date + 3,'occupied')", [A, S[A].pets[3]]);
    await expect(mk(A, S[A].pets[3], "full_day", 1, 5)).rejects.toThrow(/PET_BOARDED/);
    await reset(A);
  });
  it("rejects past or oversized windows, foreign pets and archived pets", async function () {
    await expect(mk(A, S[A].pets[0], "full_day", -5, -1)).rejects.toThrow(/INVALID_TIMES/);
    await expect(mk(A, S[A].pets[0], "full_day", 1, 30)).rejects.toThrow(/INVALID_TIMES/);
    await expect(mk(A, S[B].pets[0], "full_day", 1, 5)).rejects.toThrow(/PET_NOT_FOUND/);
    await db.query("update public.pet_pets set archived_at = now() where id = $1", [S[A].pets[2]]);
    await expect(mk(A, S[A].pets[2], "full_day", 1, 5)).rejects.toThrow(/archived/i);
    await db.query("update public.pet_pets set archived_at = null where id = $1", [S[A].pets[2]]);
  });
  it("the database itself rejects overlapping active visits for one pet", async function () {
    await mk(A, S[A].pets[0], "full_day", 1, 5);
    await expect(db.query("insert into public.pet_daycare_visits (salon_id,customer_id,pet_id,plan,service_name,unit_price,units,scheduled_start,scheduled_end) values ($1,$2,$3,'full_day','x',1,1, now() + interval '2 hours', now() + interval '4 hours')", [A, S[A].cust, S[A].pets[0]])).rejects.toThrow();
    await reset(A);
  });
});

describe("lifecycle and care log", function () {
  beforeAll(async function () { await configure(A, 3, false, 0); });
  it("walks booked -> checked-in -> in-daycare -> ready and blocks invalid or duplicate moves", async function () {
    var id = (await mk(A, S[A].pets[0], "full_day", 1, 6)).rows[0].id;
    await expect(app(A, "select public.pet_daycare_set_status($1,'in-daycare')", [id])).rejects.toThrow(/INVALID_STATUS_CHANGE/);
    await expect(app(A, "select public.pet_daycare_set_status($1,'completed')", [id])).rejects.toThrow(/USE_CHECKOUT/);
    await expect(app(A, "select public.pet_daycare_add_log($1,'feeding','lunch')", [id])).rejects.toThrow(/VISIT_NOT_ACTIVE/);
    await app(A, "select public.pet_daycare_set_status($1,'checked-in')", [id], S[A].staff);
    await expect(app(A, "select public.pet_daycare_set_status($1,'checked-in')", [id])).rejects.toThrow(/INVALID_STATUS_CHANGE/);
    var r = await one("select checked_in_at, checked_in_by from public.pet_daycare_visits where id = $1", [id]);
    expect(r.checked_in_at).not.toBeNull(); expect(r.checked_in_by).toBe(S[A].staff);
    await app(A, "select public.pet_daycare_set_status($1,'in-daycare')", [id]);
    await app(A, "select public.pet_daycare_set_status($1,'ready-for-pickup')", [id]);
    await expect(app(A, "select public.pet_daycare_set_status($1,'cancelled')", [id])).rejects.toThrow(/INVALID_STATUS_CHANGE/);
    await reset(A);
  });
  it("cancel frees capacity; no-show only after the scheduled start", async function () {
    var early = (await mk(A, S[A].pets[0], "full_day", 2, 6)).rows[0].id;
    await expect(app(A, "select public.pet_daycare_set_status($1,'no-show')", [early])).rejects.toThrow(/NO_SHOW_TOO_EARLY/);
    await app(A, "select public.pet_daycare_set_status($1,'cancelled')", [early]);
    await db.query("update public.pet_daycare_visits set scheduled_start = now() - interval '2 hours', scheduled_end = now() - interval '1 hour' where id = $1", [early]);
    await reset(A);
    var ns = (await mk(A, S[A].pets[1], "full_day", 1, 3)).rows[0].id;
    await db.query("update public.pet_daycare_visits set scheduled_start = now() - interval '2 hours', scheduled_end = now() - interval '1 hour' where id = $1", [ns]);
    await app(A, "select public.pet_daycare_set_status($1,'no-show')", [ns]);
    expect((await one("select status from public.pet_daycare_visits where id = $1", [ns])).status).toBe("no-show");
    await reset(A);
  });
  it("care logs need an active visit, valid fields, are attributed and are append-only", async function () {
    var id = (await app(A, "select public.pet_daycare_create_visit($1,$2,'full_day', now() + interval '1 hour', now() + interval '6 hours', null, null, null, true) id", [S[A].cust, S[A].pets[0]])).rows[0].id;
    await app(A, "select public.pet_daycare_add_log($1,'feeding','Lunch, ate all')", [id], S[A].staff);
    await expect(app(A, "select public.pet_daycare_add_log($1,'medication','x')", [id])).rejects.toThrow(/INVALID_LOG/);
    await expect(app(A, "select public.pet_daycare_add_log($1,'incident','')", [id])).rejects.toThrow(/INVALID_LOG/);
    await expect(app(A, "select public.pet_daycare_add_log($1,'bogus','x')", [id])).rejects.toThrow(/INVALID_KIND/);
    await app(A, "select public.pet_daycare_add_log($1,'medication',null,'Apoquel','1 tablet')", [id]);
    expect((await one("select recorded_by from public.pet_daycare_care_logs where kind='feeding'")).recorded_by).toBe(S[A].staff);
    await expect(db.query("update public.pet_daycare_care_logs set details='edited'")).rejects.toThrow(/cannot be changed/);
    await expect(db.query("delete from public.pet_daycare_care_logs")).rejects.toThrow(/cannot be changed/);
    await reset(A);
  });
});

describe("checkout and billing", function () {
  async function ready(salon, pet, plan, endOffsetMin) {
    var id = (await app(salon, "select public.pet_daycare_create_visit($1,$2,$3, now() + interval '1 hour', now() + interval '5 hours', null, null, null, true) id", [S[salon].cust, pet, plan])).rows[0].id;
    await app(salon, "select public.pet_daycare_set_status($1,'in-daycare')", [id]);
    await app(salon, "select public.pet_daycare_set_status($1,'ready-for-pickup')", [id]);
    if (endOffsetMin !== undefined) await db.query("update public.pet_daycare_visits set scheduled_start = now() - interval '9 hours', scheduled_end = now() - $2::interval where id = $1", [id, endOffsetMin + " minutes"]);
    return id;
  }
  var K = function (n) { return "00000000-0000-0000-0000-00000000000" + n; };
  it("completes and invoices in one step, once", async function () {
    await configure(A, 3, false, 0); await reset(A);
    var id = await ready(A, S[A].pets[0], "full_day");
    await expect(app(A, "select public.pet_daycare_checkout($1,$2) id", [K(1), "00000000-0000-0000-0000-0000000000ff"])).rejects.toThrow(/VISIT_NOT_FOUND/);
    var inv = (await app(A, "select public.pet_daycare_checkout($1,$2) id", [K(1), id], S[A].staff)).rows[0].id;
    expect(inv).toBeTruthy();
    var again = (await app(A, "select public.pet_daycare_checkout($1,$2) id", [K(1), id])).rows[0].id;
    expect(again).toBe(inv); // same key: no second invoice
    await expect(app(A, "select public.pet_daycare_checkout($1,$2) id", [K(2), id])).rejects.toThrow(/VISIT_ALREADY_INVOICED/);
    var v = await one("select status, collected_at, collected_by from public.pet_daycare_visits where id = $1", [id]);
    expect(v.status).toBe("completed"); expect(v.collected_at).not.toBeNull(); expect(v.collected_by).toBe(S[A].staff);
    var i = await one("select total, invoice_number, daycare_visit_id from public.pet_invoices where id = $1", [inv]);
    expect(i.total).toBe(2000); expect(i.invoice_number).toBe("INV-0001"); expect(i.daycare_visit_id).toBe(id);
    expect(Number((await one("select count(*)::int n from public.pet_invoices")).n)).toBe(1);
  });
  it("only a ready visit can be checked out", async function () {
    await reset(A);
    var id = (await mk(A, S[A].pets[1], "full_day", 1, 5)).rows[0].id;
    await expect(app(A, "select public.pet_daycare_checkout($1,$2) id", [K(3), id])).rejects.toThrow(/VISIT_NOT_READY/);
  });
  it("charges no late fee unless the business turned it on", async function () {
    await configure(A, 3, false, 0); await reset(A);
    var id = await ready(A, S[A].pets[0], "full_day", 190);
    var b = (await app(A, "select * from public.pet_daycare_billing($1)", [id])).rows[0];
    expect(b.late_hours).toBe(0); expect(Number(b.total)).toBe(2000);
    expect(b.minutes_overdue).toBeGreaterThanOrEqual(190);
  });
  it("bills started late hours after the grace period, lets staff reduce but never raise them", async function () {
    await configure(A, 3, true, 30); await reset(A);
    var id = await ready(A, S[A].pets[0], "full_day", 100); // 100 min over, 30 grace -> 70 -> 2 hours
    var b = (await app(A, "select * from public.pet_daycare_billing($1)", [id])).rows[0];
    expect(b.late_hours).toBe(2); expect(Number(b.total)).toBe(2000 + 600);
    await expect(app(A, "select public.pet_daycare_checkout($1,$2,3) id", [K(4), id])).rejects.toThrow(/INVALID_LATE_HOURS/);
    var inv = (await app(A, "select public.pet_daycare_checkout($1,$2,1,'amount',100) id", [K(5), id])).rows[0].id;
    var i = await one("select subtotal, discount_amount, total from public.pet_invoices where id = $1", [inv]);
    expect(i).toEqual({ subtotal: 2300, discount_amount: 100, total: 2200 });
    expect(Number((await one("select count(*)::int n from public.pet_invoice_lines where invoice_id = $1", [inv])).n)).toBe(2);
  });
  it("a completed visit whose invoice was voided can be billed again; a zero total needs no invoice", async function () {
    await configure(A, 3, false, 0); await reset(A);
    var id = await ready(A, S[A].pets[0], "half_day");
    var inv = (await app(A, "select public.pet_daycare_checkout($1,$2) id", [K(6), id])).rows[0].id;
    await db.query("update public.pet_invoices set status='void' where id = $1", [inv]);
    var inv2 = (await app(A, "select public.pet_daycare_checkout($1,$2) id", [K(7), id])).rows[0].id;
    expect(inv2).not.toBe(inv);
    await reset(A);
    var id2 = await ready(A, S[A].pets[1], "full_day");
    var z = await app(A, "select public.pet_daycare_checkout($1,$2,null,'percent',100) id", [K(8), id2]);
    expect(z.rows[0].id).toBeNull();
    expect((await one("select status from public.pet_daycare_visits where id = $1", [id2])).status).toBe("completed");
  });
});

describe("tenant isolation and grants", function () {
  it("other businesses cannot read or act on a visit", async function () {
    await configure(A, 3, false, 0); await reset(A);
    var id = (await mk(A, S[A].pets[0], "full_day", 1, 5)).rows[0].id;
    expect((await app(B, "select id from public.pet_daycare_visits")).rows.length).toBe(0);
    await expect(app(B, "select public.pet_daycare_set_status($1,'cancelled')", [id])).rejects.toThrow(/VISIT_NOT_FOUND/);
    await expect(app(B, "select * from public.pet_daycare_billing($1)", [id])).rejects.toThrow(/VISIT_NOT_FOUND/);
    await expect(app(B, "select public.pet_daycare_add_log($1,'note','x')", [id])).rejects.toThrow(/VISIT_NOT_FOUND/);
  });
  it("clients cannot write the tables directly; anon has nothing; helpers are not callable", async function () {
    await db.exec("set role authenticated");
    await expect(db.query("insert into public.pet_daycare_visits (salon_id) values (null)")).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.pet_daycare_settings set capacity = 999")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.pet_daycare_peak($1, now(), now(), null)", [A])).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from public.pet_daycare_visits")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.pet_daycare_create_visit(null,null,'full_day',now(),now(),null,null,null,false)")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
