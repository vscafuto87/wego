-- Bucket privato per gli allegati PDF delle prenotazioni. Path degli oggetti:
-- <id-viaggio-su-tv_trips>/<uuid>.pdf — il primo segmento del path è l'id del
-- viaggio, usato dalle policy sotto per verificare la membership senza
-- duplicare logica: riusa is_trip_member/is_trip_editor già definite in
-- 0001_cloud_schema.sql per rompere la ricorsione tra le policy di
-- tv_trips/tv_trip_members.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-attachments', 'trip-attachments', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "trip_attachments_select" on storage.objects;
create policy "trip_attachments_select" on storage.objects for select
  using (
    bucket_id = 'trip-attachments'
    and is_trip_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_attachments_insert" on storage.objects;
create policy "trip_attachments_insert" on storage.objects for insert
  with check (
    bucket_id = 'trip-attachments'
    and is_trip_editor(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_attachments_delete" on storage.objects;
create policy "trip_attachments_delete" on storage.objects for delete
  using (
    bucket_id = 'trip-attachments'
    and is_trip_editor(((storage.foldername(name))[1])::uuid)
  );
