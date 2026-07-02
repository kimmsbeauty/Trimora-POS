// src/lib/cartMath.js
//
// Extracted from POSApp.jsx, where this logic previously lived as
// inline closures inside the component body -- meaning it could only
// be exercised by rendering the whole POS screen. This is the actual
// money math behind every sale (totals, discounts, commission), so
// it's the highest-value candidate in the app for real test coverage.
//
// IMPORTANT: this is a pure, behavior-preserving extraction. Every
// function here is byte-for-byte the same logic that was inline in
// POSApp.jsx -- same order of operations, same rounding, same edge
// cases (division-by-zero guards, discount clamping). Nothing about
// what a real sale calculates should change as a result of this file
// existing. If you need to change pricing/discount/commission
// behavior, change it here (and update cartMath.test.js), not by
// reintroducing inline logic in POSApp.jsx.

export function splitCartByType(cart) {
  var serviceItems = cart.filter(function(i) { return i.type === "service"; });
  var productItems = cart.filter(function(i) { return i.type === "product"; });
  return { serviceItems: serviceItems, productItems: productItems };
}

// Discount is applied to services only, never products. `discountValue`
// arrives as a raw string from the input field, same as it did inline.
export function calculateCartTotals(cart, opts) {
  var showDiscount   = opts.showDiscount;
  var discountType   = opts.discountType;
  var discountValue  = opts.discountValue;

  var split = splitCartByType(cart);
  var serviceItems = split.serviceItems;
  var productItems = split.productItems;

  var serviceTotal = serviceItems.reduce(function(s, i) { return s + i.price * (i.qty || 1); }, 0);
  var productTotal = productItems.reduce(function(s, i) { return s + i.price * (i.qty || 1); }, 0);

  var discountAmt = 0;
  var discountNum = parseFloat(discountValue) || 0;
  if (showDiscount && discountNum > 0 && serviceTotal > 0) {
    if (discountType === "pct") {
      discountAmt = Math.min(serviceTotal, serviceTotal * (discountNum / 100));
    } else {
      discountAmt = Math.min(serviceTotal, discountNum);
    }
  }

  var discountedServiceTotal = serviceTotal - discountAmt;
  var cartTotal = discountedServiceTotal + productTotal;

  return {
    serviceItems: serviceItems,
    productItems: productItems,
    serviceTotal: serviceTotal,
    productTotal: productTotal,
    discountNum: discountNum,
    discountAmt: discountAmt,
    discountedServiceTotal: discountedServiceTotal,
    cartTotal: cartTotal,
  };
}

// Default commission rate is 40% when a staff member has no
// commission_pct set -- same fallback as the original inline version.
export function rateForStylistName(name, staffList) {
  var member = (staffList || []).find(function(s) { return s.name === name; });
  return ((member && member.commission_pct != null ? member.commission_pct : 40)) / 100;
}

// Per-item commission using each item's own assigned stylist, falling
// back to the cart's default selected stylist -- keeps single-stylist
// sales working exactly as before multi-stylist support existed.
export function calculateCommission(serviceItems, opts) {
  var staffList               = opts.staffList;
  var selStaff                = opts.selStaff;
  var serviceTotal             = opts.serviceTotal;
  var discountedServiceTotal   = opts.discountedServiceTotal;

  return serviceItems.reduce(function(sum, item) {
    var itemStylist = item.stylist || selStaff;
    var rate = item.commission_override != null
      ? item.commission_override / 100
      : rateForStylistName(itemStylist, staffList);
    var itemTotal      = item.price * (item.qty || 1);
    var itemDiscounted = serviceTotal > 0 ? itemTotal * (discountedServiceTotal / serviceTotal) : itemTotal;
    return sum + itemDiscounted * rate;
  }, 0);
}

// Same per-item logic as calculateCommission, but bucketed by stylist
// name -- used for the cart's multi-stylist breakdown and saved on the
// sale record so per-person staff stats stay accurate.
export function calculateCommissionByStylist(serviceItems, opts) {
  var staffList               = opts.staffList;
  var selStaff                = opts.selStaff;
  var serviceTotal             = opts.serviceTotal;
  var discountedServiceTotal   = opts.discountedServiceTotal;

  var commissionByStylist = {};
  serviceItems.forEach(function(item) {
    var itemStylist = item.stylist || selStaff;
    if (!itemStylist) return;
    var rate = item.commission_override != null
      ? item.commission_override / 100
      : rateForStylistName(itemStylist, staffList);
    var itemTotal      = item.price * (item.qty || 1);
    var itemDiscounted = serviceTotal > 0 ? itemTotal * (discountedServiceTotal / serviceTotal) : itemTotal;
    commissionByStylist[itemStylist] = (commissionByStylist[itemStylist] || 0) + itemDiscounted * rate;
  });
  return commissionByStylist;
}

export function distinctStylistsInCart(serviceItems, selStaff) {
  return Array.from(new Set(
    serviceItems.map(function(i) { return i.stylist || selStaff; }).filter(Boolean)
  ));
}
