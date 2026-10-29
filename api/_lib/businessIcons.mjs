// api/_lib/businessIcons.mjs
//
// Businesses that have their own app-icon artwork. Files live in
// public/business-icons/<slug>/ as icon-192.png, icon-512.png (square, opaque,
// used by the manifest) and apple-touch-icon.png (180x180, used by iPhone).
// Any business not listed keeps the shared Trimora icons.
//
// To add one: drop the three PNGs in that folder and add the slug here.
// Imported by both api/pet-manifest.mjs and src/lib/pwaManifest.js.

export var BUSINESS_ICON_SLUGS = ["pawpalske"];

export function hasBusinessIcons(slug) {
  return typeof slug === "string" && BUSINESS_ICON_SLUGS.indexOf(slug) !== -1;
}

export function businessIconPaths(slug) {
  if (!hasBusinessIcons(slug)) return null;
  var base = "/business-icons/" + slug + "/";
  return { icon192: base + "icon-192.png", icon512: base + "icon-512.png", apple: base + "apple-touch-icon.png" };
}
