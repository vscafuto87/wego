# Mappa aggregata del viaggio (Fase 2, primo sotto-progetto)

Data: 2026-08-19
Stato: approvato, in attesa di piano di implementazione

## Contesto

La Fase 2 raccoglie tre idee: meteo per giorno, mappa unica dei luoghi, e una
"modalità briefing" che apre l'app sulla giornata di oggi. Sono tre
sotto-progetti indipendenti, trattati uno alla volta: questo documento copre
solo la **mappa unica**.

Oggi la tab "Mappa" del viaggio (`MapSection.jsx`, sezione fissa `type: map`)
mostra solo i punti che l'utente aggiunge manualmente lì dentro. Ristoranti
(sezione `cards`), sentieri/spiagge/pasti pianificati nei giorni
(`trip.days[].items`) non hanno coordinate: per vederli sulla mappa
bisognerebbe ricopiarli a mano come punto Mappa, cosa che nessuno fa davvero.
Il risultato è che la mattina, per orientarsi, serve aprire ogni scheda
separatamente — esattamente il problema che questo lavoro risolve.

Decisioni raccolte in brainstorming:

- **Cambio di schema** (esplicitamente discusso e approvato qui, come
  richiesto da CLAUDE.md): `lat`/`lng` opzionali si aggiungono agli item
  `cards` (tutte le sezioni di questo tipo, non solo Ristoranti) e alle voci
  giorno di kind `sentiero`/`spiaggia`/`pasto`.
- **Nessuna duplicazione dati**: la tab Mappa aggrega in tempo reale i punti
  con coordinate da tutte le sezioni/giorni, oltre ai suoi punti manuali. Non
  esiste una copia separata.
- **Input coordinate**: si incolla un link Google/Apple Maps in un campo
  testo e l'app prova a estrarne lat/lng con un parser di pattern noti,
  offline, senza chiamate di rete. Se il parsing fallisce (tipicamente link
  brevi tipo `maps.app.goo.gl`, che non contengono coordinate leggibili senza
  risolvere un redirect in rete — fuori scope, romperebbe il local-first) si
  passa a un fallback con due input numerici lat/lng, come già oggi in Mappa.
- **Marker differenziati**: colore/icona diversi per categoria di
  provenienza, popup con nome e provenienza.
- **Filtri**: chip sopra la mappa per accendere/spegnere categorie
  (Mappa, Schede, Sentieri, Spiagge, Pasti).
- **Navigazione**: il popup di un punto non-Mappa ha un link che porta alla
  tab di origine (la sezione cards, o "Itinerario" per le voci giorno).

## 1. Schema dei dati (`data/schema.js`)

### 1.1 `normalizeCardItem` — coordinate opzionali

```jsonc
{
  "title": "Trattoria da Assunta", "meta": "", "detail": "", "link": "",
  "tags": [],
  "lat": 40.897, "lng": 12.958   // nuovi, opzionali, null se assenti
}
```

Si applica a ogni sezione `cards`, comprese quelle create manualmente
dall'utente (non solo Ristoranti) — un campo opzionale in più non richiede
un'eccezione per sezione. Stessa validazione già usata per i punti Mappa:
numero finito o `null`, mai un errore.

### 1.2 `normalizeDayItem` / `KIND_FIELDS` — coordinate per sentiero/spiaggia/pasto

`KIND_FIELDS` guadagna `lat`/`lng` in ognuna delle tre liste esistenti:

```js
const KIND_FIELDS = {
  sentiero: ['durata', 'dislivello', 'difficolta', 'lat', 'lng'],
  spiaggia: ['accesso', 'servizi', 'lat', 'lng'],
  pasto: ['luogo', 'prenotato', 'lat', 'lng']
}
```

Le voci generiche (`kind` assente) non hanno coordinate: non sono un punto
fisico pianificato, restano fuori dalla mappa.

`normalizeDayItem` normalizza `lat`/`lng` con la stessa funzione già usata per
`normalizeMapItem` (numero finito o `null`).

### 1.3 `exportTrip`

Nessuna modifica: `withoutId` e lo spread esistente portano già i nuovi campi
nell'export, sia per i `cards` item sia per i day item.

### 1.4 Nuova funzione pura: `parseCoordsFromMapsLink(url)`

