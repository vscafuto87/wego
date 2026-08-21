import { describe, it, expect } from 'vitest'
import {
  SECTION_TYPES,
  isShareCode,
  generateShareCode,
  validateTripPayload,
  diffTrip,
  formatDiffSummary
} from './wego-trip-lib.mjs'

describe('isShareCode', () => {
  it('riconosce un codice a 6 caratteri dal set consentito', () => {
    expect(isShareCode('AB23CD')).toBe(true)
  })
  it('rifiuta un nome di viaggio normale', () => {
    expect(isShareCode('Ponza')).toBe(false)
  })
  it('rifiuta un codice con caratteri fuori dal set (I, O, 0, 1)', () => {
    expect(isShareCode('ABIO01')).toBe(false)
  })
})

describe('generateShareCode', () => {
  it('genera un codice di 6 caratteri dal set consentito', () => {
    const code = generateShareCode()
    expect(code).toHaveLength(6)
    expect(isShareCode(code)).toBe(true)
  })
})

describe('validateTripPayload', () => {
  it('accetta un viaggio con nome e sezioni valide', () => {
    expect(() => validateTripPayload({ name: 'Ponza', sections: [{ title: 'Trasporti', type: 'transport', items: [] }] })).not.toThrow()
  })
  it('rifiuta un viaggio senza nome', () => {
    expect(() => validateTripPayload({ sections: [] })).toThrow(/name/)
  })
  it('rifiuta un viaggio con un nome vuoto/spazi', () => {
    expect(() => validateTripPayload({ name: '   ' })).toThrow(/name/)
  })
  it('rifiuta un tipo di sezione non valido', () => {
    expect(() => validateTripPayload({ name: 'Ponza', sections: [{ title: 'X', type: 'gallery', items: [] }] })).toThrow(/gallery/)
  })
  it('elenca i tipi ammessi nel messaggio di errore', () => {
    expect(() => validateTripPayload({ name: 'Ponza', sections: [{ title: 'X', type: 'gallery' }] })).toThrow(SECTION_TYPES.join(', '))
  })
})

describe('diffTrip', () => {
  it('segnala un giorno nuovo quando non esiste nel remoto', () => {
    const diff = diffTrip({ days: [], sections: [] }, { days: [{ date: '2026-09-01', items: [{ title: 'Arrivo' }] }], sections: [] })
    expect(diff.days).toEqual([{ date: '2026-09-01', status: 'nuovo', itemCount: 1 }])
  })
  it('segnala un giorno invariato quando le voci coincidono', () => {
    const day = { date: '2026-09-01', items: [{ title: 'Arrivo', detail: '' }] }
    const diff = diffTrip({ days: [day], sections: [] }, { days: [day], sections: [] })
    expect(diff.days).toEqual([{ date: '2026-09-01', status: 'invariato' }])
  })
  it('segnala voci aggiunte, rimosse e modificate in un giorno', () => {
    const remote = { days: [{ date: '2026-09-01', items: [{ title: 'Colazione', detail: '' }, { title: 'Cena', detail: '' }] }], sections: [] }
    const proposed = { days: [{ date: '2026-09-01', items: [{ title: 'Colazione', detail: 'al bar' }, { title: 'Escursione', detail: '' }] }], sections: [] }
    const diff = diffTrip(remote, proposed)
    expect(diff.days).toEqual([{ date: '2026-09-01', status: 'modificato', added: ['Escursione'], removed: ['Cena'], changed: ['Colazione'] }])
  })
  it('segnala un giorno rimosso quando manca nella proposta', () => {
    const diff = diffTrip({ days: [{ date: '2026-09-01', items: [] }], sections: [] }, { days: [], sections: [] })
    expect(diff.days).toEqual([{ date: '2026-09-01', status: 'rimosso' }])
  })
  it('segnala una sezione nuova', () => {
    const diff = diffTrip({ days: [], sections: [] }, { days: [], sections: [{ title: 'Trasporti', type: 'transport', items: [{ mode: 'traghetto', from: 'Formia', to: 'Ponza' }] }] })
    expect(diff.sections).toEqual([{ title: 'Trasporti', status: 'nuova', itemCount: 1 }])
  })
  it('segnala una sezione notes con testo aggiornato', () => {
    const diff = diffTrip(
      { days: [], sections: [{ title: 'Note', type: 'notes', text: 'vecchio' }] },
      { days: [], sections: [{ title: 'Note', type: 'notes', text: 'nuovo' }] }
    )
    expect(diff.sections).toEqual([{ title: 'Note', status: 'testo aggiornato' }])
  })
  it('tratta un viaggio remoto null come tutto nuovo (creazione)', () => {
    const diff = diffTrip(null, { days: [{ date: '2026-09-01', items: [{ title: 'Arrivo' }] }], sections: [{ title: 'Ristoranti', type: 'cards', items: [] }] })
    expect(diff.days).toEqual([{ date: '2026-09-01', status: 'nuovo', itemCount: 1 }])
    expect(diff.sections).toEqual([{ title: 'Ristoranti', status: 'nuova', itemCount: 0 }])
  })
  it('ignora l\'ordine delle chiavi quando confronta item (Supabase vs Claude order mismatch)', () => {
    // Remote da Supabase: { title: '...', detail: '...' }
    // Proposed da Claude: { detail: '...', title: '...' }
    // Sono identici semanticamente, non dovrebbero essere segnalati come "changed"
    const remote = { days: [{ date: '2026-09-01', items: [{ title: 'Colazione', detail: '' }] }], sections: [] }
    const proposed = { days: [{ date: '2026-09-01', items: [{ detail: '', title: 'Colazione' }] }], sections: [] }
    const diff = diffTrip(remote, proposed)
    expect(diff.days).toEqual([{ date: '2026-09-01', status: 'invariato' }])
  })
  it('segnala i campi generali cambiati (name, start) quando giorni e sezioni sono invariati', () => {
    const remote = { name: 'Ponza', start: '2026-08-30', end: '2026-09-05', days: [], sections: [] }
    const proposed = { name: 'Ponza (bis)', start: '2026-09-01', end: '2026-09-05', days: [], sections: [] }
    const diff = diffTrip(remote, proposed)
    expect(diff.meta).toEqual([
      { field: 'name', from: 'Ponza', to: 'Ponza (bis)' },
      { field: 'start', from: '2026-08-30', to: '2026-09-01' }
    ])
  })
  it('segnala un meta vuoto quando nulla è cambiato a livello di viaggio', () => {
    const remote = { name: 'Ponza', start: '2026-08-30', end: '2026-09-05', days: [], sections: [] }
    const proposed = { name: 'Ponza', start: '2026-08-30', end: '2026-09-05', days: [], sections: [] }
    const diff = diffTrip(remote, proposed)
    expect(diff.meta).toEqual([])
  })
  it('in creazione (remoto null) segnala ogni campo scalare non vuoto della proposta, solo "to"', () => {
    const proposed = { name: 'Ponza', emoji: '🌊', place: 'Ponza (LT)', start: '2026-08-30', end: '2026-09-05', palette: 'sea', people: ['Vincenzo'], days: [], sections: [] }
    const diff = diffTrip(null, proposed)
    expect(diff.meta).toEqual([
      { field: 'name', to: 'Ponza' },
      { field: 'emoji', to: '🌊' },
      { field: 'place', to: 'Ponza (LT)' },
      { field: 'start', to: '2026-08-30' },
      { field: 'end', to: '2026-09-05' },
      { field: 'palette', to: 'sea' },
      { field: 'people', to: 'Vincenzo' }
    ])
  })
})

