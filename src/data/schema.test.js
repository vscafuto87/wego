import { describe, it, expect } from 'vitest'
import { normalizeTrip, exportTrip, stampModified, dayItemFieldsForKind } from './schema.js'

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

function tripWithItem(item) {
  return normalizeTrip({ name: 'X', days: [{ date: '2026-01-01', items: [item] }] })
}

describe('dayItemFieldsForKind', () => {
  it('sentiero', () => {
    expect(dayItemFieldsForKind('sentiero')).toEqual(['durata', 'dislivello', 'difficolta'])
  })
  it('spiaggia', () => {
    expect(dayItemFieldsForKind('spiaggia')).toEqual(['accesso', 'servizi'])
  })
  it('pasto', () => {
    expect(dayItemFieldsForKind('pasto')).toEqual(['luogo', 'prenotato'])
  })
  it('generico o sconosciuto: nessun campo proprio', () => {
    expect(dayItemFieldsForKind('')).toEqual([])
    expect(dayItemFieldsForKind('volo')).toEqual([])
  })
})

describe('normalizeTrip — kind sulle voci del giorno', () => {
  it('voce generica: kind vuoto, nessun campo proprio', () => {
    const item = tripWithItem({ title: 'Partenza' }).days[0].items[0]
    expect(item.kind).toBe('')
    expect(item.durata).toBeUndefined()
    expect(item.accesso).toBeUndefined()
    expect(item.luogo).toBeUndefined()
  })

  it('sentiero: durata, dislivello, difficolta', () => {
    const item = tripWithItem({ title: 'Anello', kind: 'sentiero', durata: '5h14', dislivello: '480 m D+', difficolta: 'media' }).days[0].items[0]
    expect(item.kind).toBe('sentiero')
    expect(item.durata).toBe('5h14')
    expect(item.dislivello).toBe('480 m D+')
    expect(item.difficolta).toBe('media')
  })

  it('sentiero: campi propri mancanti diventano stringa vuota', () => {
    const item = tripWithItem({ title: 'Anello', kind: 'sentiero' }).days[0].items[0]
    expect(item.durata).toBe('')
    expect(item.dislivello).toBe('')
    expect(item.difficolta).toBe('')
  })

  it('spiaggia: accesso, servizi', () => {
    const item = tripWithItem({ title: 'Frontone', kind: 'spiaggia', accesso: 'a piedi', servizi: 'bar' }).days[0].items[0]
    expect(item.kind).toBe('spiaggia')
    expect(item.accesso).toBe('a piedi')
    expect(item.servizi).toBe('bar')
  })

  it('pasto: luogo, prenotato', () => {
    const item = tripWithItem({ title: 'Cena', kind: 'pasto', luogo: 'Trattoria', prenotato: true }).days[0].items[0]
    expect(item.kind).toBe('pasto')
    expect(item.luogo).toBe('Trattoria')
    expect(item.prenotato).toBe(true)
  })

  it('pasto: prenotato non booleano ricade su false', () => {
    const item = tripWithItem({ title: 'Cena', kind: 'pasto', prenotato: 'si' }).days[0].items[0]
    expect(item.prenotato).toBe(false)
  })

  it('kind sconosciuto ricade su generico', () => {
    const item = tripWithItem({ title: 'X', kind: 'volo' }).days[0].items[0]
    expect(item.kind).toBe('')
  })

  it('exportTrip conserva kind e campi propri, senza id', () => {
    const trip = tripWithItem({ title: 'Anello', kind: 'sentiero', durata: '5h14' })
    const exported = exportTrip(trip)
    const item = exported.days[0].items[0]
    expect(item.id).toBeUndefined()
    expect(item).toEqual({
      time: '', title: 'Anello', kind: 'sentiero', detail: '', link: '',
      modifiedBy: '', modifiedAt: '', durata: '5h14', dislivello: '', difficolta: ''
    })
  })
})
