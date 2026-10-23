import fs from "fs";
import path from "path";

var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/082_pet_business_type.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");

describe("migration 082 (pet business type)", function () {
  it("widens the business_type check to salon, auto and pet", function () {
    expect(code).toMatch(/CHECK \(business_type IN \('salon', 'auto', 'pet'\)\)/);
  });

  it("is additive: no table/column drops, no data changes", function () {
    expect(code).not.toMatch(/DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM|UPDATE\s+public\./i);
    // The only DROP is the old check constraint, found dynamically.
    var drops = code.match(/DROP\s+\w+/gi) || [];
    expect(drops.every(function (d) { return /CONSTRAINT/i.test(d); })).toBe(true);
  });

  it("documents a rollback", function () {
    expect(sql).toMatch(/ROLLBACK/);
    expect(sql).toMatch(/CHECK \(business_type IN \('salon', 'auto'\)\)/);
  });
});
