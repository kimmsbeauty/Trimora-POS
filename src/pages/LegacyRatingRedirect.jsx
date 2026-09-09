// src/pages/LegacyRatingRedirect.jsx
//
// Replaces RatingPage as the element for the legacy /rate/:token route
// (no :slug segment -- see App.jsx). That route predates multi-tenancy
// and is dead surface area now, same category as the already-retired
// unprefixed /pos and /booking routes -- but unlike those, real links
// still point at it: anything generated before the 2026-08-29 fix that
// made sendFeedbackRequest() always emit slug-prefixed links, plus
// anything bookmarked or reshared since. Removing the route outright
// would 404 those. Instead: resolve the slug for the token server-side
// (salon_slug_for_feedback_token, migration 081) and forward to
// /:slug/rate/:token, where SalonGate and RatingPage work exactly as
// they do for a link generated today.
//
// A token with no matching sale (typo, truly expired) shows the same
// "Link not found" message RatingPage itself would show, rather than
// leaving the person on a blank page mid-redirect.

import { useState, useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";
import { dbRpc } from "../lib/db.js";
import { BLACK, DARK, WHITE, GOLD } from "../lib/constants.js";

export default function LegacyRatingRedirect() {
  var token = useParams().token;
  var slugState = useState(undefined); // undefined = still looking up, null = not found, string = resolved
  var slug = slugState[0]; var setSlug = slugState[1];

  useEffect(function() {
    var cancelled = false;
    if (!token) { setSlug(null); return; }
    dbRpc("salon_slug_for_feedback_token", { p_token: token }).then(function(result) {
      if (cancelled) return;
      setSlug(result || null);
    }).catch(function(e) {
      console.error("Legacy rating redirect lookup error:", e);
      if (!cancelled) setSlug(null);
    });
    return function() { cancelled = true; };
  }, [token]);

  if (slug === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%," + DARK + " 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: GOLD, fontSize: 13, letterSpacing: 1 }}>Loading…</div>
      </div>
    );
  }

  if (slug === null) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%," + DARK + " 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid " + GOLD + "66", borderRadius: 20, padding: 32, maxWidth: 360, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: WHITE, marginBottom: 6 }}>Link not found</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>This feedback link may have expired or is invalid.</div>
        </div>
      </div>
    );
  }

  return <Navigate to={"/" + slug + "/rate/" + token} replace />;
}
