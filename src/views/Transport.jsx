import { forwardRef, useImperativeHandle, useState } from 'react'
import { Pencil, Trash2, Train, Plane, Ship, Car, Bus, GripVertical } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { mode: 'auto', from: '', to: '', date: '', time: '', ticketLink: '', note: '' }

export const TRANSPORT_MODES = [
  { value: 'auto', label: 'Auto', Icon: Car },
  { value: 'treno', label: 'Treno', Icon: Train },
  { value: 'aereo', label: 'Aereo', Icon: Plane },
  { value: 'bus', label: 'Bus', Icon: Bus },
  { value: 'traghetto', label: 'Traghetto', Icon: Ship }
]

function ModeIcon({ mode }) {
  const Icon = TRANSPORT_MODES.find((m) => m.value === mode)?.Icon ?? Bus
  return <Icon size={19} className="text-[var(--muted)]" />
}

// Trasporto trascinabile: la maniglia avvia il drag, il resto della scheda si
// comporta come oggi (tap su matita/cestino invariato).
function SortableTransportItem({ item, onEdit, onRemove }) {
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
        <div className="flex items-center gap-2">
          <ModeIcon mode={item.mode} />
          <p className="font-display font-semibold text-xl">{item.from} → {item.to}</p>
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
          <button onClick={onEdit} aria-label="Modifica trasporto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
            <Pencil size={15} />
          </button>
          <button onClick={onRemove} aria-label="Elimina trasporto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
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
  )
}

const Transport = forwardRef(function Transport({ trip, section, onUpdate, activeDisplayName }, ref) {
  const [form, setForm] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useImperativeHandle(ref, () => ({ openAdd: () => setForm(EMPTY_ITEM) }))

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    updateItems((items) => {
      const oldIndex = items.findIndex((it) => it.id === active.id)
      const newIndex = items.findIndex((it) => it.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return items
      return arrayMove(items, oldIndex, newIndex)
    })
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

  return (
    <div className="flex flex-col gap-4">
      {section.items.length === 0 && (
        <Empty icon={Bus} title="Nessun trasporto ancora" detail="Aggiungi treni, voli, aliscafi o altri spostamenti." action={<Btn onClick={() => setForm(EMPTY_ITEM)}>Aggiungi un trasporto</Btn>} />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={section.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {section.items.map((item) => (
              <SortableTransportItem
                key={item.id}
                item={item}
                onEdit={() => setForm({ ...item })}
                onRemove={() => removeItem(item)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Modal open={!!form} title={form?.id ? 'Modifica trasporto' : 'Nuovo trasporto'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <select required value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={inputClass}>
              {!TRANSPORT_MODES.some((m) => m.value === form.mode) && form.mode && (
                <option value={form.mode}>{form.mode}</option>
              )}
              {TRANSPORT_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
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
})

export default Transport
