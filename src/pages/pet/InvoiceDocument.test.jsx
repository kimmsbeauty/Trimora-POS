import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import InvoiceDocument, { money, termsLabel, thanksParts, dateLabel } from "./InvoiceDocument";
import { PAWPALS_PURPLE, PAWPALS_BLUE } from "./brandColors";

var invoice = {
  id: "i1", invoice_number: "INV-0007", status: "partial", subtotal: 3500, discount_amount: 500, total: 3000, tax_enabled: true, tax_rate: 16, tax_amount: 414,
  amount_paid: 1000, due_date: "2026-12-01", issued_at: "2026-10-24T08:00:00Z", notes: "Thanks!",
  pet_invoice_lines: [{ id: "l1", description: "Full groom", quantity: 1, unit_price: 1500, line_total: 1500 }, { id: "l2", description: "Night stay", quantity: 1, unit_price: 2000, line_total: 2000 }],
  pet_payments: [{ id: "p1", method: "mpesa", amount: 1000, reference: "QWE123", paid_at: "2026-10-24T09:00:00Z" }],
};
var customer = { id: "c1", name: "Wanjiru Kamau", phone: "0712345678" };
var pet = { id: "p1", name: "Simba", species: "Dog" };

// The invoice from the approved PawPals Kenya design: 1 night of boarding + pick and drop, unpaid.
var pawpalsInvoice = {
  id: "i2", invoice_number: "INV000230", status: "issued", subtotal: 2000, discount_amount: 0, total: 2000, tax_enabled: false, tax_rate: 0, tax_amount: 0,
  amount_paid: 0, amount_refunded: 0, due_date: "2026-11-04", issued_at: "2026-11-04T08:00:00Z", notes: "",
  pet_invoice_lines: [{ id: "a", description: "Pet Boarding\nPet Boarding/Night", quantity: 1, unit_price: 800, line_total: 800 }, { id: "b", description: "Pick And Drop", quantity: 1, unit_price: 1200, line_total: 1200 }],
  pet_payments: [],
};
var pawpalsSalon = { name: "Pawpals Kenya", slug: "pawpals-kenya", address: "1196, Kabete Central, Kenya", phones: [{ phone: "0723612021", show_on_invoice: true }, { phone: "0705627371", show_on_invoice: true }],
  contact_email: "pawpalske@gmail.com", mpesa_paybill: "247247", mpesa_account: "0723612021" };

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

  describe("layout of the approved PawPals invoice", function () {
    function renderPawpals(extra) {
      return render(<InvoiceDocument invoice={Object.assign({}, pawpalsInvoice, extra && extra.invoice)} customer={{ id: "c", name: "Ms. Yoon Maung" }} pet={null} salon={Object.assign({}, pawpalsSalon, extra && extra.salon)} />);
    }
    it("has the INVOICE heading, number and balance due at the top right", function () {
      renderPawpals();
      expect(screen.getByText("INVOICE")).toBeTruthy();
      expect(screen.getByText("# INV000230")).toBeTruthy();
      expect(screen.getAllByText("Balance Due")[0].nextSibling.textContent).toBe("KES2,000.00");
    });
    it("shows the logo (its strapline bar is part of the image, so no second bar), then the business details line by line", function () {
      renderPawpals();
      expect(screen.getByAltText("Pawpals Kenya logo")).toBeTruthy();
      expect(screen.queryByText(/pawsitively/)).toBeNull();
      expect(screen.getByText("Pawpals Kenya")).toBeTruthy();
      expect(screen.getByText("1196")).toBeTruthy();
      expect(screen.getByText("Kabete Central")).toBeTruthy();
      expect(screen.getByText("Kenya")).toBeTruthy();
      expect(screen.getByText("0723612021*0705627371")).toBeTruthy();
      expect(screen.getByText("pawpalske@gmail.com")).toBeTruthy();
    });
    it("shows Invoice Date, Terms and Due Date, and Bill To", function () {
      renderPawpals();
      expect(screen.getByText("Invoice Date :").nextSibling.textContent).toBe("04 Nov 2026");
      expect(screen.getByText("Terms :").nextSibling.textContent).toBe("Due on Receipt");
      expect(screen.getByText("Due Date :").nextSibling.textContent).toBe("04 Nov 2026");
      expect(screen.getByText("Bill To")).toBeTruthy();
      expect(screen.getByText("Ms. Yoon Maung")).toBeTruthy();
    });
    it("has the item table: #, Item & Description, Qty, Rate, Vatable Amount, with a grey sub-description", function () {
      var view = renderPawpals();
      var heads = Array.from(view.container.querySelectorAll("th")).map(function (t) { return t.textContent; });
      expect(heads).toEqual(["#", "Item & Description", "Qty", "Rate", "VatableAmount"]);
      var rows = view.container.querySelectorAll("tbody tr");
      expect(rows.length).toBe(2);
      var first = Array.from(rows[0].querySelectorAll("td")).map(function (t) { return t.textContent; });
      expect(first).toEqual(["1", "Pet BoardingPet Boarding/Night", "1.00", "800.00", "800.00"]);
      var second = Array.from(rows[1].querySelectorAll("td")).map(function (t) { return t.textContent; });
      expect(second).toEqual(["2", "Pick And Drop", "1.00", "1,200.00", "1,200.00"]);
    });
    it("has Sub Total, Total and Balance Due rows, and no VAT, discount or payment rows when there are none", function () {
      renderPawpals();
      expect(screen.getByText("Sub Total").nextSibling.textContent).toBe("2,000.00");
      expect(screen.getByText("Total").nextSibling.textContent).toBe("KES2,000.00");
      expect(screen.getAllByText("Balance Due")[1].nextSibling.textContent).toBe("KES2,000.00");
      expect(screen.queryByText(/VAT/)).toBeNull();
      expect(screen.queryByText("Discount")).toBeNull();
      expect(screen.queryByText("Payment Made")).toBeNull();
    });
    it("prints the Paybill and account number under Notes from the business's M-Pesa settings", function () {
      renderPawpals();
      expect(screen.getByText("Notes")).toBeTruthy();
      expect(screen.getByText("PAYBILL:247247")).toBeTruthy();
      expect(screen.getByText("ACC NO:0723612021")).toBeTruthy();
    });
    it("does not repeat payment details already typed into the invoice notes, and drops them once paid", function () {
      var view = renderPawpals({ invoice: { notes: "PAYBILL:247247\nACC NO:0723612021" } });
      expect(screen.getAllByText("PAYBILL:247247").length).toBe(1);
      view.unmount();
      renderPawpals({ invoice: { status: "paid", amount_paid: 2000 } });
      expect(screen.queryByText("PAYBILL:247247")).toBeNull();
    });
    it("has the boxed thank-you footer with the footer email and website", function () {
      renderPawpals();
      expect(screen.getByText("info@pawpalskenya.co.ke")).toBeTruthy();
      expect(screen.getByText("www.pawpalskenya.co.ke")).toBeTruthy();
    });
    it("colours the thank-you line and the paw with the logo's colours, not gold", function () {
      var view = renderPawpals();
      var thanks = screen.getByText("PawPals Kenya");
      expect(thanks.style.color).toBe("rgb(0, 159, 224)"); // logo blue
      expect(screen.getByText(/Thank you for trusting/).style.color).toBe("rgb(153, 27, 150)"); // logo magenta
      var paw = view.container.querySelector("svg g[fill]");
      expect(paw.getAttribute("fill").toLowerCase()).toBe(PAWPALS_BLUE.toLowerCase());
      expect(view.container.innerHTML).not.toMatch(/E1AC41/i);
      expect(PAWPALS_PURPLE).toBe("#991B96");
    });
  });

  it("prints the saved numbers: lines, discount, VAT, payment made and balance", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co", tax_pin: "P0123" }} />);
    expect(screen.getByText("# INV-0007")).toBeTruthy();
    expect(screen.getByText("Full groom")).toBeTruthy();
    expect(screen.getByText("Discount").nextSibling.textContent).toBe("- 500.00");
    expect(screen.getByText("VAT (16%) included").nextSibling.textContent).toBe("414.00");
    expect(screen.getByText("Total").nextSibling.textContent).toBe("KES3,000.00");
    expect(screen.getByText("Payment Made").nextSibling.textContent).toBe("(-) 1,000.00");
    expect(screen.getAllByText("Balance Due")[1].nextSibling.textContent).toBe("KES2,000.00");
    expect(screen.getByText(/QWE123/)).toBeTruthy();
    expect(screen.getByText("KRA PIN: P0123")).toBeTruthy();
    expect(screen.getByText("Thanks!")).toBeTruthy();
  });
  it("puts a business's own tagline on a coloured bar under its own logo", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co", logo_url: "https://example.com/logo.png", tagline: "Happy pets" }} />);
    expect(screen.getByText("Happy pets")).toBeTruthy();
  });
  it("shows the pet under Bill To when there is one", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co" }} />);
    expect(screen.getByText("Pet: Simba (Dog)")).toBeTruthy();
  });
  it("marks a void invoice and shows the reason without a balance", function () {
    var v = Object.assign({}, invoice, { status: "void", amount_paid: 0, pet_payments: [], voided_at: "2026-10-25T08:00:00Z", void_reason: "Entered in error" });
    render(<InvoiceDocument invoice={v} customer={customer} pet={null} salon={{ name: "Paws & Co" }} />);
    expect(screen.getByText("VOID")).toBeTruthy();
    expect(screen.getByText(/Entered in error/)).toBeTruthy();
    expect(screen.queryByText("Balance Due")).toBeNull();
  });
  it("uses the built-in PawPals Kenya brand: logo, footer contacts and thank-you line", function () {
    render(<InvoiceDocument invoice={Object.assign({}, invoice, { status: "paid", amount_paid: 3000 })} customer={customer} pet={pet} salon={{ name: "PawPals Kenya", slug: "pawpals-kenya" }} />);
    expect(screen.getByAltText("PawPals Kenya logo")).toBeTruthy();
    expect(screen.getAllByText("info@pawpalskenya.co.ke").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("Thank you for trusting PawPals Kenya with your pet.");
    expect(screen.getAllByText("Balance Due")[1].nextSibling.textContent).toBe("KES0.00");
  });
  it("uses the PawPals logo colours for the footer even when an old gold colour is saved in Settings", function () {
    var view = render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Pawpalske", slug: "pawpalske", primary_color: "#E1AC41", secondary_color: "#000000" }} />);
    expect(screen.getByText(/Thank you for trusting/).style.color).toBe("rgb(153, 27, 150)");
    expect(view.container.innerHTML).not.toMatch(/E1AC41/i);
  });
  it("keeps a business's own colours when it uses its own logo", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co", logo_url: "https://example.com/l.png", primary_color: "#123456", receipt_footer_message: "Bye" }} />);
    expect(screen.getByText("Bye").style.color).toBe("rgb(18, 52, 86)");
  });
  it("lets a saved logo override the PawPals preset", function () {
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "PawPals Kenya", logo_url: "https://example.com/own.png" }} />);
    expect(screen.getByAltText("PawPals Kenya logo").getAttribute("src")).toBe("https://example.com/own.png");
  });
  it("shows no empty contact rows when a business has entered nothing", function () {
    var view = render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co" }} />);
    expect(screen.queryByText(/@/)).toBeNull();
    expect(view.container.textContent).not.toMatch(/PAYBILL|TILL/);
  });
  it("takes the business email and address from the business's own settings, wrapped to fit", function () {
    var long = "a-really-long-name-for-an-email-address-that-would-not-fit@a-very-long-domain-name.example.com";
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={{ name: "Paws & Co", contact_email: long, website: "www.example.com", address: "Some Town, Some Country" }} />);
    expect(screen.getAllByText(long)[0].style.overflowWrap).toBe("anywhere");
    expect(screen.getByText("Some Town")).toBeTruthy();
    expect(screen.getByText("Some Country")).toBeTruthy();
    expect(screen.getAllByText("www.example.com").length).toBeGreaterThan(0);
  });
  it("prints every phone number the owner switched on, joined with *, and skips the rest", function () {
    var salon = { name: "Paws & Co", phones: [{ phone: "0711 111 111", show_on_invoice: true }, { phone: "0722 222 222", show_on_invoice: false }, { phone: "0733 333 333", show_on_invoice: true }] };
    render(<InvoiceDocument invoice={invoice} customer={customer} pet={pet} salon={salon} />);
    expect(screen.getByText("0711 111 111*0733 333 333")).toBeTruthy();
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
  it("keeps a long invoice number inside the card", function () {
    var inv = Object.assign({}, invoice, { invoice_number: "A-VERY-LONG-BUSINESS-PREFIX-INV-10001" });
    render(<InvoiceDocument invoice={inv} customer={customer} pet={pet} salon={{ name: "Paws & Co" }} />);
    expect(screen.getByText("# A-VERY-LONG-BUSINESS-PREFIX-INV-10001").style.overflowWrap).toBe("anywhere");
  });
});

