import fs from "fs";
import path from "path";

function code(file) {
  var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations", file), "utf8");
  return sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
}
var s91 = code("091_pet_supplies.sql");
var s92 = code("092_pet_invoice_products.sql");

describe("migrations 091 and 092 (static checks; behaviour is tested in the .db tests)", function () {
  it("never lets the app write a quantity: it is missing from every column grant", function () {
    var grants = s91.match(/grant (insert|update) \([^)]*\) on public\.pet_items to authenticated/g) || [];
    expect(grants.length).toBe(2);
    grants.forEach(function (g) { expect(g).not.toMatch(/quantity_on_hand/); expect(g).not.toMatch(/salon_id[\s\S]*update/); });
    expect(s91).not.toMatch(/grant (insert|update|delete|all) on public\.pet_items/i);
  });
  it("keeps salon_id and kind out of the update grant on items", function () {
    var upd = s91.match(/grant update \([^)]*\) on public\.pet_items/)[0];
    expect(upd).not.toMatch(/salon_id/); expect(upd).not.toMatch(/\bkind\b/);
  });
  it("gives the app no write access to the ledger, receipts or purchase lines", function () {
    ["pet_stock_movements", "pet_purchases", "pet_purchase_lines"].forEach(function (t) {
      expect(s91).toMatch(new RegExp("grant select on public\\." + t + " to authenticated"));
      expect(s91).toMatch(new RegExp("revoke all on public\\." + t + " from anon"));
    });
  });
  it("makes the ledger append-only", function () {
    expect(s91).toMatch(/create trigger pet_stock_movements_no_change before update or delete/);
    expect(s91).toMatch(/pet_trigger_depth|pg_trigger_depth\(\) <= 1/);
  });
  it("the internal stock function is closed to the app and anon", function () {
    expect(s91).toMatch(/revoke execute on function public\.pet_apply_stock\(uuid, uuid, integer, text, text, text, uuid\) from public, anon, authenticated/);
    expect(s91).not.toMatch(/grant execute on function public\.pet_apply_stock/);
  });
  it("every function is security definer with a pinned search_path and signed-in check", function () {
    var fns = (s91 + "\n" + s92).match(/create or replace function public\.pet_[a-z_]+[\s\S]*?\n\$\$;/g) || [];
    expect(fns.length).toBe(6);
    fns.forEach(function (f) {
      expect(f).toMatch(/security definer/);
      expect(f).toMatch(/set search_path = public, extensions, pg_temp/);
    });
    expect(s91.match(/NOT_AUTHENTICATED/g).length).toBeGreaterThanOrEqual(3);
  });
  it("retail products need a price and stock can't be negative", function () {
    expect(s91).toMatch(/pet_items_retail_has_price check \(kind = 'consumable' or price is not null\)/);
    expect(s91).toMatch(/quantity_on_hand integer not null default 0 check \(quantity_on_hand >= 0\)/);
    expect(s91).toMatch(/INSUFFICIENT_STOCK/);
  });
  it("091 is additive and leaves the shared stock table alone", function () {
    expect(s91).not.toMatch(/drop\s+(table|column|policy)/i);
    expect(s91).not.toMatch(/public\.stock\b/);
    expect(s91).not.toMatch(/alter\s+table\s+public\.(?!pet_)/i);
  });
  it("092 takes product prices from pet_items and never from the caller", function () {
    expect(s92).toMatch(/select i\.price into v_item from public\.pet_items i/);
    expect(s92).toMatch(/i\.active and i\.kind = 'retail'/);
    expect(s92).not.toMatch(/->> 'price'|->> 'unit_price'|p_price/);
  });
  it("092 requires exactly one of service or product on every line", function () {
    expect(s92).toMatch(/check \(\(service_id is not null\) <> \(item_id is not null\)\)/);
  });
  it("092 takes stock out on sale and puts it back on void", function () {
    expect(s92).toMatch(/pet_apply_stock\(v_salon, \(v_line ->> 'item_id'\)::uuid, -v_qty, 'sale'/);
    expect(s92).toMatch(/pet_apply_stock\(v_salon, v_row\.item_id, v_row\.quantity, 'sale_void'/);
  });
});
