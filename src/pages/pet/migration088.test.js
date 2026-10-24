import fs from "fs";
import path from "path";

var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/088_pet_bookings.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");

describe("migration 088 (pet bookings)", function () {
  it("installs btree_gist and creates both tables with salon_id", function () {
    expect(code).toMatch(/create extension if not exists btree_gist/);
    ["pet_bookings", "pet_booking_services"].forEach(function (t) {
      var block = code.slice(code.indexOf("create table public." + t));
      block = block.slice(0, block.indexOf("\n);") + 3);
      expect(block).toMatch(/salon_id uuid not null references public\.salons\(id\) on delete cascade/);
    });
  });
  it("prevents overlapping active bookings for the same staff member and the same pet", function () {
    expect(code).toMatch(/pet_bookings_no_staff_overlap exclude using gist \(\s*staff_id with =,\s*tstzrange\(starts_at, ends_at, '\[\)'\) with &&\s*\) where \(staff_id is not null and status not in \('cancelled', 'no-show'\)\)/);
    expect(code).toMatch(/pet_bookings_no_pet_overlap exclude using gist \(\s*pet_id with =,\s*tstzrange\(starts_at, ends_at, '\[\)'\) with &&\s*\) where \(status not in \('cancelled', 'no-show'\)\)/);
  });
  it("validates the time range and the status list", function () {
    expect(code).toMatch(/ends_at > starts_at and ends_at - starts_at <= interval '24 hours'/);
    expect(code).toMatch(/status in \('pending', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show'\)/);
  });
  it("keeps history: bookings restrict deleting customers, pets and services", function () {
    expect(code).toMatch(/customer_id uuid not null references public\.customers\(id\) on delete restrict/);
    expect(code).toMatch(/pet_id uuid not null references public\.pet_pets\(id\) on delete restrict/);
    expect(code).toMatch(/service_id uuid not null references public\.pet_services\(id\) on delete restrict/);
  });
  it("is read-only for the client: select policies only, no write grants", function () {
    var policies = code.match(/create policy "pet_[a-z_]+" *\n? *on public\.[a-z_]+ for [a-z]+/g) || [];
    expect(policies.length).toBe(2);
    policies.forEach(function (p) { expect(p).toMatch(/for select/); });
    expect(code).toMatch(/grant select on public\.pet_bookings to authenticated/);
    expect(code).not.toMatch(/grant (insert|update|delete|all)/i);
    expect(code).toMatch(/revoke all on public\.pet_bookings from anon/);
  });
  it("all three functions are security definer with a pinned search_path and tenant checks", function () {
    var fns = code.match(/create or replace function public\.pet_[a-z_]+[\s\S]*?\n\$\$;/g) || [];
    expect(fns.length).toBe(3);
    fns.forEach(function (f) {
      expect(f).toMatch(/security definer/);
      expect(f).toMatch(/set search_path = public, extensions, pg_temp/);
      expect(f).toMatch(/auth_salon_id\(\)/);
      expect(f).toMatch(/NOT_AUTHENTICATED/);
    });
  });
  it("create checks the customer, pet, staff and services belong to the caller's business", function () {
    var f = code.slice(code.indexOf("function public.pet_create_booking"), code.indexOf("function public.pet_update_booking"));
    expect(f).toMatch(/c\.id = p_customer_id and c\.salon_id = v_salon/);
    expect(f).toMatch(/p\.id = p_pet_id and p\.salon_id = v_salon and p\.customer_id = p_customer_id/);
    expect(f).toMatch(/s\.id = p_staff_id and s\.salon_id = v_salon/);
    expect(f).toMatch(/s\.salon_id = v_salon and s\.active/);
  });
  it("service price and name come from the catalogue, not the client", function () {
    expect(code).toMatch(/select v_salon, v_id, s\.id, s\.name, s\.price, s\.duration_minutes\s+from public\.pet_services s/);
    expect(code).not.toMatch(/p_price|p_service_name/);
  });
  it("enforces the status path in the database", function () {
    expect(code).toMatch(/v_status = 'in-progress' and p_status = 'completed'/);
    expect(code).toMatch(/INVALID_STATUS_CHANGE/);
  });
  it("revokes execute from anon/public and grants authenticated", function () {
    expect((code.match(/revoke execute on function public\.pet_[a-z_]+\([^)]*\) from public, anon/g) || []).length).toBe(3);
    expect((code.match(/grant execute on function public\.pet_[a-z_]+\([^)]*\) to authenticated/g) || []).length).toBe(3);
  });
  it("audits both tables and is additive", function () {
    expect(code).toMatch(/create trigger pet_bookings_audit/);
    expect(code).toMatch(/create trigger pet_booking_services_audit/);
    expect(code).not.toMatch(/drop\s+(table|column|policy)/i);
    expect(code).not.toMatch(/alter\s+table\s+public\.(customers|salons|staff|bookings|sales|stock|auto_|pet_pets|pet_services)/i);
  });
});
