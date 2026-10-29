import fs from "fs";
import path from "path";
import { BACKGROUND, SIDEBAR } from "../pages/pet/theme";

var ROOT = process.cwd();
var manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "public/pet.webmanifest"), "utf8"));
var vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

function pngSize(file) {
  var buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return buf.readUInt32BE(16) + "x" + buf.readUInt32BE(20);
}

describe("public/pet.webmanifest", function () {
  it("has what Chrome and Edge require to offer an install", function () {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    var sizes = manifest.icons.map(function (i) { return i.sizes; });
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it("points only at icon files that exist and really are the size they claim", function () {
    manifest.icons.forEach(function (icon) {
      expect(icon.type).toBe("image/png");
      expect(icon.src.startsWith("/")).toBe(true);
      expect(pngSize(path.join(ROOT, "public", icon.src))).toBe(icon.sizes);
    });
  });

  it("does not claim icons are safe for round masks, which we cannot guarantee", function () {
    manifest.icons.forEach(function (icon) { expect(icon.purpose).toBe("any"); });
  });

  it("gives each business its own start page, scope and install from the one shared file", function () {
    ["happy-paws", "paw-spa", "a1"].forEach(function (slug) {
      // the browser resolves relative URLs against the URL it requested (the rewrite is invisible to it)
      var requested = "https://app.example.com/" + slug + "/pet.webmanifest";
      var start = new URL(manifest.start_url, requested);
      var scope = new URL(manifest.scope, requested);
      expect(start.pathname).toBe("/" + slug + "/pet");
      expect(scope.pathname).toBe("/" + slug + "/");
      expect(start.pathname.startsWith(scope.pathname)).toBe(true); // start_url must be inside scope
      expect(start.origin).toBe("https://app.example.com");
    });
  });

  it("does not lock the screen orientation, so tablets can use landscape", function () {
    expect(manifest.orientation).toBeUndefined();
  });

  it("uses the Pet app's own colours so the splash screen matches the app", function () {
    expect(manifest.background_color.toLowerCase()).toBe(BACKGROUND.toLowerCase());
    expect(manifest.theme_color.toLowerCase()).toBe(SIDEBAR.toLowerCase());
  });
});

describe("vercel.json routing for the manifest", function () {
  var rewrites = vercel.rewrites;
  var catchAllIndex = rewrites.findIndex(function (r) { return r.source === "/(.*)" && r.destination === "/index.html"; });
  var manifestIndex = rewrites.findIndex(function (r) { return r.source === "/:slug/pet.webmanifest"; });

  it("serves the manifest before the SPA catch-all would turn it into index.html", function () {
    expect(catchAllIndex).toBeGreaterThan(-1);
    expect(manifestIndex).toBeGreaterThan(-1);
    expect(manifestIndex).toBeLessThan(catchAllIndex);
    // served by api/pet-manifest.mjs, which puts the business's own name in the manifest
    expect(rewrites[manifestIndex].destination).toBe("/api/pet-manifest?slug=:slug");
    expect(fs.existsSync(path.join(ROOT, "api/pet-manifest.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, "public/pet.webmanifest"))).toBe(true); // generic fallback reference
  });

  it("matches the per-business manifest path and nothing else", function () {
    var re = new RegExp("^" + rewrites[manifestIndex].source.replace(".", "\\.").replace(":slug", "[^/]+") + "$");
    expect(re.test("/happy-paws/pet.webmanifest")).toBe(true);
    expect(re.test("/happy-paws/pet")).toBe(false);
    expect(re.test("/a/b/pet.webmanifest")).toBe(false);
    expect(re.test("/pet.webmanifest")).toBe(false);
  });

  it("keeps the security headers on every path and allows a same-origin manifest", function () {
    var all = vercel.headers.filter(function (h) { return h.source === "/(.*)"; })[0];
    var keys = all.headers.map(function (h) { return h.key; });
    expect(keys).toEqual(expect.arrayContaining(["Content-Security-Policy", "X-Frame-Options", "Strict-Transport-Security"]));
    var csp = all.headers.filter(function (h) { return h.key === "Content-Security-Policy"; })[0].value;
    expect(csp).toMatch(/manifest-src 'self'/);
    expect(csp).toMatch(/script-src 'self'(;| )/); // service worker must stay same-origin
  });
});
