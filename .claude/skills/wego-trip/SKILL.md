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
