# Dashboard admin per la preparazione dei viaggi

Data: 2026-08-19
Stato: approvato, in attesa di piano di implementazione

## Contesto

Oggi l'unico modo per popolare un viaggio è: editing manuale sparso dentro le
viste da telefono (`Overview`, `Days`, `Section`, `Transport`, `Lodging`,
`MapSection`), oppure incollare un JSON generato da Claude in `ImportView`.
Il primo è scomodo per inserire molti dati (itinerario di più giorni, tutte
le sezioni) da schermo di telefono; il secondo richiede passare da un JSON
scritto a mano o da Claude.

Questo lavoro introduce una **dashboard admin**, una sezione separata
dell'app pensata per la preparazione a tavolino (desktop), che permette di
creare un viaggio da zero e modificare comodamente tutto ciò che è visibile
nell'app: metadati del viaggio, persone, giorni/itinerario, e tutte e sei le
sezioni (`cards`, `checklist`, `notes`, `transport`, `lodging`, `map`).

Non è un nuovo prodotto: stesso schema dati, stesso storage (IndexedDB),
stessa sincronizzazione Supabase. È una superficie di editing alternativa,
ottimizzata per desktop invece che per mobile.

Decisioni raccolte in brainstorming:

- **Perché**: l'editing mobile esistente resta com'è (va bene in viaggio, per
  piccoli aggiustamenti); la dashboard risolve la preparazione iniziale, che
  è scomoda da telefono e manca di una vista d'insieme.
- **Collocazione**: rotta separata `/admin`, non una modalità responsive
  dentro l'app da viaggio — layout proprio, non vincolato al mobile-first
  `max-w-2xl` del resto dell'app (che resta invariato).
- **Creazione**: la dashboard permette anche di creare un viaggio nuovo da
  zero, non solo modificare viaggi esistenti.
- **Permessi**: riservata al proprietario del viaggio. Il modello attuale
  (ruoli `editor`/`viewer` su `tv_trip_members`) non distingue un
  proprietario dagli altri editor invitati; per la dashboard serve un
  controllo più stretto basato su `tv_trips.owner_id` (colonna già
  esistente, non usata oggi lato client).
- **Componenti**: viste admin scritte da zero in una cartella dedicata,
  non riuso dei componenti mobile esistenti — riuso solo del layer dati
  (`schema.js`, `storage.js`, `sync.js`). I componenti mobile sono pensati
  per interazioni touch/modali a schermo singolo; forzarli in un layout da
  tavolino avrebbe mescolato due scopi diversi nello stesso file.

## Routing e accesso

- `App.jsx` riconosce `pathname === '/admin'` con lo stesso pattern già
  usato per `/j/CODE` (regex su `window.location.pathname` in uno stato
  iniziale, nessun router aggiunto). Se matcha, monta `AdminApp` al posto
  del routing `home | trip | import` esistente.
- `AdminApp` carica `trips` da `storage.js` (stesso local-first di oggi) e
  mostra:
  - una schermata di login (`MagicLinkForm` esistente) se non c'è sessione
    Supabase attiva — necessaria per il controllo di proprietà sui viaggi
    sincronizzati;
  - altrimenti la lista dei viaggi con un bottone "Nuovo viaggio".
- **Gate proprietario**: per un viaggio sincronizzato, l'editor si abilita
  solo se `session.user.id === syncState.ownerId`. Serve estendere
  `syncState` con `ownerId`, letto da `tv_trips.owner_id`:
  - `activateTripSync` lo imposta a `session.user.id` (chi attiva la sync è
    il proprietario);
  - `pullTrip` e il flusso di join (`joinTrip`/accesso via `share_code`) lo
    leggono dalla riga `tv_trips` e lo riportano in `syncState`.
  - Se l'utente loggato ha una sessione ma non è proprietario del viaggio
    (es. è editor invitato), la dashboard mostra il viaggio in sola lettura
    con un messaggio, non lo nasconde.
