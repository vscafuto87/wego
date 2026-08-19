import { useEffect, useState } from 'react'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

function fieldsFromTrip(trip) {
  return {
    name: trip.name,
    emoji: trip.emoji,
    place: trip.place,
    start: trip.start,
    end: trip.end,
    palette: trip.palette,
    people: trip.people.join(', ')
  }
}

export default function AdminMetaForm({ trip, onUpdate }) {
  const [form, setForm] = useState(() => fieldsFromTrip(trip))
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setForm(fieldsFromTrip(trip))
  }, [trip.id])

  function save(e) {
    e.preventDefault()
    const people = form.people.split(',').map((p) => p.trim()).filter(Boolean)
    onUpdate((t) => ({ ...t, ...form, people }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 max-w-md bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
      <h2 className="font-display font-semibold text-2xl mb-1">Info viaggio</h2>
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
      <button type="submit" className="self-start inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
        Salva
      </button>
      {saved && <p className="text-sm text-[var(--muted)]">Salvato.</p>}
    </form>
  )
}
