import { describe, it, expect } from 'vitest'
import { decideSyncAction, generateShareCode } from './sync.js'

describe('decideSyncAction', () => {
  it('noop se non dirty e il remoto non è più recente', () => {
    expect(decideSyncAction({ dirty: false, lastSyncedAt: '2026-08-18T10:00:00Z', remoteUpdatedAt: '2026-08-18T10:00:00Z' })).toBe('noop')
  })

  it('noop se non dirty e non c\'è ancora nulla di remoto', () => {
    expect(decideSyncAction({ dirty: false, lastSyncedAt: null, remoteUpdatedAt: null })).toBe('noop')
  })

  it('pull se non dirty e il remoto è più recente', () => {
    expect(decideSyncAction({ dirty: false, lastSyncedAt: '2026-08-18T10:00:00Z', remoteUpdatedAt: '2026-08-18T11:00:00Z' })).toBe('pull')
  })

  it('push se dirty e il remoto non è cambiato dall\'ultimo sync', () => {
    expect(decideSyncAction({ dirty: true, lastSyncedAt: '2026-08-18T10:00:00Z', remoteUpdatedAt: '2026-08-18T10:00:00Z' })).toBe('push')
  })

  it('push alla primissima attivazione (nessun lastSyncedAt, nessun remoteUpdatedAt noto)', () => {
    expect(decideSyncAction({ dirty: true, lastSyncedAt: null, remoteUpdatedAt: null })).toBe('push')
  })

  it('conflict se dirty e il remoto è cambiato dall\'ultimo sync', () => {
    expect(decideSyncAction({ dirty: true, lastSyncedAt: '2026-08-18T10:00:00Z', remoteUpdatedAt: '2026-08-18T11:00:00Z' })).toBe('conflict')
  })
})

describe('generateShareCode', () => {
  it('genera un codice di 6 caratteri dal set consentito', () => {
    const code = generateShareCode()
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })
})

import { vi, beforeEach } from 'vitest'

const { mockFrom, mockGetSession } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockGetSession: vi.fn() }))

vi.mock('./supabase.js', () => ({ supabase: { from: mockFrom }, getSession: mockGetSession }))

const { activateTripSync, pullTrip, pushTrip } = await import('./sync.js')
const { normalizeTrip } = await import('./schema.js')

beforeEach(() => {
  mockFrom.mockReset()
  mockGetSession.mockReset()
})

describe('activateTripSync', () => {
  it('crea la riga tv_trips e la membership owner, torna remoteId/shareCode', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
    const insertTrip = vi.fn().mockReturnValue({
      select: () => ({ single: async () => ({ data: { id: 'trip-remote-1', share_code: 'AB12CD', updated_at: '2026-08-18T10:00:00Z' }, error: null }) })
    })
    const insertMember = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation((table) => {
      if (table === 'tv_trips') return { insert: insertTrip }
      if (table === 'tv_trip_members') return { insert: insertMember }
      throw new Error(`tabella inattesa: ${table}`)
    })

    const trip = normalizeTrip({ name: 'Ponza' })
    const result = await activateTripSync(trip, 'Vincenzo')

    expect(result).toEqual({ remoteId: 'trip-remote-1', shareCode: 'AB12CD', lastSyncedAt: '2026-08-18T10:00:00Z', role: 'editor', dirty: false })
    expect(insertMember).toHaveBeenCalledWith({ trip_id: 'trip-remote-1', user_id: 'user-1', role: 'editor', display_name: 'Vincenzo' })
  })

  it('rifiuta se non c\'è una sessione', async () => {
    mockGetSession.mockResolvedValue(null)
    const trip = normalizeTrip({ name: 'Ponza' })
    await expect(activateTripSync(trip, 'Vincenzo')).rejects.toThrow()
  })
})

describe('pullTrip', () => {
  it('normalizza il viaggio remoto e aggiorna lastSyncedAt', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { data: { name: 'Ponza' }, updated_at: '2026-08-18T12:00:00Z' }, error: null }) }) })
    })
    const syncState = { remoteId: 'trip-remote-1', role: 'viewer', lastSyncedAt: '2026-08-18T10:00:00Z', dirty: false }
    const result = await pullTrip(syncState)
    expect(result.trip.name).toBe('Ponza')
    expect(result.syncState).toEqual({ ...syncState, lastSyncedAt: '2026-08-18T12:00:00Z', dirty: false })
  })
})

describe('pushTrip', () => {
  it('aggiorna data, sposta il vecchio valore in previous_data, aggiorna lastSyncedAt', async () => {
    const trip = normalizeTrip({ name: 'Ponza aggiornata' })
    const updateFn = vi.fn().mockReturnValue({
      eq: () => ({ select: () => ({ single: async () => ({ data: { updated_at: '2026-08-18T13:00:00Z' }, error: null }) }) })
    })
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { data: { name: 'Ponza vecchia' } }, error: null }) }) }),
      update: updateFn
    })
    const syncState = { remoteId: 'trip-remote-1', role: 'editor', lastSyncedAt: '2026-08-18T10:00:00Z', dirty: true }
    const result = await pushTrip(trip, syncState)
    expect(result.syncState).toEqual({ ...syncState, lastSyncedAt: '2026-08-18T13:00:00Z', dirty: false })
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ previous_data: { name: 'Ponza vecchia' } }))
  })
})
