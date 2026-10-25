import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
vi.mock("../../lib/db", () => ({ db: function () { return mockDb.apply(null, arguments); } }));
vi.mock("../../lib/SalonContext", () => ({ useSalon: function () { return { id: "s1", name: "Paws & Co", logo_url: "", tax_enabled: false, tax_rate: 16 }; } }));

import SettingsPage from "./SettingsPage";

describe("SettingsPage", function () {
  beforeEach(function () { mockDb.mockReset(); });

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
});
