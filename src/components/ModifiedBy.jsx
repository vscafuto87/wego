const UNITS = [
  { limit: 60, divisor: 1, unit: 'second' },
  { limit: 3600, divisor: 60, unit: 'minute' },
  { limit: 86400, divisor: 3600, unit: 'hour' },
  { limit: Infinity, divisor: 86400, unit: 'day' }
]

const RTF = new Intl.RelativeTimeFormat('it', { numeric: 'auto' })

export function formatRelativeTime(isoString, now = new Date()) {
  const then = new Date(isoString)
  const diffSeconds = Math.max(0, Math.round((now - then) / 1000))
  const { divisor, unit } = UNITS.find((u) => diffSeconds < u.limit)
  return RTF.format(-Math.round(diffSeconds / divisor), unit)
}

export default function ModifiedBy({ modifiedBy, modifiedAt }) {
  if (!modifiedBy || !modifiedAt) return null
  return (
    <p className="font-mono text-[11px] text-[var(--muted)] mt-0.5">
      modificato da {modifiedBy} · {formatRelativeTime(modifiedAt)}
    </p>
  )
}
