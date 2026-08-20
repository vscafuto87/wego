import { useState } from 'react'
import { stampModified } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

export default function AdminNotesEditor({ section, onUpdate, activeDisplayName }) {
  const [draft, setDraft] = useState(section.text ?? '')

  function save() {
    onUpdate((t) => ({
      ...t,
      sections: t.sections.map((s) => (s.id === section.id ? stampModified({ ...s, text: draft }, activeDisplayName) : s))
    }))
  }

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      placeholder="Scrivi qui le tue note."
      rows={16}
      className={`${inputClass} w-full max-w-2xl font-sans`}
    />
  )
}
