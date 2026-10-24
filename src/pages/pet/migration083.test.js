import fs from "fs";
import path from "path";

var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/083_pet_pets_vaccinations.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");

describe("migration 083 (pet pets + vaccinations)", function () {
  ["pet_pets", "pet_vaccinations"].forEach(function (t) {
    describe(t, function () {
      it("has salon_id not null referencing salons", function () {
        var block = code.slice(code.indexOf("create table public." + t));
        block = block.slice(0, block.indexOf(");") + 2);
        expect(block).toMatch(/salon_id uuid not null references public\.salons\(id\) on delete cascade/);
      });
      it("enables RLS with all four policies scoped by auth_salon_id()", function () {
        expect(code).toMatch(new RegExp("alter table public\\." + t + " enable row level security"));
        ["select", "insert", "update", "delete"].forEach(function (op) {
          expect(code).toMatch(new RegExp('create policy "' + t + "_" + op + '_own_salon"\\s+on public\\.' + t + " for " + op));
        });
        var policies = code.match(new RegExp('create policy "' + t + '_[a-z]+_own_salon"[\\s\\S]*?;', "g")) || [];
        expect(policies.length).toBe(4);
        policies.forEach(function (p) { expect(p).toMatch(/auth_salon_id\(\)/); expect(p).toMatch(/to authenticated/); });
      });
      it("revokes anon and the dangerous authenticated privileges", function () {
        expect(code).toMatch(new RegExp("revoke all on public\\." + t + " from anon"));
        expect(code).toMatch(new RegExp("revoke truncate, references, trigger on public\\." + t + " from authenticated"));
      });
    });
  });

  it("blocks cross-tenant parents in insert/update policies", function () {
    expect(code).toMatch(/c\.id = customer_id and c\.salon_id = auth_salon_id\(\)/);
    expect(code).toMatch(/p\.id = pet_id and p\.salon_id = auth_salon_id\(\)/);
  });

  it("is additive: only creates new objects, never alters or drops existing ones", function () {
    expect(code).not.toMatch(/drop\s+(table|column|policy|function)/i);
    expect(code).not.toMatch(/alter\s+table\s+public\.(customers|salons|staff|bookings|sales|stock|auto_)/i);
    expect(code).not.toMatch(/truncate\s+table|delete\s+from|update\s+public\./i);
  });

  it("sets an explicit search_path on its function and keeps medical fields out", function () {
    expect(code).toMatch(/set search_path = public, pg_temp/);
    expect(code).not.toMatch(/allerg|medical/i);
  });

  it("blocks duplicate pets per owner and documents a rollback and review status", function () {
    expect(code).toMatch(/unique index pet_pets_owner_name_species_uidx/);
    expect(sql).toMatch(/ROLLBACK/);
    expect(sql).toMatch(/NOT applied anywhere/);
  });
});
