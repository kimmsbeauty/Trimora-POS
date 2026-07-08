// src/pages/BookingPage.integration.test.js
//
// Step 5 regression safety net (booking half). Logic-only / mock-only,
// no live database, no Supabase branch, no network -- db() and dbRpc()
// are fully mocked, matching the pattern the AI provider tests already
// use. This exercises the real component tree (React Testing Library)
// so it actually catches integration regressions that a pure-function
// unit test can't: e.g. Steps 1-4 changed exactly this file (categories
// now come from salon_service_categories instead of the hardcoded CATS
// constant) -- this test proves the wizard still renders and completes
// a booking correctly with that change in place, not just that the
// fetch call has the right shape in isolation.
//
// MpesaPaymentModal is stubbed to two plain buttons (Paid / Pay Later)
// rather than rendered for real -- its own M-Pesa instruction rendering
// deserves separate, focused coverage, not a dependency of this test.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import BookingPage from "./BookingPage";

jest.mock("../lib/db", () => ({
  db: jest.fn(),
  dbRpc: jest.fn(),
}));

jest.mock("../lib/SalonContext", () => ({
  useSalon: jest.fn(),
  fetchPublicSalonBranding: jest.fn(),
}));

jest.mock("../components/MpesaPaymentModal", () => {
  return function MockMpesaPaymentModal(props) {
    return (
      <div>
        <button onClick={props.onPaid}>MOCK_PAID</button>
        <button onClick={props.onPayLater}>MOCK_PAY_LATER</button>
      </div>
    );
  };
});

import { db, dbRpc } from "../lib/db";
import { useSalon } from "../lib/SalonContext";

var FAKE_SALON = {
  id: "salon-uuid-1",
  slug: "test-salon",
  name: "Test Salon",
  mpesa_till: null,
  enabled_payment_methods: ["Cash"],
};

var FAKE_SERVICES = [
  { id: "svc-1", name: "Haircut", price: 500, cat: "Hair", active: true },
  { id: "svc-2", name: "Manicure", price: 800, cat: "Nails", active: true },
];

var FAKE_STAFF = [
  { id: "staff-1", name: "Jane", role: "Senior Stylist" },
];

var FAKE_CATEGORIES = [
  { name: "Hair", sort_order: 0 },
  { name: "Nails", sort_order: 1 },
];

describe("BookingPage — full booking + payment-claim flow (mocked db)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSalon.mockReturnValue(FAKE_SALON);
    db.mockImplementation((method, table) => {
      if (method === "GET" && table === "services") return Promise.resolve(FAKE_SERVICES);
      if (method === "GET" && table === "public_staff_directory") return Promise.resolve(FAKE_STAFF);
      if (method === "GET" && table === "salon_service_categories") return Promise.resolve(FAKE_CATEGORIES);
      if (method === "POST" && table === "bookings") return Promise.resolve([{ id: "booking-uuid-99" }]);
      if (method === "POST" && table === "customers") return Promise.resolve([{ id: "cust-1" }]);
      if (method === "PATCH" && table === "bookings") return Promise.resolve([{ id: "booking-uuid-99" }]);
      return Promise.resolve(null);
    });
    dbRpc.mockResolvedValue([]); // public_customer_lookup: no existing customer found
  });

  test("customer can walk the full wizard and confirm a booking", async () => {
    render(<BookingPage />);

    // Step 1 — service list should reflect salon_service_categories
    // (the Step 1-4 change), not the old hardcoded CATS list, and
    // should include the real fetched services.
    await waitFor(() => expect(screen.getByText("Haircut")).toBeInTheDocument());
    expect(screen.getByText("Hair")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Haircut"));

    // Step 2 — stylist
    await waitFor(() => expect(screen.getByText("Jane")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Jane"));

    // Step 3 — date & time
    await waitFor(() => expect(screen.getByText("10:00")).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue(""), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByText("10:00"));
    fireEvent.click(screen.getByText("Continue →"));

    // Step 4 — details
    await waitFor(() => expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Mary Wanjiru" } });
    fireEvent.change(screen.getByPlaceholderText(/Phone number/), { target: { value: "0712345678" } });
    fireEvent.click(screen.getByText("Confirm Booking 👑"));

    // The actual booking write — this is the core regression check.
    await waitFor(() => {
      expect(db).toHaveBeenCalledWith("POST", "bookings", expect.objectContaining({
        name: "Mary Wanjiru",
        phone: "0712345678",
        service: "Haircut",
        price: 500,
        stylist: "Jane",
        date: "2026-08-01",
        time: "10:00",
        status: "pending",
        payment_status: "pending",
      }));
    });

    // New customer lookup + creation (no existing customer, per the
    // dbRpc mock above returning an empty array).
    expect(dbRpc).toHaveBeenCalledWith("public_customer_lookup", {
      p_salon_id: "salon-uuid-1",
      p_phone: "0712345678",
    });
    expect(db).toHaveBeenCalledWith("POST", "customers", expect.objectContaining({
      name: "Mary Wanjiru", phone: "0712345678",
    }));

    // Payment claim (mocked M-Pesa modal's "Pay Later" path)
    await waitFor(() => expect(screen.getByText("MOCK_PAY_LATER")).toBeInTheDocument());
    fireEvent.click(screen.getByText("MOCK_PAY_LATER"));

    await waitFor(() => {
      expect(db).toHaveBeenCalledWith(
        "PATCH", "bookings", { payment_status: "pay_later" }, "?id=eq.booking-uuid-99"
      );
    });

    // Confirmation screen
    await waitFor(() => expect(screen.getByText(/You're booked!/)).toBeInTheDocument());
  });

  test("does not attempt to create a customer if the phone number already exists", async () => {
    dbRpc.mockResolvedValue([{ id: "existing-cust-1" }]); // existing customer found

    render(<BookingPage />);
    await waitFor(() => expect(screen.getByText("Haircut")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Haircut"));
    await waitFor(() => expect(screen.getByText("Jane")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Jane"));
    await waitFor(() => expect(screen.getByText("10:00")).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue(""), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByText("10:00"));
    fireEvent.click(screen.getByText("Continue →"));
    await waitFor(() => expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Existing Customer" } });
    fireEvent.change(screen.getByPlaceholderText(/Phone number/), { target: { value: "0700000000" } });
    fireEvent.click(screen.getByText("Confirm Booking 👑"));

    await waitFor(() => {
      expect(db).toHaveBeenCalledWith("POST", "bookings", expect.any(Object));
    });
    expect(db).not.toHaveBeenCalledWith("POST", "customers", expect.any(Object));
  });
});
