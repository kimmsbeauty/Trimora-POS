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

  it("still shows an honest placeholder, not fake data, for sections that are not built yet", async function () {
    render(<PetApp />);
    fireEvent.click(await screen.findByText("login-admin"));
    fireEvent.click((await screen.findAllByText("Loyalty Programme"))[0]);
    expect(await screen.findByText("Coming soon")).toBeInTheDocument();
  });

  it("opens the new-booking form from the Overview shortcut", async function () {
    render(<PetApp />);
    fireEvent.click(await screen.findByText("login-staff"));
    fireEvent.click((await screen.findAllByText("New Booking"))[0]);
    // calendar lookups are empty, so the form can open once they are ready
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
