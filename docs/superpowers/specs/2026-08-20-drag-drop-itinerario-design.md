# Drag&drop per riordinare e spostare le voci dell'Itinerario

Data: 2026-08-20

## Obiettivo

Nell'app normale (non l'admin), permettere di trascinare una voce dell'Itinerario
per riordinarla dentro lo stesso giorno o spostarla su un altro giorno. Estendere lo
stesso pattern di trascinamento alle schede della sezione Ristoranti (solo riordino
interno, nessun cambio di sezione).

## Contesto — cosa c'è già

Il drag&drop esiste già, ma solo nella dashboard `/admin` (desktop, HTML5
`draggable` nativo, non adatto al tocco): `src/admin/AdminDaysEditor.jsx` (riordino
voci giorno) e `src/admin/AdminCardsEditor.jsx` (riordino schede). Quel riordino
manipola l'array `day.items`/`section.items`, e in admin l'ordine di visualizzazione
**è** l'ordine dell'array.

Nell'app normale (`src/views/Days.jsx`), invece, `DayItemsList` ricalcola l'ordine
di visualizzazione ordinando per `time` ad ogni render (fondendo anche i trasporti
del giorno, che sono voci di sola lettura calcolate dalla sezione Trasporti via
`collectExternalDayItems`). Quindi oggi l'ordine dell'array `day.items` nell'app
normale è in gran parte invisibile.

## Decisioni

### 1. L'ordine manuale sostituisce l'ordinamento per orario

Nessuna modifica a `schema.js`: l'ordine di visualizzazione diventa l'ordine
dell'array `day.items` (e `section.items` per le schede), come già accade in admin
e nelle sezioni cards. Il campo `time` resta e si continua a mostrare sulla voce,
ma non determina più la posizione.

### 2. I trasporti si separano in un blocco proprio

`DayItemsList` (usata sia da `Days.jsx`/Itinerario sia da `Today.jsx`/Oggi) smette
di fondere voci giorno e trasporti in un'unica lista ordinata per orario. Diventano
due blocchi:

- **Voci del giorno**: ordine manuale, trascinabile (solo in Itinerario — in Oggi
  resta sola lettura, nessuna maniglia).
- **Trasporti**: sola lettura, ordinati per orario come oggi, sotto il primo blocco.

`Today.jsx` eredita il cambiamento automaticamente, riusando lo stesso componente.

### 3. Libreria: dnd-kit

`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`. Scelta perché
supporta touch e mouse nativamente, contenitori multipli (necessario per spostare
una voce tra giorni diversi) e auto-scroll della pagina durante il trascinamento.
Aggiunta al budget dipendenze del progetto (CLAUDE.md).

### 4. Drag libero su tutta la pagina (non un selettore separato)

Un `DndContext` unico avvolge l'intera lista dei giorni in `Days.jsx`. Trascinare
una voce fuori dal proprio giorno, nella lista di un altro giorno più in basso/alto
nella pagina, la sposta lì. L'auto-scroll di dnd-kit (attivo di default) scorre la
pagina quando ci si avvicina al bordo durante il trascinamento.

## Architettura

- **Sensori**: `PointerSensor` (mouse + touch, tramite maniglia dedicata — niente
  ritardo di attivazione necessario perché la maniglia non intercetta lo scroll
  della pagina) e `KeyboardSensor` come fallback accessibile (frecce per spostare,
  Esc per annullare).
- **Contenitori multipli**: ogni giorno è un `SortableContext` verticale
  (`day.items`). Un item può passare da un `SortableContext` all'altro — pattern
  standard "board a più colonne" di dnd-kit. Un giorno senza voci resta comunque
  un'area di drop valida (placeholder minimo, non deve sparire).
- **Stato durante il drag**: mentre si trascina, l'ordine/spostamento vive in uno
  stato locale del componente `Days` (copia di lavoro di `trip.days`), per un
  feedback fluido senza scrivere su IndexedDB/Supabase ad ogni pixel di movimento.
  Al rilascio (`onDragEnd`) si chiama `onUpdate` una sola volta con il risultato
  finale — stesso percorso di persistenza/sincronizzazione di ogni altra modifica
  al viaggio, nessuna gestione speciale.
- **Sezione Ristoranti** (`Section.jsx`, tipo `cards`): stesso pattern ma un solo
  `SortableContext`, nessun contenitore multiplo (le schede non cambiano sezione).
  Il riordino nello stesso array usa `arrayMove` di `@dnd-kit/sortable`; lo
  spostamento tra due array di giorni (solo in `Days.jsx`) è una funzione locale a
  quel file — non serve una nuova cartella `utils/` né un modulo condiviso.

## UX

- **Maniglia dedicata** (icona `GripVertical`, come già in admin) aggiunta a
  `DayItemCard` e alle schede Ristoranti. Solo lì si avvia il trascinamento: tap su
  titolo/matita/cestino continua a funzionare come oggi. Area toccabile ≥44px.
- Durante il drag: la voce trascinata si solleva leggermente (ombra più marcata),
  le altre voci si spostano per fare spazio; il giorno di destinazione si evidenzia
  quando ci si passa sopra (bordo `accent`, stesso linguaggio visivo già usato in
  admin).
- `TransportDayCard` non ha maniglia: resta sola lettura, nel blocco "Trasporti".
- La voce mantiene il proprio `time` dopo lo spostamento tra giorni — non viene
  toccato, resta solo informativo.
- Nessuna modale nuova: lo spostamento tra giorni avviene solo trascinando.

## Edge case

- **Giorno vuoto** come drop target: deve restare un'area valida su cui rilasciare
  anche senza voci esistenti (placeholder minimo).
- **Drop fuori da ogni area valida**: la voce torna al posto di partenza
  (comportamento di default di dnd-kit).
- **Annullamento da tastiera**: Esc durante un drag avviato con `KeyboardSensor`.
- **`modifiedBy`/`modifiedAt`**: riordinare o spostare una voce **non** li
  aggiorna — coerente con l'admin esistente, che già non lo fa (riordinare non è
  modificare il contenuto). Lo stesso vale per il giorno contenitore.

## File toccati

- `src/views/Days.jsx` — `DndContext`, contenitori multipli per giorno, blocchi
  separati voci/trasporti, maniglia sulle voci.
- `src/views/Section.jsx` — maniglia e `SortableContext` sulle schede Ristoranti
  (tipo `cards`).
- `package.json` — `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- `src/views/Today.jsx` — nessuna modifica diretta, eredita da `DayItemsList`.
- `src/data/schema.js` — nessuna modifica.

## Testing

`npm run build && npm run preview`, verifica offline come da prassi del progetto.
Test manuale del trascinamento su un telefono reale: l'emulazione touch di
DevTools non è affidabile per verificare drag + auto-scroll della pagina. Nessun
test automatico per l'interazione di drag in sé (il progetto non ha test di
componente oggi, solo test sul layer dati con vitest); le eventuali funzioni pure
di supporto (spostamento di un item tra due array di giorni) restano abbastanza
semplici da non richiedere test dedicati.
