# Ristoranti prenotati nell'itinerario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una scheda della sezione Ristoranti guadagna una prenotazione (data+ora);
quando c'è, la scheda compare anche nella lista trascinabile del giorno
corrispondente (Itinerario, Oggi, admin), restando comunque nella sezione
Ristoranti sotto un gruppo "Prenotati" distinto da "Consigliati". Trascinare una
scheda tra i due gruppi imposta/rimuove la prenotazione.

**Architecture:** Stesso pattern già in uso per i Trasporti (`day.order`,
`collectExternalDayItems`, `buildDayTimeline`): le schede Ristoranti prenotate
sono voci derivate a runtime, mai copiate, mostrate anche nel giorno ma editabili
solo dalla sezione Ristoranti. `collectExternalDayItems()` passa da
"solo trasporti" a "trasporti + ristoranti prenotati", ciascuna voce con un
`type` esplicito (`'transport' | 'card'`) così `buildDayTimeline()` e i tre
consumatori (Itinerario, Oggi, editor admin) possono distinguerle. Nella sezione
Ristoranti, un secondo `DndContext` a due colonne (dnd-kit "multiple containers")
gestisce il gruppo Prenotati/Consigliati; il cambio di gruppo via drag imposta o
svuota `date`/`time` sulla scheda.

**Tech Stack:** React 18 + JavaScript, Tailwind, `@dnd-kit/core` +
`@dnd-kit/sortable` + `@dnd-kit/utilities` (già in uso), vitest.

**Spec:** [docs/superpowers/specs/2026-08-21-ristoranti-prenotati-itinerario-design.md](../specs/2026-08-21-ristoranti-prenotati-itinerario-design.md)

## Global Constraints

- Niente dipendenze nuove: solo React, Tailwind, lucide-react, `@dnd-kit/*` già
  presenti nel budget del progetto.
- Copy in italiano, tono piano, seconda persona (vedi CLAUDE.md).
- Le schede prenotate **restano** nella sezione Ristoranti (mai spostate o
  duplicate) — stesso principio dei Trasporti.
- Nessuna modifica a `sync.js` o alle migrazioni Supabase: stesso schema `data`.
- `npm run build && npm run preview` deve passare ad ogni task che tocca file di
  produzione.

---

## Task 1: `normalizeCardItem()` guadagna `date`/`time`

**Files:**
- Modify: `src/data/schema.js:79-93` (`normalizeCardItem`)
- Test: `src/data/schema.test.js`

**Interfaces:**
- Produces: ogni scheda `cards` normalizzata ha ora anche `date: string` e
  `time: string` (default `''`), oltre ai campi esistenti
  (`id, title, meta, detail, link, tags, lat, lng, modifiedBy, modifiedAt`).

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in `src/data/schema.test.js`, dopo il blocco
`describe('normalizeTrip — coordinate opzionali sulle schede (cards)', ...)`:

```js
describe('normalizeTrip — prenotazione sulle schede (cards)', () => {
  it('riempie date/time vuoti quando assenti', () => {
    const trip = normalizeTrip({
      name: 'Ponza',
      sections: [{ title: 'Ristoranti', type: 'cards', items: [{ title: 'Da Assunta' }] }]
    })
    const ristoranti = trip.sections.find((s) => s.title === 'Ristoranti')
    expect(ristoranti.items[0].date).toBe('')
    expect(ristoranti.items[0].time).toBe('')
  })

  it('preserva date/time quando presenti', () => {
    const trip = normalizeTrip({
      name: 'Ponza',
      sections: [{ title: 'Ristoranti', type: 'cards', items: [{ title: 'Da Assunta', date: '2026-08-31', time: '20:30' }] }]
    })
    const ristoranti = trip.sections.find((s) => s.title === 'Ristoranti')
    expect(ristoranti.items[0].date).toBe('2026-08-31')
    expect(ristoranti.items[0].time).toBe('20:30')
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm test -- schema.test.js`
Expected: FAIL — `expect(ristoranti.items[0].date).toBe('')` riceve `undefined`.

- [ ] **Step 3: Implementa**

In `src/data/schema.js`, modifica `normalizeCardItem`:

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
    date: str(item.date),
    time: str(item.time),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npm test -- schema.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "Aggiungi date/time alle schede della sezione Ristoranti"
```

---

## Task 2: `collectExternalDayItems()` include i ristoranti prenotati, `buildDayTimeline()` gestisce tre tipi

**Files:**
- Modify: `src/data/schema.js:6` (`DAY_ORDER_TAGS`), `src/data/schema.js:309-348`
  (`collectExternalDayItems`, `buildDayTimeline`)
- Test: `src/data/schema.test.js`

**Interfaces:**
- Consumes: `normalizeCardItem` con `date`/`time` (Task 1).
- Produces: `collectExternalDayItems(trip)` ritorna un array di voci, ciascuna
  con `type: 'transport' | 'card'` oltre ai campi già esistenti
  (`id, date, time, title, note, link, modifiedBy, modifiedAt, origin: { tab }`).
  `buildDayTimeline(day, externalItems)` — il secondo parametro è ora l'array
  **combinato** (trasporti + ristoranti) di quella data, non solo trasporti —
  ritorna voci `{ type: 'item' | 'transport' | 'card', item }`.

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in `src/data/schema.test.js` (serve anche importare le due funzioni:
aggiorna la riga 2 con
`import { normalizeTrip, exportTrip, stampModified, dayItemFieldsForKind, parseCoordsFromMapsLink, parseAddressFromMapsLink, collectExternalMapPoints, collectExternalDayItems, buildDayTimeline } from './schema.js'`):

```js
describe('collectExternalDayItems', () => {
  function tripWithRistorantiEDate() {
    return normalizeTrip({
      name: 'Ponza',
      sections: [
        { title: 'Trasporti', type: 'transport', items: [{ mode: 'Traghetto', from: 'Formia', to: 'Ponza', date: '2026-08-30', time: '09:00' }] },
        { title: 'Ristoranti', type: 'cards', items: [
          { title: 'Da Assunta', detail: 'Pesce', link: 'https://example.com', date: '2026-08-30', time: '20:30' },
          { title: 'Non prenotato' }
        ] }
      ]
    })
  }

  it('include i trasporti con data e le schede Ristoranti con data, escludendo le altre', () => {
    const items = collectExternalDayItems(tripWithRistorantiEDate())
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.type).sort()).toEqual(['card', 'transport'])
  })

  it('la voce ristorante porta titolo, dettaglio come nota, link e origin verso la sezione', () => {
    const trip = tripWithRistorantiEDate()
    const ristorantiSection = trip.sections.find((s) => s.title === 'Ristoranti')
    const card = collectExternalDayItems(trip).find((i) => i.type === 'card')
    expect(card).toMatchObject({ date: '2026-08-30', time: '20:30', title: 'Da Assunta', note: 'Pesce', link: 'https://example.com' })
    expect(card.origin).toEqual({ tab: ristorantiSection.id })
  })

  it('viaggio senza sezione Ristoranti prenotata: nessuna voce card', () => {
    const trip = normalizeTrip({ name: 'X', sections: [{ title: 'Ristoranti', type: 'cards', items: [{ title: 'Senza data' }] }] })
    expect(collectExternalDayItems(trip).filter((i) => i.type === 'card')).toEqual([])
  })
})

