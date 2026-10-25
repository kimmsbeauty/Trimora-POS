// Static guards so the PIN hardening cannot silently regress.
import fs from "fs";
import path from "path";

var SRC = path.join(process.cwd(), "src");
function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  });
  return out;
}
var files = walk(SRC, []);
function read(rel) { return fs.readFileSync(path.join(SRC, rel), "utf8"); }
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(function (l) { return !/^\s*\/\//.test(l); }).join("\n"); }

describe("PIN hardening: client regression guards", function () {
  it("NO client code references the revoked legacy update_salon_pin RPC (migration 093)", function () {
    var offenders = files.filter(function (f) { return stripComments(fs.readFileSync(f, "utf8")).indexOf("update_salon_pin") !== -1; })
      .map(function (f) { return path.relative(SRC, f); });
    expect(offenders).toEqual([]);
  });
  it("pinApi.js has no fallback path: exactly one RPC per exported function", function () {
    var code = stripComments(read("lib/pinApi.js"));
    expect((code.match(/await rpc\(/g) || []).length).toBe(2);
    expect(code).not.toMatch(/legacy|fallback/i);
  });
  it("all four PIN pages go through pinApi", function () {
    expect(read("pages/SalonSettingsPage.jsx")).toMatch(/changeSalonPins/);
    expect(read("pages/auto/AutoSettingsPage.jsx")).toMatch(/changeSalonPins/);
    expect(read("pages/ResetPinPage.jsx")).toMatch(/resetAdminPinViaRecovery/);
    expect(read("pages/ResetPasswordPage.jsx")).toMatch(/resetAdminPinViaRecovery/);
  });
  it("both settings pages require the current admin PIN before saving", function () {
    ["pages/SalonSettingsPage.jsx", "pages/auto/AutoSettingsPage.jsx"].forEach(function (f) {
      var s = read(f);
      expect(s).toMatch(/Enter your current admin PIN to confirm this change/);
      expect(s).toMatch(/Current Admin PIN/);
      expect(s).toMatch(/currentAdminPin: currentAdminPin/);
    });
  });
  it("no client code reads or writes salon_pins through db()/REST", function () {
    files.forEach(function (f) {
      var code = stripComments(fs.readFileSync(f, "utf8"));
      expect(/db\(\s*["'](GET|POST|PATCH|DELETE)["']\s*,\s*["']salon_pins["']/.test(code)).toBe(false);
      expect(/\/rest\/v1\/salon_pins/.test(code)).toBe(false);
    });
  });
  it("the settings pages no longer fire two parallel PIN calls", function () {
    ["pages/SalonSettingsPage.jsx", "pages/auto/AutoSettingsPage.jsx"].forEach(function (f) {
      expect(read(f)).not.toMatch(/rpcUpdates/);
    });
  });
});
