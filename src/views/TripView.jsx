import { useEffect, useState } from 'react'
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

  async function runSync(state) {
    try {
      const result = await syncTrip(trip, state)
      if (result.action === 'conflict') {
        setConflict(result.conflict)
        return
      }
      if (result.action === 'pull') {
        onUpdate(() => result.trip)
      }
      if (result.syncState !== state) {
        await persistSyncState(trip.id, result.syncState)
        setSyncStateValue(result.syncState)
      }
    } catch {
      // offline o errore di rete: l'indicatore di stato lo segnala già
    }
  }

  useEffect(() => {
    let cancelled = false
    getSyncState(trip.id).then(async (state) => {
      if (cancelled) return
      setSyncStateValue(state)
      if (state) {
        const name = await getDisplayNamePreference()
        if (!cancelled) setCloudDisplayName(name)
        runSync(state)
      }
    })
    return () => { cancelled = true }
  }, [trip.id])

  useEffect(() => {
    function onOnline() {
      if (syncState) runSync(syncState)
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [syncState])

  function handleUpdate(updater) {
    onUpdate(updater)
    if (syncState) {
      markDirty(trip.id)
      setSyncStateValue((s) => (s ? { ...s, dirty: true } : s))
    }
  }

  async function handleActivated(state) {
    await persistSyncState(trip.id, state)
    setSyncStateValue(state)
    const name = await getDisplayNamePreference()
    setCloudDisplayName(name)
  }

  async function handleRestore() {
    const restored = await restoreLastVersion(syncState.remoteId)
    if (!restored) {
      window.alert('Non c\'è nessuna versione precedente da ripristinare.')
      return
    }
    onUpdate(() => restored)
    const nextState = { ...syncState, dirty: false }
    await persistSyncState(trip.id, nextState)
    setSyncStateValue(nextState)
  }

  async function keepLocalVersion() {
    const result = await pushTrip(trip, syncState)
    await persistSyncState(trip.id, result.syncState)
    setSyncStateValue(result.syncState)
    setConflict(null)
  }

  async function keepOnlineVersion() {
    const result = await pullTrip(syncState)
    onUpdate(() => result.trip)
    await persistSyncState(trip.id, result.syncState)
    setSyncStateValue(result.syncState)
    setConflict(null)
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
              <Stripe className={activeTab === tab.key ? 'opacity-100' : 'opacity-0'} />
            </button>
          ))}
        </div>
      </nav>

      <main className="px-5 max-w-2xl mx-auto pb-16">
        {activeTab === 'overview' && (
          <Overview
            trip={trip}
            onUpdate={handleUpdate}
            onDelete={onDelete}
            syncActive={!!syncState}
            onOpenActivate={() => setActivateOpen(true)}
            onRestore={syncState && syncState.role === 'editor' ? handleRestore : null}
          />
        )}
        {activeTab === 'days' && <Days trip={trip} onUpdate={handleUpdate} activeDisplayName={cloudDisplayName} />}
        {trip.sections.map((section) => (activeTab === section.id ? <Section key={section.id} trip={trip} section={section} onUpdate={handleUpdate} activeDisplayName={cloudDisplayName} /> : null))}
      </main>

      <ActivateSyncModal open={activateOpen} trip={trip} onClose={() => setActivateOpen(false)} onActivated={handleActivated} />

      <Modal open={!!conflict} title="Due versioni diverse" onClose={() => {}}>
        {conflict && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Questo viaggio è stato modificato sia su questo telefono che online, dopo l'ultima volta che si sono
              sincronizzati. Quale versione vuoi tenere?
            </p>
            <Btn onClick={keepLocalVersion}>Tieni la versione su questo telefono</Btn>
            <Btn variant="secondary" onClick={keepOnlineVersion}>Tieni la versione online</Btn>
          </div>
        )}
      </Modal>
    </div>
  )
}
