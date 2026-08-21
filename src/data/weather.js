import { get, set } from 'idb-keyval'

const CACHE_PREFIX = 'wego:weather:'
const CACHE_TTL_MS = 30 * 60 * 1000

const ICON_CODES = {
  sun: [0, 1],
  fog: [45, 48],
  rain: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82],
  snow: [71, 73, 75, 77, 85, 86],
  storm: [95, 96, 99]
}

// Raggruppa i codici WMO di Open-Meteo in poche icone: qualunque codice non
// riconosciuto ricade su "cloud", che è anche il caso di 2/3 (nuvoloso).
export function weatherIcon(code) {
  for (const [icon, codes] of Object.entries(ICON_CODES)) {
    if (codes.includes(code)) return icon
  }
  return 'cloud'
}

async function geocodePlace(place) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=it`)
  if (!res.ok) return null
  const data = await res.json()
  const hit = data.results?.[0]
  if (!hit) return null
  return { lat: hit.latitude, lng: hit.longitude }
}

async function fetchCurrentWeather(lat, lng) {
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`)
  if (!res.ok) return null
  const data = await res.json()
  const current = data.current_weather
  if (!current) return null
  return { temp: current.temperature, code: current.weathercode }
}

// Meteo attuale del luogo del viaggio, per la tab Oggi. Nessun errore di rete
// arriva mai a chi chiama: fallisce silenziosamente su null, o torna l'ultimo
// dato buono in cache se il place non è cambiato — il meteo è un'aggiunta,
// mai un blocco per il resto della pagina.
export async function getTodayWeather(trip, now = Date.now()) {
  if (!trip.place) return null

  const cached = await get(CACHE_PREFIX + trip.id)
  const sameCachedPlace = cached && cached.place === trip.place

  let coords = sameCachedPlace ? { lat: cached.lat, lng: cached.lng } : null
  if (!coords) {
    try {
      coords = await geocodePlace(trip.place)
    } catch {
      coords = null
    }
    if (!coords) return null
  }

  if (sameCachedPlace && cached.weather && now - cached.weather.fetchedAt < CACHE_TTL_MS) {
    return cached.weather
  }

  let weather = null
  try {
    weather = await fetchCurrentWeather(coords.lat, coords.lng)
  } catch {
    weather = null
  }

  if (!weather) return sameCachedPlace ? (cached.weather ?? null) : null

  const entry = { ...weather, fetchedAt: now }
  await set(CACHE_PREFIX + trip.id, { place: trip.place, lat: coords.lat, lng: coords.lng, weather: entry })
  return entry
}
