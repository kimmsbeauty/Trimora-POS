// src/pages/pos/CheckoutView.jsx
//
// Extracted from POSApp.jsx (was the `page === "pos"` inline block --
// the checkout/cart screen). Mechanical extraction only -- no logic
// changes. The JSX body below was extracted directly from the original
// file via script (not retyped) to guarantee byte-for-byte fidelity,
// then diffed against the source before wiring in.
//
// This is the money path (cart, discounts, staff assignment, payment
// method, checkout trigger) and was extracted last and most carefully:
// a dedicated integration test (POSApp.checkout.test.js) exercising a
// full Cash sale through the real component tree was written and
// verified passing BEFORE this extraction, specifically so there was
// a real regression detector in place for this exact change.
//
// All cart/discount/customer-search state and every handler
// (addToCart, removeFromCart, setItemStylist, checkout, saveNewCustomer,
// searchCustomers, selectCustomer, clearCustomer, clearDiscount,
// rateForStylistName) still live in and are owned by POSApp.jsx; this
// component is purely presentational.

import SetupChecklist from "../../components/SetupChecklist.jsx";
import GoldBtn from "../../components/GoldBtn";
import LoyaltyBadge from "../../components/LoyaltyBadge.jsx";
import MpesaInstructions from "../../components/MpesaInstructions";
import { fmt } from "../../lib/utils.js";
import {
  BLACK, GOLD, GOLD_LT, GOLD_DIM, DARK, WHITE, GREEN, RED,
} from "../../lib/constants.js";