- Per un viaggio **solo locale** (mai sincronizzato) non esiste ancora un
  proprietario lato server: l'editor resta sempre abilitato, come per il
  resto dell'app local-first.

## Struttura viste

Nuova cartella `src/admin/`, un componente per file:

- `AdminApp.jsx` — auth gate, caricamento viaggi, smistamento lista/editor.
- `AdminTripList.jsx` — elenco viaggi + "Nuovo viaggio".
- `AdminTripEditor.jsx` — contenitore per un viaggio: navigazione tra "Info
  viaggio", "Giorni", una voce per ciascuna `trip.sections[]` (nell'ordine
  esistente) e "+ Aggiungi sezione".
- `AdminMetaForm.jsx` — nome, emoji, luogo, date, palette, persone
  (aggiungi/rimuovi).
- `AdminDaysEditor.jsx` — giorni e voci itinerario, campi specifici per
  `kind` (sentiero/spiaggia/pasto) via `dayItemFieldsForKind` già in
  `schema.js`.
- `AdminSectionEditor.jsx` — smista per `section.type` verso:
  `AdminCardsEditor.jsx`, `AdminChecklistEditor.jsx`, `AdminNotesEditor.jsx`,
  `AdminTransportEditor.jsx`, `AdminLodgingEditor.jsx`, `AdminMapEditor.jsx`
  (solo campi: nessun selettore punto su mappa interattiva in questo giro).

La logica di aggiungi/rimuovi sezione libera, oggi dentro `Overview.jsx`,
viene estratta in una funzione condivisa (in `schema.js` o un piccolo
modulo dedicato) richiamata sia da `Overview` sia da `AdminTripEditor`,
per non duplicarla.

## Dati e sincronizzazione

- Nessuna scrittura parallela: gli editor admin leggono/scrivono lo stesso
  documento JSON (`normalizeTrip`/`exportTrip`) e passano dalle stesse
  funzioni di persistenza di oggi — `loadTrips`/`saveTrips` (IndexedDB) e
  `pushTrip`/`pullTrip`/`syncTrip` (Supabase), incluso `stampModified` per
  tracciare chi ha modificato cosa.
- Unica estensione allo stato: `ownerId` dentro `syncState` (vedi sopra).
  Non tocca lo schema del viaggio (`schema.js` → `normalizeTrip`/
  `exportTrip` restano invariati) né le migrazioni Supabase esistenti.
- Offline: passando da `storage.js`, la dashboard funziona offline sui
  viaggi locali come il resto dell'app; la sincronizzazione resta
  best-effort come oggi.

## Errori e copy

Stesso tono del resto dell'app: frasi dirette, niente scuse, riuso di
`Modal`/`Btn`/pattern di stile esistenti.

## Test

Coerente con la convenzione attuale del progetto (i componenti vista non
hanno test automatici, si verificano a mano):

- Test unitari solo per la logica non-UI nuova: estensione di `syncState`
  con `ownerId` in `sync.test.js`; la funzione condivisa
  aggiungi/rimuovi-sezione, se estratta in `schema.js`, in `schema.test.js`.
- Verifica manuale finale: creare un viaggio da `/admin`, popolarlo (giorni,
  tutte e 6 le sezioni, persone), controllare che appaia identico aprendo
  lo stesso viaggio su mobile, poi ripetere offline (`npm run build && npm
  run preview`, DevTools → Network → Offline).

## Fuori scopo (non in questo giro)

- Selezione punto su mappa interattiva nell'editor `map` (resta solo campi
  lat/lng manuali, come oggi in `MapSection.jsx`).
- Qualsiasi cambiamento al modello di ruoli `editor`/`viewer` oltre alla
  lettura di `owner_id` già esistente in `tv_trips`.
- Layout responsive della dashboard per mobile: è pensata per desktop, non
  serve renderla usabile da telefono.
