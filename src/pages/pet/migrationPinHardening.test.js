import fs from "fs";
import path from "path";

function load(n) {
  var raw = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/" + n), "utf8");
  return { raw: raw, code: raw.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n") };
}
var m90 = load("091_pin_step_up.sql");
var m91 = load("093_pin_lockdown.sql");

describe("migration 091 (PIN step-up)", function () {
  it("is additive: creates only the two new functions and never alters or drops existing PIN machinery", function () {
    expect(m90.code).not.toMatch(/drop\s+(function|table|policy|trigger)/i);
    expect(m90.code).not.toMatch(/create or replace function public\.(update_salon_pin|verify_staff_pin|verify_pin_for_device_login|super_admin_reset_salon_pin|complete_salon_onboarding|check_pin_lockout)/i);
    expect(m90.code).not.toMatch(/alter\s+table|truncate|delete\s+from/i);
    expect((m90.code.match(/create or replace function public\./g) || []).length).toBe(2);
  });
  it("change_salon_pins returns boolean and RETURNS false (never raises) on a wrong proof", function () {
    expect(m90.code).toMatch(/function public\.change_salon_pins\([\s\S]*?returns boolean/);
    var proof = m90.code.slice(m90.code.indexOf("verify_staff_pin('admin'"));
    expect(proof.slice(0, 160)).toMatch(/return false;/);
    expect(proof.slice(0, 160)).not.toMatch(/raise exception/);
  });
  it("every check that can raise runs BEFORE the proof, so a failed attempt is never rolled back", function () {
    var fn = m90.code.slice(m90.code.indexOf("function public.change_salon_pins"), m90.code.indexOf("function public.reset_salon_admin_pin_via_recovery"));
    var proofAt = fn.indexOf("verify_staff_pin('admin'");
    var lastRaiseBefore = fn.slice(0, proofAt).lastIndexOf("raise exception");
    var raiseAfter = fn.slice(proofAt).match(/raise exception '([^']+)'/g) || [];
    expect(lastRaiseBefore).toBeGreaterThan(0);
    // only the "no PIN record" integrity errors may follow the proof
    raiseAfter.forEach(function (r) { expect(r).toMatch(/No (staff|admin) PIN record/); });
  });
  it("proof is the existing lockout-protected check, and empty proof is refused", function () {
    expect(m90.code).toMatch(/coalesce\(p_current_admin_pin, ''\) = '' or not verify_staff_pin\('admin', p_current_admin_pin\)/);
  });
  it("both functions are SECURITY DEFINER with an explicit search_path", function () {
    expect((m90.code.match(/security definer/g) || []).length).toBe(2);
    expect((m90.code.match(/set search_path = public, extensions, pg_temp/g) || []).length).toBe(2);
  });
  it("recovery requires an email-link (otp) session within one hour and fails closed", function () {
    expect(m90.code).toMatch(/a ->> 'method' = 'otp'/);
    expect(m90.code).toMatch(/- 3600/);
    expect(m90.code).toMatch(/jsonb_typeof\(auth\.jwt\(\) -> 'amr'\) = 'array'/);
    expect(m90.code).toMatch(/PIN reset requires a recent recovery email link/);
    expect(m90.code).toMatch(/where salon_id = v_salon and role = 'admin'/);
  });
  it("grants are revoked by role then given to authenticated only (anon never)", function () {
    expect(m90.code).toMatch(/revoke execute on function public\.change_salon_pins\(text, text, text\) from public, anon, authenticated/);
    expect(m90.code).toMatch(/revoke execute on function public\.reset_salon_admin_pin_via_recovery\(text\) from public, anon, authenticated/);
    expect(m90.code).toMatch(/grant execute on function public\.change_salon_pins\(text, text, text\) to authenticated/);
    expect(m90.code).not.toMatch(/grant[^;]*\bto\b[^;]*anon/i);
  });
  it("documents rollback, the amr limitation, and the lockout behaviour", function () {
    expect(m90.raw).toMatch(/ROLLBACK/);
    expect(m90.raw).toMatch(/NOT end-to-end with a real recovery email/);
    expect(m90.raw).toMatch(/lockout/i);
  });
});

describe("migration 093 (PIN lockdown, HELD)", function () {
  it("records that it was applied, and honestly that the real-recovery test was not verified", function () {
    expect(m91.raw).toMatch(/STATUS: APPLIED to production 2026-10-25/);
    expect(m91.raw).toMatch(/REAL forgot-PIN recovery/);
    expect(m91.raw).toMatch(/NOT VERIFIED/);
  });
  it("refuses to run unless 091 is applied", function () {
    expect(m91.code).toMatch(/to_regprocedure\('public\.change_salon_pins\(text, text, text\)'\) is null/);
    expect(m91.code).toMatch(/to_regprocedure\('public\.reset_salon_admin_pin_via_recovery\(text\)'\) is null/);
    expect(m91.code).toMatch(/093 refused: apply 091 first/);
  });
  it("only revokes the old function and drops the two inert client policies", function () {
    expect(m91.code).toMatch(/revoke execute on function public\.update_salon_pin\(text, text\) from public, anon, authenticated/);
    expect(m91.code).toMatch(/drop policy if exists salon_pins_select_own_salon on public\.salon_pins/);
    expect(m91.code).toMatch(/drop policy if exists salon_pins_update_own_salon on public\.salon_pins/);
    expect(m91.code).not.toMatch(/drop function|drop table|alter table|disable row level security/i);
  });
  it("documents an exact rollback", function () {
    expect(m91.raw).toMatch(/grant execute on function public\.update_salon_pin\(text, text\) to anon, authenticated/);
    expect(m91.raw).toMatch(/create policy salon_pins_select_own_salon/);
    expect(m91.raw).toMatch(/create policy salon_pins_update_own_salon/);
  });
});
