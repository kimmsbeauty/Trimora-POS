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
      if (method === "GET" && table === "salon_service_categories") return Promise.resolve(FAKE_CATEGORIES);
      if (method === "POST" && table === "bookings") return Promise.resolve([{ id: "booking-uuid-99" }]);
      if (method === "POST" && table === "customers") return Promise.resolve([{ id: "cust-1" }]);
      return Promise.resolve(null);
    });
    // Per-function responses -- staff now comes from staff_directory_lookup
    // (the RPC that replaced the raw public_staff_directory view read, see
    // migration 050), alongside the pre-existing public_customer_lookup and
    // claim_booking_payment_status RPCs. Tests below override individual
    // functions via mockImplementation rather than a single mockResolvedValue,
    // so overriding the customer-lookup response doesn't also blank out staff.
    dbRpc.mockImplementation((fn) => {
      if (fn === "staff_directory_lookup") return Promise.resolve(FAKE_STAFF);
      if (fn === "public_customer_lookup") return Promise.resolve([]); // no existing customer found
      if (fn === "claim_booking_payment_status") return Promise.resolve(true);
      return Promise.resolve(null);
    });
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

    // Staff list is fetched via the scoped RPC, not a raw public_staff_directory
    // read -- confirms the salon id is always passed as a mandatory argument.
    expect(dbRpc).toHaveBeenCalledWith("staff_directory_lookup", {
      p_salon_id: "salon-uuid-1",
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
      expect(dbRpc).toHaveBeenCalledWith("claim_booking_payment_status", {
        p_booking_id: "booking-uuid-99",
        p_phone: "0712345678",
        p_new_status: "pay_later",
      });
    });

    // Confirmation screen
    await waitFor(() => expect(screen.getByText(/You're booked!/)).toBeInTheDocument());
  });

  test("does not attempt to create a customer if the phone number already exists", async () => {
    dbRpc.mockImplementation((fn) => {
      if (fn === "staff_directory_lookup") return Promise.resolve(FAKE_STAFF);
      if (fn === "public_customer_lookup") return Promise.resolve([{ id: "existing-cust-1" }]); // existing customer found
      if (fn === "claim_booking_payment_status") return Promise.resolve(true);
      return Promise.resolve(null);
    });

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

  test("refuses the customer lookup/create (rather than guessing a salon) if salon.id is somehow missing", async () => {
    // Defensive case only -- SalonGate is expected to guarantee this never
    // happens in real routing (see the comment above confirm() in
    // BookingPage.jsx), but this proves the refusal actually fires instead
    // of silently falling back to another salon's id.
    useSalon.mockReturnValue({ slug: "test-salon", name: "Test Salon", enabled_payment_methods: ["Cash"] }); // no id
    jest.spyOn(console, "error").mockImplementation(() => {});

    render(<BookingPage />);
    await waitFor(() => expect(screen.getByText("Haircut")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Haircut"));
    // Staff loading also requires salon.id now (staff_directory_lookup takes
    // it as a mandatory RPC argument, mirroring the customer-lookup guard
    // below), so with salon.id missing, bookingStaff never populates --
    // only the always-present "Any available" fallback option renders.
    await waitFor(() => expect(screen.getByText("Any available")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Any available"));
    await waitFor(() => expect(screen.getByText("10:00")).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue(""), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByText("10:00"));
    fireEvent.click(screen.getByText("Continue →"));
    await waitFor(() => expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Someone" } });
    fireEvent.change(screen.getByPlaceholderText(/Phone number/), { target: { value: "0799999999" } });
    fireEvent.click(screen.getByText("Confirm Booking 👑"));

    // The booking itself still gets created (booking write doesn't depend
    // on salon.id -- db.js's own tenant resolution handles that layer).
    await waitFor(() => expect(db).toHaveBeenCalledWith("POST", "bookings", expect.any(Object)));

    // Staff lookup and customer lookup/create are both skipped entirely,
    // not guessed -- neither RPC call ever fires without a resolved salon.id.
    expect(dbRpc).not.toHaveBeenCalled();
    expect(db).not.toHaveBeenCalledWith("POST", "customers", expect.any(Object));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Refusing customer lookup"));

    console.error.mockRestore();
  });
});
