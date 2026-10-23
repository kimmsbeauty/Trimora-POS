import { moduleLabels } from "./moduleLabels";

describe("moduleLabels", function () {
  it("keeps the salon wording exactly as the dashboard hardcoded it before Pet existed", function () {
    var L = moduleLabels(null);
    expect(L.manualTitle).toBe("🏪 Manual Onboarding");
    expect(L.manualBlurb).toBe("Create a salon directly without an invite link.");
    expect(L.inviteTitle).toBe("🔗 Generate Invite Link");
    expect(L.inviteBlurb).toBe("One-time link, expires in 7 days.");
    expect(L.nameLabel).toBe("Salon Name");
    expect(L.namePlaceholder).toBe("e.g. Grace Beauty Studio");
    expect(L.manualEmailPlaceholder).toBe("owner@salon.com");
    expect(L.inviteEmailPlaceholder).toBe("salon@example.com");
    expect(L.createBtn).toBe("🏪 Create Salon");
    expect(L.creatingBtn).toBe("Creating salon...");
    expect(L.failurePrefix + L.path).toBe("Salon/pos");
    expect(L.successLabel).toBe("POS");
  });

  it("keeps the Auto wording exactly as before", function () {
    var L = moduleLabels("auto");
    expect(L.manualTitle).toBe("🚗 Onboard Car Wash");
    expect(L.manualBlurb).toBe("Create a car wash with Auto enabled from the start, without an invite link.");
    expect(L.inviteTitle).toBe("🚗 Invite Car Wash");
    expect(L.inviteBlurb).toBe("One-time link, Auto enabled automatically on completion. Expires in 7 days.");
    expect(L.nameLabel).toBe("Car Wash Name");
    expect(L.namePlaceholder).toBe("e.g. High Point Carwash");
    expect(L.manualEmailPlaceholder).toBe("owner@example.com");
    expect(L.inviteEmailPlaceholder).toBe("owner@example.com");
    expect(L.createBtn).toBe("🚗 Create Car Wash");
    expect(L.creatingBtn).toBe("Creating car wash...");
    expect(L.failurePrefix).toBe("Car wash");
    expect(L.successLabel + ": /x" + L.path).toBe("Auto: /x/auto");
  });

  it("gives Pet its own wording and /pet path, using the single brand constant", function () {
    var L = moduleLabels("pet");
    expect(L.manualTitle).toBe("🐾 Onboard Pet Business");
    expect(L.nameLabel).toBe("Pet Business Name");
    expect(L.path).toBe("/pet");
    expect(L.successLabel).toBe("Trimora Pet");
    expect(L.manualBlurb).toContain("Trimora Pet");
    expect(L.inviteBlurb).toContain("Trimora Pet");
  });

  it("falls back to salon for unknown keys", function () {
    expect(moduleLabels("something-else")).toBe(moduleLabels(null));
    expect(moduleLabels(undefined)).toBe(moduleLabels(null));
  });
});
