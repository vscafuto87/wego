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
