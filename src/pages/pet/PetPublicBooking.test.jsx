import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockRpc = vi.fn();
var mockDb = vi.fn();
vi.mock("../../lib/db", () => ({
  dbRpc: function () { return mockRpc.apply(null, arguments); },
  db: function () { return mockDb.apply(null, arguments); },
}));
var mockSalon = { id: "s1", slug: "paws", name: "Paws & Co", business_type: "pet", contact_phone: "0700111222", logo_url: "https://example.com/logo.png" };
vi.mock("../../lib/SalonContext", () => ({ useSalon: function () { return mockSalon; } }));

var mockToken = null;
vi.mock("../../lib/deviceAuth", () => ({ getValidAccessToken: function () { return Promise.resolve(mockToken); } }));

import PetPublicBooking from "./PetPublicBooking";

var INFO = {
  enabled: true, timezone: "Africa/Nairobi", slot_minutes: 30, lead_hours: 4, max_days_ahead: 30,
  hours: [1, 2, 3, 4, 5].map(function (n) { return { weekday: n, open: "09:00", close: "17:00" }; }),
  services: [
    { id: "sv1", name: "Full groom", category: "Grooming", description: "Bath and cut", duration_minutes: 90, price: 2500, species: [] },
    { id: "sv2", name: "Nail trim", category: "Add-on", description: null, duration_minutes: 15, price: 300, species: [] },
  ],
};
var SLOT = "2026-11-02T06:00:00Z"; // 09:00 in Nairobi

function wire(over) {
  var o = Object.assign({ info: INFO, slots: { ok: true, slots: [SLOT, "2026-11-02T06:30:00Z"], minutes: 90 }, submit: { ok: true, reference: "R-AB12CD34" } }, over || {});
  mockRpc.mockImplementation(function (fn) {
    if (fn === "pet_public_booking_info") return Promise.resolve(o.info);
    if (fn === "pet_public_slots") return Promise.resolve(o.slots);
    if (fn === "pet_public_submit_request") return Promise.resolve(o.submit);
    return Promise.resolve(null);
  });
}
async function fillAndPick() {
  fireEvent.click(await screen.findByLabelText(/Full groom/));
  fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-11-02" } });
  fireEvent.click(await screen.findByRole("button", { name: "09:00" }));
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Grace Njeri" } });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0712 345 678" } });
  fireEvent.change(screen.getByLabelText("Pet's name"), { target: { value: "Milo" } });
}
beforeEach(function () { mockRpc.mockReset(); mockDb.mockReset(); mockSalon.business_type = "pet"; mockToken = null; });

