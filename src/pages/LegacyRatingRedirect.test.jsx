// Covers the retirement of the legacy /rate/:token route (App.jsx):
// it now redirects to /:slug/rate/:token via a server-side slug
// lookup (salon_slug_for_feedback_token, migration 081) rather than
// rendering RatingPage directly with no SalonGate -- see migration 080
// and RatingPage.feedbackSubmission.test.jsx for the bug this was
// originally papering over before this redirect existed.

import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import LegacyRatingRedirect from "./LegacyRatingRedirect";

vi.mock("../lib/db.js", () => ({
  dbRpc: vi.fn(),
}));

import { dbRpc } from "../lib/db.js";

function SluggedRouteStub() {
  var slug = useParams().slug;
  return <div>Landed on slugged route for slug={slug}</div>;
}

function renderLegacyRoute(urlPath) {
  return render(
    <MemoryRouter initialEntries={[urlPath]}>
      <Routes>
        <Route path="/rate/:token" element={<LegacyRatingRedirect />} />
        <Route path="/:slug/rate/:token" element={<SluggedRouteStub />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("LegacyRatingRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects to the slug-prefixed route once the token resolves", async () => {
    dbRpc.mockResolvedValue("kimms-beauty");

    renderLegacyRoute("/rate/tok-123");

    expect(dbRpc).toHaveBeenCalledWith("salon_slug_for_feedback_token", { p_token: "tok-123" });
    await waitFor(() => expect(screen.getByText(/kimms-beauty/)).toBeInTheDocument());
  });

  test("shows a friendly not-found message for an invalid or expired token, rather than a blank page", async () => {
    dbRpc.mockResolvedValue(null);

    renderLegacyRoute("/rate/does-not-exist");

    await waitFor(() => expect(screen.getByText("Link not found")).toBeInTheDocument());
    expect(screen.queryByText(/kimms-beauty/)).not.toBeInTheDocument();
  });

  test("shows the same not-found message if the lookup itself errors", async () => {
    dbRpc.mockRejectedValue(new Error("network error"));
    vi.spyOn(console, "error").mockImplementation(function () {});

    renderLegacyRoute("/rate/tok-123");

    await waitFor(() => expect(screen.getByText("Link not found")).toBeInTheDocument());
    console.error.mockRestore();
  });
});
