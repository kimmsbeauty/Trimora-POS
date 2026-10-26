import {
  STATUSES, STATUS_LABELS, STATUS_TONES, STATUS_ACTIONS, EDITABLE, NEXT_STATUSES, isActive, bookingErrorMessage, bookingTotal, totalMinutes, startOfWeek, weekDays, monthGrid,
  fromInputs, toDateInput, toTimeInput, addMinutes, bookingsOnDay, rangeBounds, findConflict, validateBooking, filterBookings, dateKey,
  findConflictDetail, conflictMessage, speciesMismatches, speciesMessage, durationMismatch, durationMismatchMessage, farFutureWarning, bookingWarnings, durationText, FAR_FUTURE_MONTHS, NEXT_STATUSES, STATUSES, STATUS_LABELS,
} from "./bookingData";

function at(h, m) { return new Date(2026, 9, 26, h, m).toISOString(); } // Mon 26 Oct 2026, local
function bk(id, s, e, extra) { return Object.assign({ id: id, starts_at: at(s[0], s[1]), ends_at: at(e[0], e[1]), status: "booked", pet_id: "p1", staff_id: "st1" }, extra || {}); }

describe("status rules", function () {
  it("has the prototype's six statuses plus no-show, and no old ones", function () {
    expect(STATUSES).toEqual(["booked", "checked-in", "in-progress", "ready", "completed", "cancelled", "no-show"]);
    expect(STATUSES).not.toContain("pending");
    expect(STATUSES).not.toContain("confirmed");
  });
  it("labels and colours match the prototype", function () {
    expect(STATUS_LABELS).toEqual({
      booked: "Booked", "checked-in": "Checked In", "in-progress": "In Progress", ready: "Ready for Collection",
      completed: "Completed", cancelled: "Cancelled", "no-show": "No-show",
    });
    expect(STATUS_TONES.booked).toBe("info"); expect(STATUS_TONES["checked-in"]).toBe("gold");
    expect(STATUS_TONES["in-progress"]).toBe("warning"); expect(STATUS_TONES.ready).toBe("violet");
    expect(STATUS_TONES.completed).toBe("success"); expect(STATUS_TONES.cancelled).toBe("danger");
    STATUSES.forEach(function (s) { expect(STATUS_LABELS[s]).toBeTruthy(); expect(STATUS_TONES[s]).toBeTruthy(); expect(NEXT_STATUSES[s]).toBeDefined(); });
  });
  it("mirrors the database transitions exactly (migration 092)", function () {
    expect(NEXT_STATUSES).toEqual({
      booked: ["checked-in", "cancelled", "no-show"],
      "checked-in": ["in-progress", "cancelled"],
      "in-progress": ["ready"],
      ready: ["completed"],
      completed: [], cancelled: [], "no-show": [],
    });
  });
  it("every move that can be offered has a button label", function () {
    var targets = {};
    STATUSES.forEach(function (s) { NEXT_STATUSES[s].forEach(function (t) { targets[t] = true; }); });
    Object.keys(targets).filter(function (t) { return t !== "cancelled"; }).forEach(function (t) { expect(STATUS_ACTIONS[t]).toBeTruthy(); });
    expect(STATUS_ACTIONS.ready).toBe("Mark ready");
  });
  it("only booked and checked-in bookings can be rescheduled", function () {
    expect(EDITABLE).toEqual(["booked", "checked-in"]);
  });
  it("cancelled and no-show free the slot; booked, in-progress, ready and completed hold it", function () {
    expect(isActive({ status: "cancelled" })).toBe(false);
    expect(isActive({ status: "no-show" })).toBe(false);
    ["booked", "checked-in", "in-progress", "ready", "completed"].forEach(function (s) { expect(isActive({ status: s })).toBe(true); });
  });
});

