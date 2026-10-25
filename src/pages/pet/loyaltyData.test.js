import {
  DEFAULT_SETTINGS, withDefaults, tierFor, tierProgress, pointsFor, validateSettings, parseInts, validateReward, isDuplicateReward,
  validateAdjustment, accountOf, memberRows, summary, loyaltyErrorMessage, REASON_LABELS,
} from "./loyaltyData";

var S = { enabled: true, kes_per_point: 100, visit_bonus: 0, silver_at: 500, gold_at: 2000 };

describe("tiers and points", function () {
  it("starts the programme off with the same defaults as the database", function () {
    expect(DEFAULT_SETTINGS).toEqual({ enabled: false, kes_per_point: 100, visit_bonus: 0, silver_at: 500, gold_at: 2000 });
    expect(withDefaults(null)).toEqual(DEFAULT_SETTINGS);
    expect(withDefaults({ enabled: true }).kes_per_point).toBe(100);
  });
  it("derives the tier from lifetime points at the thresholds", function () {
    expect(tierFor(0, S)).toBe("Bronze");
    expect(tierFor(499, S)).toBe("Bronze");
    expect(tierFor(500, S)).toBe("Silver");
    expect(tierFor(1999, S)).toBe("Silver");
    expect(tierFor(2000, S)).toBe("Gold");
    expect(tierFor(undefined, S)).toBe("Bronze");
  });
  it("shows progress toward the next tier and none at the top", function () {
    expect(tierProgress(250, S)).toEqual({ next: "Silver", pointsNeeded: 250, pct: 50 });
    expect(tierProgress(500, S)).toEqual({ next: "Gold", pointsNeeded: 1500, pct: 0 });
    expect(tierProgress(1250, S)).toEqual({ next: "Gold", pointsNeeded: 750, pct: 50 });
    expect(tierProgress(2000, S)).toBeNull();
  });
  it("previews the points an amount earns, rounding down like the database", function () {
    expect(pointsFor(1500, S)).toBe(15);
    expect(pointsFor(1500, { kes_per_point: 250 })).toBe(6);
    expect(pointsFor(99, S)).toBe(0);
    expect(pointsFor(-5, S)).toBe(0);
    expect(pointsFor("abc", S)).toBe(0);
  });
});

describe("validation (mirrors the database)", function () {
  var ok = { enabled: true, kes_per_point: "100", visit_bonus: "0", silver_at: "500", gold_at: "2000" };
  it("accepts good settings and rejects each bad one", function () {
    expect(validateSettings(ok)).toBe("");
    expect(validateSettings(Object.assign({}, ok, { kes_per_point: "0" }))).toMatch(/Spend per point/);
    expect(validateSettings(Object.assign({}, ok, { kes_per_point: "1.5" }))).toMatch(/Spend per point/);
    expect(validateSettings(Object.assign({}, ok, { kes_per_point: "" }))).toMatch(/Spend per point/);
    expect(validateSettings(Object.assign({}, ok, { visit_bonus: "-1" }))).toMatch(/Visit bonus/);
    expect(validateSettings(Object.assign({}, ok, { silver_at: "-5" }))).toMatch(/Silver/);
    expect(validateSettings(Object.assign({}, ok, { gold_at: "0", silver_at: "0" }))).toMatch(/Gold/);
    expect(validateSettings(Object.assign({}, ok, { silver_at: "2000" }))).toMatch(/higher than Silver/);
    expect(parseInts(ok)).toEqual({ enabled: true, kes_per_point: 100, visit_bonus: 0, silver_at: 500, gold_at: 2000 });
  });
  it("validates rewards and detects duplicate names", function () {
    expect(validateReward({ name: "Free nail trim", points_cost: "500" })).toBe("");
    expect(validateReward({ name: "  ", points_cost: "500" })).toMatch(/name/);
    expect(validateReward({ name: "x".repeat(81), points_cost: "5" })).toMatch(/80/);
    expect(validateReward({ name: "A", points_cost: "0" })).toMatch(/at least 1/);
    expect(validateReward({ name: "A", points_cost: "2.5" })).toMatch(/whole number/);
    var rs = [{ id: "r1", name: "Free nail trim" }];
    expect(isDuplicateReward(rs, " free NAIL trim ", null)).toBe(true);
    expect(isDuplicateReward(rs, "free nail trim", "r1")).toBe(false);
  });
  it("validates an adjustment: whole non-zero points, a reason, and not below zero", function () {
    expect(validateAdjustment("100", "Goodwill", 0)).toBe("");
    expect(validateAdjustment("0", "x", 10)).toMatch(/other than 0/);
    expect(validateAdjustment("1.5", "x", 10)).toMatch(/whole number/);
    expect(validateAdjustment("abc", "x", 10)).toMatch(/whole number/);
    expect(validateAdjustment("10", "   ", 10)).toMatch(/note/);
    expect(validateAdjustment("-11", "Correction", 10)).toMatch(/below zero/);
    expect(validateAdjustment("-10", "Correction", 10)).toBe("");
    expect(validateAdjustment("2000000", "x", 0)).toMatch(/too many/);
  });
});

