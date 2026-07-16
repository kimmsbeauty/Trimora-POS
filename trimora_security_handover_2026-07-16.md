# Trimora POS — Security Audit & Remediation Handover (2026-07-16)

## What this document is

This session ran a full adversarial security audit against
`kimmsbeauty/Trimora-POS` and shipped fixes for every finding rated
Critical or High, plus two of the Medium/Low findings. It's written in
the same style as the prior handovers in this repo
(`trimora_handover_2026-07-08.md`, `trimora_auto_handover_2026-07-09.md`)
— verified facts with commit references, not a restatement of a plan.
**Read those two first if you haven't** — this document doesn't repeat
their content, only adds to it.

This was a security-focused session, not a feature session. Nothing in
Trimora Auto's roadmap (Phase 5/6, per the Auto handover) was touched.

---

## Repo / project identifiers (unchanged, re-verify anyway)

- POS repo: `github.com/kimmsbeauty/Trimora-POS`, branch `main`
- **Latest commit as of this handover: `725eec6a059d277d6a238c6f931705f91fbcca50`** (originally written at `8c46c72`; see the Addendum section below for what changed after that)
- Supabase project (POS/production): `ukoccobbjeomjwjcvrma` ("kimmsbeauty", eu-west-1)
- Live tenant count: **5** salons now (Kimms Beauty Parlour, Grace
  Beauty, Lavish Lux Spa, Urban Streets Beauty, plus one Auto-vertical
  tenant — "High point carwash" — seen during this session that wasn't
  listed in the prior POS handover; re-verify its status, it wasn't
  investigated further here since it was out of scope)
- **A second session was working in this same repo concurrently**
  during this one (visible via interleaved commits — POSApp.jsx
  god-component split, Auto Wallet/Coupons/Fleet/Draft-Invoices/
  Combined-P&L features, and its own independent security cleanup:
  `verify_pin_for_salon` dropped, `salon_onboarding_requests` anon
  grants revoked). No conflicts arose, but this confirms multiple
  concurrent sessions on this repo is now a live pattern, not a
  one-off — worth explicitly checking for at the start of any new
  session (`git fetch` before assuming `main` is where you left it).

---

## Why this session happened

The person requested a full adversarial security/production-readiness
audit using a third-party template (OWASP-style: auth, authorization,
injection, secrets, business logic, AI-hallucination patterns,
architecture, reliability, dependencies). The audit report itself is
not in this repo — it was delivered as a chat artifact
(`Trimora-POS_Security_Audit_2026-07-14.md`) — but every finding it
produced was tracked and (mostly) fixed live in this session. This
document is the "what actually happened" record; the original audit
report is the "what was found" record. Both matter; neither replaces
the other.

---

## What actually shipped this session

| Finding | Severity | Fix | Commit(s) |
|---|---|---|---|
| PIN brute-force — client-side-only lockout, `check_pin_lockout()` existed but was never called | Critical | Wired lockout into `verify_staff_pin` | `036_wire_pin_lockout_into_verify_staff_pin.sql` |
| M-Pesa payment confirmation forgery — `mpesa-callback` trusted any caller | Critical | Per-payment `callback_token`, never sent to frontend, required to match before processing | `038_mpesa_callback_token.sql` + both `mpesa-stk-push`/`mpesa-callback` functions |
| Device impersonation — `silent-device-login` minted a session for any public `salon_id`, no proof of legitimacy | Critical | **Stopgap**: rate-limited (`037_device_login_events_rate_limit.sql`). **Real fix**: PIN entry itself now establishes the session (`042_verify_pin_for_device_login.sql`, new `device-pin-login` function, `App.jsx`/`LoginPage.jsx` rewritten) | `037_*`, `042_*`, "Real fix for device impersonation" |
| `mpesa-stk-push` — anyone with a public `salon_id` could trigger payment prompts to any phone | High | Caller's device-auth token now required to match the requested `salon_id` | "Bind mpesa-stk-push and send-marketing-message..." |
| `send-marketing-message` — same pattern, billed to Trimora's shared SMS credentials | High | Same fix, same commit | (same as above) |
| Dead `pin_login_attempts` table (lockout scaffolding never wired up) | Medium | Resolved as part of the PIN lockout fix above | `036_*` |
| 33 dependency vulnerabilities (`react-scripts@5.0.1`'s own lockfile) | Medium | Partial: `react-router-dom` bumped 6.8.0→6.30.4, `npm audit fix` for the rest. 33→28; remaining 28 need a Vite migration (not attempted — separate, larger scope) | "Patch safe dependency vulnerabilities" |
| `pin_reset_tokens` RLS policy was tautological (checked "is authenticated at all", not tenant ownership) | Low (found during a fresh full-RLS sweep, not in the original report) | Fixed to the standard `auth_salon_id()` pattern | `043_fix_pin_reset_tokens_tautological_rls.sql` |

**Also found and fixed, not in the original audit scope:**

- **Urban Streets Beauty's admin PIN was live, in plaintext, in a
  deployed Edge Function's source** (`device-pin-login`, which was a
  broken client-side test snippet mistakenly deployed as the function
  body — not a working handler). PIN rotated (new value communicated
  out of band, not in any repo file or commit). Function replaced with
  a real, working implementation as part of the Critical-1 fix above.

