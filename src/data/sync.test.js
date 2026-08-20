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

const { mockFrom, mockGetSession, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockGetSession: vi.fn(), mockRpc: vi.fn() }))

vi.mock('./supabase.js', () => ({ supabase: { from: mockFrom, rpc: mockRpc }, getSession: mockGetSession }))

const { supabase } = await import('./supabase.js')
const { activateTripSync, pullTrip, pushTrip } = await import('./sync.js')
const { normalizeTrip } = await import('./schema.js')

beforeEach(() => {
  mockFrom.mockReset()
  mockGetSession.mockReset()
  mockRpc.mockReset()
})

describe('activateTripSync', () => {
  it('crea la riga tv_trips e la membership owner, torna remoteId/shareCode/ownerId', async () => {
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

    expect(result).toEqual({ remoteId: 'trip-remote-1', shareCode: 'AB12CD', lastSyncedAt: '2026-08-18T10:00:00Z', role: 'editor', dirty: false, ownerId: 'user-1' })
    expect(insertMember).toHaveBeenCalledWith({ trip_id: 'trip-remote-1', user_id: 'user-1', role: 'editor', display_name: 'Vincenzo' })
  })

  it('rifiuta se non c\'è una sessione', async () => {
    mockGetSession.mockResolvedValue(null)
    const trip = normalizeTrip({ name: 'Ponza' })
    await expect(activateTripSync(trip, 'Vincenzo')).rejects.toThrow()
  })
})

describe('pullTrip', () => {
  it('normalizza il viaggio remoto, aggiorna lastSyncedAt e ownerId', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { data: { name: 'Ponza' }, updated_at: '2026-08-18T12:00:00Z', owner_id: 'user-1' }, error: null }) }) })
    })
    const syncState = { remoteId: 'trip-remote-1', role: 'viewer', lastSyncedAt: '2026-08-18T10:00:00Z', dirty: false }
    const result = await pullTrip(syncState)
    expect(result.trip.name).toBe('Ponza')
    expect(result.syncState).toEqual({ ...syncState, lastSyncedAt: '2026-08-18T12:00:00Z', dirty: false, ownerId: 'user-1' })
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

describe('joinTripByCode', () => {
  it('chiama la RPC join_trip poi legge il viaggio, torna ruolo viewer e ownerId', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-2' } })
    mockRpc.mockResolvedValue({ data: 'trip-remote-1', error: null })
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'trip-remote-1', data: { name: 'Ponza' }, updated_at: '2026-08-18T10:00:00Z', owner_id: 'user-1' }, error: null }) }) })
    })
    const { joinTripByCode } = await import('./sync.js')
    const result = await joinTripByCode('AB12CD', 'Giulia')
    expect(mockRpc).toHaveBeenCalledWith('join_trip', { code: 'AB12CD', display_name: 'Giulia' })
    expect(result.trip.name).toBe('Ponza')
    expect(result.syncState).toEqual({ remoteId: 'trip-remote-1', role: 'viewer', lastSyncedAt: '2026-08-18T10:00:00Z', dirty: false, ownerId: 'user-1' })
  })
})

