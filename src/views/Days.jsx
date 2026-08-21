import { forwardRef, lazy, Suspense, useImperativeHandle, useMemo, useState } from 'react'
import { Plus, Mountain, Waves, Utensils, ExternalLink, Check, Ruler, Clock, TrendingUp, MapPin, Bus, ArrowRight, GripVertical } from 'lucide-react'
import EditIcon from '../components/EditIcon.jsx'
import DeleteIcon from '../components/DeleteIcon.jsx'
import Btn from '../components/Btn.jsx'
import DayLabel from '../components/DayLabel.jsx'
import Label from '../components/Label.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'

const DayMiniMap = lazy(() => import('./DayMiniMap.jsx'))
import { stampModified, dayItemFieldsForKind, collectExternalDayItems, buildDayTimeline } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
import CoordsInput from '../components/CoordsInput.jsx'
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const DATE_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
const WEEKDAY_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short' })

function formatDate(date) {
  return date ? DATE_FMT.format(new Date(date)) : ''
}

// Etichetta + numero per una pillola del selettore giorni.
function pillParts(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  return { weekday: WEEKDAY_FMT.format(d).replace('.', '').toUpperCase(), dayNum: d.getDate() }
}

function todayString() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Il giorno più vicino a oggi: usato per aprire l'Itinerario già sul giorno
// utile invece che sempre sul primo, senza introdurre un secondo concetto di
// "giorno corrente" diverso da quello di Oggi.
function closestDayId(days, todayStr) {
  const todayMs = new Date(`${todayStr}T00:00:00`).getTime()
  return days.reduce((best, d) => (Math.abs(new Date(`${d.date}T00:00:00`) - todayMs) < Math.abs(new Date(`${best.date}T00:00:00`) - todayMs) ? d : best), days[0]).id
}

const EMPTY_DAY = { date: '', title: '', note: '' }
const EMPTY_ITEM = { kind: '', time: '', title: '', detail: '', link: '', distanza: '', durata: '', dislivello: '', difficolta: '', accesso: '', servizi: '', luogo: '', prenotato: false, lat: null, lng: null }

const KIND_OPTIONS = [
  { value: '', label: 'Generica' },
  { value: 'sentiero', label: 'Sentiero' },
  { value: 'spiaggia', label: 'Spiaggia' },
  { value: 'pasto', label: 'Pasto' }
]

export const KIND_ICONS = { '': MapPin, sentiero: Mountain, spiaggia: Waves, pasto: Utensils }

function kindLabel(kind) {
  return KIND_OPTIONS.find((k) => k.value === kind)?.label ?? kind
}

const ALL_KIND_FIELDS = ['distanza', 'durata', 'dislivello', 'difficolta', 'accesso', 'servizi', 'luogo', 'prenotato', 'lat', 'lng']

function positiveDislivello(value) {
  return value ? value.split('·')[0].trim() : value
}

// Le tre statistiche di un sentiero (distanza/durata/dislivello), riusate sia
// dalla card completa (DayItemCard) sia dalla riga d'agenda in evidenza di Oggi.
export function sentieroStats(item) {
  if (item.kind !== 'sentiero') return []
  return [
    { icon: Ruler, value: item.distanza },
    { icon: Clock, value: item.durata },
    { icon: TrendingUp, value: positiveDislivello(item.dislivello) }
  ].filter((s) => s.value)
}

export function LinkChip({ link }) {
  if (!link) return null
  return (
    <div className="flex justify-end mt-3">
      <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--tint)] text-[var(--accent)] text-sm font-medium">
        <ExternalLink size={14} /> Apri il link
      </a>
    </div>
  )
}

