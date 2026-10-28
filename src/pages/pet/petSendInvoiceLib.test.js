import {
  buildText, buildHtml, emailSubject, isEmail, normalizePhone, safeFromName, resendPayload, whatsappPayload, whatsappParams,
  displayStatus, outstanding, escapeHtml,
} from "../../../supabase/functions/pet-send-invoice/lib.js";

function inv(extra) {
  return Object.assign({
    invoice_number: "INV-0001", status: "issued", total: 3000, amount_paid: 0, amount_refunded: 0, discount_amount: 0,
    tax_enabled: false, due_date: "2099-01-01", notes: null,
    pet_invoice_lines: [{ description: "Full groom", quantity: 2, line_total: 3000 }],
  }, extra || {});
}
var biz = { name: "Paws & Co", contact_phone: "0700000000", receipt_footer_message: "Asante sana!" };

describe("message text", function () {
  it("is built from the saved invoice", function () {
    var t = buildText(inv(), "Wanjiru Kamau", "Simba", biz, "2026-10-27");
    expect(t).toContain("Hello Wanjiru,");
    expect(t).toContain("invoice INV-0001 from Paws & Co for Simba");
    expect(t).toContain("- Full groom x2: KES 3,000");
    expect(t).toContain("Balance due: KES 3,000");
    expect(t).toContain("Asante sana!");
    expect(t).toContain("Paws & Co - Tel: 0700000000");
  });
  it("leaves out paid and balance on a void invoice", function () {
    var t = buildText(inv({ status: "void" }), "A", null, biz, "2026-10-27");
    expect(t).not.toContain("Balance due");
    expect(t).toContain("Status: Void");
  });
  it("derives overdue from the due date", function () {
    expect(displayStatus(inv({ due_date: "2026-10-01" }), "2026-10-27")).toBe("overdue");
    expect(displayStatus(inv({ due_date: "2026-10-01", status: "paid" }), "2026-10-27")).toBe("paid");
    expect(buildText(inv({ due_date: "2026-10-01" }), "A", null, biz, "2026-10-27")).toContain("Status: Overdue");
  });
  it("owes nothing once refunded or void", function () {
    expect(outstanding(inv({ status: "refunded" }))).toBe(0);
    expect(outstanding(inv({ status: "partial", amount_paid: 1000 }))).toBe(2000);
  });
  it("names the email subject after the business", function () {
    expect(emailSubject(inv(), biz)).toBe("Paws & Co invoice INV-0001");
    expect(emailSubject(inv(), {})).toBe("invoice INV-0001");
  });
});

describe("email html", function () {
  it("escapes everything a customer or staff member typed", function () {
    var h = buildHtml(inv({ notes: "<script>x</script>", pet_invoice_lines: [{ description: "<b>Bath</b>", quantity: 1, line_total: 500 }] }),
      "Eve <img src=x onerror=1>", "Rex\"><i>", { name: "A&B <Vets>", receipt_footer_message: "<u>hi</u>" }, "2026-10-27");
    expect(h).not.toContain("<script>");
    expect(h).not.toContain("<b>Bath");
    expect(h).not.toContain("<img");
    expect(h).not.toContain("<Vets>");
    expect(h).not.toContain("<u>hi");
    expect(h).toContain("&lt;script&gt;");
    expect(escapeHtml(null)).toBe("");
  });
});

describe("recipients", function () {
  it("validates emails", function () {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail(" a@b.co ")).toBe(true);
    ["", "a@b", "a@b.co, c@d.co", "a b@c.co", "a@b.co\\nBcc: x@y.co", "<a@b.co>"].forEach(function (v) { expect(isEmail(v)).toBe(false); });
  });
  it("normalizes Kenyan phone numbers", function () {
    expect(normalizePhone("0712345678")).toBe("254712345678");
    expect(normalizePhone("+254 712 345 678")).toBe("254712345678");
    expect(normalizePhone("254712345678")).toBe("254712345678");
    expect(normalizePhone("0712-345-678")).toBe("254712345678");
  });
  it("rejects numbers that cannot be right", function () {
    [null, "", "12345", "abc", "0712 345 67x", "07123456789012345"].forEach(function (v) { expect(normalizePhone(v)).toBeNull(); });
  });
});

describe("provider payloads", function () {
  it("strips header-breaking characters from the From name", function () {
    expect(safeFromName('Paws <evil@x.co>\r\nBcc: z')).toBe("Paws evil@x.co Bcc z");
    expect(safeFromName(null)).toBe("");
  });
  it("builds a Resend payload with a business display name", function () {
    var p = resendPayload("invoices@trimora.app", "Paws & Co", "a@b.co", "S", "T", "<p>H</p>", "shop@paws.co");
    expect(p).toMatchObject({ from: "Paws & Co <invoices@trimora.app>", to: ["a@b.co"], subject: "S", reply_to: "shop@paws.co" });
    expect(resendPayload("i@t.app", "", "a@b.co", "S", "T", "H").from).toBe("i@t.app");
    expect(resendPayload("i@t.app", "P", "a@b.co", "S", "T", "H", "not-an-email").reply_to).toBeUndefined();
  });
  it("uses a template when configured, with one-line parameters", function () {
    var params = whatsappParams(inv({ amount_paid: 1000, status: "partial" }), "Wanjiru Kamau", biz);
    expect(params).toEqual(["Wanjiru", "INV-0001", "Paws & Co", "KES 3,000", "KES 2,000"]);
    var p = whatsappPayload("254712345678", "invoice_ready", "en", "ignored", ["a\nb", "c"]);
    expect(p.type).toBe("template");
    expect(p.template.name).toBe("invoice_ready");
    expect(p.template.components[0].parameters[0].text).toBe("a b");
  });
  it("falls back to free text without a template", function () {
    var p = whatsappPayload("254712345678", null, "en", "Hello", []);
    expect(p).toEqual({ messaging_product: "whatsapp", to: "254712345678", type: "text", text: { preview_url: false, body: "Hello" } });
  });
});
