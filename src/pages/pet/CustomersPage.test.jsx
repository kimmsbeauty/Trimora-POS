import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
vi.mock("../../lib/db", () => ({ db: function () { return mockDb.apply(null, arguments); } }));

import CustomersPage from "./CustomersPage";

var CUSTOMERS = [
  { id: "c1", name: "Wanjiru Kamau", phone: "0712345678", visit_count: 3, last_visit: "2026-10-01", marketing_opt_out: false },
  { id: "c2", name: "James Mwangi", phone: "0705111222", visit_count: 1, last_visit: "2026-09-01", marketing_opt_out: true },
];
var PROFILES = [{ id: "pr1", customer_id: "c1", email: "wanjiru@example.com", preferred_channels: ["sms"], emergency_contact_name: "Ann", emergency_contact_phone: "0799000111" }];
var PETS = [{ id: "p1", customer_id: "c1", name: "Simba", species: "Dog", breed: "Golden Retriever" }];

function setup(opts) {
  opts = opts || {};
  mockDb.mockImplementation(function (method, table, data) {
    if (method === "GET" && table === "customers") return Promise.resolve(opts.customersFail ? null : (opts.customers || CUSTOMERS));
    if (method === "GET" && table === "pet_customer_profiles") return Promise.resolve(opts.profilesFail ? null : PROFILES);
    if (method === "GET" && table === "pet_pets") return Promise.resolve(PETS);
    if (method === "POST" && table === "customers") return Promise.resolve(opts.postFail ? null : [Object.assign({ id: "c9" }, data)]);
    if (method === "POST" && table === "pet_customer_profiles") return Promise.resolve(opts.profilePostFail ? null : [Object.assign({ id: "pr9" }, data)]);
    if (method === "PATCH") return Promise.resolve(true);
    return Promise.resolve(null);
  });
  return render(<CustomersPage />);
}

describe("CustomersPage", function () {
  beforeEach(function () { mockDb.mockReset(); });

  it("lists real customers with pets, channel and opt-out badges", async function () {
    setup();
    expect(await screen.findByText("Wanjiru Kamau")).toBeTruthy();
    expect(screen.getByText("Pets: Simba")).toBeTruthy();
    expect(screen.getByText("SMS")).toBeTruthy();
    expect(screen.getByText("Opted out of marketing")).toBeTruthy();
  });

  it("shows an error with retry (not an empty list) when loading fails", async function () {
    setup({ profilesFail: true });
    expect(await screen.findByText("Couldn't load customers")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.queryByText("No customers yet")).toBeNull();
  });

  it("shows an honest empty state when there are no customers", async function () {
    setup({ customers: [] });
    expect(await screen.findByText("No customers yet")).toBeTruthy();
  });

  it("searches by pet name", async function () {
    setup();
    await screen.findByText("Wanjiru Kamau");
    fireEvent.change(screen.getByLabelText(/Search customers/), { target: { value: "simba" } });
    expect(screen.getByText("Wanjiru Kamau")).toBeTruthy();
    expect(screen.queryByText("James Mwangi")).toBeNull();
  });

  it("blocks an invalid email before saving", async function () {
    setup();
    await screen.findByText("Wanjiru Kamau");
    fireEvent.click(screen.getAllByText("+ Add customer")[0]);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New Person" } });
    fireEvent.change(screen.getByLabelText("Email (optional)"), { target: { value: "bad@" } });
    fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeTruthy();
    expect(mockDb.mock.calls.some(function (c) { return c[0] === "POST"; })).toBe(false);
  });

  it("blocks a duplicate phone number", async function () {
    setup();
    await screen.findByText("Wanjiru Kamau");
    fireEvent.click(screen.getAllByText("+ Add customer")[0]);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Someone Else" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0712 345 678" } });
    fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
    expect(await screen.findByText("A customer with that phone number already exists.")).toBeTruthy();
  });

  it("saves a new customer and writes contact details to the profile table", async function () {
    setup();
    await screen.findByText("Wanjiru Kamau");
    fireEvent.click(screen.getAllByText("+ Add customer")[0]);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Zawadi Otieno" } });
    fireEvent.change(screen.getByLabelText("Email (optional)"), { target: { value: "Zawadi@Example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
    expect(await screen.findByText("Zawadi Otieno")).toBeTruthy();
    var post = mockDb.mock.calls.filter(function (c) { return c[0] === "POST" && c[1] === "pet_customer_profiles"; })[0];
    expect(post[2].customer_id).toBe("c9");
    expect(post[2].email).toBe("zawadi@example.com");
  });

  it("keeps the form open with a clear message when only the contact details fail", async function () {
    setup({ profilePostFail: true });
    await screen.findByText("Wanjiru Kamau");
    fireEvent.click(screen.getAllByText("+ Add customer")[0]);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Zawadi Otieno" } });
    fireEvent.change(screen.getByLabelText("Address (optional)"), { target: { value: "Karen" } });
    fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
    expect(await screen.findByText(/customer was saved, but the contact details weren't/)).toBeTruthy();
    // retry must not create a second customer
    expect(mockDb.mock.calls.filter(function (c) { return c[0] === "POST" && c[1] === "customers"; }).length).toBe(1);
  });
});
