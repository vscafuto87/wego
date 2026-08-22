import { forwardRef, lazy, Suspense, useImperativeHandle, useRef, useState } from 'react'
import { Plus, Check, GripVertical, ExternalLink, Phone } from 'lucide-react'
import EditIcon from '../components/EditIcon.jsx'
import DeleteIcon from '../components/DeleteIcon.jsx'
import Btn from '../components/Btn.jsx'
import Label from '../components/Label.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified, dayItemFieldsForKind, DAY_ITINERARY_CARD_SECTIONS } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
import CoordsInput from '../components/CoordsInput.jsx'
import Transport from './Transport.jsx'
import Lodging from './Lodging.jsx'
import { KIND_ICONS, sentieroStats } from './Days.jsx'
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const MapSection = lazy(() => import('./MapSection.jsx'))

function isRistoranti(section) {
  return section.type === 'cards' && section.title === 'Ristoranti'
}

// Sezioni cards con schede che, quando hanno una data, si raggruppano in due
// liste trascinabili invece della lista piatta generica (vedi
// DATE_GROUP_CONFIG sotto per le etichette e i testi specifici di ciascuna).
const DATE_GROUP_CONFIG = {
  Ristoranti: {
    groups: [
      { key: 'prenotati', label: 'Prenotati' },
      { key: 'consigliati', label: 'Consigliati' }
    ],
    dateFieldLabel: 'Data della prenotazione',
    timeFieldLabel: 'Ora della prenotazione',
    datePromptLabel: 'Data della prenotazione (AAAA-MM-GG)',
    dateInvalidLabel: 'Data non valida. Usa il formato AAAA-MM-GG (es. 2026-08-30)',
    timePromptLabel: 'Ora della prenotazione (HH:MM, lascia vuoto se non serve)',
    confirmRemove: (title) => `Annullare la prenotazione di "${title}"?`,
    badgeLabel: 'Prenotato'
  },
  'Spiagge e cale': {
    groups: [
      { key: 'prenotati', label: 'In programma' },
      { key: 'consigliati', label: 'Da scegliere' }
    ],
    dateFieldLabel: 'Giorno del viaggio',
    timeFieldLabel: 'Ora (facoltativa)',
    datePromptLabel: 'Giorno del viaggio per questa spiaggia (AAAA-MM-GG)',
    dateInvalidLabel: 'Data non valida. Usa il formato AAAA-MM-GG (es. 2026-08-31)',
    timePromptLabel: 'Ora (HH:MM, lascia vuoto se non serve)',
    confirmRemove: (title) => `Togliere "${title}" dal programma dei giorni?`,
    badgeLabel: 'In programma'
  }
}

function dateGroupConfig(section) {
  return section.type === 'cards' ? (DATE_GROUP_CONFIG[section.title] ?? null) : null
}

function hasDateGrouping(section) {
  return dateGroupConfig(section) !== null
}

const CARD_DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })

function formatCardDate(date) {
  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return CARD_DATE_FMT.format(d)
}

function groupKeyFor(item) {
  return item.date ? 'prenotati' : 'consigliati'
}

// Accetta solo AAAA-MM-GG che corrisponda a una data reale (rifiuta "domani",
// "3/9", "2026-02-30", ecc.): il valore finisce diretto in item.date e viene
// riletto da formatCardDate/new Date ovunque si mostra la scheda.
function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, day] = value.split('-').map(Number)
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day
}

function isFixedSection(section) {
  if (section.type === 'transport' || section.type === 'lodging' || section.type === 'map') return true
  // Stessa lista di schema.js/Settings.jsx/AdminTripEditor.jsx: le sezioni
  // agganciate per titolo esatto all'Itinerario restano fisse come
  // Ristoranti, altrimenti rinominarle romperebbe l'aggancio in silenzio.
  return section.type === 'cards' && DAY_ITINERARY_CARD_SECTIONS.includes(section.title)
}

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const chipClass = 'inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--tint)] text-[var(--accent)] text-sm font-medium'
const EMPTY_CARD = { title: '', meta: '', kind: '', detail: '', link: '', tags: '', address: '', phone: '', lat: null, lng: null, distanza: '', durata: '', dislivello: '', difficolta: '', accesso: '', servizi: '', prenotato: false, date: '', time: '' }

