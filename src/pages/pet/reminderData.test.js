import { normalizePhone, whatsappUrl, smsUrl, bookingBasis, dedupeKey, buildMessage, buildCandidates, reminderErrorMessage, kindLabel } from "./reminderData";

var NOW = new Date("2026-10-25T08:00:00Z");
var TODAY = "2026-10-25";
var ann = { id: "c1", name: "Ann Wanjiru", phone: "0711 222 333", marketing_opt_out: false };
var optout = { id: "c2", name: "Opt Out", phone: "0722000111", marketing_opt_out: true };
var nophone = { id: "c3", name: "No Phone", phone: "", marketing_opt_out: false };
var pets = [
  { id: "p1", customer_id: "c1", name: "Rex", archived_at: null },
  { id: "p2", customer_id: "c2", name: "Zed", archived_at: null },
  { id: "p3", customer_id: "c3", name: "Nip", archived_at: null },
  { id: "p4", customer_id: "c1", name: "Old", archived_at: "2026-10-01T00:00:00Z" },
];
function run(extra, opts) {
  return buildCandidates(Object.assign({ now: NOW, today: TODAY, customers: [ann, optout, nophone], pets: pets, bookings: [], vaccinations: [], stays: [], reminders: [] }, extra), opts);
}

describe("phone numbers and links", function () {
  it("normalises Kenyan formats", function () {
    expect(normalizePhone("0711 222 333")).toBe("254711222333");
    expect(normalizePhone("+254 711 222 333")).toBe("254711222333");
    expect(normalizePhone("254711222333")).toBe("254711222333");
    expect(normalizePhone("711222333")).toBe("254711222333");
    expect(normalizePhone("0112345678")).toBe("254112345678");
  });
  it("keeps explicit international numbers and rejects junk", function () {
    expect(normalizePhone("+44 7700 900123")).toBe("447700900123");
    expect(normalizePhone("")).toBeNull(); expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("12345")).toBeNull(); expect(normalizePhone("0211222333")).toBeNull();
  });
  it("builds encoded WhatsApp and SMS links, or null without a number", function () {
    expect(whatsappUrl("0711222333", "Hi & bye")).toBe("https://wa.me/254711222333?text=Hi%20%26%20bye");
    expect(smsUrl("0711222333", "Hi")).toBe("sms:+254711222333?body=Hi");
    expect(whatsappUrl("nope", "x")).toBeNull();
  });
});

describe("stable keys match the database format", function () {
  it("uses UTC minutes for bookings", function () {
    expect(bookingBasis("2026-12-01T12:00:00+03:00")).toBe("2026-12-01T09:00");
    expect(dedupeKey("appointment", "abc", "2026-12-01T09:00")).toBe("appointment:abc:2026-12-01T09:00");
  });
});

