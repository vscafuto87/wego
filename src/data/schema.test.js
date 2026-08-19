import { describe, it, expect } from 'vitest'
import { normalizeTrip, exportTrip, stampModified, dayItemFieldsForKind, parseCoordsFromMapsLink, collectExternalMapPoints } from './schema.js'

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
    const ristoranti = trip.sections.find((s) => s.type === 'cards' && s.title === 'Ristoranti')
    const daFare = trip.sections.find((s) => s.type === 'checklist')
    const note = trip.sections.find((s) => s.type === 'notes')
    expect(ristoranti.items[0].modifiedBy).toBe('')
    expect(daFare.items[0].modifiedBy).toBe('')
    expect(note.modifiedBy).toBe('')
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
    const notesSection = exported.sections.find((s) => s.type === 'notes')
    expect(notesSection.modifiedBy).toBe('Giulia')
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
    expect(dayItemFieldsForKind('sentiero')).toEqual(['durata', 'dislivello', 'difficolta', 'lat', 'lng'])
  })
  it('spiaggia', () => {
    expect(dayItemFieldsForKind('spiaggia')).toEqual(['accesso', 'servizi', 'lat', 'lng'])
  })
  it('pasto', () => {
    expect(dayItemFieldsForKind('pasto')).toEqual(['luogo', 'prenotato', 'lat', 'lng'])
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
      modifiedBy: '', modifiedAt: '', durata: '5h14', dislivello: '', difficolta: '', lat: null, lng: null
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

describe('normalizeTrip — sezioni fisse garantite', () => {
  it('un viaggio senza sezioni ha comunque le 4 fisse, in ordine, vuote', () => {
    const trip = normalizeTrip({ name: 'X' })
    expect(trip.sections.map((s) => [s.type, s.title])).toEqual([
      ['transport', 'Trasporti'],
      ['lodging', 'Pernottamento'],
      ['cards', 'Ristoranti'],
      ['map', 'Mappa']
    ])
    expect(trip.sections.every((s) => s.items.length === 0)).toBe(true)
  })

  it('una sezione Ristoranti esistente viene promossa, non duplicata', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'Ristoranti', icon: 'food', type: 'cards', items: [{ title: 'Da Assunta' }] }]
    })
    const ristoranti = trip.sections.filter((s) => s.type === 'cards' && s.title === 'Ristoranti')
    expect(ristoranti).toHaveLength(1)
    expect(ristoranti[0].items[0].title).toBe('Da Assunta')
  })

  it('una sezione cards con titolo diverso da Ristoranti non viene confusa con quella fissa', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'Riserve e alternative', icon: 'star', type: 'cards', items: [{ title: 'Piano B' }] }]
    })
    const ristoranti = trip.sections.find((s) => s.type === 'cards' && s.title === 'Ristoranti')
    const riserve = trip.sections.find((s) => s.title === 'Riserve e alternative')
    expect(ristoranti.items).toHaveLength(0)
    expect(riserve.items[0].title).toBe('Piano B')
  })

  it('sezioni transport/lodging/map esistenti vengono promosse per tipo, non duplicate', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'I nostri spostamenti', icon: 'bus', type: 'transport', items: [{ mode: 'treno' }] }]
    })
    const trasporti = trip.sections.filter((s) => s.type === 'transport')
    expect(trasporti).toHaveLength(1)
    expect(trasporti[0].items[0].mode).toBe('treno')
  })

  it('le sezioni libere restano, dopo le 4 fisse, nell\'ordine originale', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [
        { title: 'Zaino del giorno', icon: 'check', type: 'checklist', items: [] },
        { title: 'Note', icon: 'note', type: 'notes', text: '' }
      ]
    })
    const free = trip.sections.slice(4)
    expect(free.map((s) => s.title)).toEqual(['Zaino del giorno', 'Note'])
  })
})

describe('normalizeTrip — coordinate opzionali sulle schede (cards)', () => {
  function tripWithCardItem(item) {
    return normalizeTrip({ name: 'X', sections: [{ title: 'Bar consigliati', type: 'cards', items: [item] }] })
  }

  it('scheda con coordinate valide', () => {
    const item = tripWithCardItem({ title: 'Trattoria da Assunta', lat: 40.897, lng: 12.958 })
      .sections.find((s) => s.title === 'Bar consigliati').items[0]
    expect(item.lat).toBe(40.897)
    expect(item.lng).toBe(12.958)
  })

  it('scheda senza coordinate: null, non errore', () => {
    const item = tripWithCardItem({ title: 'Senza coordinate' })
      .sections.find((s) => s.title === 'Bar consigliati').items[0]
    expect(item.lat).toBeNull()
    expect(item.lng).toBeNull()
  })

  it('coordinate non numeriche diventano null', () => {
    const item = tripWithCardItem({ title: 'X', lat: 'quaranta', lng: '13' })
      .sections.find((s) => s.title === 'Bar consigliati').items[0]
    expect(item.lat).toBeNull()
    expect(item.lng).toBeNull()
  })

  it('si applica anche alla sezione fissa Ristoranti, non solo alle sezioni cards custom', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'Ristoranti', type: 'cards', items: [{ title: 'Da Assunta', lat: 40.9, lng: 12.9 }] }]
    })
    const ristoranti = trip.sections.find((s) => s.type === 'cards' && s.title === 'Ristoranti')
    expect(ristoranti.items[0].lat).toBe(40.9)
  })

  it('exportTrip conserva lat/lng sulle schede, senza id', () => {
    const trip = tripWithCardItem({ title: 'X', lat: 40.9, lng: 12.9 })
    const exported = exportTrip(trip).sections.find((s) => s.title === 'Bar consigliati')
    expect(exported.items[0].lat).toBe(40.9)
    expect(exported.items[0].lng).toBe(12.9)
    expect(exported.items[0].id).toBeUndefined()
  })
})

