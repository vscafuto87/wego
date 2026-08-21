import { useEffect, useState } from 'react'
import { ArrowRight, Bus, Utensils, Check, Sun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import DayLabel from '../components/DayLabel.jsx'
import Empty from '../components/Empty.jsx'
import ModifiedBy from '../components/ModifiedBy.jsx'
import { KIND_ICONS, sentieroStats, DayItemCard, TransportDayCard, RestaurantDayCard, DayItemsList } from './Days.jsx'
import { collectExternalDayItems } from '../data/schema.js'
import { getTodayWeather, weatherIcon } from '../data/weather.js'

const WEATHER_ICONS = { sun: Sun, cloud: Cloud, fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning }

// Meteo attuale del luogo del viaggio, solo per il giorno che è davvero oggi:
// fallisce in silenzio (offline, place non geocodificabile) restando null.
function useTodayWeather(trip, isToday) {
  const [weather, setWeather] = useState(null)

  useEffect(() => {
    if (!isToday) {
      setWeather(null)
      return
    }
    let cancelled = false
    getTodayWeather(trip).then((result) => {
      if (!cancelled) setWeather(result)
    })
    return () => {
      cancelled = true
    }
  }, [trip.id, trip.place, isToday])

  return weather
}

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })

// Data locale AAAA-MM-GG: toISOString() convertirebbe in UTC e sbaglierebbe
// giorno nei fusi avanti su UTC (es. l'Italia in agosto).
function todayString() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function nowTimeString() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
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

const DAYPARTS = [
  { key: 'mattina', label: 'Mattina', match: (t) => !!t && t < '12:00' },
  { key: 'pomeriggio', label: 'Pomeriggio', match: (t) => !!t && t >= '12:00' && t < '18:00' },
  { key: 'sera', label: 'Sera', match: (t) => !!t && t >= '18:00' },
  { key: 'senzaOrario', label: 'Senza orario', match: (t) => !t }
]

// Raggruppa voci del giorno e voci esterne (trasporti/ristoranti) in fasce
// orarie, mantenendo l'ordine manuale relativo dentro ogni fascia (le voci
// esterne, che non hanno un ordine manuale, si ordinano per orario dentro la
// propria fascia).
function groupByDaypart(items, externalItems) {
  const buckets = Object.fromEntries(DAYPARTS.map((d) => [d.key, { items: [], externalItems: [] }]))
  for (const item of items) buckets[DAYPARTS.find((d) => d.match(item.time)).key].items.push(item)
  for (const item of externalItems) buckets[DAYPARTS.find((d) => d.match(item.time)).key].externalItems.push(item)
  for (const key of Object.keys(buckets)) buckets[key].externalItems.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  return DAYPARTS.map((d) => ({ key: d.key, label: d.label, ...buckets[d.key] })).filter((g) => g.items.length > 0 || g.externalItems.length > 0)
}

// Tra le voci già iniziate (orario <= ora) l'ultima è "in corso", le
// precedenti sono "fatte". Le voci future o senza orario restano "da fare"
// implicitamente (non compaiono in nessuna delle due mappe). Ha senso solo
// quando il giorno mostrato è davvero oggi.
function computeStatus(groups, isToday) {
  if (!isToday) return { currentId: null, doneIds: new Set() }
  const now = nowTimeString()
  let currentId = null
  let currentTime = null
  const doneIds = new Set()
  for (const entry of groups.flatMap((g) => [...g.items, ...g.externalItems])) {
    if (!entry.time || entry.time > now) continue
    if (currentTime === null || entry.time >= currentTime) {
      if (currentId !== null) doneIds.add(currentId)
      currentId = entry.id
      currentTime = entry.time
    } else {
      doneIds.add(entry.id)
    }
  }
  return { currentId, doneIds }
}

function AgendaRow({ entry, kind, done }) {
  const Icon = kind === 'transport' ? Bus : kind === 'card' ? Utensils : (KIND_ICONS[entry.kind] ?? KIND_ICONS[''])
  return (
    <li className={`flex items-center gap-3 px-3.5 py-3 ${done ? 'opacity-[0.55]' : ''}`}>
      <span className="h-8 w-8 rounded-full bg-[var(--tint)] flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-[var(--accent)]" />
      </span>
      {entry.time && <span className="font-mono text-[12.5px] text-[var(--muted)] w-11 flex-shrink-0">{entry.time}</span>}
      <span className={`flex-1 text-sm truncate ${done ? 'line-through decoration-[var(--line)]' : ''}`}>{entry.title}</span>
      {kind === 'day' && entry.kind === 'pasto' && entry.prenotato && (
        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--accent2)] text-[var(--paper)] text-[11px] font-medium flex-shrink-0">
          <Check size={9} /> Prenotato
        </span>
      )}
    </li>
  )
}

