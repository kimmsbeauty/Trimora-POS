jest.mock("../db", () => ({ db: jest.fn() }));

import { db } from "../db";
import { getRevenueSummary } from "./AIService";

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
