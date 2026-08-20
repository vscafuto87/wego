import { useCallback, useEffect, useState } from 'react'
import { loadTrips, saveTrips } from '../data/storage.js'
import { normalizeTrip } from '../data/schema.js'
import AdminTripList from './AdminTripList.jsx'
import AdminTripEditor from './AdminTripEditor.jsx'

export default function AdminApp() {
  const [trips, setTrips] = useState(null)
  const [activeTripId, setActiveTripId] = useState(null)

  useEffect(() => {
    loadTrips().then(setTrips)
  }, [])

  const persist = useCallback((next) => {
    setTrips(next)
    saveTrips(next)
  }, [])

  function createTrip(raw) {
    const trip = normalizeTrip(raw)
    persist([...trips, trip])
    setActiveTripId(trip.id)
  }

  function updateTrip(id, updater) {
    persist(trips.map((t) => (t.id === id ? updater(t) : t)))
  }

  function deleteTrip(id) {
    persist(trips.filter((t) => t.id !== id))
    setActiveTripId(null)
  }

  if (trips === null) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-[#6E7B72]">Carico i viaggi…</div>
  }

  if (activeTripId) {
    const trip = trips.find((t) => t.id === activeTripId)
    if (!trip) {
      setActiveTripId(null)
      return null
    }
    return (
      <AdminTripEditor
        trip={trip}
        onBack={() => setActiveTripId(null)}
        onUpdate={(updater) => updateTrip(trip.id, updater)}
        onDelete={() => deleteTrip(trip.id)}
      />
    )
  }

  return <AdminTripList trips={trips} onSelect={setActiveTripId} onCreate={createTrip} />
}
