import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { themeStyle } from '../theme/themes.js'
import Terrain from '../theme/Terrain.jsx'
import Stripe from '../components/Stripe.jsx'
import Overview from './Overview.jsx'
import Days from './Days.jsx'
import Section from './Section.jsx'
import { getSyncState, setSyncState as persistSyncState, markDirty, getDisplayNamePreference } from '../data/storage.js'
import { syncTrip, pushTrip, pullTrip, restoreLastVersion } from '../data/sync.js'
import ActivateSyncModal from './ActivateSyncModal.jsx'
import Modal from '../components/Modal.jsx'
import Btn from '../components/Btn.jsx'

const SYNC_DEBOUNCE_MS = 2000

export default function TripView({ trip, onBack, onUpdate, onDelete }) {
  const tabs = [
    { key: 'overview', label: 'Panoramica' },
    { key: 'days', label: 'Giorni' },
    ...trip.sections.map((s) => ({ key: s.id, label: s.title || 'Sezione' }))
  ]
  const [activeTab, setActiveTab] = useState('overview')
  const [syncState, setSyncStateValue] = useState(null)
  const [cloudDisplayName, setCloudDisplayName] = useState('')
  const [activateOpen, setActivateOpen] = useState(false)
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
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setSyncStateValue(null)
    syncStateRef.current = null
    getSyncState(trip.id).then(async (state) => {
      if (cancelled) return
      setSyncStateValue(state)
      syncStateRef.current = state
      if (state) {
        const name = await getDisplayNamePreference()
        if (!cancelled) setCloudDisplayName(name)
        runSync(state)
      }
    })
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

  async function handleActivated(state) {
    await persistSyncState(trip.id, state)
    setSyncStateValue(state)
    const name = await getDisplayNamePreference()
    setCloudDisplayName(name)
  }

  async function handleRestore() {
    try {
      const restored = await restoreLastVersion(syncState.remoteId)
      if (!restored) {
        window.alert('Non c\'è nessuna versione precedente da ripristinare.')
        return
      }
      onUpdate((t) => ({ ...restored, id: t.id }))
      const nextState = { ...syncState, dirty: false }
      await persistSyncState(trip.id, nextState)
      setSyncStateValue(nextState)
    } catch (e) {
      window.alert(`Il ripristino non è andato a buon fine. Controlla la rete e riprova.\n\n${e.message}`)
    }
  }

  async function keepLocalVersion() {
    try {
      const result = await pushTrip(tripRef.current, syncState)
      await persistSyncState(trip.id, result.syncState)
      setSyncStateValue(result.syncState)
      setConflict(null)
    } catch (e) {
      window.alert(`Le modifiche di questo telefono non sono andate online. Controlla la rete e riprova.\n\n${e.message}`)
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

  function syncStatus() {
    if (!syncState) return null
    if (conflict) return { dot: 'bg-[var(--accent)]', label: 'due versioni in conflitto' }
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { dot: 'bg-[var(--muted)]', label: 'in attesa di rete' }
    if (syncState.dirty && syncState.role === 'viewer') return { dot: 'bg-[var(--accent)]', label: 'modifiche salvate solo su questo telefono' }
    if (syncState.dirty) return { dot: 'bg-[var(--accent)]', label: 'modifiche in coda' }
    return { dot: 'bg-[var(--accent2)]', label: 'sincronizzato' }
  }

  const status = syncStatus()
  // Un pull rigenera gli id delle sezioni: se la tab aperta non esiste più si
  // torna alla panoramica invece di mostrare una pagina vuota.
  const currentTab = tabs.some((t) => t.key === activeTab) ? activeTab : 'overview'
  // Un viewer non può scrivere sul server: non gli si offre di forzare la propria
  // versione, sarebbe un pulsante che la RLS rifiuta sempre.
  const canPush = !!syncState && syncState.role === 'editor'

  return (
    <div style={themeStyle(trip.palette)} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans">
      <header className="relative overflow-hidden">
        <Terrain seed={trip.id} palette={trip.palette} height={140} className="absolute inset-0 h-full w-full" />
        <div className="relative px-5 pt-8 pb-6 max-w-2xl mx-auto">
          <button onClick={onBack} aria-label="Torna ai viaggi" className="min-h-11 min-w-11 -ml-2 flex items-center">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl">{trip.emoji}</span>
            <h1 className="font-display text-3xl">{trip.name}</h1>
          </div>
          {trip.place && <p className="text-sm text-[var(--muted)] mt-1">{trip.place}</p>}
          {status && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`h-2 w-2 rounded-full ${status.dot}`} />
              <span className="text-xs text-[var(--muted)]">{status.label}</span>
            </div>
          )}
        </div>
      </header>

      <nav className="sticky top-0 z-10 bg-[var(--paper)] border-b border-[var(--line)] overflow-x-auto">
        <div className="flex px-5 max-w-2xl mx-auto">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className="flex-shrink-0 px-3 py-3 font-display text-base whitespace-nowrap">
              {tab.label}
              <Stripe className={currentTab === tab.key ? 'opacity-100' : 'opacity-0'} />
            </button>
          ))}
        </div>
      </nav>

      <main className="px-5 max-w-2xl mx-auto pb-16">
        {currentTab === 'overview' && (
          <Overview
            trip={trip}
            onUpdate={handleUpdate}
            onDelete={onDelete}
            syncActive={!!syncState}
            onOpenActivate={() => setActivateOpen(true)}
            onRestore={syncState && syncState.role === 'editor' ? handleRestore : null}
          />
        )}
        {currentTab === 'days' && <Days trip={trip} onUpdate={handleUpdate} activeDisplayName={cloudDisplayName} />}
        {trip.sections.map((section) => (currentTab === section.id ? <Section key={section.id} trip={trip} section={section} onUpdate={handleUpdate} activeDisplayName={cloudDisplayName} /> : null))}
      </main>

      <ActivateSyncModal open={activateOpen} trip={trip} onClose={() => setActivateOpen(false)} onActivated={handleActivated} />

      <Modal open={!!conflict} title="Due versioni diverse" onClose={() => {}}>
        {conflict && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Questo viaggio è stato modificato sia su questo telefono che online, dopo l'ultima volta che si sono
              sincronizzati.{canPush ? ' Quale versione vuoi tenere?' : ''}
            </p>
            {canPush ? (
              <Btn onClick={keepLocalVersion}>Tieni la versione su questo telefono</Btn>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Questo viaggio lo puoi solo leggere: le modifiche fatte qui restano su questo telefono e non vanno
                online. Se tieni la versione online, le perdi.
              </p>
            )}
            <Btn variant="secondary" onClick={keepOnlineVersion}>Tieni la versione online</Btn>
          </div>
        )}
      </Modal>
    </div>
  )
}
