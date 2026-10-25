-- 096_pet_delete_kennel_fix.sql
--
-- Trimora Pet -- small fix to pet_delete_kennel() from 089.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply only after the
-- owner says "apply 096".
--
-- THE PROBLEM: pet_delete_kennel() was meant to answer KENNEL_HAS_STAYS when a
-- kennel with stay history is deleted. It catches foreign_key_violation (SQLSTATE
-- 23503), but pet_boarding_stays.kennel_id is ON DELETE RESTRICT, and Postgres
-- reports that as restrict_violation (SQLSTATE 23001), a different error. So the
-- delete IS refused (nothing is lost), but the app receives a raw database message
-- instead of "This kennel has stay history, so it can't be deleted. Put it in
-- maintenance instead." and shows its generic error.
--
-- THE FIX: catch both error types. Same signature and grants (create or replace
-- keeps them). Nothing else changes.
--
-- ROLLBACK: re-run the pet_delete_kennel definition from 089_pet_boarding.sql.

create or replace function public.pet_delete_kennel(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_salon uuid := auth_salon_id();
begin
  if v_salon is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform 1 from public.pet_kennels where id = p_id and salon_id = v_salon for update;
  if not found then raise exception 'KENNEL_NOT_FOUND'; end if;
  delete from public.pet_kennels where id = p_id and salon_id = v_salon;
exception
  when foreign_key_violation or restrict_violation then
    raise exception 'KENNEL_HAS_STAYS';
end;
$$;
