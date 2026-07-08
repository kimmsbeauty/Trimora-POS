# Trimora — Handover to Next Session (2026-07-08)

## What this document is

The previous session completed the tenancy-foundation prerequisite work
(`trimora_first_task.md`) that had to happen before any Trimora Auto
feature work could safely start. That work is done, tested, and pushed
to `main`. This document is the accurate, verified state of things as
of the end of that session — not a re-statement of the original plan,
but what actually happened, including things that turned out
differently than expected.

**Read this before re-reading the original planning documents** — a
few of their assumptions were found to be stale during implementation
(noted below), and this document reflects reality, not the plan.

---

## Repo / project identifiers

- POS repo: `github.com/kimmsbeauty/Trimora-POS`, branch `main`,
  latest commit as of handover: `5d005a9`
- Marketing site repo: `github.com/kimmsbeauty/Trimora-systems` (not
  touched this session)
- Supabase project (POS / production): `ukoccobbjeomjwjcvrma` ("kimmsbeauty", eu-west-1)
- Supabase project (Trimora Systems marketing site): `tvzbtyggphxqnstuxllp`
- Live tenant count: 4 salons (Kimms Beauty Parlour, Grace beauty,
  Lavish Lux Spa, Urban streets beauty) — all real, all active

---

## What actually shipped this session (all 5 steps of `trimora_first_task.md`)

| # | What | Commit(s) |
|---|---|---|
| 1 | Live schema + RLS + security-advisor baseline snapshot, checked into `supabase/schema_baseline/2026-07-07_baseline.md` | `23b4e45` |
| 2 | Removed the `KIMMS_SALON_ID` tenant fallback from `db.js` **and** `BookingPage.jsx` (a second instance found later) | `3c209d8`, `5d005a9` |
| 3 | `TENANT_TABLES` enforcement test (`tenantScoping.test.js`) | `3dad853` |
| 4 | New `salon_service_categories` table, applied to production, wired into both `POSApp.jsx` and `BookingPage.jsx` (including the two hardcoded `<select>` dropdowns that were missed on the first pass) | `17b0f93`, `7bcefa5`, `5d005a9` |
| 5 | Regression safety net — booking flow integration test + extracted/tested sale-completion logic, all mocked, zero infrastructure cost | `e430414` |

Full test suite: **147/147 passing**, `npm run build` clean, verified
after every commit, not just at the end.

### Read `supabase/schema_baseline/2026-07-07_baseline.md` for the full picture

It has the complete table-by-table tenant-scoping status, every
security advisor finding, and details on things flagged but not fixed
(see below). Don't re-derive this from scratch in the new session —
it's already there and was verified live.

---

## Important corrections to the original planning documents

The original audit (`trimora_pos_audit.md`) and first-task brief both
assumed the `KIMMS_SALON_ID` fallback was needed because of "legacy
unprefixed routes" (`/pos`, `/booking`). **This was stale.** Live
routing (`App.jsx`) shows:

- `/pos` and `/booking` (unprefixed) render `TrimoraLandingPage` — a
  static marketing page with zero database calls. The fallback was
  already dead code for these two routes.
- The actual live risk was one line in `POSApp.jsx` (feedback rating
  links) and one line in `BookingPage.jsx` (customer lookup) that
  could silently misattribute data to Kimm's Beauty Parlour under a
  specific, rare (never-yet-triggered) condition. Both are now fixed
  to refuse and log loudly instead of guessing — see commits `3c209d8`
  and `5d005a9` for the reasoning in full.

**Lesson for the next session**: don't trust code comments describing
"why" a piece of legacy logic exists without checking the actual
current routing/call sites. Comments in this codebase have gone stale
before.

---

## Flagged but NOT fixed (still open, your call on priority)

1. **`BookingPage.jsx`'s `legacyBranding` fallback mechanism** (a
   `useEffect` that fetches branding when `contextSalon` is falsy) is
   confirmed dead code in current routing, same root cause as above.
   It's harmless (not a correctness bug, unlike the two fixed items),
   so it was left in place rather than expanding scope. Candidate for
   cleanup later.
2. **`products` table** in the live schema (10 rows, no `salon_id`, no
   primary key) is dead — nothing in the frontend writes to it (the
   "Products" tab actually writes to `stock`). RLS enabled with no
   policy, so not currently exposed. Candidate for a cleanup migration
   (drop it) whenever convenient.
