import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));

import SuppliesPage from "./SuppliesPage";

var ITEMS = [
  { id: "i1", kind: "retail", name: "Dog food", sku: "DF-1", category: "Food", unit: "each", price: 1200, cost: 800, quantity_on_hand: 20, reorder_level: 5, supplier_id: "s1", active: true },
  { id: "i2", kind: "retail", name: "Rope toy", sku: null, category: "Toys", unit: "each", price: 300, cost: 100, quantity_on_hand: 1, reorder_level: 2, supplier_id: null, active: true },
  { id: "i3", kind: "consumable", name: "Shampoo", sku: null, category: "Grooming", unit: "ml", price: null, cost: 2, quantity_on_hand: 0, reorder_level: 500, supplier_id: null, active: true },
];
var SUPPLIERS = [{ id: "s1", name: "PetCo", phone: "0700", email: null, notes: null, active: true }];

function setup(opts) {
  opts = opts || {};
  mockDb.mockImplementation(function (method, table, data) {
    if (method === "GET" && table === "pet_items") return Promise.resolve(opts.fail ? null : (opts.items || ITEMS));
    if (method === "GET" && table === "pet_suppliers") return Promise.resolve(SUPPLIERS);
    if (method === "GET" && table === "pet_stock_movements") return Promise.resolve(opts.history || [{ id: "m1", change_qty: 20, quantity_after: 20, reason: "opening", note: null, created_at: "2026-10-24T08:00:00Z" }]);
    if (method === "POST" && table === "pet_items") return Promise.resolve(opts.postFail ? null : [Object.assign({ id: "new", quantity_on_hand: 0 }, data)]);
    if (method === "PATCH") return Promise.resolve(opts.patchFail ? null : true);
    return Promise.resolve(null);
  });
  mockRpc.mockImplementation(function () { return Promise.resolve(opts.rpcError ? { error: opts.rpcError } : { data: "ok" }); });
  render(<SuppliesPage canEdit={opts.canEdit !== false} />);
}

