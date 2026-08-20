import { useEffect, useState } from 'react'
import MagicLinkForm from '../components/MagicLinkForm.jsx'
import DisplayNameForm from '../components/DisplayNameForm.jsx'
import { getSession, subscribeAuth } from '../data/supabase.js'
import { getDisplayNamePreference, setDisplayNamePreference } from '../data/storage.js'

export default function LoginGate({ onReady }) {
  const [step, setStep] = useState('loading')
  const [namePreference, setNamePreference] = useState('')

  useEffect(() => {
    let cancelled = false

    async function checkReady(session) {
      const name = await getDisplayNamePreference()
      if (cancelled) return
      if (session && name) {
        onReady()
        return
      }
      setNamePreference(name)
      setStep(session ? 'name' : 'email')
    }

    getSession().then(checkReady)
    const unsubscribe = subscribeAuth(checkReady)
    return () => { cancelled = true; unsubscribe() }
  }, [onReady])

  async function handleName(name) {
    await setDisplayNamePreference(name)
    onReady()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 font-sans">
      <div className="max-w-sm w-full flex flex-col gap-4">
        <h1 className="font-display text-2xl">Accedi a WeGo</h1>
        {step === 'loading' && <p className="text-sm text-[var(--muted)]">Un attimo…</p>}
        {step === 'email' && (
          <>
            <p className="text-sm text-[var(--muted)]">Serve un account per vedere e sincronizzare i tuoi viaggi.</p>
            <MagicLinkForm />
          </>
        )}
        {step === 'name' && <DisplayNameForm initialValue={namePreference} onSubmit={handleName} />}
      </div>
    </div>
  )
}
