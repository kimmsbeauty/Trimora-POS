import { publicBrand, cleanHex, readableOn } from "./publicBrand";
import { BACKGROUND, PRIMARY } from "./theme";

describe("publicBrand", function () {
  it("uses the business colours", function () {
    var b = publicBrand({ primary_color: "#C9A84C", secondary_color: "#1A1A1A" });
    expect(b.primary).toBe("#C9A84C");
    expect(b.bg).toBe("#1A1A1A");
    expect(b.onBg).toBe("#FFFFFF");
    expect(b.accentOnBg).toBe("#C9A84C");
    expect(b.onPrimary).toBe("#1B1E24");
    expect(b.branded).toBe(true);
  });
  it("falls back to the standard look when colours are missing or invalid", function () {
    var b = publicBrand({ primary_color: "gold", secondary_color: "url(x)" });
    expect(b.primary).toBe(PRIMARY);
    expect(b.bg).toBe(BACKGROUND);
    expect(b.branded).toBe(false);
    expect(publicBrand(null).bg).toBe(BACKGROUND);
  });
  it("keeps text readable on a light brand background", function () {
    var b = publicBrand({ primary_color: "#112233", secondary_color: "#F5F5F5" });
    expect(b.onBg).not.toBe("#FFFFFF");
    expect(b.onPrimary).toBe("#FFFFFF");
  });
  it("accepts 3-digit hex and rejects anything else", function () {
    expect(cleanHex("#abc")).toBe("#AABBCC");
    expect(cleanHex("javascript:1")).toBe(null);
    expect(readableOn("#000000")).toBe("#FFFFFF");
  });
});
