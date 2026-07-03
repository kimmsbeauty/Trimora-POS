import { classifyQuestion, resolveRange } from "./AskTrimora";

describe("classifyQuestion", () => {
  test("regression: accepts the phrasing that was just wrongly rejected in production", () => {
    expect(classifyQuestion("how much did we generate this week?")).toBe("revenue");
  });

  test("routes revenue phrasings to revenue", () => {
    [
      "how much did I make today?",
      "revenue this week",
      "what's our income this month",
      "how are we doing",
      "show me total takings for today",
    ].forEach(function (q) {
      expect(classifyQuestion(q)).toBe("revenue");
    });
  });

  test("routes customer/visitor phrasings to customers", () => {
    [
      "how many customers visited today?",
      "how many new customers this week?",
      "how many clients came in today",
      "any walk-ins today?",
    ].forEach(function (q) {
      expect(classifyQuestion(q)).toBe("customers");
    });
  });

  test("routes best-seller phrasings to topItems", () => {
    [
      "what items sold most this month?",
      "what was our best seller this week",
      "which product sold the most",
      "what's popular today",
    ].forEach(function (q) {
      expect(classifyQuestion(q)).toBe("topItems");
    });
  });

  test("declines questions clearly about a topic none of the three cover", () => {
    [
      "who is my top stylist?",
      "when is my next booking",
      "which clients are at risk",
      "what's low on stock",
      "show me recent reviews",
    ].forEach(function (q) {
      expect(classifyQuestion(q)).toBe("unsupported");
    });
  });
});

describe("resolveRange", () => {
  test("defaults to today", () => {
    var r = resolveRange("how much did I make?");
    expect(r.label).toBe("today");
    expect(r.dateFrom).toBe(r.dateTo);
  });

  test("recognizes 'week' phrasing as a 7-day range", () => {
    var r = resolveRange("how much did we generate this week?");
    expect(r.label).toBe("the last 7 days");
    expect(r.dateFrom).not.toBe(r.dateTo);
  });

  test("recognizes 'month' phrasing as a 30-day range", () => {
    var r = resolveRange("revenue this month");
    expect(r.label).toBe("the last 30 days");
  });

  test("recognizes 'yesterday'", () => {
    var r = resolveRange("what did we make yesterday");
    expect(r.label).toBe("yesterday");
    expect(r.dateFrom).toBe(r.dateTo);
  });
});
