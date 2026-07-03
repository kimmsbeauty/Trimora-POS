jest.mock("../db", () => ({ db: jest.fn() }));

import { db } from "../db";
import { getRevenueSummary, getCustomerSummary, getTopItems } from "./AIService";

describe("AIService.getRevenueSummary", () => {
  beforeEach(() => {
    db.mockReset();
  });

  test("fetches sales for the given date range and delegates to the active provider", async () => {
    db.mockResolvedValue([
      { total: 1000, payment: "Cash", date: "2026-07-01" },
      { total: 2000, payment: "Till", date: "2026-07-02" },
    ]);

    var result = await getRevenueSummary({ dateFrom: "2026-07-01", dateTo: "2026-07-02" });

    expect(db).toHaveBeenCalledWith(
      "GET",
      "sales",
      null,
      "?date=gte.2026-07-01&date=lte.2026-07-02"
    );
    expect(result.provider).toBe("local");
    expect(result.totalRevenue).toBe(3000);
    expect(result.saleCount).toBe(2);
  });

  test("defaults dateTo to dateFrom when only dateFrom is given", async () => {
    db.mockResolvedValue([]);
    await getRevenueSummary({ dateFrom: "2026-07-01" });
    expect(db).toHaveBeenCalledWith(
      "GET",
      "sales",
      null,
      "?date=gte.2026-07-01&date=lte.2026-07-01"
    );
  });

  test("returns null when the fetch fails (db returns null)", async () => {
    db.mockResolvedValue(null);
    var result = await getRevenueSummary({ dateFrom: "2026-07-01", dateTo: "2026-07-01" });
    expect(result).toBeNull();
  });

  test("excludes rows with a non-ISO date and logs a warning instead of skewing the total", async () => {
    var errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    db.mockResolvedValue([
      { total: 1000, payment: "Cash", date: "2026-07-01" },
      { total: 9999, payment: "Cash", date: "01/07/2026" },
    ]);

    var result = await getRevenueSummary({ dateFrom: "2026-07-01", dateTo: "2026-07-01" });

    expect(result.totalRevenue).toBe(1000);
    expect(result.saleCount).toBe(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe("AIService.getCustomerSummary", () => {
  beforeEach(() => {
    db.mockReset();
  });

  test("fetches sales and new-customer rows for the range and delegates to the provider", async () => {
    db.mockImplementation((method, table) => {
      if (table === "sales") {
        return Promise.resolve([
          { client: "Jane", client_phone: "0700111111", date: "2026-07-01" },
          { client: "Jane", client_phone: "0700111111", date: "2026-07-01" },
        ]);
      }
      if (table === "customers") {
        return Promise.resolve([{ id: "1" }]);
      }
      return Promise.resolve(null);
    });

    var result = await getCustomerSummary({ dateFrom: "2026-07-01", dateTo: "2026-07-01" });

    expect(db).toHaveBeenCalledWith("GET", "customers", null, "?created_at=gte.2026-07-01T00:00:00&created_at=lte.2026-07-01T23:59:59");
    expect(result.visitorCount).toBe(1);
    expect(result.newCustomerCount).toBe(1);
  });

  test("returns null if the customers fetch fails", async () => {
    db.mockImplementation((method, table) => {
      if (table === "sales") return Promise.resolve([]);
      if (table === "customers") return Promise.resolve(null);
      return Promise.resolve(null);
    });
    var result = await getCustomerSummary({ dateFrom: "2026-07-01", dateTo: "2026-07-01" });
    expect(result).toBeNull();
  });
});

describe("AIService.getTopItems", () => {
  beforeEach(() => {
    db.mockReset();
  });

  test("fetches sales for the range and returns top items from the provider", async () => {
    db.mockResolvedValue([
      { date: "2026-07-01", items: [{ name: "Haircut", type: "service", qty: 2 }] },
    ]);
    var result = await getTopItems({ dateFrom: "2026-07-01", dateTo: "2026-07-01" });
    expect(result.items).toEqual([{ name: "Haircut", type: "service", qty: 2 }]);
  });

  test("passes the limit option through to the provider", async () => {
    db.mockResolvedValue([
      { date: "2026-07-01", items: [{ name: "A", type: "service", qty: 1 }, { name: "B", type: "service", qty: 1 }] },
    ]);
    var result = await getTopItems({ dateFrom: "2026-07-01", dateTo: "2026-07-01", limit: 1 });
    expect(result.items.length).toBe(1);
  });
});
