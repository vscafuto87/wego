# Sezioni fisse del viaggio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre 6 sezioni fisse per ogni viaggio (Panoramica, Itinerario, Trasporti, Pernottamento, Ristoranti, Mappa), con voci del giorno tipizzate (sentiero/spiaggia/pasto) e due nuovi tipi di sezione (`transport`, `lodging`) più una sezione `map` con mappa interattiva online-only.

**Architecture:** Tutto lo stato resta nel documento JSON del viaggio (`schema.js` come unica fonte di verità). `normalizeTrip` garantisce che le 4 sezioni fisse aggiuntive (Trasporti, Pernottamento, Ristoranti, Mappa) esistano sempre, promuovendo quelle già presenti nel JSON e creandone di vuote altrimenti. Tre nuovi componenti vista (`Transport.jsx`, `Lodging.jsx`, `MapSection.jsx`) si aggiungono al dispatch esistente in `Section.jsx`. La mappa usa Leaflet con tile OpenStreetMap solo quando c'è rete; offline mostra solo la lista dei punti.

**Tech Stack:** Vite + React 18 + JavaScript, Tailwind CSS, `idb-keyval`, `lucide-react`, `leaflet` + `react-leaflet` (nuova dipendenza approvata), Vitest per i test.

**Spec:** [docs/superpowers/specs/2026-08-18-sezioni-fisse-viaggio-design.md](../specs/2026-08-18-sezioni-fisse-viaggio-design.md)

## Global Constraints

- Un componente per file, niente file oltre ~250 righe, niente cartella `utils/` generica.
- Stesso schema JSON per stato in memoria, IndexedDB, import, export e colonna Supabase — nessuna trasformazione tra livelli.
- Nessun campo tipizzato nuovo è mai obbligatorio: l'import può ometterlo e il viaggio resta valido.
- `mode` (trasporti) e `difficolta` (sentiero) sono stringhe libere, non enum.
- Font: `IBM Plex Mono` per dati numerici/date/orari, coerente col design system esistente.
- Aree toccabili da almeno 44px, focus visibile sempre (pattern già in uso in Days.jsx/Section.jsx).
- Copy in italiano, seconda persona, bottoni che dicono cosa succede.
- Dipendenza nuova approvata per questo piano: `leaflet` + `react-leaflet`. Nessun'altra dipendenza va aggiunta senza chiedere.
- `npm run build` deve passare e va fatta una verifica offline in `npm run preview` prima di considerare il lavoro concluso.

---

### Task 1: Schema — `kind` sulle voci del giorno (sentiero/spiaggia/pasto)

**Files:**
- Modify: `src/data/schema.js:1-28` (costanti in testa al file, `normalizeDayItem`)
- Test: `src/data/schema.test.js` (nuovo file)

