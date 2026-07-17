# Trimora POS — Database Migrations

All schema changes run against the Supabase project `ukoccobbjeomjwjcvrma`.

## How to apply

1. Go to **Supabase → SQL Editor**
2. Open the migration file
3. Copy-paste the SQL and run it
4. Confirm "Success. No rows returned"

There is no automated migration-runner/CLI pipeline — migrations are applied
by hand, in order, via the SQL Editor. On the live database, every migration
listed below has already been run — do NOT re-run them unless you are
setting up a new Supabase project from scratch.

**Before naming a new migration file:** run `git fetch` and check
`ls supabase/migrations/` for the current highest number first. This file
has collided on duplicate numbers three times already (`009`, `015`, `029` —
see the "Renamed duplicates" note below) from concurrent sessions working in
parallel without re-checking the live file list first.

## Migration history

| File | Date added | Description |
|---|---|---|
| `001_subscription_plans.sql` | 2026-07-02 | Subscription plan prices table + Super Admin price editor |
| `002_salon_number.sql` | 2026-07-02 | Human-readable salon number (#001, #002...) |
| `003_payment_methods.sql` | 2026-07-02 | Multiple M-Pesa payment methods per salon |
| `004_public_salon_directory_v2.sql` | 2026-07-02 | Expose new payment columns to booking page |
| `005_salon_directory_v2.sql` | 2026-07-02 | Expose salon_number to Super Admin dashboard |
| `006_pin_security_bcrypt.sql` | 2026-07-02 | Upgrade PIN hashing from MD5 to bcrypt |
| `007_audit_log.sql` | 2026-07-02 | Super Admin audit trail table + RPCs |
| `008_super_admin_update_salon.sql` | 2026-07-02 | Super Admin can edit salon details directly |
| `009_feedback_unique_token.sql` | 2026-07-02 | Unique feedback/rating token per sale |
| `010_close_onboarding_bypass.sql` | 2026-07-02 | Removed a still-callable unprotected overload of `complete_salon_onboarding` |
| `011_fix_super_admin_privilege_escalation.sql` | 2026-07-02 | Moved `is_super_admin` check from self-editable `user_metadata` to `app_metadata` |
| `012_record_subscription_payment.sql` | 2026-07-03 | `record_subscription_payment` RPC |
| `013_close_admin_reset_pin_and_subscription_plans_gap.sql` | 2026-07-05 | Tightened admin PIN-reset + subscription-plan access |
| `014_harden_bookings_anon_insert.sql` | 2026-07-06 | Scoped/hardened the anon booking INSERT policy |
| `015_add_bookings_anon_update_payment_status.sql` | 2026-07-06 | Added the anon booking payment-status UPDATE policy — **superseded by migration `049`** (unscoped, exploitable via `bookings.id`'s sequential `bigint`; replaced with a phone-verified RPC) |
| `016_staff_confirmed_payments_and_mpesa_columns.sql` | 2026-07-06 | Staff payment-confirmation columns + M-Pesa fields |
| `017_sales_rep_onboarding_requests.sql` | 2026-07-06 | Sales rep onboarding-request workflow |
| `018_salon_service_categories.sql` | 2026-07-07 | Per-salon service category ordering |
| `019_auto_module_foundation.sql` | 2026-07-08 | Trimora Auto module: base schema |
| `020_auto_vehicle_management.sql` | 2026-07-08 | Auto: vehicle records |
| `021_auto_catalog_inventory.sql` | 2026-07-08 | Auto: service catalog + inventory |
| `022_auto_job_queue_bay.sql` | 2026-07-08 | Auto: job queue + bay assignment |
| `023_auto_jobs_commission.sql` | 2026-07-09 | Auto: staff commission on jobs |
| `024_auto_jobs_payment_linking.sql` | 2026-07-09 | Auto: link jobs to payment records |
| `025_lockdown_admin_definer_views.sql` | 2026-07-09 | Locked down admin-facing `SECURITY DEFINER` views |
| `026_pin_function_search_paths.sql` | 2026-07-09 | Explicit `search_path` on PIN-related functions |
| `027_fix_pgcrypto_search_path_regression.sql` | 2026-07-09 | Fixed a pgcrypto/`search_path` regression introduced by a concurrent session |
| `028_superadmin_module_management.sql` | 2026-07-10 | Super Admin: per-salon module enable/disable |
| `029_revoke_excess_feedback_anon_grants.sql` | 2026-07-10 | Revoked excess `anon` grants on feedback tables |
| `030_auto_jobs_feedback_token.sql` | 2026-07-10 | Auto: feedback/rating token on jobs |
| `031_auto_requests_manual_invite.sql` | 2026-07-10 | Auto: manual-invite onboarding path |
| `032_revoke_anon_grants_auto_onboarding_requests.sql` | 2026-07-11 | Revoked excess `anon` grants on Auto onboarding requests |
| `033_validate_invite_module_key.sql` | 2026-07-11 | Invite validation includes module key |
| `034_auto_job_services_per_line_commission_and_discount.sql` | 2026-07-11 | Auto: per-line-item commission + discount |
| `035_salon_business_type_separation.sql` | 2026-07-12 | Formal `business_type` split between Salon and Auto tenants |
| `036_wire_pin_lockout_into_verify_staff_pin.sql` | 2026-07-14 | **Critical fix:** wired the existing (previously dead) `check_pin_lockout()` into `verify_staff_pin` — brute-force lockout was client-side-only before this |
| `037_device_login_events_rate_limit.sql` | 2026-07-14 | Rate-limited device-login events (stopgap for the device-impersonation finding, superseded by `042`) |
| `038_mpesa_callback_token.sql` | 2026-07-15 | **Critical fix:** per-payment `callback_token` on M-Pesa callbacks, closing a payment-confirmation-forgery hole |
| `039_fold_auto_revenue_into_platform_stats.sql` | 2026-07-14 | Folded Auto revenue into the `platform_stats` view |
| `040_revoke_anon_grants_salon_onboarding_requests.sql` | 2026-07-16 | Revoked excess `anon` grants on `salon_onboarding_requests` (closed a live `TRUNCATE`-bypasses-RLS gap) |
| `041_drop_dead_verify_pin_for_salon.sql` | 2026-07-16 | Dropped a dead, unauthenticated-callable, unsalted-MD5 PIN-check function |
| `042_verify_pin_for_device_login.sql` | 2026-07-16 | **Critical fix:** real fix for device impersonation — PIN entry itself now establishes the device session, replacing the old `silent-device-login` trust model |
| `043_fix_pin_reset_tokens_tautological_rls.sql` | 2026-07-16 | Fixed a tautological RLS policy on `pin_reset_tokens` (checked "is authenticated at all," not tenant ownership) |
| `044_revoke_anon_public_grants_admin_functions.sql` | 2026-07-16 | Defense-in-depth: revoked unnecessary `anon`/`PUBLIC` execute on 12 admin-facing functions already gated internally |
| `045_revoke_anon_public_grant_reset_salon_pin.sql` | 2026-07-16 | Follow-up `PUBLIC` grant revoke missed by `044`'s first pass |
| `046_rls_stock_log_stock_movements.sql` | 2026-07-02 | *(renamed from duplicate `009_rls_stock_log_stock_movements.sql`, see below)* — RLS on `stock_log`/`stock_movements` |
| `047_allow_anon_payment_status_update.sql` | 2026-07-06 | *(renamed from duplicate `015_allow_anon_payment_status_update.sql`, see below)* — historical anon payment-status policy, **now closed by migration `049`** |
| `048_superadmin_auto_health_and_analytics.sql` | 2026-07-10 | *(renamed from duplicate `029_superadmin_auto_health_and_analytics.sql`, see below)* — Super Admin Auto health/analytics views |
| `049_claim_booking_payment_status_rpc.sql` | 2026-07-16 | **Security fix:** replaced the unscoped anon `bookings` payment-status UPDATE policy (exploitable via `bookings.id`'s sequential `bigint`) with `claim_booking_payment_status`, a phone-verified RPC |
| `050_scope_staff_directory_lookup.sql` | 2026-07-16 | **Security fix:** replaced the unscoped `public_staff_directory` view (anon-readable, zero row filtering — any caller could enumerate every tenant's staff) with `staff_directory_lookup`, requiring `p_salon_id` as a mandatory argument |
| `051_void_auto_invoice.sql` | 2026-07-17 | **Feature fix:** added `void_auto_invoice` RPC + `voided_at`/`void_reason` columns. `auto_invoices.status`'s CHECK constraint has allowed `'void'` since the table was created, but no RPC or UI ever implemented it |

### Renamed duplicates

Three migration numbers were used twice by concurrent sessions before either
noticed: `009`, `015`, and `029`. Rather than renumber everything after them
(which would just create new confusion about what ran when), the second file
in each pair was renamed to the next free number at the end of the sequence,
keeping its original content and history intact:

- `009_rls_stock_log_stock_movements.sql` → `046_rls_stock_log_stock_movements.sql`
- `015_allow_anon_payment_status_update.sql` → `047_allow_anon_payment_status_update.sql`
- `029_superadmin_auto_health_and_analytics.sql` → `048_superadmin_auto_health_and_analytics.sql`
- `053_scope_rating_lookups_by_token.sql` → `055_scope_rating_lookups_by_token.sql` *(a second, independent `053` collision — see the RECURRING PATTERN note below)*

If you're setting up a fresh database from these files, run them in the
numeric order shown above (the renamed files' *content* still reflects when
they were originally written, not the number they now carry).

**RECURRING PATTERN, read before naming your next migration:** this has now
happened twice (`009`/`015`/`029` in one batch, `053` independently a week
later) from different concurrent sessions each picking the next number
without re-checking the live file list first. If you're about to name a
migration file, run `git pull && ls supabase/migrations/ | sort | tail -5`
immediately before choosing a number — don't trust what a summary or an
earlier turn in your own conversation told you the highest number was.

## RPCs in supabase/sql/ (also already run)

| File | Description |
|---|---|
| `super_admin_reset_pin.sql` | Super Admin can reset any salon's PIN |
| `super_admin_update_salon.sql` | Full version with comments |
| `audit_log.sql` | Full version with comments |

## Migrations 051-055 (2026-07-17)

| File | Description |
|---|---|
| `051_void_auto_invoice.sql` | **Feature fix:** `void_auto_invoice` RPC + `voided_at`/`void_reason` columns. `auto_invoices.status`'s CHECK constraint allowed `'void'` since the table was created, but no RPC/UI ever implemented it. |
| `052_anon_read_salon_enabled_modules.sql` | **Production bug fix:** `salon_enabled_modules` had RLS enabled with an `authenticated`-only policy, but `AutoApp.jsx`'s `ModuleGate` checks it pre-login (as `anon`) by design. Every salon with Auto enabled was showing "Trimora Auto isn't turned on" to every visitor, regardless of actual state. Added the missing `anon` SELECT policy. |
| `053_scope_public_services_and_categories_lookup.sql` | **Security fix:** replaced unscoped anon `SELECT` on `services`/`salon_service_categories` (zero row filtering, scrapeable platform-wide price list) with `public_services_lookup(p_salon_id)` / `public_service_categories_lookup(p_salon_id)` RPCs. |
| `054_drop_dead_tables_device_login_events_stock_movements.sql` | **Cleanup:** dropped `device_login_events` (dead since the real PIN-first login fix replaced the code that used it) and `stock_movements` (correctly RLS-scoped per migration `046`, but confirmed 0 rows, never written to). `stock_log` and `products` were deliberately left alone — both have real historical data, dropping either is a product decision, not dead-code removal. |
| `055_scope_rating_lookups_by_token.sql` *(renamed from a second, independent `053`)* | **Security fix:** replaced unscoped anon `SELECT` on `public_rating_lookup`/`public_auto_job_rating_lookup` (zero row filtering — anyone could pull every feedback token/client name/visit date platform-wide) with `rating_lookup_by_token(p_token)` / `auto_job_rating_lookup_by_token(p_token)` RPCs. |

## Notes

- `public_salon_directory` — anon-readable, used by booking page and DeviceGate. Also now exposes `subscription_plan`/`subscription_status`/`subscription_expires_at` — `amount_paid` deliberately excluded, that stays super-admin-only via `salon_directory`.
- `salon_directory` — authenticated + super-admin-gated, used by Super Admin only.
- `public_staff_directory` (the view) is no longer anon/authenticated-readable as of migration `050` — use the `staff_directory_lookup(p_salon_id)` RPC instead.
- `bookings`'s anon payment-status transition is no longer a raw RLS-gated UPDATE as of migration `049` — use the `claim_booking_payment_status(p_booking_id, p_phone, p_new_status)` RPC instead.
- `services`/`salon_service_categories` are no longer anon-readable directly as of migration `053` — use `public_services_lookup(p_salon_id)` / `public_service_categories_lookup(p_salon_id)` instead. Authenticated staff access (POSApp.jsx) is untouched — those tables correctly remain in `db.js`'s `TENANT_TABLES`.
- `public_rating_lookup`/`public_auto_job_rating_lookup` are no longer anon-readable directly as of migration `055` — use `rating_lookup_by_token(p_token)` / `auto_job_rating_lookup_by_token(p_token)` instead.
- `device_login_events` and `stock_movements` no longer exist as of migration `054` (dropped, confirmed dead).
- **Refund reconciliation** (2026-07-17, no migration file — frontend-only, `src/pages/auto/ReportsPage.jsx`'s `processRefund`): a refund on a job now credits back any `wallet_amount_used` proportionally via the existing `apply_wallet_transaction` RPC, and reverts any `auto_referrals` reward this job redeemed back to `pending` on a **full** refund only (mirrors the existing full-refund-only stock restoration). Membership needed no equivalent fix — `customer_memberships` has no per-visit usage counter, it's a time-window unlimited-use benefit, so there's nothing to "give back" on a refund.
- All admin-facing RPCs use `SECURITY DEFINER` + a JWT `is_super_admin` (`app_metadata`) check, verified directly against every such function's source as of 2026-07-16 — none trust a client-passed `salon_id` as authorization.
- PIN hashing: bcrypt (work factor 10) via pgcrypto. Legacy MD5 rows
  auto-upgrade to bcrypt on next successful login.
- **`REVOKE` gotcha:** this project has a default-privileges rule that grants `EXECUTE` on new functions directly to `anon`/`authenticated` at creation time, **independent of `PUBLIC`** — confirmed live on 2026-07-17 while writing migration `051` (a `REVOKE ... FROM PUBLIC` alone left `anon` still holding `EXECUTE` on a function that was never meant to be anon-callable). Postgres also grants `EXECUTE`/`SELECT` to `PUBLIC` by default at creation time as a *separate* mechanism, and a revoke naming only `PUBLIC` can silently do nothing if a role holds a grant through `PUBLIC` inheritance rather than a direct one. **Net effect: always revoke from `anon` explicitly** (not just `PUBLIC`) for anything not meant to be anon-callable, and verify afterward via `information_schema.role_routine_grants` / `role_table_grants` — don't assume a migration's `REVOKE` succeeded just because it ran without error. (This bit migration `044`'s first attempt for the `PUBLIC` case, and `051` for the direct-`anon`-grant case — two different mechanisms, same lesson: verify, don't assume.)
- Beyond migration numbering, there is still no automated migration-runner — this file is the only source of truth for what's been applied and in what order. Keep it updated when adding new migrations.