```js
export function parseCoordsFromMapsLink(url) {
  // prova, in ordine:
  // - /@(-?\d+\.\d+),(-?\d+\.\d+)/          → Google "@lat,lng,zoom"
  // - /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/      → Google "place" data param
  // - /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/     → Google "?q=lat,lng"
  // - /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/    → Apple Maps / Google "?ll="
  // ritorna { lat, lng } al primo match valido, altrimenti null.
  // Non lancia mai.
}
```

Vive in `schema.js` perché è logica sui dati del viaggio (parsing di un
formato esterno verso i campi lat/lng), non una utility generica: coerente
con "niente cartella utils, le funzioni stanno vicino a chi le usa" — qui
"chi le usa" è lo stesso file che già possiede tutta la normalizzazione.

## 2. Componente condiviso: `components/CoordsInput.jsx`

Nuovo componente, un solo scopo: raccogliere lat/lng da un link Maps o a
mano.

- Campo testo "Link Google/Apple Maps".
- Al `blur` (o incolla), chiama `parseCoordsFromMapsLink`. Successo → imposta
  lat/lng, mostra una riga di conferma discreta ("📍 coordinate trovate").
  Fallimento → mostra "Non riesco a leggere le coordinate da questo link.
  Aprilo in Maps e copia il link completo dalla barra, oppure inseriscile a
  mano." e rivela i due input numerici lat/lng (collassati di default,
  sempre apribili con un link "Inserisci a mano").
- Se il valore iniziale ha già lat/lng (modifica di un punto esistente), i
  campi numerici partono aperti e valorizzati, il campo link parte vuoto (il
  link non viene salvato: sono `lat`/`lng` la fonte di verità, il link è solo
  un modo di inserirle).
- Props: `value: { lat, lng }`, `onChange({ lat, lng })`. Nessuna dipendenza
  da `mapsLink`/sezione: chi lo usa decide se e come salvare anche un link
  visibile (i punti Mappa mantengono il loro campo `mapsLink` testuale
  separato e invariato, gli item `cards`/day item no — non esiste oggi e non
  lo aggiungiamo, l'unico link salvato per quelli resta il campo `link`
  generico già esistente).

Sostituisce i due input numerici crudi già presenti nel form di
`MapSection.jsx`; viene aggiunto al form scheda in `Section.jsx` e al form
voce giorno in `Days.jsx` (visibile solo per `kind` sentiero/spiaggia/pasto).

## 3. Mappa aggregata (`views/MapSection.jsx`)

`MapSection` riceve già `trip` intero (oltre a `section`, la sezione Mappa
stessa): nessuna nuova prop dati, si estende il calcolo dei punti.

### 3.1 Aggregazione

```js
const points = useMemo(() => {
  const own = section.items.map(p => ({ ...p, categoryGroup: 'mappa', origin: null }))
  const fromCards = trip.sections
    .filter(s => s.type === 'cards')
    .flatMap(s => s.items
      .filter(i => i.lat !== null && i.lng !== null)
      .map(i => ({ ...i, categoryGroup: 'schede', origin: { tab: s.id, label: s.title } })))
  const fromDays = trip.days.flatMap(d => d.items
    .filter(i => ['sentiero', 'spiaggia', 'pasto'].includes(i.kind) && i.lat !== null && i.lng !== null)
    .map(i => ({ ...i, categoryGroup: i.kind, origin: { tab: 'days', label: `${formatDate(d.date)} · ${i.title}` } })))
  return [...own, ...fromCards, ...fromDays]
}, [trip])
```

`categoryGroup` guida sia il colore del marker sia il filtro; `origin` guida
il link "Vai a" nel popup (assente per i punti Mappa: sono già lì).

`formatDate` usato qui è una piccola funzione locale a `MapSection.jsx`
(stesso formato `it-IT` breve già usato in `Days.jsx`, ma non condivisa via
import: `Days.jsx` non la esporta oggi, e duplicare tre righe è più semplice
che introdurre un import incrociato tra viste per una funzione così piccola).

### 3.2 Marker

- `mappa` → marker standard Leaflet (come oggi), editabile (bottoni
  modifica/elimina nella lista sotto, invariati).
- `schede`, `sentiero`, `spiaggia`, `pasto` → `L.divIcon` con un cerchietto
  colorato (arancio schede, verde sentiero, blu spiaggia, giallo pasto — CSS
  inline nel divIcon, nessuna nuova immagine). Sola lettura: nessun bottone
  modifica/elimina in questa vista, si modificano dalla sezione di origine.
