import fs from "fs";
import path from "path";

var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/084_pet_customer_profiles.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");

describe("migration 084 (pet customer profiles)", function () {
  it("has salon_id not null referencing salons", function () {
    var block = code.slice(code.indexOf("create table public.pet_customer_profiles"));
    block = block.slice(0, block.indexOf("\n);") + 3);
    expect(block).toMatch(/salon_id uuid not null references public\.salons\(id\) on delete cascade/);
    expect(block).toMatch(/customer_id uuid not null references public\.customers\(id\) on delete cascade/);
  });
  it("allows one profile per customer", function () {
    expect(code).toMatch(/create unique index pet_customer_profiles_customer_uidx[\s\S]*\(salon_id, customer_id\)/);
  });
  it("restricts channels to sms/whatsapp/email", function () {
    expect(code).toMatch(/preferred_channels <@ array\['sms', 'whatsapp', 'email'\]/);
  });
  it("enables RLS with four policies scoped by auth_salon_id() to authenticated", function () {
    expect(code).toMatch(/alter table public\.pet_customer_profiles enable row level security/);
    var policies = code.match(/create policy "pet_customer_profiles_[a-z]+_own_salon"[\s\S]*?;/g) || [];
    expect(policies.length).toBe(4);
    policies.forEach(function (p) { expect(p).toMatch(/auth_salon_id\(\)/); expect(p).toMatch(/to authenticated/); });
  });
  it("blocks a cross-tenant customer in insert/update", function () {
    expect(code).toMatch(/c\.id = customer_id and c\.salon_id = auth_salon_id\(\)/);
  });
  it("revokes anon and dangerous privileges", function () {
    expect(code).toMatch(/revoke all on public\.pet_customer_profiles from anon/);
    expect(code).toMatch(/revoke truncate, references, trigger on public\.pet_customer_profiles from authenticated/);
  });
  it("is additive and does not touch customers or Salon/Auto objects", function () {
    expect(code).not.toMatch(/drop\s+(table|column|policy|function)/i);
    expect(code).not.toMatch(/alter\s+table\s+public\.(customers|salons|staff|bookings|sales|stock|auto_)/i);
    expect(code).not.toMatch(/truncate\s+table|delete\s+from|update\s+public\./i);
  });
  it("stores no health or medical fields", function () {
    expect(code).not.toMatch(/allerg|medical|medication|diagnos/i);
  });
});
