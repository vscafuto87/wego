import { useMemo } from 'react'
import { collectExternalMapPoints } from '../data/schema.js'

const CATEGORY_LABELS = { schede: 'Scheda', lodging: 'Pernottamento', sentiero: 'Sentiero', spiaggia: 'Spiaggia', pasto: 'Pasto' }

// Sola lettura: la Mappa non ha più punti propri. I punti si aggiungono
// dalle sezioni di origine (Ristoranti, Pernottamento, Itinerario), qui si
// vede solo l'anteprima di quello che finirà sulla mappa aggregata dell'app.
export default function AdminMapEditor({ trip }) {
  const points = useMemo(() => collectExternalMapPoints(trip), [trip])

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-[var(--muted)]">
        I punti si aggiungono dalle sezioni Ristoranti, Pernottamento e Itinerario, dando loro coordinate o (per il Pernottamento) un indirizzo.
      </p>
      {points.length === 0 && <p className="text-base text-[var(--muted)]">Nessun punto ancora.</p>}
      {points.map((point) => (
        <div key={`${point.categoryGroup}-${point.id}`} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display font-semibold text-xl">{point.name || 'Senza nome'}</p>
            <span className="text-sm text-[var(--muted)] flex-shrink-0">{CATEGORY_LABELS[point.categoryGroup] ?? point.categoryGroup}</span>
          </div>
          {point.origin?.sectionTitle && <p className="text-sm text-[var(--muted)] mt-1">{point.origin.sectionTitle}</p>}
          {point.lat !== null && point.lng !== null
            ? <p className="font-mono text-sm text-[var(--muted)] mt-1">{point.lat}, {point.lng}</p>
            : point.address && <p className="text-sm text-[var(--muted)] mt-1">{point.address} (indirizzo, senza coordinate salvate)</p>}
        </div>
      ))}
    </div>
  )
}
