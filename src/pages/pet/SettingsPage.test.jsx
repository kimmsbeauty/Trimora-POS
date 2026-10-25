import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));
vi.mock("../../lib/SalonContext", () => ({ useSalon: function () { return { id: "s1", name: "Paws & Co", logo_url: "", tax_enabled: false, tax_rate: 16 }; } }));

import SettingsPage from "./SettingsPage";

describe("SettingsPage", function () {
  // Business-settings writes only (the reminder card also reads its own table on mount).
  function writes() { return mockDb.mock.calls.filter(function (c) { return c[0] !== "GET"; }); }
  // db(): GET of reminder settings succeeds with an empty list; everything else is `other`.
  function dbReturns(other, reminderRows) {
    mockDb.mockImplementation(function (method, table) {
      if (method === "GET" && table === "pet_reminder_settings") return Promise.resolve(reminderRows || []);
      return Promise.resolve(other);
    });
  }
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); dbReturns([{}]); });

  it("rejects a non-https logo link without saving", async function () {
    render(<SettingsPage onSaved={function () {}} />);
    fireEvent.change(screen.getByLabelText("Logo link (https://…)"), { target: { value: "http://x.com/a.png" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/must start with https/)).toBeTruthy();
    expect(writes().length).toBe(0);
  });

  it("saves logo, tax and footer to this business's settings row", async function () {
    dbReturns([{}]);
    var onSaved = vi.fn();
    render(<SettingsPage onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Logo link (https://…)"), { target: { value: "https://example.com/logo.png" } });
    fireEvent.click(screen.getByLabelText(/Prices include VAT/));
    fireEvent.change(screen.getByLabelText("KRA PIN"), { target: { value: "p0123x" } });
    fireEvent.change(screen.getByLabelText(/Message at the bottom/), { target: { value: "Thank you!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(function () { expect(writes().length).toBe(1); });
    var call = writes()[0];
    expect(call[0]).toBe("PATCH"); expect(call[1]).toBe("salon_settings"); expect(call[3]).toBe("?salon_id=eq.s1");
    expect(call[2]).toMatchObject({ logo_url: "https://example.com/logo.png", tax_enabled: true, tax_rate: 16, tax_pin: "P0123X", receipt_footer_message: "Thank you!" });
    await waitFor(function () { expect(onSaved).toHaveBeenCalled(); }, { timeout: 2000 });
  });

  it("shows an error and does not reload when saving fails", async function () {
    dbReturns(null);
    var onSaved = vi.fn();
    render(<SettingsPage onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  describe("reminder windows", function () {
    it("explains the six-month default is only a reminder window", async function () {
      render(<SettingsPage onSaved={function () {}} />);
      expect(await screen.findByText(/No custom windows yet: every record type uses 180 days/)).toBeTruthy();
      expect(screen.getByText(/does not mean anything is due every six months/)).toBeTruthy();
      expect(screen.getByText(/flagged separately as overdue/)).toBeTruthy();
    });
    it("lists existing windows and falls back honestly when they can't be loaded", async function () {
      dbReturns([{}], [{ id: "r1", record_type: "Rabies", window_days: 30 }]);
      var first = render(<SettingsPage onSaved={function () {}} />);
      expect(await screen.findByText(/Rabies/)).toBeTruthy();
      expect(screen.getByText(/30 days/)).toBeTruthy();
      first.unmount();
      mockDb.mockImplementation(function () { return Promise.resolve(null); });
      render(<SettingsPage onSaved={function () {}} />);
      expect(await screen.findByText(/Couldn't load your reminder settings, so the 180-day default is being used/)).toBeTruthy();
    });
    it("validates before calling the database", async function () {
      render(<SettingsPage onSaved={function () {}} />);
      await screen.findByText(/No custom windows yet/);
      fireEvent.change(screen.getByLabelText("Record type"), { target: { value: "Rabies" } });
      fireEvent.change(screen.getByLabelText("Remind (days before)"), { target: { value: "0" } });
      fireEvent.click(screen.getByRole("button", { name: "Add reminder window" }));
      expect(await screen.findByText(/whole number of days from 1 to 730/)).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
    });
    it("saves through the database function and reloads", async function () {
      mockRpc.mockResolvedValue({ data: "id1" });
      render(<SettingsPage onSaved={function () {}} />);
      await screen.findByText(/No custom windows yet/);
      fireEvent.change(screen.getByLabelText("Record type"), { target: { value: " Rabies " } });
      fireEvent.change(screen.getByLabelText("Remind (days before)"), { target: { value: "90" } });
      fireEvent.click(screen.getByRole("button", { name: "Add reminder window" }));
      await waitFor(function () { expect(mockRpc).toHaveBeenCalled(); });
      expect(mockRpc.mock.calls[0]).toEqual(["pet_save_reminder_setting", { p_record_type: "Rabies", p_window_days: 90 }]);
      await waitFor(function () { expect(mockDb.mock.calls.filter(function (c) { return c[1] === "pet_reminder_settings"; }).length).toBe(2); });
    });
    it("shows a friendly message when the database refuses", async function () {
      mockRpc.mockResolvedValue({ error: "INVALID_WINDOW" });
      render(<SettingsPage onSaved={function () {}} />);
      await screen.findByText(/No custom windows yet/);
      fireEvent.change(screen.getByLabelText("Record type"), { target: { value: "Rabies" } });
      fireEvent.change(screen.getByLabelText("Remind (days before)"), { target: { value: "90" } });
      fireEvent.click(screen.getByRole("button", { name: "Add reminder window" }));
      expect(await screen.findByText(/whole number of days from 1 to 730/)).toBeTruthy();
    });
    it("removes a window through the database function", async function () {
      dbReturns([{}], [{ id: "r1", record_type: "Rabies", window_days: 30 }]);
      mockRpc.mockResolvedValue({ data: true });
      render(<SettingsPage onSaved={function () {}} />);
      fireEvent.click(await screen.findByLabelText("Remove reminder window for Rabies"));
      await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_delete_reminder_setting", { p_id: "r1" }); });
    });
  });
});
