// src/pages/AutoRatingPage.jsx
//
// Mirrors RatingPage.jsx's structure and, critically, its security
// pattern: looks up the job via auto_job_rating_lookup_by_token, which
// requires the token as a mandatory RPC argument (feedback_token,
// client name, date only -- never payment, commission, or vehicle
// details) rather than the old public_auto_job_rating_lookup view,
// which granted anon SELECT with no row filtering built in -- anyone
// bypassing the app UI could omit the token filter entirely and pull
// every job's feedback token/client/date across the whole platform.
// See migration 053 (audit follow-up).
// Dynamically salon-branded (primary/secondary colors from context),
// same as RatingPage.jsx -- this represents the SALON's brand to the
// customer, not Trimora's or Auto's internal staff-facing theme.

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import SalonBrandmark from "../components/SalonBrandmark";
import { db, dbRpc } from "../lib/db.js";
import { todayStr, nowTime } from "../lib/utils.js";
import { BLACK, GOLD, DARK, WHITE } from "../lib/constants.js";
import { lighten, darken } from "../lib/colorUtils";
import { useSalon, fetchPublicSalonBranding } from "../lib/SalonContext";

export default function AutoRatingPage() {
  var params = useParams();
  var token = params.token;
  var slug = params.slug;

  var contextSalon = useSalon();
  var legacyBrandingState = useState(null);
  var legacyBranding = legacyBrandingState[0]; var setLegacyBranding = legacyBrandingState[1];

  useEffect(function () {
    if (contextSalon) return;
    var cancelled = false;
    fetchPublicSalonBranding(slug || null).then(function (result) {
      if (!cancelled) setLegacyBranding(result);
    });
    return function () { cancelled = true; };
  }, [contextSalon, slug]);

  var salon = contextSalon || legacyBranding;
  var primary = (salon && salon.primary_color) || GOLD;
  var secondary = (salon && salon.secondary_color) || DARK;
  var primaryLt = lighten(primary, 14);
  var primaryDim = darken(primary, 18);
  var bgStop3 = lighten(secondary, 3.5);
  var tagline = salon && salon.tagline;

  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var jobState = useState(null); var job = jobState[0]; var setJob = jobState[1];
  var notFoundState = useState(false); var notFound = notFoundState[0]; var setNotFound = notFoundState[1];

  var ratingState = useState(0); var rating = ratingState[0]; var setRating = ratingState[1];
  var noteState = useState(""); var note = noteState[0]; var setNote = noteState[1];
  var submittingState = useState(false); var submitting = submittingState[0]; var setSubmitting = submittingState[1];
  var doneState = useState(false); var done = doneState[0]; var setDone = doneState[1];

  useEffect(function () {
    async function loadJob() {
      try {
        var data = await dbRpc("auto_job_rating_lookup_by_token", { p_token: token });
        if (Array.isArray(data) && data.length > 0) {
          setJob(data[0]);
        } else {
          setNotFound(true);
        }
      } catch (e) {
        console.error("Auto rating lookup error:", e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    if (token) loadJob();
    else { setNotFound(true); setLoading(false); }
  }, [token]);

  async function submitRating() {
    if (rating === 0) return alert("Please select a star rating");
    setSubmitting(true);
    try {
      var saved = await db("POST", "feedback", {
        rating: rating,
        note: note,
        client: job ? job.client : null,
        feedback_token: token,
        date: todayStr(),
        time: nowTime(),
      });
      if (!saved) {
        alert("Something went wrong submitting your feedback. Please try again.");
        return;
      }
      setDone(true);
    } catch (e) {
      console.error("Auto feedback submit error:", e);
      alert("Something went wrong submitting your feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  var bgStyle = { minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%," + secondary + " 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
  var cardStyle = { background: "rgba(255,255,255,0.05)", border: "1.5px solid " + primaryDim, borderRadius: 20, padding: 32, maxWidth: 360, width: "100%", textAlign: "center" };

  if (loading) {
    return <div style={bgStyle}><SalonBrandmark salon={salon} size="md" /></div>;
  }

  if (notFound) {
    return (
      <div style={bgStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: WHITE, marginBottom: 6 }}>Link not found</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>This feedback link may have expired or is invalid.</div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={bgStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚗💛</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: primaryLt, fontFamily: "Georgia,serif", fontStyle: "italic", marginBottom: 8 }}>Thank you!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Your feedback helps us serve you better.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={bgStyle}>
      <div style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid " + primaryDim, borderRadius: 20, padding: 28, maxWidth: 380, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <SalonBrandmark salon={salon} size="sm" />
          <div style={{ fontSize: 18, fontWeight: 900, color: primaryLt, fontFamily: "Georgia,serif", fontStyle: "italic", marginTop: 14 }}>How was your wash?</div>
          {job && job.client && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Hi {job.client}, we'd love to hear from you</div>
          )}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: WHITE, marginBottom: 10, textAlign: "center" }}>Rate your experience</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, justifyContent: "center" }}>
          {[1, 2, 3, 4, 5].map(function (s) {
            return (
              <button key={s} onClick={function () { setRating(s); }} style={{
                width: 48, height: 48, borderRadius: 12, border: "2px solid " + (rating >= s ? primary : "rgba(255,255,255,0.15)"),
                background: rating >= s ? "linear-gradient(135deg," + BLACK + "," + bgStop3 + ")" : "rgba(255,255,255,0.05)",
                fontSize: 22, cursor: "pointer",
              }}>
                ⭐
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: WHITE, marginBottom: 8 }}>Any comments? (optional)</div>
        <textarea
          value={note}
          onChange={function (e) { setNote(e.target.value); }}
          placeholder="Tell us about your experience..."
          style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + primaryDim, background: "rgba(255,255,255,0.06)", padding: "10px 12px", fontSize: 13, resize: "none", height: 80, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 16 }}
        />

        <button onClick={submitRating} disabled={submitting} style={{
          width: "100%", background: "linear-gradient(135deg," + primary + " 0%," + primaryLt + " 50%," + primary + " 100%)",
          color: BLACK, border: "2px solid " + primary, borderRadius: 10, padding: "12px 0",
          fontWeight: 900, fontSize: 14, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1,
        }}>
          {submitting ? "Submitting..." : "Submit Feedback 🚗"}
        </button>

        {tagline && (
          <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 16, fontStyle: "italic" }}>
            "{tagline}"
          </div>
        )}
      </div>
    </div>
  );
}
