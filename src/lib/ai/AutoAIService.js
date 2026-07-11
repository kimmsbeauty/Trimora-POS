// src/lib/ai/AutoAIService.js
//
// Auto's entry point for AI/business-intelligence capabilities, per
// the same TIP rule AIService.js follows: no Auto page or component
// should call the database for intelligence purposes directly --
// everything goes through here. Mirrors AIService.js's structure, but
// every capability sources from auto_jobs/auto_job_services/customers/
// staff instead of sales -- genuinely different data model, not a
// thin wrapper (see AutoLocalIntelligenceProvider.js's header comment
// for why the summarize functions couldn't be reused as-is either).
//
// classifyQuestion is local-only here (see the provider file for why),
// so there's no CLASSIFIER_PROVIDER indirection to mirror from
// AIService.js -- nothing external is ever contacted from this file.

import { db } from "../db";
import { todayStr } from "../utils";
import AutoLocal from "./AutoLocalIntelligenceProvider";

function dayBounds(dateFrom, dateTo) {
  return "completed_at=gte." + dateFrom + "T00:00:00&completed_at=lte." + dateTo + "T23:59:59";
}

async function fetchCompletedJobs(dateFrom, dateTo, select) {
  var filters = "?status=eq.completed&" + dayBounds(dateFrom, dateTo) + (select ? "&select=" + select : "");
  return await db("GET", "auto_jobs", null, filters);
}

export async function getRevenueSummary(options) {
  options = options || {};
  var dateFrom = options.dateFrom || todayStr();
  var dateTo = options.dateTo || dateFrom;

  var rows = await fetchCompletedJobs(dateFrom, dateTo);
  if (rows === null) return null;

  // Feature-parity item #8: summarizeRevenue sums whatever total_price
  // it's given (that's its whole, still-correctly-tested contract) --
  // discount is applied here, before handing rows over, rather than
  // changing that pure function's behavior.
  var discounted = rows.map(function (r) {
    return Object.assign({}, r, { total_price: (r.total_price || 0) - (r.discount_amount || 0) });
  });

  return AutoLocal.summarizeRevenue(discounted, { dateFrom: dateFrom, dateTo: dateTo });
}

export async function getCustomerSummary(options) {
  options = options || {};
  var dateFrom = options.dateFrom || todayStr();
  var dateTo = options.dateTo || dateFrom;

  var jobRows = await fetchCompletedJobs(dateFrom, dateTo, "customer_id");
  if (jobRows === null) return null;

  var customerFilters = "?created_at=gte." + dateFrom + "T00:00:00&created_at=lte." + dateTo + "T23:59:59";
  var newCustomerRows = await db("GET", "customers", null, customerFilters);
  if (newCustomerRows === null) return null;

  return AutoLocal.summarizeCustomers(jobRows, newCustomerRows, { dateFrom: dateFrom, dateTo: dateTo });
}

export async function getTopServices(options) {
  options = options || {};
  var dateFrom = options.dateFrom || todayStr();
  var dateTo = options.dateTo || dateFrom;
  var limit = options.limit || 5;

  var jobRows = await fetchCompletedJobs(dateFrom, dateTo, "id");
  if (jobRows === null) return null;
  if (jobRows.length === 0) {
    return AutoLocal.summarizeTopServices([], { dateFrom: dateFrom, dateTo: dateTo, limit: limit });
  }

  var jobIds = jobRows.map(function (j) { return j.id; }).join(",");
  var serviceRows = await db("GET", "auto_job_services", null,
    "?job_id=in.(" + jobIds + ")&select=*,auto_services(name)");
  if (serviceRows === null) return null;

  return AutoLocal.summarizeTopServices(serviceRows, { dateFrom: dateFrom, dateTo: dateTo, limit: limit });
}

export async function getCommissionSummary(options) {
  options = options || {};
  var dateFrom = options.dateFrom || todayStr();
  var dateTo = options.dateTo || dateFrom;

  // Feature-parity item #8: commission is now attributed per service
  // line (auto_job_services.staff_id/commission), not the job-level
  // assigned_staff_id/commission -- different services on the same job
  // can be credited to different people.
  var jobRows = await fetchCompletedJobs(dateFrom, dateTo, "id");
  if (jobRows === null) return null;
  if (jobRows.length === 0) {
    return AutoLocal.summarizeCommission([], {}, { dateFrom: dateFrom, dateTo: dateTo });
  }

  var jobIds = jobRows.map(function (j) { return j.id; }).join(",");
  var lineRows = await db("GET", "auto_job_services", null,
    "?job_id=in.(" + jobIds + ")&select=commission,staff_id");
  if (lineRows === null) return null;

  var staffRows = await db("GET", "staff", null, "?select=id,name");
  if (staffRows === null) return null;
  var staffById = {};
  staffRows.forEach(function (s) { staffById[s.id] = s; });

  // summarizeCommission expects job-shaped rows with commission/
  // assigned_staff_id -- lineRows already match that shape closely
  // enough (commission + a staff-id field) once renamed.
  var asJobShaped = lineRows.map(function (l) {
    return { commission: l.commission, assigned_staff_id: l.staff_id };
  });
  return AutoLocal.summarizeCommission(asJobShaped, staffById, { dateFrom: dateFrom, dateTo: dateTo });
}

export function classifyQuestion(question) {
  return AutoLocal.classifyQuestion(question);
}

export default {
  getRevenueSummary: getRevenueSummary,
  getCustomerSummary: getCustomerSummary,
  getTopServices: getTopServices,
  getCommissionSummary: getCommissionSummary,
  classifyQuestion: classifyQuestion,
};
