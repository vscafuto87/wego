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

describe('normalizeTrip — sezione transport', () => {
  function tripWithTransportSection(items) {
    return normalizeTrip({ name: 'X', sections: [{ title: 'Trasporti', icon: 'bus', type: 'transport', items }] })
  }

  it('normalizza i campi di una voce di trasporto', () => {
    const section = tripWithTransportSection([
      { mode: 'aliscafo', from: 'Formia', to: 'Ponza', date: '2026-08-30', time: '14:30', ticketLink: 'https://x', note: 'posti assegnati' }
    ]).sections.find((s) => s.type === 'transport')
    expect(section.items[0]).toMatchObject({
      mode: 'aliscafo', from: 'Formia', to: 'Ponza', date: '2026-08-30', time: '14:30', ticketLink: 'https://x', note: 'posti assegnati'
    })
    expect(section.items[0].id).toBeTypeOf('string')
  })

  it('campi mancanti diventano stringa vuota', () => {
    const section = tripWithTransportSection([{ mode: 'treno' }]).sections.find((s) => s.type === 'transport')
    expect(section.items[0]).toMatchObject({ mode: 'treno', from: '', to: '', date: '', time: '', ticketLink: '', note: '' })
  })

  it('exportTrip conserva i campi transport senza id', () => {
    const trip = tripWithTransportSection([{ mode: 'treno', from: 'Bologna', to: 'Roma' }])
    const exported = exportTrip(trip).sections.find((s) => s.type === 'transport')
    expect(exported.items[0].id).toBeUndefined()
    expect(exported.items[0].mode).toBe('treno')
  })
})

describe('normalizeTrip — sezione lodging', () => {
  function tripWithLodgingSection(items) {
    return normalizeTrip({ name: 'X', sections: [{ title: 'Pernottamento', icon: 'bed', type: 'lodging', items }] })
  }

  it('normalizza i campi di una voce di alloggio', () => {
    const section = tripWithLodgingSection([
      { name: 'Appartamento Porto', checkIn: '2026-08-30', checkOut: '2026-09-05', address: 'Via Roma 1', bookingLink: 'https://x', note: '' }
    ]).sections.find((s) => s.type === 'lodging')
    expect(section.items[0]).toMatchObject({
      name: 'Appartamento Porto', checkIn: '2026-08-30', checkOut: '2026-09-05', address: 'Via Roma 1', bookingLink: 'https://x'
    })
  })

  it('campi mancanti diventano stringa vuota', () => {
    const section = tripWithLodgingSection([{ name: 'Hotel' }]).sections.find((s) => s.type === 'lodging')
    expect(section.items[0]).toMatchObject({ name: 'Hotel', checkIn: '', checkOut: '', address: '', bookingLink: '', note: '' })
  })
})

describe('normalizeTrip — sezione map', () => {
  function tripWithMapSection(items) {
    return normalizeTrip({ name: 'X', sections: [{ title: 'Mappa', icon: 'map', type: 'map', items }] })
  }

  it('normalizza un punto con coordinate', () => {
    const section = tripWithMapSection([
      { name: 'Piscine Naturali', category: 'spiaggia', mapsLink: 'https://maps.x', lat: 40.897, lng: 12.958, note: '' }
    ]).sections.find((s) => s.type === 'map')
    expect(section.items[0]).toMatchObject({ name: 'Piscine Naturali', category: 'spiaggia', mapsLink: 'https://maps.x', lat: 40.897, lng: 12.958 })
  })

  it('coordinate assenti o non numeriche diventano null, non errore', () => {
    const section = tripWithMapSection([{ name: 'Senza coordinate' }, { name: 'Coordinate testo', lat: 'quaranta', lng: '13' }])
      .sections.find((s) => s.type === 'map')
    expect(section.items[0].lat).toBeNull()
    expect(section.items[0].lng).toBeNull()
    expect(section.items[1].lat).toBeNull()
    expect(section.items[1].lng).toBeNull()
  })

  it('campi mancanti diventano stringa vuota', () => {
    const section = tripWithMapSection([{ name: 'Punto' }]).sections.find((s) => s.type === 'map')
    expect(section.items[0]).toMatchObject({ name: 'Punto', category: '', mapsLink: '', note: '' })
  })
})
