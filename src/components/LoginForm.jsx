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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
      <h2 className="font-display font-semibold text-2xl mb-1">Accedi</h2>
      {error && <p className="text-base text-[var(--accent)]">{error}</p>}
      <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      <input required type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      <Btn type="submit" disabled={loading} className="self-start">
        {loading ? 'Accesso in corso…' : 'Accedi'}
      </Btn>
    </form>
  )
}
