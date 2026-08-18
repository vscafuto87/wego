# Fase 1 — Cloud: auth, sync, invito via link, presenza, cronologia minima

Data: 2026-08-18
Stato: approvato, in attesa di piano di implementazione

## Contesto

Fase 0 è completa e verificata offline (vedi memoria di progetto). L'app oggi è
puramente locale: nessun concetto di utente, nessuna rete, nessun router. Questa
fase aggiunge il livello cloud descritto in CLAUDE.md — Supabase (progetto
`yloymohhoigvcchtexdb`, tabelle `tv_`), auth magic link, sync — restando fedele al
principio local-first: l'app deve continuare a funzionare per intero senza account
e senza rete.

Decisioni guida raccolte in fase di brainstorming (vedi conversazione):

- Attivazione sync **per viaggio**, non login globale: ogni viaggio ha un proprio
  pulsante "Attiva sync"; gli altri viaggi restano solo locali finché non attivati.
- Presenza ("modificato da") a **livello di singola voce editabile**.
- Cronologia minima: **un solo livello indietro**, nessun vero versioning.
- Routing del link di invito: **manuale, zero dipendenze nuove** (niente
  react-router-dom).
- Motore di sync: **pull-based** (poll su apertura viaggio, evento `online`, dopo
  scrittura locale), niente Supabase Realtime — coerente con "l'offline non è un
  extra, è il requisito principale": niente stato di connessione persistente da
  gestire in condizioni di rete instabile (montagna, isola).

## 1. Flusso utente

**Owner che attiva la sync su un viaggio:**

1. In `TripView`, un viaggio non ancora attivato mostra l'azione "Attiva sync".
2. Se non esiste ancora una sessione Supabase, l'app chiede l'email e invia il
   magic link (`supabase.auth.signInWithOtp`). Schermata "controlla la mail".
3. Al ritorno in app (redirect con token, gestito da `onAuthStateChange`), se è la
   prima volta in assoluto che l'utente attiva un viaggio su questo dispositivo,
   viene chiesto una volta "Come ti chiamiamo?" (nome visualizzato). Il nome viene
   salvato anche come preferenza locale del dispositivo (`idb-keyval`), riusata per
   i prossimi viaggi senza richiederlo di nuovo.
4. Viene creata la riga in `tv_trips` (owner_id, `data` = `exportTrip(trip)`,
   `share_code` generato), e l'owner viene inserito in `tv_trip_members` con
   `role='editor'` e il suo `display_name`.
5. Appare il link `wego.app/j/<share_code>` con pulsante "copia link", e il codice
   a 6 caratteri come fallback leggibile a voce.

**Amico che riceve il link:**

1. Apre `wego.app/j/AB12CD`. L'app legge `window.location.pathname` all'avvio; se
   combacia con `/j/:code` mostra una vista di join dedicata (nessun dato del
   viaggio è visibile prima del login: la lettura è protetta da RLS).
2. Login via magic link come sopra.
3. Prima volta sul dispositivo: "Come ti chiamiamo?" (stessa preferenza locale di
   cui sopra).
4. L'app chiama la RPC `join_trip(code, display_name)`. Il viaggio scaricato viene
   normalizzato (`normalizeTrip`) e salvato tra i viaggi locali IndexedDB, ruolo
   `viewer`.
5. Da qui il viaggio si comporta come ogni altro viaggio locale, con lo strato di
   sync sovrapposto (sezione 5).

Il resto dell'app (creazione manuale, caricamento rapido, viaggi mai attivati)
resta invariato.

## 2. Modifiche allo schema del viaggio (`src/data/schema.js`)

Campi nuovi, opzionali, con lo stesso trattamento di tutti gli altri campi in
`normalizeTrip` (stringa vuota se assenti — nessuna eccezione, nessun campo
obbligatorio nuovo):

- `modifiedBy` (string) e `modifiedAt` (string ISO) su: `Day` (per titolo/nota),
  `DayItem`, `CardItem` (sezioni `cards`), `ChecklistItem`, e sulla sezione
  `notes` (accanto a `text`).

