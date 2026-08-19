import { describe, it, expect } from 'vitest'
import { normalizeTrip } from './schema.js'
import rawTrips from '../../seed/trips.json'

describe('seed/trips.json normalizzato', () => {
  const trips = rawTrips.map(normalizeTrip)

  it('entrambi i viaggi hanno le 4 sezioni fisse nell\'ordine corretto', () => {
    for (const trip of trips) {
      expect(trip.sections.slice(0, 4).map((s) => s.type)).toEqual(['transport', 'lodging', 'cards', 'map'])
    }
  })

  it('Dolomiti: i trasporti Bologna-Forni sono in Trasporti, non più nei giorni', () => {
    const dolomiti = trips.find((t) => t.name === 'Dolomiti Friulane')
    const trasporti = dolomiti.sections.find((s) => s.type === 'transport')
    expect(trasporti.items.map((i) => `${i.from}->${i.to}`)).toEqual(['Bologna->Forni di Sopra', 'Forni di Sopra->Bologna'])
    const titoliGiorni = dolomiti.days.flatMap((d) => d.items.map((i) => i.title))
    expect(titoliGiorni).not.toContain('Partenza da Bologna')
    expect(titoliGiorni).not.toContain('Rientro a Bologna')
  })

  it('Dolomiti: l\'alloggio è in Pernottamento', () => {
    const dolomiti = trips.find((t) => t.name === 'Dolomiti Friulane')
    const pernottamento = dolomiti.sections.find((s) => s.type === 'lodging')
    expect(pernottamento.items).toHaveLength(1)
    expect(pernottamento.items[0].name).toBe('Alloggio a Forni di Sopra')
  })

  it('Dolomiti: le opzioni di escursione hanno kind sentiero con durata e dislivello', () => {
    const dolomiti = trips.find((t) => t.name === 'Dolomiti Friulane')
    const sentieri = dolomiti.days.flatMap((d) => d.items).filter((i) => i.kind === 'sentiero')
    expect(sentieri.length).toBeGreaterThanOrEqual(4)
    for (const s of sentieri) {
      expect(s.dislivello).not.toBe('')
    }
  })

  it('Ponza: treno e aliscafo sono in Trasporti', () => {
    const ponza = trips.find((t) => t.name === 'Ponza')
    const trasporti = ponza.sections.find((s) => s.type === 'transport')
    expect(trasporti.items.map((i) => i.mode)).toEqual(['treno', 'aliscafo'])
  })

  it('Ponza: il check-in è in Pernottamento', () => {
    const ponza = trips.find((t) => t.name === 'Ponza')
    const pernottamento = ponza.sections.find((s) => s.type === 'lodging')
    expect(pernottamento.items[0].name).toBe('Appartamento zona Porto')
  })

  it('Ponza: la cena del primo giorno ha kind pasto', () => {
    const ponza = trips.find((t) => t.name === 'Ponza')
    const primoGiorno = ponza.days.find((d) => d.date === '2026-08-30')
    const cena = primoGiorno.items.find((i) => i.title === 'Cena in paese')
    expect(cena.kind).toBe('pasto')
  })

  it('Ponza: la sezione Ristoranti esiste già ed è promossa senza duplicati', () => {
    const ponza = trips.find((t) => t.name === 'Ponza')
    const ristoranti = ponza.sections.filter((s) => s.type === 'cards' && s.title === 'Ristoranti')
    expect(ristoranti).toHaveLength(1)
  })

  it('Ponza: le sezioni libere esistenti restano (Spiagge e cale, Da prenotare, Note)', () => {
    const ponza = trips.find((t) => t.name === 'Ponza')
    const titoli = ponza.sections.slice(4).map((s) => s.title)
    expect(titoli).toEqual(expect.arrayContaining(['Spiagge e cale', 'Da prenotare', 'Note']))
  })
})
