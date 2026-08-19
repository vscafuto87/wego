import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Map, CheckSquare, StickyNote, Ticket, Utensils, Bed, Bus, Star, Users, CalendarDays, Info } from 'lucide-react'
import { getSession, subscribeAuth } from '../data/supabase.js'
import { getSyncState, setSyncState as persistSyncState, getDisplayNamePreference } from '../data/storage.js'
import { fetchTripOwnerId } from '../data/sync.js'
import MagicLinkForm from '../components/MagicLinkForm.jsx'
import { themeStyle } from '../theme/themes.js'
import AdminMetaForm from './AdminMetaForm.jsx'
import AdminDaysEditor from './AdminDaysEditor.jsx'
import AdminSectionEditor from './AdminSectionEditor.jsx'

const ICONS = { map: Map, check: CheckSquare, note: StickyNote, ticket: Ticket, food: Utensils, bed: Bed, bus: Bus, star: Star, people: Users }
const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

function isFixedSection(section) {
  if (section.type === 'transport' || section.type === 'lodging' || section.type === 'map') return true
  return section.type === 'cards' && section.title === 'Ristoranti'
}

export default function AdminTripEditor({ trip, onBack, onUpdate, onDelete }) {
  const [activeTab, setActiveTab] = useState('info')
  const [session, setSession] = useState(undefined)
  const [syncState, setSyncStateValue] = useState(undefined)
  const [displayName, setDisplayName] = useState('')
  const [sectionForm, setSectionForm] = useState(null)
  const [sectionError, setSectionError] = useState('')

  useEffect(() => {
    let cancelled = false
    getSession().then((s) => { if (!cancelled) setSession(s) })
    const unsubscribe = subscribeAuth((s) => { if (!cancelled) setSession(s) })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  useEffect(() => {
    let cancelled = false
    setSyncStateValue(undefined)
    getSyncState(trip.id).then(async (state) => {
      if (cancelled) return
      if (state && !state.ownerId) {
        try {
          const ownerId = await fetchTripOwnerId(state.remoteId)
          const next = { ...state, ownerId }
          await persistSyncState(trip.id, next)
          state = next
        } catch {
          // offline o remoto irraggiungibile: si riprova al prossimo apertura
        }
      }
      if (!cancelled) setSyncStateValue(state)
    })
    getDisplayNamePreference().then((name) => { if (!cancelled) setDisplayName(name) })
    return () => { cancelled = true }
  }, [trip.id])

  function addSection(e) {
    e.preventDefault()
    if (sectionForm.type === 'cards' && sectionForm.title.trim() === 'Ristoranti') {
      setSectionError('"Ristoranti" è già una sezione fissa: scegli un altro titolo.')
      return
    }
    const section = {
      id: crypto.randomUUID(),
      title: sectionForm.title,
      icon: sectionForm.icon,
      type: sectionForm.type,
      ...(sectionForm.type === 'notes' ? { text: '' } : { items: [] })
    }
    onUpdate((t) => ({ ...t, sections: [...t.sections, section] }))
    setSectionForm(null)
    setActiveTab(section.id)
  }

  function removeSection(section) {
    if (window.confirm(`Eliminare la sezione "${section.title}"? Non si può annullare.`)) {
      onUpdate((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== section.id) }))
      if (activeTab === section.id) setActiveTab('info')
    }
  }

  function removeTrip() {
    if (window.confirm(`Eliminare il viaggio "${trip.name}"? Non si può annullare.`)) {
      onDelete()
    }
  }

  // undefined = ancora in caricamento, null = nessuna sync (viaggio locale)
  const loadingOwnership = syncState === undefined || session === undefined
  const canEdit = loadingOwnership ? null : (!syncState || (session && syncState.ownerId === session.user.id))

  return (
    <div style={themeStyle(trip.palette)} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans max-w-6xl mx-auto px-6 py-8">
      <button onClick={onBack} className="flex items-center gap-1.5 text-base text-[var(--muted)] mb-4">
        <ArrowLeft size={17} /> Tutti i viaggi
      </button>
      <h1 className="font-display font-semibold text-4xl mb-6">{trip.emoji} {trip.name}</h1>

      {loadingOwnership && <p className="text-base text-[var(--muted)]">Verifico chi può modificare questo viaggio…</p>}

      {!loadingOwnership && syncState && !session && (
        <div className="max-w-sm flex flex-col gap-3">
          <p className="text-base">Questo viaggio è sincronizzato: per modificarlo da qui devi prima accedere.</p>
          <MagicLinkForm />
        </div>
      )}

      {!loadingOwnership && (!syncState || session) && !canEdit && (
        <div className="max-w-md flex flex-col gap-3">
          <p className="text-base">
            Questo viaggio è sincronizzato da un altro account: da qui puoi solo vederne il nome, non modificarlo.
            Le modifiche restano possibili dall'app normale, secondo i permessi di editor/viewer già in uso.
          </p>
        </div>
      )}

      {!loadingOwnership && canEdit && (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
          <nav className="flex flex-col gap-1">
            <button onClick={() => setActiveTab('info')} className={`text-left px-3 py-2 rounded-lg flex items-center gap-2 ${activeTab === 'info' ? 'bg-[var(--tint)] font-medium' : ''}`}>
              <Info size={16} /> Info viaggio
            </button>
            <button onClick={() => setActiveTab('days')} className={`text-left px-3 py-2 rounded-lg flex items-center gap-2 ${activeTab === 'days' ? 'bg-[var(--tint)] font-medium' : ''}`}>
              <CalendarDays size={16} /> Giorni
            </button>
            {trip.sections.map((section) => {
              const Icon = ICONS[section.icon] ?? Star
              return (
                <div key={section.id} className={`flex items-center gap-1 rounded-lg ${activeTab === section.id ? 'bg-[var(--tint)]' : ''}`}>
                  <button onClick={() => setActiveTab(section.id)} className={`flex-1 text-left px-3 py-2 flex items-center gap-2 ${activeTab === section.id ? 'font-medium' : ''}`}>
                    <Icon size={16} /> {section.title || 'Sezione'}
                  </button>
                  {!isFixedSection(section) && (
                    <button onClick={() => removeSection(section)} aria-label={`Elimina ${section.title}`} className="mr-1 p-1.5 text-[var(--muted)]">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )
            })}
            <button onClick={() => { setSectionError(''); setSectionForm({ title: '', icon: 'star', type: 'cards' }) }} className="text-left px-3 py-2 rounded-lg flex items-center gap-2 text-[var(--accent)]">
              <Plus size={16} /> Aggiungi sezione
            </button>
            <hr className="border-[var(--line)] my-2" />
            <button onClick={removeTrip} className="text-left px-3 py-2 rounded-lg flex items-center gap-2 text-[var(--accent)]">
              <Trash2 size={16} /> Elimina viaggio
            </button>
          </nav>

          <div>
            {activeTab === 'info' && <AdminMetaForm trip={trip} onUpdate={onUpdate} />}
            {activeTab === 'days' && <AdminDaysEditor trip={trip} onUpdate={onUpdate} activeDisplayName={displayName} />}
            {trip.sections.map((section) =>
              activeTab === section.id ? (
                <AdminSectionEditor key={section.id} trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={displayName} />
              ) : null
            )}
          </div>
        </div>
      )}

      {sectionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSectionForm(null)}>
          <form onSubmit={addSection} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm flex flex-col gap-3 bg-[var(--card)] rounded-2xl p-5">
            <h2 className="font-display font-semibold text-xl">Nuova sezione</h2>
            <input required placeholder="Titolo" value={sectionForm.title} onChange={(e) => { setSectionError(''); setSectionForm({ ...sectionForm, title: e.target.value }) }} className={inputClass} />
            {sectionError && <p className="text-base text-[var(--accent)]">{sectionError}</p>}
            <select value={sectionForm.icon} onChange={(e) => setSectionForm({ ...sectionForm, icon: e.target.value })} className={inputClass}>
              {Object.keys(ICONS).map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
            <select value={sectionForm.type} onChange={(e) => setSectionForm({ ...sectionForm, type: e.target.value })} className={inputClass}>
              <option value="cards">Schede</option>
              <option value="checklist">Lista da spuntare</option>
              <option value="notes">Note</option>
            </select>
            <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
              Aggiungi sezione
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
