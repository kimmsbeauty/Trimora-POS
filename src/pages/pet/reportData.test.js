import {
  periodBounds, validateCustomRange, collectedTotal, refundedTotal, netCollected, revenueByDay, collectedByMethod, invoiceTotals, openInvoiceSummary,
  topServices, bookingStats, boardingStats, hasAnyData,
} from "./reportData";

var NOW = new Date(2030, 2, 15, 12, 0); // Fri 15 Mar 2030, local
function at(y, m, d, h, min) { return new Date(y, m - 1, d, h || 0, min || 0).toISOString(); }

describe("periodBounds", function () {
  it("covers the right days, ending after the last day", function () {
    expect(periodBounds("today", NOW)).toMatchObject({ fromKey: "2030-03-15", toKey: "2030-03-16", days: 1 });
    expect(periodBounds("7d", NOW)).toMatchObject({ fromKey: "2030-03-09", toKey: "2030-03-16", days: 7 });
    expect(periodBounds("30d", NOW)).toMatchObject({ fromKey: "2030-02-14", toKey: "2030-03-16", days: 30 });
    expect(periodBounds("month", NOW)).toMatchObject({ fromKey: "2030-03-01", toKey: "2030-03-16", days: 15 });
    expect(periodBounds("lastmonth", NOW)).toMatchObject({ fromKey: "2030-02-01", toKey: "2030-03-01", days: 28 });
    expect(periodBounds("custom", NOW, { from: "2030-03-01", to: "2030-03-03" })).toMatchObject({ fromKey: "2030-03-01", toKey: "2030-03-04", days: 3 });
  });
  it("uses local midnight as the query boundary so a late-evening payment stays in its own day", function () {
    var b = periodBounds("today", NOW);
    expect(b.fromIso).toBe(new Date(2030, 2, 15).toISOString());
    expect(b.toIso).toBe(new Date(2030, 2, 16).toISOString());
    expect(at(2030, 3, 15, 23, 59) >= b.fromIso && at(2030, 3, 15, 23, 59) < b.toIso).toBe(true);
    expect(at(2030, 3, 16, 0, 0) < b.toIso).toBe(false);
  });
  it("handles January (previous month is December) and falls back to today for a bad custom range", function () {
    expect(periodBounds("lastmonth", new Date(2030, 0, 10))).toMatchObject({ fromKey: "2029-12-01", toKey: "2030-01-01", days: 31 });
    expect(periodBounds("custom", NOW, null)).toMatchObject({ fromKey: "2030-03-15", days: 1 });
  });
  it("validates custom ranges", function () {
    expect(validateCustomRange("", "2030-03-01")).toMatch(/both/);
    expect(validateCustomRange("2030-03-05", "2030-03-01")).toMatch(/before/);
    expect(validateCustomRange("2029-01-01", "2030-03-01")).toMatch(/366/);
    expect(validateCustomRange("2030-03-01", "2030-03-01")).toBe("");
    expect(validateCustomRange("2029-03-01", "2030-02-28")).toBe("");
  });
});