describe('buildDayTimeline', () => {
  it('interfoglia voci giorno, trasporti e ristoranti secondo day.order', () => {
    const trip = normalizeTrip({
      name: 'X',
      days: [{ date: '2026-08-30', items: [{ title: 'Sveglia' }], order: ['transport', 'item', 'card'] }]
    })
    const day = trip.days[0]
    const external = [
      { type: 'transport', id: 't1', date: '2026-08-30', time: '09:00', title: 'Traghetto' },
      { type: 'card', id: 'c1', date: '2026-08-30', time: '20:30', title: 'Da Assunta' }
    ]
    const timeline = buildDayTimeline(day, external)
    expect(timeline.map((e) => e.type)).toEqual(['transport', 'item', 'card'])
    expect(timeline[0].item.id).toBe('t1')
    expect(timeline[2].item.id).toBe('c1')
  })

  it('voci non coperte da day.order finiscono in coda, raggruppate per tipo', () => {
    const trip = normalizeTrip({ name: 'X', days: [{ date: '2026-08-30', items: [{ title: 'Sveglia' }], order: [] }] })
    const day = trip.days[0]
    const external = [{ type: 'card', id: 'c1', date: '2026-08-30', title: 'Da Assunta' }]
    const timeline = buildDayTimeline(day, external)
    expect(timeline.map((e) => e.type)).toEqual(['item', 'card'])
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- schema.test.js`
Expected: FAIL — `collectExternalDayItems` non ha ancora voci `type`/`card`,
`buildDayTimeline` non consuma la coda `'card'`.

- [ ] **Step 3: Implementa**

In `src/data/schema.js`, cambia `DAY_ORDER_TAGS`:

```js
const DAY_ORDER_TAGS = ['item', 'transport', 'card']
```

Sostituisci `collectExternalDayItems` e `buildDayTimeline`:

```js
// Voci Trasporti e schede Ristoranti con una data, mostrate anche nel giorno
// corrispondente dell'Itinerario. Calcolo derivato come collectExternalMapPoints:
// nessuna copia salvata, ogni voce resta editabile solo dalla sua sezione di
// origine (Trasporti o Ristoranti).
export function collectExternalDayItems(trip) {
  const transportSection = trip.sections.find((s) => s.type === 'transport')
  const transportEntries = transportSection
    ? transportSection.items
      .filter((i) => i.date)
      .map((i) => ({
        type: 'transport',
        id: i.id,
        date: i.date,
        time: i.time,
        title: [i.from, i.to].filter(Boolean).join(' → '),
        note: i.note,
        link: i.ticketLink,
        modifiedBy: i.modifiedBy,
        modifiedAt: i.modifiedAt,
        origin: { tab: transportSection.id }
      }))
    : []

  const ristorantiSection = trip.sections.find((s) => s.type === 'cards' && s.title === 'Ristoranti')
  const cardEntries = ristorantiSection
    ? ristorantiSection.items
      .filter((i) => i.date)
      .map((i) => ({
        type: 'card',
        id: i.id,
        date: i.date,
        time: i.time,
        title: i.title,
        note: i.detail,
        link: i.link,
        modifiedBy: i.modifiedBy,
        modifiedAt: i.modifiedAt,
        origin: { tab: ristorantiSection.id }
      }))
    : []

  return [...transportEntries, ...cardEntries]
}

// Interfoglia le voci del giorno e le voci esterne (trasporti/ristoranti) di
// quella data in un'unica lista ordinata, secondo day.order: consuma le code
// già ordinate (day.items, per tipo dentro externalItems) seguendo la
// sequenza di tag salvata, e in coda mette ciò che non è (più) coperto
// dall'ordine — voci nuove, o modifiche fatte da dove l'ordine combinato non
// viene aggiornato (dashboard admin) — così il fallback resta "voci poi
// trasporti poi ristoranti" come prima di questo campo.
export function buildDayTimeline(day, externalItems) {
  const items = [...day.items]
  const transports = externalItems.filter((i) => i.type === 'transport')
  const cards = externalItems.filter((i) => i.type === 'card')
  const timeline = []
  for (const tag of day.order) {
    if (tag === 'item' && items.length > 0) timeline.push({ type: 'item', item: items.shift() })
    else if (tag === 'transport' && transports.length > 0) timeline.push({ type: 'transport', item: transports.shift() })
    else if (tag === 'card' && cards.length > 0) timeline.push({ type: 'card', item: cards.shift() })
  }
  items.forEach((item) => timeline.push({ type: 'item', item }))
  transports.forEach((item) => timeline.push({ type: 'transport', item }))
  cards.forEach((item) => timeline.push({ type: 'card', item }))
  return timeline
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- schema.test.js`
Expected: PASS (inclusi tutti i test preesistenti — `collectExternalMapPoints`
e gli altri non sono toccati da questa modifica).

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "Includi i ristoranti prenotati nella timeline del giorno"
```

---

## Task 3: `Days.jsx` — `RestaurantDayCard` e split a tre nel drag&drop dell'Itinerario

**Files:**
- Modify: `src/views/Days.jsx`

**Interfaces:**
- Consumes: `collectExternalDayItems`, `buildDayTimeline` (Task 2, ora con
  `type: 'card'`).
- Produces: nuovo componente esportato `RestaurantDayCard({ item, onNavigate,
  dragHandle })`; `DayItemsList({ day, externalItems = [], onEditItem,
  onRemoveItem, onNavigate })` (parametro rinominato da `transportItems`, usato
  da Task 5/Today.jsx).

- [ ] **Step 1: Aggiungi `RestaurantDayCard`**

In `src/views/Days.jsx`, dopo la funzione `TransportDayCard` (dopo la riga 206):

```jsx
// Scheda Ristoranti prenotata, aggregata nel giorno: i campi si modificano
// solo dalla sezione Ristoranti (da cui viene calcolata, vedi
// collectExternalDayItems), ma l'ordine è trascinabile quando arriva una
// dragHandle (solo dall'Itinerario).
export function RestaurantDayCard({ item, onNavigate, dragHandle }) {
  return (
    <div className="rounded-[24px] p-4 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-full bg-[var(--tint)] flex items-center justify-center flex-shrink-0">
            <Utensils size={18} className="text-[var(--accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            {item.time && <span className="font-mono text-sm text-[var(--muted)]">{item.time}</span>}
            <p className="font-display font-semibold text-lg leading-snug">{item.title}</p>
            {item.note && <p className="text-sm text-[var(--muted)] mt-1">{item.note}</p>}
          </div>
        </div>
        {dragHandle && (
          <button
            type="button"
            ref={dragHandle.setActivatorNodeRef}
            {...dragHandle.attributes}
            {...dragHandle.listeners}
            aria-label="Trascina per riordinare"
            className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)] cursor-grab touch-none -mr-2 -mt-1 flex-shrink-0"
          >
            <GripVertical size={15} />
          </button>
        )}
      </div>
      <LinkChip link={item.link} />
      {onNavigate && (
        <div className="flex justify-end mt-3">
          <button type="button" onClick={() => onNavigate(item.origin.tab)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--tint)] text-[var(--accent)] text-sm font-medium">
            <ArrowRight size={14} /> Vai a Ristoranti
          </button>
        </div>
      )}
      <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
    </div>
  )
}
```

(`Utensils` è già importato in cima al file per `KIND_ICONS`, nessun nuovo import
necessario.)

- [ ] **Step 2: Estendi `TimelineBlock` al terzo tipo**

Sostituisci la funzione `TimelineBlock` (righe 213-233):

```jsx
function TimelineBlock({ day, externalItems, onEditItem, onRemoveItem, onNavigate }) {
  const timeline = buildDayTimeline(day, externalItems)
  if (timeline.length === 0) return null
  return (
    <ul className="flex flex-col gap-3">
      {timeline.map((entry) => (
        <li key={entry.item.id}>
          {entry.type === 'item' ? (
            <DayItemCard
              item={entry.item}
              onEdit={onEditItem ? () => onEditItem(entry.item) : undefined}
              onRemove={onRemoveItem ? () => onRemoveItem(entry.item) : undefined}
            />
          ) : entry.type === 'transport' ? (
            <TransportDayCard item={entry.item} onNavigate={onNavigate} />
          ) : (
            <RestaurantDayCard item={entry.item} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Estendi `SortableTimelineEntry` e `DayItemsList`**

Sostituisci `SortableTimelineEntry` (righe 237-254):

```jsx
function SortableTimelineEntry({ entry, onEdit, onRemove, onNavigate }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: entry.item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }
  const dragHandle = { setActivatorNodeRef, attributes, listeners }
  return (
    <li ref={setNodeRef} style={style}>
      {entry.type === 'item' ? (
        <DayItemCard item={entry.item} onEdit={onEdit} onRemove={onRemove} dragHandle={dragHandle} />
      ) : entry.type === 'transport' ? (
        <TransportDayCard item={entry.item} onNavigate={onNavigate} dragHandle={dragHandle} />
      ) : (
        <RestaurantDayCard item={entry.item} onNavigate={onNavigate} dragHandle={dragHandle} />
      )}
    </li>
  )
}
```

Sostituisci `DayItemsList` (righe 258-261):

```jsx
export function DayItemsList({ day, externalItems = [], onEditItem, onRemoveItem, onNavigate }) {
  if (day.items.length === 0 && externalItems.length === 0) return null
  return <TimelineBlock day={day} externalItems={externalItems} onEditItem={onEditItem} onRemoveItem={onRemoveItem} onNavigate={onNavigate} />
}
```

- [ ] **Step 4: Rinomina `transportByDate` in `externalByDate` e split a tre nel `handleDragEnd`**

Nel componente `Days`, sostituisci il blocco `transportByDate`/`timeline` (righe
300-312):

```jsx
  const externalByDate = useMemo(() => {
    const map = new Map()
    for (const item of collectExternalDayItems(trip)) {
      const list = map.get(item.date) ?? []
      list.push(item)
      map.set(item.date, list)
    }
    return map
  }, [trip])

  // Voci giorno, trasporti e ristoranti prenotati di quella data, in un'unica
  // lista trascinabile (vedi buildDayTimeline): il riordino può mischiare
  // liberamente i tre tipi.
  const timeline = selectedDay ? buildDayTimeline(selectedDay, externalByDate.get(selectedDay.date) ?? []) : []
```

Sostituisci `handleDragEnd` (righe 318-346):

```jsx
  function handleDragEnd(event) {
    const { active, over } = event
    setActiveEntry(null)
    if (!over || active.id === over.id || !selectedDay) return
    const oldIndex = timeline.findIndex((e) => e.item.id === active.id)
    const newIndex = timeline.findIndex((e) => e.item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(timeline, oldIndex, newIndex)
    const newItems = reordered.filter((e) => e.type === 'item').map((e) => e.item)
    const newTransportIds = reordered.filter((e) => e.type === 'transport').map((e) => e.item.id)
    const newCardIds = reordered.filter((e) => e.type === 'card').map((e) => e.item.id)
    const newOrder = reordered.map((e) => e.type)

    function reorderSubset(items, ids) {
      const dateIndices = []
      items.forEach((it, i) => { if (it.date === selectedDay.date) dateIndices.push(i) })
      // Se il sottoinsieme di quella data è cambiato da quando è stata
      // calcolata la timeline (modifica concorrente), non tocca l'ordine
      // piuttosto che corromperlo.
      if (dateIndices.length !== ids.length) return items
      const byId = new Map(items.map((it) => [it.id, it]))
      const result = [...items]
      dateIndices.forEach((i, pos) => { result[i] = byId.get(ids[pos]) })
      return result
    }

    onUpdate((t) => ({
      ...t,
      days: t.days.map((d) => (d.id === selectedDay.id ? { ...d, items: newItems, order: newOrder } : d)),
      sections: t.sections.map((s) => {
        if (s.type === 'transport') return { ...s, items: reorderSubset(s.items, newTransportIds) }
        if (s.type === 'cards' && s.title === 'Ristoranti') return { ...s, items: reorderSubset(s.items, newCardIds) }
        return s
      })
    }))
  }
```

- [ ] **Step 5: Estendi il render della timeline e il `DragOverlay`**

Nel JSX del componente `Days`, il `<SortableContext>`/`<ul>` (righe 453-465)
resta invariato (usa già `SortableTimelineEntry`, che ora gestisce i tre tipi),
ma il suo `onNavigate` deve valere anche per le card:

```jsx
                {timeline.map((entry) => (
                  <SortableTimelineEntry
                    key={entry.item.id}
                    entry={entry}
                    onEdit={entry.type === 'item' ? () => setItemForm({ dayId: selectedDay.id, id: entry.item.id, ...EMPTY_ITEM, ...entry.item }) : undefined}
                    onRemove={entry.type === 'item' ? () => removeItem(selectedDay.id, entry.item) : undefined}
                    onNavigate={entry.type !== 'item' ? onNavigate : undefined}
                  />
                ))}
```

Sostituisci il contenuto del `<DragOverlay>` (righe 466-472):

```jsx
            <DragOverlay>
              {activeEntry ? (
                <div className="rounded-[24px] shadow-[0_12px_32px_-10px_rgb(var(--ink-rgb)/0.4)]">
                  {activeEntry.type === 'item' ? (
                    <DayItemCard item={activeEntry.item} />
                  ) : activeEntry.type === 'transport' ? (
                    <TransportDayCard item={activeEntry.item} />
                  ) : (
                    <RestaurantDayCard item={activeEntry.item} />
                  )}
                </div>
              ) : null}
            </DragOverlay>
```

- [ ] **Step 6: Verifica manuale**

Run: `npm run build && npm run preview`

Apri l'app, vai su un viaggio con Supabase disattivato o con
`VITE_DEV_SKIP_LOGIN=true` in dev. In Ristoranti aggiungi una scheda (il form
non ha ancora i campi data/ora — arrivano nel Task 4 — quindi per verificare
questo task modifica temporaneamente a mano un item nel JSON del viaggio, oppure
salta la verifica visuale piena a Task 4/5 e limitati a: `npm run build` passa
senza errori e nessuna regressione nell'Itinerario per giorni senza ristoranti
prenotati (comportamento identico a prima).

- [ ] **Step 7: Commit**

```bash
git add src/views/Days.jsx
git commit -m "Aggiungi i ristoranti prenotati alla timeline trascinabile del giorno"
```

---

## Task 4: `Section.jsx` — campi prenotazione, gruppi Prenotati/Consigliati, drag tra gruppi

**Files:**
- Modify: `src/views/Section.jsx`

**Interfaces:**
- Consumes: `stampModified` (già importato), schede con `date`/`time` (Task 1).
- Produces: nessuna nuova esportazione — comportamento visibile della sezione
  Ristoranti.

- [ ] **Step 1: Helper `isRistoranti` e formattazione data breve**

In `src/views/Section.jsx`, dopo `isFixedSection` (riga 21), aggiungi:

```js
function isRistoranti(section) {
  return section.type === 'cards' && section.title === 'Ristoranti'
}

const CARD_DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })

function formatCardDate(date) {
  return date ? CARD_DATE_FMT.format(new Date(`${date}T00:00:00`)) : ''
}

function groupKeyFor(item) {
  return item.date ? 'prenotati' : 'consigliati'
}
```

Aggiorna `isFixedSection` per riusare l'helper:

```js
function isFixedSection(section) {
  if (section.type === 'transport' || section.type === 'lodging' || section.type === 'map') return true
  return isRistoranti(section)
}
```

- [ ] **Step 2: Badge prenotazione su `SortableCard`**

In `SortableCard`, dopo il blocco tag (righe 69-77, prima di `<ModifiedBy .../>`),
aggiungi:

```jsx
      {item.date && (
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--accent2)] text-[var(--paper)] text-xs font-medium mt-3">
          <Check size={12} /> Prenotato · {formatCardDate(item.date)}{item.time ? ` · ${item.time}` : ''}
        </span>
      )}
```

- [ ] **Step 3: Campi data/ora nel form scheda (solo Ristoranti)**

Nei tre punti dove si inizializza `cardForm` con i campi vuoti — `openAdd` in
`useImperativeHandle` (riga 113) e l'azione dell'`Empty` (riga 186) — aggiungi
`date: '', time: ''` all'oggetto:

```js
      if (section.type === 'cards') setCardForm({ title: '', meta: '', detail: '', link: '', tags: '', lat: null, lng: null, date: '', time: '' })
```

```jsx
            action={<Btn onClick={() => setCardForm({ title: '', meta: '', detail: '', link: '', tags: '', lat: null, lng: null, date: '', time: '' })}>Aggiungi una scheda</Btn>}
```

Nel modal di modifica scheda (dopo `<CoordsInput .../>`, riga 297, prima del
`<Btn type="submit">`), aggiungi:

```jsx
            {isRistoranti(section) && (
              <>
                <input type="date" value={cardForm.date} onChange={(e) => setCardForm({ ...cardForm, date: e.target.value })} className={inputClass} />
                <input type="time" value={cardForm.time} onChange={(e) => setCardForm({ ...cardForm, time: e.target.value })} className={inputClass} />
              </>
            )}
```

(`saveCard` non richiede modifiche: `cardForm` viene già spalmato per intero
sull'item, quindi `date`/`time` seguono automaticamente.)

- [ ] **Step 4: Import `useDroppable`, componente `DroppableGroup`, `handleRistorantiDragEnd`**

Aggiorna l'import di `@dnd-kit/core` in cima al file:

```js
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, useDroppable } from '@dnd-kit/core'
```

Dopo `updateSection` (riga 27), aggiungi:

```jsx
const RISTORANTI_GROUPS = [
  { key: 'prenotati', label: 'Prenotati' },
  { key: 'consigliati', label: 'Consigliati' }
]

