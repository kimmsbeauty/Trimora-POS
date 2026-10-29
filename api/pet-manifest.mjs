// api/pet-manifest.mjs
//
// Serves /:slug/pet.webmanifest (see the rewrite in vercel.json) with the
// business's own name, so the installed Trimora Pet app is labelled with the
// business instead of "Trimora Pet". It is still a real https manifest, which
// is what Chrome on Android needs to offer a proper install.
//
// start_url / scope stay RELATIVE ("pet", "./"): the browser resolves them
// against the URL it requested (/<slug>/pet.webmanifest), so each business
// keeps its own start page, scope and install.
//
// Unknown slug, lookup failure or timeout -> the generic manifest, never an error.

import { buildPetManifest, fetchBusinessName, isValidSlug } from "./_lib/petManifest.mjs";

export default async function handler(req, res) {
  var slug = req.query && req.query.slug;
  if (Array.isArray(slug)) slug = slug[0];

  var name = isValidSlug(slug) ? await fetchBusinessName(slug, process.env) : "";
  // Icons depend only on the (validated) slug, so a business keeps its own icon even if the name lookup fails.
  var manifest = buildPetManifest(name, isValidSlug(slug) ? slug : "");

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  // Cache a real name for an hour (as before); a fallback only briefly so a blip doesn't stick.
  res.setHeader("Cache-Control", name ? "public, max-age=3600" : "public, max-age=60");
  res.status(200).send(JSON.stringify(manifest));
}
