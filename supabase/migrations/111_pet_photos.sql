-- 111_pet_photos.sql
--
-- Trimora Pet: photos of a pet, kept on the pet's profile.
--
-- STATUS: APPLIED to production 2026-10-27 as "111_pet_photos" (it was first drafted as 109, but 109 and
-- 110 were already taken by other migrations, so it was renumbered). Verified afterwards against the
-- catalog: same columns, CHECK constraint, six policies (3 table, 3 storage) and bucket settings as below.
-- NOT yet exercised with a real photo upload from the app.

-- WHAT IT ADDS (additive only; nothing existing is changed)
--   * public.pet_photos: one row per photo (salon_id, pet_id, storage_path, created_at).
--   * A PRIVATE storage bucket 'pet-photos'. Object keys are  {salon_id}/{pet_id}/{timestamp}-{name}.
--     Photos are shown through short-lived signed URLs, never public links.
--   * Row level security on the table and on the bucket, same pattern as vehicle_photos (020):
--     a business can only read, add or delete its own photos.
--   * Bucket limits: 8 MB per file; JPEG, PNG, WebP, HEIC/HEIF only.
--
-- HONEST LIMITS
--   * Deleting a pet deletes its photo ROWS (cascade) but not the files in storage; stray files
--     are small and private. A clean-up job can remove them later.
--   * Who may delete is a UI rule (admin only), like the rest of Pet: the database cannot tell
--     staff from admin on a shared device yet.
--
-- ROLLBACK (loses photo records and files):
--   drop policy if exists "pet_photos_bucket_delete_own_salon" on storage.objects;
--   drop policy if exists "pet_photos_bucket_insert_own_salon" on storage.objects;
--   drop policy if exists "pet_photos_bucket_select_own_salon" on storage.objects;
--   delete from storage.objects where bucket_id = 'pet-photos';
--   delete from storage.buckets where id = 'pet-photos';
--   drop table if exists public.pet_photos;

create table public.pet_photos (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  pet_id uuid not null references public.pet_pets(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now(),
  -- the file must live under this business and this pet
  constraint pet_photos_path_ck check (storage_path like salon_id::text || '/' || pet_id::text || '/%')
);

create index pet_photos_salon_pet_idx on public.pet_photos (salon_id, pet_id, created_at desc);
create unique index pet_photos_path_uidx on public.pet_photos (storage_path);

alter table public.pet_photos enable row level security;

create policy "pet_photos_select_own_salon"
  on public.pet_photos for select
  to authenticated
  using (salon_id = auth_salon_id());

create policy "pet_photos_insert_own_salon"
  on public.pet_photos for insert
  to authenticated
  with check (
    salon_id = auth_salon_id()
    and exists (
      select 1 from public.pet_pets p
      where p.id = pet_id and p.salon_id = auth_salon_id()
    )
  );

create policy "pet_photos_delete_own_salon"
  on public.pet_photos for delete
  to authenticated
  using (salon_id = auth_salon_id());

revoke all on public.pet_photos from anon;
revoke truncate, references, trigger on public.pet_photos from authenticated;
-- photos are added or removed, never edited
revoke update on public.pet_photos from authenticated;

-- Storage bucket: private, 8 MB, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-photos', 'pet-photos', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy "pet_photos_bucket_select_own_salon"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth_salon_id()::text
  );

create policy "pet_photos_bucket_insert_own_salon"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth_salon_id()::text
  );

create policy "pet_photos_bucket_delete_own_salon"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth_salon_id()::text
  );
