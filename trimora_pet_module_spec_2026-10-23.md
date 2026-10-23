# Trimora Pet — Build Spec (third business module in Trimora-POS)

Read this fully before writing code. It is the contract for every session working on Pet.

## 1. What we are building and where

- **Target:** a new **Pet** module inside the existing **Trimora-POS** repo (`kimmsbeauty/Trimora-POS`, branch `main`), running on the existing live Supabase project `ukoccobbjeomjwjcvrma`.
- **Pattern to copy:** Trimora **Auto** (the second business). Pet is the third. Read `src/pages/AutoApp.jsx`, `src/pages/auto/*`, and migrations 019, 028, 033, 035 before starting.
- **Visual and behavioural reference:** the Lovable prototype **Trimora PetCare**. The owner approved it: "that's exactly what I want the PetCare POS to look like."
  - Project: https://lovable.dev/projects/eb045c8e-d9a1-49c1-84f9-3fa6e9c2a03e (id `eb045c8e-d9a1-49c1-84f9-3fa6e9c2a03e`)
  - Preview: https://id-preview--eb045c8e-d9a1-49c1-84f9-3fa6e9c2a03e.lovable.app
  - Its code is TanStack Start + Tailwind + shadcn. **Do not copy that code or stack into this repo.** Read it for layout, copy, states and data shapes, then rebuild each screen in Trimora-POS's own style (section 4).
- **Do not use** the separate Supabase project `Trimora Pet care` (`cxaiyhlaosfsymjgjyby`) as the production database. It duplicates auth, PINs, subscriptions and superadmin. Its `pet_*` permission tables may be ported into the POS database later (section 8); then that project should be paused.

## 2. Hard constraints (from this repo's own history)

1. **Additive only.** Pet must be deployable and switch-off-able without changing behaviour for Salon (POS) or Auto. Never alter existing tables destructively.
2. **This is live production** (real salons, sales, PIN logins). Test migrations on a Supabase **branch** first, then apply. Never run experiments on the production DB.
3. **RLS on every new table**, scoped with `auth_salon_id()`. Revoke anon grants by default (migrations 029, 032, 040, 044 and 077 show why). Add an anon policy only where a public page truly needs it, and scope it.
4. **Tenant scoping in `src/lib/db.js`:** every tenant-owned `pet_*` table must have a `salon_id` column and be added to `TENANT_TABLES`. Add to `PRE_LOGIN_READABLE_TENANT_TABLES` only for a deliberate anon-read policy. Extend `tenantScoping.test.js` and `db.tenantFilterInjection.test.js` for the new tables.
5. **Do not touch PIN or pgcrypto functions** (migrations 006, 026, 027, 036, 042). Any new `SECURITY DEFINER` function sets an explicit `search_path`.
6. **Migration numbering:** parallel sessions have caused numbering collisions. Run `git pull` and check the highest number in `supabase/migrations/` right before creating one (last seen: 080). Follow `supabase/migrations/README.md`.
7. **Git safety:** never force-push, rebase, amend or squash pushed commits. Small commits to `main` only if that is the repo's workflow, otherwise a PR. CI (`npm ci`, `npm run build`, `npm run test`) must pass.
8. **No secrets in the repo, ever** (tokens, service keys, M-Pesa credentials). The repo is public.
9. **Follow the existing code style:** React with `function`/`var` style, inline styles, the `db()` wrapper from `src/lib/db.js`. Do not introduce Tailwind, shadcn, TypeScript or a new router.

## 3. How a business module plugs in (mirror Auto)

| Piece | Auto today | Pet to add |
|---|---|---|
| Route | `/:slug/auto` → `DeviceGate > SalonGate > AutoApp` in `src/App.jsx` | `/:slug/pet` → same wrappers → `PetApp` |
| Entry file | `src/pages/AutoApp.jsx` | `src/pages/PetApp.jsx` |
| Pages | `src/pages/auto/*` | `src/pages/pet/*` |
| Theme | `src/pages/auto/theme.js` | `src/pages/pet/theme.js` (section 4) |
| Gate | `ModuleGate` reads `salon_enabled_modules` with `module_key=eq.auto&enabled=eq.true` | same with `module_key=eq.pet` and a calm "Trimora Pet isn't turned on" screen |
| Login | shared `LoginPage` with `isAuto` | shared `LoginPage` with a new `isPet` prop, no new auth |
| Shared core tables | `staff`, `customers`, `stock`, `salons` | reuse them; do not copy |
| Own tables | `auto_*` | `pet_*` |
| Business type | `salons.business_type` allows `'salon'`, `'auto'` | allow `'pet'` too (migration 035 pattern) |
| Onboarding | invite with `module_key='auto'` sets `business_type='auto'` | invite with `module_key='pet'` sets `business_type='pet'` (check `create_invite`, `validate_invite`, `complete_salon_onboarding`, `superadmin_set_module` do not hard-code `'auto'`) |
| Rating page | `/:slug/auto/rate/:token` | `/:slug/pet/rate/:token` later, optional |
| Superadmin | module management, health, analytics | add Pet to module management and platform stats (section 7) |

