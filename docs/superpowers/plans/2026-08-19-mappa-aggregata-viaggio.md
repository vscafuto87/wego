# Mappa aggregata del viaggio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La tab Mappa del viaggio diventa una vista aggregata: mostra, oltre ai suoi punti gestiti a mano, anche i punti con coordinate delle sezioni `cards` (es. Ristoranti) e delle voci giorno `sentiero`/`spiaggia`/`pasto`, senza duplicare dati, con marker colorati per categoria, filtri e un link per tornare alla sezione di origine.

**Architecture:** Le coordinate diventano un campo opzionale (`lat`/`lng`, numero o `null`) su ogni item `cards` e su ogni voce giorno di kind `sentiero`/`spiaggia`/`pasto`, normalizzato in `schema.js` come già avviene per i punti Mappa. Una nuova funzione pura `collectExternalMapPoints(trip)` in `schema.js` aggrega questi punti in tempo reale (nessuna copia salvata); `MapSection.jsx` la unisce ai propri punti per il render. L'inserimento delle coordinate passa da un componente condiviso `CoordsInput` che prova a leggerle da un link Maps incollato (parsing regex locale, nessuna rete) con fallback a due input numerici.

**Tech Stack:** Vite + React 18 + JavaScript, Tailwind CSS, `leaflet` + `react-leaflet` (già presenti, nessuna nuova dipendenza), Vitest per i test di `schema.js`.

**Spec:** [docs/superpowers/specs/2026-08-19-mappa-aggregata-viaggio-design.md](../specs/2026-08-19-mappa-aggregata-viaggio-design.md)

## Global Constraints

- Un componente per file, niente file oltre ~250 righe, niente cartella `utils/` generica.
- Stesso schema JSON per stato in memoria, IndexedDB, import, export e colonna Supabase — nessuna trasformazione tra livelli.
- Nessun campo nuovo è mai obbligatorio: l'import può omettere `lat`/`lng` e l'item resta valido.
- Il parsing dei link Maps è puramente locale (regex su stringa): nessuna chiamata di rete, coerente col vincolo local-first del progetto.
- I sei tipi di sezione restano `cards, checklist, notes, transport, lodging, map`: questo lavoro non ne introduce di nuovi, solo campi opzionali sugli item esistenti.
- Copy in italiano, seconda persona, bottoni che dicono cosa succede.
- Aree toccabili da almeno 44px, focus visibile sempre (pattern già in uso nelle viste esistenti).
- Nessuna dipendenza nuova da installare.
- `npm run build` e `npm test` devono passare; verifica manuale offline/online in `npm run preview` prima di considerare il lavoro concluso.

---

### Task 1: Schema — coordinate opzionali sugli item `cards`

**Files:**
- Modify: `src/data/schema.js` (helper condiviso + `normalizeCardItem` + `normalizeMapItem`)
- Modify: `src/data/schema.test.js`

**Interfaces:**
- Produce: funzione interna `toCoord(value)` (numero finito o `null`, mai un errore); `normalizeCardItem(raw)` esteso con `lat`/`lng`.
- Consumato da: Task 2 (stesso helper per i day item), Task 4 (`collectExternalMapPoints`), Task 7 (`Section.jsx`).

- [ ] **Step 1: Scrivi i test per le coordinate sulle schede**

Aggiungi in fondo a `src/data/schema.test.js`:

```js
describe('normalizeTrip — coordinate opzionali sulle schede (cards)', () => {
  function tripWithCardItem(item) {
    return normalizeTrip({ name: 'X', sections: [{ title: 'Bar consigliati', type: 'cards', items: [item] }] })
  }

  it('scheda con coordinate valide', () => {
    const item = tripWithCardItem({ title: 'Trattoria da Assunta', lat: 40.897, lng: 12.958 })
      .sections.find((s) => s.title === 'Bar consigliati').items[0]
    expect(item.lat).toBe(40.897)
    expect(item.lng).toBe(12.958)
  })

  it('scheda senza coordinate: null, non errore', () => {
    const item = tripWithCardItem({ title: 'Senza coordinate' })
      .sections.find((s) => s.title === 'Bar consigliati').items[0]
    expect(item.lat).toBeNull()
    expect(item.lng).toBeNull()
  })

  it('coordinate non numeriche diventano null', () => {
    const item = tripWithCardItem({ title: 'X', lat: 'quaranta', lng: '13' })
      .sections.find((s) => s.title === 'Bar consigliati').items[0]
    expect(item.lat).toBeNull()
    expect(item.lng).toBeNull()
  })

  it('si applica anche alla sezione fissa Ristoranti, non solo alle sezioni cards custom', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'Ristoranti', type: 'cards', items: [{ title: 'Da Assunta', lat: 40.9, lng: 12.9 }] }]
    })
    const ristoranti = trip.sections.find((s) => s.type === 'cards' && s.title === 'Ristoranti')
    expect(ristoranti.items[0].lat).toBe(40.9)
  })

  it('exportTrip conserva lat/lng sulle schede, senza id', () => {
    const trip = tripWithCardItem({ title: 'X', lat: 40.9, lng: 12.9 })
    const exported = exportTrip(trip).sections.find((s) => s.title === 'Bar consigliati')
    expect(exported.items[0].lat).toBe(40.9)
    expect(exported.items[0].lng).toBe(12.9)
    expect(exported.items[0].id).toBeUndefined()
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- schema.test.js`
Expected: FAIL — `normalizeCardItem` non produce ancora `lat`/`lng`.

- [ ] **Step 3: Implementa `toCoord` e usalo in `normalizeCardItem`/`normalizeMapItem`**

