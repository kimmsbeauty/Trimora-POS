import { hasBookableService, hasWhatsAppNumber, pendingSetupSteps } from "./onlineBookingSetup";

var good = { id: "1", active: true, category: "Grooming", duration_minutes: 60 };

describe("hasBookableService", function () {
  it("needs an active, non-boarding service with a duration", function () {
    expect(hasBookableService([good])).toBe(true);
    expect(hasBookableService([])).toBe(false);
    expect(hasBookableService(undefined)).toBe(false);
    expect(hasBookableService([{ active: true, category: "Grooming", duration_minutes: null }])).toBe(false);
    expect(hasBookableService([{ active: true, category: "Boarding", duration_minutes: 60 }])).toBe(false);
    expect(hasBookableService([{ active: false, category: "Grooming", duration_minutes: 60 }])).toBe(false);
  });
});

describe("hasWhatsAppNumber", function () {
  it("is false for empty or blank numbers and true for a real one", function () {
    expect(hasWhatsAppNumber(null)).toBe(false);
    expect(hasWhatsAppNumber("")).toBe(false);
    expect(hasWhatsAppNumber("   ")).toBe(false);
    expect(hasWhatsAppNumber("0712 345 678")).toBe(true);
    expect(hasWhatsAppNumber("254712345678")).toBe(true);
  });
});

describe("pendingSetupSteps", function () {
  it("lists both steps for a new business, services first", function () {
    expect(pendingSetupSteps([], null).map(function (s) { return s.key; })).toEqual(["services", "whatsapp"]);
  });
  it("lists only what is missing", function () {
    expect(pendingSetupSteps([good], null).map(function (s) { return s.key; })).toEqual(["whatsapp"]);
    expect(pendingSetupSteps([], "0712345678").map(function (s) { return s.key; })).toEqual(["services"]);
  });
  it("is empty when the business is ready", function () {
    expect(pendingSetupSteps([good], "0712345678")).toEqual([]);
  });
});
