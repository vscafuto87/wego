# Skill di pianificazione viaggio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una skill di progetto (`.claude/skills/wego-trip/`) che guida una pianificazione conversazionale del viaggio giorno per giorno e poi crea o modifica il viaggio direttamente su Supabase, tramite un CLI Node standalone.

**Architecture:** Un modulo puro (`scripts/wego-trip-lib.mjs`, nessun I/O) calcola validazione e riepilogo differenze; un CLI (`scripts/wego-trip-sync.mjs`) fa da bootstrap Supabase (auth con credenziali dedicate), risolve il viaggio target per nome o share_code, ed espone i comandi `list`/`pull`/`push`/`create` — questi ultimi due sempre in dry-run finché non si passa `--yes`. La skill è pura documentazione (`SKILL.md`) che istruisce Claude su come condurre la conversazione e quando invocare il CLI via Bash.

**Tech Stack:** Node 24 (`--env-file`, nessuna dipendenza `dotenv`), `@supabase/supabase-js` (già in `package.json`), Vitest per i test.

**Spec:** [docs/superpowers/specs/2026-08-21-skill-pianificazione-viaggio-design.md](../specs/2026-08-21-skill-pianificazione-viaggio-design.md)

## Global Constraints

- Nessuna nuova dipendenza npm: solo `@supabase/supabase-js` (già installato) e le API native di Node 24.
- Niente `SUPABASE_SERVICE_ROLE_KEY`, niente endpoint `api/admin/*`: lo script si autentica come utente normale e rispetta le RLS esistenti su `tv_trips`/`tv_trip_members`.
- Credenziali (`WEGO_SCRIPT_EMAIL`, `WEGO_SCRIPT_PASSWORD`) solo in `.env.local`, mai nel codice o nei commit.
- Nessuna scrittura su Supabase senza `--yes` esplicito: `push` e `create` di default fanno solo un dry-run.
- Stesso schema JSON del prompt di `ImportView.jsx`: sei tipi di sezione (`cards, checklist, notes, transport, lodging, map`), campo opzionale `kind` (`sentiero, spiaggia, pasto`) sulle voci giorno. Mai inventare/calcolare `lat`/`lng`.
- Commit piccoli, messaggio in italiano all'imperativo.
- Nessuna modifica alle migrazioni Supabase o allo schema del viaggio (`src/data/schema.js` resta invariato).

---

### Task 1: Libreria pura di validazione e diff (`scripts/wego-trip-lib.mjs`)

**Files:**
- Create: `scripts/wego-trip-lib.mjs`
- Test: `scripts/wego-trip-lib.test.js`

**Interfaces:**
- Produces (usate dai task successivi):
  - `SECTION_TYPES: string[]` — `['cards', 'checklist', 'notes', 'transport', 'lodging', 'map']`
  - `isShareCode(value: string): boolean`
  - `generateShareCode(): string`
  - `validateTripPayload(data: object): void` — lancia `Error` se manca `name` o se una sezione ha `type` non valido
  - `diffTrip(remoteData: object|null, proposedData: object): { days: Array, sections: Array }`
  - `formatDiffSummary({ tripName: string, shareCode: string|null, diff: object, isCreate: boolean }): string`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `scripts/wego-trip-lib.test.js`:

```js
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
})

describe('formatDiffSummary', () => {
  it('produce un riepilogo leggibile per una modifica', () => {
    const diff = { days: [{ date: '2026-09-01', status: 'invariato' }], sections: [{ title: 'Trasporti', status: 'modificata', added: ['Traghetto'], removed: [], changed: [] }] }
    const summary = formatDiffSummary({ tripName: 'Ponza', shareCode: 'AB23CD', diff, isCreate: false })
    expect(summary).toContain('Viaggio: Ponza (share_code AB23CD)')
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
})
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-lib.test.js`
Expected: FAIL — `scripts/wego-trip-lib.mjs` non esiste ancora.

- [ ] **Step 3: Implementa `scripts/wego-trip-lib.mjs`**

