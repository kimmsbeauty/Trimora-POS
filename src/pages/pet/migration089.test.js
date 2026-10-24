import fs from "fs";
import path from "path";

var sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/089_pet_invoices.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");

describe("migration 089 (pet invoices)", function () {
  it("creates three tables, each with salon_id", function () {
    ["pet_invoices", "pet_invoice_lines", "pet_payments"].forEach(function (t) {
      var block = code.slice(code.indexOf("create table public." + t));
      block = block.slice(0, block.indexOf("\n);") + 3);
      expect(block).toMatch(/salon_id uuid not null references public\.salons\(id\) on delete cascade/);
    });
  });
  it("numbers invoices uniquely per business and makes creation idempotent", function () {
    expect(code).toMatch(/pet_invoices_number_uidx unique \(salon_id, invoice_number\)/);
    expect(code).toMatch(/pet_invoices_idempotency_uidx unique \(salon_id, idempotency_key\)/);
    expect(code).toMatch(/lpad\(v_next::text, 4, '0'\)/);
    expect(code).toMatch(/from public\.salon_settings ss where ss\.salon_id = v_salon for update/);
  });
  it("allows one live invoice per booking", function () {
    expect(code).toMatch(/create unique index pet_invoices_booking_live_uidx on public\.pet_invoices \(booking_id\)\s+where booking_id is not null and status <> 'void'/);
  });
  it("keeps totals, status and void rules consistent in the table itself", function () {
    expect(code).toMatch(/total = subtotal - discount_amount and amount_paid <= total/);
    expect(code).toMatch(/status in \('issued', 'partial', 'paid', 'void'\)/);
    expect(code).toMatch(/status = 'partial' and amount_paid > 0 and amount_paid < total/);
    expect(code).toMatch(/status <> 'void' or \(voided_at is not null and amount_paid = 0/);
    expect(code).toMatch(/line_total = quantity \* unit_price/);
  });
  it("blocks a repeated payment reference and non-positive payments", function () {
    expect(code).toMatch(/create unique index pet_payments_reference_uidx on public\.pet_payments \(salon_id, method, lower\(btrim\(reference\)\)\)/);
    expect(code).toMatch(/amount integer not null check \(amount > 0\)/);
    expect(code).toMatch(/method in \('cash', 'card', 'mpesa', 'other'\)/);
  });
  it("is read-only for the client: select policies and grants only", function () {
    var policies = code.match(/create policy "pet_[a-z_]+" on public\.[a-z_]+ for [a-z]+/g) || [];
    expect(policies.length).toBe(3);
    policies.forEach(function (p) { expect(p).toMatch(/for select/); });
    expect(code).not.toMatch(/grant (insert|update|delete|all)/i);
    ["pet_invoices", "pet_invoice_lines", "pet_payments"].forEach(function (t) {
      expect(code).toMatch(new RegExp("grant select on public\\." + t + " to authenticated"));
      expect(code).toMatch(new RegExp("revoke all on public\\." + t + " from anon"));
    });
  });
  it("all three functions are security definer, pinned search_path, tenant-scoped", function () {
    var fns = code.match(/create or replace function public\.pet_[a-z_]+[\s\S]*?\n\$\$;/g) || [];
    expect(fns.length).toBe(3);
    fns.forEach(function (f) {
      expect(f).toMatch(/security definer/);
      expect(f).toMatch(/set search_path = public, extensions, pg_temp/);
      expect(f).toMatch(/auth_salon_id\(\)/);
      expect(f).toMatch(/NOT_AUTHENTICATED/);
    });
  });
  it("takes prices and names from the catalogue, never from the client", function () {
    expect(code).toMatch(/select s\.price into v_svc from public\.pet_services s/);
    expect(code).toMatch(/select v_salon, v_id, s\.id, s\.name, v_qty, s\.price, v_qty \* s\.price/);
    expect(code).not.toMatch(/p_price|p_total|p_unit_price|->> 'price'|->> 'unit_price'|->> 'total'/);
  });
  it("derives paid amount from payment rows and prevents overpayment", function () {
    expect(code).toMatch(/coalesce\(sum\(amount\), 0\) into v_paid from public\.pet_payments/);
    expect(code).toMatch(/v_paid \+ p_amount > v_inv\.total then raise exception 'OVERPAYMENT'/);
    expect(code).toMatch(/v_paid \+ v_amount > v_total then raise exception 'OVERPAYMENT'/);
  });
  it("cannot void an invoice that has payments", function () {
    expect(code).toMatch(/INVOICE_HAS_PAYMENTS/);
    expect(code).toMatch(/REASON_REQUIRED/);
  });
  it("revokes execute from anon/public and grants authenticated", function () {
    expect((code.match(/revoke execute on function public\.pet_[a-z_]+\([^)]*\) from public, anon/g) || []).length).toBe(3);
    expect((code.match(/grant execute on function public\.pet_[a-z_]+\([^)]*\) to authenticated/g) || []).length).toBe(3);
  });
  it("audits all three tables and is additive", function () {
    ["pet_invoices_audit", "pet_invoice_lines_audit", "pet_payments_audit"].forEach(function (t) { expect(code).toMatch(new RegExp("create trigger " + t)); });
    expect(code).not.toMatch(/drop\s+(table|column|policy)/i);
    expect(code).not.toMatch(/alter\s+table\s+public\.(?!pet_)/i);
    expect(code).not.toMatch(/delete\s+from|truncate/i);
    expect(code).toMatch(/update public\.salon_settings set next_invoice_number = v_next \+ 1 where salon_id = v_salon/);
  });
});
