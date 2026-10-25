import {
  validateItem, itemRow, isDuplicateItem, stockLevel, filterItems, categoriesOf, summarizeStock, validateReceipt, receiptLines,
  receiptTotal, validateAdjustment, validateUse, supplyErrorMessage,
} from "./supplyData";

var retail = { kind: "retail", name: "Dog food", sku: "DF-1", category: "Food", unit: "each", price: "1200", cost: "800", reorder_level: "5", supplier_id: "", active: true };

describe("validateItem", function () {
  it("accepts a valid retail product and a consumable without a price", function () {
    expect(validateItem(retail)).toBe("");
    expect(validateItem({ kind: "consumable", name: "Shampoo", unit: "ml", price: "", cost: "", reorder_level: "" })).toBe("");
  });
  it("needs a name, a unit and, for retail, a price", function () {
    expect(validateItem(Object.assign({}, retail, { name: " " }))).toMatch(/name/);
    expect(validateItem(Object.assign({}, retail, { unit: "" }))).toMatch(/unit/);
    expect(validateItem(Object.assign({}, retail, { price: "" }))).toMatch(/selling price/);
  });
  it("rejects bad numbers", function () {
    expect(validateItem(Object.assign({}, retail, { price: "-1" }))).toMatch(/Price/);
    expect(validateItem(Object.assign({}, retail, { price: "9.5" }))).toMatch(/Price/);
    expect(validateItem(Object.assign({}, retail, { cost: "x" }))).toMatch(/Cost/);
    expect(validateItem(Object.assign({}, retail, { reorder_level: "-2" }))).toMatch(/reorder/);
    expect(validateItem(Object.assign({}, retail, { kind: "gift" }))).toMatch(/retail product or consumable/);
  });
});

describe("itemRow", function () {
  it("converts numbers and blanks", function () {
    expect(itemRow(retail)).toEqual({ kind: "retail", name: "Dog food", sku: "DF-1", category: "Food", unit: "each", price: 1200, cost: 800, reorder_level: 5, supplier_id: null, active: true });
    var c = itemRow({ kind: "consumable", name: " Gloves ", sku: " ", category: "", unit: "box", price: "", cost: "", reorder_level: "", supplier_id: "s1" });
    expect(c).toMatchObject({ price: null, cost: null, reorder_level: 0, sku: null, category: null, name: "Gloves", supplier_id: "s1" });
  });
  it("never includes the quantity on hand", function () {
    expect(Object.keys(itemRow(Object.assign({}, retail, { quantity_on_hand: 99 }))).indexOf("quantity_on_hand")).toBe(-1);
  });
});

describe("isDuplicateItem", function () {
  var list = [{ id: "1", kind: "retail", name: "Dog food", sku: "DF-1" }];
  it("matches the same name in the same kind, or the same sku, ignoring case and spaces", function () {
    expect(isDuplicateItem(list, { kind: "retail", name: " dog FOOD ", sku: null })).toBe("name");
    expect(isDuplicateItem(list, { kind: "retail", name: "Other", sku: " df-1 " })).toBe("sku");
  });
  it("allows the same name as a consumable, and the record being edited", function () {
    expect(isDuplicateItem(list, { kind: "consumable", name: "Dog food", sku: null })).toBeNull();
    expect(isDuplicateItem(list, { kind: "retail", name: "Dog food", sku: "DF-1" }, "1")).toBeNull();
  });
});

