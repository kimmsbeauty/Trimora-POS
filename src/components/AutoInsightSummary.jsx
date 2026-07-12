// src/components/AutoInsightSummary.jsx
//
// Feature-parity item #9 follow-up: "AI Insights" per the feature
// audit meant several things (revenue/churn/inventory prediction,
// upsell, dynamic pricing, daily/weekly AI summary, health score).
// Scoped down deliberately to just the "daily/weekly AI summary" piece
// -- the rest would need real historical trend modeling, a
// meaningfully bigger and more speculative build than composing
// numbers Trimora already computes correctly.
//
// Zero new data infrastructure: this calls the same four
// AutoAIService functions AutoAskTrimora.jsx already calls when a user
// types a revenue/customer/service/commission question -- the only
// thing new here is that it runs proactively (on mount and on toggle)
// instead of waiting for a typed question, and composes all four into
// one paragraph instead of answering one capability at a time.
//
// Narrative composition lives in the component, not AutoAIService.js
// or AutoLocalIntelligenceProvider.js -- matches the existing
// convention in AutoAskTrimora.jsx, where the service layer returns
// raw structured data and the component builds the sentence.

import { useState, useEffect, useCallback } from "react";
import { getRevenueSummary, getCustomerSummary, getTopServices, getCommissionSummary } from "../lib/ai/AutoAIService";
import { rangeKeywordToDates } from "./AutoAskTrimora";
import { STEEL, CHROME, SIGNAL, PAPER, INK } from "../pages/auto/theme";

function money(n) {
  return "KSh " + Math.round(n || 0).toLocaleString();
}

function buildSummaryText(range, revenue, customers, topServices, commission) {
  if (!revenue || !customers || !topServices || !commission) {
    return "Couldn't load the summary right now — please try again.";
  }
  if (revenue.jobCount === 0) {
    return "No completed jobs for " + range.label + " yet.";
  }

  var parts = [];

  var topMethod = revenue.byPaymentMethod[0];
  parts.push(
    money(revenue.totalRevenue) + " across " + revenue.jobCount +
    (revenue.jobCount === 1 ? " job" : " jobs") + " for " + range.label +
    (topMethod ? ", mostly via " + topMethod.method : "") + "."
  );

  if (topServices.items.length > 0) {
    var top = topServices.items[0];
    parts.push("Top service: " + top.name + " (" + top.qty + "×).");
  }

  if (commission.byStaff.length > 0) {
    var topEarner = commission.byStaff[0];
    parts.push(
      "Commission owed: " + money(commission.totalCommission) +
      " (top earner: " + topEarner.name + ")."
    );
  }

  parts.push(
    customers.visitorCount + (customers.visitorCount === 1 ? " customer" : " customers") +
    " visited" + (customers.newCustomerCount > 0 ? ", " + customers.newCustomerCount + " new" : "") + "."
  );

  return parts.join(" ");
}

export default function AutoInsightSummary() {
  var rangeKeyState = useState("today"); var rangeKey = rangeKeyState[0]; var setRangeKey = rangeKeyState[1];
  var textState = useState(null); var text = textState[0]; var setText = textState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];

  var load = useCallback(async function () {
    setLoading(true);
    var range = rangeKeywordToDates(rangeKey);
    var opts = { dateFrom: range.dateFrom, dateTo: range.dateTo };

    var results = await Promise.all([
      getRevenueSummary(opts),
      getCustomerSummary(opts),
      getTopServices(Object.assign({ limit: 1 }, opts)),
      getCommissionSummary(opts),
    ]);

    setText(buildSummaryText(range, results[0], results[1], results[2], results[3]));
    setLoading(false);
  }, [rangeKey]);

  useEffect(function () { load(); }, [load]);

  return (
    <div style={{ background: STEEL, borderRadius: 14, padding: 16, marginBottom: 16, border: "1px solid " + CHROME + "33" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: PAPER }}>✨ Daily Insight</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[{ key: "today", label: "Today" }, { key: "week", label: "This week" }].map(function (r) {
            var active = r.key === rangeKey;
            return (
              <button key={r.key} onClick={function () { setRangeKey(r.key); }} style={{
                padding: "4px 10px", borderRadius: 14, border: "1.5px solid " + (active ? SIGNAL : CHROME + "55"),
                background: active ? SIGNAL : "transparent", color: active ? INK : CHROME,
                fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: 13, color: PAPER, lineHeight: 1.5, minHeight: 20 }}>
        {loading ? "Thinking…" : text}
      </div>
    </div>
  );
}