describe('dayItemFieldsForKind — include lat/lng per sentiero/spiaggia/pasto', () => {
  it('sentiero', () => {
    expect(dayItemFieldsForKind('sentiero')).toEqual(['durata', 'dislivello', 'difficolta', 'lat', 'lng'])
  })
  it('spiaggia', () => {
    expect(dayItemFieldsForKind('spiaggia')).toEqual(['accesso', 'servizi', 'lat', 'lng'])
  })
  it('pasto', () => {
    expect(dayItemFieldsForKind('pasto')).toEqual(['luogo', 'prenotato', 'lat', 'lng'])
  })
  it('voce generica: ancora nessun campo proprio', () => {
    expect(dayItemFieldsForKind('')).toEqual([])
  })
})

describe('normalizeTrip — coordinate su sentiero/spiaggia/pasto', () => {
  it('sentiero con coordinate valide', () => {
    const item = tripWithItem({ title: 'Anello', kind: 'sentiero', lat: 46.4, lng: 12.6 }).days[0].items[0]
    expect(item.lat).toBe(46.4)
    expect(item.lng).toBe(12.6)
  })

  it('spiaggia con coordinate valide', () => {
    const item = tripWithItem({ title: 'Frontone', kind: 'spiaggia', lat: 40.9, lng: 12.9 }).days[0].items[0]
    expect(item.lat).toBe(40.9)
    expect(item.lng).toBe(12.9)
  })

  it('pasto con coordinate valide', () => {
    const item = tripWithItem({ title: 'Cena', kind: 'pasto', lat: 40.9, lng: 12.9 }).days[0].items[0]
    expect(item.lat).toBe(40.9)
    expect(item.lng).toBe(12.9)
  })

  it('sentiero/spiaggia/pasto senza coordinate: null, non errore', () => {
    const sentiero = tripWithItem({ title: 'Anello', kind: 'sentiero' }).days[0].items[0]
    expect(sentiero.lat).toBeNull()
    expect(sentiero.lng).toBeNull()
  })

  it('voce generica: nessun campo lat/lng', () => {
    const item = tripWithItem({ title: 'Partenza', lat: 40.9, lng: 12.9 }).days[0].items[0]
    expect(item.lat).toBeUndefined()
    expect(item.lng).toBeUndefined()
  })

  it('exportTrip conserva lat/lng sulle voci giorno tipizzate', () => {
    const trip = tripWithItem({ title: 'Anello', kind: 'sentiero', lat: 46.4, lng: 12.6 })
    const exported = exportTrip(trip).days[0].items[0]
    expect(exported.lat).toBe(46.4)
    expect(exported.lng).toBe(12.6)
  })
})

describe('parseCoordsFromMapsLink', () => {
  it('link Google Maps con @lat,lng,zoom', () => {
    const url = 'https://www.google.com/maps/place/Trattoria/@40.897123,12.958456,17z/data=!3m1!4b1'
    expect(parseCoordsFromMapsLink(url)).toEqual({ lat: 40.897123, lng: 12.958456 })
  })

  it('link Google Maps "place" con !3d..!4d.. ha priorità su @', () => {
    const url = 'https://www.google.com/maps/place/Trattoria/@40.0,12.0,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d40.897123!4d12.958456'
    expect(parseCoordsFromMapsLink(url)).toEqual({ lat: 40.897123, lng: 12.958456 })
  })

  it('link con ?q=lat,lng', () => {
    expect(parseCoordsFromMapsLink('https://maps.google.com/?q=40.897,12.958')).toEqual({ lat: 40.897, lng: 12.958 })
  })

  it('link Apple Maps con ?ll=lat,lng', () => {
    expect(parseCoordsFromMapsLink('https://maps.apple.com/?ll=40.897,12.958&q=Trattoria')).toEqual({ lat: 40.897, lng: 12.958 })
  })

  it('coordinate negative (emisfero sud/ovest)', () => {
    expect(parseCoordsFromMapsLink('https://www.google.com/maps/@-33.8688,151.2093,15z')).toEqual({ lat: -33.8688, lng: 151.2093 })
  })

  it('link breve maps.app.goo.gl: nessuna coordinata leggibile, ritorna null', () => {
    expect(parseCoordsFromMapsLink('https://maps.app.goo.gl/aBcDeFg123')).toBeNull()
  })

  it('testo qualunque, stringa vuota, undefined: null, mai un errore', () => {
    expect(parseCoordsFromMapsLink('non è un link')).toBeNull()
    expect(parseCoordsFromMapsLink('')).toBeNull()
    expect(() => parseCoordsFromMapsLink(undefined)).not.toThrow()
    expect(parseCoordsFromMapsLink(undefined)).toBeNull()
  })
})

