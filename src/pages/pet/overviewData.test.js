import {
  greetingFor, appointmentsToday, petsBoarding, revenueToday, outstandingInvoices, scheduleRows, boardingRows, attentionItems,
  activityFeed, relativeTime, loadWindow, FEED_LIMIT,
} from "./overviewData";
import { dateKey, addDays } from "./bookingData";

// Sunday 25 Oct 2026, 10:00 local.
var NOW = new Date(2026, 9, 25, 10, 0, 0);
var TODAY = dateKey(NOW);
function at(dayOffset, h, m) { return new Date(2026, 9, 25 + dayOffset, h, m || 0, 0).toISOString(); }
function booking(extra) {
  return Object.assign({ id: "b1", customer_id: "c1", pet_id: "p1", staff_id: "s1", starts_at: at(0, 11), ends_at: at(0, 12), status: "booked",
    pet_booking_services: [{ service_name: "Full groom" }] }, extra || {});
}
var MAPS = {
  customers: { c1: { id: "c1", name: "Wanjiru Kamau" } },
  pets: { p1: { id: "p1", name: "Simba" }, p2: { id: "p2", name: "Rex" } },
  staff: { s1: { id: "s1", name: "Achieng" } },
  kennels: { k1: { id: "k1", name: "Suite 1" } },
};

describe("greetingFor", function () {
  it("follows the time of day", function () {
    expect(greetingFor(new Date(2026, 9, 25, 9))).toBe("Good morning");
    expect(greetingFor(new Date(2026, 9, 25, 13))).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 9, 25, 19))).toBe("Good evening");
  });
});

describe("summary numbers", function () {
  it("counts only today's active appointments", function () {
    var list = [booking(), booking({ id: "b2", status: "cancelled" }), booking({ id: "b3", status: "no-show" }), booking({ id: "b4", starts_at: at(1, 9) }), booking({ id: "b5", status: "completed" })];
    expect(appointmentsToday(list, NOW)).toBe(2);
  });

  it("counts only checked-in boarding stays", function () {
    expect(petsBoarding([{ status: "occupied" }, { status: "reserved" }, { status: "checked-out" }, { status: "occupied" }])).toBe(2);
  });

  it("sums only payments recorded today", function () {
    var r = revenueToday([{ amount: 1500, paid_at: at(0, 9) }, { amount: 500, paid_at: at(0, 9, 30) }, { amount: 9999, paid_at: at(-1, 15) }], NOW);
    expect(r).toEqual({ total: 2000, count: 2 });
    expect(revenueToday([], NOW)).toEqual({ total: 0, count: 0 });
  });

  it("totals the unpaid balance and counts invoices that still owe", function () {
    var r = outstandingInvoices([
      { status: "issued", total: 1000, amount_paid: 0 }, { status: "partial", total: 2000, amount_paid: 500 },
      { status: "paid", total: 700, amount_paid: 700 }, { status: "void", total: 5000, amount_paid: 0 },
    ]);
    expect(r).toEqual({ total: 2500, count: 2 });
  });
});

describe("scheduleRows", function () {
  it("uses the approved labels and offers only the next forward moves", function () {
    var rows = scheduleRows([booking(), booking({ id: "b2", status: "checked-in", starts_at: at(0, 12) }), booking({ id: "b3", status: "in-progress", starts_at: at(0, 13) }),
      booking({ id: "b4", status: "ready", starts_at: at(0, 14) }), booking({ id: "b5", status: "completed", starts_at: at(0, 15) })], MAPS, NOW);
    expect(rows.map(function (r) { return r.label; })).toEqual(["Booked", "Checked In", "In Progress", "Ready for Collection", "Completed"]);
    expect(rows.map(function (r) { return r.actions.map(function (a) { return a.label; }); })).toEqual([["Check in"], ["Start"], ["Mark ready"], ["Complete"], []]);
  });

  it("shows names, services and staff, with honest fallbacks", function () {
    var rows = scheduleRows([booking(), booking({ id: "b2", pet_id: "gone", customer_id: "gone", staff_id: null, pet_booking_services: [], starts_at: at(0, 12) })], MAPS, NOW);
    expect(rows[0]).toMatchObject({ pet: "Simba", customer: "Wanjiru Kamau", services: "Full groom", staff: "Achieng" });
    expect(rows[1]).toMatchObject({ pet: "Unknown pet", customer: "Unknown customer", services: "No service listed", staff: "Unassigned" });
  });

  it("keeps cancelled bookings visible but faded, without actions", function () {
    var row = scheduleRows([booking({ status: "cancelled" })], MAPS, NOW)[0];
    expect(row.faded).toBe(true);
    expect(row.actions).toEqual([]);
  });

  it("is sorted by start time and ignores other days", function () {
    var rows = scheduleRows([booking({ id: "late", starts_at: at(0, 15) }), booking({ id: "early", starts_at: at(0, 9) }), booking({ id: "tomorrow", starts_at: at(1, 9) })], MAPS, NOW);
    expect(rows.map(function (r) { return r.id; })).toEqual(["early", "late"]);
  });
});

