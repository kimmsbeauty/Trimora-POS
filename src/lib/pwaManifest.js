// src/lib/pwaManifest.js
//
// Trimora POS is multi-tenant — every salon lives at /:slug/pos. A static
// manifest.json can't express a per-salon start_url, so instead we build
// the manifest in-browser and inject it as a Blob URL <link rel="manifest">
// once we know which salon is active. This means:
//
//   Kimms installs from /kimms-beauty-parlour/pos
//     → "Add to Home Screen" → icon launches straight back into
//       /kimms-beauty-parlour/pos, not the generic /pos route.
//
//   Urban Streets Beauty installs from /urban-streets-beauty/pos
//     → same thing, scoped to their own salon.
//
// Each salon effectively gets their own home-screen "app" that always
// opens directly to their own POS, even though it's all one shared
// codebase and one shared deployment.
//
// Call setPwaManifest(salon) once SalonGate has resolved the salon —
// safe to call multiple times (it just replaces the <link> each time).

export function setPwaManifest(salon) {
  if (typeof document === "undefined") return;
  if (!salon || !salon.slug) return;

  var manifest = {
    short_name: salon.name || "Trimora POS",
    name: (salon.name || "Trimora POS") + " — Trimora POS",
    icons: [
      { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    start_url: "/" + salon.slug + "/pos",
    scope: "/" + salon.slug + "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#0A0A0A",
    background_color: "#0A0A0A",
  };

  var blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
  var url = URL.createObjectURL(blob);

  var existing = document.querySelector('link[rel="manifest"]');
  if (existing) {
    existing.setAttribute("href", url);
  } else {
    var link = document.createElement("link");
    link.rel = "manifest";
    link.href = url;
    document.head.appendChild(link);
  }

  // Also keep the document title in sync — nicer when the app is
  // installed and shown in the OS app switcher / recents.
  document.title = (salon.name || "Trimora POS") + " — POS";
}

// Legacy unprefixed /pos route (Kimms-only by original design) gets a
// fixed manifest with no dynamic slug, since there is no slug to read.
export function setLegacyPwaManifest() {
  if (typeof document === "undefined") return;

  var manifest = {
    short_name: "Trimora POS",
    name: "Trimora POS",
    icons: [
      { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#0A0A0A",
    background_color: "#0A0A0A",
  };

  var blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
  var url = URL.createObjectURL(blob);

  var existing = document.querySelector('link[rel="manifest"]');
  if (existing) {
    existing.setAttribute("href", url);
  } else {
    var link = document.createElement("link");
    link.rel = "manifest";
    link.href = url;
    document.head.appendChild(link);
  }
}
