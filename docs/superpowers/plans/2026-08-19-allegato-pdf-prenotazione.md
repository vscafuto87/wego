# Allegato PDF della prenotazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di allegare a un alloggio (sezione Pernottamento) il PDF della prenotazione, salvato su Supabase Storage, apribile anche offline dopo la prima apertura.

**Architecture:** Il documento del viaggio tiene solo un riferimento (`bookingFilePath`/`bookingFileName`) su un item Pernottamento; il PDF vive in un bucket Supabase Storage privato (`trip-attachments`), path `<remoteId-viaggio>/<uuid>.pdf`, protetto da policy RLS che riusano le funzioni `is_trip_member`/`is_trip_editor` già esistenti. Una cache locale in IndexedDB (`data/attachments.js`) tiene il blob dopo la prima apertura, così il PDF resta disponibile offline. L'upload richiede sync attiva, ruolo editor, e connessione; l'apertura funziona offline se già in cache.

**Tech Stack:** React 18, `@supabase/supabase-js` (storage client), `idb-keyval` (cache blob locale) — nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-08-19-allegato-pdf-prenotazione-design.md`

## Global Constraints

- Niente dipendenze oltre React, Tailwind, lucide-react, idb-keyval, @supabase/supabase-js, vite-plugin-pwa, leaflet, react-leaflet.
- Copy in italiano, tono piano, seconda persona; errori dicono cosa è successo e come si ripara.
- Aree toccabili da almeno 44px, focus visibile.
- La migrazione SQL (Task 2) non viene eseguita in autonomia: va applicata dall'utente dalla dashboard Supabase o con `supabase db push`.
- Ogni task chiude con `npm run build` pulito (dove applicabile) e commit separato.
- Limite file: 20 MB, solo `application/pdf`, verificato sia lato client sia sul bucket.

---

### Task 1: Campi `bookingFilePath`/`bookingFileName` sull'item Pernottamento

**Files:**
- Modify: `src/data/schema.js:114-129` (`normalizeLodgingItem`)
- Test: `src/data/schema.test.js`

**Interfaces:**
- Produces: `normalizeLodgingItem(raw)` include ora `bookingFilePath: string`, `bookingFileName: string` (stringa vuota se assenti/non stringa) nell'oggetto normalizzato di un item Pernottamento.

- [ ] **Step 1: Scrivi i test che falliscono**

Nel blocco `describe('normalizeTrip — sezione lodging', ...)` di `src/data/schema.test.js`, dopo il test `'exportTrip conserva lat/lng sull\'alloggio, senza id'`:

```js
  it('normalizza bookingFilePath/bookingFileName quando presenti', () => {
    const section = tripWithLodgingSection([
      { name: 'Hotel', bookingFilePath: 'trip-1/abc.pdf', bookingFileName: 'conferma.pdf' }
    ]).sections.find((s) => s.type === 'lodging')
    expect(section.items[0].bookingFilePath).toBe('trip-1/abc.pdf')
    expect(section.items[0].bookingFileName).toBe('conferma.pdf')
  })

  it('bookingFilePath/bookingFileName mancanti diventano stringa vuota', () => {
    const section = tripWithLodgingSection([{ name: 'Hotel' }]).sections.find((s) => s.type === 'lodging')
    expect(section.items[0].bookingFilePath).toBe('')
    expect(section.items[0].bookingFileName).toBe('')
  })

  it('exportTrip conserva bookingFilePath/bookingFileName, senza id', () => {
    const trip = tripWithLodgingSection([{ name: 'Hotel', bookingFilePath: 'trip-1/abc.pdf', bookingFileName: 'conferma.pdf' }])
    const exported = exportTrip(trip).sections.find((s) => s.type === 'lodging')
    expect(exported.items[0].bookingFilePath).toBe('trip-1/abc.pdf')
    expect(exported.items[0].bookingFileName).toBe('conferma.pdf')
    expect(exported.items[0].id).toBeUndefined()
  })
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/data/schema.test.js`
Expected: 3 FAIL — `bookingFilePath`/`bookingFileName` sono `undefined`, non le stringhe attese.

- [ ] **Step 3: Implementazione minima**

In `src/data/schema.js`, dentro `normalizeLodgingItem` (riga 114-129), aggiungi i due campi tra `bookingLink` e `note`:

```js
function normalizeLodgingItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    name: str(item.name),
    checkIn: str(item.checkIn),
    checkOut: str(item.checkOut),
    address: str(item.address),
    bookingLink: str(item.bookingLink),
    lat: toCoord(item.lat),
    lng: toCoord(item.lng),
    bookingFilePath: str(item.bookingFilePath),
    bookingFileName: str(item.bookingFileName),
    note: str(item.note),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}