Full build + test verification after every change: `react-scripts
build` clean, `186/186` tests passing (same count the concurrent
session also reported independently).

---

## What's still open

1. **`bookings_anon_update_payment_status` RLS policy has no
   per-booking or per-salon scoping** — any anonymous caller can flip
   *any* salon's pending booking to `awaiting_confirmation`/`pay_later`,
   not just their own. Traced through to `BookingPage.jsx`/
   `AppointmentsView.jsx`: this only changes a UI status badge, staff
   still manually confirm real payment, so real-world impact is a
   confusing-nuisance ceiling, not fund loss. **Flagged, not fixed** —
   your call whether it's worth a booking-scoped token before Auto (or
   POS) grows more anonymous-write surface like this.
2. **The Vite migration** — 28 remaining dependency vulnerabilities,
   all hard-pinned by `react-scripts@5.0.1` with no fix short of
   replacing the build tool. Real work, not urgent (all build-time/
   dev-server, not shipped to production), deserves its own session.
3. **No live browser click-through of the new PIN-first login flow.**
   This sandbox has no outbound access to `supabase.co`, so
   `device-pin-login`/`App.jsx`/`LoginPage.jsx` were verified by
   production build + SQL-level RPC testing (lockout, correct/incorrect
   PIN, all confirmed against a real salon with throwaway data,
   cleaned up after) — **not** by an actual person logging into a real
   device. This is the highest-blast-radius change of the session
   (every device, every live salon). **Get a real login tested against
   a non-Kimms salon before trusting it everywhere.**
4. **No live M-Pesa transaction has ever been recorded**
   (`salon_mpesa_payments` had 0 rows at the time of the Critical-2
   fix) — consistent with Daraja Go Live/till whitelisting still being
   in progress per earlier project history. The `callback_token` fix
   is verified at the SQL/logic level only. **Get one real M-Pesa
   transaction through once Go Live completes**, specifically checking
   that Safaricom's actual callback still gets accepted (it should —
   the token travels in the URL Safaricom itself is given — but this
   hasn't been proven against real Safaricom infrastructure).
5. **`silent-device-login` is now dead code from the frontend's
   perspective** (nothing calls it anymore) but was deliberately left
   running rather than deleted, as a fallback in case something's
   wrong with the new PIN-first flow. Once #3 above is confirmed
   working live, deprecating it fully (410 stub, matching the pattern
   already used for the leaked `device-pin-login` cleanup) closes the
   last sliver of Critical-1's original attack surface.
6. **Two GitHub tokens were pasted directly into the chat this
   session** (to work around this sandbox having no git credentials of
   its own) and used for pushes. **Both need to be revoked/rotated** —
   flagged repeatedly during the session, worth confirming it actually
   happened.
7. Everything already flagged-but-not-fixed in the two prior handovers
   (mutable `search_path` on ~16 functions — **now resolved, see
   Addendum**, dead `products` table, `stock_log`/`stock_movements`
   missing `salon_id`, the orphaned
   `015_allow_anon_payment_status_update.sql` migration file) —
   remaining items untouched this session, still open, still someone's
   call on priority.
8. **6 `SECURITY DEFINER` views** flagged by the advisor
   (`platform_stats`, `salon_directory`, `auto_platform_jobs`,
   `public_salon_directory`, `public_rating_lookup`,
   `public_staff_directory`, `public_auto_job_rating_lookup`) — not
   investigated per-view this session. Several are probably intentional
   (the `public_*` ones exist specifically to expose curated data
   pre-auth), but that's an assumption, not a verified fact. Needs its
   own pass before touching any of them.
9. **`auth_leaked_password_protection` is disabled** in Supabase Auth —
   real, low-effort improvement (checks new passwords against
   HaveIBeenPwned), not yet done. Not confirmed whether it's reachable
   from a migration/SQL or only via the dashboard/Management API.

---

## What NOT to assume

