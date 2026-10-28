import { validateService, serviceRow, isDuplicateService, durationLabel, speciesLabel, filterServices, missingFromOnlineBooking, countMissingFromOnlineBooking } from "./serviceData";

var ok = { name: "Full groom", category: "Grooming", price: "1500", duration_minutes: "90", species: [], description: "", active: true };

describe("validateService", function () {
  it("accepts a valid service", function () { expect(validateService(ok)).toBe(""); });
  it("requires name, category and price", function () {
    expect(validateService(Object.assign({}, ok, { name: " " }))).toMatch(/name is required/);
    expect(validateService(Object.assign({}, ok, { category: "Spa" }))).toMatch(/category/);
    expect(validateService(Object.assign({}, ok, { price: "" }))).toMatch(/Enter a price/);
  });
  it("allows a free service but not negative, fractional or absurd prices", function () {
    expect(validateService(Object.assign({}, ok, { price: "0" }))).toBe("");
    expect(validateService(Object.assign({}, ok, { price: "-5" }))).toMatch(/whole number/);
    expect(validateService(Object.assign({}, ok, { price: "12.5" }))).toMatch(/whole number/);
    expect(validateService(Object.assign({}, ok, { price: "99999999" }))).toMatch(/whole number/);
  });
  it("duration is optional but must be a sensible whole number of minutes", function () {
    expect(validateService(Object.assign({}, ok, { duration_minutes: "" }))).toBe("");
    expect(validateService(Object.assign({}, ok, { duration_minutes: "0" }))).toMatch(/Duration/);
    expect(validateService(Object.assign({}, ok, { duration_minutes: "2000" }))).toMatch(/Duration/);
  });
  it("rejects unknown species", function () { expect(validateService(Object.assign({}, ok, { species: ["Dragon"] }))).toMatch(/species/); });
});

describe("serviceRow", function () {
  it("converts strings to numbers and blanks to null", function () {
    var r = serviceRow(Object.assign({}, ok, { duration_minutes: "", description: " " }));
    expect(r).toEqual({ name: "Full groom", description: null, category: "Grooming", duration_minutes: null, price: 1500, species: [], active: true });
  });
  it("stores 'all species ticked' as an empty list and dedupes", function () {
    expect(serviceRow(Object.assign({}, ok, { species: ["Dog", "Cat", "Rabbit", "Other"] })).species).toEqual([]);
    expect(serviceRow(Object.assign({}, ok, { species: ["Dog", "Dog"] })).species).toEqual(["Dog"]);
  });
});

describe("isDuplicateService", function () {
  var list = [{ id: "1", name: "Bath", category: "Grooming" }];
  it("matches the same name in the same category, ignoring case and spaces", function () {
    expect(isDuplicateService(list, { name: " bath ", category: "Grooming" })).toBe(true);
  });
  it("allows the same name in another category and the record being edited", function () {
    expect(isDuplicateService(list, { name: "Bath", category: "Add-on" })).toBe(false);
    expect(isDuplicateService(list, { name: "Bath", category: "Grooming" }, "1")).toBe(false);
  });
});

describe("labels and filters", function () {
  it("durationLabel", function () { expect(durationLabel(45)).toBe("45 min"); expect(durationLabel(120)).toBe("2 h"); expect(durationLabel(90)).toBe("1 h 30 min"); expect(durationLabel(null)).toBe(""); });
  it("speciesLabel", function () { expect(speciesLabel([])).toBe("All species"); expect(speciesLabel(["Dog", "Cat"])).toBe("Dog, Cat"); });
  it("filterServices hides inactive by default and filters by category and text", function () {
    var list = [
      { id: "1", name: "Bath", category: "Grooming", active: true, description: "" },
      { id: "2", name: "Nail trim", category: "Add-on", active: true, description: "paws" },
      { id: "3", name: "Old", category: "Grooming", active: false, description: "" },
    ];
    expect(filterServices(list, "", "all", false).map(function (s) { return s.id; })).toEqual(["1", "2"]);
    expect(filterServices(list, "", "all", true).length).toBe(3);
    expect(filterServices(list, "", "Add-on", false).map(function (s) { return s.id; })).toEqual(["2"]);
    expect(filterServices(list, "paws", "all", false).map(function (s) { return s.id; })).toEqual(["2"]);
  });
});

describe("missingFromOnlineBooking", function () {
  it("flags active non-boarding services with no duration", function () {
    expect(missingFromOnlineBooking({ active: true, category: "Grooming", duration_minutes: null })).toBe(true);
    expect(missingFromOnlineBooking({ active: true, category: "Add-on", duration_minutes: 0 })).toBe(true);
  });
  it("does not flag services that are listed, inactive or boarding", function () {
    expect(missingFromOnlineBooking({ active: true, category: "Grooming", duration_minutes: 30 })).toBe(false);
    expect(missingFromOnlineBooking({ active: false, category: "Grooming", duration_minutes: null })).toBe(false);
    expect(missingFromOnlineBooking({ active: true, category: "Boarding", duration_minutes: null })).toBe(false);
    expect(missingFromOnlineBooking(null)).toBe(false);
  });
  it("counts them", function () {
    expect(countMissingFromOnlineBooking([{ active: true, category: "Grooming" }, { active: true, category: "Boarding" }, { active: true, category: "Add-on", duration_minutes: 10 }])).toBe(1);
    expect(countMissingFromOnlineBooking(undefined)).toBe(0);
  });
});
