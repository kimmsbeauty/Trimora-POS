import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/SalonContext", function () {
  return {
    useSalon: function () { return { id: "salon-1", name: "Happy Paws", slug: "happy-paws" }; },
    fetchPublicSalonBranding: vi.fn(),
  };
});
vi.mock("../lib/deviceAuth", function () { return { persistSession: vi.fn() }; });

import LoginPage from "./LoginPage";
import { persistSession } from "../lib/deviceAuth";

function mount(props) {
  return render(<MemoryRouter><LoginPage onLogin={props.onLogin || function () {}} isPet={props.isPet} isAuto={props.isAuto} /></MemoryRouter>);
}
function reply(status, body) {
  global.fetch = vi.fn().mockResolvedValue({ ok: status === 200, status: status, json: function () { return Promise.resolve(body); } });
}

describe("LoginPage - Trimora Pet sign-in", function () {
  beforeEach(function () { persistSession.mockReset(); });

  it("shows the pet layout with the business name and both roles", function () {
    mount({ isPet: true });
    expect(screen.getByText("Welcome to Happy Paws")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Staff/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Admin/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Team member PIN")).toBeInTheDocument();
    expect(screen.queryByText(/Book an appointment/)).toBeNull();
  });

  it("verifies the PIN against device-pin-login with the selected role, then persists the session", async function () {
    reply(200, { success: true, access_token: "t" });
    var onLogin = vi.fn();
    mount({ isPet: true, onLogin: onLogin });
    fireEvent.click(screen.getByRole("radio", { name: /Admin/ }));
    expect(screen.getByText("Administrator PIN")).toBeInTheDocument();
    fireEvent.change(document.getElementById("pet-pin"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    await waitFor(function () { expect(onLogin).toHaveBeenCalledWith("admin"); });
    var call = global.fetch.mock.calls[0];
    expect(call[0]).toMatch(/\/functions\/v1\/device-pin-login$/);
    expect(JSON.parse(call[1].body)).toEqual({ salon_id: "salon-1", role: "admin", pin: "123456" });
    expect(persistSession).toHaveBeenCalledWith(expect.objectContaining({ success: true }), "salon-1");
  });

  it("accepts up to 6 characters and submits with Enter-style form submit", async function () {
    reply(200, { success: true });
    var onLogin = vi.fn();
    mount({ isPet: true, onLogin: onLogin });
    var input = document.getElementById("pet-pin");
    expect(input).toHaveAttribute("maxlength", "6");
    fireEvent.change(input, { target: { value: "1234" } });
    fireEvent.submit(input.closest("form"));
    await waitFor(function () { expect(onLogin).toHaveBeenCalledWith("staff"); });
  });

  it("asks for a PIN when empty and does not call the server", function () {
    reply(200, {});
    mount({ isPet: true });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter your PIN");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("counts wrong PINs and locks after 3 attempts, as before", async function () {
    reply(401, {});
    mount({ isPet: true });
    var input = document.getElementById("pet-pin");
    fireEvent.change(input, { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    await waitFor(function () { expect(screen.getByRole("alert")).toHaveTextContent("Incorrect PIN. 2 attempts remaining."); });
    fireEvent.change(input, { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    await waitFor(function () { expect(screen.getByRole("alert")).toHaveTextContent("Incorrect PIN. 1 attempt remaining."); });
    fireEvent.change(input, { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    await waitFor(function () { expect(screen.getByText("Too many attempts")).toBeInTheDocument(); });
    expect(screen.getByText("30s")).toBeInTheDocument();
  });

  it("offers the admin PIN reset link only for the admin role", function () {
    mount({ isPet: true });
    expect(screen.queryByText(/Forgot admin PIN/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Admin/ }));
    expect(screen.getByText(/Forgot admin PIN/)).toHaveAttribute("href", "/happy-paws/forgot-pin");
  });
});

describe("LoginPage - salon and Auto screens are unchanged", function () {
  it("the default (salon) screen keeps its own layout and booking link", function () {
    mount({});
    expect(screen.getByText("Are you a customer?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter PIN")).toBeInTheDocument();
    expect(document.getElementById("pet-pin")).toBeNull();
  });
  it("the Auto screen keeps its own layout", function () {
    mount({ isAuto: true });
    expect(screen.getByPlaceholderText("Enter PIN")).toBeInTheDocument();
    expect(document.getElementById("pet-pin")).toBeNull();
  });
});
