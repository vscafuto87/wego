import { useState } from 'react'
import { ArrowLeft, Copy, Check } from 'lucide-react'
import { themeStyle } from '../theme/themes.js'
import Btn from '../components/Btn.jsx'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

const PROMPT = `Trasforma questi appunti di viaggio grezzi in un JSON con questo schema esatto (nessun campo in più, nessuno in meno, a parte i campi condizionati da "kind" e "type" descritti sotto):

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
    { "title": "Ristoranti", "icon": "food", "type": "cards",
      "items": [ { "title": "string", "meta": "string", "detail": "string", "link": "string", "tags": ["string"] } ] },
    { "title": "string", "icon": "check", "type": "checklist",
      "items": [ { "text": "string", "done": false } ] },
    { "title": "string", "icon": "note", "type": "notes", "text": "string" }
  ]
}

Ogni voce di "days[].items[]" può avere anche un campo "kind" opzionale, che determina
quali campi in più aggiungere alla voce (solo quelli del kind scelto, nessun altro):

- "kind": "" (o assente) → voce generica, nessun campo in più.
- "kind": "sentiero" → aggiungi "durata", "dislivello", "difficolta" (string).
  Es: { "time": "9:00", "title": "Salita al rifugio", "kind": "sentiero", "durata": "3h", "dislivello": "800m", "difficolta": "E", "detail": "", "link": "" }
- "kind": "spiaggia" → aggiungi "accesso", "servizi" (string).
  Es: { "time": "", "title": "Cala Fetovaia", "kind": "spiaggia", "accesso": "sentiero 15 min", "servizi": "bar, noleggio", "detail": "", "link": "" }
- "kind": "pasto" → aggiungi "luogo" (string), "prenotato" (boolean).
  Es: { "time": "20:00", "title": "Cena", "kind": "pasto", "luogo": "Trattoria da Mario", "prenotato": true, "detail": "", "link": "" }

Oltre a cards/checklist/notes, "sections[].type" può valere anche "transport", "lodging"
o "map": in quel caso gli "items" hanno la forma specifica del tipo (nessun campo delle
altre forme):

- "type": "transport" → items: { "mode": "string (treno, aereo, aliscafo...)", "from": "string", "to": "string", "date": "AAAA-MM-GG", "time": "HH:MM o vuoto", "ticketLink": "string", "note": "string" }
- "type": "lodging" → items: { "name": "string", "checkIn": "AAAA-MM-GG", "checkOut": "AAAA-MM-GG", "address": "string", "bookingLink": "string", "note": "string" }
- "type": "map" → items: { "name": "string", "category": "string", "mapsLink": "string", "lat": numero o null, "lng": numero o null, "note": "string" }

Regole: i tipi di sezione validi sono cards, checklist, notes, transport, lodging, map
(sei in tutto, non inventarne altri). I campi extra di "kind" e i campi degli items delle
sezioni transport/lodging/map sono le uniche parti condizionate: dipendono da quale kind o
type scegli, non aggiungerli se non pertinenti. Per tutto il resto usa stringhe vuote per i
campi che non conosci, non inventare dati. Rispondi solo con il JSON, senza testo attorno.

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
        <button onClick={onCancel} aria-label="Annulla" className="h-12 w-12 -ml-2 flex items-center justify-center rounded-full bg-[var(--tint)] active:scale-[0.97] transition-transform duration-150 ease-out">
          <ArrowLeft size={21} />
        </button>
        <h1 className="font-display font-semibold text-3xl">Carica il viaggio</h1>
      </header>

      <main className="px-5 max-w-2xl mx-auto flex flex-col gap-4 pb-16">
        <p className="text-base text-[var(--muted)]">
          Incolla il JSON generato da Claude, oppure copia il prompt e incollalo in una chat insieme ai tuoi appunti grezzi.
        </p>

        <Btn variant="secondary" onClick={copyPrompt} className="self-start">
          {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? 'Copiato' : 'Copia il prompt per Claude'}
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
          {error && <p className="text-base text-[var(--accent)]">{error}</p>}
          <Btn type="submit">Carica il viaggio</Btn>
        </form>
      </main>
    </div>
  )
}
