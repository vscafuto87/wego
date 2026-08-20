import { useState } from 'react'
import Btn from '../components/Btn.jsx'
import { joinTripByCode } from '../data/sync.js'
import { getDisplayNamePreference, setSyncState } from '../data/storage.js'

export default function JoinView({ code, onJoined, onCancel }) {
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  async function handleJoin() {
    setError('')
    setJoining(true)
    try {
      const name = await getDisplayNamePreference()
      const { trip, syncState } = await joinTripByCode(code, name)
      await setSyncState(trip.id, syncState)
      onJoined(trip)
    } catch (e) {
      setError(e.message)
      setJoining(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 font-sans">
      <div className="max-w-sm w-full flex flex-col gap-4">
        <h1 className="font-display text-2xl">Ti hanno invitato a un viaggio</h1>
        <p className="text-sm text-[var(--muted)]">Codice: {code}</p>
        {error && <p className="text-sm text-[var(--accent)]">{error}</p>}
        <Btn onClick={handleJoin} disabled={joining}>{joining ? 'Un attimo…' : 'Unisciti al viaggio'}</Btn>
        <Btn variant="ghost" onClick={onCancel}>Annulla</Btn>
      </div>
    </div>
  )
}
