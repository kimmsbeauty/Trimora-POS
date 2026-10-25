import {
  computeTotals, validateCheckout, paymentsSum, paymentRows, outstanding, isOverdue, displayStatus, filterInvoices, summarize,
  invoiceErrorMessage, newIdempotencyKey,
} from "./invoiceData";

describe("computeTotals", function () {
  var lines = [{ unit_price: 1500, quantity: 1 }, { unit_price: 2000, quantity: 3 }];
  it("totals lines with quantities", function () {
    expect(computeTotals({ lines: lines, discountType: "amount", discountValue: 0 }).total).toBe(7500);
  });
  it("applies an amount or percent discount", function () {
    expect(computeTotals({ lines: lines, discountType: "amount", discountValue: 500 }).total).toBe(7000);
    var p = computeTotals({ lines: lines, discountType: "percent", discountValue: 10 });
    expect(p.discount).toBe(750); expect(p.total).toBe(6750);
  });
  it("rejects a discount above the subtotal or a percent above 100", function () {
    expect(computeTotals({ lines: lines, discountType: "amount", discountValue: 9000 }).discountValid).toBe(false);
    expect(computeTotals({ lines: lines, discountType: "percent", discountValue: 150 }).discountValid).toBe(false);
    expect(computeTotals({ lines: lines, discountType: "amount", discountValue: -1 }).discountValid).toBe(false);
  });
  it("treats prices as VAT inclusive", function () {
    var t = computeTotals({ lines: [{ unit_price: 1160, quantity: 1 }], discountType: "amount", discountValue: 0, taxEnabled: true, taxRate: 16 });
    expect(t.total).toBe(1160); expect(t.taxAmount).toBe(160);
    expect(computeTotals({ lines: [{ unit_price: 1160, quantity: 1 }], discountType: "amount", discountValue: 0, taxEnabled: false, taxRate: 16 }).taxAmount).toBe(0);
  });
});

describe("validateCheckout", function () {
  var ok = { customer_id: "c", lines: [{ service_id: "s", quantity: "2" }], discountType: "amount", discountValue: 0, payments: [] };
  var totals = { total: 3000, discountValid: true };
  it("accepts a valid sale, with or without payment", function () {
    expect(validateCheckout(ok, totals)).toBe("");
    expect(validateCheckout(Object.assign({}, ok, { payments: [{ method: "cash", amount: "3000" }] }), totals)).toBe("");
  });
  it("needs a customer and at least one item", function () {
    expect(validateCheckout(Object.assign({}, ok, { customer_id: "" }), totals)).toMatch(/customer/);
    expect(validateCheckout(Object.assign({}, ok, { lines: [] }), totals)).toMatch(/at least one/);
  });
  it("rejects bad quantities", function () {
    expect(validateCheckout(Object.assign({}, ok, { lines: [{ service_id: "s", quantity: "0" }] }), totals)).toMatch(/Quantities/);
    expect(validateCheckout(Object.assign({}, ok, { lines: [{ service_id: "s", quantity: "1.5" }] }), totals)).toMatch(/Quantities/);
  });
  it("rejects bad or excessive payments", function () {
    expect(validateCheckout(Object.assign({}, ok, { payments: [{ method: "cash", amount: "-5" }] }), totals)).toMatch(/positive/);
    expect(validateCheckout(Object.assign({}, ok, { payments: [{ method: "bitcoin", amount: "10" }] }), totals)).toMatch(/method/);
    expect(validateCheckout(Object.assign({}, ok, { payments: [{ method: "cash", amount: "2000" }, { method: "mpesa", amount: "1500" }] }), totals)).toMatch(/more than the total/);
  });
  it("rejects an invalid discount", function () {
    expect(validateCheckout(ok, { total: 0, discountValid: false })).toMatch(/discount/);
  });
});

describe("payments", function () {
  it("sums only valid whole amounts", function () { expect(paymentsSum([{ amount: "1000" }, { amount: "x" }, { amount: 500 }])).toBe(1500); });
  it("cleans rows for the database", function () {
    expect(paymentRows([{ method: "mpesa", amount: "1500", reference: " QWE123 " }, { method: "cash", amount: 200, reference: "  " }]))
      .toEqual([{ method: "mpesa", amount: 1500, reference: "QWE123" }, { method: "cash", amount: 200, reference: null }]);
  });
});