// Contenitore di un gruppo Prenotati/Consigliati: resta un'area di drop
// valida anche quando il gruppo è vuoto (dnd-kit "multiple containers").
function DroppableGroup({ groupKey, children }) {
  const { setNodeRef } = useDroppable({ id: `group-${groupKey}` })
  return <div ref={setNodeRef} className="flex flex-col gap-3 min-h-[3rem]">{children}</div>
}
```

Nel componente `Section`, dopo `handleCardDragEnd` (riga 109), aggiungi:

```jsx
  function targetGroupKey(over, items) {
    if (!over) return null
    if (over.id === 'group-prenotati' || over.id === 'group-consigliati') return over.id.replace('group-', '')
    const overItem = items.find((it) => it.id === over.id)
    return overItem ? groupKeyFor(overItem) : null
  }

  // Trascinare una scheda Ristoranti nell'altro gruppo cambia la
  // prenotazione: verso "Prenotati" chiede data/ora (annullare il prompt
  // annulla lo spostamento), verso "Consigliati" chiede conferma prima di
  // svuotarla (annullare la conferma annulla lo spostamento). Dentro lo
  // stesso gruppo, riordina soltanto.
  function handleRistorantiDragEnd(event) {
    const { active, over } = event
    if (!over) return
    onUpdate((t) =>
      updateSection(t, section.id, (s) => {
        const activeItem = s.items.find((it) => it.id === active.id)
        if (!activeItem) return s
        const fromGroup = groupKeyFor(activeItem)
        const toGroup = targetGroupKey(over, s.items)
        if (!toGroup) return s
        if (fromGroup === toGroup && active.id === over.id) return s

        let updatedItem = activeItem
        if (fromGroup !== toGroup) {
          if (toGroup === 'prenotati') {
            const date = window.prompt('Data della prenotazione (AAAA-MM-GG)', '')
            if (!date) return s
            const time = window.prompt('Ora della prenotazione (HH:MM, lascia vuoto se non serve)', '') ?? ''
            updatedItem = stampModified({ ...activeItem, date, time }, activeDisplayName)
          } else {
            if (!window.confirm(`Annullare la prenotazione di "${activeItem.title}"?`)) return s
            updatedItem = stampModified({ ...activeItem, date: '', time: '' }, activeDisplayName)
          }
        }

        const withoutActive = s.items.filter((it) => it.id !== active.id)
        const overIsGroupContainer = over.id === 'group-prenotati' || over.id === 'group-consigliati'
        const overIndex = overIsGroupContainer ? -1 : withoutActive.findIndex((it) => it.id === over.id)

        if (overIndex === -1) {
          const groupItems = withoutActive.filter((it) => groupKeyFor(it) === toGroup)
          const lastOfGroupId = groupItems.length > 0 ? groupItems[groupItems.length - 1].id : null
          const insertAt = lastOfGroupId ? withoutActive.findIndex((it) => it.id === lastOfGroupId) + 1 : withoutActive.length
          const items = [...withoutActive]
          items.splice(insertAt, 0, updatedItem)
          return { ...s, items }
        }

        const items = [...withoutActive]
        items.splice(overIndex, 0, updatedItem)
        return { ...s, items }
      })
    )
  }
