// @vitest-environment node
import fs from "fs";
import path from "path";
import vm from "vm";

var code = fs.readFileSync(path.join(process.cwd(), "public/service-worker.js"), "utf8");
var ORIGIN = "https://app.example.com";

// Runs the real service-worker file against a fake worker environment.
function boot(opts) {
  opts = opts || {};
  var handlers = {};
  var puts = [];
  var cache = { addAll: vi.fn(function () { return Promise.resolve(); }), put: vi.fn(function (req, res) { puts.push(req); return Promise.resolve(); }) };
  var caches = {
    open: vi.fn(function () { return Promise.resolve(cache); }),
    keys: vi.fn(function () { return Promise.resolve(opts.cacheKeys || []); }),
    delete: vi.fn(function () { return Promise.resolve(true); }),
    match: vi.fn(function () { return Promise.resolve(opts.cached); }),
  };
  var fetchMock = vi.fn(opts.fetchImpl || function () { return Promise.resolve({ status: 200, clone: function () { return {}; } }); });
  var self = {
    location: { origin: ORIGIN },
    addEventListener: function (type, fn) { handlers[type] = fn; },
    skipWaiting: vi.fn(), clients: { claim: vi.fn() },
  };
  function FakeResponse(body, init) { this.body = body; this.init = init; }
  vm.runInNewContext(code, { self: self, caches: caches, fetch: fetchMock, URL: URL, Response: FakeResponse, Promise: Promise });
  function request(url, extra) {
    var waits = []; var responded = [];
    var ev = Object.assign({ request: Object.assign({ url: url, method: "GET", mode: "cors" }, extra || {}),
      respondWith: function (p) { responded.push(p); }, waitUntil: function (p) { waits.push(p); } });
    handlers.fetch(ev);
    return { ev: ev, responded: responded };
  }
  return { handlers: handlers, self: self, caches: caches, cache: cache, fetchMock: fetchMock, request: request, puts: puts };
}

describe("public/service-worker.js", function () {
  it("uses a new cache name so the previous version's cache is replaced", async function () {
    var sw = boot({ cacheKeys: ["trimora-pos-shell-v1", "trimora-pos-shell-v2", "something-else"] });
    var waits = [];
    sw.handlers.activate({ waitUntil: function (p) { waits.push(p); } });
    await Promise.all(waits);
    var deleted = sw.caches.delete.mock.calls.map(function (c) { return c[0]; }).sort();
    expect(deleted).toEqual(["something-else", "trimora-pos-shell-v1"]);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it("installs into the v2 cache and takes over without waiting", async function () {
    var sw = boot();
    var waits = [];
    sw.handlers.install({ waitUntil: function (p) { waits.push(p); } });
    await Promise.all(waits);
    expect(sw.caches.open).toHaveBeenCalledWith("trimora-pos-shell-v2");
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("never touches cross-origin requests (Supabase and everything else)", function () {
    var sw = boot();
    var r = sw.request("https://ukoccobbjeomjwjcvrma.supabase.co/rest/v1/pet_pets?select=*");
    expect(r.responded.length).toBe(0);
  });

  it("never touches anything but GET", function () {
    var sw = boot();
    ["POST", "PATCH", "DELETE", "PUT"].forEach(function (m) { expect(sw.request(ORIGIN + "/x", { method: m }).responded.length).toBe(0); });
  });

  it("always lets the network answer for a web app manifest, so a changed manifest is never stale", function () {
    var sw = boot({ cached: { stale: true } });
    var r = sw.request(ORIGIN + "/happy-paws/pet.webmanifest", { mode: "cors" });
    expect(r.responded.length).toBe(0);
    expect(sw.caches.match).not.toHaveBeenCalled();
  });

  it("loads pages network-first and remembers them for offline use", async function () {
    var sw = boot();
    var r = sw.request(ORIGIN + "/happy-paws/pet", { mode: "navigate" });
    expect(r.responded.length).toBe(1);
    await r.responded[0];
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    expect(sw.puts.length).toBe(1);
  });

  it("falls back to the last cached copy of that page when offline, else a plain no-connection page", async function () {
    var offline = function () { return Promise.reject(new Error("offline")); };
    var withCache = boot({ fetchImpl: offline, cached: { fromCache: true } });
    expect(await withCache.request(ORIGIN + "/happy-paws/pet", { mode: "navigate" }).responded[0]).toEqual({ fromCache: true });
    var without = boot({ fetchImpl: offline, cached: undefined });
    var res = await without.request(ORIGIN + "/happy-paws/pet", { mode: "navigate" }).responded[0];
    expect(String(res.body)).toMatch(/No connection/);
  });

  it("serves static assets cache-first, without touching the network when cached", async function () {
    var sw = boot({ cached: { hit: true } });
    var res = await sw.request(ORIGIN + "/assets/index-abc123.js").responded[0];
    expect(res).toEqual({ hit: true });
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });
});
