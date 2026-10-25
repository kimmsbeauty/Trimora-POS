-- 097_preflight_checks.sql -- READ-ONLY. Run before applying 097; every count should be 0
-- except where noted. Changes nothing.
select 'pets with a species outside Dog/Cat/Rabbit/Other (blocked already by pet_pets_species_check)' as check_name,
       count(*) as n from public.pet_pets where species not in ('Dog', 'Cat', 'Rabbit', 'Other')
union all
select 'pets total (information only)', count(*) from public.pet_pets
union all
select 'existing columns named archived_at / archived_reason (must be 0)', count(*)
  from information_schema.columns where table_schema = 'public' and table_name = 'pet_pets'
   and column_name in ('archived_at', 'archived_reason')
union all
select 'bookings whose service is restricted to other species (information: history is NOT changed)', count(*)
  from public.pet_booking_services bs
  join public.pet_bookings b on b.id = bs.booking_id
  join public.pet_pets p on p.id = b.pet_id
  join public.pet_services s on s.id = bs.service_id
 where cardinality(s.species) > 0 and not (p.species = any (s.species))
union all
select 'live pet_create_booking / pet_create_stay present (must be 2)', count(*)
  from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
 where n.nspname = 'public' and pr.proname in ('pet_create_booking', 'pet_create_stay');
