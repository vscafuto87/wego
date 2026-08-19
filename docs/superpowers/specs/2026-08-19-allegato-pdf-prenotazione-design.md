# Allegato PDF della prenotazione (Pernottamento)

Data: 2026-08-19
Stato: approvato, in attesa di piano di implementazione

## Contesto

Seguito diretto del lavoro "coordinate e indirizzo automatico sugli alloggi,
aggregati in Mappa" (commit `dc32b6a`). L'altra metà della richiesta
originale: poter allegare a un alloggio il PDF della prenotazione (biglietto,
conferma, voucher).

Un PDF è un binario, non uno scalare JSON: il documento del viaggio oggi vive
identico in IndexedDB, export e colonna `data` (jsonb) su Supabase, e ogni
modifica — anche minima — riscrive l'intero documento sia in locale
(`storage.js: saveTrips`) sia in remoto (`sync.js: pushTrip`, che oltretutto
tiene una copia in `previous_data`). Imbustare il PDF come base64 dentro
l'item Pernottamento avrebbe reso quel costo proporzionale al numero e al
peso dei PDF allegati, su ogni salvataggio di *qualunque* campo del viaggio.

Decisione presa in brainstorming: il PDF vive in un bucket **Supabase
Storage** privato, l'item Pernottamento tiene solo un riferimento (path +
nome file). Il documento del viaggio resta leggero. Contropartita accettata
esplicitamente: allegare o aprire per la prima volta un PDF richiede una
sincronizzazione attiva e, per l'upload, una connessione. Una volta aperto
almeno una volta, il PDF resta disponibile offline da una cache locale.

Questa è una migrazione Supabase (bucket + policy) e un cambio di schema:
entrambi discussi ed esplicitamente approvati qui, come richiesto da
CLAUDE.md. La SQL va applicata da chi ha accesso alla dashboard del progetto
Supabase o con `supabase db push` — non viene eseguita in autonomia.

## 1. Modello dati (`data/schema.js`)

`normalizeLodgingItem` guadagna due campi, stringhe semplici come già
`bookingLink`:

```jsonc
{
  "name": "Appartamento Porto", "checkIn": "", "checkOut": "",
  "address": "", "bookingLink": "", "lat": null, "lng": null,
  "bookingFilePath": "",   // nuovo: path nell'oggetto su Storage, "" se assente
  "bookingFileName": "",   // nuovo: nome file originale, per mostrarlo/scaricarlo
  "note": ""
}
```

Non serve toccare `exportTrip`: la sezione `lodging` usa già il percorso
generico (`{...base, items: section.items.map(withoutId)}`), che porta i
nuovi campi in export/sync senza codice dedicato — lo stesso motivo per cui
`lat`/`lng` non hanno richiesto modifiche lì.

Il path **non** usa l'id locale dell'item: quegli id si rigenerano a ogni
pull (`storage.js`, commento su `loadTrips`), quindi non sono un riferimento
stabile a un oggetto remoto. Il path si costruisce al momento dell'upload
(vedi §3) usando l'id del viaggio su Supabase (stabile) e un uuid nuovo, e da
lì in poi vive dentro `bookingFilePath` come qualunque altro campo del
viaggio.

## 2. Storage Supabase — nuova migrazione `supabase/sql/0003_trip_attachments_storage.sql`

