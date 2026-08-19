import { useState } from 'react'
import { parseCoordsFromMapsLink } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

export default function CoordsInput({ value, onChange }) {
  const [link, setLink] = useState('')
  const [status, setStatus] = useState(null)
  const [manualOpen, setManualOpen] = useState(value.lat !== null || value.lng !== null)

  function handleLinkBlur() {
    if (!link.trim()) {
      setStatus(null)
      return
    }
    const coords = parseCoordsFromMapsLink(link)
    if (coords) {
      onChange(coords)
      setStatus('found')
      setManualOpen(true)
    } else {
      setStatus('not-found')
      setManualOpen(true)
    }
  }

  function setLat(raw) {
    onChange({ lat: raw === '' ? null : Number(raw), lng: value.lng })
  }

  function setLng(raw) {
    onChange({ lat: value.lat, lng: raw === '' ? null : Number(raw) })
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Incolla un link Maps per leggere le coordinate"
        value={link}
        onChange={(e) => { setLink(e.target.value); setStatus(null) }}
        onBlur={handleLinkBlur}
        className={inputClass}
      />
      {status === 'found' && <p className="text-sm text-[var(--accent2)]">📍 coordinate trovate</p>}
      {status === 'not-found' && (
        <p className="text-sm text-[var(--muted)]">
          Non riesco a leggere le coordinate da questo link. Aprilo in Maps e copia il link completo dalla barra, oppure inseriscile a mano.
        </p>
      )}
      {!manualOpen && (
        <button type="button" onClick={() => setManualOpen(true)} className="self-start text-sm text-[var(--accent)] underline">
          Inserisci coordinate a mano
        </button>
      )}
      {manualOpen && (
        <div className="flex gap-2">
          <input
            type="number" step="any" placeholder="Latitudine"
            value={value.lat ?? ''} onChange={(e) => setLat(e.target.value)}
            className={`flex-1 ${inputClass}`}
          />
          <input
            type="number" step="any" placeholder="Longitudine"
            value={value.lng ?? ''} onChange={(e) => setLng(e.target.value)}
            className={`flex-1 ${inputClass}`}
          />
        </div>
      )}
    </div>
  )
}
