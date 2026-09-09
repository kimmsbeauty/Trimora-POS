// src/pages/RatingPage.feedbackSubmission.test.jsx
//
// This is the regression test for a bug that shipped broken THREE
// separate times (2026-08-29 commit 7fe8a61, and again as reported
// 2026-09-05 / fixed by migration 080 + this file): the public rating
// pages' feedback submission silently depended on currentSalonId
// having been resolved client-side by <SalonGate>. Nothing caught this
// until a real customer hit "Something went wrong" in production, more
// than once, because there was no test exercising a rating page with
// SalonGate absent.
//
// This file pins down the fix at the level that actually matters:
// feedback submission must succeed via dbRpc() (a server-side,
// token-validated RPC) and must NEVER depend on useSalon() / SalonGate
// having resolved anything. Both pages are covered, and each has an
// explicit test simulating the exact broken scenario (useSalon()
// returning null, i.e. no SalonGate ancestor at all) so this can't
// regress a fourth time without a test going red.
//
// 2026-09-09: the legacy /rate/:token route that originally exposed
// this bug (RatingPage with no SalonGate wrapper) was retired in favor
// of a redirect (LegacyRatingRedirect.jsx, its own test file) that
// forwards to /:slug/rate/:token before RatingPage ever mounts. So
// RatingPage is no longer reachable without SalonGate in production --
// but the invariant itself (never depend on it) is still worth pinning
// down defensively at the component level, in case routing changes
// again later.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RatingPage from "./RatingPage";
import AutoRatingPage from "./AutoRatingPage";

vi.mock("../lib/db.js", () => ({
  db: vi.fn(),
  dbRpc: vi.fn(),
}));

vi.mock("../lib/SalonContext", () => ({
  useSalon: vi.fn(),
  fetchPublicSalonBranding: vi.fn(),
}));

import { db, dbRpc } from "../lib/db.js";
import { useSalon, fetchPublicSalonBranding } from "../lib/SalonContext";

function renderWithRoute(Component, routePath, urlPath) {
  return render(
    <MemoryRouter initialEntries={[urlPath]}>
      <Routes>
        <Route path={routePath} element={<Component />} />
      </Routes>
    </MemoryRouter>
  );
}

async function rateFiveStarsAndSubmit(buttonText) {
  var stars = screen.getAllByText("⭐");
  fireEvent.click(stars[4]); // 5th star
  fireEvent.click(screen.getByText(buttonText));
}

describe("RatingPage — feedback submission never depends on SalonGate/currentSalonId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defensive scenario: no SalonGate ancestor, so context is null.
    // No longer reachable this way in production (LegacyRatingRedirect
    // sits in front of the unslugged route now), kept as a component-
    // level guard against the invariant regressing again.
    useSalon.mockReturnValue(null);
    fetchPublicSalonBranding.mockResolvedValue(null);
    dbRpc.mockImplementation((fn) => {
      if (fn === "rating_lookup_by_token") {
        return Promise.resolve([{ feedback_token: "tok-123", client: "Mary", date: "2026-09-05" }]);
      }
      if (fn === "submit_sale_feedback") {
        return Promise.resolve([{ id: "feedback-uuid-1" }]);
      }
      return Promise.resolve(null);
    });
  });

  test("submits successfully even with SalonGate/useSalon unresolved", async () => {
    renderWithRoute(RatingPage, "/:slug/rate/:token", "/kimms-beauty/rate/tok-123");

    await waitFor(() => expect(screen.getByText(/How was your visit/)).toBeInTheDocument());
    await rateFiveStarsAndSubmit("Submit Feedback 💛");

    await waitFor(() => expect(screen.getByText("Thank you!")).toBeInTheDocument());

    // The core regression check: submission went through the
    // token-validated RPC, not the tenant-scoped db("POST","feedback")
    // path that requires a resolved salon_id.
    expect(dbRpc).toHaveBeenCalledWith("submit_sale_feedback", expect.objectContaining({
      p_token: "tok-123",
      p_rating: 5,
    }));
    expect(db).not.toHaveBeenCalled();
  });

  test("also submits successfully on the slug-prefixed route with SalonGate resolved", async () => {
    useSalon.mockReturnValue({ id: "salon-uuid-1", slug: "kimms-beauty", primary_color: "#C9A84C" });

    renderWithRoute(RatingPage, "/:slug/rate/:token", "/kimms-beauty/rate/tok-123");

    await waitFor(() => expect(screen.getByText(/How was your visit/)).toBeInTheDocument());
    await rateFiveStarsAndSubmit("Submit Feedback 💛");

    await waitFor(() => expect(screen.getByText("Thank you!")).toBeInTheDocument());
    expect(dbRpc).toHaveBeenCalledWith("submit_sale_feedback", expect.objectContaining({
      p_token: "tok-123",
      p_rating: 5,
    }));
  });

  test("shows the error alert (not a false 'Thank you') if the RPC rejects the token", async () => {
    dbRpc.mockImplementation((fn) => {
      if (fn === "rating_lookup_by_token") {
        return Promise.resolve([{ feedback_token: "tok-123", client: "Mary", date: "2026-09-05" }]);
      }
      if (fn === "submit_sale_feedback") return Promise.resolve(null); // dbRpc()'s soft-fail contract
      return Promise.resolve(null);
    });
    var alertSpy = vi.spyOn(window, "alert").mockImplementation(function () {});

    renderWithRoute(RatingPage, "/:slug/rate/:token", "/kimms-beauty/rate/tok-123");
    await waitFor(() => expect(screen.getByText(/How was your visit/)).toBeInTheDocument());
    await rateFiveStarsAndSubmit("Submit Feedback 💛");

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      "Something went wrong submitting your feedback. Please try again."
    ));
    expect(screen.queryByText("Thank you!")).not.toBeInTheDocument();
    alertSpy.mockRestore();
  });
});

describe("AutoRatingPage — feedback submission never depends on SalonGate/currentSalonId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Unlike RatingPage, App.jsx registers no legacy unslugged route for
    // AutoRatingPage today -- only /:slug/auto/rate/:token (always
    // wrapped in SalonGate). This test still forces useSalon() to null
    // (simulating SalonGate not yet resolved, or a future route change
    // that adds an unslugged variant the same way RatingPage once had)
    // to pin down the same invariant: submission must never depend on
    // it having resolved.
    useSalon.mockReturnValue(null);
    fetchPublicSalonBranding.mockResolvedValue(null);
    dbRpc.mockImplementation((fn) => {
      if (fn === "auto_job_rating_lookup_by_token") {
        return Promise.resolve([{ feedback_token: "tok-456", client: "John", date: "2026-09-05" }]);
      }
      if (fn === "submit_auto_job_feedback") {
        return Promise.resolve([{ id: "feedback-uuid-2" }]);
      }
      return Promise.resolve(null);
    });
  });

  test("submits successfully even if SalonGate has not resolved a salon yet", async () => {
    renderWithRoute(AutoRatingPage, "/:slug/auto/rate/:token", "/kimms-carwash/auto/rate/tok-456");

    await waitFor(() => expect(screen.getByText(/How was your wash/)).toBeInTheDocument());
    await rateFiveStarsAndSubmit("Submit Feedback 🚗");

    await waitFor(() => expect(screen.getByText("Thank you!")).toBeInTheDocument());
    expect(dbRpc).toHaveBeenCalledWith("submit_auto_job_feedback", expect.objectContaining({
      p_token: "tok-456",
      p_rating: 5,
    }));
    expect(db).not.toHaveBeenCalled();
  });
});
