import { useState } from 'react'
import Btn from './Btn.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

export default function DisplayNameForm({ initialValue, onSubmit }) {
  const [name, setName] = useState(initialValue || '')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div>
        <h2 className="font-display font-semibold text-2xl">Come ti chiamiamo?</h2>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          Comparirà accanto alle modifiche che condividi con gli altri, così sanno chi ha aggiornato cosa.
        </p>
      </div>
      <input
        required
        placeholder="Es. Marco"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />
      <p className="text-xs text-[var(--muted)] -mt-1.5">Te lo chiediamo una sola volta su questo dispositivo.</p>
      <Btn type="submit" className="w-full mt-1.5">Continua</Btn>
    </form>
  )
}
