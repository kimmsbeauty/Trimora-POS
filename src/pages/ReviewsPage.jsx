// src/pages/ReviewsPage.jsx
//
// Dedicated view for customer feedback, separated out of the Overview
// dashboard (which previously rendered every review inline and grew
// unbounded as review volume increased). This page owns its own data
// load (up to 500 most recent reviews) and filters client-side by a
// date range — same pattern ExpensesPage already uses for its month
// filter — rather than re-querying the server on every filter change.

import { useState, useEffect, useMemo } from "react";
import { db } from "../lib/db.js";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, RED } from "../lib/constants.js";
import { todayStr } from "../lib/utils.js";

var PRESETS = ["All", "Today", "This Week", "This Month", "Custom"];

function startOfWeekStr() {
  var d = new Date();
  var day = d.getDay(); // 0 = Sunday
  var diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
  var monday = new Date(d.setDate(diff));
  return monday.getFullYear() + "-" + String(monday.getMonth() + 1).padStart(2, "0") + "-" + String(monday.getDate()).padStart(2, "0");
}

function startOfMonthStr() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01";
}

export default function ReviewsPage({ darkMode }) {
  var CARD    = darkMode ? "#1A1400" : WHITE;
  var TEXT    = darkMode ? WHITE     : DARK;
  var BORDER  = darkMode ? GOLD_DIM + "55" : GOLD_DIM + "33";
  var SUBTEXT = darkMode ? "rgba(255,255,255,0.5)" : "#888";
  var BG      = darkMode ? "#0A0A0A" : CREAM;

  var reviewsState = useState([]); var reviews = reviewsState[0]; var setReviews = reviewsState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];
  var presetState  = useState("All"); var preset = presetState[0]; var setPreset = presetState[1];
  var fromState    = useState(todayStr()); var customFrom = fromState[0]; var setCustomFrom = fromState[1];
  var toState      = useState(todayStr()); var customTo = toState[0]; var setCustomTo = toState[1];
  var stylistFilterState = useState("All"); var stylistFilter = stylistFilterState[0]; var setStylistFilter = stylistFilterState[1];

  useEffect(function() {
    async function load() {
      try {
        var data = await db("GET", "feedback", null, "?order=date.desc,time.desc&limit=500");
        setReviews(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Reviews load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  var rangeStart = useMemo(function() {
    if (preset === "Today") return todayStr();
    if (preset === "This Week") return startOfWeekStr();
    if (preset === "This Month") return startOfMonthStr();
    if (preset === "Custom") return customFrom;
    return null; // "All"
  }, [preset, customFrom]);

  var rangeEnd = useMemo(function() {
    if (preset === "Custom") return customTo;
    if (preset === "All") return null;
    return todayStr();
  }, [preset, customTo]);

  var stylists = useMemo(function() {
    var set = {};
    reviews.forEach(function(r) { if (r.stylist) set[r.stylist] = true; });
    return Object.keys(set).sort();
  }, [reviews]);

  var filtered = useMemo(function() {
    return reviews.filter(function(r) {
      if (rangeStart && (!r.date || r.date < rangeStart)) return false;
      if (rangeEnd && (!r.date || r.date > rangeEnd)) return false;
      if (stylistFilter !== "All" && r.stylist !== stylistFilter) return false;
      return true;
    });
  }, [reviews, rangeStart, rangeEnd, stylistFilter]);

  var avgRating = filtered.length
    ? (filtered.reduce(function(s, f) { return s + (f.rating || 0); }, 0) / filtered.length).toFixed(1)
    : "—";

  var presetBtnStyle = function(p) {
    var active = preset === p;
    return {
      padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
      border: "2px solid " + (active ? GOLD : BORDER),
      background: active ? "linear-gradient(135deg," + BLACK + ",#2C1F00)" : "transparent",
      color: active ? GOLD_LT : TEXT,
    };
  };

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: SUBTEXT, fontSize: 13 }}>Loading reviews...</div>
    );
  }

  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ fontWeight: 900, fontSize: 18, color: TEXT, marginBottom: 4 }}>⭐ Customer Reviews</div>
      <div style={{ fontSize: 12, color: SUBTEXT, marginBottom: 16 }}>
        {filtered.length} review{filtered.length !== 1 ? "s" : ""} · avg {avgRating}★
        {reviews.length >= 500 ? " (showing most recent 500)" : ""}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: preset === "Custom" ? 10 : 16 }}>
        {PRESETS.map(function(p) {
          return (
            <button key={p} onClick={function() { setPreset(p); }} style={presetBtnStyle(p)}>{p}</button>
          );
        })}
      </div>

      {preset === "Custom" && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: SUBTEXT, marginBottom: 4, fontWeight: 700 }}>From</div>
            <input type="date" value={customFrom} onChange={function(e) { setCustomFrom(e.target.value); }}
              style={{ borderRadius: 8, border: "1.5px solid " + GOLD_DIM, padding: "8px 10px", fontSize: 13, background: CARD, color: TEXT }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: SUBTEXT, marginBottom: 4, fontWeight: 700 }}>To</div>
            <input type="date" value={customTo} onChange={function(e) { setCustomTo(e.target.value); }}
              style={{ borderRadius: 8, border: "1.5px solid " + GOLD_DIM, padding: "8px 10px", fontSize: 13, background: CARD, color: TEXT }} />
          </div>
        </div>
      )}

      {stylists.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button onClick={function() { setStylistFilter("All"); }} style={{
            padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: "2px solid " + (stylistFilter === "All" ? GOLD : BORDER),
            background: stylistFilter === "All" ? "linear-gradient(135deg," + BLACK + ",#2C1F00)" : "transparent",
            color: stylistFilter === "All" ? GOLD_LT : TEXT,
          }}>
            All Staff
          </button>
          {stylists.map(function(s) {
            var active = stylistFilter === s;
            return (
              <button key={s} onClick={function() { setStylistFilter(s); }} style={{
                padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: "2px solid " + (active ? GOLD : BORDER),
                background: active ? "linear-gradient(135deg," + BLACK + ",#2C1F00)" : "transparent",
                color: active ? GOLD_LT : TEXT,
              }}>{s}</button>
            );
          })}
        </div>
      )}

      <div style={{ background: CARD, borderRadius: 14, padding: 16, border: "1px solid " + BORDER }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: SUBTEXT, fontSize: 13 }}>
            No reviews in this range.
          </div>
        ) : (
          filtered.map(function(f) {
            return (
              <div key={f.id || f.feedback_token} style={{ borderBottom: "1px solid " + BORDER, paddingBottom: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(function(s) {
                      return (
                        <span key={s} style={{ fontSize: 14, opacity: f.rating >= s ? 1 : 0.2 }}>⭐</span>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: SUBTEXT }}>{f.date || ""}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 2 }}>
                  {f.client || "Anonymous"}
                  {f.stylist ? <span style={{ fontWeight: 400, color: SUBTEXT }}> · {f.stylist}</span> : null}
                </div>
                {f.note ? (
                  <div style={{ fontSize: 12, color: SUBTEXT, fontStyle: "italic" }}>"{f.note}"</div>
                ) : (
                  <div style={{ fontSize: 11, color: SUBTEXT }}>No comment</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
