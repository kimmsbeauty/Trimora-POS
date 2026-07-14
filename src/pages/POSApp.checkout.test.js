// src/pages/POSApp.checkout.test.js
//
// Regression safety net for the checkout ("pos") view, written before
// that view is extracted out of POSApp.jsx (audit Critical #1, final
// remaining piece of the god-component split -- see handover). This is
// the one view with zero existing component-level coverage that also
// handles money, so a smoke test goes in before any code around it
// moves, not after.
//
// Exercises the real component tree (React Testing Library) through an
// actual sale -- select an existing client, add a service to the cart,
// pick a stylist, complete a Cash sale -- and asserts the exact sale
// record written to the database. This catches wiring regressions a
// pure cartMath.js/saleLogic.js unit test can't: it proves the UI
// state (selected customer, selected stylist, cart contents) actually
// reaches buildSaleData() and db() correctly, not just that the math
// functions are correct in isolation.
//
// db() is fully mocked, matching the pattern
// BookingPage.integration.test.js already uses. No live database, no
// network, no Supabase branch.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import POSApp from "./POSApp";

jest.mock("../lib/db", () => ({
  db: jest.fn(),
  offlineQueue: [],
  syncOfflineQueue: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/SalonContext", () => ({
  useSalon: jest.fn(),
  fetchPublicSalonBranding: jest.fn().mockResolvedValue(null),
}));

jest.mock("../lib/pwaManifest.js", () => ({
  setPwaManifest: jest.fn(),
  setLegacyPwaManifest: jest.fn(),
}));

import { db } from "../lib/db";
import { useSalon } from "../lib/SalonContext";

// jsdom in this environment doesn't implement crypto.getRandomValues,
// which generateFeedbackToken() (POSApp.jsx) calls on every completed
// sale. Real browsers all have this; this is a test-environment gap,
// not an app bug -- polyfilled here rather than mocked away, so the
// real generateFeedbackToken() logic still runs unmodified.
if (!window.crypto || !window.crypto.getRandomValues) {
  Object.defineProperty(window, "crypto", {
    value: { getRandomValues: function (arr) { for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; } },
  });
}

var FAKE_SALON = {
  id: "salon-uuid-1",
  slug: "test-salon",
  name: "Test Salon",
  enabled_payment_methods: ["Cash"],
};

var FAKE_CUSTOMER = { id: "cust-1", name: "Mary Wanjiru", phone: "0712345678", visit_count: 3, total_spend: 4500 };
var FAKE_STAFF = { id: "staff-1", name: "Jane", role: "Senior Stylist", commission_pct: 40 };
var FAKE_SERVICE = { id: "svc-1", name: "Haircut", cat: "Hair", price: 500, active: true };

describe("POSApp — checkout (Cash sale) integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSalon.mockReturnValue(FAKE_SALON);
    db.mockImplementation(function (method, table) {
      if (method === "GET" && table === "sales") return Promise.resolve([]);
      if (method === "GET" && table === "stock") return Promise.resolve([]);
      if (method === "GET" && table === "feedback") return Promise.resolve([]);
      if (method === "GET" && table === "customers") return Promise.resolve([FAKE_CUSTOMER]);
      if (method === "GET" && table === "staff") return Promise.resolve([FAKE_STAFF]);
      if (method === "GET" && table === "services") return Promise.resolve([FAKE_SERVICE]);
      if (method === "GET" && table === "expenses") return Promise.resolve([]);
      if (method === "GET" && table === "marketing_campaigns") return Promise.resolve([]);
      if (method === "GET" && table === "salon_marketing_config") return Promise.resolve([]);
      if (method === "GET" && table === "salon_service_categories") return Promise.resolve([]);
      if (method === "POST" && table === "sales") return Promise.resolve([{ id: "sale-1" }]);
      if (method === "PATCH" && table === "customers") return Promise.resolve([FAKE_CUSTOMER]);
      return Promise.resolve(null);
    });
  });

  test("selecting a client, adding a service, and completing a Cash sale writes the correct sale record", async () => {
    render(<POSApp onLogout={function () {}} userRole="admin" />);

    // Wait for loadAll() to resolve and the real service to render.
    await waitFor(function () {
      expect(screen.getByText("Haircut")).toBeInTheDocument();
    });

    // Select the existing client via search (avoids the separate
    // "add new client" POST path -- that flow deserves its own test,
    // not a dependency of this one).
    fireEvent.change(screen.getByPlaceholderText("Search by name or phone..."), {
      target: { value: "Mary" },
    });
    await waitFor(function () {
      expect(screen.getByText("Mary Wanjiru")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Mary Wanjiru"));

    // Pick default stylist.
    fireEvent.change(screen.getByDisplayValue("Select stylist"), {
      target: { value: "Jane" },
    });

    // Add the service to cart.
    fireEvent.click(screen.getByText("Haircut"));

    // Complete the sale (Cash is the only enabled method here, and the
    // default payMethod, so no M-Pesa modal should appear).
    await waitFor(function () {
      expect(screen.getByText(/Complete Sale/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Complete Sale/));

    await waitFor(function () {
      expect(db).toHaveBeenCalledWith(
        "POST",
        "sales",
        expect.objectContaining({
          client: "Mary Wanjiru",
          client_phone: "0712345678",
          stylist: "Jane",
          total: 500,
          service_total: 500,
          product_total: 0,
          discount_amount: 0,
          payment: "Cash",
        })
      );
    });

    // resetCart() should have cleared the cart back out after the sale.
    await waitFor(function () {
      expect(screen.queryByText("🛒 Cart")).not.toBeInTheDocument();
    });
  });
});
