import { whatsappUrl, mailtoUrl, invoiceSubject, isEmailLike } from "./invoiceShare";

function inv(extra) {
  return Object.assign({
    id: "i1", invoice_number: "INV-0001", status: "issued", subtotal: 3000, discount_amount: 0, total: 3000,
    tax_enabled: false, tax_rate: 0, tax_amount: 0, amount_paid: 0, amount_refunded: 0, due_date: "2099-01-01",
    pet_invoice_lines: [{ id: "l1", description: "Full groom", quantity: 2, unit_price: 1500, line_total: 3000 }],
  }, extra || {});
}
var salon = { name: "Paws & Co" };

describe("whatsappUrl", function () {
  it("opens the customer's chat with no pre-filled text, so only the PDF is sent", function () {
    expect(whatsappUrl("0712345678")).toBe("https://wa.me/254712345678");
  });
  it("normalizes a local Kenyan number", function () {
    expect(whatsappUrl("0712345678", "hi there")).toBe("https://wa.me/254712345678?text=hi%20there");
  });
  it("accepts +254 and spaces", function () {
    expect(whatsappUrl("+254 712 345 678", "x")).toBe("https://wa.me/254712345678?text=x");
  });
  it("falls back to the WhatsApp contact picker when the number is missing or unusable", function () {
    expect(whatsappUrl("", "x")).toBe("https://wa.me/?text=x");
    expect(whatsappUrl("12345", "x")).toBe("https://wa.me/?text=x");
  });
  it("encodes line breaks and ampersands", function () {
    expect(whatsappUrl("0712345678", "a&b\nc")).toContain("text=a%26b%0Ac");
  });
});

describe("mailtoUrl", function () {
  it("puts the address and subject in the link, with no body text", function () {
    var u = mailtoUrl("wanjiru@example.com", "Paws & Co invoice INV-0001");
    expect(u).toBe("mailto:wanjiru@example.com?subject=Paws%20%26%20Co%20invoice%20INV-0001");
  });
  it("leaves the recipient blank when there is no valid email", function () {
    expect(mailtoUrl("", "s")).toBe("mailto:?subject=s");
    expect(mailtoUrl("not-an-email", "s")).toBe("mailto:?subject=s");
  });
  it("validates emails", function () {
    expect(isEmailLike("a@b.co")).toBe(true);
    expect(isEmailLike("a@b")).toBe(false);
    expect(isEmailLike("a@b.co, c@d.co")).toBe(false);
  });
});

describe("invoiceSubject", function () {
  it("uses the business name when there is one", function () {
    expect(invoiceSubject(inv(), salon)).toBe("Paws & Co invoice INV-0001");
    expect(invoiceSubject(inv(), null)).toBe("invoice INV-0001");
  });
});
