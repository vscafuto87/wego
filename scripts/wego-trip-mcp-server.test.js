import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

const { mockCmdList, mockCmdPull, mockCmdPush, mockCmdCreate } = vi.hoisted(() => ({
  mockCmdList: vi.fn(),
  mockCmdPull: vi.fn(),
  mockCmdPush: vi.fn(),
  mockCmdCreate: vi.fn()
}))

vi.mock('./wego-trip-sync.mjs', () => ({
  createAuthenticatedClient: vi.fn(),
  cmdList: mockCmdList,
  cmdPull: mockCmdPull,
  cmdPush: mockCmdPush,
  cmdCreate: mockCmdCreate,
  cmdItems: vi.fn(),
  cmdAttach: vi.fn()
}))

const { createTools } = await import('./wego-trip-mcp-server.mjs')

beforeEach(() => {
  mockCmdList.mockReset()
  mockCmdPull.mockReset()
  mockCmdPush.mockReset()
  mockCmdCreate.mockReset()
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

describe('wego_push', () => {
  it('scrive un file temporaneo con tripJson e chiama cmdPush con quel percorso; il file si elimina dopo', async () => {
    let capturedPath
    mockCmdPush.mockImplementation(async (supabase, session, identifier, filePath, { yes }) => {
      capturedPath = filePath
      expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ name: 'Ponza' })
      console.log('Riepilogo finto')
      return { written: false }
    })
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_push({ identifier: 'Ponza', tripJson: { name: 'Ponza' }, yes: false })
    expect(mockCmdPush).toHaveBeenCalledWith('fake-supabase', 'fake-session', 'Ponza', capturedPath, { yes: false })
    expect(result).toEqual({ content: [{ type: 'text', text: 'Riepilogo finto' }] })
    expect(existsSync(capturedPath)).toBe(false)
  })

  it('elimina il file temporaneo anche se cmdPush lancia, e torna un errore di strumento', async () => {
    let capturedPath
    mockCmdPush.mockImplementation(async (supabase, session, identifier, filePath) => {
      capturedPath = filePath
      throw new Error('Sei solo viewer su "Ponza", non puoi modificarlo.')
    })
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_push({ identifier: 'Ponza', tripJson: { name: 'Ponza' }, yes: true })
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'Sei solo viewer su "Ponza", non puoi modificarlo.' }] })
    expect(existsSync(capturedPath)).toBe(false)
  })
})

describe('wego_create', () => {
  it('scrive un file temporaneo con tripJson e chiama cmdCreate con quel percorso; il file si elimina dopo', async () => {
    let capturedPath
    mockCmdCreate.mockImplementation(async (supabase, session, filePath, { yes }) => {
      capturedPath = filePath
      expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ name: 'Ponza nuova' })
      console.log('Nuovo viaggio: Ponza nuova\n\nNessuna scrittura eseguita (dry-run).')
      return { written: false }
    })
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_create({ tripJson: { name: 'Ponza nuova' }, yes: false })
    expect(mockCmdCreate).toHaveBeenCalledWith('fake-supabase', 'fake-session', capturedPath, { yes: false })
    expect(result.content[0].text).toContain('Nuovo viaggio: Ponza nuova')
    expect(existsSync(capturedPath)).toBe(false)
  })
})
