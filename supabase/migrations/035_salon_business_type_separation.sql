-- 035_salon_business_type_separation.sql
--
-- Applied live via Supabase MCP on 2026-07-12, reconciled here.
--
-- Per explicit instruction: salons and car washes are two genuinely
-- separate, unrelated businesses, not just a module toggle on the same
-- entity. auto_enabled (salon_enabled_modules) answers "does this
-- business have Auto access" -- Kimms is business_type='salon' AND
-- auto_enabled=true, because it's a real salon that also runs a
-- car-wash side. business_type answers a different question: "which
-- product identity does this business have," set once at onboarding
-- time and never changed by toggling the module on/off afterward.
-- These are deliberately orthogonal, not the same flag renamed.
--
-- A car wash created through the Auto-specific onboarding flow
-- (+Onboard/+Invite from the Car Washes tab, or an approved Auto
-- Request -- anywhere create_invite is called with p_module_key='auto')
-- gets business_type='auto' automatically from here on. A salon that
-- had Auto added later via superadmin_set_module (the "add an existing
-- salon" picker) stays business_type='salon', correctly, since it went
-- through regular salon onboarding first.

ALTER TABLE public.salons ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'salon' CHECK (business_type IN ('salon', 'auto'));

-- One-time backfill: "High point carwash" was onboarded through the
-- Auto invite flow before this column existed. Keyed by slug so this
-- is safe to re-run.
UPDATE public.salons SET business_type = 'auto' WHERE slug = 'high-point-carwash' AND business_type != 'auto';

-- complete_salon_onboarding: sets business_type from the invite's
-- module_key at creation time (coalesced to 'salon' for a regular
-- invite). Everything else byte-for-byte unchanged from migration 031
-- -- search_path, crypt()/gen_salt() calls, the #variable_conflict
-- pragma, all untouched. Verified live in rolled-back transactions
-- before this was committed: an 'auto' invite produces business_type=
-- 'auto', a regular invite produces business_type='salon', and staff/
-- admin PINs still bcrypt-hash and crypt()-verify correctly.
CREATE OR REPLACE FUNCTION public.complete_salon_onboarding(p_salon_name text, p_slug text, p_staff_pin text, p_admin_pin text, p_token text)
RETURNS TABLE(salon_id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_salon_id uuid;
  v_module_key text;
begin
  update salon_invites
  set used = true, used_at = now()
  where token = p_token
    and used = false
    and expires_at > now()
  returning module_key into v_module_key;

  if not found then
    raise exception 'Invalid, expired, or already-used invite token';
  end if;

  insert into salons (name, slug, business_type)
  values (p_salon_name, p_slug, coalesce(v_module_key, 'salon'))
  returning id into v_salon_id;

  insert into salon_auth_users (id, salon_id)
  values (auth.uid(), v_salon_id);

  insert into salon_pins (role, pin_hash, hash_version, salon_id)
  values
    ('staff', crypt(p_staff_pin, gen_salt('bf', 10)), 'bcrypt', v_salon_id),
    ('admin', crypt(p_admin_pin, gen_salt('bf', 10)), 'bcrypt', v_salon_id);

  insert into salon_settings (salon_id)
  values (v_salon_id);

  if v_module_key is not null then
    insert into salon_enabled_modules (salon_id, module_key, enabled, enabled_at)
    values (v_salon_id, v_module_key, true, now())
    on conflict (salon_id, module_key) do update set enabled = true, enabled_at = now();
  end if;

  return query select v_salon_id, p_slug;
end;
$function$;

-- public_salon_directory (anon-readable, resolves :slug on /pos and
-- /auto routes): business_type appended at the end of the SELECT list
-- -- CREATE OR REPLACE VIEW rejects inserting a column mid-list (hit
-- this live: "cannot change name of view column"), so it has to go
-- last. Verified live afterward that anon/authenticated grants were
-- unchanged (still SELECT/REFERENCES/TRIGGER only, from the earlier
-- least-privilege cleanup).
CREATE OR REPLACE VIEW public.public_salon_directory AS
SELECT s.slug, s.name, s.id, s.suspended,
    ss.primary_color, ss.secondary_color, ss.logo_url, ss.tagline,
    ss.mpesa_till, ss.mpesa_name, ss.contact_phone, ss.mpesa_paybill,
    ss.mpesa_account, ss.mpesa_send_money_phone, ss.enabled_payment_methods,
    s.business_type
FROM salons s
LEFT JOIN salon_settings ss ON ss.salon_id = s.id;

-- salon_directory (super admin, migration 028/029): business_type
-- appended, same column-ordering constraint as above.
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
    auto_mod.enabled_at AS auto_enabled_at,
    (SELECT count(*) FROM auto_bays ab WHERE ab.salon_id = s.id) AS auto_bay_count,
    (SELECT count(*) FROM auto_services asv WHERE asv.salon_id = s.id AND asv.active = true) AS auto_service_count,
    (SELECT count(*) FROM auto_jobs aj WHERE aj.salon_id = s.id) AS auto_job_count,
    (SELECT max(aj.completed_at) FROM auto_jobs aj WHERE aj.salon_id = s.id AND aj.status = 'completed') AS auto_last_job_completed_at,
    s.business_type
FROM salons s
LEFT JOIN salon_settings ss ON ss.salon_id = s.id
LEFT JOIN salon_subscriptions sub ON sub.salon_id = s.id
LEFT JOIN salon_enabled_modules auto_mod ON auto_mod.salon_id = s.id AND auto_mod.module_key = 'auto'
WHERE coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false) = true
ORDER BY s.created_at DESC;

-- platform_stats: total_salons/active_salons/suspended_salons now count
-- business_type='salon' only, not every salons row -- the "Total
-- Salons" card on the dashboard would otherwise have counted car washes
-- too, contradicting the whole point of this migration. Added
-- total_car_washes as its own count.
CREATE OR REPLACE VIEW public.platform_stats AS
SELECT * FROM (
  SELECT
    (SELECT count(*) FROM salons WHERE business_type = 'salon') AS total_salons,
    (SELECT count(*) FROM salons WHERE business_type = 'salon' AND salons.suspended = false) AS active_salons,
    (SELECT count(*) FROM salons WHERE business_type = 'salon' AND salons.suspended = true) AS suspended_salons,
    (SELECT count(*) FROM sales) AS total_sales,
    (SELECT COALESCE(sum(sales.total), 0::bigint) FROM sales) AS total_revenue,
    (SELECT count(*) FROM customers) AS total_customers,
    (SELECT count(*) FROM bookings) AS total_bookings,
    (SELECT count(*) FROM salons WHERE business_type = 'auto') AS total_car_washes
) t
WHERE coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false) = true;
