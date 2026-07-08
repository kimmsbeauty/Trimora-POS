// src/lib/saleLogic.js
//
// Extracted from POSApp.jsx's completeSale(), where this logic
// previously lived as an inline closure -- meaning the only way to
// exercise it was rendering the whole POS screen (device auth, PWA
// manifest, service worker registration, a dozen child components).
// This is a pure, behavior-preserving extraction, same convention as
// cartMath.js: same order of operations, same edge cases, nothing
// about what a real sale writes to the database should change as a
// result of this file existing.

// Same reduce logic that was inline in completeSale(). Primary stylist
// = whoever has the highest revenue share on this sale, kept for
// backward compatibility with older reports/CSV exports that expect a
// single `stylist` field; the real per-item truth lives in `items`.
export function selectPrimaryStylist(stylistsInCart, serviceItems, selStaff) {
  if (!stylistsInCart || stylistsInCart.length === 0) return selStaff;
  return stylistsInCart.reduce(function(best, name) {
    var nameTotal = serviceItems
      .filter(function(i) { return (i.stylist || selStaff) === name; })
      .reduce(function(a, i) { return a + i.price * (i.qty || 1); }, 0);
    var bestTotal = serviceItems
      .filter(function(i) { return (i.stylist || selStaff) === best; })
      .reduce(function(a, i) { return a + i.price * (i.qty || 1); }, 0);
    return nameTotal > bestTotal ? name : best;
  }, stylistsInCart[0]);
}

// Same object shape completeSale() has always POSTed to the `sales`
// table. `date`/`time`/`feedbackToken` are passed in rather than
// computed here, so this stays a pure function of its inputs (no
// Date.now()/todayStr() calls buried inside), keeping it trivially
// testable and keeping the actual "what time is it" decision where it
// always was, in the component.
export function buildSaleData(params) {
  var primaryStylist = selectPrimaryStylist(
    params.stylistsInCart, params.serviceItems, params.selStaff
  );
  return {
    client: params.clientName,
    client_phone: params.clientPhone,
    stylist: primaryStylist,
    items: params.cart,
    total: params.cartTotal,
    service_total: params.serviceTotal,
    product_total: params.productTotal,
    discount_amount: params.discountAmt,
    discount_type: params.discountAmt > 0 ? params.discountType : null,
    discount_value: params.discountAmt > 0 ? params.discountNum : null,
    discount_reason: params.discountAmt > 0 ? params.discountReason : null,
    commission: params.commission,
    commission_by_stylist: params.commissionByStylist,
    is_multi_stylist: params.stylistsInCart.length > 1,
    payment: params.payMethod,
    date: params.date,
    time: params.time,
    feedback_token: params.feedbackToken,
  };
}

// Same clamp completeSale() has always applied when deducting stock
// for a product line item -- never lets recorded stock go negative,
// even if the cart somehow requests more than is on hand.
export function computeStockAfterDeduction(currentStock, qty) {
  return Math.max(0, currentStock - qty);
}
