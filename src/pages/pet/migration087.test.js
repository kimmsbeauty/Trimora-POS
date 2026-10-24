import fs from "fs";
import path from "path";

var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/087_pet_audit_log.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
var PET_TABLES = ["pet_pets", "pet_vaccinations", "pet_customer_profiles", "pet_services", "pet_roles", "pet_staff_roles"];

describe("migration 087 (pet audit log)", function () {
  it("audits every existing pet table on insert, update and delete", function () {
    PET_TABLES.forEach(function (t) {
      expect(code).toMatch(new RegExp("create trigger " + t + "_audit\\s+after insert or update or delete on public\\." + t + "\\s+for each row execute function public\\.pet_audit_row\\(\\)"));
    });
  });
  it("covers every pet table that has a salon_id in earlier migrations", function () {
    var dir = path.join(process.cwd(), "supabase/migrations");
    var created = {};
    fs.readdirSync(dir).filter(function (f) { return /^08[3-6]_pet/.test(f); }).forEach(function (f) {
      var m = fs.readFileSync(path.join(dir, f), "utf8").match(/create table public\.(pet_[a-z_]+)/g) || [];
      m.forEach(function (x) { created[x.replace("create table public.", "")] = true; });
    });
    Object.keys(created).forEach(function (t) { expect(PET_TABLES).toContain(t); });
    expect(Object.keys(created).length).toBe(PET_TABLES.length);
  });
  it("stores column NAMES only: no column that could hold row values", function () {
    var tbl = code.slice(code.indexOf("create table public.pet_audit_log"));
    tbl = tbl.slice(0, tbl.indexOf(");") + 2);
    expect(tbl).toMatch(/changed_columns\s+text\[\]/);
    expect(tbl).not.toMatch(/old_|new_|payload|\bdata\b|jsonb/i);
  });
  it("is append-only for clients: select policy only, no write policy or grant", function () {
    expect(code).toMatch(/create policy "pet_audit_log_select_own_salon"\s+on public\.pet_audit_log for select\s+to authenticated\s+using \(salon_id = auth_salon_id\(\)\)/);
    expect(code).not.toMatch(/create policy[^;]*pet_audit_log[^;]*for (insert|update|delete|all)/i);
    expect(code).toMatch(/grant select on public\.pet_audit_log to authenticated/);
    expect(code).not.toMatch(/grant (insert|update|delete|all)[^;]*pet_audit_log/i);
    expect(code).toMatch(/revoke all on public\.pet_audit_log from anon/);
  });
  it("trigger function is SECURITY DEFINER with an explicit search_path and is not client-callable", function () {
    expect(code).toMatch(/security definer\s+set search_path = public, pg_temp/);
    expect(code).toMatch(/revoke execute on function public\.pet_audit_row\(\) from public, anon, authenticated/);
  });
  it("validates the actor against staff of the SAME business and never blocks on a bad header", function () {
    expect(code).toMatch(/st\.id = v_hdr::uuid and st\.salon_id = r\.salon_id/);
    expect(code).toMatch(/exception when others then\s+v_actor := null/);
    expect(code).toMatch(/actor_asserted/);
  });
  it("is additive: creates new objects only, never alters or drops existing ones", function () {
    expect(code).not.toMatch(/drop\s+(table|column|policy|function|trigger)/i);
    expect(code).not.toMatch(/alter\s+table\s+public\.(customers|salons|staff|bookings|sales|stock|auto_|pet_(pets|vaccinations|customer|services|roles|staff))/i);
    expect(code).not.toMatch(/truncate|delete\s+from/i);
  });
  it("documents rollback, status and the honest limits", function () {
    expect(sql).toMatch(/ROLLBACK/);
    expect(sql).toMatch(/applied to production 2026-10-24/);
    expect(sql).toMatch(/attribution, not authentication/);
    expect(sql).toMatch(/Phase 7/);
  });
});
