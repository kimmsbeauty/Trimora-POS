import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

var mockDb = vi.fn();
vi.mock("../../lib/db", () => ({ db: function () { return mockDb.apply(null, arguments); } }));

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
    if (method === "GET" && table === "pet_vaccinations") return Promise.resolve(VACCS);
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
  beforeEach(function () { mockDb.mockReset(); });

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
});
