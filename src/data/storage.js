import { get, set } from 'idb-keyval'
import { loadSeedTrips } from './seed.js'
import { normalizeTrip } from './schema.js'

const TRIPS_KEY = 'wego:trips'
const SEEDED_KEY = 'wego:seeded'

// Alla primissima apertura (nessun viaggio salvato e nessun seed già importato)
// carica i viaggi di esempio in IndexedDB, poi da lì in poi lo storage locale
// è l'unica fonte di verità.
export async function loadTrips() {
  const alreadySeeded = await get(SEEDED_KEY)
  const stored = await get(TRIPS_KEY)

  if (stored) {
    // Un viaggio salvato prima di un aggiornamento dello schema resta congelato
    // alla forma vecchia finché non passa di nuovo da normalizeTrip: lo si ripara
    // ad ogni apertura, come già succede dopo un pull di sync. Solo l'id del
    // viaggio resta stabile: gli id annidati si rigenerano già oggi ad ogni pull,
    // e le viste gestiscono già quel caso (vedi TripView.jsx).
    // Un viaggio corrotto (es. un nome finito vuoto) non deve bloccare il
    // caricamento di tutti gli altri: lo si scarta invece di far fallire tutto.
    const upgraded = []
    for (const trip of stored) {
      try {
        upgraded.push({ ...normalizeTrip(trip), id: trip.id })
      } catch (err) {
        console.error(`Viaggio "${trip?.id}" scartato al caricamento: ${err.message}`)
      }
    }
    await set(TRIPS_KEY, upgraded)
    return upgraded
  }

  if (alreadySeeded) {
    return []
  }

  const trips = await loadSeedTrips()
  await set(TRIPS_KEY, trips)
  await set(SEEDED_KEY, true)
  return trips
}

export async function saveTrips(trips) {
  await set(TRIPS_KEY, trips)
}

const SYNC_PREFIX = 'wego:sync:'
const DISPLAY_NAME_KEY = 'wego:display-name'

export async function getSyncState(localTripId) {
  const state = await get(SYNC_PREFIX + localTripId)
  return state ?? null
}

export async function setSyncState(localTripId, state) {
  await set(SYNC_PREFIX + localTripId, state)
}

export async function markDirty(localTripId) {
  const state = await getSyncState(localTripId)
  if (!state) return
  await setSyncState(localTripId, { ...state, dirty: true })
}

export async function getDisplayNamePreference() {
  const name = await get(DISPLAY_NAME_KEY)
  return name ?? ''
}

export async function setDisplayNamePreference(name) {
  await set(DISPLAY_NAME_KEY, name)
}