const KIND_OPTIONS = [
  { value: '', label: 'Generica' },
  { value: 'sentiero', label: 'Sentiero' },
  { value: 'spiaggia', label: 'Spiaggia' },
  { value: 'pasto', label: 'Ristorante' }
]

function kindLabel(kind) {
  return KIND_OPTIONS.find((k) => k.value === kind)?.label ?? kind
}

const ALL_KIND_FIELDS = ['distanza', 'durata', 'dislivello', 'difficolta', 'accesso', 'servizi', 'prenotato']

function withoutKindFields(item) {
  const clean = { ...item }
  for (const field of ALL_KIND_FIELDS) delete clean[field]
  return clean
}

function cardFieldsForForm(cardForm) {
  const tags = cardForm.tags.split(',').map((x) => x.trim()).filter(Boolean)
  const common = { title: cardForm.title, meta: cardForm.meta, kind: cardForm.kind, detail: cardForm.detail, link: cardForm.link, tags, address: cardForm.address, phone: cardForm.phone, lat: cardForm.lat, lng: cardForm.lng, date: cardForm.date, time: cardForm.time }
  for (const field of dayItemFieldsForKind(cardForm.kind)) {
    if (field === 'lat' || field === 'lng') continue
    common[field] = cardForm[field]
  }
  return common
}

function updateSection(trip, sectionId, fn) {
  return { ...trip, sections: trip.sections.map((s) => (s.id === sectionId ? fn(s) : s)) }
}

// Contenitore di un gruppo Prenotati/Consigliati: resta un'area di drop
// valida quando il gruppo è vuoto (dnd-kit "multiple containers"). Quando il
// gruppo ha già delle schede, il droppable del contenitore è disattivato:
// altrimenti il suo centro (che copre l'intero gruppo) può risultare più
// vicino al cursore di quanto lo sia la scheda sotto il cursore secondo
// closestCenter, "vincendo" la collisione e facendo cadere ogni drop a metà
// gruppo in fondo alla lista invece che nel punto rilasciato.
function DroppableGroup({ groupKey, disabled, children }) {
  const { setNodeRef } = useDroppable({ id: `group-${groupKey}`, disabled })
  return <div ref={setNodeRef} className="flex flex-col gap-3 min-h-[3rem]">{children}</div>
}

// Scheda trascinabile di una sezione con raggruppamento per data (Ristoranti,
// Spiagge e cale): la maniglia avvia il drag, il resto della scheda si
// comporta come oggi (tap su matita/cestino invariato). dateBadgeLabel viene
// dalla config della sezione di appartenenza (vedi DATE_GROUP_CONFIG).
function SortableCard({ item, onEdit, onRemove, dateBadgeLabel = 'Prenotato' }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    boxShadow: isDragging ? '0 12px 32px -10px rgb(var(--ink-rgb) / 0.4)' : undefined
  }
  const KindIcon = KIND_ICONS[item.kind] ?? KIND_ICONS['']
  const stats = sentieroStats(item)
  return (
    <div ref={setNodeRef} style={style} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <KindIcon size={13} className="text-[var(--accent)]" />
            <p className="font-display font-semibold text-xs uppercase tracking-wider text-[var(--accent)]">{kindLabel(item.kind)}</p>
          </div>
          <p className="font-display font-semibold text-xl mt-0.5">{item.title || 'Senza titolo'}</p>
        </div>
        <div className="flex gap-1 -mr-2 -mt-4 flex-none">
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
            <EditIcon size={15} />
          </button>
          <button onClick={onRemove} aria-label="Elimina scheda" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
            <DeleteIcon size={15} />
          </button>
        </div>
      </div>
      {item.meta && <p className="font-mono text-sm text-[var(--muted)] mt-1.5">{item.meta}</p>}
      {item.address && <p className="text-sm text-[var(--muted)] mt-1.5">{item.address}</p>}
      {item.kind !== 'sentiero' && item.detail && <p className="text-base mt-2">{item.detail}</p>}
      {item.kind === 'spiaggia' && (item.accesso || item.servizi) && (
        <p className="text-base mt-2">{[item.accesso, item.servizi].filter(Boolean).join(' · ')}</p>
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
      {item.kind === 'pasto' && item.prenotato && !item.date && (
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--accent2)] text-[var(--paper)] text-xs font-medium mt-3">
          <Check size={12} /> Prenotato
        </span>
      )}
      {item.date && (
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--accent2)] text-[var(--paper)] text-xs font-medium mt-3">
          <Check size={12} /> {dateBadgeLabel} · {formatCardDate(item.date)}{item.time ? ` · ${item.time}` : ''}
        </span>
      )}

      {(item.link || item.phone) && (
        <>
          <div className="h-px bg-[var(--line)] mt-3 mb-3" />
          <div className="flex gap-2 flex-wrap">
            {item.link && (
              <a href={item.link} target="_blank" rel="noreferrer" className={chipClass}>
                <ExternalLink size={15} /> Apri il link
              </a>
            )}
            {item.phone && (
              <a href={`tel:${item.phone.replace(/\s+/g, '')}`} className={chipClass}>
                <Phone size={15} /> Chiama
              </a>
            )}
          </div>
        </>
      )}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
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

