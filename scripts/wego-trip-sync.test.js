import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }))

function writeTempTripFile(data) {
  const dir = mkdtempSync(join(tmpdir(), 'wego-trip-'))
  const filePath = join(dir, 'trip.json')
  writeFileSync(filePath, JSON.stringify(data))
  return filePath
}

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

const { findTrip, cmdPull } = await import('./wego-trip-sync.mjs')

function tripRow(overrides = {}) {
  return { id: 'trip-1', share_code: 'AB23CD', data: { name: 'Ponza' }, updated_at: '2026-08-21T10:00:00Z', owner_id: 'user-1', ...overrides }
}

describe('findTrip', () => {
  it('trova per nome (ilike su data->>name) e determina il ruolo da tv_trip_members', async () => {
    const eqMembers = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'editor' }, error: null }) })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ ilike: vi.fn().mockResolvedValue({ data: [tripRow()], error: null }) }) }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: eqMembers }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const result = await findTrip(supabase, { user: { id: 'user-1' } }, 'Ponza')
    expect(result).toEqual({ id: 'trip-1', shareCode: 'AB23CD', data: { name: 'Ponza' }, updatedAt: '2026-08-21T10:00:00Z', ownerId: 'user-1', role: 'editor' })
  })

  it('trova per share_code (eq su share_code)', async () => {
    const eqShareCode = vi.fn().mockResolvedValue({ data: [tripRow()], error: null })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ eq: eqShareCode }) }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const result = await findTrip(supabase, { user: { id: 'user-2' } }, 'AB23CD')
    expect(eqShareCode).toHaveBeenCalledWith('share_code', 'AB23CD')
    expect(result.role).toBe('viewer')
  })

  it('deduce il ruolo editor per l\'owner anche senza riga in tv_trip_members', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ ilike: async () => ({ data: [tripRow({ owner_id: 'user-1' })], error: null }) }) }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const result = await findTrip(supabase, { user: { id: 'user-1' } }, 'Ponza')
    expect(result.role).toBe('editor')
  })

  it('rifiuta se nessun viaggio corrisponde', async () => {
    const supabase = { from: () => ({ select: () => ({ ilike: async () => ({ data: [], error: null }) }) }) }
    await expect(findTrip(supabase, { user: { id: 'user-1' } }, 'Sconosciuto')).rejects.toThrow(/Nessun viaggio/)
  })

  it('rifiuta con l\'elenco degli share_code se il nome è ambiguo', async () => {
    const supabase = { from: () => ({ select: () => ({ ilike: async () => ({ data: [tripRow({ share_code: 'AAA111' }), tripRow({ share_code: 'BBB222' })], error: null }) }) }) }
    await expect(findTrip(supabase, { user: { id: 'user-1' } }, 'Ponza')).rejects.toThrow(/AAA111.*BBB222|BBB222.*AAA111/)
  })
})

describe('cmdPull', () => {
  it('torna il data del viaggio trovato', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ eq: async () => ({ data: [tripRow({ data: { name: 'Ponza', days: [] } })], error: null }) }) }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'editor' }, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const data = await cmdPull(supabase, { user: { id: 'user-1' } }, 'AB23CD')
    expect(data).toEqual({ name: 'Ponza', days: [] })
  })
})

const { cmdPush } = await import('./wego-trip-sync.mjs')