// Una fascia oraria: le voci non in corso stanno in una lista compatta
// raggruppata, quella in corso (se c'è) si stacca come card completa, con
// tutti i dettagli (km/dislivello, link, prenotazione) — l'unica voce che
// merita lo spazio di una card intera in questa vista.
function AgendaGroup({ group, currentId, doneIds, onNavigate }) {
  const rows = [
    ...group.items.map((entry) => ({ entry, kind: 'day' })),
    ...group.externalItems.map((entry) => ({ entry, kind: entry.type }))
  ].filter(({ entry }) => entry.id !== currentId)
  const current = [...group.items, ...group.externalItems].find((entry) => entry.id === currentId)
  const currentExternal = group.externalItems.find((e) => e.id === current?.id)

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[11px] font-medium tracking-widest uppercase text-[var(--muted)] ml-1">{group.label}</p>
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--line)] bg-[var(--card)] rounded-[24px] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05)] overflow-hidden">
          {rows.map(({ entry, kind }) => (
            <AgendaRow key={entry.id} entry={entry} kind={kind} done={doneIds.has(entry.id)} />
          ))}
        </ul>
      )}
      {current && (
        currentExternal
          ? currentExternal.type === 'transport'
            ? <TransportDayCard item={current} onNavigate={onNavigate} />
            : <RestaurantDayCard item={current} onNavigate={onNavigate} />
          : <DayItemCard item={current} />
      )}
    </div>
  )
}

export default function Today({ trip, onNavigate }) {
  const todayStr = todayString()
  const day = trip.days.length > 0 ? closestDay(trip.days, todayStr) : null
  const isToday = day ? daysDiff(day.date, todayStr) === 0 : false
  const weather = useTodayWeather(trip, isToday)

  if (!day) {
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

  const diff = daysDiff(day.date, todayStr)
  const WeatherIcon = weather ? WEATHER_ICONS[weatherIcon(weather.code)] : null
  const externalItems = collectExternalDayItems(trip).filter((i) => i.date === day.date)
  const hasContent = day.items.length > 0 || externalItems.length > 0
  const groups = isToday ? groupByDaypart(day.items, externalItems) : []
  const { currentId, doneIds } = computeStatus(groups, isToday)
  const totalCount = day.items.length + externalItems.length
  const statoLabel = currentId ? 'ora' : (totalCount > 0 ? 'a breve' : '—')

  return (
    <div className="flex flex-col gap-5 pt-5">
      <div>
        <DayLabel>{relativeDayLabel(diff)} · {DATE_FMT.format(new Date(`${day.date}T00:00:00`))}</DayLabel>
        <div className="flex items-center gap-2 mt-2">
          <p className="font-display font-semibold text-2xl">{day.title || 'Senza titolo'}</p>
          {WeatherIcon && (
            <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--tint)] font-mono text-[13px] flex-shrink-0">
              <WeatherIcon size={14} className="text-[var(--accent)]" />
              {Math.round(weather.temp)}°
            </span>
          )}
        </div>
        {day.note && <p className="text-base text-[var(--muted)] mt-1">{day.note}</p>}
        <ModifiedBy modifiedBy={day.modifiedBy} modifiedAt={day.modifiedAt} />
      </div>

      {!hasContent && <Empty title="Nessuna attività" detail="Questo giorno non ha ancora voci in itinerario." />}

      {hasContent && isToday && (
        <>
          <div className="flex bg-[var(--card)] rounded-[24px] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05)] divide-x divide-[var(--line)] overflow-hidden">
            <div className="flex-1 py-3.5 text-center">
              <span className="block font-mono text-lg">{totalCount}</span>
              <span className="font-mono text-[10px] tracking-widest uppercase text-[var(--muted)]">tappe</span>
            </div>
            <div className="flex-1 py-3.5 text-center">
              <span className="block font-mono text-lg">{doneIds.size}</span>
              <span className="font-mono text-[10px] tracking-widest uppercase text-[var(--muted)]">fatte</span>
            </div>
            <div className="flex-1 py-3.5 text-center">
              <span className={`block font-mono text-lg ${currentId ? 'text-[var(--accent)]' : ''}`}>{statoLabel}</span>
              <span className="font-mono text-[10px] tracking-widest uppercase text-[var(--muted)]">stato</span>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <AgendaGroup key={group.key} group={group} currentId={currentId} doneIds={doneIds} onNavigate={onNavigate} />
            ))}
          </div>
        </>
      )}

      {hasContent && !isToday && (
        <DayItemsList day={day} externalItems={externalItems} onNavigate={onNavigate} />
      )}

      <Btn variant="secondary" onClick={() => onNavigate('days')} className="self-start">
        Vai all'itinerario <ArrowRight size={17} />
      </Btn>
    </div>
  )
}
