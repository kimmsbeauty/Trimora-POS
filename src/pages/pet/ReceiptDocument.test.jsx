import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ReceiptDocument from "./ReceiptDocument";

var invoice = {
  id: "i1", invoice_number: "INV-0007", total: 3000, tax_enabled: true,
  pet_payments: [
    { id: "p1", method: "mpesa", amount: 1000, reference: "QWE123", paid_at: "2026-10-24T09:00:00Z" },
    { id: "p2", method: "cash", amount: 2000, reference: null, paid_at: "2026-10-25T09:00:00Z" },
  ],
};
var customer = { id: "c1", name: "Wanjiru Kamau", phone: "0712345678" };
var pet = { id: "p1", name: "Simba", species: "Dog" };
var salon = { name: "Paws & Co", logo_url: "https://example.com/logo.png", tagline: "Happy pets", contact_phone: "0700111222", tax_pin: "P0123", receipt_footer_message: "Come again!" };

describe("ReceiptDocument", function () {
  it("carries the business logo, name details and a RECEIPT heading", function () {
    render(<ReceiptDocument invoice={invoice} paymentId="p1" customer={customer} pet={pet} salon={salon} />);
    expect(screen.getByAltText("Paws & Co logo").getAttribute("src")).toBe("https://example.com/logo.png");
    expect(screen.getByText("RECEIPT")).toBeTruthy();
    expect(screen.getByText("Tel: 0700111222")).toBeTruthy();
    expect(screen.getByText("KRA PIN: P0123")).toBeTruthy();
    expect(screen.getByText("Come again!")).toBeTruthy();
  });
  it("falls back to the business name with no logo, or when the logo fails to load", function () {
    var r = render(<ReceiptDocument invoice={invoice} paymentId="p1" customer={customer} salon={{ name: "Paws & Co" }} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Paws & Co")).toBeTruthy();
    r.unmount();
    render(<ReceiptDocument invoice={invoice} paymentId="p1" customer={customer} salon={{ name: "Paws & Co", logo_url: "https://example.com/broken.png" }} />);
    fireEvent.error(screen.getByAltText("Paws & Co logo"));
    expect(screen.queryByAltText("Paws & Co logo")).toBeNull();
    expect(screen.getByText("Paws & Co")).toBeTruthy();
  });
  it("shows this payment, the method and reference, the customer and the pet", function () {
    render(<ReceiptDocument invoice={invoice} paymentId="p1" customer={customer} pet={pet} salon={salon} />);
    expect(screen.getByText("RCT-0007-1")).toBeTruthy();
    expect(screen.getByText("Wanjiru Kamau")).toBeTruthy();
    expect(screen.getByText("Pet: Simba (Dog)")).toBeTruthy();
    expect(screen.getByText(/M-Pesa.*QWE123/)).toBeTruthy();
    expect(screen.getAllByText("KES 1,000").length).toBe(2); // amount received, and paid to date
  });
  it("shows the balance remaining after a part payment and 'Paid in full' after the last", function () {
    var r = render(<ReceiptDocument invoice={invoice} paymentId="p1" customer={customer} salon={salon} />);
    expect(screen.getByText("Balance remaining")).toBeTruthy();
    expect(screen.getByText("KES 2,000", { selector: "span" })).toBeTruthy();
    r.unmount();
    render(<ReceiptDocument invoice={invoice} paymentId="p2" customer={customer} salon={salon} />);
    expect(screen.getByText("Paid in full")).toBeTruthy();
    expect(screen.queryByText("Balance remaining")).toBeNull();
  });
  it("uses a default thank-you and omits the PIN when tax is off", function () {
    render(<ReceiptDocument invoice={Object.assign({}, invoice, { tax_enabled: false })} paymentId="p1" customer={customer} salon={{ name: "X", tax_pin: "P1" }} />);
    expect(screen.getByText("Thank you for your business.")).toBeTruthy();
    expect(screen.queryByText(/KRA PIN/)).toBeNull();
  });
  it("renders nothing for an unknown payment", function () {
    var r = render(<ReceiptDocument invoice={invoice} paymentId="zzz" customer={customer} salon={salon} />);
    expect(r.container.textContent).toBe("");
  });
});