// Voce sentiero/spiaggia/pasto: una scheda con badge del tipo, invece della
// riga di testo generica, per rendere le informazioni del percorso o del
// posto immediatamente riconoscibili.
export function DayItemCard({ item, onEdit, onRemove, dragHandle }) {
  const Icon = KIND_ICONS[item.kind]
  const stats = sentieroStats(item)

  return (
    <div className="rounded-[24px] p-4 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {Icon && (
            <div className="flex items-center gap-1.5">
              <Icon size={13} className="text-[var(--accent)]" />
              <p className="font-display font-semibold text-xs uppercase tracking-wider text-[var(--accent)]">{kindLabel(item.kind)}</p>
            </div>
          )}
          {item.time && <span className="font-mono text-sm text-[var(--muted)] mt-0.5 block">{item.time}</span>}
          <p className="font-display font-semibold text-xl mt-0.5 leading-snug">{item.title}</p>
          {item.kind !== 'sentiero' && item.detail && <p className="text-sm text-[var(--muted)] mt-1">{item.detail}</p>}
          {item.kind === 'pasto' && item.luogo && <p className="text-sm text-[var(--muted)] mt-1">{item.luogo}</p>}
          {item.kind === 'spiaggia' && (item.accesso || item.servizi) && (
            <p className="text-sm text-[var(--muted)] mt-1">{[item.accesso, item.servizi].filter(Boolean).join(' · ')}</p>
          )}
          {stats.length > 0 && (
            <div className="flex items-center gap-2 mt-2 overflow-x-auto no-scrollbar">
              {stats.map((s, i) => (
                <span key={i} className="flex-none inline-flex items-center gap-1 font-mono text-xs bg-[var(--tint)] rounded-full px-2.5 py-1 whitespace-nowrap">
                  <s.icon size={12} /> {s.value}
                </span>
              ))}
            </div>
          )}
        </div>
        {(dragHandle || onEdit || onRemove) && (
          <div className="flex gap-1 -mr-2 -mt-4 flex-none">
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
                <EditIcon size={15} />
              </button>
            )}
            {onRemove && (
              <button onClick={onRemove} aria-label="Elimina voce" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <DeleteIcon size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      {item.kind === 'pasto' && item.prenotato && (
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--accent2)] text-[var(--paper)] text-xs font-medium mt-3">
          <Check size={12} /> Prenotato
        </span>
      )}

      {item.link && (
        <>
          <div className="h-px bg-[var(--line)] mt-3 mb-3" />
          <div className="flex gap-2 flex-wrap">
            <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--tint)] text-[var(--accent)] text-sm font-medium">
              <ExternalLink size={15} /> Apri il link
            </a>
          </div>
        </>
      )}
      <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
    </div>
  )
}

// Voce Trasporti aggregata nel giorno: i campi si modificano solo dalla
// sezione Trasporti (da cui viene calcolata, vedi collectExternalDayItems),
// ma l'ordine è trascinabile quando arriva una dragHandle (solo dall'Itinerario).
export function TransportDayCard({ item, onNavigate, dragHandle }) {
  return (
    <div className="rounded-[24px] p-4 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-full bg-[var(--tint)] flex items-center justify-center flex-shrink-0">
            <Bus size={18} className="text-[var(--accent)]" />
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
      {item.link && (
        <div className="flex justify-end mt-3">
          <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--tint)] text-[var(--accent)] text-sm font-medium">
            <ExternalLink size={14} /> Apri il biglietto
          </a>
        </div>
      )}
      {onNavigate && (
        <div className="flex justify-end mt-3">
          <button type="button" onClick={() => onNavigate(item.origin.tab)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--tint)] text-[var(--accent)] text-sm font-medium">
            <ArrowRight size={14} /> Vai a Trasporti
          </button>
        </div>
      )}
      <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
    </div>
  )
}

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

// Voci del giorno, trasporti e ristoranti prenotati in un'unica lista,
// nell'ordine combinato salvato in day.order — non più per orario. Sola
// lettura: usata da Oggi quando il giorno mostrato non è quello odierno
// (l'agenda a fasce orarie ha senso solo per "oggi": su un giorno
// passato/futuro si torna a questa lista completa) e da DayItemsList sotto.
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

// Voce dell'Itinerario trascinabile (voce giorno, trasporto o ristorante
// prenotato): la maniglia avvia il drag, il resto della scheda si comporta
// come oggi.
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

// Voci del giorno, trasporti e ristoranti prenotati, nell'ordine combinato,
// di sola lettura: usata da Oggi quando il giorno mostrato non è oggi.
export function DayItemsList({ day, externalItems = [], onEditItem, onRemoveItem, onNavigate }) {
  if (day.items.length === 0 && externalItems.length === 0) return null
  return <TimelineBlock day={day} externalItems={externalItems} onEditItem={onEditItem} onRemoveItem={onRemoveItem} onNavigate={onNavigate} />
}

