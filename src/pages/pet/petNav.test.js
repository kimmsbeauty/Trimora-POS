import { PET_NAV, PET_NAV_SECTIONS, visiblePetNav, petInitials, groupPetNav } from "./petNav";

describe("pet navigation", function () {
  it("follows the spec order with Checkout directly under Overview", function () {
    expect(PET_NAV.map(function (n) { return n.label; })).toEqual([
      "Overview", "Checkout", "Calendar & Bookings", "Online Requests", "Customers", "Pets", "Grooming", "Boarding", "Daycare",
      "Invoices & Payments", "Supplies & Inventory", "Loyalty Programme", "Reminders", "Staff & Permissions", "Reports", "Settings",
    ]);
  });

  it("has unique keys", function () {
    var keys = PET_NAV.map(function (n) { return n.key; });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("hides admin-only tabs from staff and shows everything to admin", function () {
    var staff = visiblePetNav(false).map(function (n) { return n.key; });
    expect(staff).not.toContain("staff");
    expect(staff).not.toContain("reports");
    expect(staff).not.toContain("settings");
    expect(staff).toContain("checkout");
    expect(visiblePetNav(true).length).toBe(PET_NAV.length);
  });

  it("builds initials safely", function () {
    expect(petInitials("Happy Paws Nairobi")).toBe("HN");
    expect(petInitials("Paws")).toBe("P");
    expect(petInitials("")).toBe("?");
    expect(petInitials(null)).toBe("?");
  });

  it("puts every item in a known section, in the agreed groups", function () {
    PET_NAV.forEach(function (n) { expect(PET_NAV_SECTIONS[n.section]).toBeTruthy(); });
    var groups = groupPetNav(PET_NAV);
    expect(groups.map(function (g) { return g.label; })).toEqual(["Workspace", "Customers & Services", "Business Operations", "Administration"]);
    expect(groups.map(function (g) { return g.items.map(function (n) { return n.label; }); })).toEqual([
      ["Overview", "Checkout", "Calendar & Bookings", "Online Requests"],
      ["Customers", "Pets", "Grooming", "Boarding", "Daycare"],
      ["Invoices & Payments", "Supplies & Inventory", "Loyalty Programme", "Reminders"],
      ["Staff & Permissions", "Reports", "Settings"],
    ]);
  });

  it("drops the Administration group for staff, so there is no empty heading", function () {
    var labels = groupPetNav(visiblePetNav(false)).map(function (g) { return g.label; });
    expect(labels).toEqual(["Workspace", "Customers & Services", "Business Operations"]);
  });

  it("keeps groups together, and tolerates items with no section", function () {
    var g = groupPetNav([{ key: "a", section: "workspace" }, { key: "b" }, { key: "c" }]);
    expect(g.length).toBe(2);
    expect(g[1].label).toBeNull();
    expect(g[1].items.length).toBe(2);
    expect(groupPetNav(null)).toEqual([]);
  });
});
