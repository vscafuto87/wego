import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('./seed.js', () => ({ loadSeedTrips: vi.fn() }))

import { get, set } from 'idb-keyval'
import { getSyncState, setSyncState, markDirty, getDisplayNamePreference, setDisplayNamePreference } from './storage.js'

beforeEach(() => {
  get.mockReset()
  set.mockReset()
})

describe('getSyncState / setSyncState', () => {
  it('legge con la chiave wego:sync:<id> e torna null se assente', async () => {
    get.mockResolvedValue(undefined)
    const result = await getSyncState('trip-1')
    expect(get).toHaveBeenCalledWith('wego:sync:trip-1')
    expect(result).toBeNull()
  })

  it('scrive con la chiave wego:sync:<id>', async () => {
    const state = { remoteId: 'r1', role: 'editor', lastSyncedAt: null, dirty: true }
    await setSyncState('trip-1', state)
    expect(set).toHaveBeenCalledWith('wego:sync:trip-1', state)
  })
})

describe('markDirty', () => {
  it('non fa nulla se il viaggio non è attivato', async () => {
    get.mockResolvedValue(undefined)
    await markDirty('trip-1')
    expect(set).not.toHaveBeenCalled()
  })

  it('imposta dirty=true preservando il resto dello stato', async () => {
    get.mockResolvedValue({ remoteId: 'r1', role: 'editor', lastSyncedAt: 't0', dirty: false })
    await markDirty('trip-1')
    expect(set).toHaveBeenCalledWith('wego:sync:trip-1', { remoteId: 'r1', role: 'editor', lastSyncedAt: 't0', dirty: true })
  })
})

describe('preferenza nome dispositivo', () => {
  it('torna stringa vuota se non impostata', async () => {
    get.mockResolvedValue(undefined)
    expect(await getDisplayNamePreference()).toBe('')
  })

  it('scrive con la chiave wego:display-name', async () => {
    await setDisplayNamePreference('Vincenzo')
    expect(set).toHaveBeenCalledWith('wego:display-name', 'Vincenzo')
  })
})
