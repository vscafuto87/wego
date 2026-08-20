import { getSession } from '../data/supabase.js'

async function authFetch(path, options = {}) {
  const session = await getSession()
  if (!session) throw new Error('Devi accedere.')
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {})
    }
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Richiesta non riuscita.')
  return body
}

export function fetchUsers() {
  return authFetch('/api/admin/users')
}

export function createUser(email, password) {
  return authFetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function setUserRole(userId, isAdmin) {
  return authFetch('/api/admin/role', { method: 'POST', body: JSON.stringify({ userId, isAdmin }) })
}

export function setTripAccess(userId, tripId, role) {
  return authFetch('/api/admin/access', { method: 'POST', body: JSON.stringify({ userId, tripId, role }) })
}

export function resetPassword(userId, password) {
  return authFetch('/api/admin/password', { method: 'POST', body: JSON.stringify({ userId, password }) })
}
