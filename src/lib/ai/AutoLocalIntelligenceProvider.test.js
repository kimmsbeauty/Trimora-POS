import { summarizeRevenue, summarizeCustomers, summarizeTopServices, summarizeCommission, classifyQuestion } from "./AutoLocalIntelligenceProvider";

describe("AutoLocalIntelligenceProvider.summarizeRevenue", () => {
  test("returns zeroed summary for no jobs", () => {
    var result = summarizeRevenue([], { dateFrom: "2026-07-01", dateTo: "2026-07-01" });
    expect(result.provider).toBe("auto-local");
    expect(result.totalRevenue).toBe(0);
    expect(result.jobCount).toBe(0);
    expect(result.avgTicket).toBe(0);
    expect(result.byPaymentMethod).toEqual([]);
  });

  test("sums total revenue and job count", () => {
    var rows = [
      { total_price: 1000, payment_status: "paid", payment_method: "Cash" },
      { total_price: 500, payment_status: "paid", payment_method: "Till" },
      { total_price: 1500, payment_status: "paid", payment_method: "Cash" },
    ];
    var result = summarizeRevenue(rows, {});
    expect(result.totalRevenue).toBe(3000);
    expect(result.jobCount).toBe(3);
    expect(result.avgTicket).toBe(1000);
  });

  test("groups unpaid jobs under 'Unpaid' regardless of payment_method value", () => {
    var rows = [{ total_price: 400, payment_status: "unpaid", payment_method: null }];
    var result = summarizeRevenue(rows, {});
    expect(result.byPaymentMethod).toEqual([{ method: "Unpaid", total: 400, count: 1 }]);
  });

  test("treats missing/non-numeric total_price as zero", () => {
    var rows = [{ total_price: null, payment_status: "paid" }, { payment_status: "paid" }];
    var result = summarizeRevenue(rows, {});
    expect(result.totalRevenue).toBe(0);
    expect(result.jobCount).toBe(2);
  });
});

describe("AutoLocalIntelligenceProvider.summarizeCustomers", () => {
  test("counts distinct visitors by customer_id", () => {
    var jobs = [{ customer_id: "a" }, { customer_id: "a" }, { customer_id: "b" }];
    var result = summarizeCustomers(jobs, []);
    expect(result.visitorCount).toBe(2);
  });

  test("ignores jobs with no customer_id", () => {
    var jobs = [{ total_price: 500 }];
    var result = summarizeCustomers(jobs, []);
    expect(result.visitorCount).toBe(0);
  });

  test("counts new customers from the given rows directly", () => {
    var newCustomers = [{ id: "1" }, { id: "2" }];
    var result = summarizeCustomers([], newCustomers);
    expect(result.newCustomerCount).toBe(2);
  });
});

describe("AutoLocalIntelligenceProvider.summarizeTopServices", () => {
  test("aggregates count and revenue per service name, sorted by count descending", () => {
    var rows = [
      { auto_services: { name: "Basic Wash" }, price: 500 },
      { auto_services: { name: "Basic Wash" }, price: 500 },
      { auto_services: { name: "Full Detail" }, price: 3500 },
    ];
    var result = summarizeTopServices(rows, {});
    expect(result.items).toEqual([
      { name: "Basic Wash", qty: 2, revenue: 1000 },
      { name: "Full Detail", qty: 1, revenue: 3500 },
    ]);
  });

  test("respects the limit option", () => {
    var rows = [
      { auto_services: { name: "A" }, price: 100 },
      { auto_services: { name: "B" }, price: 100 },
      { auto_services: { name: "C" }, price: 100 },
    ];
    var result = summarizeTopServices(rows, { limit: 2 });
    expect(result.items.length).toBe(2);
  });

  test("ignores rows with no joined service name, without throwing", () => {
    var rows = [{ auto_services: null, price: 100 }, {}];
    expect(() => summarizeTopServices(rows, {})).not.toThrow();
    expect(summarizeTopServices(rows, {}).items).toEqual([]);
  });
});

describe("AutoLocalIntelligenceProvider.summarizeCommission", () => {
  test("sums commission per staff member, sorted descending, using staffById lookup", () => {
    var staffById = { s1: { id: "s1", name: "Kevin" }, s2: { id: "s2", name: "Amy" } };
    var jobs = [
      { commission: 200, assigned_staff_id: "s1" },
      { commission: 800, assigned_staff_id: "s2" },
      { commission: 100, assigned_staff_id: "s1" },
    ];
    var result = summarizeCommission(jobs, staffById, {});
    expect(result.totalCommission).toBe(1100);
    expect(result.byStaff).toEqual([
      { name: "Amy", commission: 800, count: 1 },
      { name: "Kevin", commission: 300, count: 2 },
    ]);
  });

  test("labels an unassigned job's commission as 'Unassigned'", () => {
    var jobs = [{ commission: 150, assigned_staff_id: null }];
    var result = summarizeCommission(jobs, {}, {});
    expect(result.byStaff).toEqual([{ name: "Unassigned", commission: 150, count: 1 }]);
  });
});

describe("AutoLocalIntelligenceProvider.classifyQuestion", () => {
  test("routes commission/staff phrasings to commission -- unlike POS's classifier, which treats these as unsupported", () => {
    expect(classifyQuestion("how much commission is owed this week?")).toEqual({
      capability: "commission",
      range: "week",
    });
    expect(classifyQuestion("who earned the most this month")).toEqual({
      capability: "commission",
      range: "month",
    });
  });

  test("routes revenue phrasings to revenue, defaulting to today", () => {
    expect(classifyQuestion("how much did we make today?")).toEqual({
      capability: "revenue",
      range: "today",
    });
  });

  test("routes customer/visitor phrasings to customers", () => {
    expect(classifyQuestion("how many customers visited this week?")).toEqual({
      capability: "customers",
      range: "week",
    });
  });

  test("routes best-service phrasings to topServices", () => {
    expect(classifyQuestion("which service is most popular this month?")).toEqual({
      capability: "topServices",
      range: "month",
    });
  });

  test("declines topics none of the four capabilities cover", () => {
    expect(classifyQuestion("what's our next booking").capability).toBe("unsupported");
    expect(classifyQuestion("show me today's reviews").capability).toBe("unsupported");
  });

  test("recognizes yesterday", () => {
    expect(classifyQuestion("what did we make yesterday").range).toBe("yesterday");
  });

  test("handles empty/undefined input without throwing", () => {
    expect(() => classifyQuestion("")).not.toThrow();
    expect(() => classifyQuestion(undefined)).not.toThrow();
  });
});