3. **`stock_log` / `stock_movements` tables** have no `salon_id` column
   at all, unlike every other tenant table. Not actively exploited
   (nothing queries them client-side yet), but worth deciding whether
   they should be tenant-scoped before Trimora Auto starts writing to
   an equivalent inventory-movement table.
4. **Security advisor findings not addressed** (see the baseline doc
   for full detail): 16 functions with mutable `search_path` (known
   Postgres privilege-escalation vector, same class of bug as the
   already-fixed migrations 011/013), and several `SECURITY DEFINER`
   RPCs named as super-admin-only (`suspend_salon`,
   `super_admin_reset_salon_pin`, etc.) that are anon-executable at the
   grant level — their actual protection needs to be confirmed to live
   inside the function body, not assumed. **Worth a dedicated security
   pass before Trimora Auto adds more RPCs to the same pattern.**
5. **`services` (and likely `stock`, `staff`) have permissive RLS on
   anon SELECT** (`using_expr = true`) — tenant isolation for
   anonymous reads is enforced entirely by `db.js` appending a
   `salon_id` filter, not by RLS itself. This is now well-covered by
   the `tenantScoping.test.js` enforcement test, but **Trimora Auto's
   new tables need to either follow this same convention deliberately,
   or tighten RLS instead** — this should be an explicit decision in
   the Auto architecture plan, not an accident either way.
6. **The orphaned migration file** `015_allow_anon_payment_status_update.sql`
   still sits in `supabase/migrations/` alongside
   `015_add_bookings_anon_update_payment_status.sql`, confirmed
   superseded. Never resolved — still there, still harmless, still
   worth a decision.

None of these are blockers for starting Trimora Auto. They're real,
verified findings, not guesses — worth triaging early in the new
session rather than losing track of them.

---

## What's now true that Trimora Auto can build on

- Tenancy is now enforceable, not just conventional: any new
  tenant-scoped table added for Auto needs `TENANT_TABLES` in `db.js`
  updated, and `tenantScoping.test.js`'s snapshot lists updated to
  match, or a test fails on the next PR. This is the actual mechanism
  Auto should use to avoid repeating the salon-shaped-foundation
  problem the original audit found.
- Categories are now a per-tenant table (`salon_service_categories`),
  not a hardcoded constant — a real precedent for Auto's own
  configurable-per-tenant data (e.g. Auto's own service catalog).
- There's now a template for "additive migration + verify seeded data
  against pre-migration row counts + commit" that worked cleanly twice
  this session (`018_salon_service_categories.sql`, and the fallback
  removal) — reuse this pattern for Auto's new tables rather than
  inventing a new verification approach.
- The regression safety net (`tenantScoping.test.js`,
  `db.tenantResolution.test.js`, `saleLogic.test.js`,
  `BookingPage.integration.test.js`) is real and running — 147 tests,
  zero infrastructure cost. Auto's own new logic should follow the
  same pattern: extract pure logic where components are too heavy to
  render in tests (see `saleLogic.js` for the precedent), use React
  Testing Library + mocked `db()` where a real component flow needs
  covering (see `BookingPage.integration.test.js`).

---

## What to attach in the new chat

1. **This handover document.**
2. **`trimora_auto_kickoff_brief.md`** — the original Trimora Auto
   scope/architecture request. Still the right starting point for the
   actual Auto planning work; nothing in it was invalidated by this
   session, it just couldn't start until the tenancy foundation work
   above was done.
3. **`supabase/schema_baseline/2026-07-07_baseline.md`** from the repo
   (pull it fresh via Supabase MCP or GitHub — don't rely on a stale
   copy, and re-verify anything schema-related live before building on
   it, the same way this session did rather than trusting the original
   audit's assumptions).

**Do NOT attach** `trimora_pos_audit.md` or `trimora_first_task.md` as
primary references anymore — they described a past state and contain
the stale assumptions corrected above. Keep them only as historical
context if genuinely needed, not as a source of truth.

## What NOT to assume in the new session

- Don't assume the `KIMMS_SALON_ID` fallback still exists anywhere —
  it's gone from both places it lived. If a third instance turns up
  during Auto work, it's a new finding, not a known one.
- Don't assume `TENANT_TABLES` is still a pure hand-maintained list
  with no enforcement — `tenantScoping.test.js` will fail loudly if
  Auto adds a tenant table without registering it.
- Don't assume any of this session's live database state without
  re-checking — re-verify row counts and schema live via Supabase MCP
  before building on top of it, exactly as this session did throughout
  rather than trusting any document (including this one) as
  automatically current by the time you read it.
