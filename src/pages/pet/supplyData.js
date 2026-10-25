// src/pages/pet/supplyData.js
//
// Pure helpers for Supplies & Inventory (no network, no React). The DATABASE
// (migration 091) is the authority on stock: it refuses to go below zero, keeps
// the ledger, and makes receipts idempotent. These helpers give friendlier,
// earlier feedback and do the filtering.

export var KINDS = ["retail", "consumable"];
export var KIND_LABELS = { retail: "Retail product", consumable: "Consumable" };
export var UNITS = ["each", "pack", "kg", "g", "litre", "ml", "box"];
export var ADJUST_REASONS = ["opening", "adjustment", "damaged", "expired"];
export var REASON_LABELS = {
  opening: "Opening stock", purchase: "Stock received", sale: "Sold", sale_void: "Sale voided (returned)",
  adjustment: "Count correction", damaged: "Damaged", expired: "Expired", used: "Used",
};

var ERROR_TEXT = {
  NOT_AUTHENTICATED: "Please sign in again.",
  INVALID_KEY: "Something went wrong preparing this. Refresh and try again.",
  SUPPLIER_NOT_FOUND: "That supplier could not be found.",
  INVALID_LINES: "Check the items: each needs a whole quantity of at least 1, and an item can be listed once.",
  ITEM_NOT_FOUND: "One of the items could not be found.",
  QUANTITY_TOO_LARGE: "That quantity is too large.",
  INVALID_ADJUSTMENT: "That adjustment isn't valid for the reason chosen.",
  NOTE_REQUIRED: "Add a note explaining the correction.",
  OPENING_NOT_ALLOWED: "This item already has stock history, so opening stock can't be set. Use a count correction instead.",
  INSUFFICIENT_STOCK: "There isn't enough stock for that.",
  NOT_A_CONSUMABLE: "Only consumables can be recorded as used. Retail products are sold on invoices.",
  BOOKING_NOT_FOUND: "That booking could not be found.",
};
export function supplyErrorMessage(raw) {
  var text = String(raw || "");
  var codes = Object.keys(ERROR_TEXT);
  for (var i = 0; i < codes.length; i++) if (text.indexOf(codes[i]) !== -1) return ERROR_TEXT[codes[i]];
  if (text === "Network error") return "Couldn't reach the server. Check your connection and try again.";
  return "Something went wrong. Check your connection and try again.";
}

function clean(v) { return typeof v === "string" ? v.trim() : v; }
function nul(v) { var c = clean(v); return c === "" || c === undefined ? null : c; }
function isBlank(v) { return v === "" || v === null || v === undefined; }
function wholeOrNaN(v) { if (isBlank(v)) return NaN; var n = Number(v); return isFinite(n) && Math.floor(n) === n ? n : NaN; }

export function validateItem(d) {
  if (!clean(d.name)) return "Item name is required.";
  if (KINDS.indexOf(d.kind) === -1) return "Choose retail product or consumable.";
  if (!clean(d.unit)) return "Enter a unit, such as each, kg or ml.";
  if (d.kind === "retail" && isBlank(d.price)) return "Enter a selling price for a retail product.";
  if (!isBlank(d.price)) { var p = wholeOrNaN(d.price); if (isNaN(p) || p < 0 || p > 10000000) return "Price must be a whole number of shillings, 0 or more."; }
  if (!isBlank(d.cost)) { var c = wholeOrNaN(d.cost); if (isNaN(c) || c < 0 || c > 10000000) return "Cost must be a whole number of shillings, 0 or more."; }
  if (!isBlank(d.reorder_level)) { var r = wholeOrNaN(d.reorder_level); if (isNaN(r) || r < 0) return "The reorder level must be a whole number, 0 or more."; }
  return "";
}

export function itemRow(d) {
  return {
    kind: d.kind,
    name: clean(d.name),
    sku: nul(d.sku),
    category: nul(d.category),
    unit: clean(d.unit),
    price: d.kind === "consumable" && isBlank(d.price) ? null : Number(d.price),
    cost: isBlank(d.cost) ? null : Number(d.cost),
    reorder_level: isBlank(d.reorder_level) ? 0 : Number(d.reorder_level),
    supplier_id: d.supplier_id || null,
    active: d.active !== false,
  };
}

export function isDuplicateItem(items, row, ignoreId) {
  var name = String(row.name).trim().toLowerCase();
  var sku = row.sku ? String(row.sku).trim().toLowerCase() : "";
  var hit = null;
  (items || []).forEach(function (i) {
    if (hit || i.id === ignoreId) return;
    if (i.kind === row.kind && String(i.name).trim().toLowerCase() === name) hit = "name";
    else if (sku && i.sku && String(i.sku).trim().toLowerCase() === sku) hit = "sku";
  });
  return hit;
}

