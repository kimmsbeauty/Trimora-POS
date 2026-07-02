// src/lib/colorUtils.test.js

import { lighten, darken } from "./colorUtils";

describe("lighten", () => {
  it("returns a valid 7-character hex color", () => {
    expect(lighten("#C9A84C", 14)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("passing through falsy input doesn't throw (guards missing salon color)", () => {
    expect(lighten(null, 10)).toBeNull();
    expect(lighten(undefined, 10)).toBeUndefined();
    expect(lighten("", 10)).toBe("");
  });

  it("lightening by 0 returns effectively the same color", () => {
    expect(lighten("#C9A84C", 0)).toBe("#C9A84C".toLowerCase());
  });

  it("handles 3-character shorthand hex", () => {
    expect(lighten("#fff", 0)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("never exceeds pure white even with an extreme amount", () => {
    // lightness is clamped to 1 (100%) internally -- extreme input
    // shouldn't overflow into an invalid/out-of-range color
    expect(lighten("#C9A84C", 1000)).toBe("#ffffff");
  });
});

describe("darken", () => {
  it("returns a valid 7-character hex color", () => {
    expect(darken("#C9A84C", 18)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("never goes below pure black even with an extreme amount", () => {
    expect(darken("#C9A84C", 1000)).toBe("#000000");
  });

  it("passing through falsy input doesn't throw", () => {
    expect(darken(null, 10)).toBeNull();
  });
});

describe("lighten/darken relationship", () => {
  it("lightening then darkening by the same amount returns close to the original", () => {
    // Not exact due to RGB<->HSL rounding, but should be very close --
    // this guards against one of the two functions silently applying
    // the shift in the wrong direction.
    var original = "#C9A84C";
    var roundTripped = darken(lighten(original, 10), 10);
    var origRgb = parseInt(original.replace("#", ""), 16);
    var rtRgb = parseInt(roundTripped.replace("#", ""), 16);
    expect(Math.abs(origRgb - rtRgb)).toBeLessThan(0x0a0a0a); // small tolerance across all 3 channels
  });
});
