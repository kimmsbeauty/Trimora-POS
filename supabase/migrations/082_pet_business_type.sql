-- 082_pet_business_type.sql
--
-- Trimora Pet, step 1 of 2: allow salons.business_type = 'pet'.
--
-- Why this is the ONLY schema change needed for the module plumbing
-- (verified by reading the latest definition of each function):
--   * complete_salon_onboarding (035) writes coalesce(invite.module_key,'salon')
--     straight into salons.business_type and into salon_enabled_modules.
--   * create_invite (031) and superadmin_set_module (028) accept any text key.
--   * validate_invite (033) returns module_key as-is.
--   * salon_enabled_modules.module_key is unconstrained text (019).
-- The single thing that rejects 'pet' today is the CHECK from migration 035.
--
-- Additive and reversible. Existing rows are 'salon' or 'auto' and still
-- satisfy the wider constraint, so no data changes. The DO block runs in one
-- transaction: there is no moment where the table has no constraint.
--
-- The existing constraint was created inline (unnamed), so Postgres chose its
-- name. Rather than assume it, find every CHECK on public.salons that mentions
-- business_type and replace it with one explicitly named constraint.
--
-- NOT touched here (later Pet phases): salon_directory / platform_stats /
-- combined P&L views. Until Pet revenue is folded in (see 039 and 076),
-- platform_stats counts only business_type='salon' in total_salons and
-- 'auto' in total_car_washes, so Pet tenants are in neither number.
--
-- ROLLBACK (only valid while no business has business_type='pet'; otherwise
-- Postgres refuses with a check violation, which is the intended safeguard):
--   ALTER TABLE public.salons DROP CONSTRAINT salons_business_type_check;
--   ALTER TABLE public.salons ADD CONSTRAINT salons_business_type_check
--     CHECK (business_type IN ('salon', 'auto'));
--
-- Apply to a Supabase branch first, never straight to production.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'salons'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%business_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.salons DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.salons
    ADD CONSTRAINT salons_business_type_check
    CHECK (business_type IN ('salon', 'auto', 'pet'));
END
$$;
