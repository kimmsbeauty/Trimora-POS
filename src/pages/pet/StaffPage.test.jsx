import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
vi.mock("../../lib/db", () => ({ db: function () { return mockDb.apply(null, arguments); } }));

import StaffPage from "./StaffPage";

var ROLES = [
  { id: "r1", name: "Groomer", description: "Works the board", permissions: { manage_bookings: true } },
  { id: "r2", name: "Manager", description: null, permissions: {} },
];
var STAFF = [
  { id: "s1", name: "Amina", role: "Stylist", active: true },
  { id: "s2", name: "Brian", role: "", active: true },
  { id: "s3", name: "Gone", role: "", active: false },
];
var ASSIGN = [{ id: "a1", salon_id: "x", staff_id: "s1", role_id: "r1" }];

function setup(opts) {
  opts = opts || {};
  mockDb.mockImplementation(function (method, table, data, qs) {
    if (method === "GET" && table === "pet_roles") return Promise.resolve(opts.getFail ? null : (opts.roles || ROLES));
    if (method === "GET" && table === "staff") return Promise.resolve(STAFF);
    if (method === "GET" && table === "pet_staff_roles") return Promise.resolve(opts.assign || ASSIGN);
    if (method === "POST" && table === "pet_roles") return Promise.resolve(opts.postFail ? null : [Object.assign({ id: "r9" }, data)]);
    if (method === "POST" && table === "pet_staff_roles") return Promise.resolve(opts.postFail ? null : [Object.assign({ id: "a9" }, data)]);
    if (method === "PATCH") return Promise.resolve(opts.patchFail ? null : true);
    if (method === "DELETE") return Promise.resolve(true);
    return Promise.resolve(null);
  });
  return render(<StaffPage canEdit={opts.canEdit !== false} />);
}

describe("StaffPage (roles and assignment)", function () {
  beforeEach(function () { mockDb.mockReset(); });

  it("lists roles with counts and active staff only, and states that roles are not enforced", async function () {
    setup();
    expect(await screen.findByLabelText("Edit Groomer")).toBeTruthy();
    expect(screen.getByText("1 of 6 permissions · 1 person")).toBeTruthy();
    expect(screen.getByText("Amina")).toBeTruthy();
    expect(screen.queryByText("Gone")).toBeNull();
    expect(screen.getByText(/not yet enforced/)).toBeTruthy();
  });

  it("shows an error with retry, not an empty list, when loading fails", async function () {
    setup({ getFail: true });
    expect(await screen.findByText("Couldn't load roles")).toBeTruthy();
    expect(screen.queryByText("No roles yet")).toBeNull();
  });

  it("hides edit controls from non-admins", async function () {
    setup({ canEdit: false });
    await screen.findByText("Amina");
    expect(screen.queryByText("+ Add role")).toBeNull();
    expect(screen.queryByLabelText("Edit Groomer")).toBeNull();
    expect(screen.queryByLabelText("Role for Amina")).toBeNull();
  });

  it("offers only the suggested roles that are missing and adds one on click", async function () {
    setup();
    await screen.findByLabelText("Edit Groomer");
    expect(screen.queryByLabelText("Add suggested role Groomer")).toBeNull();
    fireEvent.click(screen.getByLabelText("Add suggested role Receptionist"));
    await screen.findByLabelText("Edit Receptionist");
    var call = mockDb.mock.calls.filter(function (c) { return c[0] === "POST" && c[1] === "pet_roles"; })[0];
    expect(call[2].name).toBe("Receptionist");
    expect(call[2].permissions.take_payments).toBe(true);
  });

  it("rejects a duplicate role name without calling the database", async function () {
    setup();
    await screen.findByLabelText("Edit Groomer");
    fireEvent.click(screen.getByText("+ Add role"));
    fireEvent.change(screen.getByLabelText("Role name"), { target: { value: " groomer " } });
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    expect(await screen.findByText(/already a role called/)).toBeTruthy();
    expect(mockDb.mock.calls.filter(function (c) { return c[0] === "POST"; }).length).toBe(0);
  });

  it("assigns, changes and clears a staff member's role", async function () {
    setup();
    await screen.findByText("Amina");
    fireEvent.change(screen.getByLabelText("Role for Brian"), { target: { value: "r2" } });
    await waitFor(function () { expect(mockDb.mock.calls.some(function (c) { return c[0] === "POST" && c[1] === "pet_staff_roles" && c[2].staff_id === "s2" && c[2].role_id === "r2"; })).toBe(true); });
    fireEvent.change(screen.getByLabelText("Role for Amina"), { target: { value: "r2" } });
    await waitFor(function () { expect(mockDb.mock.calls.some(function (c) { return c[0] === "PATCH" && c[1] === "pet_staff_roles" && c[3] === "?id=eq.a1"; })).toBe(true); });
    fireEvent.change(screen.getByLabelText("Role for Amina"), { target: { value: "" } });
    await waitFor(function () { expect(mockDb.mock.calls.some(function (c) { return c[0] === "DELETE" && c[1] === "pet_staff_roles" && c[3] === "?id=eq.a1"; })).toBe(true); });
  });

  it("does not show a role as assigned when the save fails", async function () {
    setup({ postFail: true });
    await screen.findByText("Amina");
    fireEvent.change(screen.getByLabelText("Role for Brian"), { target: { value: "r2" } });
    expect(await screen.findByText(/Couldn't assign the role to Brian/)).toBeTruthy();
    expect(screen.getByLabelText("Role for Brian").value).toBe("");
  });

  it("blocks deleting a role that is still assigned", async function () {
    setup();
    await screen.findByLabelText("Edit Groomer");
    fireEvent.click(screen.getByLabelText("Delete Groomer"));
    expect(await screen.findByText("Can't delete Groomer yet")).toBeTruthy();
    expect(screen.queryByText("Delete role")).toBeNull();
    expect(mockDb.mock.calls.filter(function (c) { return c[0] === "DELETE"; }).length).toBe(0);
  });

  it("deletes an unassigned role", async function () {
    setup();
    await screen.findByLabelText("Edit Manager");
    fireEvent.click(screen.getByLabelText("Delete Manager"));
    fireEvent.click(await screen.findByText("Delete role"));
    await waitFor(function () { expect(mockDb.mock.calls.some(function (c) { return c[0] === "DELETE" && c[1] === "pet_roles" && c[3] === "?id=eq.r2"; })).toBe(true); });
  });
});