export function stockLevel(item) {
  if (item.quantity_on_hand <= 0) return "out";
  if (item.reorder_level > 0 && item.quantity_on_hand <= item.reorder_level) return "low";
  return "ok";
}

export function filterItems(items, f) {
  var needle = String((f && f.q) || "").trim().toLowerCase();
  return (items || []).filter(function (i) {
    if (!(f && f.showInactive) && !i.active) return false;
    if (f && f.kind && f.kind !== "all" && i.kind !== f.kind) return false;
    if (f && f.category && f.category !== "all" && (i.category || "") !== f.category) return false;
    if (f && f.lowOnly && stockLevel(i) === "ok") return false;
    if (!needle) return true;
    return String(i.name).toLowerCase().indexOf(needle) !== -1 || String(i.sku || "").toLowerCase().indexOf(needle) !== -1 ||
      String(i.category || "").toLowerCase().indexOf(needle) !== -1;
  });
}

export function categoriesOf(items) {
  var seen = {}; var out = [];
  (items || []).forEach(function (i) { var c = i.category; if (c && !seen[c]) { seen[c] = true; out.push(c); } });
  return out.sort();
}

export function summarizeStock(items) {
  var low = 0; var out = 0; var value = 0;
  (items || []).filter(function (i) { return i.active; }).forEach(function (i) {
    var lvl = stockLevel(i);
    if (lvl === "out") out += 1; else if (lvl === "low") low += 1;
    value += (i.quantity_on_hand || 0) * (i.cost || 0);
  });
  return { low: low, out: out, value: value };
}

// lines: [{ item_id, quantity, unit_cost }] -> message or ""
export function validateReceipt(lines) {
  var chosen = (lines || []).filter(function (l) { return l.item_id; });
  if (chosen.length === 0) return "Add at least one item.";
  var seen = {};
  for (var i = 0; i < chosen.length; i++) {
    var q = wholeOrNaN(chosen[i].quantity);
    if (isNaN(q) || q < 1 || q > 1000000) return "Quantities must be whole numbers of at least 1.";
    if (!isBlank(chosen[i].unit_cost)) { var c = wholeOrNaN(chosen[i].unit_cost); if (isNaN(c) || c < 0 || c > 10000000) return "Unit costs must be whole shillings, 0 or more."; }
    if (seen[chosen[i].item_id]) return "Each item can be listed once.";
    seen[chosen[i].item_id] = true;
  }
  return "";
}
export function receiptLines(lines) {
  return (lines || []).filter(function (l) { return l.item_id; }).map(function (l) {
    var o = { item_id: l.item_id, quantity: Number(l.quantity) };
    if (!isBlank(l.unit_cost)) o.unit_cost = Number(l.unit_cost);
    return o;
  });
}
export function receiptTotal(lines) {
  return (lines || []).reduce(function (sum, l) { return sum + (isBlank(l.unit_cost) ? 0 : (Number(l.unit_cost) || 0) * (Number(l.quantity) || 0)); }, 0);
}

// d: { reason, change, note, current }. change is positive for in, negative for out.
export function validateAdjustment(d) {
  var n = wholeOrNaN(d.change);
  if (ADJUST_REASONS.indexOf(d.reason) === -1) return "Choose a reason.";
  if (isNaN(n) || n === 0) return "Enter a whole number that isn't zero.";
  if (Math.abs(n) > 1000000) return "That quantity is too large.";
  if ((d.reason === "damaged" || d.reason === "expired") && n > 0) return "Damaged or expired stock must be a reduction.";
  if (d.reason === "opening" && n < 0) return "Opening stock must be a positive number.";
  if (d.reason === "adjustment" && !clean(d.note || "")) return "Add a note explaining the correction.";
  if (d.current + n < 0) return "That would take the stock below zero.";
  return "";
}

export function validateUse(lines, itemsById) {
  var chosen = (lines || []).filter(function (l) { return l.item_id; });
  if (chosen.length === 0) return "Choose at least one consumable.";
  for (var i = 0; i < chosen.length; i++) {
    var q = wholeOrNaN(chosen[i].quantity);
    if (isNaN(q) || q < 1) return "Quantities must be whole numbers of at least 1.";
    var it = itemsById[chosen[i].item_id];
    if (it && q > it.quantity_on_hand) return "There isn't enough " + it.name + " in stock.";
  }
  return "";
}
