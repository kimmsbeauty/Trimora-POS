// src/lib/cartMath.test.js
//
// This is the real money math: what a customer is charged and what a
// stylist is paid, per sale. Previously untestable because it lived
// as inline closures inside POSApp.jsx. These tests were written
// against the extracted logic in cartMath.js, which is a verbatim,
// behavior-preserving move out of that file -- not a rewrite.

import {
  calculateCartTotals,
  rateForStylistName,
  calculateCommission,
  calculateCommissionByStylist,
  distinctStylistsInCart,
} from "./cartMath";

var haircut  = { id: 1, type: "service", price: 1000, qty: 1, stylist: "Jane" };
var manicure = { id: 2, type: "service", price: 500,  qty: 1, stylist: "Amy" };
var shampoo  = { id: 3, type: "product", price: 300,  qty: 2 };

describe("calculateCartTotals", () => {
  it("sums services and products separately", () => {
    var result = calculateCartTotals([haircut, manicure, shampoo], {
      showDiscount: false, discountType: "pct", discountValue: "",
    });
    expect(result.serviceTotal).toBe(1500);
    expect(result.productTotal).toBe(600); // 300 * qty 2
    expect(result.cartTotal).toBe(2100);
  });

  it("applies no discount when showDiscount is false, even with a value set", () => {
    var result = calculateCartTotals([haircut], {
      showDiscount: false, discountType: "pct", discountValue: "50",
    });
    expect(result.discountAmt).toBe(0);
    expect(result.cartTotal).toBe(1000);
  });

  it("applies a percentage discount to services only, never products", () => {
    var result = calculateCartTotals([haircut, shampoo], {
      showDiscount: true, discountType: "pct", discountValue: "10",
    });
    expect(result.discountAmt).toBe(100); // 10% of 1000
    expect(result.discountedServiceTotal).toBe(900);
    expect(result.cartTotal).toBe(900 + 600); // discounted services + full product price
  });

  it("applies a fixed-amount discount", () => {
    var result = calculateCartTotals([haircut], {
      showDiscount: true, discountType: "fixed", discountValue: "200",
    });
    expect(result.discountAmt).toBe(200);
    expect(result.cartTotal).toBe(800);
  });

  it("clamps a percentage discount at 100% of services (never a negative total)", () => {
    var result = calculateCartTotals([haircut], {
      showDiscount: true, discountType: "pct", discountValue: "150", // 150% requested
    });
    expect(result.discountAmt).toBe(1000); // clamped to full service total
    expect(result.discountedServiceTotal).toBe(0);
  });

  it("clamps a fixed discount at the service total (can't discount more than the services cost)", () => {
    var result = calculateCartTotals([haircut], {
      showDiscount: true, discountType: "fixed", discountValue: "5000", // way more than 1000
    });
    expect(result.discountAmt).toBe(1000);
    expect(result.discountedServiceTotal).toBe(0);
  });

  it("a discount never applies if there are no services in the cart, even with products present", () => {
    var result = calculateCartTotals([shampoo], {
      showDiscount: true, discountType: "pct", discountValue: "50",
    });
    expect(result.discountAmt).toBe(0);
    expect(result.cartTotal).toBe(600);
  });

  it("treats an unparseable discount value as zero, not NaN", () => {
    var result = calculateCartTotals([haircut], {
      showDiscount: true, discountType: "pct", discountValue: "abc",
    });
    expect(result.discountAmt).toBe(0);
    expect(result.cartTotal).toBe(1000);
    expect(Number.isNaN(result.cartTotal)).toBe(false);
  });

  it("handles an empty cart without throwing", () => {
    var result = calculateCartTotals([], { showDiscount: false, discountType: "pct", discountValue: "" });
    expect(result.cartTotal).toBe(0);
  });

  it("respects per-item quantity", () => {
    var result = calculateCartTotals([shampoo], { showDiscount: false, discountType: "pct", discountValue: "" });
    expect(result.productTotal).toBe(600); // price 300 * qty 2
  });
});

describe("rateForStylistName", () => {
  var staffList = [
    { name: "Jane", commission_pct: 50 },
    { name: "Amy",  commission_pct: 0 }, // explicit 0% -- must not fall back to default
  ];

  it("returns the staff member's own commission_pct as a decimal", () => {
    expect(rateForStylistName("Jane", staffList)).toBe(0.5);
  });

  it("respects an explicit 0% rate rather than treating it as unset", () => {
    // this is a real edge case: `member.commission_pct != null` must be
    // used, not a truthy check, or a genuine 0% staff member would
    // silently fall back to the 40% default and be overpaid.
    expect(rateForStylistName("Amy", staffList)).toBe(0);
  });

  it("falls back to 40% for a stylist not found in staffList", () => {
    expect(rateForStylistName("Nonexistent", staffList)).toBe(0.4);
  });

  it("falls back to 40% when staffList is empty or missing", () => {
    expect(rateForStylistName("Jane", [])).toBe(0.4);
    expect(rateForStylistName("Jane", undefined)).toBe(0.4);
  });
});

