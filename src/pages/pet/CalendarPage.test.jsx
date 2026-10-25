import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));

import CalendarPage from "./CalendarPage";

function today(h, m) { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString(); }
function todayInput() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

var CUSTOMERS = [{ id: "c1", name: "Wanjiru Kamau", phone: "0712345678" }];
var PETS = [{ id: "p1", customer_id: "c1", name: "Simba", species: "Dog" }];
var STAFF = [{ id: "st1", name: "Amina", role: "staff", active: true }, { id: "st2", name: "Left Co", role: "staff", active: false }];
var SERVICES = [
  { id: "s1", name: "Full groom", category: "Grooming", price: 1500, duration_minutes: 60, active: true },
  { id: "s2", name: "Night stay", category: "Boarding", price: 2000, duration_minutes: null, active: true },
];
function booking(extra) {
  return Object.assign({ id: "b1", customer_id: "c1", pet_id: "p1", staff_id: "st1", starts_at: today(10, 0), ends_at: today(11, 0),
    status: "booked", walk_in: false, notes: "Nervous around clippers",
    pet_booking_services: [{ id: "l1", service_id: "s1", service_name: "Full groom", price: 1500, duration_minutes: 60 }] }, extra || {});
}

function setup(opts) {
  opts = opts || {};
  mockDb.mockImplementation(function (method, table) {
    if (opts.lookupFail && table === "customers") return Promise.resolve(null);
    if (table === "customers") return Promise.resolve(CUSTOMERS);
    if (table === "pet_pets") return Promise.resolve(PETS);
    if (table === "staff") return Promise.resolve(STAFF);
    if (table === "pet_services") return Promise.resolve(SERVICES);
    if (table === "pet_bookings") return Promise.resolve(opts.bookingsFail ? null : (opts.bookings || [booking()]));
    return Promise.resolve(null);
  });
  mockRpc.mockImplementation(function (name) {
    if (opts.rpcError) return Promise.resolve({ error: opts.rpcError });
    return Promise.resolve({ data: name === "pet_create_booking" ? "new-id" : true });
  });
  return render(<CalendarPage />);
}