describe('formatDiffSummary', () => {
  it('produce un riepilogo leggibile per una modifica', () => {
    const diff = { days: [{ date: '2026-09-01', status: 'invariato' }], sections: [{ title: 'Trasporti', status: 'modificata', added: ['Traghetto'], removed: [], changed: [] }] }
    const summary = formatDiffSummary({ tripName: 'Ponza', shareCode: 'AB12CD', diff, isCreate: false })
    expect(summary).toContain('Viaggio: Ponza (share_code AB12CD)')
    expect(summary).toContain('2026-09-01: nessuna modifica')
    expect(summary).toContain('Trasporti: +1 voce (Traghetto)')
    expect(summary).toContain('Nessuna scrittura eseguita (dry-run)')
  })
  it('produce un riepilogo per una creazione, senza share_code', () => {
    const diff = { days: [{ date: '2026-09-01', status: 'nuovo', itemCount: 2 }], sections: [] }
    const summary = formatDiffSummary({ tripName: 'Ponza', shareCode: null, diff, isCreate: true })
    expect(summary).toContain('Nuovo viaggio: Ponza')
    expect(summary).toContain('2026-09-01: nuovo giorno (2 voci)')
  })
  it('include un blocco "Dati generali:" quando diff.meta non è vuoto', () => {
    const diff = {
      meta: [{ field: 'name', from: 'Ponza', to: 'Ponza (bis)' }],
      days: [{ date: '2026-09-01', status: 'invariato' }],
      sections: []
    }
    const summary = formatDiffSummary({ tripName: 'Ponza (bis)', shareCode: 'AB12CD', diff, isCreate: false })
    expect(summary).toContain('Dati generali:')
    expect(summary).toContain('name: Ponza → Ponza (bis)')
  })
  it('non include "Dati generali:" quando diff.meta è vuoto o assente (retrocompatibilità)', () => {
    const diffSenzaMeta = { days: [{ date: '2026-09-01', status: 'invariato' }], sections: [{ title: 'Trasporti', status: 'modificata', added: ['Traghetto'], removed: [], changed: [] }] }
    const summarySenzaMeta = formatDiffSummary({ tripName: 'Ponza', shareCode: 'AB12CD', diff: diffSenzaMeta, isCreate: false })
    expect(summarySenzaMeta).not.toContain('Dati generali:')

    const diffMetaVuoto = { meta: [], days: [{ date: '2026-09-01', status: 'invariato' }], sections: [] }
    const summaryMetaVuoto = formatDiffSummary({ tripName: 'Ponza', shareCode: 'AB12CD', diff: diffMetaVuoto, isCreate: false })
    expect(summaryMetaVuoto).not.toContain('Dati generali:')
  })
})