describe("outstanding and overdue", function () {
  var now = new Date(2026, 9, 24, 12, 0);
  it("outstanding is total minus paid, zero for void", function () {
    expect(outstanding({ status: "partial", total: 3000, amount_paid: 1000 })).toBe(2000);
    expect(outstanding({ status: "void", total: 3000, amount_paid: 0 })).toBe(0);
  });
  it("is overdue only when unpaid or part-paid and past due", function () {
    expect(isOverdue({ status: "issued", due_date: "2026-10-23" }, now)).toBe(true);
    expect(isOverdue({ status: "partial", due_date: "2026-10-01" }, now)).toBe(true);
    expect(isOverdue({ status: "issued", due_date: "2026-10-24" }, now)).toBe(false);
    expect(isOverdue({ status: "paid", due_date: "2026-01-01" }, now)).toBe(false);
    expect(isOverdue({ status: "void", due_date: "2026-01-01" }, now)).toBe(false);
    expect(isOverdue({ status: "issued", due_date: null }, now)).toBe(false);
    expect(displayStatus({ status: "issued", due_date: "2026-10-01" }, now)).toBe("overdue");
  });
  it("summarizes what is owed", function () {
    var list = [
      { status: "issued", total: 1000, amount_paid: 0, due_date: "2026-10-01" },
      { status: "partial", total: 3000, amount_paid: 1000, due_date: "2026-12-01" },
      { status: "paid", total: 500, amount_paid: 500 },
      { status: "void", total: 900, amount_paid: 0 },
    ];
    expect(summarize(list, now)).toEqual({ outstanding: 3000, overdue: 1000, overdueCount: 1 });
  });
});

describe("filterInvoices", function () {
  var now = new Date(2026, 9, 24);
  var list = [
    { id: "1", invoice_number: "INV-0001", status: "issued", due_date: "2026-10-01" },
    { id: "2", invoice_number: "INV-0002", status: "paid" },
  ];
  var names = function (i) { return i.id === "1" ? { customer: "Wanjiru", pet: "Simba" } : { customer: "James", pet: "Rex" }; };
  it("filters by derived status and text", function () {
    expect(filterInvoices(list, { status: "overdue" }, names, now).map(function (i) { return i.id; })).toEqual(["1"]);
    expect(filterInvoices(list, { status: "paid" }, names, now).map(function (i) { return i.id; })).toEqual(["2"]);
    expect(filterInvoices(list, { q: "inv-0002" }, names, now).length).toBe(1);
    expect(filterInvoices(list, { q: "simba" }, names, now).length).toBe(1);
  });

  it("'outstanding' keeps every invoice that still owes money (unpaid, part paid, overdue) and drops paid and void", function () {
    var all = [
      { id: "a", invoice_number: "INV-1", status: "issued", total: 1000, amount_paid: 0, due_date: "2026-12-01" },
      { id: "b", invoice_number: "INV-2", status: "partial", total: 1000, amount_paid: 400, due_date: "2026-12-01" },
      { id: "c", invoice_number: "INV-3", status: "issued", total: 1000, amount_paid: 0, due_date: "2026-10-01" },
      { id: "d", invoice_number: "INV-4", status: "paid", total: 1000, amount_paid: 1000 },
      { id: "e", invoice_number: "INV-5", status: "void", total: 1000, amount_paid: 0 },
    ];
    expect(filterInvoices(all, { status: "outstanding" }, names, now).map(function (i) { return i.id; })).toEqual(["a", "b", "c"]);
  });
});

describe("messages and keys", function () {
  it("maps database codes and never leaks raw text", function () {
    expect(invoiceErrorMessage("OVERPAYMENT")).toMatch(/more than the amount/);
    expect(invoiceErrorMessage("INVOICE_HAS_PAYMENTS")).toMatch(/Refunds/);
    expect(invoiceErrorMessage("INSUFFICIENT_STOCK")).toMatch(/enough stock/);
    expect(invoiceErrorMessage("ITEM_NOT_FOUND")).toMatch(/product/);
    expect(invoiceErrorMessage("duplicate key value violates unique constraint")).toMatch(/Something went wrong/);
    expect(invoiceErrorMessage("Network error")).toMatch(/Couldn't reach/);
  });
  it("creates distinct uuid-shaped keys", function () {
    var a = newIdempotencyKey(); var b = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f-]{36}$/); expect(a).not.toBe(b);
  });
});
