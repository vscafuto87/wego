import { describe, it, expect } from 'vitest'
import { msUntilStart, formatCountdown } from './Home.jsx'

describe('msUntilStart', () => {
  it('calcola i millisecondi tra ora e la mezzanotte locale della data di partenza', () => {
    const now = new Date(2026, 7, 23, 22, 0, 0)
    const trip = { start: '2026-08-24' }
    expect(msUntilStart(trip, now)).toBe(2 * 3600 * 1000)
  })

  it('torna 0 se la data di partenza è già passata', () => {
    const now = new Date(2026, 7, 25, 0, 0, 0)
    const trip = { start: '2026-08-24' }
    expect(msUntilStart(trip, now)).toBe(0)
  })

  it('torna 0 se coincide esattamente con la mezzanotte di partenza', () => {
    const now = new Date(2026, 7, 24, 0, 0, 0)
    const trip = { start: '2026-08-24' }
    expect(msUntilStart(trip, now)).toBe(0)
  })
})

describe('formatCountdown', () => {
  it('0 ms → 00:00:00', () => {
    expect(formatCountdown(0)).toBe('00:00:00')
  })

  it('secondi singoli con zero iniziale', () => {
    expect(formatCountdown(5000)).toBe('00:00:05')
  })

  it('minuti e secondi', () => {
    expect(formatCountdown(65000)).toBe('00:01:05')
  })

  it('ore, minuti e secondi', () => {
    expect(formatCountdown(3661000)).toBe('01:01:01')
  })

  it('oltre le 24 ore: le ore non vanno a capo su un contatore giorni', () => {
    expect(formatCountdown(25 * 3600 * 1000)).toBe('25:00:00')
  })
})
