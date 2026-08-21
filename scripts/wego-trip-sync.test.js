import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }))

const { parseArgs, requireEnv, createAuthenticatedClient, cmdList } = await import('./wego-trip-sync.mjs')

describe('parseArgs', () => {
  it('separa comando, argomenti posizionali e flag --yes', () => {
    expect(parseArgs(['push', 'Ponza', 'trip.json', '--yes'])).toEqual({ command: 'push', positional: ['Ponza', 'trip.json'], yes: true })
  })
  it('yes è false quando il flag non è presente', () => {
    expect(parseArgs(['list'])).toEqual({ command: 'list', positional: [], yes: false })
  })
})

describe('requireEnv', () => {
  it('non lancia se tutte le variabili sono presenti', () => {
    expect(() => requireEnv({ A: '1', B: '2' }, ['A', 'B'])).not.toThrow()
  })
  it('lancia elencando le variabili mancanti', () => {
    expect(() => requireEnv({ A: '1' }, ['A', 'B', 'C'])).toThrow('B, C')
  })
})

describe('createAuthenticatedClient', () => {
  const fullEnv = {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
    WEGO_SCRIPT_EMAIL: 'me@example.com',
    WEGO_SCRIPT_PASSWORD: 'secret'
  }

  beforeEach(() => {
    mockCreateClient.mockReset()
  })

  it('rifiuta se mancano le credenziali dello script', async () => {
    await expect(createAuthenticatedClient({ VITE_SUPABASE_URL: 'x', VITE_SUPABASE_ANON_KEY: 'y' })).rejects.toThrow(/WEGO_SCRIPT_EMAIL/)
  })

  it('autentica e torna client + sessione', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword } })

    const { supabase, session } = await createAuthenticatedClient(fullEnv)

    expect(mockCreateClient).toHaveBeenCalledWith('https://x.supabase.co', 'anon-key')
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'me@example.com', password: 'secret' })
    expect(session).toEqual({ user: { id: 'user-1' } })
    expect(supabase).toBeDefined()
  })

  it('propaga un errore di login chiaro', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword } })

    await expect(createAuthenticatedClient(fullEnv)).rejects.toThrow('Invalid login credentials')
  })
})

describe('cmdList', () => {
  it('elenca i viaggi con nome, share_code, ruolo e data aggiornamento', async () => {
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          { trip_id: 't1', role: 'editor', tv_trips: { data: { name: 'Ponza' }, share_code: 'AB23CD', updated_at: '2026-08-21T10:00:00Z' } },
          { trip_id: 't2', role: 'viewer', tv_trips: { data: { name: 'Dolomiti' }, share_code: 'ZZ99YY', updated_at: '2026-08-20T09:00:00Z' } }
        ],
        error: null
      })
    })
    const supabase = { from: vi.fn().mockReturnValue({ select }) }
    const session = { user: { id: 'user-1' } }

    const trips = await cmdList(supabase, session)

    expect(supabase.from).toHaveBeenCalledWith('tv_trip_members')
    expect(trips).toEqual([
      { name: 'Ponza', shareCode: 'AB23CD', role: 'editor', updatedAt: '2026-08-21T10:00:00Z' },
      { name: 'Dolomiti', shareCode: 'ZZ99YY', role: 'viewer', updatedAt: '2026-08-20T09:00:00Z' }
    ])
  })

  it('propaga un errore Supabase', async () => {
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) })
    const supabase = { from: vi.fn().mockReturnValue({ select }) }
    await expect(cmdList(supabase, { user: { id: 'user-1' } })).rejects.toThrow('boom')
  })
})
