import fs from "fs";
import path from "path";
import handler from "../../api/pet-manifest.mjs";
import { BASE_MANIFEST, buildPetManifest } from "../../api/_lib/petManifest.mjs";
import { BUSINESS_ICON_SLUGS, businessIconPaths, hasBusinessIcons } from "../../api/_lib/businessIcons.mjs";
import { setPetPwaManifest } from "./pwaManifest";

var ROOT = process.cwd();
function pngInfo(file) {
  var buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { size: buf.readUInt32BE(16) + "x" + buf.readUInt32BE(20), colorType: buf[25] };
}
function fakeRes() {
  var r = { headers: {} };
  r.setHeader = function (k, v) { r.headers[k] = v; };
  r.status = function () { return r; };
  r.send = function (b) { r.body = b; return r; };
  return r;
}

describe("business icon files", function () {
  BUSINESS_ICON_SLUGS.forEach(function (slug) {
    it(slug + " has all three PNGs at the sizes the manifest and iPhone expect", function () {
      var p = businessIconPaths(slug);
      expect(pngInfo(path.join(ROOT, "public", p.icon192)).size).toBe("192x192");
      expect(pngInfo(path.join(ROOT, "public", p.icon512)).size).toBe("512x512");
      expect(pngInfo(path.join(ROOT, "public", p.apple)).size).toBe("180x180");
    });
    it(slug + " icons are opaque (iPhone fills transparency with black)", function () {
      var p = businessIconPaths(slug);
      [p.icon192, p.icon512, p.apple].forEach(function (f) {
        var t = pngInfo(path.join(ROOT, "public", f)).colorType;
        expect([2, 3]).toContain(t); // 2 = RGB, 3 = palette; never 4/6 (alpha)
      });
    });
  });
  it("only lists valid slugs and knows nothing about other businesses", function () {
    BUSINESS_ICON_SLUGS.forEach(function (s) { expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/); });
    expect(hasBusinessIcons("happy-paws")).toBe(false);
    expect(businessIconPaths("happy-paws")).toBeNull();
    expect(businessIconPaths(undefined)).toBeNull();
  });
});

describe("manifest icons", function () {
  it("uses the business's own icons for a listed slug", function () {
    var m = buildPetManifest("Pawpalske", "pawpalske");
    expect(m.icons.map(function (i) { return i.src; })).toEqual([
      "/business-icons/pawpalske/icon-192.png", "/business-icons/pawpalske/icon-512.png",
    ]);
    expect(m.icons.map(function (i) { return i.sizes; })).toEqual(["192x192", "512x512"]);
  });
  it("keeps the shared Trimora icons for everyone else", function () {
    expect(buildPetManifest("Happy Paws", "happy-paws").icons).toEqual(BASE_MANIFEST.icons);
    expect(buildPetManifest("Happy Paws").icons).toEqual(BASE_MANIFEST.icons);
  });
  it("still serves the business icons when the name lookup fails", async function () {
    vi.stubGlobal("fetch", vi.fn(async function () { throw new Error("down"); }));
    var res = fakeRes();
    await handler({ query: { slug: "pawpalske" } }, res);
    var m = JSON.parse(res.body);
    expect(m.name).toBe(BASE_MANIFEST.name);
    expect(m.icons[0].src).toBe("/business-icons/pawpalske/icon-192.png");
    vi.unstubAllGlobals();
  });
});

describe("iPhone home-screen icon", function () {
  beforeEach(function () { document.head.innerHTML = '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />'; });
  it("points apple-touch-icon at the business's own icon", function () {
    setPetPwaManifest({ slug: "pawpalske", name: "Pawpalske" });
    var links = document.querySelectorAll('link[rel="apple-touch-icon"]');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("href")).toBe("/business-icons/pawpalske/apple-touch-icon.png");
  });
  it("leaves the shared icon alone for other businesses", function () {
    setPetPwaManifest({ slug: "happy-paws", name: "Happy Paws" });
    expect(document.querySelector('link[rel="apple-touch-icon"]').getAttribute("href")).toBe("/apple-touch-icon.png");
  });
  it("creates the link if the page has none", function () {
    document.head.innerHTML = "";
    setPetPwaManifest({ slug: "pawpalske", name: "Pawpalske" });
    expect(document.querySelectorAll('link[rel="apple-touch-icon"]').length).toBe(1);
  });
});
