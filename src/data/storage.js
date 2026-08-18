import { get, set } from 'idb-keyval'
import { loadSeedTrips } from './seed.js'

const TRIPS_KEY = 'wego:trips'
const SEEDED_KEY = 'wego:seeded'

// Alla primissima apertura (nessun viaggio salvato e nessun seed già importato)
// carica i viaggi di esempio in IndexedDB, poi da lì in poi lo storage locale
// è l'unica fonte di verità.
export async function loadTrips() {
  const alreadySeeded = await get(SEEDED_KEY)
  const stored = await get(TRIPS_KEY)

  if (stored) {
    return stored
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
