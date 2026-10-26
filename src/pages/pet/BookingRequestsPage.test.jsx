import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));

import BookingRequestsPage from "./BookingRequestsPage";

function req(over) {
  return Object.assign({
    id: "r1", reference: "R-AB12CD34", status: "new", service_ids: ["sv1"], service_summary: "Full groom", starts_at: "2026-11-02T06:00:00Z", duration_minutes: 90,
    customer_name: "Grace Njeri", phone: "254712345678", pet_name: "Milo", species: "Cat", breed: "Siamese", notes: "Likes treats",
    created_at: "2026-10-26T08:00:00Z", handled_at: null, decline_reason: null, booking_id: null,
  }, over || {});
}
function wire(over) {
  var o = Object.assign({ requests: [req()], staff: [{ id: "st1", name: "Wanjiku", active: true }, { id: "st2", name: "Gone", active: false }], settings: [{ enabled: true }] }, over || {});
  mockDb.mockImplementation(function (method, table) {
    if (table === "pet_booking_requests") return Promise.resolve(o.requests);
    if (table === "staff") return Promise.resolve(o.staff);
    if (table === "pet_public_booking_settings") return Promise.resolve(o.settings);
    return Promise.resolve(null);
  });
}
beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

describe("BookingRequestsPage", function () {
  it("lists new requests with everything staff need", async function () {
    wire();
    render(<BookingRequestsPage />);
    expect(await screen.findByText(/Grace Njeri/)).toBeTruthy();
    expect(screen.getByText(/Milo/)).toBeTruthy();
    expect(screen.getByText(/Full groom · 90 min/)).toBeTruthy();
    expect(screen.getByText(/Wants Mon 2 Nov, 09:00/)).toBeTruthy(); // business time
    expect(screen.getByText("Note: Likes treats")).toBeTruthy();
    expect(screen.getByRole("link", { name: "+254712345678" }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/254712345678/);
    expect(screen.getByText(/ref R-AB12CD34/)).toBeTruthy();
  });

  it("shows an honest empty state, and says when the page is switched off", async function () {
    wire({ requests: [], settings: [] });
    render(<BookingRequestsPage />);
    expect(await screen.findByText("No new requests")).toBeTruthy();
    expect(screen.getByText(/switched off/)).toBeTruthy();
  });

  it("says a database update is needed when the table is missing, and shows a retry when loading fails", async function () {
    mockDb.mockImplementation(function (m, table) { return Promise.resolve(table === "staff" ? [] : null); });
    var r = render(<BookingRequestsPage />);
    expect(await screen.findByText("Online requests need a database update")).toBeTruthy();
    r.unmount();
    mockDb.mockResolvedValue(null);
    render(<BookingRequestsPage />);
    expect(await screen.findByText("Couldn't load requests")).toBeTruthy();
  });

  it("accepts with the requested time and an optional groomer (only active staff offered)", async function () {
    wire(); mockRpc.mockResolvedValue("booking-1");
    render(<BookingRequestsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept request from Grace Njeri" }));
    var sel = await screen.findByLabelText("Groomer (optional)");
    expect(Array.from(sel.options).map(function (o) { return o.text; })).toEqual(["Not assigned yet", "Wanjiku"]);
    fireEvent.change(sel, { target: { value: "st1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create booking" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalled(); });
    expect(mockRpc.mock.calls[0]).toEqual(["pet_accept_booking_request", { p_request_id: "r1", p_staff_id: "st1", p_starts_at: null }]);
    expect(await screen.findByText(/Booking created for Grace Njeri/)).toBeTruthy();
  });

  it("sends a new time only when staff change it", async function () {
    wire(); mockRpc.mockResolvedValue("booking-1");
    render(<BookingRequestsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept request from Grace Njeri" }));
    fireEvent.change(await screen.findByLabelText("Date and time"), { target: { value: "2026-11-03T14:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create booking" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalled(); });
    expect(mockRpc.mock.calls[0][1].p_starts_at).toBe(new Date("2026-11-03T14:00").toISOString());
  });

  it("shows the clash message and keeps the request open when the groomer is busy", async function () {
    wire(); mockRpc.mockResolvedValue({ error: "BOOKING_CONFLICT_STAFF" });
    render(<BookingRequestsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept request from Grace Njeri" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create booking" }));
    expect(await screen.findByText(/groomer already has a booking/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create booking" })).toBeTruthy(); // modal still open
  });

  it("declines with an optional reason and warns that the customer isn't told", async function () {
    wire(); mockRpc.mockResolvedValue(null);
    render(<BookingRequestsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline request from Grace Njeri" }));
    expect(await screen.findByText(/isn't notified automatically/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "  Fully booked  " } });
    fireEvent.click(screen.getByRole("button", { name: "Decline request" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalled(); });
    expect(mockRpc.mock.calls[0]).toEqual(["pet_decline_booking_request", { p_request_id: "r1", p_reason: "Fully booked" }]);
  });

  it("lists handled requests separately with their reason", async function () {
    wire({ requests: [req(), req({ id: "r2", status: "declined", customer_name: "Old Request", decline_reason: "Fully booked", handled_at: "2026-10-26T09:00:00Z" })] });
    render(<BookingRequestsPage />);
    await screen.findByText(/Grace Njeri/);
    expect(screen.queryByText(/Old Request/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Handled/ }));
    expect(await screen.findByText(/Old Request/)).toBeTruthy();
    expect(screen.getByText("Reason: Fully booked")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Accept request/ })).toBeNull();
  });
});
