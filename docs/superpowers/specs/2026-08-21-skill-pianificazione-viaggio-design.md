# Skill di pianificazione viaggio: crea/modifica un viaggio WeGo conversando con Claude

Data: 2026-08-21
Stato: approvato, in attesa di piano di implementazione

## Contesto

Oggi l'unico modo per portare un viaggio pianificato dentro WeGo è il
"caricamento rapido": si scrivono appunti grezzi, si genera un JSON con
Claude usando il prompt fisso di `ImportView.jsx`, e si incolla il risultato
nell'app. Funziona bene per un caricamento in blocco, ma non supporta una
pianificazione conversazionale (discutere ogni giorno — sentieri, spostamenti,
prenotazioni — con Claude) né la modifica incrementale di un viaggio già
sincronizzato: ogni volta serve rigenerare l'intero JSON a mano e reincollarlo.

Questo lavoro introduce una skill di progetto (`.claude/skills/wego-trip/`)
che copre l'intero ciclo: pianificazione conversazionale giorno per giorno,
poi scrittura diretta su Supabase (creazione di un viaggio nuovo o modifica
di uno esistente), senza passare dal browser.

Decisioni raccolte in brainstorming:

- Scrittura diretta su Supabase (non solo generazione di JSON da incollare),
  usando lo stack già approvato (`@supabase/supabase-js`) — nessuna nuova
  dipendenza, nessuna nuova tabella, nessuna modifica alle migrazioni.
- Niente service-role key né API `api/admin/*`: lo script agisce come
  l'utente stesso (owner/editor), rispettando le RLS già esistenti su
  `tv_trips`/`tv_trip_members` — stesso modello di permessi dell'app.
- Autenticazione via credenziali dedicate in `.env.local`
  (`WEGO_SCRIPT_EMAIL`/`WEGO_SCRIPT_PASSWORD`, non prefissate `VITE_`, quindi
  mai nel bundle), lette da Node nativamente (`node --env-file=.env.local`,
  Node 24 già in uso — niente dipendenza `dotenv`).
- Identificazione del viaggio per **nome** (match case-insensitive su
  `data.name` tra i viaggi di cui l'utente è owner/editor).
- Nessuna scrittura senza conferma esplicita: lo script fa sempre un dry-run
  di default (stampa un riepilogo delle differenze) e scrive solo con un
  flag `--yes` esplicito, dopo che l'utente ha confermato in chat.
- Stesso schema JSON già usato dal prompt di `ImportView.jsx` (sei tipi di
  sezione, campo `kind` per le voci giorno) — zero divergenza di formato tra
  i due flussi di ingresso dati.

## 1. Script `scripts/wego-trip-sync.mjs`

CLI Node standalone (ESM, `type: module` già impostato in `package.json`),
lanciato dalla skill via Bash. Non importa nulla da `src/` per evitare di
trascinare dipendenze Vite/browser (`import.meta.env`, ecc.): usa
`@supabase/supabase-js` direttamente, con le stesse costanti di normalizzazione
duplicate in forma minima dove servono (vedi §3).

### 1.1 Comandi

```
node --env-file=.env.local scripts/wego-trip-sync.mjs list
node --env-file=.env.local scripts/wego-trip-sync.mjs pull <nome>
node --env-file=.env.local scripts/wego-trip-sync.mjs push <nome> <file.json> [--yes]
node --env-file=.env.local scripts/wego-trip-sync.mjs create <file.json> [--yes]
```

- **`list`** — autentica, interroga `tv_trips` filtrando quelle di cui
  l'utente è owner o membro (join implicito via RLS: la select vede solo le
  righe permesse), stampa una tabella testuale `nome — share_code — ruolo —
  ultima modifica`.
- **`pull <nome>`** — trova il viaggio per nome (vedi §1.3), stampa il JSON
  completo di `data` su stdout (`normalizeTrip`-compatibile, così Claude lo
  legge come stato corrente prima di discutere modifiche).
- **`push <nome> <file.json>`** — trova il viaggio per nome, legge il `data`
  remoto attuale, lo confronta col contenuto di `file.json` (vedi §2 per il
  formato del riepilogo). Senza `--yes`: stampa il riepilogo ed esce senza
  scrivere (`process.exit(0)`). Con `--yes`: esegue l'update (stesso pattern
  di `pushTrip()` in `src/data/sync.js` — legge il `data` corrente, lo salva
  in `previous_data`, aggiorna `data` e `updated_at`).
