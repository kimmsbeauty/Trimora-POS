// src/lib/tenantScoping.test.js
//
// db.js scopes every read/write to a tenant-scoped table by salon_id,
// but which tables count as "tenant-scoped" is a hand-maintained Set
// (TENANT_TABLES) with nothing enforcing that it stays accurate. A
// table added to the live schema with a salon_id column, but never
// added to this Set, would be queried through dbDirect() with NO
// salon_id filter applied on GET and NO salon_id stamped on POST/PATCH
// -- a silent cross-tenant data leak, not a crash, so nothing would
// visibly break until a customer noticed another salon's data.
//
// This test can't safely query the live database from CI (no network
// egress to Supabase from most CI environments, and doing so would
// require live credentials in test config) -- so instead it pins a
// snapshot of every table confirmed, live, on 2026-07-07, to have a
// salon_id column (see supabase/schema_baseline/2026-07-07_baseline.md
// for how this was captured: `list_tables` verbose against the real
// project, cross-checked against db.js).
//
// WHAT THIS TEST ACTUALLY ENFORCES: if TENANT_TABLES stops containing
// every table in KNOWN_SALON_SCOPED_TABLES, this fails. It does NOT
// automatically catch a brand-new table added to the live schema after
// this snapshot was taken -- that still requires a human to re-run the
// live check (Supabase MCP `list_tables`, or `information_schema.columns
// WHERE column_name = 'salon_id'`) and update KNOWN_SALON_SCOPED_TABLES
// below whenever a schema change adds a salon_id column. Treat "does
// this table have salon_id" as a required checklist item on every
// schema-changing PR, and update this file as part of that PR.

import { TENANT_TABLES } from "./db";

// Tables confirmed live (2026-07-07) to have a salon_id column AND to
// be queried through db()/dbDirect() from the client -- i.e. they need
// TENANT_TABLES scoping to avoid a leak.
var KNOWN_CLIENT_QUERIED_SALON_SCOPED_TABLES = [
  "bookings",
  "customers",
  "expenses",
  "feedback",
  "sales",
  "services",
  "staff",
  "stock",
  "salon_pins",
  "salon_settings",
  "marketing_campaigns",
  "salon_marketing_config",
  "salon_mpesa_config",
  "marketing_messages",
  "pin_login_attempts",
  "salon_service_categories", // added 2026-07-08: was queried via db() in
                              // POSApp.jsx/BookingPage.jsx since migration 018
                              // but never registered here -- anon SELECT RLS
                              // on this table is permissive (qual: true), so
                              // this was an unfiltered cross-tenant read on
                              // the public booking page until this fix.
  "salon_enabled_modules", // added 2026-07-08 alongside migration
                           // 019_auto_module_foundation.sql -- registered
                           // in the same commit as table creation this
                           // time, not after.
];

// Tables confirmed live (2026-07-07) to have a salon_id column, but
// intentionally NOT in TENANT_TABLES because they are never queried
// through the client db() helper -- either an Edge Function writes
// them (service-role, bypasses RLS/db.js entirely), or they're
// admin-only reads gated some other way. Listed explicitly so a
// reviewer can tell "deliberately excluded" apart from "forgotten".
var KNOWN_SALON_SCOPED_BUT_NOT_CLIENT_QUERIED = [
  "salon_auth_users",       // device-auth internals, never via db()
  "salon_mpesa_payments",   // written only by mpesa-callback Edge Function
  "salon_subscriptions",    // super-admin-only, different access path
  "salon_subscription_payments",
  "pin_reset_tokens",       // admin-only, different access path
  "salon_device_secrets",   // device-auth internals, never via db()
];

// Not base tables at all -- these are views, queried through the same
// dbDirect() GET path and filtered by salon_id the same way PostgREST
// lets you filter any view. Confirmed live (2026-07-07): SECURITY
// DEFINER views exist for public_staff_directory, public_salon_directory,
// public_rating_lookup, platform_stats, salon_directory -- of those,
// only public_staff_directory is registered in TENANT_TABLES today
// (the others are queried via RPC/different paths, not dbDirect GETs).
var KNOWN_VIEWS_QUERIED_LIKE_TABLES = [
  "public_staff_directory",
];

describe("TENANT_TABLES stays in sync with the known tenant-scoped schema", () => {
  test("every table known to be salon_id-scoped AND client-queried is registered", () => {
    var missing = KNOWN_CLIENT_QUERIED_SALON_SCOPED_TABLES.filter(
      function (t) { return !TENANT_TABLES.has(t); }
    );
    expect(missing).toEqual([]);
  });

  test("TENANT_TABLES contains no unexpected entries not accounted for in either list", () => {
    var allKnown = KNOWN_CLIENT_QUERIED_SALON_SCOPED_TABLES.concat(
      KNOWN_SALON_SCOPED_BUT_NOT_CLIENT_QUERIED,
      KNOWN_VIEWS_QUERIED_LIKE_TABLES
    );
    var unexpected = Array.from(TENANT_TABLES).filter(
      function (t) { return allKnown.indexOf(t) === -1; }
    );
    // If this fails, someone added a table to TENANT_TABLES that isn't
    // in this file's snapshot -- update the snapshot (and re-verify
    // live) rather than just deleting this assertion.
    expect(unexpected).toEqual([]);
  });

  test("sanity: TENANT_TABLES is non-empty (catches an accidental wipe)", () => {
    expect(TENANT_TABLES.size).toBeGreaterThan(0);
  });
});
