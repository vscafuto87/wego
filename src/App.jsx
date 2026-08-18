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
