import fs from "fs";
import path from "path";

var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/085_pet_services.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");

describe("migration 085 (pet services)", function () {
  it("has salon_id not null referencing salons", function () {
    var block = code.slice(code.indexOf("create table public.pet_services"));
    block = block.slice(0, block.indexOf("\n);") + 3);
    expect(block).toMatch(/salon_id uuid not null references public\.salons\(id\) on delete cascade/);
  });
  it("restricts category, species, price and duration", function () {
    expect(code).toMatch(/category in \('Grooming', 'Boarding', 'Add-on'\)/);
    expect(code).toMatch(/species <@ array\['Dog', 'Cat', 'Rabbit', 'Other'\]/);
    expect(code).toMatch(/price integer not null check \(price >= 0/);
    expect(code).toMatch(/duration_minutes > 0 and duration_minutes <= 1440/);
  });
  it("prevents duplicate names within a category per business", function () {
    expect(code).toMatch(/create unique index pet_services_salon_category_name_uidx[\s\S]*\(salon_id, category, lower\(btrim\(name\)\)\)/);
  });
  it("enables RLS with four policies scoped by auth_salon_id() to authenticated", function () {
    expect(code).toMatch(/alter table public\.pet_services enable row level security/);
    var policies = code.match(/create policy "pet_services_[a-z]+_own_salon"[\s\S]*?;/g) || [];
    expect(policies.length).toBe(4);
    policies.forEach(function (p) { expect(p).toMatch(/auth_salon_id\(\)/); expect(p).toMatch(/to authenticated/); });
  });
  it("revokes anon and dangerous privileges", function () {
    expect(code).toMatch(/revoke all on public\.pet_services from anon/);
    expect(code).toMatch(/revoke truncate, references, trigger on public\.pet_services from authenticated/);
  });
  it("is additive and leaves Salon/Auto tables alone", function () {
    expect(code).not.toMatch(/drop\s+(table|column|policy|function)/i);
    expect(code).not.toMatch(/alter\s+table\s+public\.(customers|salons|staff|bookings|sales|stock|auto_)/i);
    expect(code).not.toMatch(/truncate\s+table|delete\s+from|update\s+public\./i);
  });
});
