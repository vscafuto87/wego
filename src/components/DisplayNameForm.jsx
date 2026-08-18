import { useState } from 'react'
import Btn from './Btn.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-md px-3 py-2 text-sm'

export default function DisplayNameForm({ initialValue, onSubmit }) {
  const [name, setName] = useState(initialValue || '')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        required
        placeholder="Come ti chiamiamo?"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />
      <Btn type="submit">Continua</Btn>
    </form>
  )
}
