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
