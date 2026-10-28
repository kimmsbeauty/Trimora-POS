// Pins the shell geometry to the approved prototype's app-shell
// (Lovable project eb045c8e..., src/components/app-shell.tsx), so a later edit
// can't silently drift from it.
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import PetShell from "./PetShell";
import { PET_NAV, visiblePetNav } from "./petNav";

function setup() {
  return render(
    <PetShell nav={PET_NAV} active="overview" onSelect={vi.fn()} businessName="Happy Paws" roleLabel="Admin" onLogout={vi.fn()}>
      <div>content</div>
    </PetShell>
  );
}
function css() { return document.querySelector("style").textContent; }

describe("PetShell matches the approved prototype geometry", function () {
  it("uses the prototype's sizes", function () {
    setup();
    var c = css();
    expect(c).toMatch(/\.pet-side \{[^}]*width: 256px/);
    expect(c).toMatch(/\.pet-drawer \{[^}]*width: 288px[^}]*max-width: 85vw/);
    expect(c).toMatch(/\.pet-topbar \{[^}]*height: 56px/);
    expect(c).toMatch(/\.pet-content \{[^}]*max-width: 1200px/);
    expect(c).toMatch(/\.pet-nav \{[^}]*gap: 4px/);
    expect(c).toMatch(/\.pet-nav-item\.active::before \{[^}]*width: 4px; height: 20px/);
    expect(c).toMatch(/min-width: 1024px/);
  });

  it("uses a light mobile top bar with a bordered menu button", function () {
    setup();
    expect(css()).toMatch(/\.pet-topbar \{[^}]*rgba\(255,255,255,0\.95\)/);
    expect(css()).toMatch(/\.pet-menubtn \{[^}]*width: 36px; height: 36px/);
  });

  it("marks the active item and shows brand, caption and the footer card", function () {
    setup();
    var active = screen.getAllByText("Overview")[0].closest("button");
    expect(active).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByText("Trimora Pet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BY TRIMORA SYSTEMS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Signed in on this device").length).toBeGreaterThan(0);
  });

  it("opens the drawer from the menu button and closes it with the outside close button", function () {
    setup();
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close menu"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("labels the four sections and keeps all 15 modules in the agreed order", function () {
    setup();
    var nav = screen.getByRole("navigation", { name: "Main navigation", hidden: true });
    ["Workspace", "Customers & Services", "Business Operations", "Administration"].forEach(function (l) {
      expect(screen.getByRole("group", { name: l, hidden: true })).toBeInTheDocument();
    });
    var labels = Array.prototype.map.call(nav.querySelectorAll("button.pet-nav-item"), function (b) { return b.textContent; });
    expect(labels).toEqual(PET_NAV.map(function (n) { return n.label; }));
    expect(labels.length).toBe(15);
  });

  it("shows no Administration heading or items to staff", function () {
    render(<PetShell nav={visiblePetNav(false)} active="overview" onSelect={vi.fn()} businessName="Happy Paws" roleLabel="Staff" onLogout={vi.fn()}><div /></PetShell>);
    expect(screen.queryByRole("group", { name: "Administration", hidden: true })).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
    expect(screen.getByRole("group", { name: "Workspace", hidden: true })).toBeInTheDocument();
  });

  it("selects the right module for every item and marks only the active one", function () {
    var onSelect = vi.fn();
    render(<PetShell nav={PET_NAV} active="checkout" onSelect={onSelect} businessName="Happy Paws" roleLabel="Admin" onLogout={vi.fn()}><div /></PetShell>);
    var nav = screen.getByRole("navigation", { name: "Main navigation", hidden: true });
    var buttons = nav.querySelectorAll("button.pet-nav-item");
    expect(nav.querySelectorAll("[aria-current='page']").length).toBe(1);
    expect(nav.querySelector("[aria-current='page']").textContent).toBe("Checkout");
    Array.prototype.forEach.call(buttons, function (b, i) { fireEvent.click(b); expect(onSelect).toHaveBeenLastCalledWith(PET_NAV[i].key); });
    expect(onSelect).toHaveBeenCalledTimes(15);
  });

  it("badges only the item it is told to", function () {
    render(<PetShell nav={PET_NAV} active="overview" onSelect={vi.fn()} badges={{ requests: 3 }} businessName="Happy Paws" roleLabel="Admin" onLogout={vi.fn()}><div /></PetShell>);
    var nav = screen.getByRole("navigation", { name: "Main navigation", hidden: true });
    expect(nav.querySelectorAll("[aria-label$=' new']").length).toBe(1);
    expect(screen.getByRole("button", { name: /Online Requests/, hidden: true }).querySelector("[aria-label='3 new']")).toBeTruthy();
  });

  it("scrolls the navigation on its own while the account card stays put", function () {
    setup();
    expect(css()).toMatch(/\.pet-nav \{[^}]*flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain/);
    expect(css()).toMatch(/\.pet-side-foot \{[^}]*flex-shrink: 0/);
    expect(css()).toMatch(/\.pet-brand \{[^}]*flex-shrink: 0/);
    expect(css()).toMatch(/max-height: 640px/);
  });

  it("closes the drawer with Escape, and picking a module closes it too", function () {
    var onSelect = vi.fn();
    render(<PetShell nav={PET_NAV} active="overview" onSelect={onSelect} businessName="Happy Paws" roleLabel="Admin" onLogout={vi.fn()}><div /></PetShell>);
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toHaveAttribute("aria-modal", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Open menu"));
    var drawer = screen.getByRole("dialog");
    fireEvent.click(Array.prototype.filter.call(drawer.querySelectorAll("button.pet-nav-item"), function (b) { return b.textContent === "Reports"; })[0]);
    expect(onSelect).toHaveBeenCalledWith("reports");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
