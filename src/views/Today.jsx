import { ArrowRight } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import DayLabel from '../components/DayLabel.jsx'
import Empty from '../components/Empty.jsx'
import ModifiedBy from '../components/ModifiedBy.jsx'
import { DayItemsList } from './Days.jsx'
import { collectExternalDayItems } from '../data/schema.js'

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })

// Data locale AAAA-MM-GG: toISOString() convertirebbe in UTC e sbaglierebbe
// giorno nei fusi avanti su UTC (es. l'Italia in agosto).
function todayString() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// Differenza in giorni tra due date AAAA-MM-GG: positiva se dateStr è nel futuro.
function daysDiff(dateStr, todayStr) {
  return Math.round((new Date(`${dateStr}T00:00:00`) - new Date(`${todayStr}T00:00:00`)) / 86400000)
}

function relativeDayLabel(diff) {
  if (diff === 0) return 'Oggi'
  if (diff > 0) return diff === 1 ? 'Tra 1 giorno' : `Tra ${diff} giorni`
  const past = -diff
  return past === 1 ? '1 giorno fa' : `${past} giorni fa`
}

// Il giorno più vicino a oggi: coincide con "oggi" quando c'è una voce per la
// data corrente, altrimenti è il prossimo giorno in arrivo o l'ultimo passato.
function closestDay(days, todayStr) {
  return days.reduce((best, d) => (Math.abs(daysDiff(d.date, todayStr)) < Math.abs(daysDiff(best.date, todayStr)) ? d : best), days[0])
}

export default function Today({ trip, onNavigate }) {
  if (trip.days.length === 0) {
    return (
      <div className="pt-5">
        <Empty
          title="Nessun giorno ancora"
          detail="Aggiungi il primo giorno nell'itinerario per vedere qui le attività di oggi."
          action={<Btn onClick={() => onNavigate('days')}>Vai all'itinerario</Btn>}
        />
      </div>
    )
  }

  const todayStr = todayString()
  const day = closestDay(trip.days, todayStr)
  const diff = daysDiff(day.date, todayStr)
  const transportItems = collectExternalDayItems(trip).filter((i) => i.date === day.date)

  return (
    <div className="flex flex-col gap-3 pt-5">
      <div>
        <DayLabel>{relativeDayLabel(diff)} · {DATE_FMT.format(new Date(`${day.date}T00:00:00`))}</DayLabel>
        <p className="font-display font-semibold text-2xl mt-2">{day.title || 'Senza titolo'}</p>
        {day.note && <p className="text-base text-[var(--muted)] mt-1">{day.note}</p>}
        <ModifiedBy modifiedBy={day.modifiedBy} modifiedAt={day.modifiedAt} />
      </div>

      {day.items.length > 0 || transportItems.length > 0 ? (
        <DayItemsList day={day} transportItems={transportItems} onNavigate={onNavigate} />
      ) : (
        <Empty title="Nessuna attività" detail="Questo giorno non ha ancora voci in itinerario." />
      )}

      <Btn variant="secondary" onClick={() => onNavigate('days')} className="self-start">
        Vai all'itinerario <ArrowRight size={17} />
      </Btn>
    </div>
  )
}
