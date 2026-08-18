# Sezioni fisse del viaggio: Itinerario, Trasporti, Pernottamento, Ristoranti, Mappa

Data: 2026-08-18
Stato: approvato, in attesa di piano di implementazione

## Contesto

Oggi un viaggio ha due tab fisse (Panoramica, Giorni) più un array libero
`trip.sections` di tipo `cards | checklist | notes`, riempito a piacere
dall'import o dalla modifica manuale. Non c'è un posto dedicato per trasporti
(oggi sono voci sparse dentro ai giorni) o per l'alloggio (oggi è una sezione
`cards` come un'altra, es. "Logistica"), e non esiste una vista mappa.

Questo lavoro introduce 6 sezioni fisse, sempre presenti per ogni viaggio,
nell'ordine: **Panoramica, Itinerario, Trasporti, Pernottamento, Ristoranti,
Mappa**. Le sezioni libere esistenti restano possibili e appaiono in coda alle
fisse nella tab bar — nessuna rottura per viaggi che oggi hanno sezioni custom
(es. "Zaino del giorno", "Riserve e alternative").

Decisioni raccolte in brainstorming:

- Fisse **+** libere: le 6 sezioni sono garantite da `normalizeTrip`, non
  sostituiscono le sezioni custom.
- L'Itinerario è il tab "Giorni" di oggi, rinominato, con le voci del giorno
  che guadagnano un campo opzionale `kind` (`sentiero | spiaggia | pasto`) con
  campi propri; senza `kind` la voce resta generica come oggi.
- Trasporti e Pernottamento sono liste strutturate indipendenti dai giorni,
  con due **nuovi tipi di sezione** (`transport`, `lodging`) che si aggiungono
  ai tre bloccati in CLAUDE.md (`cards`, `checklist`, `notes`) — deviazione
  esplicitamente discussa e approvata qui, come richiesto dalla regola.
- Ristoranti resta tipo `cards` esistente, solo promosso a sezione fissa
  sempre presente (i campi title/meta/detail/link/tags bastano per nome,
  cucina, note, link prenotazione, tag prezzo).
- Mappa è un terzo tipo nuovo (`map`): lista di punti d'interesse più una
  mappa interattiva **online-only** (Leaflet + tile OpenStreetMap via CDN);
  senza rete la sezione mostra silenziosamente solo la lista con i link
  esterni a Maps. Nessun tile precaricato: fuori scope, coerente con "non
  anticipare le fasi successive".
- Nuova dipendenza approvata: `leaflet` + `react-leaflet`.
- Il seed (`seed/trips.json`) viene riscritto nel nuovo formato: treno/aliscafo
  spostati in `transport`, alloggio in `lodging`, `kind` aggiunto alle voci
  sentiero/spiaggia esistenti.

## 1. Schema dei dati

### 1.1 Day item — campo `kind`

```jsonc
// generica (come oggi, kind assente o "")
{ "time": "09:00", "title": "Partenza da Bologna", "detail": "", "link": "" }

// sentiero
{ "time": "08:00", "title": "Anello delle Malghe", "kind": "sentiero",
  "detail": "", "link": "https://www.komoot.com/...",
  "durata": "5h14", "dislivello": "480 m D+ / 1.320 m D−", "difficolta": "media" }

// spiaggia
{ "time": "", "title": "Frontone", "kind": "spiaggia",
  "detail": "", "link": "",
  "accesso": "a piedi da Porto", "servizi": "bar, noleggio ombrelloni" }

// pasto
{ "time": "20:00", "title": "Cena in paese", "kind": "pasto",
  "detail": "", "link": "",
  "luogo": "", "prenotato": false }
```

`durata`, `dislivello`, `difficolta`, `accesso`, `servizi`, `luogo`,
`prenotato` sono stringhe vuote / `false` di default, mai obbligatorie —
l'import può omettere ogni campo specifico e la voce resta valida.
`difficolta` non è un enum vincolato: stringa libera (es. "facile", "EE"),
per non bloccare l'import su valori imprevisti.

### 1.2 Nuovo tipo di sezione `transport`

```jsonc
{
  "title": "Trasporti", "icon": "bus", "type": "transport",
  "items": [
    { "mode": "treno", "from": "Bologna", "to": "Roma", "date": "2026-08-30",
      "time": "09:12", "ticketLink": "", "note": "" },
    { "mode": "aliscafo", "from": "Formia", "to": "Ponza", "date": "2026-08-30",
      "time": "14:30", "ticketLink": "", "note": "posti assegnati" }
  ]
}
```

`mode` stringa libera (treno, aereo, aliscafo, bus, traghetto, auto...), non
enum — coerente con `difficolta` sopra, e con com'è già `icon` a livello di
sezione (enum) vs i campi interni ai singoli item (liberi).

### 1.3 Nuovo tipo di sezione `lodging`