- Don't assume `main` is where this document left it — another session
  was actively pushing throughout this one; `git fetch` before doing
  anything.
- Don't assume `silent-device-login` being "dead code" means it's safe
  to delete blindly — confirm the new PIN-first flow has had a real
  login test first (see open item #3).
- Don't assume the M-Pesa fix is fully proven — it's logic-verified,
  not traffic-verified (see open item #4).
- Don't assume the original chat-delivered audit report
  (`Trimora-POS_Security_Audit_2026-07-14.md`) reflects current state
  — every Critical/High finding in it is now fixed per the table
  above; re-reading it as "current risk" rather than "historical
  record" would be misleading.
- Don't assume migration numbering is contention-free — this session
  hit two separate numbering collisions with the concurrent session
  (`039`, then `040` again) purely from working in parallel. Always
  check `supabase/migrations/` on a fresh `git fetch` before naming a
  new migration file, don't just increment from local memory.
- Don't assume a `REVOKE EXECUTE ... FROM <role>` migration actually
  removed that role's access — Postgres's default `PUBLIC` grant on
  functions means every role inherits execute rights through `PUBLIC`
  regardless of a role-specific revoke. Always revoke from `PUBLIC`
  explicitly too, and verify via
  `information_schema.role_routine_grants` afterward rather than
  trusting the migration succeeded silently. This bit this session
  once already (see Addendum).

---

## Reference facts pulled for this handover (verified this session, not previously documented)

- **Production dependencies**: `qrcode`, `react`, `react-dom`,
  `react-router-dom`, `react-scripts`, `recharts` — 6 total, small
  surface. Dev dependencies: `@testing-library/jest-dom`,
  `@testing-library/react`.
- **8 Supabase Edge Functions**: `admin-create-sales-rep`,
  `admin-set-device-secret`, `ai-classify-question`, `device-pin-login`,
  `mpesa-callback`, `mpesa-stk-push`, `send-marketing-message`,
  `silent-device-login`. All 8 read this session; auth posture of each
  documented inline in their own source comments as of this session's
  changes.
- **46 migration files**, **50 tables in the `public` schema, all with
  RLS enabled** (none found fully open — verified via
  `pg_class.relrowsecurity` across every table, not sampled).
- **18 test files**, 186 tests total, all passing as of `8c46c72`.
- **No `vercel.json` or `netlify.toml` in the repo** — deployment
  config lives in Vercel's dashboard, not version-controlled here (per
  the prior handover, project `prj_AjqWaTmlGNW1xEQcqJz9EiRhb67m`, team
  `kimms-beauty-s-projects`; not re-verified this session, security-
  focused, deployment wasn't in scope).
- **Two environment variables**, both intentionally public
  (`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_KEY` — the anon key,
  safe by Supabase's own design since RLS is the actual access-control
  layer, not key secrecy). Documented with explicit reasoning in
  `.env.example`.
- **One CI workflow**: `.github/workflows/backup.yml` — daily encrypted
  Postgres dump to a GitHub Actions artifact (not committed to the
  repo), 35-day retention, explicitly documented as a free-tier
  stopgap, not equivalent to real PITR. Requires `SUPABASE_DB_URL` and
  `BACKUP_ENCRYPTION_PASSPHRASE` repo secrets — not verified this
  session whether either is actually set (the workflow fails loudly
  and explicitly if not, per its own script).

---

## Addendum — later the same day: advisor sweep and grant cleanup

After the sections above were written, one more round happened,
prompted by checking whether the "mutable `search_path`" issue flagged
in the prior handovers was still open.

**It wasn't** — already resolved (likely predates this session; not
otherwise documented where/when).

That check surfaced something bigger: a full Supabase security-advisor
pass showing ~20 `SECURITY DEFINER` functions flagged as callable by
`anon`/`authenticated`, including several touching super-admin actions,
invoicing, and wallet balances. Rather than assume the linter's blanket
warning meant a real hole, **every one of the 12 highest-value flagged
functions was read in full** (`suspend_salon`, `reactivate_salon`,
`super_admin_update_salon`, `super_admin_update_plan_price`,
`superadmin_set_module`, `record_subscription_payment`,
`create_invite`, `get_admin_audit_log`, `log_admin_action`,
`issue_auto_invoice`, `mark_auto_invoice_paid`,
`apply_wallet_transaction`). **All 12 were already correctly gated
internally** — either an `auth.jwt() -> app_metadata ->> is_super_admin`
check or an `auth_salon_id() IS NULL` check, matching the pattern
already proven safe in `super_admin_reset_salon_pin`. This was linter
noise, not a new vulnerability.

Fixed anyway, as defense-in-depth / to reduce future advisor noise:
revoked unnecessary `anon` execute grants on those 12 functions
(`044_revoke_anon_public_grants_admin_functions.sql`).

**A real mistake happened and was caught mid-process, worth knowing
about if you touch grants on this schema again**: the first attempt
(`REVOKE EXECUTE ... FROM anon`) did not actually work. Postgres grants
`EXECUTE ON FUNCTION` to `PUBLIC` by default at creation time unless
explicitly revoked, and every role — including `anon` — inherits
execute rights through `PUBLIC` regardless of an anon-specific revoke.
This was caught by re-querying
`information_schema.role_routine_grants` immediately after applying the
first migration and finding `PUBLIC` still listed as a grantee. A
second migration (`REVOKE ... FROM PUBLIC`) was required, and the
final, correct combined form is what's in `044_*.sql` — the repo does
not contain the incomplete intermediate version, only the corrected
one, with the lesson documented in the migration's own comments.
**If you ever write a grant-revocation migration on this schema,
revoke from `PUBLIC` explicitly, not just the specific role you're
targeting — this is the second time in this session `PUBLIC` grants
caused a check to fail silently** (the first being the original
`pin_reset_tokens` tautological-policy finding, a different kind of
bug but the same broader lesson: verify grants directly, don't infer
them from a role-specific query alone).

Deliberately did **not** revoke the `authenticated` grant on any of
these 12, despite the linter suggesting it — super admins connect as
ordinary `authenticated` Supabase Auth sessions, distinguished by JWT
`app_metadata`, not by a separate Postgres role. Revoking
`authenticated` would have broken the real Super Admin dashboard.

**Two more things surfaced by the same advisor pass, explicitly not
acted on — added to "what's still open" below:**
- 6 `SECURITY DEFINER` views (`platform_stats`, `salon_directory`,
  `auto_platform_jobs`, plus 3 `public_*`-prefixed ones that are
  probably intentionally public). Views bypassing RLS via
  `SECURITY DEFINER` is a different risk shape than functions — some of
  these are almost certainly intentional (the public directory views
  exist specifically to expose curated data pre-auth), but that wasn't
  confirmed per-view this session. Needs its own careful pass; getting
  it wrong could silently break the public booking page.
- `auth_leaked_password_protection` is disabled in Supabase Auth
  (checks new passwords against HaveIBeenPwned). Real, low-effort
  improvement, but it's an Auth-config toggle — not confirmed whether
  it's reachable via SQL/migration from here or only via the dashboard/
  Management API.

Verified this round: grants confirmed via
`information_schema.role_routine_grants` (exact `{authenticated,
postgres, service_role}` on all 12, no `anon`, no `PUBLIC`), and a
fresh advisor re-run confirming all 12
`anon_security_definer_function_executable` warnings for these
functions cleared with no new findings introduced.

**Latest commit as of this addendum:
`725eec6a059d277d6a238c6f931705f91fbcca50`**

---

## Sensible next steps (not a mandate)

1. Get a real person to log into a real (non-Kimms) salon's POS using
   the new PIN-first flow. This is the single highest-value open item.
2. Revoke both GitHub tokens pasted into this session's chat, if not
   already done.
3. Decide on `bookings_anon_update_payment_status` scoping (open item
   #1) — low urgency, but a clean fix once someone has bandwidth.
4. Once #1 above is confirmed working, deprecate `silent-device-login`
   fully rather than leaving it as a live fallback indefinitely.
5. The Vite migration is real work worth scheduling deliberately, not
   squeezing into a future security session the way this one squeezed
   in a dependency-hygiene pass.
6. Re-triage the still-open items from the two prior handovers
   (dead `products` table, `stock_log`/`stock_movements` missing
   `salon_id`, etc. — search_path is now resolved) — none of them got
   any closer to resolved this session; they're not forgotten, just
   still nobody's explicit priority.
7. Get the 6 `SECURITY DEFINER` views checked properly — low urgency
   given several are probably intentional, but "probably" isn't
   "verified."
8. Turn on `auth_leaked_password_protection` in Supabase Auth — cheap
   win, just needs someone to check whether it's a dashboard-only
   toggle or reachable from a migration.

## What to attach in the new chat

1. **This document.**
2. **`trimora_handover_2026-07-08.md`** and
   **`trimora_auto_handover_2026-07-09.md`** — still both relevant,
   nothing in either was invalidated this session.
3. The original audit report if the next session wants the full
   evidence/reasoning behind any specific finding — but treat it as a
   historical record per "What NOT to assume" above, not current state.
