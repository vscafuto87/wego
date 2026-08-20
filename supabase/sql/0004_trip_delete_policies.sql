-- Nessuna policy "delete" esisteva finora su tv_trips/tv_trip_members (solo
-- select/insert/update in 0001/0002): senza queste, un viaggio sincronizzato
-- non si può cancellare dal client. L'owner cancella l'intero viaggio (la
-- cascata su tv_trip_members è già "on delete cascade" da 0001); un membro
-- cancella solo la propria riga di iscrizione, cioè esce dal viaggio senza
-- toccarlo per gli altri.

drop policy if exists "tv_trips_delete" on tv_trips;
create policy "tv_trips_delete" on tv_trips for delete
  using (owner_id = auth.uid());

drop policy if exists "tv_trip_members_delete_self" on tv_trip_members;
create policy "tv_trip_members_delete_self" on tv_trip_members for delete
  using (user_id = auth.uid());