describe("CalendarPage", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

  it("shows this week's bookings from the database", async function () {
    setup();
    var chip = await screen.findByLabelText("Open booking for Simba at 10:00");
    expect(chip.textContent).toMatch(/Booked/);
    expect(chip.textContent).toMatch(/10:00 – 11:00/);
  });

  it("shows an error with retry when the lookups fail, not an empty calendar", async function () {
    setup({ lookupFail: true });
    expect(await screen.findByText("Couldn't load the calendar")).toBeTruthy();
  });

  it("shows an error with retry when the bookings fail to load", async function () {
    setup({ bookingsFail: true });
    expect(await screen.findByText("Couldn't load bookings")).toBeTruthy();
  });

  it("hides cancelled bookings when filtering by another status", async function () {
    setup({ bookings: [booking(), booking({ id: "b2", pet_id: "p1", status: "cancelled", starts_at: today(14, 0), ends_at: today(15, 0) })] });
    await screen.findByLabelText("Open booking for Simba at 10:00");
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "cancelled" } });
    expect(screen.queryByLabelText("Open booking for Simba at 10:00")).toBeNull();
    expect(screen.getByLabelText("Open booking for Simba at 14:00")).toBeTruthy();
  });

  it("offers only active staff and only Grooming/Add-on services when booking", async function () {
    setup();
    await screen.findByLabelText("Open booking for Simba at 10:00");
    fireEvent.click(screen.getByText("+ New booking"));
    expect(screen.getByText("Full groom")).toBeTruthy();
    expect(screen.queryByText("Night stay")).toBeNull();
    expect(screen.queryByText("Left Co")).toBeNull();
  });

  it("validates before calling the database", async function () {
    setup();
    await screen.findByLabelText("Open booking for Simba at 10:00");
    fireEvent.click(screen.getByText("+ New booking"));
    fireEvent.click(screen.getByRole("button", { name: "Create booking" }));
    expect(await screen.findByText("Choose a customer.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("creates a booking through the database function without sending prices", async function () {
    setup();
    await screen.findByLabelText("Open booking for Simba at 10:00");
    fireEvent.click(screen.getByText("+ New booking"));
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Pet"), { target: { value: "p1" } });
    fireEvent.click(screen.getByLabelText(/Full groom/));
    expect(screen.getByLabelText("End").value).toBe("10:00"); // 09:00 + 60 min service
    fireEvent.change(screen.getByLabelText("Staff member (optional)"), { target: { value: "st1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create booking" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalled(); });
    var call = mockRpc.mock.calls[0];
    expect(call[0]).toBe("pet_create_booking");
    expect(call[1].p_service_ids).toEqual(["s1"]);
    expect(call[1].p_staff_id).toBe("st1");
    expect(call[1].p_walk_in).toBe(false);
    expect(Object.keys(call[1]).some(function (k) { return /price/i.test(k); })).toBe(false);
  });

  it("shows a friendly message and keeps the form open when the database reports a clash", async function () {
    setup({ rpcError: "BOOKING_CONFLICT_STAFF" });
    await screen.findByLabelText("Open booking for Simba at 10:00");
    fireEvent.click(screen.getByText("+ New booking"));
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Pet"), { target: { value: "p1" } });
    fireEvent.click(screen.getByLabelText(/Full groom/));
    fireEvent.click(screen.getByRole("button", { name: "Create booking" }));
    expect(await screen.findByText("That staff member already has a booking at that time.")).toBeTruthy();
    expect(screen.getByLabelText("Customer").value).toBe("c1");
  });

  it("warns (without blocking) about a clash it can already see", async function () {
    setup();
    await screen.findByLabelText("Open booking for Simba at 10:00");
    fireEvent.click(screen.getByText("+ New booking"));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: todayInput() } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "10:30" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "11:30" } });
    fireEvent.change(screen.getByLabelText("Staff member (optional)"), { target: { value: "st1" } });
    expect(await screen.findByText(/this staff member already has a booking/)).toBeTruthy();
  });

  it("moves a booking forward with the status function", async function () {
    setup();
    fireEvent.click(await screen.findByLabelText("Open booking for Simba at 10:00"));
    fireEvent.click(await screen.findByRole("button", { name: "Check in" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_set_booking_status", { p_id: "b1", p_status: "checked-in" }); });
  });

  it("asks for confirmation before cancelling", async function () {
    setup();
    fireEvent.click(await screen.findByLabelText("Open booking for Simba at 10:00"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText("Cancel this booking?")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel booking" }).pop());
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_set_booking_status", { p_id: "b1", p_status: "cancelled" }); });
  });

  it("walks a booking through the prototype workflow with the right buttons at each stage", async function () {
    var stages = [
      { status: "booked", badge: /Booked/, buttons: ["Check in", "Cancel booking", "Mark no-show", "Reschedule"], next: "checked-in" },
      { status: "checked-in", badge: /Checked In/, buttons: ["Start", "Cancel booking", "Reschedule"], next: "in-progress" },
      { status: "in-progress", badge: /In Progress/, buttons: ["Mark ready"], next: "ready" },
      { status: "ready", badge: /Ready for Collection/, buttons: ["Complete"], next: "completed" },
    ];
    for (var i = 0; i < stages.length; i++) {
      var st = stages[i];
      mockDb.mockReset(); mockRpc.mockReset();
      var view = setup({ bookings: [booking({ status: st.status })] });
      var chip = await screen.findByLabelText("Open booking for Simba at 10:00");
      expect(chip.textContent).toMatch(st.badge);
      fireEvent.click(chip);
      for (var k = 0; k < st.buttons.length; k++) expect(await screen.findByRole("button", { name: st.buttons[k] })).toBeTruthy();
      // buttons that do NOT belong to this stage are absent
      if (st.status !== "booked") expect(screen.queryByRole("button", { name: "Mark no-show" })).toBeNull();
      if (st.status === "in-progress" || st.status === "ready") expect(screen.queryByRole("button", { name: "Reschedule" })).toBeNull();
      if (st.status === "in-progress" || st.status === "ready") expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
      var actionName = st.next === "checked-in" ? "Check in" : st.next === "in-progress" ? "Start" : st.next === "ready" ? "Mark ready" : "Complete";
      fireEvent.click(screen.getByRole("button", { name: actionName }));
      await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_set_booking_status", { p_id: "b1", p_status: st.next }); });
      view.unmount();
    }
  });

  it("offers no-show only on a booked booking and sends it through the status function", async function () {
    setup();
    fireEvent.click(await screen.findByLabelText("Open booking for Simba at 10:00"));
    fireEvent.click(await screen.findByRole("button", { name: "Mark no-show" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_set_booking_status", { p_id: "b1", p_status: "no-show" }); });
  });

  it("no longer mentions the old statuses anywhere in the status filter", async function () {
    setup();
    await screen.findByLabelText("Open booking for Simba at 10:00");
    var options = Array.prototype.map.call(screen.getByLabelText("Filter by status").options, function (o) { return o.textContent; });
    expect(options).toEqual(["All statuses", "Booked", "Checked In", "In Progress", "Ready for Collection", "Completed", "Cancelled", "No-show"]);
  });

  it("shows no actions for a final booking", async function () {
    setup({ bookings: [booking({ status: "completed" })] });
    fireEvent.click(await screen.findByLabelText("Open booking for Simba at 10:00"));
    expect(await screen.findByText("This booking is final.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reschedule" })).toBeNull();
  });
});
