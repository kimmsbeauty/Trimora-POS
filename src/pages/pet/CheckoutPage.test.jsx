import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));
vi.mock("../../lib/SalonContext", () => ({ useSalon: function () { return { id: "s1", name: "Paws & Co", tax_enabled: true, tax_rate: 16 }; } }));

import CheckoutPage from "./CheckoutPage";

var CUSTOMERS = [{ id: "c1", name: "Wanjiru Kamau", phone: "0712345678" }];
var PETS = [{ id: "p1", customer_id: "c1", name: "Simba", species: "Dog" }];
var SERVICES = [
  { id: "s1", name: "Full groom", category: "Grooming", price: 1500, active: true },
  { id: "s2", name: "Night stay", category: "Boarding", price: 2000, active: true },
];
var BOOKINGS = [
  { id: "b1", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-24T08:00:00Z", status: "completed", pet_booking_services: [{ service_id: "s1", service_name: "Full groom" }, { service_id: "gone", service_name: "Old service" }] },
  { id: "b2", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-20T08:00:00Z", status: "completed", pet_booking_services: [{ service_id: "s1", service_name: "Full groom" }] },
];

function setup(opts) {
  opts = opts || {};
  mockDb.mockImplementation(function (method, table) {
    if (opts.fail && table === "customers") return Promise.resolve(null);
    if (table === "customers") return Promise.resolve(CUSTOMERS);
    if (table === "pet_pets") return Promise.resolve(PETS);
    if (table === "pet_services") return Promise.resolve(opts.noServices ? [] : SERVICES);
    if (table === "pet_items") return Promise.resolve(opts.noItems ? [] : [{ id: "i1", name: "Dog food", price: 1200, unit: "each", quantity_on_hand: 3 }]);
    if (table === "pet_bookings") return Promise.resolve(BOOKINGS);
    if (table === "pet_invoices") return Promise.resolve([{ booking_id: "b2" }]); // b2 already invoiced
    return Promise.resolve(null);
  });
  mockRpc.mockImplementation(function () { return Promise.resolve(opts.rpcError ? { error: opts.rpcError } : { data: "inv-1" }); });
  var onCreated = vi.fn();
  render(<CheckoutPage onInvoiceCreated={onCreated} />);
  return onCreated;
}

async function fillBasic() {
  await screen.findByText("1. Customer and visit");
  fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "c1" } });
  fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "service:s1" } });
}

describe("CheckoutPage", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

  it("shows an error with retry when loading fails", async function () {
    setup({ fail: true });
    expect(await screen.findByText("Couldn't load checkout")).toBeTruthy();
  });

  it("explains what to do when there are no services or products", async function () {
    setup({ noServices: true, noItems: true });
    expect(await screen.findByText("No services to sell")).toBeTruthy();
  });

  it("previews the total with discount and VAT-inclusive tax", async function () {
    setup();
    await fillBasic();
    fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Discount"), { target: { value: "500" } });
    expect(screen.getByText("Total").nextSibling.textContent).toBe("KES 2,500");
    expect(screen.getByText("Includes VAT (16%)")).toBeTruthy();
  });

  it("only offers bookings that have no invoice yet and prefills from the booking", async function () {
    setup();
    await screen.findByText("1. Customer and visit");
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "c1" } });
    var options = screen.getByLabelText("Booking (optional)").querySelectorAll("option");
    expect(options.length).toBe(2); // walk-in + b1 only (b2 is invoiced)
    fireEvent.change(screen.getByLabelText("Booking (optional)"), { target: { value: "b1" } });
    expect(screen.getByLabelText("Item 1").value).toBe("service:s1");
    expect(screen.getByText(/no longer in the active catalogue/)).toBeTruthy();
  });

  it("validates before calling the database", async function () {
    setup();
    await screen.findByText("1. Customer and visit");
    fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByText("Choose a customer.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("blocks payments above the total", async function () {
    setup();
    await fillBasic();
    fireEvent.click(screen.getByText("+ Add payment"));
    fireEvent.change(screen.getByLabelText("Payment amount 1"), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByText("Payments are more than the total.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("sends the sale to the database function without any prices or totals", async function () {
    var onCreated = setup();
    await fillBasic();
    fireEvent.click(screen.getByText("+ Add payment"));
    fireEvent.change(screen.getByLabelText("Payment method 1"), { target: { value: "mpesa" } });
    fireEvent.change(screen.getByLabelText("Payment reference 1"), { target: { value: " QWE123 " } });
    fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await waitFor(function () { expect(onCreated).toHaveBeenCalledWith("inv-1"); });
    var call = mockRpc.mock.calls[0];
    expect(call[0]).toBe("pet_create_invoice");
    expect(call[1].p_lines).toEqual([{ service_id: "s1", quantity: 1 }]);
    expect(call[1].p_payments).toEqual([{ method: "mpesa", amount: 1500, reference: "QWE123" }]);
    expect(call[1].p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(call[1])).not.toMatch(/price|total|subtotal/i);
  });

  it("reuses the same key when a failed sale is retried, so a retry cannot double-issue", async function () {
    setup({ rpcError: "OVERPAYMENT" });
    await fillBasic();
    fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByText("The payment is more than the amount still owed.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledTimes(2); });
    expect(mockRpc.mock.calls[0][1].p_idempotency_key).toBe(mockRpc.mock.calls[1][1].p_idempotency_key);
  });

  it("sells a product line by item id, shows stock, and sends no price", async function () {
    var onCreated = setup();
    await screen.findByText("1. Customer and visit");
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "c1" } });
    expect(screen.getByRole("option", { name: /Dog food · KES 1,200 · 3 in stock/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "item:i1" } });
    fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "2" } });
    expect(screen.getByText("Total").nextSibling.textContent).toBe("KES 2,400");
    fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await waitFor(function () { expect(onCreated).toHaveBeenCalledWith("inv-1"); });
    var call = mockRpc.mock.calls[0][1];
    expect(call.p_lines).toEqual([{ item_id: "i1", quantity: 2 }]);
    expect(JSON.stringify(call)).not.toMatch(/price|total|subtotal/i);
  });

  it("warns before sending when a product quantity is more than the stock loaded", async function () {
    setup();
    await screen.findByText("1. Customer and visit");
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "item:i1" } });
    fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByText("There isn't enough Dog food in stock (3 left).")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("shows the database's own message when it refuses for stock", async function () {
    setup({ rpcError: "INSUFFICIENT_STOCK" });
    await screen.findByText("1. Customer and visit");
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "item:i1" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByText(/There isn't enough stock of a product on this sale/)).toBeTruthy();
  });

  it("only counts a booking as already invoiced while its invoice is live: void and fully refunded invoices free it", async function () {
    setup();
    await screen.findByText("Checkout");
    var q = mockDb.mock.calls.filter(function (c) { return c[1] === "pet_invoices"; })[0][3];
    expect(q).toContain("status=not.in.(void,refunded)");
    expect(q).not.toContain("status=neq.void");
  });
});
