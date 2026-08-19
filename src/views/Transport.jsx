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
    <div className="flex flex-col gap-4">
      {sorted.length === 0 && (
        <Empty icon={Bus} title="Nessun trasporto ancora" detail="Aggiungi treni, voli, aliscafi o altri spostamenti." action={<Btn onClick={() => setForm(EMPTY_ITEM)}>Aggiungi un trasporto</Btn>} />
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