**Interfaces:**
- Produce: `DAY_ITEM_KINDS` (array `['', 'sentiero', 'spiaggia', 'pasto']`), `dayItemFieldsForKind(kind)` (funzione esportata: dato un kind restituisce l'array dei nomi di campo propri di quel kind, `[]` per generico o kind sconosciuto), `normalizeDayItem(raw)` esteso con `kind` e i campi propri.
- Consumato da: Task 6 (`Days.jsx`) userà `dayItemFieldsForKind`.

- [ ] **Step 1: Scrivi i test per `normalizeDayItem` e `dayItemFieldsForKind`**

```js
// src/data/schema.test.js
import { describe, it, expect } from 'vitest'
import { normalizeTrip, exportTrip, dayItemFieldsForKind } from './schema.js'

function tripWithItem(item) {
  return normalizeTrip({ name: 'X', days: [{ date: '2026-01-01', items: [item] }] })
}

describe('dayItemFieldsForKind', () => {
  it('sentiero', () => {
    expect(dayItemFieldsForKind('sentiero')).toEqual(['durata', 'dislivello', 'difficolta'])
  })
  it('spiaggia', () => {
    expect(dayItemFieldsForKind('spiaggia')).toEqual(['accesso', 'servizi'])
  })
  it('pasto', () => {
    expect(dayItemFieldsForKind('pasto')).toEqual(['luogo', 'prenotato'])
  })
  it('generico o sconosciuto: nessun campo proprio', () => {
    expect(dayItemFieldsForKind('')).toEqual([])
    expect(dayItemFieldsForKind('volo')).toEqual([])
  })
})

describe('normalizeTrip — kind sulle voci del giorno', () => {
  it('voce generica: kind vuoto, nessun campo proprio', () => {
    const item = tripWithItem({ title: 'Partenza' }).days[0].items[0]
    expect(item.kind).toBe('')
    expect(item.durata).toBeUndefined()
    expect(item.accesso).toBeUndefined()
    expect(item.luogo).toBeUndefined()
  })

  it('sentiero: durata, dislivello, difficolta', () => {
    const item = tripWithItem({ title: 'Anello', kind: 'sentiero', durata: '5h14', dislivello: '480 m D+', difficolta: 'media' }).days[0].items[0]
    expect(item.kind).toBe('sentiero')
    expect(item.durata).toBe('5h14')
    expect(item.dislivello).toBe('480 m D+')
    expect(item.difficolta).toBe('media')
  })

  it('sentiero: campi propri mancanti diventano stringa vuota', () => {
    const item = tripWithItem({ title: 'Anello', kind: 'sentiero' }).days[0].items[0]
    expect(item.durata).toBe('')
    expect(item.dislivello).toBe('')
    expect(item.difficolta).toBe('')
  })

  it('spiaggia: accesso, servizi', () => {
    const item = tripWithItem({ title: 'Frontone', kind: 'spiaggia', accesso: 'a piedi', servizi: 'bar' }).days[0].items[0]
    expect(item.kind).toBe('spiaggia')
    expect(item.accesso).toBe('a piedi')
    expect(item.servizi).toBe('bar')
  })

  it('pasto: luogo, prenotato', () => {
    const item = tripWithItem({ title: 'Cena', kind: 'pasto', luogo: 'Trattoria', prenotato: true }).days[0].items[0]
    expect(item.kind).toBe('pasto')
    expect(item.luogo).toBe('Trattoria')
    expect(item.prenotato).toBe(true)
  })

  it('pasto: prenotato non booleano ricade su false', () => {
    const item = tripWithItem({ title: 'Cena', kind: 'pasto', prenotato: 'si' }).days[0].items[0]
    expect(item.prenotato).toBe(false)
  })

  it('kind sconosciuto ricade su generico', () => {
    const item = tripWithItem({ title: 'X', kind: 'volo' }).days[0].items[0]
    expect(item.kind).toBe('')
  })

  it('exportTrip conserva kind e campi propri, senza id', () => {
    const trip = tripWithItem({ title: 'Anello', kind: 'sentiero', durata: '5h14' })
    const exported = exportTrip(trip)
    const item = exported.days[0].items[0]
    expect(item.id).toBeUndefined()
    expect(item).toEqual({
      time: '', title: 'Anello', kind: 'sentiero', detail: '', link: '',
      modifiedBy: '', modifiedAt: '', durata: '5h14', dislivello: '', difficolta: ''
    })
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- schema.test.js`
Expected: FAIL — `dayItemFieldsForKind` non è esportata da `schema.js`, e i campi `kind`/`durata`/`accesso`/`luogo` non esistono ancora su `normalizeDayItem`.

- [ ] **Step 3: Implementa `kind` e i campi propri in `schema.js`**

In testa al file, dopo `const SECTION_TYPES = ...` (riga 3), aggiungi:

```js
const DAY_ITEM_KINDS = ['', 'sentiero', 'spiaggia', 'pasto']

const KIND_FIELDS = {
  sentiero: ['durata', 'dislivello', 'difficolta'],
  spiaggia: ['accesso', 'servizi'],
  pasto: ['luogo', 'prenotato']
}

export function dayItemFieldsForKind(kind) {
  return KIND_FIELDS[kind] ?? []
}
```

Sostituisci `normalizeDayItem` (righe 17-28) con:

```js
function normalizeDayItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  const kind = DAY_ITEM_KINDS.includes(item.kind) ? item.kind : ''
  const base = {
    id: makeId(),
    time: str(item.time),
    title: str(item.title),
    kind,
    detail: str(item.detail),
    link: str(item.link),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
  if (kind === 'sentiero') {
    return { ...base, durata: str(item.durata), dislivello: str(item.dislivello), difficolta: str(item.difficolta) }
  }
  if (kind === 'spiaggia') {
    return { ...base, accesso: str(item.accesso), servizi: str(item.servizi) }
  }
  if (kind === 'pasto') {
    return { ...base, luogo: str(item.luogo), prenotato: item.prenotato === true }
  }
  return base
}
```

`exportTrip` non richiede modifiche: `day.items.map(withoutId)` (riga 128) è già generico e conserva `kind` e i campi propri automaticamente.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- schema.test.js`
Expected: PASS su tutti i test scritti al passo 1.

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "aggiungi kind (sentiero/spiaggia/pasto) alle voci del giorno"
```

---

### Task 2: Schema — nuovi tipi di sezione `transport` e `lodging`

**Files:**
- Modify: `src/data/schema.js` (`SECTION_TYPES`, `normalizeSection`)
- Modify: `src/data/schema.test.js`

**Interfaces:**
- Consuma: `SECTION_TYPES`, `makeId`, `str`, `arr` esistenti in `schema.js` (Task 1 non li tocca).
- Produce: `normalizeSection` riconosce `type: 'transport'` con items `{ id, mode, from, to, date, time, ticketLink, note, modifiedBy, modifiedAt }` e `type: 'lodging'` con items `{ id, name, checkIn, checkOut, address, bookingLink, note, modifiedBy, modifiedAt }`.
- Consumato da: Task 4 (`FIXED_SECTIONS`), Task 8 (`Transport.jsx`), Task 9 (`Lodging.jsx`).

- [ ] **Step 1: Scrivi i test per le sezioni `transport` e `lodging`**

Aggiungi in fondo a `src/data/schema.test.js`:

```js
describe('normalizeTrip — sezione transport', () => {
  function tripWithTransportSection(items) {
    return normalizeTrip({ name: 'X', sections: [{ title: 'Trasporti', icon: 'bus', type: 'transport', items }] })
  }

  it('normalizza i campi di una voce di trasporto', () => {
    const section = tripWithTransportSection([
      { mode: 'aliscafo', from: 'Formia', to: 'Ponza', date: '2026-08-30', time: '14:30', ticketLink: 'https://x', note: 'posti assegnati' }
    ]).sections.find((s) => s.type === 'transport')
    expect(section.items[0]).toMatchObject({
      mode: 'aliscafo', from: 'Formia', to: 'Ponza', date: '2026-08-30', time: '14:30', ticketLink: 'https://x', note: 'posti assegnati'
    })
    expect(section.items[0].id).toBeTypeOf('string')
  })

  it('campi mancanti diventano stringa vuota', () => {
    const section = tripWithTransportSection([{ mode: 'treno' }]).sections.find((s) => s.type === 'transport')
    expect(section.items[0]).toMatchObject({ mode: 'treno', from: '', to: '', date: '', time: '', ticketLink: '', note: '' })
  })

  it('exportTrip conserva i campi transport senza id', () => {
    const trip = tripWithTransportSection([{ mode: 'treno', from: 'Bologna', to: 'Roma' }])
    const exported = exportTrip(trip).sections.find((s) => s.type === 'transport')
    expect(exported.items[0].id).toBeUndefined()
    expect(exported.items[0].mode).toBe('treno')
  })
})

describe('normalizeTrip — sezione lodging', () => {
  function tripWithLodgingSection(items) {
    return normalizeTrip({ name: 'X', sections: [{ title: 'Pernottamento', icon: 'bed', type: 'lodging', items }] })
  }

  it('normalizza i campi di una voce di alloggio', () => {
    const section = tripWithLodgingSection([
      { name: 'Appartamento Porto', checkIn: '2026-08-30', checkOut: '2026-09-05', address: 'Via Roma 1', bookingLink: 'https://x', note: '' }
    ]).sections.find((s) => s.type === 'lodging')
    expect(section.items[0]).toMatchObject({
      name: 'Appartamento Porto', checkIn: '2026-08-30', checkOut: '2026-09-05', address: 'Via Roma 1', bookingLink: 'https://x'
    })
  })

  it('campi mancanti diventano stringa vuota', () => {
    const section = tripWithLodgingSection([{ name: 'Hotel' }]).sections.find((s) => s.type === 'lodging')
    expect(section.items[0]).toMatchObject({ name: 'Hotel', checkIn: '', checkOut: '', address: '', bookingLink: '', note: '' })
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- schema.test.js`
Expected: FAIL — `type: 'transport'`/`'lodging'` non sono in `SECTION_TYPES`, quindi ricadono su `'cards'` e i campi attesi (`mode`, `from`, `checkIn`...) non esistono.

- [ ] **Step 3: Implementa i due tipi in `schema.js`**

Sostituisci la riga 3 (`const SECTION_TYPES = ['cards', 'checklist', 'notes']`) con:

```js
const SECTION_TYPES = ['cards', 'checklist', 'notes', 'transport', 'lodging', 'map']
```

(il tipo `map` viene aggiunto qui per evitare un secondo cambio alla stessa riga nel Task 3; verrà normalizzato a parte in quel task — fino ad allora una sezione `type: 'map'` ricadrebbe comunque su `normalizeCardItem`, corretto nel prossimo task).

Aggiungi, vicino a `normalizeChecklistItem`:

```js
function normalizeTransportItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    mode: str(item.mode),
    from: str(item.from),
    to: str(item.to),
    date: str(item.date),
    time: str(item.time),
    ticketLink: str(item.ticketLink),
    note: str(item.note),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}

function normalizeLodgingItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    name: str(item.name),
    checkIn: str(item.checkIn),
    checkOut: str(item.checkOut),
    address: str(item.address),
    bookingLink: str(item.bookingLink),
    note: str(item.note),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}
```

In `normalizeSection`, dopo il ramo `if (type === 'notes') { ... }` (righe 77-79), aggiungi:

```js
  if (type === 'transport') {
    return { ...base, items: arr(section.items).map(normalizeTransportItem) }
  }
  if (type === 'lodging') {
    return { ...base, items: arr(section.items).map(normalizeLodgingItem) }
  }
```

`exportTrip` non richiede modifiche: il ramo finale `return { ...base, items: section.items.map(withoutId) }` (riga 135) è già generico per ogni tipo diverso da `'notes'`.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- schema.test.js`
Expected: PASS su tutti i test transport/lodging (i test del Task 1 restano verdi).

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "aggiungi i tipi di sezione transport e lodging"
```

---

### Task 3: Schema — nuovo tipo di sezione `map`

**Files:**
- Modify: `src/data/schema.js` (`normalizeSection`)
- Modify: `src/data/schema.test.js`

**Interfaces:**
- Produce: `normalizeSection` riconosce `type: 'map'` con items `{ id, name, category, mapsLink, lat, lng, note, modifiedBy, modifiedAt }`, dove `lat`/`lng` sono `number|null`.
- Consumato da: Task 4 (`FIXED_SECTIONS`), Task 10 (`MapSection.jsx`).

- [ ] **Step 1: Scrivi i test per la sezione `map`**

Aggiungi in fondo a `src/data/schema.test.js`:

```js
describe('normalizeTrip — sezione map', () => {
  function tripWithMapSection(items) {
    return normalizeTrip({ name: 'X', sections: [{ title: 'Mappa', icon: 'map', type: 'map', items }] })
  }

  it('normalizza un punto con coordinate', () => {
    const section = tripWithMapSection([
      { name: 'Piscine Naturali', category: 'spiaggia', mapsLink: 'https://maps.x', lat: 40.897, lng: 12.958, note: '' }
    ]).sections.find((s) => s.type === 'map')
    expect(section.items[0]).toMatchObject({ name: 'Piscine Naturali', category: 'spiaggia', mapsLink: 'https://maps.x', lat: 40.897, lng: 12.958 })
  })

  it('coordinate assenti o non numeriche diventano null, non errore', () => {
    const section = tripWithMapSection([{ name: 'Senza coordinate' }, { name: 'Coordinate testo', lat: 'quaranta', lng: '13' }])
      .sections.find((s) => s.type === 'map')
    expect(section.items[0].lat).toBeNull()
    expect(section.items[0].lng).toBeNull()
    expect(section.items[1].lat).toBeNull()
    expect(section.items[1].lng).toBeNull()
  })

  it('campi mancanti diventano stringa vuota', () => {
    const section = tripWithMapSection([{ name: 'Punto' }]).sections.find((s) => s.type === 'map')
    expect(section.items[0]).toMatchObject({ name: 'Punto', category: '', mapsLink: '', note: '' })
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- schema.test.js`
Expected: FAIL — `type: 'map'` ricade ancora sul ramo `cards`, quindi `category`/`mapsLink`/`lat`/`lng` non esistono sull'item normalizzato (ci sono invece `meta`/`tags`).

- [ ] **Step 3: Implementa il tipo `map` in `schema.js`**

Aggiungi, vicino a `normalizeLodgingItem`:

```js
function normalizeMapItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  const lat = typeof item.lat === 'number' && Number.isFinite(item.lat) ? item.lat : null
  const lng = typeof item.lng === 'number' && Number.isFinite(item.lng) ? item.lng : null
  return {
    id: makeId(),
    name: str(item.name),
    category: str(item.category),
    mapsLink: str(item.mapsLink),
    lat,
    lng,
    note: str(item.note),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}
```

In `normalizeSection`, dopo il ramo `lodging` aggiunto nel Task 2, aggiungi:

```js
  if (type === 'map') {
    return { ...base, items: arr(section.items).map(normalizeMapItem) }
  }
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- schema.test.js`
Expected: PASS su tutti i test `map` (i test dei Task 1 e 2 restano verdi).

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "aggiungi il tipo di sezione map"
```

---

### Task 4: Schema — sezioni fisse garantite (`FIXED_SECTIONS`)

**Files:**
- Modify: `src/data/schema.js` (`normalizeTrip`)
- Modify: `src/data/schema.test.js`

**Interfaces:**
- Consuma: `normalizeSection` (Task 1-3), `arr`, `str`.
- Produce: `normalizeTrip(raw).sections` inizia sempre con, in quest'ordine, Trasporti (`transport`), Pernottamento (`lodging`), Ristoranti (`cards`, promossa per titolo), Mappa (`map`); le sezioni custom seguono, nell'ordine originale.
- Consumato da: Task 5 (seed), Task 7 (`Overview.jsx`), Task 8-10 (viste).

- [ ] **Step 1: Scrivi i test per le sezioni fisse**

Aggiungi in fondo a `src/data/schema.test.js`:

```js
describe('normalizeTrip — sezioni fisse garantite', () => {
  it('un viaggio senza sezioni ha comunque le 4 fisse, in ordine, vuote', () => {
    const trip = normalizeTrip({ name: 'X' })
    expect(trip.sections.map((s) => [s.type, s.title])).toEqual([
      ['transport', 'Trasporti'],
      ['lodging', 'Pernottamento'],
      ['cards', 'Ristoranti'],
      ['map', 'Mappa']
    ])
    expect(trip.sections.every((s) => s.items.length === 0)).toBe(true)
  })

  it('una sezione Ristoranti esistente viene promossa, non duplicata', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'Ristoranti', icon: 'food', type: 'cards', items: [{ title: 'Da Assunta' }] }]
    })
    const ristoranti = trip.sections.filter((s) => s.type === 'cards' && s.title === 'Ristoranti')
    expect(ristoranti).toHaveLength(1)
    expect(ristoranti[0].items[0].title).toBe('Da Assunta')
  })

  it('una sezione cards con titolo diverso da Ristoranti non viene confusa con quella fissa', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'Riserve e alternative', icon: 'star', type: 'cards', items: [{ title: 'Piano B' }] }]
    })
    const ristoranti = trip.sections.find((s) => s.type === 'cards' && s.title === 'Ristoranti')
    const riserve = trip.sections.find((s) => s.title === 'Riserve e alternative')
    expect(ristoranti.items).toHaveLength(0)
    expect(riserve.items[0].title).toBe('Piano B')
  })

  it('sezioni transport/lodging/map esistenti vengono promosse per tipo, non duplicate', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'I nostri spostamenti', icon: 'bus', type: 'transport', items: [{ mode: 'treno' }] }]
    })
    const trasporti = trip.sections.filter((s) => s.type === 'transport')
    expect(trasporti).toHaveLength(1)
    expect(trasporti[0].items[0].mode).toBe('treno')
  })

  it('le sezioni libere restano, dopo le 4 fisse, nell\'ordine originale', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [
        { title: 'Zaino del giorno', icon: 'check', type: 'checklist', items: [] },
        { title: 'Note', icon: 'note', type: 'notes', text: '' }
      ]
    })
    const free = trip.sections.slice(4)
    expect(free.map((s) => s.title)).toEqual(['Zaino del giorno', 'Note'])
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- schema.test.js`
Expected: FAIL — oggi `normalizeTrip` restituisce solo le sezioni presenti nel JSON, senza garantire le 4 fisse né il loro ordine.

- [ ] **Step 3: Implementa `FIXED_SECTIONS` in `schema.js`**

Aggiungi, prima di `export function normalizeTrip`:

```js
const FIXED_SECTIONS = [
  { title: 'Trasporti', icon: 'bus', type: 'transport' },
  { title: 'Pernottamento', icon: 'bed', type: 'lodging' },
  { title: 'Ristoranti', icon: 'food', type: 'cards' },
  { title: 'Mappa', icon: 'map', type: 'map' }
]

