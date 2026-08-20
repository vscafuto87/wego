import { requireAdmin, serviceClient } from '../_lib/requireAdmin.js'

export default async function handler(req, res) {
  try {
    await requireAdmin(req)
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message })
    return
  }

  const supabase = serviceClient()

  if (req.method === 'GET') {
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers()
    if (usersError) { res.status(500).json({ error: usersError.message }); return }

    const { data: trips, error: tripsError } = await supabase.from('tv_trips').select('id, data')
    if (tripsError) { res.status(500).json({ error: tripsError.message }); return }

    const { data: members, error: membersError } = await supabase.from('tv_trip_members').select('trip_id, user_id, role')
    if (membersError) { res.status(500).json({ error: membersError.message }); return }

    res.status(200).json({
      users: usersData.users.map((u) => ({ id: u.id, email: u.email, isAdmin: u.app_metadata?.is_admin === true })),
      trips: trips.map((t) => ({ id: t.id, name: t.data?.name || 'Senza nome' })),
      access: members.map((m) => ({ userId: m.user_id, tripId: m.trip_id, role: m.role }))
    })
    return
  }

  if (req.method === 'POST') {
    const { email, password } = req.body || {}
    if (!email || !password) { res.status(400).json({ error: 'Email e password sono obbligatorie.' }); return }
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) { res.status(400).json({ error: error.message }); return }
    res.status(200).json({ id: data.user.id, email: data.user.email })
    return
  }

  res.status(405).json({ error: 'Metodo non supportato.' })
}
