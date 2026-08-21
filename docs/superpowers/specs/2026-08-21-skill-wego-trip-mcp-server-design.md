# Server MCP `wego-trip`: usare il CLI di pianificazione viaggio dall'app desktop Claude.ai

Data: 2026-08-21
Stato: approvato, in attesa di piano di implementazione

## Contesto

La skill `wego-trip` ([2026-08-21-skill-pianificazione-viaggio-design.md](2026-08-21-skill-pianificazione-viaggio-design.md),
più il comando `attach` in [2026-08-21-skill-wego-trip-attach-pdf-design.md](2026-08-21-skill-wego-trip-attach-pdf-design.md))
funziona solo dentro Claude Code: la skill lancia `scripts/wego-trip-sync.mjs`
via Bash. L'app desktop generica di Claude.ai non ha una skill equivalente né
accesso a Bash — ma supporta server MCP locali (registrati in un file di
configurazione sulla macchina dell'utente), che possono esporre strumenti a
qualunque conversazione in quell'app.

Questo lavoro aggiunge un server MCP, `scripts/wego-trip-mcp-server.mjs`, che
espone lo stesso CLI come strumenti MCP — così si può pianificare/modificare un
viaggio anche dall'app desktop, senza duplicare la logica di `wego-trip-sync.mjs`.

Decisioni raccolte in brainstorming:

- **Canale aggiuntivo, non sostitutivo**: la skill Claude Code resta com'è.
  Il server MCP è per quando si lavora dall'app desktop generica.
- **Riuso diretto e senza modifiche** delle funzioni `cmd*` già esistenti in
  `wego-trip-sync.mjs` (`cmdList`/`cmdPull`/`cmdPush`/`cmdCreate`/`cmdItems`/
  `cmdAttach`) e degli helper in `wego-trip-lib.mjs` — nessun refactor di
  quel file, nessuna nuova funzione "senza percorso file" da mantenere in
  parallelo.
- **Ponte via file temporaneo per gli input binari/JSON**: il server MCP è
  comunque un processo locale con accesso al filesystem della macchina
  dell'utente (a differenza dell'app desktop stessa, che non garantisce un
  percorso locale per un allegato di chat). Per `push`/`create` (che si
  aspettano un `filePath` a un JSON) e per `attach` (che si aspetta un
  `filePath` a un PDF), il server scrive lui stesso il contenuto ricevuto dal
  modello in un file temporaneo (`node:fs.mkdtempSync`/`os.tmpdir()`) e passa
  quel percorso alle funzioni `cmd*` esistenti, invariate. `attach` riceve il
  PDF come **contenuto base64**, non un percorso: è il server, non il
  modello, a scriverlo su disco.
- **Stessa proprietà di sicurezza del CLI**: nessuna scrittura senza conferma.
  Gli strumenti di scrittura accettano lo stesso parametro `yes` (booleano)
  delle funzioni `cmd*` esistenti — nessun cambio di significato, solo un
  canale di ingresso diverso. Si aggiunge il livello di approvazione dell'app
  desktop stessa su ogni chiamata di strumento, sopra quello già esistente.
- **Login una tantum per processo**: il server autentica all'avvio e mantiene
  la sessione in memoria per tutta la sua vita, invece di rifare login ad ogni
  chiamata di strumento come fa il CLI (che è invocato una volta per comando).
- **Credenziali solo nella configurazione dell'app desktop** (`env` di
  `claude_desktop_config.json`), mai nel repo.
- **Nuova dipendenza approvata**: `@modelcontextprotocol/sdk`, usata solo da
  questo file — non entra nel bundle Vite dell'app.

## 1. Server MCP `scripts/wego-trip-mcp-server.mjs`

Nuovo file, nessuna modifica a `wego-trip-sync.mjs`/`wego-trip-lib.mjs`. Usa
`@modelcontextprotocol/sdk`'s `McpServer` + `StdioServerTransport` (trasporto
stdio, lo standard per i server MCP locali registrati in
`claude_desktop_config.json`).

### 1.1 Avvio e autenticazione

```js
import { createAuthenticatedClient, cmdList, cmdPull, cmdPush, cmdCreate, cmdItems, cmdAttach } from './wego-trip-sync.mjs'

const { supabase, session } = await createAuthenticatedClient()
```

Login una volta all'avvio del processo; `supabase`/`session` restano in
memoria, condivisi da tutte le chiamate di strumento successive. Se il login
fallisce, il processo esce con l'errore già prodotto da
`createAuthenticatedClient`/`requireEnv` (stesso messaggio del CLI).

### 1.2 Strumenti esposti

Sei strumenti, uno per comando. `wego_push`/`wego_create`/`wego_attach`
scrivono un file temporaneo prima di delegare alla funzione `cmd*` invariata:

| Strumento MCP | Parametri | Delega a |
|---|---|---|
| `wego_list` | nessuno | `cmdList(supabase, session)` |
| `wego_pull` | `identifier` (nome o share_code) | `cmdPull(supabase, session, identifier)` |
| `wego_push` | `identifier`, `tripJson` (oggetto), `yes` (booleano, default `false`) | scrive `tripJson` in un file temporaneo `.json`, poi `cmdPush(supabase, session, identifier, tempPath, { yes })` |
| `wego_create` | `tripJson`, `yes` | scrive `tripJson` in un file temporaneo `.json`, poi `cmdCreate(supabase, session, tempPath, { yes })` |
| `wego_items` | `identifier`, `sectionType` (`transport`\|`lodging`) | `cmdItems(supabase, session, identifier, sectionType)` |
| `wego_attach` | `identifier`, `sectionType`, `index`, `pdfBase64` (stringa), `yes` | decodifica `pdfBase64` in un `Buffer`, lo scrive in un file temporaneo `.pdf`, poi `cmdAttach(supabase, session, identifier, sectionType, index, tempPath, { yes })` |

