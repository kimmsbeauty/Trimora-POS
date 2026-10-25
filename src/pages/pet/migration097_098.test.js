import fs from "fs";
import path from "path";

function code(f) {
  return fs.readFileSync(path.join(process.cwd(), "supabase/migrations/" + f), "utf8").split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
}
var a = code("097_pet_archiving.sql");
var r = code("098_pet_care_reminder_windows.sql");

describe("migration 097 (pet archiving)", function () {
  it("never deletes or drops anything", function () {
    expect(a).not.toMatch(/drop\s+(table|column)|delete\s+from|truncate\s+table/i);
  });
  it("adds archive columns; existing pets stay active (no default, no backfill)", function () {
    expect(a).toMatch(/add column if not exists archived_at timestamptz,/);
    expect(a).not.toMatch(/update\s+public\./i);
  });
  it("limits reasons and blocks archiving with active work", function () {
    expect(a).toMatch(/'passed-away', 'moved-away', 'inactive', 'other'/);
    expect(a).toMatch(/PET_HAS_ACTIVE_WORK/);
    expect(a).toMatch(/'booked', 'checked-in', 'in-progress', 'ready'/);
    expect(a).toMatch(/'reserved', 'occupied'/);
  });
  it("blocks only NEW bookings and stays for archived pets", function () {
    expect(a).toMatch(/before insert on public\.pet_bookings/);
    expect(a).toMatch(/before insert on public\.pet_boarding_stays/);
    expect(a).not.toMatch(/before (update|delete)[^;]*pet_(bookings|boarding_stays|invoices|payments)/i);
  });
  it("does not touch the species constraint (083 already has it)", function () { expect(a).not.toMatch(/species/i); });
});

describe("migration 098 (care reminder windows)", function () {
  it("existing rows default to vaccination", function () { expect(r).toMatch(/record_type text not null default 'vaccination'/); });
  it("bounds warn_days and scopes by tenant with RLS, anon revoked", function () {
    expect(r).toMatch(/warn_days between 1 and 730/);
    expect(r).toMatch(/enable row level security/);
    expect((r.match(/create policy/g) || []).length).toBe(4);
    expect(r).toMatch(/revoke all on public\.pet_reminder_settings from anon/);
  });
  it("is additive", function () { expect(r).not.toMatch(/drop\s+(table|column)|delete\s+from|truncate\s+table/i); });
});
