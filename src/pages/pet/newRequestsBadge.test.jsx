// src/pages/pet/newRequestsBadge.test.jsx
//
// The "new online booking request" badge: the menu shows how many requests are waiting, so the
// owner finds out without opening Requests.
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import PetShell from "./PetShell";
import { PET_NAV } from "./petNav";
import useNewRequestCount, { formatBadgeCount } from "./useNewRequestCount";

vi.mock("../../lib/db", function () { return { db: vi.fn() }; });
vi.mock("./fonts", function () { return {}; });
import { db } from "../../lib/db";

function shell(badges) {
  return render(<PetShell nav={PET_NAV} active="overview" onSelect={function () {}} businessName="Paws" roleLabel="Admin" onLogout={function () {}} badges={badges}><div /></PetShell>);
}

function Probe(props) {
  var n = useNewRequestCount(props.enabled, props.k);
  return <div data-testid="n">{n}</div>;
}

describe("PetShell badge", function () {
  it("shows the count next to Online Requests only", function () {
    shell({ requests: 3 });
    var btn = screen.getAllByRole("button", { name: /Online Requests/, hidden: true })[0];
    expect(btn).toHaveTextContent("3");
    expect(screen.getAllByRole("button", { name: /Calendar & Bookings/, hidden: true })[0]).not.toHaveTextContent(/\d/);
  });
  it("shows nothing when there are no new requests", function () {
    shell({ requests: 0 });
    expect(screen.getAllByRole("button", { name: "Online Requests", hidden: true }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/^\d+ new$/)).toBeNull();
  });
  it("marks the mobile menu button so it is visible with the drawer closed", function () {
    shell({ requests: 2 });
    expect(screen.getByRole("button", { name: "Open menu, 2 new" })).toBeInTheDocument();
  });
  it("caps large counts", function () {
    expect(formatBadgeCount(5)).toBe("5");
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(100)).toBe("99+");
  });
});

describe("useNewRequestCount", function () {
  beforeEach(function () { db.mockReset(); });

  it("does not query until enabled", function () {
    render(<Probe enabled={false} k="overview" />);
    expect(db).not.toHaveBeenCalled();
    expect(screen.getByTestId("n")).toHaveTextContent("0");
  });
  it("counts only requests still marked new, asking the server for new ones", async function () {
    db.mockResolvedValue([{ id: "a", status: "new" }, { id: "b", status: "new" }, { id: "c", status: "accepted" }]);
    render(<Probe enabled={true} k="overview" />);
    await waitFor(function () { expect(screen.getByTestId("n")).toHaveTextContent("2"); });
    expect(db.mock.calls[0][1]).toBe("pet_booking_requests");
    expect(db.mock.calls[0][3]).toContain("status=eq.new");
  });
  it("refreshes when the staff member changes page, so handling a request clears the badge", async function () {
    db.mockResolvedValueOnce([{ id: "a", status: "new" }]).mockResolvedValueOnce([]);
    var view = render(<Probe enabled={true} k="requests" />);
    await waitFor(function () { expect(screen.getByTestId("n")).toHaveTextContent("1"); });
    view.rerender(<Probe enabled={true} k="overview" />);
    await waitFor(function () { expect(screen.getByTestId("n")).toHaveTextContent("0"); });
  });
  it("keeps the last count when a lookup fails", async function () {
    db.mockResolvedValueOnce([{ id: "a", status: "new" }]).mockResolvedValueOnce(null);
    var view = render(<Probe enabled={true} k="a" />);
    await waitFor(function () { expect(screen.getByTestId("n")).toHaveTextContent("1"); });
    view.rerender(<Probe enabled={true} k="b" />);
    await act(async function () { await Promise.resolve(); });
    expect(screen.getByTestId("n")).toHaveTextContent("1");
  });
});
