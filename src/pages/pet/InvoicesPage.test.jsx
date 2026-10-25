import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));
vi.mock("../../lib/SalonContext", () => ({ useSalon: function () { return { id: "s1", name: "Paws & Co", logo_url: "https://example.com/logo.png" }; } }));

import InvoicesPage from "./InvoicesPage";

function inv(extra) {
  return Object.assign({
    id: "i1", invoice_number: "INV-0001", customer_id: "c1", pet_id: "p1", status: "issued", subtotal: 3000, discount_amount: 0, total: 3000,
    tax_enabled: false, tax_rate: 0, tax_amount: 0, amount_paid: 0, due_date: "2000-01-01", issued_at: "2026-10-24T08:00:00Z",
    pet_invoice_lines: [{ id: "l1", description: "Full groom", quantity: 2, unit_price: 1500, line_total: 3000 }], pet_payments: [],
  }, extra || {});
}

function setup(opts) {
  opts = opts || {};
  mockDb.mockImplementation(function (method, table) {
    if (opts.fail && table === "pet_invoices") return Promise.resolve(null);
    if (table === "pet_invoices") return Promise.resolve(opts.invoices || [inv()]);
    if (table === "customers") return Promise.resolve([{ id: "c1", name: "Wanjiru Kamau", phone: "0712345678" }]);
    if (table === "pet_pets") return Promise.resolve([{ id: "p1", name: "Simba", species: "Dog" }]);
    return Promise.resolve(null);
  });
  mockRpc.mockImplementation(function () { return Promise.resolve(opts.rpcError ? { error: opts.rpcError } : { data: "ok" }); });
  render(<InvoicesPage openInvoiceId={opts.open} />);
}

describe("InvoicesPage", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

  it("shows an error with retry when loading fails", async function () {
    setup({ fail: true });
    expect(await screen.findByText("Couldn't load invoices")).toBeTruthy();
  });

  it("shows an honest empty state", async function () {
    setup({ invoices: [] });
    expect(await screen.findByText("No invoices yet")).toBeTruthy();
  });

  it("lists invoices with derived overdue status and totals owed", async function () {
    setup();
    expect(await screen.findByText("INV-0001")).toBeTruthy();
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    expect(screen.getByText("Outstanding").nextSibling.textContent).toBe("KES 3,000");
  });

  it("opens the branded invoice with the business logo", async function () {
    setup();
    fireEvent.click(await screen.findByLabelText("Open invoice INV-0001"));
    expect(await screen.findByAltText("Paws & Co logo")).toBeTruthy();
    expect(screen.getByText("Full groom")).toBeTruthy();
  });

  it("opens the invoice named by openInvoiceId", async function () {
    setup({ open: "i1" });
    expect(await screen.findByAltText("Paws & Co logo")).toBeTruthy();
  });

  it("refuses a payment above the balance without calling the database", async function () {
    setup({ open: "i1" });
    fireEvent.change(await screen.findByLabelText("Amount (KES)"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByText("The payment is more than the amount still owed.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("records a payment through the database function", async function () {
    setup({ open: "i1" });
    fireEvent.change(await screen.findByLabelText("Method"), { target: { value: "mpesa" } });
    fireEvent.change(screen.getByLabelText("Amount (KES)"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("M-Pesa code"), { target: { value: "QWE123" } });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_record_payment", { p_invoice_id: "i1", p_method: "mpesa", p_amount: 1000, p_reference: "QWE123" }); });
  });

  it("shows a friendly message for a duplicate payment reference", async function () {
    setup({ open: "i1", rpcError: "DUPLICATE_PAYMENT_REFERENCE" });
    fireEvent.change(await screen.findByLabelText("Amount (KES)"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByText("A payment with that reference has already been recorded.")).toBeTruthy();
  });

  it("requires a reason to void and offers void only for unpaid invoices", async function () {
    setup({ open: "i1" });
    fireEvent.click(await screen.findByRole("button", { name: "Void invoice" }));
    fireEvent.click(await screen.findAllByRole("button", { name: "Void invoice" }).then(function (b) { return b[b.length - 1]; }));
    expect(await screen.findByText("Enter a reason for voiding this invoice.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("does not offer void on a part-paid invoice", async function () {
    setup({ open: "i1", invoices: [inv({ status: "partial", amount_paid: 1000 })] });
    await screen.findByAltText("Paws & Co logo");
    expect(screen.queryByRole("button", { name: "Void invoice" })).toBeNull();
  });

  describe("receipts", function () {
    var paid = [{ id: "pay1", method: "mpesa", amount: 1000, reference: "QWE123", paid_at: "2026-10-24T09:00:00Z" }];

    it("lists a receipt per payment and opens a branded receipt, hiding the invoice so only one prints", async function () {
      setup({ invoices: [inv({ status: "partial", amount_paid: 1000, pet_payments: paid })] });
      fireEvent.click(await screen.findByLabelText("Open invoice INV-0001"));
      fireEvent.click(await screen.findByRole("button", { name: "View receipt RCT-0001-1" }));
      expect(await screen.findByText("RECEIPT")).toBeTruthy();
      expect(screen.getByAltText("Paws & Co logo")).toBeTruthy();
      expect(screen.queryByText("INVOICE")).toBeNull();
      expect(screen.getByText("Balance remaining")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Back to invoice" }));
      expect(await screen.findByText("INVOICE")).toBeTruthy();
    });

    it("has no receipts section for an invoice with no payments", async function () {
      setup();
      fireEvent.click(await screen.findByLabelText("Open invoice INV-0001"));
      await screen.findByText("INVOICE");
      expect(screen.queryByText("Receipts")).toBeNull();
    });

    it("offers a receipt straight after a payment is recorded", async function () {
      var after = inv({ status: "paid", amount_paid: 3000, pet_payments: [{ id: "pay9", method: "cash", amount: 3000, reference: null, paid_at: "2026-10-25T09:00:00Z" }] });
      var calls = 0;
      mockDb.mockImplementation(function (method, table) {
        if (table === "pet_invoices") { calls += 1; return Promise.resolve([calls > 1 ? after : inv()]); }
        if (table === "customers") return Promise.resolve([{ id: "c1", name: "Wanjiru Kamau", phone: "0712345678" }]);
        if (table === "pet_pets") return Promise.resolve([{ id: "p1", name: "Simba", species: "Dog" }]);
        return Promise.resolve(null);
      });
      mockRpc.mockResolvedValue("paid");
      render(<InvoicesPage />);
      fireEvent.click(await screen.findByLabelText("Open invoice INV-0001"));
      fireEvent.click(await screen.findByRole("button", { name: "Pay full balance" }));
      fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
      fireEvent.click(await screen.findByRole("button", { name: "Print receipt" }));
      expect(await screen.findByText("RECEIPT")).toBeTruthy();
      expect(screen.getByText("Paid in full")).toBeTruthy();
    });
  });
});