describe("SuppliesPage", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

  it("shows an error with retry when loading fails, not an empty list", async function () {
    setup({ fail: true });
    expect(await screen.findByText("Couldn't load products and supplies")).toBeTruthy();
  });

  it("shows an honest empty state", async function () {
    setup({ items: [] });
    expect(await screen.findByText("No products or supplies yet")).toBeTruthy();
  });

  it("lists items with stock levels and summary counts", async function () {
    setup();
    expect(await screen.findByText("Dog food")).toBeTruthy();
    expect(screen.getByText("In stock")).toBeTruthy();
    expect(screen.getByText("Low stock", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Out of stock", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Stock value (at cost)").nextSibling.textContent).toBe("KES 16,100");
  });

  it("filters to low and out-of-stock items", async function () {
    setup();
    await screen.findByText("Dog food");
    fireEvent.click(screen.getByLabelText("Low or out of stock"));
    expect(screen.queryByText("Dog food")).toBeNull();
    expect(screen.getByText("Rope toy")).toBeTruthy();
    expect(screen.getByText("Shampoo")).toBeTruthy();
  });

  it("hides every editing control from someone who can't edit", async function () {
    setup({ canEdit: false });
    await screen.findByText("Dog food");
    expect(screen.queryByText("+ Add item")).toBeNull();
    expect(screen.queryByText("Receive stock")).toBeNull();
    expect(screen.queryByLabelText("Adjust Dog food")).toBeNull();
    expect(screen.getByLabelText("History for Dog food")).toBeTruthy();
  });

  it("validates a new item and blocks duplicates before saving", async function () {
    setup();
    await screen.findByText("Dog food");
    fireEvent.click(screen.getAllByText("+ Add item")[0]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Leash" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(await screen.findByText("Enter a selling price for a retail product.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " dog FOOD " } });
    fireEvent.change(screen.getByLabelText("Selling price (KES)"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(await screen.findByText(/There is already a retail product called/)).toBeTruthy();
    expect(mockDb.mock.calls.some(function (c) { return c[0] === "POST"; })).toBe(false);
  });

  it("adds an item without a quantity, then sets opening stock through the stock function", async function () {
    setup();
    await screen.findByText("Dog food");
    fireEvent.click(screen.getAllByText("+ Add item")[0]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Leash" } });
    fireEvent.change(screen.getByLabelText("Selling price (KES)"), { target: { value: "900" } });
    fireEvent.change(screen.getByLabelText("Opening stock (optional)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_adjust_stock", { p_item_id: "new", p_change: 12, p_reason: "opening", p_note: null }); });
    var post = mockDb.mock.calls.filter(function (c) { return c[0] === "POST" && c[1] === "pet_items"; })[0][2];
    expect(post.price).toBe(900);
    expect("quantity_on_hand" in post).toBe(false);
  });

  it("never sends the item type or the quantity when editing", async function () {
    setup();
    await screen.findByText("Dog food");
    fireEvent.click(screen.getByLabelText("Edit Dog food"));
    expect(screen.getByLabelText("Type").disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Selling price (KES)"), { target: { value: "1300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(function () { expect(mockDb.mock.calls.some(function (c) { return c[0] === "PATCH"; })).toBe(true); });
    var patch = mockDb.mock.calls.filter(function (c) { return c[0] === "PATCH"; })[0];
    expect(patch[3]).toBe("?id=eq.i1");
    expect(patch[2].price).toBe(1300);
    expect("kind" in patch[2]).toBe(false);
    expect("quantity_on_hand" in patch[2]).toBe(false);
  });

  it("receives stock through the database function with one key per receipt", async function () {
    setup();
    await screen.findByText("Dog food");
    fireEvent.click(screen.getByText("Receive stock"));
    fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "i1" } });
    fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Unit cost 1"), { target: { value: "850" } });
    expect(screen.getByText("Total cost:").textContent).toMatch(/KES 10,200/);
    fireEvent.click(screen.getAllByRole("button", { name: "Receive stock" }).pop());
    await waitFor(function () { expect(mockRpc).toHaveBeenCalled(); });
    var call = mockRpc.mock.calls[0];
    expect(call[0]).toBe("pet_receive_stock");
    expect(call[1].p_lines).toEqual([{ item_id: "i1", quantity: 12, unit_cost: 850 }]);
    expect(call[1].p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses the same key when a failed receipt is retried", async function () {
    setup({ rpcError: "INSUFFICIENT_STOCK" });
    await screen.findByText("Dog food");
    fireEvent.click(screen.getByText("Receive stock"));
    fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "i1" } });
    fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "3" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Receive stock" }).pop());
    expect(await screen.findByText("There isn't enough stock for that.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Receive stock" }).pop());
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledTimes(2); });
    expect(mockRpc.mock.calls[0][1].p_idempotency_key).toBe(mockRpc.mock.calls[1][1].p_idempotency_key);
  });

  it("stops a reduction that would go below zero before calling the database", async function () {
    setup();
    await screen.findByText("Dog food");
    fireEvent.click(screen.getByLabelText("Adjust Dog food"));
    fireEvent.change(screen.getByLabelText("Change (e.g. 5 or -2)"), { target: { value: "-50" } });
    fireEvent.change(screen.getByLabelText("Note (required)"), { target: { value: "recount" } });
    fireEvent.click(screen.getByRole("button", { name: "Save adjustment" }));
    expect(await screen.findByText("That would take the stock below zero.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("saves a count correction with its note", async function () {
    setup();
    await screen.findByText("Dog food");
    fireEvent.click(screen.getByLabelText("Adjust Dog food"));
    fireEvent.change(screen.getByLabelText("Change (e.g. 5 or -2)"), { target: { value: "-2" } });
    fireEvent.change(screen.getByLabelText("Note (required)"), { target: { value: "Counted shelf" } });
    fireEvent.click(screen.getByRole("button", { name: "Save adjustment" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_adjust_stock", { p_item_id: "i1", p_change: -2, p_reason: "adjustment", p_note: "Counted shelf" }); });
  });

  it("records consumables used and offers only consumables", async function () {
    setup();
    await screen.findByText("Dog food");
    fireEvent.click(screen.getByText("Record supplies used"));
    var options = screen.getByLabelText("Consumable 1").querySelectorAll("option");
    expect(options.length).toBe(2); // placeholder + Shampoo
    expect(screen.queryByRole("option", { name: /Dog food/ })).toBeNull();
  });

  it("shows an item's stock history", async function () {
    setup();
    await screen.findByText("Dog food");
    fireEvent.click(screen.getByLabelText("History for Dog food"));
    expect(await screen.findByText(/Opening stock/)).toBeTruthy();
    expect(screen.getByText("+20")).toBeTruthy();
  });
});
