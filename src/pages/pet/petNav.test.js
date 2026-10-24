import { PET_NAV, visiblePetNav, petInitials } from "./petNav";

describe("pet navigation", function () {
  it("follows the spec order with Checkout directly under Overview", function () {
    expect(PET_NAV.map(function (n) { return n.label; })).toEqual([
      "Overview", "Checkout", "Calendar & Bookings", "Customers", "Pets", "Grooming", "Boarding",
      "Invoices & Payments", "Supplies & Inventory", "Loyalty Programme", "Staff & Permissions", "Reports", "Settings",
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
});
