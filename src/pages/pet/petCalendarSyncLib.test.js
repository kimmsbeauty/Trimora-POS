// Unit tests for the pure helpers of the pet-calendar-sync edge function: exactly what goes to Google.
import {
  validCalendarId, eventIdFor, shortRef, addDays, prettyDate, localParts, shouldRemove, eventTitle,
  bookingEvent, stayEvent, contentHash, classifyGoogleError, parseServiceAccount, base64url, pemToDer, safeEqual,
} from "../../../supabase/functions/pet-calendar-sync/lib.js";

var BOOKING = { id: "12345678-aaaa-bbbb-cccc-ddddeeeeffff", salon_id: "s1", staff_id: "st1", starts_at: "2026-11-02T06:00:00+00:00", ends_at: "2026-11-02T07:30:00+00:00", status: "confirmed", notes: "ALLERGIC TO CHICKEN, ON MEDS" };
var STAY = { id: "abcdef12-0000-0000-0000-000000000000", salon_id: "s1", check_in_on: "2026-11-02", check_out_on: "2026-11-05", status: "reserved", service_name: "Standard boarding", feeding_notes: "SECRET FEEDING", care_notes: "SECRET CARE", checked_in_at: null, checked_out_at: null };

describe("event titles", function () {
  it("uses the agreed format and copes with missing names", function () {
    expect(eventTitle("Grooming", "Bella", "Jane Wanjiru")).toBe("Grooming – Bella (Jane Wanjiru)");
    expect(eventTitle("Boarding", "Rex", "Tom")).toBe("Boarding – Rex (Tom)");
    expect(eventTitle("Grooming", "Bella", "")).toBe("Grooming – Bella");
    expect(eventTitle("Grooming", null, "Jane")).toBe("Grooming – Pet (Jane)");
  });
  it("keeps one line and a sensible length", function () {
    var t = eventTitle("Grooming", "A\nB   C", "x".repeat(200));
    expect(t.indexOf("\n")).toBe(-1);
    expect(t.length).toBeLessThan(150);
  });
});

describe("grooming events", function () {
  var ev = bookingEvent(BOOKING, { petName: "Bella", ownerName: "Jane Wanjiru", groomerName: "Amina", services: ["Full groom", "Nail trim"], timezone: "Africa/Nairobi" });
  it("is a timed event with its scheduled start and end", function () {
    expect(ev.summary).toBe("Grooming – Bella (Jane Wanjiru)");
    expect(ev.start).toEqual({ dateTime: "2026-11-02T06:00:00.000Z", timeZone: "Africa/Nairobi" });
    expect(ev.end).toEqual({ dateTime: "2026-11-02T07:30:00.000Z", timeZone: "Africa/Nairobi" });
  });
  it("describes the service, groomer, status and reference", function () {
    expect(ev.description).toContain("Service: Full groom, Nail trim");
    expect(ev.description).toContain("Groomer: Amina");
    expect(ev.description).toContain("Status: Confirmed");
    expect(ev.description).toContain("Booking ref: 12345678");
  });
  it("never includes the booking notes", function () {
    expect(JSON.stringify(ev)).not.toMatch(/ALLERGIC|MEDS/);
  });
  it("keeps the groomer id in hidden metadata for per-groomer calendars later", function () {
    expect(ev.extendedProperties.private).toEqual({ trimora_source: "booking", trimora_id: BOOKING.id, trimora_salon: "s1", trimora_staff: "st1" });
  });
  it("says so when there is no groomer or service", function () {
    var e2 = bookingEvent(Object.assign({}, BOOKING, { staff_id: null }), { petName: "Bella", ownerName: "J", services: [] });
    expect(e2.description).toContain("Groomer: Unassigned");
    expect(e2.description).toContain("Service: Not specified");
    expect(e2.extendedProperties.private.trimora_staff).toBe("");
  });
  it("never invites anyone", function () {
    expect(ev.attendees).toBeUndefined();
  });
});

