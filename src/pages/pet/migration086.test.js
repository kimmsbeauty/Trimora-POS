import fs from "fs";
import path from "path";

var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/086_pet_roles.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");

function tableBlock(name) {
  var block = code.slice(code.indexOf("create table public." + name));
  return block.slice(0, block.indexOf("\n);") + 3);
}

describe("migration 086 (pet roles)", function () {
  it("both tables have salon_id not null referencing salons with cascade", function () {
    ["pet_roles", "pet_staff_roles"].forEach(function (t) {
      expect(tableBlock(t)).toMatch(/salon_id uuid not null references public\.salons\(id\) on delete cascade/);
    });
  });
  it("permissions must be a JSON object of booleans", function () {
    expect(code).toMatch(/jsonb_typeof\(permissions\) = 'object'/);
    expect(code).toMatch(/jsonb_path_exists\(permissions, '\$\.\* \? \(@\.type\(\) != "boolean"\)'\)/);
  });
  it("role names are unique per business, case-insensitively", function () {
    expect(code).toMatch(/create unique index pet_roles_salon_name_uidx[\s\S]*\(salon_id, lower\(btrim\(name\)\)\)/);
  });
  it("allows one role per staff member and blocks deleting an assigned role", function () {
    expect(code).toMatch(/create unique index pet_staff_roles_staff_uidx on public\.pet_staff_roles \(staff_id\)/);
    expect(tableBlock("pet_staff_roles")).toMatch(/role_id uuid not null references public\.pet_roles\(id\),/);
    expect(tableBlock("pet_staff_roles")).not.toMatch(/role_id[^\n]*on delete (cascade|set null)/);
  });
  it("enables RLS with four own-salon policies per table, authenticated only", function () {
    ["pet_roles", "pet_staff_roles"].forEach(function (t) {
      expect(code).toMatch(new RegExp("alter table public\\." + t + " enable row level security"));
      var policies = code.match(new RegExp("create policy \"" + t + "_[a-z]+_own_salon\"[\\s\\S]*?;", "g")) || [];
      expect(policies.length).toBe(4);
      policies.forEach(function (p) { expect(p).toMatch(/auth_salon_id\(\)/); expect(p).toMatch(/to authenticated/); });
    });
  });
  it("assignment insert/update check that the staff row and the role belong to the caller's salon", function () {
    ["insert", "update"].forEach(function (op) {
      var p = code.match(new RegExp("create policy \"pet_staff_roles_" + op + "_own_salon\"[\\s\\S]*?;"))[0];
      expect(p).toMatch(/from public\.staff s where s\.id = staff_id and s\.salon_id = auth_salon_id\(\)/);
      expect(p).toMatch(/from public\.pet_roles r where r\.id = role_id and r\.salon_id = auth_salon_id\(\)/);
    });
  });
  it("revokes anon and dangerous privileges on both tables", function () {
    ["pet_roles", "pet_staff_roles"].forEach(function (t) {
      expect(code).toMatch(new RegExp("revoke all on public\\." + t + " from anon"));
      expect(code).toMatch(new RegExp("revoke truncate, references, trigger on public\\." + t + " from authenticated"));
    });
  });
  it("is additive and leaves Salon/Auto tables and PIN functions alone", function () {
    expect(code).not.toMatch(/drop\s+(table|column|policy|function)/i);
    expect(code).not.toMatch(/alter\s+table\s+public\.(customers|salons|staff|bookings|sales|stock|auto_)/i);
    expect(code).not.toMatch(/truncate\s+table|delete\s+from|update\s+public\./i);
    expect(code).not.toMatch(/pgcrypto|salon_pins|crypt\(/i);
  });
  it("does not introduce allergy or medical fields", function () {
    expect(code).not.toMatch(/allerg|medical/i);
  });
});
