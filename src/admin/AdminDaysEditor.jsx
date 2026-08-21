import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Mountain, Waves, Utensils, GripVertical, Bus, ExternalLink, ArrowRight } from 'lucide-react'
import { stampModified, dayItemFieldsForKind, collectExternalDayItems } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const DATE_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })

function formatDate(date) {
  return date ? DATE_FMT.format(new Date(date)) : ''
}

const EMPTY_DAY = { date: '', title: '', note: '' }
const EMPTY_ITEM = { kind: '', time: '', title: '', detail: '', link: '', distanza: '', durata: '', dislivello: '', difficolta: '', accesso: '', servizi: '', luogo: '', prenotato: false }

const KIND_OPTIONS = [
  { value: '', label: 'Generica' },
  { value: 'sentiero', label: 'Sentiero' },
  { value: 'spiaggia', label: 'Spiaggia' },
  { value: 'pasto', label: 'Pasto' }
]

const KIND_ICONS = { sentiero: Mountain, spiaggia: Waves, pasto: Utensils }

function KindIcon({ kind }) {
  const Icon = KIND_ICONS[kind]
  if (!Icon) return null
  return <Icon size={15} className="inline mr-1.5 -mt-0.5 text-[var(--muted)]" />
}

const ALL_KIND_FIELDS = ['distanza', 'durata', 'dislivello', 'difficolta', 'accesso', 'servizi', 'luogo', 'prenotato']

function withoutKindFields(item) {
  const clean = { ...item }
  for (const field of ALL_KIND_FIELDS) delete clean[field]
  return clean
}

function fieldsForForm(itemForm) {
  const common = { time: itemForm.time, title: itemForm.title, kind: itemForm.kind, detail: itemForm.detail, link: itemForm.link }
  for (const field of dayItemFieldsForKind(itemForm.kind)) common[field] = itemForm[field]
  return common
}

