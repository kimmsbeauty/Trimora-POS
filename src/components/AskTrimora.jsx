// src/components/AskTrimora.jsx
//
// A natural-language entry point into AIService. Classification of the
// typed question (which capability it's asking about, and what date
// range) now goes through AIService.classifyQuestion, which tries
// Gemini's free tier first and automatically falls back to the local
// keyword classifier if Gemini is unavailable, unconfigured, or slow
// -- so this component doesn't need to know or care which one actually
// answered. Gemini only ever sees the raw question text; all the real
// data (revenue, customers, items) is still fetched and computed
// entirely locally, exactly as before.
//
// This does NOT replace the Dashboard's existing filter buttons/cards,
// which already show most of this data faster (no round trip, data's
// already loaded in memory). What this proves out is the *interaction
// pattern* from the AI architecture doc -- typing a question instead of
// clicking a filter.

import { useState } from "react";
import { getRevenueSummary, getCustomerSummary, getTopItems, classifyQuestion } from "../lib/ai/AIService";
import { fmt } from "../lib/utils.js";
import { GOLD, GOLD_LT, GOLD_DIM, WHITE, BLACK } from "../lib/constants.js";

function toKEDateStr(d) {
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

// Turns a range keyword ("today" | "week" | "month" | "yesterday", as
// returned by AIService.classifyQuestion) into actual date bounds plus
// a human-readable label for the answer text.
export function rangeKeywordToDates(range) {
  var today = new Date();

  if (range === "week") {
    var weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    return { dateFrom: toKEDateStr(weekAgo), dateTo: toKEDateStr(today), label: "the last 7 days" };
  }
  if (range === "month") {
    var monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 29);
    return { dateFrom: toKEDateStr(monthAgo), dateTo: toKEDateStr(today), label: "the last 30 days" };
  }
  if (range === "yesterday") {
    var y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { dateFrom: toKEDateStr(y), dateTo: toKEDateStr(y), label: "yesterday" };
  }
  return { dateFrom: toKEDateStr(today), dateTo: toKEDateStr(today), label: "today" };
}

export default function AskTrimora({ darkMode }) {
  var questionState = useState("");
  var question = questionState[0];
  var setQuestion = questionState[1];

  var answerState = useState(null);
  var answer = answerState[0];
  var setAnswer = answerState[1];

  var loadingState = useState(false);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  var CARD = darkMode ? "#1A1400" : WHITE;
  var TEXT = darkMode ? WHITE : "#1A1400";
  var SUBTEXT = darkMode ? "rgba(255,255,255,0.5)" : "#888";
  var BORDER = darkMode ? GOLD_DIM + "55" : GOLD_DIM + "33";

  async function handleAsk(e) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true);
    setAnswer(null);

    var classification = await classifyQuestion(question);
    var kind = classification.capability;

    if (kind === "unsupported") {
      setAnswer({
        text: "Right now I can answer questions about revenue, customers/visitors, and best-selling items — try asking about today, this week, or this month.",
      });
      setLoading(false);
      return;
    }

    var range = rangeKeywordToDates(classification.range);
    var text;

    if (kind === "customers") {
      var customerSummary = await getCustomerSummary({ dateFrom: range.dateFrom, dateTo: range.dateTo });
      if (!customerSummary) {
        text = "I couldn't fetch that right now — please try again.";
      } else {
        text = customerSummary.visitorCount + " customer" + (customerSummary.visitorCount === 1 ? "" : "s") +
          " visited " + range.label + ", " + customerSummary.newCustomerCount +
          " of them new.";
      }
    } else if (kind === "topItems") {
      var topItemsResult = await getTopItems({ dateFrom: range.dateFrom, dateTo: range.dateTo, limit: 3 });
      if (!topItemsResult) {
        text = "I couldn't fetch that right now — please try again.";
      } else if (topItemsResult.items.length === 0) {
        text = "Nothing sold for " + range.label + " yet.";
      } else {
        text = "Best sellers for " + range.label + ": " +
          topItemsResult.items.map(function (i) { return i.name + " (" + i.qty + ")"; }).join(", ") + ".";
      }
    } else {
      var summary = await getRevenueSummary({ dateFrom: range.dateFrom, dateTo: range.dateTo });
      if (!summary) {
        text = "I couldn't fetch that right now — please try again.";
      } else if (summary.saleCount === 0) {
        text = "No sales recorded for " + range.label + " yet.";
      } else {
        var topMethod = summary.byPaymentMethod[0];
        text = "You made " + fmt(summary.totalRevenue) + " across " + summary.saleCount +
          (summary.saleCount === 1 ? " sale" : " sales") + " for " + range.label +
          (topMethod ? ", mostly via " + topMethod.method + " (" + fmt(topMethod.total) + ")" : "") + ".";
      }
    }

    setAnswer({ text: text });
    setLoading(false);
  }

  return (
    <div style={{ background: CARD, borderRadius: 14, padding: 16, marginBottom: 12, border: "1px solid " + BORDER }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: TEXT, marginBottom: 10 }}>Ask Trimora</div>
      <form onSubmit={handleAsk} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={question}
          onChange={function (e) { setQuestion(e.target.value); }}
          placeholder="e.g. how many customers visited today?"
          style={{
            flex: 1, borderRadius: 8, border: "1.5px solid " + GOLD_DIM, padding: "9px 12px",
            fontSize: 13, fontFamily: "inherit", outline: "none", background: darkMode ? "#2C1F00" : "#F5F0E8", color: TEXT,
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "9px 16px", borderRadius: 8, border: "none",
            background: "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")",
            color: BLACK, fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "..." : "Ask"}
        </button>
      </form>
      {answer && (
        <div style={{ marginTop: 12, fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{answer.text}</div>
      )}
      {!answer && (
        <div style={{ marginTop: 10, fontSize: 11, color: SUBTEXT }}>
          Try: "how much did I make today?", "how many new customers this week?", or "what sold most this month?"
        </div>
      )}
    </div>
  );
}
