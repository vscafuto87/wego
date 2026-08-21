# Comando `attach`: allegare un PDF a un trasporto o un alloggio dalla skill wego-trip

Data: 2026-08-21
Stato: approvato, in attesa di piano di implementazione

## Contesto

La skill `wego-trip` ([2026-08-21-skill-pianificazione-viaggio-design.md](2026-08-21-skill-pianificazione-viaggio-design.md))
scrive solo la colonna `data` (jsonb) di `tv_trips`: un PDF allegato a un
biglietto di trasporto o a una prenotazione di alloggio (bucket Storage
`trip-attachments`, vedi [0003_trip_attachments_storage.sql](../../supabase/sql/0003_trip_attachments_storage.sql))
era esplicitamente fuori scope. Oggi l'unico modo per allegare un PDF è
l'app o la dashboard admin (`uploadTransportAttachment`/
`uploadLodgingAttachment` in `src/data/sync.js`).

Questo lavoro estende `scripts/wego-trip-sync.mjs` con un comando `attach`
(più un comando di supporto `items`), così un PDF passato a Claude durante
una sessione di pianificazione può arrivare nel bucket e nella voce giusta
senza passare dal browser.

Decisioni raccolte in brainstorming:

- Comando **separato** da `push`/`create`, non un campo del JSON che
  l'utente scrive a mano: il percorso di storage si genera solo al momento
  dell'upload (un UUID), quindi non ha senso rappresentarlo in anticipo nel
  file che si prepara in conversazione.
- Selezione della voce per **indice numerico** all'interno della sezione
  (`transport` o `lodging`), non per corrispondenza descrittiva: niente
  ambiguità tra voci simili. Un comando di supporto, `items`, stampa
  l'elenco numerato prima dell'upload.
- Stesso schema dry-run/`--yes` di `push`/`create`: nessun upload né
  scrittura su `tv_trips` senza conferma esplicita.
- Se la voce ha già un allegato, `attach` lo **sostituisce**: cancella il
  vecchio file da Storage prima di caricare il nuovo, per non lasciare file
  orfani nel bucket.
- Nessuna nuova dipendenza: `@supabase/supabase-js` gestisce già lo
  Storage; il bucket e le sue policy esistono già.

## 1. Comando di supporto `items`

```
node --env-file-if-exists=.env.local scripts/wego-trip-sync.mjs items <nome|share_code> <transport|lodging>
```

Risolve il viaggio (stessa `findTrip` di `pull`/`push`), trova la sezione
del tipo richiesto (`transport` o `lodging` — unico tipo valido per questo
comando, altrimenti errore chiaro che elenca i due ammessi), stampa un
elenco numerato (1-based) con una riga descrittiva per voce:

```
1. traghetto Formia → Ponza, 2026-08-30 (nessun allegato)
2. aereo Bologna → Roma, 2026-08-28 (allegato: biglietto-aereo.pdf)
```

Per `transport`: `<mode> <from> → <to>, <date>`. Per `lodging`: `<name>,
<checkIn> → <checkOut>`. In coda, `(nessun allegato)` o `(allegato:
<fileName>)` a seconda che `ticketFileName`/`bookingFileName` sia valorizzato.
Sezione vuota → stampa "Nessuna voce in <Trasporti|Pernottamento>."

## 2. Comando `attach`

```
node --env-file-if-exists=.env.local scripts/wego-trip-sync.mjs attach <nome|share_code> <transport|lodging> <indice> <file.pdf> [--yes]
```

- Valida `<transport|lodging>` come per `items`.
- Valida `<indice>`: intero ≥ 1; se non numerico o fuori range rispetto alle
  voci della sezione, errore chiaro che indica quante voci ci sono
  (suggerendo di rilanciare `items` per lo stato aggiornato).
- Valida `<file.pdf>`: il percorso deve esistere ed avere estensione `.pdf`
  (case-insensitive) — nessuna validazione del contenuto oltre l'estensione.
- Risolve il viaggio, **stesso controllo di ruolo di `push`**: `viewer` non
  può allegare (errore "Sei solo viewer su «X»...").
- Calcola una riga di riepilogo: `Verrà caricato "<nomefile>" e collegato a:
  <descrizione voce>.` più, se la voce ha già un allegato, `Sostituirà
  l'allegato attuale (<vecchio fileName>).`
- **Senza `--yes`**: stampa il riepilogo, nessun upload, nessuna scrittura,
  torna `{ written: false }`.
