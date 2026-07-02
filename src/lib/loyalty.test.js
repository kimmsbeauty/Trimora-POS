// src/lib/loyalty.test.js
//
// Covers the tier thresholds directly -- these determine what a real
// customer is shown as their loyalty status, so an off-by-one here is
// a customer-facing/business-facing bug, not just cosmetic.

import { getLoyaltyTier, nextTierProgress } from "./loyalty";

describe("getLoyaltyTier", () => {
  it("returns New for a customer with no visits and no spend", () => {
    expect(getLoyaltyTier({ visit_count: 0, total_spend: 0 }).tier).toBe("New");
  });

  it("returns New for a null/undefined customer without throwing", () => {
    expect(getLoyaltyTier(null).tier).toBe("New");
    expect(getLoyaltyTier(undefined).tier).toBe("New");
    expect(getLoyaltyTier({}).tier).toBe("New");
  });

  it("boundary: exactly 1 visit is Bronze, not New", () => {
    expect(getLoyaltyTier({ visit_count: 1 }).tier).toBe("Bronze");
  });

  it("boundary: exactly 4 visits is Silver, not Bronze", () => {
    expect(getLoyaltyTier({ visit_count: 3 }).tier).toBe("Bronze");
    expect(getLoyaltyTier({ visit_count: 4 }).tier).toBe("Silver");
  });

  it("boundary: exactly 8 visits is Gold, not Silver", () => {
    expect(getLoyaltyTier({ visit_count: 7 }).tier).toBe("Silver");
    expect(getLoyaltyTier({ visit_count: 8 }).tier).toBe("Gold");
  });

  it("boundary: exactly 15 visits is VIP", () => {
    expect(getLoyaltyTier({ visit_count: 14 }).tier).toBe("Gold");
    expect(getLoyaltyTier({ visit_count: 15 }).tier).toBe("VIP");
  });

  it("spend alone can reach VIP even with few visits (spend >= 30000)", () => {
    expect(getLoyaltyTier({ visit_count: 1, total_spend: 30000 }).tier).toBe("VIP");
    expect(getLoyaltyTier({ visit_count: 1, total_spend: 29999 }).tier).toBe("Bronze");
  });

  it("high visits without matching spend still reaches VIP via visit count alone", () => {
    expect(getLoyaltyTier({ visit_count: 15, total_spend: 0 }).tier).toBe("VIP");
  });
});

describe("nextTierProgress", () => {
  it("returns null once a customer is already VIP (nothing further to progress toward)", () => {
    expect(nextTierProgress({ visit_count: 15 })).toBeNull();
    expect(nextTierProgress({ visit_count: 20 })).toBeNull();
  });

  it("a brand-new customer is shown progress toward Bronze", () => {
    var progress = nextTierProgress({ visit_count: 0 });
    expect(progress.nextTier).toBe("Bronze");
    expect(progress.visitsNeeded).toBe(1);
    expect(progress.progress).toBe(0);
  });

  it("reports correct visitsNeeded partway to the next tier", () => {
    // 2 visits in, next tier is Silver at 4 -> 2 more visits needed
    var progress = nextTierProgress({ visit_count: 2 });
    expect(progress.nextTier).toBe("Silver");
    expect(progress.visitsNeeded).toBe(2);
  });

  it("progress percentage is between 0 and 100 for a mid-range customer", () => {
    var progress = nextTierProgress({ visit_count: 5 }); // between Silver(4) and Gold(8)
    expect(progress.progress).toBeGreaterThanOrEqual(0);
    expect(progress.progress).toBeLessThanOrEqual(100);
  });
});
