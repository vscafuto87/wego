import { useState } from 'react'
import { Plus } from 'lucide-react'
import { themeStyle } from '../theme/themes.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { name: '', emoji: '', place: '', start: '', end: '', palette: 'mountain', people: '' }

function formatRange(start, end) {
  if (!start || !end) return ''
  return `${start} → ${end}`
}

export default function AdminTripList({ trips, onSelect, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM)

  function submit(e) {
    e.preventDefault()
    onCreate({ ...form, people: form.people.split(',').map((p) => p.trim()).filter(Boolean) })
    setForm(EMPTY_FORM)
  }

  return (
    <div style={themeStyle('mountain')} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans max-w-5xl mx-auto px-6 py-10">
      <h1 className="font-display font-semibold text-4xl mb-6">Dashboard admin</h1>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="flex flex-col divide-y divide-[var(--line)] bg-[var(--card)] rounded-2xl border border-[var(--line)] overflow-hidden">
          {trips.length === 0 && <p className="px-5 py-6 text-base text-[var(--muted)]">Nessun viaggio ancora: creane uno dal pannello a destra.</p>}
          {trips.map((trip) => (
            <button key={trip.id} onClick={() => onSelect(trip.id)} className="text-left px-5 py-4 hover:bg-[var(--tint)] transition-colors">
              <span className="font-display font-semibold text-xl">{trip.emoji} {trip.name}</span>
              {trip.place && <span className="text-base text-[var(--muted)] ml-2">{trip.place}</span>}
              <p className="font-mono text-sm text-[var(--muted)] mt-1">{formatRange(trip.start, trip.end) || 'Date da definire'}</p>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
          <h2 className="font-display font-semibold text-xl mb-1">Nuovo viaggio</h2>
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
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={17} /> Crea il viaggio
          </button>
        </form>
      </div>
    </div>
  )
}