```jsonc
{
  "title": "Pernottamento", "icon": "bed", "type": "lodging",
  "items": [
    { "name": "Appartamento zona Porto", "checkIn": "2026-08-30",
      "checkOut": "2026-09-05", "address": "", "bookingLink": "", "note": "" }
  ]
}
```

### 1.4 Nuovo tipo di sezione `map`

```jsonc
{
  "title": "Mappa", "icon": "map", "type": "map",
  "items": [
    { "name": "Piscine Naturali", "category": "spiaggia",
      "mapsLink": "https://maps.google.com/...",
      "lat": 40.897, "lng": 12.958, "note": "" }
  ]
}
```

`lat`/`lng` sono numeri opzionali (`null` se assenti): senza coordinate il
punto appare solo nella lista testuale, mai sulla mappa — niente errore, il
marker viene semplicemente saltato nel render.

### 1.5 `normalizeTrip` — sezioni fisse garantite

`SECTION_TYPES` passa da `['cards', 'checklist', 'notes']` a
`['cards', 'checklist', 'notes', 'transport', 'lodging', 'map']`.

Si introduce `FIXED_SECTIONS`, la lista ordinata delle 6 sezioni sempre
presenti (Panoramica e Itinerario non sono voci di `trip.sections`: restano
tab a parte come oggi — l'array `sections` guadagna solo Trasporti,
Pernottamento, Ristoranti, Mappa):

```js
const FIXED_SECTIONS = [
  { title: 'Trasporti',     icon: 'bus',  type: 'transport' },
  { title: 'Pernottamento', icon: 'bed',  type: 'lodging' },
  { title: 'Ristoranti',    icon: 'food', type: 'cards' },
  { title: 'Mappa',         icon: 'map',  type: 'map' },
]
```

`normalizeTrip` normalizza `trip.sections` come oggi, poi per ognuna delle 4
`FIXED_SECTIONS` cerca nell'array normalizzato una sezione con lo stesso
`type` (e per `cards`/Ristoranti, anche lo stesso `title`, per non confondere
una sezione `cards` custom con Ristoranti) — se la trova la promuove in testa
nell'ordine fisso, altrimenti ne crea una vuota. Le sezioni restanti (libere)
seguono in coda, nell'ordine in cui erano nel JSON originale. Questo rende
l'ordine delle tab deterministico e garantisce che le 4 sezioni esistano
sempre, anche per viaggi importati da un JSON che non le menziona.

`exportTrip` non cambia struttura: esporta `trip.sections` così com'è (fisse
e libere mescolate nell'ordine risultante), aggiungendo i nuovi campi per
`transport`/`lodging`/`map` e per i day item con `kind`.

## 2. Viste

### 2.1 `TripView.jsx` — tab bar

L'array `tabs` diventa:

```js
const tabs = [
  { key: 'overview', label: 'Panoramica' },
  { key: 'days', label: 'Itinerario' },
  ...trip.sections.map((s) => ({ key: s.id, label: s.title || 'Sezione' })),
]
```

(la sola modifica è l'etichetta "Giorni" → "Itinerario"; la sezione dei tab
generati da `trip.sections` è già generica e non richiede modifiche, dato che
il dispatch per `type` avviene in un componente unico `Section.jsx` esteso —
vedi 2.3).

### 2.2 `Days.jsx` (invariato nel nome file, contenuto esteso)

Il form "Nuova voce / Modifica voce" guadagna una scelta `kind` (pulsanti o
select: Generica, Sentiero, Spiaggia, Pasto). Cambiando `kind` il form mostra
i campi propri di quel tipo sotto ai campi comuni (ora/titolo/dettaglio/link).
La lista delle voci mostra un'icona diversa per `kind` (mappata su icone
lucide-react già in uso: sentiero→Mountain, spiaggia→Waves, pasto→Utensils,
generica→nessuna icona speciale, come oggi) e i campi propri sotto al
dettaglio, in `IBM Plex Mono` per dati numerici (durata, dislivello) coerente
col design system.

### 2.3 `Section.jsx` — dispatch esteso

`Section.jsx` oggi fa dispatch su `section.type` per `cards|checklist|notes`.
Si aggiungono tre rami:

- `transport` → nuovo componente `views/Transport.jsx`: lista di viaggi
  ordinati per `date`+`time`, ognuno con modo (icona per `mode` noto, fallback
  generico), tratta "`from` → `to`", data/ora in mono, link al biglietto se
  presente. Form di aggiunta/modifica con gli stessi campi.
- `lodging` → nuovo componente `views/Lodging.jsx`: lista ordinata per
  `checkIn`, ognuna con nome, intervallo check-in/check-out (mono), indirizzo,
  link prenotazione. Form di aggiunta/modifica.
- `map` → nuovo componente `views/MapSection.jsx`, dettagliato in 2.4.

