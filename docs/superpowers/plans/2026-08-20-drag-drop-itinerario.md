# Drag&drop Itinerario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere trascinabili le voci dell'Itinerario (riordino dentro un giorno,
spostamento su un altro giorno) e le schede della sezione Ristoranti (riordino),
sostituendo l'ordinamento automatico per orario con un ordine manuale.

**Architecture:** dnd-kit fornisce un `DndContext` per l'Itinerario che copre
tutti i giorni: ogni giorno è un contenitore droppable (`useDroppable`) e un
`SortableContext` per le proprie voci; una voce trascinata fuori dal proprio
giorno passa a un altro contenitore (pattern "board a più colonne" di dnd-kit).
Durante il trascinamento l'ordine vive in uno stato locale del componente, che si
sincronizza con `trip.days` al termine del gesto tramite l'unico canale di
scrittura già esistente, `onUpdate`. Le schede Ristoranti usano lo stesso pattern
di base ma con un solo `SortableContext` (nessun contenitore multiplo).

**Tech Stack:** React 18, dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`,
`@dnd-kit/utilities`), Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-20-drag-drop-itinerario-design.md`

## Global Constraints

- Nessuna modifica a `src/data/schema.js`: l'ordine di visualizzazione è
  l'ordine dell'array (`day.items`, `section.items`), non un campo nuovo.
- Riordinare o spostare una voce **non** aggiorna `modifiedBy`/`modifiedAt` né
  sulla voce né sul giorno (coerente con `src/admin/AdminDaysEditor.jsx`, che
  già non lo fa).