describe("money", function () {
  var payments = [
    { id: "a", invoice_id: "i1", method: "cash", amount: 1000, paid_at: at(2030, 3, 10, 9) },
    { id: "b", invoice_id: "i1", method: "mpesa", amount: 500, paid_at: at(2030, 3, 10, 23, 30) },
    { id: "c", invoice_id: "i2", method: "mpesa", amount: 2500, paid_at: at(2030, 3, 12, 8) },
  ];
  it("groups payments by local day with zeros for quiet days", function () {
    var days = revenueByDay(payments, "2030-03-09", "2030-03-13");
    expect(days.map(function (d) { return d.key; })).toEqual(["2030-03-09", "2030-03-10", "2030-03-11", "2030-03-12"]);
    expect(days.map(function (d) { return d.total; })).toEqual([0, 1500, 0, 2500]);
    expect(days[0].label).toBe("9/3");
    expect(days.reduce(function (n, d) { return n + d.total; }, 0)).toBe(collectedTotal(payments));
  });
  it("splits by method, always listing the four methods, with shares", function () {
    var m = collectedByMethod(payments);
    expect(m.map(function (r) { return r.method; })).toEqual(["cash", "mpesa", "card", "other"]);
    expect(m[0]).toMatchObject({ total: 1000, count: 1, share: 25 });
    expect(m[1]).toMatchObject({ total: 3000, count: 2, share: 75 });
    expect(m[2]).toMatchObject({ total: 0, count: 0, share: 0 });
    expect(collectedByMethod([]).every(function (r) { return r.total === 0 && r.share === 0; })).toBe(true);
  });
  it("keeps an unexpected method visible instead of dropping its money", function () {
    var m = collectedByMethod([{ method: "voucher", amount: 300, paid_at: at(2030, 3, 10) }]);
    expect(m.filter(function (r) { return r.method === "voucher"; })[0].total).toBe(300);
  });
  it("totals invoiced money excluding void invoices", function () {
    var t = invoiceTotals([
      { status: "paid", total: 1000, discount_amount: 100, tax_amount: 0 },
      { status: "issued", total: 2001, discount_amount: 0, tax_amount: 276 },
      { status: "void", total: 9999, discount_amount: 0, tax_amount: 0 },
    ]);
    expect(t).toMatchObject({ count: 2, voidCount: 1, invoiced: 3001, discounts: 100, tax: 276, average: 1501 });
    expect(invoiceTotals([])).toMatchObject({ count: 0, invoiced: 0, average: 0 });
  });
});

describe("open invoices", function () {
  it("sums what is owed, puts overdue first and ignores settled invoices", function () {
    var open = [
      { id: "1", status: "issued", total: 1000, amount_paid: 0, due_date: "2030-03-20" },
      { id: "2", status: "partial", total: 2000, amount_paid: 500, due_date: "2030-03-01" },
      { id: "3", status: "issued", total: 700, amount_paid: 0, due_date: null },
      { id: "4", status: "issued", total: 800, amount_paid: 800, due_date: "2030-03-01" },
      { id: "5", status: "issued", total: 400, amount_paid: 0, due_date: "2030-03-05" },
    ];
    var s = openInvoiceSummary(open, NOW);
    expect(s.count).toBe(4);
    expect(s.owed).toBe(1000 + 1500 + 700 + 400);
    expect(s.overdueCount).toBe(2);
    expect(s.overdueOwed).toBe(1500 + 400);
    expect(s.list.map(function (i) { return i.id; })).toEqual(["2", "5", "1", "3"]);
  });
});

describe("topServices", function () {
  var invoicesById = { i1: { status: "paid" }, i2: { status: "issued" }, i3: { status: "void" } };
  it("groups by service, skips void and out-of-period invoices, sorts by revenue and limits", function () {
    var lines = [
      { invoice_id: "i1", service_id: "s1", description: "Full groom", quantity: 1, line_total: 2500 },
      { invoice_id: "i2", service_id: "s1", description: "Full groom", quantity: 2, line_total: 5000 },
      { invoice_id: "i2", service_id: "s2", description: "Nail trim", quantity: 3, line_total: 900 },
      { invoice_id: "i3", service_id: "s2", description: "Nail trim", quantity: 9, line_total: 9999 },
      { invoice_id: "gone", service_id: "s3", description: "Other period", quantity: 1, line_total: 1 },
    ];
    var top = topServices(lines, invoicesById, 8);
    expect(top.map(function (s) { return s.name; })).toEqual(["Full groom", "Nail trim"]);
    expect(top[0]).toMatchObject({ quantity: 3, revenue: 7500 });
    expect(top[1]).toMatchObject({ quantity: 3, revenue: 900 });
    expect(topServices(lines, invoicesById, 1).length).toBe(1);
  });
});

describe("bookingStats", function () {
  it("counts statuses, the lost rate, and appointments per staff (not cancelled or no-show)", function () {
    var bookings = [
      { staff_id: "s1", status: "completed" }, { staff_id: "s1", status: "booked" }, { staff_id: null, status: "ready" },
      { staff_id: "s1", status: "cancelled" }, { staff_id: "gone", status: "no-show" }, { staff_id: "gone", status: "completed" },
    ];
    var s = bookingStats(bookings, { s1: "Amina" });
    expect(s.total).toBe(6);
    expect(s.byStatus).toMatchObject({ completed: 2, booked: 1, ready: 1, cancelled: 1, "no-show": 1 });
    expect(s.lost).toBe(2);
    expect(s.lostRate).toBe(33);
    expect(s.byStaff).toEqual([{ name: "Amina", count: 2 }, { name: "Former staff", count: 1 }, { name: "Unassigned", count: 1 }]);
    expect(bookingStats([], {})).toMatchObject({ total: 0, lostRate: 0, byStaff: [] });
  });
});

