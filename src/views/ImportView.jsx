import { useState } from 'react'
import { ArrowLeft, Copy, Check } from 'lucide-react'
import { themeStyle } from '../theme/themes.js'
import Btn from '../components/Btn.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

const PROMPT = `Trasforma questi appunti di viaggio grezzi in un JSON con questo schema esatto (nessun campo in più, nessuno in meno):

{
  "name": "string",
  "emoji": "un solo emoji",
  "place": "string",
  "start": "AAAA-MM-GG",
  "end": "AAAA-MM-GG",
  "palette": "mountain | sea | city | wild",
  "people": ["string"],
  "days": [
    { "date": "AAAA-MM-GG", "title": "string", "note": "string",
      "items": [ { "time": "HH:MM o vuoto", "title": "string", "detail": "string", "link": "string o vuoto" } ] }
  ],
  "sections": [
    { "title": "string", "icon": "map|check|note|ticket|food|bed|bus|star|people", "type": "cards",
      "items": [ { "title": "string", "meta": "string", "detail": "string", "link": "string", "tags": ["string"] } ] },
    { "title": "string", "icon": "check", "type": "checklist",
      "items": [ { "text": "string", "done": false } ] },
    { "title": "string", "icon": "note", "type": "notes", "text": "string" }
  ]
}

Regole: solo i tre tipi di sezione cards/checklist/notes. Usa stringhe vuote per i campi che non conosci, non inventare dati. Rispondi solo con il JSON, senza testo attorno.

Appunti:
`

export default function ImportView({ onImport, onCancel }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  function submit(e) {
    e.preventDefault()
    setError('')
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      setError('Il testo non è un JSON valido: controlla di averlo copiato per intero.')
      return
    }
    try {
      onImport(parsed)
    } catch (err) {
      setError(err.message)
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={themeStyle('mountain')} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans">
      <header className="px-5 pt-8 pb-4 flex items-center gap-3 max-w-2xl mx-auto">
        <button onClick={onCancel} aria-label="Annulla" className="min-h-11 min-w-11 -ml-2 flex items-center justify-center rounded-full bg-[var(--tint)] active:scale-[0.97] transition-transform duration-150 ease-out">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display text-2xl">Carica il viaggio</h1>
      </header>

      <main className="px-5 max-w-2xl mx-auto flex flex-col gap-4 pb-16">
        <p className="text-sm text-[var(--muted)]">
          Incolla il JSON generato da Claude, oppure copia il prompt e incollalo in una chat insieme ai tuoi appunti grezzi.
        </p>

        <Btn variant="secondary" onClick={copyPrompt} className="self-start">
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiato' : 'Copia il prompt per Claude'}
        </Btn>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <textarea
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Incolla qui il JSON del viaggio"
            rows={14}
            className={inputClass}
          />
          {error && <p className="text-sm text-[var(--accent)]">{error}</p>}
          <Btn type="submit">Carica il viaggio</Btn>
        </form>
      </main>
    </div>
  )
}
