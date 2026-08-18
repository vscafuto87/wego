import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from './ModifiedBy.jsx'

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-18T12:00:00.000Z')

  it('minuti fa', () => {
    const then = new Date('2026-08-18T11:58:00.000Z')
    expect(formatRelativeTime(then.toISOString(), now)).toContain('minuti fa')
  })

  it('un\'ora fa', () => {
    const then = new Date('2026-08-18T11:00:00.000Z')
    expect(formatRelativeTime(then.toISOString(), now)).toContain('ora fa')
  })

  it('giorni fa', () => {
    const then = new Date('2026-08-15T12:00:00.000Z')
    expect(formatRelativeTime(then.toISOString(), now)).toContain('giorni fa')
  })
})
