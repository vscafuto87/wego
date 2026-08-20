import { useState } from 'react'
import { Plus, Pencil, Trash2, Mountain, Waves, Utensils, ExternalLink, Check, Ruler, Clock, TrendingUp, MapPin } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import DayLabel from '../components/DayLabel.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified, dayItemFieldsForKind } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
import CoordsInput from '../components/CoordsInput.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const DATE_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })

function formatDate(date) {
  return date ? DATE_FMT.format(new Date(date)) : ''
}

const EMPTY_DAY = { date: '', title: '', note: '' }
const EMPTY_ITEM = { kind: '', time: '', title: '', detail: '', link: '', distanza: '', durata: '', dislivello: '', difficolta: '', accesso: '', servizi: '', luogo: '', prenotato: false, lat: null, lng: null }

const KIND_OPTIONS = [
  { value: '', label: 'Generica' },
  { value: 'sentiero', label: 'Sentiero' },
  { value: 'spiaggia', label: 'Spiaggia' },
  { value: 'pasto', label: 'Pasto' }
]

const KIND_ICONS = { '': MapPin, sentiero: Mountain, spiaggia: Waves, pasto: Utensils }

const ALL_KIND_FIELDS = ['distanza', 'durata', 'dislivello', 'difficolta', 'accesso', 'servizi', 'luogo', 'prenotato', 'lat', 'lng']

function positiveDislivello(value) {
  return value ? value.split('·')[0].trim() : value
}

function LinkChip({ link }) {
  if (!link) return null
  return (
    <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--tint)] text-[var(--accent)] text-sm font-medium mt-3">
      <ExternalLink size={14} /> Apri il link
    </a>
  )
}

// Voce sentiero/spiaggia/pasto: una scheda con badge del tipo, invece della
// riga di testo generica, per rendere le informazioni del percorso o del
// posto immediatamente riconoscibili.
export function DayItemCard({ item, onEdit, onRemove }) {
  const Icon = KIND_ICONS[item.kind]
  const stats = item.kind === 'sentiero'
    ? [
        { icon: Ruler, value: item.distanza },
        { icon: Clock, value: item.durata },
        { icon: TrendingUp, value: positiveDislivello(item.dislivello) }
      ].filter((s) => s.value)
    : []

  return (
    <div className="rounded-[24px] p-4 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-full bg-[var(--tint)] flex items-center justify-center flex-shrink-0">
            {Icon && <Icon size={18} className="text-[var(--accent)]" />}
          </div>
          <div className="flex-1 min-w-0">
            {item.time && <span className="font-mono text-sm text-[var(--muted)]">{item.time}</span>}
            <p className="font-display font-semibold text-lg leading-snug">{item.title}</p>
            {item.kind !== 'sentiero' && item.detail && <p className="text-sm text-[var(--muted)] mt-1">{item.detail}</p>}
            {item.kind === 'pasto' && item.luogo && <p className="text-sm text-[var(--muted)] mt-1">{item.luogo}</p>}
            {item.kind === 'spiaggia' && (item.accesso || item.servizi) && (
              <p className="text-sm text-[var(--muted)] mt-1">{[item.accesso, item.servizi].filter(Boolean).join(' · ')}</p>
            )}
            {stats.length > 0 && (
              <div className="flex flex-wrap gap-4 mt-1.5">
                {stats.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[var(--muted)]">
                    <s.icon size={14} />
                    <span className="font-mono text-sm font-medium text-[var(--ink)] whitespace-nowrap">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {(onEdit || onRemove) && (
          <div className="flex gap-1 -mr-2 -mt-1 flex-shrink-0">
            {onEdit && (
              <button onClick={onEdit} aria-label="Modifica voce" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <Pencil size={15} />
              </button>
            )}
            {onRemove && (
              <button onClick={onRemove} aria-label="Elimina voce" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      {item.kind === 'pasto' && item.prenotato && (
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--accent2)] text-[var(--paper)] text-xs font-medium mt-3">
          <Check size={12} /> Prenotato
        </span>
      )}

      <LinkChip link={item.link} />
      <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
    </div>
  )
}

function withoutKindFields(item) {
  const clean = { ...item }
  for (const field of ALL_KIND_FIELDS) {
    delete clean[field]
  }
  return clean
}

function fieldsForForm(itemForm) {
  const common = { time: itemForm.time, title: itemForm.title, kind: itemForm.kind, detail: itemForm.detail, link: itemForm.link }
  for (const field of dayItemFieldsForKind(itemForm.kind)) {
    common[field] = itemForm[field]
  }
  return common
}

export default function Days({ trip, onUpdate, activeDisplayName }) {
  const [dayForm, setDayForm] = useState(null)
  const [itemForm, setItemForm] = useState(null)

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
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DayLabel>{formatDate(day.date)}</DayLabel>
              <p className="font-display font-semibold text-2xl leading-tight mt-2">{day.title || 'Senza titolo'}</p>
              {day.note && <p className="text-base text-[var(--muted)] mt-1">{day.note}</p>}
              <ModifiedBy modifiedBy={day.modifiedBy} modifiedAt={day.modifiedAt} />
            </div>
            <div className="flex gap-1 -mr-2 flex-shrink-0">
              <button onClick={() => setDayForm({ id: day.id, date: day.date, title: day.title, note: day.note })} aria-label="Modifica giorno" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <Pencil size={17} />
              </button>
              <button onClick={() => removeDay(day)} aria-label="Elimina giorno" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                <Trash2 size={17} />
              </button>
            </div>
          </div>

          {day.items.length > 0 && (
            <ul className="flex flex-col gap-3">
              {day.items.map((item) => (
                <li key={item.id}>
                  <DayItemCard
                    item={item}
                    onEdit={() => setItemForm({ dayId: day.id, id: item.id, ...EMPTY_ITEM, ...item })}
                    onRemove={() => removeItem(day.id, item)}
                  />
                </li>
              ))}
            </ul>
          )}

          <button onClick={() => setItemForm({ dayId: day.id, ...EMPTY_ITEM })} className="self-start flex items-center gap-1 text-base text-[var(--accent)] min-h-12">
            <Plus size={17} /> Aggiungi voce
          </button>
        </div>
      ))}

      {trip.days.length > 0 && (
        <Btn variant="secondary" onClick={() => setDayForm(EMPTY_DAY)} className="self-start">
          <Plus size={17} /> Nuovo giorno
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
            <select value={itemForm.kind} onChange={(e) => setItemForm({ ...itemForm, kind: e.target.value })} className={inputClass}>
              {KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
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

            {['sentiero', 'spiaggia', 'pasto'].includes(itemForm.kind) && (
              <CoordsInput value={{ lat: itemForm.lat, lng: itemForm.lng }} onChange={(coords) => setItemForm({ ...itemForm, ...coords })} />
            )}

            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
}
