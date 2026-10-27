import { setPetPwaManifest, setPwaManifest, setLegacyPwaManifest } from "./pwaManifest";

function manifestLinks() { return document.querySelectorAll('link[rel="manifest"]'); }
function appleTitle() { var m = document.querySelector('meta[name="apple-mobile-web-app-title"]'); return m && m.getAttribute("content"); }
function readBlob(blob) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = reject;
    r.readAsText(blob);
  });
}

describe("setPetPwaManifest", function () {
  beforeEach(function () { document.head.innerHTML = ""; document.title = "Trimora POS"; });

  it("points the page at this business's own manifest URL, a real URL and not a blob", function () {
    setPetPwaManifest({ slug: "happy-paws", name: "Happy Paws" });
    expect(manifestLinks().length).toBe(1);
    expect(manifestLinks()[0].getAttribute("href")).toBe("/happy-paws/pet.webmanifest");
    expect(manifestLinks()[0].getAttribute("href")).not.toMatch(/^blob:/);
  });

  it("names the app after the business for iOS and the app switcher", function () {
    setPetPwaManifest({ slug: "happy-paws", name: "Happy Paws" });
    expect(appleTitle()).toBe("Happy Paws");
    expect(document.title).toBe("Happy Paws \u2014 Pet");
  });

  it("replaces an existing manifest link instead of adding a second one", function () {
    var old = document.createElement("link"); old.rel = "manifest"; old.href = "blob:https://x/abc"; document.head.appendChild(old);
    setPetPwaManifest({ slug: "happy-paws", name: "Happy Paws" });
    expect(manifestLinks().length).toBe(1);
    expect(manifestLinks()[0].getAttribute("href")).toBe("/happy-paws/pet.webmanifest");
  });

  it("is safe to call repeatedly and follows a change of business", function () {
    setPetPwaManifest({ slug: "happy-paws", name: "Happy Paws" });
    setPetPwaManifest({ slug: "happy-paws", name: "Happy Paws" });
    expect(manifestLinks().length).toBe(1);
    expect(document.querySelectorAll('meta[name="apple-mobile-web-app-title"]').length).toBe(1);
    setPetPwaManifest({ slug: "paw-spa", name: "Paw Spa" });
    expect(manifestLinks()[0].getAttribute("href")).toBe("/paw-spa/pet.webmanifest");
    expect(appleTitle()).toBe("Paw Spa");
  });

  it("never builds a URL from a slug that is not lowercase kebab-case", function () {
    ["../evil", "Happy Paws", "a/b", "", "-x", "x-", "UPPER", "a?b=1", "a#b", "a%2fb", "a b", "x..y", "x_y"].forEach(function (slug) {
      setPetPwaManifest({ slug: slug, name: "X" });
    });
    setPetPwaManifest({ slug: 42, name: "X" });
    setPetPwaManifest({ name: "No slug" });
    setPetPwaManifest(null);
    setPetPwaManifest(undefined);
    expect(manifestLinks().length).toBe(0);
    expect(document.title).toBe("Trimora POS");
  });

  it("falls back to the product name and caps a very long name", function () {
    setPetPwaManifest({ slug: "x" });
    expect(appleTitle()).toBe("Trimora Pet");
    setPetPwaManifest({ slug: "x", name: "N".repeat(200) });
    expect(appleTitle().length).toBe(60);
  });
});

// The Salon/Auto POS functions are unchanged; these pin their output so a later edit cannot break installs there unnoticed.
describe("existing Salon/Auto manifests (characterisation)", function () {
  var blobs;
  beforeEach(function () {
    document.head.innerHTML = ""; blobs = [];
    URL.createObjectURL = function (b) { blobs.push(b); return "blob:test/" + blobs.length; };
  });

  it("setPwaManifest builds a per-business manifest starting at /:slug/pos", async function () {
    setPwaManifest({ slug: "kimms", name: "Kimms Beauty" });
    expect(manifestLinks()[0].getAttribute("href")).toBe("blob:test/1");
    var m = JSON.parse(await readBlob(blobs[0]));
    expect(m).toMatchObject({ start_url: "/kimms/pos", scope: "/kimms/", display: "standalone", short_name: "Kimms Beauty" });
    expect(m.icons.map(function (i) { return i.sizes; })).toEqual(["192x192", "512x512"]);
  });

  it("setLegacyPwaManifest starts at /pos", async function () {
    setLegacyPwaManifest();
    var m = JSON.parse(await readBlob(blobs[0]));
    expect(m).toMatchObject({ start_url: "/pos", scope: "/", name: "Trimora POS" });
  });
});
