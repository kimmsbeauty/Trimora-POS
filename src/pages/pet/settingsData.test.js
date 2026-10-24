import { isValidLogoUrl, validateSettings, settingsRow } from "./settingsData";

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
