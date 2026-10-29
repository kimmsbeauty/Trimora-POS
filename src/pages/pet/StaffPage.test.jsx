import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));

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
    return Promise.resolve(null);
  });
  // RPC answers: a wrong PIN comes back as null (save) or false (delete / assign), exactly as migration 102 does.
  mockRpc.mockImplementation(function (fn, args) {
    if (opts.rpcError) return Promise.resolve({ error: opts.rpcError });
    var good = args.p_admin_pin === (opts.goodPin || "9999");
    if (fn === "pet_save_role") return Promise.resolve({ data: good ? "r9" : null });
    return Promise.resolve({ data: good });
  });
  return render(<StaffPage canEdit={opts.canEdit !== false} />);
}

function typePin(pin) {
  fireEvent.change(screen.getByLabelText("Admin PIN"), { target: { value: pin } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
}
function writes() { return mockDb.mock.calls.filter(function (c) { return c[0] !== "GET"; }); }

describe("StaffPage (roles and assignment)", function () {
  beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

  it("lists roles with counts and active staff only, and states that roles are not enforced", async function () {
    setup();
    expect(await screen.findByLabelText("Edit Groomer")).toBeTruthy();
    expect(screen.getByText("1 of 7 permissions · 1 person")).toBeTruthy();
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

  it("offers only the suggested roles that are missing and adds one with the admin PIN", async function () {
    setup();
    await screen.findByLabelText("Edit Groomer");
    expect(screen.queryByLabelText("Add suggested role Groomer")).toBeNull();
    fireEvent.click(screen.getByLabelText("Add suggested role Receptionist"));
    typePin("9999");
    await screen.findByLabelText("Edit Receptionist");
    var call = mockRpc.mock.calls[0];
    expect(call[0]).toBe("pet_save_role");
    expect(call[1].p_admin_pin).toBe("9999");
    expect(call[1].p_role_id).toBeNull();
    expect(call[1].p_name).toBe("Receptionist");
    expect(call[1].p_permissions.take_payments).toBe(true);
    expect(writes().length).toBe(0); // never a direct table write
  });

  it("asks for the admin PIN before any role call, and a cancelled prompt calls nothing", async function () {
    setup();
    await screen.findByLabelText("Edit Groomer");
    fireEvent.click(screen.getByLabelText("Add suggested role Receptionist"));
    expect(await screen.findByLabelText("Admin PIN")).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(function () { expect(screen.queryByLabelText("Admin PIN")).toBeNull(); });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Edit Receptionist")).toBeNull();
  });

  it("rejects a PIN that is not 4 to 6 digits without calling the server", async function () {
    setup();
    await screen.findByLabelText("Edit Groomer");
    fireEvent.click(screen.getByLabelText("Add suggested role Receptionist"));
    typePin("12");
    expect(await screen.findByText(/4 to 6 digits/)).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("a wrong admin PIN adds nothing and says so", async function () {
    setup();
    await screen.findByLabelText("Edit Groomer");
    fireEvent.click(screen.getByLabelText("Add suggested role Receptionist"));
    typePin("0000");
    expect(await screen.findByText(/admin PIN wasn't accepted/)).toBeTruthy();
    expect(screen.queryByLabelText("Edit Receptionist")).toBeNull();
  });

  it("rejects a duplicate role name without calling the server or asking for a PIN", async function () {
    setup();
    await screen.findByLabelText("Edit Groomer");
    fireEvent.click(screen.getByText("+ Add role"));
    fireEvent.change(screen.getByLabelText("Role name"), { target: { value: " groomer " } });
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    expect(await screen.findByText(/already a role called/)).toBeTruthy();
    expect(screen.queryByLabelText("Admin PIN")).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("creates a custom role and edits an existing one through pet_save_role", async function () {
    setup();
    await screen.findByLabelText("Edit Groomer");
    fireEvent.click(screen.getByText("+ Add role"));
    fireEvent.change(screen.getByLabelText("Role name"), { target: { value: "Senior groomer" } });
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    typePin("9999");
    await screen.findByLabelText("Edit Senior groomer");
    expect(mockRpc.mock.calls[0][1].p_role_id).toBeNull();
    fireEvent.click(screen.getByLabelText("Edit Groomer"));
    fireEvent.change(screen.getByLabelText("Role name"), { target: { value: "Groomer II" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    typePin("9999");
    await screen.findByLabelText("Edit Groomer II");
    expect(mockRpc.mock.calls[1][1].p_role_id).toBe("r1");
    expect(writes().length).toBe(0);
  });

  it("assigns, changes and clears a staff member's role through pet_set_staff_role", async function () {
    setup();
    await screen.findByText("Amina");
    fireEvent.change(screen.getByLabelText("Role for Brian"), { target: { value: "r2" } });
    typePin("9999");
    await waitFor(function () { expect(screen.getByLabelText("Role for Brian").value).toBe("r2"); });
    expect(mockRpc.mock.calls[0][0]).toBe("pet_set_staff_role");
    expect(mockRpc.mock.calls[0][1].p_staff_id).toBe("s2");
    expect(mockRpc.mock.calls[0][1].p_role_id).toBe("r2");
    fireEvent.change(screen.getByLabelText("Role for Amina"), { target: { value: "r2" } });
    typePin("9999");
    await waitFor(function () { expect(screen.getByLabelText("Role for Amina").value).toBe("r2"); });
    fireEvent.change(screen.getByLabelText("Role for Amina"), { target: { value: "" } });
    typePin("9999");
    await waitFor(function () { expect(screen.getByLabelText("Role for Amina").value).toBe(""); });
    expect(mockRpc.mock.calls[2][1].p_role_id).toBeNull();
    expect(writes().length).toBe(0);
  });

  it("does not show a role as assigned when the PIN is wrong", async function () {
    setup();
    await screen.findByText("Amina");
    fireEvent.change(screen.getByLabelText("Role for Brian"), { target: { value: "r2" } });
    typePin("0000");
    expect(await screen.findByText(/Couldn't change the role for Brian/)).toBeTruthy();
    expect(screen.getByLabelText("Role for Brian").value).toBe("");
  });

  it("shows a server error such as a network failure without changing the list", async function () {
    setup({ rpcError: "Network error" });
    await screen.findByText("Amina");
    fireEvent.change(screen.getByLabelText("Role for Brian"), { target: { value: "r2" } });
    typePin("9999");
    expect(await screen.findByText(/Network error/)).toBeTruthy();
    expect(screen.getByLabelText("Role for Brian").value).toBe("");
  });

  it("blocks deleting a role that is still assigned", async function () {
    setup();
    await screen.findByLabelText("Edit Groomer");
    fireEvent.click(screen.getByLabelText("Delete Groomer"));
    expect(await screen.findByText("Can't delete Groomer yet")).toBeTruthy();
    expect(screen.queryByText("Delete role")).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("deletes an unassigned role with the admin PIN", async function () {
    setup();
    await screen.findByLabelText("Edit Manager");
    fireEvent.click(screen.getByLabelText("Delete Manager"));
    fireEvent.click(await screen.findByText("Delete role"));
    typePin("9999");
    await waitFor(function () { expect(screen.queryByLabelText("Edit Manager")).toBeNull(); });
    expect(mockRpc.mock.calls[0][0]).toBe("pet_delete_role");
    expect(mockRpc.mock.calls[0][1].p_role_id).toBe("r2");
  });

  it("keeps a role when the delete PIN is wrong", async function () {
    setup();
    await screen.findByLabelText("Edit Manager");
    fireEvent.click(screen.getByLabelText("Delete Manager"));
    fireEvent.click(await screen.findByText("Delete role"));
    typePin("0000");
    expect(await screen.findByText(/admin PIN wasn't accepted/)).toBeTruthy();
    expect(screen.getByLabelText("Edit Manager")).toBeTruthy();
  });
});