describe("invoice on a narrow screen", function () {
  var realRO; var realOW;
  beforeEach(function () {
    realRO = globalThis.ResizeObserver; realOW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    globalThis.ResizeObserver = function () { this.observe = function () {}; this.disconnect = function () {}; };
  });
  afterEach(function () {
    globalThis.ResizeObserver = realRO;
    if (realOW) Object.defineProperty(HTMLElement.prototype, "offsetWidth", realOW); else delete HTMLElement.prototype.offsetWidth;
  });
  function width(w) { Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: function () { return w; } }); }
  var long = Object.assign({}, invoice, { pet_invoice_lines: [{ id: "l1", description: "Pet Boarding with de-shedding treatment", quantity: 2, unit_price: 3500, line_total: 7000 }] });

  it("on a phone-width card gives the item name real room (no one-letter-per-line column)", function () {
    width(300);
    var view = render(<InvoiceDocument invoice={long} customer={customer} pet={pet} salon={{ name: "Paws & Co" }} />);
    var cols = Array.from(view.container.querySelectorAll("col")).map(function (c) { return c.style.width; });
    var fixed = cols.reduce(function (n, w) { return n + (parseInt(w, 10) || 0); }, 0);
    expect(fixed).toBeLessThanOrEqual(190); // 300px card minus its padding still leaves 80px+ for the name
    expect(view.container.querySelector(".invoice-print")).toBeTruthy();
  });
  it("on a wide card uses the full design", function () {
    width(700);
    var view = render(<InvoiceDocument invoice={long} customer={customer} pet={pet} salon={{ name: "Paws & Co" }} />);
    var cols = Array.from(view.container.querySelectorAll("col")).map(function (c) { return c.style.width; });
    expect(cols).toEqual(["30px", "", "46px", "82px", "92px"]);
  });
  it("layout=full always uses the full A4 design, even in a narrow container, and is not the printable element", function () {
    width(300);
    var view = render(<InvoiceDocument layout="full" invoice={long} customer={customer} pet={pet} salon={{ name: "Paws & Co" }} />);
    var cols = Array.from(view.container.querySelectorAll("col")).map(function (c) { return c.style.width; });
    expect(cols).toEqual(["30px", "", "46px", "82px", "92px"]);
    expect(view.container.querySelector(".invoice-pdf-source")).toBeTruthy();
    expect(view.container.querySelector(".invoice-print")).toBeNull();
  });
});

