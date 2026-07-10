// src/components/AutoFeedbackModal.jsx
//
// Mirrors POS's FeedbackModal.jsx: in-person, staff-collected feedback
// right at job completion, as an alternative to sending a WhatsApp
// link (AutoRatingPage.jsx). Stays in Auto's own fixed theme rather
// than dynamic salon branding -- same precedent FeedbackModal.jsx
// itself sets (stays in POS's own gold/black identity), unlike
// RatingPage.jsx/AutoRatingPage.jsx which are external, customer-held
// links and do use salon branding.

import { useState } from "react";
import { INK, STEEL, CHROME, SIGNAL, PAPER } from "../pages/auto/theme";
import { todayStr, nowTime } from "../lib/utils";

export default function AutoFeedbackModal({ onSubmit, onClose, staffList }) {
  var ratingState = useState(0); var rating = ratingState[0]; var setRating = ratingState[1];
  var noteState = useState(""); var note = noteState[0]; var setNote = noteState[1];
  var staffNameState = useState(""); var staffName = staffNameState[0]; var setStaffName = staffNameState[1];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: STEEL, borderRadius: 20, padding: 28, width: 340, maxWidth: "100%", border: "1.5px solid " + CHROME + "44" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, color: SIGNAL, fontWeight: 900 }}>How was your wash?</div>
          <div style={{ fontSize: 11, color: CHROME, marginTop: 4, letterSpacing: "0.06em" }}>YOUR FEEDBACK MEANS THE WORLD TO US</div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: PAPER, marginBottom: 8 }}>Rate your experience</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
          {[1, 2, 3, 4, 5].map(function (s) {
            return (
              <button key={s} onClick={function () { setRating(s); }} style={{
                width: 44, height: 44, borderRadius: 10, border: "2px solid " + (rating >= s ? SIGNAL : CHROME + "44"),
                background: rating >= s ? SIGNAL + "22" : "rgba(255,255,255,0.02)", fontSize: 20, cursor: "pointer",
              }}>⭐</button>
            );
          })}
        </div>

        {staffList && staffList.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: PAPER, marginBottom: 8 }}>Who attended to your vehicle?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
              {staffList.map(function (s) {
                var active = staffName === s.name;
                return (
                  <button key={s.id} onClick={function () { setStaffName(s.name); }} style={{
                    padding: "7px 14px", borderRadius: 20, border: "2px solid " + (active ? SIGNAL : CHROME + "44"),
                    background: active ? SIGNAL : "transparent", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    color: active ? INK : PAPER,
                  }}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ fontSize: 13, fontWeight: 700, color: PAPER, marginBottom: 8 }}>Any comments? (optional)</div>
        <textarea
          value={note}
          onChange={function (e) { setNote(e.target.value); }}
          placeholder="Tell us about your experience..."
          style={{
            width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1.5px solid " + CHROME + "44",
            background: "rgba(255,255,255,0.04)", color: PAPER, padding: "10px 12px", fontSize: 13,
            resize: "none", height: 72, fontFamily: "inherit", outline: "none",
          }}
        />

        <button
          onClick={function () {
            if (rating === 0) { alert("Please select a star rating"); return; }
            onSubmit({ rating: rating, staffName: staffName, note: note, date: todayStr(), time: nowTime() });
          }}
          style={{
            width: "100%", marginTop: 14, background: SIGNAL, color: INK, border: "none", borderRadius: 10,
            padding: "12px 0", fontWeight: 900, fontSize: 14, cursor: "pointer",
          }}
        >
          Submit Feedback 🚗
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: CHROME, fontSize: 12, cursor: "pointer", marginTop: 8 }}>
          Skip
        </button>
      </div>
    </div>
  );
}
