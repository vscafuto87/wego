# Login obbligatorio e sincronizzazione di default

Data: 2026-08-20
Stato: approvato, in attesa di piano di implementazione

## Contesto

Oggi l'identità (login magic link) è un dettaglio nascosto dentro al singolo
viaggio: ogni viaggio nasce puramente locale (IndexedDB) e diventa cloud solo
se si preme "Attiva sincronizzazione" da quel viaggio, un passaggio per
viaggio, ripetuto ogni volta che serve (es. prima di poter caricare un
allegato PDF alla prenotazione, che vive nel bucket Storage e richiede un
`remoteId`). La Home mostra sempre e solo quello che è già salvato
localmente sul device: non esiste un concetto di "i miei viaggi" legato
all'account, quindi due device dello stesso utente non vedono la stessa
lista finché non si ripete a mano il join per ogni viaggio.

Questo lavoro sposta l'identità un livello più in alto: un login obbligatorio
una tantum all'apertura dell'app (persistito offline da `supabase-js` via
`localStorage`, nessuna richiesta di rete ai riavvii successivi), dopo il
quale **ogni** viaggio — creato, importato o seed — è sincronizzato di
default, e la Home mostra i viaggi legati all'account (owner o membro),
aggiornati dal server quando c'è rete e letti dalla cache locale quando non
c'è.

Decisioni raccolte in brainstorming:

- Il login diventa un gate bloccante all'apertura dell'app, non più un passo
  opzionale per-viaggio. La sessione persiste offline: si accede una volta,
  poi l'app resta usabile senza rete come oggi.
- Ogni viaggio nuovo (creato, importato, seed) viene sincronizzato
  immediatamente — nessuno step "Attiva sincronizzazione" separato. Creare un
  viaggio richiede quindi la rete (coerente col fatto che serve già per il
  login iniziale); aprire e modificare viaggi già esistenti resta offline.
- I due viaggi seed (`seed/trips.json`) non sono più un'eccezione: al primo
  login diventano viaggi sincronizzati come qualunque altro, di proprietà
  dell'account che li vede per primo.
- I viaggi già presenti localmente su un device (dal modello attuale, alcuni
  già sincronizzati, altri no) vengono **adottati** automaticamente nel primo
  login dopo l'aggiornamento: nessuna modifica già fatta va persa.
- Eliminare un viaggio richiede la rete (simmetrico alla creazione): l'owner
  cancella il viaggio per tutti, un membro esce solo per sé. Questo richiede
  due nuove policy `delete` su Supabase, che oggi non esistono.
- `ActivateSyncModal.jsx` viene rimosso (nessuno step manuale da premere).
  `JoinView.jsx` si riduce a una conferma singola, perché email e nome sono
  già noti a quel punto del flusso.

## 1. Login gate

`App.jsx` tiene lo stato di sessione con `getSession()`/`subscribeAuth()`
(già in `data/supabase.js`, nessuna modifica lì). Il rendering, in ordine:

1. sessione non ancora nota → spinner (come oggi per `trips === null`);
2. sessione nota e assente → `LoginGate`, schermo intero, **prima** di
   qualunque altro branch, `joinCode` compreso: chi apre `/j/<codice>` da
   freddo passa comunque da qui;
3. sessione presente → prosegue con il bootstrap dei viaggi (sezione 2), poi
   il routing attuale (`home | trip | import`), `JoinView` inclusa se c'è un
   `joinCode`.

`LoginGate` è una nuova vista che riusa `MagicLinkForm` e `DisplayNameForm`
esattamente come oggi fa `ActivateSyncModal`: email → (redirect magic link) →
nome visualizzato, salvato una volta sola con `setDisplayNamePreference`. Da
qui in avanti ogni punto del codice che oggi chiede il nome (join, attivazione)
lo legge silenziosamente con `getDisplayNamePreference()`, senza richiederlo
di nuovo.