describe("invoice formatting helpers", function () {
  it("always shows two decimals with thousands separators", function () {
    expect(money(2000)).toBe("2,000.00");
    expect(money(1)).toBe("1.00");
    expect(money(0)).toBe("0.00");
  });
  it("formats dates like 04 Nov 2026", function () {
    expect(dateLabel("2026-11-04")).toBe("04 Nov 2026");
    expect(dateLabel("")).toBe("");
  });
  it("says Due on Receipt when due the day it is issued or with no due date, else Net N", function () {
    expect(termsLabel({ issued_at: "2026-11-04T08:00:00", due_date: "2026-11-04" })).toBe("Due on Receipt");
    expect(termsLabel({ issued_at: "2026-11-04T08:00:00", due_date: null })).toBe("Due on Receipt");
    expect(termsLabel({ issued_at: "2026-11-04T08:00:00", due_date: "2026-11-11" })).toBe("Net 7");
  });
  it("splits the thank-you line so the business name takes the second colour", function () {
    expect(thanksParts("Thank you for trusting PawPals Kenya with your pet.", "PawPals Kenya")).toEqual([
      { text: "Thank you for trusting ", tone: "primary" }, { text: "PawPals Kenya", tone: "secondary" }, { text: " with your pet.", tone: "primary" },
    ]);
    expect(thanksParts("Asante sana!", "Paws & Co")).toEqual([{ text: "Asante sana!", tone: "primary" }]);
  });
});