function withFixedSections(sections) {
  const remaining = [...sections]
  const fixed = FIXED_SECTIONS.map((f) => {
    const idx = remaining.findIndex((s) => s.type === f.type && (f.type !== 'cards' || s.title === f.title))
    if (idx === -1) return normalizeSection({ title: f.title, icon: f.icon, type: f.type })
    const [match] = remaining.splice(idx, 1)
    return match
  })
  return [...fixed, ...remaining]
}
```

In `normalizeTrip`, sostituisci `sections: arr(trip.sections).map(normalizeSection)` con:

```js
    sections: withFixedSections(arr(trip.sections).map(normalizeSection))
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- schema.test.js`
Expected: PASS su tutta la suite (Task 1-4 insieme).

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "garantisci le 4 sezioni fisse in normalizeTrip"
```

---

### Task 5: Migra `seed/trips.json` al nuovo formato

**Files:**
- Modify: `seed/trips.json`
- Test: `src/data/seed.test.js` (nuovo file)

**Interfaces:**
- Consuma: `normalizeTrip` (Task 1-4), `rawTrips` da `seed/trips.json`.
- Produce: nessuna nuova funzione; il file dati aggiornato è il deliverable, verificato dal test di regressione.

- [ ] **Step 1: Scrivi il test di regressione sul seed**