describe('cmdPush', () => {
  function supabaseFor(row, { updateOk = true } = {}) {
    // L'identifier usato in questi test è sempre un nome ("Ponza"), non uno
    // share_code: findTrip prende quindi il ramo .ilike(...), non .eq(...).
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: updateOk ? null : { message: 'update fallito' } }) })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ ilike: async () => ({ data: [row], error: null }) }), update }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: row.__role ?? 'editor' }, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    return { supabase, update }
  }

  it('in dry-run stampa il riepilogo e non scrive', async () => {
    const row = tripRow({ data: { name: 'Ponza', days: [], sections: [] } })
    const { supabase, update } = supabaseFor(row)
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdPush(supabase, { user: { id: 'user-1' } }, 'Ponza', filePath, { yes: false })
    logSpy.mockRestore()

    expect(result).toEqual({ written: false })
    expect(update).not.toHaveBeenCalled()
  })

  it('con --yes scrive data, sposta il vecchio valore in previous_data', async () => {
    const row = tripRow({ data: { name: 'Ponza vecchia', days: [], sections: [] } })
    const { supabase, update } = supabaseFor(row)
    const proposed = { name: 'Ponza aggiornata', days: [], sections: [] }
    const filePath = writeTempTripFile(proposed)

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdPush(supabase, { user: { id: 'user-1' } }, 'Ponza', filePath, { yes: true })
    logSpy.mockRestore()

    expect(result).toEqual({ written: true })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: proposed, previous_data: row.data }))
  })

  it('rifiuta se il ruolo è viewer', async () => {
    const row = tripRow({ __role: 'viewer', data: { name: 'Ponza', days: [], sections: [] } })
    const { supabase } = supabaseFor(row)
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    await expect(cmdPush(supabase, { user: { id: 'user-2' } }, 'Ponza', filePath, { yes: false })).rejects.toThrow(/viewer/)
  })

  it('rifiuta un file con un tipo di sezione non valido, prima di interrogare Supabase', async () => {
    const supabase = { from: vi.fn() }
    const filePath = writeTempTripFile({ name: 'Ponza', sections: [{ title: 'X', type: 'gallery', items: [] }] })

    await expect(cmdPush(supabase, { user: { id: 'user-1' } }, 'Ponza', filePath, { yes: false })).rejects.toThrow(/gallery/)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

const { cmdCreate } = await import('./wego-trip-sync.mjs')

describe('cmdCreate', () => {
  it('in dry-run stampa il riepilogo e non scrive', async () => {
    const insert = vi.fn()
    const supabase = { from: vi.fn().mockReturnValue({ insert }) }
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdCreate(supabase, { user: { id: 'user-1' } }, filePath, { yes: false })
    logSpy.mockRestore()

    expect(result).toEqual({ written: false })
    expect(insert).not.toHaveBeenCalled()
  })

  it('con --yes crea la riga tv_trips e la membership owner', async () => {
    const insertTrip = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'trip-1', share_code: 'AB23CD' }, error: null }) }) })
    const insertMember = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { insert: insertTrip }
        if (table === 'tv_trip_members') return { insert: insertMember }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdCreate(supabase, { user: { id: 'user-1' } }, filePath, { yes: true })
    logSpy.mockRestore()

    expect(result).toEqual({ written: true, shareCode: 'AB23CD' })
    expect(insertMember).toHaveBeenCalledWith({ trip_id: 'trip-1', user_id: 'user-1', role: 'editor' })
  })

  it('ritenta su collisione share_code (23505) e crea al secondo tentativo', async () => {
    const single = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } })
      .mockResolvedValueOnce({ data: { id: 'trip-1', share_code: 'ZZ99YY' }, error: null })
    const insertTrip = vi.fn().mockReturnValue({ select: () => ({ single }) })
    const insertMember = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { insert: insertTrip }
        if (table === 'tv_trip_members') return { insert: insertMember }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdCreate(supabase, { user: { id: 'user-1' } }, filePath, { yes: true })
    logSpy.mockRestore()

    expect(result).toEqual({ written: true, shareCode: 'ZZ99YY' })
    expect(insertTrip).toHaveBeenCalledTimes(2)
  })

  it('rifiuta un file senza nome, prima di interrogare Supabase', async () => {
    const supabase = { from: vi.fn() }
    const filePath = writeTempTripFile({ days: [] })

    await expect(cmdCreate(supabase, { user: { id: 'user-1' } }, filePath, { yes: false })).rejects.toThrow(/name/)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('interrompe il retry su errore non-23505 (non collisione)', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    const insertTrip = vi.fn().mockReturnValue({ select: () => ({ single }) })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { insert: insertTrip }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    await expect(cmdCreate(supabase, { user: { id: 'user-1' } }, filePath, { yes: true })).rejects.toThrow(/permission denied/)
    expect(insertTrip).toHaveBeenCalledTimes(1)
  })

  it('esaurisce 3 tentativi se tutti falliscono con collisione 23505', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate share_code' } })
    const insertTrip = vi.fn().mockReturnValue({ select: () => ({ single }) })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { insert: insertTrip }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    await expect(cmdCreate(supabase, { user: { id: 'user-1' } }, filePath, { yes: true })).rejects.toThrow(/duplicate share_code/)
    expect(insertTrip).toHaveBeenCalledTimes(3)
  })
})

const { findAttachmentSection, cmdItems } = await import('./wego-trip-sync.mjs')

describe('findAttachmentSection', () => {
  it('trova la sezione transport nel data del viaggio', () => {
    const tripData = { sections: [{ title: 'Trasporti', type: 'transport', items: [{ mode: 'auto' }] }] }
    const section = findAttachmentSection(tripData, 'transport')
    expect(section.title).toBe('Trasporti')
  })

  it('rifiuta un sectionType non transport/lodging', () => {
    const tripData = { sections: [] }
    expect(() => findAttachmentSection(tripData, 'cards')).toThrow(/transport, lodging/)
  })

  it('rifiuta se il viaggio non ha quella sezione', () => {
    const tripData = { sections: [{ title: 'Trasporti', type: 'transport', items: [] }] }
    expect(() => findAttachmentSection(tripData, 'lodging')).toThrow(/lodging/)
  })
})

describe('cmdItems', () => {
  it('torna titolo sezione e voci per il viaggio risolto', async () => {
    const tripData = { name: 'Ponza', sections: [{ title: 'Pernottamento', type: 'lodging', items: [{ name: 'Hotel Roma' }] }] }
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ ilike: async () => ({ data: [tripRow({ data: tripData })], error: null }) }) }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'editor' }, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const result = await cmdItems(supabase, { user: { id: 'user-1' } }, 'Ponza', 'lodging')
    expect(result).toEqual({ sectionTitle: 'Pernottamento', items: [{ name: 'Hotel Roma' }] })
  })
})
