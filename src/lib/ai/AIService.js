// src/lib/ai/AIService.js
//
// The single entry point for AI/business-intelligence capabilities.
// Per the TIP design: no page, component, or future product should
// ever import a provider or call the database for intelligence
// purposes directly -- everything goes through here.
//
// AIService owns data-fetching (via the existing, already-tenant-scoped
// db() from lib/db.js -- reused, not duplicated, per the "existing code
// first" rule) and hands the raw rows to whichever provider is active.
// The provider only ever does computation on data it's given, which is
// what keeps Local Intelligence and a future paid LLM provider
// interchangeable behind the same interface.

import { db } from "../db";
import { todayStr } from "../utils";
import { getActiveProvider } from "./ProviderManager";

// Capability: revenue summary for a date range (defaults to today).
// Tenant scoping is automatic -- db() applies the caller's own
// salon_id under the hood, the same way every other query in the app
// does, so this can never be pointed at another salon's data.
export async function getRevenueSummary(options) {
  options = options || {};
  var dateFrom = options.dateFrom || todayStr();
  var dateTo = options.dateTo || dateFrom;

  var filters = "?date=gte." + dateFrom + "&date=lte." + dateTo;
  var rows = await db("GET", "sales", null, filters);
  if (rows === null) {
    return null;
  }

  var provider = getActiveProvider();
  return provider.summarizeRevenue(rows, { dateFrom: dateFrom, dateTo: dateTo });
}

export default {
  getRevenueSummary: getRevenueSummary,
};