```

Nessuna modifica a `exportTrip`: la sezione `lodging` usa già il percorso generico (`items.map(withoutId)`), che porta i nuovi campi in export senza codice dedicato.

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/data/schema.test.js`
Expected: tutti PASS (nessuna regressione sui test esistenti).

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/data/schema.test.js
git commit -m "aggiungi bookingFilePath/bookingFileName all'item Pernottamento"
```

---

### Task 2: Migrazione Supabase — bucket Storage e policy

**Files:**
- Create: `supabase/sql/0003_trip_attachments_storage.sql`

**Interfaces:**
- Produces: bucket privato `trip-attachments` (limite 20 MB, solo `application/pdf`); policy `trip_attachments_select`/`trip_attachments_insert`/`trip_attachments_delete` su `storage.objects`, che riusano `is_trip_member(uuid)`/`is_trip_editor(uuid)` già definite in `0001_cloud_schema.sql`.

- [ ] **Step 1: Crea il file di migrazione**

```sql
-- Bucket privato per gli allegati PDF delle prenotazioni. Path degli oggetti:
-- <id-viaggio-su-tv_trips>/<uuid>.pdf — il primo segmento del path è l'id del
-- viaggio, usato dalle policy sotto per verificare la membership senza
-- duplicare logica: riusa is_trip_member/is_trip_editor già definite in
-- 0001_cloud_schema.sql per rompere la ricorsione tra le policy di
-- tv_trips/tv_trip_members.

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

- [ ] **Step 2: Commit del file**

```bash
git add supabase/sql/0003_trip_attachments_storage.sql
git commit -m "aggiungi la migrazione per il bucket Storage degli allegati Pernottamento"
```

- [ ] **Step 3: Applicazione manuale (non automatizzata da questo piano)**

Questa SQL non viene eseguita da chi implementa il piano: va applicata dal
proprietario del progetto Supabase dalla dashboard (SQL editor) o con
`supabase db push`, come da vincolo del progetto (niente stack locale via
Docker). **Le verifiche manuali del Task 7 richiedono che questa migrazione
sia già applicata** — se non lo è ancora, segnalarlo esplicitamente prima di
procedere con quel task.

---

### Task 3: Funzioni Storage in `data/sync.js`

**Files:**
- Modify: `src/data/sync.js` (aggiungere in fondo al file, dopo `restoreLastVersion`)
- Test: `src/data/sync.test.js`

**Interfaces:**
- Consumes: `supabase` da `./supabase.js` (già importato in questo file); atteso `supabase.storage.from(bucket).upload/remove/createSignedUrl`.
- Produces:
  - `uploadLodgingAttachment(remoteId: string, file: File|Blob): Promise<string>` — carica il file, torna il path creato.
  - `removeLodgingAttachment(path: string): Promise<void>`
  - `getAttachmentSignedUrl(path: string): Promise<string>`
  - Tutte e tre lanciano `Error` con `error.message` di Supabase in caso di fallimento.

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in fondo a `src/data/sync.test.js` (il file già mocka `supabase.from`/`supabase.rpc` via `vi.mock('./supabase.js', ...)`; estendi quel mock con `storage.from`):