describe("members and totals", function () {
  var customers = [{ id: "c1", name: "Wanjiru Kamau", phone: "0712 345 678" }, { id: "c2", name: "James Mwangi", phone: "0705000111" }, { id: "c3", name: "No Account", phone: "" }];
  var accounts = [
    { customer_id: "c1", points_balance: 120, lifetime_earned: 600, lifetime_redeemed: 480 },
    { customer_id: "c2", points_balance: 900, lifetime_earned: 2100, lifetime_redeemed: 1200 },
    { customer_id: "gone", points_balance: 5, lifetime_earned: 5, lifetime_redeemed: 0 },
  ];
  it("lists only customers with an account, biggest balance first, with their tier", function () {
    var rows = memberRows(customers, accounts, S, "");
    expect(rows.map(function (r) { return r.customer.name; })).toEqual(["James Mwangi", "Wanjiru Kamau", "Unknown customer"]);
    expect(rows.map(function (r) { return r.tier; })).toEqual(["Gold", "Silver", "Bronze"]);
  });
  it("searches by name or phone, ignoring spaces and case", function () {
    expect(memberRows(customers, accounts, S, "wanj").length).toBe(1);
    expect(memberRows(customers, accounts, S, "0712345").length).toBe(1);
    expect(memberRows(customers, accounts, S, "0712 345").length).toBe(1);
    expect(memberRows(customers, accounts, S, "zzz").length).toBe(0);
  });
  it("finds an account and totals the programme", function () {
    expect(accountOf(accounts, "c2").points_balance).toBe(900);
    expect(accountOf(accounts, "c3")).toBeNull();
    expect(summary(accounts, [{ status: "issued" }, { status: "used" }, { status: "issued" }])).toEqual({ members: 3, outstanding: 1025, earned: 2705, redeemed: 1680, vouchersReady: 2 });
    expect(summary([], [])).toEqual({ members: 0, outstanding: 0, earned: 0, redeemed: 0, vouchersReady: 0 });
  });
});

describe("messages", function () {
  it("maps database codes to plain words and never leaks raw errors", function () {
    expect(loyaltyErrorMessage("INSUFFICIENT_POINTS")).toBe("Not enough points for that.");
    expect(loyaltyErrorMessage("PROGRAM_DISABLED")).toMatch(/switched off/);
    expect(loyaltyErrorMessage("INVALID_STATUS_CHANGE")).toMatch(/already been used or cancelled/);
    expect(loyaltyErrorMessage("Network error")).toMatch(/connection/);
    expect(loyaltyErrorMessage("relation does not exist")).toMatch(/Couldn't save/);
    expect(loyaltyErrorMessage("relation does not exist")).not.toMatch(/relation/);
  });
  it("labels every ledger reason the database can write", function () {
    ["earn_invoice", "visit_bonus", "redeem", "redeem_refund", "adjustment"].forEach(function (r) { expect(REASON_LABELS[r]).toBeTruthy(); });
  });
});
