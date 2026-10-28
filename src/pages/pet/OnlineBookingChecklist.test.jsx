import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

var mockDb = vi.fn();
var mockSalon = { contact_phone: null };
vi.mock("../../lib/db", function () { return { db: function () { return mockDb.apply(null, arguments); } }; });
vi.mock("../../lib/SalonContext", function () { return { useSalon: function () { return mockSalon; } }; });

import OnlineBookingChecklist from "./OnlineBookingChecklist";

var GOOD = { id: "s1", active: true, category: "Grooming", duration_minutes: 45 };
function setup(opts) {
  opts = opts || {};
  mockSalon = { contact_phone: opts.phone === undefined ? null : opts.phone };
  mockDb.mockImplementation(function (method, table) {
    if (table === "pet_services") return Promise.resolve(opts.services === undefined ? [] : opts.services);
    if (table === "pet_public_booking_settings") return Promise.resolve(opts.settings === undefined ? [{ enabled: true }] : opts.settings);
    return Promise.resolve(null);
  });
  var onGo = vi.fn();
  var view = render(<OnlineBookingChecklist allowed={opts.allowed || { grooming: true, settings: true }} onGo={onGo} />);
  return { onGo: onGo, view: view };
}

describe("OnlineBookingChecklist", function () {
  beforeEach(function () { mockDb.mockReset(); });

  it("shows both steps for a business with no services and no WhatsApp number", async function () {
    setup();
    expect(await screen.findByText("Online booking setup")).toBeInTheDocument();
    expect(screen.getByText("Add a service with a duration")).toBeInTheDocument();
    expect(screen.getByText("Add your WhatsApp number")).toBeInTheDocument();
  });

  it("shows only the step that is still missing", async function () {
    setup({ services: [GOOD] });
    expect(await screen.findByText("Add your WhatsApp number")).toBeInTheDocument();
    expect(screen.queryByText("Add a service with a duration")).toBeNull();
  });

  it("still asks for a duration when the only services have none (or are boarding)", async function () {
    setup({ phone: "0712345678", services: [{ id: "a", active: true, category: "Grooming", duration_minutes: null }, { id: "b", active: true, category: "Boarding", duration_minutes: 60 }] });
    expect(await screen.findByText("Add a service with a duration")).toBeInTheDocument();
    expect(screen.queryByText("Add your WhatsApp number")).toBeNull();
  });

  it("shows nothing once both are done", async function () {
    setup({ phone: "0712345678", services: [GOOD] });
    await waitFor(function () { expect(mockDb).toHaveBeenCalled(); });
    await waitFor(function () { expect(screen.queryByText("Online booking setup")).toBeNull(); });
  });

  it("shows nothing when online booking is switched off", async function () {
    setup({ settings: [{ enabled: false }] });
    await waitFor(function () { expect(mockDb).toHaveBeenCalledTimes(2); });
    expect(screen.queryByText("Online booking setup")).toBeNull();
  });

  it("shows nothing, and does not guess, when services can't be loaded", async function () {
    setup({ services: null });
    await waitFor(function () { expect(mockDb).toHaveBeenCalledTimes(2); });
    expect(screen.queryByText("Online booking setup")).toBeNull();
  });

  it("links each step to the screen where it is fixed", async function () {
    var h = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Add a service with a duration" }));
    fireEvent.click(screen.getByRole("button", { name: "Add your WhatsApp number" }));
    expect(h.onGo.mock.calls.map(function (c) { return c[0]; })).toEqual(["grooming", "settings"]);
  });

  it("tells staff without Settings access to ask an administrator instead of linking", async function () {
    setup({ services: [GOOD], allowed: { grooming: true } });
    expect(await screen.findByText("Ask an administrator")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add your WhatsApp number" })).toBeNull();
  });
});