```js
export const SECTION_TYPES = ['cards', 'checklist', 'notes', 'transport', 'lodging', 'map']

const SHARE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SHARE_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/

export function isShareCode(value) {
  return typeof value === 'string' && SHARE_CODE_RE.test(value)
}

export function generateShareCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += SHARE_CODE_CHARS[Math.floor(Math.random() * SHARE_CODE_CHARS.length)]
  }
  return code
}

export function validateTripPayload(data) {
  if (!data || typeof data !== 'object' || !String(data.name || '').trim()) {
    throw new Error('Il file non ha un campo "name" valido.')
  }
  const sections = Array.isArray(data.sections) ? data.sections : []
  for (const section of sections) {
    if (!SECTION_TYPES.includes(section.type)) {
      throw new Error(`Tipo di sezione non valido: "${section.type}". Tipi ammessi: ${SECTION_TYPES.join(', ')}.`)
    }
  }
}

function itemKey(item) {
  if (item && typeof item === 'object') {
    if (typeof item.title === 'string' && item.title) return item.title
    if (typeof item.name === 'string' && item.name) return item.name
    if (typeof item.text === 'string' && item.text) return item.text
    if (item.mode || item.from || item.to) return `${item.mode || ''} ${item.from || ''}→${item.to || ''}`.trim()
  }
  return JSON.stringify(item)
}

function diffItems(remoteItems, proposedItems) {
  const remoteMap = new Map(remoteItems.map((item) => [itemKey(item), item]))
  const proposedMap = new Map(proposedItems.map((item) => [itemKey(item), item]))
  const added = []
  const changed = []
  for (const [key, item] of proposedMap) {
    if (!remoteMap.has(key)) added.push(key)
    else if (JSON.stringify(remoteMap.get(key)) !== JSON.stringify(item)) changed.push(key)
  }
  const removed = [...remoteMap.keys()].filter((key) => !proposedMap.has(key))
  return { added, removed, changed }
}

function isUnchanged(itemDiff) {
  return !itemDiff.added.length && !itemDiff.removed.length && !itemDiff.changed.length
}

function diffDays(remoteDays, proposedDays) {
  const remoteByDate = new Map(remoteDays.map((day) => [day.date, day]))
  const proposedByDate = new Map(proposedDays.map((day) => [day.date, day]))
  const days = []

  for (const [date, day] of proposedByDate) {
    const remoteDay = remoteByDate.get(date)
    if (!remoteDay) {
      days.push({ date, status: 'nuovo', itemCount: (day.items ?? []).length })
      continue
    }
    const itemDiff = diffItems(remoteDay.items ?? [], day.items ?? [])
    days.push(isUnchanged(itemDiff) ? { date, status: 'invariato' } : { date, status: 'modificato', ...itemDiff })
  }
  for (const date of remoteByDate.keys()) {
    if (!proposedByDate.has(date)) days.push({ date, status: 'rimosso' })
  }
  return days
}

function diffSections(remoteSections, proposedSections) {
  const remoteByTitle = new Map(remoteSections.map((s) => [s.title, s]))
  const proposedByTitle = new Map(proposedSections.map((s) => [s.title, s]))
  const sections = []

  for (const [title, section] of proposedByTitle) {
    const remoteSection = remoteByTitle.get(title)
    if (!remoteSection) {
      sections.push({ title, status: 'nuova', itemCount: section.type === 'notes' ? 0 : (section.items ?? []).length })
      continue
    }
    if (section.type === 'notes') {
      sections.push({ title, status: remoteSection.text === section.text ? 'invariata' : 'testo aggiornato' })
      continue
    }
    const itemDiff = diffItems(remoteSection.items ?? [], section.items ?? [])
    sections.push(isUnchanged(itemDiff) ? { title, status: 'invariata' } : { title, status: 'modificata', ...itemDiff })
  }
  for (const title of remoteByTitle.keys()) {
    if (!proposedByTitle.has(title)) sections.push({ title, status: 'rimossa' })
  }
  return sections
}

export function diffTrip(remoteData, proposedData) {
  return {
    days: diffDays(remoteData?.days ?? [], proposedData?.days ?? []),
    sections: diffSections(remoteData?.sections ?? [], proposedData?.sections ?? [])
  }
}

function describeChange(label, entry) {
  const parts = []
  if (entry.added.length) parts.push(`+${entry.added.length} voce (${entry.added.join(', ')})`)
  if (entry.removed.length) parts.push(`-${entry.removed.length} voce (${entry.removed.join(', ')})`)
  if (entry.changed.length) parts.push(`${entry.changed.length} modificata (${entry.changed.join(', ')})`)
  return `  ${label}: ${parts.join(', ')}`
}

function describeDay(day) {
  if (day.status === 'invariato') return `  ${day.date}: nessuna modifica`
  if (day.status === 'nuovo') return `  ${day.date}: nuovo giorno (${day.itemCount} voci)`
  if (day.status === 'rimosso') return `  ${day.date}: rimosso`
  return describeChange(day.date, day)
}

function describeSection(section) {
  if (section.status === 'invariata') return `  ${section.title}: nessuna modifica`
  if (section.status === 'nuova') return `  ${section.title}: nuova sezione (${section.itemCount} voci)`
  if (section.status === 'rimossa') return `  ${section.title}: rimossa`
  if (section.status === 'testo aggiornato') return `  ${section.title}: testo aggiornato`
  return describeChange(section.title, section)
}

export function formatDiffSummary({ tripName, shareCode, diff, isCreate }) {
  const header = isCreate ? `Nuovo viaggio: ${tripName}` : `Viaggio: ${tripName} (share_code ${shareCode})`
  return [
    header,
    '',
    'Giorni:',
    ...diff.days.map(describeDay),
    '',
    'Sezioni:',
    ...diff.sections.map(describeSection),
    '',
    'Nessuna scrittura eseguita (dry-run). Rilancia con --yes per confermare.'
  ].join('\n')
}
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-lib.test.js`
Expected: PASS (tutti i test verdi)

- [ ] **Step 5: Commit**

```bash
git add scripts/wego-trip-lib.mjs scripts/wego-trip-lib.test.js
git commit -m "Aggiungi libreria pura di validazione e diff per lo script di sync viaggio"
```

---

### Task 2: Bootstrap CLI, autenticazione e comando `list`

