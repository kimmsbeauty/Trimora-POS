import { pdfFileName, canSharePdf, sharePdf } from "./invoicePdf";

describe("invoicePdf helpers", function () {
  var realNav;
  beforeEach(function () { realNav = Object.getOwnPropertyDescriptor(globalThis, "navigator"); });
  afterEach(function () { Object.defineProperty(globalThis, "navigator", realNav); });
  function nav(obj) { Object.defineProperty(globalThis, "navigator", { value: obj, configurable: true }); }
  var file = new File(["x"], "a.pdf", { type: "application/pdf" });

  it("names the file after the invoice, safely", function () {
    expect(pdfFileName({ invoice_number: "PPK-000124" })).toBe("PPK-000124.pdf");
    expect(pdfFileName({ invoice_number: "A/B C" })).toBe("A-B-C.pdf");
    expect(pdfFileName(null)).toBe("invoice.pdf");
  });
  it("can share only when the browser supports sharing files", function () {
    nav({ share: function () {}, canShare: function () { return true; } });
    expect(canSharePdf(file)).toBe(true);
    nav({ share: function () {}, canShare: function () { return false; } });
    expect(canSharePdf(file)).toBe(false);
    nav({});
    expect(canSharePdf(file)).toBe(false);
  });
  it("reports shared, cancelled and failed", async function () {
    nav({ share: function () { return Promise.resolve(); } });
    expect(await sharePdf(file, "t", "x")).toBe("shared");
    nav({ share: function () { var e = new Error("x"); e.name = "AbortError"; return Promise.reject(e); } });
    expect(await sharePdf(file, "t", "x")).toBe("cancelled");
    nav({ share: function () { return Promise.reject(new Error("x")); } });
    expect(await sharePdf(file, "t", "x")).toBe("failed");
  });
});
