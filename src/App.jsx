import { useCallback, useEffect, useState } from 'react'
import { loadTrips, saveTrips } from './data/storage.js'
import { normalizeTrip } from './data/schema.js'
import Home from './views/Home.jsx'
import TripView from './views/TripView.jsx'
import ImportView from './views/ImportView.jsx'
import JoinView from './views/JoinView.jsx'

export default function App() {
  const [trips, setTrips] = useState(null)
  const [view, setView] = useState('home')
  const [activeTripId, setActiveTripId] = useState(null)

  const [joinCode] = useState(() => {
    const match = window.location.pathname.match(/^\/j\/([A-Za-z0-9]{6})$/)
    return match ? match[1] : null
  })

  useEffect(() => {
    loadTrips().then(setTrips)
  }, [])

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

  function createTrip(raw) {
    const trip = normalizeTrip(raw)
    persist([...trips, trip])
    openTrip(trip.id)
  }

  function importTrips(raw) {
    const list = Array.isArray(raw) ? raw : [raw]
    const newTrips = list.map(normalizeTrip)
    persist([...trips, ...newTrips])
    openTrip(newTrips[0].id)
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

  function deleteTrip(id) {
    persist(trips.filter((t) => t.id !== id))
    goHome()
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
