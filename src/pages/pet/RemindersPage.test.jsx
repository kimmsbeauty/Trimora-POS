import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));
vi.mock("../../lib/SalonContext", () => ({ useSalon: function () { return { id: "s1", name: "Paws & Co" }; } }));

import RemindersPage from "./RemindersPage";

function soon(hours) { return new Date(Date.now() + hours * 3600000).toISOString(); }
var CUSTOMERS = [
  { id: "c1", name: "Ann Wanjiru", phone: "0711222333", marketing_opt_out: false },
  { id: "c3", name: "No Phone", phone: "", marketing_opt_out: false },
];
var PETS = [{ id: "p1", customer_id: "c1", name: "Rex", archived_at: null }, { id: "p3", customer_id: "c3", name: "Nip", archived_at: null }];

function seed(over) {
  var d = Object.assign({
    pet_bookings: [{ id: "b1", customer_id: "c1", pet_id: "p1", starts_at: soon(20), status: "booked" },
                   { id: "b3", customer_id: "c3", pet_id: "p3", starts_at: soon(21), status: "booked" }],
    pet_pets: PETS, customers: CUSTOMERS, pet_vaccinations: [], pet_boarding_stays: [], pet_reminders: [],
  }, over || {});
  mockDb.mockImplementation(function (method, table) { return Promise.resolve(d[table] === undefined ? null : d[table]); });
}
beforeEach(function () { mockDb.mockReset(); mockRpc.mockReset(); });

describe("RemindersPage", function () {
  it("lists what is due and says nothing is sent automatically", async function () {
    seed();
    render(<RemindersPage />);
    expect(await screen.findByText(/Ann Wanjiru/)).toBeTruthy();
    expect(screen.getByText(/Nothing is sent automatically/)).toBeTruthy();
    expect(screen.getAllByText(/Appointment reminder/, { selector: "div" }).length).toBe(2);
  });

  it("disables messaging for a customer with no phone and explains why", async function () {
    seed();
    render(<RemindersPage />);
    await screen.findByText(/No Phone/);
    expect(screen.getByText("No valid phone number")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Message No Phone about Nip" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Message Ann Wanjiru about Rex" }).disabled).toBe(false);
  });

  it("opens a prefilled message with a WhatsApp link, queues it when opened, and records 'sent'", async function () {
    seed();
    mockRpc.mockImplementation(function (fn, args) {
      if (fn === "pet_queue_reminder") return Promise.resolve({ id: "r1", status: "pending", attempts: 0, message: args.p_message });
      if (fn === "pet_set_reminder_status") return Promise.resolve({ id: "r1", status: args.p_status });
      return Promise.resolve({ error: "unexpected" });
    });
    render(<RemindersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Message Ann Wanjiru about Rex" }));
    var box = await screen.findByLabelText("Message");
    expect(box.value).toMatch(/Hi Ann/); expect(box.value).toMatch(/Rex/); expect(box.value).toMatch(/Paws & Co/);
    var link = screen.getByRole("link", { name: "Open WhatsApp" });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/254711222333\?text=/);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
    fireEvent.click(link);
    expect(await screen.findByText("Did the message go through?")).toBeTruthy();
    var q = mockRpc.mock.calls[0];
    expect(q[0]).toBe("pet_queue_reminder");
    expect(q[1]).toEqual({ p_kind: "appointment", p_source_id: "b1", p_channel: "whatsapp", p_message: box.value });
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    await waitFor(function () { expect(mockRpc.mock.calls[1][0]).toBe("pet_set_reminder_status"); });
    expect(mockRpc.mock.calls[1][1]).toEqual({ p_id: "r1", p_status: "sent", p_error: null });
  });

  it("switches to an SMS link when SMS is chosen", async function () {
    seed();
    render(<RemindersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Message Ann Wanjiru about Rex" }));
    fireEvent.change(await screen.findByLabelText("Send by"), { target: { value: "sms" } });
    expect(screen.getByRole("link", { name: "Open SMS" }).getAttribute("href")).toMatch(/^sms:\+254711222333\?body=/);
  });

  it("shows a clear message when the database rejects the reminder", async function () {
    seed();
    mockRpc.mockResolvedValue({ error: "PET_ARCHIVED" });
    render(<RemindersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Message Ann Wanjiru about Rex" }));
    fireEvent.click(await screen.findByRole("link", { name: "Open WhatsApp" }));
    expect(await screen.findByText(/pet is archived/i)).toBeTruthy();
  });

  it("stops retrying after three failures", async function () {
    var start = soon(20);
    seed({ pet_bookings: [{ id: "b1", customer_id: "c1", pet_id: "p1", starts_at: start, status: "booked" }],
      pet_reminders: [{ id: "r9", dedupe_key: "appointment:b1:" + new Date(start).toISOString().slice(0, 16), status: "failed", attempts: 3, message: "Hi", channel: "whatsapp", kind: "appointment", customer_id: "c1", pet_id: "p1", created_at: new Date().toISOString() }] });
    render(<RemindersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Message Ann Wanjiru about Rex" }));
    expect(await screen.findByText(/failed 3 times/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open WhatsApp" })).toBeNull();
  });

  it("hides reminders already sent from the to-send list and shows them in history", async function () {
    var start = soon(20);
    seed({ pet_bookings: [{ id: "b1", customer_id: "c1", pet_id: "p1", starts_at: start, status: "booked" }],
      pet_reminders: [{ id: "r1", dedupe_key: "appointment:b1:" + new Date(start).toISOString().slice(0, 16), status: "sent", attempts: 0, message: "Hi", channel: "whatsapp", kind: "appointment", customer_id: "c1", pet_id: "p1", created_at: new Date().toISOString(), sent_at: new Date().toISOString() }] });
    render(<RemindersPage />);
    expect(await screen.findByText("Nothing to send right now")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    expect(await screen.findByText("Ann Wanjiru")).toBeTruthy();
    expect(screen.getAllByText("Sent").length).toBeGreaterThan(0);
  });

  it("explains that a database update is needed when the reminders table is missing", async function () {
    seed({ pet_reminders: undefined });
    render(<RemindersPage />);
    expect(await screen.findByText("Reminders need a database update")).toBeTruthy();
  });

  it("shows a retry state when loading fails", async function () {
    mockDb.mockResolvedValue(null);
    render(<RemindersPage />);
    expect(await screen.findByText("Couldn't load reminders")).toBeTruthy();
  });
});
