import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { todayKey, addDaysKey } from "./boardingData";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));

import BoardingPage from "./BoardingPage";

var T = todayKey();
var KENNELS = [
  { id: "k1", name: "Suite 1", kind: "Deluxe suite", maintenance: false, notes: null },
  { id: "k2", name: "Kennel A1", kind: "Standard", maintenance: false, notes: null },
  { id: "k3", name: "Kennel B1", kind: "Standard", maintenance: true, notes: null },
  { id: "k4", name: "Cat Condo", kind: "Feline", maintenance: false, notes: null },
];
var CUSTOMERS = [{ id: "c1", name: "Wanjiru Kamau", phone: "0712" }, { id: "c2", name: "James Mwangi", phone: "0705" }];
var PETS = [
  { id: "p1", customer_id: "c1", name: "Simba", species: "Dog" },
  { id: "p2", customer_id: "c2", name: "Rex", species: "Dog" },
];
function stay(extra) {
  return Object.assign({ id: "s1", customer_id: "c1", pet_id: "p1", kennel_id: "k1", status: "occupied", check_in_on: addDaysKey(T, -1),
    check_out_on: addDaysKey(T, 2), feeding_notes: "Two cups, 8am", care_notes: "Loves his duck", service_name: "Standard night", nightly_rate: 900 }, extra || {});
}
var STAYS = [stay(), stay({ id: "s2", customer_id: "c2", pet_id: "p2", kennel_id: "k2", status: "reserved", check_in_on: addDaysKey(T, 1), check_out_on: addDaysKey(T, 4), feeding_notes: null, care_notes: null, nightly_rate: null })];
var SERVICES = [
  { id: "sv1", name: "Standard night", category: "Boarding", price: 900, active: true },
  { id: "sv2", name: "Full groom", category: "Grooming", price: 2500, active: true },
  { id: "sv3", name: "Old rate", category: "Boarding", price: 700, active: false },
];

function setup(opts) {
  opts = opts || {};
  mockDb.mockImplementation(function (method, table) {
    if (opts.getFail && table === "pet_kennels") return Promise.resolve(null);
    var map = {
      pet_kennels: opts.kennels || KENNELS, pet_boarding_stays: opts.stays || STAYS, customers: CUSTOMERS, pet_pets: PETS,
      pet_vaccinations: opts.vaccs || [], pet_services: SERVICES, pet_customer_profiles: opts.profiles || [], pet_invoices: opts.invoices === undefined ? [] : opts.invoices,
    };
    if (map[table] === null) return Promise.resolve(null);
    return Promise.resolve(map[table] || []);
  });
  mockRpc.mockImplementation(function () { return Promise.resolve(opts.rpcError ? { error: opts.rpcError } : { data: null }); });
  return render(<BoardingPage canEdit={opts.canEdit !== false} />);
}
function rpcCall(name) { return mockRpc.mock.calls.filter(function (c) { return c[0] === name; })[0]; }
function getCount(table) { return mockDb.mock.calls.filter(function (c) { return c[0] === "GET" && c[1] === table; }).length; }

