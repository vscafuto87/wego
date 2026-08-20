import { useState } from 'react'
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react'
import { stampModified } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { title: '', meta: '', detail: '', link: '', tags: '' }

export default function AdminCardsEditor({ section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function reorderItems(fromId, toId) {
    if (fromId === toId) return
    updateItems((items) => {
      const next = [...items]
      const fromIdx = next.findIndex((it) => it.id === fromId)
      const toIdx = next.findIndex((it) => it.id === toId)
      if (fromIdx === -1 || toIdx === -1) return items
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...rest } = form
    const tags = rest.tags.split(',').map((x) => x.trim()).filter(Boolean)
    const fields = { ...rest, tags }
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    setForm(null)
  }

  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.title}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-3">
        {section.items.length === 0 && <p className="text-base text-[var(--muted)]">Nessuna scheda ancora.</p>}
        {section.items.map((item) => (
          <div
            key={item.id}
            className={`bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 ${dragId === item.id ? 'opacity-40' : ''} ${overId === item.id && dragId !== item.id ? 'border-t-2 border-t-[var(--accent)]' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOverId(item.id) }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId) reorderItems(dragId, item.id)
              setDragId(null)
              setOverId(null)
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-1">
                <span
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragEnd={() => { setDragId(null); setOverId(null) }}
                  aria-label="Trascina per riordinare"
                  className="p-1.5 -ml-1 -mt-0.5 text-[var(--muted)] cursor-grab"
                >
                  <GripVertical size={15} />
                </span>
                <p className="font-display font-semibold text-xl">{item.title || 'Senza titolo'}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setForm({ id: item.id, title: item.title, meta: item.meta, detail: item.detail, link: item.link, tags: item.tags.join(', ') })} aria-label="Modifica scheda" className="p-2 text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina scheda" className="p-2 text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {item.meta && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.meta}</p>}
            {item.detail && <p className="text-base mt-2">{item.detail}</p>}
            {item.tags.length > 0 && <p className="text-sm text-[var(--muted)] mt-2">{item.tags.join(' · ')}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!form && (
          <button onClick={() => setForm(EMPTY_FORM)} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={16} /> Nuova scheda
          </button>
        )}
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{form.id ? 'Modifica scheda' : 'Nuova scheda'}</h2>
            <input required placeholder="Titolo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
            <input placeholder="Info breve (es. km, orario)" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} className={inputClass} />
            <textarea placeholder="Dettaglio" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} className={inputClass} rows={2} />
            <input placeholder="Link" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className={inputClass} />
            <input placeholder="Tag (separati da virgola)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className={inputClass} />
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
