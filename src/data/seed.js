import { normalizeTrip } from './schema.js'
import rawTrips from '../../seed/trips.json'

export async function loadSeedTrips() {
  return rawTrips.map(normalizeTrip)
}