export default function AdminDaysEditor({ trip, onUpdate, activeDisplayName, onNavigate }) {
  const [dayForm, setDayForm] = useState(null)
  const [itemForm, setItemForm] = useState(null)
  const [dragItem, setDragItem] = useState(null)
  const [overItem, setOverItem] = useState(null)
  const [dragTransport, setDragTransport] = useState(null)
  const [overTransport, setOverTransport] = useState(null)

  // Voci Trasporti con una data, raggruppate per giorno: sola lettura qui (si
  // modificano solo dalla sezione Trasporti, vedi collectExternalDayItems),
  // ma l'ordine si trascina come le voci del giorno.
  const transportByDate = useMemo(() => {
    const map = new Map()
    for (const item of collectExternalDayItems(trip)) {
      const list = map.get(item.date) ?? []
      list.push(item)
      map.set(item.date, list)
    }
    return map
  }, [trip])

  function reorderItems(dayId, fromId, toId) {
    if (fromId === toId) return
    onUpdate((t) => ({
      ...t,
      days: t.days.map((d) => {
        if (d.id !== dayId) return d
        const items = [...d.items]
        const fromIdx = items.findIndex((it) => it.id === fromId)
        const toIdx = items.findIndex((it) => it.id === toId)
        if (fromIdx === -1 || toIdx === -1) return d
        const [moved] = items.splice(fromIdx, 1)
        items.splice(toIdx, 0, moved)
        return { ...d, items }
      })
    }))
  }

  // Riordina i trasporti di un giorno: si sposta solo tra le voci di quella
  // data, preservando la posizione relativa dei trasporti degli altri giorni
  // nell'array della sezione Trasporti (unica fonte di verità dell'ordine).
  function reorderTransport(date, fromId, toId) {
    if (fromId === toId) return
    onUpdate((t) => ({
      ...t,
      sections: t.sections.map((s) => {
        if (s.type !== 'transport') return s
        const indices = []
        s.items.forEach((it, i) => { if (it.date === date) indices.push(i) })
        const subset = indices.map((i) => s.items[i])
        const fromIdx = subset.findIndex((it) => it.id === fromId)
        const toIdx = subset.findIndex((it) => it.id === toId)
        if (fromIdx === -1 || toIdx === -1) return s
        const [moved] = subset.splice(fromIdx, 1)
        subset.splice(toIdx, 0, moved)
        const items = [...s.items]
        indices.forEach((i, pos) => { items[i] = subset[pos] })
        return { ...s, items }
      })
    }))
  }

  function saveDay(e) {
    e.preventDefault()
    onUpdate((t) => {
      if (dayForm.id) {
        return { ...t, days: t.days.map((d) => (d.id === dayForm.id ? stampModified({ ...d, ...dayForm }, activeDisplayName) : d)) }
      }
      const day = stampModified({ id: crypto.randomUUID(), items: [], ...dayForm }, activeDisplayName)
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
    const { dayId, id } = itemForm
    const fields = fieldsForForm(itemForm)
    onUpdate((t) => ({
      ...t,
      days: t.days.map((d) => {
        if (d.id !== dayId) return d
        if (id) return { ...d, items: d.items.map((it) => (it.id === id ? stampModified({ ...withoutKindFields(it), ...fields }, activeDisplayName) : it)) }
        return { ...d, items: [...d.items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)] }
      })
    }))
    setItemForm(null)
  }

  function removeItem(dayId, item) {
    if (window.confirm(`Eliminare "${item.title}"? Non si può annullare.`)) {
      onUpdate((t) => ({ ...t, days: t.days.map((d) => (d.id === dayId ? { ...d, items: d.items.filter((it) => it.id !== item.id) } : d)) }))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-6">
        {trip.days.length === 0 && <p className="text-base text-[var(--muted)]">Nessun giorno ancora: aggiungine uno dal pannello a destra.</p>}
        {trip.days.map((day) => (
          <div key={day.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">{formatDate(day.date)}</p>
                <p className="font-display font-semibold text-2xl">{day.title || 'Senza titolo'}</p>
                {day.note && <p className="text-base text-[var(--muted)] mt-1">{day.note}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setDayForm({ id: day.id, date: day.date, title: day.title, note: day.note })} aria-label="Modifica giorno" className="p-2 text-[var(--muted)]">
                  <Pencil size={16} />
                </button>
                <button onClick={() => removeDay(day)} aria-label="Elimina giorno" className="p-2 text-[var(--muted)]">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {day.items.length > 0 && (
              <ul className="flex flex-col gap-2 mt-3 border-l-2 border-[var(--line)] pl-4">
                {day.items.map((item) => (
                  <li
                    key={item.id}
                    className={`flex items-start gap-1 ${dragItem?.id === item.id ? 'opacity-40' : ''} ${overItem?.id === item.id && dragItem?.id !== item.id ? 'border-t-2 border-[var(--accent)]' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setOverItem({ dayId: day.id, id: item.id }) }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragItem && dragItem.dayId === day.id) reorderItems(day.id, dragItem.id, item.id)
                      setDragItem(null)
                      setOverItem(null)
                    }}
                  >
                    <span
                      draggable
                      onDragStart={() => setDragItem({ dayId: day.id, id: item.id })}
                      onDragEnd={() => { setDragItem(null); setOverItem(null) }}
                      aria-label="Trascina per riordinare"
                      className="p-1.5 -ml-1 text-[var(--muted)] cursor-grab"
                    >
                      <GripVertical size={14} />
                    </span>
                    <div className="flex-1">
                      {item.time && <span className="font-mono text-sm text-[var(--muted)] mr-2">{item.time}</span>}
                      <KindIcon kind={item.kind} />
                      <span className="text-base">{item.title}</span>
                      {item.detail && <p className="text-sm text-[var(--muted)] mt-0.5">{item.detail}</p>}
                    </div>
                    <button onClick={() => setItemForm({ dayId: day.id, id: item.id, ...EMPTY_ITEM, ...item })} aria-label="Modifica voce" className="p-1.5 text-[var(--muted)]">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => removeItem(day.id, item)} aria-label="Elimina voce" className="p-1.5 text-[var(--muted)]">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {(transportByDate.get(day.date) ?? []).length > 0 && (
              <ul className="flex flex-col gap-2 mt-3 border-l-2 border-[var(--accent)]/40 pl-4">
                {(transportByDate.get(day.date) ?? []).map((item) => (
                  <li
                    key={item.id}
                    className={`flex items-start gap-1 ${dragTransport?.id === item.id ? 'opacity-40' : ''} ${overTransport?.id === item.id && dragTransport?.id !== item.id ? 'border-t-2 border-[var(--accent)]' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setOverTransport({ date: day.date, id: item.id }) }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragTransport && dragTransport.date === day.date) reorderTransport(day.date, dragTransport.id, item.id)
                      setDragTransport(null)
                      setOverTransport(null)
                    }}
                  >
                    <span
                      draggable
                      onDragStart={() => setDragTransport({ date: day.date, id: item.id })}
                      onDragEnd={() => { setDragTransport(null); setOverTransport(null) }}
                      aria-label="Trascina per riordinare"
                      className="p-1.5 -ml-1 text-[var(--muted)] cursor-grab"
                    >
                      <GripVertical size={14} />
                    </span>
                    <div className="flex-1">
                      {item.time && <span className="font-mono text-sm text-[var(--muted)] mr-2">{item.time}</span>}
                      <Bus size={15} className="inline mr-1.5 -mt-0.5 text-[var(--muted)]" />
                      <span className="text-base">{item.title}</span>
                      {item.note && <p className="text-sm text-[var(--muted)] mt-0.5">{item.note}</p>}
                    </div>
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noreferrer" aria-label="Apri il biglietto" className="p-1.5 text-[var(--muted)]">
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {onNavigate && (
                      <button onClick={() => onNavigate(item.origin.tab)} aria-label="Vai a Trasporti" className="p-1.5 text-[var(--muted)]">
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <button onClick={() => setItemForm({ dayId: day.id, ...EMPTY_ITEM })} className="mt-3 flex items-center gap-1 text-base text-[var(--accent)]">
              <Plus size={16} /> Aggiungi voce
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!dayForm && !itemForm && (
          <>
            <h2 className="font-display font-semibold text-xl">Nuovo giorno</h2>
            <button onClick={() => setDayForm(EMPTY_DAY)} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
              <Plus size={16} /> Aggiungi giorno
            </button>
          </>
        )}

        {dayForm && (
          <form onSubmit={saveDay} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{dayForm.id ? 'Modifica giorno' : 'Nuovo giorno'}</h2>
            <input required type="date" value={dayForm.date} onChange={(e) => setDayForm({ ...dayForm, date: e.target.value })} className={inputClass} />
            <input placeholder="Titolo del giorno" value={dayForm.title} onChange={(e) => setDayForm({ ...dayForm, title: e.target.value })} className={inputClass} />
            <textarea placeholder="Nota" value={dayForm.note} onChange={(e) => setDayForm({ ...dayForm, note: e.target.value })} className={inputClass} rows={2} />
            <div className="flex gap-2">
              <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">Salva</button>
              <button type="button" onClick={() => setDayForm(null)} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Annulla</button>
            </div>
          </form>
        )}

        {itemForm && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{itemForm.id ? 'Modifica voce' : 'Nuova voce'}</h2>
            <select value={itemForm.kind} onChange={(e) => setItemForm({ ...itemForm, kind: e.target.value })} className={inputClass}>
              {KIND_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <input type="time" value={itemForm.time} onChange={(e) => setItemForm({ ...itemForm, time: e.target.value })} className={inputClass} />
            <input required placeholder="Titolo" value={itemForm.title} onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })} className={inputClass} />
            <textarea placeholder="Dettaglio" value={itemForm.detail} onChange={(e) => setItemForm({ ...itemForm, detail: e.target.value })} className={inputClass} rows={2} />
            <input placeholder="Link" value={itemForm.link} onChange={(e) => setItemForm({ ...itemForm, link: e.target.value })} className={inputClass} />
            {itemForm.kind === 'sentiero' && (
              <>
                <input placeholder="Distanza (es. 14,2 km)" value={itemForm.distanza} onChange={(e) => setItemForm({ ...itemForm, distanza: e.target.value })} className={inputClass} />
                <input placeholder="Durata (es. 5h14)" value={itemForm.durata} onChange={(e) => setItemForm({ ...itemForm, durata: e.target.value })} className={inputClass} />
                <input placeholder="Dislivello (es. 480 m D+)" value={itemForm.dislivello} onChange={(e) => setItemForm({ ...itemForm, dislivello: e.target.value })} className={inputClass} />
                <input placeholder="Difficoltà (es. media, EE)" value={itemForm.difficolta} onChange={(e) => setItemForm({ ...itemForm, difficolta: e.target.value })} className={inputClass} />
              </>
            )}
            {itemForm.kind === 'spiaggia' && (
              <>
                <input placeholder="Come arrivarci" value={itemForm.accesso} onChange={(e) => setItemForm({ ...itemForm, accesso: e.target.value })} className={inputClass} />
                <input placeholder="Servizi (bar, ombrelloni...)" value={itemForm.servizi} onChange={(e) => setItemForm({ ...itemForm, servizi: e.target.value })} className={inputClass} />
              </>
            )}
            {itemForm.kind === 'pasto' && (
              <>
                <input placeholder="Nome del locale" value={itemForm.luogo} onChange={(e) => setItemForm({ ...itemForm, luogo: e.target.value })} className={inputClass} />
                <label className="flex items-center gap-2 text-base">
                  <input type="checkbox" checked={itemForm.prenotato} onChange={(e) => setItemForm({ ...itemForm, prenotato: e.target.checked })} />
                  Prenotato
                </label>
              </>
            )}
            <div className="flex gap-2">
              <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">Salva</button>
              <button type="button" onClick={() => setItemForm(null)} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Annulla</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
