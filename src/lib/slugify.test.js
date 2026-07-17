// src/lib/slugify.test.js
//
// Slugs are how a salon is identified in its URL (/:slug/pos,
// /:slug/booking) and are the basis the app's tenant-isolation checks
// build on -- a malformed or colliding slug is a real, not cosmetic,
// bug. Mocks db() so this runs as a pure unit test with no network.

import { generateUniqueSlug } from "./slugify";
import { db } from "./db";

vi.mock("./db", () => ({ db: vi.fn() }));

describe("generateUniqueSlug", () => {
  beforeEach(() => {
    db.mockReset();
  });

  it("lowercases the name", async () => {
    db.mockResolvedValueOnce([]); // no existing salon with this slug
    var slug = await generateUniqueSlug("Kimm's Beauty Parlour");
    expect(slug).toBe(slug.toLowerCase());
  });

  it("replaces spaces with hyphens", async () => {
    db.mockResolvedValueOnce([]);
    var slug = await generateUniqueSlug("Golden Glow Salon");
    expect(slug).toBe("golden-glow-salon");
  });

  it("strips apostrophes and other punctuation entirely (not replaced with hyphens)", async () => {
    db.mockResolvedValueOnce([]);
    var slug = await generateUniqueSlug("Kimm's Beauty Parlour");
    expect(slug).toBe("kimms-beauty-parlour");
    expect(slug).not.toContain("'");
  });

  it("collapses multiple consecutive spaces into a single hyphen", async () => {
    db.mockResolvedValueOnce([]);
    var slug = await generateUniqueSlug("Golden   Glow");
    expect(slug).toBe("golden-glow");
  });

  it("appends -1 when the base slug is already taken", async () => {
    db
      .mockResolvedValueOnce([{ slug: "golden-glow" }]) // "golden-glow" taken
      .mockResolvedValueOnce([]);                        // "golden-glow-1" free
    var slug = await generateUniqueSlug("Golden Glow");
    expect(slug).toBe("golden-glow-1");
  });

  it("keeps incrementing until it finds a free slug (not just one retry)", async () => {
    db
      .mockResolvedValueOnce([{ slug: "golden-glow" }])
      .mockResolvedValueOnce([{ slug: "golden-glow-1" }])
      .mockResolvedValueOnce([{ slug: "golden-glow-2" }])
      .mockResolvedValueOnce([]); // "golden-glow-3" finally free
    var slug = await generateUniqueSlug("Golden Glow");
    expect(slug).toBe("golden-glow-3");
    expect(db).toHaveBeenCalledTimes(4);
  });

  it("treats a null/failed lookup the same as 'not taken' (db() fails soft)", async () => {
    // db.js returns null on a failed request rather than throwing --
    // slugify must not crash or infinite-loop if that happens.
    db.mockResolvedValueOnce(null);
    var slug = await generateUniqueSlug("Test Salon");
    expect(slug).toBe("test-salon");
  });
});