- **Con `--yes`**:
  1. Carica il nuovo file: `supabase.storage.from('trip-attachments').upload(`${trip.id}/${crypto.randomUUID()}.pdf`, buffer, { contentType: 'application/pdf' })`.
     Se l'upload fallisce, errore e nessuna scrittura su `tv_trips`, nessun
     effetto sul vecchio allegato.
  2. Imposta `ticketFilePath`/`ticketFileName` (trasporti) o
     `bookingFilePath`/`bookingFileName` (alloggi) sulla voce all'indice
     indicato, con `fileName` = nome del file dato in input (basename del
     percorso).
  3. Scrive `data` aggiornato su `tv_trips`, stesso pattern di `push`
     (`previous_data` = `data` precedente, `updated_at` nuovo). Se la
     scrittura fallisce, il nuovo file resta orfano nel bucket ma il vecchio
     allegato (se presente) è ancora intatto e valido: nessun riferimento
     rotto, nessuna perdita di dati.
  4. Solo ora, se la voce aveva già `ticketFilePath`/`bookingFilePath`, tenta
     la rimozione del vecchio file da Storage
     (`supabase.storage.from('trip-attachments').remove([oldPath])`). Se la
     rimozione fallisce (es. file già assente), stampa un avviso su stderr e
     **continua** — il comando ha già scritto con successo il nuovo
     allegato, quindi non blocca né annulla nulla per un vecchio file che al
     più resta orfano nel bucket. Rimuovere prima di caricare/scrivere
     lascerebbe invece, in caso di errore successivo, un riferimento rotto
     al vecchio file già cancellato: peggio di un file orfano, è perdita di
     dati.
  5. Conferma: `Allegato "<nomefile>" collegato a <descrizione voce>.`

## 3. Normalizzazione minima

Nessuna nuova validazione strutturale oltre a quella già presente
(`validateTripPayload` non è coinvolta qui: `attach` non prende un file JSON
in input, lavora sul `data` già remoto). L'unica validazione nuova è quella
di `<transport|lodging>` e dell'estensione `.pdf`.

## 4. Skill `.claude/skills/wego-trip/SKILL.md`

Aggiunta di una sezione che descrive il flusso: quando l'utente allega un
PDF di un biglietto/prenotazione durante la conversazione, Claude esegue
prima `items` sulla sezione pertinente per mostrare l'elenco e farsi
confermare l'indice giusto dall'utente, poi `attach` (dry-run → conferma →
`--yes`), con lo stesso schema di conferma esplicita già in uso per
`push`/`create`. Nota che il file PDF deve essere leggibile da un percorso
locale al momento in cui Claude lancia il comando via Bash (dipende da come
l'ambiente in cui gira Claude espone i file allegati alla conversazione).

## 5. Errori ed edge case

| Caso | Comportamento |
|---|---|
| Sezione diversa da `transport`/`lodging` | Errore, elenca i due tipi ammessi |
| Indice non numerico o fuori range | Errore, indica il numero di voci disponibili e suggerisce `items` |
| File non esistente o non `.pdf` | Errore chiaro, nessuna chiamata a Supabase |
| Ruolo `viewer` | Stesso errore di `push`, prima di ogni upload |
| `attach` senza `--yes` | Dry-run: stampa riepilogo, nessun upload, nessuna scrittura |
| Voce con allegato già presente | Sostituzione: rimozione best-effort del vecchio file, poi upload del nuovo |
| Rimozione del vecchio file fallisce | Avviso non bloccante, il nuovo upload procede comunque |
| Upload del nuovo file fallisce | Errore, nessuna scrittura su `tv_trips` (niente path fantasma nel `data`) |

## 6. Testing

- Test Vitest per la funzione pura di formattazione riga (`describeSectionItem`)
  in `wego-trip-lib.mjs`: trasporto con/senza allegato, alloggio con/senza
  allegato.
- Test Vitest per `cmdItems`/`cmdAttach` con client Supabase finto (incluso
  `.storage.from().upload()`/`.remove()`), stesso stile di mocking degli
  altri comandi: dry-run non carica né scrive, `--yes` carica e scrive,
  sostituzione di un allegato esistente, rimozione fallita non blocca,
  upload fallito non scrive su `tv_trips`, ruolo viewer rifiutato, indice
  fuori range rifiutato prima di ogni chiamata Supabase.
- Nessun test contro un bucket Supabase reale — verifica manuale end-to-end
  (allegare un PDF di prova a un viaggio di test, controllare nell'app che
  compaia, eliminarlo) prima dell'uso quotidiano, stessa cautela già
  applicata al resto della skill.

## Fuori scope

- Allegare altri tipi di file oltre al PDF (immagini, altri documenti):
  fuori scope, l'app stessa assume sempre "allegato PDF".
- Un comando per *rimuovere* un allegato senza sostituirlo: non richiesto,
  si può fare dall'app; se servirà in futuro va discusso a parte.
- Validare il contenuto del PDF (che sia un PDF valido, dimensione, ecc.):
  fuori scope, stessa fiducia già riposta nell'app quando l'utente allega da
  browser.