```js
describe('uploadLodgingAttachment / removeLodgingAttachment / getAttachmentSignedUrl', () => {
  it('uploadLodgingAttachment carica sul path <remoteId>/<uuid>.pdf e lo ritorna', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const storageFrom = vi.fn().mockReturnValue({ upload })
    supabase.storage = { from: storageFrom }

    const { uploadLodgingAttachment } = await import('./sync.js')
    const file = new Blob(['contenuto'], { type: 'application/pdf' })
    const path = await uploadLodgingAttachment('trip-remote-1', file)

    expect(storageFrom).toHaveBeenCalledWith('trip-attachments')
    expect(path).toMatch(/^trip-remote-1\/[0-9a-f-]{36}\.pdf$/)
    expect(upload).toHaveBeenCalledWith(path, file, { contentType: 'application/pdf' })
  })

  it('uploadLodgingAttachment propaga l\'errore di Supabase', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'bucket pieno' } })
    supabase.storage = { from: vi.fn().mockReturnValue({ upload }) }

    const { uploadLodgingAttachment } = await import('./sync.js')
    await expect(uploadLodgingAttachment('trip-remote-1', new Blob())).rejects.toThrow('bucket pieno')
  })

  it('removeLodgingAttachment cancella il path indicato', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null })
    const storageFrom = vi.fn().mockReturnValue({ remove })
    supabase.storage = { from: storageFrom }

    const { removeLodgingAttachment } = await import('./sync.js')
    await removeLodgingAttachment('trip-remote-1/abc.pdf')

    expect(storageFrom).toHaveBeenCalledWith('trip-attachments')
    expect(remove).toHaveBeenCalledWith(['trip-remote-1/abc.pdf'])
  })

  it('getAttachmentSignedUrl torna l\'URL firmato', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://x/signed' }, error: null })
    supabase.storage = { from: vi.fn().mockReturnValue({ createSignedUrl }) }

    const { getAttachmentSignedUrl } = await import('./sync.js')
    const url = await getAttachmentSignedUrl('trip-remote-1/abc.pdf')

    expect(url).toBe('https://x/signed')
    expect(createSignedUrl).toHaveBeenCalledWith('trip-remote-1/abc.pdf', 120)
  })
})
```

Questo test importa `supabase` direttamente: aggiungi in cima al file, vicino
agli altri import del blocco mockato, `const { supabase } = await import('./supabase.js')` (subito dopo la riga `vi.mock('./supabase.js', ...)` esistente, prima di `const { activateTripSync, ... } = await import('./sync.js')`).

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/data/sync.test.js`
Expected: 4 FAIL — `uploadLodgingAttachment`/`removeLodgingAttachment`/`getAttachmentSignedUrl` non sono funzioni esportate.

- [ ] **Step 3: Implementazione minima**

Aggiungi in fondo a `src/data/sync.js`, dopo `restoreLastVersion`:

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

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/data/sync.test.js`
Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/sync.js src/data/sync.test.js
git commit -m "aggiungi upload/rimozione/URL firmato per gli allegati su Supabase Storage"
```

---

### Task 4: Cache locale — `data/attachments.js`

**Files:**
- Create: `src/data/attachments.js`
- Test: `src/data/attachments.test.js`

**Interfaces:**
- Consumes: `get`/`set`/`del` da `idb-keyval`.
- Produces:
  - `getCachedAttachment(path: string): Promise<Blob|null>`
  - `setCachedAttachment(path: string, blob: Blob): Promise<void>`
  - `removeCachedAttachment(path: string): Promise<void>`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/data/attachments.test.js`, stesso pattern di mock già usato in `src/data/storage.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }))

import { get, set, del } from 'idb-keyval'
import { getCachedAttachment, setCachedAttachment, removeCachedAttachment } from './attachments.js'

beforeEach(() => {
  get.mockReset()
  set.mockReset()
  del.mockReset()
})

describe('getCachedAttachment', () => {
  it('legge con la chiave wego:attachment:<path> e torna null se assente', async () => {
    get.mockResolvedValue(undefined)
    const result = await getCachedAttachment('trip-1/abc.pdf')
    expect(get).toHaveBeenCalledWith('wego:attachment:trip-1/abc.pdf')
    expect(result).toBeNull()
  })

  it('torna il blob salvato quando presente', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    get.mockResolvedValue(blob)
    const result = await getCachedAttachment('trip-1/abc.pdf')
    expect(result).toBe(blob)
  })
})

describe('setCachedAttachment', () => {
  it('scrive con la chiave wego:attachment:<path>', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    await setCachedAttachment('trip-1/abc.pdf', blob)
    expect(set).toHaveBeenCalledWith('wego:attachment:trip-1/abc.pdf', blob)
  })
})

describe('removeCachedAttachment', () => {
  it('cancella con la chiave wego:attachment:<path>', async () => {
    await removeCachedAttachment('trip-1/abc.pdf')
    expect(del).toHaveBeenCalledWith('wego:attachment:trip-1/abc.pdf')
  })
})
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/data/attachments.test.js`
Expected: FAIL — `src/data/attachments.js` non esiste ancora (errore di import/modulo non trovato).

- [ ] **Step 3: Implementazione minima**

Crea `src/data/attachments.js`:

```js
import { get, set, del } from 'idb-keyval'

const PREFIX = 'wego:attachment:'

// Cache locale dei blob PDF già aperti almeno una volta, separata dal
// documento del viaggio (wego:trips): un allegato scaricato non deve
// gonfiare né rallentare il salvataggio del viaggio.
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

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/data/attachments.test.js`
Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/attachments.js src/data/attachments.test.js
git commit -m "aggiungi la cache locale dei PDF allegati"
```

---

### Task 5: `TripView.jsx` — inoltra `syncState` e `onOpenActivate` a `Section`

**Files:**
- Modify: `src/views/TripView.jsx:332`

**Interfaces:**
- Consumes: `syncState` (stato locale già esistente in `TripView`, riga 31), `activateOpen`/`setActivateOpen` (righe 33, 284).
- Produces: `Section` riceve ora due prop in più: `syncState` (l'oggetto stato di sync così com'è, o `null`), `onOpenActivate: () => void`.

- [ ] **Step 1: Modifica la riga di rendering di `Section`**

In `src/views/TripView.jsx`, riga 332, sostituisci:

```jsx
        {trip.sections.map((section) => (currentTab === section.id ? <Section key={section.id} trip={trip} section={section} onUpdate={handleUpdate} activeDisplayName={cloudDisplayName} onNavigate={setActiveTab} /> : null))}
```

con:

```jsx
        {trip.sections.map((section) => (currentTab === section.id ? (
          <Section
            key={section.id}
            trip={trip}
            section={section}
            onUpdate={handleUpdate}
            activeDisplayName={cloudDisplayName}
            onNavigate={setActiveTab}
            syncState={syncState}
            onOpenActivate={() => setActivateOpen(true)}
          />
        ) : null))}