```js
// src/data/seed.test.js
import { describe, it, expect } from 'vitest'
import { normalizeTrip } from './schema.js'
import rawTrips from '../../seed/trips.json'

describe('seed/trips.json normalizzato', () => {
  const trips = rawTrips.map(normalizeTrip)

  it('entrambi i viaggi hanno le 4 sezioni fisse nell\'ordine corretto', () => {
    for (const trip of trips) {
      expect(trip.sections.slice(0, 4).map((s) => s.type)).toEqual(['transport', 'lodging', 'cards', 'map'])
    }
  })

  it('Dolomiti: i trasporti Bologna-Forni sono in Trasporti, non più nei giorni', () => {
    const dolomiti = trips.find((t) => t.name === 'Dolomiti Friulane')
    const trasporti = dolomiti.sections.find((s) => s.type === 'transport')
    expect(trasporti.items.map((i) => `${i.from}->${i.to}`)).toEqual(['Bologna->Forni di Sopra', 'Forni di Sopra->Bologna'])
    const titoliGiorni = dolomiti.days.flatMap((d) => d.items.map((i) => i.title))
    expect(titoliGiorni).not.toContain('Partenza da Bologna')
    expect(titoliGiorni).not.toContain('Rientro a Bologna')
  })

  it('Dolomiti: l\'alloggio è in Pernottamento', () => {
    const dolomiti = trips.find((t) => t.name === 'Dolomiti Friulane')
    const pernottamento = dolomiti.sections.find((s) => s.type === 'lodging')
    expect(pernottamento.items).toHaveLength(1)
    expect(pernottamento.items[0].name).toBe('Alloggio a Forni di Sopra')
  })

  it('Dolomiti: le opzioni di escursione hanno kind sentiero con durata e dislivello', () => {
    const dolomiti = trips.find((t) => t.name === 'Dolomiti Friulane')
    const sentieri = dolomiti.days.flatMap((d) => d.items).filter((i) => i.kind === 'sentiero')
    expect(sentieri.length).toBeGreaterThanOrEqual(4)
    for (const s of sentieri) {
      expect(s.dislivello).not.toBe('')
    }
  })

  it('Ponza: treno e aliscafo sono in Trasporti', () => {
    const ponza = trips.find((t) => t.name === 'Ponza')
    const trasporti = ponza.sections.find((s) => s.type === 'transport')
    expect(trasporti.items.map((i) => i.mode)).toEqual(['treno', 'aliscafo'])
  })

  it('Ponza: il check-in è in Pernottamento', () => {
    const ponza = trips.find((t) => t.name === 'Ponza')
    const pernottamento = ponza.sections.find((s) => s.type === 'lodging')
    expect(pernottamento.items[0].name).toBe('Appartamento zona Porto')
  })

  it('Ponza: la cena del primo giorno ha kind pasto', () => {
    const ponza = trips.find((t) => t.name === 'Ponza')
    const primoGiorno = ponza.days.find((d) => d.date === '2026-08-30')
    const cena = primoGiorno.items.find((i) => i.title === 'Cena in paese')
    expect(cena.kind).toBe('pasto')
  })

  it('Ponza: la sezione Ristoranti esiste già ed è promossa senza duplicati', () => {
    const ponza = trips.find((t) => t.name === 'Ponza')
    const ristoranti = ponza.sections.filter((s) => s.type === 'cards' && s.title === 'Ristoranti')
    expect(ristoranti).toHaveLength(1)
  })

  it('Ponza: le sezioni libere esistenti restano (Spiagge e cale, Da prenotare, Note)', () => {
    const ponza = trips.find((t) => t.name === 'Ponza')
    const titoli = ponza.sections.slice(4).map((s) => s.title)
    expect(titoli).toEqual(expect.arrayContaining(['Spiagge e cale', 'Da prenotare', 'Note']))
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm test -- seed.test.js`
Expected: FAIL — il seed attuale ha ancora "Partenza da Bologna" dentro ai giorni, nessuna sezione `transport`/`lodging` popolata, nessun `kind` sulle voci.

- [ ] **Step 3: Riscrivi `seed/trips.json`**

Sostituisci l'intero contenuto del file con:

