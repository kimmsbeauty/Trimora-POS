import { isOverdue, minutesOverdue, dayKey, toInstant, dashboardCounts, planOptions, unitsFor, validateVisit, validateLog,
  clampLateHours, previewTotals, daycareErrorMessage, durationLabel, timeLabel, emptyVisit } from "./daycareData";

var NOW = new Date("2026-10-29T12:00:00+03:00");
function v(over) { return Object.assign({ status: "in-daycare", scheduled_start: "2026-10-29T08:00:00+03:00", scheduled_end: "2026-10-29T11:00:00+03:00" }, over); }

describe("time handling (East Africa Time)", function () {
  it("keys days in Nairobi, not UTC", function () {
    expect(dayKey("2026-10-29T22:30:00Z")).toBe("2026-10-30"); // 01:30 EAT next day
    expect(toInstant("2026-10-29", "08:30")).toBe("2026-10-29T05:30:00.000Z");
    expect(timeLabel("2026-10-29T05:30:00Z")).toBe("08:30");
    expect(durationLabel("2026-10-29T05:00:00Z", "2026-10-29T08:30:00Z")).toBe("3 h 30 min");
  });
});

describe("overdue", function () {
  it("applies the configured grace period and only to pets on site", function () {
    expect(minutesOverdue(v(), NOW)).toBe(60);
    expect(isOverdue(v(), NOW, 0)).toBe(true);
    expect(isOverdue(v(), NOW, 60)).toBe(false);
    expect(isOverdue(v(), NOW, 30)).toBe(true);
    expect(isOverdue(v({ status: "booked" }), NOW, 0)).toBe(false);
    expect(isOverdue(v({ status: "completed" }), NOW, 0)).toBe(false);
  });
});

describe("dashboardCounts", function () {
  it("counts today's arrivals, on-site pets, overdue, completed and capacity", function () {
    var visits = [
      v({ status: "booked", scheduled_start: "2026-10-29T14:00:00+03:00", scheduled_end: "2026-10-29T18:00:00+03:00" }),
      v({ status: "booked", scheduled_start: "2026-10-30T08:00:00+03:00", scheduled_end: "2026-10-30T18:00:00+03:00" }),
      v({ status: "checked-in", scheduled_end: "2026-10-29T18:00:00+03:00" }),
      v(), v({ status: "ready-for-pickup" }),
      v({ status: "completed", collected_at: "2026-10-29T10:00:00+03:00" }),
      v({ status: "cancelled" }),
    ];
    var c = dashboardCounts(visits, NOW, { capacity: 5, overdue_grace_minutes: 0 });
    expect(c).toMatchObject({ expected: 1, checkedIn: 1, inDaycare: 1, ready: 1, present: 3, overdue: 2, completedToday: 1, capacity: 5, available: 2, occupancyPct: 60 });
  });
  it("reports unknown capacity as null instead of inventing one", function () {
    var c = dashboardCounts([], NOW, null);
    expect(c.capacity).toBeNull(); expect(c.available).toBeNull(); expect(c.occupancyPct).toBeNull();
  });
});

describe("plans and pricing", function () {
  var settings = { full_day_service_id: "a", half_day_service_id: null, hourly_service_id: "c" };
  var services = [{ id: "a", name: "Full day", category: "Daycare", price: 2000, active: true }, { id: "c", name: "Hourly", category: "Daycare", price: 300, active: false }, { id: "x", name: "Bath", category: "Grooming", price: 1, active: true }];
  it("offers only configured, active Daycare services with their catalogue price", function () {
    expect(planOptions(settings, services)).toEqual([{ plan: "full_day", label: "Full day", name: "Full day", price: 2000 }]);
    expect(planOptions(null, services)).toEqual([]);
  });
  it("bills each started booked hour for hourly, one unit otherwise", function () {
    expect(unitsFor("hourly", "2026-10-29T05:00:00Z", "2026-10-29T08:10:00Z")).toBe(4);
    expect(unitsFor("full_day", "2026-10-29T05:00:00Z", "2026-10-29T15:00:00Z")).toBe(1);
  });
});

describe("validation", function () {
  var good = Object.assign(emptyVisit("2099-01-01"), { customer_id: "c", pet_id: "p", plan: "full_day" });
  it("accepts a good draft and explains bad ones", function () {
    expect(validateVisit(good)).toBe("");
    expect(validateVisit(Object.assign({}, good, { customer_id: "" }))).toMatch(/customer/i);
    expect(validateVisit(Object.assign({}, good, { plan: "" }))).toMatch(/option/i);
    expect(validateVisit(Object.assign({}, good, { start: "17:00", end: "08:00" }))).toMatch(/after drop-off/i);
    expect(validateVisit(Object.assign({}, good, { date: "2020-01-01" }))).toMatch(/past/i);
  });
  it("care entries: medication needs name and dose; notes need text", function () {
    expect(validateLog({ kind: "feeding" })).toBe("");
    expect(validateLog({ kind: "medication", medication_name: "X" })).toMatch(/dose/i);
    expect(validateLog({ kind: "medication", medication_name: "X", dose: "1" })).toBe("");
    expect(validateLog({ kind: "incident", details: " " })).toMatch(/description/i);
    expect(validateLog({ kind: "nope" })).toMatch(/choose/i);
  });
});

describe("checkout preview", function () {
  var info = { units: 1, unit_price: 2000, late_hours: 2, late_unit_price: 300 };
  it("never lets staff raise late hours above the rule, and caps discounts", function () {
    expect(clampLateHours("9", 2)).toBe(2); expect(clampLateHours("-1", 2)).toBe(0); expect(clampLateHours("x", 2)).toBe(0);
    expect(previewTotals(info, 5, "amount", 0).total).toBe(2600);
    expect(previewTotals(info, 0, "amount", 0).total).toBe(2000);
    expect(previewTotals(info, 2, "percent", 10).total).toBe(2340);
    expect(previewTotals(info, 2, "amount", 99999).total).toBe(0);
  });
});

describe("error messages", function () {
  it("maps database codes to friendly text and falls back safely", function () {
    expect(daycareErrorMessage("DAYCARE_FULL")).toMatch(/full/i);
    expect(daycareErrorMessage("... VISIT_ALREADY_INVOICED ...")).toMatch(/already has an invoice/i);
    expect(daycareErrorMessage("Network error")).toMatch(/connection/i);
    expect(daycareErrorMessage("boom")).toMatch(/Couldn't save/);
  });
});
