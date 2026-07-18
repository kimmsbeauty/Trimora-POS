-- 063_add_subscription_fields_to_public_salon_directory.sql
-- RECOVERED 2026-07-18: applied directly to production on 2026-07-14 (20260714002054) but had no corresponding file in this repo until now.
-- Backfilled verbatim from supabase_migrations.schema_migrations and spot-verified
-- against live schema state (2026-07-18) before being added here.


CREATE OR REPLACE VIEW public.public_salon_directory AS
SELECT
    s.slug,
    s.name,
    s.id,
    s.suspended,
    ss.primary_color,
    ss.secondary_color,
    ss.logo_url,
    ss.tagline,
    ss.mpesa_till,
    ss.mpesa_name,
    ss.contact_phone,
    ss.mpesa_paybill,
    ss.mpesa_account,
    ss.mpesa_send_money_phone,
    ss.enabled_payment_methods,
    s.business_type,
    sub.plan AS subscription_plan,
    sub.status AS subscription_status,
    sub.expires_at AS subscription_expires_at
FROM salons s
LEFT JOIN salon_settings ss ON ss.salon_id = s.id
LEFT JOIN salon_subscriptions sub ON sub.salon_id = s.id;
