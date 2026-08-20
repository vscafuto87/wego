import { useEffect, useState } from 'react'
import LoginForm from '../components/LoginForm.jsx'
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
      if (!navigator.onLine && name) {
        // Offline e già entrato una volta su questo device (c'è un nome
        // salvato): la sessione può risultare vuota solo perché il token è
        // scaduto e non c'è rete per rinnovarlo, non perché non si è mai
        // fatto login. L'offline è il requisito principale di questa app:
        // non si blocca l'accesso ai dati già sul device per questo.
        onReady()
        return
      }
      setNamePreference(name)
      setStep(session ? 'name' : 'login')
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
        {step === 'login' && (
          <>
            <p className="text-sm text-[var(--muted)]">Serve un account per vedere e sincronizzare i tuoi viaggi.</p>
            <LoginForm />
          </>
        )}
        {step === 'name' && <DisplayNameForm initialValue={namePreference} onSubmit={handleName} />}
      </div>
    </div>
  )
}
