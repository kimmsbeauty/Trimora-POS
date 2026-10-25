import { vaccinationStatus, vaccinationSummary, warnDaysFor, windowsFromRows, validateWarnDays, validateVaccination,
  filterByArchive, isArchived, DEFAULT_WARN_DAYS } from "./petData";

var today = "2026-10-24";

describe("care reminder windows", function () {
  it("defaults to six months (180 days)", function () { expect(DEFAULT_WARN_DAYS).toBe(180); expect(warnDaysFor({}, "deworming")).toBe(180); });
  it("flags expired dates separately from due-soon", function () {
    expect(vaccinationStatus("2026-10-23", today)).toBe("overdue");
    expect(vaccinationStatus("2026-10-24", today)).toBe("due-soon");
  });
  it("uses a per-type window", function () {
    var w = windowsFromRows([{ record_type: "deworming", warn_days: 30 }]);
    var list = [{ record_type: "deworming", next_due_on: "2026-12-30" }, { record_type: "vaccination", next_due_on: "2026-12-30" }];
    expect(vaccinationSummary(list, today, w)).toEqual({ overdue: 0, dueSoon: 1 }); // only the vaccination (180 days) is due soon
  });
  it("treats legacy rows without record_type as vaccinations", function () {
    expect(vaccinationSummary([{ next_due_on: "2026-11-01" }], today, { vaccination: 7 }).dueSoon).toBe(0);
  });
  it("rejects bad window values and ignores bad stored ones", function () {
    expect(validateWarnDays("0")).not.toBe(""); expect(validateWarnDays("731")).not.toBe(""); expect(validateWarnDays("1.5")).not.toBe(""); expect(validateWarnDays("")).not.toBe("");
    expect(validateWarnDays("180")).toBe("");
    expect(warnDaysFor({ other: 9999 }, "other")).toBe(180);
  });
  it("validates the record type", function () {
    expect(validateVaccination({ record_type: "bogus", vaccine: "x", given_on: "2026-01-01" }, today)).toMatch(/type/i);
    expect(validateVaccination({ record_type: "deworming", vaccine: "", given_on: "2026-01-01" }, today)).toMatch(/treatment/i);
  });
});

describe("archive filtering", function () {
  var pets = [{ id: "a" }, { id: "b", archived_at: "2026-10-01T00:00:00Z" }];
  it("hides archived pets from the default view, keeps them in archived/all", function () {
    expect(filterByArchive(pets).map(function (p) { return p.id; })).toEqual(["a"]);
    expect(filterByArchive(pets, "archived").map(function (p) { return p.id; })).toEqual(["b"]);
    expect(filterByArchive(pets, "all").length).toBe(2);
    expect(isArchived(pets[1])).toBe(true);
  });
});
