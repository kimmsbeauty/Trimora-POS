# Trimora Systems — Project Handover Report
**Prepared:** 2026-07-17 | **Covers:** Trimora POS (salon/barbershop) + Trimora Auto (car wash) + Super Admin console + public booking/marketing pages
**Repo state as of this report:** `main` @ `9efe041`, all changes below pushed and deployed to production and verified live (build clean, 0 vulnerabilities, 187/187 tests passing, re-confirmed against this exact commit before this report was finalized).

**Note on authorship:** this report covers work from at least three concurrent/sequential sessions on this repo this same day, identifiable by distinct git author identities: this session (`Claude (Trimora session) <claude@trimora.dev>`), and at least two others (`Claude (session) <dev@trimorasystems.com>` and `Claude (session) <claude-session@trimorasystems.com>`). Sections 7.1–7.8 and 7.10 describe this session's own work firsthand; §7.11 and the closing items folded into §8/§9 were completed by the other sessions and are described here based on reading their commits and migration files directly, not firsthand execution — flagged inline where relevant. Deployment status for every commit referenced below was independently re-confirmed via the Vercel API at report-finalization time, not assumed from commit messages alone.

This document is the single source of truth for resuming work on this project. It supersedes the three prior handover docs in the repo root (`trimora_handover_2026-07-08.md`, `trimora_auto_handover_2026-07-09.md`, `trimora_security_handover_2026-07-16.md`) for anything they overlap with — those are kept for historical detail but this document reflects current, live-verified state.

---

## 1. What This Project Is

Trimora Systems is a Kenyan multi-tenant SaaS platform. One codebase serves two distinct product lines, distinguished by a `business_type` column (`'salon'` or `'auto'`) on the `salons` table:

- **Trimora POS** — salon/barbershop management: sales, bookings, staff/commissions, inventory, customers, marketing, loyalty.
- **Trimora Auto** — car wash management: bay/job queue, vehicle check-in, staff commissions, memberships, coupons, referrals, wallet, invoicing, fleet accounts, tax/VAT, reports.

Both are managed platform-wide from a single **Super Admin console** (salon onboarding/approval, subscription billing, module enablement, platform-wide analytics and combined P&L, audit log, health monitoring).

A separate public-facing booking page and a separate marketing site (different repo) round out the product.

---

## 2. Access Points & Resources

| Resource | Value |
|---|---|
| **GitHub repo** | `github.com/kimmsbeauty/Trimora-POS`, branch `main` |
| **Supabase project (this app)** | `ukoccobbjeomjwjcvrma` ("kimmsbeauty"), region `eu-west-1` |
| **Supabase project (marketing site)** | `tvzbtyggphxqnstuxllp` ("Trimora Systems"), region `eu-west-1` — **separate repo**, not covered by this document |
| **Vercel team** | `kimms-beauty-s-projects` |
| **Vercel project** | `prj_AjqWaTmlGNW1xEQcqJz9EiRhb67m` (name: `trimora-pos`) |
| **Production domains** | `trimora-pos.vercel.app`, `kimmsbeauty-nvs1.vercel.app`, `trimora-pos-kimms-beauty-s-projects.vercel.app` |
| **CI** | GitHub Actions, `.github/workflows/ci.yml` — build + test on every push/PR to `main` |
| **Other handover docs in repo root** | `trimora_handover_2026-07-08.md`, `trimora_auto_handover_2026-07-09.md`, `trimora_security_handover_2026-07-16.md`, `trimora_pos_full_inventory_2026-07-16.md` (full page/component/API catalog — useful reference, not duplicated here) |