```

- [ ] **Step 5: Render a due colonne per Ristoranti**

Sostituisci il blocco `{section.type === 'cards' && ( ... )}` (righe 180-204)
con:

```jsx
      {section.type === 'cards' && !isRistoranti(section) && (
        <>
          {section.items.length === 0 && (
            <Empty
              title="Nessuna scheda ancora"
              detail="Aggiungine una per iniziare."
              action={<Btn onClick={() => setCardForm({ title: '', meta: '', detail: '', link: '', tags: '', lat: null, lng: null, date: '', time: '' })}>Aggiungi una scheda</Btn>}
            />
          )}
          <DndContext sensors={cardSensors} collisionDetection={closestCenter} onDragEnd={handleCardDragEnd}>
            <SortableContext items={section.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {section.items.map((item) => (
                  <SortableCard
                    key={item.id}
                    item={item}
                    onEdit={() => setCardForm({ id: item.id, title: item.title, meta: item.meta, detail: item.detail, link: item.link, tags: item.tags.join(', '), lat: item.lat, lng: item.lng, date: item.date, time: item.time })}
                    onRemove={() => removeCard(item)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {section.type === 'cards' && isRistoranti(section) && (
        <>
          {section.items.length === 0 && (
            <Empty
              title="Nessuna scheda ancora"
              detail="Aggiungine una per iniziare."
              action={<Btn onClick={() => setCardForm({ title: '', meta: '', detail: '', link: '', tags: '', lat: null, lng: null, date: '', time: '' })}>Aggiungi una scheda</Btn>}
            />
          )}
          <DndContext sensors={cardSensors} collisionDetection={closestCenter} onDragEnd={handleRistorantiDragEnd}>
            {RISTORANTI_GROUPS.map(({ key, label }) => {
              const groupItems = section.items.filter((it) => groupKeyFor(it) === key)
              return (
                <div key={key} className="flex flex-col gap-3">
                  <Label>{label}</Label>
                  {groupItems.length === 0 && <p className="text-sm text-[var(--muted)]">Nessuna scheda qui.</p>}
                  <SortableContext items={groupItems.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                    <DroppableGroup groupKey={key}>
                      {groupItems.map((item) => (
                        <SortableCard
                          key={item.id}
                          item={item}
                          onEdit={() => setCardForm({ id: item.id, title: item.title, meta: item.meta, detail: item.detail, link: item.link, tags: item.tags.join(', '), lat: item.lat, lng: item.lng, date: item.date, time: item.time })}
                          onRemove={() => removeCard(item)}
                        />
                      ))}
                    </DroppableGroup>
                  </SortableContext>
                </div>
              )
            })}
          </DndContext>
        </>
      )}
```

- [ ] **Step 6: Verifica manuale**

Run: `npm run build && npm run preview`

Nel browser (login saltato con `VITE_DEV_SKIP_LOGIN=true` in dev, oppure build
+ preview con un viaggio locale):
1. Vai alla sezione Ristoranti di un viaggio: vedi due gruppi "Prenotati"
   (vuoto) e "Consigliati".
2. Aggiungi una scheda senza data: appare in "Consigliati".
3. Apri la scheda, imposta data e ora, salva: si sposta in "Prenotati" e mostra
   il badge "Prenotato · <data> · <ora>".
4. Trascina la scheda da "Prenotati" a "Consigliati": compare un popup di
   conferma che avverte che la prenotazione verrà annullata; confermando, la
   data si svuota e la scheda torna in "Consigliati" senza badge; annullando
   la conferma la scheda resta in "Prenotati".
5. Trascina una scheda senza data verso "Prenotati": compare il prompt data
   (poi ora); annullando il prompt della data la scheda resta dov'era.
6. Vai all'Itinerario nel giorno corrispondente alla data impostata al punto 3:
   la scheda Ristoranti compare come voce trascinabile con pulsante "Vai a
   Ristoranti".

- [ ] **Step 7: Commit**

```bash
git add src/views/Section.jsx
git commit -m "Aggiungi gruppi Prenotati/Consigliati e drag tra gruppi in Ristoranti"
```

---

## Task 5: `Today.jsx` — l'agenda distingue i tre tipi di voce esterna

**Files:**
- Modify: `src/views/Today.jsx`

**Interfaces:**
- Consumes: `collectExternalDayItems` (Task 2, voci con `type`), `RestaurantDayCard`
  (Task 3), `DayItemsList({ day, externalItems, ... })` (Task 3, parametro
  rinominato).

- [ ] **Step 1: Importa `RestaurantDayCard` e l'icona `Utensils`**

Aggiorna gli import in cima al file:

```jsx
import { ArrowRight, Bus, Utensils, Check, Sun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning } from 'lucide-react'
```

```jsx
import { KIND_ICONS, sentieroStats, DayItemCard, TransportDayCard, RestaurantDayCard, DayItemsList } from './Days.jsx'
```

- [ ] **Step 2: `groupByDaypart` su tre tipi**

Sostituisci `groupByDaypart` (righe 79-85):

```jsx
// Raggruppa voci del giorno e voci esterne (trasporti/ristoranti) in fasce
// orarie, mantenendo l'ordine manuale relativo dentro ogni fascia (le voci
// esterne, che non hanno un ordine manuale, si ordinano per orario dentro la
// propria fascia).
function groupByDaypart(items, externalItems) {
  const buckets = Object.fromEntries(DAYPARTS.map((d) => [d.key, { items: [], externalItems: [] }]))
  for (const item of items) buckets[DAYPARTS.find((d) => d.match(item.time)).key].items.push(item)
  for (const item of externalItems) buckets[DAYPARTS.find((d) => d.match(item.time)).key].externalItems.push(item)
  for (const key of Object.keys(buckets)) buckets[key].externalItems.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  return DAYPARTS.map((d) => ({ key: d.key, label: d.label, ...buckets[d.key] })).filter((g) => g.items.length > 0 || g.externalItems.length > 0)
}
```

- [ ] **Step 3: `computeStatus` legge `externalItems`**

In `computeStatus` (riga 97), aggiorna il flatMap:

```jsx
  for (const entry of groups.flatMap((g) => [...g.items, ...g.externalItems])) {
```

(il resto della funzione resta invariato: opera solo su `.id`/`.time`.)

- [ ] **Step 4: `AgendaRow` e `AgendaGroup` distinguono i tre tipi**

Sostituisci `AgendaRow` (righe 110-126):

```jsx
function AgendaRow({ entry, kind, done }) {
  const Icon = kind === 'transport' ? Bus : kind === 'card' ? Utensils : (KIND_ICONS[entry.kind] ?? KIND_ICONS[''])
  return (
    <li className={`flex items-center gap-3 px-3.5 py-3 ${done ? 'opacity-[0.55]' : ''}`}>
      <span className="h-8 w-8 rounded-full bg-[var(--tint)] flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-[var(--accent)]" />
      </span>
      {entry.time && <span className="font-mono text-[12.5px] text-[var(--muted)] w-11 flex-shrink-0">{entry.time}</span>}
      <span className={`flex-1 text-sm truncate ${done ? 'line-through decoration-[var(--line)]' : ''}`}>{entry.title}</span>
      {kind === 'day' && entry.kind === 'pasto' && entry.prenotato && (
        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--accent2)] text-[var(--paper)] text-[11px] font-medium flex-shrink-0">
          <Check size={9} /> Prenotato
        </span>
      )}
    </li>
  )
}
```

Sostituisci `AgendaGroup` (righe 132-153):

```jsx
function AgendaGroup({ group, currentId, doneIds, onNavigate }) {
  const rows = [
    ...group.items.map((entry) => ({ entry, kind: 'day' })),
    ...group.externalItems.map((entry) => ({ entry, kind: entry.type }))
  ].filter(({ entry }) => entry.id !== currentId)
  const current = [...group.items, ...group.externalItems].find((entry) => entry.id === currentId)
  const currentExternal = group.externalItems.find((e) => e.id === current?.id)

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[11px] font-medium tracking-widest uppercase text-[var(--muted)] ml-1">{group.label}</p>
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--line)] bg-[var(--card)] rounded-[24px] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05)] overflow-hidden">
          {rows.map(({ entry, kind }) => (
            <AgendaRow key={entry.id} entry={entry} kind={kind} done={doneIds.has(entry.id)} />
          ))}
        </ul>
      )}
      {current && (
        currentExternal
          ? currentExternal.type === 'transport'
            ? <TransportDayCard item={current} onNavigate={onNavigate} />
            : <RestaurantDayCard item={current} onNavigate={onNavigate} />
          : <DayItemCard item={current} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: `Today()` usa `externalItems`**

Nel componente `Today`, sostituisci le righe 175-179 e 227:

```jsx
  const externalItems = collectExternalDayItems(trip).filter((i) => i.date === day.date)
  const hasContent = day.items.length > 0 || externalItems.length > 0
  const groups = isToday ? groupByDaypart(day.items, externalItems) : []
  const { currentId, doneIds } = computeStatus(groups, isToday)
  const totalCount = day.items.length + externalItems.length
```

```jsx
      {hasContent && !isToday && (
        <DayItemsList day={day} externalItems={externalItems} onNavigate={onNavigate} />
      )}
```

- [ ] **Step 6: Verifica manuale**

Run: `npm run build && npm run preview`

Con una scheda Ristoranti prenotata per la data di oggi (o per il giorno più
vicino a oggi, se il viaggio non è in corso): apri la tab Oggi, verifica che
compaia nella fascia oraria giusta con l'icona posate, e come card intera con
pulsante "Vai a Ristoranti" quando è la voce "in corso".

- [ ] **Step 7: Commit**

```bash
git add src/views/Today.jsx
git commit -m "Mostra i ristoranti prenotati nell'agenda di Oggi"
```

---

## Task 6: `AdminDaysEditor.jsx` — timeline a tre tipi nel drag HTML5 nativo

**Files:**
- Modify: `src/admin/AdminDaysEditor.jsx`

**Interfaces:**
- Consumes: `collectExternalDayItems`, `buildDayTimeline` (Task 2).

- [ ] **Step 1: Rinomina `transportByDate` in `externalByDate`**

Sostituisci il blocco alle righe 54-62:

```jsx
  // Voci Trasporti e schede Ristoranti con una data, raggruppate per giorno:
  // sola lettura qui (si modificano solo dalle rispettive sezioni, vedi
  // collectExternalDayItems), ma l'ordine si trascina come le voci del giorno.
  const externalByDate = useMemo(() => {
    const map = new Map()
    for (const item of collectExternalDayItems(trip)) {
      const list = map.get(item.date) ?? []
      list.push(item)
      map.set(item.date, list)
    }
    return map
  }, [trip])
```

- [ ] **Step 2: `reorderTimeline` con split a tre**

Sostituisci `reorderTimeline` (righe 68-97):

```jsx
  function reorderTimeline(day, externalItems, fromId, toId) {
    if (fromId === toId) return
    const timeline = buildDayTimeline(day, externalItems)
    const fromIdx = timeline.findIndex((e) => e.item.id === fromId)
    const toIdx = timeline.findIndex((e) => e.item.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const entries = [...timeline]
    const [moved] = entries.splice(fromIdx, 1)
    entries.splice(toIdx, 0, moved)
    const newItems = entries.filter((e) => e.type === 'item').map((e) => e.item)
    const newTransportIds = entries.filter((e) => e.type === 'transport').map((e) => e.item.id)
    const newCardIds = entries.filter((e) => e.type === 'card').map((e) => e.item.id)
    const newOrder = entries.map((e) => e.type)

    function reorderSubset(items, ids) {
      const dateIndices = []
      items.forEach((it, i) => { if (it.date === day.date) dateIndices.push(i) })
      if (dateIndices.length !== ids.length) return items
      const byId = new Map(items.map((it) => [it.id, it]))
      const result = [...items]
      dateIndices.forEach((i, pos) => { result[i] = byId.get(ids[pos]) })
      return result
    }

    onUpdate((t) => ({
      ...t,
      days: t.days.map((d) => (d.id === day.id ? { ...d, items: newItems, order: newOrder } : d)),
      sections: t.sections.map((s) => {
        if (s.type === 'transport') return { ...s, items: reorderSubset(s.items, newTransportIds) }
        if (s.type === 'cards' && s.title === 'Ristoranti') return { ...s, items: reorderSubset(s.items, newCardIds) }
        return s
      })
    }))
  }
```

- [ ] **Step 3: Aggiorna le due chiamate a `transportByDate`/`buildDayTimeline`**

Alle righe 160-162 e 175, sostituisci `transportByDate` con `externalByDate`:

```jsx
            {(() => {
              const externalItems = externalByDate.get(day.date) ?? []
              const timeline = buildDayTimeline(day, externalItems)
```

```jsx
                          if (dragEntry && dragEntry.dayId === day.id) reorderTimeline(day, externalItems, dragEntry.id, item.id)
```

- [ ] **Step 4: Terzo ramo di render per `entry.type === 'card'`**

Sostituisci il ramo `entry.type === 'item' ? (...) : (...)` (righe 189-233)
con tre rami:

```jsx
                        {entry.type === 'item' ? (
                          <>
                            <div className="flex-1">
                              {item.time && <span className="font-mono text-sm text-[var(--muted)] mr-2">{item.time}</span>}
                              <KindIcon kind={item.kind} />
                              <span className="text-base">{item.title}</span>
                              {item.kind !== 'sentiero' && item.detail && <p className="text-sm text-[var(--muted)] mt-0.5">{item.detail}</p>}
                              {sentieroStats(item).length > 0 && (
                                <div className="flex flex-wrap gap-3 mt-1">
                                  {sentieroStats(item).map((s, i) => (
                                    <div key={i} className="flex items-center gap-1 text-[var(--muted)]">
                                      <s.icon size={13} />
                                      <span className="font-mono text-sm font-medium text-[var(--ink)] whitespace-nowrap">{s.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => setItemForm({ dayId: day.id, id: item.id, ...EMPTY_ITEM, ...item })} aria-label="Modifica voce" className="p-1.5 text-[var(--muted)]">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => removeItem(day.id, item)} aria-label="Elimina voce" className="p-1.5 text-[var(--muted)]">
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : entry.type === 'transport' ? (
                          <>
                            <div className="flex-1">
                              {item.time && <span className="font-mono text-sm text-[var(--muted)] mr-2">{item.time}</span>}
                              <Bus size={15} className="inline mr-1.5 -mt-0.5 text-[var(--muted)]" />
                              <span className="text-base">{item.title}</span>
                              {item.note && <p className="text-sm text-[var(--muted)] mt-0.5">{item.note}</p>}
                            </div>
                            {item.link && (
                              <a href={item.link} target="_blank" rel="noreferrer" aria-label="Apri il biglietto" className="p-1.5 text-[var(--muted)]">
                                <ExternalLink size={14} />
                              </a>
                            )}
                            {onNavigate && (
                              <button onClick={() => onNavigate(item.origin.tab)} aria-label="Vai a Trasporti" className="p-1.5 text-[var(--muted)]">
                                <ArrowRight size={14} />
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="flex-1">
                              {item.time && <span className="font-mono text-sm text-[var(--muted)] mr-2">{item.time}</span>}
                              <Utensils size={15} className="inline mr-1.5 -mt-0.5 text-[var(--muted)]" />
                              <span className="text-base">{item.title}</span>
                              {item.note && <p className="text-sm text-[var(--muted)] mt-0.5">{item.note}</p>}
                            </div>
                            {item.link && (
                              <a href={item.link} target="_blank" rel="noreferrer" aria-label="Apri il link" className="p-1.5 text-[var(--muted)]">
                                <ExternalLink size={14} />
                              </a>
                            )}
                            {onNavigate && (
                              <button onClick={() => onNavigate(item.origin.tab)} aria-label="Vai a Ristoranti" className="p-1.5 text-[var(--muted)]">
                                <ArrowRight size={14} />
                              </button>
                            )}
                          </>
                        )}
```

(`Utensils` è già importato in cima al file per `KIND_ICONS`, nessun nuovo
import necessario.)

- [ ] **Step 5: Verifica manuale**

Run: `npm run build && npm run preview`

Apri `/admin`, entra in un viaggio con almeno una scheda Ristoranti prenotata
per una data del viaggio: verifica che compaia nella lista giorno con l'icona
posate, sia trascinabile insieme a voci/trasporti, e il pulsante "Vai a
Ristoranti" navighi correttamente.

- [ ] **Step 6: Commit**

```bash
git add src/admin/AdminDaysEditor.jsx
git commit -m "Estendi l'editor admin ai ristoranti prenotati nella timeline"
```

---

## Task 7: Build finale e verifica offline

**Files:** nessuno (solo verifica)

- [ ] **Step 1: Build completa**

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 2: Suite di test completa**

Run: `npm test`
Expected: tutti i test passano, inclusi quelli aggiunti nei Task 1-2.

- [ ] **Step 3: Verifica offline della PWA**

Run: `npm run preview`

DevTools → Application → Service Workers (verifica sia attivo), poi Network →
Offline: naviga tra Home, il viaggio, Itinerario, Ristoranti, Oggi. Verifica in
particolare che una scheda Ristoranti prenotata resti visibile sia in Ristoranti
sia nel giorno giusto anche offline (nessuna chiamata di rete necessaria: è
tutto derivato da `trip` in IndexedDB).

- [ ] **Step 4: Commit finale (se necessario)**

Se la verifica non richiede modifiche, nessun commit aggiuntivo. Se emergono
piccoli fix, applicarli e commitarli con un messaggio descrittivo del fix.
