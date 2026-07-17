-- Fixes a live production bug: every salon with the Auto module enabled
-- was showing "Trimora Auto isn't turned on for this business yet" to
-- every visitor, regardless of actual enablement state. Root cause:
-- salon_enabled_modules has RLS enabled with only one policy --
-- "staff can read own salon's enabled modules", scoped to `authenticated`
-- via auth_salon_id(). AutoApp.jsx's ModuleGate checks this table BEFORE
-- the login screen even renders (by design -- a disabled module shouldn't
-- show a login screen at all), so that check always runs as `anon`, which
-- had no policy at all and therefore saw zero rows no matter what the
-- data actually said.
--
-- anon has no session, so it can't be scoped via auth_salon_id() the way
-- the authenticated policy is -- this follows the same precedent as
-- public_salon_directory: trust the client-supplied salon_id filter
-- (already auto-injected by db.js's TENANT_TABLES handling), since
-- module_key/enabled is non-sensitive business config, not the kind of
-- data that needs protecting from enumeration the way staff names or
-- payment amounts do.

create policy "anon can read enabled modules (pre-login gate check)"
  on public.salon_enabled_modules
  for select
  to anon
  using (true);
