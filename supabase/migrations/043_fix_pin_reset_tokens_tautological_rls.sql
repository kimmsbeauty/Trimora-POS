-- Fix a broken RLS policy on pin_reset_tokens (audit Low-2 follow-up:
-- full RLS policy sweep across all tenant tables).
--
-- The existing INSERT/UPDATE policies used:
--   salon_id IN (SELECT pin_reset_tokens.salon_id FROM auth.users u WHERE u.id = auth.uid())
-- This is tautological: the subquery references the row's own salon_id
-- and only actually checks "is the caller authenticated at all" via
-- auth.users directly, never joining through salon_auth_users the way
-- every other tenant table's policies do via auth_salon_id(). In
-- principle this let any authenticated device (any salon) write rows
-- under any other salon's salon_id.
--
-- Confirmed this table is currently unused by the application (grepped
-- src/ and every Edge Function; only referenced in a test file, and no
-- SELECT policy exists at all -- default-deny read), so this was not
-- exploitable through any live feature. Fixing the logic anyway rather
-- than leaving broken scaffolding in place, since the column set
-- (staff_id, role, token, expires_at, used_at) suggests a real
-- "forgot PIN" reset feature was intended.
--
-- Replaced with the same auth_salon_id() pattern used by every other
-- tenant-scoped policy in this schema.
--
-- Applied directly to the live DB and verified 2026-07-16: new policy
-- definitions confirmed via pg_policies, table confirmed still at 0
-- rows (no behavior to break -- nothing in the app touches this table).

DROP POLICY IF EXISTS admin_can_create_reset_tokens ON public.pin_reset_tokens;
DROP POLICY IF EXISTS admin_can_update_reset_tokens ON public.pin_reset_tokens;

CREATE POLICY admin_can_create_reset_tokens
  ON public.pin_reset_tokens
  FOR INSERT
  TO public
  WITH CHECK (salon_id = auth_salon_id());

CREATE POLICY admin_can_update_reset_tokens
  ON public.pin_reset_tokens
  FOR UPDATE
  TO public
  USING (salon_id = auth_salon_id());