describe('syncTrip', () => {
  it('torna noop se non c\'è syncState', async () => {
    const { syncTrip } = await import('./sync.js')
    const trip = normalizeTrip({ name: 'Ponza' })
    const result = await syncTrip(trip, null)
    expect(result).toEqual({ action: 'noop', trip, syncState: null })
  })

  it('pull quando non dirty e il remoto è più recente', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { data: { name: 'Ponza remota' }, updated_at: '2026-08-18T12:00:00Z' }, error: null }) }) })
    })
    const { syncTrip } = await import('./sync.js')
    const trip = normalizeTrip({ name: 'Ponza locale' })
    const syncState = { remoteId: 'trip-remote-1', role: 'viewer', lastSyncedAt: '2026-08-18T10:00:00Z', dirty: false }
    const result = await syncTrip(trip, syncState)
    expect(result.action).toBe('pull')
    expect(result.trip.name).toBe('Ponza remota')
  })

  it('salta il push se il ruolo è viewer', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { updated_at: '2026-08-18T10:00:00Z' }, error: null }) }) })
    })
    const { syncTrip } = await import('./sync.js')
    const trip = normalizeTrip({ name: 'Ponza locale' })
    const syncState = { remoteId: 'trip-remote-1', role: 'viewer', lastSyncedAt: '2026-08-18T10:00:00Z', dirty: true }
    const result = await syncTrip(trip, syncState)
    expect(result.action).toBe('skipped-viewer')
  })

  it('conflict quando dirty e il remoto è cambiato, non sovrascrive nulla', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { data: { name: 'Ponza remota' }, updated_at: '2026-08-18T13:00:00Z' }, error: null }) }) })
    })
    const { syncTrip } = await import('./sync.js')
    const trip = normalizeTrip({ name: 'Ponza locale' })
    const syncState = { remoteId: 'trip-remote-1', role: 'editor', lastSyncedAt: '2026-08-18T10:00:00Z', dirty: true }
    const result = await syncTrip(trip, syncState)
    expect(result.action).toBe('conflict')
    expect(result.trip.name).toBe('Ponza locale')
    expect(result.conflict.remoteTrip.name).toBe('Ponza remota')
  })
})

describe('restoreLastVersion', () => {
  it('applica previous_data e lo azzera sul remoto, torna null se non c\'è nulla da ripristinare', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { previous_data: null }, error: null }) }) })
    })
    const { restoreLastVersion } = await import('./sync.js')
    expect(await restoreLastVersion('trip-remote-1')).toBeNull()
  })

  it('ripristina quando previous_data esiste', async () => {
    const updateFn = vi.fn().mockReturnValue({ eq: async () => ({ error: null }) })
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { previous_data: { name: 'Ponza vecchia' } }, error: null }) }) }),
      update: updateFn
    })
    const { restoreLastVersion } = await import('./sync.js')
    const restored = await restoreLastVersion('trip-remote-1')
    expect(restored.name).toBe('Ponza vecchia')
    expect(updateFn).toHaveBeenCalledWith({ data: { name: 'Ponza vecchia' }, previous_data: null, updated_at: expect.any(String) })
  })
})

describe('uploadLodgingAttachment / removeLodgingAttachment / getAttachmentSignedUrl', () => {
  it('uploadLodgingAttachment carica sul path <remoteId>/<uuid>.pdf e lo ritorna', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const storageFrom = vi.fn().mockReturnValue({ upload })
    supabase.storage = { from: storageFrom }

    const { uploadLodgingAttachment } = await import('./sync.js')
    const file = new Blob(['contenuto'], { type: 'application/pdf' })
    const path = await uploadLodgingAttachment('trip-remote-1', file)

    expect(storageFrom).toHaveBeenCalledWith('trip-attachments')
    expect(path).toMatch(/^trip-remote-1\/[0-9a-f-]{36}\.pdf$/)
    expect(upload).toHaveBeenCalledWith(path, file, { contentType: 'application/pdf' })
  })

  it('uploadLodgingAttachment propaga l\'errore di Supabase', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'bucket pieno' } })
    supabase.storage = { from: vi.fn().mockReturnValue({ upload }) }

    const { uploadLodgingAttachment } = await import('./sync.js')
    await expect(uploadLodgingAttachment('trip-remote-1', new Blob())).rejects.toThrow('bucket pieno')
  })

  it('removeLodgingAttachment cancella il path indicato', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null })
    const storageFrom = vi.fn().mockReturnValue({ remove })
    supabase.storage = { from: storageFrom }

    const { removeLodgingAttachment } = await import('./sync.js')
    await removeLodgingAttachment('trip-remote-1/abc.pdf')

    expect(storageFrom).toHaveBeenCalledWith('trip-attachments')
    expect(remove).toHaveBeenCalledWith(['trip-remote-1/abc.pdf'])
  })

  it('getAttachmentSignedUrl torna l\'URL firmato', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://x/signed' }, error: null })
    supabase.storage = { from: vi.fn().mockReturnValue({ createSignedUrl }) }

    const { getAttachmentSignedUrl } = await import('./sync.js')
    const url = await getAttachmentSignedUrl('trip-remote-1/abc.pdf')

    expect(url).toBe('https://x/signed')
    expect(createSignedUrl).toHaveBeenCalledWith('trip-remote-1/abc.pdf', 120)
  })
})

