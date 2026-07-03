import { rangeKeywordToDates } from "./AskTrimora";

describe("rangeKeywordToDates", () => {
  test("defaults to today for an unrecognized keyword", () => {
    var r = rangeKeywordToDates("nonsense");
    expect(r.label).toBe("today");
    expect(r.dateFrom).toBe(r.dateTo);
  });

  test("'week' resolves to a 7-day range ending today", () => {
    var r = rangeKeywordToDates("week");
    expect(r.label).toBe("the last 7 days");
    expect(r.dateFrom).not.toBe(r.dateTo);
  });

  test("'month' resolves to a 30-day range ending today", () => {
    var r = rangeKeywordToDates("month");
    expect(r.label).toBe("the last 30 days");
    expect(r.dateFrom).not.toBe(r.dateTo);
  });

  test("'yesterday' resolves to a single-day range", () => {
    var r = rangeKeywordToDates("yesterday");
    expect(r.label).toBe("yesterday");
    expect(r.dateFrom).toBe(r.dateTo);
  });

  test("'today' resolves to a single-day range", () => {
    var r = rangeKeywordToDates("today");
    expect(r.label).toBe("today");
    expect(r.dateFrom).toBe(r.dateTo);
  });
});