**Working discipline established across every session on this repo (follow these):**
- **Greenlight Policy** — nothing built without explicit product-owner sign-off; large tasks broken into sub-phases approved one at a time.
- **Live-verification-first** — re-check GitHub/Supabase/Vercel state directly before acting; never trust a prior session's or handover doc's claims without re-verifying against the live system.
- **`git fetch` + drift check immediately before every commit AND immediately before every push** — multiple AI sessions push to this repo unannounced, sometimes concurrently. This has caused real collisions (see §7.9).
- One logical change per commit; mechanical refactors and behavior changes are never mixed in the same commit.
- `npm run build` and `npm run test` before and after every change.
- GitHub PATs are provided per-push, verified first (`curl -H "Authorization: token <PAT>" https://api.github.com/user`), embedded in the remote URL only for the push itself, then immediately stripped back out (`git remote set-url origin https://github.com/kimmsbeauty/Trimora-POS.git`). **Several PATs from recent sessions were reused across multiple pushes rather than revoked promptly — see §8, this needs cleanup.**

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18.2.0, React Router 6.30.4 |
| **Build tool** | **Vite 7.3.6** (migrated from Create React App / react-scripts@5.0.1 on 2026-07-17 — see §7.10) |
| Test runner | **Vitest 4.1.10** (migrated from Jest/react-scripts test on 2026-07-17) + React Testing Library |
| Backend | Supabase (Postgres 17, Auth, Edge Functions, Storage) |
| Data access | Hand-rolled `fetch`-based wrapper (`src/lib/db.js`), **not** `supabase-js` (removed as a dead dependency earlier this project) |
| Hosting | Vercel |
| Payments | M-Pesa Daraja (STK push + callback), manual Cash/Card/Send Money |
| Charts | Recharts |
| Other notable deps | `qrcode` (QR generation) |

