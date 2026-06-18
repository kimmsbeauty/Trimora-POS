// src/pages/RatingPage.jsx

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import KimmsLogo from "../components/KimmsLogo";
import GoldBtn from "../components/GoldBtn";
import { db } from "../lib/db.js";
import { today, nowTime } from "../lib/utils.js";
import { BLACK, GOLD, GOLD_LT, GOLD_DIM, WHITE, DARK, RED } from "../lib/constants.js";

export default function RatingPage() {
  var params = useParams();
  var token = params.token;

  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var saleState = useState(null); var sale = saleState[0]; var setSale = saleState[1];
  var notFoundState = useState(false); var notFound = notFoundState[0]; var setNotFound = notFoundState[1];

  var ratingState = useState(0); var rating = ratingState[0]; var setRating = ratingState[1];
  var noteState = useState(""); var note = noteState[0]; var setNote = noteState[1];
  var submittingState = useState(false); var submitting = submittingState[0]; var setSubmitting = submittingState[1];
  var doneState = useState(false); var done = doneState[0]; var setDone = doneState[1];

  // Look up the sale by its public token via the narrow public_rating_lookup
  // view, which only exposes client name + date — never commission,
  // totals, or other customers' data.
  useEffect(function() {
    async function loadSale() {
      try {
        var data = await db("GET", "public_rating_lookup", null, "?feedback_token=eq." + encodeURIComponent(token) + "&limit=1");
        if (Array.isArray(data) && data.length > 0) {
          setSale(data[0]);
        } else {
          setNotFound(true);
        }
      } catch (e) {
        console.error("Rating lookup error:", e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    if (token) loadSale();
    else { setNotFound(true); setLoading(false); }
  }, [token]);

  async function submitRating() {
    if (rating === 0) return alert("Please select a star rating");
    setSubmitting(true);
    try {
      await db("POST", "feedback", {
        rating: rating,
        note: note,
        client: sale ? sale.client : null,
        feedback_token: token,
        date: today(),
        time: nowTime(),
      });
      setDone(true);
    } catch (e) {
      console.error("Feedback submit error:", e);
      alert("Something went wrong submitting your feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <KimmsLogo size="md" dark={false} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid " + GOLD_DIM, borderRadius: 20, padding: 32, maxWidth: 360, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: WHITE, marginBottom: 6 }}>Link not found</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>This feedback link may have expired or is invalid.</div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid " + GOLD_DIM, borderRadius: 20, padding: 32, maxWidth: 360, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💛</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: GOLD_LT, fontFamily: "Georgia,serif", fontStyle: "italic", marginBottom: 8 }}>Thank you!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Your feedback helps us serve you better.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%,#1A1400 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid " + GOLD_DIM, borderRadius: 20, padding: 28, maxWidth: 380, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <KimmsLogo size="sm" dark={false} />
          <div style={{ fontSize: 18, fontWeight: 900, color: GOLD_LT, fontFamily: "Georgia,serif", fontStyle: "italic", marginTop: 14 }}>How was your visit?</div>
          {sale && sale.client && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Hi {sale.client}, we'd love to hear from you</div>
          )}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: WHITE, marginBottom: 10, textAlign: "center" }}>Rate your experience</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, justifyContent: "center" }}>
          {[1, 2, 3, 4, 5].map(function(s) {
            return (
              <button key={s} onClick={function() { setRating(s); }} style={{ width: 48, height: 48, borderRadius: 12, border: "2px solid " + (rating >= s ? GOLD : "rgba(255,255,255,0.15)"), background: rating >= s ? "linear-gradient(135deg," + BLACK + ",#2C1F00)" : "rgba(255,255,255,0.05)", fontSize: 22, cursor: "pointer" }}>
                ⭐
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: WHITE, marginBottom: 8 }}>Any comments? (optional)</div>
        <textarea
          value={note}
          onChange={function(e) { setNote(e.target.value); }}
          placeholder="Tell us about your experience..."
          style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, background: "rgba(255,255,255,0.06)", padding: "10px 12px", fontSize: 13, resize: "none", height: 80, boxSizing: "border-box", fontFamily: "inherit", outline: "none", color: WHITE, marginBottom: 16 }}
        />

        <GoldBtn onClick={submitRating} disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "Submitting..." : "Submit Feedback 💛"}
        </GoldBtn>

        <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 16, fontStyle: "italic" }}>
          "Beauty That Speaks Confidence"
        </div>
      </div>
    </div>
  );
}
