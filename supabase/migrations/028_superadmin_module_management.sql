-- 027_superadmin_module_management.sql
--
-- Applied live via Supabase MCP on 2026-07-09, reconciled here.
--
-- Gives the super admin a working read+write path over
-- salon_enabled_modules for the first time. That table's own migration
-- (019_auto_module_foundation.sql) deliberately left it admin-managed
-- only with no insert/update/delete policy for anyone, on the
-- assumption toggling would happen via service-role -- i.e. exactly the
-- raw-SQL-via-MCP approach used earlier in this project to enable Auto
-- for Kimms. This migration replaces that with a real dashboard path,
-- following the same auth.jwt() -> 'app_metadata' ->> 'is_super_admin'
-- pattern already used by suspend_salon/reactivate_salon rather than
-- opening new RLS policies on the table directly.

CREATE OR REPLACE FUNCTION public.superadmin_set_module(p_salon_id uuid, p_module_key text, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not (
    select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false)
  ) then
    raise exception 'Access denied: super admin only';
  end if;

  if not exists (select 1 from salons where id = p_salon_id) then
    raise exception 'Salon not found: %', p_salon_id;
  end if;

  insert into salon_enabled_modules (salon_id, module_key, enabled, enabled_at)
  values (p_salon_id, p_module_key, p_enabled, now())
  on conflict (salon_id, module_key)
  do update set enabled = excluded.enabled, enabled_at = now();
end;
$function$;

-- Extends salon_directory (locked down in migration 025) with Auto
-- module status per salon, so the dashboard's existing single
-- loadData() call (already fetching salon_directory) carries this for
-- free -- no new query, no new RLS surface. CREATE OR REPLACE VIEW
-- preserves the view's existing grants (verified live: still just
-- `authenticated: SELECT`, no anon) and its is_super_admin WHERE guard
-- from migration 025 -- only the SELECT list and a new LEFT JOIN
-- changed.
CREATE OR REPLACE VIEW public.salon_directory AS
SELECT s.id, s.salon_number, s.name, s.slug, s.created_at, s.suspended, s.suspended_at, s.suspended_reason,
    ss.logo_url, ss.primary_color, ss.mpesa_till, ss.contact_phone,
    sub.plan AS subscription_plan, sub.status AS subscription_status,
    sub.expires_at AS subscription_expires_at, sub.amount_paid AS subscription_amount_paid,
    (SELECT count(*) FROM staff st WHERE st.salon_id = s.id) AS staff_count,
    (SELECT count(*) FROM services sv WHERE sv.salon_id = s.id) AS service_count,
    (SELECT count(*) FROM sales sa WHERE sa.salon_id = s.id) AS sale_count,
    (SELECT COALESCE(sum(sa.total), 0::bigint) FROM sales sa WHERE sa.salon_id = s.id) AS total_revenue,
    (SELECT count(*) FROM customers c WHERE c.salon_id = s.id) AS customer_count,
    COALESCE(auto_mod.enabled, false) AS auto_enabled,
    auto_mod.enabled_at AS auto_enabled_at
FROM salons s
LEFT JOIN salon_settings ss ON ss.salon_id = s.id
LEFT JOIN salon_subscriptions sub ON sub.salon_id = s.id
LEFT JOIN salon_enabled_modules auto_mod ON auto_mod.salon_id = s.id AND auto_mod.module_key = 'auto'
WHERE coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false) = true
ORDER BY s.created_at DESC;