- **`create <file.json>`** — stesso doppio comportamento dry-run/`--yes`.
  Alla conferma: genera uno `share_code` univoco (stessa logica a 6 caratteri
  di `generateShareCode()` in `sync.js`, ritentando su collisione), inserisce
  la riga in `tv_trips` con `owner_id` dell'utente autenticato, poi inserisce
  la riga corrispondente in `tv_trip_members` con `role: 'editor'`.

### 1.2 Autenticazione

```js
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data, error } = await supabase.auth.signInWithPassword({
  email: process.env.WEGO_SCRIPT_EMAIL,
  password: process.env.WEGO_SCRIPT_PASSWORD,
})
```

Se `WEGO_SCRIPT_EMAIL`/`WEGO_SCRIPT_PASSWORD` mancano in `.env.local`, lo
script esce subito con un errore che nomina le due variabili mancanti (niente
retry silenzioso, niente prompt interattivo — coerente con l'uso da parte di
Claude via Bash, non da un terminale interattivo). `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` sono già presenti in `.env.local` per l'app, lo
script li riusa: stesso progetto Supabase, stesse chiavi pubbliche.

### 1.3 Risoluzione del nome viaggio

Query: `select id, share_code, data, updated_at from tv_trips where data->>'name' ilike <nome>`
(ricerca case-insensitive esatta sul nome, non una substring — evita
ambiguità impreviste). Casi:

- **0 risultati** → errore chiaro: "Nessun viaggio chiamato «X» tra quelli a
  cui hai accesso. Usa `list` per vedere i nomi disponibili."
- **>1 risultato** (stesso nome, viaggi diversi) → errore chiaro che elenca
  gli `share_code` in conflitto, chiede di rilanciare specificando lo
  `share_code` al posto del nome (tutti i comandi accettano indifferentemente
  un nome o uno `share_code` a 6 caratteri maiuscoli come primo argomento
  posizionale, distinti per forma: `/^[A-Z2-9]{6}$/`).
