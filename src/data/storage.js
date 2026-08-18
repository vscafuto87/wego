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