describe("stock level, filter and summary", function () {
  var items = [
    { id: "1", name: "Dog food", kind: "retail", category: "Food", sku: "DF", quantity_on_hand: 20, reorder_level: 5, cost: 800, active: true },
    { id: "2", name: "Rope toy", kind: "retail", category: "Toys", sku: "", quantity_on_hand: 2, reorder_level: 2, cost: 100, active: true },
    { id: "3", name: "Shampoo", kind: "consumable", category: "Grooming", sku: "SH", quantity_on_hand: 0, reorder_level: 500, cost: 2, active: true },
    { id: "4", name: "Old", kind: "retail", category: "Toys", sku: "", quantity_on_hand: 9, reorder_level: 0, cost: 1, active: false },
  ];
  it("classifies stock", function () {
    expect(stockLevel(items[0])).toBe("ok"); expect(stockLevel(items[1])).toBe("low"); expect(stockLevel(items[2])).toBe("out");
    expect(stockLevel({ quantity_on_hand: 3, reorder_level: 0 })).toBe("ok"); // no reorder level set: never "low"
  });
  it("filters by text, kind, category, low stock and inactive", function () {
    var ids = function (f) { return filterItems(items, f).map(function (i) { return i.id; }); };
    expect(ids({})).toEqual(["1", "2", "3"]);
    expect(ids({ showInactive: true }).length).toBe(4);
    expect(ids({ kind: "consumable" })).toEqual(["3"]);
    expect(ids({ category: "Toys" })).toEqual(["2"]);
    expect(ids({ lowOnly: true })).toEqual(["2", "3"]);
    expect(ids({ q: "df" })).toEqual(["1"]);
  });
  it("lists categories and summarizes only active items", function () {
    expect(categoriesOf(items)).toEqual(["Food", "Grooming", "Toys"]);
    expect(summarizeStock(items)).toEqual({ low: 1, out: 1, value: 20 * 800 + 2 * 100 });
  });
});

describe("receipts", function () {
  it("validates lines", function () {
    expect(validateReceipt([])).toMatch(/at least one/);
    expect(validateReceipt([{ item_id: "a", quantity: "0" }])).toMatch(/Quantities/);
    expect(validateReceipt([{ item_id: "a", quantity: "2", unit_cost: "-1" }])).toMatch(/Unit costs/);
    expect(validateReceipt([{ item_id: "a", quantity: "2" }, { item_id: "a", quantity: "3" }])).toMatch(/once/);
    expect(validateReceipt([{ item_id: "", quantity: "" }, { item_id: "a", quantity: "2", unit_cost: "" }])).toBe("");
  });
  it("cleans lines and totals the known costs", function () {
    var lines = [{ item_id: "a", quantity: "3", unit_cost: "100" }, { item_id: "b", quantity: "2", unit_cost: "" }, { item_id: "", quantity: "9" }];
    expect(receiptLines(lines)).toEqual([{ item_id: "a", quantity: 3, unit_cost: 100 }, { item_id: "b", quantity: 2 }]);
    expect(receiptTotal(lines)).toBe(300);
  });
});

describe("adjustments and use", function () {
  it("validates adjustments", function () {
    expect(validateAdjustment({ reason: "opening", change: "10", current: 0 })).toBe("");
    expect(validateAdjustment({ reason: "opening", change: "-1", current: 0 })).toMatch(/positive/);
    expect(validateAdjustment({ reason: "damaged", change: "2", current: 5 })).toMatch(/reduction/);
    expect(validateAdjustment({ reason: "adjustment", change: "-1", note: " ", current: 5 })).toMatch(/note/);
    expect(validateAdjustment({ reason: "adjustment", change: "-9", note: "recount", current: 5 })).toMatch(/below zero/);
    expect(validateAdjustment({ reason: "adjustment", change: "0", note: "x", current: 5 })).toMatch(/isn't zero/);
    expect(validateAdjustment({ reason: "sale", change: "1", current: 5 })).toMatch(/reason/);
  });
  it("validates use against what is in stock", function () {
    var by = { a: { name: "Shampoo", quantity_on_hand: 100 } };
    expect(validateUse([{ item_id: "a", quantity: "50" }], by)).toBe("");
    expect(validateUse([{ item_id: "a", quantity: "500" }], by)).toMatch(/enough Shampoo/);
    expect(validateUse([{ item_id: "", quantity: "1" }], by)).toMatch(/at least one/);
  });
});

describe("supplyErrorMessage", function () {
  it("maps codes and never leaks raw text", function () {
    expect(supplyErrorMessage("INSUFFICIENT_STOCK")).toMatch(/enough stock/);
    expect(supplyErrorMessage("OPENING_NOT_ALLOWED")).toMatch(/count correction/);
    expect(supplyErrorMessage("duplicate key value")).toMatch(/Something went wrong/);
    expect(supplyErrorMessage("Network error")).toMatch(/Couldn't reach/);
  });
});
