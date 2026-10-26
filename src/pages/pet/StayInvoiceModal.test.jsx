import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";

var mockRpc = vi.fn();
vi.mock("../../lib/db", function () { return { dbRpcAuth: function () { return mockRpc.apply(null, arguments); } }; });

import StayInvoiceModal from "./StayInvoiceModal";

var stay = { id: "s1", pet_id: "p1" };
var BILL = { status: "checked-out", nights: 4, late_days: 3, nightly_rate: 2000, service_name: "Standard night", nights_total: 8000, late_total: 6000, total: 14000, checked_out_on: "2030-01-08", invoice_id: null, invoice_number: null };
function mount(billing, onCreated) {
  mockRpc.mockImplementation(function (name) {
    if (name === "pet_stay_billing") return Promise.resolve({ data: [billing || BILL] });
    return Promise.resolve({ data: "inv-1" });
  });
  return render(<StayInvoiceModal stay={stay} petName="Simba" ownerName="Wanjiru" onClose={function () {}} onCreated={onCreated || function () {}} />);
}
function call(name) { return mockRpc.mock.calls.filter(function (c) { return c[0] === name; })[0]; }

describe("StayInvoiceModal", function () {
  beforeEach(function () { mockRpc.mockReset(); });

  it("suggests the database's charge: full booked stay plus late days as extra nights", async function () {
    mount();
    expect(await screen.findByText(/4 nights x/)).toBeTruthy();
    expect(screen.getByText(/3 late days x/)).toBeTruthy();
    expect(screen.getByLabelText(/Late days to charge/).value).toBe("3");
    expect(screen.getByText(/full booked stay is always charged/)).toBeTruthy();
  });

  it("sends the late days staff chose and never more than the database allows", async function () {
    mount();
    var input = await screen.findByLabelText(/Late days to charge/);
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    await waitFor(function () { expect(call("pet_invoice_stay")).toBeTruthy(); });
    expect(call("pet_invoice_stay")[1]).toMatchObject({ p_stay_id: "s1", p_late_days: 1, p_discount_type: "amount", p_discount_value: 0 });
    fireEvent.change(input, { target: { value: "99" } });
  });

  it("can waive the late charge entirely", async function () {
    mount();
    fireEvent.change(await screen.findByLabelText(/Late days to charge/), { target: { value: "0" } });
    expect(screen.getByText("Late charge waived")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    await waitFor(function () { expect(call("pet_invoice_stay")[1].p_late_days).toBe(0); });
  });

  it("clamps an over-large entry down to the suggestion", async function () {
    mount();
    var input = await screen.findByLabelText(/Late days to charge/);
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.blur(input);
    expect(input.value).toBe("3");
  });

  it("shows no late field for an on-time stay, and sends a discount", async function () {
    mount(Object.assign({}, BILL, { late_days: 0 }));
    expect(await screen.findByText("Collected on time")).toBeTruthy();
    expect(screen.queryByLabelText(/Late days to charge/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Discount (optional)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    await waitFor(function () { expect(call("pet_invoice_stay")[1]).toMatchObject({ p_late_days: 0, p_discount_value: 500 }); });
  });

  it("tells staff when the stay is already billed instead of offering to bill it again", async function () {
    mount(Object.assign({}, BILL, { invoice_id: "i1", invoice_number: "INV-0007" }));
    expect(await screen.findByText("INV-0007")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create invoice" })).toBeNull();
  });

  it("shows the database's reason when billing is refused, and confirms success", async function () {
    mount();
    mockRpc.mockImplementation(function (name) {
      if (name === "pet_stay_billing") return Promise.resolve({ data: [BILL] });
      return Promise.resolve({ error: "STAY_ALREADY_INVOICED" });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Create invoice" }));
    expect(await screen.findByText(/already has an invoice/)).toBeTruthy();
  });

  it("creates the invoice once and reports success", async function () {
    var created = vi.fn();
    mount(null, created);
    fireEvent.click(await screen.findByRole("button", { name: "Create invoice" }));
    expect(await screen.findByText(/invoice has been created/)).toBeTruthy();
    expect(created).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls.filter(function (c) { return c[0] === "pet_invoice_stay"; }).length).toBe(1);
  });
});
