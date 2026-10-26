// src/pages/pet/overviewLoader.js
//
// Data access for the Overview dashboard. Read-only: every query is a plain GET through
// db(), which injects the signed-in business's tenant filter (same path every other Pet
// screen uses). Writes (status changes) happen in OverviewPage through the existing
// pet_* database functions, never here.
//
// db() returns null when a request fails, which is an error, not "no data". The
// queries the headline numbers depend on are CRITICAL: if one fails the whole page
// shows an error with a retry. The rest only feed one section each; if one of those
// fails, the page still loads and that section says it couldn't load.
import { db } from "../../lib/db";
import { loadWindow } from "./overviewData";
import { windowsFromRows } from "./petData";

function q(table, query) { return db("GET", table, null, query); }

export async function loadOverview(now) {
  var w = loadWindow(now);
  var critical = await Promise.all([
    // today plus the previous 7 days, so unfinished older bookings can be flagged
    q("pet_bookings", "?select=*,pet_booking_services(*)&starts_at=gte." + w.issuesFrom + "&starts_at=lt." + w.dayEnd + "&order=starts_at.asc&limit=1000"),
    q("pet_boarding_stays", "?select=*&status=in.(reserved,occupied)&order=check_out_on.asc&limit=500"),
    q("pet_invoices", "?select=*&status=in.(issued,partial)&order=issued_at.desc&limit=2000"),
    q("pet_payments", "?select=id,invoice_id,amount,method,paid_at&paid_at=gte." + w.weekAgo + "&order=paid_at.desc&limit=1000"),
    q("customers", "?select=id,name&order=name.asc&limit=2000"),
    // select=* on purpose: archived_at exists only once migration 097 is applied, and naming a missing column
    // would fail this critical query. With * the field is simply absent until then.
    q("pet_pets", "?select=*&order=name.asc&limit=5000"),
    q("staff", "?select=id,name,active&order=name.asc&limit=500"),
    q("pet_kennels", "?select=id,name,maintenance&order=name.asc&limit=500"),
  ]);
  if (!critical.every(Array.isArray)) return { ok: false };

  var optional = await Promise.all([
    q("pet_bookings", "?select=id,pet_id,customer_id,status,created_at,updated_at&updated_at=gte." + w.weekAgo + "&order=updated_at.desc&limit=20"),
    q("pet_boarding_stays", "?select=id,pet_id,status,checked_in_at,checked_out_at&updated_at=gte." + w.weekAgo + "&order=updated_at.desc&limit=20"),
    q("pet_invoices", "?select=id,invoice_number,total,status,issued_at&issued_at=gte." + w.weekAgo + "&order=issued_at.desc&limit=20"),
    q("pet_customer_profiles", "?select=customer_id,created_at&created_at=gte." + w.weekAgo + "&order=created_at.desc&limit=10"),
    // select=* so record_type (migration 098) comes through when it exists and is absent when it doesn't.
    q("pet_vaccinations", "?select=*&limit=5000"),
    q("pet_items", "?select=id,name,active,quantity_on_hand,reorder_level&active=eq.true&limit=3000"),
    // Per-type "due soon" windows (migration 098). No table or no rows = the app default window.
    q("pet_reminder_settings", "?select=record_type,warn_days"),
    // Refunds paid back in the last week (migration 105); today's are subtracted from today's revenue.
    q("pet_refunds", "?select=id,invoice_id,amount,method,refunded_at&refunded_at=gte." + w.weekAgo + "&order=refunded_at.desc&limit=500"),
  ]);
  var names = ["recentBookings", "recentStays", "recentInvoices", "recentProfiles", "vaccinations", "items", "reminderWindows", "refunds"];
  var failed = {}; var extra = {};
  optional.forEach(function (res, i) { if (Array.isArray(res)) extra[names[i]] = res; else { extra[names[i]] = []; failed[names[i]] = true; } });

  return {
    ok: true, today: w.todayKey, failed: failed,
    bookings: critical[0], stays: critical[1], invoices: critical[2], payments: critical[3],
    customers: critical[4], pets: critical[5], staff: critical[6].filter(function (s) { return s.active !== false; }), kennels: critical[7],
    recentBookings: extra.recentBookings, recentStays: extra.recentStays, recentInvoices: extra.recentInvoices,
    recentProfiles: extra.recentProfiles, vaccinations: extra.vaccinations, items: extra.items, refunds: extra.refunds,
    // A failed or missing settings read falls back to the default window; it is not reported as a failed
    // section, because before 098 is applied that table legitimately doesn't exist.
    windows: windowsFromRows(extra.reminderWindows),
  };
}
