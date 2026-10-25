import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));

import PetsPage from "./PetsPage";

var OWNERS = [{ id: "c1", name: "Wanjiru Kamau", phone: "0701" }, { id: "c2", name: "James Mwangi", phone: "0705" }];
var PETS = [
  { id: "p1", customer_id: "c1", name: "Simba", species: "Dog", breed: "Golden Retriever", sex: "Male", date_of_birth: "2020-01-01", care_notes: "Likes treats" },
  { id: "p2", customer_id: "c2", name: "Nala", species: "Cat", breed: "Tabby", sex: "Female", date_of_birth: null, care_notes: null },
];
var VACCS = [{ id: "v1", pet_id: "p1", vaccine: "Rabies", given_on: "2024-01-01", next_due_on: "2024-06-01" }];

function setup(opts) {
  opts = opts || {};
  mockDb.mockImplementation(function (method, table, data, filters) {
    if (method === "GET" && table === "pet_pets") return Promise.resolve(opts.petsFail ? null : (opts.pets || PETS));
    if (method === "GET" && table === "customers") return Promise.resolve(OWNERS);
    if (method === "GET" && table === "pet_vaccinations") return Promise.resolve(opts.vaccs || VACCS);
    if (method === "GET" && table === "pet_reminder_settings") return Promise.resolve(opts.reminders === undefined ? null : opts.reminders);
    if (method === "POST" && table === "pet_pets") return Promise.resolve(opts.postFail ? null : [Object.assign({ id: "p9" }, data)]);
    if (method === "GET" && (table === "pet_bookings" || table === "pet_boarding_stays" || table === "pet_invoices")) {
      if (opts.historyFail) return Promise.resolve(null);
      return Promise.resolve((opts.history && opts.history[table]) || []);
    }
    if (method === "DELETE") return Promise.resolve(true);
    if (method === "PATCH") return Promise.resolve(true);
    return Promise.resolve(null);
  });
  return render(<PetsPage />);
}

