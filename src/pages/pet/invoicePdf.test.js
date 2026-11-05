import { pdfFileName, canSharePdf, sharePdf, pageLayout } from "./invoicePdf";

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
    expect(await sharePdf(file, "t")).toBe("shared");
    nav({ share: function () { var e = new Error("x"); e.name = "AbortError"; return Promise.reject(e); } });
    expect(await sharePdf(file, "t")).toBe("cancelled");
    nav({ share: function () { return Promise.reject(new Error("x")); } });
    expect(await sharePdf(file, "t")).toBe("failed");
  });
  it("shares only the PDF: no message text, and no title unless one is given", async function () {
    var seen = [];
    nav({ share: function (d) { seen.push(d); return Promise.resolve(); } });
    await sharePdf(file);
    await sharePdf(file, "Subject");
    expect(seen[0]).toEqual({ files: [file] });
    expect(seen[1]).toEqual({ files: [file], title: "Subject" });
  });
});

describe("pageLayout", function () {
  it("puts an ordinary invoice on ONE page at full width, never sliced", function () {
    var L = pageLayout(1588, 1900); // 794px-wide capture at 2x, about 950px tall
    expect(L.mode).toBe("single");
    expect(L.w).toBeCloseTo(194, 5);
    expect(L.h).toBeLessThanOrEqual(281);
  });
  it("shrinks a tall invoice to fit one page instead of breaking it", function () {
    var L = pageLayout(1588, 2600);
    expect(L.mode).toBe("single");
    expect(L.h).toBeCloseTo(281, 5);
    expect(L.w).toBeLessThan(194);
    expect(L.x).toBeGreaterThan(8); // centred
  });
  it("only paginates an extremely long invoice, where shrinking would make the text too small", function () {
    expect(pageLayout(1588, 6000).mode).toBe("pages");
  });
});
