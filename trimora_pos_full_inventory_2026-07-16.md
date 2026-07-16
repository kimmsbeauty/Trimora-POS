# Trimora POS — Full Page / Component / API Inventory (2026-07-16)

## What this document is

A companion to `trimora_security_handover_2026-07-16.md`, not a
replacement for it. That document tells you what happened and what to
do next. This one is a reference catalog — every route, every
component, every Edge Function, every service-layer file — for
orienting quickly in a large, fast-moving codebase.

**Caveat, stated plainly**: descriptions below come from file naming,
header comments, and this session's working knowledge of the codebase
(not a fresh line-by-line read of every one of the ~90 files listed).
Where a purpose is inferred rather than directly confirmed, it's
written as a plain description without false certainty — treat this as
a map, not a spec. It will go stale; the god-component-split work
happening in parallel this same session already changed several of
these files' shapes mid-session.

---

## Routes / top-level pages (`src/pages/*.jsx`)

| Page | Route(s) (inferred from `App.jsx`) | Purpose |
|---|---|---|
| `TrimoraLandingPage.jsx` | `/`, `/pos`, `/booking`, unrecognised URLs | Static marketing page, zero DB calls |
| `LoginPage.jsx` | Inside `/:slug/pos` (pre-login) | PIN entry — now the actual session-establishment point (see handover, Critical-1) |
| `POSApp.jsx` | `/:slug/pos` (post-login) | The POS itself — tabs for Appointments, Checkout, Customers, Inventory, Marketing, Services, Share, Staff (see `pos/` subpages below) |
| `BookingPage.jsx` | `/:slug/booking` | Public, unauthenticated customer booking flow |
| `RatingPage.jsx` | `/rate/:token` | Public post-visit feedback/rating page |
| `CalendarView.jsx` | Inside POS | Appointment calendar |
| `Dashboard.jsx` | Inside POS | Overview/home tab |
| `ExpensesPage.jsx` | Inside POS | Expense tracking |
| `ReviewsPage.jsx` | Inside POS | Customer feedback, split out of the Overview tab |
| `SalonSettingsPage.jsx` | Inside POS, admin-gated | Configures branding, M-Pesa till/paybill, marketing toggles |
| `ForgotPasswordPage.jsx` | `/forgot-password` (or similar) | Salon owner password reset request (Supabase Auth email flow) |
| `ResetPasswordPage.jsx` | Reset link target | Handles two distinct reset flows depending on query params |
| `ForgotPinPage.jsx` | Admin PIN recovery step 1 | Collects email, sends recovery link — **note**: this is a real, working "forgot PIN" feature, implemented via Supabase Auth's own recovery flow, *not* via the (confirmed-unused) `pin_reset_tokens` table fixed in the security handover. Worth clarifying which mechanism is actually canonical if both exist. |
| `ResetPinPage.jsx` | Admin PIN recovery step 2 | Completes the PIN reset via the recovery email link |
| `OnboardingPage.jsx` | Invite-only signup | Requires a valid `?token=` |
| `SalesRepGate.jsx` / `SalesRepLogin.jsx` / `SalesRepDashboard.jsx` | `/sales/*` | Sales rep flow — submit prospective salon leads |
| `SuperAdminGate.jsx` / `SuperAdminLogin.jsx` / `SuperAdminDashboard.jsx` | `/superadmin/*` | Platform management console for Trimora Systems (analytics, plans, audit log, salon management — itself recently split into sub-views by the concurrent session: `HealthView`, `PlansView`, `AutoAnalyticsView`, `AnalyticsView`, `AuditView`, `AutoAuditView`, `AutoHealthView`) |
| `TermsPage.jsx` | `/terms` | Static Terms & Conditions |
| `AutoApp.jsx` | `/:slug/auto` | Entry point for Trimora Auto, mirrors `App.jsx`'s DeviceGate/SalonGate shape |
| `AutoRatingPage.jsx` | Auto equivalent of `/rate/:token` | Mirrors `RatingPage.jsx`, including its security posture |

### POS sub-views (`src/pages/pos/*.jsx`)