```json
[
  {
    "name": "Dolomiti Friulane",
    "emoji": "⛰️",
    "place": "Forni di Sopra (UD)",
    "start": "2026-08-24",
    "end": "2026-08-28",
    "palette": "mountain",
    "people": ["Vincenzo", "Compagna"],
    "days": [
      {
        "date": "2026-08-24",
        "title": "Arrivo + primo anello",
        "note": "Base fissa in paese: si rientra a dormire a Forni ogni sera. Verificare gli orari della seggiovia Varmost per l'Opzione A.",
        "items": [
          { "time": "", "title": "Opzione A — Anello delle Malghe", "kind": "sentiero", "detail": "Varmost · Tartoi · Tragonia — 14,2 km · 480 m D+ · 1.320 m D− · 5h14, con seggiovia fino a Malga Varmost", "link": "https://www.komoot.com/it-it/tour/3188306727", "durata": "5h14", "dislivello": "480 m D+ · 1.320 m D−", "difficolta": "" },
          { "time": "", "title": "Opzione B — Casera Montemaggiore · Biv. Francescutto · Casera Tragonia", "kind": "sentiero", "detail": "13,1 km · 970 m D+ · 1.100 m D− · 5h49, da Forni di Sopra", "link": "https://www.komoot.com/it-it/tour/3188224531", "durata": "5h49", "dislivello": "970 m D+ · 1.100 m D−", "difficolta": "" }
        ]
      },
      {
        "date": "2026-08-25",
        "title": "Truoi dai Sclops",
        "note": "Giornata lunga: sveglia presto.",
        "items": [
          { "time": "", "title": "Sentiero delle Genziane", "kind": "sentiero", "detail": "20,2 km · 1.540 m D+ · 7h20 — senso Val di Suola/Flaiban prima, Giaf in chiusura", "link": "https://www.komoot.com/tour/3193704353", "durata": "7h20", "dislivello": "1.540 m D+", "difficolta": "" }
        ]
      },
      {
        "date": "2026-08-26",
        "title": "Anello Domegge · Tita Barba · Rifugio Padova",
        "note": "",
        "items": [
          { "time": "", "title": "Anello dei rifugi", "kind": "sentiero", "detail": "20,6 km · 1.300 m D+ — partenza dal parcheggio vicino a Domegge", "link": "https://www.komoot.com/tour/3188038187", "durata": "", "dislivello": "1.300 m D+", "difficolta": "" }
        ]
      },
      {
        "date": "2026-08-27",
        "title": "Monte Clapsavon + rientro",
        "note": "Percorso difficile, versione senza ferrata.",
        "items": [
          { "time": "", "title": "Da Forni di Sopra al Clapsavon", "kind": "sentiero", "detail": "15,6 km · 1.470 m D+/D− · 6h33", "link": "https://www.komoot.com/it-it/tour/3188372456", "durata": "6h33", "dislivello": "1.470 m D+/D−", "difficolta": "difficile" }
        ]
      }
    ],
    "sections": [
      {
        "title": "Trasporti", "icon": "bus", "type": "transport",
        "items": [
          { "mode": "auto", "from": "Bologna", "to": "Forni di Sopra", "date": "2026-08-24", "time": "", "ticketLink": "", "note": "" },
          { "mode": "auto", "from": "Forni di Sopra", "to": "Bologna", "date": "2026-08-27", "time": "", "ticketLink": "", "note": "" }
        ]
      },
      {
        "title": "Pernottamento", "icon": "bed", "type": "lodging",
        "items": [
          { "name": "Alloggio a Forni di Sopra", "checkIn": "2026-08-24", "checkOut": "2026-08-28", "address": "", "bookingLink": "", "note": "Niente pernotti in rifugio, tenda o bivacco." }
        ]
      },
      {
        "title": "Riserve e alternative",
        "icon": "star",
        "type": "cards",
        "items": [
          { "title": "Giaf · Forcella Scodavacca · Anello di Bianchi", "meta": "11,8 km · 1.080 m D+ · 6h03", "detail": "Difficile.", "link": "https://www.komoot.com/tour/3193245322", "tags": ["riserva"] },
          { "title": "Campanile di Val Montanaia", "meta": "", "detail": "", "link": "", "tags": ["riserva"] },
          { "title": "Giro dei Laghetti e Pineta", "meta": "", "detail": "Ripiego per meteo incerto.", "link": "", "tags": ["pioggia"] }
        ]
      },
      {
        "title": "Zaino del giorno",
        "icon": "check",
        "type": "checklist",
        "items": [
          { "text": "Scarponi + bastoncini", "done": false },
          { "text": "2 L d'acqua", "done": false },
          { "text": "Guscio antivento e pile", "done": false },
          { "text": "Tracce komoot scaricate offline", "done": false },
          { "text": "Kit primo soccorso", "done": false },
          { "text": "Crema solare + occhiali", "done": false },
          { "text": "Frontalino", "done": false }
        ]
      },
      {
        "title": "Note",
        "icon": "note",
        "type": "notes",
        "text": "Escursioni ad anello con base fissa in paese. Tratti EE ed esposti accettati. Ogni sera si rientra a dormire a Forni."
      }
    ]
  },
  {
    "name": "Ponza",
    "emoji": "🌊",
    "place": "Ponza (LT) — zona Porto",
    "start": "2026-08-30",
    "end": "2026-09-05",
    "palette": "sea",
    "people": ["Vincenzo", "Compagna"],
    "days": [
      {
        "date": "2026-08-30",
        "title": "Arrivo",
        "note": "Si arriva nel tardo pomeriggio: niente spiaggia oggi.",
        "items": [
          { "time": "", "title": "Cena in paese", "kind": "pasto", "detail": "", "link": "", "luogo": "", "prenotato": false }
        ]
      },
      { "date": "2026-08-31", "title": "Prima giornata di mare", "note": "Possibile giro dell'isola in barca.", "items": [] },
      { "date": "2026-09-01", "title": "Mare", "note": "", "items": [] },
      { "date": "2026-09-02", "title": "Mare", "note": "", "items": [] },
      { "date": "2026-09-03", "title": "Mare", "note": "", "items": [] },
      { "date": "2026-09-04", "title": "Ultima giornata di mare", "note": "", "items": [] },
      { "date": "2026-09-05", "title": "Partenza", "note": "Si parte presto la mattina.", "items": [] }
    ],
    "sections": [
      {
        "title": "Trasporti", "icon": "bus", "type": "transport",
        "items": [
          { "mode": "treno", "from": "Bologna", "to": "Formia", "date": "2026-08-30", "time": "", "ticketLink": "", "note": "" },
          { "mode": "aliscafo", "from": "Formia", "to": "Ponza", "date": "2026-08-30", "time": "", "ticketLink": "", "note": "" }
        ]
      },
      {
        "title": "Pernottamento", "icon": "bed", "type": "lodging",
        "items": [
          { "name": "Appartamento zona Porto", "checkIn": "2026-08-30", "checkOut": "2026-09-05", "address": "", "bookingLink": "", "note": "" }
        ]
      },
      { "title": "Ristoranti", "icon": "food", "type": "cards", "items": [] },
      {
        "title": "Spiagge e cale",
        "icon": "map",
        "type": "cards",
        "items": [
          { "title": "Frontone", "meta": "", "detail": "", "link": "", "tags": ["programma spiagge"] },
          { "title": "Santa Maria", "meta": "", "detail": "", "link": "", "tags": ["programma spiagge"] },
          { "title": "Cala Feola", "meta": "", "detail": "", "link": "", "tags": ["programma spiagge"] },
          { "title": "Piscine Naturali", "meta": "", "detail": "", "link": "", "tags": ["programma spiagge"] },
          { "title": "La Caletta", "meta": "", "detail": "", "link": "", "tags": ["programma spiagge"] },
          { "title": "Cala dell'Acqua", "meta": "", "detail": "", "link": "", "tags": ["programma spiagge"] },
          { "title": "Cala Gaetano", "meta": "", "detail": "", "link": "", "tags": ["programma spiagge"] },
          { "title": "Cala Cecata", "meta": "", "detail": "", "link": "", "tags": ["programma spiagge"] },
          { "title": "La Parata", "meta": "", "detail": "", "link": "", "tags": ["programma spiagge"] }
        ]
      },
      {
        "title": "Da prenotare",
        "icon": "check",
        "type": "checklist",
        "items": [
          { "text": "Appartamento zona Porto", "done": false },
          { "text": "Biglietti treno andata e ritorno", "done": false },
          { "text": "Aliscafo andata e ritorno", "done": false },
          { "text": "Giro dell'isola in barca (31/08 o metà settimana)", "done": false },
          { "text": "Ristorante per la prima sera", "done": false }
        ]
      },
      {
        "title": "Note",
        "icon": "note",
        "type": "notes",
        "text": "Giornate di mare utili: dal 31/08 al 04/09. Alloggio in centro (zona Porto) per comodità serale e vicinanza all'imbarco delle gite in barca."
      }
    ]
  }
]
```

Nota: nella sezione "Riserve e alternative" di Dolomiti la card "Giaf · Forcella Scodavacca..." ha già `meta`/`detail` con dati impliciti di dislivello/durata in testo libero — resta una sezione libera invariata, non viene convertita in voci di giorno perché non è associata a una data specifica.

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npm test -- seed.test.js`
Expected: PASS su tutti gli assert.

- [ ] **Step 5: Esegui l'intera suite per assicurarti di non aver rotto altro**

Run: `npm test`
Expected: PASS su tutti i file di test (`schema.test.js`, `seed.test.js`, `ModifiedBy.test.js`).

- [ ] **Step 6: Commit**

```bash
git add seed/trips.json src/data/seed.test.js
git commit -m "migra seed/trips.json alle sezioni fisse trasporti/pernottamento"
```

---

### Task 6: Itinerario — form/vista per `kind` del giorno + rinomina tab

**Files:**
- Modify: `src/views/Days.jsx`
- Modify: `src/views/TripView.jsx:17-21`

**Interfaces:**
- Consuma: `dayItemFieldsForKind` da `../data/schema.js` (Task 1), `stampModified` (esistente).
- Nessuna nuova funzione esportata: modifica di viste, verificata manualmente (nessun test automatico per componenti React in questo progetto — vedi `ModifiedBy.test.js` come unico precedente, su una funzione pura).

- [ ] **Step 1: Rinomina il tab "Giorni" in "Itinerario"**

In `src/views/TripView.jsx`, riga 19, cambia:

```js
    { key: 'days', label: 'Giorni' },
```

in:

```js
    { key: 'days', label: 'Itinerario' },
```

- [ ] **Step 2: Estendi il form della voce con la scelta del `kind`**

In `src/views/Days.jsx`, aggiorna l'import (riga 1-9) aggiungendo l'helper e le icone per kind:

```js
import { useState } from 'react'
import { Plus, Pencil, Trash2, Mountain, Waves, Utensils } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Label from '../components/Label.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified, dayItemFieldsForKind } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
```

Sostituisci `const EMPTY_ITEM = { time: '', title: '', detail: '', link: '' }` (riga 18) con:

```js
const EMPTY_ITEM = { kind: '', time: '', title: '', detail: '', link: '', durata: '', dislivello: '', difficolta: '', accesso: '', servizi: '', luogo: '', prenotato: false }

const KIND_OPTIONS = [
  { value: '', label: 'Generica' },
  { value: 'sentiero', label: 'Sentiero' },
  { value: 'spiaggia', label: 'Spiaggia' },
  { value: 'pasto', label: 'Pasto' }
]