describe("PetsPage", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); mockRpc.mockResolvedValue({ data: true }); });

  it("lists real pets with owner and an overdue vaccination badge", async function () {
    setup();
    expect(await screen.findByText("Simba")).toBeTruthy();
    expect(screen.getByText("Owner: Wanjiru Kamau")).toBeTruthy();
    expect(screen.getByText("Vaccination overdue")).toBeTruthy();
    expect(screen.getByText("Nala")).toBeTruthy();
  });

  it("shows an error with retry (not an empty list) when loading fails", async function () {
    setup({ petsFail: true });
    expect(await screen.findByText("Couldn't load pets")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.queryByText("No pets yet")).toBeNull();
  });

  it("shows an honest empty state when there are no pets", async function () {
    setup({ pets: [] });
    expect(await screen.findByText("No pets yet")).toBeTruthy();
  });

  it("filters by pet or owner name and by species", async function () {
    setup();
    await screen.findByText("Simba");
    fireEvent.change(screen.getByLabelText("Search pets by pet or owner name"), { target: { value: "james" } });
    expect(screen.queryByText("Simba")).toBeNull();
    expect(screen.getByText("Nala")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search pets by pet or owner name"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter by species"), { target: { value: "Dog" } });
    expect(screen.queryByText("Nala")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search pets by pet or owner name"), { target: { value: "zzz" } });
    expect(screen.getByText("No pets found")).toBeTruthy();
  });

  it("validates before saving and does not call the database", async function () {
    setup();
    await screen.findByText("Simba");
    fireEvent.click(screen.getByText("+ Add pet"));
    var dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add pet" }));
    expect(await screen.findByText("Pet name is required.")).toBeTruthy();
    expect(mockDb.mock.calls.filter(function (c) { return c[0] === "POST"; }).length).toBe(0);
  });

  it("refuses a duplicate pet for the same owner", async function () {
    setup();
    await screen.findByText("Simba");
    fireEvent.click(screen.getByText("+ Add pet"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "simba" } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "c1" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add pet" }));
    expect(await screen.findByText(/already has a dog named simba/i)).toBeTruthy();
  });

  it("adds a pet and shows it in the list", async function () {
    setup();
    await screen.findByText("Simba");
    fireEvent.click(screen.getByText("+ Add pet"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Rex" } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "c2" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add pet" }));
    expect(await screen.findByText("Rex")).toBeTruthy();
    var post = mockDb.mock.calls.filter(function (c) { return c[0] === "POST" && c[1] === "pet_pets"; })[0];
    expect(post[2].name).toBe("Rex"); expect(post[2].customer_id).toBe("c2");
  });

  it("keeps the form open with an error if saving fails", async function () {
    setup({ postFail: true });
    await screen.findByText("Simba");
    fireEvent.click(screen.getByText("+ Add pet"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Rex" } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "c2" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add pet" }));
    expect(await screen.findByText(/Couldn't save the pet/)).toBeTruthy();
    expect(screen.queryByText("Rex")).toBeNull();
  });

  it("asks for confirmation before deleting, then removes the pet", async function () {
    setup();
    await screen.findByText("Simba");
    fireEvent.click(screen.getByLabelText("Delete Simba"));
    expect(screen.getByText("Delete Simba?")).toBeTruthy();
    expect(mockDb.mock.calls.filter(function (c) { return c[0] === "DELETE"; }).length).toBe(0);
    fireEvent.click(screen.getByText("Delete pet"));
    await waitFor(function () { expect(screen.queryByText("Simba")).toBeNull(); });
    var del = mockDb.mock.calls.filter(function (c) { return c[0] === "DELETE"; })[0];
    expect(del[1]).toBe("pet_pets"); expect(del[3]).toBe("?id=eq.p1");
  });

  it("explains why a pet with history can't be deleted and never sends the delete", async function () {
    setup({ history: { pet_bookings: [{ id: "b1" }, { id: "b2" }], pet_invoices: [{ id: "i1" }] } });
    await screen.findByText("Simba");
    fireEvent.click(screen.getByLabelText("Delete Simba"));
    fireEvent.click(screen.getByText("Delete pet"));
    expect(await screen.findByText(/Simba has 2 bookings and 1 invoice/)).toBeTruthy();
    expect(screen.getByText(/kept for your history and finances/)).toBeTruthy();
    expect(screen.queryByText("Delete pet")).toBeNull();
    expect(mockDb.mock.calls.filter(function (c) { return c[0] === "DELETE"; }).length).toBe(0);
    expect(screen.getByText("Simba")).toBeTruthy();
  });

  it("does not delete when the history check itself fails", async function () {
    setup({ historyFail: true });
    await screen.findByText("Simba");
    fireEvent.click(screen.getByLabelText("Delete Simba"));
    fireEvent.click(screen.getByText("Delete pet"));
    expect(await screen.findByText(/Couldn't check this pet's booking and invoice history, so nothing was deleted/)).toBeTruthy();
    expect(mockDb.mock.calls.filter(function (c) { return c[0] === "DELETE"; }).length).toBe(0);
  });

  it("shows vaccination records with status on the profile", async function () {
    setup();
    await screen.findByText("Simba");
    fireEvent.click(screen.getByLabelText("View profile of Simba"));
    var dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Rabies")).toBeTruthy();
    expect(within(dialog).getByText("Overdue")).toBeTruthy();
  });

  it("does not offer any allergy or medical field", async function () {
    setup();
    await screen.findByText("Simba");
    fireEvent.click(screen.getByText("+ Add pet"));
    expect(screen.queryByLabelText(/allerg|medical/i)).toBeNull();
  });

  var ARCHIVED = Object.assign({}, PETS[1], { archived_at: "2026-09-01T10:00:00Z", archived_reason: "moved-away" });

  it("hides archived pets by default and shows them (with the reason) under Archived pets", async function () {
    setup({ pets: [PETS[0], ARCHIVED] });
    await screen.findByText("Simba");
    expect(screen.queryByText("Nala")).toBeNull();
    fireEvent.change(screen.getByLabelText("Show pets"), { target: { value: "archived" } });
    expect(screen.getByText("Nala")).toBeTruthy();
    expect(screen.queryByText("Simba")).toBeNull();
    expect(screen.getByText(/Archived · Moved away/)).toBeTruthy();
    expect(screen.getByLabelText("Restore Nala")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Show pets"), { target: { value: "all" } });
    expect(screen.getByText("Simba")).toBeTruthy(); expect(screen.getByText("Nala")).toBeTruthy();
  });

  it("archives with a required reason through the database function, keeping the record", async function () {
    setup();
    await screen.findByText("Simba");
    fireEvent.click(screen.getByLabelText("Archive Simba"));
    expect(screen.getByText(/Nothing is deleted: bookings, payments, grooming and medical history stay on record/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Archive pet" }));
    expect(await screen.findByText("Choose why this pet is being archived.")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "passed-away" } });
    fireEvent.click(screen.getByRole("button", { name: "Archive pet" }));
    await waitFor(function () { expect(screen.queryByText("Simba")).toBeNull(); });
    expect(mockRpc).toHaveBeenCalledWith("pet_set_archived", { p_id: "p1", p_archived: true, p_reason: "passed-away" });
    expect(mockDb.mock.calls.filter(function (c) { return c[0] === "DELETE"; }).length).toBe(0);
    fireEvent.change(screen.getByLabelText("Show pets"), { target: { value: "archived" } });
    expect(screen.getByText(/Archived · Passed away/)).toBeTruthy();
  });

  it("explains what to do first when the pet still has an open booking, and keeps the pet", async function () {
    mockRpc.mockResolvedValue({ error: "PET_HAS_OPEN_BOOKINGS" });
    setup();
    await screen.findByText("Simba");
    fireEvent.click(screen.getByLabelText("Archive Simba"));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "inactive" } });
    fireEvent.click(screen.getByRole("button", { name: "Archive pet" }));
    expect(await screen.findByText(/Complete or cancel it in Calendar first, then archive the pet/)).toBeTruthy();
    expect(screen.getByLabelText("Archive Simba")).toBeTruthy();
  });

  it("restores an archived pet to the active list", async function () {
    setup({ pets: [PETS[0], ARCHIVED] });
    await screen.findByText("Simba");
    fireEvent.change(screen.getByLabelText("Show pets"), { target: { value: "archived" } });
    fireEvent.click(screen.getByLabelText("Restore Nala"));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_set_archived", { p_id: "p2", p_archived: false }); });
    await waitFor(function () { expect(screen.queryByText("Nala")).toBeNull(); });
    fireEvent.change(screen.getByLabelText("Show pets"), { target: { value: "active" } });
    expect(screen.getByText("Nala")).toBeTruthy();
  });

  it("offers Archive instead when a delete is blocked by history", async function () {
    setup({ history: { pet_bookings: [{ id: "b1" }] } });
    await screen.findByText("Simba");
    fireEvent.click(screen.getByLabelText("Delete Simba"));
    fireEvent.click(screen.getByText("Delete pet"));
    expect(await screen.findByText(/Archive the pet instead/)).toBeTruthy();
    fireEvent.click(screen.getByText("Archive instead"));
    expect(await screen.findByText("Archive Simba?")).toBeTruthy();
  });

  it("uses a record type's own reminder window for the vaccine badge", async function () {
    var due = new Date(); due.setDate(due.getDate() + 40);
    var iso = due.getFullYear() + "-" + String(due.getMonth() + 1).padStart(2, "0") + "-" + String(due.getDate()).padStart(2, "0");
    var vaccs = [{ id: "v9", pet_id: "p1", vaccine: "Rabies", given_on: "2025-01-01", next_due_on: iso }];
    var first = setup({ vaccs: vaccs });
    await screen.findByText("Simba");
    expect(screen.getByText("Vaccine due soon")).toBeTruthy(); // 40 days is inside the six-month default
    first.unmount();
    setup({ vaccs: vaccs, reminders: [{ id: "r1", record_type: "rabies", window_days: 30 }] });
    await screen.findByText("Simba");
    expect(screen.queryByText("Vaccine due soon")).toBeNull();   // outside Rabies' own 30-day window
  });

  it("still flags an expired date separately, whatever the window", async function () {
    setup({ reminders: [{ id: "r1", record_type: "Rabies", window_days: 30 }] });
    await screen.findByText("Simba");
    expect(screen.getByText("Vaccination overdue")).toBeTruthy();
    expect(screen.queryByText("Vaccine due soon")).toBeNull();
  });
});
