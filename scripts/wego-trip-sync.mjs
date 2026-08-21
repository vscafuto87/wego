import { createClient } from '@supabase/supabase-js'
import { isShareCode, generateShareCode, validateTripPayload, diffTrip, formatDiffSummary } from './wego-trip-lib.mjs'

export function parseArgs(argv) {
  const [command, ...rest] = argv
  const yes = rest.includes('--yes')
  const positional = rest.filter((arg) => arg !== '--yes')
  return { command, positional, yes }
}

export function requireEnv(env, names) {
  const missing = names.filter((name) => !env[name])
  if (missing.length) {
    throw new Error(`Variabili mancanti in .env.local: ${missing.join(', ')}.`)
  }
}

export async function createAuthenticatedClient(env = process.env) {
  requireEnv(env, ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'WEGO_SCRIPT_EMAIL', 'WEGO_SCRIPT_PASSWORD'])
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  const { data, error } = await supabase.auth.signInWithPassword({
    email: env.WEGO_SCRIPT_EMAIL,
    password: env.WEGO_SCRIPT_PASSWORD
  })
  if (error) throw new Error(error.message)
  return { supabase, session: data.session }
}

export async function cmdList(supabase, session) {
  const { data, error } = await supabase
    .from('tv_trip_members')
    .select('trip_id, role, tv_trips(data, updated_at, share_code)')
    .eq('user_id', session.user.id)
  if (error) throw new Error(error.message)
  return data.map((row) => ({
    name: row.tv_trips.data.name,
    shareCode: row.tv_trips.share_code,
    role: row.role,
    updatedAt: row.tv_trips.updated_at
  }))
}

export async function findTrip(supabase, session, identifier) {
  const base = supabase.from('tv_trips').select('id, share_code, data, updated_at, owner_id')
  const { data: rows, error } = isShareCode(identifier)
    ? await base.eq('share_code', identifier)
    : await base.ilike('data->>name', identifier)
  if (error) throw new Error(error.message)
  if (!rows || rows.length === 0) {
    throw new Error(`Nessun viaggio "${identifier}" tra quelli a cui hai accesso. Usa "list" per vedere i nomi disponibili.`)
  }
  if (rows.length > 1) {
    throw new Error(`Più viaggi chiamati "${identifier}": usa lo share_code per scegliere (${rows.map((r) => r.share_code).join(', ')}).`)
  }
  const row = rows[0]
  const { data: memberRow } = await supabase
    .from('tv_trip_members')
    .select('role')
    .eq('trip_id', row.id)
    .eq('user_id', session.user.id)
    .maybeSingle()
  const role = memberRow?.role ?? (row.owner_id === session.user.id ? 'editor' : 'viewer')
  return { id: row.id, shareCode: row.share_code, data: row.data, updatedAt: row.updated_at, ownerId: row.owner_id, role }
}

export async function cmdPull(supabase, session, identifier) {
  const trip = await findTrip(supabase, session, identifier)
  return trip.data
}

export async function main() {
  const { command, positional, yes } = parseArgs(process.argv.slice(2))
  try {
    const { supabase, session } = await createAuthenticatedClient()

    if (command === 'list') {
      const trips = await cmdList(supabase, session)
      if (!trips.length) {
        console.log('Nessun viaggio.')
        return
      }
      for (const trip of trips) {
        console.log(`${trip.name} — ${trip.shareCode} — ${trip.role} — ${trip.updatedAt}`)
      }
      return
    }

    if (command === 'pull') {
      const [identifier] = positional
      if (!identifier) throw new Error('Uso: pull <nome|share_code>')
      const data = await cmdPull(supabase, session, identifier)
      console.log(JSON.stringify(data, null, 2))
      return
    }

    console.error(`Comando sconosciuto: "${command}". Comandi disponibili: list, pull, push, create.`)
    process.exitCode = 1
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