La persistenza offline della sessione non richiede codice nuovo:
`@supabase/supabase-js` scrive il token in `localStorage` e lo rilegge senza
rete; `getSession()` restituisce l'utente loggato anche a device offline.

Se `isCloudConfigured` è `false` (env locali non configurate, es. dev senza
`.env.local`), il gate non blocca: l'app si comporta come oggi, perché non
c'è comunque un backend a cui autenticarsi. Riguarda solo l'ambiente di
sviluppo, non un requisito prodotto.

## 2. Bootstrap e riconciliazione della lista viaggi

Dopo il login, prima di mostrare la Home, `App.jsx` esegue un passaggio di
bootstrap sopra a `loadTrips()`:

1. **Adozione**: ogni viaggio locale senza `syncState` (seed appena creati,
   viaggi "vecchio modello" mai attivati, viaggi creati offline in una
   sessione precedente e mai spinti) viene sincronizzato chiamando
   `activateTripSync(trip, displayName)` — la stessa funzione già usata da
   `ActivateSyncModal` oggi, invariata. È il meccanismo di migrazione
   automatica per i dati già sui telefoni: nessun caso speciale per i seed,
   passano dalla stessa strada. Se l'adozione fallisce perché si è tornati
   offline subito dopo il login, i viaggi restano semplicemente senza
   `syncState` e vengono ritentati al prossimo bootstrap online — stesso
   pattern di retry-su-`online` già usato in `TripView`.
2. **Pull della lista remota** (solo se online): una nuova funzione
   `listMyTrips()` in `data/sync.js` legge `tv_trips` — le RLS esistenti
   filtrano già da sole per `owner_id = auth.uid()` o membership, quindi non
   serve una query nuova complessa, solo un `select` semplice.
   - righe remote il cui `id` non corrisponde a nessun `syncState.remoteId`
     locale → nuovo viaggio per questo device: si scarica `data`, si
     normalizza, si genera un `id` locale nuovo, si salva il `syncState`
     (stesso pattern già usato da `finishJoin` per il join singolo).
   - viaggi locali il cui `syncState.remoteId` non compare più tra le righe
     visibili (eliminato dall'owner, o membership rimossa) → tolti dalla
     lista locale. È il meccanismo con cui un viaggio smette di essere
     visibile.
   - viaggi locali già noti (hanno un `syncState` e il loro `remoteId` è
     ancora nella lista remota) → **non toccati qui**: restano gestiti dalla
     logica di sync già esistente in `TripView` (`syncTrip`, dirty, pull,
     conflitto), che gira quando quel viaggio viene aperto o quando torna la
     rete. Questo passaggio serve solo a decidere quali viaggi compaiono in
     Home, non a sincronizzarne il contenuto — evita di sovrascrivere una
     modifica locale non ancora inviata.
3. Se offline, il passo 2 si salta e la Home mostra semplicemente l'ultima
   lista nota in IndexedDB — comportamento identico a oggi.

## 3. Sincronizzazione di default alla creazione

`createTrip`/`importTrips` in `App.jsx`, dopo `normalizeTrip`, chiamano
`activateTripSync(trip, displayName)` prima di `persist`/`openTrip`. Se la
chiamata fallisce (tipicamente: offline), si mostra un errore leggibile e il
viaggio non viene creato — niente coda offline per la creazione, coerente con
la scelta raccolta in brainstorming.

`ActivateSyncModal.jsx` viene rimosso: non c'è più un momento in cui un
viaggio esiste senza `syncState`, quindi non serve un'azione manuale per
attivarlo. `Settings.jsx` mostra sempre l'azione "Condividi" (link
`/j/<shareCode>`, già disponibile in `syncState.shareCode`) al posto dello
stato "attiva sincronizzazione".

`JoinView.jsx` si riduce a un'unica conferma: quando la si raggiunge la
sessione e il nome sono già garantiti dal gate, quindi bastano "Ti hanno
invitato al viaggio, vuoi unirti?" e un tasto che chiama `joinTripByCode`
(invariata).