export default function CheckoutView({
  isAdmin,
  salon,
  servicesList,
  staffList,
  setPage,
  selectedCustomer,
  clearCustomer,
  customerSearch,
  searchCustomers,
  showCustomerDrop,
  customerResults,
  setShowCustomerDrop,
  setAddingNewCustomer,
  setClientName,
  selectCustomer,
  addingNewCustomer,
  clientName,
  clientPhone,
  setClientPhone,
  saveNewCustomer,
  selStaff,
  setSelStaff,
  catFilter,
  setCatFilter,
  typeFilter,
  setTypeFilter,
  categories,
  products,
  addToCart,
  cart,
  stylistsInCart,
  removeFromCart,
  setItemStylist,
  serviceTotal,
  showDiscount,
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
  discountReason,
  setDiscountReason,
  discountAmt,
  discountNum,
  clearDiscount,
  productTotal,
  cartTotal,
  commission,
  commissionByStylist,
  rateForStylistName,
  setShowDiscount,
  payMethod,
  setPayMethod,
  checkout,
  inputStyle,
}) {
  return (
          <div>
            {/* Setup checklist — shown to admin on fresh salons only */}
            {isAdmin && (
              <SetupChecklist
                salon={salon}
                servicesList={servicesList}
                staffList={staffList}
                onNavigate={function(tab) { setPage(tab); }}
              />
            )}

            {/* Subscription grace period warning — admin only */}
            {isAdmin && salon && salon.subscription_grace && (
              <div style={{ background: "#FEF3C7", border: "1.5px solid #F59E0B", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>⏰</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#92400E" }}>Subscription Overdue</div>
                  <div style={{ fontSize: 11, color: "#B45309", marginTop: 2, lineHeight: 1.5 }}>
                    Your subscription expired {salon.subscription_days_overdue} day{salon.subscription_days_overdue !== 1 ? "s" : ""} ago.
                    Access will be blocked after the 7-day grace period.
                    Contact <a href="mailto:admin@trimorasystems.com" style={{ color: "#92400E", fontWeight: 800 }}>admin@trimorasystems.com</a> to renew.
                  </div>
                </div>
              </div>
            )}
            {/* Customer */}
            <div style={{ marginBottom: 12, position: "relative" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Client</div>
              {selectedCustomer ? (
                <div style={{ background: WHITE, borderRadius: 10, padding: "10px 14px", border: "1.5px solid " + GOLD, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: DARK, display: "flex", alignItems: "center", gap: 6 }}>
                      {selectedCustomer.name}
                      <LoyaltyBadge customer={selectedCustomer} size="sm" />
                    </div>
                    <div style={{ fontSize: 11, color: "#888" }}>{selectedCustomer.phone} · {selectedCustomer.visit_count} visit{selectedCustomer.visit_count !== 1 ? "s" : ""} · Spent {fmt(selectedCustomer.total_spend)}</div>
                  </div>
                  <button onClick={clearCustomer} style={{ background: "none", border: "none", color: RED, fontSize: 18, cursor: "pointer", padding: 0 }}>×</button>
                </div>
              ) : (
                <div>
                  <input placeholder="Search by name or phone..." value={customerSearch} onChange={function(e) { searchCustomers(e.target.value); }} onFocus={function() { if (customerSearch.length >= 2) setShowCustomerDrop(true); }} style={Object.assign({}, inputStyle, { width: "100%", boxSizing: "border-box" })} />
                  {showCustomerDrop && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: WHITE, borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 100, border: "1px solid " + GOLD_DIM + "44", maxHeight: 200, overflowY: "auto" }}>
                      {customerResults.length === 0 ? (
                        <div style={{ padding: "12px 14px" }}>
                          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>No customer found</div>
                          <button onClick={function() { setShowCustomerDrop(false); setAddingNewCustomer(true); setClientName(customerSearch); }} style={{ width: "100%", background: "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")", color: BLACK, border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>+ Add "{customerSearch}" as new client</button>
                        </div>
                      ) : customerResults.map(function(c) {
                        return (
                          <div key={c.id} onClick={function() { selectCustomer(c); }} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid " + GOLD_DIM + "22", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div><div style={{ fontWeight: 700, fontSize: 13, color: DARK }}>{c.name}</div><div style={{ fontSize: 11, color: "#888" }}>{c.phone} · {c.visit_count} visits</div></div>
                            <LoyaltyBadge customer={c} size="sm" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {addingNewCustomer && (
                    <div style={{ background: WHITE, borderRadius: 10, padding: "12px 14px", border: "1.5px solid " + GOLD, marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: GOLD_DIM, marginBottom: 8 }}>NEW CLIENT</div>
                      <input placeholder="Full name" value={clientName} onChange={function(e) { setClientName(e.target.value); }} style={Object.assign({}, inputStyle, { width: "100%", boxSizing: "border-box", marginBottom: 8 })} />
                      <input placeholder="Phone (e.g. 0712345678)" value={clientPhone} onChange={function(e) { setClientPhone(e.target.value); }} style={Object.assign({}, inputStyle, { width: "100%", boxSizing: "border-box", marginBottom: 8 })} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <GoldBtn onClick={saveNewCustomer} style={{ flex: 1, padding: "9px 0", fontSize: 12 }}>Save Client</GoldBtn>
                        <button onClick={function() { setAddingNewCustomer(false); setClientName(""); setClientPhone(""); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 8, padding: "9px 0", fontSize: 12, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {!addingNewCustomer && !showCustomerDrop && <button onClick={function() { setAddingNewCustomer(true); }} style={{ marginTop: 6, background: "none", border: "none", color: GOLD_DIM, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>+ Add new client</button>}
                </div>
              )}
            </div>

            {/* Default Stylist */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Default Stylist</div>
              {staffList.length === 0 ? (
                <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1.5px dashed #FDE68A", borderRadius: 10, fontSize: 12, color: "#92400E", fontWeight: 700 }}>
                  No staff added yet — go to the <b>Staff</b> tab to add your team.
                </div>
              ) : (
                <select value={selStaff} onChange={function(e) { setSelStaff(e.target.value); }} style={Object.assign({}, inputStyle, { width: "100%", color: selStaff ? DARK : "#aaa" })}>
                  <option value="">Select stylist</option>
                  {staffList.map(function(s) { return <option key={s.id} value={s.name}>{s.name} · {s.role}</option>; })}
                </select>
              )}
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>Auto-fills new items — you can reassign each service in the cart below</div>
            </div>

            {/* Type toggle */}
            <div style={{ display: "flex", background: BLACK, borderRadius: 10, padding: 3, marginBottom: 12, border: "1px solid " + GOLD_DIM }}>
              {["services", "products"].map(function(t) {
                return <button key={t} onClick={function() { setCatFilter("All"); setTypeFilter(t); }} style={{ flex: 1, border: "none", borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 700, background: typeFilter === t ? "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")" : "transparent", color: typeFilter === t ? BLACK : "rgba(255,255,255,0.4)", cursor: "pointer" }}>{t === "services" ? "💇 Services" : "🧴 Products"}</button>;
              })}
            </div>

            {/* Category filter */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
              {(typeFilter === "services" ? ["All"].concat(categories) : ["All", "Hair", "Nails", "Beauty"]).map(function(c) {
                return <button key={c} onClick={function() { setCatFilter(c); }} style={{ padding: "5px 12px", borderRadius: 20, border: "1.5px solid " + (catFilter === c ? GOLD : GOLD_DIM + "66"), background: catFilter === c ? "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")" : WHITE, color: catFilter === c ? BLACK : GOLD_DIM, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{c}</button>;
              })}
            </div>

            {/* Items grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {typeFilter === "services" && servicesList.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "32px 20px", background: WHITE, borderRadius: 12, border: "1.5px dashed " + GOLD_DIM + "66" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✂️</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 4 }}>No services added yet</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Go to the <b>Services</b> tab to add your first service.</div>
                </div>
              )}
              {typeFilter === "products" && products.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "32px 20px", background: WHITE, borderRadius: 12, border: "1.5px dashed " + GOLD_DIM + "66" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🧴</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 4 }}>No products added yet</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Go to the <b>Stock</b> tab to add your first product.</div>
                </div>
              )}
              {(typeFilter === "services" ? servicesList.filter(function(s) { return catFilter === "All" || s.cat === catFilter; }) : products.filter(function(p) { return catFilter === "All" || p.cat === catFilter; })).map(function(item) {
                return (
                  <div key={item.id} onClick={function() { addToCart(item, typeFilter === "services" ? "service" : "product"); }} style={{ background: WHITE, borderRadius: 12, padding: "12px 10px", cursor: "pointer", border: "1.5px solid " + GOLD_DIM + "44" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: DARK, marginBottom: 4, lineHeight: 1.3 }}>{item.name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: GOLD_DIM }}>{fmt(item.price)}</span>
                      {typeFilter === "products" && <span style={{ fontSize: 10, color: item.stock <= 5 ? RED : GREEN, fontWeight: 700 }}>{item.stock} left</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cart */}
            {cart.length > 0 && (
              <div style={{ background: WHITE, borderRadius: 14, padding: 16, boxShadow: "0 2px 16px rgba(201,168,76,0.12)", border: "1px solid " + GOLD_DIM + "55" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: DARK }}>🛒 Cart</div>
                  {stylistsInCart.length > 1 && (
                    <span style={{ fontSize: 10, background: "#EEF2FF", color: "#4338CA", padding: "3px 8px", borderRadius: 20, fontWeight: 800 }}>
                      👥 {stylistsInCart.length} stylists
                    </span>
                  )}
                </div>
                {cart.map(function(item) {
                  return (
                    <div key={item.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f5f5f5" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: "#888" }}>{item.type === "service" ? "✂ Service" : "🧴 Product"} · Qty: {item.qty} · {fmt(item.price)} each</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: GOLD_DIM }}>{fmt(item.price * item.qty)}</span>
                          <button onClick={function() { removeFromCart(item.id); }} style={{ background: "none", border: "none", color: RED, fontSize: 16, cursor: "pointer", padding: 0 }}>×</button>
                        </div>
                      </div>
                      {item.type === "service" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <span style={{ fontSize: 10, color: "#aaa" }}>by</span>
                          <select
                            value={item.stylist || ""}
                            onChange={function(e) { setItemStylist(item.id, e.target.value); }}
                            style={{ flex: 1, borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "66", padding: "5px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", color: item.stylist ? DARK : "#aaa", background: WHITE }}
                          >
                            <option value="">Select stylist for this item</option>
                            {staffList.map(function(s) { return <option key={s.id} value={s.name}>{s.name}</option>; })}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{ borderTop: "1px dashed " + GOLD_DIM + "66", marginTop: 10, paddingTop: 10 }}>
                  {/* Subtotals */}
                  {serviceTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 3 }}><span>Services subtotal</span><span>{fmt(serviceTotal)}</span></div>}

                  {/* Discount row */}
                  {showDiscount && serviceTotal > 0 && (
                    <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #BBF7D0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>🏷️ Discount (services only)</span>
                        <button onClick={clearDiscount} style={{ background: "none", border: "none", color: RED, fontSize: 14, cursor: "pointer", padding: 0 }}>×</button>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <button onClick={function() { setDiscountType("pct"); }} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid " + (discountType === "pct" ? GREEN : "#ddd"), background: discountType === "pct" ? "#D1FAE5" : WHITE, color: discountType === "pct" ? "#065F46" : "#888", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>% Percent</button>
                        <button onClick={function() { setDiscountType("fixed"); }} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid " + (discountType === "fixed" ? GREEN : "#ddd"), background: discountType === "fixed" ? "#D1FAE5" : WHITE, color: discountType === "fixed" ? "#065F46" : "#888", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>KES Fixed</button>
                      </div>
                      <input
                        type="number"
                        placeholder={discountType === "pct" ? "e.g. 10 for 10%" : "e.g. 500 for KES 500"}
                        value={discountValue}
                        onChange={function(e) { setDiscountValue(e.target.value); }}
                        style={{ width: "100%", borderRadius: 8, border: "1.5px solid #BBF7D0", padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 6 }}
                      />
                      <input
                        type="text"
                        placeholder="Reason (e.g. Loyalty, Staff, Voucher)"
                        value={discountReason}
                        onChange={function(e) { setDiscountReason(e.target.value); }}
                        style={{ width: "100%", borderRadius: 8, border: "1.5px solid #BBF7D0", padding: "8px 10px", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                      />
                      {discountAmt > 0 && (
                        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#166534" }}>
                          Saving: {fmt(discountAmt)} {discountType === "pct" ? "(" + discountNum + "%)" : ""}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show discount applied */}
                  {discountAmt > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: GREEN, fontWeight: 700, marginBottom: 3 }}>
                      <span>Discount {discountReason ? "— " + discountReason : ""}</span>
                      <span>- {fmt(discountAmt)}</span>
                    </div>
                  )}

                  {productTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 3 }}><span>Products subtotal</span><span>{fmt(productTotal)}</span></div>}

                  {/* Grand total */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 16, color: DARK, marginBottom: 4, marginTop: 4 }}>
                    <span>Total</span><span style={{ color: GOLD_DIM }}>{fmt(cartTotal)}</span>
                  </div>

                  {/* Commission */}
                  {commission > 0 && (
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                      {stylistsInCart.length > 1 ? (
                        <div>
                          <div style={{ fontWeight: 700, color: "#666", marginBottom: 3 }}>Commission by stylist:</div>
                          {Object.entries(commissionByStylist).map(function(entry, i) {
                            return <div key={i} style={{ display: "flex", justifyContent: "space-between" }}><span>{entry[0]}</span><span style={{ fontWeight: 700 }}>{fmt(entry[1])}</span></div>;
                          })}
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, paddingTop: 3, borderTop: "1px dashed #ddd", fontWeight: 800 }}>
                            <span>Total commission</span><span>{fmt(commission)}</span>
                          </div>
                        </div>
                      ) : (
                        <span>
                          Staff commission: {fmt(commission)}
                          <span style={{ color: "#aaa" }}> · {selStaff ? rateForStylistName(selStaff) * 100 : 40}% on post-discount services</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Add discount button */}
                  {!showDiscount && serviceTotal > 0 && (
                    <button onClick={function() { setShowDiscount(true); }} style={{ width: "100%", background: "#F0FDF4", border: "1.5px dashed #4ADE80", borderRadius: 8, padding: "8px 0", fontSize: 12, fontWeight: 700, color: "#166534", cursor: "pointer", marginBottom: 10 }}>
                      🏷️ Add Discount / Voucher
                    </button>
                  )}

                  {/* Payment method — driven by what the salon has enabled in Settings */}
                  {(function() {
                    var enabled = (salon && salon.enabled_payment_methods) || ["Cash", "Till"];
                    // Always include Cash; add configured M-Pesa methods
                    var methods = ["Cash"].concat(enabled.filter(function(m) { return m !== "Cash"; }));
                    var icons = { Cash: "💵", Till: "📲", Paybill: "🏦", "Send Money": "📱" };
                    var labels = { Cash: "Cash", Till: "Buy Goods", Paybill: "Paybill", "Send Money": "Send Money" };
                    return (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                          {methods.map(function(m) {
                            return (
                              <button key={m} onClick={function() { setPayMethod(m); }}
                                style={{ flex: 1, minWidth: 70, border: "2px solid " + (payMethod === m ? GOLD : GOLD_DIM + "66"), borderRadius: 8, padding: "8px 4px", background: payMethod === m ? "linear-gradient(135deg," + BLACK + ",#2C1F00)" : WHITE, color: payMethod === m ? GOLD_LT : DARK, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                {icons[m] || "💳"} {labels[m] || m}
                              </button>
                            );
                          })}
                        </div>
                        {payMethod !== "Cash" && (
                          <MpesaInstructions
                            amount={cartTotal}
                            reference={clientName}
                            compact={true}
                            salon={salon}
                            variant={payMethod}
                          />
                        )}
                      </div>
                    );
                  })()}
                  <GoldBtn onClick={checkout} style={{ width: "100%" }}>
                    {payMethod === "Cash" ? "✓ Complete Sale · " + fmt(cartTotal) : "📱 Collect Payment · " + fmt(cartTotal)}
                  </GoldBtn>
                </div>
              </div>
            )}
          </div>
  );
}
