import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import LoginForm from '../components/LoginForm.jsx'
import DisplayNameForm from '../components/DisplayNameForm.jsx'
import Terrain, { TerrainSeal } from '../theme/Terrain.jsx'
import { themeStyle } from '../theme/themes.js'
import { getSession, subscribeAuth, setAccountDisplayName } from '../data/supabase.js'
import { getDisplayNamePreference, setDisplayNamePreference } from '../data/storage.js'

const HEADER_HEIGHT = { loading: 236, login: 236, name: 172 }

export default function LoginGate({ onReady }) {
  const [step, setStep] = useState('loading')
  const [namePreference, setNamePreference] = useState('')

  useEffect(() => {
    let cancelled = false

    async function checkReady(session) {
      // Bypass solo per sviluppo locale (mai in build/produzione: import.meta.env.DEV
      // è sempre false fuori da `npm run dev`), per verificare le schermate senza login.
      if (import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_LOGIN === 'true') {
        onReady()
        return
      }
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
      // Reinstall o nuovo device sullo stesso account: il nome non è su questo
      // device ma può già essere sull'account (salvato lì da un login
      // precedente). Se c'è, lo riusiamo invece di richiederlo di nuovo.
      const remoteName = session?.user?.user_metadata?.display_name
      if (session && remoteName) {
        await setDisplayNamePreference(remoteName)
        if (cancelled) return
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
    setAccountDisplayName(name).catch(() => {})
    onReady()
  }

  const headerHeight = HEADER_HEIGHT[step]

  return (
    <div style={themeStyle('mountain')} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans flex flex-col">
      <div className="relative flex-shrink-0 overflow-hidden" style={{ height: headerHeight }}>
        <Terrain seed="wego" palette="mountain" height={headerHeight} className="absolute inset-0 h-full w-full" />
        <div
          className="relative h-full max-w-2xl mx-auto flex flex-col items-center gap-3.5"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 56px)' }}
        >
          {step === 'name' ? (
            <>
              <span className="font-mono text-xs tracking-widest text-[var(--muted)]">PASSO 2 DI 2</span>
              <span className="flex items-center gap-2 bg-[var(--tint)] rounded-full pl-2.5 pr-4 py-2">
                <span className="h-[22px] w-[22px] rounded-full bg-[var(--accent2)] flex items-center justify-center flex-shrink-0">
                  <Check size={13} className="text-[var(--card)]" strokeWidth={3} />
                </span>
                <span className="text-sm font-medium">Sei dentro.</span>
              </span>
            </>
          ) : (
            <>
              <div className="h-[60px] w-[60px] rounded-full bg-[var(--tint)] flex items-center justify-center">
                <TerrainSeal seed="wego" palette="mountain" size={60} />
              </div>
              <h1 className="font-display font-semibold text-4xl tracking-wide">WeGo</h1>
              <p className="text-sm text-[var(--muted)]">Itinerario, biglietti e programma — anche offline.</p>
            </>
          )}
        </div>
      </div>

      <div className="relative -mt-7 flex-1 bg-[var(--card)] border-t border-[var(--line)] rounded-t-[32px] shadow-[0_-8px_24px_rgb(var(--ink-rgb)/0.05)]">
        <div className="max-w-2xl mx-auto px-6 pt-7 pb-8">
          {step === 'loading' && <p className="text-sm text-[var(--muted)]">Un attimo…</p>}
          {step === 'login' && <LoginForm />}
          {step === 'name' && <DisplayNameForm initialValue={namePreference} onSubmit={handleName} />}
        </div>
      </div>
    </div>
  )
}
