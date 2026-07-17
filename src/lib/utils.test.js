// src/lib/utils.test.js
//
// These specifically cover the class of bug that broke feedback
// persistence: writing a locale/prose date string (today()) into a
// Postgres `date` column instead of the ISO string (todayStr()) that
// column actually accepts. todayStr() already carries a FIX comment
// explaining a near-identical prior incident (DD/MM/YYYY being
// misread as a month). These tests exist so a future regression here
// fails a test run instead of silently breaking writes again.

import { fmt, todayStr, nowTime, today } from "./utils";

describe("todayStr", () => {
  it("returns strict ISO 8601 (YYYY-MM-DD), not a locale format", () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("zero-pads single-digit months and days", () => {
    // Fixed reference date: Jan 5, 2026 -- both month and day are
    // single digits, the exact case that breaks without padStart.
    var fixed = new Date(2026, 0, 5); // months are 0-indexed
    var spy = vi.spyOn(global, "Date").mockImplementation(function() { return fixed; });
    expect(todayStr()).toBe("2026-01-05");
    spy.mockRestore();
  });

  it("never contains a weekday name or comma (the bug that broke feedback)", () => {
    // today() produces "Thursday, July 2, 2026" -- if todayStr() ever
    // regresses toward that shape, this is what should catch it.
    var result = todayStr();
    expect(result).not.toMatch(/[A-Za-z]/);
    expect(result).not.toContain(",");
  });
});

describe("today", () => {
  it("is a human-readable prose string, distinct from todayStr", () => {
    // today() is intentionally NOT meant to be written to a date
    // column -- this test documents that the two are different
    // shapes on purpose, so no one "simplifies" call sites by
    // swapping one for the other without noticing.
    expect(today()).toMatch(/[A-Za-z]+day/); // contains a weekday name
    expect(today()).not.toBe(todayStr());
  });
});

describe("nowTime", () => {
  it("returns a non-empty time string", () => {
    expect(typeof nowTime()).toBe("string");
    expect(nowTime().length).toBeGreaterThan(0);
  });
});

describe("fmt", () => {
  it("prefixes with the KES currency code", () => {
    expect(fmt(1000)).toMatch(/^KES /);
  });

  it("adds thousands separators", () => {
    expect(fmt(1000)).toBe("KES 1,000");
    expect(fmt(1000000)).toBe("KES 1,000,000");
  });

  it("handles zero and small numbers without throwing", () => {
    expect(fmt(0)).toBe("KES 0");
    expect(fmt(50)).toBe("KES 50");
  });

  it("coerces numeric strings (values often arrive as strings from form inputs)", () => {
    expect(fmt("2500")).toBe("KES 2,500");
  });
});