function withoutKindFields(item) {
  const clean = { ...item }
  for (const field of ALL_KIND_FIELDS) {
    delete clean[field]
  }
  return clean
}

function fieldsForForm(itemForm) {
  const common = { time: itemForm.time, title: itemForm.title, kind: itemForm.kind, detail: itemForm.detail, link: itemForm.link }
  for (const field of dayItemFieldsForKind(itemForm.kind)) {
    common[field] = itemForm[field]
  }
  return common
}

const Days = forwardRef(function Days({ trip, onUpdate, activeDisplayName, onNavigate }, ref) {
  const [dayForm, setDayForm] = useState(null)
  const [itemForm, setItemForm] = useState(null)
  const [selectedDayId, setSelectedDayId] = useState(null)
  const [activeEntry, setActiveEntry] = useState(null)
  // Un pull rigenera gli id dei giorni: se il giorno selezionato non esiste
  // più si ricade su quello più vicino a oggi, non sul primo a caso.
  const selectedDay = trip.days.length > 0
    ? trip.days.find((d) => d.id === selectedDayId) ?? trip.days.find((d) => d.id === closestDayId(trip.days, todayString()))
    : null
  // Le tappe con coordinate di questo giorno: se ce ne sono, la mini-mappa
  // qui sotto evita di dover aprire la tab Mappa solo per vedere dove sono.
  const dayMapItems = selectedDay ? selectedDay.items.filter((it) => it.lat != null && it.lng != null) : []

  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useImperativeHandle(ref, () => ({ openAdd: () => setDayForm(EMPTY_DAY) }))

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

  function handleDragStart(event) {
    setActiveEntry(timeline.find((e) => e.item.id === event.active.id) ?? null)
  }

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

  function saveDay(e) {
    e.preventDefault()
    onUpdate((t) => {
      const days = dayForm.id
        ? t.days.map((d) => (d.id === dayForm.id ? stampModified({ ...d, ...dayForm }, activeDisplayName) : d))
        : [...t.days, stampModified({ id: crypto.randomUUID(), items: [], ...dayForm }, activeDisplayName)]
      return { ...t, days: days.sort((a, b) => a.date.localeCompare(b.date)) }
    })
    setDayForm(null)
  }

  function removeDay(day) {
    if (window.confirm(`Eliminare "${day.title || formatDate(day.date)}"? Non si può annullare.`)) {
      onUpdate((t) => ({ ...t, days: t.days.filter((d) => d.id !== day.id) }))
    }
  }

  function saveItem(e) {
    e.preventDefault()
    const { dayId, id } = itemForm
    const fields = fieldsForForm(itemForm)
    onUpdate((t) => ({
      ...t,
      days: t.days.map((d) => {
        if (d.id !== dayId) return d
        if (id) return { ...d, items: d.items.map((it) => (it.id === id ? stampModified({ ...withoutKindFields(it), ...fields }, activeDisplayName) : it)) }
        return { ...d, items: [...d.items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)] }
      })
    }))
    setItemForm(null)
  }

  function removeItem(dayId, item) {
    if (window.confirm(`Eliminare "${item.title}"? Non si può annullare.`)) {
      onUpdate((t) => ({
        ...t,
        days: t.days.map((d) => (d.id === dayId ? { ...d, items: d.items.filter((it) => it.id !== item.id) } : d))
      }))
    }
  }

  return (
    <div className="flex flex-col gap-5 pt-5">
      {trip.days.length === 0 && (
        <Empty
          title="Nessun giorno ancora"
          detail="Aggiungi il primo giorno dell'itinerario."
          action={<Btn onClick={() => setDayForm(EMPTY_DAY)}>Aggiungi un giorno</Btn>}
        />
      )}

      {selectedDay && (
        <>
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {trip.days.map((day) => {
                const active = day.id === selectedDay.id
                const { weekday, dayNum } = pillParts(day.date)
                return (
                  <button
                    key={day.id}
                    onClick={() => setSelectedDayId(day.id)}
                    aria-pressed={active}
                    className={`flex-shrink-0 flex flex-col items-center justify-center gap-0.5 h-14 w-[52px] rounded-2xl font-mono ${
                      active ? 'bg-[var(--tint)] border-2 border-[var(--accent)] text-[var(--accent)]' : 'bg-[var(--card)] border border-[var(--line)] text-[var(--muted)]'
                    }`}
                  >
                    <span className="text-[10px] uppercase tracking-wide">{weekday}</span>
                    <span className={`text-[15px] ${active ? 'font-semibold' : 'font-medium'}`}>{dayNum}</span>
                  </button>
                )
              })}
            </div>
            {trip.days.length > 5 && (
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--paper)] to-transparent" />
            )}
          </div>

          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DayLabel>{formatDate(selectedDay.date)}</DayLabel>
              <p className="font-display font-semibold text-2xl leading-tight mt-2">{selectedDay.title || 'Senza titolo'}</p>
              {selectedDay.note && <p className="text-base text-[var(--muted)] mt-1">{selectedDay.note}</p>}
              <ModifiedBy modifiedBy={selectedDay.modifiedBy} modifiedAt={selectedDay.modifiedAt} />
            </div>
            <div className="flex gap-1 -mr-2 flex-shrink-0">
              <button onClick={() => setDayForm({ id: selectedDay.id, date: selectedDay.date, title: selectedDay.title, note: selectedDay.note })} aria-label="Modifica giorno" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <EditIcon size={17} />
              </button>
              <button onClick={() => removeDay(selectedDay)} aria-label="Elimina giorno" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <DeleteIcon size={17} />
              </button>
            </div>
          </div>

          {dayMapItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>{dayMapItems.length === 1 ? '1 tappa con posizione' : `${dayMapItems.length} tappe con posizione`}</Label>
              <Suspense fallback={null}>
                <DayMiniMap items={dayMapItems} />
              </Suspense>
            </div>
          )}

          <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <SortableContext items={timeline.map((e) => e.item.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-3">
                {timeline.map((entry) => (
                  <SortableTimelineEntry
                    key={entry.item.id}
                    entry={entry}
                    onEdit={entry.type === 'item' ? () => setItemForm({ dayId: selectedDay.id, id: entry.item.id, ...EMPTY_ITEM, ...entry.item }) : undefined}
                    onRemove={entry.type === 'item' ? () => removeItem(selectedDay.id, entry.item) : undefined}
                    onNavigate={entry.type !== 'item' ? onNavigate : undefined}
                  />
                ))}
              </ul>
            </SortableContext>
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
          </DndContext>

          <button onClick={() => setItemForm({ dayId: selectedDay.id, ...EMPTY_ITEM })} className="self-start flex items-center gap-1 text-base text-[var(--accent)] min-h-12">
            <Plus size={17} /> Aggiungi voce
          </button>
        </>
      )}

      <Modal open={!!dayForm} title={dayForm?.id ? 'Modifica giorno' : 'Nuovo giorno'} onClose={() => setDayForm(null)}>
        {dayForm && (
          <form onSubmit={saveDay} className="flex flex-col gap-3">
            <input required type="date" value={dayForm.date} onChange={(e) => setDayForm({ ...dayForm, date: e.target.value })} className={inputClass} />
            <input placeholder="Titolo del giorno" value={dayForm.title} onChange={(e) => setDayForm({ ...dayForm, title: e.target.value })} className={inputClass} />
            <textarea placeholder="Nota" value={dayForm.note} onChange={(e) => setDayForm({ ...dayForm, note: e.target.value })} className={inputClass} rows={2} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>

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
                <input placeholder="Distanza (es. 14,2 km)" value={itemForm.distanza} onChange={(e) => setItemForm({ ...itemForm, distanza: e.target.value })} className={inputClass} />
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

            {['sentiero', 'spiaggia', 'pasto'].includes(itemForm.kind) && (
              <CoordsInput value={{ lat: itemForm.lat, lng: itemForm.lng }} onChange={(coords) => setItemForm({ ...itemForm, ...coords })} />
            )}

            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
})

export default Days
