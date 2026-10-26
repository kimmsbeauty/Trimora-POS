// @vitest-environment node
//
// Behaviour test of migration 104 (public booking requests) on a REAL Postgres engine
// (PGlite) with the repo's real pet migrations 083-097 and 104. The platform tables
// (salons, salon_enabled_modules, customers, staff) are stand-ins carrying only the
// columns 104 uses; they are NOT the live schema. PGlite is one connection, so
// "concurrent" cases are sequential here; the unique/exclusion constraints are what
// guarantee them in production.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

var MIG = path.join(process.cwd(), "supabase/migrations");
function sql(f) { return fs.readFileSync(path.join(MIG, f), "utf8"); }
var A = "aaaaaaaa-0000-0000-0000-000000000001";
var B = "bbbbbbbb-0000-0000-0000-000000000002";
var AUTO = "cccccccc-0000-0000-0000-000000000003";
var SUSP = "dddddddd-0000-0000-0000-000000000004";
var NOMOD = "eeeeeeee-0000-0000-0000-000000000005";
var STAFF1 = "55555555-0000-0000-0000-000000000001";
var SV_BATH = "a1000000-0000-0000-0000-000000000001";   // Grooming 60 min
var SV_NAIL = "a1000000-0000-0000-0000-000000000002";   // Add-on 30 min
var SV_STAY = "a1000000-0000-0000-0000-000000000003";   // Boarding
var SV_OFF = "a1000000-0000-0000-0000-000000000004";    // inactive
var SV_NODUR = "a1000000-0000-0000-0000-000000000005";  // no duration
var SV_B = "b1000000-0000-0000-0000-000000000001";      // other tenant

var db; var DAY; // a date a few days ahead, in business time
var ALLDAYS = JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(function (d) { return { weekday: d, open: "09:00", close: "17:00" }; }));

function ids(a) { return "{" + a.join(",") + "}"; }
async function as(salon) { await db.query("select set_config('app.salon_id', $1, false)", [salon || ""]); }
async function one(q, p) { return (await db.query(q, p || [])).rows[0]; }
function info(salon) { return one("select public.pet_public_booking_info($1) r", [salon]).then(function (x) { return x.r; }); }
function slots(salon, date, svcs) { return one("select public.pet_public_slots($1,$2::date,$3::uuid[]) r", [salon, date, ids(svcs)]).then(function (x) { return x.r; }); }
async function submit(over) {
  var a = Object.assign({ salon: A, svcs: [SV_BATH], start: null, name: "Ann Wanjiru", phone: "0711 222 333", pet: "Rex", species: "Dog", breed: null, notes: null, consent: true, site: null }, over || {});
  if (!a.start) a.start = await local(DAY, "10:00");
  var r = await one("select public.pet_public_submit_request($1,$2::uuid[],$3::timestamptz,$4,$5,$6,$7,$8,$9,$10,$11) r",
    [a.salon, ids(a.svcs), a.start, a.name, a.phone, a.pet, a.species, a.breed, a.notes, a.consent, a.site]);
  return r.r;
}
async function local(date, hhmm) { return (await one("select (($1::date + $2::time) at time zone 'Africa/Nairobi')::timestamptz::text t", [date, hhmm])).t; }
async function save(over) {
  var a = Object.assign({ enabled: true, tz: "Africa/Nairobi", slot: 30, lead: 4, ahead: 30, cap: 1, hours: ALLDAYS }, over || {});
  return db.query("select public.pet_save_public_booking_settings($1,$2,$3,$4,$5,$6,$7::jsonb)", [a.enabled, a.tz, a.slot, a.lead, a.ahead, a.cap, a.hours]);
}
async function count(t, w) { return Number((await one("select count(*)::int n from public." + t + (w ? " where " + w : ""))).n); }

