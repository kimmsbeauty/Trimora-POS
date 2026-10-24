// Invite-driven wording/theme for Onboarding: Pet gets pet copy and lands on
// /pet; salon and Auto invites keep their exact existing copy.
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import OnboardingPage from "./OnboardingPage";

function visitWithInvite(invite) {
  window.history.pushState({}, "", "/onboard?token=abc123");
  global.fetch = vi.fn(function () {
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(Object.assign({ valid: true }, invite)); } });
  });
  return render(<OnboardingPage />);
}

describe("OnboardingPage module wording", function () {
  it("pet invite: pet header, placeholder and button", async function () {
    visitWithInvite({ module_key: "pet", salon_name: "" });
    expect(await screen.findByText("🐾 Pet Business Setup")).toBeInTheDocument();
    expect(screen.getByText("Trimora Pet")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Pet business name")).toBeInTheDocument();
    expect(screen.getByText("Create my pet business →")).toBeInTheDocument();
    expect(screen.queryByText(/car wash/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Admin PIN: for pet business owner only/)).toBeInTheDocument();
  });

  it("auto invite: unchanged car wash wording", async function () {
    visitWithInvite({ module_key: "auto" });
    expect(await screen.findByText("🚗 Car Wash Setup")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Car wash name")).toBeInTheDocument();
    expect(screen.getByText("Create my car wash →")).toBeInTheDocument();
    expect(screen.getByText(/Admin PIN: for car wash owner only/)).toBeInTheDocument();
  });

  it("salon invite: unchanged salon wording", async function () {
    visitWithInvite({});
    expect(await screen.findByPlaceholderText("Salon name")).toBeInTheDocument();
    expect(screen.getByText("Create my salon →")).toBeInTheDocument();
    expect(screen.getByText(/Admin PIN: for salon owner only/)).toBeInTheDocument();
  });
});