- Dipendenze aggiunte, solo queste: `@dnd-kit/core`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities`.
- Aree toccabili ≥44px (`min-h-12`/`min-w-12`, già lo standard del progetto).
- Il progetto non ha test di componente (solo vitest su `src/data/*`): la
  verifica di questo lavoro è `npm run build` + controllo manuale nel browser,
  come da `CLAUDE.md` ("Ogni fase finisce con `npm run build` che passa e una
  verifica offline in `preview`"). Non introdurre test di componente nuovi: non
  è il pattern del progetto e la spec esclude esplicitamente test dedicati per
  la logica di trascinamento, giudicata abbastanza semplice da non richiederli.
- `Today.jsx` non va modificato: eredita il nuovo comportamento riusando
  `DayItemsList`, che resta di sola lettura lì.

---

## Task 1: Aggiungi le dipendenze dnd-kit

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (generato da npm, non a mano)

**Interfaces:**
- Produces: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
  disponibili come import in tutto il progetto.

- [ ] **Step 1: Installa i pacchetti**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verifica che siano nelle dipendenze**

```bash
grep -n "@dnd-kit" package.json
```

Expected: tre righe, una per `@dnd-kit/core`, `@dnd-kit/sortable`,
`@dnd-kit/utilities`, sotto `"dependencies"`.

- [ ] **Step 3: Verifica che il build passi ancora**

```bash
npm run build
```

Expected: build completata senza errori (nessun codice usa ancora le nuove
dipendenze, quindi deve comportarsi come prima).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Aggiungi dnd-kit per il drag&drop"
```

---

## Task 2: Separa voci del giorno e trasporti in due blocchi, ordine manuale

Oggi `DayItemsList` (in `src/views/Days.jsx`) fonde voci del giorno e trasporti
in un'unica lista ordinata per `time`. Questo task la divide in due blocchi
(voci del giorno nell'ordine dell'array, trasporti di sola lettura ordinati per
orario) — passo propedeutico al drag&drop, verificabile e commitabile da solo
perché cambia già il comportamento visibile (l'ordine delle voci non dipende
più dall'orario).

**Files:**
- Modify: `src/views/Days.jsx:150-180` (blocco `DayItemsList` e il commento
  sopra)

**Interfaces:**
- Consumes: `TransportDayCard({ item, onNavigate })` e `DayItemCard({ item,
  onEdit, onRemove })`, già definiti sopra nello stesso file (invariati in
  questo task).
- Produces: `TransportBlock({ transportItems, onNavigate })` — blocco trasporti
  di sola lettura, ordinato per orario. `DayItemsBlock({ items, onEditItem,
  onRemoveItem })` — blocco voci del giorno di sola visualizzazione/modifica
  (non trascinabile), nell'ordine dell'array. `DayItemsList({ day,
  transportItems, onEditItem, onRemoveItem, onNavigate })` — stessa firma di
  prima, ora combina i due blocchi sopra; resta l'unica cosa che `Today.jsx`
  importa e usa, invariata nel suo utilizzo.

- [ ] **Step 1: Sostituisci il blocco `DayItemsList` esistente**

Nel file `src/views/Days.jsx`, sostituisci questo blocco (righe 150-180 circa,
dal commento sopra `DayItemsList` fino alla sua chiusura):

```jsx
// Unisce voci giorno e trasporti aggregati in un'unica lista ordinata per
// orario: usata sia dall'Itinerario (con modifica/eliminazione) sia da Oggi
// (sola lettura), così le due viste mostrano sempre lo stesso contenuto.
export function DayItemsList({ day, transportItems = [], onEditItem, onRemoveItem, onNavigate }) {
  const entries = [
    ...day.items.map((item) => ({
      key: `item-${item.id}`,
      time: item.time,
      node: (
        <DayItemCard
          item={item}
          onEdit={onEditItem ? () => onEditItem(item) : undefined}
          onRemove={onRemoveItem ? () => onRemoveItem(item) : undefined}
        />
      )
    })),
    ...transportItems.map((item) => ({
      key: `transport-${item.id}`,
      time: item.time,
      node: <TransportDayCard item={item} onNavigate={onNavigate} />
    }))
  ].sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  if (entries.length === 0) return null

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => <li key={entry.key}>{entry.node}</li>)}
    </ul>
  )
}
```

con:

```jsx
// Voci del giorno in sola lettura o modificabili (a seconda dei callback
// passati), nell'ordine salvato nell'array — non più per orario. Usata da Oggi
// (sola lettura, senza onEditItem/onRemoveItem) e da DayItemsList sotto.
// L'Itinerario, dove le voci sono trascinabili, usa invece DraggableDayItems
// (aggiunto nel task successivo) al posto di questo blocco.
function DayItemsBlock({ items, onEditItem, onRemoveItem }) {
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <DayItemCard
            item={item}
            onEdit={onEditItem ? () => onEditItem(item) : undefined}
            onRemove={onRemoveItem ? () => onRemoveItem(item) : undefined}
          />
        </li>
      ))}
    </ul>
  )
}

// Trasporti del giorno, aggregati dalla sezione Trasporti: sempre di sola
// lettura qui, ordinati per orario. Usata sia da Oggi sia dall'Itinerario.
function TransportBlock({ transportItems, onNavigate }) {
  if (transportItems.length === 0) return null
  const sorted = [...transportItems].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((item) => (
        <li key={item.id}>
          <TransportDayCard item={item} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  )
}

// Voci del giorno (ordine manuale) e trasporti (ordinati per orario) in due
// blocchi separati: usata da Oggi, sola lettura per entrambi i blocchi.
export function DayItemsList({ day, transportItems = [], onEditItem, onRemoveItem, onNavigate }) {
  if (day.items.length === 0 && transportItems.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      <DayItemsBlock items={day.items} onEditItem={onEditItem} onRemoveItem={onRemoveItem} />
      <TransportBlock transportItems={transportItems} onNavigate={onNavigate} />
    </div>
  )
}
```

- [ ] **Step 2: Verifica che il build passi**

```bash
npm run build
```

Expected: nessun errore.

- [ ] **Step 3: Verifica manuale nel browser**

```bash
npm run dev
```

Apri l'app, entra in un viaggio del seed (Dolomiti Friulane o Ponza), vai su
Itinerario e su Oggi. Verifica che:
- le voci del giorno appaiano nello stesso ordine di prima (i dati del seed
  sono già inseriti in ordine cronologico, quindi visivamente non deve
  cambiare nulla se gli orari sono già in ordine);
- se un giorno ha trasporti aggregati, questi ora appaiono come blocco a sé
  sotto le voci del giorno, invece che mescolati per orario.

- [ ] **Step 4: Commit**

```bash
git add src/views/Days.jsx
git commit -m "Separa voci del giorno e trasporti in due blocchi, ordine manuale"
```

---

## Task 3: Drag&drop per riordinare le schede Ristoranti

Riordino a singolo contenitore (nessuno spostamento tra sezioni) — pattern più
semplice di quello dell'Itinerario, buono per validare l'uso di dnd-kit prima di
affrontare il caso multi-contenitore del Task 4.

**Files:**
- Modify: `src/views/Section.jsx`

**Interfaces:**
- Consumes: `@dnd-kit/core` (`DndContext`, `PointerSensor`, `KeyboardSensor`,
  `useSensor`, `useSensors`, `closestCenter`), `@dnd-kit/sortable`
  (`SortableContext`, `verticalListSortingStrategy`,
  `sortableKeyboardCoordinates`, `arrayMove`, `useSortable`),
  `@dnd-kit/utilities` (`CSS`). `updateSection(trip, sectionId, fn)`, già
  definita nel file.
- Produces: nessuna nuova esportazione — modifica solo il rendering interno di
  `Section` per `section.type === 'cards'`.

- [ ] **Step 1: Aggiungi gli import di dnd-kit e dell'icona maniglia**

In `src/views/Section.jsx`, la riga 2 diventa:

```jsx
import { Plus, Pencil, Trash2, Check, GripVertical } from 'lucide-react'
```

Subito sotto gli import esistenti (dopo la riga `import Lodging from
'./Lodging.jsx'`), aggiungi:

```jsx
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
```

- [ ] **Step 2: Aggiungi il componente `SortableCard`**

Subito prima di `const Section = forwardRef(...)`, aggiungi:

```jsx
// Scheda Ristoranti trascinabile: la maniglia avvia il drag, il resto della
// scheda si comporta come oggi (tap su matita/cestino invariato).
function SortableCard({ item, onEdit, onRemove }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    boxShadow: isDragging ? '0 12px 32px -10px rgb(var(--ink-rgb) / 0.4)' : undefined
  }
  return (
    <div ref={setNodeRef} style={style} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display font-semibold text-xl">{item.title || 'Senza titolo'}</p>
        <div className="flex gap-1 -mr-2 -mt-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label="Trascina per riordinare"
            className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)] cursor-grab touch-none"
          >
            <GripVertical size={15} />
          </button>
          <button onClick={onEdit} aria-label="Modifica scheda" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
            <Pencil size={15} />
          </button>
          <button onClick={onRemove} aria-label="Elimina scheda" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {item.meta && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.meta}</p>}
      {item.detail && <p className="text-base mt-2">{item.detail}</p>}
      {item.link && (
        <a href={item.link} target="_blank" rel="noreferrer" className="text-base text-[var(--accent)] underline mt-2 inline-block">
          Apri il link
        </a>
      )}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {item.tags.map((tag) => (
            <Label key={tag} className="bg-[var(--tint)] px-2.5 py-1 rounded-full">
              {tag}
            </Label>
          ))}
        </div>
      )}
      <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
    </div>
  )
}
```

- [ ] **Step 3: Aggiungi sensori e handler di riordino dentro `Section`**

Subito dopo la riga `const childRef = useRef(null)` dentro il componente
`Section`, aggiungi:

```jsx
  const cardSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleCardDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onUpdate((t) =>
      updateSection(t, section.id, (s) => {
        const oldIndex = s.items.findIndex((it) => it.id === active.id)
        const newIndex = s.items.findIndex((it) => it.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return s
        return { ...s, items: arrayMove(s.items, oldIndex, newIndex) }
      })
    )
  }
```

- [ ] **Step 4: Sostituisci il rendering delle schede**

Sostituisci questo blocco (dentro `{section.type === 'cards' && (...)}`):

```jsx
          <div className="flex flex-col gap-3">
            {section.items.map((item) => (
              <div key={item.id} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-semibold text-xl">{item.title || 'Senza titolo'}</p>
                  <div className="flex gap-1 -mr-2 -mt-1">
                    <button
                      onClick={() => setCardForm({ id: item.id, title: item.title, meta: item.meta, detail: item.detail, link: item.link, tags: item.tags.join(', '), lat: item.lat, lng: item.lng })}
                      aria-label="Modifica scheda"
                      className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]"
                    >
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => removeCard(item)} aria-label="Elimina scheda" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {item.meta && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.meta}</p>}
                {item.detail && <p className="text-base mt-2">{item.detail}</p>}
                {item.link && (
                  <a href={item.link} target="_blank" rel="noreferrer" className="text-base text-[var(--accent)] underline mt-2 inline-block">
                    Apri il link
                  </a>
                )}
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.tags.map((tag) => (
                      <Label key={tag} className="bg-[var(--tint)] px-2.5 py-1 rounded-full">
                        {tag}
                      </Label>
                    ))}
                  </div>
                )}
                <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
              </div>
            ))}
          </div>
```

con:

```jsx
          <DndContext sensors={cardSensors} collisionDetection={closestCenter} onDragEnd={handleCardDragEnd}>
            <SortableContext items={section.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {section.items.map((item) => (
                  <SortableCard
                    key={item.id}
                    item={item}
                    onEdit={() => setCardForm({ id: item.id, title: item.title, meta: item.meta, detail: item.detail, link: item.link, tags: item.tags.join(', '), lat: item.lat, lng: item.lng })}
                    onRemove={() => removeCard(item)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
```

- [ ] **Step 5: Verifica che il build passi**

```bash
npm run build
```

Expected: nessun errore.

- [ ] **Step 6: Verifica manuale nel browser**

```bash
npm run dev
```

Apri un viaggio del seed, vai sulla sezione Ristoranti (deve avere almeno 2
schede — se il seed ne ha una sola, aggiungine una al volo dall'app per
provare). Trascina la maniglia (icona a sei puntini) di una scheda sopra
un'altra con il mouse: l'ordine deve cambiare e restare tale dopo un refresh
della pagina (persistito via IndexedDB).

- [ ] **Step 7: Commit**

```bash
git add src/views/Section.jsx
git commit -m "Aggiungi drag&drop per riordinare le schede Ristoranti"
```

---

## Task 4: Drag&drop per riordinare e spostare le voci dell'Itinerario

Il task più corposo: un `DndContext` unico copre tutti i giorni dell'Itinerario,
con un `SortableContext` per giorno e la possibilità di trascinare una voce da
un giorno all'altro.

**Files:**
- Modify: `src/views/Days.jsx`

**Interfaces:**
- Consumes: `TransportBlock({ transportItems, onNavigate })` dal Task 2
  (invariata, chiamata direttamente al posto di `DayItemsList`; `DayItemsList`
  resta comunque esportata e invariata per `Today.jsx`). `@dnd-kit/core`
  (`DndContext`, `DragOverlay`, `PointerSensor`, `KeyboardSensor`,
  `useSensor`, `useSensors`, `useDroppable`, `closestCorners`),
  `@dnd-kit/sortable` (`SortableContext`, `verticalListSortingStrategy`,
  `sortableKeyboardCoordinates`, `arrayMove`, `useSortable`),
  `@dnd-kit/utilities` (`CSS`).
- Produces: `DayItemCard` guadagna una prop opzionale `dragHandle` (oggetto
  `{ setActivatorNodeRef, attributes, listeners }` da `useSortable`, o
  `undefined`) — retrocompatibile, non usata da `DayItemsBlock`/Today.

- [ ] **Step 1: Aggiungi gli import di dnd-kit e dell'icona maniglia**

In `src/views/Days.jsx`, la riga 2 diventa:

```jsx
import { Plus, Pencil, Trash2, Mountain, Waves, Utensils, ExternalLink, Check, Ruler, Clock, TrendingUp, MapPin, Bus, ArrowRight, GripVertical } from 'lucide-react'
```

Subito dopo l'import di `CoordsInput` (`import CoordsInput from
'../components/CoordsInput.jsx'`), aggiungi:

```jsx
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, closestCorners } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
```

- [ ] **Step 2: Aggiungi la maniglia opzionale a `DayItemCard`**

Nella funzione `DayItemCard` (che riceve oggi `{ item, onEdit, onRemove }`),
cambia la firma in:

```jsx
export function DayItemCard({ item, onEdit, onRemove, dragHandle }) {
```

E sostituisci questo blocco:

```jsx
        {(onEdit || onRemove) && (
          <div className="flex gap-1 -mr-2 -mt-1 flex-shrink-0">
            {onEdit && (
              <button onClick={onEdit} aria-label="Modifica voce" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <Pencil size={15} />
              </button>
            )}
            {onRemove && (
              <button onClick={onRemove} aria-label="Elimina voce" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
```

con:

```jsx
        {(dragHandle || onEdit || onRemove) && (
          <div className="flex gap-1 -mr-2 -mt-1 flex-shrink-0">
            {dragHandle && (
              <button
                type="button"
                ref={dragHandle.setActivatorNodeRef}
                {...dragHandle.attributes}
                {...dragHandle.listeners}
                aria-label="Trascina per riordinare"
                className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)] cursor-grab touch-none"
              >
                <GripVertical size={15} />
              </button>
            )}
            {onEdit && (
              <button onClick={onEdit} aria-label="Modifica voce" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <Pencil size={15} />
              </button>
            )}
            {onRemove && (
              <button onClick={onRemove} aria-label="Elimina voce" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
```

- [ ] **Step 3: Aggiungi `SortableDayItem` e `DraggableDayItems`**

Subito dopo la chiusura della funzione `DayItemsBlock` (aggiunta nel Task 2,
prima di `TransportBlock`), aggiungi:

```jsx
// Voce dell'Itinerario trascinabile: la maniglia avvia il drag, il resto della
// scheda si comporta come oggi (tap su matita/cestino invariato).
function SortableDayItem({ item, onEdit, onRemove }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }
  return (
    <li ref={setNodeRef} style={style}>
      <DayItemCard
        item={item}
        onEdit={onEdit}
        onRemove={onRemove}
        dragHandle={{ setActivatorNodeRef, attributes, listeners }}
      />
    </li>
  )
}

// Contenitore droppable per le voci di un giorno: sia le voci esistenti (via
// SortableContext) sia lo spazio vuoto del giorno (via useDroppable, per poter
// trascinare una voce anche su un giorno senza voci) sono bersagli di drop
// validi.
function DraggableDayItems({ day, onEditItem, onRemoveItem }) {
  const { setNodeRef } = useDroppable({ id: day.id })
  return (
    <SortableContext items={day.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
      <ul ref={setNodeRef} className="flex flex-col gap-3 min-h-12">
        {day.items.map((item) => (
          <SortableDayItem
            key={item.id}
            item={item}
            onEdit={() => onEditItem(item)}
            onRemove={() => onRemoveItem(item)}
          />
        ))}
      </ul>
    </SortableContext>
  )
}
```

- [ ] **Step 4: Aggiungi stato e handler di drag dentro il componente `Days`**

Subito dopo `const [itemForm, setItemForm] = useState(null)` dentro `Days`,
aggiungi:

```jsx
  const [workingDays, setWorkingDays] = useState(null)
  const [activeItem, setActiveItem] = useState(null)
  const displayDays = workingDays ?? trip.days

  const daySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function findContainerId(days, id) {
    if (days.some((d) => d.id === id)) return id
    const owner = days.find((d) => d.items.some((it) => it.id === id))
    return owner?.id ?? null
  }

  function findItemById(days, id) {
    for (const day of days) {
      const item = day.items.find((it) => it.id === id)
      if (item) return item
    }
    return null
  }

  function handleDragStart(event) {
    setWorkingDays(trip.days)
    setActiveItem(findItemById(trip.days, event.active.id))
  }

  function handleDragOver(event) {
    const { active, over } = event
    if (!over) return
    setWorkingDays((days) => {
      const fromDayId = findContainerId(days, active.id)
      const toDayId = findContainerId(days, over.id)
      if (!fromDayId || !toDayId || fromDayId === toDayId) return days
      const fromDay = days.find((d) => d.id === fromDayId)
      const toDay = days.find((d) => d.id === toDayId)
      const activeIndex = fromDay.items.findIndex((it) => it.id === active.id)
      if (activeIndex === -1) return days
      const movedItem = fromDay.items[activeIndex]
      const overIndex = toDay.items.findIndex((it) => it.id === over.id)
      const insertAt = overIndex === -1 ? toDay.items.length : overIndex
      return days.map((d) => {
        if (d.id === fromDayId) return { ...d, items: d.items.filter((it) => it.id !== active.id) }
        if (d.id === toDayId) {
          const items = [...d.items]
          items.splice(insertAt, 0, movedItem)
          return { ...d, items }
        }
        return d
      })
    })
  }

  function handleDragEnd(event) {
    const { active, over } = event
    setActiveItem(null)
    const days = workingDays
    setWorkingDays(null)
    if (!days) return
    let finalDays = days
    if (over) {
      const fromDayId = findContainerId(days, active.id)
      const toDayId = findContainerId(days, over.id)
      if (fromDayId && toDayId && fromDayId === toDayId && active.id !== over.id) {
        finalDays = days.map((d) => {
          if (d.id !== fromDayId) return d
          const oldIndex = d.items.findIndex((it) => it.id === active.id)
          const newIndex = d.items.findIndex((it) => it.id === over.id)
          return oldIndex === -1 || newIndex === -1 ? d : { ...d, items: arrayMove(d.items, oldIndex, newIndex) }
        })
      }
    }
    onUpdate((t) => ({ ...t, days: finalDays }))
  }
```

Nota: `handleDragOver` sposta già la voce nel contenitore di destinazione in
tempo reale (per il feedback visivo mentre trascini); `handleDragEnd` si
occupa solo di finalizzare il riordino dentro l'ultimo contenitore raggiunto,
poi scrive il risultato una sola volta con `onUpdate` e azzera lo stato locale.

- [ ] **Step 5: Sostituisci il rendering della lista giorni**

Trova questo blocco dentro il `return` di `Days`:

```jsx
      {trip.days.map((day) => (
        <div key={day.id} className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DayLabel>{formatDate(day.date)}</DayLabel>
              <p className="font-display font-semibold text-2xl leading-tight mt-2">{day.title || 'Senza titolo'}</p>
              {day.note && <p className="text-base text-[var(--muted)] mt-1">{day.note}</p>}
              <ModifiedBy modifiedBy={day.modifiedBy} modifiedAt={day.modifiedAt} />
            </div>
            <div className="flex gap-1 -mr-2 flex-shrink-0">
              <button onClick={() => setDayForm({ id: day.id, date: day.date, title: day.title, note: day.note })} aria-label="Modifica giorno" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <Pencil size={17} />
              </button>
              <button onClick={() => removeDay(day)} aria-label="Elimina giorno" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <Trash2 size={17} />
              </button>
            </div>
          </div>

          <DayItemsList
            day={day}
            transportItems={transportByDate.get(day.date) ?? []}
            onEditItem={(item) => setItemForm({ dayId: day.id, id: item.id, ...EMPTY_ITEM, ...item })}
            onRemoveItem={(item) => removeItem(day.id, item)}
            onNavigate={onNavigate}
          />

          <button onClick={() => setItemForm({ dayId: day.id, ...EMPTY_ITEM })} className="self-start flex items-center gap-1 text-base text-[var(--accent)] min-h-12">
            <Plus size={17} /> Aggiungi voce
          </button>
        </div>
      ))}
```

Sostituiscilo con:

```jsx
      <DndContext sensors={daySensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        {displayDays.map((day) => (
          <div key={day.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <DayLabel>{formatDate(day.date)}</DayLabel>
                <p className="font-display font-semibold text-2xl leading-tight mt-2">{day.title || 'Senza titolo'}</p>
                {day.note && <p className="text-base text-[var(--muted)] mt-1">{day.note}</p>}
                <ModifiedBy modifiedBy={day.modifiedBy} modifiedAt={day.modifiedAt} />
              </div>
              <div className="flex gap-1 -mr-2 flex-shrink-0">
                <button onClick={() => setDayForm({ id: day.id, date: day.date, title: day.title, note: day.note })} aria-label="Modifica giorno" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Pencil size={17} />
                </button>
                <button onClick={() => removeDay(day)} aria-label="Elimina giorno" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Trash2 size={17} />
                </button>
              </div>
            </div>

            <DraggableDayItems
              day={day}
              onEditItem={(item) => setItemForm({ dayId: day.id, id: item.id, ...EMPTY_ITEM, ...item })}
              onRemoveItem={(item) => removeItem(day.id, item)}
            />
            <TransportBlock transportItems={transportByDate.get(day.date) ?? []} onNavigate={onNavigate} />

            <button onClick={() => setItemForm({ dayId: day.id, ...EMPTY_ITEM })} className="self-start flex items-center gap-1 text-base text-[var(--accent)] min-h-12">
              <Plus size={17} /> Aggiungi voce
            </button>
          </div>
        ))}
        <DragOverlay>
          {activeItem ? (
            <div className="rounded-[24px] shadow-[0_12px_32px_-10px_rgb(var(--ink-rgb)/0.4)]">
              <DayItemCard item={activeItem} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
```

- [ ] **Step 6: Verifica che il build passi**

```bash
npm run build
```

Expected: nessun errore. Se compare un errore su `DayItemsList` non usato,
controlla che l'import in `Today.jsx` sia rimasto intatto (`Today.jsx` non va
toccato in questo task) e che `DayItemsList` sia ancora esportata da
`Days.jsx` (l'ha già prodotta il Task 2).

- [ ] **Step 7: Verifica manuale nel browser**

```bash
npm run dev
```

Apri un viaggio del seed con più giorni e più voci per giorno (es. Dolomiti
Friulane). Con il mouse (il trascinamento touch va verificato separatamente su
un telefono reale, vedi Task 5):
- trascina la maniglia di una voce sopra un'altra **nello stesso giorno**:
  l'ordine deve cambiare e restare tale dopo un refresh;
- trascina una voce **su un giorno diverso** (anche vuoto, se ce n'è uno):
  la voce deve spostarsi lì, restare al suo posto dopo il rilascio e dopo un
  refresh; il suo orario non deve cambiare;
- se la pagina è più lunga della finestra, trascina una voce verso il bordo
  inferiore/superiore dello schermo e verifica che la pagina scorra da sola
  (auto-scroll di dnd-kit).

- [ ] **Step 8: Commit**

```bash
git add src/views/Days.jsx
git commit -m "Aggiungi drag&drop per riordinare e spostare le voci dell'Itinerario"
```

---

## Task 5: Verifica finale

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Build e preview della PWA**

```bash
npm run build && npm run preview
```

Apri l'app dalla preview, DevTools → Application → Service Workers (deve
essere attivo), poi Network → Offline: l'app deve aprirsi e mostrare i viaggi
come da prassi del progetto.

- [ ] **Step 2: Ripasso funzionale nel browser (preview)**

Verifica ancora una volta, questa volta sulla build di produzione:
- riordino voci dentro un giorno dell'Itinerario;
- spostamento di una voce su un altro giorno;
- riordino schede Ristoranti;
- Oggi mostra ancora correttamente voci del giorno e trasporti (invariato,
  nessuna maniglia visibile lì).

- [ ] **Step 3: Segnala all'utente la verifica su dispositivo reale**

Il trascinamento touch con auto-scroll della pagina non è affidabile da
verificare con l'emulazione DevTools. Prima di considerare il lavoro concluso,
segnala esplicitamente all'utente di provare il drag&drop su un telefono reale
(quello con cui userà davvero l'app in viaggio) — in particolare: trascinare
una voce da un giorno all'altro quando ci sono più giorni di quanti ne stanno
a schermo, per confermare che l'auto-scroll funzioni bene al tocco.