**Files:**
- Create: `scripts/wego-trip-sync.mjs`
- Test: `scripts/wego-trip-sync.test.js`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: `isShareCode`, `generateShareCode`, `validateTripPayload`, `diffTrip`, `formatDiffSummary` da `./wego-trip-lib.mjs` (Task 1) — usati dai comandi dei task successivi, non ancora da questo task
- Produces (usate dai task successivi):
  - `parseArgs(argv: string[]): { command: string, positional: string[], yes: boolean }`
  - `requireEnv(env: object, names: string[]): void`
  - `createAuthenticatedClient(env?: object): Promise<{ supabase: object, session: object }>`
  - `cmdList(supabase: object, session: object): Promise<Array<{ name: string, shareCode: string, role: string, updatedAt: string }>>`
  - `main()` — dispatcher che i task successivi estendono aggiungendo rami `else if`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `scripts/wego-trip-sync.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }))

const { parseArgs, requireEnv, createAuthenticatedClient, cmdList } = await import('./wego-trip-sync.mjs')

describe('parseArgs', () => {
  it('separa comando, argomenti posizionali e flag --yes', () => {
    expect(parseArgs(['push', 'Ponza', 'trip.json', '--yes'])).toEqual({ command: 'push', positional: ['Ponza', 'trip.json'], yes: true })
  })
  it('yes è false quando il flag non è presente', () => {
    expect(parseArgs(['list'])).toEqual({ command: 'list', positional: [], yes: false })
  })
})

describe('requireEnv', () => {
  it('non lancia se tutte le variabili sono presenti', () => {
    expect(() => requireEnv({ A: '1', B: '2' }, ['A', 'B'])).not.toThrow()
  })
  it('lancia elencando le variabili mancanti', () => {
    expect(() => requireEnv({ A: '1' }, ['A', 'B', 'C'])).toThrow('B, C')
  })
})

describe('createAuthenticatedClient', () => {
  const fullEnv = {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
    WEGO_SCRIPT_EMAIL: 'me@example.com',
    WEGO_SCRIPT_PASSWORD: 'secret'
  }

  beforeEach(() => {
    mockCreateClient.mockReset()
  })

  it('rifiuta se mancano le credenziali dello script', async () => {
    await expect(createAuthenticatedClient({ VITE_SUPABASE_URL: 'x', VITE_SUPABASE_ANON_KEY: 'y' })).rejects.toThrow(/WEGO_SCRIPT_EMAIL/)
  })

  it('autentica e torna client + sessione', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword } })

    const { supabase, session } = await createAuthenticatedClient(fullEnv)

    expect(mockCreateClient).toHaveBeenCalledWith('https://x.supabase.co', 'anon-key')
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'me@example.com', password: 'secret' })
    expect(session).toEqual({ user: { id: 'user-1' } })
    expect(supabase).toBeDefined()
  })

  it('propaga un errore di login chiaro', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword } })

    await expect(createAuthenticatedClient(fullEnv)).rejects.toThrow('Invalid login credentials')
  })
})

describe('cmdList', () => {
  it('elenca i viaggi con nome, share_code, ruolo e data aggiornamento', async () => {
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          { trip_id: 't1', role: 'editor', tv_trips: { data: { name: 'Ponza' }, share_code: 'AB23CD', updated_at: '2026-08-21T10:00:00Z' } },
          { trip_id: 't2', role: 'viewer', tv_trips: { data: { name: 'Dolomiti' }, share_code: 'ZZ99YY', updated_at: '2026-08-20T09:00:00Z' } }
        ],
        error: null
      })
    })
    const supabase = { from: vi.fn().mockReturnValue({ select }) }
    const session = { user: { id: 'user-1' } }

    const trips = await cmdList(supabase, session)

    expect(supabase.from).toHaveBeenCalledWith('tv_trip_members')
    expect(trips).toEqual([
      { name: 'Ponza', shareCode: 'AB23CD', role: 'editor', updatedAt: '2026-08-21T10:00:00Z' },
      { name: 'Dolomiti', shareCode: 'ZZ99YY', role: 'viewer', updatedAt: '2026-08-20T09:00:00Z' }
    ])
  })

  it('propaga un errore Supabase', async () => {
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) })
    const supabase = { from: vi.fn().mockReturnValue({ select }) }
    await expect(cmdList(supabase, { user: { id: 'user-1' } })).rejects.toThrow('boom')
  })
})
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: FAIL — `scripts/wego-trip-sync.mjs` non esiste ancora.

- [ ] **Step 3: Implementa `scripts/wego-trip-sync.mjs`**

```js
import { createClient } from '@supabase/supabase-js'
import { isShareCode, generateShareCode, validateTripPayload, diffTrip, formatDiffSummary } from './wego-trip-lib.mjs'

export function parseArgs(argv) {
  const [command, ...rest] = argv
  const yes = rest.includes('--yes')
  const positional = rest.filter((arg) => arg !== '--yes')
  return { command, positional, yes }
}

export function requireEnv(env, names) {
  const missing = names.filter((name) => !env[name])
  if (missing.length) {
    throw new Error(`Variabili mancanti in .env.local: ${missing.join(', ')}.`)
  }
}

export async function createAuthenticatedClient(env = process.env) {
  requireEnv(env, ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'WEGO_SCRIPT_EMAIL', 'WEGO_SCRIPT_PASSWORD'])
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  const { data, error } = await supabase.auth.signInWithPassword({
    email: env.WEGO_SCRIPT_EMAIL,
    password: env.WEGO_SCRIPT_PASSWORD
  })
  if (error) throw new Error(error.message)
  return { supabase, session: data.session }
}

