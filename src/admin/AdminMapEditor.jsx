import { useState } from 'react'
import { Plus } from 'lucide-react'
import EditIcon from '../components/EditIcon.jsx'
import DeleteIcon from '../components/DeleteIcon.jsx'
import { stampModified } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { name: '', category: '', mapsLink: '', lat: '', lng: '', note: '' }

export default function AdminMapEditor({ section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...raw } = form
    const toCoord = (value) => {
      if (value === '') return null
      const n = Number(value)
      return Number.isFinite(n) ? n : null
    }
    const fields = { ...raw, lat: toCoord(raw.lat), lng: toCoord(raw.lng) }
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-3">
        {section.items.length === 0 && <p className="text-base text-[var(--muted)]">Nessun punto ancora.</p>}
        {section.items.map((item) => (
          <div key={item.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display font-semibold text-xl">{item.name || 'Senza nome'}</p>
                {item.category && <p className="text-sm text-[var(--muted)]">{item.category}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setForm({ ...item, lat: item.lat ?? '', lng: item.lng ?? '' })} aria-label="Modifica punto" className="p-2 text-[var(--muted)]">
                  <EditIcon size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina punto" className="p-2 text-[var(--muted)]">
                  <DeleteIcon size={15} />
                </button>
              </div>
            </div>
            {(item.lat !== null && item.lng !== null) && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.lat}, {item.lng}</p>}
            {item.note && <p className="text-base mt-2">{item.note}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!form && (
          <button onClick={() => setForm(EMPTY_FORM)} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={16} /> Nuovo punto
          </button>
        )}
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{form.id ? 'Modifica punto' : 'Nuovo punto'}</h2>
            <input required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <input placeholder="Categoria (spiaggia, ristorante, punto panoramico...)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} />
            <input placeholder="Link Google/Apple Maps" value={form.mapsLink} onChange={(e) => setForm({ ...form, mapsLink: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="number" step="any" placeholder="Latitudine" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} className={`flex-1 min-w-0 ${inputClass}`} />
              <input type="number" step="any" placeholder="Longitudine" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} className={`flex-1 min-w-0 ${inputClass}`} />
            </div>
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
