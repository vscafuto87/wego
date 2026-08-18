create table if not exists tv_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  share_code text not null unique,
  data jsonb not null,
  previous_data jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists tv_trip_members (
  trip_id uuid references tv_trips(id) on delete cascade,
  user_id uuid references auth.users(id),
  role text not null default 'viewer',
  display_name text,
  primary key (trip_id, user_id)
);

alter table tv_trips enable row level security;
alter table tv_trip_members enable row level security;

drop policy if exists "tv_trips_select" on tv_trips;
create policy "tv_trips_select" on tv_trips for select
  using (
    owner_id = auth.uid()
    or exists (select 1 from tv_trip_members m where m.trip_id = tv_trips.id and m.user_id = auth.uid())
  );

drop policy if exists "tv_trips_insert" on tv_trips;
create policy "tv_trips_insert" on tv_trips for insert
  with check (owner_id = auth.uid());

drop policy if exists "tv_trips_update" on tv_trips;
create policy "tv_trips_update" on tv_trips for update
  using (
    owner_id = auth.uid()
    or exists (select 1 from tv_trip_members m where m.trip_id = tv_trips.id and m.user_id = auth.uid() and m.role = 'editor')
  );

drop policy if exists "tv_trip_members_select" on tv_trip_members;
create policy "tv_trip_members_select" on tv_trip_members for select
  using (
    user_id = auth.uid()
    or exists (select 1 from tv_trips t where t.id = tv_trip_members.trip_id and t.owner_id = auth.uid())
  );

drop policy if exists "tv_trip_members_insert_self" on tv_trip_members;
create policy "tv_trip_members_insert_self" on tv_trip_members for insert
  with check (user_id = auth.uid());

create or replace function join_trip(code text, display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_trip_id uuid;
begin
  select id into target_trip_id from tv_trips where share_code = code;
  if target_trip_id is null then
    raise exception 'Codice non valido';
  end if;

  insert into tv_trip_members (trip_id, user_id, role, display_name)
  values (target_trip_id, auth.uid(), 'viewer', display_name)
  on conflict (trip_id, user_id) do update set display_name = excluded.display_name;

  return target_trip_id;
end;
$$;