## 4. Eliminare un viaggio

Oggi non esiste nessuna policy `delete` su `tv_trips`/`tv_trip_members`
(verificato in `0001_cloud_schema.sql`/`0002_fix_rls_recursion.sql`): una
riga sincronizzata, una volta creata, non si può cancellare dal client. Con
la lista che ora si aggiorna dal server (sezione 2), questo diventerebbe un
bug visibile — un viaggio "eliminato" solo localmente ricomparirebbe al primo
bootstrap online successivo, perché la riga remota esiste ancora.

Nuova migrazione `supabase/sql/0004_trip_delete_policies.sql`:

```sql
drop policy if exists "tv_trips_delete" on tv_trips;
create policy "tv_trips_delete" on tv_trips for delete
  using (owner_id = auth.uid());

drop policy if exists "tv_trip_members_delete_self" on tv_trip_members;
create policy "tv_trip_members_delete_self" on tv_trip_members for delete
  using (user_id = auth.uid());
```

La cancellazione di `tv_trips` cascata già su `tv_trip_members`
(`on delete cascade`, esistente).

Lato client, `deleteTrip(id)` in `App.jsx` distingue in base a
`syncState.role`:

- `'editor'` (in pratica sempre l'owner: oggi nessuna UI promuove un membro a
  editor) → `supabase.from('tv_trips').delete().eq('id', remoteId)`: il
  viaggio sparisce per tutti;
- `'viewer'` → `supabase.from('tv_trip_members').delete().eq('trip_id', remoteId).eq('user_id', session.user.id)`:
  esce dal viaggio, che resta per gli altri.

Se la chiamata fallisce (offline), si mostra un errore e non si rimuove nulla
localmente — simmetrico alla creazione, nessuna coda di eliminazioni da
gestire offline.

Fuori scope, solo annotato: cancellare `tv_trips` non ripulisce i PDF nel
bucket `trip-attachments` collegati (nessuna relazione tra Storage e le
tabelle). Non è un problema introdotto da questo lavoro; un giro successivo
se servirà.

## 5. Cosa non cambia

- Il formato del documento viaggio (`schema.js`) è invariato.
- La logica di sync per-viaggio già in `TripView.jsx`/`sync.js`
  (`syncTrip`, `decideSyncAction`, debounce, conflitto, indicatore di stato,
  retry su `online`/`visibilitychange`) resta esattamente com'è: il bootstrap
  della sezione 2 decide solo quali viaggi compaiono, non come si
  sincronizza il loro contenuto.
- `activateTripSync`, `pullTrip`, `pushTrip`, `joinTripByCode`,
  `restoreLastVersion`, `uploadLodgingAttachment` e le relative funzioni di
  `sync.js` non cambiano firma.
- Le quattro sezioni fisse, i tipi di sezione, le palette e tutte le altre
  decisioni bloccate in `CLAUDE.md` non sono toccate.

## 6. Testing

- `sync.test.js`: nuovi test per `listMyTrips()` (righe restituite/filtrate
  da RLS — verificabile mockando il client come già fatto per le altre
  funzioni del file) e per le due chiamate di delete (editor vs viewer).
- Verifica manuale offline (`npm run build && npm run preview`, DevTools →
  Network → Offline), sui casi:
  - riapertura app già loggati, senza rete → Home mostra la lista in cache,
    nessuna schermata di login;
  - creare un viaggio offline → errore leggibile, nessun viaggio orfano;
  - eliminare un viaggio offline → errore leggibile, viaggio ancora presente;
  - device "vecchio modello" con viaggi locali non sincronizzati → al primo
    login dopo l'aggiornamento, tutti compaiono con `syncState` valido e un
    link d'invito funzionante.
- Verifica con due account reali (tu + un amico): condivisione via
  `share_code`, un owner elimina il viaggio → sparisce dalla Home dell'altro
  al bootstrap successivo online; un viewer esce dal viaggio → il viaggio
  resta per l'owner.
