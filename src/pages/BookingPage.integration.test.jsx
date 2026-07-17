// src/pages/BookingPage.integration.test.jsx
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

vi.mock("../lib/db", () => ({
  db: vi.fn(),
  dbRpc: vi.fn(),
}));

vi.mock("../lib/SalonContext", () => ({
  useSalon: vi.fn(),
  fetchPublicSalonBranding: vi.fn(),
}));

vi.mock("../components/MpesaPaymentModal", () => {
  function MockMpesaPaymentModal(props) {
    return (
      <div>
        <button onClick={props.onPaid}>MOCK_PAID</button>
        <button onClick={props.onPayLater}>MOCK_PAY_LATER</button>
      </div>
    );
  }
  return { default: MockMpesaPaymentModal };
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
    vi.clearAllMocks();
    useSalon.mockReturnValue(FAKE_SALON);
    db.mockImplementation((method, table) => {
      if (method === "POST" && table === "bookings") return Promise.resolve([{ id: "booking-uuid-99" }]);
      if (method === "POST" && table === "customers") return Promise.resolve([{ id: "cust-1" }]);
      return Promise.resolve(null);
    });
    // Per-function responses -- staff comes from staff_directory_lookup
    // (migration 050), services/categories from public_services_lookup /
    // public_service_categories_lookup (migration 051, same reason:
    // services_anon_select and salon_service_categories_anon_select were
    // both unscoped anon SELECT policies, replaced with mandatory-
    // p_salon_id RPCs). Alongside the pre-existing public_customer_lookup
    // and claim_booking_payment_status RPCs. Tests below override
    // individual functions via mockImplementation rather than a single
    // mockResolvedValue, so overriding the customer-lookup response
    // doesn't also blank out staff/services/categories.
    dbRpc.mockImplementation((fn) => {
      if (fn === "staff_directory_lookup") return Promise.resolve(FAKE_STAFF);
      if (fn === "public_services_lookup") return Promise.resolve(FAKE_SERVICES);
      if (fn === "public_service_categories_lookup") return Promise.resolve(FAKE_CATEGORIES);
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
      if (fn === "public_services_lookup") return Promise.resolve(FAKE_SERVICES);
      if (fn === "public_service_categories_lookup") return Promise.resolve(FAKE_CATEGORIES);
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

  test("loads nothing and refuses customer lookup/create if salon.id is somehow missing", async () => {
    // Defensive case only -- SalonGate is expected to guarantee this never
    // happens in real routing (see the comment above confirm() in
    // BookingPage.jsx), but this proves the refusal actually fires instead
    // of silently falling back to another salon's id.
    //
    // Prior to migration 051, services/categories loaded via a plain,
    // unscoped anon table read that didn't need salon.id at all, so a
    // customer could still see and pick a service even in this broken
    // state -- only staff lookup and the final customer lookup/create
    // were guarded. Now that services/categories are also scoped RPCs
    // requiring p_salon_id (the actual security fix), NOTHING loads
    // without a resolved salon.id -- a strictly stronger defensive
    // posture, and this test now verifies that directly rather than
    // trying to preserve a wizard walkthrough that's no longer reachable
    // through the UI in this scenario.
    useSalon.mockReturnValue({ slug: "test-salon", name: "Test Salon", enabled_payment_methods: ["Cash"] }); // no id

    render(<BookingPage />);

    // Services never load -- the "coming soon" fallback shows instead of
    // any real service, so there is no way to even start a booking.
    await waitFor(() => expect(screen.getByText("Services coming soon")).toBeInTheDocument());
    expect(screen.queryByText("Haircut")).not.toBeInTheDocument();

    // Confirms none of the three salon.id-gated RPCs (staff, services,
    // categories) were ever called -- all three short-circuit to
    // Promise.resolve(null) locally without touching dbRpc at all.
    expect(dbRpc).not.toHaveBeenCalled();
  });
});
