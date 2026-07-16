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
- **Latest commit as of this handover: `8c46c723bd7675c599f1aadb107dd290f9d2bc28`**
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
   (mutable `search_path` on ~16 functions, dead `products` table,
   `stock_log`/`stock_movements` missing `salon_id`, the orphaned
   `015_allow_anon_payment_status_update.sql` migration file) —
   **untouched this session**, still open, still someone's call on
   priority.

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
   (mutable search_path, dead `products` table, etc.) — none of them
   got any closer to resolved this session; they're not forgotten, just
   still nobody's explicit priority.

## What to attach in the new chat

1. **This document.**
2. **`trimora_handover_2026-07-08.md`** and
   **`trimora_auto_handover_2026-07-09.md`** — still both relevant,
   nothing in either was invalidated this session.
3. The original audit report if the next session wants the full
   evidence/reasoning behind any specific finding — but treat it as a
   historical record per "What NOT to assume" above, not current state.
