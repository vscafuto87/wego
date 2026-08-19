import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, Compass, CalendarDays } from 'lucide-react'
import { themeStyle, getTheme, ACCENT_GRADIENT } from '../theme/themes.js'
import Terrain from '../theme/Terrain.jsx'
import Overview, { ICONS } from './Overview.jsx'
import Days from './Days.jsx'
import Section from './Section.jsx'
import { getSyncState, setSyncState as persistSyncState, markDirty, getDisplayNamePreference } from '../data/storage.js'
import { syncTrip, pushTrip, pullTrip, restoreLastVersion } from '../data/sync.js'
import ActivateSyncModal from './ActivateSyncModal.jsx'
import Modal from '../components/Modal.jsx'
import Btn from '../components/Btn.jsx'

const SYNC_DEBOUNCE_MS = 2000
// Distanza di scroll su cui il titolo grande si comprime nella barra compatta.
const COLLAPSE_DISTANCE = 100
// Quanto si abbassa l'altezza dell'header comprimendosi (padding + blocco del
// titolo grande): serve più di COLLAPSE_DISTANCE di spazio reale sotto perché
// l'header stesso "mangia" altezza pagina più in fretta di quanto si scorra.
const HEADER_SHRINK = 184

export default function TripView({ trip, onBack, onUpdate, onDelete }) {
  const tabs = [
    { key: 'overview', label: 'Panoramica', icon: Compass },
    { key: 'days', label: 'Itinerario', icon: CalendarDays },
    ...trip.sections.map((s) => ({ key: s.id, label: s.title || 'Sezione', icon: ICONS[s.icon] }))
  ]
  const [activeTab, setActiveTab] = useState('overview')
  const [syncState, setSyncStateValue] = useState(null)
  const [cloudDisplayName, setCloudDisplayName] = useState('')
  const [activateOpen, setActivateOpen] = useState(false)
  const [conflict, setConflict] = useState(null)
  const [tabOverflow, setTabOverflow] = useState({ left: false, right: false })
  const [scrollY, setScrollY] = useState(0)
  const [extraSpace, setExtraSpace] = useState(0)
  const navScrollRef = useRef(null)
  const activeTabRef = useRef(null)

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

  // Lo sfondo di body è quello che si vede sotto la status bar in standalone
  // iOS, e il meta theme-color colora la status bar su Android: entrambi
  // devono seguire l'ambiente del viaggio aperto, non restare fissi.
  useEffect(() => {
    const paper = getTheme(trip.palette).paper
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousMeta = meta?.getAttribute('content')
    document.body.style.backgroundColor = paper
    meta?.setAttribute('content', paper)
    return () => {
      document.body.style.backgroundColor = ''
      if (previousMeta) meta?.setAttribute('content', previousMeta)
    }
  }, [trip.palette])

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

  // Sfuma i bordi della tab bar solo quando c'è altro da scorrere, così su
  // schermi stretti si capisce che le tab fuori vista esistono davvero.
  useLayoutEffect(() => {
    const el = navScrollRef.current
    if (!el) return
    function updateOverflow() {
      setTabOverflow({
        left: el.scrollLeft > 1,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      })
    }
    updateOverflow()
    el.addEventListener('scroll', updateOverflow)
    window.addEventListener('resize', updateOverflow)
    return () => {
      el.removeEventListener('scroll', updateOverflow)
      window.removeEventListener('resize', updateOverflow)
    }
  }, [trip.sections.length])

  // Se la pagina richiede già lo scroll ma di poco, garantisce comunque lo
  // spazio necessario a comprimere del tutto il titolo grande: altrimenti
  // la barra resterebbe bloccata a metà, né grande né compatta.
  useLayoutEffect(() => {
    function recompute() {
      // Misurata a header espanso (questo effect non dipende dallo scroll):
      // va confrontata con la soglia comprensiva di quanto l'header si ridurrà.
      const scrollable = document.documentElement.scrollHeight - window.innerHeight - extraSpace
      const needed = COLLAPSE_DISTANCE + HEADER_SHRINK
      const missing = scrollable > 0 && scrollable < needed ? needed - scrollable : 0
      setExtraSpace((current) => (current === missing ? current : missing))
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [activeTab, trip, extraSpace])

  // Il titolo grande dell'header si riduce scorrendo, come la nav bar di
  // un'app nativa.
  useEffect(() => {
    function onScroll() {
      setScrollY(window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // La tab attiva si espande: se era vicina al bordo va riportata in vista,
  // altrimenti l'etichetta resta tagliata fuori dallo schermo.
  useEffect(() => {
    // Aspetta che l'animazione di espansione finisca: se calcolata subito, la tab
    // è ancora larga 44px e "nearest" la considera già visibile.
    const timer = setTimeout(() => {
      activeTabRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
    }, 300)
    return () => clearTimeout(timer)
  }, [activeTab])

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
  // Quanto è "compresso" l'header: 0 = titolo grande, 1 = barra compatta.
  const collapse = Math.max(0, Math.min(1, scrollY / COLLAPSE_DISTANCE))

  return (
    <div style={themeStyle(trip.palette)} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans">
      <header className="sticky top-0 z-30 overflow-hidden" style={{ boxShadow: `0 1px 0 rgb(var(--ink-rgb) / ${collapse * 0.08})` }}>
        <div className="absolute inset-0" style={{ background: 'var(--paper)', opacity: collapse }} />
        <div className="absolute inset-0" style={{ opacity: 1 - collapse }}>
          <Terrain seed={trip.id} palette={trip.palette} height={140} className="h-full w-full" />
        </div>
        <div className="relative px-5 max-w-2xl mx-auto" style={{ paddingTop: 32 - collapse * 8, paddingBottom: 24 - collapse * 16 }}>
          <div className="flex items-center gap-3">
            <button onClick={onBack} aria-label="Torna ai viaggi" className="h-11 w-11 -ml-2 flex-shrink-0 flex items-center justify-center rounded-full bg-[var(--tint)] active:scale-[0.97] transition-transform duration-150 ease-out">
              <ArrowLeft size={20} />
            </button>
            <div
              className="flex items-center gap-2 whitespace-nowrap"
              style={{ opacity: collapse, maxWidth: collapse > 0.01 ? 280 : 0, overflow: 'hidden' }}
            >
              <span className="text-xl">{trip.emoji}</span>
              <span className="font-display font-semibold text-lg">{trip.name}</span>
            </div>
          </div>
          <div style={{ maxHeight: (1 - collapse) * 160, opacity: 1 - collapse, overflow: 'hidden' }}>
            <div className="flex items-baseline gap-2 mt-3">
              <span className="text-4xl">{trip.emoji}</span>
              <h1 className="font-display font-semibold text-4xl">{trip.name}</h1>
            </div>
            {trip.place && <p className="text-base text-[var(--muted)] mt-1">{trip.place}</p>}
            {status && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                <span className="text-xs text-[var(--muted)]">{status.label}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-36">
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
        {trip.sections.map((section) => (currentTab === section.id ? <Section key={section.id} trip={trip} section={section} onUpdate={handleUpdate} activeDisplayName={cloudDisplayName} onNavigate={setActiveTab} /> : null))}
        {extraSpace > 0 && <div style={{ height: extraSpace }} aria-hidden="true" />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
        <div className="max-w-2xl mx-auto relative">
          <div
            ref={navScrollRef}
            className="flex items-center gap-1 overflow-x-auto no-scrollbar bg-[rgb(var(--card-rgb)/0.9)] backdrop-blur-lg rounded-full p-1.5 shadow-[0_2px_4px_rgb(var(--ink-rgb)/0.08),0_20px_40px_-18px_rgb(var(--ink-rgb)/0.3)]"
          >
            {tabs.map((tab) => {
              const active = currentTab === tab.key
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  ref={active ? activeTabRef : undefined}
                  onClick={() => setActiveTab(tab.key)}
                  aria-label={active ? undefined : tab.label}
                  style={active ? { background: ACCENT_GRADIENT, maxWidth: 200 } : { maxWidth: 44 }}
                  className={`flex-shrink-0 h-11 rounded-full flex items-center overflow-hidden whitespace-nowrap transition-[max-width,box-shadow] duration-300 ease-out active:scale-[0.97] ${
                    active ? 'shadow-[0_10px_20px_-10px_rgb(var(--accent-rgb)/0.55)]' : ''
                  }`}
                >
                  <span className="h-11 w-11 flex items-center justify-center flex-shrink-0" style={{ color: active ? 'var(--paper)' : 'var(--muted)' }}>
                    <Icon size={18} />
                  </span>
                  <span className="pr-5 font-sans text-[15px] font-medium" style={{ color: active ? 'var(--paper)' : 'var(--muted)' }}>
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>
          {tabOverflow.left && (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-full bg-gradient-to-r from-[rgb(var(--card-rgb)/0.9)] to-transparent" />
          )}
          {tabOverflow.right && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-full bg-gradient-to-l from-[rgb(var(--card-rgb)/0.9)] to-transparent" />
          )}
        </div>
      </nav>

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
