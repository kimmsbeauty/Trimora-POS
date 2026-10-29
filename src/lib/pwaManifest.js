import { businessIconPaths } from "../../api/_lib/businessIcons.mjs";
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

// Trimora Pet. Unlike the two functions above, the manifest is NOT a blob: URL. Chrome on
// Android only offers a real "Install app" (WebAPK) for a manifest served from a normal
// https URL, so Pet points at a static file, public/pet.webmanifest, served through a
// per-business path (see vercel.json):
//
//     /happy-paws/pet.webmanifest  ->  public/pet.webmanifest
//
// The file uses RELATIVE urls ("start_url": "pet", "scope": "./"). A browser resolves them
// against the URL it asked for (the rewrite is invisible to it), so each business gets its
// own start page (/happy-paws/pet), its own scope (/happy-paws/) and therefore its own
// install, from one shared file and with no server code.
//
// The business name can't be in a static file, so on Android the app is labelled
// "Trimora Pet". iOS asks the user to confirm a name when adding to the home screen, and
// we pre-fill it with the business name below.
export function setPetPwaManifest(salon) {
  if (typeof document === "undefined") return;
  if (!salon || typeof salon.slug !== "string") return;
  // slugs are lowercase kebab-case; anything else must never be put into a URL
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(salon.slug)) return;

  var href = "/" + salon.slug + "/pet.webmanifest";
  var link = document.querySelector('link[rel="manifest"]');
  if (link) {
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  } else {
    link = document.createElement("link");
    link.rel = "manifest";
    link.href = href;
    document.head.appendChild(link);
  }

  var label = (salon.name || "Trimora Pet").toString().slice(0, 60);
  var apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (apple) {
    apple.setAttribute("content", label);
  } else {
    apple = document.createElement("meta");
    apple.setAttribute("name", "apple-mobile-web-app-title");
    apple.setAttribute("content", label);
    document.head.appendChild(apple);
  }
  // iPhone takes the home-screen icon from this link at "Add to Home Screen", not from the manifest.
  var icons = businessIconPaths(salon.slug);
  if (icons) {
    var touch = document.querySelector('link[rel="apple-touch-icon"]');
    if (!touch) {
      touch = document.createElement("link");
      touch.rel = "apple-touch-icon";
      document.head.appendChild(touch);
    }
    touch.setAttribute("href", icons.apple);
  }
  document.title = label + " \u2014 Pet";
}
