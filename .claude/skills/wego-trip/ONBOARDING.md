# Configurare il server MCP wego-trip sull'app desktop Claude.ai

Questa guida serve una volta sola, sulla tua macchina, per usare i comandi
della skill `wego-trip` (pianificazione viaggi) dall'app desktop di Claude.ai
invece che da Claude Code. È utile quando non hai accesso a Bash/skill — per
esempio dal telefono o da un computer senza questo repo clonato per intero
in modalità sviluppo.

Se lavori già da Claude Code in questo repo, non ti serve: usa direttamente
i comandi Bash descritti in `SKILL.md`.

## Cosa ti serve prima di iniziare

- Il repo `wego` clonato sulla stessa macchina dove hai l'app desktop
  Claude.ai (macOS o Windows), con `npm install` già eseguito.
- Le stesse credenziali che usi per accedere all'app WeGo: email e password
  del tuo account Supabase. Se non le hai a portata di mano, sono quelle con
  cui fai login su `wego`.
- L'URL e la chiave anonima del progetto Supabase (`VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY`): li trovi già nel file `.env.local` del repo, se
  lo hai configurato in passato per `npm run dev`. Se `.env.local` non
  esiste o non li contiene, chiedi questi due valori a chi ha configurato il
  progetto — non vanno inventati né presi da un altro progetto Supabase.

## Passo 1 — Trova il percorso assoluto del repo

Apri un terminale nella cartella del repo e lancia:

```bash
pwd
```

Copia il percorso stampato (es. `/Users/tuonome/Progetti/wego`): ti servirà
al passo 3.

## Passo 2 — Apri il file di configurazione dell'app desktop

L'app desktop Claude.ai legge un file JSON di configurazione, in un percorso
fisso a seconda del sistema operativo. **Chiudi prima l'app desktop**, poi
apri il file con un editor di testo (crealo se non esiste ancora):

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Se il file esiste già e contiene altri server MCP, non cancellarlo: dovrai
aggiungere una voce dentro l'oggetto `mcpServers` che già esiste, senza
toccare le altre.

## Passo 3 — Aggiungi la voce `wego-trip`

Se il file è vuoto o non esiste, il suo contenuto completo deve essere:

```json
{
  "mcpServers": {
    "wego-trip": {
      "command": "node",
      "args": ["/percorso/assoluto/al/repo/scripts/wego-trip-mcp-server.mjs"],
      "env": {
        "VITE_SUPABASE_URL": "https://xxxxxxxx.supabase.co",
        "VITE_SUPABASE_ANON_KEY": "la-tua-chiave-anonima",
        "WEGO_SCRIPT_EMAIL": "tua-email@esempio.it",
        "WEGO_SCRIPT_PASSWORD": "la-tua-password"
      }
    }
  }
}
```

Se invece `mcpServers` esiste già con altri server, aggiungi solo la chiave
`"wego-trip": { ... }` accanto alle altre, senza rimuoverle.

Sostituisci:

- il percorso in `args` con quello copiato al Passo 1, seguito da
  `/scripts/wego-trip-mcp-server.mjs` (percorso assoluto, non relativo — es.
  `/Users/tuonome/Progetti/wego/scripts/wego-trip-mcp-server.mjs`);
- i quattro valori in `env` con quelli reali: stessi di `.env.local` per le
  prime due, le tue credenziali di login per le ultime due.

Salva il file. Fai attenzione a non lasciare virgole di troppo o mancanti:
è JSON, e un errore di sintassi impedisce all'app di leggere l'intero file
(non solo la voce `wego-trip`).

## Passo 4 — Riavvia l'app desktop

Chiudi completamente l'app desktop Claude.ai (non basta chiudere la
finestra: esci davvero dall'app) e riaprila. Solo a un riavvio completo
l'app rilegge `claude_desktop_config.json`.

## Passo 5 — Verifica che il server sia connesso

Nell'app desktop, apri le impostazioni dei connettori/server MCP e controlla
che `wego-trip` compaia nella lista, senza errori accanto. Se c'è un errore:

- **"command not found" o simile** → il percorso `node` non è nel `PATH`
  dell'app (diverso dal terminale). Sostituisci `"command": "node"` con il
  percorso assoluto del tuo eseguibile Node (`which node` nel terminale, es.
  `/usr/local/bin/node` o `/opt/homebrew/bin/node`).
- **Errore relativo a credenziali/login** → controlla di aver copiato email e
  password corrette in `env`, senza spazi extra.
- **Il server non compare affatto** → rileggi il Passo 3: probabile errore di
  sintassi JSON nel file di configurazione.

## Passo 6 — Prova i comandi

In una nuova conversazione nell'app desktop, chiedi di elencare i tuoi
viaggi. Dovresti vedere l'elenco con nome, codice di condivisione, ruolo e
data di ultima modifica — gli stessi che vedi nell'app WeGo. Poi prova a
farti leggere un viaggio specifico.

Per le modifiche (creare o aggiornare un viaggio, allegare un PDF), l'app
desktop ti chiederà comunque un'approvazione esplicita ad ogni chiamata
dello strumento, oltre alla conferma a voce che il modello ti chiede prima
di scrivere davvero (stessa procedura in due passaggi — riepilogo, poi
conferma — descritta in `SKILL.md`).

## Se aggiorni il repo in seguito

Se in futuro il repo si sposta di cartella, o cambi le credenziali Supabase,
ripeti dal Passo 2: aggiorna il file di configurazione con i nuovi valori e
riavvia l'app desktop. Non serve reinstallare nulla lato server MCP: lo
script si aggiorna da solo insieme al resto del repo (`git pull`).