describe("buildCandidates", function () {
  it("lists booked appointments within the window only", function () {
    var c = run({ bookings: [
      { id: "b1", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-26T09:00:00Z", status: "booked" },
      { id: "b2", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-29T09:00:00Z", status: "booked" },   // too far
      { id: "b3", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-26T11:00:00Z", status: "cancelled" },
      { id: "b4", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-24T09:00:00Z", status: "booked" },    // already started
    ] });
    expect(c.map(function (x) { return x.sourceId; })).toEqual(["b1"]);
    expect(c[0].kind).toBe("appointment"); expect(c[0].blocked).toBeNull();
    expect(c[0].key).toBe("appointment:b1:2026-10-26T09:00");
  });
  it("respects the configurable window", function () {
    var b = [{ id: "b2", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-29T09:00:00Z", status: "booked" }];
    expect(run({ bookings: b }).length).toBe(0);
    expect(run({ bookings: b }, { appointmentHours: 120 }).length).toBe(1);
  });
  it("lists vaccinations due soon and overdue, not far-future or undated", function () {
    var c = run({ vaccinations: [
      { id: "v1", pet_id: "p1", vaccine: "Rabies", next_due_on: "2026-11-01" },
      { id: "v2", pet_id: "p1", vaccine: "Booster", next_due_on: "2026-10-01" },
      { id: "v3", pet_id: "p1", vaccine: "Later", next_due_on: "2027-06-01" },
      { id: "v4", pet_id: "p1", vaccine: "None", next_due_on: null },
    ] });
    expect(c.map(function (x) { return x.sourceId; }).sort()).toEqual(["v1", "v2"]);
    expect(c.filter(function (x) { return x.overdue; }).length).toBe(1);
  });
  it("lists occupied stays due out by tomorrow, including overdue", function () {
    var c = run({ stays: [
      { id: "s1", customer_id: "c1", pet_id: "p1", status: "occupied", check_out_on: "2026-10-26" },
      { id: "s2", customer_id: "c1", pet_id: "p1", status: "occupied", check_out_on: "2026-10-23" },
      { id: "s3", customer_id: "c1", pet_id: "p1", status: "occupied", check_out_on: "2026-10-30" },
      { id: "s4", customer_id: "c1", pet_id: "p1", status: "reserved", check_out_on: "2026-10-26" },
    ] });
    expect(c.map(function (x) { return x.sourceId; }).sort()).toEqual(["s1", "s2"]);
  });
  it("lists recent no-shows and quiet customers needing a follow-up", function () {
    var c = run({ bookings: [
      { id: "n1", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-22T09:00:00Z", status: "no-show" },
      { id: "f1", customer_id: "c1", pet_id: "p1", starts_at: "2026-09-10T09:00:00Z", status: "completed" },
    ] });
    expect(c.map(function (x) { return x.kind; }).sort()).toEqual(["followup", "missed_appointment"]);
  });
  it("skips a follow-up when the pet already has a later booking", function () {
    var c = run({ bookings: [
      { id: "f1", customer_id: "c1", pet_id: "p1", starts_at: "2026-09-10T09:00:00Z", status: "completed" },
      { id: "f2", customer_id: "c1", pet_id: "p1", starts_at: "2026-11-20T09:00:00Z", status: "booked" },
    ] });
    expect(c.length).toBe(0);
  });
  it("blocks opted-out follow-ups and customers without a phone, never lists archived pets", function () {
    var c = run({ bookings: [
      { id: "f9", customer_id: "c2", pet_id: "p2", starts_at: "2026-09-10T09:00:00Z", status: "completed" },
      { id: "a9", customer_id: "c3", pet_id: "p3", starts_at: "2026-10-26T09:00:00Z", status: "booked" },
      { id: "x9", customer_id: "c1", pet_id: "p4", starts_at: "2026-10-26T09:00:00Z", status: "booked" },
    ] });
    expect(c.length).toBe(2);
    expect(c.filter(function (x) { return x.sourceId === "f9"; })[0].blocked).toMatch(/opted out/i);
    expect(c.filter(function (x) { return x.sourceId === "a9"; })[0].blocked).toMatch(/phone/i);
  });
  it("hides sent and skipped reminders but keeps pending and failed ones", function () {
    var b = [
      { id: "b1", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-26T09:00:00Z", status: "booked" },
      { id: "b5", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-26T10:00:00Z", status: "booked" },
      { id: "b6", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-26T11:00:00Z", status: "booked" },
    ];
    var rem = [
      { id: "r1", dedupe_key: "appointment:b1:2026-10-26T09:00", status: "sent" },
      { id: "r5", dedupe_key: "appointment:b5:2026-10-26T10:00", status: "pending" },
      { id: "r6", dedupe_key: "appointment:b6:2026-10-26T11:00", status: "cancelled" },
    ];
    var c = run({ bookings: b, reminders: rem });
    expect(c.map(function (x) { return x.sourceId; })).toEqual(["b5"]);
    expect(c[0].reminder.id).toBe("r5");
  });
  it("a rescheduled booking is due again even if the old time was sent", function () {
    var c = run({ bookings: [{ id: "b1", customer_id: "c1", pet_id: "p1", starts_at: "2026-10-26T15:00:00Z", status: "booked" }],
      reminders: [{ id: "r1", dedupe_key: "appointment:b1:2026-10-26T09:00", status: "sent" }] });
    expect(c.length).toBe(1);
  });
});

describe("messages and errors", function () {
  it("addresses the customer by first name and names the pet and business", function () {
    var m = buildMessage({ kind: "appointment", customer: ann, pet: pets[0], when: "2026-10-26T09:00:00Z" }, "Paws & Co");
    expect(m).toMatch(/^Hi Ann,/); expect(m).toMatch(/Rex/); expect(m).toMatch(/Paws & Co/);
    expect(m.length).toBeLessThan(600);
  });
  it("words overdue vaccinations differently", function () {
    var due = buildMessage({ kind: "vaccination", customer: ann, pet: pets[0], when: "2026-11-01", detail: "Rabies" }, "Paws");
    var late = buildMessage({ kind: "vaccination", customer: ann, pet: pets[0], when: "2026-10-01", detail: "Rabies", overdue: true }, "Paws");
    expect(due).toMatch(/is due on/); expect(late).toMatch(/was due on/);
  });
  it("every kind has a message and a label", function () {
    ["appointment", "vaccination", "boarding_collection", "missed_appointment", "followup"].forEach(function (k) {
      expect(buildMessage({ kind: k, customer: ann, pet: pets[0], when: "2026-10-26" }, "Paws").length).toBeGreaterThan(20);
      expect(kindLabel(k)).not.toBe(k);
    });
  });
  it("translates database errors", function () {
    expect(reminderErrorMessage("MAX_ATTEMPTS")).toMatch(/3 times/);
    expect(reminderErrorMessage("CUSTOMER_OPTED_OUT")).toMatch(/opted out/);
    expect(reminderErrorMessage("something odd")).toMatch(/try again/);
  });
});
