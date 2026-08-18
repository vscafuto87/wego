import { supabase, getSession } from './supabase.js'
import { exportTrip, normalizeTrip } from './schema.js'

export function decideSyncAction({ dirty, lastSyncedAt, remoteUpdatedAt }) {
  const remoteIsNewer = Boolean(remoteUpdatedAt) && (!lastSyncedAt || remoteUpdatedAt > lastSyncedAt)
  if (!dirty) {
    return remoteIsNewer ? 'pull' : 'noop'
  }
  return remoteIsNewer ? 'conflict' : 'push'
}

const SHARE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateShareCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += SHARE_CODE_CHARS[Math.floor(Math.random() * SHARE_CODE_CHARS.length)]
  }
  return code
}

export async function activateTripSync(trip, displayName) {
  const session = await getSession()
  if (!session) throw new Error('Devi accedere prima di attivare la sincronizzazione.')

  const payload = exportTrip(trip)
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const shareCode = generateShareCode()
    const { data, error } = await supabase
      .from('tv_trips')
      .insert({ owner_id: session.user.id, share_code: shareCode, data: payload })
      .select('id, share_code, updated_at')
      .single()

    if (!error) {
      const { error: memberError } = await supabase
        .from('tv_trip_members')
        .insert({ trip_id: data.id, user_id: session.user.id, role: 'editor', display_name: displayName })
      if (memberError) throw new Error(memberError.message)
      return { remoteId: data.id, shareCode: data.share_code, lastSyncedAt: data.updated_at, role: 'editor', dirty: false }
    }
    lastError = error
    if (error.code !== '23505') break
  }
  throw new Error(lastError?.message || 'Impossibile attivare la sincronizzazione.')
}

export async function pullTrip(syncState) {
  const { data: row, error } = await supabase
    .from('tv_trips')
    .select('data, updated_at')
    .eq('id', syncState.remoteId)
    .single()
  if (error) throw new Error(error.message)
  return {
    trip: normalizeTrip(row.data),
    syncState: { ...syncState, lastSyncedAt: row.updated_at, dirty: false }
  }
}

export async function pushTrip(trip, syncState) {
  const { data: current, error: readError } = await supabase
    .from('tv_trips')
    .select('data')
    .eq('id', syncState.remoteId)
    .single()
  if (readError) throw new Error(readError.message)

  const { data: updated, error } = await supabase
    .from('tv_trips')
    .update({ data: exportTrip(trip), previous_data: current.data, updated_at: new Date().toISOString() })
    .eq('id', syncState.remoteId)
    .select('updated_at')
    .single()
  if (error) throw new Error(error.message)

  return {
    trip,
    syncState: { ...syncState, lastSyncedAt: updated.updated_at, dirty: false }
  }
}