In `src/data/schema.js`, dopo la funzione `arr` (righe 25-27), aggiungi l'helper condiviso:

```js
function toCoord(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
```

Sostituisci `normalizeCardItem` (righe 67-79) con:

```js
function normalizeCardItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    title: str(item.title),
    meta: str(item.meta),
    detail: str(item.detail),
    link: str(item.link),
    tags: arr(item.tags).map(str),
    lat: toCoord(item.lat),
    lng: toCoord(item.lng),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}
```

In `normalizeMapItem` (righe 123-138), sostituisci le due righe che calcolano `lat`/`lng` a mano:

```js
  const lat = typeof item.lat === 'number' && Number.isFinite(item.lat) ? item.lat : null
  const lng = typeof item.lng === 'number' && Number.isFinite(item.lng) ? item.lng : null
```

con:

```js
  const lat = toCoord(item.lat)
  const lng = toCoord(item.lng)
```

(comportamento identico, ora condiviso con `normalizeCardItem` invece che duplicato).

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- schema.test.js`
Expected: PASS su tutti i test, compresi quelli già esistenti sulla sezione `map` (che ora usano `toCoord` sotto il cofano ma con lo stesso comportamento).

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "aggiungi coordinate opzionali agli item delle sezioni cards"
```

---

### Task 2: Schema — coordinate opzionali su sentiero/spiaggia/pasto

**Files:**
- Modify: `src/data/schema.js` (`KIND_FIELDS`, `normalizeDayItem`)
- Modify: `src/data/schema.test.js`

**Interfaces:**
- Consuma: `toCoord` (Task 1).
- Produce: `dayItemFieldsForKind('sentiero'|'spiaggia'|'pasto')` include ora anche `'lat'`, `'lng'`; `normalizeDayItem` normalizza `lat`/`lng` per quei tre kind.
- Consumato da: Task 4 (`collectExternalMapPoints`), Task 8 (`Days.jsx`).

- [ ] **Step 1: Scrivi i test per le coordinate sulle voci giorno**

Aggiungi in fondo a `src/data/schema.test.js`:

```js
describe('dayItemFieldsForKind — include lat/lng per sentiero/spiaggia/pasto', () => {
  it('sentiero', () => {
    expect(dayItemFieldsForKind('sentiero')).toEqual(['durata', 'dislivello', 'difficolta', 'lat', 'lng'])
  })
  it('spiaggia', () => {
    expect(dayItemFieldsForKind('spiaggia')).toEqual(['accesso', 'servizi', 'lat', 'lng'])
  })
  it('pasto', () => {
    expect(dayItemFieldsForKind('pasto')).toEqual(['luogo', 'prenotato', 'lat', 'lng'])
  })
  it('voce generica: ancora nessun campo proprio', () => {
    expect(dayItemFieldsForKind('')).toEqual([])
  })
})

describe('normalizeTrip — coordinate su sentiero/spiaggia/pasto', () => {
  it('sentiero con coordinate valide', () => {
    const item = tripWithItem({ title: 'Anello', kind: 'sentiero', lat: 46.4, lng: 12.6 }).days[0].items[0]
    expect(item.lat).toBe(46.4)
    expect(item.lng).toBe(12.6)
  })

  it('spiaggia con coordinate valide', () => {
    const item = tripWithItem({ title: 'Frontone', kind: 'spiaggia', lat: 40.9, lng: 12.9 }).days[0].items[0]
    expect(item.lat).toBe(40.9)
    expect(item.lng).toBe(12.9)
  })

  it('pasto con coordinate valide', () => {
    const item = tripWithItem({ title: 'Cena', kind: 'pasto', lat: 40.9, lng: 12.9 }).days[0].items[0]
    expect(item.lat).toBe(40.9)
    expect(item.lng).toBe(12.9)
  })

  it('sentiero/spiaggia/pasto senza coordinate: null, non errore', () => {
    const sentiero = tripWithItem({ title: 'Anello', kind: 'sentiero' }).days[0].items[0]
    expect(sentiero.lat).toBeNull()
    expect(sentiero.lng).toBeNull()
  })

  it('voce generica: nessun campo lat/lng', () => {
    const item = tripWithItem({ title: 'Partenza', lat: 40.9, lng: 12.9 }).days[0].items[0]
    expect(item.lat).toBeUndefined()
    expect(item.lng).toBeUndefined()
  })

  it('exportTrip conserva lat/lng sulle voci giorno tipizzate', () => {
    const trip = tripWithItem({ title: 'Anello', kind: 'sentiero', lat: 46.4, lng: 12.6 })
    const exported = exportTrip(trip).days[0].items[0]
    expect(exported.lat).toBe(46.4)
    expect(exported.lng).toBe(12.6)
  })
})
```

