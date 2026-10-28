import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockDb = vi.fn();
var mockRpc = vi.fn();
var mockCall = vi.fn();
vi.mock("../../lib/db", () => ({
  db: function () { return mockDb.apply(null, arguments); },
  dbRpcAuth: function () { return mockRpc.apply(null, arguments); },
}));
vi.mock("../../lib/SalonContext", () => ({ useSalon: function () { return { id: "s1", slug: "pawpals" }; } }));
vi.mock("./calendarSync", async function () {
  var actual = await vi.importActual("./calendarSync");
  return Object.assign({}, actual, { callCalendar: function () { return mockCall.apply(null, arguments); } });
});

import GoogleCalendarSettings from "./GoogleCalendarSettings";
import { connectionStatus, calendarErrorMessage, syncSummary, validCalendarId } from "./calendarSync";

var EMAIL = "trimora-sync@trimora.iam.gserviceaccount.com";
beforeEach(function () {
  mockDb.mockReset(); mockRpc.mockReset(); mockCall.mockReset();
  mockCall.mockImplementation(function (b) {
    if (b.action === "info") return Promise.resolve({ ok: true, data: { success: true, service_account_email: EMAIL } });
    if (b.action === "flush") return Promise.resolve({ ok: true, data: { success: true, synced: 3, skipped: 0, failed: 0, remaining: 0 } });
    return Promise.resolve({ ok: true, data: { success: true } });
  });
});