```

- [ ] **Step 2: Verifica che il progetto compili**

Run: `npm run build`
Expected: build pulita, nessun errore (`Section` ancora non usa le nuove prop, React ignora prop extra senza problemi).

- [ ] **Step 3: Commit**

```bash
git add src/views/TripView.jsx
git commit -m "inoltra syncState e onOpenActivate a Section"
```

---

### Task 6: `Section.jsx` — inoltra `remoteId`/`role`/`onOpenActivate` a `Lodging`

**Files:**
- Modify: `src/views/Section.jsx:26`, `src/views/Section.jsx:186`

**Interfaces:**
- Consumes: `syncState`, `onOpenActivate` (da Task 5).
- Produces: `Lodging` riceve tre prop in più: `remoteId: string|null`, `role: 'editor'|'viewer'|null`, `onOpenActivate: () => void`.

- [ ] **Step 1: Aggiungi le due prop ai parametri di `Section`**

Riga 26, sostituisci:

```jsx
export default function Section({ trip, section, onUpdate, activeDisplayName, onNavigate }) {
```

con:

```jsx
export default function Section({ trip, section, onUpdate, activeDisplayName, onNavigate, syncState, onOpenActivate }) {
```

- [ ] **Step 2: Inoltra a `Lodging`**

Riga 186, sostituisci:

```jsx
      {section.type === 'lodging' && <Lodging trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={activeDisplayName} />}
```

con:

```jsx
      {section.type === 'lodging' && (
        <Lodging
          trip={trip}
          section={section}
          onUpdate={onUpdate}
          activeDisplayName={activeDisplayName}
          remoteId={syncState?.remoteId ?? null}
          role={syncState?.role ?? null}
          onOpenActivate={onOpenActivate}
        />
      )}
```

- [ ] **Step 3: Verifica che il progetto compili**

Run: `npm run build`
Expected: build pulita.

- [ ] **Step 4: Commit**

```bash
git add src/views/Section.jsx
git commit -m "inoltra remoteId/role/onOpenActivate a Lodging"
```

---

### Task 7: `Lodging.jsx` — controllo di upload, apertura, pulizia

**Files:**
- Modify: `src/views/Lodging.jsx` (intero file — vedi step per posizione esatta)

**Interfaces:**
- Consumes: `uploadLodgingAttachment`, `removeLodgingAttachment`, `getAttachmentSignedUrl` (da `../data/sync.js`, Task 3); `getCachedAttachment`, `setCachedAttachment`, `removeCachedAttachment` (da `../data/attachments.js`, Task 4); prop `remoteId`, `role`, `onOpenActivate` (da Task 6).
- Produces: nessuna nuova interfaccia esterna — è la vista finale.

- [ ] **Step 1: Import e hook `useOnlineStatus` locale**

In cima a `src/views/Lodging.jsx`, sostituisci le righe 1-11 con:

```jsx
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Bed, FileText } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
import CoordsInput from '../components/CoordsInput.jsx'
import { uploadLodgingAttachment, removeLodgingAttachment, getAttachmentSignedUrl } from '../data/sync.js'
import { getCachedAttachment, setCachedAttachment, removeCachedAttachment } from '../data/attachments.js'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { name: '', checkIn: '', checkOut: '', address: '', bookingLink: '', lat: null, lng: null, bookingFilePath: '', bookingFileName: '', note: '' }
const MAX_FILE_BYTES = 20 * 1024 * 1024

// Stesso hook, non condiviso, già usato in MapSection.jsx: duplicare tre
// righe è più semplice che introdurre un import incrociato tra viste per
// una funzione così piccola (stesso criterio già scelto per formatDate
// nella spec della mappa aggregata).
function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    function goOnline() { setOnline(true) }
    function goOffline() { setOnline(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return online
}

async function openAttachment(path) {
  let blob = await getCachedAttachment(path)
  if (!blob) {
    const signedUrl = await getAttachmentSignedUrl(path)
    const response = await fetch(signedUrl)
    blob = await response.blob()
    await setCachedAttachment(path, blob)
  }
  const objectUrl = URL.createObjectURL(blob)
  window.open(objectUrl, '_blank')
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
}
```

- [ ] **Step 2: Estendi la firma del componente e aggiungi lo stato di upload**

Sostituisci (riga, ora spostata dopo le aggiunte sopra, ma identificabile dal testo):

```jsx
export default function Lodging({ trip, section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)
```

con:

```jsx
export default function Lodging({ trip, section, onUpdate, activeDisplayName, remoteId, role, onOpenActivate }) {
  const [form, setForm] = useState(null)
  const [uploadState, setUploadState] = useState({ status: 'idle', error: '' })
  const [openError, setOpenError] = useState('')
  const online = useOnlineStatus()
```

- [ ] **Step 3: Gestione file — selezione, validazione, upload, sostituzione**

Aggiungi, dopo la funzione `removeItem` esistente (dopo il suo blocco di chiusura `}`):

```jsx
  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf || file.size > MAX_FILE_BYTES) {
      setUploadState({ status: 'idle', error: 'Puoi allegare solo un file PDF, fino a 20 MB.' })
      return
    }

    setUploadState({ status: 'uploading', error: '' })
    const previousPath = form.bookingFilePath
    try {
      const path = await uploadLodgingAttachment(remoteId, file)
      await setCachedAttachment(path, file)
      if (previousPath) {
        removeLodgingAttachment(previousPath).catch(() => {})
        removeCachedAttachment(previousPath).catch(() => {})
      }
      setForm((f) => ({ ...f, bookingFilePath: path, bookingFileName: file.name }))
      setUploadState({ status: 'idle', error: '' })
    } catch (err) {
      setUploadState({ status: 'idle', error: 'Il caricamento non è riuscito. Controlla la rete e riprova.' })
    }
  }

  function removeAttachmentFromForm() {
    const path = form.bookingFilePath
    if (path) {
      removeLodgingAttachment(path).catch(() => {})
      removeCachedAttachment(path).catch(() => {})
    }
    setForm((f) => ({ ...f, bookingFilePath: '', bookingFileName: '' }))
  }

  async function handleOpenAttachment(path) {
    setOpenError('')
    try {
      await openAttachment(path)
    } catch {
      setOpenError(online
        ? 'Non riesco ad aprire il PDF. Controlla la rete e riprova.'
        : 'Questo PDF non è ancora scaricato su questo telefono: serve la connessione la prima volta.')
    }
  }
```

- [ ] **Step 4: Pulizia dell'allegato quando si elimina l'intero alloggio**

Sostituisci la funzione `removeItem` esistente:

```jsx
  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.name}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }
```

con:

```jsx
  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.name}"? Non si può annullare.`)) {
      if (item.bookingFilePath) {
        removeLodgingAttachment(item.bookingFilePath).catch(() => {})
        removeCachedAttachment(item.bookingFilePath).catch(() => {})
      }
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }
```

- [ ] **Step 5: Link "Apri il PDF della prenotazione" nella card**

Nel blocco di rendering di ogni item (dopo il link `bookingLink` esistente, prima di `<ModifiedBy .../>`), aggiungi:

```jsx
            {item.bookingFilePath && (
              <button
                type="button"
                onClick={() => handleOpenAttachment(item.bookingFilePath)}
                className="flex items-center gap-1.5 text-base text-[var(--accent)] underline mt-2"
              >
                <FileText size={15} /> Apri il PDF della prenotazione
              </button>
            )}
