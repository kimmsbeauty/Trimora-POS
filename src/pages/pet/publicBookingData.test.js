import {
  publicErrorMessage, isSlotError, staffRequestErrorMessage, validateRequestForm, selectedTotals, groupByCategory, durationLabel,
  dateInZone, addDays, slotTime, slotDateTime, hoursSummary, defaultSettings, hoursToDays, daysToHours, validateSettings,
} from "./publicBookingData";

var good = { serviceIds: ["s1"], start: "2026-11-02T07:00:00Z", name: "Ann Wanjiru", phone: "0712 345 678", pet: "Rex", species: "Dog", breed: "", notes: "", consent: true };

describe("request form validation", function () {
  it("accepts a complete request", function () { expect(validateRequestForm(good)).toBe(""); });
  it("explains the first problem in plain words", function () {
    expect(validateRequestForm(Object.assign({}, good, { serviceIds: [] }))).toMatch(/service/i);
    expect(validateRequestForm(Object.assign({}, good, { start: "" }))).toMatch(/time/i);
    expect(validateRequestForm(Object.assign({}, good, { name: "A" }))).toMatch(/name/i);
    expect(validateRequestForm(Object.assign({}, good, { phone: "123" }))).toMatch(/phone/i);
    expect(validateRequestForm(Object.assign({}, good, { pet: " " }))).toMatch(/pet/i);
    expect(validateRequestForm(Object.assign({}, good, { species: "Dragon" }))).toMatch(/type/i);
    expect(validateRequestForm(Object.assign({}, good, { notes: "n".repeat(301) }))).toMatch(/too long/i);
    expect(validateRequestForm(Object.assign({}, good, { consent: false }))).toMatch(/tick/i);
  });
});

describe("messages", function () {
  it("has a friendly message for every server error and a safe default", function () {
    ["NOT_AVAILABLE", "SLOT_FULL", "TOO_MANY_REQUESTS", "INVALID_PHONE", "CONSENT_REQUIRED", "CLOSED"].forEach(function (c) { expect(publicErrorMessage(c)).not.toMatch(/something went wrong/i); });
    expect(publicErrorMessage("WEIRD")).toMatch(/try again/i);
    expect(isSlotError("SLOT_FULL")).toBe(true); expect(isSlotError("INVALID_PHONE")).toBe(false);
  });
  it("translates staff errors", function () {
    expect(staffRequestErrorMessage("BOOKING_CONFLICT_STAFF")).toMatch(/groomer/);
    expect(staffRequestErrorMessage("PET_ARCHIVED")).toMatch(/archived/);
    expect(staffRequestErrorMessage("zzz")).toMatch(/try again/i);
  });
});

describe("services", function () {
  var services = [{ id: "a", category: "Grooming", duration_minutes: 60, price: 1500 }, { id: "b", category: "Add-on", duration_minutes: 30, price: 300 }, { id: "c", category: "Grooming", duration_minutes: 45, price: 900 }];
  it("totals the chosen services", function () { expect(selectedTotals(services, ["a", "b"])).toEqual({ minutes: 90, price: 1800 }); });
  it("groups Grooming before Add-on and skips empty groups", function () {
    expect(groupByCategory(services).map(function (g) { return g.category + ":" + g.services.length; })).toEqual(["Grooming:2", "Add-on:1"]);
    expect(groupByCategory([services[0]]).length).toBe(1);
  });
  it("words durations", function () { expect(durationLabel(90)).toBe("1 h 30 min"); expect(durationLabel(60)).toBe("1 h"); expect(durationLabel(45)).toBe("45 min"); });
});

describe("time zones", function () {
  it("shows times in the business's zone, whatever the visitor's", function () {
    expect(slotTime("2026-11-02T06:00:00Z", "Africa/Nairobi")).toBe("09:00");
    expect(slotTime("2026-11-02T06:00:00Z", "UTC")).toBe("06:00");
    expect(slotDateTime("2026-11-02T06:00:00Z", "Africa/Nairobi")).toMatch(/Mon.*Nov.*09:00/);
  });
  it("finds today's date in the business's zone", function () {
    expect(dateInZone(new Date("2026-11-02T22:30:00Z"), "Africa/Nairobi")).toBe("2026-11-03"); // already tomorrow in Nairobi
    expect(dateInZone(new Date("2026-11-02T22:30:00Z"), "UTC")).toBe("2026-11-02");
    expect(addDays("2026-02-27", 3)).toBe("2026-03-02");
  });
});

describe("opening hours", function () {
  it("summarises runs of days", function () {
    expect(hoursSummary(defaultSettings().hours)).toBe("Mon-Fri 09:00-17:00, Sat 09:00-13:00");
    expect(hoursSummary([{ weekday: 0, open: "10:00", close: "14:00" }])).toBe("Sun 10:00-14:00");
    expect(hoursSummary([])).toBe("");
  });
  it("round-trips between the database shape and the form shape", function () {
    var h = defaultSettings().hours; var days = hoursToDays(h);
    expect(days[0]).toBeNull(); expect(days[1]).toEqual({ open: "09:00", close: "17:00" });
    expect(daysToHours(days)).toEqual(h);
  });
});

describe("settings validation", function () {
  var ok = Object.assign(defaultSettings(), { enabled: true });
  it("accepts the defaults when enabled", function () { expect(validateSettings(ok)).toBe(""); });
  it("requires an open day when switching on, and sane times and numbers", function () {
    expect(validateSettings(Object.assign({}, ok, { hours: [] }))).toMatch(/open day/);
    expect(validateSettings(Object.assign({}, ok, { hours: [{ weekday: 1, open: "17:00", close: "09:00" }] }))).toMatch(/after/);
    expect(validateSettings(Object.assign({}, ok, { hours: [{ weekday: 1, open: "9am", close: "5pm" }] }))).toMatch(/09:00/);
    expect(validateSettings(Object.assign({}, ok, { slot_minutes: 20 }))).toMatch(/slot/i);
    expect(validateSettings(Object.assign({}, ok, { lead_hours: 200 }))).toMatch(/notice/i);
    expect(validateSettings(Object.assign({}, ok, { max_days_ahead: 0 }))).toMatch(/ahead/i);
    expect(validateSettings(Object.assign({}, ok, { capacity: 21 }))).toMatch(/same time/i);
    expect(validateSettings(Object.assign({}, ok, { timezone: " " }))).toMatch(/time zone/i);
  });
  it("allows saving with online booking off and no hours", function () {
    expect(validateSettings(Object.assign({}, ok, { enabled: false, hours: [] }))).toBe("");
  });
});
