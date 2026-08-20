import { useCallback, useEffect, useState } from 'react'
import { loadTrips, saveTrips, getSyncState, setSyncState, getDisplayNamePreference } from './data/storage.js'
import { activateTripSync, listMyTrips, reconcileTripList, deleteTripAsOwner, leaveTripAsMember } from './data/sync.js'
import { normalizeTrip } from './data/schema.js'
import { isCloudConfigured } from './data/supabase.js'
import Home from './views/Home.jsx'
import TripView from './views/TripView.jsx'
import ImportView from './views/ImportView.jsx'
import JoinView from './views/JoinView.jsx'
import AdminApp from './admin/AdminApp.jsx'
import LoginGate from './views/LoginGate.jsx'

export default function App() {
  const [authReady, setAuthReady] = useState(!isCloudConfigured)
  const [trips, setTrips] = useState(null)
  const [view, setView] = useState('home')
  const [activeTripId, setActiveTripId] = useState(null)

  const [joinCode] = useState(() => {
    const match = window.location.pathname.match(/^\/j\/([A-Za-z0-9]{6})$/)
    return match ? match[1] : null
  })

  const [isAdmin] = useState(() => window.location.pathname === '/admin')

  useEffect(() => {
    if (!authReady) return
    let cancelled = false

    async function bootstrap() {
      const local = await loadTrips()
      if (cancelled) return

      if (!isCloudConfigured) {
        setTrips(local)
        return
      }

      const displayName = await getDisplayNamePreference()
      const syncStates = []
      for (const trip of local) {
        let state = await getSyncState(trip.id)
        if (!state) {
          try {
            state = await activateTripSync(trip, displayName)
            await setSyncState(trip.id, state)
          } catch {
            state = null
          }
        }
        syncStates.push({ localId: trip.id, syncState: state })
      }
      if (cancelled) return

      let finalTrips = local
      if (navigator.onLine) {
        try {
          const remoteTrips = await listMyTrips()
          const { trips: reconciled, additions } = reconcileTripList({ localTrips: local, syncStates, remoteTrips })
          for (const { trip, syncState } of additions) await setSyncState(trip.id, syncState)
          finalTrips = reconciled
        } catch {
          // offline durante il pull, o errore di rete: resta la lista locale
        }
      }

      await saveTrips(finalTrips)
      if (!cancelled) setTrips(finalTrips)
    }

    bootstrap()
    return () => { cancelled = true }
  }, [authReady])

  // Swipe dal bordo sinistro per tornare indietro, come un'app nativa. Serve perché
  // qui la navigazione è stato React, non history: iOS in standalone non ha una
  // pila di navigazione a cui agganciare il proprio gesto edge-swipe.
  useEffect(() => {
    const back = joinCode ? cancelJoin : view === 'trip' || view === 'import' ? goHome : null
    if (!back) return

    const EDGE_WIDTH = 24
    const SWIPE_THRESHOLD = 70
    let startX = null
    let startY = null

    function onTouchStart(e) {
      const t = e.touches[0]
      if (t.clientX > EDGE_WIDTH) {
        startX = null
        return
      }
      startX = t.clientX
      startY = t.clientY
    }

    function onTouchEnd(e) {
      if (startX === null) return
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      startX = null
      if (dx > SWIPE_THRESHOLD && Math.abs(dy) < dx / 2) back()
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [view, joinCode])

  const persist = useCallback((next) => {
    setTrips(next)
    saveTrips(next)
  }, [])

  function openTrip(id) {
    setActiveTripId(id)
    setView('trip')
  }

  function goHome() {
    setView('home')
    setActiveTripId(null)
  }

  async function createTrip(raw) {
    const trip = normalizeTrip(raw)
    if (isCloudConfigured) {
      try {
        const displayName = await getDisplayNamePreference()
        const state = await activateTripSync(trip, displayName)
        await setSyncState(trip.id, state)
      } catch (e) {
        window.alert(`Non è stato possibile creare il viaggio. Controlla la rete e riprova.\n\n${e.message}`)
        return false
      }
    }
    persist([...trips, trip])
    openTrip(trip.id)
    return true
  }

  async function importTrips(raw) {
    const list = Array.isArray(raw) ? raw : [raw]
    const newTrips = list.map(normalizeTrip)
    if (isCloudConfigured) {
      const displayName = await getDisplayNamePreference()
      try {
        const states = []
        for (const trip of newTrips) {
          const state = await activateTripSync(trip, displayName)
          states.push({ tripId: trip.id, state })
        }
        for (const { tripId, state } of states) {
          await setSyncState(tripId, state)
        }
      } catch (e) {
        window.alert(`Non è stato possibile caricare il viaggio. Controlla la rete e riprova.\n\n${e.message}`)
        return false
      }
    }
    persist([...trips, ...newTrips])
    openTrip(newTrips[0].id)
    return true
  }

  function finishJoin(trip) {
    window.history.replaceState(null, '', '/')
    persist([...trips, trip])
    openTrip(trip.id)
  }

  function cancelJoin() {
    window.history.replaceState(null, '', '/')
    window.location.reload()
  }

  function updateTrip(id, updater) {
    persist(trips.map((t) => (t.id === id ? updater(t) : t)))
  }

  async function deleteTrip(id) {
    const syncState = await getSyncState(id)
    if (syncState) {
      try {
        if (syncState.role === 'editor') {
          await deleteTripAsOwner(syncState.remoteId)
        } else {
          await leaveTripAsMember(syncState.remoteId)
        }
      } catch (e) {
        window.alert(`Non è stato possibile eliminare il viaggio. Controlla la rete e riprova.\n\n${e.message}`)
        return
      }
    }
    persist(trips.filter((t) => t.id !== id))
    goHome()
  }

  if (isAdmin) {
    return <AdminApp />
  }

  if (!authReady) {
    return <LoginGate onReady={() => setAuthReady(true)} />
  }

  if (trips === null) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-[#6E7B72]">Carico i viaggi…</div>
  }

  if (joinCode) {
    return <JoinView code={joinCode} onJoined={finishJoin} onCancel={cancelJoin} />
  }

  if (view === 'import') {
    return <ImportView onImport={importTrips} onCancel={goHome} />
  }

  if (view === 'trip') {
    const trip = trips.find((t) => t.id === activeTripId)
    if (!trip) {
      goHome()
      return null
    }
    return <TripView trip={trip} onBack={goHome} onUpdate={(updater) => updateTrip(trip.id, updater)} onDelete={() => deleteTrip(trip.id)} />
  }

  return <Home trips={trips} onOpen={openTrip} onCreate={createTrip} onImport={() => setView('import')} onDelete={deleteTrip} />
}
