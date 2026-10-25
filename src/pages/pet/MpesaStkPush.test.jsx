import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi } from "vitest";

var mockRpc = vi.fn();
vi.mock("../../lib/db", function () { return { dbRpcAuth: function () { return mockRpc.apply(null, arguments); } }; });
vi.mock("../../lib/deviceAuth", function () { return { getValidAccessToken: function () { return Promise.resolve("tok"); } }; });
vi.mock("../../lib/constants", function () { return { SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "anon" }; });

import MpesaStkPush from "./MpesaStkPush";

var invoice = { id: "inv1", invoice_number: "INV-0001" };
function mount(props) {
  return render(<MpesaStkPush salonId="s1" invoice={invoice} owed={1500} defaultPhone="0712345678" reference="INV-0001" onRecorded={props && props.onRecorded || function () {}} />);
}

describe("MpesaStkPush", function () {
  beforeEach(function () {
    mockRpc.mockReset();
    mockRpc.mockImplementation(function (name) {
      if (name === "pet_mpesa_unrecorded") return Promise.resolve({ data: [] });
      if (name === "pet_mpesa_status") return Promise.resolve({ data: [{ status: "confirmed", mpesa_receipt: "QWE1", amount: 1500 }] });
      return Promise.resolve({ data: "paid" });
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: function () { return Promise.resolve({ success: true, checkout_request_id: "co1" }); } });
  });

  it("sends the push for this invoice, then records it only after the database says confirmed", async function () {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    var done = vi.fn();
    mount({ onRecorded: done });
    fireEvent.click(screen.getByRole("button", { name: "Send M-Pesa request" }));
    await waitFor(function () { expect(global.fetch).toHaveBeenCalled(); });
    var body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ salon_id: "s1", amount: 1500, phone: "254712345678", pet_invoice_id: "inv1" });
    await act(async function () { vi.advanceTimersByTime(3100); });
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_record_mpesa_payment", { p_invoice_id: "inv1", p_checkout_request_id: "co1" }); });
    await waitFor(function () { expect(done).toHaveBeenCalled(); });
    vi.useRealTimers();
  });

  it("does not record anything when the push is not confirmed", async function () {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockRpc.mockImplementation(function (name) {
      if (name === "pet_mpesa_unrecorded") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [{ status: "failed", result_desc: "Request cancelled by user" }] });
    });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Send M-Pesa request" }));
    await waitFor(function () { expect(global.fetch).toHaveBeenCalled(); });
    await act(async function () { vi.advanceTimersByTime(3100); });
    expect(await screen.findByText("Request cancelled by user")).toBeTruthy();
    expect(mockRpc.mock.calls.some(function (c) { return c[0] === "pet_record_mpesa_payment"; })).toBe(false);
    vi.useRealTimers();
  });

  it("rejects a bad number and an over-large amount before calling anything", async function () {
    mount();
    fireEvent.change(screen.getByLabelText("Customer's M-Pesa number"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Send M-Pesa request" }));
    expect(await screen.findByText(/valid Safaricom number/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Customer's M-Pesa number"), { target: { value: "0712345678" } });
    fireEvent.change(screen.getByLabelText("Amount to request (KES)"), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: "Send M-Pesa request" }));
    expect(await screen.findByText(/more than is still owed/)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("offers to record a confirmed payment that was never recorded", async function () {
    mockRpc.mockImplementation(function (name) {
      if (name === "pet_mpesa_unrecorded") return Promise.resolve({ data: [{ checkout_request_id: "co9", amount: 1500, mpesa_receipt: "ABC9" }] });
      return Promise.resolve({ data: "paid" });
    });
    var done = vi.fn();
    mount({ onRecorded: done });
    fireEvent.click(await screen.findByRole("button", { name: "Record it" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_record_mpesa_payment", { p_invoice_id: "inv1", p_checkout_request_id: "co9" }); });
    await waitFor(function () { expect(done).toHaveBeenCalled(); });
  });
});
