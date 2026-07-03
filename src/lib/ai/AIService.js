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

// Sales rows are written with an ISO ("YYYY-MM-DD") date string as of
// the todayStr() fix, and the live DB currently has zero rows in the
// older "DD/MM/YYYY" format -- but `date` is a text column compared
// lexically by the Postgrest range filter below, so a stray non-ISO
// row (e.g. from a restored backup) would silently sort wrong and
// throw off a total rather than erroring. Guard against that here:
// drop any row that doesn't match ISO before summarizing, and log
// loudly if it happens, so a future regression is visible instead of
// silently wrong -- same pattern already used for the KIMMS_SALON_ID
// fallback guard in db.js.
function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

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

  var validRows = rows.filter(function (row) { return isIsoDate(row.date); });
  var skipped = rows.length - validRows.length;
  if (skipped > 0) {
    console.error(
      "[AIService] DATA: " + skipped + " sale row(s) had a non-ISO date and were " +
      "excluded from this revenue summary to avoid a wrong total. This should never " +
      "happen post-migration -- investigate where the row came from."
    );
  }

  var provider = getActiveProvider();
  return provider.summarizeRevenue(validRows, { dateFrom: dateFrom, dateTo: dateTo });
}

export default {
  getRevenueSummary: getRevenueSummary,
};
