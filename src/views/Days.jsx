import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Label from '../components/Label.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-md px-3 py-2 text-sm'
const DATE_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })

function formatDate(date) {
  return date ? DATE_FMT.format(new Date(date)) : ''
}

const EMPTY_DAY = { date: '', title: '', note: '' }
const EMPTY_ITEM = { time: '', title: '', detail: '', link: '' }

export default function Days({ trip, onUpdate }) {
  const [dayForm, setDayForm] = useState(null)
  const [itemForm, setItemForm] = useState(null)

  function saveDay(e) {
    e.preventDefault()
    onUpdate((t) => {
      if (dayForm.id) {
        return { ...t, days: t.days.map((d) => (d.id === dayForm.id ? { ...d, ...dayForm } : d)) }
      }
      const day = { id: crypto.randomUUID(), items: [], ...dayForm }
      return { ...t, days: [...t.days, day].sort((a, b) => a.date.localeCompare(b.date)) }
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
    const { dayId, id, ...fields } = itemForm
    onUpdate((t) => ({
      ...t,
      days: t.days.map((d) => {
        if (d.id !== dayId) return d
        if (id) return { ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...fields } : it)) }
        return { ...d, items: [...d.items, { id: crypto.randomUUID(), ...fields }] }
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
    <div className="flex flex-col gap-6 pt-5">
      {trip.days.length === 0 && (
        <Empty
          title="Nessun giorno ancora"
          detail="Aggiungi il primo giorno dell'itinerario."
          action={<Btn onClick={() => setDayForm(EMPTY_DAY)}>Aggiungi un giorno</Btn>}
        />
      )}

      {trip.days.map((day) => (
        <div key={day.id} className="flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div>
              <Label>{formatDate(day.date)}</Label>
              <p className="font-display text-xl">{day.title || 'Senza titolo'}</p>
              {day.note && <p className="text-sm text-[var(--muted)] mt-1">{day.note}</p>}
            </div>
            <div className="flex gap-1 -mr-2">
              <button onClick={() => setDayForm({ id: day.id, date: day.date, title: day.title, note: day.note })} aria-label="Modifica giorno" className="min-h-11 min-w-11 flex items-center justify-center text-[var(--muted)]">
                <Pencil size={16} />
              </button>
              <button onClick={() => removeDay(day)} aria-label="Elimina giorno" className="min-h-11 min-w-11 flex items-center justify-center text-[var(--muted)]">
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {day.items.length > 0 && (
            <ul className="flex flex-col gap-2 border-l-2 border-[var(--line)] pl-4">
              {day.items.map((item) => (
                <li key={item.id} className="flex items-start gap-1">
                  <div className="flex-1">
                    {item.time && <span className="font-mono text-xs text-[var(--muted)] mr-2">{item.time}</span>}
                    <span className="text-sm">{item.title}</span>
                    {item.detail && <p className="text-xs text-[var(--muted)] mt-0.5">{item.detail}</p>}
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)] underline block mt-0.5">
                        Apri il link
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => setItemForm({ dayId: day.id, id: item.id, time: item.time, title: item.title, detail: item.detail, link: item.link })}
                    aria-label="Modifica voce"
                    className="min-h-11 min-w-11 flex items-center justify-center text-[var(--muted)]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => removeItem(day.id, item)} aria-label="Elimina voce" className="min-h-11 min-w-11 flex items-center justify-center text-[var(--muted)]">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button onClick={() => setItemForm({ dayId: day.id, ...EMPTY_ITEM })} className="self-start flex items-center gap-1 text-sm text-[var(--accent)] min-h-11">
            <Plus size={16} /> Aggiungi voce
          </button>
        </div>
      ))}

      {trip.days.length > 0 && (
        <Btn variant="secondary" onClick={() => setDayForm(EMPTY_DAY)} className="self-start">
          <Plus size={16} /> Nuovo giorno
        </Btn>
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
            <input type="time" value={itemForm.time} onChange={(e) => setItemForm({ ...itemForm, time: e.target.value })} className={inputClass} />
            <input required placeholder="Titolo" value={itemForm.title} onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })} className={inputClass} />
            <textarea placeholder="Dettaglio" value={itemForm.detail} onChange={(e) => setItemForm({ ...itemForm, detail: e.target.value })} className={inputClass} rows={2} />
            <input placeholder="Link" value={itemForm.link} onChange={(e) => setItemForm({ ...itemForm, link: e.target.value })} className={inputClass} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
}
