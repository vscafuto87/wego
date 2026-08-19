import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }))

import { get, set, del } from 'idb-keyval'
import { getCachedAttachment, setCachedAttachment, removeCachedAttachment } from './attachments.js'

beforeEach(() => {
  get.mockReset()
  set.mockReset()
  del.mockReset()
})

describe('getCachedAttachment', () => {
  it('legge con la chiave wego:attachment:<path> e torna null se assente', async () => {
    get.mockResolvedValue(undefined)
    const result = await getCachedAttachment('trip-1/abc.pdf')
    expect(get).toHaveBeenCalledWith('wego:attachment:trip-1/abc.pdf')
    expect(result).toBeNull()
  })

  it('torna il blob salvato quando presente', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    get.mockResolvedValue(blob)
    const result = await getCachedAttachment('trip-1/abc.pdf')
    expect(result).toBe(blob)
  })
})

describe('setCachedAttachment', () => {
  it('scrive con la chiave wego:attachment:<path>', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    await setCachedAttachment('trip-1/abc.pdf', blob)
    expect(set).toHaveBeenCalledWith('wego:attachment:trip-1/abc.pdf', blob)
  })
})

describe('removeCachedAttachment', () => {
  it('cancella con la chiave wego:attachment:<path>', async () => {
    await removeCachedAttachment('trip-1/abc.pdf')
    expect(del).toHaveBeenCalledWith('wego:attachment:trip-1/abc.pdf')
  })
})
