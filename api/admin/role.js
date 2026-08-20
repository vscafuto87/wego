import { requireAdmin, serviceClient } from '../_lib/requireAdmin.js'

export default async function handler(req, res) {
  let admin
  try {
    admin = await requireAdmin(req)
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message })
    return
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Metodo non supportato.' }); return }

  const { userId, isAdmin } = req.body || {}
  if (!userId || typeof isAdmin !== 'boolean') { res.status(400).json({ error: 'userId e isAdmin sono obbligatori.' }); return }
  if (userId === admin.id) { res.status(400).json({ error: 'Non puoi cambiare il tuo stesso ruolo admin da qui.' }); return }

  const supabase = serviceClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: { is_admin: isAdmin } })
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(200).json({ ok: true })
}
