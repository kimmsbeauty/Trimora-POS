-- 097_pet_archiving.sql
--
-- Trimora Pet -- archive pets instead of deleting them.
--
-- STATUS: written for owner review. NOT applied anywhere. Apply by hand in the
-- Supabase SQL Editor only after the owner says "apply 097".
--
-- WHY: a pet that has passed away, moved away or is no longer active must stay
-- in the books. Pets with bookings, boarding stays or invoices can't be deleted
-- (RESTRICT foreign keys), so until now there was no way to retire them.
--
-- WHAT IT DOES (additive; nothing is dropped, no row is rewritten):
--   1. pet_pets.archived_at / archived_reason (NULL = active). Existing pets
--      stay active.
--   2. Trigger pet_pets_archive_guard: stamps archived_at with server time, only
--      allows the reasons below, refuses to archive a pet that still has an
--      upcoming/active booking or boarding stay (PET_HAS_ACTIVE_WORK), and
--      clears the reason on restore.
--   3. Triggers on pet_bookings and pet_boarding_stays (INSERT only) refuse NEW
--      work for an archived pet (PET_ARCHIVED). Existing history, invoices and
--      payments are untouched, and past records keep showing the pet's name.
--
-- Restoring = setting archived_at back to NULL. Nothing is ever deleted.
-- Species is NOT touched here: 083 already has a CHECK on pet_pets.species.
--
-- ROLLBACK (loses only the archive flags, never pets):
--   drop trigger if exists pet_stays_archived_guard on public.pet_boarding_stays;
--   drop trigger if exists pet_bookings_archived_guard on public.pet_bookings;
--   drop trigger if exists pet_pets_archive_guard on public.pet_pets;
--   drop function if exists public.pet_block_archived_pet();
--   drop function if exists public.pet_archive_guard();
--   drop index if exists public.pet_pets_active_idx;
--   alter table public.pet_pets drop column if exists archived_reason;
--   alter table public.pet_pets drop column if exists archived_at;

alter table public.pet_pets
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

alter table public.pet_pets
  add constraint pet_pets_archived_reason_chk
  check (
    archived_reason is null
    or (archived_at is not null
        and archived_reason in ('passed-away', 'moved-away', 'inactive', 'other'))
  );

create index if not exists pet_pets_active_idx
  on public.pet_pets (salon_id, lower(name)) where archived_at is null;

create or replace function public.pet_archive_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    -- archiving: stamp server time, require a reason, refuse while work is open
    new.archived_at := now();
    if new.archived_reason is null then new.archived_reason := 'inactive'; end if;
    if exists (
      select 1 from public.pet_bookings b
      where b.pet_id = new.id and b.status in ('booked', 'checked-in', 'in-progress', 'ready')
    ) or exists (
      select 1 from public.pet_boarding_stays s
      where s.pet_id = new.id and s.status in ('reserved', 'occupied')
    ) then
      raise exception 'PET_HAS_ACTIVE_WORK';
    end if;
  elsif new.archived_at is null then
    new.archived_reason := null;              -- restored (or never archived)
  else
    new.archived_at := old.archived_at;       -- already archived: keep the original date
  end if;
  return new;
end;
$$;

create trigger pet_pets_archive_guard
  before update on public.pet_pets
  for each row execute function public.pet_archive_guard();

create or replace function public.pet_block_archived_pet()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.pet_pets p where p.id = new.pet_id and p.archived_at is not null) then
    raise exception 'PET_ARCHIVED';
  end if;
  return new;
end;
$$;

create trigger pet_bookings_archived_guard
  before insert on public.pet_bookings
  for each row execute function public.pet_block_archived_pet();

create trigger pet_stays_archived_guard
  before insert on public.pet_boarding_stays
  for each row execute function public.pet_block_archived_pet();
