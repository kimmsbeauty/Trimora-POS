// src/lib/saleLogic.test.js
//
// Step 5 regression safety net (sale/receipt half). Pure-function
// tests -- no React rendering, no mocked db(), no network -- against
// the logic extracted from POSApp.jsx's completeSale() in saleLogic.js.
// This is deliberately the lightweight complement to
// BookingPage.integration.test.js: mounting the full POS screen would
// require mocking device auth, PWA manifest registration, service
// worker registration, and a dozen child components, none of which
// this logic actually depends on.

import { selectPrimaryStylist, buildSaleData, computeStockAfterDeduction } from "./saleLogic";

describe("selectPrimaryStylist", () => {
  it("returns the single stylist when only one worked the sale", () => {
    var serviceItems = [{ stylist: "Jane", price: 1000, qty: 1 }];
    expect(selectPrimaryStylist(["Jane"], serviceItems, "Jane")).toBe("Jane");
  });

  it("returns whichever stylist has the higher revenue share on a multi-stylist sale", () => {
    var serviceItems = [
      { stylist: "Jane", price: 1000, qty: 1 },
      { stylist: "Amy", price: 500, qty: 1 },
    ];
    expect(selectPrimaryStylist(["Jane", "Amy"], serviceItems, "Jane")).toBe("Jane");
  });

  it("falls back to selStaff when the cart has no stylists assigned (e.g. product-only sale)", () => {
    expect(selectPrimaryStylist([], [], "Front Desk")).toBe("Front Desk");
  });

  it("items missing an explicit stylist fall back to selStaff for the revenue comparison", () => {
    var serviceItems = [
      { stylist: null, price: 1000, qty: 1 }, // falls back to selStaff = "Jane" in the comparison
      { stylist: "Amy", price: 200, qty: 1 },
    ];
    expect(selectPrimaryStylist(["Jane", "Amy"], serviceItems, "Jane")).toBe("Jane");
  });
});

describe("buildSaleData", () => {
  var baseParams = {
    clientName: "Mary Wanjiru",
    clientPhone: "0712345678",
    stylistsInCart: ["Jane"],
    serviceItems: [{ stylist: "Jane", price: 1000, qty: 1 }],
    selStaff: "Jane",
    cart: [{ id: 1, type: "service", name: "Haircut", price: 1000, qty: 1, stylist: "Jane" }],
    cartTotal: 1000,
    serviceTotal: 1000,
    productTotal: 0,
    discountAmt: 0,
    discountType: "pct",
    discountNum: 0,
    discountReason: "",
    commission: 150,
    commissionByStylist: { Jane: 150 },
    payMethod: "Cash",
    date: "2026-07-08",
    time: "14:30",
    feedbackToken: "tok-abc123",
  };

  it("builds the exact sale payload shape completeSale() has always POSTed", () => {
    var result = buildSaleData(baseParams);
    expect(result).toEqual({
      client: "Mary Wanjiru",
      client_phone: "0712345678",
      stylist: "Jane",
      items: baseParams.cart,
      total: 1000,
      service_total: 1000,
      product_total: 0,
      discount_amount: 0,
      discount_type: null,
      discount_value: null,
      discount_reason: null,
      commission: 150,
      commission_by_stylist: { Jane: 150 },
      is_multi_stylist: false,
      payment: "Cash",
      date: "2026-07-08",
      time: "14:30",
      feedback_token: "tok-abc123",
    });
  });

  it("nulls out discount fields when no discount was applied, even if stale values are passed in", () => {
    var params = Object.assign({}, baseParams, {
      discountAmt: 0, discountType: "flat", discountNum: 200, discountReason: "loyalty",
    });
    var result = buildSaleData(params);
    expect(result.discount_type).toBeNull();
    expect(result.discount_value).toBeNull();
    expect(result.discount_reason).toBeNull();
  });

  it("preserves discount fields when a discount was actually applied", () => {
    var params = Object.assign({}, baseParams, {
      discountAmt: 100, discountType: "flat", discountNum: 100, discountReason: "loyalty",
    });
    var result = buildSaleData(params);
    expect(result.discount_amount).toBe(100);
    expect(result.discount_type).toBe("flat");
    expect(result.discount_value).toBe(100);
    expect(result.discount_reason).toBe("loyalty");
  });

  it("marks is_multi_stylist correctly for a multi-stylist sale", () => {
    var params = Object.assign({}, baseParams, { stylistsInCart: ["Jane", "Amy"] });
    expect(buildSaleData(params).is_multi_stylist).toBe(true);
  });
});

describe("computeStockAfterDeduction", () => {
  it("subtracts the sold quantity from current stock", () => {
    expect(computeStockAfterDeduction(10, 3)).toBe(7);
  });

  it("never lets stock go negative, even if the cart requests more than is on hand", () => {
    expect(computeStockAfterDeduction(2, 5)).toBe(0);
  });

  it("handles exact depletion", () => {
    expect(computeStockAfterDeduction(4, 4)).toBe(0);
  });
});
