import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } })
}))

const { requireAdmin } = await import('./requireAdmin.js')

beforeEach(() => {
  mockGetUser.mockReset()
  process.env.VITE_SUPABASE_URL = 'https://x.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'
})

describe('requireAdmin', () => {
  it('rifiuta se manca l\'header Authorization', async () => {
    await expect(requireAdmin({ headers: {} })).rejects.toMatchObject({ status: 401 })
  })

  it('rifiuta se il token non è valido', async () => {
    mockGetUser.mockResolvedValue({ data: null, error: { message: 'token scaduto' } })
    await expect(requireAdmin({ headers: { authorization: 'Bearer xxx' } })).rejects.toMatchObject({ status: 401 })
  })

  it('rifiuta se l\'utente non è admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@x.it', app_metadata: {} } }, error: null })
    await expect(requireAdmin({ headers: { authorization: 'Bearer xxx' } })).rejects.toMatchObject({ status: 403 })
  })

  it('rifiuta se is_admin è una stringa "false" (truthy ma non === true)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@x.it', app_metadata: { is_admin: 'false' } } }, error: null })
    await expect(requireAdmin({ headers: { authorization: 'Bearer xxx' } })).rejects.toMatchObject({ status: 403 })
  })

  it('risolve con l\'utente se è admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@x.it', app_metadata: { is_admin: true } } }, error: null })
    const user = await requireAdmin({ headers: { authorization: 'Bearer xxx' } })
    expect(user).toEqual({ id: 'u1', email: 'a@x.it', app_metadata: { is_admin: true } })
  })
})