`cards` e `checklist` restano invariati: Ristoranti li riusa senza modifiche
al componente.

### 2.4 `views/MapSection.jsx`

- Se `navigator.onLine` e almeno un punto ha `lat`/`lng`: renderizza una
  `MapContainer` di `react-leaflet` con tile layer OpenStreetMap
  (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`), un marker per ogni
  punto con coordinate, centrata sul bounding box dei punti (o su `trip.place`
  geocodificato in modo statico se non ci sono punti — no, fuori scope:
  se non ci sono punti con coordinate la mappa non appare affatto, solo la
  lista).
- Sotto (o al posto, se offline) la mappa: lista testuale di tutti i punti
  (con e senza coordinate), ognuno con nome, categoria, link esterno
  `mapsLink` che apre Google/Apple Maps in una nuova scheda.
- Ascolta gli eventi `online`/`offline` per aggiornare la vista senza reload.
- Form di aggiunta/modifica punto: nome, categoria, link maps, lat/lng
  (opzionali, numerici), nota.

Import CSS di Leaflet (`leaflet/dist/leaflet.css`) in `MapSection.jsx` o in
`main.jsx` — da verificare in fase di implementazione che non rompa il resto
degli stili Tailwind (isolamento con classi scoped al container della mappa).

### 2.5 Icone

`ICONS` in `schema.js` include già `map, check, note, ticket, food, bed, bus,
star, people` — sufficienti per le 4 sezioni fisse nuove (`bus` per Trasporti,
`bed` per Pernottamento, `food` per Ristoranti, `map` per Mappa). Nessuna
nuova icona di sezione necessaria. Le icone per `kind` del day item sono
scelte lato componente (Days.jsx), non nello schema.

## 3. Import / caricamento rapido

Il prompt/istruzioni per generare il JSON da appunti grezzi (fuori da questo
repo, lato Claude che genera il JSON per il caricamento rapido) andrà
aggiornato a valle, quando si scrive il piano — non è un file di questo
progetto, ma va tenuto presente che l'import deve poter generare `kind` sui
day item e le nuove sezioni `transport`/`lodging`/`map` perché il flusso "da
appunti grezzi a JSON" resti la via primaria di inserimento dati.

## 4. Migrazione seed

`seed/trips.json` viene riscritto:

- **Dolomiti**: le voci "Partenza da Bologna" / "Check-in a Forni di Sopra" /
  "Rientro a Bologna" nei day item diventano voci nella nuova sezione
  `transport` (mode: auto) quando rappresentano uno spostamento vero, oppure
  restano generiche se sono solo un promemoria senza dati di viaggio
  strutturabili. Le voci sentiero (Anello delle Malghe, Sentiero delle
  Genziane, ecc.) guadagnano `kind: "sentiero"` con `durata`/`dislivello`
  estratti dal testo libero già presente in `detail`. La sezione "Logistica"
  (alloggio a Forni) diventa la sezione `lodging`.
- **Ponza**: treno e aliscafo del primo giorno diventano voci `transport`.
  "Check-in zona Porto" diventa la sezione `lodging`. Le voci "Prima
  giornata di mare" / "Mare" restano generiche a livello di giorno (nessuna
  spiaggia specifica assegnata quel giorno nel seed attuale); la sezione
  "Spiagge e cale" resta come lista di riferimento generale (non è legata a
  un giorno preciso, quindi resta fuori da `kind: spiaggia` sui day item e
  vive solo come lista libera esistente, non promossa a Mappa — Mappa parte
  vuota nel seed, senza coordinate reali da inventare).
- Le sezioni "Riserve e alternative", "Zaino del giorno", "Note",
  "Da prenotare" restano sezioni libere invariate, in coda alle fisse.

## 5. Cosa NON cambia

- `storage.js`, `sync.js` non richiedono modifiche: sincronizzano `trip.data`
  as-is, indipendentemente dal contenuto di `sections`.
- `ExportPanel.jsx` non richiede modifiche di logica: usa `exportTrip` così
  com'è.
- Nessuna migrazione dati per viaggi già sincronizzati su Supabase in
  produzione: il progetto è ancora in Fase 0 completata / Fase 1 appena
  iniziata secondo la memoria di progetto, non ci sono viaggi reali di terzi
  da migrare oltre al seed.

## 6. Testing

- `npm run build` deve passare.
- Verifica manuale in `npm run preview`: aprire Dolomiti e Ponza, controllare
  che le 4 sezioni fisse nuove appaiano popolate col seed aggiornato, provare
  ad aggiungere/modificare/eliminare una voce in Trasporti, Pernottamento,
  Mappa, e una voce sentiero/spiaggia/pasto in Itinerario.
- Verifica offline (Network → Offline in DevTools): la sezione Mappa deve
  mostrare la sola lista senza errori in console, non un componente rotto.