describe('fetchTripOwnerId', () => {
  it('legge solo owner_id per il viaggio remoto', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { owner_id: 'user-9' }, error: null }) }) })
    })
    const { fetchTripOwnerId } = await import('./sync.js')
    expect(await fetchTripOwnerId('trip-remote-1')).toBe('user-9')
  })

  it('rilancia l\'errore Supabase come Error leggibile', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'non trovato' } }) }) })
    })
    const { fetchTripOwnerId } = await import('./sync.js')
    await expect(fetchTripOwnerId('trip-remote-1')).rejects.toThrow('non trovato')
  })
})

describe('listMyTrips', () => {
  it('elenca i viaggi visibili con il proprio ruolo', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
    const eqFn = vi.fn().mockResolvedValue({
      data: [
        { trip_id: 'trip-remote-1', role: 'editor', tv_trips: { data: { name: 'Ponza' }, updated_at: '2026-08-18T10:00:00Z' } },
        { trip_id: 'trip-remote-2', role: 'viewer', tv_trips: { data: { name: 'Dolomiti' }, updated_at: '2026-08-18T11:00:00Z' } }
      ],
      error: null
    })
    mockFrom.mockReturnValue({ select: () => ({ eq: eqFn }) })

    const { listMyTrips } = await import('./sync.js')
    const result = await listMyTrips()

    expect(mockFrom).toHaveBeenCalledWith('tv_trip_members')
    expect(eqFn).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result).toEqual([
      { remoteId: 'trip-remote-1', role: 'editor', trip: expect.objectContaining({ name: 'Ponza' }), updatedAt: '2026-08-18T10:00:00Z' },
      { remoteId: 'trip-remote-2', role: 'viewer', trip: expect.objectContaining({ name: 'Dolomiti' }), updatedAt: '2026-08-18T11:00:00Z' }
    ])
  })

  it('rifiuta se non c\'è una sessione', async () => {
    mockGetSession.mockResolvedValue(null)
    const { listMyTrips } = await import('./sync.js')
    await expect(listMyTrips()).rejects.toThrow()
  })
})

describe('deleteTripAsOwner', () => {
  it('cancella la riga tv_trips per id', async () => {
    const eqFn = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ delete: () => ({ eq: eqFn }) })

    const { deleteTripAsOwner } = await import('./sync.js')
    await deleteTripAsOwner('trip-remote-1')

    expect(mockFrom).toHaveBeenCalledWith('tv_trips')
    expect(eqFn).toHaveBeenCalledWith('id', 'trip-remote-1')
  })

  it('propaga l\'errore di Supabase', async () => {
    mockFrom.mockReturnValue({ delete: () => ({ eq: vi.fn().mockResolvedValue({ error: { message: 'negato' } }) }) })
    const { deleteTripAsOwner } = await import('./sync.js')
    await expect(deleteTripAsOwner('trip-remote-1')).rejects.toThrow('negato')
  })
})

describe('leaveTripAsMember', () => {
  it('cancella solo la propria riga di iscrizione', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-2' } })
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockFrom.mockReturnValue({ delete: () => ({ eq: eq1 }) })

    const { leaveTripAsMember } = await import('./sync.js')
    await leaveTripAsMember('trip-remote-1')

    expect(mockFrom).toHaveBeenCalledWith('tv_trip_members')
    expect(eq1).toHaveBeenCalledWith('trip_id', 'trip-remote-1')
    expect(eq2).toHaveBeenCalledWith('user_id', 'user-2')
  })

  it('rifiuta se non c\'è una sessione', async () => {
    mockGetSession.mockResolvedValue(null)
    const { leaveTripAsMember } = await import('./sync.js')
    await expect(leaveTripAsMember('trip-remote-1')).rejects.toThrow()
  })
})
