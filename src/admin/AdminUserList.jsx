import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { fetchUsers, createUser, setUserRole, setTripAccess, resetPassword } from './adminApi.js'
import { getSession } from '../data/supabase.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { email: '', password: '' }

export default function AdminUserList() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [resetForm, setResetForm] = useState(null)

  function load() {
    fetchUsers().then(setData).catch((e) => setError(e.message))
  }

  useEffect(() => {
    load()
    getSession().then((s) => setCurrentUserId(s?.user?.id ?? null))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    try {
      await createUser(form.email, form.password)
      setForm(EMPTY_FORM)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRoleChange(userId, isAdmin) {
    setError('')
    try {
      await setUserRole(userId, isAdmin)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAccessChange(userId, tripId, role) {
    setError('')
    try {
      await setTripAccess(userId, tripId, role)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setError('')
    try {
      await resetPassword(resetForm.userId, resetForm.password)
      setResetForm(null)
    } catch (err) {
      setError(err.message)
    }
  }

  if (!data) {
    return error
      ? <p className="text-base text-[var(--accent)]">{error}</p>
      : <p className="text-base text-[var(--muted)]">Carico gli utenti…</p>
  }

  function accessFor(userId, tripId) {
    const row = data.access.find((a) => a.userId === userId && a.tripId === tripId)
    return row ? row.role : ''
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-4">
        {error && <p className="text-base text-[var(--accent)]">{error}</p>}
        {data.users.map((user) => (
          <div key={user.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display font-semibold text-xl">{user.email}</p>
              <label className="flex items-center gap-2 text-base">
                <input
                  type="checkbox"
                  checked={user.isAdmin}
                  disabled={user.id === currentUserId}
                  onChange={(e) => handleRoleChange(user.id, e.target.checked)}
                />
                Admin
              </label>
            </div>
            <button onClick={() => setResetForm({ userId: user.id, password: '' })} className="text-base text-[var(--accent)] underline mt-2">
              Reimposta password
            </button>
            <div className="mt-3 flex flex-col gap-2">
              {data.trips.map((trip) => (
                <div key={trip.id} className="flex items-center justify-between gap-2">
                  <span className="text-base">{trip.name}</span>
                  <select
                    value={accessFor(user.id, trip.id)}
                    onChange={(e) => handleAccessChange(user.id, trip.id, e.target.value || null)}
                    className={inputClass}
                  >
                    <option value="">Nessun accesso</option>
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        <h2 className="font-display font-semibold text-xl mb-1">Nuovo utente</h2>
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
        <input required type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
          <Plus size={17} /> Crea utente
        </button>
      </form>

      {resetForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setResetForm(null)}>
          <form onSubmit={handleResetPassword} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm flex flex-col gap-3 bg-[var(--card)] rounded-2xl p-5">
            <h2 className="font-display font-semibold text-xl">Reimposta password</h2>
            <input required type="password" placeholder="Nuova password" value={resetForm.password} onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })} className={inputClass} />
            <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
              Salva
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
