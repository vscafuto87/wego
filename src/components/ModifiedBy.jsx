const UNITS = [
  { limit: 60, divisor: 1, unit: 'second' },
  { limit: 3600, divisor: 60, unit: 'minute' },
  { limit: 86400, divisor: 3600, unit: 'hour' },
  { limit: Infinity, divisor: 86400, unit: 'day' }
]

const RTF = new Intl.RelativeTimeFormat('it', { numeric: 'auto' })

// Una data non leggibile (import scritto a mano, JSON di altra provenienza) non
// deve far cadere la vista: si rinuncia al tempo relativo, non alla schermata.
export function formatRelativeTime(isoString, now = new Date()) {
  const then = new Date(isoString)
  if (Number.isNaN(then.getTime())) return ''
  const diffSeconds = Math.max(0, Math.round((now - then) / 1000))
  const { divisor, unit } = UNITS.find((u) => diffSeconds < u.limit)
  return RTF.format(-Math.round(diffSeconds / divisor), unit)
}

// Non mostriamo più chi/quando ha modificato: il timestamp resta salvato nei
// dati (stampModified) per il last-write-wins della sync, solo non è in UI.
export default function ModifiedBy() {
  return null
}