**Node version:** `^20.19.0 || >=22.12.0` (required by Vite 7 — this is a hard requirement, not a suggestion; CI and `package.json engines` are both already set correctly. Vercel's own project is on Node 24.x, already compatible).

---

## 4. Project Structure

```
src/
  pages/
    POSApp.jsx                    — salon POS shell (1,271 lines, down from 1,898)
    pos/                          — 8 extracted POS view components
      StaffView, ServicesView, InventoryView, ShareView,
      AppointmentsView, CustomersView, MarketingView, CheckoutView
    SuperAdminDashboard.jsx       — super admin shell (1,604 lines, down from 2,689)
    superadmin/                   — 11 extracted super admin view components
      AuditView, AutoAuditView, AutoHealthView, HealthView, PlansView,
      AutoAnalyticsView, AnalyticsView, RequestsView, CarWashesView,
      AutoRequestsView, DetailView, CombinedPLView
    AutoApp.jsx                   — car wash shell
    auto/                         — car wash sub-pages
      BoardPage, CheckInPage, CustomersPage, ServicesPage, StaffPage,
      ReportsPage, ExpensesPage, AutoSettingsPage, AutoMarketingPage, theme.js
    BookingPage.jsx                — public booking wizard (customer-facing, no auth)
    LoginPage.jsx                  — PIN-first device login (rewritten 2026-07-16)
    OnboardingPage.jsx, TrimoraLandingPage.jsx, RatingPage.jsx,
    AutoRatingPage.jsx, ReviewsPage.jsx, SalesRep*.jsx, SuperAdmin*.jsx, etc.
  lib/
    db.js                          — TENANT_TABLES-aware fetch wrapper, salon_id injection
    constants.js                   — SUPABASE_URL/KEY (now via import.meta.env.VITE_*)
    deviceAuth.js                  — device session persistence (30-day), PIN-gated
    superAdminAuth.js              — super admin session/token handling
    salonHealth.js                 — shared analytics/health-flag pure functions
    salonContext, pwaManifest, registerServiceWorker, ai/ (AI assistant providers)
  components/                      — shared UI (ErrorBoundary, AskTrimora, MpesaPaymentModal, etc.)
supabase/
  migrations/                      — 56 files as of this report
  functions/                       — Edge Functions (device-pin-login, silent-device-login [deprecated],
                                      mpesa-stk-push, send-marketing-message, mpesa-callback, etc.)
vite.config.js                     — Vite + Vitest config (see §7.10 for why it looks the way it does)
index.html                         — moved to project root as part of the Vite migration
.github/workflows/ci.yml           — build + test on push/PR
```

---

## 5. Current Implementation Status

### 5.1 Trimora POS (salon/barbershop) — feature-complete, in active use
Sales, customers, bookings, staff/commissions, inventory, WhatsApp reminders, role-based access (staff PIN vs admin PIN), feedback/ratings, loyalty, analytics, marketing (automated messages + broadcast), AI assistant ("Ask Trimora"). Multi-tenant via `salon_id` on every table, slug-based routing, device-level Supabase Auth underneath the PIN system.

### 5.2 Trimora Auto (car wash) — feature-complete, built out across Phases 0–6
Bay/job queue with priority sorting, vehicle check-in + photo gallery, staff assignment and commission tracking, services/pricing, customers with birthday reminders and history, membership plans, coupons, referral tracking, customer wallet (top-up/credit), split payments (any two methods) + refunds (full/partial, cascading), draft invoices (numbered, pay-later/fleet), invoice void + refund reconciliation, fleet vehicles + damage inspection, tax/VAT settings + reports, receipt customization, expenses, reports (on-screen jobs detail + revenue), M-Pesa STK-push integration, settings (branding, PIN management, subscription, contact/payment methods).

### 5.3 Super Admin console — feature-complete, recently restructured
Salon/car-wash onboarding and approval workflow, sales-rep invite/management, subscription plan management + payment recording, module enablement (per-salon Auto module toggle), platform-wide stats (now correctly includes Auto revenue — see §7.1), Combined P&L (salon + auto, platform-wide, added by a parallel session), health monitoring (flags salons needing attention), audit log, suspend/reactivate salons, per-salon detail page with payment history and PIN reset.

**Architecturally, `SuperAdminDashboard.jsx` and `POSApp.jsx` were both god-components that have now been fully split** into props-driven presentational view components (see §7.2–§7.6, §7.8). Both parent files now own only state, handlers, and (for `SuperAdminDashboard.jsx`) the default salons-list view.

### 5.4 Public-facing pages — feature-complete, recently hardened
Booking wizard (`BookingPage.jsx`), landing page, rating pages, terms. As of this session, the public booking flow's data access (staff, services, service categories) is fully scoped through mandatory-`salon_id` RPCs rather than raw anon-readable tables — see §7.7.

---

## 6. Tested / Verified Functionality

- **187 automated tests across 19 test files**, all passing, running under Vitest (migrated from Jest — see §7.10). Covers: tenant-filter/body-injection protection in `db.js`, checkout flow (POS), booking integration flow (public), sale/cart math, loyalty logic, AI provider logic, salon health/analytics pure functions, color/slug/util helpers, the payment-recording regression, the suspend-modal regression, tenant scoping.
- **CI runs build + test on every push/PR to `main`** (added by a parallel session 2026-07-17, updated by this session for the Vite/Vitest command change and Node version bump).
- **Live, human-tested**: the new PIN-first login flow was manually tested end-to-end by the product owner on a real device — normal login, wrong-PIN handling, server-side lockout (5 failed attempts / 15-minute window, confirmed against the actual `check_pin_lockout` function), lockout expiry, and 30-day device persistence all confirmed working. This was the explicit prerequisite for deprecating `silent-device-login` (§7.5).
- **Live-verified via direct SQL/API checks, not just code review**: the auto-revenue fix (§7.1), the subscription-payment fix (§7.4), every RLS/grant change this session (re-queried `pg_policies`/`information_schema.routine_privileges` after every migration, never trusted a migration's "success" response alone), the Vite production build (deployed and confirmed `READY` in Vercel, screenshot-confirmed by the product owner loading the actual landing page on the preview URL before merge).

---

## 7. This Session's Work (chronological, with rationale)

### 7.1 Fixed: Auto revenue missing from platform-wide stats
`platform_stats` and `salon_directory` views computed `total_revenue`/`total_sales`/`sale_count` only from the `sales` table, which predates the Auto module — car-wash revenue lives in `auto_jobs.total_price` entirely. Any `business_type='auto'` salon showed KES 0 despite real, paid business. Confirmed live against "High point carwash": 8 completed, paid jobs totaling KES 8,100, invisible in platform-wide figures. Fixed by folding `auto_jobs` (status='completed' AND payment_status='paid') into both views' existing columns. Migration `039`.

### 7.2 Refactored: `SuperAdminDashboard.jsx` split (4 batches)
2,689 → 1,604 lines (a later, unrelated commit — `4bc4e45`, §7.8 — trimmed a further 33 lines of dead code). All 11 conditional view branches extracted into `src/pages/superadmin/*.jsx` as props-driven components, using script-based byte-for-byte extraction (diffed to zero against the original before wiring in) rather than retyping — matching the precedent already set for `POSApp.jsx`. Batches: (1) Audit/AutoAudit/AutoHealth, (2) Health/Plans/AutoAnalytics/Analytics, (3) Requests/CarWashes/AutoRequests, (4) Detail. Batch 3 had to be redone once mid-session after a drift check caught a parallel session landing a new "Combined P&L" nav button in the exact block being extracted — re-extracted fresh rather than silently dropping it.

### 7.3 Discovered mid-refactor, real bug: Detail view's block boundary
While extracting the `detail` view, discovered its `if` block actually closed ~1,300 lines earlier than assumed — meaning several modals (payment, suspend) whose *trigger* buttons live on the detail page were rendering their actual JSX in a **completely different, unreachable render tree** (the default salons-list view). This is the root cause behind §7.4 and §7.6.

### 7.4 Fixed: Subscription payments were completely unrecordable
Reported live symptom investigated and confirmed via SQL before any code was touched: `salon_subscription_payments` had **zero rows in its entire history**. Two stacked bugs:
1. **Structural** — `setPaymentModal(s)` (the only call that opens the modal) was exclusively in the detail page, but the modal's JSX rendered in the unrelated default-view tree (see §7.3). Fixed by relocating the modal JSX into the detail view's own return.
2. **`.price` vs `.price_kes`** — the payment modal's `<select>` options read `plan.price` (undefined) and called `.toLocaleString()` on it directly in a `.map()` render callback, which throws. Every other usage in the file correctly used `plan.price_kes`. Fixed at all three call sites.

Added `SuperAdminDashboard.recordPayment.test.jsx`, a full RTL render through the actual click path, with a local error boundary as a regression safety net.

### 7.5 Fixed: `silent-device-login` deprecated — audit Critical-1 fully closed
This Edge Function minted a real Supabase Auth session from nothing but a public `salon_id`, no proof of identity. Confirmed still live and still vulnerable (contradicting an earlier "frontend-dead" claim that turned out to be only half-true — the orphaned JS wrapper that called it was genuinely dead, but the endpoint itself was still deployed). Deployed a replacement that unconditionally returns `410 Gone`, with all original session-minting logic removed entirely, not just gated behind a conditional. Also removed the dead `silentDeviceLogin` wrapper from `deviceAuth.js`. This was only done **after** the PIN-first login flow's real device test (§6) confirmed working, per the prerequisite the original security handover explicitly stated.

**Caveat, be aware:** this deployment could not be independently HTTP-verified from the sandbox (`web_fetch` and the Vercel/Supabase MCP fetch tools were blocked — see §8). The `deploy_edge_function` call itself returned a clean success with an incremented version number, which is the strongest signal available, but a direct `curl` against the live endpoint by a human would be a reasonable belt-and-suspenders check if anyone wants full certainty.

### 7.6 Fixed: Suspend-salon modal — identical bug to §7.4
Same root cause as the payment modal: `setSuspendModal(s)` only ever called from the detail page, JSX rendering in the unreachable default-view tree. Fixed the same way (relocated JSX into `DetailView`'s own return). Added `SuperAdminDashboard.suspendModal.test.jsx`.

### 7.7 Fixed: Unscoped anon SELECT on `services` and `salon_service_categories`
Both had `qual: true` RLS policies — any unauthenticated caller could bypass the app's own client-side `salon_id` filter and dump every salon's complete service catalog and pricing (or category list) in one PostgREST call. A prior session had deliberately left this open, reasoning "no cross-tenant data risk" — the product owner disagreed (competitive-intelligence exposure, and inconsistent with the identical pattern being closed the same week for `staff`/`bookings` on weaker reasoning). Fixed with the same pattern already established (`staff_directory_lookup`): two new mandatory-`p_salon_id` RPCs, `public_services_lookup` and `public_service_categories_lookup`, replacing the unscoped policies. `BookingPage.jsx` updated to call them. This also surfaced and required updating 3 test-mock gaps in `BookingPage.integration.test.jsx`, and required genuinely rewriting one test whose premise (services load regardless of `salon.id`) was no longer true — correctly so, since services now share the same defensive posture as staff lookup.

### 7.8 Cleaned up: duplicate `loadPlans` / dead `savePlanPrice`
Two `loadPlans` function declarations existed in `SuperAdminDashboard.jsx` (JS silently keeps only the second — the first, which toggled a `plansLoading` state still read by `PlansView.jsx`, was entirely dead, so that loading indicator silently never appears). Also removed `savePlanPrice`, a near-duplicate of the actually-used `updatePlanPrice` with zero callers anywhere. Looks like a parallel-session merge artifact. Pure dead-code removal, zero behavior change to what survives.

### 7.9 Recurring theme: migration numbering collisions from parallel sessions
Happened at least four times across this day (`036`, `039`/`051`, and `053` twice — `036` and `039` from this session's own earlier pushes, `053` collided independently twice more from a parallel session). Each time, resolved by renumbering the newer file rather than the one already merged, re-verifying no logical (not just filename) collision existed first. **The last `053` collision (`053_scope_public_services_and_categories_lookup.sql` from this session vs. `053_scope_rating_lookups_by_token.sql` from a parallel session) was resolved by the other session** (commit `b3d8479`) — the rating-lookups file was renumbered to `055`. The migrations `README.md` now has an explicit note about checking the live file list before naming the next migration, to reduce recurrence.

### 7.11 Also landed this same day by a parallel session (not this session's own work, verified by reading the commits/migrations directly)
- **`727c63f` — Fixed a real gap in this session's own Vite migration.** Client-side routing (React Router) needs a catch-all rewrite to `index.html` for any non-root URL to work on a static host — CRA's Vercel preset handled this implicitly; Vite's does not, and this was missed during the Vite migration work in §7.10. Added `vercel.json` with a `/(.*) → /index.html` rewrite rule. **Worth independently confirming this actually works in production** (e.g., loading a deep link like `/some-salon/pos` directly rather than navigating to it from the root) — logic-reviewed here, not click-tested by this report's author.
- **`b3d8479` — Stale comment fix** in `constants.js` (still referenced `REACT_APP_SUPABASE_URL`/`KEY` in a comment after the Vite migration renamed the actual env vars — code was already correct, just the comment). Also resolved the `053` collision above, and added `README.md` entries for migrations `051`–`055`.
- **`9efe041` — Dropped the two remaining dead tables** (`products`, `stock_log`) that this report originally listed as "needs a product decision, not touched." Investigated properly first, not a unilateral call: neither table has a `salon_id` column (both predate the multi-tenant migration entirely), neither appears in `db.js`'s `TENANT_TABLES`, zero references to `stock_log` anywhere in `src/`, and the row content itself was confirmed to be pre-multi-tenant test/seed data rather than real business records (`products` — a generic 10-item retail catalog with sequential IDs; `stock_log` — 20 rows all written within an 18-minute window on 2026-06-14, all `reason='ADJUSTMENT'`, several referencing a `product_id` that was never in `products` — manual UI click-testing, not a real inventory trail). **Both exported to CSV before dropping** (`products_archive_2026-07-17.csv`, `stock_log_archive_2026-07-17.csv`). This closes out item 4 in the original open-issues list from the 2026-07-16 security handover.

### 7.10 Migrated: Create React App → Vite
Motivation: `react-scripts@5.0.1` hard-pinned **28 dependency vulnerabilities** (9 low, 6 moderate, 13 high) with no fix short of replacing the build tool — flagged in the 2026-07-16 security handover as its own deliberately-deferred project. Executed on a feature branch (`vite-migration`) first, verified as a Vercel *preview* deployment (product-owner-confirmed working by loading the actual landing page) before merging to `main`.

Key decisions and gotchas, worth knowing if touching the build config again:
- **Deliberately pinned `vite@7.3.6` / `@vitejs/plugin-react@5.2.0`, not the latest (`vite@8`/`plugin-react@6`).** Vite 8 ships a new Rolldown/oxc-based bundler with a different, incompatible config surface — confirmed live that the standard `esbuild.loader`/`include` config for JSX-in-`.js`-files is silently ignored under Vite 8. `plugin-react@6` is also built against Vite 8's internal package exports and fails to load under Vite 7. Vite 7 is the mature, esbuild-based generation most tooling and guides target.
- **`.js` files containing JSX had to be renamed to `.jsx`** (`src/index.js` → `src/index.jsx`, and 4 test files). CRA/babel transformed JSX-in-`.js` transparently; Vite's esbuild transform only applies to `.jsx`/`.tsx` by default, and a global config override was confirmed **not** to reliably apply to `vite:build-html`'s entry-script parsing nor Vitest's SSR transform for test files — both discovered by hitting real parse failures, not assumed. Every other `.js` file in the repo has zero JSX and is untouched.
- **`jest.*` → `vi.*`**, mechanical replacement, 45 call sites across 19 test files (`jest.fn`/`jest.mock`/`jest.clearAllMocks`/`jest.spyOn`, exact `vi.*` equivalents). `vitest.config`'s `test.globals: true` preserves Jest's implicit `describe`/`test`/`expect`/`beforeEach` globals. Aliasing `globalThis.jest = vi` (to avoid touching test files at all) was considered and rejected — Vitest's `vi.mock` hoisting depends on static detection of the literal `vi.mock(...)` call pattern, which an alias wouldn't survive.
- Two **real** (not just mechanical) test fixes surfaced, not app bugs: (1) `vi.spyOn(global, "Date").mockImplementation(() => fixed)` threw "not a constructor" under Vitest — arrow functions are fundamentally non-constructible, Jest's mock wrapper apparently papered over this, Vitest's doesn't; fixed with a regular function that returns the fixed Date object (a constructor explicitly returning an object substitutes it for `this`, correct per plain JS semantics). (2) A `vi.mock` factory for a default-exported component (`MpesaPaymentModal`) returned the mock function directly; Vitest requires factories mocking a default export to return `{ default: ... }`.
- **`react-scripts` fully removed.** 28 vulnerabilities → **0** (confirmed via `npm audit` after removal, not just after adding Vite alongside it).
- **CI workflow updated**: `CI=true npm run build`/`test -- --watchAll=false` → plain `npm run build`/`test`; `node-version` bumped `18` → `22` (Vite 7 requires `^20.19.0 || >=22.12.0`; the prior CI config would have failed outright on this migration once merged).
- `vite.config.js` deliberately keeps `build.outDir` as `'build'` (Vite's own default is `'dist'`) so Vercel's output-directory expectation doesn't also need changing in the same step as the framework preset.
- **Two manual, dashboard-only steps still outstanding** (no tool access to either from this environment): flip Vercel's project framework preset from `create-react-app` to `vite` (cosmetic at this point — the build already works correctly regardless, since Vercel just runs whatever `npm run build` does), and rename Vercel's env vars `REACT_APP_SUPABASE_URL`/`REACT_APP_SUPABASE_KEY` → `VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY` (also low-urgency — `constants.js` has hardcoded fallback values matching production exactly, so the app works correctly either way; this just tidies up unused legacy env vars).

---

## 8. Known Issues, Blockers, and Tool Limitations

**Tool access issues encountered this session** (worth knowing before assuming something is broken on the app side):
- `Supabase:list_edge_functions` / `Supabase:get_edge_function` / `Supabase:get_logs` (edge-function service) consistently returned `"No approval received"` errors all session, independent of anything being deployed correctly or not. This is a known, already-documented quirk, not a signal of a real problem.
- `web_fetch` is restricted to URLs already seen in the conversation — can't spot-check a fresh deployment URL without the person providing/confirming it first.
- `Vercel:web_fetch_vercel_url` / `Vercel:get_access_to_vercel_url` also returned `"No approval received"` this session.
- Practical implication: **HTTP-level verification of Edge Function or preview-URL behavior generally needs a human to actually click through it** — this environment can confirm deploys succeeded (via deploy-call responses and Vercel deployment `state`), and can verify all *database-level* behavior directly via SQL, but cannot always independently confirm what a live HTTP endpoint actually returns.

**Leaked GitHub PATs — needs cleanup.** Multiple PATs were pasted into chat and reused across several pushes each rather than being revoked promptly after single use, despite repeated reminders:
- Four distinct PATs were pasted into chat across this session's conversation and reused across several pushes each rather than being revoked promptly after single use, despite repeated reminders. (Not reproduced here — GitHub's push protection correctly rejected an earlier draft of this file for containing the literal token strings, which would have compounded the leak by baking them into repo history. The actual values are visible in the conversation history where they were originally shared, not in this document.)

**All four should be revoked/rotated in GitHub settings if that hasn't already happened.** This is a real, live credential-hygiene gap, not a hypothetical.

**Open findings, not fixed, in priority order (see §9 for recommendation):**

1. **Confirm the SPA rewrite (`vercel.json`, §7.11) actually works in production** — added to fix a real gap in this session's own Vite migration, logic-reviewed but not click-tested by this report's author. Load a deep link directly (not via in-app navigation) to confirm, e.g. `trimora-pos.vercel.app/some-real-salon-slug/pos`.
2. **Vercel dashboard steps still outstanding** — framework preset label (`create-react-app` → `vite`), env var renaming (`REACT_APP_*` → `VITE_*`). Not blocking, cosmetic/hygiene only (§7.10 explains why).
3. **Main JS bundle is ~1MB minified** (Vite's build output explicitly warns about this; CRA didn't surface the equivalent warning as prominently, so this may not be new, just newly visible). Not investigated or actioned this session. A reasonable next step if page-load performance ever becomes a concern: code-splitting via dynamic `import()` for less-frequently-hit routes (SuperAdmin console, Auto module pages), which Vite supports natively.
4. **`auth_leaked_password_protection` disabled** — confirmed via a fresh `get_advisors(security)` run this session: Supabase Auth's HaveIBeenPwned check is off. Not yet investigated or actioned; worth a look since it's a low-effort win if it applies to how staff/admin accounts authenticate (needs checking whether it's even relevant given the PIN-based auth model rather than password auth).
5. **M-Pesa: no live transaction has ever been traffic-verified** — the callback-token fix and STK-push flow are logic-verified and code-reviewed, not proven against real Safaricom traffic in production. Matters once Daraja Go Live is complete.
6. A large number of `SECURITY DEFINER` functions show up in `get_advisors(security)` as callable by `anon` or `authenticated` — **the large majority of these were individually reviewed this session and prior sessions and confirmed to have correct internal guard checks** (JWT claim checks, salon_id scoping, etc.) making the grant itself non-exploitable even though the linter flags it. This is expected, ongoing noise from the linter given the app's RPC-heavy architecture, not a fresh list of vulnerabilities — but if resuming security work, it's the first thing to re-run (`get_advisors(security)`) to get the current, complete list rather than trusting this summary.

---

## 9. Recommended Next Steps, in Priority Order

1. **Click-test the SPA rewrite** (§8, item 1) — quick, and confirms a genuine gap in the Vite migration is actually closed, not just logically reviewed.
2. **Revoke the outstanding GitHub PATs** (§8, credential hygiene section above) — pure hygiene, zero technical risk, should just happen.
3. **Close out the two Vercel dashboard steps** for the Vite migration (§7.10, §8 item 2) — quick, low-risk, removes lingering inconsistency between what's configured and what's actually running.
4. **Re-run `get_advisors(security)` fresh** before doing any further security work, rather than relying on this document's snapshot — the advisor list changes as migrations land, and several sessions' worth of fixes have already landed since the original 2026-07-16 audit.
5. **M-Pesa live-traffic verification** — needs an actual STK-push transaction run against production, by a human with a real phone, once convenient.
6. Consider a fresh full read-through of `SuperAdminDashboard.jsx` and `POSApp.jsx` now that both are fully split — worth confirming no further dead code or duplicate-declaration issues remain post-refactor (the `loadPlans`/`savePlanPrice` find in §7.8 suggests parallel-session merges can introduce this class of bug elsewhere too, undetected until someone reads the file closely).
7. Lower-urgency: the `auth_leaked_password_protection` advisor item (§8, item 4), and the ~1MB bundle size (§8, item 3) if page-load performance ever becomes a concern.

---

## 10. Environment / Setup Notes for Resuming Work

- **Clone:** `git clone https://github.com/kimmsbeauty/Trimora-POS.git`, branch `main`.
- **Install:** `npm install` (Node `^20.19.0 || >=22.12.0` required — confirm your Node version first, this is a hard Vite 7 requirement, not optional).
- **Env vars:** copy `.env.example` to `.env`, using `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` (not the old `REACT_APP_*` names — those are dead as of the Vite migration). `constants.js` has working hardcoded fallbacks either way, so a missing `.env` won't break local dev, just means you're pointed at production Supabase by default.
- **Run dev server:** `npm run start` (was `react-scripts start`, now `vite`).
- **Build:** `npm run build` → outputs to `build/` (not Vite's default `dist/` — deliberately kept matching Vercel's expectation, see §7.10).
- **Test:** `npm run test` (run-once, matches CI) or `npm run test:watch` (interactive, for local development).
- **Supabase access:** both projects (`ukoccobbjeomjwjcvrma` for this app, `tvzbtyggphxqnstuxllp` for the marketing site) are accessible via the Supabase MCP tools if available in your environment; otherwise via the Supabase dashboard directly.
- **Deploys:** pushes to `main` auto-deploy to Vercel production. Feature branches get preview deployments — use this for anything remotely risky (this is how the Vite migration itself was validated before merging).
- **GitHub PATs:** this repo has no bot/service account with standing write access set up — every session needs a human-provided, single-use PAT per push, verified before use, stripped from the remote URL immediately after. See §2 for the exact commands used.

---

*End of report. For deep detail on any individual fix summarized above, the full reasoning and verification trail is in the corresponding commit message on `main` — every commit this session was written with the "why", not just the "what", specifically so a future reader wouldn't need to reconstruct context from scratch.*
