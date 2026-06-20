// src/lib/slugify.js
//
// Adapted from the brief's version for this project's fetch-based db.js
// (not supabase-js). Queries public_salon_directory, not salons directly
// — this needs to work before any salon-creation auth model exists, and
// the base salons table is now read-only-to-authenticated, so an
// anonymous/unauthenticated caller couldn't read it directly anyway.

import { db } from "./db";

export async function generateUniqueSlug(name) {
  var base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  var slug = base;
  var attempt = 1;

  while (true) {
    var existing = await db("GET", "public_salon_directory", null, "?slug=eq." + slug + "&limit=1");
    if (!existing || existing.length === 0) return slug;
    slug = base + "-" + attempt;
    attempt++;
  }
}
