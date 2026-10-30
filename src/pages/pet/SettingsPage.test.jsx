import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
var mockSalon = { id: "s1", name: "Paws & Co", logo_url: "", tax_enabled: false, tax_rate: 16 };
vi.mock("../../lib/db", () => ({ db: function () { return mockDb.apply(null, arguments); }, dbRpcAuth: function () { return mockRpc.apply(null, arguments); } }));
vi.mock("../../lib/SalonContext", () => ({ useSalon: function () { return mockSalon; } }));

import SettingsPage from "./SettingsPage";

describe("SettingsPage", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); mockRpc.mockResolvedValue({ data: 0 }); mockSalon = { id: "s1", name: "Paws & Co", logo_url: "", tax_enabled: false, tax_rate: 16 }; });

  it("rejects a non-https logo link without saving", async function () {
    render(<SettingsPage onSaved={function () {}} />);
    fireEvent.change(screen.getByLabelText("Logo link (https://…)"), { target: { value: "http://x.com/a.png" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/must start with https/)).toBeTruthy();
    expect(mockDb.mock.calls.filter(function (c) { return c[1] === "salon_settings"; }).length).toBe(0);
  });

  it("saves logo, tax and footer to this business's settings row", async function () {
    mockDb.mockResolvedValue([{}]);
    var onSaved = vi.fn();
    render(<SettingsPage onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Logo link (https://…)"), { target: { value: "https://example.com/logo.png" } });
    fireEvent.click(screen.getByLabelText(/Prices include VAT/));
    fireEvent.change(screen.getByLabelText("KRA PIN"), { target: { value: "p0123x" } });
    fireEvent.change(screen.getByLabelText(/Message at the bottom/), { target: { value: "Thank you!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(function () { expect(mockDb.mock.calls.some(function (c) { return c[1] === "salon_settings"; })).toBe(true); });
    var call = mockDb.mock.calls.filter(function (c) { return c[1] === "salon_settings"; })[0];
    expect(call[0]).toBe("PATCH"); expect(call[1]).toBe("salon_settings"); expect(call[3]).toBe("?salon_id=eq.s1");
    expect(call[2]).toMatchObject({ logo_url: "https://example.com/logo.png", tax_enabled: true, tax_rate: 16, tax_pin: "P0123X", receipt_footer_message: "Thank you!" });
    await waitFor(function () { expect(onSaved).toHaveBeenCalled(); }, { timeout: 2000 });
  });

  it("shows an error and does not reload when saving fails", async function () {
    mockDb.mockResolvedValue(null);
    var onSaved = vi.fn();
    render(<SettingsPage onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  describe("phone numbers (admin PIN), business details and invoice prefix (migrations 117, 118)", function () {
    function addNumbers(nums) {
      nums.forEach(function (n) {
        fireEvent.change(screen.getByLabelText("New phone number"), { target: { value: n } });
        fireEvent.click(screen.getByRole("button", { name: "Add number" }));
      });
    }
    function enterPin(pin) {
      fireEvent.change(screen.getByLabelText("Admin PIN"), { target: { value: pin } });
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    }

    it("starts empty with nothing built in, and previews the number from the first word of the business name", function () {
      render(<SettingsPage onSaved={function () {}} />);
      expect(screen.getByText(/No numbers yet/)).toBeTruthy();
      expect(screen.getByText("PAWS-INV-0001")).toBeTruthy();
    });

    it("asks for the admin PIN, then saves any number of numbers (each switchable) in one call", async function () {
      mockDb.mockResolvedValue([{}]);
      render(<SettingsPage onSaved={function () {}} />);
      addNumbers(["0711111111", "0722222222", "0733333333", "0744444444"]);
      fireEvent.click(screen.getByLabelText("Show 0722222222 on invoices")); // switch one off
      fireEvent.change(screen.getByLabelText("Invoice number prefix (optional)"), { target: { value: "paw-pals" } });
      expect(screen.getByText("PAWPALS-INV-0001")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
      expect(await screen.findByText("Confirm with admin PIN")).toBeTruthy();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockDb.mock.calls.filter(function (c) { return c[1] === "salon_settings"; }).length).toBe(0); // nothing saved before the PIN
      enterPin("1234");
      await waitFor(function () { expect(mockRpc).toHaveBeenCalledTimes(1); });
      expect(mockRpc.mock.calls[0][0]).toBe("salon_save_phone_numbers");
      expect(mockRpc.mock.calls[0][1].p_admin_pin).toBe("1234");
      expect(mockRpc.mock.calls[0][1].p_phones).toEqual([
        { phone: "0711111111", show_on_invoice: true }, { phone: "0722222222", show_on_invoice: false },
        { phone: "0733333333", show_on_invoice: true }, { phone: "0744444444", show_on_invoice: true },
      ]);
      expect(mockDb.mock.calls.filter(function (c) { return c[1] === "salon_settings"; })[0][2].invoice_prefix).toBe("PAWPALS");
    });

    it("saves nothing when the PIN prompt is cancelled", async function () {
      mockDb.mockResolvedValue([{}]);
      render(<SettingsPage onSaved={function () {}} />);
      addNumbers(["0711111111"]);
      fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
      await screen.findByText("Confirm with admin PIN");
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(function () { expect(screen.queryByText("Confirm with admin PIN")).toBeNull(); });
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockDb.mock.calls.filter(function (c) { return c[1] === "salon_settings"; }).length).toBe(0);
    });

    it("does not ask for the PIN when the phone list was not touched", async function () {
      mockDb.mockResolvedValue([{}]);
      var onSaved = vi.fn();
      render(<SettingsPage onSaved={onSaved} />);
      fireEvent.change(screen.getByLabelText(/Message at the bottom/), { target: { value: "Thanks" } });
      fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
      await waitFor(function () { expect(onSaved).toHaveBeenCalled(); }, { timeout: 2000 });
      expect(screen.queryByText("Confirm with admin PIN")).toBeNull();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("says the numbers were not saved when the PIN is refused, and keeps the other settings saved", async function () {
      mockDb.mockResolvedValue([{}]);
      mockRpc.mockResolvedValue({ data: null });
      var onSaved = vi.fn();
      render(<SettingsPage onSaved={onSaved} />);
      addNumbers(["0711111111"]);
      fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
      await screen.findByText("Confirm with admin PIN");
      enterPin("0000");
      expect(await screen.findByText(/phone numbers weren't.*PIN wasn't accepted/)).toBeTruthy();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it("saves the business email, website and address with the other settings", async function () {
      mockDb.mockResolvedValue([{}]);
      render(<SettingsPage onSaved={function () {}} />);
      fireEvent.change(screen.getByLabelText("Business email (optional)"), { target: { value: "hello@example.com" } });
      fireEvent.change(screen.getByLabelText("Website (optional)"), { target: { value: "www.example.com" } });
      fireEvent.change(screen.getByLabelText("Address / location (optional)"), { target: { value: "Some Town" } });
      fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
      await waitFor(function () { expect(mockDb.mock.calls.some(function (c) { return c[1] === "salon_settings"; })).toBe(true); });
      expect(mockDb.mock.calls.filter(function (c) { return c[1] === "salon_settings"; })[0][2]).toMatchObject({ contact_email: "hello@example.com", website: "www.example.com", address: "Some Town" });
    });

    it("refuses a malformed business email without saving", async function () {
      render(<SettingsPage onSaved={function () {}} />);
      fireEvent.change(screen.getByLabelText("Business email (optional)"), { target: { value: "nope" } });
      fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
      expect(await screen.findByText(/valid business email/)).toBeTruthy();
      expect(mockDb.mock.calls.filter(function (c) { return c[1] === "salon_settings"; }).length).toBe(0);
    });

    it("removes a number, and refuses an invalid or repeated one", async function () {
      mockSalon = Object.assign({}, mockSalon, { phones: [{ phone: "0711111111", show_on_invoice: true }, { phone: "0722222222", show_on_invoice: true }] });
      render(<SettingsPage onSaved={function () {}} />);
      fireEvent.click(screen.getByLabelText("Remove 0711111111"));
      expect(screen.queryByLabelText("Phone number 2")).toBeNull();
      fireEvent.change(screen.getByLabelText("New phone number"), { target: { value: "12" } });
      fireEvent.click(screen.getByRole("button", { name: "Add number" }));
      expect(await screen.findByText(/valid phone number/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText("New phone number"), { target: { value: "0722-222-222" } });
      fireEvent.click(screen.getByRole("button", { name: "Add number" }));
      expect(await screen.findByText(/twice/)).toBeTruthy();
    });

    it("says so when the settings saved but the phone list did not", async function () {
      mockDb.mockResolvedValue([{}]);
      mockRpc.mockResolvedValue({ error: "Request failed" });
      var onSaved = vi.fn();
      render(<SettingsPage onSaved={onSaved} />);
      addNumbers(["0711111111"]);
      fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
      await screen.findByText("Confirm with admin PIN");
      enterPin("1234");
      expect(await screen.findByText(/phone numbers weren't saved|phone numbers weren't\./)).toBeTruthy();
      expect(onSaved).not.toHaveBeenCalled();
    });
  });
});
