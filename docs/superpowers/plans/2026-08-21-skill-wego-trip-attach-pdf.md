# Comando attach (allegati PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estendere `scripts/wego-trip-sync.mjs` con due comandi — `items` (elenco numerato di trasporti/alloggi) e `attach` (allega un PDF a una voce, dry-run/`--yes`) — così un PDF passato a Claude durante una sessione di pianificazione arriva nel bucket Supabase Storage e nella voce giusta, senza passare dal browser.

**Architecture:** Helper puri di formattazione/validazione in `scripts/wego-trip-lib.mjs` (nessun I/O); `cmdItems`/`cmdAttach` in `scripts/wego-trip-sync.mjs` seguono lo stesso schema dei comandi esistenti (`findTrip` per risolvere il viaggio, dry-run di default, scrittura solo con `{ yes: true }`). `attach` con `--yes` fa: rimozione best-effort del vecchio allegato (se presente) → upload del nuovo su `trip-attachments` → aggiornamento immutabile di `data` (mai mutare l'oggetto letto, per non corrompere `previous_data`) → update `tv_trips`.

**Tech Stack:** Node 24 (`node:fs`, `node:path`, `crypto` globale), `@supabase/supabase-js` (Storage, già in uso), Vitest.

**Spec:** [docs/superpowers/specs/2026-08-21-skill-wego-trip-attach-pdf-design.md](../specs/2026-08-21-skill-wego-trip-attach-pdf-design.md)

## Global Constraints

- Nessuna nuova dipendenza npm.
- Nessuna scrittura su Supabase (Storage o `tv_trips`) senza `--yes` esplicito.
- Commit piccoli, messaggio in italiano all'imperativo.
- Non modificare `findTrip`/`cmdPull`/`cmdPush`/`cmdCreate`/`cmdList` (già completi e revisionati) — solo aggiungere, mai alterare il loro comportamento.
- `attach`/`items` valgono solo per le sezioni `transport`/`lodging` (uniche con campi di allegato).
- Aggiornare `data` in modo immutabile: `previous_data` deve restare l'oggetto letto da Supabase prima di qualunque modifica, mai una copia già mutata.

---

### Task 1: Helper puri in `scripts/wego-trip-lib.mjs`

**Files:**
- Modify: `scripts/wego-trip-lib.mjs`
- Modify: `scripts/wego-trip-lib.test.js`

**Interfaces:**
- Produces (usate dai task successivi):
  - `ATTACHMENT_SECTION_TYPES: string[]` — `['transport', 'lodging']`
  - `isPdfPath(filePath: string): boolean`
  - `attachmentFields(sectionType: 'transport'|'lodging'): { pathField: string, nameField: string }`
  - `describeSectionItem(sectionType: string, item: object): string`
  - `formatItemsList(sectionType: string, sectionTitle: string, items: object[]): string`

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in coda a `scripts/wego-trip-lib.test.js`:

```js
import {
  ATTACHMENT_SECTION_TYPES,
  isPdfPath,
  attachmentFields,
  describeSectionItem,
  formatItemsList
} from './wego-trip-lib.mjs'

describe('isPdfPath', () => {
  it('accetta un percorso che finisce in .pdf, case-insensitive', () => {
    expect(isPdfPath('/tmp/biglietto.pdf')).toBe(true)
    expect(isPdfPath('/tmp/BIGLIETTO.PDF')).toBe(true)
  })
  it('rifiuta un percorso senza estensione .pdf', () => {
    expect(isPdfPath('/tmp/biglietto.txt')).toBe(false)
    expect(isPdfPath('/tmp/biglietto')).toBe(false)
  })
})

describe('attachmentFields', () => {
  it('torna i campi ticketFilePath/ticketFileName per transport', () => {
    expect(attachmentFields('transport')).toEqual({ pathField: 'ticketFilePath', nameField: 'ticketFileName' })
  })
  it('torna i campi bookingFilePath/bookingFileName per lodging', () => {
    expect(attachmentFields('lodging')).toEqual({ pathField: 'bookingFilePath', nameField: 'bookingFileName' })
  })
})

describe('describeSectionItem', () => {
  it('descrive un trasporto con modo, tratta e data', () => {
    expect(describeSectionItem('transport', { mode: 'traghetto', from: 'Formia', to: 'Ponza', date: '2026-08-30' }))
      .toBe('traghetto Formia → Ponza, 2026-08-30')
  })
  it('descrive un trasporto senza data', () => {
    expect(describeSectionItem('transport', { mode: 'treno', from: 'Bologna', to: 'Roma', date: '' }))
      .toBe('treno Bologna → Roma')
  })
  it('descrive un alloggio con nome e date', () => {
    expect(describeSectionItem('lodging', { name: 'Hotel Roma', checkIn: '2026-09-12', checkOut: '2026-09-15' }))
      .toBe('Hotel Roma, 2026-09-12 → 2026-09-15')
  })
  it('descrive un alloggio senza date', () => {
    expect(describeSectionItem('lodging', { name: 'Hotel Roma', checkIn: '', checkOut: '' })).toBe('Hotel Roma')
  })
})

describe('formatItemsList', () => {
  it('elenca le voci numerate con lo stato allegato', () => {
    const items = [
      { mode: 'traghetto', from: 'Formia', to: 'Ponza', date: '2026-08-30', ticketFileName: '' },
      { mode: 'aereo', from: 'Bologna', to: 'Roma', date: '2026-08-28', ticketFileName: 'biglietto-aereo.pdf' }
    ]
    const text = formatItemsList('transport', 'Trasporti', items)
    expect(text).toBe(
      '1. traghetto Formia → Ponza, 2026-08-30 (nessun allegato)\n' +
      '2. aereo Bologna → Roma, 2026-08-28 (allegato: biglietto-aereo.pdf)'
    )
  })
  it('segnala una sezione vuota', () => {
    expect(formatItemsList('lodging', 'Pernottamento', [])).toBe('Nessuna voce in Pernottamento.')
  })
})
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-lib.test.js`
Expected: FAIL — `ATTACHMENT_SECTION_TYPES`/`isPdfPath`/`attachmentFields`/`describeSectionItem`/`formatItemsList` non esistono ancora.

- [ ] **Step 3: Implementa gli helper**

Aggiungi in fondo a `scripts/wego-trip-lib.mjs`:

```js
export const ATTACHMENT_SECTION_TYPES = ['transport', 'lodging']

export function isPdfPath(filePath) {
  return typeof filePath === 'string' && /\.pdf$/i.test(filePath)
}

export function attachmentFields(sectionType) {
  return sectionType === 'transport'
    ? { pathField: 'ticketFilePath', nameField: 'ticketFileName' }
    : { pathField: 'bookingFilePath', nameField: 'bookingFileName' }
}

export function describeSectionItem(sectionType, item) {
  if (sectionType === 'transport') {
    const route = [item.from, item.to].filter(Boolean).join(' → ')
    const base = [item.mode || 'trasporto', route].filter(Boolean).join(' ')
    return item.date ? `${base}, ${item.date}` : base
  }
  const name = item.name || 'alloggio'
  const dates = [item.checkIn, item.checkOut].filter(Boolean).join(' → ')
  return dates ? `${name}, ${dates}` : name
}

function describeItemsListLine(sectionType, item, index) {
  const { nameField } = attachmentFields(sectionType)
  const status = item[nameField] ? `allegato: ${item[nameField]}` : 'nessun allegato'
  return `${index}. ${describeSectionItem(sectionType, item)} (${status})`
}

export function formatItemsList(sectionType, sectionTitle, items) {
  if (!items.length) return `Nessuna voce in ${sectionTitle}.`
  return items.map((item, i) => describeItemsListLine(sectionType, item, i + 1)).join('\n')
}
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-lib.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/wego-trip-lib.mjs scripts/wego-trip-lib.test.js
git commit -m "Aggiungi helper puri per l'elenco e la descrizione di trasporti/alloggi"
```

---

### Task 2: `findAttachmentSection`, `cmdItems` e comando `items`

**Files:**
- Modify: `scripts/wego-trip-sync.mjs`
- Modify: `scripts/wego-trip-sync.test.js`

**Interfaces:**
- Consumes: `ATTACHMENT_SECTION_TYPES`, `formatItemsList` da `./wego-trip-lib.mjs` (Task 1); `findTrip` (già esistente)
- Produces (usate dal Task 3):
  - `findAttachmentSection(tripData: object, sectionType: string): object` — lancia se `sectionType` non è `transport`/`lodging`, o se il viaggio non ha quella sezione
  - `cmdItems(supabase, session, identifier: string, sectionType: string): Promise<{ sectionTitle: string, items: object[] }>`

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in cima a `scripts/wego-trip-sync.test.js` (nell'import esistente da `./wego-trip-lib.mjs`) `ATTACHMENT_SECTION_TYPES` non serve importarlo nel test — è usato solo dentro `wego-trip-sync.mjs`. Aggiungi invece in coda al file:

```js
const { findAttachmentSection, cmdItems } = await import('./wego-trip-sync.mjs')

describe('findAttachmentSection', () => {
  it('trova la sezione transport nel data del viaggio', () => {
    const tripData = { sections: [{ title: 'Trasporti', type: 'transport', items: [{ mode: 'auto' }] }] }
    const section = findAttachmentSection(tripData, 'transport')
    expect(section.title).toBe('Trasporti')
  })

  it('rifiuta un sectionType non transport/lodging', () => {
    const tripData = { sections: [] }
    expect(() => findAttachmentSection(tripData, 'cards')).toThrow(/transport, lodging/)
  })

  it('rifiuta se il viaggio non ha quella sezione', () => {
    const tripData = { sections: [{ title: 'Trasporti', type: 'transport', items: [] }] }
    expect(() => findAttachmentSection(tripData, 'lodging')).toThrow(/lodging/)
  })
})

describe('cmdItems', () => {
  it('torna titolo sezione e voci per il viaggio risolto', async () => {
    const tripData = { name: 'Ponza', sections: [{ title: 'Pernottamento', type: 'lodging', items: [{ name: 'Hotel Roma' }] }] }
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ ilike: async () => ({ data: [tripRow({ data: tripData })], error: null }) }) }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'editor' }, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const result = await cmdItems(supabase, { user: { id: 'user-1' } }, 'Ponza', 'lodging')
    expect(result).toEqual({ sectionTitle: 'Pernottamento', items: [{ name: 'Hotel Roma' }] })
  })
})
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: FAIL — `findAttachmentSection`/`cmdItems` non esistono ancora, il comando `items` non è gestito da `main()`.

- [ ] **Step 3: Implementa `findAttachmentSection`, `cmdItems`, il ramo `items` in `main()`**

Aggiorna l'import da `./wego-trip-lib.mjs` in cima a `scripts/wego-trip-sync.mjs` aggiungendo `ATTACHMENT_SECTION_TYPES` e `formatItemsList`:

```js
import { isShareCode, generateShareCode, validateTripPayload, diffTrip, formatDiffSummary, ATTACHMENT_SECTION_TYPES, formatItemsList } from './wego-trip-lib.mjs'
```

Aggiungi dopo `cmdCreate`:

```js
export function findAttachmentSection(tripData, sectionType) {
  if (!ATTACHMENT_SECTION_TYPES.includes(sectionType)) {
    throw new Error(`Sezione non valida: "${sectionType}". Tipi ammessi: ${ATTACHMENT_SECTION_TYPES.join(', ')}.`)
  }
  const section = (tripData.sections ?? []).find((s) => s.type === sectionType)
  if (!section) {
    throw new Error(`Il viaggio non ha una sezione di tipo "${sectionType}".`)
  }
  return section
}

export async function cmdItems(supabase, session, identifier, sectionType) {
  const trip = await findTrip(supabase, session, identifier)
  const section = findAttachmentSection(trip.data, sectionType)
  return { sectionTitle: section.title, items: section.items ?? [] }
}
```

Nel corpo di `main()`, dopo il blocco `create`, aggiungi:

```js
    if (command === 'items') {
      const [identifier, sectionType] = positional
      if (!identifier || !sectionType) throw new Error('Uso: items <nome|share_code> <transport|lodging>')
      const { sectionTitle, items } = await cmdItems(supabase, session, identifier, sectionType)
      console.log(formatItemsList(sectionType, sectionTitle, items))
      return
    }
```

Aggiorna anche il messaggio di comando sconosciuto (in fondo a `main()`) per elencare i nuovi comandi:

```js
    console.error(`Comando sconosciuto: "${command}". Comandi disponibili: list, pull, push, create, items, attach.`)
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/wego-trip-sync.mjs scripts/wego-trip-sync.test.js
git commit -m "Aggiungi comando items per elencare trasporti/alloggi con stato allegato"
```

---

### Task 3: Comando `attach` (dry-run + upload/rimozione con `--yes`)

**Files:**
- Modify: `scripts/wego-trip-sync.mjs`
- Modify: `scripts/wego-trip-sync.test.js`

**Interfaces:**
- Consumes: `attachmentFields`, `describeSectionItem`, `isPdfPath` (Task 1); `findTrip`, `findAttachmentSection` (Task 2)
- Produces: `cmdAttach(supabase, session, identifier: string, sectionType: string, index: number, filePath: string, options: { yes: boolean }): Promise<{ written: boolean }>`

- [ ] **Step 1: Scrivi i test che falliscono**

Il file di test usa già `writeFileSync`/`mkdtempSync` da `node:fs` (introdotti
in un task precedente per `push`/`create`) — nessun nuovo import serve nel
file di test per questo task (`existsSync` è usato solo dentro
`wego-trip-sync.mjs`, non nei test).

Aggiungi una funzione di supporto e i test in coda al file:

```js
function writeTempPdfFile(name = 'biglietto.pdf') {
  const dir = mkdtempSync(join(tmpdir(), 'wego-attach-'))
  const filePath = join(dir, name)
  writeFileSync(filePath, '%PDF-1.4 contenuto finto')
  return filePath
}

const { cmdAttach } = await import('./wego-trip-sync.mjs')

describe('cmdAttach', () => {
  function tripDataWithTransport(overrides = {}) {
    return {
      name: 'Ponza',
      sections: [
        { title: 'Trasporti', type: 'transport', items: [{ mode: 'traghetto', from: 'Formia', to: 'Ponza', date: '2026-08-30', ticketFileName: '', ticketFilePath: '', ...overrides }] }
      ]
    }
  }

  function supabaseFor(tripData, { role = 'editor', uploadError = null, removeError = null } = {}) {
    // update è il mock di .update(payload): deve catturare il payload per
    // le asserzioni, non l'.eq() successivo (bug da non reintrodurre).
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
    const upload = vi.fn().mockResolvedValue({ error: uploadError })
    const remove = vi.fn().mockResolvedValue({ error: removeError })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ ilike: async () => ({ data: [tripRow({ data: tripData })], error: null }) }), update }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role }, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      }),
      storage: { from: vi.fn().mockReturnValue({ upload, remove }) }
    }
    return { supabase, update, upload, remove }
  }

  it('in dry-run stampa il riepilogo e non carica né scrive', async () => {
    const { supabase, update, upload } = supabaseFor(tripDataWithTransport())
    const filePath = writeTempPdfFile()

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdAttach(supabase, { user: { id: 'user-1' } }, 'Ponza', 'transport', 1, filePath, { yes: false })
    logSpy.mockRestore()

    expect(result).toEqual({ written: false })
    expect(upload).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('con --yes carica il file e aggiorna la voce, previous_data resta l\'originale', async () => {
    const tripData = tripDataWithTransport()
    const { supabase, update, upload } = supabaseFor(tripData)
    const filePath = writeTempPdfFile('nuovo.pdf')

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdAttach(supabase, { user: { id: 'user-1' } }, 'Ponza', 'transport', 1, filePath, { yes: true })
    logSpy.mockRestore()

    expect(result).toEqual({ written: true })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      previous_data: tripData,
      data: expect.objectContaining({
        sections: [expect.objectContaining({
          items: [expect.objectContaining({ ticketFileName: 'nuovo.pdf' })]
        })]
      })
    }))
  })

  it('sostituendo un allegato esistente, tenta prima la rimozione del vecchio file', async () => {
    const tripData = tripDataWithTransport({ ticketFileName: 'vecchio.pdf', ticketFilePath: 'trip-1/vecchio-uuid.pdf' })
    const { supabase, remove, upload } = supabaseFor(tripData)
    const filePath = writeTempPdfFile('nuovo.pdf')

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await cmdAttach(supabase, { user: { id: 'user-1' } }, 'Ponza', 'transport', 1, filePath, { yes: true })
    logSpy.mockRestore()

    expect(remove).toHaveBeenCalledWith(['trip-1/vecchio-uuid.pdf'])
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('se la rimozione del vecchio allegato fallisce, procede comunque con il nuovo upload', async () => {
    const tripData = tripDataWithTransport({ ticketFileName: 'vecchio.pdf', ticketFilePath: 'trip-1/vecchio-uuid.pdf' })
    const { supabase, upload, update } = supabaseFor(tripData, { removeError: { message: 'file già assente' } })
    const filePath = writeTempPdfFile('nuovo.pdf')

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdAttach(supabase, { user: { id: 'user-1' } }, 'Ponza', 'transport', 1, filePath, { yes: true })
    logSpy.mockRestore()
    errorSpy.mockRestore()

    expect(result).toEqual({ written: true })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('se l\'upload fallisce, non scrive su tv_trips', async () => {
    const { supabase, update } = supabaseFor(tripDataWithTransport(), { uploadError: { message: 'upload fallito' } })
    const filePath = writeTempPdfFile()

    await expect(cmdAttach(supabase, { user: { id: 'user-1' } }, 'Ponza', 'transport', 1, filePath, { yes: true })).rejects.toThrow('upload fallito')
    expect(update).not.toHaveBeenCalled()
  })

  it('rifiuta se il ruolo è viewer, prima di ogni upload', async () => {
    const { supabase, upload } = supabaseFor(tripDataWithTransport(), { role: 'viewer' })
    const filePath = writeTempPdfFile()

    await expect(cmdAttach(supabase, { user: { id: 'user-2' } }, 'Ponza', 'transport', 1, filePath, { yes: true })).rejects.toThrow(/viewer/)
    expect(upload).not.toHaveBeenCalled()
  })

  it('rifiuta un indice fuori range, prima di interrogare Supabase Storage', async () => {
    const { supabase, upload } = supabaseFor(tripDataWithTransport())
    const filePath = writeTempPdfFile()

    await expect(cmdAttach(supabase, { user: { id: 'user-1' } }, 'Ponza', 'transport', 5, filePath, { yes: true })).rejects.toThrow(/1 voci|indice/i)
    expect(upload).not.toHaveBeenCalled()
  })

  it('rifiuta un file non-pdf prima di interrogare Supabase', async () => {
    const supabase = { from: vi.fn(), storage: { from: vi.fn() } }
    const dir = mkdtempSync(join(tmpdir(), 'wego-attach-'))
    const filePath = join(dir, 'nota.txt')
    writeFileSync(filePath, 'non è un pdf')

    await expect(cmdAttach(supabase, { user: { id: 'user-1' } }, 'Ponza', 'transport', 1, filePath, { yes: false })).rejects.toThrow(/pdf/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('rifiuta un file inesistente prima di interrogare Supabase', async () => {
    const supabase = { from: vi.fn(), storage: { from: vi.fn() } }
    await expect(cmdAttach(supabase, { user: { id: 'user-1' } }, 'Ponza', 'transport', 1, '/tmp/non-esiste-davvero.pdf', { yes: false })).rejects.toThrow()
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
```

Nota: `tripRow()` è la stessa funzione di supporto già definita nel file per i test di `findTrip` (torna `{ id: 'trip-1', share_code: 'AB23CD', ... }`) — riusala, non ridefinirla.

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: FAIL — `cmdAttach` non esiste ancora, il comando `attach` non è gestito da `main()`.

- [ ] **Step 3: Implementa `cmdAttach`, aggiungi il ramo `attach` a `main()`**

Aggiungi gli import necessari in cima a `scripts/wego-trip-sync.mjs`:

```js
import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
```

(`readFileSync` è già importato da un task precedente — estendi la stessa riga con `existsSync` invece di duplicarla. Aggiorna anche l'import da `./wego-trip-lib.mjs` per includere `attachmentFields`, `describeSectionItem`, `isPdfPath`.)

Aggiungi in `scripts/wego-trip-sync.mjs`, dopo `cmdItems`:

```js
export async function cmdAttach(supabase, session, identifier, sectionType, index, filePath, { yes }) {
  if (!ATTACHMENT_SECTION_TYPES.includes(sectionType)) {
    throw new Error(`Sezione non valida: "${sectionType}". Tipi ammessi: ${ATTACHMENT_SECTION_TYPES.join(', ')}.`)
  }
  if (!existsSync(filePath) || !isPdfPath(filePath)) {
    throw new Error(`Il file "${filePath}" non esiste o non è un PDF.`)
  }

  const trip = await findTrip(supabase, session, identifier)
  if (trip.role === 'viewer') {
    throw new Error(`Sei solo viewer su "${trip.data.name}", non puoi modificarlo.`)
  }

  const section = findAttachmentSection(trip.data, sectionType)
  const items = section.items ?? []
  if (!Number.isInteger(index) || index < 1 || index > items.length) {
    throw new Error(`Indice non valido: ${section.title} ha ${items.length} voci. Usa "items" per vedere l'elenco aggiornato.`)
  }
  const item = items[index - 1]
  const { pathField, nameField } = attachmentFields(sectionType)
  const fileName = basename(filePath)
  const description = describeSectionItem(sectionType, item)

  if (!yes) {
    const lines = [`Verrà caricato "${fileName}" e collegato a: ${description}.`]
    if (item[nameField]) lines.push(`Sostituirà l'allegato attuale (${item[nameField]}).`)
    lines.push('', 'Nessuna scrittura eseguita (dry-run). Rilancia con --yes per confermare.')
    console.log(lines.join('\n'))
    return { written: false }
  }

  if (item[pathField]) {
    const { error: removeError } = await supabase.storage.from('trip-attachments').remove([item[pathField]])
    if (removeError) console.error(`Avviso: impossibile rimuovere il vecchio allegato (${removeError.message}). Procedo comunque.`)
  }

  const buffer = readFileSync(filePath)
  const storagePath = `${trip.id}/${crypto.randomUUID()}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('trip-attachments')
    .upload(storagePath, buffer, { contentType: 'application/pdf' })
  if (uploadError) throw new Error(uploadError.message)

  const updatedData = {
    ...trip.data,
    sections: trip.data.sections.map((s) => {
      if (s !== section) return s
      return {
        ...s,
        items: s.items.map((it, i) => (i === index - 1 ? { ...it, [pathField]: storagePath, [nameField]: fileName } : it))
      }
    })
  }

  const { error } = await supabase
    .from('tv_trips')
    .update({ data: updatedData, previous_data: trip.data, updated_at: new Date().toISOString() })
    .eq('id', trip.id)
  if (error) throw new Error(error.message)

  console.log(`Allegato "${fileName}" collegato a ${description}.`)
  return { written: true }
}
```

Nel corpo di `main()`, dopo il blocco `items`, aggiungi:

```js
    if (command === 'attach') {
      const [identifier, sectionType, indexArg, filePath] = positional
      if (!identifier || !sectionType || !indexArg || !filePath) throw new Error('Uso: attach <nome|share_code> <transport|lodging> <indice> <file.pdf> [--yes]')
      const index = Number.parseInt(indexArg, 10)
      await cmdAttach(supabase, session, identifier, sectionType, index, filePath, { yes })
      return
    }
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: PASS

- [ ] **Step 5: Verifica l'intera suite**

Run: `npm run test`
Expected: PASS (nessuna regressione)

- [ ] **Step 6: Commit**

```bash
git add scripts/wego-trip-sync.mjs scripts/wego-trip-sync.test.js
git commit -m "Aggiungi comando attach per allegare un PDF a trasporti/alloggi"
```

---

### Task 4: Documenta `items`/`attach` nella skill `.claude/skills/wego-trip/SKILL.md`

**Files:**
- Modify: `.claude/skills/wego-trip/SKILL.md`

**Interfaces:**
- Consumes: i comandi `items <nome|share_code> <transport|lodging>` e `attach <nome|share_code> <transport|lodging> <indice> <file.pdf> [--yes]` (Task 2-3)
- Produces: nessuna interfaccia di codice — documentazione

- [ ] **Step 1: Aggiungi una sezione "Allegare un PDF" a `SKILL.md`**

Inserisci, dopo la sezione "## Comandi" esistente, una nuova sezione:

```markdown
## Allegare un PDF a un trasporto o un alloggio

Quando l'utente allega un PDF di un biglietto o di una prenotazione durante
la conversazione:

1. Esegui `items <nome|share_code> <transport|lodging>` per la sezione
   pertinente e mostra l'elenco numerato all'utente, facendoti confermare
   quale voce corrisponde al PDF.
2. Esegui `attach <nome|share_code> <transport|lodging> <indice> <percorso.pdf>`
   **senza** `--yes`: riporta il riepilogo (incluso l'avviso se sostituisce
   un allegato già presente) e aspetta un sì esplicito, stessa procedura di
   `push`/`create`.
3. Rilancia con `--yes` solo dopo la conferma.

Il file PDF deve essere leggibile da un percorso locale nel momento in cui
lanci il comando via Bash — dipende da come l'ambiente in cui giri espone i
file allegati alla conversazione. Se non riesci a risalire a un percorso
locale del file, dillo all'utente invece di inventare un percorso.

```bash
node --env-file-if-exists=.env.local scripts/wego-trip-sync.mjs items "<nome o share_code>" transport
node --env-file-if-exists=.env.local scripts/wego-trip-sync.mjs attach "<nome o share_code>" transport 2 /percorso/biglietto.pdf
```
```

- [ ] **Step 2: Aggiorna la sezione "Errori comuni" con i nuovi casi**

Aggiungi due voci in fondo alla lista esistente in "## Errori comuni":

```markdown
- **"Sezione non valida..."** → `items`/`attach` valgono solo per `transport`
  o `lodging`.
- **"Indice non valido..."** → rilancia `items` per vedere l'elenco
  aggiornato prima di riprovare `attach`.
```

- [ ] **Step 3: Verifica manuale end-to-end (una volta, non automatizzabile)**

Nessun test automatico tocca il bucket Supabase reale. Prima di considerare
`attach` pronto all'uso quotidiano:

1. Su un viaggio di prova già sincronizzato, esegui `items <nome> transport`
   e verifica che l'elenco numerato corrisponda a quanto vedi nell'app.
2. Esegui `attach <nome> transport <indice> <un-pdf-di-prova.pdf>` senza
   `--yes`: verifica che stampi il riepilogo e non compaia nulla di nuovo
   nell'app.
3. Rilancia con `--yes`: verifica nell'app (sezione Trasporti di quel
   viaggio) che l'allegato compaia e sia scaricabile.
4. Ripeti `attach` sulla stessa voce con un secondo PDF: verifica che
   sostituisca il primo (nell'app compare solo l'ultimo) e che il vecchio
   file non resti nel bucket (controllabile dalla dashboard Supabase,
   Storage → `trip-attachments`).
5. Rimuovi l'allegato di prova dall'app a fine verifica.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/wego-trip/SKILL.md
git commit -m "Documenta i comandi items/attach nella skill wego-trip"
```
