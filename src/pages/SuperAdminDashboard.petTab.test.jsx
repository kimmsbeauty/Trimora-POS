// Super-admin: the Pet product tab, its onboard modal wording, and that Pet
// businesses never show up on the Salons side.
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import SuperAdminDashboard from "./SuperAdminDashboard";

vi.mock("../lib/superAdminAuth", () => ({
  saFetch: vi.fn(), superAdminLogout: vi.fn(), getSuperAdminSession: vi.fn(), getSuperAdminToken: vi.fn(),
}));
import { saFetch, getSuperAdminSession } from "../lib/superAdminAuth";

var SALON = { id: "s1", name: "Glow Salon", slug: "glow", suspended: false, business_type: "salon" };
var PET = { id: "p1", name: "Happy Paws", slug: "happy-paws", suspended: false, business_type: "pet", created_at: "2026-10-01T00:00:00Z" };
var STATS = { total_salons: 1, active_salons: 1, suspended_salons: 0, total_sales: 0, total_revenue: 0, total_customers: 0, total_bookings: 0, total_car_washes: 0 };

beforeEach(function () {
  vi.clearAllMocks();
  getSuperAdminSession.mockReturnValue({ access_token: "fake-token", email: "admin@trimora.dev" });
  saFetch.mockImplementation(function (method, table) {
    if (table === "salon_directory") return Promise.resolve([SALON, PET]);
    if (table === "platform_stats") return Promise.resolve([STATS]);
    return Promise.resolve([]);
  });
});

test("pet businesses stay off the Salons list but appear under the Pet tab", async function () {
  render(<SuperAdminDashboard onLogout={vi.fn()} />);
  expect(await screen.findByText("Glow Salon")).toBeInTheDocument();
  expect(screen.queryByText("Happy Paws")).not.toBeInTheDocument();

  fireEvent.click(screen.getAllByText("🐾 Pet")[0]);
  expect(await screen.findByText("Happy Paws")).toBeInTheDocument();
  expect(screen.queryByText("Glow Salon", { selector: "div" })).not.toBeInTheDocument();
});

test("+ Onboard on the Pet tab opens the modal with Pet wording", async function () {
  render(<SuperAdminDashboard onLogout={vi.fn()} />);
  await screen.findByText("Glow Salon");
  fireEvent.click(screen.getAllByText("🐾 Pet")[0]);
  fireEvent.click(await screen.findByText("+ Onboard"));
  expect(await screen.findByText("🐾 Onboard Pet Business")).toBeInTheDocument();
  expect(screen.getByText("🐾 Create Pet Business")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("e.g. Happy Paws Grooming")).toBeInTheDocument();
});

test("Car Washes tab: + Onboard now opens the modal, with the unchanged car-wash wording", async function () {
  // Regression guard for a bug that predates Trimora Pet: the Car Washes view
  // returned early, so the onboard modal (rendered only in the Salons return)
  // could never open from its button.
  render(<SuperAdminDashboard onLogout={vi.fn()} />);
  await screen.findByText("Glow Salon");
  fireEvent.click(screen.getAllByText("🚗 Auto")[0]);
  await screen.findByText(/Car Washes \(Trimora Auto\)/);
  fireEvent.click(screen.getAllByText("+ Onboard")[0]);
  expect(await screen.findByText("🚗 Onboard Car Wash")).toBeInTheDocument();
  expect(screen.getByText("🚗 Create Car Wash")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("e.g. High Point Carwash")).toBeInTheDocument();
});

test("Salons tab: Manual Onboard still shows the unchanged salon wording", async function () {
  render(<SuperAdminDashboard onLogout={vi.fn()} />);
  await screen.findByText("Glow Salon");
  fireEvent.click(screen.getByText("+ Manual"));
  expect(await screen.findByText("🏪 Manual Onboarding")).toBeInTheDocument();
  expect(screen.getByText("🏪 Create Salon")).toBeInTheDocument();
});