- **ruolo `viewer`** (l'utente è membro ma non editor, e non owner) → `push`
  si ferma con errore chiaro ("Sei solo viewer su «X», non puoi modificarlo")
  invece di lasciar fallire la RLS con un errore Postgres grezzo. `pull` resta
  permesso (le RLS di lettura valgono già per i viewer).

## 2. Riepilogo differenze (dry-run)

Confronto strutturale tra `data` remoto e il JSON proposto, per sezione. Il
riepilogo segnala anche i cambiamenti a livello di viaggio (nome, date,
palette, ecc.), non solo giorni e sezioni: quando presenti, compaiono in un
blocco `Dati generali:` sopra `Giorni:`.

```
Viaggio: Ponza (bis) (share_code ABC123)

Dati generali:
  name: Ponza → Ponza (bis)

Giorni:
  2026-09-01: +1 voce itinerario ("Cena da Mario")
  2026-09-02: nessuna modifica

Sezioni:
  Trasporti: +1 voce (traghetto Formia→Ponza, 2026-08-30)
  Pernottamento: nessuna modifica
  Ristoranti: nessuna modifica
  Mappa, Da prenotare, Note: nessuna modifica

Nessuna scrittura eseguita (dry-run). Rilancia con --yes per confermare.
```

Il confronto è per conteggio + titolo/nome delle voci aggiunte, rimosse o con
campi cambiati (non un diff carattere per carattere): sufficiente perché
Claude lo traduca in una frase in chat per la conferma dell'utente. Per
`create`, il riepilogo è semplicemente l'elenco di giorni e sezioni che
verranno creati (non c'è un "prima" con cui confrontare).

## 3. Normalizzazione minima

Lo script non importa `src/data/schema.js` (evita dipendenze da
`import.meta.env`/bundling Vite in un contesto Node puro). Applica solo i
controlli che gli servono per il confronto e per non scrivere dati palesemente
malformati:

- `file.json` deve avere `name` (stringa non vuota) — stesso unico requisito
  bloccante di `normalizeTrip()`.
- Campi mancanti non vengono riempiti di default lato script: il file passato
  a `push`/`create` deve già essere nel formato completo prodotto dalla
  conversazione (la skill, non lo script, garantisce lo schema corretto —
  vedi §4). Se `sections[].type` non è uno dei sei validi, lo script rifiuta
  con un errore che elenca i tipi ammessi, prima di arrivare a Supabase.

## 4. Skill `.claude/skills/wego-trip/SKILL.md`

Contenuto della skill (istruzioni per Claude, non codice eseguito):

- **Schema di riferimento**: stesso schema JSON del prompt in
  `ImportView.jsx` (sei tipi di sezione — `cards, checklist, notes, transport,
  lodging, map` — e il campo opzionale `kind` per le voci giorno —
  `sentiero, spiaggia, pasto`). La skill incorpora la stessa definizione di
  campi per evitare che le due strade producano formati diversi.
- **Flusso "nuovo viaggio"**: raccogliere nome, date, palette, persone: poi
  procedere giorno per giorno chiedendo itinerario/sentieri, spostamenti
  (trasporti), pasti/prenotazioni, alloggio; costruire il JSON completo in un
  file temporaneo (scratchpad) via via che la conversazione procede.
- **Flusso "modifica"**: eseguire `pull <nome>` per leggere lo stato attuale,
  discutere in chat solo le parti da cambiare, produrre il JSON *intero*
  aggiornato (la colonna `data` è sempre il documento completo, non una
  patch).
- **Regola invariata**: mai inventare/calcolare `lat`/`lng` da un nome di
  luogo — solo se presenti per certo negli appunti/nella conversazione
  (stessa regola del prompt di import).
- **Conferma obbligatoria**: lanciare sempre prima `push`/`create` senza
  `--yes`, riportare il riepilogo stampato dallo script come testo in chat
  (non semplicemente incollare l'output grezzo), attendere un sì esplicito
  dell'utente, solo poi rilanciare con `--yes`.
- **Credenziali**: non chiedere mai email/password all'utente in chat; sono
  già in `.env.local` per lo script. Se lo script fallisce per credenziali
  mancanti, dire all'utente di aggiungere `WEGO_SCRIPT_EMAIL`/
  `WEGO_SCRIPT_PASSWORD` a `.env.local`.

## 5. Errori ed edge case

| Caso | Comportamento |
|---|---|
| `.env.local` senza `WEGO_SCRIPT_EMAIL`/`PASSWORD` | Errore immediato, nomina le variabili mancanti |
| Credenziali errate (login fallisce) | Errore Supabase auth propagato as-is |
| Nome viaggio non trovato | Errore + suggerimento di usare `list` |
| Nome viaggio ambiguo (più match) | Errore + elenco `share_code` in conflitto |
| Ruolo `viewer` su `push`/`create` | Errore chiaro prima di toccare Supabase |
| `sections[].type` non valido nel file da scrivere | Errore, elenca i 6 tipi ammessi |
| `push`/`create` senza `--yes` | Dry-run: stampa riepilogo, `exit(0)`, nessuna scrittura |
| Collisione `share_code` in `create` | Retry automatico (stessa logica a 3 tentativi di `activateTripSync`) |

## 6. Testing

- Test Vitest per la funzione pura di calcolo del riepilogo differenze
  (`diffTrip(remote, proposed) → summary`): giorni aggiunti/rimossi/modificati,
  voci di sezione aggiunte/rimosse, nessuna modifica.
- Test Vitest per la risoluzione nome/share_code (regex di riconoscimento
  forma, gestione 0/1/N risultati) con un client Supabase finto (stesso stile
  di mocking già usato in `sync.test.js`).
- Nessun test contro un progetto Supabase reale (richiederebbe rete/Docker,
  escluso da CLAUDE.md) — verifica manuale end-to-end su un viaggio di prova
  prima di considerare la skill pronta all'uso quotidiano.

## Fuori scope

- Risoluzione conflitti multi-editor (due persone che modificano lo stesso
  viaggio nello stesso momento): resta last-write-wins come nel resto
  dell'app, non introduciamo qui una logica di merge più sofisticata.
- Allegati PDF ai biglietti/prenotazioni: restano un flusso separato
  (upload binario, non rappresentabile nel JSON) — vedi
  `2026-08-19-allegato-pdf-prenotazione-design.md`.
- Una skill "personale" (`~/.claude/skills`) riusabile su altri progetti:
  questa è una skill di progetto, specifica per lo schema di WeGo.
