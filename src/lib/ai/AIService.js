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

// Fetches sales for a date range and applies the ISO-date guard above.
// Shared by every capability that needs sales rows, so the guard only
// lives in one place.
async function fetchValidSales(dateFrom, dateTo) {
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
      "excluded from this result to avoid a wrong total. This should never " +
      "happen post-migration -- investigate where the row came from."
    );
  }
  return validRows;
}

// Capability: revenue summary for a date range (defaults to today).
// Tenant scoping is automatic -- db() applies the caller's own
// salon_id under the hood, the same way every other query in the app
// does, so this can never be pointed at another salon's data.
export async function getRevenueSummary(options) {
  options = options || {};
  var dateFrom = options.dateFrom || todayStr();
  var dateTo = options.dateTo || dateFrom;

  var validRows = await fetchValidSales(dateFrom, dateTo);
  if (validRows === null) {
    return null;
  }

  var provider = getActiveProvider();
  return provider.summarizeRevenue(validRows, { dateFrom: dateFrom, dateTo: dateTo });
}

// Capability: how many distinct customers visited, and how many are
// brand new, over a date range (defaults to today).
export async function getCustomerSummary(options) {
  options = options || {};
  var dateFrom = options.dateFrom || todayStr();
  var dateTo = options.dateTo || dateFrom;

  var salesRows = await fetchValidSales(dateFrom, dateTo);
  if (salesRows === null) {
    return null;
  }

  var customerFilters = "?created_at=gte." + dateFrom + "T00:00:00&created_at=lte." + dateTo + "T23:59:59";
  var customerRows = await db("GET", "customers", null, customerFilters);
  if (customerRows === null) {
    return null;
  }

  var provider = getActiveProvider();
  return provider.summarizeCustomers(salesRows, customerRows, { dateFrom: dateFrom, dateTo: dateTo });
}

// Capability: best-selling items (services + products) over a date
// range (defaults to today).
export async function getTopItems(options) {
  options = options || {};
  var dateFrom = options.dateFrom || todayStr();
  var dateTo = options.dateTo || dateFrom;
  var limit = options.limit || 5;

  var salesRows = await fetchValidSales(dateFrom, dateTo);
  if (salesRows === null) {
    return null;
  }

  var provider = getActiveProvider();
  return provider.summarizeTopItems(salesRows, { dateFrom: dateFrom, dateTo: dateTo, limit: limit });
}

export default {
  getRevenueSummary: getRevenueSummary,
  getCustomerSummary: getCustomerSummary,
  getTopItems: getTopItems,
};
