import { describe, it, expect } from 'vitest'
import { normalizeTrip, exportTrip, stampModified } from './schema.js'

describe('normalizeTrip — attribuzione', () => {
  it('riempie modifiedBy/modifiedAt vuoti quando assenti', () => {
    const trip = normalizeTrip({
      name: 'Ponza',
      days: [{ date: '2026-08-30', items: [{ title: 'Aliscafo' }] }],
      sections: [
        { title: 'Ristoranti', type: 'cards', items: [{ title: 'Trattoria' }] },
        { title: 'Da fare', type: 'checklist', items: [{ text: 'Prenotare' }] },
        { title: 'Note', type: 'notes', text: 'ricordati la crema solare' }
      ]
    })

    expect(trip.days[0].modifiedBy).toBe('')
    expect(trip.days[0].modifiedAt).toBe('')
    expect(trip.days[0].items[0].modifiedBy).toBe('')
    expect(trip.sections[0].items[0].modifiedBy).toBe('')
    expect(trip.sections[1].items[0].modifiedBy).toBe('')
    expect(trip.sections[2].modifiedBy).toBe('')
  })

  it('preserva modifiedBy/modifiedAt quando presenti', () => {
    const trip = normalizeTrip({
      name: 'Ponza',
      days: [{ date: '2026-08-30', modifiedBy: 'Vincenzo', modifiedAt: '2026-08-18T10:00:00.000Z', items: [] }]
    })
    expect(trip.days[0].modifiedBy).toBe('Vincenzo')
    expect(trip.days[0].modifiedAt).toBe('2026-08-18T10:00:00.000Z')
  })
})

describe('exportTrip — attribuzione', () => {
  it('esporta modifiedBy/modifiedAt su giorni, voci e sezione notes', () => {
    const trip = normalizeTrip({
      name: 'Ponza',
      days: [{ date: '2026-08-30', modifiedBy: 'Vincenzo', modifiedAt: 't1', items: [{ title: 'Aliscafo', modifiedBy: 'Giulia', modifiedAt: 't2' }] }],
      sections: [{ title: 'Note', type: 'notes', text: 'x', modifiedBy: 'Giulia', modifiedAt: 't3' }]
    })
    const exported = exportTrip(trip)
    expect(exported.days[0].modifiedBy).toBe('Vincenzo')
    expect(exported.days[0].items[0].modifiedBy).toBe('Giulia')
    expect(exported.sections[0].modifiedBy).toBe('Giulia')
  })
})

describe('stampModified', () => {
  it('non modifica il nodo se non c\'è un nome (viaggio non attivo in sync)', () => {
    const node = { title: 'x' }
    expect(stampModified(node, '')).toBe(node)
  })

  it('aggiunge modifiedBy e modifiedAt (ISO) se c\'è un nome', () => {
    const node = { title: 'x' }
    const result = stampModified(node, 'Vincenzo')
    expect(result.modifiedBy).toBe('Vincenzo')
    expect(new Date(result.modifiedAt).toString()).not.toBe('Invalid Date')
    expect(result).not.toBe(node)
  })
})
