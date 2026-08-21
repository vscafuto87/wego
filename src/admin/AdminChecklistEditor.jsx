import { useState } from 'react'
import { Plus, Check } from 'lucide-react'
import DeleteIcon from '../components/DeleteIcon.jsx'
import { stampModified } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

export default function AdminChecklistEditor({ section, onUpdate, activeDisplayName }) {
  const [text, setText] = useState('')

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function addItem(e) {
    e.preventDefault()
    if (!text.trim()) return
    updateItems((items) => [...items, stampModified({ id: crypto.randomUUID(), text: text.trim(), done: false }, activeDisplayName)])
    setText('')
  }

  function toggleItem(item) {
    updateItems((items) => items.map((it) => (it.id === item.id ? stampModified({ ...it, done: !it.done }, activeDisplayName) : it)))
  }

  function removeItem(item) {
    updateItems((items) => items.filter((it) => it.id !== item.id))
  }

  return (
    <div className="max-w-xl flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-[var(--line)] bg-[var(--card)] border border-[var(--line)] rounded-2xl overflow-hidden">
        {section.items.length === 0 && <li className="px-4 py-3.5 text-base text-[var(--muted)]">Niente da spuntare ancora.</li>}
        {section.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <button onClick={() => toggleItem(item)} aria-pressed={item.done} aria-label={item.done ? 'Segna come da fare' : 'Segna come fatto'} className="flex items-center justify-center">
              <span className={`h-5 w-5 rounded border flex items-center justify-center ${item.done ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--line)]'}`}>
                {item.done && <Check size={14} className="text-[var(--paper)]" />}
              </span>
            </button>
            <span className={`flex-1 text-base ${item.done ? 'line-through text-[var(--muted)]' : ''}`}>{item.text}</span>
            <button onClick={() => removeItem(item)} aria-label="Elimina voce" className="p-1.5 text-[var(--muted)]">
              <DeleteIcon size={15} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={addItem} className="flex gap-2">
        <input placeholder="Nuova voce" value={text} onChange={(e) => setText(e.target.value)} className={`flex-1 ${inputClass}`} />
        <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-12 px-5 bg-[var(--tint)]">
          <Plus size={17} />
        </button>
      </form>
    </div>
  )
}
