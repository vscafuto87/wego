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
      "items": [ { "time": "HH:MM o vuoto", "title": "string", "detail": "string", "link": "string" } ],
      "order": ["item", "transport"] }
  ],
  "sections": [
    { "title": "Ristoranti", "icon": "food", "type": "cards", "items": [ { "title": "", "meta": "", "detail": "", "link": "", "tags": [], "lat": null, "lng": null, "date": "", "time": "" } ] },
    { "title": "Trasporti", "icon": "bus", "type": "transport", "items": [ { "mode": "auto | treno | aereo | bus | traghetto", "from": "", "to": "", "date": "AAAA-MM-GG", "time": "", "ticketLink": "", "note": "", "ticketFilePath": "", "ticketFileName": "" } ] },
    { "title": "Pernottamento", "icon": "bed", "type": "lodging", "items": [ { "name": "", "checkIn": "AAAA-MM-GG", "checkOut": "AAAA-MM-GG", "address": "", "bookingLink": "", "note": "", "bookingFilePath": "", "bookingFileName": "" } ] },
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

Un item `cards` (di qualunque sezione, non solo Ristoranti) può avere lo stesso `kind`
opzionale con gli stessi campi extra: `lat`/`lng` sulle schede ci sono sempre, con o
senza kind; `date`/`time` restano quelli di Ristoranti descritti sotto, non legati al kind.

**Mai inventare o calcolare `lat`/`lng`** da un nome di luogo: solo se l'utente
fornisce un link Maps o coordinate numeriche esplicite, altrimenti `null`. Le
quattro sezioni Trasporti/Pernottamento/Ristoranti/Mappa sono sempre presenti,
anche vuote (`items: []`), sono fisse in ogni viaggio. Su un item `cards` di
Ristoranti, `date`/`time` segnano una prenotazione confermata (vuoti se è solo
un consiglio) e, quando `date` cade in un giorno del viaggio, fanno comparire
la scheda anche nell'itinerario di quel giorno.

`day.order` (opzionale) salva l'ordine di trascinamento combinato di
itinerario e trasporti per quel giorno, mostrato nell'app come un'unica lista
(vedi `buildDayTimeline` in `src/data/schema.js`). Se un giorno pullato ha già
`order`, **riportalo invariato** quando riscrivi quel giorno, anche se stai
modificando solo `items` o il resto del giorno: ometterlo non rompe nulla
(l'app ricade su "voci poi trasporti"), ma cancella silenziosamente l'ordine
personalizzato che l'utente aveva impostato trascinando le voci nell'app. Per
un giorno nuovo che stai creando da zero, ometti `order` (o lascialo `[]`):
l'app userà l'ordine di default finché l'utente non lo trascina lui stesso.

`ticketFilePath`/`ticketFileName` (trasporti) e `bookingFilePath`/
`bookingFileName` (alloggi) sono gestiti dal comando `attach`, non
dall'utente. Se una voce pullata ha già questi campi valorizzati,
**riportali invariati** quando riscrivi quella voce con `push`, anche se
stai modificando solo altri campi: ometterli cancella silenziosamente il
collegamento al PDF già caricato (il file resta nel bucket di Storage,
orfano, senza più nulla che lo referenzi).

## Dati mancanti: chiedi, non lasciare vuoto

Per i campi **sostanziali** — data/ora, indirizzi, link a biglietti/
prenotazioni/mappa, coordinate quando rilevanti — non lasciarli vuoti per
default: chiedi esplicitamente all'utente, una domanda alla volta. Se
risponde "non lo so"/"non ce l'ho ancora", accetta la risposta, lascia il
campo vuoto e vai avanti senza richiederlo di nuovo per quella voce.

Per i campi **decorativi** — note, dettagli aggiuntivi, tag, `meta` delle
schede Ristoranti — resta libero di lasciarli vuoti se l'utente non li
menziona spontaneamente: non serve chiederli uno per uno.

## Flusso "viaggio nuovo"

1. Raccogli nome, date, palette (`mountain | sea | city | wild`), persone.
2. Per ogni giorno del viaggio, chiedi in ordine: itinerario/sentieri (con
   `kind: "sentiero"` se pertinente), spostamenti (voce di sezione
   `transport`), pasti/prenotazioni (`kind: "pasto"` sul giorno, o sezione
   `cards` "Ristoranti" per consigli generali non legati a un giorno preciso),
   alloggio (sezione `lodging`). Per ciascuno, segui la regola sui dati
   mancanti sopra: chiedi i campi sostanziali se non emergono dal discorso.
3. Costruisci via via il JSON completo in un file nello scratchpad di sessione
   (es. `/tmp/.../trip-draft.json`), aggiornandolo dopo ogni giorno discusso.
4. A conversazione conclusa, esegui il dry-run e chiedi conferma (vedi sotto),
   poi crea il viaggio.

## Flusso "modifica viaggio esistente"

1. Esegui `pull <nome>` per leggere lo stato attuale del viaggio.
2. Discuti in chat solo le parti da cambiare (es. "aggiungi il traghetto di
   ritorno al 5 settembre"), chiedendo i campi sostanziali mancanti come sopra.
3. Applica le modifiche allo stesso JSON scaricato — la colonna `data` è
   sempre il documento intero, non una patch: non omettere le parti
   invariate, incluso `day.order` quando presente (vedi sopra).
4. Esegui il dry-run e chiedi conferma, poi applica la modifica.

## Comandi (da lanciare via Bash, dalla root del repo)

```bash
node --env-file-if-exists=.env.local scripts/wego-trip-sync.mjs list
node --env-file-if-exists=.env.local scripts/wego-trip-sync.mjs pull "<nome o share_code>"
node --env-file-if-exists=.env.local scripts/wego-trip-sync.mjs push "<nome o share_code>" <file.json>
node --env-file-if-exists=.env.local scripts/wego-trip-sync.mjs create <file.json>
```

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
- **"Sezione non valida..."** → `items`/`attach` valgono solo per `transport`
  o `lodging`.
- **"Indice non valido..."** → rilancia `items` per vedere l'elenco
  aggiornato prima di riprovare `attach`.