describe('collectExternalMapPoints', () => {
  function baseTrip(overrides) {
    return normalizeTrip({
      name: 'X',
      days: [{ date: '2026-08-30', items: [
        { title: 'Anello delle Malghe', kind: 'sentiero', lat: 46.4, lng: 12.6 },
        { title: 'Frontone', kind: 'spiaggia', lat: 40.9, lng: 12.9 },
        { title: 'Cena in paese', kind: 'pasto', lat: 40.91, lng: 12.91 },
        { title: 'Partenza', lat: 40.0, lng: 12.0 }
      ] }],
      sections: [
        { title: 'Ristoranti', type: 'cards', items: [{ title: 'Da Assunta', lat: 40.897, lng: 12.958 }] },
        { title: 'Bar consigliati', type: 'cards', items: [{ title: 'Senza coordinate' }] }
      ],
      ...overrides
    })
  }

  it('include le schede con coordinate, escludendo quelle senza', () => {
    const points = collectExternalMapPoints(baseTrip())
    const schede = points.filter((p) => p.categoryGroup === 'schede')
    expect(schede).toHaveLength(1)
    expect(schede[0]).toMatchObject({ name: 'Da Assunta', lat: 40.897, lng: 12.958, link: '' })
    expect(schede[0].origin.sectionTitle).toBe('Ristoranti')
  })

  it('conserva il link generico dell\'item, se presente', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'Ristoranti', type: 'cards', items: [{ title: 'Da Assunta', lat: 40.897, lng: 12.958, link: 'https://example.com' }] }]
    })
    const [point] = collectExternalMapPoints(trip)
    expect(point.link).toBe('https://example.com')
  })

  it('include sentiero/spiaggia/pasto con coordinate, non la voce generica', () => {
    const points = collectExternalMapPoints(baseTrip())
    expect(points.filter((p) => p.categoryGroup === 'sentiero')).toHaveLength(1)
    expect(points.filter((p) => p.categoryGroup === 'spiaggia')).toHaveLength(1)
    expect(points.filter((p) => p.categoryGroup === 'pasto')).toHaveLength(1)
    expect(points.find((p) => p.name === 'Partenza')).toBeUndefined()
  })

  it('origin delle voci giorno porta alla tab Itinerario con data e titolo', () => {
    const points = collectExternalMapPoints(baseTrip())
    const sentiero = points.find((p) => p.categoryGroup === 'sentiero')
    expect(sentiero.origin).toEqual({ tab: 'days', dayDate: '2026-08-30', itemTitle: 'Anello delle Malghe' })
  })

  it('non include mai i punti della sezione Mappa stessa', () => {
    const trip = normalizeTrip({
      name: 'X',
      sections: [{ title: 'Mappa', type: 'map', items: [{ name: 'Punto manuale', lat: 40.9, lng: 12.9 }] }]
    })
    expect(collectExternalMapPoints(trip)).toEqual([])
  })

  it('viaggio senza punti esterni: array vuoto', () => {
    const trip = normalizeTrip({ name: 'X' })
    expect(collectExternalMapPoints(trip)).toEqual([])
  })

  it('origin.tab di una scheda è l\'id della sezione, non solo il titolo', () => {
    const trip = baseTrip()
    const points = collectExternalMapPoints(trip)
    const scheda = points.find((p) => p.categoryGroup === 'schede')
    const ristoranti = trip.sections.find((s) => s.type === 'cards' && s.title === 'Ristoranti')
    expect(scheda.origin.tab).toBe(ristoranti.id)
  })

  it('esclude un item con solo una delle due coordinate', () => {
    const trip = normalizeTrip({
      name: 'X',
      days: [{ date: '2026-08-30', items: [
        { title: 'Solo lat', kind: 'sentiero', lat: 40.9 }
      ] }],
      sections: [
        { title: 'Ristoranti', type: 'cards', items: [{ title: 'Solo lng', lng: 12.9 }] }
      ]
    })
    const points = collectExternalMapPoints(trip)
    expect(points.find((p) => p.name === 'Solo lat')).toBeUndefined()
    expect(points.find((p) => p.name === 'Solo lng')).toBeUndefined()
  })
})