describe("bookingErrorMessage", function () {
  it("maps database error codes to friendly text", function () {
    expect(bookingErrorMessage("BOOKING_CONFLICT_STAFF")).toMatch(/staff member already has/);
    expect(bookingErrorMessage("BOOKING_CONFLICT_PET")).toMatch(/pet already has/);
    expect(bookingErrorMessage("INVALID_STATUS_CHANGE")).toMatch(/isn't allowed/);
    expect(bookingErrorMessage("SERVICE_SPECIES_MISMATCH")).toMatch(/isn't offered for this pet's species/);
  });
  it("falls back safely and never leaks raw text", function () {
    expect(bookingErrorMessage("some internal pg error")).toMatch(/Couldn't save/);
    expect(bookingErrorMessage("Network error")).toMatch(/Couldn't reach/);
  });
});

describe("totals", function () {
  it("sums snapshot prices and durations", function () {
    var lines = [{ price: 1500, duration_minutes: 60 }, { price: 300, duration_minutes: null }];
    expect(bookingTotal(lines)).toBe(1800);
    expect(totalMinutes(lines)).toBe(60);
    expect(bookingTotal(undefined)).toBe(0);
  });
});

describe("calendar dates", function () {
  it("weeks start on Monday", function () {
    expect(dateKey(startOfWeek(new Date(2026, 9, 25)))).toBe("2026-10-19"); // Sunday -> previous Monday
    expect(weekDays(new Date(2026, 9, 26)).map(dateKey)[0]).toBe("2026-10-26");
    expect(weekDays(new Date(2026, 9, 26)).length).toBe(7);
  });
  it("month grid covers the month in whole weeks", function () {
    var g = monthGrid(new Date(2026, 9, 15));
    expect(g[0].length).toBe(7);
    expect(dateKey(g[0][0])).toBe("2026-09-28");
    expect(g.flat().some(function (d) { return dateKey(d) === "2026-10-31"; })).toBe(true);
  });
  it("rangeBounds returns a half-open window", function () {
    var r = rangeBounds("day", new Date(2026, 9, 26, 15));
    expect(dateKey(r.from)).toBe("2026-10-26"); expect(dateKey(r.to)).toBe("2026-10-27");
  });
  it("parses date and time inputs and rejects bad ones", function () {
    var d = fromInputs("2026-10-26", "14:30");
    expect(toDateInput(d)).toBe("2026-10-26"); expect(toTimeInput(d)).toBe("14:30");
    expect(fromInputs("2026-02-31", "10:00")).toBeNull();
    expect(fromInputs("", "10:00")).toBeNull();
    expect(fromInputs("2026-10-26", "25")).toBeNull();
    expect(toTimeInput(addMinutes(d, 45))).toBe("15:15");
  });
  it("lists a day's bookings in time order", function () {
    var list = [bk("b", [11, 0], [12, 0]), bk("a", [9, 0], [10, 0])];
    expect(bookingsOnDay(list, new Date(2026, 9, 26)).map(function (b) { return b.id; })).toEqual(["a", "b"]);
    expect(bookingsOnDay(list, new Date(2026, 9, 27)).length).toBe(0);
  });
});

describe("findConflict (advisory)", function () {
  var existing = [bk("1", [10, 0], [11, 0])];
  function cand(sh, sm, eh, em, extra) { return Object.assign({ starts: new Date(2026, 9, 26, sh, sm), ends: new Date(2026, 9, 26, eh, em), pet_id: "other", staff_id: "other" }, extra || {}); }
  it("detects staff and pet overlaps", function () {
    expect(findConflict(existing, cand(10, 30, 11, 30, { staff_id: "st1" }))).toBe("staff");
    expect(findConflict(existing, cand(10, 30, 11, 30, { pet_id: "p1" }))).toBe("pet");
  });
  it("allows back-to-back bookings (half-open ranges)", function () {
    expect(findConflict(existing, cand(11, 0, 12, 0, { staff_id: "st1", pet_id: "p1" }))).toBeNull();
    expect(findConflict(existing, cand(9, 0, 10, 0, { staff_id: "st1", pet_id: "p1" }))).toBeNull();
  });
  it("ignores cancelled bookings and the booking being edited", function () {
    var c = [bk("1", [10, 0], [11, 0], { status: "cancelled" })];
    expect(findConflict(c, cand(10, 0, 11, 0, { staff_id: "st1" }))).toBeNull();
    expect(findConflict(existing, cand(10, 0, 11, 0, { staff_id: "st1" }), "1")).toBeNull();
  });
  it("does not flag an unassigned booking against a staff member", function () {
    expect(findConflict(existing, cand(10, 0, 11, 0, { staff_id: null }))).toBeNull();
  });
});

describe("validateBooking", function () {
  var ok = { customer_id: "c", pet_id: "p", service_ids: ["s"], date: "2026-10-26", start_time: "10:00", end_time: "11:00" };
  it("accepts a complete booking", function () { expect(validateBooking(ok)).toBe(""); });
  it("rejects missing pieces and bad times", function () {
    expect(validateBooking(Object.assign({}, ok, { customer_id: "" }))).toMatch(/customer/);
    expect(validateBooking(Object.assign({}, ok, { pet_id: "" }))).toMatch(/pet/);
    expect(validateBooking(Object.assign({}, ok, { service_ids: [] }))).toMatch(/service/);
    expect(validateBooking(Object.assign({}, ok, { end_time: "09:00" }))).toMatch(/after the start/);
    expect(validateBooking(Object.assign({}, ok, { start_time: "" }))).toMatch(/valid date/);
  });
});

describe("filterBookings", function () {
  var list = [
    bk("1", [9, 0], [10, 0], { pet_booking_services: [{ service_name: "Full groom" }] }),
    bk("2", [10, 0], [11, 0], { status: "cancelled", staff_id: "st2", pet_booking_services: [{ service_name: "Bath" }] }),
  ];
  var names = function (b) { return b.id === "1" ? { pet: "Simba", customer: "Wanjiru" } : { pet: "Rex", customer: "James" }; };
  it("filters by status, staff and text", function () {
    expect(filterBookings(list, { status: "cancelled" }, names).map(function (b) { return b.id; })).toEqual(["2"]);
    expect(filterBookings(list, { staff_id: "st1" }, names).map(function (b) { return b.id; })).toEqual(["1"]);
    expect(filterBookings(list, { q: "simba" }, names).length).toBe(1);
    expect(filterBookings(list, { q: "bath" }, names).length).toBe(1);
    expect(filterBookings(list, { q: "" }, names).length).toBe(2);
  });
});


describe("status workflow is unchanged (Ready for Collection, no pending)", function () {
  it("keeps the approved labels and has no pending status", function () {
    expect(STATUS_LABELS.ready).toBe("Ready for Collection");
    expect(STATUSES.indexOf("pending")).toBe(-1);
  });
  it("only allows the permitted moves", function () {
    expect(NEXT_STATUSES.booked).toEqual(["checked-in", "cancelled", "no-show"]);
    expect(NEXT_STATUSES["in-progress"]).toEqual(["ready"]);
    expect(NEXT_STATUSES.ready).toEqual(["completed"]);
    expect(NEXT_STATUSES.completed).toEqual([]);
  });
});

describe("species compatibility", function () {
  var dog = { name: "Rex", species: "Dog" };
  var cat = { name: "Nala", species: "Cat" };
  var any = { id: "a", name: "Nail Trim", species: [] };
  var dogOnly = { id: "d", name: "De-shedding", species: ["Dog"] };
  var catOnly = { id: "c", name: "Cat Groom", species: ["Cat"] };
  it("allows services with no restriction for every species", function () {
    expect(speciesMismatches([any], dog)).toEqual([]);
    expect(speciesMismatches([any], cat)).toEqual([]);
  });
  it("flags services that exclude the pet's species", function () {
    expect(speciesMismatches([any, dogOnly, catOnly], dog)).toEqual([catOnly]);
    expect(speciesMismatches([dogOnly], cat)).toEqual([dogOnly]);
  });
  it("does not flag anything when the pet or the list is missing", function () {
    expect(speciesMismatches([dogOnly], null)).toEqual([]);
    expect(speciesMismatches(null, dog)).toEqual([]);
    expect(speciesMismatches([{ name: "x" }], dog)).toEqual([]);
  });
  it("names the offending services in plain words", function () {
    expect(speciesMessage([catOnly], dog)).toMatch(/Cat Groom isn't offered for Rex \(Dog\)/);
    expect(speciesMessage([catOnly, dogOnly], cat)).toMatch(/aren't offered/);
    expect(speciesMessage([], dog)).toBe("");
  });
  it("blocks saving through validateBooking", function () {
    var draft = { customer_id: "c", pet_id: "p", service_ids: ["c"], date: "2026-11-01", start_time: "09:00", end_time: "10:00" };
    expect(validateBooking(draft, { services: [catOnly], pet: dog })).toMatch(/isn't offered for Rex/);
    expect(validateBooking(draft, { services: [any], pet: dog })).toBe("");
    expect(validateBooking(draft)).toBe("");
  });
});

describe("end time against service duration", function () {
  var s = fromInputs("2026-11-01", "09:00");
  it("returns null when the span equals the combined duration", function () {
    expect(durationMismatch(s, fromInputs("2026-11-01", "10:30"), [{ duration_minutes: 60 }, { duration_minutes: 30 }])).toBeNull();
  });
  it("reports a shorter booking", function () {
    var m = durationMismatch(s, fromInputs("2026-11-01", "10:00"), [{ duration_minutes: 60 }, { duration_minutes: 30 }]);
    expect(m).toEqual({ expected: 90, actual: 60, diff: -30 });
    expect(durationMismatchMessage(m)).toBe("The services add up to 1 h 30 min, but this booking runs 1 h (30 min shorter).");
  });
  it("reports a longer booking", function () {
    var m = durationMismatch(s, fromInputs("2026-11-01", "11:00"), [{ duration_minutes: 60 }]);
    expect(durationMismatchMessage(m)).toMatch(/\(1 h longer\)/);
  });
  it("ignores services that have no duration", function () {
    expect(durationMismatch(s, fromInputs("2026-11-01", "11:00"), [{ duration_minutes: null }])).toBeNull();
    expect(durationMismatch(s, fromInputs("2026-11-01", "11:00"), [])).toBeNull();
  });
  it("formats minutes", function () {
    expect(durationText(45)).toBe("45 min"); expect(durationText(120)).toBe("2 h"); expect(durationText(95)).toBe("1 h 35 min");
  });
});

describe("distant dates are flagged, never refused", function () {
  var now = new Date(2026, 9, 25, 10, 0);
  it("does not flag a booking inside the review distance", function () {
    expect(farFutureWarning(new Date(2026, 11, 1, 9, 0), now)).toBe("");
    expect(farFutureWarning(new Date(2027, 3, 25, 9, 0), now)).toBe("");
  });
  it("flags a booking beyond the review distance", function () {
    expect(farFutureWarning(new Date(2027, 4, 2, 9, 0), now)).toMatch(/more than 6 months away/);
    expect(FAR_FUTURE_MONTHS).toBe(6);
  });
  it("does not flag past or same-day bookings (walk-ins and back-filling are normal)", function () {
    expect(farFutureWarning(new Date(2026, 9, 1, 9, 0), now)).toBe("");
    expect(farFutureWarning(new Date(2026, 9, 25, 9, 0), now)).toBe("");
  });
  it("bookingWarnings combines both and stays empty for a normal booking", function () {
    var base = { date: "2026-11-01", start_time: "09:00", end_time: "10:00" };
    expect(bookingWarnings(base, { lines: [{ duration_minutes: 60 }], now: now })).toEqual([]);
    var both = bookingWarnings({ date: "2027-06-01", start_time: "09:00", end_time: "10:00" }, { lines: [{ duration_minutes: 30 }], now: now });
    expect(both.map(function (w) { return w.code; })).toEqual(["DURATION_MISMATCH", "FAR_FUTURE"]);
  });
  it("gives no warnings while the time range is invalid (validateBooking reports that)", function () {
    expect(bookingWarnings({ date: "2026-11-01", start_time: "10:00", end_time: "09:00" }, { lines: [{ duration_minutes: 30 }], now: now })).toEqual([]);
  });
});

describe("invalid ranges are still rejected", function () {
  var ok = { customer_id: "c", pet_id: "p", service_ids: ["s"], date: "2026-11-01", start_time: "09:00", end_time: "10:00" };
  it("rejects equal, reversed, malformed and over-24-hour ranges", function () {
    expect(validateBooking(Object.assign({}, ok, { end_time: "09:00" }))).toMatch(/after the start/);
    expect(validateBooking(Object.assign({}, ok, { end_time: "08:00" }))).toMatch(/after the start/);
    expect(validateBooking(Object.assign({}, ok, { date: "2026-02-31" }))).toMatch(/valid date/);
    expect(validateBooking(Object.assign({}, ok, { end_time: "" }))).toMatch(/valid end time/);
  });
});

describe("save-time conflict detail", function () {
  var existing = [{ id: "b1", pet_id: "p1", staff_id: "st1", starts_at: "2026-11-01T09:00:00", ends_at: "2026-11-01T10:00:00", status: "booked" }];
  var cand = function (o) { return Object.assign({ starts: new Date("2026-11-01T09:30:00"), ends: new Date("2026-11-01T10:30:00"), pet_id: "p2", staff_id: "st1" }, o); };
  it("finds a staff clash and says when", function () {
    var hit = findConflictDetail(existing, cand(), null);
    expect(hit.kind).toBe("staff");
    expect(conflictMessage(hit)).toMatch(/already has a booking from \d\d:\d\d – \d\d:\d\d/);
  });
  it("finds a pet clash, ignores itself, and treats cancelled as free", function () {
    expect(findConflictDetail(existing, cand({ pet_id: "p1", staff_id: null }), null).kind).toBe("pet");
    expect(findConflictDetail(existing, cand(), "b1")).toBeNull();
    expect(findConflictDetail([Object.assign({}, existing[0], { status: "cancelled" })], cand(), null)).toBeNull();
  });
  it("treats back-to-back bookings as no clash", function () {
    expect(findConflictDetail(existing, cand({ starts: new Date("2026-11-01T10:00:00"), ends: new Date("2026-11-01T11:00:00") }), null)).toBeNull();
    expect(conflictMessage(null)).toBe("");
  });
});
