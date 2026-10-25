import { describe, it, expect } from "vitest";
import { serviceBlockMessage, petBlockMessage, historyTotal, unknownDeleteFailure, HISTORY_CAP } from "./deleteGuards";

describe("serviceBlockMessage", function () {
  it("is empty when the service has no history", function () {
    expect(serviceBlockMessage("Full Groom", { bookings: 0, invoices: 0 })).toBe("");
    expect(serviceBlockMessage("Full Groom", null)).toBe("");
  });
  it("names the history and points to Deactivate", function () {
    var m = serviceBlockMessage("Full Groom", { bookings: 3, invoices: 1 });
    expect(m).toMatch(/3 bookings and 1 invoice line/);
    expect(m).toMatch(/Deactivate it instead/);
    expect(m).toMatch(/history/);
  });
  it("uses singular wording and a single clause", function () {
    expect(serviceBlockMessage("Nail Trim", { bookings: 1, invoices: 0 })).toMatch(/used in 1 booking,/);
  });
  it("caps very large counts", function () {
    expect(serviceBlockMessage("X", { bookings: HISTORY_CAP + 1, invoices: 0 })).toMatch(/more than 100 bookings/);
  });
});

describe("petBlockMessage", function () {
  it("is empty without history", function () { expect(petBlockMessage("Rex", { bookings: 0, stays: 0, invoices: 0 })).toBe(""); });
  it("lists bookings, stays and invoices and says archiving is not available", function () {
    var m = petBlockMessage("Rex", { bookings: 2, stays: 1, invoices: 4 });
    expect(m).toMatch(/Rex has 2 bookings, 1 boarding stay and 4 invoices/);
    expect(m).toMatch(/kept for your history and finances/);
    expect(m).toMatch(/Archive the pet instead/);
    expect(m).toMatch(/restore it later/);
  });
});

describe("helpers", function () {
  it("totals history", function () { expect(historyTotal({ bookings: 1, stays: 2, invoices: 3 })).toBe(6); expect(historyTotal(null)).toBe(0); });
  it("has an honest fallback", function () { expect(unknownDeleteFailure("pet")).toMatch(/Couldn't delete the pet/); });
});