Extracted from the former `POSApp.jsx` god-component by the concurrent
session this same day (commits: "extract CheckoutView", "extract
Appointments, Customers, Marketing views", "extract Staff, Services,
Inventory, Share views"). Each is a tab inside the running POS app:
`AppointmentsView`, `CheckoutView`, `CustomersView`, `InventoryView`,
`MarketingView`, `ServicesView`, `ShareView`, `StaffView`.

### Auto sub-pages (`src/pages/auto/*.jsx`)

`AutoMarketingPage`, `AutoSettingsPage`, `BoardPage` (the job
board/queue — core of Auto Phase 3/4 per the Auto handover),
`CheckInPage` (vehicle/job intake), `CustomersPage`, `ExpensesPage`,
`ReportsPage`, `ServicesPage`, `StaffPage`.

---

## Components (`src/components/*.jsx`)

| Component | Purpose (inferred) |
|---|---|
| `AskTrimora.jsx` / `AutoAskTrimora.jsx` | AI chat assistant widget (POS and Auto variants) — backed by `lib/ai/*` |
| `AutoBirthdayReminders.jsx` / `BirthdayReminders.jsx` | Birthday-based marketing SMS trigger UI (Auto and POS variants) |
| `TomorrowReminders.jsx` | Appointment-reminder SMS trigger UI |
| `AutoCampaignEditorCard.jsx` / `CampaignEditorCard.jsx` | Marketing campaign template editor |
| `AutoExportButton.jsx` / `ExportButton.jsx` | Data export (CSV/report) trigger |
| `AutoFeedbackModal.jsx` / `FeedbackModal.jsx` | Feedback/rating submission modal |
| `AutoInsightSummary.jsx` | AI-generated summary widget for Auto |
| `AutoMpesaPaymentModal.jsx` / `MpesaPaymentModal.jsx` | M-Pesa STK push trigger UI — see handover, High-1 fix |
| `AutoReceipt.jsx` / `Receipt.jsx` | Printable/shareable receipt rendering |
| `AutoSetupChecklist.jsx` / `SetupChecklist.jsx` | Onboarding checklist widget |
| `CarDamageDiagram.jsx` | Vehicle damage inspection UI (Auto — Fleet/Damage Inspection feature) |
| `EndOfDaySummary.jsx` | End-of-day report widget |
| `ErrorBoundary.jsx` | React error boundary wrapper |
| `GoldBtn.jsx` | Shared styled button |
| `LoyaltyBadge.jsx` | Customer loyalty tier display, backed by `lib/loyalty.js` |
| `MpesaInstructions.jsx` | Per-salon dynamic M-Pesa payment instructions (till/paybill) |
| `NotificationBell.jsx` | In-app notification indicator |
| `SalonBrandmark.jsx` | Dynamic per-tenant logo/branding renderer |
| `ShareBookingPanel.jsx` | Booking-link sharing UI (QR code via the `qrcode` dependency) |
| `VehiclePhotoUpload.jsx` | Vehicle photo capture/upload, backed by `lib/vehiclePhotos.js` |

---

## Service / library layer (`src/lib/*.js`)

| File | Purpose |
|---|---|
| `db.js` | Central tenant-scoped data-access layer — `TENANT_TABLES` enforcement, `db()`/`dbDirect()`/`dbRpc()`. **The most load-bearing file in the app.** |
| `currentSalon.js` | Resolves the active salon; the old `KIMMS_SALON_ID` fallback was removed here (per the 2026-07-08 handover) |
| `deviceAuth.js` | Device session management — `persistSession`, `getValidAccessToken`, `clearDeviceAuth`, `getDeviceLoginStatus`. Rewritten this session's login flow lives on top of this, not inside it |
| `constants.js` | `SUPABASE_URL`/`SUPABASE_KEY` (intentionally public, see handover) and shared config |
| `salesRepAuth.js` / `superAdminAuth.js` | Auth helpers for the two non-tenant login paths |
| `cartMath.js` | POS cart pricing/discount calculation (pure, tested) |
| `saleLogic.js` | Sale-completion logic, extracted for testability per the 2026-07-08 handover's precedent |
| `loyalty.js` | Customer loyalty tier/points calculation |
| `salonHealth.js` | Salon health-score calculation (used by Super Admin's Health views) |
| `colorUtils.js` | Branding color manipulation helpers |
| `slugify.js` | URL slug generation |
| `vehiclePhotos.js` | Vehicle photo storage helpers (Auto) |
| `pwaManifest.js` / `registerServiceWorker.js` | PWA support (dynamic manifest, per-tenant) |
| `utils.js` | Grab-bag shared utilities |

### AI provider layer (`src/lib/ai/`)

`AIService.js` / `AutoAIService.js` front a provider-abstraction
pattern: `ProviderManager.js` selects among `AnthropicProvider.js`,
`GeminiProvider.js`, `OpenAIProvider.js`, `OllamaProvider.js`,
`LocalIntelligenceProvider.js` / `AutoLocalIntelligenceProvider.js`
(non-AI fallback logic), and `disabledProvider.js` (feature-off state),
configured via `config.js`. This is a real multi-provider abstraction,
not a single hardcoded API integration — worth knowing before assuming
"the AI feature" means one specific vendor.

---

## Edge Functions (`supabase/functions/*`) — the actual API surface

| Function | Auth posture (as of `8c46c72`) | Purpose |
|---|---|---|
| `device-pin-login` | `verify_jwt: false` (must work with zero prior session) | **Real** implementation as of this session — PIN entry verifies identity AND establishes the device session in one step. Was previously a broken/leaked test snippet; see handover |
| `silent-device-login` | `verify_jwt: false` | Legacy device-session bootstrap. Rate-limited stopgap only; no longer called by the frontend, kept as a fallback — see handover, "what's still open" |
| `mpesa-stk-push` | `verify_jwt: false`, caller's device token now checked against `salon_id` in-body | Initiates an M-Pesa STK Push, saves a pending row to `salon_mpesa_payments` |
| `mpesa-callback` | `verify_jwt: true` (not a real barrier — anon key satisfies it), per-payment `callback_token` is the actual guard | Receives Safaricom's async payment confirmation |
| `send-marketing-message` | `verify_jwt: true`, caller's device token now checked against `salon_id` in-body | Sends one campaign SMS via Africa's Talking (currently pointed at their **sandbox** API — see below) |
| `admin-set-device-secret` | Requires the calling super admin's own access token | Manually resyncs a salon's device secret |
| `admin-create-sales-rep` | Requires the calling super admin's own access token | Provisions a new sales rep account |
| `ai-classify-question` | Not deeply audited this session — flagged in the original security report as a follow-up item, still open | Routes a user's question to the appropriate AI provider/intent |

**Note**: `send-marketing-message` calls
`https://api.sandbox.africastalking.com/...` — this is Africa's
Talking's **sandbox** endpoint, not production. Combined with
`salon_mpesa_payments` having 0 rows (per the handover), this
reinforces that several integrations are wired up but not yet live in
production — worth confirming deliberately before assuming SMS sends
are reaching real phones today.

---

## Key database RPCs (`SECURITY DEFINER` functions worth knowing)

| Function | Callable by | Purpose |
|---|---|---|
| `auth_salon_id()` | (used inside other policies/functions) | Resolves the caller's salon from their device-auth session — the single mechanism nearly every RLS policy in the schema relies on |
| `verify_staff_pin(role, pin)` | `authenticated` (needs an existing session) | PIN check for an *already-logged-in* device re-authenticating (e.g. switching roles) |
| `verify_pin_for_device_login(salon_id, role, pin)` | `service_role` only | New this session — the actual PIN-first login check, used by `device-pin-login` |
| `check_pin_lockout(salon_id, role)` | (used internally) | Now actually wired into both PIN-check paths above, as of this session |
| `update_salon_pin` / `super_admin_reset_salon_pin` | Authenticated / super admin | PIN rotation paths |
| `suspend_salon` | Super admin (grant-level anon-executable — flagged, not confirmed safe in-body, per the 2026-07-08 handover, still open) | Suspends a tenant |

---

## What this document doesn't cover

- Per-prop component APIs — not catalogued; read the component source
  directly if integrating with one.
- Full database schema (columns, constraints, indexes per table) — see
  `supabase/schema_baseline/2026-07-07_baseline.md` for the last full
  snapshot, and re-verify live rather than trusting it as current.
- Deployment/CI details beyond what's in the security handover.
- Anything in the marketing site repo (`Trimora-systems`) — entirely
  separate codebase, not touched by this inventory.
