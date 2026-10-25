import { receiptFor, sortedPayments, latestPaymentId } from "./receiptData";

var invoice = {
  invoice_number: "INV-0007", total: 3000,
  pet_payments: [
    { id: "p2", amount: 1500, method: "cash", paid_at: "2026-10-25T10:00:00Z", created_at: "2026-10-25T10:00:00Z" },
    { id: "p1", amount: 1000, method: "mpesa", paid_at: "2026-10-24T09:00:00Z", created_at: "2026-10-24T09:00:00Z" },
    { id: "p3", amount: 500, method: "card", paid_at: "2026-10-26T10:00:00Z", created_at: "2026-10-26T10:00:00Z" },
  ],
};

describe("receiptData", function () {
  it("orders payments by time and numbers receipts from the invoice number", function () {
    expect(sortedPayments(invoice).map(function (p) { return p.id; })).toEqual(["p1", "p2", "p3"]);
    expect(receiptFor(invoice, "p1").number).toBe("RCT-0007-1");
    expect(receiptFor(invoice, "p3").number).toBe("RCT-0007-3");
  });
  it("shows what had been paid up to that payment and what remained after it", function () {
    var a = receiptFor(invoice, "p1"); var b = receiptFor(invoice, "p2"); var c = receiptFor(invoice, "p3");
    expect([a.paidToDate, a.balanceAfter]).toEqual([1000, 2000]);
    expect([b.paidToDate, b.balanceAfter]).toEqual([2500, 500]);
    expect([c.paidToDate, c.balanceAfter]).toEqual([3000, 0]);
    expect(c.isLatest).toBe(true); expect(a.isLatest).toBe(false);
  });
  it("returns null for an unknown payment and finds the latest", function () {
    expect(receiptFor(invoice, "nope")).toBeNull();
    expect(latestPaymentId(invoice)).toBe("p3");
    expect(latestPaymentId({ pet_payments: [] })).toBeNull();
  });
  it("is stable when two payments share the same instant", function () {
    var t = "2026-10-25T10:00:00Z";
    var inv = { invoice_number: "INV-0002", total: 100, pet_payments: [{ id: "b", amount: 40, paid_at: t, created_at: t }, { id: "a", amount: 60, paid_at: t, created_at: t }] };
    expect(receiptFor(inv, "a").number).toBe("RCT-0002-1");
    expect(receiptFor(inv, "b").number).toBe("RCT-0002-2");
  });
  it("never reports a negative balance", function () {
    expect(receiptFor({ invoice_number: "INV-1", total: 100, pet_payments: [{ id: "x", amount: 150, paid_at: "2026-01-01T00:00:00Z" }] }, "x").balanceAfter).toBe(0);
  });
});
