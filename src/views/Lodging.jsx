import { useState } from 'react'
import { Plus, Pencil, Trash2, Bed } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { name: '', checkIn: '', checkOut: '', address: '', bookingLink: '', note: '' }

export default function Lodging({ trip, section, onUpdate, activeDisplayName }) {
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
    if (window.confirm(`Eliminare "${item.name}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  const sorted = [...section.items].sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''))

  return (
    <div className="flex flex-col gap-4 pt-5">
      {sorted.length === 0 && (
        <Empty icon={Bed} title="Nessun alloggio ancora" detail="Aggiungi hotel o appartamenti prenotati." action={<Btn onClick={() => setForm(EMPTY_ITEM)}>Aggiungi un alloggio</Btn>} />
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((item) => (
          <div key={item.id} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display font-semibold text-xl">{item.name || 'Senza nome'}</p>
              <div className="flex gap-1 -mr-2 -mt-1">
                <button onClick={() => setForm({ ...item })} aria-label="Modifica alloggio" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina alloggio" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(item.checkIn || item.checkOut) && (
              <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.checkIn || '?'} → {item.checkOut || '?'}</p>
            )}
            {item.address && <p className="text-base mt-2">{item.address}</p>}
            {item.note && <p className="text-sm text-[var(--muted)] mt-1">{item.note}</p>}
            {item.bookingLink && (
              <a href={item.bookingLink} target="_blank" rel="noreferrer" className="text-base text-[var(--accent)] underline mt-2 inline-block">
                Apri la prenotazione
              </a>
            )}
            <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
          </div>
        ))}
      </div>

      {sorted.length > 0 && (
        <Btn variant="secondary" onClick={() => setForm(EMPTY_ITEM)} className="self-start">
          <Plus size={17} /> Nuovo alloggio
        </Btn>
      )}

      <Modal open={!!form} title={form?.id ? 'Modifica alloggio' : 'Nuovo alloggio'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <input required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="date" placeholder="Check-in" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="date" placeholder="Check-out" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <input placeholder="Indirizzo" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
            <input placeholder="Link prenotazione" value={form.bookingLink} onChange={(e) => setForm({ ...form, bookingLink: e.target.value })} className={inputClass} />
            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
}
