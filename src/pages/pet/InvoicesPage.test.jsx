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
    if (table === "pet_customer_profiles") return Promise.resolve(opts.profiles || [{ customer_id: "c1", email: "wanjiru@example.com" }]);
    return Promise.resolve(null);
  });
  mockRpc.mockImplementation(function (fn, args) {
    if (opts.rpcError) return Promise.resolve({ error: opts.rpcError });
    if (fn === "pet_refund_invoice") return Promise.resolve({ data: args.p_admin_pin === "9999" ? "rf-new" : null });
    return Promise.resolve({ data: "ok" });
  });
  render(<InvoicesPage openInvoiceId={opts.open} initialStatus={opts.initialStatus} />);
}

describe("InvoicesPage", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

  it("shows an error with retry when loading fails", async function () {
    setup({ fail: true });
    expect(await screen.findByText("Couldn't load invoices")).toBeTruthy();
  });

  it("opens on the status it was asked to (Overview shortcuts), and defaults to all", async function () {
    setup({ initialStatus: "outstanding", invoices: [inv(), inv({ id: "i2", invoice_number: "INV-0002", status: "paid", amount_paid: 3000 })] });
    await screen.findByText("INV-0001");
    expect(screen.getByLabelText("Filter by status").value).toBe("outstanding");
    expect(screen.queryByText("INV-0002")).toBeNull();
  });

  it("defaults to all statuses when opened normally", async function () {
    setup();
    await screen.findByText("INV-0001");
    expect(screen.getByLabelText("Filter by status").value).toBe("all");
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

  describe("refunds (migration 105)", function () {
    var PAID = { id: "i9", invoice_number: "INV-0009", status: "paid", total: 3000, amount_paid: 3000, amount_refunded: 0, due_date: null,
      pet_payments: [{ id: "pay1", method: "cash", amount: 3000, paid_at: "2026-10-24T09:00:00Z", created_at: "2026-10-24T09:00:00Z" }], pet_refunds: [],
      pet_invoice_lines: [{ id: "l1", description: "Full groom", quantity: 2, unit_price: 1500, line_total: 3000, service_id: "s1" }] };
    function typePin(pin) {
      fireEvent.change(screen.getByLabelText("Admin PIN"), { target: { value: pin } });
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    }
    function refundCalls() { return mockRpc.mock.calls.filter(function (c) { return c[0] === "pet_refund_invoice"; }); }
    async function openRefund(extra) {
      setup({ invoices: [Object.assign({}, PAID, extra || {})] });
      fireEvent.click(await screen.findByLabelText("Open invoice INV-0009"));
      fireEvent.click(await screen.findByRole("button", { name: "Refund" }));
    }

    it("offers Refund on a paid invoice but not on unpaid, void or refunded ones", async function () {
      setup({ invoices: [inv({ id: "a", invoice_number: "INV-0001" }), inv({ id: "b", invoice_number: "INV-0002", status: "void" }),
        inv({ id: "c", invoice_number: "INV-0003", status: "refunded", amount_paid: 800, amount_refunded: 800, total: 800, due_date: null })] });
      for (var n of ["INV-0001", "INV-0002", "INV-0003"]) {
        fireEvent.click(await screen.findByLabelText("Open invoice " + n));
        await screen.findByText("Invoice " + n);
        expect(screen.queryByRole("button", { name: "Refund" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await waitFor(function () { expect(screen.queryByText("Invoice " + n)).toBeNull(); });
      }
    });

    it("lists Refunded as a status filter and shows the refunded status", async function () {
      setup({ invoices: [Object.assign({}, PAID, { status: "refunded", amount_refunded: 3000 })] });
      await screen.findByText("INV-0009");
      expect(screen.getAllByText("Refunded").length).toBeGreaterThan(0);
      fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "refunded" } });
      expect(screen.getByText("INV-0009")).toBeTruthy();
    });

    it("validates locally first: no PIN prompt and no call for a bad refund", async function () {
      await openRefund();
      fireEvent.change(screen.getByLabelText("Amount (KES)"), { target: { value: "99999" } });
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Returned" } });
      fireEvent.click(screen.getByRole("button", { name: "Refund…" }));
      expect(await screen.findByText(/more than can still be refunded/)).toBeTruthy();
      expect(screen.queryByLabelText("Admin PIN")).toBeNull();
      expect(refundCalls().length).toBe(0);
      fireEvent.change(screen.getByLabelText("Amount (KES)"), { target: { value: "500" } });
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "  " } });
      fireEvent.click(screen.getByRole("button", { name: "Refund…" }));
      expect(await screen.findByText(/Enter a reason/)).toBeTruthy();
      expect(refundCalls().length).toBe(0);
    });

    it("asks for the admin PIN, then refunds through pet_refund_invoice with a stable key", async function () {
      await openRefund();
      fireEvent.change(screen.getByLabelText("Amount (KES)"), { target: { value: "500" } });
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Customer returned one shampoo" } });
      fireEvent.change(screen.getByLabelText("Reference (optional)"), { target: { value: "  R-77 " } });
      fireEvent.click(screen.getByRole("button", { name: "Refund…" }));
      expect(await screen.findByLabelText("Admin PIN")).toBeTruthy();
      expect(refundCalls().length).toBe(0);
      typePin("9999");
      await waitFor(function () { expect(refundCalls().length).toBe(1); });
      var a = refundCalls()[0][1];
      expect(a.p_admin_pin).toBe("9999"); expect(a.p_invoice_id).toBe("i9"); expect(a.p_amount).toBe(500);
      expect(a.p_method).toBe("cash"); expect(a.p_reason).toBe("Customer returned one shampoo"); expect(a.p_reference).toBe("R-77");
      expect(a.p_return_stock).toBe(false);
      expect(a.p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("a wrong PIN says so, records nothing, and a retry reuses the same key", async function () {
      await openRefund();
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Cancelled" } });
      fireEvent.click(screen.getByRole("button", { name: "Refund…" }));
      await screen.findByLabelText("Admin PIN"); typePin("0000");
      expect(await screen.findByText(/admin PIN wasn't accepted/)).toBeTruthy();
      expect(screen.getByLabelText("Reason").value).toBe("Cancelled"); // the form is still open
      fireEvent.click(screen.getByRole("button", { name: "Refund…" }));
      await screen.findByLabelText("Admin PIN"); typePin("9999");
      await waitFor(function () { expect(refundCalls().length).toBe(2); });
      expect(refundCalls()[1][1].p_idempotency_key).toBe(refundCalls()[0][1].p_idempotency_key);
    });

    it("cancelling the PIN prompt calls nothing", async function () {
      await openRefund();
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Cancelled" } });
      fireEvent.click(screen.getByRole("button", { name: "Refund…" }));
      await screen.findByLabelText("Admin PIN");
      fireEvent.click(screen.getAllByRole("button", { name: "Cancel" }).pop()); // the PIN prompt is the last modal
      await waitFor(function () { expect(screen.queryByLabelText("Admin PIN")).toBeNull(); });
      expect(refundCalls().length).toBe(0);
    });

    it("rejects a malformed PIN without calling the database", async function () {
      await openRefund();
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "x" } });
      fireEvent.click(screen.getByRole("button", { name: "Refund…" }));
      await screen.findByLabelText("Admin PIN"); typePin("12");
      expect(await screen.findByText(/4 to 6 digits/)).toBeTruthy();
      expect(refundCalls().length).toBe(0);
    });

    it("shows a plain message for a database refusal", async function () {
      setup({ invoices: [PAID], rpcError: "REFUND_EXCEEDS_PAID" });
      fireEvent.click(await screen.findByLabelText("Open invoice INV-0009"));
      fireEvent.click(await screen.findByRole("button", { name: "Refund" }));
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "x" } });
      fireEvent.click(screen.getByRole("button", { name: "Refund…" }));
      await screen.findByLabelText("Admin PIN"); typePin("9999");
      expect(await screen.findByText(/more than can still be refunded on this invoice/)).toBeTruthy();
    });

    it("offers to return products to stock only for a full refund of an invoice with product lines", async function () {
      var withItem = { pet_invoice_lines: [{ id: "l1", description: "Shampoo", quantity: 2, unit_price: 500, line_total: 1000, item_id: "it1" }] };
      await openRefund(withItem);
      expect(screen.getByLabelText("Put the products on this invoice back into stock")).toBeTruthy(); // full amount is prefilled
      fireEvent.change(screen.getByLabelText("Amount (KES)"), { target: { value: "500" } });
      expect(screen.queryByLabelText("Put the products on this invoice back into stock")).toBeNull();
      fireEvent.change(screen.getByLabelText("Amount (KES)"), { target: { value: "3000" } });
      fireEvent.click(screen.getByLabelText("Put the products on this invoice back into stock"));
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Cancelled" } });
      fireEvent.click(screen.getByRole("button", { name: "Refund…" }));
      await screen.findByLabelText("Admin PIN"); typePin("9999");
      await waitFor(function () { expect(refundCalls().length).toBe(1); });
      expect(refundCalls()[0][1].p_return_stock).toBe(true);
    });

    it("never offers the stock checkbox on an invoice with services only", async function () {
      await openRefund();
      expect(screen.queryByLabelText("Put the products on this invoice back into stock")).toBeNull();
    });

    it("a part-paid invoice can only be refunded in full (amount is locked)", async function () {
      setup({ invoices: [Object.assign({}, PAID, { status: "partial", amount_paid: 800, total: 3000, pet_payments: [{ id: "p", method: "cash", amount: 800, paid_at: "2026-10-24T09:00:00Z" }] })] });
      fireEvent.click(await screen.findByLabelText("Open invoice INV-0009"));
      fireEvent.click(await screen.findByRole("button", { name: "Refund" }));
      var amount = document.getElementById("refund-amount");
      expect(amount.value).toBe("800");
      expect(amount.disabled).toBe(true);
      expect(screen.getByText(/only part paid/)).toBeTruthy();
    });

    it("shows past refunds with refund receipts that open and print", async function () {
      var refunded = { status: "paid", amount_refunded: 500, pet_refunds: [{ id: "f1", method: "mpesa", amount: 500, reason: "Returned one shampoo", reference: "QWE1", refunded_at: "2026-10-26T09:00:00Z", created_at: "2026-10-26T09:00:00Z" }] };
      setup({ invoices: [Object.assign({}, PAID, refunded)] });
      fireEvent.click(await screen.findByLabelText("Open invoice INV-0009"));
      expect(await screen.findByText(/RFD-0009-1 · KES 500 · M-Pesa/)).toBeTruthy();
      expect(screen.getByText(/KES 2,500 kept/)).toBeTruthy();
      fireEvent.click(screen.getByLabelText("View refund receipt RFD-0009-1"));
      expect(await screen.findByText("Refund receipt RFD-0009-1")).toBeTruthy();
      expect(screen.getByText("AMOUNT REFUNDED")).toBeTruthy();
      expect(screen.getByText(/Reason: Returned one shampoo/)).toBeTruthy();
      expect(screen.getByText("Kept after refunds")).toBeTruthy();
    });

    it("the printable invoice shows refunds and what was kept", async function () {
      var refunded = { status: "paid", amount_refunded: 500, pet_refunds: [{ id: "f1", method: "cash", amount: 500, reason: "Goodwill", refunded_at: "2026-10-26T09:00:00Z" }] };
      setup({ invoices: [Object.assign({}, PAID, refunded)] });
      fireEvent.click(await screen.findByLabelText("Open invoice INV-0009"));
      expect(await screen.findByText("REFUNDS")).toBeTruthy();
      expect(screen.getByText("Kept after refunds")).toBeTruthy();
    });
  });

  describe("sharing", function () {
    var openSpy;
    beforeEach(function () { openSpy = vi.spyOn(window, "open").mockImplementation(function () { return null; }); });
    afterEach(function () { openSpy.mockRestore(); });

    it("opens WhatsApp to the customer's number with the invoice summary", async function () {
      setup({ open: "i1" });
      fireEvent.click(await screen.findByRole("button", { name: "WhatsApp" }));
      expect(openSpy).toHaveBeenCalledTimes(1);
      var url = openSpy.mock.calls[0][0];
      expect(url.indexOf("https://wa.me/254712345678?text=")).toBe(0);
      var text = decodeURIComponent(url.split("?text=")[1]);
      expect(text).toContain("INV-0001");
      expect(text).toContain("Balance due: KES 3,000");
      expect(openSpy.mock.calls[0][2]).toContain("noopener");
    });


    it("shows the Email and WhatsApp buttons next to Print", async function () {
      setup({ open: "i1" });
      expect(await screen.findByRole("button", { name: "Email" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "WhatsApp" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
    });

    it("still loads invoices when customer emails can't be fetched", async function () {
      mockDb.mockImplementation(function (method, table) {
        if (table === "pet_invoices") return Promise.resolve([inv()]);
        if (table === "customers") return Promise.resolve([{ id: "c1", name: "Wanjiru Kamau", phone: "0712345678" }]);
        if (table === "pet_pets") return Promise.resolve([{ id: "p1", name: "Simba", species: "Dog" }]);
        return Promise.resolve(null);
      });
      render(<InvoicesPage openInvoiceId="i1" />);
      expect(await screen.findByRole("button", { name: "Email" })).toBeTruthy();
    });
  });
});
