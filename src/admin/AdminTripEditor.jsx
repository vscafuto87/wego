import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Map, CheckSquare, StickyNote, Ticket, Utensils, Bed, Bus, Star, Users, CalendarDays, Info } from 'lucide-react'
import { getSession, subscribeAuth } from '../data/supabase.js'
import { getSyncState, setSyncState as persistSyncState, markDirty, getDisplayNamePreference } from '../data/storage.js'
import { fetchTripOwnerId, syncTrip, pushTrip, pullTrip } from '../data/sync.js'
import { themeStyle } from '../theme/themes.js'
import AdminMetaForm from './AdminMetaForm.jsx'
import AdminDaysEditor from './AdminDaysEditor.jsx'
import AdminSectionEditor from './AdminSectionEditor.jsx'

const ICONS = { map: Map, check: CheckSquare, note: StickyNote, ticket: Ticket, food: Utensils, bed: Bed, bus: Bus, star: Star, people: Users }
const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const SYNC_DEBOUNCE_MS = 2000

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
  const [conflict, setConflict] = useState(null)

  // Riferimenti sempre aggiornati: un tentativo di sync partito da un timer o da
  // un evento deve lavorare sul viaggio e sullo stato correnti, non su quelli
  // catturati dal render in cui è stato pianificato.
  const tripRef = useRef(trip)
  const syncStateRef = useRef(null)
  // Conta le scritture locali: serve a capire se una modifica è arrivata mentre
  // un push era in volo.
  const editSeqRef = useRef(0)
  const debounceRef = useRef(null)

  useEffect(() => { tripRef.current = trip }, [trip])
  useEffect(() => { syncStateRef.current = syncState }, [syncState])

  async function runSync(state) {
    const seqAtStart = editSeqRef.current
    try {
      const result = await syncTrip(tripRef.current, state)
      if (result.action === 'conflict') {
        setConflict(result.conflict)
        return
      }
      if (result.action === 'pull') {
        // Il contenuto arriva dal server, l'identità locale del viaggio resta la
        // stessa: altrimenti il viaggio aperto sparirebbe dalla lista.
        onUpdate((t) => ({ ...result.trip, id: t.id }))
      }
      if (result.syncState !== state) {
        // Una modifica arrivata dopo l'inizio di questo tentativo non è stata
        // sincronizzata da questo tentativo: resta da mandare.
        const nextState = editSeqRef.current === seqAtStart
          ? result.syncState
          : { ...result.syncState, dirty: true }
        await persistSyncState(trip.id, nextState)
        setSyncStateValue(nextState)
      }
    } catch {
      // offline o errore di rete: l'indicatore di stato lo segnala già
    }
  }

  useEffect(() => {
    let cancelled = false
    getSession().then((s) => { if (!cancelled) setSession(s) })
    const unsubscribe = subscribeAuth((s) => { if (!cancelled) setSession(s) })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setSyncStateValue(undefined)
    syncStateRef.current = null
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
      if (cancelled) return
      setSyncStateValue(state)
      syncStateRef.current = state
      if (state) runSync(state)
    })
    getDisplayNamePreference().then((name) => { if (!cancelled) setDisplayName(name) })
    return () => { cancelled = true }
  }, [trip.id])

  useEffect(() => {
    function attempt() {
      if (syncStateRef.current) runSync(syncStateRef.current)
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') attempt()
    }
    window.addEventListener('online', attempt)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', attempt)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  function handleUpdate(updater) {
    onUpdate(updater)
    editSeqRef.current += 1
    if (syncState) {
      markDirty(trip.id)
      setSyncStateValue((s) => (s ? { ...s, dirty: true } : s))
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        if (syncStateRef.current) runSync(syncStateRef.current)
      }, SYNC_DEBOUNCE_MS)
    }
  }

  async function keepLocalVersion() {
    try {
      const result = await pushTrip(tripRef.current, syncState)
      await persistSyncState(trip.id, result.syncState)
      setSyncStateValue(result.syncState)
      setConflict(null)
    } catch (e) {
      window.alert(`Le modifiche di questo computer non sono andate online. Controlla la rete e riprova.\n\n${e.message}`)
    }
  }

  async function keepOnlineVersion() {
    try {
      const result = await pullTrip(syncState)
      onUpdate((t) => ({ ...result.trip, id: t.id }))
      await persistSyncState(trip.id, result.syncState)
      setSyncStateValue(result.syncState)
      setConflict(null)
    } catch (e) {
      window.alert(`La versione online non è arrivata. Controlla la rete e riprova.\n\n${e.message}`)
    }
  }

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
    handleUpdate((t) => ({ ...t, sections: [...t.sections, section] }))
    setSectionForm(null)
    setActiveTab(section.id)
  }

  function removeSection(section) {
    if (window.confirm(`Eliminare la sezione "${section.title}"? Non si può annullare.`)) {
      handleUpdate((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== section.id) }))
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
  const canEdit = loadingOwnership
    ? null
    : !syncState
      ? true
      : !session
        ? false
        : !syncState.ownerId
          ? true // proprietario non verificabile (offline o viaggio sincronizzato prima di questa funzione): non blocchiamo
          : syncState.ownerId === session.user.id
  // Un viewer non può scrivere sul server: non gli si offre di forzare la propria
  // versione, sarebbe un pulsante che la RLS rifiuta sempre.
  const canPush = !!syncState && syncState.role === 'editor'

  return (
    <div style={themeStyle(trip.palette)} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans max-w-6xl mx-auto px-6 py-8">
      <button onClick={onBack} className="flex items-center gap-1.5 text-base text-[var(--muted)] mb-4">
        <ArrowLeft size={17} /> Tutti i viaggi
      </button>
      <h1 className="font-display font-semibold text-4xl mb-6">{trip.emoji} {trip.name}</h1>

      {loadingOwnership && <p className="text-base text-[var(--muted)]">Verifico chi può modificare questo viaggio…</p>}

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
            {activeTab === 'info' && <AdminMetaForm trip={trip} onUpdate={handleUpdate} />}
            {activeTab === 'days' && <AdminDaysEditor trip={trip} onUpdate={handleUpdate} activeDisplayName={displayName} onNavigate={setActiveTab} />}
            {trip.sections.map((section) =>
              activeTab === section.id ? (
                <AdminSectionEditor
                  key={section.id}
                  trip={trip}
                  section={section}
                  onUpdate={handleUpdate}
                  activeDisplayName={displayName}
                  remoteId={syncState?.remoteId ?? null}
                  role={syncState ? 'editor' : null}
                />
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

      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm flex flex-col gap-3 bg-[var(--card)] rounded-2xl p-5">
            <h2 className="font-display font-semibold text-xl">Due versioni diverse</h2>
            <p className="text-base">
              Questo viaggio è stato modificato sia da questo computer che online, dopo l'ultima volta che si sono
              sincronizzati.{canPush ? ' Quale versione vuoi tenere?' : ''}
            </p>
            {canPush ? (
              <button onClick={keepLocalVersion} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
                Tieni la versione su questo computer
              </button>
            ) : (
              <p className="text-base text-[var(--muted)]">
                Questo viaggio lo puoi solo leggere: le modifiche fatte qui restano su questo computer e non vanno
                online. Se tieni la versione online, le perdi.
              </p>
            )}
            <button onClick={keepOnlineVersion} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-12 px-6 bg-[var(--tint)]">
              Tieni la versione online
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
