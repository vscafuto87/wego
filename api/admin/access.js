import { requireAdmin, serviceClient } from '../_lib/requireAdmin.js'

export default async function handler(req, res) {
  try {
    await requireAdmin(req)
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message })
    return
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Metodo non supportato.' }); return }

  const { userId, tripId, role } = req.body || {}
  if (!userId || !tripId || !['viewer', 'editor', null].includes(role)) {
    res.status(400).json({ error: 'userId, tripId e role (viewer, editor o null) sono obbligatori.' })
    return
  }

  const supabase = serviceClient()

  if (role === null) {
    const { error } = await supabase.from('tv_trip_members').delete().eq('trip_id', tripId).eq('user_id', userId)
    if (error) { res.status(400).json({ error: error.message }); return }
    res.status(200).json({ ok: true })
    return
  }

  const { error } = await supabase
    .from('tv_trip_members')
    .upsert({ trip_id: tripId, user_id: userId, role }, { onConflict: 'trip_id,user_id' })
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(200).json({ ok: true })
}