(`tripWithItem` è già definita in cima al file dal task originale sulle sezioni fisse — non va ridefinita).

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- schema.test.js`
Expected: FAIL — `KIND_FIELDS` non include ancora `lat`/`lng`, quindi `dayItemFieldsForKind` non li restituisce e `normalizeDayItem` non li normalizza per quei kind.

- [ ] **Step 3: Estendi `KIND_FIELDS` e `normalizeDayItem`**

Sostituisci `KIND_FIELDS` (righe 7-11) con:

```js
const KIND_FIELDS = {
  sentiero: ['durata', 'dislivello', 'difficolta', 'lat', 'lng'],
  spiaggia: ['accesso', 'servizi', 'lat', 'lng'],
  pasto: ['luogo', 'prenotato', 'lat', 'lng']
}
```

Sostituisci i tre rami `if (kind === ...)` dentro `normalizeDayItem` (righe 42-51) con:

```js
  if (kind === 'sentiero') {
    return { ...base, durata: str(item.durata), dislivello: str(item.dislivello), difficolta: str(item.difficolta), lat: toCoord(item.lat), lng: toCoord(item.lng) }
  }
  if (kind === 'spiaggia') {
    return { ...base, accesso: str(item.accesso), servizi: str(item.servizi), lat: toCoord(item.lat), lng: toCoord(item.lng) }
  }
  if (kind === 'pasto') {
    return { ...base, luogo: str(item.luogo), prenotato: item.prenotato === true, lat: toCoord(item.lat), lng: toCoord(item.lng) }
  }
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- schema.test.js`
Expected: PASS su tutta la suite (Task 1 e 2 insieme).

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "aggiungi coordinate opzionali a sentiero/spiaggia/pasto"
```

---

### Task 3: Schema — `parseCoordsFromMapsLink`

**Files:**
- Modify: `src/data/schema.js`
- Modify: `src/data/schema.test.js`

**Interfaces:**
- Produce: `export function parseCoordsFromMapsLink(url)` → `{ lat: number, lng: number } | null`, non lancia mai.
- Consumato da: Task 5 (`CoordsInput.jsx`).

- [ ] **Step 1: Scrivi i test del parser**

