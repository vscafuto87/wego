# Server MCP wego-trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un server MCP (`scripts/wego-trip-mcp-server.mjs`) che espone i comandi del CLI `wego-trip-sync.mjs` come strumenti MCP, per pianificare/modificare un viaggio WeGo dall'app desktop Claude.ai (dove non c'è accesso a Bash/skill).

**Architecture:** Il server importa e riusa senza modifiche `createAuthenticatedClient`/`cmdList`/`cmdPull`/`cmdPush`/`cmdCreate`/`cmdItems`/`cmdAttach` da `scripts/wego-trip-sync.mjs`. La logica dei singoli strumenti vive in `createTools(supabase, session)`, una funzione pura testabile senza avviare un vero server MCP; `main()` fa il login una tantum, costruisce gli strumenti e li registra su un `McpServer` connesso via stdio. Gli input binari/JSON (`push`/`create`/`attach`) passano per un file temporaneo scritto dal server stesso, così le funzioni `cmd*` esistenti (che si aspettano un `filePath`) restano invariate; il file temporaneo si elimina sempre, con successo o errore.

**Tech Stack:** `@modelcontextprotocol/sdk` (server MCP + trasporto stdio), `zod` (schema di validazione degli input degli strumenti, richiesto dall'SDK), Node 24 built-in (`node:fs`, `node:os`, `node:path`), Vitest.

**Spec:** [docs/superpowers/specs/2026-08-21-skill-wego-trip-mcp-server-design.md](../specs/2026-08-21-skill-wego-trip-mcp-server-design.md)

## Global Constraints

- Nuove dipendenze approvate per questo lavoro: `@modelcontextprotocol/sdk` (esplicitamente approvata dall'utente) e `zod` (richiesta dall'SDK per gli schemi input) — nessun'altra. Nessuna delle due entra nel bundle Vite dell'app (solo `scripts/`).
- Nessuna modifica a `scripts/wego-trip-sync.mjs`/`scripts/wego-trip-lib.mjs`: le funzioni `cmd*`/helper si importano e si usano così com'è.
- Stessa proprietà di sicurezza del CLI: nessuna scrittura senza `yes: true` esplicito passato dal modello, che a sua volta deve mostrare il riepilogo e aspettare un sì dell'utente prima di richiamare con `yes: true` (istruzione nella descrizione di ogni strumento di scrittura, non enforcement lato codice — stessa natura della regola già nella skill).
- Login una tantum all'avvio del processo (`createAuthenticatedClient()` chiamato una sola volta in `main()`), non ad ogni chiamata di strumento.
- Credenziali mai nel repo: si passano via il campo `env` di `claude_desktop_config.json` sulla macchina dell'utente.
- Ogni file temporaneo creato per una chiamata di strumento si elimina sempre (successo o errore), in una cartella dedicata sotto `os.tmpdir()`.
- Commit piccoli, messaggio in italiano all'imperativo.

## Nota importante per chi implementa

Questo piano usa un'API esterna (`@modelcontextprotocol/sdk`) verificata contro
la documentazione ufficiale e il registro npm al momento della scrittura
(versione `1.29.0`, `engines.node >= 18`), ma non installata e provata
direttamente in questo repo. **Nel Task 1**, dopo `npm install`, verifica i
percorsi di import esatti e la forma di `registerTool`/`McpServer`/
`StdioServerTransport` leggendo `node_modules/@modelcontextprotocol/sdk/package.json`
(campo `exports`) e, se presente, il suo `README.md`/le sue dichiarazioni di
tipo (`.d.ts`). Se qualcosa nel codice sotto non corrisponde esattamente a
quello che trovi installato (percorso di import diverso, forma di
`inputSchema` diversa, ecc.), adattalo di conseguenza e annota la differenza
nel tuo report — il comportamento descritto (nome dello strumento, parametri,
delega alla funzione `cmd*` giusta, gestione errori/file temporanei) è quello
che conta, non la sintassi esatta di collegamento all'SDK se questa fosse
cambiata.

---

### Task 1: Setup pacchetto, autenticazione all'avvio, strumenti `wego_list`/`wego_pull`

**Files:**
- Create: `scripts/wego-trip-mcp-server.mjs`
- Test: `scripts/wego-trip-mcp-server.test.js`
- Modify: `package.json` (nuove dipendenze)

**Interfaces:**
- Consumes: `createAuthenticatedClient`, `cmdList`, `cmdPull` da `./wego-trip-sync.mjs` (già esistenti, invariati)
- Produces (usate dai task successivi):
  - `createTools(supabase, session): { wego_list, wego_pull, wego_push, wego_create, wego_items, wego_attach }` — ogni proprietà è una funzione async `(args) => Promise<{ content: [{ type: 'text', text: string }], isError?: true }>`. Questo task implementa solo `wego_list`/`wego_pull`; i task successivi aggiungono le altre chiavi allo stesso oggetto ritornato da `createTools`.
  - `main(): Promise<void>` — login, costruzione strumenti, registrazione su `McpServer`, connessione stdio.

- [ ] **Step 1: Installa le dipendenze e verifica l'API installata**

```bash
npm install @modelcontextprotocol/sdk zod
```

Poi leggi `node_modules/@modelcontextprotocol/sdk/package.json` (campo
`exports`) per confermare i percorsi `@modelcontextprotocol/sdk/server/mcp.js`
(classe `McpServer`) e `@modelcontextprotocol/sdk/server/stdio.js` (classe
`StdioServerTransport`) usati sotto — se il pacchetto installato li espone con
nomi/percorsi diversi, annotalo e adatta gli import del Task negli step
successivi di conseguenza.

- [ ] **Step 2: Scrivi i test che falliscono**

Crea `scripts/wego-trip-mcp-server.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCmdList, mockCmdPull } = vi.hoisted(() => ({
  mockCmdList: vi.fn(),
  mockCmdPull: vi.fn()
}))

vi.mock('./wego-trip-sync.mjs', () => ({
  createAuthenticatedClient: vi.fn(),
  cmdList: mockCmdList,
  cmdPull: mockCmdPull,
  cmdPush: vi.fn(),
  cmdCreate: vi.fn(),
  cmdItems: vi.fn(),
  cmdAttach: vi.fn()
}))

const { createTools } = await import('./wego-trip-mcp-server.mjs')

beforeEach(() => {
  mockCmdList.mockReset()
  mockCmdPull.mockReset()
})

describe('wego_list', () => {
  it('elenca i viaggi con nome, share_code, ruolo, data', async () => {
    mockCmdList.mockResolvedValue([
      { name: 'Ponza', shareCode: 'AB23CD', role: 'editor', updatedAt: '2026-08-21T10:00:00Z' }
    ])
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_list({})
    expect(mockCmdList).toHaveBeenCalledWith('fake-supabase', 'fake-session')
    expect(result).toEqual({ content: [{ type: 'text', text: 'Ponza — AB23CD — editor — 2026-08-21T10:00:00Z' }] })
  })

  it('segnala nessun viaggio', async () => {
    mockCmdList.mockResolvedValue([])
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_list({})
    expect(result).toEqual({ content: [{ type: 'text', text: 'Nessun viaggio.' }] })
  })

  it('torna un errore di strumento se cmdList lancia', async () => {
    mockCmdList.mockRejectedValue(new Error('boom'))
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_list({})
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'boom' }] })
  })
})

describe('wego_pull', () => {
  it('torna il JSON completo del viaggio', async () => {
    mockCmdPull.mockResolvedValue({ name: 'Ponza', days: [] })
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_pull({ identifier: 'Ponza' })
    expect(mockCmdPull).toHaveBeenCalledWith('fake-supabase', 'fake-session', 'Ponza')
    expect(result.content[0].type).toBe('text')
    expect(JSON.parse(result.content[0].text)).toEqual({ name: 'Ponza', days: [] })
  })

  it('torna un errore di strumento se cmdPull lancia', async () => {
    mockCmdPull.mockRejectedValue(new Error('Nessun viaggio "X"...'))
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_pull({ identifier: 'X' })
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'Nessun viaggio "X"...' }] })
  })
})
```

- [ ] **Step 3: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-mcp-server.test.js`
Expected: FAIL — `scripts/wego-trip-mcp-server.mjs` non esiste ancora.

- [ ] **Step 4: Implementa `scripts/wego-trip-mcp-server.mjs`**

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { createAuthenticatedClient, cmdList, cmdPull, cmdPush, cmdCreate, cmdItems, cmdAttach } from './wego-trip-sync.mjs'

function toolError(err) {
  return { isError: true, content: [{ type: 'text', text: err.message }] }
}

export function createTools(supabase, session) {
  return {
    async wego_list() {
      try {
        const trips = await cmdList(supabase, session)
        if (!trips.length) return { content: [{ type: 'text', text: 'Nessun viaggio.' }] }
        const text = trips.map((t) => `${t.name} — ${t.shareCode} — ${t.role} — ${t.updatedAt}`).join('\n')
        return { content: [{ type: 'text', text }] }
      } catch (err) {
        return toolError(err)
      }
    },

    async wego_pull({ identifier }) {
      try {
        const data = await cmdPull(supabase, session, identifier)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      } catch (err) {
        return toolError(err)
      }
    }
  }
}

export async function main() {
  const { supabase, session } = await createAuthenticatedClient()
  const tools = createTools(supabase, session)

  const server = new McpServer({ name: 'wego-trip', version: '1.0.0' })

  server.registerTool(
    'wego_list',
    {
      description: 'Elenca i viaggi WeGo di cui sei owner/editor/viewer: nome, share_code, ruolo, data ultima modifica.',
      inputSchema: z.object({})
    },
    tools.wego_list
  )

  server.registerTool(
    'wego_pull',
    {
      description: 'Legge il JSON completo di un viaggio WeGo (per nome o share_code), come stato di partenza prima di discutere modifiche.',
      inputSchema: z.object({ identifier: z.string().describe('Nome del viaggio o share_code a 6 caratteri') })
    },
    tools.wego_pull
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
```

Se lo Step 1 ha rivelato percorsi di import o forma di `registerTool`
diversi, adatta questo codice di conseguenza prima di procedere.

- [ ] **Step 5: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-mcp-server.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/wego-trip-mcp-server.mjs scripts/wego-trip-mcp-server.test.js
git commit -m "Aggiungi scheletro server MCP wego-trip con strumenti list/pull"
```

---

### Task 2: Helper file temporaneo/cattura log, strumenti `wego_push`/`wego_create`

**Files:**
- Modify: `scripts/wego-trip-mcp-server.mjs`
- Modify: `scripts/wego-trip-mcp-server.test.js`

**Interfaces:**
- Consumes: `cmdPush`, `cmdCreate` da `./wego-trip-sync.mjs` (già esistenti, invariati)
- Produces (usate anche dal Task 3): `withTempFile(fileName, content, fn): Promise<any>`, `captureLog(fn): Promise<{ result: any, text: string }>` — helper privati, non esportati, ma il loro comportamento (elimina sempre il file temporaneo, cattura sempre l'output di `console.log`) è quello che i task successivi devono riusare identico per `attach`.

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in cima a `scripts/wego-trip-mcp-server.test.js` (dopo gli import esistenti):

```js
import { existsSync, readFileSync } from 'node:fs'
```

Aggiorna il mock di `./wego-trip-sync.mjs` per includere anche `mockCmdPush`/`mockCmdCreate` (estendi l'oggetto `vi.hoisted` esistente e il corpo del `vi.mock` con le nuove chiavi, e aggiungi il loro `.mockReset()` in `beforeEach`) invece di lasciare `vi.fn()` inline per quelle due voci.

Aggiungi in coda al file:

```js
describe('wego_push', () => {
  it('scrive un file temporaneo con tripJson e chiama cmdPush con quel percorso; il file si elimina dopo', async () => {
    let capturedPath
    mockCmdPush.mockImplementation(async (supabase, session, identifier, filePath, { yes }) => {
      capturedPath = filePath
      expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ name: 'Ponza' })
      console.log('Riepilogo finto')
      return { written: false }
    })
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_push({ identifier: 'Ponza', tripJson: { name: 'Ponza' }, yes: false })
    expect(mockCmdPush).toHaveBeenCalledWith('fake-supabase', 'fake-session', 'Ponza', capturedPath, { yes: false })
    expect(result).toEqual({ content: [{ type: 'text', text: 'Riepilogo finto' }] })
    expect(existsSync(capturedPath)).toBe(false)
  })

  it('elimina il file temporaneo anche se cmdPush lancia, e torna un errore di strumento', async () => {
    let capturedPath
    mockCmdPush.mockImplementation(async (supabase, session, identifier, filePath) => {
      capturedPath = filePath
      throw new Error('Sei solo viewer su "Ponza", non puoi modificarlo.')
    })
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_push({ identifier: 'Ponza', tripJson: { name: 'Ponza' }, yes: true })
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'Sei solo viewer su "Ponza", non puoi modificarlo.' }] })
    expect(existsSync(capturedPath)).toBe(false)
  })
})

