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
  it("gives PawPals Kenya its invoice colours on a light page, with no settings colours needed", function () {
    var b = publicBrand({ name: "PawPals Kenya", slug: "pawpals-ke" });
    expect(b.primary).toBe("#991B96");
    expect(b.bg).toBe("#F4F6FD");
    expect(b.onBg).toBe("#1B1F5E");
    expect(b.accentOnBg).toBe("#1B1F5E");
    expect(b.onPrimary).toBe("#FFFFFF");
    expect(b.branded).toBe(true);
  });
  it("lets colours saved in Settings win over the preset", function () {
    var b = publicBrand({ name: "PawPals Kenya", primary_color: "#112233", secondary_color: "#F5F5F5" });
    expect(b.primary).toBe("#112233");
    expect(b.bg).toBe("#F5F5F5");
  });
  it("leaves other businesses on the standard look", function () {
    expect(publicBrand({ name: "Happy Tails", slug: "happy-tails" }).branded).toBe(false);
  });
});
