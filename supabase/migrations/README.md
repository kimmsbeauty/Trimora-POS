# Trimora POS — Database Migrations

All schema changes run against the Supabase project `ukoccobbjeomjwjcvrma`.

## How to apply

1. Go to **Supabase → SQL Editor**
2. Open the migration file
3. Copy-paste the SQL and run it
4. Confirm "Success. No rows returned"

Migrations are numbered and must be run in order on a fresh database.
On the live database, each has already been run — do NOT re-run them
unless you are setting up a new Supabase project.

## Migration history

| File | Date | Description |
|---|---|---|
| `001_subscription_plans.sql` | 2026-06-30 | Subscription plan prices table + Super Admin price editor |
| `002_salon_number.sql` | 2026-06-30 | Human-readable salon number (#001, #002...) |
| `003_payment_methods.sql` | 2026-06-30 | Multiple M-Pesa payment methods per salon |
| `004_public_salon_directory_v2.sql` | 2026-06-30 | Expose new payment columns to booking page |
| `005_salon_directory_v2.sql` | 2026-06-30 | Expose salon_number to Super Admin dashboard |
| `006_pin_security_bcrypt.sql` | 2026-06-30 | Upgrade PIN hashing from MD5 to bcrypt |
| `007_audit_log.sql` | 2026-06-30 | Super Admin audit trail table + RPCs |
| `008_super_admin_update_salon.sql` | 2026-06-30 | Super Admin can edit salon details directly |

## RPCs in supabase/sql/ (also already run)

| File | Description |
|---|---|
| `super_admin_reset_pin.sql` | Super Admin can reset any salon's PIN |
| `super_admin_update_salon.sql` | Full version with comments |
| `audit_log.sql` | Full version with comments |

## Notes

- `public_salon_directory` — anon-readable, used by booking page and DeviceGate
- `salon_directory` — authenticated, used by Super Admin only
- All RPCs use `SECURITY DEFINER` + JWT `is_super_admin` check
- PIN hashing: bcrypt (work factor 10) via pgcrypto. Legacy MD5 rows
  auto-upgrade to bcrypt on next successful login.
