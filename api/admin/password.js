import { requireAdmin, serviceClient } from '../_lib/requireAdmin.js'

export default async function handler(req, res) {
  try {
    await requireAdmin(req)
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message })
    return
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Metodo non supportato.' }); return }

  const { userId, password } = req.body || {}
  if (!userId || !password) { res.status(400).json({ error: 'userId e password sono obbligatori.' }); return }

  const supabase = serviceClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, { password })
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(200).json({ ok: true })
}
