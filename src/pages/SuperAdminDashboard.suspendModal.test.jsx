// src/pages/SuperAdminDashboard.suspendModal.test.js
//
// Regression test for the same structural bug class fixed for the
// payment modal: setSuspendModal(s) is only ever called from the
// "⛔ Suspend Salon" button inside the salon detail page (DetailView),
// but the {suspendModal && (...)} JSX that actually renders the modal
// lived in SuperAdminDashboard.jsx's own default salons-list-view
// return -- a separate, unreachable render tree while on the detail
// page. Clicking "Suspend Salon" updated state that nothing read.
//
// Confirmed by reading the code before fixing (grep for every
// setSuspendModal call site): the only call that opens the modal
// (setSuspendModal(s), not setSuspendModal(null)) was exclusively in
// DetailView.jsx. Fixed by relocating the modal's JSX into DetailView's
// own return, the only place it can ever be triggered from -- same fix
// as the payment modal.

import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import SuperAdminDashboard from "./SuperAdminDashboard";

vi.mock("../lib/superAdminAuth", () => ({
  saFetch: vi.fn(),
  superAdminLogout: vi.fn(),
  getSuperAdminSession: vi.fn(),
  getSuperAdminToken: vi.fn(),
}));

import { saFetch, getSuperAdminSession } from "../lib/superAdminAuth";

var FAKE_SALON = {
  id: "salon-uuid-1",
  name: "Test Salon",
  slug: "test-salon",
  suspended: false,
  business_type: "salon",
  subscription_plan: null,
  subscription_status: null,
  subscription_expires_at: null,
};

var FAKE_STATS = {
  total_salons: 1, active_salons: 1, suspended_salons: 0,
  total_sales: 0, total_revenue: 0, total_customers: 0,
  total_bookings: 0, total_car_washes: 0,
};

beforeEach(function () {
  vi.clearAllMocks();
  getSuperAdminSession.mockReturnValue({ access_token: "fake-token", email: "admin@trimora.dev" });
  saFetch.mockImplementation(function (method, table) {
    if (table === "salon_directory") return Promise.resolve([FAKE_SALON]);
    if (table === "platform_stats") return Promise.resolve([FAKE_STATS]);
    if (table === "subscription_plans") return Promise.resolve([]);
    if (table === "salon_subscription_payments") return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

test("Suspend Salon modal opens from the salon detail page", async function () {
  render(<SuperAdminDashboard onLogout={vi.fn()} />);

  var salonRow = await screen.findByText("Test Salon");
  fireEvent.click(salonRow);

  var suspendButton = await screen.findByText("⛔ Suspend Salon");
  fireEvent.click(suspendButton);

  // Before the fix, this was never reachable -- the modal's JSX lived
  // in an unrelated, unreachable render tree.
  var confirmText = await screen.findByText(/You are about to suspend/);
  expect(confirmText).toBeInTheDocument();
  expect(screen.getByText("Confirm Suspend")).toBeInTheDocument();
});
