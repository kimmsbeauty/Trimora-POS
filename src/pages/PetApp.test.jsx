import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

vi.mock("./pet/fonts", function () { return {}; });
vi.mock("../lib/SalonContext", function () {
  return { useSalon: function () { return { id: "salon-1", name: "Happy Paws", slug: "happy-paws" }; } };
});
vi.mock("../lib/db", function () { return { db: vi.fn() }; });
vi.mock("./LoginPage", function () {
  return {
    default: function FakeLogin(props) {
      return (
        <div>
          <span data-testid="is-pet">{String(props.isPet)}</span>
          <button onClick={function () { props.onLogin("staff"); }}>login-staff</button>
          <button onClick={function () { props.onLogin("admin"); }}>login-admin</button>
        </div>
      );
    },
  };
});

import PetApp from "./PetApp";
import { db } from "../lib/db";

describe("PetApp module gate", function () {
  beforeEach(function () { db.mockReset(); });

  it("asks for the pet module of this business only", async function () {
    db.mockResolvedValue([{ module_key: "pet", enabled: true }]);
    render(<PetApp />);
    await screen.findByText("login-staff");
    expect(db).toHaveBeenCalledWith("GET", "salon_enabled_modules", null, "?module_key=eq.pet&enabled=eq.true");
  });

  it("shows a calm 'not turned on' screen when the module is off", async function () {
    db.mockResolvedValue([]);
    render(<PetApp />);
    expect(await screen.findByText("Trimora Pet isn't turned on for this business yet")).toBeInTheDocument();
    expect(screen.queryByText("login-staff")).not.toBeInTheDocument();
  });

  it("does not claim the module is off when the check itself fails, and can retry", async function () {
    db.mockResolvedValueOnce(null).mockResolvedValueOnce([{ module_key: "pet", enabled: true }]);
    render(<PetApp />);
    expect(await screen.findByText("Couldn't check this business")).toBeInTheDocument();
    expect(screen.queryByText(/isn't turned on/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Try again"));
    expect(await screen.findByText("login-staff")).toBeInTheDocument();
  });
});

describe("PetApp shell", function () {
  beforeEach(function () {
    db.mockReset();
    // The module gate gets its row; every other table (Overview's reads) is simply empty.
    db.mockImplementation(function (method, table) {
      return Promise.resolve(table === "salon_enabled_modules" ? [{ module_key: "pet", enabled: true }] : []);
    });
  });

  it("renders the Pet login (isPet) before sign-in", async function () {
    render(<PetApp />);
    await screen.findByText("login-staff");
    expect(screen.getByTestId("is-pet").textContent).toBe("true");
  });

  it("hides admin-only navigation from staff", async function () {
    render(<PetApp />);
    fireEvent.click(await screen.findByText("login-staff"));
    await waitFor(function () { expect(screen.getAllByText("Checkout").length).toBeGreaterThan(0); });
    expect(screen.queryByText("Staff & Permissions")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("lands on the real Overview, not a placeholder, and shows all navigation to admin", async function () {
    render(<PetApp />);
    fireEvent.click(await screen.findByText("login-admin"));
    await waitFor(function () { expect(screen.getAllByText("Settings").length).toBeGreaterThan(0); });
    expect(await screen.findByText("Today's Appointments")).toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
    expect(screen.getAllByText("Happy Paws").length).toBeGreaterThan(0);
  });

  it("opens the real Loyalty screen, and no placeholder is left in the navigation", async function () {
    render(<PetApp />);
    fireEvent.click(await screen.findByText("login-admin"));
    fireEvent.click((await screen.findAllByText("Loyalty Programme"))[0]);
    // no loyalty rows exist in the test data, so the screen reports that the programme is off
    expect(await screen.findByText("The programme is off.")).toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });

  it("opens the new-booking form from the Overview shortcut", async function () {
    render(<PetApp />);
    fireEvent.click(await screen.findByText("login-staff"));
    fireEvent.click((await screen.findAllByText("New Booking"))[0]);
    // calendar lookups are empty, so the form can open once they are ready
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens the add-pet form from Add Customer / Pet, once, and not again when coming back via the menu", async function () {
    render(<PetApp />);
    fireEvent.click(await screen.findByText("login-staff"));
    fireEvent.click(await screen.findByRole("button", { name: "Add Customer / Pet" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Add pet");
    // leave through the menu and come back: the form must not reopen by itself
    fireEvent.click(screen.getAllByText("Checkout")[0]);
    await waitFor(function () { expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText("Pets")[0]);
    expect((await screen.findAllByRole("button", { name: "+ Add pet" })).length).toBeGreaterThan(0); // the Pets screen has loaded
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens that exact booking's details in the Calendar from View booking", async function () {
    var at = new Date(); at.setHours(12, 0, 0, 0);
    var end = new Date(at.getTime() + 3600000);
    var booking = { id: "b-42", customer_id: "c1", pet_id: "p1", staff_id: "s1", starts_at: at.toISOString(), ends_at: end.toISOString(), status: "booked",
      pet_booking_services: [{ service_name: "Full groom", price: 1500 }] };
    var rows = {
      salon_enabled_modules: [{ module_key: "pet", enabled: true }], pet_bookings: [booking],
      customers: [{ id: "c1", name: "Wanjiru Kamau", phone: "0700000000" }], pet_pets: [{ id: "p1", customer_id: "c1", name: "Simba", species: "Dog" }],
      staff: [{ id: "s1", name: "Achieng", active: true }],
    };
    db.mockImplementation(function (method, table) { return Promise.resolve(rows[table] || []); });
    render(<PetApp />);
    fireEvent.click(await screen.findByText("login-staff"));
    fireEvent.click(await screen.findByRole("button", { name: "View booking for Simba" }));
    var dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Simba · Wanjiru Kamau");
    expect(dialog).toHaveTextContent("Full groom");
  });
});
