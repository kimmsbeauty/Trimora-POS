import {
  isActive, dateKey, todayKey, addDaysKey, daysBetween, nightsOf, stayLengthLabel, estimatedCost, rangesOverlap, occupiesDay,
  currentStay, nextReservation, kennelStatus, kennelCounts, upcomingArrivals, timelineDays, timelineCell, findStayConflict,
  validateStay, validateKennel, isDuplicateKennel, boardingErrorMessage, NEXT_STAY, KENNEL_STATUSES,
} from "./boardingData";

function stay(extra) {
  return Object.assign({ id: "s1", kennel_id: "k1", pet_id: "p1", status: "reserved", check_in_on: "2030-03-10", check_out_on: "2030-03-13" }, extra || {});
}

describe("boardingData dates", function () {
  it("formats and shifts business dates without timezone drift", function () {
    expect(dateKey(new Date(2030, 2, 5))).toBe("2030-03-05");
    expect(todayKey(new Date(2030, 11, 31))).toBe("2030-12-31");
    expect(addDaysKey("2030-02-28", 1)).toBe("2030-03-01");
    expect(addDaysKey("2030-03-01", -1)).toBe("2030-02-28");
    expect(daysBetween("2030-03-10", "2030-03-13")).toBe(3);
    expect(daysBetween("2030-03-26", "2030-03-31")).toBe(5);
  });

  it("counts nights, labels day stays and estimates cost for display", function () {
    expect(nightsOf(stay())).toBe(3);
    expect(stayLengthLabel(stay())).toBe("3 nights");
    expect(stayLengthLabel(stay({ check_out_on: "2030-03-11" }))).toBe("1 night");
    expect(stayLengthLabel(stay({ check_out_on: "2030-03-10" }))).toBe("Day stay");
    expect(estimatedCost(stay({ nightly_rate: 900 }))).toBe(2700);
    expect(estimatedCost(stay({ nightly_rate: 700, check_out_on: "2030-03-10" }))).toBe(700);
    expect(estimatedCost(stay({ nightly_rate: null }))).toBeNull();
    expect(estimatedCost(stay())).toBeNull();
  });
});

describe("boardingData occupancy rules (match the database)", function () {
  it("treats a stay as the nights [check-in, check-out)", function () {
    expect(occupiesDay(stay(), "2030-03-10")).toBe(true);
    expect(occupiesDay(stay(), "2030-03-12")).toBe(true);
    expect(occupiesDay(stay(), "2030-03-13")).toBe(false);
    expect(occupiesDay(stay(), "2030-03-09")).toBe(false);
  });
  it("lets a new stay check in on the day another checks out", function () {
    expect(rangesOverlap("2030-03-10", "2030-03-13", "2030-03-13", "2030-03-15")).toBe(false);
    expect(rangesOverlap("2030-03-10", "2030-03-13", "2030-03-12", "2030-03-15")).toBe(true);
  });
  it("makes a same-day stay occupy that one day", function () {
    expect(occupiesDay(stay({ check_out_on: "2030-03-10" }), "2030-03-10")).toBe(true);
    expect(rangesOverlap("2030-03-10", "2030-03-10", "2030-03-10", "2030-03-10")).toBe(true);
    expect(rangesOverlap("2030-03-10", "2030-03-10", "2030-03-08", "2030-03-10")).toBe(false);
    expect(rangesOverlap("2030-03-10", "2030-03-10", "2030-03-10", "2030-03-12")).toBe(true);
  });
  it("only reserved and occupied stays are active", function () {
    expect(["reserved", "occupied", "checked-out", "cancelled"].map(function (s) { return isActive({ status: s }); })).toEqual([true, true, false, false]);
  });
  it("allows the same moves as the database", function () {
    expect(NEXT_STAY.reserved).toEqual(["occupied", "cancelled"]);
    expect(NEXT_STAY.occupied).toEqual(["checked-out"]);
    expect(NEXT_STAY["checked-out"]).toEqual([]);
    expect(NEXT_STAY.cancelled).toEqual([]);
  });
});

describe("boardingData kennel status (derived)", function () {
  var today = "2030-03-10";
  var kennel = { id: "k1", maintenance: false };

  it("is maintenance when flagged, whatever the stays say", function () {
    expect(kennelStatus({ id: "k1", maintenance: true }, [stay({ status: "occupied" })], today)).toBe("maintenance");
  });
  it("is occupied while a pet is checked in", function () {
    expect(kennelStatus(kennel, [stay({ status: "occupied" })], today)).toBe("occupied");
    expect(currentStay("k1", [stay({ status: "occupied" })]).id).toBe("s1");
    expect(currentStay("k2", [stay({ status: "occupied" })])).toBeNull();
  });
  it("is reserved only when a reservation arrives today or tomorrow, or is overdue", function () {
    expect(kennelStatus(kennel, [stay({ check_in_on: "2030-03-10" })], today)).toBe("reserved");
    expect(kennelStatus(kennel, [stay({ check_in_on: "2030-03-11", check_out_on: "2030-03-14" })], today)).toBe("reserved");
    expect(kennelStatus(kennel, [stay({ check_in_on: "2030-03-12", check_out_on: "2030-03-14" })], today)).toBe("available");
    expect(kennelStatus(kennel, [stay({ check_in_on: "2030-03-08", check_out_on: "2030-03-12" })], today)).toBe("reserved");
  });
  it("ignores checked-out, cancelled and finished stays", function () {
    expect(kennelStatus(kennel, [stay({ status: "checked-out" }), stay({ id: "s2", status: "cancelled" })], today)).toBe("available");
    expect(kennelStatus(kennel, [stay({ check_in_on: "2030-03-01", check_out_on: "2030-03-05" })], today)).toBe("available");
  });
  it("counts every kennel in exactly one status", function () {
    var kennels = [{ id: "k1", maintenance: false }, { id: "k2", maintenance: false }, { id: "k3", maintenance: true }, { id: "k4", maintenance: false }];
    var stays = [stay({ status: "occupied" }), stay({ id: "s2", kennel_id: "k2", check_in_on: "2030-03-11", check_out_on: "2030-03-12" })];
    var c = kennelCounts(kennels, stays, today);
    expect(c).toEqual({ occupied: 1, reserved: 1, available: 1, maintenance: 1 });
    expect(KENNEL_STATUSES.reduce(function (n, k) { return n + c[k]; }, 0)).toBe(kennels.length);
  });
  it("finds the next reservation and sorts arrivals by date", function () {
    var a = stay({ id: "a", check_in_on: "2030-03-15", check_out_on: "2030-03-17" });
    var b = stay({ id: "b", check_in_on: "2030-03-11", check_out_on: "2030-03-12" });
    var done = stay({ id: "c", check_in_on: "2030-03-01", check_out_on: "2030-03-05" });
    expect(nextReservation("k1", [a, b, done], today).id).toBe("b");
    expect(upcomingArrivals([a, b, done, stay({ id: "d", status: "occupied" })], today).map(function (s) { return s.id; })).toEqual(["b", "a"]);
  });
});