## 4. Visual contract (must match Lovable)

**Tokens.** Put these in `src/pages/pet/theme.js` as exported constants (hex converted from Lovable's oklch tokens). Never hardcode hex anywhere else in Pet code.

| Token | Hex | Use |
|---|---|---|
| BACKGROUND | `#FAF9F6` | page background |
| FOREGROUND | `#1B1E24` | main text |
| CARD | `#FFFFFF` | cards, popovers |
| PRIMARY (gold) | `#E1AC41` | primary actions, active icon, accents |
| PRIMARY_FG | `#201707` | text on gold |
| MUTED | `#F3F1ED` | secondary surfaces |
| MUTED_FG | `#61666E` | secondary text |
| ACCENT | `#F3ECDB` | soft gold surface |
| ACCENT_FG | `#382C15` | text on accent |
| BORDER | `#E5E3DD` | borders, inputs |
| DESTRUCTIVE | `#CC2827` | delete, errors |
| SUCCESS | `#14874E` | paid, current, ready |
| WARNING | `#D0852D` | due soon, low stock |
| INFO | `#3082B5` | info chips |
| VIOLET | `#8864C0` | tone for staff and charts |
| SIDEBAR | `#101318` | sidebar background |
| SIDEBAR_FG | `#ECEBE7` | sidebar text |
| SIDEBAR_MUTED | `#8F9298` | inactive nav, captions |

Radius base **12px** (cards 12 to 16px, buttons and inputs 8 to 12px). Dark mode is out of scope for v1.

**Fonts:** Manrope (body), Fraunces (headings and brand). The production CSP has `font-src 'self' data:`, so Google Fonts will be **blocked**. Self-host via `@fontsource/manrope` and `@fontsource/fraunces` (bundled by Vite), or update the CSP in `vercel.json` deliberately. Do not hot-link fonts.

**Layout (exact, from Lovable `app-shell.tsx`):**
- Desktop: fixed left sidebar 256px wide, `SIDEBAR` background. Mobile (< 1024px): sticky 56px top bar with menu button, brand and a slide-in 288px drawer.
- Brand block: 40px gold rounded square with a paw icon, "Trimora PetCare" in Fraunces ~15px semibold, caption "BY TRIMORA SYSTEMS" 10px uppercase, wide letter spacing, `SIDEBAR_MUTED`.
- Nav item: 13px medium, 8px 12px padding, 8px radius. Active: translucent white background (7%), 4px gold bar on the left edge, gold icon. Hover: 60% of that.
- Footer: user card (initials in a gold-tinted circle, name, role), business name and city, and a small gold status line.
- Content: max width 1200px, padding 16 / 24 / 32px (mobile / tablet / desktop), 24 to 32px vertical.
- Print: hide sidebar and controls on print; invoices and receipts must print cleanly.

**Nav order** (icons as in Lovable; use inline SVG or an existing icon approach in the repo, no new icon library unless approved):

Overview, Calendar & Bookings, Customers, Pets, Grooming, Boarding, Invoices & Payments, Supplies & Inventory, Loyalty Programme, Staff & Permissions, Reports, Settings. **Add "Checkout" directly under Overview.**

Admin-only tabs follow the existing admin/staff split from `LoginPage` (see `AutoApp.jsx` `adminOnly`).

## 5. Screens and the Lovable file to read for each

Read the Lovable file for each screen (via the Lovable MCP `read_file` or the synced repo) and match layout, copy, empty states and status colours. Demo data in `src/data/mock.ts` is the **data contract**, never production data.

| Pet screen | Lovable source | Notes |
|---|---|---|
| Overview | `src/routes/index.tsx` | KPIs, today's schedule, boarding overview, activity, quick actions |
| Calendar & Bookings | `src/routes/calendar.tsx` | day/week/month, step-by-step new booking |
| Customers | `customers.tsx`, `customers.$customerId.tsx` | reuse the shared `customers` table |
| Pets | `pets.tsx`, `pets.$petId.tsx` | search and filter by name, species, breed; edit and delete; vaccination records (vaccine, given date, next due, status `current` / `due-soon` / `overdue`) |
| Grooming | `grooming.tsx` | service catalogue and workflow board |
| Boarding | `boarding.tsx` | kennels, stays, occupancy timeline |
| Invoices & Payments | `invoices.tsx`, `invoices.$invoiceId.tsx` | printable invoice, record payment |
| Supplies & Inventory | not built in Lovable yet | follow roadmap: stock, low-stock alerts, movements |
| Loyalty | not built | tiers, points, rewards, rules |
| Staff & Permissions | not built | see decision D1 |
| Reports | not built | charts with the existing `recharts` |
| Settings | not built | settings plus "what's prototype vs backend" notes removed once live |

## 6. Checkout (the POS piece)

New screen, same visual language. **Reuse the POS machinery; do not reimplement it:** `saleLogic.js`, `cartMath.js`, `loyalty.js`, `Receipt.jsx` (make a `PetReceipt.jsx` like `AutoReceipt.jsx`), `MpesaPaymentModal.jsx`, the `mpesa-stk-push` and `mpesa-callback` edge functions, split payments and refunds (migration 069), tax settings (068) and receipt customisation (070).

- Left: customer and pet picker (walk-in allowed), catalogue tabs for **Services** and **Products**, search.
- Right: cart with qty stepper, line price, remove; optional link to a booking that is checked-in, in-progress or ready.
- Adjustments: discount (amount or %), loyalty redeem, notes.
- Totals: subtotal, discount, tax if enabled, total, paid, balance.
- Payment: Cash, Card, M-Pesa, Split. Partial payment leaves the invoice `partial`.
- Completing a sale creates the invoice, records payments, deducts product stock, awards loyalty points, and opens the printable receipt. Do it in **one transaction** (an RPC), not several client calls.
- Currency is **KES**; follow the repo's existing money convention (check how `sales` stores amounts before choosing integer or decimal).

## 7. Database (migrations, in this order)

Verify each of these against the live schema before writing SQL; this list is a plan, not a finished design.

1. `business_type` check allows `'pet'`; confirm `create_invite`, `validate_invite`, `complete_salon_onboarding`, `superadmin_set_module` accept `module_key='pet'`.
2. Pet core tables, each with `id uuid`, `salon_id uuid not null references salons(id) on delete cascade`, `created_at`, RLS on: `pet_pets` (owner → shared `customers`), `pet_vaccinations`, `pet_services`, `pet_bookings` and `pet_booking_services`, `pet_kennels`, `pet_boarding_stays`, `pet_invoices` and `pet_invoice_items`, `pet_payments`, `pet_loyalty_*` as needed.
3. Stock: first read migration 021 and `auto_stock_movements` to see how Auto uses the shared `stock` table, then mirror that (`pet_stock_movements`) rather than inventing a second stock system.
4. Platform stats: fold Pet revenue into superadmin stats (see migrations 039 and 076). **Known past bug: Auto revenue was missing from platform-wide stats.** Do not repeat it.
5. Staff roles and permissions: see D1.

Naming mirrors Lovable's types (`Customer`, `Pet`, `Booking`, `BoardingStay`, `Kennel`, `Invoice`, `StockItem`, `StockMove`, `Loyalty`) and its status enums (`VaccStatus`, `BookingStatus`, `InvoiceStatus`, `KennelStatus`). Keep the same status values in the UI and the database.

## 8. Order of work

1. Branch. Migration 081: allow `'pet'`, module key plumbing. Superadmin can enable Pet for a business.
2. `PetApp.jsx`, `ModuleGate`, route `/:slug/pet`, `pet/theme.js`, self-hosted fonts, sidebar shell. Visually identical to Lovable's shell with placeholder pages.
3. Pets, vaccinations and customers (real tables, tenant-scoped, tests).
4. Bookings and calendar, grooming board, boarding.
5. Checkout, invoices, payments, receipts (M-Pesa last).
6. Inventory, loyalty, reports, settings, staff.
7. Superadmin stats, health and analytics for Pet; end-to-end run on a branch DB; then production.

## 9. Open decisions for the owner (do not guess)

- **D1 Staff roles.** Lovable shows Owner/Admin, Manager, Groomer, Receptionist. POS today has only staff and admin. Recommended v1: use staff/admin, show the role as a label, port the `pet_permissions` tables later.
- **D2 Pet onboarding.** New pet businesses join through the invite flow with `module_key='pet'`, or an existing business gets Pet switched on from superadmin (like "add an existing salon")?
- **D3 The `Trimora Pet care` Supabase project.** Pause or delete once its permission tables are ported.
- **D4 Branding.** Brand text "Trimora PetCare" vs the module name "Trimora Pet".

## 10. Definition of done for any change

- Matches the Lovable preview visually, side by side, at desktop and mobile widths.
- Uses only `pet/theme.js` tokens and the two approved fonts; no new UI library.
- New tables have RLS and `salon_id`, are in `TENANT_TABLES`, and have tests.
- `npm run build` and `npm run test` pass; Salon and Auto behave exactly as before.
- Pet disabled for a business = clean "not turned on" screen, no errors.
- Anything that deviates from this spec is listed in the commit or PR and flagged to the owner.
