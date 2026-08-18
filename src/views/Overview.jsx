import { useState } from 'react'
import { Map, CheckSquare, StickyNote, Ticket, Utensils, Bed, Bus, Star, Users, Plus, Trash2, Pencil, Share2 } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Label from '../components/Label.jsx'
import Stat from '../components/Stat.jsx'
import Modal from '../components/Modal.jsx'
import ExportPanel from './ExportPanel.jsx'
import { isCloudConfigured } from '../data/supabase.js'

const ICONS = { map: Map, check: CheckSquare, note: StickyNote, ticket: Ticket, food: Utensils, bed: Bed, bus: Bus, star: Star, people: Users }
const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

function tripStatus(trip) {
  if (!trip.start || !trip.end) return ''
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

export default function Overview({ trip, onUpdate, onDelete, syncActive, onOpenActivate, onRestore }) {
  const [editForm, setEditForm] = useState(null)
  const [sectionForm, setSectionForm] = useState(null)
  const [exportOpen, setExportOpen] = useState(false)

  function openEdit() {
    setEditForm({
      name: trip.name,
      emoji: trip.emoji,
      place: trip.place,
      start: trip.start,
      end: trip.end,
      palette: trip.palette,
      people: trip.people.join(', ')
    })
  }

  function saveEdit(e) {
    e.preventDefault()
    const people = editForm.people.split(',').map((p) => p.trim()).filter(Boolean)
    onUpdate((t) => ({ ...t, ...editForm, people }))
    setEditForm(null)
  }

  function addSection(e) {
    e.preventDefault()
    const section = {
      id: crypto.randomUUID(),
      title: sectionForm.title,
      icon: sectionForm.icon,
      type: sectionForm.type,
      ...(sectionForm.type === 'notes' ? { text: '' } : { items: [] })
    }
    onUpdate((t) => ({ ...t, sections: [...t.sections, section] }))
    setSectionForm(null)
  }

  function removeSection(section) {
    if (window.confirm(`Eliminare la sezione "${section.title}"? Non si può annullare.`)) {
      onUpdate((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== section.id) }))
    }
  }

  function removeTrip() {
    if (window.confirm(`Eliminare il viaggio "${trip.name}"? Non si può annullare.`)) {
      onDelete()
    }
  }

  function isFixedSection(section) {
    if (section.type === 'transport' || section.type === 'lodging' || section.type === 'map') return true
    return section.type === 'cards' && section.title === 'Ristoranti'
  }

  return (
    <div className="flex flex-col gap-6 pt-5">
      <div className="flex gap-6">
        <Stat label="Stato" value={tripStatus(trip) || '—'} />
        <Stat label="Giorni" value={trip.days.length} />
        <Stat label="Persone" value={trip.people.length} />
      </div>

      {trip.people.length > 0 && (
        <div>
          <Label>Chi viene</Label>
          <p className="mt-1 text-base">{trip.people.join(', ')}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Btn variant="secondary" onClick={openEdit}>
          <Pencil size={17} /> Modifica
        </Btn>
        <Btn variant="secondary" onClick={() => setExportOpen(true)}>
          <Share2 size={17} /> Esporta
        </Btn>
        {!syncActive && isCloudConfigured && (
          <Btn variant="secondary" onClick={onOpenActivate}>
            <Share2 size={16} /> Attiva sync
          </Btn>
        )}
        {onRestore && (
          <Btn variant="secondary" onClick={onRestore}>
            <Share2 size={16} /> Ripristina l'ultima versione
          </Btn>
        )}
        <Btn variant="danger" onClick={removeTrip}>
          <Trash2 size={17} /> Elimina viaggio
        </Btn>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>Sezioni</Label>
          <button onClick={() => setSectionForm({ title: '', icon: 'star', type: 'cards' })} className="min-h-12 flex items-center gap-1 text-base text-[var(--accent)]">
            <Plus size={17} /> Aggiungi
          </button>
        </div>
        <ul className="mt-2 flex flex-col divide-y divide-[var(--line)] bg-[var(--card)] rounded-[24px] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05)] overflow-hidden">
          {trip.sections.filter((s) => !isFixedSection(s)).map((section) => {
            const Icon = ICONS[section.icon] ?? Star
            return (
              <li key={section.id} className="flex items-center gap-3 px-4 py-3.5">
                <Icon size={19} className="text-[var(--muted)]" />
                <span className="flex-1 text-base">{section.title || 'Senza titolo'}</span>
                <button onClick={() => removeSection(section)} aria-label={`Elimina ${section.title}`} className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Trash2 size={17} />
                </button>
              </li>
            )
          })}
          {trip.sections.filter((s) => !isFixedSection(s)).length === 0 && <li className="px-4 py-3.5 text-base text-[var(--muted)]">Nessuna sezione ancora.</li>}
        </ul>
      </div>

      <Modal open={!!editForm} title="Modifica viaggio" onClose={() => setEditForm(null)}>
        {editForm && (
          <form onSubmit={saveEdit} className="flex flex-col gap-3">
            <input required placeholder="Nome del viaggio" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
            <input placeholder="Emoji" value={editForm.emoji} onChange={(e) => setEditForm({ ...editForm, emoji: e.target.value })} className={inputClass} />
            <input placeholder="Luogo" value={editForm.place} onChange={(e) => setEditForm({ ...editForm, place: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="date" value={editForm.start} onChange={(e) => setEditForm({ ...editForm, start: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="date" value={editForm.end} onChange={(e) => setEditForm({ ...editForm, end: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <select value={editForm.palette} onChange={(e) => setEditForm({ ...editForm, palette: e.target.value })} className={inputClass}>
              <option value="mountain">Montagna</option>
              <option value="sea">Mare</option>
              <option value="city">Città</option>
              <option value="wild">Natura</option>
            </select>
            <input placeholder="Persone (separate da virgola)" value={editForm.people} onChange={(e) => setEditForm({ ...editForm, people: e.target.value })} className={inputClass} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>

      <Modal open={!!sectionForm} title="Nuova sezione" onClose={() => setSectionForm(null)}>
        {sectionForm && (
          <form onSubmit={addSection} className="flex flex-col gap-3">
            <input required placeholder="Titolo" value={sectionForm.title} onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })} className={inputClass} />
            <select value={sectionForm.icon} onChange={(e) => setSectionForm({ ...sectionForm, icon: e.target.value })} className={inputClass}>
              {Object.keys(ICONS).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
            <select value={sectionForm.type} onChange={(e) => setSectionForm({ ...sectionForm, type: e.target.value })} className={inputClass}>
              <option value="cards">Schede</option>
              <option value="checklist">Lista da spuntare</option>
              <option value="notes">Note</option>
            </select>
            <Btn type="submit">Aggiungi sezione</Btn>
          </form>
        )}
      </Modal>

      <Modal open={exportOpen} title="Esporta il viaggio" onClose={() => setExportOpen(false)}>
        <ExportPanel trip={trip} />
      </Modal>
    </div>
  )
}
