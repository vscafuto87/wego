import { useCallback, useEffect, useState } from 'react'
import { loadTrips, saveTrips } from '../data/storage.js'
import { bootstrapSyncedTrips } from '../data/sync.js'
import { normalizeTrip } from '../data/schema.js'
import { getSession, subscribeAuth, signOut, isCloudConfigured } from '../data/supabase.js'
import { themeStyle } from '../theme/themes.js'
import LoginForm from '../components/LoginForm.jsx'
import AdminTripList from './AdminTripList.jsx'
import AdminTripEditor from './AdminTripEditor.jsx'
import AdminUserList from './AdminUserList.jsx'

function isAdminSession(session) {
  return session?.user?.app_metadata?.is_admin === true
}

export default function AdminApp() {
  const [trips, setTrips] = useState(null)
  const [activeTripId, setActiveTripId] = useState(null)
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('trips')

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      if (!isCloudConfigured) {
        const local = await loadTrips()
        if (!cancelled) setTrips(local)
        return
      }
      const finalTrips = await bootstrapSyncedTrips()
      if (!cancelled) setTrips(finalTrips)
    }
    bootstrap()
    return () => { cancelled = true }
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

  return (
    <div style={themeStyle('mountain')} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans">
      <div className="max-w-5xl mx-auto px-6 pt-10 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display font-semibold text-4xl mb-3">Dashboard admin</h1>
          <div className="inline-flex items-center gap-1 bg-[var(--card)] border border-[var(--line)] rounded-full p-1">
            <button onClick={() => setTab('trips')} className={`px-4 py-2 rounded-full text-base ${tab === 'trips' ? 'bg-[var(--tint)] font-medium' : ''}`}>Viaggi</button>
            <button onClick={() => setTab('users')} className={`px-4 py-2 rounded-full text-base ${tab === 'users' ? 'bg-[var(--tint)] font-medium' : ''}`}>Utenti</button>
          </div>
        </div>
        <button onClick={signOut} className="text-base text-[var(--muted)] underline">Esci</button>
      </div>
      <div className="max-w-5xl mx-auto px-6 py-6">
        {tab === 'trips'
          ? <AdminTripList trips={trips} onSelect={setActiveTripId} onCreate={createTrip} />
          : <AdminUserList />}
      </div>
    </div>
  )
}
