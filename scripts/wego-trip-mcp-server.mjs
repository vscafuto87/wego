import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pathToFileURL } from 'node:url'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { createAuthenticatedClient, cmdList, cmdPull, cmdPush, cmdCreate, cmdItems, cmdAttach } from './wego-trip-sync.mjs'
import { formatItemsList } from './wego-trip-lib.mjs'

function toolError(err) {
  return { isError: true, content: [{ type: 'text', text: err.message }] }
}

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
    },

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
    },

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

  server.registerTool(
    'wego_push',
    {
      description: 'Aggiorna un viaggio WeGo esistente. Chiama SEMPRE prima con yes:false, riporta il riepilogo in chat, aspetta un sì esplicito dell\'utente, poi richiama con yes:true. Mai chiamare con yes:true senza conferma.',
      inputSchema: z.object({
        identifier: z.string().describe('Nome del viaggio o share_code'),
        tripJson: z.record(z.string(), z.any()).describe('Documento completo del viaggio, stesso schema del caricamento rapido'),
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
        tripJson: z.record(z.string(), z.any()).describe('Documento completo del nuovo viaggio, stesso schema del caricamento rapido'),
        yes: z.boolean().default(false)
      })
    },
    tools.wego_create
  )

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

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