describe("GoogleCalendarSettings", function () {
  it("starts switched off, and shows the email to share the calendar with", async function () {
    mockDb.mockResolvedValue([]);
    render(<GoogleCalendarSettings />);
    var box = await screen.findByLabelText("Sync to Google Calendar", { exact: false });
    expect(box.checked).toBe(false);
    expect(await screen.findByText(EMAIL)).toBeTruthy();
    expect(screen.getByText("Sync is off.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
  });

  it("explains what is and is not copied", async function () {
    mockDb.mockResolvedValue([]);
    render(<GoogleCalendarSettings />);
    await screen.findByText(EMAIL);
    expect(screen.getByText(/Booking notes and care notes are never sent/)).toBeTruthy();
    expect(screen.getByText(/does not email customers or staff/)).toBeTruthy();
  });

  it("will not switch on without a calendar id, or with a malformed one", async function () {
    mockDb.mockResolvedValue([]);
    render(<GoogleCalendarSettings />);
    fireEvent.click(await screen.findByLabelText("Sync to Google Calendar", { exact: false }));
    fireEvent.click(screen.getByRole("button", { name: "Save Google Calendar settings" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Enter the calendar ID/);
    fireEvent.change(screen.getByLabelText("Calendar ID"), { target: { value: "not a calendar" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Google Calendar settings" }));
    await waitFor(function () { expect(screen.getByRole("alert").textContent).toMatch(/doesn't look like a calendar ID/); });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("saves through the database function, then starts the first sync", async function () {
    mockDb.mockResolvedValue([]); mockRpc.mockResolvedValue(null);
    render(<GoogleCalendarSettings />);
    fireEvent.click(await screen.findByLabelText("Sync to Google Calendar", { exact: false }));
    fireEvent.change(screen.getByLabelText("Calendar ID"), { target: { value: "  pawpals@group.calendar.google.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Google Calendar settings" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_save_calendar_connection", { p_enabled: true, p_calendar_id: "pawpals@group.calendar.google.com" }); });
    await waitFor(function () { expect(mockCall).toHaveBeenCalledWith({ action: "flush", salon_id: "s1" }); });
    expect(await screen.findByText(/Saved\. Everything is up to date\./)).toBeTruthy();
  });

  it("switching off saves without syncing and says existing events stay", async function () {
    mockDb.mockResolvedValue([{ salon_id: "s1", enabled: true, calendar_id: "pawpals@group.calendar.google.com", last_ok_at: null, last_error: null }]);
    mockRpc.mockResolvedValue(null);
    render(<GoogleCalendarSettings />);
    fireEvent.click(await screen.findByLabelText("Sync to Google Calendar", { exact: false }));
    fireEvent.click(screen.getByRole("button", { name: "Save Google Calendar settings" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_save_calendar_connection", { p_enabled: false, p_calendar_id: "pawpals@group.calendar.google.com" }); });
    expect(await screen.findByText(/Events already on your calendar are left as they are/)).toBeTruthy();
    expect(mockCall.mock.calls.filter(function (c) { return c[0].action === "flush"; }).length).toBe(0);
  });

  it("shows a database refusal in plain words", async function () {
    mockDb.mockResolvedValue([]); mockRpc.mockResolvedValue({ error: "NOT_AUTHENTICATED" });
    render(<GoogleCalendarSettings />);
    fireEvent.click(await screen.findByLabelText("Sync to Google Calendar", { exact: false }));
    fireEvent.change(screen.getByLabelText("Calendar ID"), { target: { value: "pawpals@group.calendar.google.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Google Calendar settings" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/session has ended/);
  });

  it("tests the connection with the calendar id typed in, before saving", async function () {
    mockDb.mockResolvedValue([]);
    render(<GoogleCalendarSettings />);
    await screen.findByText(EMAIL);
    fireEvent.change(screen.getByLabelText("Calendar ID"), { target: { value: "pawpals@group.calendar.google.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(function () { expect(mockCall).toHaveBeenCalledWith({ action: "test", salon_id: "s1", calendar_id: "pawpals@group.calendar.google.com" }); });
    expect(await screen.findByText(/Trimora can add events to this calendar/)).toBeTruthy();
  });

  it("explains a view-only share when the test fails", async function () {
    mockDb.mockResolvedValue([]);
    mockCall.mockImplementation(function (b) {
      if (b.action === "info") return Promise.resolve({ ok: true, data: { service_account_email: EMAIL } });
      return Promise.resolve({ ok: false, code: "CALENDAR_FORBIDDEN", message: calendarErrorMessage("CALENDAR_FORBIDDEN") });
    });
    render(<GoogleCalendarSettings />);
    await screen.findByText(EMAIL);
    fireEvent.change(screen.getByLabelText("Calendar ID"), { target: { value: "pawpals@group.calendar.google.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Make changes to events/);
  });

  it("offers Sync now only while on, and re-checks everything then syncs", async function () {
    mockDb.mockResolvedValue([{ salon_id: "s1", enabled: true, calendar_id: "pawpals@group.calendar.google.com", last_ok_at: "2026-11-01T08:00:00Z", last_error: null }]);
    mockRpc.mockResolvedValue(null);
    render(<GoogleCalendarSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    await waitFor(function () { expect(mockRpc).toHaveBeenCalledWith("pet_calendar_resync", {}); });
    await waitFor(function () { expect(mockCall).toHaveBeenCalledWith({ action: "flush", salon_id: "s1" }); });
    expect(await screen.findByText("Everything is up to date.")).toBeTruthy();
  });

  it("shows the last problem from the saved status", async function () {
    mockDb.mockResolvedValue([{ salon_id: "s1", enabled: true, calendar_id: "pawpals@group.calendar.google.com", last_ok_at: null, last_error: "CALENDAR_NOT_FOUND" }]);
    render(<GoogleCalendarSettings />);
    expect(await screen.findByText(/The last sync had a problem\. Google couldn't find that calendar/)).toBeTruthy();
  });

  it("asks for migration 113 when the table is missing", async function () {
    mockDb.mockResolvedValue(null);
    render(<GoogleCalendarSettings />);
    expect(await screen.findByText(/apply migration 113/)).toBeTruthy();
  });

  it("says so when Trimora has not set up Google yet, and shows no form", async function () {
    mockDb.mockResolvedValue([]);
    mockCall.mockResolvedValue({ ok: false, code: "NOT_CONFIGURED", message: calendarErrorMessage("NOT_CONFIGURED") });
    render(<GoogleCalendarSettings />);
    expect(await screen.findByText(/isn't switched on for Trimora yet/)).toBeTruthy();
    expect(screen.queryByLabelText("Calendar ID")).toBeNull();
  });
});

describe("calendarSync helpers", function () {
  it("describes the connection state", function () {
    expect(connectionStatus(null).text).toBe("Sync is off.");
    expect(connectionStatus({ enabled: false }).text).toBe("Sync is off.");
    expect(connectionStatus({ enabled: true }).text).toBe("Waiting for the first sync.");
    expect(connectionStatus({ enabled: true, last_ok_at: "2026-11-01T08:00:00Z" }).tone).toBe("success");
    expect(connectionStatus({ enabled: true, last_error: "RATE_LIMITED", last_ok_at: "2026-11-01T08:00:00Z" }).tone).toBe("danger");
  });
  it("summarises a sync run", function () {
    expect(syncSummary({ failed: 1, remaining: 0 })).toMatch(/couldn't be synced/);
    expect(syncSummary({ failed: 0, remaining: 4 })).toMatch(/More items are queued/);
    expect(syncSummary({ failed: 0, remaining: 0 })).toBe("Everything is up to date.");
  });
  it("turns codes and database errors into plain language, with a safe fallback", function () {
    expect(calendarErrorMessage("CALENDAR_FORBIDDEN")).toMatch(/Make changes to events/);
    expect(calendarErrorMessage("Error: NOT_CONNECTED")).toMatch(/Switch Google Calendar sync on/);
    expect(calendarErrorMessage("Network error")).toMatch(/Couldn't reach the server/);
    expect(calendarErrorMessage("anything else")).toMatch(/Something went wrong/);
  });
  it("checks calendar ids like the database does", function () {
    expect(validCalendarId("pawpals@group.calendar.google.com")).toBe(true);
    expect(validCalendarId("a b")).toBe(false);
  });
});
