import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import PetBusinessesView from "./PetBusinessesView";

var PRODUCTS = [
  { key: "salons", label: "Salons", homeView: "salons", views: ["salons"] },
  { key: "pet", label: "Pet", homeView: "petbusinesses", views: ["petbusinesses"] },
];
function Badge(p) { return <span>{p.children}</span>; }

function setup(overrides) {
  var props = Object.assign({
    salons: [
      { id: "1", name: "Happy Paws", slug: "happy-paws", business_type: "pet", suspended: false, created_at: "2026-10-01T00:00:00Z" },
      { id: "2", name: "Glow Salon", slug: "glow", business_type: "salon" },
      { id: "3", name: "Shine Wash", slug: "shine", business_type: "auto" },
    ],
    view: "petbusinesses", setView: vi.fn(), PRODUCTS: PRODUCTS, Badge: Badge,
    setManualModuleKey: vi.fn(), setManualModal: vi.fn(), setManualDone: vi.fn(),
    setInviteModuleKey: vi.fn(), setInviteModal: vi.fn(), setInviteLink: vi.fn(), setInviteEmail: vi.fn(), setInviteName: vi.fn(),
    openSalonDetail: vi.fn(), actionLoading: false, togglePetModule: vi.fn(),
  }, overrides || {});
  render(<PetBusinessesView {...props} />);
  return props;
}

describe("PetBusinessesView", function () {
  afterEach(function () { vi.restoreAllMocks(); });

  it("lists only pet-type businesses in the main list", function () {
    setup();
    expect(screen.getByText("Happy Paws")).toBeInTheDocument();
    expect(screen.getByText("/happy-paws/pet", { exact: false })).toBeInTheDocument();
    // Salon and Auto tenants appear only as options in the 'existing business' picker.
    expect(screen.queryByText("Glow Salon", { selector: "div" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Glow Salon" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Shine Wash" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Happy Paws" })).not.toBeInTheDocument();
  });

  it("shows an honest empty state", function () {
    setup({ salons: [{ id: "2", name: "Glow Salon", slug: "glow", business_type: "salon" }] });
    expect(screen.getByText("No pet businesses onboarded yet")).toBeInTheDocument();
  });

  it("+ Onboard and + Invite open the shared modals with module key 'pet'", function () {
    var p = setup();
    fireEvent.click(screen.getByText("+ Onboard"));
    expect(p.setManualModuleKey).toHaveBeenCalledWith("pet");
    expect(p.setManualModal).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText("+ Invite"));
    expect(p.setInviteModuleKey).toHaveBeenCalledWith("pet");
    expect(p.setInviteModal).toHaveBeenCalledWith(true);
  });

  it("turns Trimora Pet on for a chosen existing business only after selecting one", function () {
    var p = setup();
    var turnOn = screen.getByText("Turn on");
    expect(turnOn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Existing business"), { target: { value: "2" } });
    fireEvent.click(screen.getByText("Turn on"));
    expect(p.togglePetModule).toHaveBeenCalledTimes(1);
    expect(p.togglePetModule.mock.calls[0][0].id).toBe("2");
    expect(p.togglePetModule.mock.calls[0][1]).toBe(true);
  });

  it("asks for confirmation before turning Pet off, and does nothing if declined", function () {
    var p = setup();
    var confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getAllByText("Turn off")[0]);
    expect(confirmSpy).toHaveBeenCalled();
    expect(p.togglePetModule).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getAllByText("Turn off")[0]);
    expect(p.togglePetModule).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }), false);
  });
});
