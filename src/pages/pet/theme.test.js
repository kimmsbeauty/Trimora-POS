import * as theme from "./theme";

describe("pet theme", function () {
  var hexKeys = Object.keys(theme).filter(function (k) { return typeof theme[k] === "string" && theme[k].charAt(0) === "#"; });

  it("exports all spec colour tokens as 6-digit hex", function () {
    var required = ["BACKGROUND", "FOREGROUND", "CARD", "PRIMARY", "PRIMARY_FG", "MUTED", "MUTED_FG", "ACCENT", "ACCENT_FG",
      "BORDER", "DESTRUCTIVE", "SUCCESS", "WARNING", "INFO", "VIOLET", "SIDEBAR", "SIDEBAR_FG", "SIDEBAR_MUTED"];
    required.forEach(function (k) { expect(theme[k]).toMatch(/^#[0-9A-F]{6}$/i); });
    expect(hexKeys.length).toBe(required.length);
  });

  it("uses the spec's gold and sidebar values", function () {
    expect(theme.PRIMARY).toBe("#E1AC41");
    expect(theme.SIDEBAR).toBe("#101318");
  });

  it("keeps the product name in one constant, as 'Trimora Pet'", function () {
    expect(theme.PET_NAME).toBe("Trimora Pet");
    expect(theme.PET_MODULE_KEY).toBe("pet");
  });
});