describe("boardingStats", function () {
  var kennels = [{ id: "k1" }, { id: "k2" }];
  it("counts kennel-days inside the period only, ignores cancelled, counts a day stay once", function () {
    var stays = [
      { status: "occupied", kennel_id: "k1", check_in_on: "2030-03-08", check_out_on: "2030-03-12" }, // nights 8,9,10,11 -> 2 in window (10,11)
      { status: "reserved", kennel_id: "k2", check_in_on: "2030-03-12", check_out_on: "2030-03-12" }, // day stay -> 1
      { status: "cancelled", kennel_id: "k1", check_in_on: "2030-03-10", check_out_on: "2030-03-14" },
      { status: "checked-out", kennel_id: "k2", check_in_on: "2030-03-20", check_out_on: "2030-03-22" }, // outside
    ];
    var s = boardingStats(stays, kennels, "2030-03-10", "2030-03-14"); // 4 days x 2 kennels = 8
    expect(s).toEqual({ kennelDays: 3, stays: 2, capacity: 8, occupancyPct: 38 });
  });
  it("reports 0% with no kennels instead of dividing by zero", function () {
    expect(boardingStats([], [], "2030-03-10", "2030-03-14")).toEqual({ kennelDays: 0, stays: 0, capacity: 0, occupancyPct: 0 });
  });
});

describe("hasAnyData", function () {
  it("is false only when every dataset is empty", function () {
    expect(hasAnyData({ payments: [], invoices: [], bookings: [], stays: [] })).toBe(false);
    expect(hasAnyData({ payments: [], invoices: [], bookings: [{}], stays: [] })).toBe(true);
  });
});

describe("refunds in reports (migration 105)", function () {
  it("adds up refunds and nets them off collected", function () {
    var pays = [{ amount: 3000 }, { amount: 1000 }]; var refunds = [{ amount: 500 }, { amount: 250 }];
    expect(refundedTotal(refunds)).toBe(750);
    expect(netCollected(pays, refunds)).toBe(3250);
    expect(refundedTotal(undefined)).toBe(0);
    expect(netCollected(pays, undefined)).toBe(4000);
  });
  it("can be negative when more went back than came in", function () {
    expect(netCollected([{ amount: 100 }], [{ amount: 400 }])).toBe(-300);
  });
  it("leaves fully refunded invoices out of invoiced and counts them separately; void stays separate", function () {
    var inv = [
      { id: "a", status: "paid", total: 2000, discount_amount: 0, tax_amount: 0 },
      { id: "b", status: "refunded", total: 5000, discount_amount: 0, tax_amount: 0 },
      { id: "c", status: "void", total: 700, discount_amount: 0, tax_amount: 0 },
    ];
    var t = invoiceTotals(inv);
    expect(t.invoiced).toBe(2000); expect(t.count).toBe(1); expect(t.voidCount).toBe(1); expect(t.refundedCount).toBe(1);
  });
  it("keeps a partly refunded paid invoice in invoiced (its cash effect is in Refunded)", function () {
    expect(invoiceTotals([{ id: "a", status: "paid", total: 2000, amount_refunded: 500, discount_amount: 0, tax_amount: 0 }]).invoiced).toBe(2000);
  });
  it("leaves lines of fully refunded invoices out of top services", function () {
    var lines = [{ invoice_id: "a", service_id: "s1", description: "Bath", quantity: 1, line_total: 1000 }, { invoice_id: "b", service_id: "s2", description: "Cut", quantity: 1, line_total: 9000 }];
    var rows = topServices(lines, { a: { status: "paid" }, b: { status: "refunded" } }, 8);
    expect(rows.map(function (r) { return r.name; })).toEqual(["Bath"]);
  });
});
