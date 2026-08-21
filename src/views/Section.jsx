import { forwardRef, lazy, Suspense, useImperativeHandle, useRef, useState } from 'react'
import { Plus, Check, GripVertical } from 'lucide-react'
import EditIcon from '../components/EditIcon.jsx'
import DeleteIcon from '../components/DeleteIcon.jsx'
import Btn from '../components/Btn.jsx'
import Label from '../components/Label.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified, dayItemFieldsForKind } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
import CoordsInput from '../components/CoordsInput.jsx'
import Transport from './Transport.jsx'
import Lodging from './Lodging.jsx'
import { KIND_ICONS, sentieroStats } from './Days.jsx'
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const MapSection = lazy(() => import('./MapSection.jsx'))

function isFixedSection(section) {
  if (section.type === 'transport' || section.type === 'lodging' || section.type === 'map') return true
  return section.type === 'cards' && section.title === 'Ristoranti'
}

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_CARD = { title: '', meta: '', kind: '', detail: '', link: '', tags: '', lat: null, lng: null, distanza: '', durata: '', dislivello: '', difficolta: '', accesso: '', servizi: '', luogo: '', prenotato: false }

const KIND_OPTIONS = [
  { value: '', label: 'Generica' },
  { value: 'sentiero', label: 'Sentiero' },
  { value: 'spiaggia', label: 'Spiaggia' },
  { value: 'pasto', label: 'Pasto' }
]

const ALL_KIND_FIELDS = ['distanza', 'durata', 'dislivello', 'difficolta', 'accesso', 'servizi', 'luogo', 'prenotato']

function withoutKindFields(item) {
  const clean = { ...item }
  for (const field of ALL_KIND_FIELDS) delete clean[field]
  return clean
}

function cardFieldsForForm(cardForm) {
  const tags = cardForm.tags.split(',').map((x) => x.trim()).filter(Boolean)
  const common = { title: cardForm.title, meta: cardForm.meta, kind: cardForm.kind, detail: cardForm.detail, link: cardForm.link, tags, lat: cardForm.lat, lng: cardForm.lng }
  for (const field of dayItemFieldsForKind(cardForm.kind)) {
    if (field === 'lat' || field === 'lng') continue
    common[field] = cardForm[field]
  }
  return common
}

function updateSection(trip, sectionId, fn) {
  return { ...trip, sections: trip.sections.map((s) => (s.id === sectionId ? fn(s) : s)) }
}

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
  const KindIcon = KIND_ICONS[item.kind]
  const stats = sentieroStats(item)
  return (
    <div ref={setNodeRef} style={style} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {item.kind && KindIcon && <KindIcon size={16} className="flex-shrink-0 text-[var(--accent)]" />}
          <p className="font-display font-semibold text-xl">{item.title || 'Senza titolo'}</p>
        </div>
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
            <EditIcon size={15} />
          </button>
          <button onClick={onRemove} aria-label="Elimina scheda" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
            <DeleteIcon size={15} />
          </button>
        </div>
      </div>
      {item.meta && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.meta}</p>}
      {item.kind !== 'sentiero' && item.detail && <p className="text-base mt-2">{item.detail}</p>}
      {item.kind === 'pasto' && item.luogo && <p className="text-base mt-2">{item.luogo}</p>}
      {item.kind === 'spiaggia' && (item.accesso || item.servizi) && (
        <p className="text-base mt-2">{[item.accesso, item.servizi].filter(Boolean).join(' · ')}</p>
      )}
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-4 mt-2">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[var(--muted)]">
              <s.icon size={14} />
              <span className="font-mono text-sm font-medium text-[var(--ink)] whitespace-nowrap">{s.value}</span>
            </div>
          ))}
        </div>
      )}
      {item.kind === 'pasto' && item.prenotato && (
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--accent2)] text-[var(--paper)] text-xs font-medium mt-3">
          <Check size={12} /> Prenotato
        </span>
      )}
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

  useImperativeHandle(ref, () => ({
    openAdd: () => {
      if (section.type === 'cards') setCardForm({ ...EMPTY_CARD })
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

      {section.type === 'cards' && (
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
          <MapSection ref={childRef} trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={activeDisplayName} onNavigate={onNavigate} />
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
            <select value={cardForm.kind} onChange={(e) => setCardForm({ ...cardForm, kind: e.target.value })} className={inputClass}>
              {KIND_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
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
              <>
                <input placeholder="Nome del locale" value={cardForm.luogo} onChange={(e) => setCardForm({ ...cardForm, luogo: e.target.value })} className={inputClass} />
                <label className="flex items-center gap-2 text-base">
                  <input type="checkbox" checked={cardForm.prenotato} onChange={(e) => setCardForm({ ...cardForm, prenotato: e.target.checked })} />
                  Prenotato
                </label>
              </>
            )}
            <CoordsInput value={{ lat: cardForm.lat, lng: cardForm.lng }} onChange={(coords) => setCardForm({ ...cardForm, ...coords })} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
})

export default Section