describe("boardingRows", function () {
  function stay(extra) { return Object.assign({ id: "s", pet_id: "p1", customer_id: "c1", kennel_id: "k1", status: "occupied", check_in_on: "2026-10-23", check_out_on: "2026-10-27" }, extra || {}); }

  it("lists only checked-in pets, earliest check-out first, and flags today / overdue / soon", function () {
    var rows = boardingRows([
      stay({ id: "far", check_out_on: "2026-11-10" }), stay({ id: "soon", check_out_on: "2026-10-27" }), stay({ id: "today", check_out_on: "2026-10-25" }),
      stay({ id: "late", check_out_on: "2026-10-24" }), stay({ id: "res", status: "reserved" }), stay({ id: "out", status: "checked-out" }),
    ], MAPS, TODAY);
    expect(rows.map(function (r) { return r.id; })).toEqual(["late", "today", "soon", "far"]);
    expect(rows[0].overdue).toBe(true);
    expect(rows[1].dueToday).toBe(true);
    expect(rows[2].soon).toBe(true);
    expect(rows[3]).toMatchObject({ overdue: false, dueToday: false, soon: false });
    expect(rows[0]).toMatchObject({ pet: "Simba", owner: "Wanjiru Kamau", kennel: "Suite 1" });
  });
});

describe("attentionItems", function () {
  function run(extra) {
    return attentionItems(Object.assign({ now: NOW, maps: MAPS, invoices: [], bookings: [], stays: [], vaccinations: [], items: [] }, extra || {}));
  }
  function keys(list) { return list.map(function (i) { return i.key; }); }

  it("is empty when there is nothing to report", function () {
    expect(run()).toEqual([]);
  });

  it("reports overdue invoices with the amount owing", function () {
    var list = run({ invoices: [{ status: "issued", total: 3000, amount_paid: 1000, due_date: "2026-10-20" }, { status: "issued", total: 500, amount_paid: 0, due_date: "2026-12-01" }] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ key: "overdue", count: 1, amount: 2000, target: "invoices" });
  });

  it("reports pets ready for collection and boarding check-outs that are due", function () {
    var list = run({ bookings: [booking({ status: "ready" })], stays: [{ status: "occupied", pet_id: "p2", check_out_on: TODAY }, { status: "occupied", pet_id: "p1", check_out_on: "2026-11-30" }] });
    expect(list[0]).toMatchObject({ key: "collection", count: 2, names: ["Simba", "Rex"] });
  });

  it("reports vaccinations overdue or due within 30 days, and ignores current ones", function () {
    var list = run({ vaccinations: [{ pet_id: "p1", next_due_on: "2026-10-01" }, { pet_id: "p2", next_due_on: "2026-11-10" }, { pet_id: "p2", next_due_on: "2027-06-01" }, { pet_id: "p1", next_due_on: null }] });
    expect(list[0]).toMatchObject({ key: "vaccinations", lapsed: 1, dueSoon: 1, target: "pets" });
  });

  it("reports low and out-of-stock items, but not inactive ones", function () {
    var list = run({ items: [{ active: true, quantity_on_hand: 0, reorder_level: 5 }, { active: true, quantity_on_hand: 3, reorder_level: 5 }, { active: true, quantity_on_hand: 50, reorder_level: 5 }, { active: false, quantity_on_hand: 0, reorder_level: 5 }] });
    expect(list[0]).toMatchObject({ key: "stock", count: 2, target: "supplies" });
  });

  it("flags booked appointments well past their start, and unfinished bookings from earlier days", function () {
    var list = run({ bookings: [
      booking({ id: "late", starts_at: at(0, 9), ends_at: at(0, 9, 45) }), booking({ id: "fine", starts_at: at(0, 11) }),
      booking({ id: "old", starts_at: at(-2, 9), ends_at: at(-2, 10), status: "in-progress" }), booking({ id: "done", starts_at: at(-2, 9), ends_at: at(-2, 10), status: "completed" }),
    ] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ key: "bookings", count: 2 });
    expect(list[0].title).toMatch(/1 not checked in yet/);
    expect(list[0].title).toMatch(/1 from earlier days/);
  });

  it("does not flag a booking that only just started", function () {
    expect(run({ bookings: [booking({ starts_at: at(0, 9, 55) })] })).toEqual([]);
  });
});

