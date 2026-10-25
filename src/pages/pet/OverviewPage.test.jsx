import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));

import OverviewPage from "./OverviewPage";

var NOW = new Date();
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function todayAt(h, m) { return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), h, m || 0, 0).toISOString(); }
function dayKey(offset) { return keyOf(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offset)); }

var CUSTOMERS = [{ id: "c1", name: "Wanjiru Kamau" }, { id: "c2", name: "James Mwangi" }];
var PETS = [
  { id: "p1", customer_id: "c1", name: "Simba", species: "Dog", created_at: "2020-01-01T00:00:00Z" },
  { id: "p2", customer_id: "c2", name: "Rex", species: "Dog", created_at: "2020-01-01T00:00:00Z" },
];
var STAFF = [{ id: "s1", name: "Achieng", active: true }];
var KENNELS = [{ id: "k1", name: "Suite 1", maintenance: false }];

function booking(extra) {
  return Object.assign({ id: "b1", customer_id: "c1", pet_id: "p1", staff_id: "s1", starts_at: todayAt(12), ends_at: todayAt(13), status: "booked",
    pet_booking_services: [{ service_name: "Full groom" }] }, extra || {});
}
function stay(extra) {
  return Object.assign({ id: "st1", customer_id: "c2", pet_id: "p2", kennel_id: "k1", status: "occupied", check_in_on: dayKey(-2), check_out_on: dayKey(0) }, extra || {});
}

// Answers each query the loader makes. Queries are told apart by their filters.
function setup(opts) {
  opts = opts || {};
  var d = Object.assign({
    bookings: [], stays: [], invoices: [], payments: [], vaccinations: [], items: [],
    recentBookings: [], recentStays: [], recentInvoices: [], recentProfiles: [],
  }, opts.data || {});
  mockDb.mockImplementation(function (method, table, body, query) {
    var qs = String(query || "");
    if (opts.failTable && opts.failTable === table && (!opts.failMatch || qs.indexOf(opts.failMatch) !== -1)) return Promise.resolve(null);
    if (table === "pet_bookings") return Promise.resolve(qs.indexOf("starts_at=gte") !== -1 ? d.bookings : d.recentBookings);
    if (table === "pet_boarding_stays") return Promise.resolve(qs.indexOf("status=in.") !== -1 ? d.stays : d.recentStays);
    if (table === "pet_invoices") return Promise.resolve(qs.indexOf("status=in.") !== -1 ? d.invoices : d.recentInvoices);
    var map = { pet_payments: d.payments, customers: CUSTOMERS, pet_pets: opts.pets || PETS, staff: STAFF, pet_kennels: KENNELS,
      pet_customer_profiles: d.recentProfiles, pet_vaccinations: d.vaccinations, pet_items: d.items };
    return Promise.resolve(map[table] || []);
  });
  mockRpc.mockImplementation(function () { return Promise.resolve(opts.rpcError ? { error: opts.rpcError } : { data: null }); });
  var onNavigate = vi.fn();
  var utils = render(<OverviewPage businessName="Happy Paws" isAdmin={opts.isAdmin !== false} onNavigate={onNavigate} />);
  return Object.assign({ onNavigate: onNavigate }, utils);
}
function rpcCall(name) { return mockRpc.mock.calls.filter(function (c) { return c[0] === name; })[0]; }
function card(label) { return screen.getByText(label).closest("button"); }

