import fs from "fs";
import path from "path";

var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/099_pet_loyalty.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
var TABLES = ["pet_loyalty_settings", "pet_loyalty_rewards", "pet_loyalty_accounts", "pet_loyalty_ledger", "pet_loyalty_redemptions"];

describe("migration 099 (pet loyalty), static checks", function () {
  it("every table is scoped to a business with cascade and has row level security", function () {
    TABLES.forEach(function (t) {
      var block = code.slice(code.indexOf("create table public." + t));
      expect(block.slice(0, 300)).toMatch(/salon_id uuid not null references public\.salons\(id\) on delete cascade/);
      expect(code).toMatch(new RegExp("alter table public\\." + t + " enable row level security"));
      expect(code).toMatch(new RegExp("revoke all on public\\." + t + " from anon"));
      expect(code).toMatch(new RegExp("revoke all on public\\." + t + " from authenticated"));
      expect(code).toMatch(new RegExp("grant select on public\\." + t + " to authenticated"));
    });
  });
  it("only rewards can be written by the app, by column, and never deleted", function () {
    expect(code).toMatch(/grant insert \(salon_id, name, points_cost, active\) on public\.pet_loyalty_rewards to authenticated/);
    expect(code).toMatch(/grant update \(name, points_cost, active\) on public\.pet_loyalty_rewards to authenticated/);
    expect(code).not.toMatch(/grant (insert|update|delete|all)[^;]*pet_loyalty_(settings|accounts|ledger|redemptions)/);
    expect(code).not.toMatch(/grant delete/);
    expect(code).not.toMatch(/create policy "[a-z_]+" on public\.pet_loyalty_[a-z]+ for delete/);
    ["settings", "accounts", "ledger", "redemptions"].forEach(function (t) {
      var policies = code.match(new RegExp("create policy \"pet_loyalty_" + t + "_[a-z_]+\" on public\\.pet_loyalty_" + t + "[\\s\\S]*?;", "g")) || [];
      expect(policies.length).toBe(1);
      expect(policies[0]).toMatch(/for select to authenticated/);
    });
  });
  it("keeps balances non-negative and the ledger append-only and award-once", function () {
    expect(code).toMatch(/points_balance integer not null default 0 check \(points_balance >= 0\)/);
    expect(code).toMatch(/balance_after integer not null check \(balance_after >= 0\)/);
    expect(code).toMatch(/create trigger pet_loyalty_ledger_no_change before update or delete on public\.pet_loyalty_ledger/);
    expect(code).toMatch(/create unique index pet_loyalty_ledger_award_uidx[\s\S]*where reason in \('earn_invoice', 'visit_bonus'\)/);
  });
  it("is off by default and requires Gold above Silver", function () {
    expect(code).toMatch(/enabled boolean not null default false/);
    expect(code).toMatch(/constraint pet_loyalty_tiers_ordered check \(gold_at > silver_at\)/);
  });
  it("awards points through guarded triggers that fail open", function () {
    expect(code).toMatch(/create trigger pet_loyalty_invoice_paid after insert or update of status on public\.pet_invoices/);
    expect(code).toMatch(/create trigger pet_loyalty_booking_completed after update of status on public\.pet_bookings/);
    expect((code.match(/exception when others then\s+raise warning/g) || []).length).toBe(2);
  });
  it("defines SECURITY DEFINER functions with a pinned search_path", function () {
    var fns = code.match(/create or replace function public\.pet_[a-z_]+\([\s\S]*?\n\$\$;/g) || [];
    expect(fns.length).toBe(7);
    fns.forEach(function (f) { expect(f).toMatch(/security definer/); expect(f).toMatch(/set search_path = public, extensions, pg_temp/); });
  });
  it("app-facing functions check the caller's business; the internal ones are locked away from the app", function () {
    ["pet_save_loyalty_settings", "pet_adjust_loyalty", "pet_redeem_reward", "pet_set_redemption_status"].forEach(function (f) {
      var body = code.match(new RegExp("create or replace function public\\." + f + "\\([\\s\\S]*?\\n\\$\\$;"))[0];
      expect(body).toMatch(/auth_salon_id\(\)/);
      expect(body).toMatch(/raise exception 'NOT_AUTHENTICATED'/);
      expect(code).toMatch(new RegExp("revoke execute on function public\\." + f + "\\([^)]*\\) from public, anon;"));
      expect(code).toMatch(new RegExp("grant execute on function public\\." + f + "\\([^)]*\\) to authenticated;"));
    });
    ["pet_loyalty_apply(uuid, uuid, integer, text, text, text, uuid)", "pet_loyalty_on_invoice_paid()", "pet_loyalty_on_booking_completed()"].forEach(function (sig) {
      expect(code).toContain("revoke execute on function public." + sig + " from public, anon, authenticated;");
    });
  });
  it("does not replace the live invoice or booking functions, and is otherwise additive", function () {
    expect(code).not.toMatch(/create or replace function public\.pet_(create|void)_invoice|pet_record_payment|pet_set_booking_status|pet_create_booking/);
    expect(code).not.toMatch(/drop\s+(table|column|policy|function|trigger)/i);
    expect(code).not.toMatch(/alter\s+table\s+public\.(customers|salons|staff|pet_invoices|pet_bookings|pet_payments)/i);
    expect(code).not.toMatch(/pgcrypto|salon_pins|crypt\(/i);
  });
  it("audits every loyalty table with the shared trigger", function () {
    TABLES.forEach(function (t) {
      expect(code).toMatch(new RegExp("create trigger " + t + "_audit after insert or update or delete on public\\." + t + "\\s+for each row execute function public\\.pet_audit_row\\(\\)"));
    });
  });
});
