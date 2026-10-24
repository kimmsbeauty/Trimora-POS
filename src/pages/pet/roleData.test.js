import {
  PERMISSIONS, PRESETS, validateRole, roleRow, isDuplicateRole, missingPresets,
  assignmentByStaff, countAssigned, permissionSummary, sortRoles,
} from "./roleData";

describe("roleData", function () {
  it("offers the four suggested presets with only known permission keys", function () {
    expect(PRESETS.map(function (p) { return p.name; })).toEqual(["Owner/Admin", "Manager", "Groomer", "Receptionist"]);
    var keys = PERMISSIONS.map(function (p) { return p.key; }).sort();
    PRESETS.forEach(function (p) { expect(Object.keys(p.permissions).sort()).toEqual(keys); });
  });

  it("validates the role name and description length", function () {
    expect(validateRole({ name: "  " })).toMatch(/required/);
    expect(validateRole({ name: "x".repeat(61) })).toMatch(/60/);
    expect(validateRole({ name: "Ok", description: "x".repeat(301) })).toMatch(/300/);
    expect(validateRole({ name: "Senior groomer", description: "" })).toBe("");
  });

  it("builds a row with trimmed text, null empty description and boolean-only known permissions", function () {
    var row = roleRow({ name: "  Lead  ", description: " ", permissions: { manage_bookings: true, take_payments: "yes", bogus: true } });
    expect(row.name).toBe("Lead");
    expect(row.description).toBeNull();
    expect(row.permissions.manage_bookings).toBe(true);
    expect(row.permissions.take_payments).toBe(false);
    expect(row.permissions.bogus).toBeUndefined();
    Object.keys(row.permissions).forEach(function (k) { expect(typeof row.permissions[k]).toBe("boolean"); });
  });

  it("detects duplicate names ignoring case, spaces and the row being edited", function () {
    var roles = [{ id: "r1", name: "Groomer" }];
    expect(isDuplicateRole(roles, "  groomer ", null)).toBe(true);
    expect(isDuplicateRole(roles, "groomer", "r1")).toBe(false);
    expect(isDuplicateRole(roles, "Manager", null)).toBe(false);
  });

  it("only offers presets that are not already roles", function () {
    expect(missingPresets([{ id: "r1", name: "manager" }]).map(function (p) { return p.name; })).toEqual(["Owner/Admin", "Groomer", "Receptionist"]);
    expect(missingPresets(PRESETS.map(function (p, i) { return { id: "r" + i, name: p.name }; }))).toEqual([]);
  });

  it("maps assignments by staff and counts people per role", function () {
    var a = [{ id: "a1", staff_id: "s1", role_id: "r1" }, { id: "a2", staff_id: "s2", role_id: "r1" }, { id: "a3", staff_id: "s3", role_id: "r2" }];
    expect(assignmentByStaff(a).s2.id).toBe("a2");
    expect(countAssigned(a, "r1")).toBe(2);
    expect(countAssigned(a, "nope")).toBe(0);
  });

  it("summarises permissions honestly", function () {
    expect(permissionSummary({ permissions: {} })).toBe("No permissions ticked");
    expect(permissionSummary(PRESETS[0])).toBe("All permissions");
    expect(permissionSummary(PRESETS[2])).toBe("2 of " + PERMISSIONS.length + " permissions");
  });

  it("sorts roles by name", function () {
    expect(sortRoles([{ name: "b" }, { name: "a" }]).map(function (r) { return r.name; })).toEqual(["a", "b"]);
  });
});
