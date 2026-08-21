import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCmdList, mockCmdPull } = vi.hoisted(() => ({
  mockCmdList: vi.fn(),
  mockCmdPull: vi.fn()
}))

vi.mock('./wego-trip-sync.mjs', () => ({
  createAuthenticatedClient: vi.fn(),
  cmdList: mockCmdList,
  cmdPull: mockCmdPull,
  cmdPush: vi.fn(),
  cmdCreate: vi.fn(),
  cmdItems: vi.fn(),
  cmdAttach: vi.fn()
}))

const { createTools } = await import('./wego-trip-mcp-server.mjs')

beforeEach(() => {
  mockCmdList.mockReset()
  mockCmdPull.mockReset()
})

describe('wego_list', () => {
  it('elenca i viaggi con nome, share_code, ruolo, data', async () => {
    mockCmdList.mockResolvedValue([
      { name: 'Ponza', shareCode: 'AB23CD', role: 'editor', updatedAt: '2026-08-21T10:00:00Z' }
    ])
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_list({})
    expect(mockCmdList).toHaveBeenCalledWith('fake-supabase', 'fake-session')
    expect(result).toEqual({ content: [{ type: 'text', text: 'Ponza — AB23CD — editor — 2026-08-21T10:00:00Z' }] })
  })

  it('segnala nessun viaggio', async () => {
    mockCmdList.mockResolvedValue([])
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_list({})
    expect(result).toEqual({ content: [{ type: 'text', text: 'Nessun viaggio.' }] })
  })

  it('torna un errore di strumento se cmdList lancia', async () => {
    mockCmdList.mockRejectedValue(new Error('boom'))
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_list({})
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'boom' }] })
  })
})

describe('wego_pull', () => {
  it('torna il JSON completo del viaggio', async () => {
    mockCmdPull.mockResolvedValue({ name: 'Ponza', days: [] })
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_pull({ identifier: 'Ponza' })
    expect(mockCmdPull).toHaveBeenCalledWith('fake-supabase', 'fake-session', 'Ponza')
    expect(result.content[0].type).toBe('text')
    expect(JSON.parse(result.content[0].text)).toEqual({ name: 'Ponza', days: [] })
  })

  it('torna un errore di strumento se cmdPull lancia', async () => {
    mockCmdPull.mockRejectedValue(new Error('Nessun viaggio "X"...'))
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_pull({ identifier: 'X' })
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'Nessun viaggio "X"...' }] })
  })
})