I file temporanei si creano in una cartella dedicata sotto `os.tmpdir()`
(`mkdtempSync(join(tmpdir(), 'wego-mcp-'))`, una per chiamata) e si eliminano
dopo la chiamata (successo o errore), con `try/finally`, per non lasciare PDF
o JSON di viaggio residui sul disco dell'utente.

Ogni strumento di scrittura (`wego_push`, `wego_create`, `wego_attach`) ha
nella propria descrizione MCP (il testo che il modello legge per capire come
usarlo) le stesse istruzioni di conferma della skill: chiamare prima con
`yes: false`, riportare il riepilogo in chat, aspettare un sì esplicito
dell'utente, solo poi richiamare con `yes: true`. La descrizione è la sola
leva di enforcement lato server (il modello potrebbe in teoria chiamare con
`yes: true` subito) — sopra c'è comunque il dialogo di approvazione che l'app
desktop mostra per ogni chiamata di strumento, indipendente da questo server.

### 1.3 Formato delle risposte

Ogni strumento torna testo (lo stesso contenuto che le funzioni `cmd*`
stampano già su stdout per il CLI, catturato invece di essere lasciato a
`console.log`): il riepilogo dry-run, la lista numerata di `items`, la
conferma di scrittura, o il JSON del viaggio per `pull`. Le funzioni `cmd*`
esistenti chiamano `console.log` direttamente — il server intercetta quell'
output per la durata della chiamata (sostituendo temporaneamente
`console.log` con una funzione che accumula le righe, poi ripristinandolo)
invece di modificare le funzioni per farle *tornare* il testo: evita di
toccare `wego-trip-sync.mjs`, coerente con la decisione di riuso senza
modifiche. Gli errori (`findTrip` non trova il viaggio, ruolo viewer, ecc.)
si propagano come errore di strumento MCP con lo stesso messaggio già
prodotto dalle funzioni `cmd*` — nessun nuovo testo di errore da scrivere.

## 2. Configurazione lato utente (fuori dal repo)

`.claude/skills/wego-trip/SKILL.md` guadagna una sezione con le istruzioni
per registrare il server in `claude_desktop_config.json`:

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

Passaggio manuale, una tantum, fatto dall'utente sulla propria macchina —
niente da automatizzare nel repo. Richiede il riavvio completo dell'app
desktop per essere caricato.

## 3. Normalizzazione minima

Nessuna nuova validazione strutturale oltre a quella già presente in
`validateTripPayload`/`ATTACHMENT_SECTION_TYPES`/`isPdfPath` (invocate dalle
funzioni `cmd*` riusate, non duplicate qui). Il server valida solo la forma
dei parametri MCP in ingresso prima di scrivere il file temporaneo: `tripJson`
deve essere un oggetto (non una stringa da fare il parse), `pdfBase64` deve
essere decodificabile, `index` un intero.

## 4. Errori ed edge case

| Caso | Comportamento |
|---|---|
| Login fallisce all'avvio del processo | Il processo esce con l'errore di `createAuthenticatedClient`, l'app desktop segnala il server come non disponibile |
| `pdfBase64` non decodificabile | Errore chiaro prima di scrivere il file temporaneo/chiamare `cmdAttach` |
| `tripJson` non è un oggetto | Errore chiaro prima di scrivere il file temporaneo/chiamare `cmdPush`/`cmdCreate` |
| La funzione `cmd*` sottostante lancia (viewer, indice fuori range, sezione non valida, upload fallito, ecc.) | Stesso messaggio già prodotto da quella funzione, propagato come errore di strumento MCP |
| Qualunque esito (successo o errore) | Il file temporaneo creato per la chiamata viene sempre eliminato (`try/finally`) |

## 5. Testing

- Test Vitest per i tool handler del server MCP: verificano che ogni
  strumento scriva il file temporaneo con il contenuto corretto (quando
  applicabile), chiami la funzione `cmd*` corretta con i parametri giusti
  (client Supabase finto, stesso stile del resto del progetto), catturi
  l'output di `console.log` nella risposta testuale, ed elimini sempre il
  file temporaneo — anche quando la funzione `cmd*` sottostante lancia.
- Nessun test contro l'app desktop reale, un progetto Supabase reale, o il
  protocollo MCP stesso (quello è responsabilità dell'SDK) — verifica manuale
  end-to-end (registrare il server, aprire l'app desktop, pianificare un
  viaggio di prova) prima dell'uso quotidiano.

## Fuori scope

- Pubblicare il server MCP come pacchetto separato/riusabile da altri: resta
  uno script interno a questo repo, per l'uso personale descritto in CLAUDE.md.
- Un meccanismo di refresh automatico della sessione se il processo resta
  attivo più a lungo della validità del token Supabase: se capita, si vedrà
  un errore di autenticazione sulla chiamata successiva e basterà riavviare
  il server — non è la piattaforma giusta per investire in retry automatici
  ora (uso personale, riavvio manuale accettabile).
- Qualunque refactor di `wego-trip-sync.mjs`/`wego-trip-lib.mjs`: il ponte via
  file temporaneo è scelto apposta per non doverne toccare l'interno.
