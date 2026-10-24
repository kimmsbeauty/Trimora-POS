-- 087_pet_audit_log.sql
--
-- Trimora Pet -- traceability: an append-only audit trail for every Pet table.
--
-- STATUS: applied to production 2026-10-24 on the owner's instruction (no Supabase branch
-- on the free plan). Tested first on the staging project against stub tables (see "How this
-- was tested"). Verified live from the catalog afterwards: RLS on, one SELECT-only policy,
-- six audit triggers, no anon access, authenticated cannot insert/update/delete, trigger
-- function not client-callable, 0 audit rows, 0 pet businesses at the time.
--
-- ADDITIVE ONLY: one new table, two functions, and AFTER triggers on the six existing
-- pet_* tables. Nothing existing is altered; no Salon/Auto object is touched.
--
-- WHAT IT RECORDS (per insert / update / delete on pet_pets, pet_vaccinations,
-- pet_customer_profiles, pet_services, pet_roles, pet_staff_roles):
--   table, row id, operation, the NAMES of the changed columns (never the values),
--   the device login (auth.uid(), asserted by the server), and the staff member named in
--   the optional X-Pet-Actor request header (asserted by the client, validated here).
--
-- WHY NAMES, NOT VALUES: pet and owner data (contact details, care notes, later medical
-- notes) must not be copied into a second table. "Who changed what field, when" is
-- enough to trace an action; the current value lives in the row itself.
--
-- HONEST LIMITS (v1, PIN login unchanged -- owner decision):
--   * All staff on a device share one database identity. acted_by_staff_id comes from a
--     header the app sets from a "Working as" picker. The server only checks that the id
--     is a staff row of the SAME business. It is attribution, not authentication: a
--     person could pick someone else's name. actor_asserted=true marks such rows.
--   * Any signed-in device of the business can READ its audit rows (no per-person
--     enforcement until Phase 7). The log is append-only for clients: no insert, update
--     or delete policy exists; only the SECURITY DEFINER trigger writes.
--   * Reads are not logged (RLS does not allow it).
--
-- How this was tested: 34 assertions on the pet staging project (own tenant only, results
-- rolled back): insert/update/delete audited; names-only; no-op update writes nothing;
-- valid / cross-tenant / malformed actor header; clients cannot insert, edit or delete
-- audit rows; cross-tenant and anon reads return nothing.
--
-- ROLLBACK (destroys the audit history only):
--   drop trigger if exists pet_pets_audit on public.pet_pets;  -- repeat for each table below
--   drop table if exists public.pet_audit_log;
--   drop function if exists public.pet_audit_row();

create table public.pet_audit_log (
  id                bigint generated always as identity primary key,
  salon_id          uuid not null references public.salons(id) on delete cascade,
  table_name        text not null,
  row_id            uuid not null,
  op                text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  changed_columns   text[] not null default '{}',
  device_user_id    uuid,                              -- auth.uid(): server-asserted
  acted_by_staff_id uuid,                              -- X-Pet-Actor, validated: client-asserted
  actor_asserted    boolean not null default false,
  created_at        timestamptz not null default now()
);
create index pet_audit_log_salon_time_idx on public.pet_audit_log (salon_id, created_at desc);
create index pet_audit_log_row_idx on public.pet_audit_log (salon_id, table_name, row_id);

-- Trigger function: metadata only. A malformed actor header must never block a real write,
-- it just records "no valid actor". The audit insert itself is NOT swallowed: if the audit
-- cannot be written the business write fails (fail closed).
create or replace function public.pet_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_changed text[] := '{}';
  v_hdr text;
  v_actor uuid;
  v_asserted boolean := false;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from jsonb_object_keys(to_jsonb(new)) k
    where k <> 'updated_at' and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k);
    if coalesce(array_length(v_changed, 1), 0) = 0 then
      return null;
    end if;
  end if;

  begin
    v_hdr := nullif(btrim(coalesce((current_setting('request.headers', true))::json ->> 'x-pet-actor', '')), '');
    if v_hdr is not null then
      v_asserted := true;
      select st.id into v_actor from public.staff st where st.id = v_hdr::uuid and st.salon_id = r.salon_id;
    end if;
  exception when others then
    v_actor := null;
  end;

  insert into public.pet_audit_log
    (salon_id, table_name, row_id, op, changed_columns, device_user_id, acted_by_staff_id, actor_asserted)
  values
    (r.salon_id, tg_table_name, r.id, tg_op, v_changed, auth.uid(), v_actor, v_asserted);
  return null;
end;
$$;

create trigger pet_pets_audit              after insert or update or delete on public.pet_pets              for each row execute function public.pet_audit_row();
create trigger pet_vaccinations_audit      after insert or update or delete on public.pet_vaccinations      for each row execute function public.pet_audit_row();
create trigger pet_customer_profiles_audit after insert or update or delete on public.pet_customer_profiles for each row execute function public.pet_audit_row();
create trigger pet_services_audit          after insert or update or delete on public.pet_services          for each row execute function public.pet_audit_row();
create trigger pet_roles_audit             after insert or update or delete on public.pet_roles             for each row execute function public.pet_audit_row();
create trigger pet_staff_roles_audit       after insert or update or delete on public.pet_staff_roles       for each row execute function public.pet_audit_row();

-- RLS: read own business only. No write policies: only the trigger writes.
alter table public.pet_audit_log enable row level security;

create policy "pet_audit_log_select_own_salon"
  on public.pet_audit_log for select
  to authenticated
  using (salon_id = auth_salon_id());

-- Grants: anon nothing; authenticated read-only. (This project's default privileges grant
-- EXECUTE on new functions to anon/authenticated directly -- see README -- so revoke it
-- by role, not just from PUBLIC.)
revoke all on public.pet_audit_log from anon;
revoke all on public.pet_audit_log from authenticated;
grant select on public.pet_audit_log to authenticated;
revoke execute on function public.pet_audit_row() from public, anon, authenticated;
