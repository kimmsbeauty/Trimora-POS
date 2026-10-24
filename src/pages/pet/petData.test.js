import {
  vaccinationStatus, vaccinationSummary, ageLabel, validatePet, petRow, isDuplicatePet,
  validateVaccination, filterPets,
} from "./petData";

describe("vaccinationStatus", function () {
  var today = "2026-10-24";
  it("has no status without a due date", function () { expect(vaccinationStatus(null, today)).toBe(null); });
  it("is overdue when the due date has passed", function () { expect(vaccinationStatus("2026-10-23", today)).toBe("overdue"); });
  it("is due-soon today and within 30 days", function () {
    expect(vaccinationStatus("2026-10-24", today)).toBe("due-soon");
    expect(vaccinationStatus("2026-11-23", today)).toBe("due-soon");
  });
  it("is current beyond 30 days", function () { expect(vaccinationStatus("2026-11-24", today)).toBe("current"); });
  it("summarises overdue and due-soon counts", function () {
    var s = vaccinationSummary([{ next_due_on: "2026-01-01" }, { next_due_on: "2026-10-30" }, { next_due_on: null }], today);
    expect(s).toEqual({ overdue: 1, dueSoon: 1 });
  });
});

describe("ageLabel", function () {
  var today = "2026-10-24";
  it("handles unknown, months and years", function () {
    expect(ageLabel(null, today)).toBe("Age unknown");
    expect(ageLabel("2026-08-24", today)).toBe("2 months");
    expect(ageLabel("2022-10-25", today)).toBe("3 years");
    expect(ageLabel("2022-10-24", today)).toBe("4 years");
  });
});

describe("validatePet / petRow", function () {
  var ok = { name: "Simba", customer_id: "c1", species: "Dog", sex: "Male", weight_kg: "" };
  it("accepts a minimal pet", function () { expect(validatePet(ok, "2026-10-24")).toBe(""); });
  it("requires name and owner", function () {
    expect(validatePet(Object.assign({}, ok, { name: "  " }))).toMatch(/name/i);
    expect(validatePet(Object.assign({}, ok, { customer_id: "" }))).toMatch(/owner/i);
  });
  it("rejects bad species, future DOB and bad weight", function () {
    expect(validatePet(Object.assign({}, ok, { species: "Dragon" }))).toMatch(/species/i);
    expect(validatePet(Object.assign({}, ok, { date_of_birth: "2030-01-01" }), "2026-10-24")).toMatch(/future/i);
    expect(validatePet(Object.assign({}, ok, { weight_kg: "-2" }))).toMatch(/weight/i);
    expect(validatePet(Object.assign({}, ok, { weight_kg: "abc" }))).toMatch(/weight/i);
  });
  it("turns blanks into nulls and trims", function () {
    var r = petRow({ name: " Simba ", customer_id: "c1", species: "Dog", breed: " ", weight_kg: "12.5", care_notes: "" });
    expect(r.name).toBe("Simba"); expect(r.breed).toBe(null); expect(r.weight_kg).toBe(12.5);
    expect(r.care_notes).toBe(null); expect(r.sex).toBe("Unknown");
  });
  it("detects a duplicate for the same owner, name and species only", function () {
    var pets = [{ id: "p1", customer_id: "c1", species: "Dog", name: "Simba" }];
    expect(isDuplicatePet(pets, { customer_id: "c1", species: "Dog", name: " simba " })).toBe(true);
    expect(isDuplicatePet(pets, { customer_id: "c1", species: "Cat", name: "Simba" })).toBe(false);
    expect(isDuplicatePet(pets, { customer_id: "c2", species: "Dog", name: "Simba" })).toBe(false);
    expect(isDuplicatePet(pets, { customer_id: "c1", species: "Dog", name: "Simba" }, "p1")).toBe(false);
  });
});

describe("validateVaccination", function () {
  it("requires vaccine and given date, and sane dates", function () {
    var t = "2026-10-24";
    expect(validateVaccination({ vaccine: "", given_on: "2026-01-01" }, t)).toMatch(/vaccine/i);
    expect(validateVaccination({ vaccine: "Rabies", given_on: "" }, t)).toMatch(/given/i);
    expect(validateVaccination({ vaccine: "Rabies", given_on: "2027-01-01" }, t)).toMatch(/future/i);
    expect(validateVaccination({ vaccine: "Rabies", given_on: "2026-05-01", next_due_on: "2026-04-01" }, t)).toMatch(/before/i);
    expect(validateVaccination({ vaccine: "Rabies", given_on: "2026-05-01", next_due_on: "2027-05-01" }, t)).toBe("");
  });
});

describe("filterPets", function () {
  var owners = { c1: { name: "Wanjiru" }, c2: { name: "James" } };
  var pets = [
    { id: "1", name: "Simba", species: "Dog", breed: "Golden", customer_id: "c1" },
    { id: "2", name: "Nala", species: "Cat", breed: "Tabby", customer_id: "c1" },
    { id: "3", name: "Rex", species: "Dog", breed: "GSD", customer_id: "c2" },
  ];
  it("searches pet or owner name and filters species/breed", function () {
    expect(filterPets(pets, owners, "wanj", "all", "all").length).toBe(2);
    expect(filterPets(pets, owners, "rex", "all", "all").length).toBe(1);
    expect(filterPets(pets, owners, "", "Dog", "all").length).toBe(2);
    expect(filterPets(pets, owners, "", "all", "Tabby").length).toBe(1);
  });
});
