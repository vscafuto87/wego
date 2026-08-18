import { useEffect, useState } from 'react'
import Btn from '../components/Btn.jsx'
import MagicLinkForm from '../components/MagicLinkForm.jsx'
import DisplayNameForm from '../components/DisplayNameForm.jsx'
import { subscribeAuth, getSession } from '../data/supabase.js'
import { joinTripByCode } from '../data/sync.js'
import { getDisplayNamePreference, setDisplayNamePreference, setSyncState } from '../data/storage.js'

export default function JoinView({ code, onJoined, onCancel }) {
  const [step, setStep] = useState('email')
  const [namePreference, setNamePreference] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getDisplayNamePreference().then(setNamePreference)
    getSession().then((session) => { if (session) setStep((s) => (s === 'email' ? 'name' : s)) })
    const unsubscribe = subscribeAuth((session) => { if (session) setStep((s) => (s === 'email' ? 'name' : s)) })
    return unsubscribe
  }, [])

  async function handleName(name) {
    setError('')
    await setDisplayNamePreference(name)
    try {
      const { trip, syncState } = await joinTripByCode(code, name)
      await setSyncState(trip.id, syncState)
      onJoined(trip)
    } catch (e) {
      setError(e.message)
      setStep('name')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 font-sans">
      <div className="max-w-sm w-full flex flex-col gap-4">
        <h1 className="font-display text-2xl">Ti hanno invitato a un viaggio</h1>
        <p className="text-sm text-[var(--muted)]">Codice: {code}</p>
        {step === 'email' && <MagicLinkForm />}
        {step === 'name' && (
          <>
            {error && <p className="text-sm text-[var(--accent)]">{error}</p>}
            <DisplayNameForm initialValue={namePreference} onSubmit={handleName} />
          </>
        )}
        <Btn variant="ghost" onClick={onCancel}>Annulla</Btn>
      </div>
    </div>
  )
}
