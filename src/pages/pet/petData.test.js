import {
  vaccinationStatus, vaccinationSummary, ageLabel, validatePet, petRow, isDuplicatePet,
  validateVaccination, filterPets,
  DEFAULT_REMINDER_DAYS, reminderWindowFor, recordStatus, dueText, validateReminderSetting, reminderErrorMessage,
  archiveErrorMessage, archiveReasonLabel, ARCHIVE_REASONS, isArchived,
} from "./petData";

describe("vaccinationStatus", function () {
  var today = "2026-10-24";
  it("has no status without a due date", function () { expect(vaccinationStatus(null, today)).toBe(null); });
  it("is overdue when the due date has passed", function () { expect(vaccinationStatus("2026-10-23", today)).toBe("overdue"); });
  it("is due-soon today and within the default six-month window (180 days)", function () {
    expect(DEFAULT_REMINDER_DAYS).toBe(180);
    expect(vaccinationStatus("2026-10-24", today)).toBe("due-soon");
    expect(vaccinationStatus("2027-04-22", today)).toBe("due-soon");
  });
  it("is current beyond the window", function () { expect(vaccinationStatus("2027-04-23", today)).toBe("current"); });
  it("uses a custom window when one is given", function () {
    expect(vaccinationStatus("2026-11-23", today, 30)).toBe("due-soon");
    expect(vaccinationStatus("2026-11-24", today, 30)).toBe("current");
    expect(vaccinationStatus("2026-10-23", today, 30)).toBe("overdue"); // expired is separate from the window
  });
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


describe("reminder windows per record type", function () {
  var today = "2026-10-24";
  var settings = [{ record_type: "Rabies", window_days: 30 }, { record_type: "deworming", window_days: 14 }];
  it("falls back to six months for types without a setting", function () {
    expect(reminderWindowFor("Distemper", settings)).toBe(180);
    expect(reminderWindowFor("Rabies", null)).toBe(180);
    expect(reminderWindowFor("", settings)).toBe(180);
  });
  it("matches the record type regardless of case and spaces", function () {
    expect(reminderWindowFor("  RABIES ", settings)).toBe(30);
    expect(reminderWindowFor("Deworming", settings)).toBe(14);
  });
  it("applies each type's own window to the same due date", function () {
    var due = "2026-12-01"; // 38 days away
    expect(recordStatus({ vaccine: "Rabies", next_due_on: due }, today, settings)).toBe("current");
    expect(recordStatus({ vaccine: "Distemper", next_due_on: due }, today, settings)).toBe("due-soon");
    expect(recordStatus({ vaccine: "Deworming", next_due_on: "2026-11-07" }, today, settings)).toBe("due-soon"); // day 14 is inside a 14-day window
    expect(recordStatus({ vaccine: "Deworming", next_due_on: "2026-11-08" }, today, settings)).toBe("current");
  });
  it("never produces a reminder for a record without a due date, and flags expired ones separately", function () {
    expect(recordStatus({ vaccine: "Rabies", next_due_on: null }, today, settings)).toBe(null);
    expect(recordStatus({ vaccine: "Rabies", next_due_on: "2026-10-01" }, today, settings)).toBe("overdue");
  });
  it("counts reminders using each type's window", function () {
    var vaccs = [{ vaccine: "Rabies", next_due_on: "2026-12-01" }, { vaccine: "Distemper", next_due_on: "2026-12-01" }, { vaccine: "X", next_due_on: "2026-01-01" }];
    expect(vaccinationSummary(vaccs, today, settings)).toEqual({ overdue: 1, dueSoon: 1 });
  });
  it("words the time left or since expiry", function () {
    expect(dueText("2026-10-24", today)).toBe("Due today");
    expect(dueText("2026-10-25", today)).toBe("Due in 1 day");
    expect(dueText("2026-11-23", today)).toBe("Due in 30 days");
    expect(dueText("2026-10-23", today)).toBe("Expired 1 day ago");
    expect(dueText("2026-10-01", today)).toBe("Expired 23 days ago");
    expect(dueText(null, today)).toBe("");
  });
  it("validates a setting and refuses duplicates", function () {
    expect(validateReminderSetting("Rabies", "90", [], null)).toBe("");
    expect(validateReminderSetting("", "90", [], null)).toMatch(/record type/);
    expect(validateReminderSetting("Rabies", "0", [], null)).toMatch(/1 to 730/);
    expect(validateReminderSetting("Rabies", "731", [], null)).toMatch(/1 to 730/);
    expect(validateReminderSetting("Rabies", "3.5", [], null)).toMatch(/whole number/);
    expect(validateReminderSetting("Rabies", "abc", [], null)).toMatch(/whole number/);
    expect(validateReminderSetting("rabies", "90", [{ id: "1", record_type: "Rabies" }], null)).toMatch(/already a setting/);
    expect(validateReminderSetting("rabies", "90", [{ id: "1", record_type: "Rabies" }], "1")).toBe("");
  });
  it("turns database errors into plain words", function () {
    expect(reminderErrorMessage("INVALID_WINDOW")).toMatch(/1 to 730/);
    expect(reminderErrorMessage("boom")).toMatch(/Couldn't save the setting/);
  });
});

describe("archiving helpers", function () {
  it("hides archived pets from the default list and can show them", function () {
    var pets = [{ id: "a", name: "Rex", species: "Dog", customer_id: "c" }, { id: "b", name: "Tom", species: "Cat", customer_id: "c", archived_at: "2026-10-01T00:00:00Z" }];
    expect(filterPets(pets, {}, "", "all", "all").map(function (p) { return p.id; })).toEqual(["a"]);
    expect(filterPets(pets, {}, "", "all", "all", "archived").map(function (p) { return p.id; })).toEqual(["b"]);
    expect(filterPets(pets, {}, "", "all", "all", "all").length).toBe(2);
  });
  it("knows what is archived and names the reasons", function () {
    expect(isArchived({ archived_at: "2026-10-01T00:00:00Z" })).toBe(true);
    expect(isArchived({ archived_at: null })).toBe(false);
    expect(isArchived(undefined)).toBe(false);
    expect(ARCHIVE_REASONS.map(function (r) { return r.value; })).toEqual(["passed-away", "moved-away", "inactive", "other"]);
    expect(archiveReasonLabel("passed-away")).toBe("Passed away");
    expect(archiveReasonLabel("zzz")).toBe("");
  });
  it("gives actionable messages for the database errors", function () {
    expect(archiveErrorMessage("PET_HAS_OPEN_BOOKINGS")).toMatch(/Complete or cancel it in Calendar/);
    expect(archiveErrorMessage("PET_HAS_OPEN_STAY")).toMatch(/Boarding/);
    expect(archiveErrorMessage("INVALID_ARCHIVE_REASON")).toMatch(/Choose why/);
    expect(archiveErrorMessage("Network error")).toMatch(/Couldn't update the pet/);
  });
});