describe("calculateCommission", () => {
  var staffList = [{ name: "Jane", commission_pct: 50 }];

  it("calculates commission on the post-discount amount, not the pre-discount price", () => {
    // 1000 service, 50% discount -> 500 discounted; Jane at 50% commission -> 250
    var totals = calculateCartTotals([haircut], { showDiscount: true, discountType: "pct", discountValue: "50" });
    var commission = calculateCommission([haircut], {
      staffList: staffList, selStaff: "Jane",
      serviceTotal: totals.serviceTotal, discountedServiceTotal: totals.discountedServiceTotal,
    });
    expect(commission).toBe(250);
  });

  it("uses an item's own commission_override in preference to the stylist's rate", () => {
    var overridden = Object.assign({}, haircut, { commission_override: 10 }); // 10% override
    var totals = calculateCartTotals([overridden], { showDiscount: false, discountType: "pct", discountValue: "" });
    var commission = calculateCommission([overridden], {
      staffList: staffList, selStaff: "Jane",
      serviceTotal: totals.serviceTotal, discountedServiceTotal: totals.discountedServiceTotal,
    });
    expect(commission).toBe(100); // 10% of 1000, not Jane's 50%
  });

  it("falls back to the cart's default selStaff when an item has no stylist of its own", () => {
    var noStylist = Object.assign({}, haircut, { stylist: null });
    var totals = calculateCartTotals([noStylist], { showDiscount: false, discountType: "pct", discountValue: "" });
    var commission = calculateCommission([noStylist], {
      staffList: staffList, selStaff: "Jane",
      serviceTotal: totals.serviceTotal, discountedServiceTotal: totals.discountedServiceTotal,
    });
    expect(commission).toBe(500); // Jane's 50% applied via fallback
  });

  it("products never contribute to commission (only serviceItems are passed in)", () => {
    var totals = calculateCartTotals([haircut, shampoo], { showDiscount: false, discountType: "pct", discountValue: "" });
    var commission = calculateCommission([haircut], { // only the service item passed
      staffList: staffList, selStaff: "Jane",
      serviceTotal: totals.serviceTotal, discountedServiceTotal: totals.serviceTotal,
    });
    expect(commission).toBe(500); // unaffected by the product in the cart
  });
});

describe("calculateCommissionByStylist", () => {
  var staffList = [
    { name: "Jane", commission_pct: 50 },
    { name: "Amy",  commission_pct: 20 },
  ];

  it("buckets commission correctly across multiple stylists in one sale", () => {
    var totals = calculateCartTotals([haircut, manicure], { showDiscount: false, discountType: "pct", discountValue: "" });
    var byStylist = calculateCommissionByStylist([haircut, manicure], {
      staffList: staffList, selStaff: "Jane",
      serviceTotal: totals.serviceTotal, discountedServiceTotal: totals.discountedServiceTotal,
    });
    expect(byStylist.Jane).toBe(500); // 1000 * 50%
    expect(byStylist.Amy).toBe(100);  // 500 * 20%
  });

  it("skips an item entirely if it has no stylist and there's no default to fall back to", () => {
    var noStylist = Object.assign({}, haircut, { stylist: null });
    var totals = calculateCartTotals([noStylist], { showDiscount: false, discountType: "pct", discountValue: "" });
    var byStylist = calculateCommissionByStylist([noStylist], {
      staffList: staffList, selStaff: null, // no default selected either
      serviceTotal: totals.serviceTotal, discountedServiceTotal: totals.discountedServiceTotal,
    });
    expect(Object.keys(byStylist).length).toBe(0);
  });
});

describe("distinctStylistsInCart", () => {
  it("returns each stylist once even if they appear on multiple line items", () => {
    var haircut2 = Object.assign({}, haircut, { id: 4 });
    var result = distinctStylistsInCart([haircut, haircut2, manicure], null);
    expect(result.sort()).toEqual(["Amy", "Jane"]);
  });

  it("falls back to selStaff for items with no stylist of their own", () => {
    var noStylist = Object.assign({}, haircut, { stylist: null });
    var result = distinctStylistsInCart([noStylist], "DefaultStylist");
    expect(result).toEqual(["DefaultStylist"]);
  });

  it("returns an empty array for an all-product cart", () => {
    expect(distinctStylistsInCart([], null)).toEqual([]);
  });
});