describe("boardingData timeline and conflicts", function () {
  it("builds consecutive days and finds who occupies a kennel on a day", function () {
    var days = timelineDays("2030-03-09", 14);
    expect(days.length).toBe(14);
    expect(days[0]).toBe("2030-03-09");
    expect(days[13]).toBe("2030-03-22");
    var stays = [stay(), stay({ id: "x", status: "cancelled", check_in_on: "2030-03-20", check_out_on: "2030-03-22" })];
    expect(timelineCell("k1", stays, "2030-03-11").id).toBe("s1");
    expect(timelineCell("k1", stays, "2030-03-13")).toBeNull();
    expect(timelineCell("k1", stays, "2030-03-21")).toBeNull();
  });

  it("warns about a kennel clash, a pet clash, and ignores the stay being edited", function () {
    var stays = [stay()];
    expect(findStayConflict(stays, { kennel_id: "k1", pet_id: "p9", check_in_on: "2030-03-12", check_out_on: "2030-03-14" })).toBe("kennel");
    expect(findStayConflict(stays, { kennel_id: "k2", pet_id: "p1", check_in_on: "2030-03-12", check_out_on: "2030-03-14" })).toBe("pet");
    expect(findStayConflict(stays, { kennel_id: "k1", pet_id: "p9", check_in_on: "2030-03-13", check_out_on: "2030-03-15" })).toBeNull();
    expect(findStayConflict(stays, { kennel_id: "k1", pet_id: "p1", check_in_on: "2030-03-10", check_out_on: "2030-03-13" }, "s1")).toBeNull();
    expect(findStayConflict([stay({ status: "checked-out" })], { kennel_id: "k1", pet_id: "p1", check_in_on: "2030-03-10", check_out_on: "2030-03-13" })).toBeNull();
  });
});

describe("boardingData validation and errors", function () {
  var ok = { customer_id: "c1", pet_id: "p1", kennel_id: "k1", check_in_on: "2030-03-10", check_out_on: "2030-03-12" };
  it("validates a stay", function () {
    expect(validateStay(ok)).toBe("");
    expect(validateStay(Object.assign({}, ok, { customer_id: "" }))).toBe("Choose a customer.");
    expect(validateStay(Object.assign({}, ok, { pet_id: "" }))).toBe("Choose a pet.");
    expect(validateStay(Object.assign({}, ok, { kennel_id: "" }))).toBe("Choose a kennel.");
    expect(validateStay(Object.assign({}, ok, { check_out_on: "2030-03-09" }))).toMatch(/before check-in/);
    expect(validateStay(Object.assign({}, ok, { check_out_on: "2031-04-01" }))).toMatch(/365/);
    expect(validateStay(Object.assign({}, ok, { check_out_on: "2030-03-10" }))).toBe("");
  });
  it("validates kennels and detects duplicate names", function () {
    expect(validateKennel({ name: "  " })).toMatch(/required/);
    expect(validateKennel({ name: "x".repeat(61) })).toMatch(/60/);
    expect(validateKennel({ name: "Suite", kind: "y".repeat(41) })).toMatch(/40/);
    expect(validateKennel({ name: "Suite 1", kind: "Deluxe" })).toBe("");
    var ks = [{ id: "k1", name: "Suite 1" }];
    expect(isDuplicateKennel(ks, " suite 1 ", null)).toBe(true);
    expect(isDuplicateKennel(ks, "suite 1", "k1")).toBe(false);
  });
  it("maps database error codes to friendly text and never leaks raw messages", function () {
    expect(boardingErrorMessage("STAY_CONFLICT_KENNEL")).toMatch(/already taken/);
    expect(boardingErrorMessage("STAY_CONFLICT_PET")).toMatch(/pet already has a stay/);
    expect(boardingErrorMessage("KENNEL_HAS_STAYS")).toMatch(/maintenance/);
    expect(boardingErrorMessage("KENNEL_OCCUPIED")).toMatch(/Check them out/);
    expect(boardingErrorMessage("Network error")).toMatch(/connection/);
    expect(boardingErrorMessage("something exploded in postgres")).toMatch(/Couldn't save/);
    expect(boardingErrorMessage("something exploded in postgres")).not.toMatch(/postgres/);
  });
});
