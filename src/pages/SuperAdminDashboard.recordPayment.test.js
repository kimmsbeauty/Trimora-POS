// src/pages/SuperAdminDashboard.recordPayment.test.js
//
// Regression test for a bug reported live: it was impossible to record a
// subscription payment for any salon from the super admin console.
// Confirmed independently against live Supabase before touching any code:
// salon_subscription_payments had zero rows in its entire history (not
// intermittent -- this could never have worked), and salon_subscriptions
// had exactly one row with amount_paid=0 from an unrelated onboarding
// path, not from this RPC.
//
// Two separate, stacked bugs were found by reading the code, not guessed:
//
// 1. STRUCTURAL (the actual blocker): the only UI entry point that ever
//    calls setPaymentModal(...) is the "Record Payment" button inside the
//    salon detail page (view === "detail"). But the JSX that reads
//    paymentModal and renders the modal lived ~1,300 lines further down,
//    inside the *default salons list view's* own separate return
//    statement -- a completely different, mutually-exclusive render tree
//    from detail's. detail's own `if (view === "detail" ...) { ... }`
//    block closes long before that point. So clicking "Record Payment"
//    from a salon's detail page updated state that no active render tree
//    ever read: nothing visibly happened, no error, no crash. Fixed by
//    relocating the payment modal's JSX into detail's own return, right
//    before its closing (the only place that can ever open it).
//
// 2. Once reachable, the modal itself would have crashed anyway: plan
//    objects (from either the live subscription_plans fetch or
//    PLANS_FALLBACK) only ever have a `price_kes` field -- every other
//    usage in this file (the Plans view, price editing) correctly reads
//    plan.price_kes. The payment modal's <select> options instead read
//    `plan.price` (undefined) and called `.toLocaleString()` on it
//    directly inside the options .map() render callback, which throws.
//    Fixed by using plan.price_kes at all three call sites.
//
// The suspend-salon modal has the identical structural bug (#1) --
// flagged separately, not fixed here since it wasn't the reported symptom.
//
// This test exercises the real component tree (React Testing Library,
// same convention as POSApp.checkout.test.js/BookingPage.integration.test.js)
// through the actual click path a user takes: load salons -> open a
// salon's detail view -> click "Record Payment" -> assert the modal
// actually renders, with a real (non-undefined) KES amount on every plan
// option. A local error boundary is included as a safety net so any
// future regression that reintroduces bug #2 fails loudly here instead
// of silently doing nothing, matching how the real app's top-level
// ErrorBoundary would behave.

import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import SuperAdminDashboard from "./SuperAdminDashboard";

class TestErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error: error }; }
  render() {
    if (this.state.error) {
      return <div data-testid="test-error-boundary">Something went wrong: {this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

jest.mock("../lib/superAdminAuth", () => ({
  saFetch: jest.fn(),
  superAdminLogout: jest.fn(),
  getSuperAdminSession: jest.fn(),
  getSuperAdminToken: jest.fn(),
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
  total_sales: 8, total_revenue: 8100, total_customers: 0,
  total_bookings: 0, total_car_washes: 1,
};

beforeEach(function () {
  jest.clearAllMocks();
  getSuperAdminSession.mockReturnValue({ access_token: "fake-token", email: "admin@trimora.dev" });
  saFetch.mockImplementation(function (method, table) {
    if (table === "salon_directory") return Promise.resolve([FAKE_SALON]);
    if (table === "platform_stats") return Promise.resolve([FAKE_STATS]);
    if (table === "subscription_plans") return Promise.resolve([]); // falls back to PLANS_FALLBACK
    if (table === "salon_subscription_payments") return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

test("Record Payment modal opens from the salon detail page and shows real KES amounts", async function () {
  render(
    <TestErrorBoundary>
      <SuperAdminDashboard onLogout={jest.fn()} />
    </TestErrorBoundary>
  );

  // Load salons, click into detail view -- the only path that can open
  // the payment modal.
  var salonRow = await screen.findByText("Test Salon");
  fireEvent.click(salonRow);

  var recordButton = await screen.findByText("💳 Record Payment");
  fireEvent.click(recordButton);

  // Before the fix, neither of these would ever have been reachable:
  // the modal's JSX lived in an unrelated, unreachable render tree.
  expect(screen.queryByTestId("test-error-boundary")).not.toBeInTheDocument();
  var amountLabel = await screen.findByText("Amount Paid (KES)");
  expect(amountLabel).toBeInTheDocument();

  // Before the price_kes fix, reaching this line would have thrown
  // (plan.price is undefined) the instant the <select> options rendered.
  var select = document.querySelector("select");
  expect(select).toBeInTheDocument();
  var optionTexts = Array.from(select.options).map(function (o) { return o.textContent; });
  optionTexts.forEach(function (text) {
    expect(text).not.toMatch(/undefined/);
    expect(text).toMatch(/KES [\d,]+/);
  });
  expect(optionTexts.some(function (t) {
    return t.indexOf("Monthly") !== -1 && t.indexOf("KES 1,200") !== -1;
  })).toBe(true);
});
