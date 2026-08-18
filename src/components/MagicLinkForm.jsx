import { useState } from 'react'
import Btn from './Btn.jsx'
import { sendMagicLink } from '../data/supabase.js'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-md px-3 py-2 text-sm'

export default function MagicLinkForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await sendMagicLink(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    }
  }

  if (sent) {
    return <p className="text-sm">Controlla la posta di {email}: tocca il link che ti abbiamo mandato, poi torna qui.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <p className="text-sm text-[var(--accent)]">{error}</p>}
      <input
        required
        type="email"
        placeholder="La tua email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      <Btn type="submit">Invia il link di accesso</Btn>
    </form>
  )
}