export async function cmdList(supabase, session) {
  const { data, error } = await supabase
    .from('tv_trip_members')
    .select('trip_id, role, tv_trips(data, updated_at, share_code)')
    .eq('user_id', session.user.id)
  if (error) throw new Error(error.message)
  return data.map((row) => ({
    name: row.tv_trips.data.name,
    shareCode: row.tv_trips.share_code,
    role: row.role,
    updatedAt: row.tv_trips.updated_at
  }))
}

export async function main() {
  const { command, positional, yes } = parseArgs(process.argv.slice(2))
  try {
    const { supabase, session } = await createAuthenticatedClient()

    if (command === 'list') {
      const trips = await cmdList(supabase, session)
      if (!trips.length) {
        console.log('Nessun viaggio.')
        return
      }
      for (const trip of trips) {
        console.log(`${trip.name} — ${trip.shareCode} — ${trip.role} — ${trip.updatedAt}`)
      }
      return
    }

    console.error(`Comando sconosciuto: "${command}". Comandi disponibili: list, pull, push, create.`)
    process.exitCode = 1
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: PASS

- [ ] **Step 5: Aggiungi le variabili d'ambiente dello script a `.env.local.example`**

Aggiungi in fondo al file (dopo il blocco `VITE_DEV_SKIP_LOGIN` esistente):

```
# Solo per scripts/wego-trip-sync.mjs (skill di pianificazione viaggio):
# stesso account che usi nell'app, non una nuova chiave Supabase.
# WEGO_SCRIPT_EMAIL=
# WEGO_SCRIPT_PASSWORD=
```

- [ ] **Step 6: Commit**

```bash
git add scripts/wego-trip-sync.mjs scripts/wego-trip-sync.test.js .env.local.example
git commit -m "Aggiungi bootstrap CLI e comando list per lo script di sync viaggio"
```

---

### Task 3: Risoluzione viaggio per nome/share_code e comando `pull`

**Files:**
- Modify: `scripts/wego-trip-sync.mjs`
- Modify: `scripts/wego-trip-sync.test.js`

**Interfaces:**
- Consumes: `isShareCode` da `./wego-trip-lib.mjs` (Task 1)
- Produces (usate dai task successivi):
  - `findTrip(supabase: object, session: object, identifier: string): Promise<{ id: string, shareCode: string, data: object, updatedAt: string, ownerId: string, role: 'editor'|'viewer' }>`
  - `cmdPull(supabase: object, session: object, identifier: string): Promise<object>` — torna il `data` del viaggio

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi a `scripts/wego-trip-sync.test.js` (in coda al file):

```js
const { findTrip, cmdPull } = await import('./wego-trip-sync.mjs')

function tripRow(overrides = {}) {
  return { id: 'trip-1', share_code: 'AB23CD', data: { name: 'Ponza' }, updated_at: '2026-08-21T10:00:00Z', owner_id: 'user-1', ...overrides }
}

describe('findTrip', () => {
  it('trova per nome (ilike su data->>name) e determina il ruolo da tv_trip_members', async () => {
    const eqMembers = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'editor' }, error: null }) })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ ilike: vi.fn().mockResolvedValue({ data: [tripRow()], error: null }) }) }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: eqMembers }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const result = await findTrip(supabase, { user: { id: 'user-1' } }, 'Ponza')
    expect(result).toEqual({ id: 'trip-1', shareCode: 'AB23CD', data: { name: 'Ponza' }, updatedAt: '2026-08-21T10:00:00Z', ownerId: 'user-1', role: 'editor' })
  })

  it('trova per share_code (eq su share_code)', async () => {
    const eqShareCode = vi.fn().mockResolvedValue({ data: [tripRow()], error: null })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ eq: eqShareCode }) }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const result = await findTrip(supabase, { user: { id: 'user-2' } }, 'AB23CD')
    expect(eqShareCode).toHaveBeenCalledWith('share_code', 'AB23CD')
    expect(result.role).toBe('viewer')
  })

  it('deduce il ruolo editor per l\'owner anche senza riga in tv_trip_members', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ ilike: async () => ({ data: [tripRow({ owner_id: 'user-1' })], error: null }) }) }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const result = await findTrip(supabase, { user: { id: 'user-1' } }, 'Ponza')
    expect(result.role).toBe('editor')
  })

  it('rifiuta se nessun viaggio corrisponde', async () => {
    const supabase = { from: () => ({ select: () => ({ ilike: async () => ({ data: [], error: null }) }) }) }
    await expect(findTrip(supabase, { user: { id: 'user-1' } }, 'Sconosciuto')).rejects.toThrow(/Nessun viaggio/)
  })

  it('rifiuta con l\'elenco degli share_code se il nome è ambiguo', async () => {
    const supabase = { from: () => ({ select: () => ({ ilike: async () => ({ data: [tripRow({ share_code: 'AAA111' }), tripRow({ share_code: 'BBB222' })], error: null }) }) }) }
    await expect(findTrip(supabase, { user: { id: 'user-1' } }, 'Ponza')).rejects.toThrow(/AAA111.*BBB222|BBB222.*AAA111/)
  })
})

describe('cmdPull', () => {
  it('torna il data del viaggio trovato', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ eq: async () => ({ data: [tripRow({ data: { name: 'Ponza', days: [] } })], error: null }) }) }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'editor' }, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const data = await cmdPull(supabase, { user: { id: 'user-1' } }, 'AB23CD')
    expect(data).toEqual({ name: 'Ponza', days: [] })
  })
})
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: FAIL — `findTrip`/`cmdPull` non esistono ancora, e il comando `pull` non è ancora gestito da `main()`.

- [ ] **Step 3: Implementa `findTrip` e `cmdPull`, aggiungi il ramo `pull` a `main()`**

Aggiungi in `scripts/wego-trip-sync.mjs`, dopo `cmdList`:

```js
export async function findTrip(supabase, session, identifier) {
  const base = supabase.from('tv_trips').select('id, share_code, data, updated_at, owner_id')
  const { data: rows, error } = isShareCode(identifier)
    ? await base.eq('share_code', identifier)
    : await base.ilike('data->>name', identifier)
  if (error) throw new Error(error.message)
  if (!rows || rows.length === 0) {
    throw new Error(`Nessun viaggio "${identifier}" tra quelli a cui hai accesso. Usa "list" per vedere i nomi disponibili.`)
  }
  if (rows.length > 1) {
    throw new Error(`Più viaggi chiamati "${identifier}": usa lo share_code per scegliere (${rows.map((r) => r.share_code).join(', ')}).`)
  }
  const row = rows[0]
  const { data: memberRow } = await supabase
    .from('tv_trip_members')
    .select('role')
    .eq('trip_id', row.id)
    .eq('user_id', session.user.id)
    .maybeSingle()
  const role = memberRow?.role ?? (row.owner_id === session.user.id ? 'editor' : 'viewer')
  return { id: row.id, shareCode: row.share_code, data: row.data, updatedAt: row.updated_at, ownerId: row.owner_id, role }
}

export async function cmdPull(supabase, session, identifier) {
  const trip = await findTrip(supabase, session, identifier)
  return trip.data
}
```

Nel corpo di `main()`, subito dopo il blocco `if (command === 'list') { ... }`, aggiungi:

```js
    if (command === 'pull') {
      const [identifier] = positional
      if (!identifier) throw new Error('Uso: pull <nome|share_code>')
      const data = await cmdPull(supabase, session, identifier)
      console.log(JSON.stringify(data, null, 2))
      return
    }
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/wego-trip-sync.mjs scripts/wego-trip-sync.test.js
git commit -m "Aggiungi risoluzione viaggio per nome/share_code e comando pull"
```

---

### Task 4: Comando `push` (dry-run + scrittura con `--yes`)

**Files:**
- Modify: `scripts/wego-trip-sync.mjs`
- Modify: `scripts/wego-trip-sync.test.js`

**Interfaces:**
- Consumes: `findTrip` (Task 3), `validateTripPayload`, `diffTrip`, `formatDiffSummary` (Task 1)
- Produces: `cmdPush(supabase: object, session: object, identifier: string, filePath: string, options: { yes: boolean }): Promise<{ written: boolean }>`

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in cima a `scripts/wego-trip-sync.test.js`, dopo gli import esistenti:

```js
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function writeTempTripFile(data) {
  const dir = mkdtempSync(join(tmpdir(), 'wego-trip-'))
  const filePath = join(dir, 'trip.json')
  writeFileSync(filePath, JSON.stringify(data))
  return filePath
}
```

Aggiungi in coda al file:

```js
const { cmdPush } = await import('./wego-trip-sync.mjs')

describe('cmdPush', () => {
  function supabaseFor(row, { updateOk = true } = {}) {
    // L'identifier usato in questi test è sempre un nome ("Ponza"), non uno
    // share_code: findTrip prende quindi il ramo .ilike(...), non .eq(...).
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: updateOk ? null : { message: 'update fallito' } }) })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { select: () => ({ ilike: async () => ({ data: [row], error: null }) }), update }
        if (table === 'tv_trip_members') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: row.__role ?? 'editor' }, error: null }) }) }) }) }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    return { supabase, update }
  }

  it('in dry-run stampa il riepilogo e non scrive', async () => {
    const row = tripRow({ data: { name: 'Ponza', days: [], sections: [] } })
    const { supabase, update } = supabaseFor(row)
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdPush(supabase, { user: { id: 'user-1' } }, 'Ponza', filePath, { yes: false })
    logSpy.mockRestore()

    expect(result).toEqual({ written: false })
    expect(update).not.toHaveBeenCalled()
  })

  it('con --yes scrive data, sposta il vecchio valore in previous_data', async () => {
    const row = tripRow({ data: { name: 'Ponza vecchia', days: [], sections: [] } })
    const { supabase, update } = supabaseFor(row)
    const proposed = { name: 'Ponza aggiornata', days: [], sections: [] }
    const filePath = writeTempTripFile(proposed)

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdPush(supabase, { user: { id: 'user-1' } }, 'Ponza', filePath, { yes: true })
    logSpy.mockRestore()

    expect(result).toEqual({ written: true })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: proposed, previous_data: row.data }))
  })

  it('rifiuta se il ruolo è viewer', async () => {
    const row = tripRow({ __role: 'viewer', data: { name: 'Ponza', days: [], sections: [] } })
    const { supabase } = supabaseFor(row)
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    await expect(cmdPush(supabase, { user: { id: 'user-2' } }, 'Ponza', filePath, { yes: false })).rejects.toThrow(/viewer/)
  })

  it('rifiuta un file con un tipo di sezione non valido, prima di interrogare Supabase', async () => {
    const supabase = { from: vi.fn() }
    const filePath = writeTempTripFile({ name: 'Ponza', sections: [{ title: 'X', type: 'gallery', items: [] }] })

    await expect(cmdPush(supabase, { user: { id: 'user-1' } }, 'Ponza', filePath, { yes: false })).rejects.toThrow(/gallery/)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: FAIL — `cmdPush` non esiste ancora, il ramo `push` non è gestito da `main()`.

- [ ] **Step 3: Implementa `cmdPush`, aggiungi il ramo `push` a `main()`**

Aggiungi l'import di `readFileSync` in cima al file:

```js
import { readFileSync } from 'node:fs'
```

Aggiungi in `scripts/wego-trip-sync.mjs`, dopo `cmdPull`:

```js
export async function cmdPush(supabase, session, identifier, filePath, { yes }) {
  const proposed = JSON.parse(readFileSync(filePath, 'utf8'))
  validateTripPayload(proposed)

  const trip = await findTrip(supabase, session, identifier)
  if (trip.role === 'viewer') {
    throw new Error(`Sei solo viewer su "${trip.data.name}", non puoi modificarlo.`)
  }

  const diff = diffTrip(trip.data, proposed)
  const summary = formatDiffSummary({ tripName: trip.data.name, shareCode: trip.shareCode, diff, isCreate: false })

  if (!yes) {
    console.log(summary)
    return { written: false }
  }

  const { error } = await supabase
    .from('tv_trips')
    .update({ data: proposed, previous_data: trip.data, updated_at: new Date().toISOString() })
    .eq('id', trip.id)
  if (error) throw new Error(error.message)

  console.log(`Viaggio "${proposed.name}" aggiornato.`)
  return { written: true }
}
```

Nel corpo di `main()`, dopo il blocco `pull`, aggiungi:

```js
    if (command === 'push') {
      const [identifier, filePath] = positional
      if (!identifier || !filePath) throw new Error('Uso: push <nome|share_code> <file.json> [--yes]')
      await cmdPush(supabase, session, identifier, filePath, { yes })
      return
    }
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/wego-trip-sync.mjs scripts/wego-trip-sync.test.js
git commit -m "Aggiungi comando push con dry-run e conferma esplicita"
```

---

### Task 5: Comando `create` (dry-run + scrittura con `--yes`, retry su collisione share_code)

**Files:**
- Modify: `scripts/wego-trip-sync.mjs`
- Modify: `scripts/wego-trip-sync.test.js`

**Interfaces:**
- Consumes: `generateShareCode`, `validateTripPayload`, `diffTrip`, `formatDiffSummary` (Task 1)
- Produces: `cmdCreate(supabase: object, session: object, filePath: string, options: { yes: boolean }): Promise<{ written: boolean, shareCode?: string }>`

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in coda a `scripts/wego-trip-sync.test.js`:

```js
const { cmdCreate } = await import('./wego-trip-sync.mjs')

describe('cmdCreate', () => {
  it('in dry-run stampa il riepilogo e non scrive', async () => {
    const insert = vi.fn()
    const supabase = { from: vi.fn().mockReturnValue({ insert }) }
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdCreate(supabase, { user: { id: 'user-1' } }, filePath, { yes: false })
    logSpy.mockRestore()

    expect(result).toEqual({ written: false })
    expect(insert).not.toHaveBeenCalled()
  })

  it('con --yes crea la riga tv_trips e la membership owner', async () => {
    const insertTrip = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'trip-1', share_code: 'AB23CD' }, error: null }) }) })
    const insertMember = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { insert: insertTrip }
        if (table === 'tv_trip_members') return { insert: insertMember }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdCreate(supabase, { user: { id: 'user-1' } }, filePath, { yes: true })
    logSpy.mockRestore()

    expect(result).toEqual({ written: true, shareCode: 'AB23CD' })
    expect(insertMember).toHaveBeenCalledWith({ trip_id: 'trip-1', user_id: 'user-1', role: 'editor' })
  })

  it('ritenta su collisione share_code (23505) e crea al secondo tentativo', async () => {
    const single = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } })
      .mockResolvedValueOnce({ data: { id: 'trip-1', share_code: 'ZZ99YY' }, error: null })
    const insertTrip = vi.fn().mockReturnValue({ select: () => ({ single }) })
    const insertMember = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'tv_trips') return { insert: insertTrip }
        if (table === 'tv_trip_members') return { insert: insertMember }
        throw new Error(`tabella inattesa: ${table}`)
      })
    }
    const filePath = writeTempTripFile({ name: 'Ponza', days: [], sections: [] })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await cmdCreate(supabase, { user: { id: 'user-1' } }, filePath, { yes: true })
    logSpy.mockRestore()

    expect(result).toEqual({ written: true, shareCode: 'ZZ99YY' })
    expect(insertTrip).toHaveBeenCalledTimes(2)
  })

  it('rifiuta un file senza nome, prima di interrogare Supabase', async () => {
    const supabase = { from: vi.fn() }
    const filePath = writeTempTripFile({ days: [] })

    await expect(cmdCreate(supabase, { user: { id: 'user-1' } }, filePath, { yes: false })).rejects.toThrow(/name/)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: FAIL — `cmdCreate` non esiste ancora, il ramo `create` non è gestito da `main()`.

- [ ] **Step 3: Implementa `cmdCreate`, aggiungi il ramo `create` a `main()`**

Aggiungi in `scripts/wego-trip-sync.mjs`, dopo `cmdPush`:

```js
export async function cmdCreate(supabase, session, filePath, { yes }) {
  const proposed = JSON.parse(readFileSync(filePath, 'utf8'))
  validateTripPayload(proposed)

  const diff = diffTrip(null, proposed)
  const summary = formatDiffSummary({ tripName: proposed.name, shareCode: null, diff, isCreate: true })

  if (!yes) {
    console.log(summary)
    return { written: false }
  }

  let lastError = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const shareCode = generateShareCode()
    const { data, error } = await supabase
      .from('tv_trips')
      .insert({ owner_id: session.user.id, share_code: shareCode, data: proposed })
      .select('id, share_code')
      .single()

    if (!error) {
      const { error: memberError } = await supabase
        .from('tv_trip_members')
        .insert({ trip_id: data.id, user_id: session.user.id, role: 'editor' })
      if (memberError) throw new Error(memberError.message)
      console.log(`Viaggio "${proposed.name}" creato con share_code ${data.share_code}.`)
      return { written: true, shareCode: data.share_code }
    }
    lastError = error
    if (error.code !== '23505') break
  }
  throw new Error(lastError?.message || 'Impossibile creare il viaggio.')
}
```

Nel corpo di `main()`, dopo il blocco `push`, aggiungi:

```js
    if (command === 'create') {
      const [filePath] = positional
      if (!filePath) throw new Error('Uso: create <file.json> [--yes]')
      await cmdCreate(supabase, session, filePath, { yes })
      return
    }
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-sync.test.js`
Expected: PASS

- [ ] **Step 5: Verifica l'intera suite**

Run: `npm run test`
Expected: PASS (nessuna regressione sui test esistenti dell'app)

- [ ] **Step 6: Commit**

```bash
git add scripts/wego-trip-sync.mjs scripts/wego-trip-sync.test.js
git commit -m "Aggiungi comando create con retry su collisione share_code"
```

---

### Task 6: Skill `.claude/skills/wego-trip/SKILL.md`

**Files:**
- Create: `.claude/skills/wego-trip/SKILL.md`

**Interfaces:**
- Consumes: i quattro comandi CLI di `scripts/wego-trip-sync.mjs` (Task 2–5): `list`, `pull <nome|share_code>`, `push <nome|share_code> <file.json> [--yes]`, `create <file.json> [--yes]`
- Produces: nessuna interfaccia di codice — è documentazione che Claude legge quando la skill viene invocata

- [ ] **Step 1: Scrivi `.claude/skills/wego-trip/SKILL.md`**

```markdown
---
name: wego-trip
description: Pianifica un viaggio WeGo conversando giorno per giorno, poi crealo o modificalo direttamente su Supabase (tv_trips) con lo script scripts/wego-trip-sync.mjs. Usa quando l'utente vuole discutere un nuovo viaggio (sentieri, spostamenti, prenotazioni, pasti) o modificarne uno già sincronizzato, senza passare dal caricamento rapido nel browser.
---

# Pianificazione viaggio WeGo

Questa skill copre due flussi: creare un viaggio nuovo discutendolo giorno per
giorno, o modificare un viaggio già sincronizzato su Supabase. In entrambi i
casi il risultato finale è lo stesso JSON usato dal caricamento rapido
dell'app (`src/views/ImportView.jsx`) — stesso schema, zero divergenza.

## Schema di riferimento

```jsonc
{
  "name": "string", "emoji": "un solo emoji", "place": "string",
  "start": "AAAA-MM-GG", "end": "AAAA-MM-GG",
  "palette": "mountain | sea | city | wild",
  "people": ["string"],
  "days": [
    { "date": "AAAA-MM-GG", "title": "string", "note": "string",
      "items": [ { "time": "HH:MM o vuoto", "title": "string", "detail": "string", "link": "string" } ] }
  ],
  "sections": [
    { "title": "Ristoranti", "icon": "food", "type": "cards", "items": [ { "title": "", "meta": "", "detail": "", "link": "", "tags": [], "lat": null, "lng": null } ] },
    { "title": "Trasporti", "icon": "bus", "type": "transport", "items": [ { "mode": "auto | treno | aereo | bus | traghetto", "from": "", "to": "", "date": "AAAA-MM-GG", "time": "", "ticketLink": "", "note": "" } ] },
    { "title": "Pernottamento", "icon": "bed", "type": "lodging", "items": [ { "name": "", "checkIn": "AAAA-MM-GG", "checkOut": "AAAA-MM-GG", "address": "", "bookingLink": "", "note": "" } ] },
    { "title": "Mappa", "icon": "map", "type": "map", "items": [ { "name": "", "category": "", "mapsLink": "", "lat": null, "lng": null, "note": "" } ] },
    { "title": "string", "icon": "check", "type": "checklist", "items": [ { "text": "", "done": false } ] },
    { "title": "string", "icon": "note", "type": "notes", "text": "" }
  ]
}
```

Voci giorno con `kind` opzionale (aggiunge solo i campi elencati, nessun altro):

- `kind: "sentiero"` → `distanza`, `durata`, `dislivello`, `difficolta` (stringhe), `lat`/`lng` (numero o null)
- `kind: "spiaggia"` → `accesso`, `servizi` (stringhe), `lat`/`lng` (numero o null)
- `kind: "pasto"` → `luogo` (stringa), `prenotato` (booleano), `lat`/`lng` (numero o null)

**Mai inventare o calcolare `lat`/`lng`** da un nome di luogo: solo se l'utente
fornisce un link Maps o coordinate numeriche esplicite, altrimenti `null`. Le
quattro sezioni Trasporti/Pernottamento/Ristoranti/Mappa sono sempre presenti,
anche vuote (`items: []`), sono fisse in ogni viaggio.

## Flusso "viaggio nuovo"

1. Raccogli nome, date, palette (`mountain | sea | city | wild`), persone.
2. Per ogni giorno del viaggio, chiedi in ordine: itinerario/sentieri (con
   `kind: "sentiero"` se pertinente), spostamenti (voce di sezione
   `transport`), pasti/prenotazioni (`kind: "pasto"` sul giorno, o sezione
   `cards` "Ristoranti" per consigli generali non legati a un giorno preciso),
   alloggio (sezione `lodging`).
3. Costruisci via via il JSON completo in un file nello scratchpad di sessione
   (es. `/tmp/.../trip-draft.json`), aggiornandolo dopo ogni giorno discusso.
4. A conversazione conclusa, esegui il dry-run e chiedi conferma (vedi sotto),
   poi crea il viaggio.

## Flusso "modifica viaggio esistente"

1. Esegui `pull <nome>` per leggere lo stato attuale del viaggio.
2. Discuti in chat solo le parti da cambiare (es. "aggiungi il traghetto di
   ritorno al 5 settembre").
3. Applica le modifiche allo stesso JSON scaricato — la colonna `data` è
   sempre il documento intero, non una patch: non omettere le parti
   invariate.
4. Esegui il dry-run e chiedi conferma, poi applica la modifica.

## Comandi (da lanciare via Bash, dalla root del repo)

```bash
node --env-file=.env.local scripts/wego-trip-sync.mjs list
node --env-file=.env.local scripts/wego-trip-sync.mjs pull "<nome o share_code>"
node --env-file=.env.local scripts/wego-trip-sync.mjs push "<nome o share_code>" <file.json>
node --env-file=.env.local scripts/wego-trip-sync.mjs create <file.json>
```

## Conferma obbligatoria prima di scrivere

`push` e `create` **senza** `--yes` non scrivono nulla: stampano solo un
riepilogo delle differenze (o dell'intero contenuto per una creazione).
Procedura sempre uguale:

1. Lancia il comando senza `--yes`.
2. Riporta il riepilogo in chat, in una frase (non incollare l'output grezzo
   del terminale).
3. Aspetta un sì esplicito dell'utente.
4. Rilancia lo stesso comando con `--yes` aggiunto in fondo.

Non saltare mai questo passaggio, anche se la modifica sembra piccola.

## Credenziali

Lo script legge `WEGO_SCRIPT_EMAIL`/`WEGO_SCRIPT_PASSWORD` da `.env.local`
(stesso account usato nell'app). Non chiedere mai email o password
all'utente in chat: se lo script fallisce per credenziali mancanti, il
messaggio d'errore lo dice chiaramente — riporta quel messaggio e chiedi
all'utente di aggiungere le due variabili a `.env.local`.

## Errori comuni

- **"Nessun viaggio «X»..."** → il nome non corrisponde a nessun viaggio
  sincronizzato a cui l'utente ha accesso. Suggerisci `list`.
- **"Più viaggi chiamati «X»..."** → rilancia il comando usando lo
  `share_code` indicato nel messaggio invece del nome.
- **"Sei solo viewer su «X»..."** → l'utente non è owner/editor di quel
  viaggio: non è possibile modificarlo con questa skill.
```

- [ ] **Step 2: Verifica manuale end-to-end (una volta, non automatizzabile)**

Prima di considerare la skill pronta all'uso quotidiano:

1. Aggiungi `WEGO_SCRIPT_EMAIL`/`WEGO_SCRIPT_PASSWORD` al tuo `.env.local` (le
   tue credenziali reali dell'app).
2. Crea un piccolo file di prova, es. `/tmp/trip-test.json` con
   `{ "name": "Test skill", "days": [], "sections": [] }`.
3. Esegui `node --env-file=.env.local scripts/wego-trip-sync.mjs create /tmp/trip-test.json` (senza `--yes`): verifica che stampi il riepilogo e non scriva nulla.
4. Rilancia con `--yes`: verifica che il viaggio compaia nell'app (o via
   `list`).
5. Modifica il file di prova, esegui `push "Test skill" /tmp/trip-test.json`
   (senza poi con `--yes`): verifica che l'aggiornamento arrivi nell'app.
6. Elimina il viaggio di prova dall'app (o dalla dashboard Supabase) a fine
   verifica.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/wego-trip/SKILL.md
git commit -m "Aggiungi skill wego-trip per pianificare e sincronizzare un viaggio via Supabase"
```
