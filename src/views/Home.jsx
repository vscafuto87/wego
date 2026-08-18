import { useState } from 'react'
import { Plus, Upload, Trash2 } from 'lucide-react'
import { TerrainSeal } from '../theme/Terrain.jsx'
import { themeStyle } from '../theme/themes.js'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'

const MONTH = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

function formatRange(start, end) {
  if (!start || !end) return ''
  const s = new Date(start)
  const e = new Date(end)
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()}–${MONTH.format(e)} ${e.getFullYear()}`
    : `${MONTH.format(s)} – ${MONTH.format(e)} ${e.getFullYear()}`
}

function tripStatus(trip) {
  if (!trip.start || !trip.end) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(trip.start)
  const end = new Date(trip.end)
  if (today < start) {
    const days = Math.round((start - today) / 86400000)
    return days === 1 ? 'tra 1 giorno' : `tra ${days} giorni`
  }
  if (today <= end) return 'in corso'
  return 'concluso'
}

const EMPTY_FORM = { name: '', emoji: '', place: '', start: '', end: '', palette: 'mountain', people: '' }

export default function Home({ trips, onOpen, onCreate, onImport, onDelete }) {
  const [form, setForm] = useState(null)

  function submit(e) {
    e.preventDefault()
    onCreate({ ...form, people: form.people.split(',').map((p) => p.trim()).filter(Boolean) })
    setForm(null)
  }

  function remove(trip) {
    if (window.confirm(`Eliminare "${trip.name}"? Non si può annullare.`)) {
      onDelete(trip.id)
    }
  }

  return (
    <div style={themeStyle('mountain')} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans pb-24">
      <header className="px-5 pt-8 pb-4 flex items-center justify-between max-w-2xl mx-auto">
        <h1 className="font-display font-semibold text-4xl tracking-wide">WeGo</h1>
        <button onClick={onImport} aria-label="Carica il viaggio" className="h-12 w-12 flex items-center justify-center rounded-full bg-[var(--tint)] active:scale-[0.97] transition-transform duration-150 ease-out">
          <Upload size={21} />
        </button>
      </header>

      <main className="px-5 max-w-2xl mx-auto flex flex-col gap-5">
        {trips.length === 0 && (
          <Empty
            title="Nessun viaggio ancora"
            detail="Aggiungilo a mano oppure incolla degli appunti grezzi e lascia che Claude prepari il JSON da caricare."
            action={<Btn onClick={() => setForm(EMPTY_FORM)}>Aggiungi un viaggio</Btn>}
          />
        )}

        {trips.map((trip) => {
          const status = tripStatus(trip)
          return (
            <div
              key={trip.id}
              style={themeStyle(trip.palette)}
              className="relative rounded-[36px] bg-[var(--card)] border border-[var(--line)] text-[var(--ink)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="h-[58px] w-[58px] rounded-full bg-[var(--tint)] flex items-center justify-center">
                    <TerrainSeal seed={trip.id} palette={trip.palette} size={58} />
                  </div>
                  <button
                    onClick={() => remove(trip)}
                    aria-label={`Elimina ${trip.name}`}
                    className="h-11 w-11 flex items-center justify-center rounded-full text-[var(--muted)] active:scale-[0.94] transition-transform duration-150 ease-out"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <button onClick={() => onOpen(trip.id)} className="block w-full text-left mt-4">
                  <span className="font-display font-semibold text-4xl leading-none block">{trip.name}</span>
                  {trip.place && <p className="text-base text-[var(--muted)] mt-1.5">{trip.place}</p>}
                  <div className="flex items-baseline justify-between mt-4">
                    <span className="font-mono text-sm text-[var(--muted)]">{formatRange(trip.start, trip.end)}</span>
                    {status && (
                      <span className="font-mono text-xs text-[var(--accent)] flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                        {status}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            </div>
          )
        })}

        {trips.length > 0 && (
          <Btn variant="secondary" onClick={() => setForm(EMPTY_FORM)} className="self-start">
            <Plus size={17} /> Nuovo viaggio
          </Btn>
        )}
      </main>

      <Modal open={!!form} title="Nuovo viaggio" onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input required placeholder="Nome del viaggio" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <input placeholder="Emoji" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className={inputClass} />
            <input placeholder="Luogo" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <select value={form.palette} onChange={(e) => setForm({ ...form, palette: e.target.value })} className={inputClass}>
              <option value="mountain">Montagna</option>
              <option value="sea">Mare</option>
              <option value="city">Città</option>
              <option value="wild">Natura</option>
            </select>
            <input placeholder="Persone (separate da virgola)" value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} className={inputClass} />
            <Btn type="submit">Crea il viaggio</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
}