describe('wego_create', () => {
  it('scrive un file temporaneo con tripJson e chiama cmdCreate con quel percorso; il file si elimina dopo', async () => {
    let capturedPath
    mockCmdCreate.mockImplementation(async (supabase, session, filePath, { yes }) => {
      capturedPath = filePath
      expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ name: 'Ponza nuova' })
      console.log('Nuovo viaggio: Ponza nuova\n\nNessuna scrittura eseguita (dry-run).')
      return { written: false }
    })
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_create({ tripJson: { name: 'Ponza nuova' }, yes: false })
    expect(mockCmdCreate).toHaveBeenCalledWith('fake-supabase', 'fake-session', capturedPath, { yes: false })
    expect(result.content[0].text).toContain('Nuovo viaggio: Ponza nuova')
    expect(existsSync(capturedPath)).toBe(false)
  })
})
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-mcp-server.test.js`
Expected: FAIL — `wego_push`/`wego_create` non esistono ancora su `createTools`.

- [ ] **Step 3: Implementa gli helper e i due strumenti**

Aggiungi gli import necessari in cima a `scripts/wego-trip-mcp-server.mjs`:

```js
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
```

Aggiungi dopo `toolError`:

```js
async function withTempFile(fileName, content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'wego-mcp-'))
  const filePath = join(dir, fileName)
  writeFileSync(filePath, content)
  try {
    return await fn(filePath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function captureLog(fn) {
  const lines = []
  const original = console.log
  console.log = (...args) => { lines.push(args.map(String).join(' ')) }
  try {
    const result = await fn()
    return { result, text: lines.join('\n') }
  } finally {
    console.log = original
  }
}
```

Nell'oggetto ritornato da `createTools`, aggiungi (dopo `wego_pull`):

```js
    async wego_push({ identifier, tripJson, yes }) {
      try {
        const text = await withTempFile('trip.json', JSON.stringify(tripJson), async (filePath) => {
          const { text } = await captureLog(() => cmdPush(supabase, session, identifier, filePath, { yes }))
          return text
        })
        return { content: [{ type: 'text', text }] }
      } catch (err) {
        return toolError(err)
      }
    },

    async wego_create({ tripJson, yes }) {
      try {
        const text = await withTempFile('trip.json', JSON.stringify(tripJson), async (filePath) => {
          const { text } = await captureLog(() => cmdCreate(supabase, session, filePath, { yes }))
          return text
        })
        return { content: [{ type: 'text', text }] }
      } catch (err) {
        return toolError(err)
      }
    }
```

Nel corpo di `main()`, dopo la registrazione di `wego_pull`, aggiungi:

```js
  server.registerTool(
    'wego_push',
    {
      description: 'Aggiorna un viaggio WeGo esistente. Chiama SEMPRE prima con yes:false, riporta il riepilogo in chat, aspetta un sì esplicito dell\'utente, poi richiama con yes:true. Mai chiamare con yes:true senza conferma.',
      inputSchema: z.object({
        identifier: z.string().describe('Nome del viaggio o share_code'),
        tripJson: z.record(z.any()).describe('Documento completo del viaggio, stesso schema del caricamento rapido'),
        yes: z.boolean().default(false)
      })
    },
    tools.wego_push
  )

  server.registerTool(
    'wego_create',
    {
      description: 'Crea un nuovo viaggio WeGo. Chiama SEMPRE prima con yes:false, riporta il riepilogo in chat, aspetta un sì esplicito dell\'utente, poi richiama con yes:true. Mai chiamare con yes:true senza conferma.',
      inputSchema: z.object({
        tripJson: z.record(z.any()).describe('Documento completo del nuovo viaggio, stesso schema del caricamento rapido'),
        yes: z.boolean().default(false)
      })
    },
    tools.wego_create
  )
```

Se `z.record(z.any())` non è supportato dalla versione di zod installata (verificato allo Step 1 del Task 1), usa `z.any()` al suo posto per `tripJson` — la validazione di forma reale resta comunque dentro `validateTripPayload`, già chiamata da `cmdPush`/`cmdCreate`.

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-mcp-server.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/wego-trip-mcp-server.mjs scripts/wego-trip-mcp-server.test.js
git commit -m "Aggiungi strumenti push/create al server MCP con ponte via file temporaneo"
```

---

### Task 3: Strumenti `wego_items`/`wego_attach`

**Files:**
- Modify: `scripts/wego-trip-mcp-server.mjs`
- Modify: `scripts/wego-trip-mcp-server.test.js`

**Interfaces:**
- Consumes: `cmdItems`, `cmdAttach` da `./wego-trip-sync.mjs`; `formatItemsList` da `./wego-trip-lib.mjs` (entrambi già esistenti, invariati); `withTempFile`/`captureLog` dal Task 2
- Produces: nessuna nuova interfaccia per task successivi — questo completa i sei strumenti di `createTools`

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in cima a `scripts/wego-trip-mcp-server.test.js`, estendi ancora l'oggetto mockato di `./wego-trip-sync.mjs` con `mockCmdItems`/`mockCmdAttach` (stesso pattern del Task 2). Non serve mockare `./wego-trip-lib.mjs`: il file sotto test lo importa per `formatItemsList`, e usare l'implementazione reale (non mockata) è corretto qui — il test verifica così il formato di output autentico, non uno finto.

Aggiungi in coda al file:

```js
describe('wego_items', () => {
  it('elenca le voci della sezione con lo stato allegato, riusando formatItemsList', async () => {
    mockCmdItems.mockResolvedValue({
      sectionTitle: 'Trasporti',
      items: [{ mode: 'traghetto', from: 'Formia', to: 'Ponza', date: '2026-08-30', ticketFileName: '' }]
    })
    const tools = createTools('fake-supabase', 'fake-session')
    const result = await tools.wego_items({ identifier: 'Ponza', sectionType: 'transport' })
    expect(mockCmdItems).toHaveBeenCalledWith('fake-supabase', 'fake-session', 'Ponza', 'transport')
    expect(result.content[0].text).toBe('1. traghetto Formia → Ponza, 2026-08-30 (nessun allegato)')
  })
})

describe('wego_attach', () => {
  it('decodifica pdfBase64 in un file temporaneo .pdf e chiama cmdAttach con quel percorso; il file si elimina dopo', async () => {
    let capturedPath
    mockCmdAttach.mockImplementation(async (supabase, session, identifier, sectionType, index, filePath, { yes }) => {
      capturedPath = filePath
      expect(filePath.endsWith('.pdf')).toBe(true)
      expect(readFileSync(filePath).toString('utf8')).toBe('contenuto pdf finto')
      console.log('Allegato "biglietto.pdf" collegato a traghetto Formia → Ponza.')
      return { written: true }
    })
    const tools = createTools('fake-supabase', 'fake-session')
    const pdfBase64 = Buffer.from('contenuto pdf finto', 'utf8').toString('base64')
    const result = await tools.wego_attach({ identifier: 'Ponza', sectionType: 'transport', index: 1, pdfBase64, yes: true })
    expect(mockCmdAttach).toHaveBeenCalledWith('fake-supabase', 'fake-session', 'Ponza', 'transport', 1, capturedPath, { yes: true })
    expect(result.content[0].text).toContain('collegato a traghetto')
    expect(existsSync(capturedPath)).toBe(false)
  })

  it('elimina il file temporaneo anche se cmdAttach lancia', async () => {
    let capturedPath
    mockCmdAttach.mockImplementation(async (supabase, session, identifier, sectionType, index, filePath) => {
      capturedPath = filePath
      throw new Error('Indice non valido: Trasporti ha 1 voci. Usa "items" per vedere l\'elenco aggiornato.')
    })
    const tools = createTools('fake-supabase', 'fake-session')
    const pdfBase64 = Buffer.from('x', 'utf8').toString('base64')
    const result = await tools.wego_attach({ identifier: 'Ponza', sectionType: 'transport', index: 5, pdfBase64, yes: true })
    expect(result.isError).toBe(true)
    expect(existsSync(capturedPath)).toBe(false)
  })
})
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run scripts/wego-trip-mcp-server.test.js`
Expected: FAIL — `wego_items`/`wego_attach` non esistono ancora su `createTools`.

- [ ] **Step 3: Implementa i due strumenti**

Aggiungi l'import di `formatItemsList` in cima a `scripts/wego-trip-mcp-server.mjs` (nella riga che già importa `cmdList`/`cmdPull`/ecc. — questi vengono da `./wego-trip-sync.mjs`, `formatItemsList` va importato separatamente da `./wego-trip-lib.mjs`):

```js
import { formatItemsList } from './wego-trip-lib.mjs'
```

Nell'oggetto ritornato da `createTools`, aggiungi (dopo `wego_create`):

```js
    async wego_items({ identifier, sectionType }) {
      try {
        const { sectionTitle, items } = await cmdItems(supabase, session, identifier, sectionType)
        return { content: [{ type: 'text', text: formatItemsList(sectionType, sectionTitle, items) }] }
      } catch (err) {
        return toolError(err)
      }
    },

    async wego_attach({ identifier, sectionType, index, pdfBase64, yes }) {
      try {
        const buffer = Buffer.from(pdfBase64, 'base64')
        const text = await withTempFile('attachment.pdf', buffer, async (filePath) => {
          const { text } = await captureLog(() => cmdAttach(supabase, session, identifier, sectionType, index, filePath, { yes }))
          return text
        })
        return { content: [{ type: 'text', text }] }
      } catch (err) {
        return toolError(err)
      }
    }
```

Nel corpo di `main()`, dopo la registrazione di `wego_create`, aggiungi:

```js
  server.registerTool(
    'wego_items',
    {
      description: 'Elenca le voci (trasporti o alloggi) di un viaggio WeGo con indice numerico e stato allegato, prima di usare wego_attach.',
      inputSchema: z.object({
        identifier: z.string().describe('Nome del viaggio o share_code'),
        sectionType: z.enum(['transport', 'lodging'])
      })
    },
    tools.wego_items
  )

  server.registerTool(
    'wego_attach',
    {
      description: 'Allega un PDF (biglietto o prenotazione) a una voce trasporti/alloggi, individuata per indice (vedi wego_items). Chiama SEMPRE prima con yes:false, riporta il riepilogo in chat, aspetta un sì esplicito dell\'utente, poi richiama con yes:true.',
      inputSchema: z.object({
        identifier: z.string().describe('Nome del viaggio o share_code'),
        sectionType: z.enum(['transport', 'lodging']),
        index: z.number().int().min(1).describe('Indice 1-based, come mostrato da wego_items'),
        pdfBase64: z.string().describe('Contenuto del PDF codificato in base64'),
        yes: z.boolean().default(false)
      })
    },
    tools.wego_attach
  )
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run scripts/wego-trip-mcp-server.test.js`
Expected: PASS

- [ ] **Step 5: Verifica l'intera suite**

Run: `npm run test`
Expected: PASS (nessuna regressione)

- [ ] **Step 6: Commit**

```bash
git add scripts/wego-trip-mcp-server.mjs scripts/wego-trip-mcp-server.test.js
git commit -m "Aggiungi strumenti items/attach al server MCP"
```

---

### Task 4: Documenta la registrazione del server nella skill e verifica manuale

**Files:**
- Modify: `.claude/skills/wego-trip/SKILL.md`

**Interfaces:**
- Consumes: i sei strumenti MCP (`wego_list`, `wego_pull`, `wego_push`, `wego_create`, `wego_items`, `wego_attach`) del server completato nei Task 1-3
- Produces: nessuna interfaccia di codice — documentazione

- [ ] **Step 1: Aggiungi una sezione sul server MCP a `SKILL.md`**

Inserisci, dopo la sezione esistente "## Allegare un PDF a un trasporto o un alloggio" e prima di "## Conferma obbligatoria prima di scrivere", una nuova sezione:

```markdown
## Usare questi comandi dall'app desktop Claude.ai (server MCP)

Fuori da Claude Code (es. dall'app desktop generica di Claude.ai), questi
stessi comandi sono disponibili come strumenti MCP (`wego_list`, `wego_pull`,
`wego_push`, `wego_create`, `wego_items`, `wego_attach`) tramite
`scripts/wego-trip-mcp-server.mjs`, registrato una tantum
nel file di configurazione dell'app desktop:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "wego-trip": {
      "command": "node",
      "args": ["/percorso/assoluto/al/repo/scripts/wego-trip-mcp-server.mjs"],
      "env": {
        "VITE_SUPABASE_URL": "...",
        "VITE_SUPABASE_ANON_KEY": "...",
        "WEGO_SCRIPT_EMAIL": "...",
        "WEGO_SCRIPT_PASSWORD": "..."
      }
    }
  }
}
```

Sostituisci il percorso con quello assoluto del repo sulla tua macchina, e le
quattro variabili con i valori reali (stessi di `.env.local`). Richiede il
riavvio completo dell'app desktop. Gli strumenti di scrittura (`wego_push`,
`wego_create`, `wego_attach`) seguono la stessa procedura di conferma di
`push`/`create`/`attach` da Claude Code: prima con `yes: false`, riepilogo in
chat, sì esplicito, poi `yes: true` — con in più il dialogo di approvazione
che l'app desktop stessa mostra per ogni chiamata di strumento.
```

- [ ] **Step 2: Verifica manuale end-to-end (una volta, non automatizzabile)**

Nessun test automatico avvia un vero processo MCP o tocca un progetto
Supabase reale. Prima di considerare il server pronto all'uso quotidiano:

1. Registra il server in `claude_desktop_config.json` come sopra, con le tue
   credenziali reali, e riavvia l'app desktop.
2. Verifica che il server compaia connesso nella lista dei connettori/MCP
   dell'app (nessun errore di avvio — se c'è, controlla i log dell'app
   desktop per il messaggio di `createAuthenticatedClient`).
3. In una conversazione, chiedi di elencare i tuoi viaggi (`wego_list`) e di
   leggerne uno (`wego_pull`): verifica che i dati corrispondano all'app.
4. Prova un `wego_push`/`wego_create` di prova su un viaggio non importante:
   verifica il dry-run (nessuna scrittura), poi la conferma con `yes: true`.
5. Allega un PDF di prova con `wego_items`/`wego_attach`: verifica che compaia
   nell'app WeGo.
6. Rimuovi il viaggio/allegato di prova a fine verifica.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/wego-trip/SKILL.md
git commit -m "Documenta la registrazione del server MCP wego-trip nella skill"
```
