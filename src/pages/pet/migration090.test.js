// Static checks on migration 090 and its rollback script (the behaviour is tested in
// migration090.db.test.js against a real Postgres engine).
import fs from "fs";
import path from "path";

function read(rel) { return fs.readFileSync(path.join(process.cwd(), rel), "utf8"); }
var up = read("supabase/migrations/090_pet_booking_statuses.sql");
var down = read("supabase/sql/090_rollback_pet_booking_statuses.sql");
var m088 = read("supabase/migrations/088_pet_bookings.sql");

function functionsOf(text) {
  var a = text.indexOf("create or replace function public.pet_create_booking(");
  var b = text.search(/-- This project's default privileges|-- CREATE OR REPLACE keeps/);
  return text.slice(a, b);
}
function code(text) { return text.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n"); }

describe("migration 090 (SQL text)", function () {
  it("is marked as not applied and says where the rollback is", function () {
    expect(up).toMatch(/NOT applied anywhere/);
    expect(up).toMatch(/090_rollback_pet_booking_statuses\.sql/);
  });
  it("swaps the status rule inside the right steps, in the right order", function () {
    var c = code(up);
    var iDrop = c.indexOf("drop constraint pet_bookings_status_check");
    var iUpd = c.indexOf("set status = 'booked' where status in ('pending', 'confirmed')");
    var iAdd = c.indexOf("add constraint pet_bookings_status_check");
    expect(iDrop).toBeGreaterThan(-1); expect(iUpd).toBeGreaterThan(iDrop); expect(iAdd).toBeGreaterThan(iUpd);
    expect(c).toMatch(/check \(status in \('booked', 'checked-in', 'in-progress', 'ready', 'completed', 'cancelled', 'no-show'\)\)/);
    expect(c).toMatch(/alter column status set default 'booked'/);
  });
  it("drops the old constraint without IF EXISTS, so a wrong name fails loudly and rolls everything back", function () {
    expect(code(up)).not.toMatch(/drop constraint if exists/i);
  });
  it("defines the new status flow including ready, and nothing else about the flow", function () {
    var c = code(up);
    expect(c).toMatch(/v_status = 'booked'\s+and p_status in \('checked-in', 'cancelled', 'no-show'\)/);
    expect(c).toMatch(/v_status = 'checked-in'\s+and p_status in \('in-progress', 'cancelled'\)/);
    expect(c).toMatch(/v_status = 'in-progress' and p_status = 'ready'/);
    expect(c).toMatch(/v_status = 'ready'\s+and p_status = 'completed'/);
    expect(c).toMatch(/p_status is null or not \(/);
    expect(c).toMatch(/if v_status not in \('booked', 'checked-in'\) then raise exception 'BOOKING_NOT_EDITABLE'/);
    expect(c).toMatch(/else 'booked' end/);
  });
  it("keeps no trace of the old statuses in the new functions", function () {
    var fn = code(functionsOf(up));
    expect(fn).not.toMatch(/'pending'|'confirmed'/);
  });
  it("does not touch tables, indexes, policies, triggers or the overlap rules", function () {
    var c = code(up);
    expect(c).not.toMatch(/create table|drop table|create index|create policy|drop policy|create trigger|drop trigger|exclude using/i);
    expect(c).not.toMatch(/alter table public\.(?!pet_bookings\b)/i); // only the pet_bookings table is altered
    expect(c).not.toMatch(/\b(salons|customers|staff|auto_\w+|appointments)\b\s*(set|add|drop)/i); // no other module's tables
  });
  it("keeps the grants: anon out, signed-in devices in", function () {
    expect(code(up).match(/revoke execute on function public\.pet_\w+\([^)]*\) from public, anon;/g)).toHaveLength(3);
    expect(code(up).match(/grant execute on function public\.pet_\w+\([^)]*\) to authenticated;/g)).toHaveLength(3);
    expect(code(up)).not.toMatch(/grant\b[^;]*\bto\s+(anon|public)\b/i);
  });
  it("only changes the intended lines of the three functions compared with 088", function () {
    var a = functionsOf(m088).split("\n"); var b = functionsOf(up).split("\n");
    // 090 adds a 2-line note above pet_create_booking; everything else is line-for-line comparable
    var bb = b.slice(b.findIndex(function (l) { return /^create or replace function public\.pet_create_booking/.test(l); }));
    var aa = a.slice(a.findIndex(function (l) { return /^create or replace function public\.pet_create_booking/.test(l); }));
    var changed = [];
    for (var i = 0, j = 0; i < aa.length && j < bb.length; i++, j++) if (aa[i] !== bb[j]) changed.push(aa[i].trim());
    expect(changed.some(function (l) { return /else 'confirmed' end/.test(l); })).toBe(true);
    // the changed 088 lines are only status-related
    changed.forEach(function (l) { expect(l).toMatch(/confirmed|pending|in-progress|checked-in|completed|cancelled|no-show|if not \(|is pending|v_status/); });
  });
});

describe("rollback script (SQL text)", function () {
  it("is one transaction and restores the 088 rule and default", function () {
    expect(code(down)).toMatch(/^\s*begin;/m); expect(code(down)).toMatch(/commit;\s*$/);
    expect(code(down)).toMatch(/check \(status in \('pending', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show'\)\)/);
    expect(code(down)).toMatch(/set default 'confirmed'/);
    expect(code(down)).toMatch(/set status = 'confirmed' where status = 'booked'/);
    expect(code(down)).toMatch(/set status = 'in-progress' where status = 'ready'/);
  });
  it("restores the three functions verbatim from 088", function () {
    var a = code(functionsOf(m088)).replace(/\s+/g, " ").trim();
    var b = code(functionsOf(down)).replace(/\s+/g, " ").trim();
    expect(b).toBe(a);
  });
  it("is kept outside the migrations folder so it can never be applied automatically", function () {
    expect(fs.existsSync(path.join(process.cwd(), "supabase/migrations/090_rollback_pet_booking_statuses.sql"))).toBe(false);
  });
});