beforeAll(async function () {
  db = new PGlite({ extensions: { btree_gist: btree_gist } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema extensions; create schema auth;
    create table public.salons (id uuid primary key, name text, business_type text not null default 'salon', suspended boolean default false);
    create table public.salon_enabled_modules (id uuid primary key default gen_random_uuid(), salon_id uuid not null, module_key text not null, enabled boolean not null default true, unique (salon_id, module_key));
    create table public.customers (id uuid primary key default gen_random_uuid(), salon_id uuid not null, name text not null, phone text, marketing_opt_out boolean default false);
    create table public.staff (id uuid primary key, salon_id uuid not null, name text, active boolean default true);
    create table public.salon_settings (salon_id uuid primary key, tax_enabled boolean not null default false, tax_rate integer not null default 16, next_invoice_number integer not null default 1 check (next_invoice_number > 0));
    create function public.auth_salon_id() returns uuid language sql stable as $$ select nullif(current_setting('app.salon_id', true), '')::uuid $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    grant usage on schema public to anon, authenticated;
  `);
  var files = ["083_pet_pets_vaccinations.sql", "084_pet_customer_profiles.sql", "085_pet_services.sql", "086_pet_roles.sql", "087_pet_audit_log.sql",
    "088_pet_bookings.sql", "092_pet_booking_statuses.sql", "089_pet_boarding.sql", "096_pet_delete_kennel_fix.sql", "097_pet_archiving.sql", "104_pet_public_booking.sql"];
  for (var f of files) await db.exec(sql(f));
  await db.exec(`
    insert into public.salons values ('${A}','Paws','pet',false),('${B}','Bark','pet',false),('${AUTO}','Garage','auto',false),('${SUSP}','Gone','pet',true),('${NOMOD}','NoMod','pet',false);
    insert into public.salon_enabled_modules (salon_id, module_key) values ('${A}','pet'),('${B}','pet'),('${AUTO}','pet'),('${SUSP}','pet');
    insert into public.staff values ('${STAFF1}','${A}','Groomer',true);
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, description) values
      ('${SV_BATH}','${A}','Bath','Grooming',60,1500,'Wash and dry'), ('${SV_NAIL}','${A}','Nails','Add-on',30,300,null),
      ('${SV_STAY}','${A}','Night stay','Boarding',null,2000,null);
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price, active) values ('${SV_OFF}','${A}','Old cut','Grooming',45,900,false);
    insert into public.pet_services (id, salon_id, name, category, price) values ('${SV_NODUR}','${A}','Mystery','Grooming',500);
    insert into public.pet_services (id, salon_id, name, category, duration_minutes, price) values ('${SV_B}','${B}','Other shop bath','Grooming',60,999);
  `);
  DAY = (await one("select ((now() at time zone 'Africa/Nairobi')::date + 3)::text d")).d;
}, 90000);

describe("settings and gating", function () {
  it("online booking is off until a business turns it on", async function () {
    expect((await info(A)).enabled).toBe(false);
    expect((await slots(A, DAY, [SV_BATH])).error).toBe("NOT_AVAILABLE");
    expect((await submit()).error).toBe("NOT_AVAILABLE");
    expect(await count("pet_booking_requests")).toBe(0);
  });

  it("rejects bad settings", async function () {
    await as(A);
    await expect(save({ tz: "Mars/Base" })).rejects.toThrow(/INVALID_TIMEZONE/);
    await expect(save({ hours: "[]" })).rejects.toThrow(/HOURS_REQUIRED/);
    await expect(save({ hours: JSON.stringify([{ weekday: 1, open: "17:00", close: "09:00" }]) })).rejects.toThrow(/INVALID_HOURS/);
    await expect(save({ hours: JSON.stringify([{ weekday: 1, open: "09:00", close: "17:00" }, { weekday: 1, open: "10:00", close: "12:00" }]) })).rejects.toThrow(/INVALID_HOURS/);
    await expect(save({ hours: JSON.stringify([{ weekday: 9, open: "09:00", close: "17:00" }]) })).rejects.toThrow(/INVALID_HOURS/);
    await expect(save({ hours: JSON.stringify([{ weekday: 1, open: "9am", close: "5pm" }]) })).rejects.toThrow(/INVALID_HOURS/);
    await expect(save({ slot: 20 })).rejects.toThrow(/INVALID_SETTINGS/);
    await expect(save({ cap: 0 })).rejects.toThrow(/INVALID_SETTINGS/);
    await expect(save({ lead: 500 })).rejects.toThrow(/INVALID_SETTINGS/);
    await as("");
    await expect(save()).rejects.toThrow(/NOT_AUTHENTICATED/);
  });

  it("only a pet business with the module on, not suspended, and switched on is open", async function () {
    await as(A); await save();
    for (var s of [AUTO, SUSP, NOMOD]) { // give the other businesses settings directly, as the owner could
      await db.query("insert into public.pet_public_booking_settings (salon_id, enabled, hours) values ($1, true, $2::jsonb)", [s, ALLDAYS]);
    }
    expect((await info(A)).enabled).toBe(true);
    expect((await info(AUTO)).enabled).toBe(false);   // not a pet business
    expect((await info(SUSP)).enabled).toBe(false);   // suspended
    expect((await info(NOMOD)).enabled).toBe(false);  // pet module not enabled
    expect((await info(B)).enabled).toBe(false);      // never switched on
    expect((await info("00000000-0000-0000-0000-0000000000ff")).enabled).toBe(false);
    expect((await info(null)).enabled).toBe(false);
  });
});

describe("what visitors can see", function () {
  it("lists only active online-bookable services of that business and nothing private", async function () {
    var r = await info(A);
    expect(r.services.map(function (s) { return s.name; }).sort()).toEqual(["Bath", "Nails"]); // not Boarding, inactive, no-duration or other tenants
    expect(Object.keys(r).sort()).toEqual(["enabled", "hours", "lead_hours", "max_days_ahead", "services", "slot_minutes", "timezone"]);
    expect(Object.keys(r.services[0]).sort()).toEqual(["category", "description", "duration_minutes", "id", "name", "price", "species"]);
  });

  it("returns only times for a free day on the slot grid, in the business's time zone", async function () {
    var r = await slots(A, DAY, [SV_BATH]); // 60 min, 09:00-17:00, 30 min grid => 09:00..16:00
    expect(Object.keys(r).sort()).toEqual(["minutes", "ok", "slots"]);
    expect(r.minutes).toBe(60); expect(r.slots.length).toBe(15);
    expect(r.slots[0]).toBe((await one("select to_char((($1::date + time '09:00') at time zone 'Africa/Nairobi') at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') t", [DAY])).t);
    var two = await slots(A, DAY, [SV_BATH, SV_NAIL]); // 90 min => last start 15:30
    expect(two.minutes).toBe(90); expect(two.slots.length).toBe(14);
  });

  it("rejects services a visitor must not book", async function () {
    for (var s of [[SV_STAY], [SV_OFF], [SV_NODUR], [SV_B], []]) expect((await slots(A, DAY, s)).error).toBe("INVALID_SERVICES");
  });

  it("hides slots that are full and frees them when the booking is cancelled", async function () {
    await db.exec(`insert into public.customers (id, salon_id, name) values ('c0000000-0000-0000-0000-000000000001','${A}','Walk In');
      insert into public.pet_pets (id, salon_id, customer_id, name, species) values ('e0000000-0000-0000-0000-000000000001','${A}','c0000000-0000-0000-0000-000000000001','Blocker','Dog');`);
    var start = await local(DAY, "10:00");
    var b = (await one(`insert into public.pet_bookings (salon_id, customer_id, pet_id, starts_at, ends_at, status)
      values ($1,'c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',$2::timestamptz,$2::timestamptz + interval '1 hour','booked') returning id`, [A, start])).id;
    var r = await slots(A, DAY, [SV_BATH]);
    var iso = function (hhmm) { return one("select to_char((($1::date + $2::time) at time zone 'Africa/Nairobi') at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') t", [DAY, hhmm]).then(function (x) { return x.t; }); };
    expect(r.slots).not.toContain(await iso("09:30")); // overlaps 10:00-11:00
    expect(r.slots).not.toContain(await iso("10:00"));
    expect(r.slots).not.toContain(await iso("10:30"));
    expect(r.slots).toContain(await iso("09:00"));     // ends exactly at 10:00
    expect(r.slots).toContain(await iso("11:00"));
    await db.query("update public.pet_bookings set status = 'cancelled' where id = $1", [b]);
    expect((await slots(A, DAY, [SV_BATH])).slots).toContain(await iso("10:00"));
  });

  it("honours capacity, notice period, horizon and closed days", async function () {
    await as(A);
    await save({ cap: 2 });
    var start = await local(DAY, "10:00");
    await db.query(`insert into public.pet_bookings (salon_id, customer_id, pet_id, starts_at, ends_at, status)
      values ($1,'c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',$2::timestamptz,$2::timestamptz + interval '1 hour','booked')`, [A, start]);
    expect((await slots(A, DAY, [SV_BATH])).slots.length).toBe(15);   // 1 of 2 used: still open
    await db.query("delete from public.pet_bookings where salon_id = $1", [A]);
    await save({ cap: 1 });
    var today = (await one("select (now() at time zone 'Africa/Nairobi')::date::text d")).d;
    var t = await slots(A, today, [SV_BATH]);
    var nowPlus = (await one("select (now() + interval '4 hours')::text t")).t;
    t.slots.forEach(function (s) { expect(new Date(s).getTime()).toBeGreaterThanOrEqual(new Date(nowPlus).getTime() - 1000); });
    expect((await slots(A, (await one("select ((now() at time zone 'Africa/Nairobi')::date + 31)::text d")).d, [SV_BATH])).slots).toEqual([]); // beyond horizon
    expect((await slots(A, (await one("select ((now() at time zone 'Africa/Nairobi')::date - 1)::text d")).d, [SV_BATH])).slots).toEqual([]); // past
    // close Sundays: the next Sunday has no slots
    await save({ hours: JSON.stringify([1, 2, 3, 4, 5, 6].map(function (d) { return { weekday: d, open: "09:00", close: "17:00" }; })) });
    var sunday = (await one("select ((now() at time zone 'Africa/Nairobi')::date + ((7 - extract(dow from now() at time zone 'Africa/Nairobi')::int) % 7 + 7))::text d")).d;
    expect((await slots(A, sunday, [SV_BATH])).slots).toEqual([]);
    await save();
  });
});

describe("submitting a request", function () {
  it("stores a request, normalises the phone and returns only a reference", async function () {
    var r = await submit({ breed: "Labrador", notes: "Nervous around dryers" });
    expect(r.ok).toBe(true); expect(r.reference).toMatch(/^R-[0-9A-F]{8}$/);
    expect(Object.keys(r).sort()).toEqual(["ok", "reference"]);
    var row = await one("select * from public.pet_booking_requests where reference = $1", [r.reference]);
    expect(row.phone).toBe("254711222333"); expect(row.status).toBe("new"); expect(row.duration_minutes).toBe(60);
    expect(row.service_summary).toBe("Bath"); expect(row.consent_at).not.toBeNull();
  });

  it("an identical resubmission returns the same reference, and requests do not hold the slot", async function () {
    var a = await submit({ pet: "Dup", phone: "0722000001" });
    var b = await submit({ pet: "Dup", phone: "0722000001" });
    expect(b.reference).toBe(a.reference);
    var other = await submit({ pet: "Someone else's dog", phone: "0733000002", name: "Bob Otieno" }); // same time, different person
    expect(other.ok).toBe(true); expect(other.reference).not.toBe(a.reference);
  });

  it("validates every field", async function () {
    var cases = [
      [{ consent: false }, "CONSENT_REQUIRED"], [{ name: "A" }, "INVALID_NAME"], [{ name: "x".repeat(81) }, "INVALID_NAME"],
      [{ phone: "12345" }, "INVALID_PHONE"], [{ phone: "" }, "INVALID_PHONE"], [{ pet: "  " }, "INVALID_PET"], [{ pet: "p".repeat(61) }, "INVALID_PET"],
      [{ species: "Dragon" }, "INVALID_SPECIES"], [{ notes: "n".repeat(301) }, "NOTES_TOO_LONG"], [{ breed: "b".repeat(61) }, "INVALID_BREED"],
      [{ svcs: [SV_STAY] }, "INVALID_SERVICES"], [{ svcs: [SV_B] }, "INVALID_SERVICES"], [{ svcs: [] }, "INVALID_SERVICES"],
    ];
    for (var c of cases) { var r = await submit(Object.assign({ phone: "0744000009", pet: "V" }, c[0])); expect([JSON.stringify(c[0]).slice(0, 40), r.error]).toEqual([JSON.stringify(c[0]).slice(0, 40), c[1]]); }
  });

  it("re-checks the time on the server", async function () {
    expect((await submit({ phone: "0755000001", start: await local(DAY, "09:10") })).error).toBe("NOT_A_SLOT");
    expect((await submit({ phone: "0755000001", start: await local(DAY, "16:30") })).error).toBe("OUTSIDE_HOURS"); // 60 min would end 17:30
    expect((await submit({ phone: "0755000001", start: await local(DAY, "07:00") })).error).toBe("OUTSIDE_HOURS");
    expect((await submit({ phone: "0755000001", start: new Date(Date.now() + 3600000).toISOString() })).error).toBe("TOO_SOON");
    var far = (await one("select ((now() at time zone 'Africa/Nairobi')::date + 40)::text d")).d;
    expect((await submit({ phone: "0755000001", start: await local(far, "10:00") })).error).toBe("TOO_FAR");
    // a full slot is refused
    var start = await local(DAY, "14:00");
    await db.query(`insert into public.pet_bookings (salon_id, customer_id, pet_id, starts_at, ends_at, status)
      values ($1,'c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',$2::timestamptz,$2::timestamptz + interval '1 hour','booked')`, [A, start]);
    expect((await submit({ phone: "0755000001", start: start })).error).toBe("SLOT_FULL");
    await db.query("delete from public.pet_bookings where salon_id = $1", [A]);
  });

  it("silently drops submissions that fill the hidden field", async function () {
    var before = await count("pet_booking_requests");
    var r = await submit({ phone: "0766000001", site: "http://spam.example" });
    expect(r.ok).toBe(true); expect(r.reference).toMatch(/^R-/);
    expect(await count("pet_booking_requests")).toBe(before);
  });

  it("limits one phone number to 3 requests a day", async function () {
    var times = ["11:00", "12:00", "13:00", "15:00"];
    var results = [];
    for (var t of times) results.push(await submit({ phone: "0777000001", pet: "Rate", start: await local(DAY, t) }));
    expect(results.slice(0, 3).every(function (r) { return r.ok; })).toBe(true);
    expect(results[3].error).toBe("TOO_MANY_REQUESTS");
  });

  it("limits a business to 40 requests an hour", async function () {
    await db.query(`insert into public.pet_booking_requests (salon_id, reference, service_ids, service_summary, starts_at, duration_minutes, customer_name, phone, pet_name, species, consent_at)
      select $1, 'R-' || lpad(upper(to_hex(g)), 8, '0'), array['${SV_BATH}']::uuid[], 'Bath', now() + interval '5 days', 60, 'Load Test', '25470000' || lpad(g::text, 4, '0'), 'P', 'Dog', now() from generate_series(1, 40) g`, [A]);
    expect((await submit({ phone: "0788000001", pet: "Late" })).error).toBe("TOO_MANY_REQUESTS");
    await db.query("delete from public.pet_booking_requests where customer_name = 'Load Test'");
  });
});

describe("anonymous access is limited to the three public functions", function () {
  it("visitors can use the public functions", async function () {
    await db.exec("set role anon");
    try {
      expect((await one("select public.pet_public_booking_info($1) r", [A])).r.enabled).toBe(true);
      expect((await one("select public.pet_public_slots($1,$2::date,$3::uuid[]) r", [A, DAY, ids([SV_BATH])])).r.ok).toBe(true);
      expect((await one("select public.pet_public_submit_request($1,$2::uuid[],$3::timestamptz,'Visitor One','0799000001','Pip','Cat',null,null,true,null) r", [A, ids([SV_BATH]), await local(DAY, "15:30")])).r.ok).toBe(true);
    } finally { await db.exec("reset role"); }
  });

  it("visitors cannot read tables, run staff functions or call the helpers", async function () {
    await db.exec("set role anon");
    try {
      for (var t of ["pet_booking_requests", "pet_public_booking_settings", "pet_pets", "pet_bookings", "pet_services", "customers"]) {
        await expect(db.query("select * from public." + t)).rejects.toThrow(/permission denied/);
      }
      await expect(db.query("insert into public.pet_booking_requests (salon_id) values ($1)", [A])).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.pet_accept_booking_request(gen_random_uuid(), null, null)")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.pet_decline_booking_request(gen_random_uuid(), null)")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.pet_save_public_booking_settings(true,'Africa/Nairobi',30,4,30,1,'[]'::jsonb)")).rejects.toThrow(/permission denied/);
      for (var fn of ["pet_public_is_open(gen_random_uuid())", "pet_public_slot_check(gen_random_uuid(), now(), 30)", "pet_norm_phone('0711')", "pet_hours_valid('[]'::jsonb)", "pet_public_service_minutes(gen_random_uuid(), '{}'::uuid[])"]) {
        await expect(db.query("select public." + fn)).rejects.toThrow(/permission denied/);
      }
    } finally { await db.exec("reset role"); }
  });

  it("the signed-in app can read its own requests but cannot write the tables directly", async function () {
    await as(A);
    await db.exec("set role authenticated");
    try {
      expect(Number((await one("select count(*)::int n from public.pet_booking_requests")).n)).toBeGreaterThan(0);
      await expect(db.query("update public.pet_booking_requests set status = 'accepted'")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from public.pet_booking_requests")).rejects.toThrow(/permission denied/);
      await expect(db.query("update public.pet_public_booking_settings set enabled = false")).rejects.toThrow(/permission denied/);
      await as(B);
      expect(Number((await one("select count(*)::int n from public.pet_booking_requests")).n)).toBe(0);
    } finally { await db.exec("reset role"); }
  });
});

describe("staff accept and decline", function () {
  it("accepting creates the customer, pet and booking, marks marketing opt-out, and is repeatable", async function () {
    await as(A);
    var req = await submit({ name: "Grace Njeri", phone: "+254 733 111 222", pet: "Milo", species: "Cat", breed: "Siamese", notes: "Likes treats", start: await local(DAY, "11:00") });
    var rid = (await one("select id from public.pet_booking_requests where reference = $1", [req.reference])).id;
    var booking = (await one("select public.pet_accept_booking_request($1, $2, null) b", [rid, STAFF1])).b;
    var bk = await one("select * from public.pet_bookings where id = $1", [booking]);
    expect(bk.status).toBe("booked"); expect(bk.staff_id).toBe(STAFF1); expect(bk.notes).toMatch(new RegExp(req.reference));
    var cu = await one("select * from public.customers where phone = '254733111222'");
    expect(cu.name).toBe("Grace Njeri"); expect(cu.marketing_opt_out).toBe(true);
    var pet = await one("select * from public.pet_pets where id = $1", [bk.pet_id]);
    expect([pet.name, pet.species, pet.breed]).toEqual(["Milo", "Cat", "Siamese"]);
    expect(await count("pet_booking_services", "booking_id = '" + booking + "'")).toBe(1);
    expect((await one("select status, booking_id from public.pet_booking_requests where id = $1", [rid]))).toEqual({ status: "accepted", booking_id: booking });
    expect((await one("select public.pet_accept_booking_request($1, $2, null) b", [rid, STAFF1])).b).toBe(booking); // repeat is harmless
    expect(await count("customers", "phone = '254733111222'")).toBe(1);
  });

  it("matches an existing customer by phone in any format, and an existing pet by name", async function () {
    await as(A);
    await db.exec(`insert into public.customers (id, salon_id, name, phone, marketing_opt_out) values ('c0000000-0000-0000-0000-000000000099','${A}','Old Friend','0744 555 666', false);
      insert into public.pet_pets (id, salon_id, customer_id, name, species) values ('e0000000-0000-0000-0000-000000000099','${A}','c0000000-0000-0000-0000-000000000099','Biscuit','Dog');`);
    var req = await submit({ name: "Different Name", phone: "254744555666", pet: "biscuit", start: await local(DAY, "12:00") });
    var rid = (await one("select id from public.pet_booking_requests where reference = $1", [req.reference])).id;
    var booking = (await one("select public.pet_accept_booking_request($1, null, null) b", [rid])).b;
    var bk = await one("select customer_id, pet_id from public.pet_bookings where id = $1", [booking]);
    expect(bk.customer_id).toBe("c0000000-0000-0000-0000-000000000099");
    expect(bk.pet_id).toBe("e0000000-0000-0000-0000-000000000099");
    expect((await one("select marketing_opt_out from public.customers where id = $1", [bk.customer_id])).marketing_opt_out).toBe(false); // existing customer untouched
  });

  it("a conflicting accept fails cleanly and leaves no half-made customer or pet", async function () {
    await as(A);
    // the request arrives first (requests do not hold the slot) ...
    var req = await submit({ name: "Conflict Person", phone: "0700123123", pet: "Zippy", start: await local(DAY, "15:30") });
    var rid = (await one("select id from public.pet_booking_requests where reference = $1", [req.reference])).id;
    // ... then staff book the same groomer for an overlapping time before accepting it
    var start = await local(DAY, "15:00");
    await db.query(`insert into public.pet_bookings (salon_id, customer_id, pet_id, staff_id, starts_at, ends_at, status)
      values ($1,'c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',$2,$3::timestamptz,$3::timestamptz + interval '1 hour','booked')`, [A, STAFF1, start]);
    await expect(db.query("select public.pet_accept_booking_request($1, $2, null)", [rid, STAFF1])).rejects.toThrow(/BOOKING_CONFLICT_STAFF/);
    expect(await count("customers", "phone = '254700123123'")).toBe(0);
    expect(await count("pet_pets", "name = 'Zippy'")).toBe(0);
    expect((await one("select status from public.pet_booking_requests where id = $1", [rid])).status).toBe("new");
    // accepting at another time (override) works
    var ok = (await one("select public.pet_accept_booking_request($1, $2, $3::timestamptz) b", [rid, STAFF1, await local(DAY, "16:00")])).b;
    expect(ok).toBeTruthy();
  });

  it("refuses archived pets, past times and other businesses' requests", async function () {
    await as(A);
    await db.exec(`insert into public.customers (id, salon_id, name, phone) values ('c0000000-0000-0000-0000-000000000088','${A}','Archive Owner','0711888888');
      insert into public.pet_pets (id, salon_id, customer_id, name, species) values ('e0000000-0000-0000-0000-000000000088','${A}','c0000000-0000-0000-0000-000000000088','Ghost','Dog');
      update public.pet_pets set archived_at = now() where id = 'e0000000-0000-0000-0000-000000000088';`);
    var req = await submit({ phone: "0711888888", pet: "Ghost", start: await local(DAY, "09:30") });
    var rid = (await one("select id from public.pet_booking_requests where reference = $1", [req.reference])).id;
    await expect(db.query("select public.pet_accept_booking_request($1, null, null)", [rid])).rejects.toThrow(/PET_ARCHIVED/);
    var req2 = await submit({ phone: "0711999999", pet: "Late", start: await local(DAY, "09:00") });
    var rid2 = (await one("select id from public.pet_booking_requests where reference = $1", [req2.reference])).id;
    await db.query("update public.pet_booking_requests set starts_at = now() - interval '2 hours' where id = $1", [rid2]);
    await expect(db.query("select public.pet_accept_booking_request($1, null, null)", [rid2])).rejects.toThrow(/START_IN_PAST/);
    await as(B);
    await expect(db.query("select public.pet_accept_booking_request($1, null, null)", [rid])).rejects.toThrow(/REQUEST_NOT_FOUND/);
    await expect(db.query("select public.pet_decline_booking_request($1, 'no')", [rid])).rejects.toThrow(/REQUEST_NOT_FOUND/);
    await as("");
    await expect(db.query("select public.pet_accept_booking_request($1, null, null)", [rid])).rejects.toThrow(/NOT_AUTHENTICATED/);
  });

  it("declining records the reason, is repeatable, and blocks a later accept", async function () {
    await as(A);
    var req = await submit({ phone: "0712121212", pet: "Decl", start: await local(DAY, "13:30") });
    var rid = (await one("select id from public.pet_booking_requests where reference = $1", [req.reference])).id;
    await db.query("select public.pet_decline_booking_request($1, '  Fully booked that day  ')", [rid]);
    var row = await one("select status, decline_reason, handled_at from public.pet_booking_requests where id = $1", [rid]);
    expect(row.status).toBe("declined"); expect(row.decline_reason).toBe("Fully booked that day"); expect(row.handled_at).not.toBeNull();
    await db.query("select public.pet_decline_booking_request($1, 'again')", [rid]);
    await expect(db.query("select public.pet_accept_booking_request($1, null, null)", [rid])).rejects.toThrow(/REQUEST_NOT_NEW/);
  });

  it("writes an audit trail for requests and settings", async function () {
    expect(await count("pet_audit_log", "table_name = 'pet_booking_requests'")).toBeGreaterThan(0);
    expect(await count("pet_audit_log", "table_name = 'pet_public_booking_settings'")).toBeGreaterThan(0);
  });
});
