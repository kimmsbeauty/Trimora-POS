// Regression: business-type routing. Pet businesses must be sent to /pet and
// never see the salon POS; salon and Auto behaviour must stay exactly as before.
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

var mockSalon = { id: "s1", slug: "acme", name: "Acme", business_type: "salon" };

vi.mock("./lib/SalonContext", function () {
  return {
    SalonGate: function (p) { return p.children; },
    useSalon: function () { return mockSalon; },
    fetchPublicSalonBranding: function () { return Promise.resolve({ id: "s1" }); },
  };
});
vi.mock("./lib/deviceAuth", function () {
  return { getDeviceLoginStatus: function () { return "active"; }, clearDeviceAuth: vi.fn() };
});
vi.mock("./pages/LoginPage", function () { return { default: function () { return <div>salon-login</div>; } }; });
vi.mock("./pages/POSApp", function () { return { default: function () { return <div>salon-pos</div>; } }; });
vi.mock("./pages/AutoApp", function () { return { default: function () { return <div>auto-app</div>; } }; });
vi.mock("./pages/PetApp", function () { return { default: function () { return <div>pet-app</div>; } }; });
vi.mock("./pages/BookingPage", function () { return { default: function () { return <div>booking</div>; } }; });

import App from "./App";

function visit(path) {
  window.history.pushState({}, "", path);
  localStorage.setItem("trimora_device_auth", JSON.stringify({ salon_id: "s1" }));
  return render(<App />);
}

describe("business-type routing", function () {
  afterEach(function () { localStorage.clear(); });

  it("salon /pos still shows the salon login", async function () {
    mockSalon = { id: "s1", slug: "acme", name: "Acme", business_type: "salon" };
    visit("/acme/pos");
    expect(await screen.findByText("salon-login")).toBeInTheDocument();
  });

  it("auto /pos still redirects to /auto", async function () {
    mockSalon = { id: "s1", slug: "acme", name: "Acme", business_type: "auto" };
    visit("/acme/pos");
    await waitFor(function () { expect(window.location.pathname).toBe("/acme/auto"); });
    expect(await screen.findByText("auto-app")).toBeInTheDocument();
  });

  it("pet /pos redirects to /pet and never shows the salon login", async function () {
    mockSalon = { id: "s1", slug: "acme", name: "Acme", business_type: "pet" };
    visit("/acme/pos");
    await waitFor(function () { expect(window.location.pathname).toBe("/acme/pet"); });
    expect(await screen.findByText("pet-app")).toBeInTheDocument();
    expect(screen.queryByText("salon-login")).not.toBeInTheDocument();
  });
});
