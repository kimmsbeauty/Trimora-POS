import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
vi.mock("../../lib/db", () => ({ db: function () { return mockDb.apply(null, arguments); } }));

import WorkingAs from "./WorkingAs";
import { getPetActor, setPetActor } from "../../lib/petActor";

var AMINA = "123e4567-e89b-12d3-a456-426614174001";
var BRIAN = "123e4567-e89b-12d3-a456-426614174002";
var GONE = "123e4567-e89b-12d3-a456-426614174003";
var STAFF = [
  { id: AMINA, name: "Amina", active: true },
  { id: BRIAN, name: "Brian", active: true },
  { id: GONE, name: "Gone", active: false },
];

describe("WorkingAs (audit attribution picker)", () => {
  beforeEach(() => { sessionStorage.clear(); mockDb.mockReset(); mockDb.mockResolvedValue(STAFF); });

  it("lists active staff only and starts as Not selected", async () => {
    render(<WorkingAs />);
    await waitFor(() => expect(screen.getByLabelText("Working as")).toBeTruthy());
    var opts = Array.from(screen.getByLabelText("Working as").querySelectorAll("option")).map((o) => o.textContent);
    expect(opts).toEqual(["Not selected", "Amina", "Brian"]);
    expect(getPetActor()).toBeNull();
  });
  it("remembers the chosen staff member and can be cleared", async () => {
    render(<WorkingAs />);
    var sel = await screen.findByLabelText("Working as");
    fireEvent.change(sel, { target: { value: AMINA } });
    expect(getPetActor()).toBe(AMINA);
    fireEvent.change(sel, { target: { value: "" } });
    expect(getPetActor()).toBeNull();
  });
  it("drops a remembered actor who is no longer active staff", async () => {
    setPetActor(GONE);
    render(<WorkingAs />);
    await screen.findByLabelText("Working as");
    await waitFor(() => expect(getPetActor()).toBeNull());
  });
  it("keeps a remembered actor who is still active", async () => {
    setPetActor(BRIAN);
    render(<WorkingAs />);
    var sel = await screen.findByLabelText("Working as");
    expect(sel.value).toBe(BRIAN);
    expect(getPetActor()).toBe(BRIAN);
  });
  it("renders nothing (and does not break the shell) when staff cannot be loaded", async () => {
    mockDb.mockResolvedValue(null);
    var r = render(<WorkingAs />);
    await waitFor(() => expect(mockDb).toHaveBeenCalled());
    expect(r.container.querySelector("select")).toBeNull();
  });
  it("queries the shared staff table, tenant-scoped by db()", async () => {
    render(<WorkingAs />);
    await screen.findByLabelText("Working as");
    expect(mockDb.mock.calls[0][0]).toBe("GET");
    expect(mockDb.mock.calls[0][1]).toBe("staff");
  });
});
