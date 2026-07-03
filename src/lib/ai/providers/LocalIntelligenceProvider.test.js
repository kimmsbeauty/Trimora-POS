import { summarizeRevenue, summarizeCustomers, summarizeTopItems } from "./LocalIntelligenceProvider";

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

describe("LocalIntelligenceProvider.summarizeCustomers", () => {
  test("counts distinct visitors by phone", () => {
    var sales = [
      { client: "Jane", client_phone: "0700111111" },
      { client: "Jane", client_phone: "0700111111" },
      { client: "Amy", client_phone: "0700222222" },
    ];
    var result = summarizeCustomers(sales, []);
    expect(result.visitorCount).toBe(2);
  });

  test("falls back to client name when phone is missing", () => {
    var sales = [{ client: "Walk-in Jane" }, { client: "Walk-in Jane" }];
    var result = summarizeCustomers(sales, []);
    expect(result.visitorCount).toBe(1);
  });

  test("ignores rows with no client identity at all", () => {
    var sales = [{ total: 500 }];
    var result = summarizeCustomers(sales, []);
    expect(result.visitorCount).toBe(0);
  });

  test("counts new customers from the given rows directly", () => {
    var newCustomers = [{ id: "1" }, { id: "2" }, { id: "3" }];
    var result = summarizeCustomers([], newCustomers);
    expect(result.newCustomerCount).toBe(3);
  });
});

describe("LocalIntelligenceProvider.summarizeTopItems", () => {
  test("aggregates quantity across sales, sorted descending", () => {
    var sales = [
      { items: [{ name: "Haircut", type: "service", qty: 1 }] },
      { items: [{ name: "Haircut", type: "service", qty: 1 }] },
      { items: [{ name: "Shampoo", type: "product", qty: 3 }] },
    ];
    var result = summarizeTopItems(sales, {});
    expect(result.items).toEqual([
      { name: "Shampoo", type: "product", qty: 3 },
      { name: "Haircut", type: "service", qty: 2 },
    ]);
  });

  test("respects the limit option", () => {
    var sales = [
      { items: [{ name: "A", type: "service", qty: 5 }, { name: "B", type: "service", qty: 4 }, { name: "C", type: "service", qty: 3 }] },
    ];
    var result = summarizeTopItems(sales, { limit: 2 });
    expect(result.items.length).toBe(2);
  });

  test("distinguishes same-named service vs product", () => {
    var sales = [
      { items: [{ name: "Coconut Oil", type: "product", qty: 1 }, { name: "Coconut Oil", type: "service", qty: 1 }] },
    ];
    var result = summarizeTopItems(sales, {});
    expect(result.items.length).toBe(2);
  });

  test("ignores malformed rows without throwing", () => {
    var sales = [{ items: null }, { items: [null, { qty: 1 }] }, {}];
    expect(() => summarizeTopItems(sales, {})).not.toThrow();
  });
});