const KIND_ICONS = { sentiero: Mountain, spiaggia: Waves, pasto: Utensils }

function fieldsForForm(itemForm) {
  const common = { time: itemForm.time, title: itemForm.title, kind: itemForm.kind, detail: itemForm.detail, link: itemForm.link }
  for (const field of dayItemFieldsForKind(itemForm.kind)) {
    common[field] = itemForm[field]
  }
  return common
}
```

Sostituisci `saveItem` (righe 42-54) con:

```js
  function saveItem(e) {
    e.preventDefault()
    const { dayId, id } = itemForm
    const fields = fieldsForForm(itemForm)
    onUpdate((t) => ({
      ...t,
      days: t.days.map((d) => {
        if (d.id !== dayId) return d
        if (id) return { ...d, items: d.items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it)) }
        return { ...d, items: [...d.items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)] }
      })
    }))
    setItemForm(null)
  }
```

- [ ] **Step 3: Mostra i campi propri sotto la lista e nel form**

Nella lista delle voci (dentro il blocco `day.items.map((item) => ...)`, righe 96-119), dopo la riga con `<span className="text-base">{item.title}</span>`, aggiungi l'icona del kind e i campi propri:

```jsx
                <li key={item.id} className="flex items-start gap-1">
                  <div className="flex-1">
                    {item.time && <span className="font-mono text-sm text-[var(--muted)] mr-2">{item.time}</span>}
                    {KIND_ICONS[item.kind] && (() => {
                      const Icon = KIND_ICONS[item.kind]
                      return <Icon size={15} className="inline mr-1.5 -mt-0.5 text-[var(--muted)]" />
                    })()}
                    <span className="text-base">{item.title}</span>
                    {item.detail && <p className="text-sm text-[var(--muted)] mt-0.5">{item.detail}</p>}
                    {item.kind === 'sentiero' && (item.durata || item.dislivello || item.difficolta) && (
                      <p className="font-mono text-xs text-[var(--muted)] mt-0.5">
                        {[item.durata, item.dislivello, item.difficolta].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {item.kind === 'spiaggia' && (item.accesso || item.servizi) && (
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {[item.accesso, item.servizi].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {item.kind === 'pasto' && (item.luogo || item.prenotato) && (
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {[item.luogo, item.prenotato ? 'prenotato' : ''].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noreferrer" className="text-sm text-[var(--accent)] underline block mt-0.5">
                        Apri il link
                      </a>
                    )}
                    <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
                  </div>
                  <button
                    onClick={() => setItemForm({ dayId: day.id, id: item.id, ...EMPTY_ITEM, ...item })}
                    aria-label="Modifica voce"
                    className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]"
                  >
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => removeItem(day.id, item)} aria-label="Elimina voce" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                    <Trash2 size={15} />
                  </button>
                </li>
```

(la modifica chiave nel bottone "Modifica voce": `{ dayId: day.id, id: item.id, ...EMPTY_ITEM, ...item }` garantisce che il form riparta sempre con tutti i campi possibili — sovrascritti da quelli reali dell'item — anche se l'item non li aveva mai avuti).

Aggiorna anche il pulsante "Aggiungi voce" (riga 124) che oggi passa `{ dayId: day.id, ...EMPTY_ITEM }` — resta invariato, `EMPTY_ITEM` ora include già `kind` e i campi vuoti.

Sostituisci il form nella Modal "Nuova voce/Modifica voce" (righe 147-157) con:

```jsx
      <Modal open={!!itemForm} title={itemForm?.id ? 'Modifica voce' : 'Nuova voce'} onClose={() => setItemForm(null)}>
        {itemForm && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <select value={itemForm.kind} onChange={(e) => setItemForm({ ...itemForm, kind: e.target.value })} className={inputClass}>
              {KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input type="time" value={itemForm.time} onChange={(e) => setItemForm({ ...itemForm, time: e.target.value })} className={inputClass} />
            <input required placeholder="Titolo" value={itemForm.title} onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })} className={inputClass} />
            <textarea placeholder="Dettaglio" value={itemForm.detail} onChange={(e) => setItemForm({ ...itemForm, detail: e.target.value })} className={inputClass} rows={2} />
            <input placeholder="Link" value={itemForm.link} onChange={(e) => setItemForm({ ...itemForm, link: e.target.value })} className={inputClass} />

            {itemForm.kind === 'sentiero' && (
              <>
                <input placeholder="Durata (es. 5h14)" value={itemForm.durata} onChange={(e) => setItemForm({ ...itemForm, durata: e.target.value })} className={inputClass} />
                <input placeholder="Dislivello (es. 480 m D+)" value={itemForm.dislivello} onChange={(e) => setItemForm({ ...itemForm, dislivello: e.target.value })} className={inputClass} />
                <input placeholder="Difficoltà (es. media, EE)" value={itemForm.difficolta} onChange={(e) => setItemForm({ ...itemForm, difficolta: e.target.value })} className={inputClass} />
              </>
            )}
            {itemForm.kind === 'spiaggia' && (
              <>
                <input placeholder="Come arrivarci" value={itemForm.accesso} onChange={(e) => setItemForm({ ...itemForm, accesso: e.target.value })} className={inputClass} />
                <input placeholder="Servizi (bar, ombrelloni...)" value={itemForm.servizi} onChange={(e) => setItemForm({ ...itemForm, servizi: e.target.value })} className={inputClass} />
              </>
            )}
            {itemForm.kind === 'pasto' && (
              <>
                <input placeholder="Nome del locale" value={itemForm.luogo} onChange={(e) => setItemForm({ ...itemForm, luogo: e.target.value })} className={inputClass} />
                <label className="flex items-center gap-2 text-base">
                  <input type="checkbox" checked={itemForm.prenotato} onChange={(e) => setItemForm({ ...itemForm, prenotato: e.target.checked })} />
                  Prenotato
                </label>
              </>
            )}

            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
```

- [ ] **Step 4: Verifica manuale**

Run: `npm run dev`, apri un viaggio, tab Itinerario:
- crea una voce "Generica": nessun campo extra appare.
- crea una voce "Sentiero": compaiono durata/dislivello/difficoltà, si salvano e si vedono nella lista in mono.
- crea una voce "Spiaggia" e una "Pasto": stesso comportamento coi loro campi.
- modifica una voce esistente cambiando kind: i campi del nuovo kind partono vuoti (non trascinano valori del kind precedente, perché `fieldsForForm` filtra sui campi del kind corrente).

- [ ] **Step 5: Commit**

```bash
git add src/views/Days.jsx src/views/TripView.jsx
git commit -m "aggiungi tipi di voce (sentiero/spiaggia/pasto) all'itinerario"
```

---

### Task 7: Overview — nascondi le sezioni fisse dalla gestione manuale

**Files:**
- Modify: `src/views/Overview.jsx`

**Interfaces:**
- Consuma: `trip.sections` (già arricchito dalle 4 fisse per via di `normalizeTrip`, Task 4).
- Nessuna nuova funzione esportata.

**Perché:** la lista "Sezioni" in Panoramica permette oggi di eliminare qualunque sezione. Trasporti/Pernottamento/Mappa e la Ristoranti fissa hanno ora una loro tab dedicata con gestione propria (Task 8-10): non devono comparire come eliminabili da qui, altrimenti un tocco distratto le svuota (tornerebbero comunque vuote al prossimo giro da `normalizeTrip`, ma sparirebbero gli item già inseriti).

- [ ] **Step 1: Filtra le sezioni fisse dalla lista "Sezioni"**

In `src/views/Overview.jsx`, dopo la funzione `removeTrip` (dopo riga 74), aggiungi:

```js
function isFixedSection(section) {
  if (section.type === 'transport' || section.type === 'lodging' || section.type === 'map') return true
  return section.type === 'cards' && section.title === 'Ristoranti'
}
```

Sostituisci il rendering della lista (righe 120-134):

```jsx
        <ul className="mt-2 flex flex-col divide-y divide-[var(--line)] bg-[var(--card)] rounded-[24px] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05)] overflow-hidden">
          {trip.sections.filter((s) => !isFixedSection(s)).map((section) => {
            const Icon = ICONS[section.icon] ?? Star
            return (
              <li key={section.id} className="flex items-center gap-3 px-4 py-3.5">
                <Icon size={19} className="text-[var(--muted)]" />
                <span className="flex-1 text-base">{section.title || 'Senza titolo'}</span>
                <button onClick={() => removeSection(section)} aria-label={`Elimina ${section.title}`} className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Trash2 size={17} />
                </button>
              </li>
            )
          })}
          {trip.sections.filter((s) => !isFixedSection(s)).length === 0 && <li className="px-4 py-3.5 text-base text-[var(--muted)]">Nessuna sezione ancora.</li>}
        </ul>
```

- [ ] **Step 2: Verifica manuale**

Run: `npm run dev`, apri Dolomiti in Panoramica: la lista "Sezioni" deve mostrare solo "Riserve e alternative", "Zaino del giorno", "Note" (non Trasporti/Pernottamento/Ristoranti/Mappa). Il pulsante "Aggiungi" continua a creare solo sezioni `cards`/`checklist`/`notes` come prima (il form non cambia).

- [ ] **Step 3: Commit**

```bash
git add src/views/Overview.jsx
git commit -m "nascondi le sezioni fisse dalla gestione manuale in panoramica"
```

---

### Task 8: `views/Transport.jsx` + dispatch in `Section.jsx`

**Files:**
- Create: `src/views/Transport.jsx`
- Modify: `src/views/Section.jsx`

**Interfaces:**
- Consuma: `stampModified` da `../data/schema.js`, componenti `Btn`, `Label`, `Modal`, `Empty`, `ModifiedBy` esistenti.
- Produce: `export default function Transport({ trip, section, onUpdate, activeDisplayName })`, stessa firma di `Section`/`Days` — riceve l'intero `trip` e aggiorna solo la sezione ricevuta (pattern identico a `updateSection` già in `Section.jsx`).
- Consumato da: `Section.jsx` (dispatch per `type === 'transport'`).

- [ ] **Step 1: Crea `src/views/Transport.jsx`**

```jsx
import { useState } from 'react'
import { Plus, Pencil, Trash2, Train, Plane, Ship, Car, Bus } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { mode: '', from: '', to: '', date: '', time: '', ticketLink: '', note: '' }

const MODE_ICONS = { treno: Train, aereo: Plane, aliscafo: Ship, traghetto: Ship, auto: Car, bus: Bus }

function ModeIcon({ mode }) {
  const Icon = MODE_ICONS[mode] ?? Bus
  return <Icon size={19} className="text-[var(--muted)]" />
}

function sortKey(item) {
  return `${item.date}T${item.time || '00:00'}`
}

export default function Transport({ trip, section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...fields } = form
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    setForm(null)
  }

  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.mode} ${item.from} → ${item.to}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  const sorted = [...section.items].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))

  return (
    <div className="flex flex-col gap-4 pt-5">
      <h2 className="font-display font-semibold text-3xl">{section.title}</h2>

      {sorted.length === 0 && (
        <Empty title="Nessun trasporto ancora" detail="Aggiungi treni, voli, aliscafi o altri spostamenti." action={<Btn onClick={() => setForm(EMPTY_ITEM)}>Aggiungi un trasporto</Btn>} />
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((item) => (
          <div key={item.id} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <ModeIcon mode={item.mode} />
                <p className="font-display font-semibold text-xl">{item.from} → {item.to}</p>
              </div>
              <div className="flex gap-1 -mr-2 -mt-1">
                <button onClick={() => setForm({ ...item })} aria-label="Modifica trasporto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina trasporto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(item.date || item.time) && (
              <p className="font-mono text-sm text-[var(--muted)] mt-1">{[item.date, item.time].filter(Boolean).join(' · ')}</p>
            )}
            {item.note && <p className="text-base mt-2">{item.note}</p>}
            {item.ticketLink && (
              <a href={item.ticketLink} target="_blank" rel="noreferrer" className="text-base text-[var(--accent)] underline mt-2 inline-block">
                Apri il biglietto
              </a>
            )}
            <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
          </div>
        ))}
      </div>

      {sorted.length > 0 && (
        <Btn variant="secondary" onClick={() => setForm(EMPTY_ITEM)} className="self-start">
          <Plus size={17} /> Nuovo trasporto
        </Btn>
      )}

      <Modal open={!!form} title={form?.id ? 'Modifica trasporto' : 'Nuovo trasporto'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <input required placeholder="Mezzo (treno, aereo, aliscafo...)" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={inputClass} />
            <input required placeholder="Da" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className={inputClass} />
            <input required placeholder="A" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <input placeholder="Link biglietto" value={form.ticketLink} onChange={(e) => setForm({ ...form, ticketLink: e.target.value })} className={inputClass} />
            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
}
```

- [ ] **Step 2: Aggiungi il dispatch in `Section.jsx`**

In `src/views/Section.jsx`, aggiungi l'import in cima:

```js
import Transport from './Transport.jsx'
```

Dopo il ramo `{section.type === 'notes' && ( ... )}` (dopo riga 170), aggiungi:

```jsx
      {section.type === 'transport' && <Transport trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={activeDisplayName} />}
```

- [ ] **Step 3: Verifica manuale**

Run: `npm run dev`, apri Ponza, tab Trasporti: devono comparire treno Bologna→Formia e aliscafo Formia→Ponza (dal seed migrato). Aggiungi, modifica ed elimina un trasporto.

- [ ] **Step 4: Commit**

```bash
git add src/views/Transport.jsx src/views/Section.jsx
git commit -m "aggiungi la vista Trasporti"
```

---

### Task 9: `views/Lodging.jsx` + dispatch in `Section.jsx`

**Files:**
- Create: `src/views/Lodging.jsx`
- Modify: `src/views/Section.jsx`

**Interfaces:**
- Stessa forma del Task 8: `export default function Lodging({ trip, section, onUpdate, activeDisplayName })`.
- Consumato da: `Section.jsx` (dispatch per `type === 'lodging'`).

- [ ] **Step 1: Crea `src/views/Lodging.jsx`**

```jsx
import { useState } from 'react'
import { Plus, Pencil, Trash2, Bed } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { name: '', checkIn: '', checkOut: '', address: '', bookingLink: '', note: '' }

export default function Lodging({ trip, section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...fields } = form
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    setForm(null)
  }

  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.name}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  const sorted = [...section.items].sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''))

  return (
    <div className="flex flex-col gap-4 pt-5">
      <h2 className="font-display font-semibold text-3xl">{section.title}</h2>

      {sorted.length === 0 && (
        <Empty icon={Bed} title="Nessun alloggio ancora" detail="Aggiungi hotel o appartamenti prenotati." action={<Btn onClick={() => setForm(EMPTY_ITEM)}>Aggiungi un alloggio</Btn>} />
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((item) => (
          <div key={item.id} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display font-semibold text-xl">{item.name || 'Senza nome'}</p>
              <div className="flex gap-1 -mr-2 -mt-1">
                <button onClick={() => setForm({ ...item })} aria-label="Modifica alloggio" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina alloggio" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(item.checkIn || item.checkOut) && (
              <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.checkIn || '?'} → {item.checkOut || '?'}</p>
            )}
            {item.address && <p className="text-base mt-2">{item.address}</p>}
            {item.note && <p className="text-sm text-[var(--muted)] mt-1">{item.note}</p>}
            {item.bookingLink && (
              <a href={item.bookingLink} target="_blank" rel="noreferrer" className="text-base text-[var(--accent)] underline mt-2 inline-block">
                Apri la prenotazione
              </a>
            )}
            <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
          </div>
        ))}
      </div>

      {sorted.length > 0 && (
        <Btn variant="secondary" onClick={() => setForm(EMPTY_ITEM)} className="self-start">
          <Plus size={17} /> Nuovo alloggio
        </Btn>
      )}

      <Modal open={!!form} title={form?.id ? 'Modifica alloggio' : 'Nuovo alloggio'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <input required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="date" placeholder="Check-in" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="date" placeholder="Check-out" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <input placeholder="Indirizzo" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
            <input placeholder="Link prenotazione" value={form.bookingLink} onChange={(e) => setForm({ ...form, bookingLink: e.target.value })} className={inputClass} />
            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
}
```

- [ ] **Step 2: Aggiungi il dispatch in `Section.jsx`**

In `src/views/Section.jsx`, aggiungi l'import:

```js
import Lodging from './Lodging.jsx'
```

Dopo il ramo `transport` aggiunto nel Task 8, aggiungi:

```jsx
      {section.type === 'lodging' && <Lodging trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={activeDisplayName} />}
