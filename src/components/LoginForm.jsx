import { useState } from 'react'
import Btn from './Btn.jsx'
import { signInWithPassword } from '../data/supabase.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithPassword(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div>
        <h2 className="font-display font-semibold text-2xl">Accedi</h2>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">Serve un account per vedere e sincronizzare i tuoi viaggi.</p>
      </div>
      {error && <p className="text-sm text-[var(--accent)]">{error}</p>}
      <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      <input required type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      <Btn type="submit" disabled={loading} className="w-full mt-1.5">
        {loading ? 'Accesso in corso…' : 'Accedi'}
      </Btn>
      <p className="text-xs text-[var(--muted)] text-center leading-relaxed">
        Non hai le credenziali?<br />Te le dà chi ha organizzato il viaggio.
      </p>
    </form>
  )
}