Aggiungi in fondo a `src/data/schema.test.js` (aggiorna l'import in cima al file aggiungendo `parseCoordsFromMapsLink`):

```js
import { normalizeTrip, exportTrip, stampModified, dayItemFieldsForKind, parseCoordsFromMapsLink } from './schema.js'
```

```js
describe('parseCoordsFromMapsLink', () => {
  it('link Google Maps con @lat,lng,zoom', () => {
    const url = 'https://www.google.com/maps/place/Trattoria/@40.897123,12.958456,17z/data=!3m1!4b1'
    expect(parseCoordsFromMapsLink(url)).toEqual({ lat: 40.897123, lng: 12.958456 })
  })

  it('link Google Maps "place" con !3d..!4d.. ha priorità su @', () => {
    const url = 'https://www.google.com/maps/place/Trattoria/@40.0,12.0,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d40.897123!4d12.958456'
    expect(parseCoordsFromMapsLink(url)).toEqual({ lat: 40.897123, lng: 12.958456 })
  })

  it('link con ?q=lat,lng', () => {
    expect(parseCoordsFromMapsLink('https://maps.google.com/?q=40.897,12.958')).toEqual({ lat: 40.897, lng: 12.958 })
  })

  it('link Apple Maps con ?ll=lat,lng', () => {
    expect(parseCoordsFromMapsLink('https://maps.apple.com/?ll=40.897,12.958&q=Trattoria')).toEqual({ lat: 40.897, lng: 12.958 })
  })

  it('coordinate negative (emisfero sud/ovest)', () => {
    expect(parseCoordsFromMapsLink('https://www.google.com/maps/@-33.8688,151.2093,15z')).toEqual({ lat: -33.8688, lng: 151.2093 })
  })

  it('link breve maps.app.goo.gl: nessuna coordinata leggibile, ritorna null', () => {
    expect(parseCoordsFromMapsLink('https://maps.app.goo.gl/aBcDeFg123')).toBeNull()
  })

  it('testo qualunque, stringa vuota, undefined: null, mai un errore', () => {
    expect(parseCoordsFromMapsLink('non è un link')).toBeNull()
    expect(parseCoordsFromMapsLink('')).toBeNull()
    expect(() => parseCoordsFromMapsLink(undefined)).not.toThrow()
    expect(parseCoordsFromMapsLink(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- schema.test.js`
Expected: FAIL — `parseCoordsFromMapsLink` non esiste ancora.

- [ ] **Step 3: Implementa `parseCoordsFromMapsLink`**

Aggiungi in fondo a `src/data/schema.js`, dopo `stampModified`:

```js
const COORD = String.raw`(-?\d{1,3}\.\d+)`
const MAPS_LINK_PATTERNS = [
  new RegExp(`!3d${COORD}!4d${COORD}`),
  new RegExp(`[?&]q=${COORD},${COORD}`),
  new RegExp(`[?&]ll=${COORD},${COORD}`),
  new RegExp(`@${COORD},${COORD}`)
]

// Legge lat/lng da un link Google/Apple Maps con pattern noti, senza alcuna
// chiamata di rete: i link brevi (maps.app.goo.gl) non contengono coordinate
// leggibili e restano fuori scope, ritornano null come qualunque altro
// formato non riconosciuto — mai un errore.
export function parseCoordsFromMapsLink(url) {
  const text = str(url)
  for (const pattern of MAPS_LINK_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const lat = Number(match[1])
      const lng = Number(match[2])
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    }
  }
  return null
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- schema.test.js`
Expected: PASS su tutti i test del parser.

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "aggiungi parseCoordsFromMapsLink per leggere coordinate da un link Maps"
```

---

### Task 4: Schema — `collectExternalMapPoints`

**Files:**
- Modify: `src/data/schema.js`
- Modify: `src/data/schema.test.js`

**Interfaces:**
- Consuma: `trip` normalizzato (con `lat`/`lng` da Task 1 e 2).
- Produce: `export function collectExternalMapPoints(trip)` → array di `{ id, name, lat, lng, link, categoryGroup, origin }`, dove `link` è il campo `link` generico già esistente sull'item di origine (stringa vuota se assente), `categoryGroup` è `'schede' | 'sentiero' | 'spiaggia' | 'pasto'` e `origin` è `{ tab, sectionTitle }` per le schede o `{ tab: 'days', dayDate, itemTitle }` per le voci giorno. Non include mai i punti della sezione Mappa stessa (li aggrega solo `MapSection.jsx`, Task 6).
- Consumato da: Task 6 (`MapSection.jsx`).

- [ ] **Step 1: Scrivi i test dell'aggregatore**

Aggiungi in fondo a `src/data/schema.test.js` (aggiorna l'import aggiungendo `collectExternalMapPoints`):

```js
import { normalizeTrip, exportTrip, stampModified, dayItemFieldsForKind, parseCoordsFromMapsLink, collectExternalMapPoints } from './schema.js'
```

```js
describe('collectExternalMapPoints', () => {
  function baseTrip(overrides) {
    return normalizeTrip({
      name: 'X',
      days: [{ date: '2026-08-30', items: [
        { title: 'Anello delle Malghe', kind: 'sentiero', lat: 46.4, lng: 12.6 },
        { title: 'Frontone', kind: 'spiaggia', lat: 40.9, lng: 12.9 },
        { title: 'Cena in paese', kind: 'pasto', lat: 40.91, lng: 12.91 },
        { title: 'Partenza', lat: 40.0, lng: 12.0 }
      ] }],
      sections: [
        { title: 'Ristoranti', type: 'cards', items: [{ title: 'Da Assunta', lat: 40.897, lng: 12.958 }] },
        { title: 'Bar consigliati', type: 'cards', items: [{ title: 'Senza coordinate' }] }
      ],
      ...overrides
    })
  }

  it('include le schede con coordinate, escludendo quelle senza', () => {
    const points = collectExternalMapPoints(baseTrip())
    const schede = points.filter((p) => p.categoryGroup === 'schede')
    expect(schede).toHaveLength(1)
    expect(schede[0]).toMatchObject({ name: 'Da Assunta', lat: 40.897, lng: 12.958, link: '' })
    expect(schede[0].origin.sectionTitle).toBe('Ristoranti')
  })

  it('conserva il link generico dell\'item, se presente', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'Ristoranti', type: 'cards', items: [{ title: 'Da Assunta', lat: 40.897, lng: 12.958, link: 'https://example.com' }] }]
    })
    const [point] = collectExternalMapPoints(trip)
    expect(point.link).toBe('https://example.com')
  })

  it('include sentiero/spiaggia/pasto con coordinate, non la voce generica', () => {
    const points = collectExternalMapPoints(baseTrip())
    expect(points.filter((p) => p.categoryGroup === 'sentiero')).toHaveLength(1)
    expect(points.filter((p) => p.categoryGroup === 'spiaggia')).toHaveLength(1)
    expect(points.filter((p) => p.categoryGroup === 'pasto')).toHaveLength(1)
    expect(points.find((p) => p.name === 'Partenza')).toBeUndefined()
  })

  it('origin delle voci giorno porta alla tab Itinerario con data e titolo', () => {
    const points = collectExternalMapPoints(baseTrip())
    const sentiero = points.find((p) => p.categoryGroup === 'sentiero')
    expect(sentiero.origin).toEqual({ tab: 'days', dayDate: '2026-08-30', itemTitle: 'Anello delle Malghe' })
  })

  it('non include mai i punti della sezione Mappa stessa', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'Mappa', type: 'map', items: [{ name: 'Punto manuale', lat: 40.9, lng: 12.9 }] }]
    })
    expect(collectExternalMapPoints(trip)).toEqual([])
  })

  it('viaggio senza punti esterni: array vuoto', () => {
    const trip = normalizeTrip({ name: 'X' })
    expect(collectExternalMapPoints(trip)).toEqual([])
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- schema.test.js`
Expected: FAIL — `collectExternalMapPoints` non esiste ancora.

- [ ] **Step 3: Implementa `collectExternalMapPoints`**

Aggiungi in fondo a `src/data/schema.js`, dopo `parseCoordsFromMapsLink`:

```js
const DAY_MAP_KINDS = ['sentiero', 'spiaggia', 'pasto']

// Punti con coordinate che vivono in altre sezioni/giorni del viaggio, utili
// per la mappa aggregata. Calcolo derivato, nessuna copia salvata: chiamare
// di nuovo dopo ogni modifica del viaggio, mai persistere il risultato.
export function collectExternalMapPoints(trip) {
  const fromCards = trip.sections
    .filter((s) => s.type === 'cards')
    .flatMap((s) => s.items
      .filter((i) => i.lat !== null && i.lng !== null)
      .map((i) => ({
        id: i.id,
        name: i.title,
        lat: i.lat,
        lng: i.lng,
        link: i.link,
        categoryGroup: 'schede',
        origin: { tab: s.id, sectionTitle: s.title }
      })))
  const fromDays = trip.days.flatMap((d) => d.items
    .filter((i) => DAY_MAP_KINDS.includes(i.kind) && i.lat !== null && i.lng !== null)
    .map((i) => ({
      id: i.id,
      name: i.title,
      lat: i.lat,
      lng: i.lng,
      link: i.link,
      categoryGroup: i.kind,
      origin: { tab: 'days', dayDate: d.date, itemTitle: i.title }
    })))
  return [...fromCards, ...fromDays]
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- schema.test.js`
Expected: PASS su tutta la suite di `schema.test.js` (Task 1-4 insieme).

- [ ] **Step 5: Esegui l'intera suite**

Run: `npm test`
Expected: PASS su tutti i file (`schema.test.js`, `seed.test.js`, `storage.test.js`, `supabase.test.js`, `sync.test.js`, `ModifiedBy.test.js`).

- [ ] **Step 6: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "aggiungi collectExternalMapPoints per aggregare i punti mappa da altre sezioni"
```

---

### Task 5: `components/CoordsInput.jsx`

**Files:**
- Create: `src/components/CoordsInput.jsx`

**Interfaces:**
- Consuma: `parseCoordsFromMapsLink` da `../data/schema.js` (Task 3).
- Produce: componente `CoordsInput({ value, onChange })` dove `value: { lat: number|null, lng: number|null }` e `onChange({ lat, lng })` viene chiamato con l'oggetto completo aggiornato ad ogni modifica (sia da link riconosciuto, sia da input manuale).
- Consumato da: Task 6 (`MapSection.jsx`), Task 7 (`Section.jsx`), Task 8 (`Days.jsx`).

Nessun test automatico: il progetto non ha un'infrastruttura di test per componenti React (vedi `vite.config.js`, nessun `environment: 'jsdom'` configurato, e l'unico test su un file di `components/` — `ModifiedBy.test.js` — testa una funzione pura esportata, non il rendering). Si verifica manualmente al Task 7, quando il componente viene montato per la prima volta in un form reale.

- [ ] **Step 1: Crea il componente**

```jsx
// src/components/CoordsInput.jsx
import { useState } from 'react'
import { parseCoordsFromMapsLink } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

export default function CoordsInput({ value, onChange }) {
  const [link, setLink] = useState('')
  const [status, setStatus] = useState(null)
  const [manualOpen, setManualOpen] = useState(value.lat !== null || value.lng !== null)

  function handleLinkBlur() {
    if (!link.trim()) {
      setStatus(null)
      return
    }
    const coords = parseCoordsFromMapsLink(link)
    if (coords) {
      onChange(coords)
      setStatus('found')
      setManualOpen(true)
    } else {
      setStatus('not-found')
      setManualOpen(true)
    }
  }

  function setLat(raw) {
    onChange({ lat: raw === '' ? null : Number(raw), lng: value.lng })
  }

  function setLng(raw) {
    onChange({ lat: value.lat, lng: raw === '' ? null : Number(raw) })
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Link Google/Apple Maps"
        value={link}
        onChange={(e) => { setLink(e.target.value); setStatus(null) }}
        onBlur={handleLinkBlur}
        className={inputClass}
      />
      {status === 'found' && <p className="text-sm text-[var(--accent2)]">📍 coordinate trovate</p>}
      {status === 'not-found' && (
        <p className="text-sm text-[var(--muted)]">
          Non riesco a leggere le coordinate da questo link. Aprilo in Maps e copia il link completo dalla barra, oppure inseriscile a mano.
        </p>
      )}
      {!manualOpen && (
        <button type="button" onClick={() => setManualOpen(true)} className="self-start text-sm text-[var(--accent)] underline">
          Inserisci coordinate a mano
        </button>
      )}
      {manualOpen && (
        <div className="flex gap-2">
          <input
            type="number" step="any" placeholder="Latitudine"
            value={value.lat ?? ''} onChange={(e) => setLat(e.target.value)}
            className={`flex-1 ${inputClass}`}
          />
          <input
            type="number" step="any" placeholder="Longitudine"
            value={value.lng ?? ''} onChange={(e) => setLng(e.target.value)}
            className={`flex-1 ${inputClass}`}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CoordsInput.jsx
git commit -m "aggiungi il componente CoordsInput per inserire coordinate da link o a mano"
```

---

### Task 6: `views/MapSection.jsx` — aggregazione, marker per categoria, filtri, navigazione

**Files:**
- Modify: `src/views/MapSection.jsx`

**Interfaces:**
- Consuma: `collectExternalMapPoints` (Task 4), `CoordsInput` (Task 5).
- Produce: `MapSection` accetta una nuova prop opzionale `onNavigate(tabKey)`.
- Consumato da: Task 7 (`Section.jsx` la passa solo per `section.type === 'map'`).

Nessun test automatico (stesso motivo del Task 5): verifica manuale allo Step 6.

- [ ] **Step 1: Aggiorna gli import e i dati derivati**

Sostituisci le righe 1-20 di `src/views/MapSection.jsx` con:

```jsx
import { useEffect, useMemo, useState } from 'react'
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
import CoordsInput from '../components/CoordsInput.jsx'
import { stampModified, collectExternalMapPoints } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'

// Senza questo fix i marker di Leaflet risultano invisibili sotto Vite: il
// bundler non riesce a risolvere i path relativi che la libreria si aspetta.
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

const CATEGORY_COLORS = { schede: '#f97316', sentiero: '#16a34a', spiaggia: '#0ea5e9', pasto: '#eab308' }
const CATEGORY_LABELS = { mappa: 'Mappa', schede: 'Schede', sentiero: 'Sentieri', spiaggia: 'Spiagge', pasto: 'Pasti' }
const CATEGORY_ORDER = ['mappa', 'schede', 'sentiero', 'spiaggia', 'pasto']

function dotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  })
}

// Nessuna icona per 'mappa': i punti propri restano col marker Leaflet
// standard, editabile, per distinguerli a colpo d'occhio dagli altri.
const CATEGORY_ICONS = Object.fromEntries(Object.entries(CATEGORY_COLORS).map(([key, color]) => [key, dotIcon(color)]))

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
function formatDate(date) {
  return date ? DATE_FMT.format(new Date(date)) : ''
}

function originLabel(point) {
  if (point.categoryGroup === 'mappa') return point.category || null
  if (point.categoryGroup === 'schede') return point.origin.sectionTitle
  return `${formatDate(point.origin.dayDate)} · ${point.origin.itemTitle}`
}

function navigateLabel(point) {
  return point.categoryGroup === 'schede' ? `Vai a ${point.origin.sectionTitle}` : "Vai all'Itinerario"
}

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { name: '', category: '', mapsLink: '', lat: null, lng: null, note: '' }

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
```

(rispetto all'originale: `EMPTY_ITEM.lat`/`lng` passano da `''` a `null`, coerenti col contratto number|null di `CoordsInput`; aggiunte le costanti categoria/colore ed helper di formattazione).

- [ ] **Step 2: Aggiorna la firma del componente e il calcolo dei punti**

Sostituisci `export default function MapSection({ trip, section, onUpdate, activeDisplayName }) {` con:

```jsx
export default function MapSection({ trip, section, onUpdate, activeDisplayName, onNavigate }) {
```

Sostituisci il blocco `saveItem`/`removeItem`/`withCoords`/`center` (dal vecchio `saveItem` fino a `const center = ...`) con:

```js
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

  const points = useMemo(() => [
    ...section.items.map((p) => ({ ...p, categoryGroup: 'mappa', origin: null })),
    ...collectExternalMapPoints(trip)
  ], [trip, section.items])

  const withCoords = points.filter((p) => p.lat !== null && p.lng !== null)
  const center = withCoords.length > 0
    ? [withCoords.reduce((sum, p) => sum + p.lat, 0) / withCoords.length, withCoords.reduce((sum, p) => sum + p.lng, 0) / withCoords.length]
    : null

  const availableCategories = CATEGORY_ORDER.filter((cat) => withCoords.some((p) => p.categoryGroup === cat))
  const [hiddenCategories, setHiddenCategories] = useState(new Set())
  function toggleCategory(cat) {
    setHiddenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }
  const renderedPoints = withCoords.filter((p) => !hiddenCategories.has(p.categoryGroup))
```

`saveItem` non converte più `lat`/`lng` da stringa a numero: arrivano già come `number|null` da `CoordsInput` tramite `form`.

`removeItem` è invariato rispetto a prima (nessun cambiamento reale, riportato per contesto — il diff riguarda solo ciò che sta sopra e sotto).

**Nota sull'ordine degli hook:** `useState(new Set())` per `hiddenCategories` va dichiarato prima di qualunque `return` condizionale nel componente (non ce ne sono in questo file, quindi va bene inserirlo qui insieme agli altri `useState`/`useMemo` in cima al corpo della funzione, rispettando le regole degli hook di React).

- [ ] **Step 3: Sostituisci il blocco mappa con marker categorizzati e filtri**

Sostituisci il blocco `{online && center && ( ... )}` con:

```jsx
      {online && center && (
        <div className="flex flex-col gap-3">
          {availableCategories.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  aria-pressed={!hiddenCategories.has(cat)}
                  className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-sm border ${
                    hiddenCategories.has(cat) ? 'border-[var(--line)] text-[var(--muted)]' : 'border-transparent bg-[var(--tint)] text-[var(--ink)]'
                  }`}
                >
                  {CATEGORY_COLORS[cat] && <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} />}
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}
          <div className="rounded-[24px] overflow-hidden h-64 border border-[var(--line)]">
            <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
              {renderedPoints.map((point) => (
                <Marker key={`${point.categoryGroup}-${point.id}`} position={[point.lat, point.lng]} icon={CATEGORY_ICONS[point.categoryGroup]}>
                  <Popup>
                    <p className="font-semibold">{point.name || 'Senza nome'}</p>
                    {originLabel(point) && <p className="text-sm text-[var(--muted)]">{originLabel(point)}</p>}
                    {point.categoryGroup === 'mappa' && point.mapsLink && (
                      <a href={point.mapsLink} target="_blank" rel="noreferrer" className="text-sm text-[var(--accent)] underline block mt-1">
                        Apri in Maps
                      </a>
                    )}
                    {point.categoryGroup !== 'mappa' && point.link && (
                      <a href={point.link} target="_blank" rel="noreferrer" className="text-sm text-[var(--accent)] underline block mt-1">
                        Apri il link
                      </a>
                    )}
                    {point.origin && onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate(point.origin.tab)}
                        className="text-sm text-[var(--accent)] underline block mt-1"
                      >
                        {navigateLabel(point)}
                      </button>
                    )}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Sostituisci i due input numerici del form con `CoordsInput`**

Sostituisci il blocco:

```jsx
            <div className="flex gap-2">
              <input type="number" step="any" placeholder="Latitudine" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="number" step="any" placeholder="Longitudine" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
```

con:

```jsx
            <CoordsInput value={{ lat: form.lat, lng: form.lng }} onChange={(coords) => setForm({ ...form, ...coords })} />
```

- [ ] **Step 5: Semplifica l'apertura del form di modifica**

Sostituisci:

```jsx
                <button onClick={() => setForm({ ...item, lat: item.lat ?? '', lng: item.lng ?? '' })} aria-label="Modifica punto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
```

con:

```jsx
                <button onClick={() => setForm(item)} aria-label="Modifica punto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
```

(`item.lat`/`item.lng` sono già `number|null` dallo schema: non serve più convertirli in stringa per gli input numerici, dato che `CoordsInput` li accetta direttamente).

- [ ] **Step 6: Verifica manuale**

Run: `npm run dev`, apri un viaggio, tab Mappa:
- Aggiungi un punto Mappa incollando un link Google Maps con `@lat,lng` nel campo `CoordsInput`: compare "📍 coordinate trovate", salva, il punto appare col marker standard.
- Modifica lo stesso punto: i campi numerici partono già valorizzati.
- Vai in Ristoranti (o in una sezione `cards` custom), aggiungi una scheda con coordinate (Task 7 dev'essere completato prima di poter verificare questo passo — se stai eseguendo i task in ordine, torna qui dopo il Task 7), torna in Mappa: il punto compare come cerchietto arancio, con popup "Vai a Ristoranti" che cambia tab.
- Aggiungi una voce Sentiero/Spiaggia/Pasto con coordinate in Itinerario (Task 8), torna in Mappa: compaiono i cerchietti verde/blu/giallo con popup "Vai all'Itinerario".
- Spegni/accendi le chip di filtro: i marker della categoria spariscono/tornano, la mappa non si ricentra.
- Incolla un link `maps.app.goo.gl` in un `CoordsInput`: compare il messaggio di link non riconosciuto e i campi manuali si aprono.

- [ ] **Step 7: Commit**

```bash
git add src/views/MapSection.jsx
git commit -m "aggrega in Mappa i punti con coordinate di schede e voci giorno"
```

---

### Task 7: `views/Section.jsx` — coordinate sulle schede + inoltro `onNavigate`

**Files:**
- Modify: `src/views/Section.jsx`

**Interfaces:**
- Consuma: `CoordsInput` (Task 5).
- Produce: `Section` accetta una nuova prop opzionale `onNavigate`, inoltrata a `MapSection` solo per `section.type === 'map'`.
- Consumato da: Task 9 (`TripView.jsx`).

- [ ] **Step 1: Aggiorna import e firma del componente**

Sostituisci la riga `import { stampModified } from '../data/schema.js'` con lo stesso import (nessun cambiamento: `CoordsInput` non tocca `schema.js` da qui), e aggiungi sotto agli import esistenti:

```jsx
import CoordsInput from '../components/CoordsInput.jsx'
```

Sostituisci `export default function Section({ trip, section, onUpdate, activeDisplayName }) {` con:

```jsx
export default function Section({ trip, section, onUpdate, activeDisplayName, onNavigate }) {
```

- [ ] **Step 2: Aggiungi coordinate al form scheda**

Sostituisci il bottone "Modifica scheda":

```jsx
                    <button
                      onClick={() => setCardForm({ id: item.id, title: item.title, meta: item.meta, detail: item.detail, link: item.link, tags: item.tags.join(', ') })}
                      aria-label="Modifica scheda"
                      className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]"
                    >
```

con:

```jsx
                    <button
                      onClick={() => setCardForm({ id: item.id, title: item.title, meta: item.meta, detail: item.detail, link: item.link, tags: item.tags.join(', '), lat: item.lat, lng: item.lng })}
                      aria-label="Modifica scheda"
                      className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]"
                    >
```

Sostituisci il bottone "Nuova scheda":

```jsx
          <Btn variant="secondary" onClick={() => setCardForm({ title: '', meta: '', detail: '', link: '', tags: '' })} className="self-start">
```

con:

```jsx
          <Btn variant="secondary" onClick={() => setCardForm({ title: '', meta: '', detail: '', link: '', tags: '', lat: null, lng: null })} className="self-start">
```

Nel form della Modal "Nuova scheda / Modifica scheda", aggiungi `CoordsInput` dopo il campo "Tag":

```jsx
            <input placeholder="Tag (separati da virgola)" value={cardForm.tags} onChange={(e) => setCardForm({ ...cardForm, tags: e.target.value })} className={inputClass} />
            <CoordsInput value={{ lat: cardForm.lat, lng: cardForm.lng }} onChange={(coords) => setCardForm({ ...cardForm, ...coords })} />
            <Btn type="submit">Salva</Btn>
```

`saveCard` non richiede modifiche: `{ ...cardForm, tags }` (già presente) porta con sé `lat`/`lng` senza bisogno di codice nuovo.

- [ ] **Step 3: Inoltra `onNavigate` a `MapSection`**

Sostituisci:

```jsx
          <MapSection trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={activeDisplayName} />
```

con:

```jsx
          <MapSection trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={activeDisplayName} onNavigate={onNavigate} />
```

- [ ] **Step 4: Verifica manuale**

Run: `npm run dev`, apri Ristoranti (o una sezione `cards` custom), aggiungi una scheda con un link Maps in `CoordsInput`, salva, modifica la stessa scheda: le coordinate restano. Verifica poi in Mappa (Task 6) che il punto compaia.

- [ ] **Step 5: Commit**

```bash
git add src/views/Section.jsx
git commit -m "aggiungi coordinate al form delle schede e inoltra onNavigate alla mappa"
```

---

### Task 8: `views/Days.jsx` — coordinate su sentiero/spiaggia/pasto

**Files:**
- Modify: `src/views/Days.jsx`

**Interfaces:**
- Consuma: `CoordsInput` (Task 5).
- Nessuna nuova funzione esportata.

- [ ] **Step 1: Aggiorna import, `EMPTY_ITEM` e `ALL_KIND_FIELDS`**

Aggiungi l'import:

```jsx
import CoordsInput from '../components/CoordsInput.jsx'
```

Sostituisci `EMPTY_ITEM`:

```js
const EMPTY_ITEM = { kind: '', time: '', title: '', detail: '', link: '', durata: '', dislivello: '', difficolta: '', accesso: '', servizi: '', luogo: '', prenotato: false }
```

con:

```js
const EMPTY_ITEM = { kind: '', time: '', title: '', detail: '', link: '', durata: '', dislivello: '', difficolta: '', accesso: '', servizi: '', luogo: '', prenotato: false, lat: null, lng: null }
```

Sostituisci `ALL_KIND_FIELDS`:

```js
const ALL_KIND_FIELDS = ['durata', 'dislivello', 'difficolta', 'accesso', 'servizi', 'luogo', 'prenotato']
```

con:

```js
const ALL_KIND_FIELDS = ['durata', 'dislivello', 'difficolta', 'accesso', 'servizi', 'luogo', 'prenotato', 'lat', 'lng']
```

(fondamentale: senza questa riga, cambiare `kind` su una voce già salvata con coordinate lascerebbe `lat`/`lng` residue del kind precedente — `withoutKindFields` le rimuove solo se elencate qui).

- [ ] **Step 2: Aggiungi `CoordsInput` al form, solo per sentiero/spiaggia/pasto**

Nel form della Modal "Nuova voce / Modifica voce", dopo i tre blocchi condizionali `{itemForm.kind === 'sentiero' && ...}`, `{itemForm.kind === 'spiaggia' && ...}`, `{itemForm.kind === 'pasto' && ...}` e prima di `<Btn type="submit">Salva</Btn>`, aggiungi:

```jsx
            {['sentiero', 'spiaggia', 'pasto'].includes(itemForm.kind) && (
              <CoordsInput value={{ lat: itemForm.lat, lng: itemForm.lng }} onChange={(coords) => setItemForm({ ...itemForm, ...coords })} />
            )}
```

- [ ] **Step 3: Verifica manuale**

Run: `npm run dev`, apri Itinerario:
- Crea una voce "Generica": nessun `CoordsInput` appare.
- Crea una voce "Sentiero"/"Spiaggia"/"Pasto": `CoordsInput` appare sotto ai campi propri del kind; incolla un link Maps, verifica il parsing, salva.
- Cambia il `kind` di una voce già salvata con coordinate in "Generica" e poi di nuovo in un kind diverso: le vecchie coordinate non riappaiono (sono state ripulite da `withoutKindFields`).

- [ ] **Step 4: Commit**

```bash
git add src/views/Days.jsx
git commit -m "aggiungi coordinate alle voci sentiero/spiaggia/pasto dell'itinerario"
```

---

### Task 9: `views/TripView.jsx` — collega la navigazione dalla mappa alle tab

**Files:**
- Modify: `src/views/TripView.jsx`

**Interfaces:**
- Consuma: `Section` con la nuova prop `onNavigate` (Task 7).
- Nessuna nuova funzione esportata: `setActiveTab` esiste già nel componente.

- [ ] **Step 1: Passa `onNavigate={setActiveTab}` a `Section`**

Sostituisci:

```jsx
        {trip.sections.map((section) => (currentTab === section.id ? <Section key={section.id} trip={trip} section={section} onUpdate={handleUpdate} activeDisplayName={cloudDisplayName} /> : null))}
```

con:

```jsx
        {trip.sections.map((section) => (currentTab === section.id ? <Section key={section.id} trip={trip} section={section} onUpdate={handleUpdate} activeDisplayName={cloudDisplayName} onNavigate={setActiveTab} /> : null))}
```

- [ ] **Step 2: Verifica manuale**

Run: `npm run dev`. Da Mappa, clicca "Vai a Ristoranti" sul popup di un punto scheda: la tab attiva cambia a Ristoranti. Clicca "Vai all'Itinerario" sul popup di un punto sentiero/spiaggia/pasto: la tab attiva cambia a Itinerario.

- [ ] **Step 3: Commit**

```bash
git add src/views/TripView.jsx
git commit -m "collega il popup della mappa al cambio tab del viaggio"
```

---

### Task 10: Verifica finale

**Files:** nessuna modifica di codice — solo verifica.

- [ ] **Step 1: Esegui l'intera suite di test**

Run: `npm test`
Expected: PASS su tutti i file.

- [ ] **Step 2: Build di produzione**

Run: `npm run build`
Expected: build pulita, nessun errore/warning bloccante.

- [ ] **Step 3: Verifica manuale in `npm run preview`**

Run: `npm run preview`, poi in DevTools:
- Con rete attiva: aggiungi coordinate a una scheda Ristoranti, a una voce sentiero, una spiaggia, un pasto e a un punto Mappa manuale; verifica che tutti compaiano in Mappa coi colori corretti (blu standard per Mappa, arancio schede, verde sentiero, blu spiaggia, giallo pasto), che i filtri li nascondano/mostrino, e che i link "Vai a..."/"Vai all'Itinerario" cambino tab.
- Prova un link `maps.app.goo.gl` in un punto qualunque: deve fallire il parsing e aprire il fallback manuale, senza errori in console.
- Network → Offline: la sezione Mappa deve mostrare solo la lista dei punti propri (comportamento invariato rispetto a prima di questo lavoro), nessun errore in console.

- [ ] **Step 4: Aggiorna la memoria di progetto (facoltativo, se richiesto dall'utente)**

Nessun commit necessario per questo task: se tutti i controlli passano, il lavoro è concluso.

---

## Nota per il piano di caricamento rapido (fuori scope qui)

Il prompt che genera il JSON da appunti grezzi (fuori da questo repo) andrà aggiornato separatamente per popolare `lat`/`lng` quando l'appunto contiene un link Maps riconoscibile — coerente con la sezione 6 della spec. Non è un task di questo piano: segnalarlo all'utente a lavoro concluso.