- Popup: nome, categoria/provenienza in testo (es. "Ristoranti" o
  "1 set · Cena in paese"), link "Apri in Maps" se applicabile (i punti Mappa
  hanno `mapsLink`; per gli altri, nessun link maps salvato — solo il
  `link` generico dell'item se presente), e per i punti non-Mappa un secondo
  link "Vai alla sezione" / "Vai all'Itinerario" che chiama `onNavigate`.

### 3.3 Filtri

Riga di chip sopra la mappa: Mappa, Schede, Sentieri, Spiagge, Pasti — stato
locale (`useState`, non persistito), tutte attive di default. Una categoria
senza punti non mostra la chip (niente filtro vuoto da spegnere).

### 3.4 Navigazione (`onNavigate`)

Nuova prop `onNavigate(tabKey)`, opzionale (la vista funziona anche senza,
semplicemente senza il link "Vai a" nel popup — utile se in futuro
`MapSection` venisse mai renderizzata fuori da `TripView`).

Flusso: `TripView` passa `onNavigate={setActiveTab}` a `Section`; `Section`
lo inoltra a `MapSection` solo quando `section.type === 'map'`. Il click sul
link nel popup chiama `onNavigate(origin.tab)`, che è già l'id della sezione
cards, oppure la stringa `'days'` per l'Itinerario — entrambi valori già
validi per `activeTab` in `TripView`, nessuna nuova logica di routing.

### 3.5 Cosa non cambia

- La gestione dei punti Mappa propri (form aggiunta/modifica/eliminazione,
  centratura sulla bounding box, comportamento online/offline via
  `useOnlineStatus`) resta come oggi, solo con `CoordsInput` al posto dei due
  input numerici crudi.
- Se non ci sono punti con coordinate in nessuna categoria, la mappa non
  appare (comportamento invariato): resta solo la lista testuale dei punti
  Mappa propri.

## 4. Viste toccate per l'inserimento coordinate

### 4.1 `Section.jsx` — form scheda

Il form "Nuova scheda / Modifica scheda" guadagna `CoordsInput` sotto al
campo "Link", per ogni sezione `cards` (Ristoranti compresa, senza
eccezioni).

### 4.2 `Days.jsx` — form voce giorno

Il form "Nuova voce / Modifica voce" mostra `CoordsInput` insieme ai campi
propri di `kind`, solo quando `kind` è `sentiero`, `spiaggia` o `pasto` (non
per le voci generiche). `dayItemFieldsForKind` già determina quali campi
salvare: basta che `lat`/`lng` siano nella lista per quei tre kind (fatto in
1.2) perché `fieldsForForm`/`withoutKindFields` in `Days.jsx` li includano
senza altre modifiche a quella logica.

## 5. Testing

Non c'è suite automatica nel progetto: verifica manuale.

- `npm run build` deve passare.
- In `npm run preview`: aggiungere coordinate (via link Google Maps con
  pattern `@lat,lng`) a una scheda Ristoranti e vederla comparire in Mappa
  col marker arancio corretto; stesso per una voce sentiero, una spiaggia, un
  pasto (marker verde/blu/giallo); provare un link `maps.app.goo.gl` e
  verificare che il parsing fallisca con il messaggio corretto e si apra il
  fallback manuale; spegnere/accendere ogni chip filtro e verificare che i
  marker spariscano/tornino; cliccare "Vai alla sezione" da un popup schede e
  "Vai all'Itinerario" da un popup giorno, verificare che la tab cambi
  davvero.
- Verifica offline (Network → Offline in DevTools): comportamento invariato,
  la sezione Mappa mostra la sola lista senza errori in console.

## 6. Cosa NON cambia

- `storage.js`, `sync.js`, `ExportPanel.jsx`: nessuna modifica, sincronizzano
  e esportano `trip` così com'è, indipendentemente dai campi nuovi.
- Nessuna migrazione dati per il seed: `lat`/`lng` restano `null` per i punti
  esistenti finché non si incolla un link — nessun dato da inventare.
- Il prompt di caricamento rapido (fuori da questo repo) andrà aggiornato a
  valle, in fase di piano, per generare `lat`/`lng` quando l'appunto grezzo
  contiene un link Maps riconoscibile — coerente con "l'import resta la via
  primaria di inserimento dati".
