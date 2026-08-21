import { useState } from 'react'
import { Plus, GripVertical, Mountain, Waves, Utensils } from 'lucide-react'
import EditIcon from '../components/EditIcon.jsx'
import DeleteIcon from '../components/DeleteIcon.jsx'
import CoordsInput from '../components/CoordsInput.jsx'
import { stampModified, dayItemFieldsForKind } from '../data/schema.js'
import { sentieroStats } from '../views/Days.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { title: '', meta: '', kind: '', detail: '', link: '', tags: '', lat: null, lng: null, distanza: '', durata: '', dislivello: '', difficolta: '', accesso: '', servizi: '', luogo: '', prenotato: false, date: '', time: '' }
const isRistoranti = (section) => section.type === 'cards' && section.title === 'Ristoranti'

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

function fieldsForForm(form) {
  const tags = form.tags.split(',').map((x) => x.trim()).filter(Boolean)
  const common = { title: form.title, meta: form.meta, kind: form.kind, detail: form.detail, link: form.link, tags, lat: form.lat, lng: form.lng, date: form.date, time: form.time }
  for (const field of dayItemFieldsForKind(form.kind)) {
    if (field === 'lat' || field === 'lng') continue
    common[field] = form[field]
  }
  return common
}

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
    const { id } = form
    const fields = fieldsForForm(form)
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...withoutKindFields(it), ...fields }, activeDisplayName) : it))
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
                <p className="font-display font-semibold text-xl"><KindIcon kind={item.kind} />{item.title || 'Senza titolo'}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setForm({ id: item.id, ...EMPTY_FORM, ...item, kind: isRistoranti(section) ? 'pasto' : item.kind, tags: item.tags.join(', ') })} aria-label="Modifica scheda" className="p-2 text-[var(--muted)]">
                  <EditIcon size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina scheda" className="p-2 text-[var(--muted)]">
                  <DeleteIcon size={15} />
                </button>
              </div>
            </div>
            {item.meta && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.meta}</p>}
            {isRistoranti(section) && item.date && <p className="text-sm text-[var(--accent)] mt-1">Prenotato · {item.date}{item.time ? ` · ${item.time}` : ''}</p>}
            {item.kind !== 'sentiero' && item.detail && <p className="text-base mt-2">{item.detail}</p>}
            {item.kind === 'pasto' && item.luogo && <p className="text-base mt-2">{item.luogo}{item.prenotato ? ' · prenotato' : ''}</p>}
            {item.kind === 'spiaggia' && (item.accesso || item.servizi) && (
              <p className="text-base mt-2">{[item.accesso, item.servizi].filter(Boolean).join(' · ')}</p>
            )}
            {sentieroStats(item).length > 0 && (
              <div className="flex flex-wrap gap-3 mt-2">
                {sentieroStats(item).map((s, i) => (
                  <div key={i} className="flex items-center gap-1 text-[var(--muted)]">
                    <s.icon size={13} />
                    <span className="font-mono text-sm font-medium text-[var(--ink)] whitespace-nowrap">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
            {item.tags.length > 0 && <p className="text-sm text-[var(--muted)] mt-2">{item.tags.join(' · ')}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!form && (
          <button onClick={() => setForm({ ...EMPTY_FORM, kind: isRistoranti(section) ? 'pasto' : '' })} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={16} /> Nuova scheda
          </button>
        )}
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{form.id ? 'Modifica scheda' : 'Nuova scheda'}</h2>
            {!isRistoranti(section) && (
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inputClass}>
                {KIND_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            )}
            <input required placeholder="Titolo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
            <input placeholder="Info breve (es. km, orario)" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} className={inputClass} />
            <textarea placeholder="Dettaglio" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} className={inputClass} rows={2} />
            <input placeholder="Link" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className={inputClass} />
            <input placeholder="Tag (separati da virgola)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className={inputClass} />
            {form.kind === 'sentiero' && (
              <>
                <input placeholder="Distanza (es. 14,2 km)" value={form.distanza} onChange={(e) => setForm({ ...form, distanza: e.target.value })} className={inputClass} />
                <input placeholder="Durata (es. 5h14)" value={form.durata} onChange={(e) => setForm({ ...form, durata: e.target.value })} className={inputClass} />
                <input placeholder="Dislivello (es. 480 m D+)" value={form.dislivello} onChange={(e) => setForm({ ...form, dislivello: e.target.value })} className={inputClass} />
                <input placeholder="Difficoltà (es. media, EE)" value={form.difficolta} onChange={(e) => setForm({ ...form, difficolta: e.target.value })} className={inputClass} />
              </>
            )}
            {form.kind === 'spiaggia' && (
              <>
                <input placeholder="Come arrivarci" value={form.accesso} onChange={(e) => setForm({ ...form, accesso: e.target.value })} className={inputClass} />
                <input placeholder="Servizi (bar, ombrelloni...)" value={form.servizi} onChange={(e) => setForm({ ...form, servizi: e.target.value })} className={inputClass} />
              </>
            )}
            {form.kind === 'pasto' && (
              <>
                <input placeholder="Nome del locale" value={form.luogo} onChange={(e) => setForm({ ...form, luogo: e.target.value })} className={inputClass} />
                <label className="flex items-center gap-2 text-base">
                  <input type="checkbox" checked={form.prenotato} onChange={(e) => setForm({ ...form, prenotato: e.target.checked })} />
                  Prenotato
                </label>
              </>
            )}
            <CoordsInput value={{ lat: form.lat, lng: form.lng }} onChange={(coords) => setForm({ ...form, ...coords })} />
            {isRistoranti(section) && (
              <div className="flex gap-2">
                <input type="date" aria-label="Data della prenotazione" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`flex-1 min-w-0 ${inputClass}`} />
                <input type="time" aria-label="Ora della prenotazione" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`flex-1 min-w-0 ${inputClass}`} />
              </div>
            )}
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
