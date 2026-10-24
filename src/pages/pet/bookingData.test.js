import {
  NEXT_STATUSES, isActive, bookingErrorMessage, bookingTotal, totalMinutes, startOfWeek, weekDays, monthGrid,
  fromInputs, toDateInput, toTimeInput, addMinutes, bookingsOnDay, rangeBounds, findConflict, validateBooking, filterBookings, dateKey,
} from "./bookingData";

function at(h, m) { return new Date(2026, 9, 26, h, m).toISOString(); } // Mon 26 Oct 2026, local
function bk(id, s, e, extra) { return Object.assign({ id: id, starts_at: at(s[0], s[1]), ends_at: at(e[0], e[1]), status: "confirmed", pet_id: "p1", staff_id: "st1" }, extra || {}); }

describe("status rules", function () {
  it("mirrors the database transitions", function () {
    expect(NEXT_STATUSES.pending).toEqual(["confirmed", "checked-in", "cancelled"]);
    expect(NEXT_STATUSES["in-progress"]).toEqual(["completed"]);
    ["completed", "cancelled", "no-show"].forEach(function (s) { expect(NEXT_STATUSES[s]).toEqual([]); });
  });
  it("cancelled and no-show free the slot", function () {
    expect(isActive({ status: "cancelled" })).toBe(false);
    expect(isActive({ status: "no-show" })).toBe(false);
    expect(isActive({ status: "completed" })).toBe(true);
  });
});

describe("bookingErrorMessage", function () {
  it("maps database error codes to friendly text", function () {
    expect(bookingErrorMessage("BOOKING_CONFLICT_STAFF")).toMatch(/staff member already has/);
    expect(bookingErrorMessage("BOOKING_CONFLICT_PET")).toMatch(/pet already has/);
    expect(bookingErrorMessage("INVALID_STATUS_CHANGE")).toMatch(/isn't allowed/);
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