```

Questo bottone chiama `handleOpenAttachment`, che oggi è definita dentro il
componente ma non dipende da `form`: nessun problema a chiamarla anche fuori
dal modale di modifica.

- [ ] **Step 6: Il controllo nel form — quattro stati**

Nel form (dentro `<Modal>`), dopo il campo "Link prenotazione" e prima della
`<textarea placeholder="Nota" ...>`, aggiungi:

```jsx
            {!remoteId && (
              <div className="flex flex-col gap-2 rounded-2xl border border-[var(--line)] p-4">
                <p className="text-sm text-[var(--muted)]">Attiva la sincronizzazione per allegare documenti.</p>
                <Btn type="button" variant="secondary" onClick={onOpenActivate} className="self-start">Attiva la sincronizzazione</Btn>
              </div>
            )}

            {remoteId && role === 'viewer' && form.bookingFileName && (
              <p className="text-sm text-[var(--muted)]">Allegato: {form.bookingFileName}</p>
            )}

            {remoteId && role === 'editor' && (
              <div className="flex flex-col gap-2">
                <label className="text-sm text-[var(--muted)]">
                  {form.bookingFileName ? `Allegato: ${form.bookingFileName}` : 'Nessun PDF allegato'}
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={!online || uploadState.status === 'uploading'}
                  onChange={handleFileChange}
                  className={inputClass}
                />
                {!online && <p className="text-sm text-[var(--muted)]">Serve la connessione per allegare un documento.</p>}
                {uploadState.status === 'uploading' && <p className="text-sm text-[var(--muted)]">Caricamento…</p>}
                {uploadState.error && <p className="text-sm text-[var(--accent)]">{uploadState.error}</p>}
                {form.bookingFilePath && (
                  <Btn type="button" variant="secondary" onClick={removeAttachmentFromForm} className="self-start">Rimuovi PDF</Btn>
                )}
              </div>
            )}

            {openError && <p className="text-sm text-[var(--accent)]">{openError}</p>}
```

- [ ] **Step 7: Verifica che il progetto compili**

Run: `npm run build`
Expected: build pulita, nessun errore.

- [ ] **Step 8: Verifica manuale end-to-end**

Prerequisito: la migrazione del Task 2 deve essere già applicata sul
progetto Supabase (bucket `trip-attachments` + policy). Se non lo è,
applicarla prima di continuare (dashboard Supabase → SQL editor, o
`supabase db push`).

`npm run build && npm run preview`, su un viaggio con sincronizzazione già
attiva (o attivala dal flusso esistente):

1. Apri un alloggio, ruolo editor, online → il campo "Allega PDF" è attivo.
2. Seleziona un PDF valido (< 20 MB) → "Caricamento…" poi il nome file
   compare come allegato; salva il form.
3. Nella card dell'alloggio compare "Apri il PDF della prenotazione" → click
   apre il PDF in una nuova scheda.
4. Prova un file non-PDF e uno oltre 20 MB → messaggio d'errore corretto,
   nessuna chiamata di rete (verificabile in DevTools → Network).
5. DevTools → Network → Offline, riapri lo stesso PDF già aperto al passo 3
   → si apre comunque, dalla cache locale.
6. Ancora offline, prova ad allegarne uno nuovo → controllo disabilitato,
   nota "Serve la connessione per allegare un documento."
7. Torna online. Su un viaggio **senza** sincronizzazione attiva → il campo
   mostra l'invito ad attivarla; il bottone apre `ActivateSyncModal`.
8. Se hai un secondo account/dispositivo con ruolo viewer su un viaggio
   sincronizzato: il PDF già allegato resta apribile, nessun controllo di
   upload visibile.
9. Sostituisci un PDF già allegato con uno nuovo, poi elimina l'alloggio →
   dalla dashboard Supabase → Storage → bucket `trip-attachments`, verifica
   che gli oggetti vecchi (quello sostituito e quello dell'alloggio
   eliminato) non ci siano più.

- [ ] **Step 9: Commit**

```bash
git add src/views/Lodging.jsx
git commit -m "aggiungi allegato PDF della prenotazione a Pernottamento"
```
