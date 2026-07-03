// src/components/AskTrimora.jsx
//
// A minimal natural-language entry point into AIService. Recognizes a
// handful of phrasings across three capabilities -- revenue, customers/
// visitors, and best-selling items -- plus a few range phrasings
// ("today", "this week", "this month", "yesterday").
//
// This does NOT replace the Dashboard's existing filter buttons/cards,
// which already show most of this data faster (no round trip, data's
// already loaded in memory). What this proves out is the *interaction
// pattern* from the AI architecture doc -- typing a question instead of
// clicking a filter -- which is the seed of the real Ask-Your-Data
// feature once a paid provider is enabled and can understand
// open-ended questions, not just a set of recognized phrases.

import { useState } from "react";
import { getRevenueSummary, getCustomerSummary, getTopItems } from "../lib/ai/AIService";
import { fmt } from "../lib/utils.js";
import { GOLD, GOLD_LT, GOLD_DIM, WHITE, BLACK } from "../lib/constants.js";

function toKEDateStr(d) {
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

export function resolveRange(question) {
  var q = question.toLowerCase();
  var today = new Date();

  if (q.indexOf("this week") !== -1 || q.indexOf("week") !== -1) {
    var weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    return { dateFrom: toKEDateStr(weekAgo), dateTo: toKEDateStr(today), label: "the last 7 days" };
  }
  if (q.indexOf("this month") !== -1 || q.indexOf("month") !== -1) {
    var monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 29);
    return { dateFrom: toKEDateStr(monthAgo), dateTo: toKEDateStr(today), label: "the last 30 days" };
  }
  if (q.indexOf("yesterday") !== -1) {
    var y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { dateFrom: toKEDateStr(y), dateTo: toKEDateStr(y), label: "yesterday" };
  }
  // Default: today. Covers "today", "how am I doing", etc.
  return { dateFrom: toKEDateStr(today), dateTo: toKEDateStr(today), label: "today" };
}

// AIService now has three capabilities: revenue, customers, and top
// items. Route each question to the right one by keyword, and only
// fall back to "unsupported" for topics none of the three cover yet
// (staff performance, bookings, stock, reviews). Anything left over
// defaults to revenue, since that's the broadest/most common ask and
// failing open beats failing closed on a phrasing we didn't predict.
var TOP_ITEMS_KEYWORDS = [
  "item", "best seller", "bestseller", "best-selling", "best selling",
  "most sold", "sold the most", "top product", "top service", "popular",
  "which product", "which service",
];
var CUSTOMER_KEYWORDS = [
  "customer", "client", "visitor", "visited", "walk-in", "walkin",
];
var UNSUPPORTED_KEYWORDS = [
  "staff", "stylist", "employee", "commission",
  "booking", "appointment", "schedule", "calendar",
  "churn", "at risk", "birthday",
  "stock", "inventory", "reorder",
  "review", "rating", "feedback",
];

function matchesAny(q, keywords) {
  return keywords.some(function (kw) { return q.indexOf(kw) !== -1; });
}

export function classifyQuestion(question) {
  var q = question.toLowerCase();
  if (matchesAny(q, TOP_ITEMS_KEYWORDS)) return "topItems";
  if (matchesAny(q, UNSUPPORTED_KEYWORDS)) return "unsupported";
  if (matchesAny(q, CUSTOMER_KEYWORDS)) return "customers";
  return "revenue";
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

    var kind = classifyQuestion(question);

    if (kind === "unsupported") {
      setAnswer({
        text: "Right now I can answer questions about revenue, customers/visitors, and best-selling items — try asking about today, this week, or this month.",
      });
      setLoading(false);
      return;
    }

    var range = resolveRange(question);
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
