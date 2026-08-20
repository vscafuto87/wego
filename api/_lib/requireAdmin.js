import { createClient } from '@supabase/supabase-js'

export async function requireAdmin(req) {
  const header = req.headers.authorization || ''
  const token = header.replace(/^Bearer\s+/i, '')
  if (!token) {
    const err = new Error('Token mancante.')
    err.status = 401
    throw err
  }

  const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data?.user) {
    const err = new Error('Token non valido.')
    err.status = 401
    throw err
  }
  if (!data.user.app_metadata?.is_admin) {
    const err = new Error('Il tuo account non ha accesso admin.')
    err.status = 403
    throw err
  }
  return data.user
}

export function serviceClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}