Popolati solo quando il viaggio è attivo in sync cloud (aggiornati dal client al
momento della modifica, con il nome dell'autore locale). Per un viaggio
puramente locale restano stringhe vuote: un solo autore, l'attribuzione non
serve e non viene mostrata.

Questi campi sono parte del documento viaggio: vengono esportati e importati
come tutti gli altri. **Non** introduco un formato interno diverso da quello
usato per import/export/Supabase — resta un unico schema, come richiesto.

Non aggiungo altri tipi di sezione né altri campi obbligatori.

## 3. Migrazioni Supabase

Nessuna tabella nuova. Due colonne aggiuntive sulle tabelle già previste in
CLAUDE.md:

```sql
alter table tv_trips add column previous_data jsonb;
alter table tv_trip_members add column display_name text;
```

`previous_data`: prima di ogni scrittura di `data` (sia dal client owner che da
un editor in Fase 2), il valore precedente di `data` viene copiato qui,
sovrascrivendo il valore precedente — un solo livello di rollback per design,
non uno storico.

RPC `join_trip(code text, display_name text)`:
- cerca il viaggio per `share_code`;
- inserisce in `tv_trip_members` (`trip_id`, `user_id` corrente, `role='viewer'`,
  `display_name`);
- esegue con privilegi che permettono la lettura di `tv_trips` per `share_code`
  anche a un utente che non è ancora membro (altrimenti la RLS di lettura
  bloccherebbe la ricerca stessa del viaggio da unirsi).

All'attivazione della sync (creazione della riga `tv_trips`), il client inserisce
anche la riga `tv_trip_members` dell'owner con `role='editor'` — stessa via degli
altri membri, nessun caso speciale per leggere il `display_name` dell'owner nella
presenza.

RLS: invariata rispetto a CLAUDE.md (lettura owner o membro; scrittura owner o
membro `editor`).

## 4. Bookkeeping locale della sync (`src/data/storage.js`)

Il contenuto del viaggio resta quello di sempre. Per ogni viaggio attivato, una
voce separata in IndexedDB, chiave `wego:sync:<localTripId>`:

```js
{ remoteId, shareCode, role, lastSyncedAt, dirty }
```

`dirty` viene impostato a `true` a ogni `saveTrips` che tocca un viaggio
attivato, e a `false` dopo un push riuscito. Questo stato non fa parte del
documento viaggio e non viene mai esportato: è la relazione locale tra questo
dispositivo e la copia cloud, non contenuto del viaggio.

Anche la preferenza "come ti chiamiamo" del dispositivo vive qui come voce
separata (`wego:display-name`), non nel documento viaggio.

## 5. Motore di sync (`src/data/sync.js`, nuovo file)

`syncTrip(localTrip, syncState)` viene invocato:
- all'apertura di un viaggio già attivato (`TripView` in mount);
- su evento `window.addEventListener('online', ...)`;
- dopo ogni scrittura locale che tocca un viaggio attivato, con debounce ~2s.

Logica:

1. Legge `updated_at` remoto per `remoteId`.
2. Se `syncState.dirty === false` → pull silenzioso se `updated_at` remoto è più
   recente di `lastSyncedAt` (aggiorna il viaggio locale, aggiorna
   `lastSyncedAt`).
3. Se `syncState.dirty === true`:
   - se `updated_at` remoto **non** è cambiato dall'ultimo pull noto → push
     (upsert `data` con `exportTrip(trip)` più i campi `modifiedBy`/`modifiedAt`,
     copiando prima il valore corrente in `previous_data`); poi `dirty = false`,
     `lastSyncedAt` aggiornato.
   - se `updated_at` remoto **è** cambiato dall'ultimo pull noto → **conflitto**:
     non sovrascrive nulla, marca lo stato come "conflitto" e lo espone alla UI
     (sezione 6) per la scelta dell'utente.
4. Se `syncState.role === 'viewer'` il push viene sempre saltato (solo pull):
   in Fase 1 solo l'owner può scrivere da remoto; un viewer che modifica
   localmente vede lo stato "modifiche salvate solo su questo telefono" invece
   di "modifiche in coda" (limitazione nota, promozione a `editor` è Fase 2 —
   non anticipata qui).

Risoluzione del conflitto (UI, componente `Modal.jsx` esistente): mostra le due
versioni (per data di modifica, non contenuto riga per riga) e due azioni "Tieni
la versione su questo telefono" (forza push, salvando comunque il remoto in
`previous_data`) o "Tieni la versione online" (pull, scarta le modifiche
locali in sospeso).

