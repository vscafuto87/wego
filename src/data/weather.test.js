import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn() }))

import { get, set } from 'idb-keyval'
import { weatherIcon, getTodayWeather } from './weather.js'

beforeEach(() => {
  get.mockReset()
  set.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

describe('weatherIcon', () => {
  it('cielo sereno (0, 1) → sun', () => {
    expect(weatherIcon(0)).toBe('sun')
    expect(weatherIcon(1)).toBe('sun')
  })

  it('nuvoloso (2, 3) → cloud', () => {
    expect(weatherIcon(2)).toBe('cloud')
    expect(weatherIcon(3)).toBe('cloud')
  })

  it('nebbia (45, 48) → fog', () => {
    expect(weatherIcon(45)).toBe('fog')
  })

  it('pioggia/rovesci (61, 80) → rain', () => {
    expect(weatherIcon(61)).toBe('rain')
    expect(weatherIcon(80)).toBe('rain')
  })

  it('neve (71, 85) → snow', () => {
    expect(weatherIcon(71)).toBe('snow')
    expect(weatherIcon(85)).toBe('snow')
  })

  it('temporale (95) → storm', () => {
    expect(weatherIcon(95)).toBe('storm')
  })

  it('codice sconosciuto → cloud, senza lanciare errori', () => {
    expect(weatherIcon(999)).toBe('cloud')
  })
})

describe('getTodayWeather', () => {
  const trip = { id: 'trip-1', place: 'Ponza (LT)' }
  const now = new Date('2026-08-30T10:00:00.000Z').getTime()

  function geocodeResponse() {
    return { ok: true, json: async () => ({ results: [{ latitude: 40.9, longitude: 12.96 }] }) }
  }

  function forecastResponse(temp = 27, code = 1) {
    return { ok: true, json: async () => ({ current_weather: { temperature: temp, weathercode: code } }) }
  }

  it('senza place del viaggio, torna null senza chiamare fetch', async () => {
    const result = await getTodayWeather({ id: 't', place: '' }, now)
    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('nessuna cache: geocodifica il place, chiama il meteo e salva il risultato', async () => {
    get.mockResolvedValue(undefined)
    fetch.mockResolvedValueOnce(geocodeResponse()).mockResolvedValueOnce(forecastResponse(27, 1))

    const result = await getTodayWeather(trip, now)

    expect(result).toEqual({ temp: 27, code: 1, fetchedAt: now })
    expect(set).toHaveBeenCalledWith('wego:weather:trip-1', {
      place: 'Ponza (LT)',
      lat: 40.9,
      lng: 12.96,
      weather: { temp: 27, code: 1, fetchedAt: now }
    })
  })

  it('cache fresca (< 30 min) con lo stesso place: torna la cache senza richiamare fetch', async () => {
    get.mockResolvedValue({
      place: 'Ponza (LT)',
      lat: 40.9,
      lng: 12.96,
      weather: { temp: 25, code: 2, fetchedAt: now - 10 * 60 * 1000 }
    })

    const result = await getTodayWeather(trip, now)

    expect(result).toEqual({ temp: 25, code: 2, fetchedAt: now - 10 * 60 * 1000 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('cache scaduta (> 30 min): richiama il meteo riusando le coordinate già geocodificate', async () => {
    get.mockResolvedValue({
      place: 'Ponza (LT)',
      lat: 40.9,
      lng: 12.96,
      weather: { temp: 25, code: 2, fetchedAt: now - 60 * 60 * 1000 }
    })
    fetch.mockResolvedValueOnce(forecastResponse(28, 0))

    const result = await getTodayWeather(trip, now)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ temp: 28, code: 0, fetchedAt: now })
  })

  it('place cambiato rispetto alla cache: geocodifica di nuovo', async () => {
    get.mockResolvedValue({
      place: 'Vecchio posto',
      lat: 1,
      lng: 1,
      weather: { temp: 20, code: 0, fetchedAt: now }
    })
    fetch.mockResolvedValueOnce(geocodeResponse()).mockResolvedValueOnce(forecastResponse())

    await getTodayWeather(trip, now)

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('geocodifica fallita (place non trovato): torna null e non scrive in cache', async () => {
    get.mockResolvedValue(undefined)
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })

    const result = await getTodayWeather(trip, now)

    expect(result).toBeNull()
    expect(set).not.toHaveBeenCalled()
  })

  it('rete assente durante la geocodifica: torna null senza lanciare errori', async () => {
    get.mockResolvedValue(undefined)
    fetch.mockRejectedValueOnce(new Error('offline'))

    const result = await getTodayWeather(trip, now)

    expect(result).toBeNull()
  })

  it('meteo fallito ma c\'è una cache stantia per lo stesso place: torna quella invece di null', async () => {
    const stale = { temp: 22, code: 3, fetchedAt: now - 5 * 60 * 60 * 1000 }
    get.mockResolvedValue({ place: 'Ponza (LT)', lat: 40.9, lng: 12.96, weather: stale })
    fetch.mockRejectedValueOnce(new Error('offline'))

    const result = await getTodayWeather(trip, now)

    expect(result).toEqual(stale)
  })
})
