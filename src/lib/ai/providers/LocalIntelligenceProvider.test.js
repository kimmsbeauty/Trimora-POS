import { summarizeRevenue } from "./LocalIntelligenceProvider";

describe("LocalIntelligenceProvider.summarizeRevenue", () => {
  test("returns zeroed summary for no sales", () => {
    var result = summarizeRevenue([], { dateFrom: "2026-07-01", dateTo: "2026-07-01" });
    expect(result.provider).toBe("local");
    expect(result.totalRevenue).toBe(0);
    expect(result.saleCount).toBe(0);
    expect(result.avgSale).toBe(0);
    expect(result.byPaymentMethod).toEqual([]);
    expect(result.dateFrom).toBe("2026-07-01");
    expect(result.dateTo).toBe("2026-07-01");
  });

  test("sums total revenue and sale count", () => {
    var rows = [
      { total: 1000, payment: "Cash" },
      { total: 500, payment: "Till" },
      { total: 1500, payment: "Cash" },
    ];
    var result = summarizeRevenue(rows, {});
    expect(result.totalRevenue).toBe(3000);
    expect(result.saleCount).toBe(3);
    expect(result.avgSale).toBe(1000);
  });

  test("groups and sorts by payment method, highest total first", () => {
    var rows = [
      { total: 200, payment: "Cash" },
      { total: 900, payment: "Till" },
      { total: 100, payment: "Cash" },
    ];
    var result = summarizeRevenue(rows, {});
    expect(result.byPaymentMethod).toEqual([
      { method: "Till", total: 900, count: 1 },
      { method: "Cash", total: 300, count: 2 },
    ]);
  });

  test("treats missing payment method as Unknown", () => {
    var rows = [{ total: 400 }];
    var result = summarizeRevenue(rows, {});
    expect(result.byPaymentMethod).toEqual([
      { method: "Unknown", total: 400, count: 1 },
    ]);
  });

  test("treats missing/non-numeric total as zero", () => {
    var rows = [{ total: null, payment: "Cash" }, { payment: "Cash" }];
    var result = summarizeRevenue(rows, {});
    expect(result.totalRevenue).toBe(0);
    expect(result.saleCount).toBe(2);
  });
});
