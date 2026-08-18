-- Corregge un bug di 0001_cloud_schema.sql: le policy di tv_trips e
-- tv_trip_members si leggevano a vicenda, causando "infinite recursion
-- detected in policy" su ogni lettura. Da eseguire una volta sola sul
-- progetto dove 0001 è già stato applicato. Idempotente: si può rieseguire
-- senza problemi.

create or replace function is_trip_member(target_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from tv_trip_members m where m.trip_id = target_trip_id and m.user_id = auth.uid());
$$;

create or replace function is_trip_editor(target_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from tv_trip_members m where m.trip_id = target_trip_id and m.user_id = auth.uid() and m.role = 'editor');
$$;

create or replace function is_trip_owner(target_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from tv_trips t where t.id = target_trip_id and t.owner_id = auth.uid());
$$;

drop policy if exists "tv_trips_select" on tv_trips;
create policy "tv_trips_select" on tv_trips for select
  using (
    owner_id = auth.uid()
    or is_trip_member(id)
  );

drop policy if exists "tv_trips_update" on tv_trips;
create policy "tv_trips_update" on tv_trips for update
  using (
    owner_id = auth.uid()
    or is_trip_editor(id)
  );

drop policy if exists "tv_trip_members_select" on tv_trip_members;
create policy "tv_trip_members_select" on tv_trip_members for select
  using (
    user_id = auth.uid()
    or is_trip_owner(trip_id)
  );

drop policy if exists "tv_trip_members_insert_self" on tv_trip_members;
create policy "tv_trip_members_insert_self" on tv_trip_members for insert
  with check (
    user_id = auth.uid()
    and (
      role = 'viewer'
      or is_trip_owner(trip_id)
    )
  );
