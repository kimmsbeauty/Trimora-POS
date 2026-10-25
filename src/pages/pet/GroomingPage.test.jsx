import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
vi.mock("../../lib/db", () => ({ db: function () { return mockDb.apply(null, arguments); } }));

import GroomingPage from "./GroomingPage";

var SERVICES = [
  { id: "s1", name: "Full groom", category: "Grooming", price: 1500, duration_minutes: 90, species: ["Dog"], description: "Bath, cut, dry", active: true },
  { id: "s2", name: "Nail trim", category: "Add-on", price: 300, duration_minutes: 15, species: [], description: null, active: true },
  { id: "s3", name: "Old special", category: "Grooming", price: 900, duration_minutes: null, species: [], description: null, active: false },
];

function setup(opts) {
  opts = opts || {};
  mockDb.mockImplementation(function (method, table, data) {
    if (method === "GET" && table === "pet_services") return Promise.resolve(opts.getFail ? null : (opts.services || SERVICES));
    if (method === "POST" && table === "pet_services") return Promise.resolve(opts.postFail ? null : [Object.assign({ id: "s9", active: true }, data)]);
    if (method === "PATCH") return Promise.resolve(opts.patchFail ? null : true);
    if (method === "GET" && (table === "pet_booking_services" || table === "pet_invoice_lines")) {
      if (opts.historyFail) return Promise.resolve(null);
      return Promise.resolve((opts.history && opts.history[table]) || []);
    }
    if (method === "DELETE") return Promise.resolve(true);
    return Promise.resolve(null);
  });
  return render(<GroomingPage canEdit={opts.canEdit !== false} />);
}

describe("GroomingPage (service catalogue)", function () {
  beforeEach(function () { mockDb.mockReset(); });

  it("lists active services with price and details, hiding inactive ones", async function () {
    setup();
    expect(await screen.findByText("Full groom")).toBeTruthy();
    expect(screen.getByText("KES 1,500")).toBeTruthy();
    expect(screen.getByText("Grooming · 1 h 30 min · Dog")).toBeTruthy();
    expect(screen.getByText("Nail trim")).toBeTruthy();
    expect(screen.queryByText("Old special")).toBeNull();
    fireEvent.click(screen.getByLabelText(/Show inactive/));
    expect(screen.getByText("Old special")).toBeTruthy();
  });

  it("shows an error with retry (not an empty list) when loading fails", async function () {
    setup({ getFail: true });
    expect(await screen.findByText("Couldn't load services")).toBeTruthy();
    expect(screen.queryByText("No services yet")).toBeNull();
  });

  it("shows an honest empty state", async function () {
    setup({ services: [] });
    expect(await screen.findByText("No services yet")).toBeTruthy();
  });

  it("hides add/edit/delete controls when the user cannot edit", async function () {
    setup({ canEdit: false });
    await screen.findByText("Full groom");
    expect(screen.queryByText("+ Add service")).toBeNull();
    expect(screen.queryByLabelText("Edit Full groom")).toBeNull();
  });

  it("filters by category", async function () {
    setup();
    await screen.findByText("Full groom");
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "Add-on" } });
    expect(screen.queryByText("Full groom")).toBeNull();
    expect(screen.getByText("Nail trim")).toBeTruthy();
  });

  it("blocks a negative price and a duplicate name before saving", async function () {
    setup();
    await screen.findByText("Full groom");
    fireEvent.click(screen.getAllByText("+ Add service")[0]);
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Bath" } });
    fireEvent.change(screen.getByLabelText("Price (KES)"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    expect(await screen.findByText(/whole number of shillings/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: " full GROOM " } });
    fireEvent.change(screen.getByLabelText("Price (KES)"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    expect(await screen.findByText(/already a Grooming service called/)).toBeTruthy();
    expect(mockDb.mock.calls.some(function (c) { return c[0] === "POST"; })).toBe(false);
  });

  it("saves a new service with a numeric price", async function () {
    setup();
    await screen.findByText("Full groom");
    fireEvent.click(screen.getAllByText("+ Add service")[0]);
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Bath" } });
    fireEvent.change(screen.getByLabelText("Price (KES)"), { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    expect(await screen.findByText("KES 800")).toBeTruthy();
    var post = mockDb.mock.calls.filter(function (c) { return c[0] === "POST"; })[0];
    expect(post[2].price).toBe(800);
    expect(post[2].duration_minutes).toBeNull();
  });

  it("shows an error and keeps the form open when saving fails", async function () {
    setup({ postFail: true });
    await screen.findByText("Full groom");
    fireEvent.click(screen.getAllByText("+ Add service")[0]);
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Bath" } });
    fireEvent.change(screen.getByLabelText("Price (KES)"), { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    expect(await screen.findByText("Couldn't save the service. Check your connection and try again.")).toBeTruthy();
    expect(screen.getByLabelText("Service name").value).toBe("Bath");
  });

  it("deactivating updates only the active flag", async function () {
    setup();
    await screen.findByText("Full groom");
    fireEvent.click(screen.getByLabelText("Deactivate Full groom"));
    await screen.findByText("Nail trim");
    var patch = mockDb.mock.calls.filter(function (c) { return c[0] === "PATCH"; })[0];
    expect(patch[2]).toEqual({ active: false });
    expect(patch[3]).toBe("?id=eq.s1");
  });

  it("deletes a service with no history after the history check", async function () {
    setup();
    await screen.findByText("Nail trim");
    fireEvent.click(screen.getByLabelText("Delete Nail trim"));
    fireEvent.click(screen.getByText("Delete service"));
    await waitFor(function () { expect(screen.queryByText("Nail trim")).toBeNull(); });
    var del = mockDb.mock.calls.filter(function (c) { return c[0] === "DELETE"; });
    expect(del.length).toBe(1); expect(del[0][1]).toBe("pet_services"); expect(del[0][3]).toBe("?id=eq.s2");
  });

  it("explains a blocked delete, never sends it, and offers Deactivate instead", async function () {
    setup({ history: { pet_booking_services: [{ id: "x" }, { id: "y" }, { id: "z" }], pet_invoice_lines: [{ id: "l1" }] } });
    await screen.findByText("Full groom");
    fireEvent.click(screen.getByLabelText("Delete Full groom"));
    fireEvent.click(screen.getByText("Delete service"));
    expect(await screen.findByText(/used in 3 bookings and 1 invoice line/)).toBeTruthy();
    expect(screen.getByText(/Deactivate it instead/)).toBeTruthy();
    expect(screen.queryByText("Delete service")).toBeNull();
    expect(mockDb.mock.calls.filter(function (c) { return c[0] === "DELETE"; }).length).toBe(0);
    fireEvent.click(screen.getByText("Deactivate instead"));
    await waitFor(function () {
      var patch = mockDb.mock.calls.filter(function (c) { return c[0] === "PATCH"; })[0];
      expect(patch[1]).toBe("pet_services"); expect(patch[2]).toEqual({ active: false }); expect(patch[3]).toBe("?id=eq.s1");
    });
  });

  it("does not delete when the history check fails", async function () {
    setup({ historyFail: true });
    await screen.findByText("Nail trim");
    fireEvent.click(screen.getByLabelText("Delete Nail trim"));
    fireEvent.click(screen.getByText("Delete service"));
    expect(await screen.findByText(/nothing was deleted/)).toBeTruthy();
    expect(mockDb.mock.calls.filter(function (c) { return c[0] === "DELETE"; }).length).toBe(0);
  });
});
