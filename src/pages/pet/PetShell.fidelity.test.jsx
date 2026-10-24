// Pins the shell geometry to the approved prototype's app-shell
// (Lovable project eb045c8e..., src/components/app-shell.tsx), so a later edit
// can't silently drift from it.
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import PetShell from "./PetShell";
import { PET_NAV } from "./petNav";

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
});
