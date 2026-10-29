import { isValidLogoUrl, validateSettings, settingsRow, derivePrefix, normalizePrefix, invoiceNumberPreview, validatePhone, validatePhones, phonesPayload } from "./settingsData";

var ok = { logo_url: "https://example.com/logo.png", tagline: "", contact_phone: "", tax_enabled: false, tax_rate: "16", tax_pin: "", receipt_footer_message: "" };

describe("logo link", function () {
  it("accepts https links and empty", function () {
    expect(isValidLogoUrl("https://example.com/a.png")).toBe(true);
    expect(isValidLogoUrl("")).toBe(true);
  });
  it("rejects http, javascript:, data: and spaces", function () {
    expect(isValidLogoUrl("http://example.com/a.png")).toBe(false);
    expect(isValidLogoUrl("javascript:alert(1)")).toBe(false);
    expect(isValidLogoUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isValidLogoUrl("https://exa mple.com")).toBe(false);
    expect(isValidLogoUrl("https://e.com/" + "a".repeat(500))).toBe(false);
  });
});

describe("validateSettings", function () {
  it("accepts valid settings", function () { expect(validateSettings(ok)).toBe(""); });
  it("checks the logo, tax rate and phone", function () {
    expect(validateSettings(Object.assign({}, ok, { logo_url: "ftp://x" }))).toMatch(/logo/);
    expect(validateSettings(Object.assign({}, ok, { tax_enabled: true, tax_rate: "150" }))).toMatch(/tax rate/);
    expect(validateSettings(Object.assign({}, ok, { tax_enabled: true, tax_rate: "" }))).toMatch(/tax rate/);
    expect(validateSettings(Object.assign({}, ok, { tax_enabled: true, tax_rate: "16.5" }))).toMatch(/tax rate/);
    expect(validateSettings(Object.assign({}, ok, { contact_phone: "123" }))).toMatch(/phone/);
  });
  it("ignores the tax rate when tax is off", function () {
    expect(validateSettings(Object.assign({}, ok, { tax_enabled: false, tax_rate: "999" }))).toBe("");
  });
});

describe("settingsRow", function () {
  it("nulls blanks and uppercases the PIN", function () {
    var r = settingsRow(Object.assign({}, ok, { logo_url: " ", tax_enabled: true, tax_rate: "16", tax_pin: " p051234567a " }));
    expect(r.logo_url).toBeNull(); expect(r.tax_pin).toBe("P051234567A"); expect(r.tax_rate).toBe(16); expect(r.tax_enabled).toBe(true);
  });
});

describe("invoice prefix", function () {
  it("is derived from the full business name, letters and digits only", function () {
    expect(derivePrefix("Pawpalske")).toBe("PAWPALSKE");
    expect(derivePrefix("Paws & Co. 2")).toBe("PAWSCO2");
    expect(derivePrefix("")).toBe("");
    expect(derivePrefix("a".repeat(40)).length).toBe(20);
  });
  it("normalizes what the owner types and previews the next number", function () {
    expect(normalizePrefix(" paw-pals! ")).toBe("PAWPALS");
    expect(invoiceNumberPreview("pawpals", "Pawpalske")).toBe("PAWPALS-INV-0001");
    expect(invoiceNumberPreview("", "Pawpalske")).toBe("PAWPALSKE-INV-0001");
    expect(invoiceNumberPreview("", "")).toBe("INV-0001");
  });
  it("saves the prefix as null when blank", function () {
    expect(settingsRow(Object.assign({}, ok, { invoice_prefix: "" })).invoice_prefix).toBeNull();
    expect(settingsRow(Object.assign({}, ok, { invoice_prefix: "pawpals" })).invoice_prefix).toBe("PAWPALS");
  });
  it("rejects a prefix with symbols", function () {
    expect(validateSettings(Object.assign({}, ok, { invoice_prefix: "PAW-PALS" }))).toMatch(/prefix/);
    expect(validateSettings(Object.assign({}, ok, { invoice_prefix: "PAWPALS" }))).toBe("");
  });
});

describe("business phone numbers", function () {
  it("accepts normal Kenyan formats and rejects junk", function () {
    expect(validatePhone("0712 345 678")).toBe("");
    expect(validatePhone("+254 712 345 678")).toBe("");
    expect(validatePhone("12345")).not.toBe("");
    expect(validatePhone("call me maybe")).not.toBe("");
  });
  it("has no limit on how many numbers there can be", function () {
    var many = [];
    for (var i = 0; i < 30; i++) many.push({ phone: "07" + String(10000000 + i), show_on_invoice: true });
    expect(validatePhones(many)).toBe("");
  });
  it("refuses the same number twice, however it is written", function () {
    expect(validatePhones([{ phone: "0712 345 678" }, { phone: "0712-345-678" }])).toMatch(/twice/);
  });
  it("is checked as part of the settings", function () {
    expect(validateSettings(Object.assign({}, ok, { phones: [{ phone: "12", show_on_invoice: true }] }))).toMatch(/valid phone/);
  });
  it("builds the payload with the show-on-invoice switch", function () {
    expect(phonesPayload([{ phone: " 0712345678 ", show_on_invoice: false }, { phone: "0722345678" }]))
      .toEqual([{ phone: "0712345678", show_on_invoice: false }, { phone: "0722345678", show_on_invoice: true }]);
  });
});
