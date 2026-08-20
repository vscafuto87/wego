import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { stampModified } from '../data/schema.js'
import { TRANSPORT_MODES } from '../views/Transport.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { mode: 'auto', from: '', to: '', date: '', time: '', ticketLink: '', note: '' }

function sortKey(item) {
  return `${item.date}T${item.time || '00:00'}`
}

export default function AdminTransportEditor({ section, onUpdate, activeDisplayName }) {
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
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-3">
        {sorted.length === 0 && <p className="text-base text-[var(--muted)]">Nessun trasporto ancora.</p>}
        {sorted.map((item) => (
          <div key={item.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display font-semibold text-xl">{item.mode} · {item.from} → {item.to}</p>
              <div className="flex gap-1">
                <button onClick={() => setForm({ ...item })} aria-label="Modifica trasporto" className="p-2 text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina trasporto" className="p-2 text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(item.date || item.time) && <p className="font-mono text-sm text-[var(--muted)] mt-1">{[item.date, item.time].filter(Boolean).join(' · ')}</p>}
            {item.note && <p className="text-base mt-2">{item.note}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!form && (
          <button onClick={() => setForm(EMPTY_FORM)} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={16} /> Nuovo trasporto
          </button>
        )}
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{form.id ? 'Modifica trasporto' : 'Nuovo trasporto'}</h2>
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
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`flex-1 min-w-0 ${inputClass}`} />
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`flex-1 min-w-0 ${inputClass}`} />
            </div>
            <input placeholder="Link biglietto" value={form.ticketLink} onChange={(e) => setForm({ ...form, ticketLink: e.target.value })} className={inputClass} />
            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <div className="flex gap-2">
              <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">Salva</button>
              <button type="button" onClick={() => setForm(null)} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Annulla</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
