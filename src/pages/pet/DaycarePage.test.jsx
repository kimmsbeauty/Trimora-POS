import React from "react";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

var tables = {};
vi.mock("../../lib/db", function () {
  return {
    db: vi.fn(function (method, table) { return Promise.resolve(Object.prototype.hasOwnProperty.call(tables, table) ? tables[table] : []); }),
    dbRpcAuth: vi.fn(function () { return Promise.resolve({ data: true }); }),
  };
});
import DaycarePage from "./DaycarePage";

function iso(offsetMin) { return new Date(Date.now() + offsetMin * 60000).toISOString(); }
function visit(id, status, extra) {
  return Object.assign({ id: id, customer_id: "c1", pet_id: "p1", plan: "full_day", service_name: "Full day", unit_price: 2000, units: 1,
    scheduled_start: iso(-120), scheduled_end: iso(120), status: status, checked_in_at: null, ready_at: null, collected_at: null }, extra || {});
}
function seed(over) {
  tables = Object.assign({
    pet_daycare_settings: [{ capacity: 4, full_day_service_id: "s1", half_day_service_id: null, hourly_service_id: null, overdue_grace_minutes: 0, late_fee_enabled: false }],
    pet_daycare_visits: [], customers: [{ id: "c1", name: "Amina Otieno" }], pet_pets: [{ id: "p1", customer_id: "c1", name: "Biscuit", species: "Dog" }],
    pet_vaccinations: [], pet_services: [{ id: "s1", name: "Full day", category: "Daycare", price: 2000, active: true }], staff: [], pet_invoices: [],
  }, over || {});
}

describe("DaycarePage", function () {
  it("explains that daycare is not set up and offers no booking", async function () {
    seed({ pet_daycare_settings: [] });
    render(<DaycarePage canEdit={true} onOpenInvoice={function () {}} />);
    expect(await screen.findByText(/Daycare isn't set up yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New booking" })).toBeDisabled();
  });

  it("shows on-site pets, occupancy and a Check out action for a ready pet", async function () {
    seed({ pet_daycare_visits: [visit("v1", "ready-for-pickup", { checked_in_at: iso(-100) }), visit("v2", "in-daycare", { checked_in_at: iso(-90), scheduled_end: iso(-30) })] });
    render(<DaycarePage canEdit={false} onOpenInvoice={function () {}} />);
    expect(await screen.findByText("2 / 4")).toBeInTheDocument();
    expect(screen.getByText("50% full")).toBeInTheDocument();
    var onSite = screen.getByText("On site now").parentElement;
    expect(within(onSite).getAllByText(/Biscuit/).length).toBe(2);
    expect(within(onSite).getByRole("button", { name: "Check out" })).toBeInTheDocument();
    expect(within(onSite).getByText(/Overdue 30 min/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New booking" })).toBeEnabled();
  });

  it("shows an error state with retry when loading fails", async function () {
    seed({ pet_daycare_visits: null });
    render(<DaycarePage canEdit={false} onOpenInvoice={function () {}} />);
    await waitFor(function () { expect(screen.getByText("Couldn't load daycare")).toBeInTheDocument(); });
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("only admins can edit settings; staff see a read-only notice", async function () {
    seed();
    render(<DaycarePage canEdit={false} onOpenInvoice={function () {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));
    expect(await screen.findByText("Only an admin can change these settings.")).toBeInTheDocument();
    expect(screen.queryByText("Save settings")).toBeNull();
  });
});
