import { buildInvoiceMessage, whatsappUrl, mailtoUrl, invoiceSubject, isEmailLike } from "./invoiceShare";

function inv(extra) {
  return Object.assign({
    id: "i1", invoice_number: "INV-0001", status: "issued", subtotal: 3000, discount_amount: 0, total: 3000,
    tax_enabled: false, tax_rate: 0, tax_amount: 0, amount_paid: 0, amount_refunded: 0, due_date: "2099-01-01",
    pet_invoice_lines: [{ id: "l1", description: "Full groom", quantity: 2, unit_price: 1500, line_total: 3000 }],
  }, extra || {});
}
var customer = { name: "Wanjiru Kamau", phone: "0712345678" };
var pet = { name: "Simba" };
var salon = { name: "Paws & Co", contact_phone: "0700000000", receipt_footer_message: "Asante sana!" };

describe("buildInvoiceMessage", function () {
  it("names the invoice, customer, pet, lines, total and balance from the saved invoice", function () {
    var m = buildInvoiceMessage(inv(), customer, pet, salon);
    expect(m).toContain("Hello Wanjiru,");
    expect(m).toContain("invoice INV-0001 from Paws & Co for Simba");
    expect(m).toContain("- Full groom x2: KES 3,000");
    expect(m).toContain("Total: KES 3,000");
    expect(m).toContain("Balance due: KES 3,000");
    expect(m).toContain("Asante sana!");
  });
  it("shows payments, refunds and VAT when present", function () {
    var m = buildInvoiceMessage(inv({ status: "partial", amount_paid: 1000, tax_enabled: true, tax_rate: 16, tax_amount: 414 }), customer, pet, salon);
    expect(m).toContain("Paid: KES 1,000");
    expect(m).toContain("Balance due: KES 2,000");
    expect(m).toContain("Includes VAT (16%): KES 414");
  });
  it("leaves out paid and balance lines on a void invoice", function () {
    var m = buildInvoiceMessage(inv({ status: "void" }), customer, pet, salon);
    expect(m).not.toContain("Balance due");
    expect(m).toContain("Status: Void");
  });
  it("still works with no customer, pet or salon", function () {
    var m = buildInvoiceMessage(inv(), null, null, null);
    expect(m).toContain("Hello,");
    expect(m).toContain("from us.");
  });
});

describe("whatsappUrl", function () {
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
  it("puts the address, subject and CRLF-encoded body in the link", function () {
    var u = mailtoUrl("wanjiru@example.com", "Paws & Co invoice INV-0001", "line1\nline2");
    expect(u).toBe("mailto:wanjiru@example.com?subject=Paws%20%26%20Co%20invoice%20INV-0001&body=line1%0D%0Aline2");
  });
  it("leaves the recipient blank when there is no valid email", function () {
    expect(mailtoUrl("", "s", "b")).toBe("mailto:?subject=s&body=b");
    expect(mailtoUrl("not-an-email", "s", "b")).toBe("mailto:?subject=s&body=b");
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
