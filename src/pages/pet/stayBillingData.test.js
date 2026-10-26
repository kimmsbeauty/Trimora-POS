import { clampLateDays, previewTotals, stayNeedsInvoice, stayBillingErrorMessage } from "./stayBillingData";

describe("stayBillingData", function () {
  it("clamps late days to what the dates support", function () {
    expect(clampLateDays("2", 3)).toBe(2);
    expect(clampLateDays("9", 3)).toBe(3);
    expect(clampLateDays("-1", 3)).toBe(0);
    expect(clampLateDays("abc", 3)).toBe(0);
    expect(clampLateDays("2.9", 3)).toBe(2);
    expect(clampLateDays(5, 0)).toBe(0);
  });
  it("previews the charge the way the database computes it", function () {
    expect(previewTotals({ nights: 4, rate: 2000, lateDays: 3, maxLateDays: 3 })).toMatchObject({ nightsTotal: 8000, lateTotal: 6000, subtotal: 14000, discount: 0, total: 14000, lateDays: 3 });
    expect(previewTotals({ nights: 4, rate: 2000, lateDays: 0, maxLateDays: 3 }).total).toBe(8000);
    expect(previewTotals({ nights: 4, rate: 2000, lateDays: 9, maxLateDays: 3 }).total).toBe(14000);
    expect(previewTotals({ nights: 4, rate: 2000, lateDays: 0, maxLateDays: 0, discountType: "percent", discountValue: 25 })).toMatchObject({ discount: 2000, total: 6000 });
    expect(previewTotals({ nights: 4, rate: 2000, lateDays: 0, maxLateDays: 0, discountType: "amount", discountValue: 99999 }).total).toBe(0);
    expect(previewTotals({ nights: 0, rate: 1500, lateDays: 0, maxLateDays: 0 }).total).toBe(1500);
  });
  it("lists only checked-out stays with a rate that have no live invoice", function () {
    var ok = { id: "s1", status: "checked-out", service_id: "sv", nightly_rate: 900 };
    expect(stayNeedsInvoice(ok, {})).toBe(true);
    expect(stayNeedsInvoice(ok, { s1: true })).toBe(false);
    expect(stayNeedsInvoice(Object.assign({}, ok, { status: "occupied" }), {})).toBe(false);
    expect(stayNeedsInvoice(Object.assign({}, ok, { service_id: null }), {})).toBe(false);
    expect(stayNeedsInvoice(Object.assign({}, ok, { nightly_rate: null }), {})).toBe(false);
    expect(stayNeedsInvoice(null, {})).toBe(false);
  });
  it("explains database errors in plain words", function () {
    expect(stayBillingErrorMessage("STAY_ALREADY_INVOICED")).toMatch(/already has an invoice/);
    expect(stayBillingErrorMessage("STAY_NOT_CHECKED_OUT")).toMatch(/Check the pet out/);
    expect(stayBillingErrorMessage("whatever")).toMatch(/Couldn't create the invoice/);
  });
});