describe("OverviewPage", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

  it("greets, names the business and shows today's date with the two header shortcuts", async function () {
    setup();
    expect(await screen.findByRole("heading", { name: /^Good (morning|afternoon|evening)$/ })).toBeTruthy();
    expect(screen.getByText(/Here's what's happening at Happy Paws today\./)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "New Booking" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Add Customer / Pet" })).toBeTruthy();
  });

  it("shows the four headline numbers from real records", async function () {
    setup({ data: {
      bookings: [booking(), booking({ id: "b2", status: "cancelled", starts_at: todayAt(14), ends_at: todayAt(15) })],
      stays: [stay()],
      invoices: [{ id: "i1", status: "issued", total: 3000, amount_paid: 0, due_date: null }, { id: "i2", status: "partial", total: 2000, amount_paid: 500, due_date: null }],
      payments: [{ id: "pm1", invoice_id: "i2", amount: 500, method: "cash", paid_at: todayAt(9) }, { id: "pm2", invoice_id: "i2", amount: 1200, method: "mpesa", paid_at: todayAt(9, 30) }],
    } });
    await screen.findByText("Today's Appointments");
    expect(within(card("Today's Appointments")).getByText("1")).toBeTruthy();
    expect(within(card("Pets Boarding")).getByText("1")).toBeTruthy();
    expect(within(card("Revenue Collected Today")).getByText("KES 1,700")).toBeTruthy();
    expect(within(card("Revenue Collected Today")).getByText("2 payments")).toBeTruthy();
    expect(within(card("Outstanding Invoices")).getByText("KES 4,500")).toBeTruthy();
    expect(within(card("Outstanding Invoices")).getByText("2 invoices unpaid")).toBeTruthy();
  });

  it("shows honest empty states instead of invented data", async function () {
    setup();
    expect(await screen.findByText("No appointments today")).toBeTruthy();
    expect(screen.getByText("No pets boarding")).toBeTruthy();
    expect(screen.getByText("All clear")).toBeTruthy();
    expect(screen.getByText("No recent activity")).toBeTruthy();
    expect(within(card("Revenue Collected Today")).getByText("KES 0")).toBeTruthy();
    expect(screen.getByText("No payments recorded yet")).toBeTruthy();
  });

  it("lists today's schedule with the approved status labels and the next action", async function () {
    setup({ data: { bookings: [booking(), booking({ id: "b2", status: "ready", pet_id: "p2", customer_id: "c2", starts_at: todayAt(14), ends_at: todayAt(15) })] } });
    expect(await screen.findByLabelText("Check in Simba")).toBeTruthy();
    expect(screen.getByText("Booked")).toBeTruthy();
    expect(screen.getByText("Ready for Collection")).toBeTruthy();
    expect(screen.getByLabelText("Complete Rex")).toBeTruthy();
    expect(screen.getAllByText(/Full groom · Achieng/)).toHaveLength(2);
  });

  it("moves a booking through the database function, then reloads", async function () {
    setup({ data: { bookings: [booking()] } });
    fireEvent.click(await screen.findByLabelText("Check in Simba"));
    await waitFor(function () { expect(rpcCall("pet_set_booking_status")).toBeTruthy(); });
    expect(rpcCall("pet_set_booking_status")[1]).toEqual({ p_id: "b1", p_status: "checked-in" });
    expect(await screen.findByText("Simba checked in.")).toBeTruthy();
    var loads = mockDb.mock.calls.filter(function (c) { return c[1] === "pet_bookings" && String(c[3]).indexOf("starts_at=gte") !== -1; }).length;
    expect(loads).toBeGreaterThan(1);
  });

  it("shows a friendly message, not raw database text, when a status change is refused", async function () {
    setup({ data: { bookings: [booking()] }, rpcError: "INVALID_STATUS_CHANGE: nope" });
    fireEvent.click(await screen.findByLabelText("Check in Simba"));
    expect(await screen.findByText("That status change isn't allowed for this booking.")).toBeTruthy();
    expect(screen.queryByText(/INVALID_STATUS_CHANGE/)).toBeNull();
  });

  it("shows boarding pets with kennel, dates and a check-out highlight, and checks out via the database function", async function () {
    setup({ data: { stays: [stay()] } });
    expect(await screen.findByText("Check-out today")).toBeTruthy();
    expect(screen.getByText(/Suite 1/)).toBeTruthy();
    expect(screen.getByText("Checked in")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Check out Rex"));
    await waitFor(function () { expect(rpcCall("pet_set_stay_status")).toBeTruthy(); });
    expect(rpcCall("pet_set_stay_status")[1]).toEqual({ p_id: "st1", p_status: "checked-out" });
    expect(await screen.findByText("Rex checked out of boarding.")).toBeTruthy();
  });

  it("builds the activity feed from real timestamps", async function () {
    setup({ data: { payments: [{ id: "pm1", invoice_id: "i1", amount: 2500, method: "cash", paid_at: todayAt(0, 1) }],
      recentInvoices: [{ id: "i1", invoice_number: "INV-0009", total: 2500, status: "paid", issued_at: todayAt(0, 0) }] } });
    expect(await screen.findByText("Payment of KES 2,500 recorded")).toBeTruthy();
    expect(screen.getByText("Invoice INV-0009 created (KES 2,500)")).toBeTruthy();
  });

  it("surfaces what needs attention and links it to the right section", async function () {
    var past = dayKey(-5);
    var h = setup({ data: { invoices: [{ id: "i1", status: "issued", total: 3000, amount_paid: 0, due_date: past }],
      items: [{ id: "it1", name: "Shampoo", active: true, quantity_on_hand: 1, reorder_level: 5 }] } });
    expect(await screen.findByText("1 overdue invoice")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("View: 1 overdue invoice"));
    expect(h.onNavigate).toHaveBeenCalledWith("invoices", { status: "overdue" });
    expect(screen.getByText("Low stock: 1 running low")).toBeTruthy();
    expect(screen.queryByText("All clear")).toBeNull();
  });

  it("navigates from the cards and quick actions to real sections", async function () {
    var h = setup();
    await screen.findByText("Today's Appointments");
    fireEvent.click(card("Today's Appointments"));
    expect(h.onNavigate).toHaveBeenLastCalledWith("calendar", { view: "day" });
    fireEvent.click(card("Pets Boarding"));
    expect(h.onNavigate).toHaveBeenLastCalledWith("boarding", undefined);
    fireEvent.click(card("Outstanding Invoices"));
    expect(h.onNavigate).toHaveBeenLastCalledWith("invoices", { status: "outstanding" });

    var quick = within(screen.getByRole("group", { name: "Quick actions" }));
    fireEvent.click(quick.getByText("New Booking"));
    expect(h.onNavigate).toHaveBeenLastCalledWith("calendar", { view: "day", startNew: true });
    fireEvent.click(quick.getByText("Register Customer & Pet"));
    expect(h.onNavigate).toHaveBeenLastCalledWith("pets", { startNew: true });
    fireEvent.click(quick.getByText("Create Invoice"));
    expect(h.onNavigate).toHaveBeenLastCalledWith("checkout", undefined);
    fireEvent.click(quick.getByText("Record Payment"));
    expect(h.onNavigate).toHaveBeenLastCalledWith("invoices", { status: "outstanding" });
    fireEvent.click(quick.getByText("Check In Boarding Pet"));
    expect(h.onNavigate).toHaveBeenLastCalledWith("boarding", undefined);
    fireEvent.click(quick.getByText("Add Inventory Item"));
    expect(h.onNavigate).toHaveBeenLastCalledWith("supplies", undefined);
  });

  it("shows an error with retry, not a blank or zeroed page, when the main data fails to load", async function () {
    setup({ failTable: "pet_payments" });
    expect(await screen.findByText("Couldn't load the overview")).toBeTruthy();
    expect(screen.queryByText("Today's Appointments")).toBeNull();
    // connection comes back: retry loads the real page
    mockDb.mockImplementation(function () { return Promise.resolve([]); });
    fireEvent.click(screen.getByText("Try again"));
    expect(await screen.findByText("Today's Appointments")).toBeTruthy();
    expect(screen.queryByText("Couldn't load the overview")).toBeNull();
  });

  it("still loads when a secondary section fails, and says so rather than showing 'all clear'", async function () {
    setup({ failTable: "pet_vaccinations" });
    expect(await screen.findByText("Today's Appointments")).toBeTruthy();
    expect(screen.getByText("Nothing needs attention, but some alerts couldn't be loaded.")).toBeTruthy();
  });

  it("still raises vaccination alerts with the default window when reminder settings aren't available (migration 098 not applied)", async function () {
    setup({ failTable: "pet_reminder_settings", data: { vaccinations: [{ id: "v1", pet_id: "p1", next_due_on: dayKey(40) }] } });
    expect(await screen.findByText("Vaccinations: 1 due soon")).toBeTruthy();
    expect(screen.queryByText(/couldn't be loaded/)).toBeNull();
  });

  it("raises no vaccination alert for an archived pet", async function () {
    var pets = PETS.map(function (p) { return p.id === "p1" ? Object.assign({}, p, { archived_at: "2026-09-01T08:00:00Z" }) : p; });
    setup({ pets: pets, data: { vaccinations: [{ id: "v1", pet_id: "p1", next_due_on: dayKey(-30) }] } });
    expect(await screen.findByText("Today's Appointments")).toBeTruthy();
    expect(screen.queryByText(/Vaccinations:/)).toBeNull();
    expect(screen.getByText("Nothing needs your attention right now.")).toBeTruthy();
  });

  it("Add Customer / Pet opens the Pets add form, and View booking opens that exact booking", async function () {
    var h = setup({ data: { bookings: [booking({ id: "b-42" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Add Customer / Pet" }));
    expect(h.onNavigate).toHaveBeenLastCalledWith("pets", { startNew: true });
    fireEvent.click(await screen.findByRole("button", { name: "View booking for Simba" }));
    expect(h.onNavigate).toHaveBeenLastCalledWith("calendar", { view: "day", bookingId: "b-42" });
  });

  it("does not crash and keeps cards as plain text when no navigation handler is given", async function () {
    mockDb.mockImplementation(function () { return Promise.resolve([]); });
    render(<OverviewPage businessName="Happy Paws" isAdmin={true} />);
    expect(await screen.findByText("Today's Appointments")).toBeTruthy();
    fireEvent.click(card("Pets Boarding"));
  });
});
