import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import InvoiceDocument from "./InvoiceDocument";

var invoice = {
  id: "i1", invoice_number: "INV-0007", status: "partial", subtotal: 3500, discount_amount: 500, total: 3000, tax_enabled: true, tax_rate: 16, tax_amount: 414,
  amount_paid: 1000, due_date: "2026-12-01", issued_at: "2026-10-24T08:00:00Z", notes: "Thanks!",
  pet_invoice_lines: [{ id: "l1", description: "Full groom", quantity: 1, unit_price: 1500, line_total: 1500 }, { id: "l2", description: "Night stay", quantity: 1, unit_price: 2000, line_total: 2000 }],
  pet_payments: [{ id: "p1", method: "mpesa", amount: 1000, reference: "QWE123", paid_at: "2026-10-24T09:00:00Z" }],
};
var customer = { id: "c1", name: "Wanjiru Kamau", phone: "0712345678" };
var pet = { id: "p1", name: "Simba", species: "Dog" };

describe("InvoiceDocument", function () {
  it("shows the business logo when one is set", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co", logo_url: "https://example.com/logo.png", tax_pin: "P0123", receipt_footer_message: "Come again!" }} />);
    var img = screen.getByAltText("Paws & Co logo");
    expect(img.getAttribute("src")).toBe("https://example.com/logo.png");
    expect(screen.getByText("Paws & Co")).toBeTruthy();
    expect(screen.getByText("Come again!")).toBeTruthy();
  });
  it("falls back to the business name when there is no logo", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co" }} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Paws & Co")).toBeTruthy();
  });
  it("falls back to the business name when the logo fails to load", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co", logo_url: "https://example.com/broken.png" }} />);
    fireEvent.error(screen.getByAltText("Paws & Co logo"));
    expect(screen.queryByAltText("Paws & Co logo")).toBeNull();
    expect(screen.getByText("Paws & Co")).toBeTruthy();
  });
  it("prints the saved numbers: lines, discount, VAT, paid and balance", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co", tax_pin: "P0123" }} />);
    expect(screen.getByText("INV-0007")).toBeTruthy();
    expect(screen.getByText("Full groom")).toBeTruthy();
    expect(screen.getByText("- KES 500")).toBeTruthy();
    expect(screen.getByText(/VAT \/ Tax \(included\)/)).toBeTruthy();
    expect(screen.getByText("16%")).toBeTruthy();
    expect(screen.getByText("KES 414")).toBeTruthy();
    expect(screen.getByText("Balance Due").nextSibling.textContent).toBe("KES 2,000");
    expect(screen.getByText("Amount Paid").nextSibling.textContent).toBe("KES 1,000");
    expect(screen.getByText(/QWE123/)).toBeTruthy();
    expect(screen.getByText("KRA PIN: P0123")).toBeTruthy();
    expect(screen.getByText("PART PAID")).toBeTruthy();
  });
  it("marks a void invoice and shows the reason without a balance", function () {
    var v = Object.assign({}, invoice, { status: "void", amount_paid: 0, pet_payments: [], voided_at: "2026-10-25T08:00:00Z", void_reason: "Entered in error" });
    render(<InvoiceDocument invoice={v} customer={customer} pet={null} salon={{ name: "Paws & Co" }} />);
    expect(screen.getByText("VOID")).toBeTruthy();
    expect(screen.getByText(/Entered in error/)).toBeTruthy();
    expect(screen.queryByText("Balance Due")).toBeNull();
  });
  it("uses the built-in PawPals Kenya brand: logo, contact details and thank-you line", function () {
    render(<InvoiceDocument invoice={Object.assign({}, invoice, { status: "paid", amount_paid: 3000 })} customer={customer} pet={pet} salon={{ name: "PawPals Kenya", slug: "pawpals-kenya" }} />);
    expect(screen.getByAltText("PawPals Kenya logo")).toBeTruthy();
    expect(screen.getAllByText("info@pawpalskenya.co.ke").length).toBeGreaterThan(0);
    expect(screen.getByText("Thank you for trusting PawPals Kenya with your pet.")).toBeTruthy();
    expect(screen.getByText("PAID")).toBeTruthy();
    expect(screen.getByText("Balance Due").nextSibling.textContent).toBe("KES 0");
  });
  it("lets a saved logo override the PawPals preset and adds no preset contacts to other businesses", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "PawPals Kenya", logo_url: "https://example.com/own.png" }} />);
    expect(screen.getByAltText("PawPals Kenya logo").getAttribute("src")).toBe("https://example.com/own.png");
  });
  it("shows the payment details panel with the reference", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co" }} />);
    expect(screen.getByText("Payment Details")).toBeTruthy();
    expect(screen.getByText("QWE123")).toBeTruthy();
    expect(screen.getByText("M-Pesa")).toBeTruthy();
    expect(screen.queryByText("info@pawpalskenya.co.ke")).toBeNull();
  });
  it("has no heading: the word invoice appears nowhere on the document, but the number, date and status stay", function () {
    var withEverything = Object.assign({}, invoice, { notes: "" });
    var salon = { name: "Paws & Co", logo_url: "https://example.com/logo.png", tagline: "Pet care", contact_email: "hello@example.com", website: "www.example.com", address: "Some Town",
      phones: [{ phone: "0711 111 111", show_on_invoice: true }] };
    var view = render(<InvoiceDocument invoice={withEverything} customer={customer} pet={pet} salon={salon} />);
    // What a person can read: the text on the page, not the print stylesheet's class names.
    var clone = view.container.cloneNode(true);
    Array.from(clone.querySelectorAll("style")).forEach(function (n) { n.remove(); });
    expect(clone.textContent).not.toMatch(/invoice/i);
    expect(Array.from(view.container.querySelectorAll("[alt],[title],[aria-label]")).map(function (n) {
      return [n.getAttribute("alt"), n.getAttribute("title"), n.getAttribute("aria-label")].join(" ");
    }).join(" ")).not.toMatch(/invoice/i);
    expect(screen.getByText("No.")).toBeTruthy();
    expect(screen.getByText("Date")).toBeTruthy();
    expect(screen.getByText("Due Date")).toBeTruthy();
    expect(screen.getByText("INV-0007")).toBeTruthy();
    expect(screen.getByText("PART PAID")).toBeTruthy();
  });
  it("shows a new-format number as the reference, wrapped inside the card, with no due date row when there is none", function () {
    var inv = Object.assign({}, invoice, { invoice_number: "A-VERY-LONG-BUSINESS-PREFIX-INV-10001", due_date: null });
    render(<InvoiceDocument invoice={inv} customer={customer} pet={pet} salon={{ name: "Paws & Co" }} />);
    var num = screen.getByText("A-VERY-LONG-BUSINESS-PREFIX-INV-10001");
    expect(num.style.overflowWrap).toBe("anywhere");
    expect(screen.queryByText("Due Date")).toBeNull();
  });
  it("takes the business email, website and address from the business's own settings, wrapped to fit", function () {
    var long = "a-really-long-name-for-an-email-address-that-would-not-fit@a-very-long-domain-name.example.com";
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co", contact_email: long, website: "www.example.com", address: "Some Town, Some Country" }} />);
    var mail = screen.getAllByText(long)[0];
    expect(mail.style.overflowWrap).toBe("anywhere");
    expect(screen.getAllByText("www.example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Some Town, Some Country")).toBeTruthy();
  });
  it("shows no empty contact rows when a business has entered nothing", function () {
    var view = render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co" }} />);
    expect(view.container.querySelectorAll("svg").length).toBeGreaterThan(0);
    expect(screen.queryByText(/@/)).toBeNull();
  });
  it("prints every phone number the owner switched on, and skips the rest", function () {
    var salon = { name: "Paws & Co", phones: [{ phone: "0711 111 111", show_on_invoice: true }, { phone: "0722 222 222", show_on_invoice: false }, { phone: "0733 333 333", show_on_invoice: true }] };
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={salon} />);
    expect(screen.getAllByText("0711 111 111").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0733 333 333/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/0722 222 222/)).toBeNull();
  });
  it("has no built-in phone number: PawPals shows only what its owner entered", function () {
    var { container } = render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "PawPals Kenya", slug: "pawpals-kenya", phones: [] }} />);
    expect(container.textContent).not.toMatch(/700 123 456/);
    var again = render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "PawPals Kenya", slug: "pawpals-kenya", phones: [{ phone: "0799 000 111", show_on_invoice: true }] }} />);
    expect(again.container.textContent).toMatch(/0799 000 111/);
  });
  it("falls back to the single contact number when the phone list was not loaded", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co", contact_phone: "0700111222" }} />);
    expect(screen.getAllByText(/0700111222/).length).toBeGreaterThan(0);
  });
  it("keeps long email and website text inside the card (wraps instead of clipping)", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "PawPals Kenya", slug: "pawpals-kenya" }} />);
    var el = screen.getAllByText("www.pawpalskenya.co.ke")[0];
    expect(el.style.overflowWrap).toBe("anywhere");
    expect(el.style.minWidth).toBe("0px");
  });
});
