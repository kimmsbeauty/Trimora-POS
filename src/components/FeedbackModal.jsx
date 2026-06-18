// src/components/FeedbackModal.jsx

import { useState } from "react";
import GoldBtn from "./GoldBtn";
import { WHITE, DARK, GOLD_LT, GOLD_DIM, BLACK, RED } from "../lib/constants";
import { today, nowTime } from "../lib/utils";

export default function FeedbackModal({ onSubmit, onClose, staffList = [] }) {
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [stylist, setStylist] = useState("");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: WHITE, borderRadius: 20, padding: 28, width: 340, border: `1.5px solid ${GOLD_DIM}` }}>
        <div style={{ background: `linear-gradient(135deg,${BLACK},#2C1F00)`, borderRadius: 12, padding: "16px", textAlign: "center", marginBottom: 20, border: `1px solid ${GOLD_DIM}` }}>
          <div style={{ fontSize: 20, color: GOLD_LT, fontWeight: 900, fontFamily: "Georgia,serif", fontStyle: "italic" }}>How was your visit?</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4, letterSpacing: "0.06em" }}>YOUR FEEDBACK MEANS THE WORLD TO US 👑</div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 8 }}>Rate your experience</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {[1, 2, 3, 4, 5].map(s => (
            <button key={s} onClick={() => setRating(s)} style={{ width: 44, height: 44, borderRadius: 10, border: `2px solid ${rating >= s ? "#C9A84C" : "#eee"}`, background: rating >= s ? `linear-gradient(135deg,${BLACK},#2C1F00)` : "#fafafa", fontSize: 20, cursor: "pointer" }}>⭐</button>
          ))}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 8 }}>Which stylist served you?</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {staffList.map(s => (
            <button key={s.id} onClick={() => setStylist(s.name)} style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${stylist === s.name ? "#C9A84C" : "#eee"}`, background: stylist === s.name ? `linear-gradient(135deg,${BLACK},#2C1F00)` : WHITE, fontSize: 12, fontWeight: 700, cursor: "pointer", color: stylist === s.name ? GOLD_LT : DARK }}>
              {s.name}
            </button>
          ))}
          {staffList.length === 0 && (
            <div style={{ fontSize: 12, color: "#aaa" }}>No staff available</div>
          )}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 8 }}>Any comments? (optional)</div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Tell us about your experience..."
          style={{ width: "100%", borderRadius: 10, border: `1.5px solid ${GOLD_DIM}`, padding: "10px 12px", fontSize: 13, resize: "none", height: 72, boxSizing: "border-box", fontFamily: "inherit", outline: "none" }}
        />

        <GoldBtn
          onClick={() => {
            if (rating === 0) return alert("Please select a star rating");
            onSubmit({ rating, stylist, note, date: today(), time: nowTime() });
          }}
          style={{ width: "100%", marginTop: 14 }}
        >
          Submit Feedback 👑
        </GoldBtn>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#aaa", fontSize: 12, cursor: "pointer", marginTop: 8 }}>
          Skip
        </button>
      </div>
    </div>
  );
}