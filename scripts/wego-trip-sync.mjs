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