```

- [ ] **Step 3: Verifica manuale**

Run: `npm run dev`, apri Dolomiti, tab Pernottamento: deve comparire "Alloggio a Forni di Sopra" con check-in/check-out. Aggiungi, modifica ed elimina un alloggio.

- [ ] **Step 4: Commit**

```bash
git add src/views/Lodging.jsx src/views/Section.jsx
git commit -m "aggiungi la vista Pernottamento"
```

---

### Task 10: Dipendenza `leaflet`/`react-leaflet` + `views/MapSection.jsx` + dispatch

**Files:**
- Modify: `package.json`
- Create: `src/views/MapSection.jsx`
- Modify: `src/views/Section.jsx`

**Interfaces:**
- Consuma: `MapContainer`, `TileLayer`, `Marker`, `Popup` da `react-leaflet`; `L` da `leaflet`.
- Produce: `export default function MapSection({ trip, section, onUpdate, activeDisplayName })`.
- Consumato da: `Section.jsx` (dispatch per `type === 'map'`).

- [ ] **Step 1: Installa la dipendenza**

Run: `npm install leaflet react-leaflet`

Verifica che `package.json` guadagni le due righe in `dependencies` (versioni gestite da npm, non fissarle a mano).

- [ ] **Step 2: Crea `src/views/MapSection.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'

