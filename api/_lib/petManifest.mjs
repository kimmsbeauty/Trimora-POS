// api/_lib/petManifest.mjs
//
// Pure helpers for api/pet-manifest.mjs (the underscore keeps Vercel from
// exposing this folder as routes). Kept free of req/res so they are unit-tested
// in src/lib/petManifestApi.test.js.

// Must match public/pet.webmanifest apart from name / short_name; a test
// enforces that, so the static file stays the single reference.
export const BASE_MANIFEST = {
  name: "Trimora Pet",
  short_name: "Trimora Pet",
  description: "Grooming, boarding, checkout and reports for your pet business.",
  lang: "en",
  start_url: "pet",
  scope: "./",
  display: "standalone",
  background_color: "#FAF9F6",
  theme_color: "#101318",
  categories: ["business", "productivity"],
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ],
};

// Same rule as setPetPwaManifest() in src/lib/pwaManifest.js: lowercase kebab-case only.
export function isValidSlug(slug) {
  return typeof slug === "string" && slug.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

// Business names are user-entered: drop control characters, collapse whitespace, cap length.
export function cleanName(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function buildPetManifest(rawName) {
  var name = cleanName(rawName);
  if (!name) return Object.assign({}, BASE_MANIFEST);
  return Object.assign({}, BASE_MANIFEST, { name: name, short_name: name.slice(0, 24).trim() });
}

// Reads the business name from the anon-readable public_salon_directory view
// (the same one the app uses to resolve /:slug). Returns "" on any problem, so
// the caller falls back to the generic manifest instead of failing the install.
export async function fetchBusinessName(slug, env, fetchImpl) {
  if (!isValidSlug(slug)) return "";
  var base = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "https://ukoccobbjeomjwjcvrma.supabase.co").replace(/\/+$/, "");
  var key = env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrb2Njb2JiamVvbWp3amN2cm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjg4MzAsImV4cCI6MjA5NjcwNDgzMH0.a-nDh04ujZQ8w9lwu9rkHuge9xGRbLRfV7vD3zRCAqg";
  var url = base + "/rest/v1/public_salon_directory?select=name&slug=eq." + encodeURIComponent(slug) + "&limit=1";
  try {
    var res = await (fetchImpl || fetch)(url, {
      headers: { apikey: key, Authorization: "Bearer " + key, Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return "";
    var rows = await res.json();
    return Array.isArray(rows) && rows[0] ? cleanName(rows[0].name) : "";
  } catch (e) {
    return "";
  }
}
