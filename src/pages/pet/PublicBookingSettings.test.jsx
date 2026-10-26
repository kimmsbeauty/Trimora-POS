import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));
vi.mock("../../lib/SalonContext", () => ({ useSalon: function () { return { id: "s1", slug: "paws" }; } }));

import PublicBookingSettings from "./PublicBookingSettings";

beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

describe("PublicBookingSettings", function () {
  it("starts switched off with sensible defaults and shows the booking link", async function () {
    mockDb.mockResolvedValue([]);
    render(<PublicBookingSettings />);
    var box = await screen.findByLabelText("Accept online booking requests", { exact: false });
    expect(box.checked).toBe(false);
    expect(screen.getByText(/\/paws\/pet\/book$/)).toBeTruthy();
    expect(screen.getByText(/shows "not available" until you switch/)).toBeTruthy();
    expect(screen.getByLabelText("Monday open").checked).toBe(true);
    expect(screen.getByLabelText("Sunday open").checked).toBe(false);
  });

  it("saves the switch, hours and numbers through the database function", async function () {
    mockDb.mockResolvedValue([]); mockRpc.mockResolvedValue(null);
    render(<PublicBookingSettings />);
    fireEvent.click(await screen.findByLabelText("Accept online booking requests", { exact: false }));
    fireEvent.change(screen.getByLabelText("Monday closes"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByLabelText("Sunday open"));
    fireEvent.change(screen.getByLabelText("Appointments at the same time"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save online booking settings" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalled(); });
    var args = mockRpc.mock.calls[0];
    expect(args[0]).toBe("pet_save_public_booking_settings");
    expect(args[1].p_enabled).toBe(true); expect(args[1].p_capacity).toBe(2); expect(args[1].p_slot_minutes).toBe(30); expect(args[1].p_timezone).toBe("Africa/Nairobi");
    expect(args[1].p_hours.filter(function (h) { return h.weekday === 1; })[0]).toEqual({ weekday: 1, open: "09:00", close: "18:00" });
    expect(args[1].p_hours.filter(function (h) { return h.weekday === 0; }).length).toBe(1);
    expect(await screen.findByText("Online booking settings saved.")).toBeTruthy();
  });

  it("refuses to switch on with every day closed, and bad times, without calling the database", async function () {
    mockDb.mockResolvedValue([]);
    render(<PublicBookingSettings />);
    fireEvent.click(await screen.findByLabelText("Accept online booking requests", { exact: false }));
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].forEach(function (d) { fireEvent.click(screen.getByLabelText(d + " open")); });
    fireEvent.click(screen.getByRole("button", { name: "Save online booking settings" }));
    expect(await screen.findByText(/at least one open day/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Monday open"));
    fireEvent.change(screen.getByLabelText("Monday closes"), { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save online booking settings" }));
    expect(await screen.findByText(/closing time after/i)).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("shows the database's refusal in plain words", async function () {
    mockDb.mockResolvedValue([]); mockRpc.mockResolvedValue({ error: "INVALID_TIMEZONE" });
    render(<PublicBookingSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Save online booking settings" }));
    expect(await screen.findByText(/time zone isn't recognised/i)).toBeTruthy();
  });

  it("says a database update is needed when the table is missing", async function () {
    mockDb.mockResolvedValue(null);
    render(<PublicBookingSettings />);
    expect(await screen.findByText(/apply migration 104/)).toBeTruthy();
  });
});