describe("BoardingPage", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

  it("shows a count per kennel status and the current guest, arrivals and feeding notes", async function () {
    setup();
    expect(await screen.findByLabelText("Check out Simba")).toBeTruthy();
    // occupied 1 (Suite 1), reserved 1 (Kennel A1 arriving tomorrow), maintenance 1, available 1 (Cat Condo)
    ["Occupied", "Reserved", "Available", "Maintenance"].forEach(function (label) { expect(screen.getAllByText(label).length).toBeGreaterThan(0); });
    expect(screen.getByText("Two cups, 8am", { exact: false })).toBeTruthy();
    expect(screen.getByLabelText("Check in Rex")).toBeTruthy();
    expect(screen.getByText(/est\. /)).toBeTruthy();
  });

  it("shows an error with retry, not an empty page, when loading fails", async function () {
    setup({ getFail: true });
    expect(await screen.findByText("Couldn't load boarding")).toBeTruthy();
    expect(screen.queryByText("No kennels yet")).toBeNull();
    mockDb.mockReset();
    mockDb.mockImplementation(function () { return Promise.resolve([]); });
    fireEvent.click(screen.getByText("Try again"));
    expect(await screen.findByText("No kennels yet")).toBeTruthy();
  });

  it("hides kennel management from non-admins but lets staff handle stays", async function () {
    setup({ canEdit: false });
    await screen.findByLabelText("Check out Simba");
    expect(screen.queryByText("+ Add kennel")).toBeNull();
    expect(screen.queryByLabelText("Edit kennel Suite 1")).toBeNull();
    expect(screen.queryByLabelText("Delete kennel Suite 1")).toBeNull();
    expect(screen.queryByLabelText("Maintenance on Cat Condo")).toBeNull();
    expect(screen.getByText("+ New stay")).toBeTruthy();
  });

  it("checks a pet out after confirmation and reloads from the database", async function () {
    setup();
    await screen.findByLabelText("Check out Simba");
    var before = getCount("pet_boarding_stays");
    fireEvent.click(screen.getByLabelText("Check out Simba"));
    expect(await screen.findByText(/frees the kennel straight away/)).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByText("Check out").filter(function (el) { return el.tagName === "BUTTON" && el.textContent === "Check out" && el.closest("[role=dialog]"); })[0] || screen.getAllByRole("button", { name: "Check out" }).pop());
    await waitFor(function () { expect(rpcCall("pet_set_stay_status")).toBeTruthy(); });
    expect(rpcCall("pet_set_stay_status")[1]).toEqual({ p_id: "s1", p_status: "checked-out" });
    await waitFor(function () { expect(getCount("pet_boarding_stays")).toBeGreaterThan(before); });
  });

  it("checks in a reserved stay from the kennel card", async function () {
    setup();
    await screen.findByLabelText("Check in Rex");
    fireEvent.click(screen.getByLabelText("Check in Rex"));
    await screen.findByText(/will show as occupied from now/);
    fireEvent.click(screen.getAllByRole("button", { name: "Check in" }).pop());
    await waitFor(function () { expect(rpcCall("pet_set_stay_status")[1]).toEqual({ p_id: "s2", p_status: "occupied" }); });
  });

  it("shows the database's reason in plain words when a change is refused", async function () {
    setup({ rpcError: "KENNEL_MAINTENANCE" });
    await screen.findByLabelText("Check in Rex");
    fireEvent.click(screen.getByLabelText("Check in Rex"));
    await screen.findByText(/will show as occupied from now/);
    fireEvent.click(screen.getAllByRole("button", { name: "Check in" }).pop());
    expect(await screen.findByText("That kennel is in maintenance.")).toBeTruthy();
  });

  it("cancels a reservation from Arrivals", async function () {
    setup();
    await screen.findByLabelText("Cancel stay for Rex");
    fireEvent.click(screen.getByLabelText("Cancel stay for Rex"));
    await screen.findByText(/can't be restored/);
    fireEvent.click(screen.getByText("Cancel reservation"));
    await waitFor(function () { expect(rpcCall("pet_set_stay_status")[1]).toEqual({ p_id: "s2", p_status: "cancelled" }); });
  });

  it("validates a new stay before calling the database", async function () {
    setup();
    await screen.findByLabelText("Check out Simba");
    fireEvent.click(screen.getByText("+ New stay"));
    fireEvent.click(await screen.findByRole("button", { name: "Reserve" }));
    expect(await screen.findByText("Choose a customer.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("creates a stay with only Boarding services offered and no client-side price", async function () {
    setup();
    await screen.findByLabelText("Check out Simba");
    fireEvent.click(screen.getByText("+ New stay"));
    fireEvent.change(await screen.findByLabelText("Customer"), { target: { value: "c2" } });
    fireEvent.change(screen.getByLabelText("Pet"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Kennel"), { target: { value: "k4" } });
    var options = Array.prototype.map.call(screen.getByLabelText("Boarding rate (optional)").querySelectorAll("option"), function (o) { return o.textContent; });
    expect(options.join("|")).toMatch(/Standard night/);
    expect(options.join("|")).not.toMatch(/Full groom|Old rate/);
    var kennelOptions = Array.prototype.map.call(screen.getByLabelText("Kennel").querySelectorAll("option"), function (o) { return o.textContent; }).join("|");
    expect(kennelOptions).not.toMatch(/Kennel B1/);
    fireEvent.change(screen.getByLabelText("Boarding rate (optional)"), { target: { value: "sv1" } });
    fireEvent.change(screen.getByLabelText("Check-in"), { target: { value: addDaysKey(T, 10) } });
    fireEvent.change(screen.getByLabelText("Check-out"), { target: { value: addDaysKey(T, 12) } });
    fireEvent.change(screen.getByLabelText("Feeding (optional)"), { target: { value: "Wet food pm" } });
    fireEvent.click(screen.getByRole("button", { name: "Reserve" }));
    await waitFor(function () { expect(rpcCall("pet_create_stay")).toBeTruthy(); });
    expect(rpcCall("pet_create_stay")[1]).toEqual({
      p_customer_id: "c2", p_pet_id: "p2", p_kennel_id: "k4", p_check_in: addDaysKey(T, 10), p_check_out: addDaysKey(T, 12),
      p_service_id: "sv1", p_feeding: "Wet food pm", p_notes: "", p_check_in_now: false,
      p_emergency_name: "", p_emergency_phone: "", p_medication: "",
    });
  });

  it("sends medication instructions and an emergency contact with a new stay, suggesting the profile contact", async function () {
    setup({ profiles: [{ customer_id: "c2", emergency_contact_name: "Grace Njeri", emergency_contact_phone: "0733111222" }] });
    await screen.findByLabelText("Check out Simba");
    fireEvent.click(screen.getByText("+ New stay"));
    fireEvent.change(await screen.findByLabelText("Customer"), { target: { value: "c2" } });
    expect(screen.getByLabelText("Emergency contact name").value).toBe("Grace Njeri");
    expect(screen.getByLabelText("Emergency contact number").value).toBe("0733111222");
    fireEvent.change(screen.getByLabelText("Pet"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Kennel"), { target: { value: "k4" } });
    fireEvent.change(screen.getByLabelText("Check-in"), { target: { value: addDaysKey(T, 10) } });
    fireEvent.change(screen.getByLabelText("Check-out"), { target: { value: addDaysKey(T, 12) } });
    fireEvent.change(screen.getByLabelText("Medication instructions (optional)"), { target: { value: "Half a tablet at 8am" } });
    fireEvent.change(screen.getByLabelText("Emergency contact name"), { target: { value: "Peter Otieno" } });
    fireEvent.click(screen.getByRole("button", { name: "Reserve" }));
    await waitFor(function () { expect(rpcCall("pet_create_stay")).toBeTruthy(); });
    expect(rpcCall("pet_create_stay")[1]).toMatchObject({ p_medication: "Half a tablet at 8am", p_emergency_name: "Peter Otieno", p_emergency_phone: "0733111222" });
  });

  it("refuses half an emergency contact before calling the database", async function () {
    setup();
    await screen.findByLabelText("Check out Simba");
    fireEvent.click(screen.getByText("+ New stay"));
    fireEvent.change(await screen.findByLabelText("Customer"), { target: { value: "c2" } });
    fireEvent.change(screen.getByLabelText("Pet"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Kennel"), { target: { value: "k4" } });
    fireEvent.change(screen.getByLabelText("Emergency contact name"), { target: { value: "Peter" } });
    fireEvent.click(screen.getByRole("button", { name: "Reserve" }));
    expect(await screen.findByText(/both the emergency contact/)).toBeTruthy();
    expect(rpcCall("pet_create_stay")).toBeUndefined();
  });

  it("shows medication, the emergency contact and an overdue badge on a checked-in stay", async function () {
    setup({ stays: [stay({ check_out_on: addDaysKey(T, -2), medication_notes: "Insulin at 7am", emergency_contact_name: "Mary", emergency_contact_phone: "0712000000" })] });
    expect(await screen.findByText(/Insulin at 7am/)).toBeTruthy();
    expect(screen.getByText(/Mary · 0712000000/)).toBeTruthy();
    expect(screen.getByText("Overdue by 2 days")).toBeTruthy();
  });

  it("lists checked-out stays that still need an invoice, and hides billing before migration 105", async function () {
    var done = stay({ id: "s9", status: "checked-out", service_id: "sv1", nightly_rate: 900, check_out_on: addDaysKey(T, -1) });
    setup({ stays: [done] });
    expect(await screen.findByText("Stays to invoice")).toBeTruthy();
    expect(screen.getByLabelText("Bill the stay of Simba")).toBeTruthy();
  });

  it("does not list a stay that already has a live invoice", async function () {
    var done = stay({ id: "s9", status: "checked-out", service_id: "sv1", nightly_rate: 900, check_out_on: addDaysKey(T, -1) });
    setup({ stays: [done], invoices: [{ stay_id: "s9" }] });
    await screen.findByText("Arrivals");
    expect(screen.queryByText("Stays to invoice")).toBeNull();
  });

  it("hides billing entirely while the database can't report stay invoices yet", async function () {
    var done = stay({ id: "s9", status: "checked-out", service_id: "sv1", nightly_rate: 900, check_out_on: addDaysKey(T, -1) });
    setup({ stays: [done], invoices: null });
    await screen.findByText("Arrivals");
    expect(screen.queryByText("Stays to invoice")).toBeNull();
  });

  it("offers to bill the stay right after check-out", async function () {
    var cur = stay({ service_id: "sv1" });
    setup({ stays: [cur] });
    fireEvent.click(await screen.findByLabelText("Check out Simba"));
    fireEvent.click(await screen.findByRole("button", { name: "Check out" }));
    await waitFor(function () { expect(rpcCall("pet_stay_billing")).toBeTruthy(); });
    expect(rpcCall("pet_stay_billing")[1]).toEqual({ p_stay_id: "s1" });
  });

  it("tells staff when a checkout is early", async function () {
    setup();
    fireEvent.click(await screen.findByLabelText("Check out Simba"));
    expect(await screen.findByText(/Leaving 2 nights before the planned check-out/)).toBeTruthy();
    expect(screen.getByText(/full booked stay is still charged/)).toBeTruthy();
  });

  it("warns, but still lets the database decide, when a kennel looks taken", async function () {
    setup();
    await screen.findByLabelText("Check out Simba");
    fireEvent.click(screen.getByText("+ New stay"));
    fireEvent.change(await screen.findByLabelText("Kennel"), { target: { value: "k1" } });
    expect(await screen.findByText(/That kennel looks taken/)).toBeTruthy();
  });

  it("starts a walk-in from an available kennel already set to check in now", async function () {
    setup();
    await screen.findByLabelText("Check in a pet to Cat Condo");
    fireEvent.click(screen.getByLabelText("Check in a pet to Cat Condo"));
    expect((await screen.findByLabelText("Kennel")).value).toBe("k4");
    expect(screen.getByRole("button", { name: "Check in" })).toBeTruthy();
  });

  it("flags an overdue vaccination on the current guest", async function () {
    setup({ vaccs: [{ id: "v1", pet_id: "p1", next_due_on: addDaysKey(T, -30) }] });
    await screen.findByLabelText("Check out Simba");
    expect(screen.getByText("Vaccination overdue")).toBeTruthy();
  });

  it("toggles maintenance through the database function", async function () {
    setup();
    await screen.findByLabelText("Maintenance on Cat Condo");
    fireEvent.click(screen.getByLabelText("Maintenance on Cat Condo"));
    await waitFor(function () { expect(rpcCall("pet_set_kennel_maintenance")[1]).toEqual({ p_id: "k4", p_maintenance: true }); });
    fireEvent.click(screen.getByLabelText("End maintenance on Kennel B1"));
    await waitFor(function () { expect(mockRpc.mock.calls.filter(function (c) { return c[0] === "pet_set_kennel_maintenance"; }).length).toBe(2); });
  });

  it("does not offer maintenance on an occupied kennel", async function () {
    setup();
    await screen.findByLabelText("Check out Simba");
    expect(screen.queryByLabelText("Maintenance on Suite 1")).toBeNull();
  });

  it("adds a kennel, refusing a duplicate name locally", async function () {
    setup();
    await screen.findByLabelText("Check out Simba");
    fireEvent.click(screen.getByText("+ Add kennel"));
    fireEvent.change(await screen.findByLabelText("Kennel name"), { target: { value: " suite 1 " } });
    fireEvent.click(screen.getByRole("button", { name: "Add kennel" }));
    expect(await screen.findByText("You already have a kennel with that name.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Kennel name"), { target: { value: "Suite 2" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "Deluxe suite" } });
    fireEvent.click(screen.getByRole("button", { name: "Add kennel" }));
    await waitFor(function () { expect(rpcCall("pet_save_kennel")[1]).toEqual({ p_id: null, p_name: "Suite 2", p_kind: "Deluxe suite", p_notes: "" }); });
  });

  it("explains why a kennel with history can't be deleted", async function () {
    setup({ rpcError: "KENNEL_HAS_STAYS" });
    await screen.findByLabelText("Delete kennel Kennel A1");
    fireEvent.click(screen.getByLabelText("Delete kennel Kennel A1"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete kennel" }));
    expect(await screen.findByText(/stay history, so it can't be deleted/)).toBeTruthy();
  });
});