// Senza questo fix i marker di Leaflet risultano invisibili sotto Vite: il
// bundler non riesce a risolvere i path relativi che la libreria si aspetta.
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { name: '', category: '', mapsLink: '', lat: '', lng: '', note: '' }

function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    function goOnline() { setOnline(true) }
    function goOffline() { setOnline(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return online
}

export default function MapSection({ trip, section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)
  const online = useOnlineStatus()

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...raw } = form
    const fields = { ...raw, lat: raw.lat === '' ? null : Number(raw.lat), lng: raw.lng === '' ? null : Number(raw.lng) }
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    setForm(null)
  }

  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.name}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  const withCoords = section.items.filter((i) => i.lat !== null && i.lng !== null)
  const center = withCoords.length > 0
    ? [withCoords.reduce((sum, i) => sum + i.lat, 0) / withCoords.length, withCoords.reduce((sum, i) => sum + i.lng, 0) / withCoords.length]
    : null

  return (
    <div className="flex flex-col gap-4 pt-5">
      <h2 className="font-display font-semibold text-3xl">{section.title}</h2>

      {online && center && (
        <div className="rounded-[24px] overflow-hidden h-64 border border-[var(--line)]">
          <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
            {withCoords.map((item) => (
              <Marker key={item.id} position={[item.lat, item.lng]}>
                <Popup>{item.name}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {section.items.length === 0 && (
        <Empty icon={MapPin} title="Nessun punto ancora" detail="Aggiungi i posti da non perdere." action={<Btn onClick={() => setForm(EMPTY_ITEM)}>Aggiungi un punto</Btn>} />
      )}

      <div className="flex flex-col gap-3">
        {section.items.map((item) => (
          <div key={item.id} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display font-semibold text-xl">{item.name || 'Senza nome'}</p>
                {item.category && <p className="text-sm text-[var(--muted)]">{item.category}</p>}
              </div>
              <div className="flex gap-1 -mr-2 -mt-1">
                <button onClick={() => setForm({ ...item, lat: item.lat ?? '', lng: item.lng ?? '' })} aria-label="Modifica punto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina punto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {item.note && <p className="text-base mt-2">{item.note}</p>}
            {item.mapsLink && (
              <a href={item.mapsLink} target="_blank" rel="noreferrer" className="text-base text-[var(--accent)] underline mt-2 inline-block">
                Apri in Maps
              </a>
            )}
            <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
          </div>
        ))}
      </div>

      {section.items.length > 0 && (
        <Btn variant="secondary" onClick={() => setForm(EMPTY_ITEM)} className="self-start">
          <Plus size={17} /> Nuovo punto
        </Btn>
      )}

      <Modal open={!!form} title={form?.id ? 'Modifica punto' : 'Nuovo punto'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <input required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <input placeholder="Categoria (spiaggia, ristorante, punto panoramico...)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} />
            <input placeholder="Link Google/Apple Maps" value={form.mapsLink} onChange={(e) => setForm({ ...form, mapsLink: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="number" step="any" placeholder="Latitudine" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="number" step="any" placeholder="Longitudine" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
}
```

- [ ] **Step 3: Aggiungi il dispatch in `Section.jsx`**

In `src/views/Section.jsx`, aggiungi l'import:

```js
import MapSection from './MapSection.jsx'
```

Dopo il ramo `lodging` aggiunto nel Task 9, aggiungi:

```jsx
      {section.type === 'map' && <MapSection trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={activeDisplayName} />}
```

- [ ] **Step 4: Verifica manuale online**

Run: `npm run dev`, apri un viaggio, tab Mappa: con la sezione vuota (seed non ha punti) deve comparire la schermata vuota "Nessun punto ancora". Aggiungi un punto con lat/lng valide (es. 46.164, 12.586 per Forni di Sopra): deve comparire la mappa con un marker cliccabile, più la card sotto con link Maps.

- [ ] **Step 5: Verifica manuale offline**

In DevTools → Network → Offline, ricarica la pagina in `npm run dev` (o meglio in `npm run preview`, dove gira il service worker): la sezione Mappa con punti già salvati deve mostrare solo le card, senza il riquadro mappa e senza errori in console.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/views/MapSection.jsx src/views/Section.jsx
git commit -m "aggiungi la vista Mappa con Leaflet online-only"
```

---

### Task 11: Verifica finale

**Files:** nessuno (solo comandi di verifica)

- [ ] **Step 1: Esegui l'intera suite di test**

Run: `npm test`
Expected: PASS su `schema.test.js`, `seed.test.js`, `ModifiedBy.test.js`.

- [ ] **Step 2: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori.

- [ ] **Step 3: Verifica PWA offline**

Run: `npm run preview`, poi in DevTools:
- Application → Service Workers: verifica che il service worker sia attivo.
- Network → Offline: ricarica la pagina, apri Dolomiti e Ponza, verifica che tutte e 6 le tab (Panoramica, Itinerario, Trasporti, Pernottamento, Ristoranti, Mappa) si aprano mostrando i dati locali, e che la Mappa mostri la sola lista senza errori.

- [ ] **Step 4: Commit finale (se necessario)**

Se la verifica ha richiesto correzioni non ancora committate:

```bash
git add -A
git commit -m "sistema le ultime rifiniture delle sezioni fisse"
```