## 6. Indicatore di stato sync (UI)

Un puntino + etichetta discreta nell'header di `TripView`, visibile solo per
viaggi attivati:

- 🟢 "sincronizzato" — non dirty, ultimo sync riuscito;
- 🟡 "modifiche in coda" — dirty, online, in attesa del prossimo tentativo o di
  un tentativo in corso;
- ⚪ "in attesa di rete" — offline (`navigator.onLine === false`);
- 🟡 "modifiche salvate solo su questo telefono" — dirty e ruolo `viewer`;
- tocco sul puntino in stato "conflitto" apre la modale di risoluzione.

Nessun polling quando la tab/app non è in foreground (si sincronizza all'evento
`visibilitychange` → `visible`, non con un timer in background).

## 7. Presenza

Ogni voce con `modifiedBy`/`modifiedAt` non vuoti mostra, in piccolo e in tempo
relativo (es. "2 min fa", libreria nessuna — funzione locale minimale in stile
`Intl.RelativeTimeFormat`), "modificato da {modifiedBy} · {tempo relativo}".
Non mostrato per le voci mai toccate da remoto (campi vuoti) né per viaggi non
attivati.

## 8. Cronologia minima

Nel menu del viaggio (accanto a "Elimina"), voce "Ripristina l'ultima versione",
visibile solo se `previous_data` non è nullo per il viaggio attivo. Conferma
(modale) → il client richiede `previous_data`, lo normalizza e lo applica come
viaggio corrente; sul server, `data = previous_data`, `previous_data = null` (un
solo annullamento, nessun redo, nessuno storico di versioni multiple).

## 9. File coinvolti

- `src/data/schema.js` — campi `modifiedBy`/`modifiedAt` (modifica, non
  ristrutturazione).
- `src/data/storage.js` — bookkeeping sync per viaggio, preferenza nome
  dispositivo.
- `src/data/sync.js` — **nuovo**, motore di sync pull-based.
- `src/data/supabase.js` — **nuovo**, client Supabase inizializzato da
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.
- `src/App.jsx` — routing manuale per `/j/:code`, stato sessione auth.
- `src/views/TripView.jsx` — azione "Attiva sync", indicatore di stato,
  presenza sulle voci, voce "Ripristina l'ultima versione".
- `src/views/JoinView.jsx` — **nuova vista**, flusso di join da link.
- Nuova dipendenza: `@supabase/supabase-js` (già nel budget approvato in
  CLAUDE.md).
- Migrazioni SQL (dashboard Supabase o `supabase db push`, mai stack locale):
  le due `alter table` e l'aggiornamento della RPC `join_trip`.

## 10. Fuori scope per questa fase (non anticipare)

Promozione di un membro a `editor` (Fase 2), spese condivise, foto per giorno,
mappa dei luoghi, esportazione in calendario. Nessuna UI di gestione membri
oltre al join stesso. Nessuna vera cronologia con più versioni.

## 11. Test manuale prima del merge

Oltre al consueto `npm run build && npm run preview` con verifica offline:

- Attivare sync su un viaggio, verificare riga creata su Supabase (dashboard).
- Aprire il link di invito da un secondo browser/dispositivo, completare il
  join, verificare che il viaggio appaia con ruolo `viewer`.
- Modificare una voce come owner, verificare che appaia "modificato da" nel
  client viewer dopo un pull.
- Simulare un conflitto (modifica offline su entrambi i lati, poi tornare
  online su entrambi) e verificare che l'app non sovrascriva in silenzio.
- Usare "Ripristina l'ultima versione" e verificare che il ripristino funzioni
  una sola volta (senza `previous_data` residuo dopo l'uso).
