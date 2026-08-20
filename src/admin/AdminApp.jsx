import { useCallback, useEffect, useState } from 'react'
import { loadTrips, saveTrips } from '../data/storage.js'
import { normalizeTrip } from '../data/schema.js'
import { getSession, subscribeAuth, signOut } from '../data/supabase.js'
import { themeStyle } from '../theme/themes.js'
import LoginForm from '../components/LoginForm.jsx'
import AdminTripList from './AdminTripList.jsx'
import AdminTripEditor from './AdminTripEditor.jsx'

function isAdminSession(session) {
  return Boolean(session?.user?.app_metadata?.is_admin)
}

export default function AdminApp() {
  const [trips, setTrips] = useState(null)
  const [activeTripId, setActiveTripId] = useState(null)
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    loadTrips().then(setTrips)
  }, [])

  useEffect(() => {
    let cancelled = false
    getSession().then((s) => { if (!cancelled) setSession(s) })
    const unsubscribe = subscribeAuth((s) => { if (!cancelled) setSession(s) })
    return () => { cancelled = true; unsubscribe() }
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

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-[#6E7B72]">Verifico l'accesso…</div>
  }

  if (!session) {
    return (
      <div style={themeStyle('mountain')} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans flex items-center justify-center px-6">
        <div className="max-w-sm w-full flex flex-col gap-4">
          <h1 className="font-display font-semibold text-4xl">Dashboard admin</h1>
          <LoginForm />
        </div>
      </div>
    )
  }

  if (!isAdminSession(session)) {
    return (
      <div style={themeStyle('mountain')} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans flex items-center justify-center px-6">
        <div className="max-w-sm w-full flex flex-col gap-4 text-center">
          <p className="text-base">Questo account non ha accesso alla dashboard admin.</p>
          <button onClick={signOut} className="text-base text-[var(--accent)] underline">Esci</button>
        </div>
      </div>
    )
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

  return <AdminTripList trips={trips} onSelect={setActiveTripId} onCreate={createTrip} onLogout={signOut} />
}
