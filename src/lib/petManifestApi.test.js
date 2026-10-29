import fs from "fs";
import path from "path";
import handler from "../../api/pet-manifest.mjs";
import { BASE_MANIFEST, buildPetManifest, cleanName, fetchBusinessName, isValidSlug } from "../../api/_lib/petManifest.mjs";

var ROOT = process.cwd();
var staticManifest = JSON.parse(fs.readFileSync(path.join(ROOT, "public/pet.webmanifest"), "utf8"));

function okFetch(rows) {
  return vi.fn(async function () { return { ok: true, json: async function () { return rows; } }; });
}
function fakeRes() {
  var r = { headers: {}, code: null, body: null };
  r.setHeader = function (k, v) { r.headers[k] = v; };
  r.status = function (c) { r.code = c; return r; };
  r.send = function (b) { r.body = b; return r; };
  return r;
}

describe("BASE_MANIFEST", function () {
  it("is the same as public/pet.webmanifest, so the fallback never drifts from the static file", function () {
    expect(BASE_MANIFEST).toEqual(staticManifest);
  });
});

describe("buildPetManifest", function () {
  it("labels the app with the business name and changes nothing else", function () {
    var m = buildPetManifest("Happy Paws");
    expect(m.name).toBe("Happy Paws");
    expect(m.short_name).toBe("Happy Paws");
    expect(Object.assign({}, m, { name: BASE_MANIFEST.name, short_name: BASE_MANIFEST.short_name })).toEqual(BASE_MANIFEST);
  });
  it("keeps relative start_url and scope so each business keeps its own install", function () {
    var m = buildPetManifest("Happy Paws");
    expect(new URL(m.start_url, "https://app.example.com/happy-paws/pet.webmanifest").pathname).toBe("/happy-paws/pet");
    expect(new URL(m.scope, "https://app.example.com/happy-paws/pet.webmanifest").pathname).toBe("/happy-paws/");
  });
  it("shortens only the launcher label for long names", function () {
    var m = buildPetManifest("The Very Long Named Pet Grooming and Boarding Centre");
    expect(m.short_name.length).toBeLessThanOrEqual(24);
    expect(m.name.startsWith("The Very Long Named")).toBe(true);
  });
  it("falls back to the generic manifest for an empty or non-string name", function () {
    expect(buildPetManifest("")).toEqual(BASE_MANIFEST);
    expect(buildPetManifest("  \n\t ")).toEqual(BASE_MANIFEST);
    expect(buildPetManifest(null)).toEqual(BASE_MANIFEST);
  });
});

describe("cleanName / isValidSlug", function () {
  it("strips control characters and collapses whitespace", function () {
    expect(cleanName("  Happy\u0000   Paws\n ")).toBe("Happy Paws");
  });
  it("accepts only lowercase kebab-case slugs", function () {
    expect(isValidSlug("happy-paws")).toBe(true);
    expect(isValidSlug("a1")).toBe(true);
    ["", "Happy-Paws", "a/b", "a b", "-a", "a-", "a--b", "x&slug=y", null, undefined, 5].forEach(function (s) {
      expect(isValidSlug(s)).toBe(false);
    });
  });
});

describe("fetchBusinessName", function () {
  it("reads the name from the public directory view for that slug only", async function () {
    var f = okFetch([{ name: "Happy Paws" }]);
    expect(await fetchBusinessName("happy-paws", {}, f)).toBe("Happy Paws");
    var url = f.mock.calls[0][0];
    expect(url).toContain("/rest/v1/public_salon_directory?");
    expect(url).toContain("slug=eq.happy-paws");
    expect(url).toContain("select=name");
  });
  it("uses the Supabase settings from the environment when present", async function () {
    var f = okFetch([{ name: "X" }]);
    await fetchBusinessName("x", { VITE_SUPABASE_URL: "https://example.supabase.co/", VITE_SUPABASE_KEY: "k" }, f);
    expect(f.mock.calls[0][0].startsWith("https://example.supabase.co/rest/v1/")).toBe(true);
    expect(f.mock.calls[0][1].headers.apikey).toBe("k");
  });
  it("never calls out for an invalid slug", async function () {
    var f = okFetch([{ name: "Nope" }]);
    expect(await fetchBusinessName("../etc", {}, f)).toBe("");
    expect(f).not.toHaveBeenCalled();
  });
  it("returns an empty name when nothing matches, the request fails, or it throws", async function () {
    expect(await fetchBusinessName("nobody", {}, okFetch([]))).toBe("");
    expect(await fetchBusinessName("x", {}, vi.fn(async function () { return { ok: false }; }))).toBe("");
    expect(await fetchBusinessName("x", {}, vi.fn(async function () { throw new Error("down"); }))).toBe("");
  });
});

describe("api/pet-manifest handler", function () {
  afterEach(function () { vi.unstubAllGlobals(); });

  it("serves the business's name with the manifest content type and a 1 hour cache", async function () {
    vi.stubGlobal("fetch", okFetch([{ name: "Happy Paws" }]));
    var res = fakeRes();
    await handler({ query: { slug: "happy-paws" } }, res);
    expect(res.code).toBe(200);
    expect(res.headers["Content-Type"]).toMatch(/^application\/manifest\+json/);
    expect(res.headers["Cache-Control"]).toBe("public, max-age=3600");
    expect(JSON.parse(res.body).name).toBe("Happy Paws");
  });
  it("serves the generic manifest, cached only briefly, when the business can't be found", async function () {
    vi.stubGlobal("fetch", okFetch([]));
    var res = fakeRes();
    await handler({ query: { slug: "nobody" } }, res);
    expect(res.code).toBe(200);
    expect(JSON.parse(res.body)).toEqual(BASE_MANIFEST);
    expect(res.headers["Cache-Control"]).toBe("public, max-age=60");
  });
  it("serves the generic manifest for a missing or malformed slug without calling Supabase", async function () {
    var f = okFetch([{ name: "Nope" }]);
    vi.stubGlobal("fetch", f);
    var res = fakeRes();
    await handler({ query: {} }, res);
    await handler({ query: { slug: "A B" } }, fakeRes());
    expect(JSON.parse(res.body)).toEqual(BASE_MANIFEST);
    expect(f).not.toHaveBeenCalled();
  });
});