describe("PetPublicBooking", function () {
  it("shows the business branding and the bookable services, and reads nothing private", async function () {
    wire();
    render(<PetPublicBooking />);
    expect(await screen.findByText("Request a grooming appointment")).toBeTruthy();
    expect(screen.getByAltText("Paws & Co logo")).toBeTruthy();
    expect(screen.getByText("Full groom")).toBeTruthy();
    expect(screen.getByText(/1 h 30 min/)).toBeTruthy();
    expect(screen.getByText(/Mon-Fri 09:00-17:00/)).toBeTruthy();
    expect(mockRpc.mock.calls[0]).toEqual(["pet_public_booking_info", { p_salon_id: "s1" }]);
    expect(mockDb).not.toHaveBeenCalled(); // no table is ever read by a visitor
  });

  it("says online booking is unavailable when it is off or the business isn't a pet business", async function () {
    wire({ info: { enabled: false } });
    var r = render(<PetPublicBooking />);
    expect(await screen.findByText("Online booking isn't available right now")).toBeTruthy();
    expect(screen.getAllByText(/0700111222/).length).toBeGreaterThan(0);
    r.unmount();
    mockSalon.business_type = "salon"; wire();
    render(<PetPublicBooking />);
    expect(await screen.findByText("Online booking isn't available right now")).toBeTruthy();
  });

  it("points signed-in staff to the settings switch on the closed page, and visitors never see it", async function () {
    wire({ info: { enabled: false } });
    var r = render(<PetPublicBooking />);
    await screen.findByText("Online booking isn't available right now");
    expect(screen.queryByText(/online booking isn't switched on yet/)).toBeNull();
    r.unmount();
    mockToken = "device-token";
    render(<PetPublicBooking />);
    expect(await screen.findByText(/online booking isn't switched on yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pet app" }).getAttribute("href")).toBe("/paws/pet");
  });

  it("shows a retry when the page can't load", async function () {
    mockRpc.mockResolvedValue(null);
    render(<PetPublicBooking />);
    expect(await screen.findByText("We couldn't load the booking page")).toBeTruthy();
  });

  it("totals the chosen services, then lists free times in the business's time zone", async function () {
    wire();
    render(<PetPublicBooking />);
    fireEvent.click(await screen.findByLabelText(/Full groom/));
    fireEvent.click(screen.getByLabelText(/Nail trim/));
    expect(screen.getByText(/1 h 45 min · KES 2,800 in total/)).toBeTruthy();
    expect(screen.getByLabelText("Day").disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-11-02" } });
    expect(await screen.findByRole("button", { name: "09:00" })).toBeTruthy(); // 06:00Z shown as Nairobi time
    var call = mockRpc.mock.calls.filter(function (c) { return c[0] === "pet_public_slots"; }).pop();
    expect(call[1]).toEqual({ p_salon_id: "s1", p_date: "2026-11-02", p_service_ids: ["sv1", "sv2"] });
  });

  it("explains an empty day", async function () {
    wire({ slots: { ok: true, slots: [], minutes: 90 } });
    render(<PetPublicBooking />);
    fireEvent.click(await screen.findByLabelText(/Full groom/));
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-11-02" } });
    expect(await screen.findByText(/No times are available on that day/)).toBeTruthy();
  });

  it("won't send until the form is complete and consent is given", async function () {
    wire();
    render(<PetPublicBooking />);
    await fillAndPick();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText(/tick the box/i)).toBeTruthy();
    expect(mockRpc.mock.calls.filter(function (c) { return c[0] === "pet_public_submit_request"; }).length).toBe(0);
  });

  it("sends the request and confirms it is only a request", async function () {
    wire();
    render(<PetPublicBooking />);
    await fillAndPick();
    fireEvent.click(screen.getByLabelText(/I agree that Paws & Co may contact me/));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Request sent")).toBeTruthy();
    expect(screen.getByText(/not a confirmed booking/)).toBeTruthy();
    expect(screen.getByText("R-AB12CD34")).toBeTruthy();
    var call = mockRpc.mock.calls.filter(function (c) { return c[0] === "pet_public_submit_request"; })[0];
    expect(call[1]).toEqual({
      p_salon_id: "s1", p_service_ids: ["sv1"], p_starts_at: SLOT, p_customer_name: "Grace Njeri", p_phone: "0712 345 678", p_pet_name: "Milo",
      p_species: "Dog", p_breed: null, p_notes: null, p_consent: true, p_website: "",
    });
  });

  it("offers the same WhatsApp messages as the salon booking page after a request is sent", async function () {
    wire();
    render(<PetPublicBooking />);
    await fillAndPick();
    fireEvent.click(screen.getByLabelText(/I agree/));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await screen.findByText("Request sent");
    var msg = screen.getByText(/Message us on WhatsApp/).closest("a");
    var note = screen.getByText(/Send booking details to us/).closest("a");
    expect(msg.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/254700111222\?text=/);
    expect(decodeURIComponent(msg.getAttribute("href"))).toMatch(/R-AB12CD34/);
    expect(decodeURIComponent(note.getAttribute("href"))).toMatch(/New Booking Request[\s\S]*Grace Njeri[\s\S]*Milo/);
  });

  it("uses the business brand colours", async function () {
    mockSalon = Object.assign({}, mockSalon, { primary_color: "#C9A84C", secondary_color: "#1A1A1A" });
    try {
      wire();
      var view = render(<PetPublicBooking />);
      await screen.findByText("Request a grooming appointment");
      expect(view.container.firstChild.style.background).toMatch(/rgb\(26, 26, 26\)|#1a1a1a/i);
      fireEvent.click(screen.getByLabelText(/Full groom/));
      var btn = screen.getByRole("button", { name: "Send request" });
      expect(btn.style.background).toMatch(/rgb\(201, 168, 76\)|#c9a84c/i);
    } finally {
      mockSalon = { id: "s1", slug: "paws", name: "Paws & Co", business_type: "pet", contact_phone: "0700111222", logo_url: "https://example.com/logo.png" };
    }
  });

  it("sends only one request when the button is pressed twice", async function () {
    var release; var gate = new Promise(function (res) { release = res; });
    wire();
    var base = mockRpc.getMockImplementation();
    mockRpc.mockImplementation(function (fn) { return fn === "pet_public_submit_request" ? gate.then(function () { return { ok: true, reference: "R-AB12CD34" }; }) : base(fn); });
    render(<PetPublicBooking />);
    await fillAndPick();
    fireEvent.click(screen.getByLabelText(/I agree/));
    var btn = screen.getByRole("button", { name: "Send request" });
    fireEvent.click(btn); fireEvent.click(btn);
    release();
    await screen.findByText("Request sent");
    expect(mockRpc.mock.calls.filter(function (c) { return c[0] === "pet_public_submit_request"; }).length).toBe(1);
  });

  it("shows a friendly message and refreshes the times when the slot was just taken", async function () {
    wire({ submit: { ok: false, error: "SLOT_FULL" } });
    render(<PetPublicBooking />);
    await fillAndPick();
    fireEvent.click(screen.getByLabelText(/I agree/));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText(/that time has just been taken/i)).toBeTruthy();
    await waitFor(function () { expect(mockRpc.mock.calls.filter(function (c) { return c[0] === "pet_public_slots"; }).length).toBeGreaterThan(1); });
    expect(screen.queryByText("Request sent")).toBeNull();
  });

  it("shows a connection message if the request can't be sent", async function () {
    wire({ submit: null });
    render(<PetPublicBooking />);
    await fillAndPick();
    fireEvent.click(screen.getByLabelText(/I agree/));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText(/couldn't send your request/i)).toBeTruthy();
  });

  it("keeps the bot trap out of sight and out of the tab order", async function () {
    wire();
    render(<PetPublicBooking />);
    await screen.findByText("Request a grooming appointment");
    var trap = document.querySelector('input[name="website"]');
    expect(trap.getAttribute("tabindex")).toBe("-1");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
  });
});