describe("boarding events", function () {
  var ev = stayEvent(STAY, { petName: "Rex", ownerName: "Tom", kennelName: "Kennel 3" });
  it("is an all-day event that shows both the check-in and check-out days", function () {
    expect(ev.summary).toBe("Boarding – Rex (Tom)");
    expect(ev.start).toEqual({ date: "2026-11-02" });
    expect(ev.end).toEqual({ date: "2026-11-06" });      // Google's all-day end is exclusive
  });
  it("titles a same-day stay as Day camp and an overnight stay as Boarding", function () {
    var day = stayEvent(Object.assign({}, STAY, { check_out_on: "2026-11-02" }), { petName: "Rex", ownerName: "Tom" });
    expect(day.summary).toBe("Day camp – Rex (Tom)");
    expect(day.description).toContain("Day camp ref:");
    expect(ev.summary).toBe("Boarding – Rex (Tom)");
    expect(ev.description).toContain("Boarding ref:");
  });
  it("shows a same-day stay as one day", function () {
    var e = stayEvent(Object.assign({}, STAY, { check_out_on: "2026-11-02" }), {});
    expect(e.start).toEqual({ date: "2026-11-02" }); expect(e.end).toEqual({ date: "2026-11-03" });
  });
  it("rolls month and year ends correctly", function () {
    expect(stayEvent(Object.assign({}, STAY, { check_in_on: "2026-12-30", check_out_on: "2026-12-31" }), {}).end).toEqual({ date: "2027-01-01" });
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("describes dates, kennel, service, status and reference", function () {
    expect(ev.description).toContain("Check-in: 2 Nov 2026");
    expect(ev.description).toContain("Check-out: 5 Nov 2026");
    expect(ev.description).toContain("Kennel: Kennel 3");
    expect(ev.description).toContain("Service: Standard boarding");
    expect(ev.description).toContain("Status: Reserved");
    expect(ev.description).toContain("Boarding ref: ABCDEF12");
  });
  it("adds the real check-in / check-out time in the business timezone once they exist", function () {
    var e = stayEvent(Object.assign({}, STAY, { status: "checked-out", checked_in_at: "2026-11-02T06:30:00Z", checked_out_at: "2026-11-05T14:05:00Z" }), { timezone: "Africa/Nairobi" });
    expect(e.description).toContain("Checked in at: 2 Nov 2026 09:30");
    expect(e.description).toContain("Checked out at: 5 Nov 2026 17:05");
    expect(e.description).toContain("Status: Checked out");
  });
  it("never includes feeding or care notes", function () {
    expect(JSON.stringify(ev)).not.toMatch(/SECRET/);
  });
});

describe("which items stay on the calendar", function () {
  it("removes cancelled and no-show bookings, and cancelled stays", function () {
    expect(shouldRemove("booking", { status: "cancelled" })).toBe(true);
    expect(shouldRemove("booking", { status: "no-show" })).toBe(true);
    expect(shouldRemove("stay", { status: "cancelled" })).toBe(true);
  });
  it("keeps pending, active and completed ones", function () {
    ["pending", "confirmed", "checked-in", "in-progress", "completed"].forEach(function (s) { expect(shouldRemove("booking", { status: s })).toBe(false); });
    ["reserved", "occupied", "checked-out"].forEach(function (s) { expect(shouldRemove("stay", { status: s })).toBe(false); });
  });
  it("removes an item that no longer exists", function () {
    expect(shouldRemove("booking", null)).toBe(true);
  });
});

describe("ids, hashing and helpers", function () {
  it("makes Google-valid, stable, distinct event ids", function () {
    var a = eventIdFor("booking", BOOKING.id); var b = eventIdFor("stay", BOOKING.id);
    expect(a).toMatch(/^[a-v0-9]{5,1024}$/); expect(b).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(a).not.toBe(b); expect(eventIdFor("booking", BOOKING.id)).toBe(a);
  });
  it("fingerprints only what is sent, so a note edit changes nothing", function () {
    var base = { petName: "Bella", ownerName: "Jane", groomerName: "A", services: ["Bath"] };
    var h1 = contentHash(bookingEvent(BOOKING, base));
    expect(contentHash(bookingEvent(Object.assign({}, BOOKING, { notes: "something else" }), base))).toBe(h1);
    expect(contentHash(bookingEvent(Object.assign({}, BOOKING, { starts_at: "2026-11-02T08:00:00Z" }), base))).not.toBe(h1);
    expect(contentHash(bookingEvent(BOOKING, Object.assign({}, base, { groomerName: "B" })))).not.toBe(h1);
  });
  it("validates calendar ids", function () {
    expect(validCalendarId("pawpals@group.calendar.google.com")).toBe(true);
    expect(validCalendarId("jane@gmail.com")).toBe(true);
    ["", "ab", "has space@x.com", "a/b@x.com", null].forEach(function (x) { expect(validCalendarId(x)).toBe(false); });
  });
  it("formats dates and local times", function () {
    expect(prettyDate("2026-01-09")).toBe("9 Jan 2026");
    expect(shortRef("abcdef12-3456")).toBe("ABCDEF12");
    expect(localParts("2026-11-02T21:30:00Z", "Africa/Nairobi")).toEqual({ date: "2026-11-03", time: "00:30" });
  });
});

describe("google errors and credentials", function () {
  it("maps Google's answers to short codes", function () {
    expect(classifyGoogleError(404)).toBe("CALENDAR_NOT_FOUND");
    expect(classifyGoogleError(403, "forbiddenForNonOrganizer")).toBe("CALENDAR_FORBIDDEN");
    expect(classifyGoogleError(403, "rateLimitExceeded")).toBe("RATE_LIMITED");
    expect(classifyGoogleError(429)).toBe("RATE_LIMITED");
    expect(classifyGoogleError(401)).toBe("GOOGLE_AUTH");
    expect(classifyGoogleError(409)).toBe("CONFLICT");
    expect(classifyGoogleError(410)).toBe("GONE");
    expect(classifyGoogleError(503)).toBe("GOOGLE_UNAVAILABLE");
    expect(classifyGoogleError(400)).toBe("GOOGLE_ERROR");
  });
  it("accepts a service-account key only if it has the two fields it needs", function () {
    var ok = JSON.stringify({ client_email: "x@y.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n", other: 1 });
    expect(parseServiceAccount(ok)).toEqual({ client_email: "x@y.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n" });
    expect(parseServiceAccount("")).toBeNull();
    expect(parseServiceAccount("not json")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ client_email: "x" }))).toBeNull();
  });
  it("encodes for the signed token", function () {
    expect(base64url("{\"alg\":\"RS256\"}")).toBe("eyJhbGciOiJSUzI1NiJ9");
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe("-__-");
    expect(Array.from(pemToDer("-----BEGIN PRIVATE KEY-----\nAQID\n-----END PRIVATE KEY-----"))).toEqual([1, 2, 3]);
  });
  it("compares the scheduler secret without leaking length or content", function () {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
    expect(safeEqual(null, "")).toBe(true);
  });
});
