// src/components/AutoAskTrimora.jsx
//
// Mirrors AskTrimora.jsx's interaction pattern (type a question instead
// of clicking a filter) but wired to AutoAIService, in Auto's own
// theme rather than POS's gold/black. Four capabilities instead of
// three -- commission is genuinely supported here (unlike POS's
// version, which explicitly treats it as unsupported), since staff
// commission is one of the most useful things a car-wash admin would
// actually ask about.

import { useState } from "react";
import { getRevenueSummary, getCustomerSummary, getTopServices, getCommissionSummary, classifyQuestion } from "../lib/ai/AutoAIService";
import { STEEL, CHROME, SIGNAL, PAPER, INK } from "../pages/auto/theme";

function toKEDateStr(d) {
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

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

function money(n) {
  return "KSh " + Math.round(n || 0).toLocaleString();
}

export default function AutoAskTrimora() {
  var questionState = useState(""); var question = questionState[0]; var setQuestion = questionState[1];
  var answerState = useState(null); var answer = answerState[0]; var setAnswer = answerState[1];
  var loadingState = useState(false); var loading = loadingState[0]; var setLoading = loadingState[1];

  async function handleAsk(e) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true);
    setAnswer(null);

    var classification = classifyQuestion(question);
    var kind = classification.capability;

    if (kind === "unsupported") {
      setAnswer({
        text: "Right now I can answer questions about revenue, customers, top services, and staff commission — try asking about today, this week, or this month.",
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
          " visited " + range.label + ", " + customerSummary.newCustomerCount + " of them new.";
      }
    } else if (kind === "topServices") {
      var topResult = await getTopServices({ dateFrom: range.dateFrom, dateTo: range.dateTo, limit: 3 });
      if (!topResult) {
        text = "I couldn't fetch that right now — please try again.";
      } else if (topResult.items.length === 0) {
        text = "No completed jobs for " + range.label + " yet.";
      } else {
        text = "Top services for " + range.label + ": " +
          topResult.items.map(function (i) { return i.name + " (" + i.qty + "×)"; }).join(", ") + ".";
      }
    } else if (kind === "commission") {
      var commSummary = await getCommissionSummary({ dateFrom: range.dateFrom, dateTo: range.dateTo });
      if (!commSummary) {
        text = "I couldn't fetch that right now — please try again.";
      } else if (commSummary.byStaff.length === 0) {
        text = "No commission owed for " + range.label + " yet.";
      } else {
        var top = commSummary.byStaff[0];
        text = "Total commission owed for " + range.label + ": " + money(commSummary.totalCommission) +
          ". Top earner: " + top.name + " (" + money(top.commission) + ").";
      }
    } else {
      var summary = await getRevenueSummary({ dateFrom: range.dateFrom, dateTo: range.dateTo });
      if (!summary) {
        text = "I couldn't fetch that right now — please try again.";
      } else if (summary.jobCount === 0) {
        text = "No completed jobs for " + range.label + " yet.";
      } else {
        var topMethod = summary.byPaymentMethod[0];
        text = "You made " + money(summary.totalRevenue) + " across " + summary.jobCount +
          (summary.jobCount === 1 ? " job" : " jobs") + " for " + range.label +
          (topMethod ? ", mostly via " + topMethod.method + " (" + money(topMethod.total) + ")" : "") + ".";
      }
    }

    setAnswer({ text: text });
    setLoading(false);
  }

  return (
    <div style={{ background: STEEL, borderRadius: 14, padding: 16, marginBottom: 16, border: "1px solid " + CHROME + "33" }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: PAPER, marginBottom: 10 }}>🤖 Ask Trimora</div>
      <form onSubmit={handleAsk} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={question}
          onChange={function (e) { setQuestion(e.target.value); }}
          placeholder="e.g. how much commission is owed this week?"
          style={{
            flex: 1, borderRadius: 8, border: "1.5px solid " + CHROME + "55", padding: "9px 12px",
            fontSize: 13, fontFamily: "inherit", outline: "none", background: "rgba(255,255,255,0.04)", color: PAPER,
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "9px 16px", borderRadius: 8, border: "none", background: SIGNAL,
            color: INK, fontSize: 13, fontWeight: 800, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "..." : "Ask"}
        </button>
      </form>
      {answer && (
        <div style={{ marginTop: 12, fontSize: 13, color: PAPER, lineHeight: 1.5 }}>{answer.text}</div>
      )}
      {!answer && (
        <div style={{ marginTop: 10, fontSize: 11, color: CHROME }}>
          Try: "how much did we make today?", "how many customers this week?", "top services this month?", or "who earned the most commission?"
        </div>
      )}
    </div>
  );
}