Bucket privato, un file per oggetto, path `<remoteId-viaggio>/<uuid>.pdf`.
Le policy riusano `is_trip_member`/`is_trip_editor`, le funzioni
`SECURITY DEFINER` già introdotte in `0001_cloud_schema.sql` per rompere la
ricorsione tra le policy di `tv_trips`/`tv_trip_members` — stesso principio,
nessuna logica di membership duplicata: `storage.foldername(name)` isola il
primo segmento del path, che è l'id del viaggio.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-attachments', 'trip-attachments', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "trip_attachments_select" on storage.objects;
create policy "trip_attachments_select" on storage.objects for select
  using (
    bucket_id = 'trip-attachments'
    and is_trip_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_attachments_insert" on storage.objects;
create policy "trip_attachments_insert" on storage.objects for insert
  with check (
    bucket_id = 'trip-attachments'
    and is_trip_editor(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_attachments_delete" on storage.objects;
create policy "trip_attachments_delete" on storage.objects for delete
  using (
    bucket_id = 'trip-attachments'
    and is_trip_editor(((storage.foldername(name))[1])::uuid)
  );
```

`file_size_limit` (20 MB, in byte) è la stessa soglia applicata lato client
(§3): difesa in profondità, non l'unico controllo.

Lettura: qualunque membro (viewer o editor). Scrittura/cancellazione: solo
`editor` — stesso criterio già usato per `tv_trips_update`.

## 3. Livello client (`data/sync.js`)

Tre funzioni nuove, stesso stile delle altre in questo file (throw con
messaggio leggibile, nessun try/catch silenzioso):

```js
export async function uploadLodgingAttachment(remoteId, file) {
  const path = `${remoteId}/${crypto.randomUUID()}.pdf`
  const { error } = await supabase.storage
    .from('trip-attachments')
    .upload(path, file, { contentType: 'application/pdf' })
  if (error) throw new Error(error.message)
  return path
}

export async function removeLodgingAttachment(path) {
  const { error } = await supabase.storage.from('trip-attachments').remove([path])
  if (error) throw new Error(error.message)
}

export async function getAttachmentSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from('trip-attachments')
    .createSignedUrl(path, 120)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
```

`removeLodgingAttachment` viene sempre chiamata "a fianco" di un'azione
locale già decisa (sostituzione, rimozione, eliminazione dell'alloggio — vedi
§5.3): il chiamante la tratta come best-effort, un suo fallimento non deve
mai impedire l'azione locale.

## 4. Cache locale — nuovo file `data/attachments.js`

Stesso ruolo di `storage.js` ma per i blob dei PDF, non per il documento del
viaggio: usa `idb-keyval` (già in budget, i suoi store reggono `Blob`
nativamente in IndexedDB, nessuna serializzazione manuale).

```js
import { get, set, del } from 'idb-keyval'

const PREFIX = 'wego:attachment:'

export async function getCachedAttachment(path) {
  return (await get(PREFIX + path)) ?? null
}

export async function setCachedAttachment(path, blob) {
  await set(PREFIX + path, blob)
}

export async function removeCachedAttachment(path) {
  await del(PREFIX + path)
}
```

Chiave separata per allegato (non dentro il record `wego:trips`): un PDF
scaricato non deve gonfiare né rallentare il salvataggio del documento del
viaggio, che restano due preoccupazioni indipendenti.

### 4.1 Apertura di un PDF — funzione condivisa `openAttachment(item)` in `Lodging.jsx`

1. `getCachedAttachment(item.bookingFilePath)` → se c'è, crea
   `URL.createObjectURL(blob)` e apre (`window.open`), fine. Funziona
   offline.
2. Se non c'è ed è online: `getAttachmentSignedUrl(path)` → `fetch` →
   `blob()` → `setCachedAttachment(path, blob)` → apre come sopra.
3. Se non c'è ed è offline: messaggio inline "Questo PDF non è ancora
   scaricato su questo telefono: serve la connessione la prima volta."

Mai un `data:` URI diretto in un link (Safari iOS blocca spesso la
navigazione verso `data:` come destinazione di primo livello) e mai l'URL
firmato usato come `href` diretto (scade, e non sarebbe utilizzabile
offline): si passa sempre da un `Blob` locale e un `blob:` URL, revocato
(`URL.revokeObjectURL`) dopo l'apertura.

Dopo un upload riuscito, il file scelto (già in memoria come oggetto `File`,
che è già un `Blob`) viene messo subito in cache con
`setCachedAttachment(path, file)`, senza un giro di rete in più: chi carica
il PDF lo ritrova offline da subito, senza dover riaprirlo online prima.

## 5. Integrazione UI

### 5.1 Filo `syncState` fino a `Lodging`

Oggi `TripView` tiene `syncState` ma lo passa solo a `Settings`. Lo estendo
verso `Section`, che lo inoltra a `Lodging` solo per `section.type ===
'lodging'` (stesso pattern con cui oggi inoltra `onNavigate` solo a
`MapSection`):

```
TripView:  <Section ... syncState={syncState} onOpenActivate={() => setActivateOpen(true)} />
Section:   {section.type === 'lodging' && <Lodging ... remoteId={syncState?.remoteId ?? null} role={syncState?.role ?? null} onOpenActivate={onOpenActivate} />}
```

`onOpenActivate` è la stessa funzione già passata a `Settings` — apre lo
stesso `ActivateSyncModal` già montato in `TripView`, nessun modale
duplicato.

`Lodging.jsx` determina lo stato online con un hook `useOnlineStatus`
locale, identico a quello già definito (non esportato) in `MapSection.jsx`:
duplicare queste tre righe segue lo stesso criterio già scelto per
`formatDate` nella spec della mappa aggregata — più semplice che introdurre
un import incrociato tra viste per una funzione così piccola.

### 5.2 Il campo "Allega PDF" nel form alloggio

Quattro stati, in base a `remoteId`, `role`, `online`:

| stato | comportamento |
|---|---|
| `!remoteId` (nessuna sync attiva) | Niente controllo di upload. Testo "Attiva la sincronizzazione per allegare documenti" + bottone che chiama `onOpenActivate()`. |
| `remoteId` presente, `role === 'viewer'` | Niente controllo di upload. Se `bookingFilePath` è già valorizzato, resta visibile e apribile in sola lettura. |
| `remoteId` presente, `role === 'editor'`, offline | `<input type="file">` presente ma disabilitato, nota "Serve la connessione per allegare un documento." |
| `remoteId` presente, `role === 'editor'`, online | `<input type="file" accept="application/pdf">` attivo. |

Flusso di upload (stato `editor` + online):

1. Alla scelta del file: valida `file.type === 'application/pdf'` (fallback
   su estensione `.pdf` se il picker mobile non imposta il MIME type) e
   `file.size <= 20 * 1024 * 1024`. Errore inline se non valido: "Puoi
   allegare solo un file PDF, fino a 20 MB." — niente chiamata di rete se la
   validazione fallisce.
2. Se un `bookingFilePath` precedente esiste già su questo item, lo segna da
   cancellare a sostituzione avvenuta (§5.3).
3. Stato "Caricamento…" (disabilita il controllo), chiama
   `uploadLodgingAttachment(remoteId, file)`.
4. Successo: `setCachedAttachment(path, file)`, aggiorna lo stato locale del
   form (`bookingFilePath`, `bookingFileName`) — resta da salvare con
   "Salva" come ogni altro campo del form, nessuna scrittura diretta sul
   trip qui.
5. Errore: messaggio inline "Il caricamento non è riuscito. Controlla la
   rete e riprova.", il form resta com'era.

Nella card di un alloggio già salvato, se `bookingFilePath` è valorizzato,
un link "Apri il PDF della prenotazione" accanto a quello già esistente
"Apri la prenotazione" (che resta il `bookingLink` testuale, sono due cose
diverse: un link esterno e un file allegato).

### 5.3 Pulizia degli oggetti — cosa viene cancellato e quando

Tre punti dove `removeLodgingAttachment(path)` (best-effort, non bloccante)
viene chiamata:

- **Sostituzione**: un nuovo upload riuscito su un item che aveva già un
  `bookingFilePath` cancella il path vecchio (e la sua cache locale, via
  `removeCachedAttachment`).
- **Bottone "Rimuovi PDF"** nel form: cancella oggetto remoto, cache locale,
  svuota `bookingFilePath`/`bookingFileName` nello stato del form.
- **Eliminazione dell'intero alloggio** (`removeItem` già esistente in
  `Lodging.jsx`): se l'item aveva un allegato, lo cancella allo stesso modo
  prima di rimuovere l'item dalla lista.

### 5.4 Semplificazione deliberata: oggetti orfani

L'upload parte alla scelta del file (passo 3 sopra), non al "Salva" del
form: dà un riscontro immediato, coerente con come si comportano quasi tutti
i picker di allegati. Conseguenza accettata: se il modale viene chiuso senza
salvare dopo un upload riuscito, il file resta su Storage senza che nessun
item lo referenzi. Per un'app personale con pochi utenti è un costo
trascurabile (spazio, nessuna amplificazione di privacy: resta comunque
protetto dalle stesse policy RLS). Non previsto un job di pulizia: se in
futuro diventasse un problema reale, si affronta allora.

## 6. Testing

Nessuna suite automatica per i componenti React in questo progetto (verifica
manuale in `npm run preview`, come da convenzione già in uso); test
automatici solo per la logica pura/dati:

- `data/schema.test.js`: `normalizeLodgingItem` con/senza
  `bookingFilePath`/`bookingFileName`, `exportTrip` li conserva senza id.
- `data/sync.test.js`: `uploadLodgingAttachment`, `removeLodgingAttachment`,
  `getAttachmentSignedUrl` con `supabase.storage.from` mockato (stesso
  pattern già in uso in questo file per `supabase.from`/`supabase.rpc`) —
  path generato, errori propagati come `Error` con messaggio leggibile.
- `data/attachments.test.js` (nuovo): `getCachedAttachment` /
  `setCachedAttachment` / `removeCachedAttachment` con `idb-keyval`
  mockato, stesso pattern di `storage.test.js`.

Verifica manuale in `npm run build && npm run preview`, su un viaggio con
sync attiva:

- allegare un PDF valido a un alloggio (ruolo editor, online) → compare
  "Apri il PDF della prenotazione", il file si apre in una nuova scheda;
- provare un file non-PDF e uno oltre 20 MB → messaggio d'errore corretto,
  nessuna chiamata di rete;
- disattivare la rete (DevTools → Offline) e riaprire lo stesso PDF già
  aperto una volta → si apre comunque, dalla cache;
- disattivare la rete e provare ad allegarne uno nuovo → controllo
  disabilitato con la nota corretta;
- su un viaggio senza sync attiva → invito ad attivarla, il bottone apre
  `ActivateSyncModal`;
- entrare come viewer (secondo dispositivo/account con ruolo viewer) → PDF
  già allegato apribile, nessun controllo di upload visibile;
- sostituire un PDF già allegato, poi eliminare l'alloggio → verificare (da
  dashboard Supabase → Storage) che gli oggetti vecchi siano stati rimossi.

## 7. Cosa NON cambia

- `storage.js` (persistenza del documento del viaggio in IndexedDB): nessuna
  modifica, `bookingFilePath`/`bookingFileName` sono stringhe come le altre.
- Il prompt di caricamento rapido: non genera mai un PDF da appunti grezzi,
  resta fuori scope per costruzione — l'allegato si aggiunge solo dalla UI.
- Le altre sezioni (`cards`, `map`, `transport`) non guadagnano un campo
  allegato: la richiesta era specifica a Pernottamento, non la estendo per
  simmetria. Il modulo `data/attachments.js` e le funzioni di `sync.js`
  restano comunque generiche (parametrizzate per path, non per "lodging"),
  quindi riusabili senza rifattorizzare se in futuro servisse altrove.