const Section = forwardRef(function Section({ trip, section, onUpdate, activeDisplayName, onNavigate, syncState }, ref) {
  const [headerForm, setHeaderForm] = useState(null)
  const [cardForm, setCardForm] = useState(null)
  const [checklistText, setChecklistText] = useState('')
  const [notesDraft, setNotesDraft] = useState(section.text ?? '')
  const checklistInputRef = useRef(null)
  // Trasporti/Pernottamento/Mappa gestiscono il proprio form "nuovo elemento"
  // internamente: la sezione si limita a inoltrare l'apertura al figlio attivo.
  const childRef = useRef(null)

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

  function targetGroupKey(over, items) {
    if (!over) return null
    if (over.id === 'group-prenotati' || over.id === 'group-consigliati') return over.id.replace('group-', '')
    const overItem = items.find((it) => it.id === over.id)
    return overItem ? groupKeyFor(overItem) : null
  }

  // Trascinare una scheda di una sezione con raggruppamento (Ristoranti,
  // Spiagge e cale) nell'altro gruppo cambia la data: verso il primo gruppo
  // chiede data/ora (annullare il prompt annulla lo spostamento), verso il
  // secondo chiede conferma prima di svuotarla (annullare la conferma
  // annulla lo spostamento). Testi dei prompt dalla config della sezione.
  // Dentro lo stesso gruppo, riordina soltanto.
  function handleGroupedDragEnd(event) {
    const config = dateGroupConfig(section)
    if (!config) return
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
            let date = window.prompt(config.datePromptLabel, '')
            while (date !== null && !isValidISODate(date)) {
              date = window.prompt(config.dateInvalidLabel, date)
            }
            if (!date) return s
            const time = window.prompt(config.timePromptLabel, '') ?? ''
            updatedItem = stampModified({ ...activeItem, date, time }, activeDisplayName)
          } else {
            if (!window.confirm(config.confirmRemove(activeItem.title))) return s
            updatedItem = stampModified({ ...activeItem, date: '', time: '' }, activeDisplayName)
          }
        }

        const overIsGroupContainer = over.id === 'group-prenotati' || over.id === 'group-consigliati'

        if (fromGroup === toGroup && !overIsGroupContainer) {
          // Stesso gruppo: riordino puro, stesso calcolo di handleCardDragEnd
          // (arrayMove sugli indici nell'array ORIGINALE, non su un array
          // già privato dell'item attivo — altrimenti un drag di una
          // posizione verso il basso non produce alcun cambiamento visibile).
          const oldIndex = s.items.findIndex((it) => it.id === active.id)
          const newIndex = s.items.findIndex((it) => it.id === over.id)
          if (oldIndex === -1 || newIndex === -1) return s
          return { ...s, items: arrayMove(s.items, oldIndex, newIndex) }
        }

        const withoutActive = s.items.filter((it) => it.id !== active.id)
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

  useImperativeHandle(ref, () => ({
    openAdd: () => {
      if (section.type === 'cards') setCardForm({ ...EMPTY_CARD, kind: isRistoranti(section) ? 'pasto' : '' })
      else if (section.type === 'checklist') checklistInputRef.current?.focus()
      else childRef.current?.openAdd()
    }
  }))

  function saveHeader(e) {
    e.preventDefault()
    onUpdate((t) => updateSection(t, section.id, (s) => ({ ...s, title: headerForm.title })))
    setHeaderForm(null)
  }

  function saveCard(e) {
    e.preventDefault()
    const fields = cardFieldsForForm(cardForm)
    onUpdate((t) =>
      updateSection(t, section.id, (s) => {
        if (cardForm.id) {
          return { ...s, items: s.items.map((it) => (it.id === cardForm.id ? stampModified({ ...withoutKindFields(it), ...fields }, activeDisplayName) : it)) }
        }
        return { ...s, items: [...s.items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)] }
      })
    )
    setCardForm(null)
  }

  function removeCard(item) {
    if (window.confirm(`Eliminare "${item.title}"? Non si può annullare.`)) {
      onUpdate((t) => updateSection(t, section.id, (s) => ({ ...s, items: s.items.filter((it) => it.id !== item.id) })))
    }
  }

  function addChecklistItem(e) {
    e.preventDefault()
    if (!checklistText.trim()) return
    onUpdate((t) =>
      updateSection(t, section.id, (s) => ({
        ...s,
        items: [...s.items, { id: crypto.randomUUID(), text: checklistText.trim(), done: false }]
      }))
    )
    setChecklistText('')
  }

  function toggleChecklistItem(item) {
    onUpdate((t) => updateSection(t, section.id, (s) => ({ ...s, items: s.items.map((it) => (it.id === item.id ? stampModified({ ...it, done: !it.done }, activeDisplayName) : it)) })))
  }

  function removeChecklistItem(item) {
    onUpdate((t) => updateSection(t, section.id, (s) => ({ ...s, items: s.items.filter((it) => it.id !== item.id) })))
  }

  function saveNotes() {
    onUpdate((t) => updateSection(t, section.id, (s) => stampModified({ ...s, text: notesDraft }, activeDisplayName)))
  }

  return (
    <div className="flex flex-col gap-4 pt-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-3xl">{section.title}</h2>
        {!isFixedSection(section) && (
          <button onClick={() => setHeaderForm({ title: section.title })} aria-label="Rinomina sezione" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
            <EditIcon size={17} />
          </button>
        )}
      </div>

      {section.type === 'cards' && !hasDateGrouping(section) && (
        <>
          {section.items.length === 0 && (
            <Empty
              title="Nessuna scheda ancora"
              detail="Aggiungine una per iniziare."
              action={<Btn onClick={() => setCardForm({ ...EMPTY_CARD })}>Aggiungi una scheda</Btn>}
            />
          )}
          <DndContext sensors={cardSensors} collisionDetection={closestCenter} onDragEnd={handleCardDragEnd}>
            <SortableContext items={section.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {section.items.map((item) => (
                  <SortableCard
                    key={item.id}
                    item={item}
                    onEdit={() => setCardForm({ id: item.id, ...EMPTY_CARD, ...item, tags: item.tags.join(', ') })}
                    onRemove={() => removeCard(item)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {section.type === 'cards' && hasDateGrouping(section) && (
        <>
          {section.items.length === 0 ? (
            <Empty
              title="Nessuna scheda ancora"
              detail="Aggiungine una per iniziare."
              action={<Btn onClick={() => setCardForm({ ...EMPTY_CARD, kind: isRistoranti(section) ? 'pasto' : '' })}>Aggiungi una scheda</Btn>}
            />
          ) : (
            <DndContext sensors={cardSensors} collisionDetection={closestCenter} onDragEnd={handleGroupedDragEnd}>
              {dateGroupConfig(section).groups.map(({ key, label }) => {
                const groupItems = section.items.filter((it) => groupKeyFor(it) === key)
                return (
                  <div key={key} className="flex flex-col gap-3">
                    <Label>{label}</Label>
                    {groupItems.length === 0 && <p className="text-sm text-[var(--muted)]">Nessuna scheda qui.</p>}
                    <SortableContext items={groupItems.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                      <DroppableGroup groupKey={key} disabled={groupItems.length > 0}>
                        {groupItems.map((item) => (
                          <SortableCard
                            key={item.id}
                            item={item}
                            dateBadgeLabel={dateGroupConfig(section).badgeLabel}
                            onEdit={() => setCardForm({ ...EMPTY_CARD, ...item, kind: isRistoranti(section) ? 'pasto' : item.kind, tags: item.tags.join(', ') })}
                            onRemove={() => removeCard(item)}
                          />
                        ))}
                      </DroppableGroup>
                    </SortableContext>
                  </div>
                )
              })}
            </DndContext>
          )}
        </>
      )}

      {section.type === 'checklist' && (
        <>
          {section.items.length === 0 && <Empty title="Niente da spuntare ancora" detail="Aggiungi la prima voce." />}
          <ul className="flex flex-col divide-y divide-[var(--line)] bg-[var(--card)] rounded-[24px] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05)] overflow-hidden">
            {section.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-1">
                <button onClick={() => toggleChecklistItem(item)} aria-pressed={item.done} aria-label={item.done ? 'Segna come da fare' : 'Segna come fatto'} className="min-h-12 min-w-12 flex items-center justify-center">
                  <span className={`h-5 w-5 rounded border flex items-center justify-center ${item.done ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--line)]'}`}>
                    {item.done && <Check size={14} className="text-[var(--paper)]" />}
                  </span>
                </button>
                <div className="flex-1">
                  <span className={`text-base ${item.done ? 'line-through text-[var(--muted)]' : ''}`}>{item.text}</span>
                  <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
                </div>
                <button onClick={() => removeChecklistItem(item)} aria-label="Elimina voce" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <DeleteIcon size={15} />
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addChecklistItem} className="flex gap-2">
            <input ref={checklistInputRef} placeholder="Nuova voce" value={checklistText} onChange={(e) => setChecklistText(e.target.value)} className={`flex-1 ${inputClass}`} />
            <Btn type="submit" variant="secondary">
              <Plus size={17} />
            </Btn>
          </form>
        </>
      )}

      {section.type === 'notes' && (
        <>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={saveNotes}
            placeholder="Scrivi qui le tue note."
            rows={10}
            className={`${inputClass} font-sans`}
          />
          <ModifiedBy modifiedBy={section.modifiedBy} modifiedAt={section.modifiedAt} />
        </>
      )}

      {section.type === 'transport' && (
        <Transport
          ref={childRef}
          trip={trip}
          section={section}
          onUpdate={onUpdate}
          activeDisplayName={activeDisplayName}
          remoteId={syncState?.remoteId ?? null}
          role={syncState?.role ?? null}
        />
      )}

      {section.type === 'lodging' && (
        <Lodging
          ref={childRef}
          trip={trip}
          section={section}
          onUpdate={onUpdate}
          activeDisplayName={activeDisplayName}
          remoteId={syncState?.remoteId ?? null}
          role={syncState?.role ?? null}
        />
      )}

      {section.type === 'map' && (
        <Suspense fallback={<p className="text-base text-[var(--muted)]">Caricamento mappa…</p>}>
          <MapSection
            ref={childRef}
            trip={trip}
            section={section}
            onUpdate={onUpdate}
            activeDisplayName={activeDisplayName}
            onNavigate={onNavigate}
            remoteId={syncState?.remoteId ?? null}
            role={syncState?.role ?? null}
          />
        </Suspense>
      )}

      <Modal open={!!headerForm} title="Rinomina sezione" onClose={() => setHeaderForm(null)}>
        {headerForm && (
          <form onSubmit={saveHeader} className="flex flex-col gap-3">
            <input required value={headerForm.title} onChange={(e) => setHeaderForm({ title: e.target.value })} className={inputClass} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>

      <Modal open={!!cardForm} title={cardForm?.id ? 'Modifica scheda' : 'Nuova scheda'} onClose={() => setCardForm(null)}>
        {cardForm && (
          <form onSubmit={saveCard} className="flex flex-col gap-3">
            {!isRistoranti(section) && (
              <select value={cardForm.kind} onChange={(e) => setCardForm({ ...cardForm, kind: e.target.value })} className={inputClass}>
                {KIND_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            )}
            <input required placeholder="Titolo" value={cardForm.title} onChange={(e) => setCardForm({ ...cardForm, title: e.target.value })} className={inputClass} />
            <input placeholder="Info breve (es. km, orario)" value={cardForm.meta} onChange={(e) => setCardForm({ ...cardForm, meta: e.target.value })} className={inputClass} />
            <textarea placeholder="Dettaglio" value={cardForm.detail} onChange={(e) => setCardForm({ ...cardForm, detail: e.target.value })} className={inputClass} rows={2} />
            <input placeholder="Link" value={cardForm.link} onChange={(e) => setCardForm({ ...cardForm, link: e.target.value })} className={inputClass} />
            <input placeholder="Tag (separati da virgola)" value={cardForm.tags} onChange={(e) => setCardForm({ ...cardForm, tags: e.target.value })} className={inputClass} />
            {cardForm.kind === 'sentiero' && (
              <>
                <input placeholder="Distanza (es. 14,2 km)" value={cardForm.distanza} onChange={(e) => setCardForm({ ...cardForm, distanza: e.target.value })} className={inputClass} />
                <input placeholder="Durata (es. 5h14)" value={cardForm.durata} onChange={(e) => setCardForm({ ...cardForm, durata: e.target.value })} className={inputClass} />
                <input placeholder="Dislivello (es. 480 m D+)" value={cardForm.dislivello} onChange={(e) => setCardForm({ ...cardForm, dislivello: e.target.value })} className={inputClass} />
                <input placeholder="Difficoltà (es. media, EE)" value={cardForm.difficolta} onChange={(e) => setCardForm({ ...cardForm, difficolta: e.target.value })} className={inputClass} />
              </>
            )}
            {cardForm.kind === 'spiaggia' && (
              <>
                <input placeholder="Come arrivarci" value={cardForm.accesso} onChange={(e) => setCardForm({ ...cardForm, accesso: e.target.value })} className={inputClass} />
                <input placeholder="Servizi (bar, ombrelloni...)" value={cardForm.servizi} onChange={(e) => setCardForm({ ...cardForm, servizi: e.target.value })} className={inputClass} />
              </>
            )}
            {cardForm.kind === 'pasto' && (
              <label className="flex items-center gap-2 text-base">
                <input type="checkbox" checked={cardForm.prenotato} onChange={(e) => setCardForm({ ...cardForm, prenotato: e.target.checked })} />
                Prenotato
              </label>
            )}
            <input placeholder="Indirizzo" value={cardForm.address} onChange={(e) => setCardForm({ ...cardForm, address: e.target.value })} className={inputClass} />
            <input placeholder="Telefono" value={cardForm.phone} onChange={(e) => setCardForm({ ...cardForm, phone: e.target.value })} className={inputClass} />
            <CoordsInput
              value={{ lat: cardForm.lat, lng: cardForm.lng }}
              onChange={(coords) => setCardForm({ ...cardForm, ...coords })}
              onAddressFound={(address) => setCardForm((f) => (f.address ? f : { ...f, address }))}
            />
            {hasDateGrouping(section) && (
              <>
                <label className="flex flex-col gap-1">
                  <Label>{dateGroupConfig(section).dateFieldLabel}</Label>
                  <input type="date" aria-label={dateGroupConfig(section).dateFieldLabel} value={cardForm.date} onChange={(e) => setCardForm({ ...cardForm, date: e.target.value })} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <Label>{dateGroupConfig(section).timeFieldLabel}</Label>
                  <input type="time" aria-label={dateGroupConfig(section).timeFieldLabel} value={cardForm.time} onChange={(e) => setCardForm({ ...cardForm, time: e.target.value })} className={inputClass} />
                </label>
              </>
            )}
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
})

export default Section