describe("activityFeed", function () {
  function feed(extra) {
    return activityFeed(Object.assign({ now: NOW, maps: MAPS, fmt: function (n) { return "KES " + n; }, recentBookings: [], recentStays: [], recentInvoices: [], payments: [], recentPets: [], recentProfiles: [] }, extra || {}));
  }

  it("is empty with no records (nothing is fabricated)", function () {
    expect(feed()).toEqual([]);
  });

  it("describes real events, newest first", function () {
    var list = feed({
      recentBookings: [{ id: "b1", pet_id: "p1", status: "completed", created_at: at(-1, 8), updated_at: at(0, 9, 30) }],
      recentStays: [{ id: "st1", pet_id: "p2", checked_in_at: at(0, 8), checked_out_at: null }],
      recentInvoices: [{ id: "i1", invoice_number: "INV-0004", total: 2500, issued_at: at(0, 9, 31) }],
      payments: [{ id: "pm1", amount: 2500, paid_at: at(0, 9, 45) }],
      recentPets: [{ id: "p9", name: "Milo", created_at: at(-3, 12) }],
      recentProfiles: [{ customer_id: "c1", created_at: at(-3, 11) }],
    });
    expect(list.map(function (e) { return e.text; })).toEqual([
      "Payment of KES 2500 recorded", "Invoice INV-0004 created (KES 2500)", "Service completed for Simba", "Rex checked in for boarding",
      "Booking created for Simba", "New pet registered: Milo", "New customer registered: Wanjiru Kamau",
    ]);
  });

  it("ignores events older than 7 days and caps the list", function () {
    expect(feed({ payments: [{ id: "old", amount: 1, paid_at: at(-9, 9) }] })).toEqual([]);
    var many = []; for (var i = 0; i < 20; i++) many.push({ id: "p" + i, amount: 1, paid_at: at(0, 8, i) });
    expect(feed({ payments: many })).toHaveLength(FEED_LIMIT);
  });

  it("does not report an unchanged booking as updated", function () {
    var list = feed({ recentBookings: [{ id: "b1", pet_id: "p1", status: "booked", created_at: at(0, 8), updated_at: at(0, 8) }] });
    expect(list.map(function (e) { return e.text; })).toEqual(["Booking created for Simba"]);
  });
});

describe("relativeTime / loadWindow", function () {
  it("words recent times plainly", function () {
    expect(relativeTime(new Date(2026, 9, 25, 9, 59, 30).toISOString(), NOW)).toBe("Just now");
    expect(relativeTime(at(0, 9, 59), NOW)).toBe("1 min ago");
    expect(relativeTime(at(0, 9, 30), NOW)).toBe("30 min ago");
    expect(relativeTime(at(0, 7, 0), NOW)).toBe("3 h ago");
    expect(relativeTime(at(-1, 14, 5), NOW)).toBe("Yesterday 14:05");
  });

  it("builds a one-day schedule window and a seven-day activity window", function () {
    var w = loadWindow(NOW);
    expect(w.todayKey).toBe(TODAY);
    expect(new Date(w.dayEnd).getTime() - new Date(w.dayStart).getTime()).toBe(addDays(new Date(w.dayStart), 1).getTime() - new Date(w.dayStart).getTime());
    expect(dateKey(new Date(w.weekAgo))).toBe("2026-10-18");
  });
});
