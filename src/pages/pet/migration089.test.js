import fs from "fs";
import path from "path";

var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/089_pet_boarding.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");

describe("migration 089 (pet boarding)", function () {
  it("both tables have salon_id not null referencing salons with cascade", function () {
    ["pet_kennels", "pet_boarding_stays"].forEach(function (t) {
      var block = code.slice(code.indexOf("create table public." + t));
      expect(block.slice(0, 400)).toMatch(/salon_id uuid not null references public\.salons\(id\) on delete cascade/);
    });
  });
  it("uses the Lovable status names and a derived kennel status (only maintenance is stored)", function () {
    expect(code).toMatch(/status in \('reserved', 'occupied', 'checked-out', 'cancelled'\)/);
    expect(code).toMatch(/maintenance boolean not null default false/);
    expect(code).not.toMatch(/kennel_status|status in \('available'/);
  });
  it("prevents double-booking a kennel or a pet with exclusion constraints on active stays", function () {
    expect(code).toMatch(/constraint pet_stays_no_kennel_overlap exclude using gist \(\s*kennel_id with =/);
    expect(code).toMatch(/constraint pet_stays_no_pet_overlap exclude using gist \(\s*pet_id with =/);
    expect(code.match(/where \(status in \('reserved', 'occupied'\)\)/g).length).toBe(2);
    expect(code.match(/daterange\(check_in_on, case when check_out_on = check_in_on then check_in_on \+ 1 else check_out_on end, '\[\)'\)/g).length).toBe(2);
    expect(code).toMatch(/create extension if not exists btree_gist with schema extensions/);
  });
  it("protects history: customers, pets and kennels with stays cannot be deleted", function () {
    expect(code).toMatch(/customer_id uuid not null references public\.customers\(id\) on delete restrict/);
    expect(code).toMatch(/pet_id uuid not null references public\.pet_pets\(id\) on delete restrict/);
    expect(code).toMatch(/kennel_id uuid not null references public\.pet_kennels\(id\) on delete restrict/);
    expect(code).toMatch(/service_id uuid references public\.pet_services\(id\) on delete set null/);
  });
  it("is read-only for the client: select policies only, no client write privileges", function () {
    ["pet_kennels", "pet_boarding_stays"].forEach(function (t) {
      expect(code).toMatch(new RegExp("alter table public\\." + t + " enable row level security"));
      var policies = code.match(new RegExp("create policy \"" + t + "_[a-z_]+\"[\\s\\S]*?;", "g")) || [];
      expect(policies.length).toBe(1);
      expect(policies[0]).toMatch(/for select to authenticated/);
      expect(policies[0]).toMatch(/salon_id = auth_salon_id\(\)/);
      expect(code).toMatch(new RegExp("revoke all on public\\." + t + " from anon"));
      expect(code).toMatch(new RegExp("revoke all on public\\." + t + " from authenticated"));
      expect(code).toMatch(new RegExp("grant select on public\\." + t + " to authenticated"));
    });
  });
  it("audits both tables with the shared audit trigger", function () {
    expect(code).toMatch(/create trigger pet_kennels_audit after insert or update or delete on public\.pet_kennels\s+for each row execute function public\.pet_audit_row\(\)/);
    expect(code).toMatch(/create trigger pet_boarding_stays_audit after insert or update or delete on public\.pet_boarding_stays\s+for each row execute function public\.pet_audit_row\(\)/);
  });
  it("defines six SECURITY DEFINER functions with a pinned search_path that re-check the caller's business", function () {
    var fns = code.match(/create or replace function public\.pet_[a-z_]+\([\s\S]*?\n\$\$;/g) || [];
    expect(fns.length).toBe(6);
    fns.forEach(function (f) {
      expect(f).toMatch(/security definer/);
      expect(f).toMatch(/set search_path = public, extensions, pg_temp/);
      expect(f).toMatch(/auth_salon_id\(\)/);
      expect(f).toMatch(/raise exception 'NOT_AUTHENTICATED'/);
    });
  });
  it("revokes EXECUTE from public and anon and grants it to authenticated for every function", function () {
    ["pet_save_kennel(uuid, text, text, text)", "pet_set_kennel_maintenance(uuid, boolean)", "pet_delete_kennel(uuid)",
      "pet_create_stay(uuid, uuid, uuid, date, date, uuid, text, text, boolean)", "pet_update_stay(uuid, uuid, date, date, text, text)",
      "pet_set_stay_status(uuid, text)"].forEach(function (sig) {
      expect(code).toContain("revoke execute on function public." + sig + " from public, anon;");
      expect(code).toContain("grant execute on function public." + sig + " to authenticated;");
    });
  });
  it("never trusts the client for prices: the rate comes from the catalogue", function () {
    expect(code).not.toMatch(/p_(nightly_)?rate|p_price/);
    expect(code).toMatch(/s\.category = 'Boarding'/);
  });
  it("is additive and leaves Salon/Auto tables and PIN functions alone", function () {
    expect(code).not.toMatch(/drop\s+(table|column|policy|function|trigger)/i);
    expect(code).not.toMatch(/alter\s+table\s+public\.(customers|salons|staff|bookings|sales|stock|auto_|pet_pets|pet_services|pet_bookings)/i);
    expect(code).not.toMatch(/truncate\s+table/i);
    expect(code).not.toMatch(/pgcrypto|salon_pins|crypt\(/i);
  });
});
