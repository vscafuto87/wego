# Dashboard admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere una dashboard admin (`/admin`) per creare e modificare comodamente da desktop tutto ciò che è visibile in un viaggio WeGo — metadati, persone, giorni/itinerario e tutte e sei le sezioni.

**Architecture:** Nuova cartella `src/admin/`, montata da `App.jsx` quando `pathname === '/admin'`, parallela al routing di stato esistente (`home | trip | import`). Riusa integralmente il layer dati esistente (`schema.js`, `storage.js`, `sync.js`) — nessun nuovo formato, nessuna migrazione. Una piccola estensione a `sync.js` propaga `owner_id` (già in `tv_trips`) dentro `syncState` locale, per il controllo "solo il proprietario può modificare da qui" sui viaggi sincronizzati.

**Tech Stack:** React 18 + JavaScript, Tailwind, idb-keyval, @supabase/supabase-js — stessa dotazione del resto del progetto, nessuna dipendenza nuova.

**Spec:** [docs/superpowers/specs/2026-08-19-dashboard-admin-design.md](../specs/2026-08-19-dashboard-admin-design.md)

## Correzioni rispetto alla spec (emerse scrivendo il piano)

1. **Niente login bloccante in `/admin`.** La spec descriveva un gate di login globale prima della lista viaggi. Questo va contro il principio "local-first" bloccato in CLAUDE.md ("l'app funziona per intero senza account... nessuna schermata di login bloccante"). La lista viaggi e la creazione restano sempre accessibili senza login; il login serve solo quando si apre un viaggio **sincronizzato** (per verificarne il proprietario) — è lì che compare `MagicLinkForm`, esattamente come oggi `ActivateSyncModal`/`JoinView` lo mostrano solo quando serve.
2. **Viaggio sincronizzato di cui non sei proprietario:** invece di costruire una variante "sola lettura" di ognuno degli 8 editor, `AdminTripEditor` mostra un messaggio che spiega la situazione e un modo per tornare alla lista — non li nasconde dalla lista, ma non offre nemmeno una vista parallela di sola lettura (l'app stessa è già quel posto).
3. **Niente modulo condiviso per aggiungi/rimuovi-sezione.** La spec proponeva di estrarre la logica da `Overview.jsx` in un modulo comune. Il codice esistente duplica già `isFixedSection` identica in `Overview.jsx` e `Section.jsx` (non è mai stata estratta): per coerenza con questo stile già in uso, la dashboard duplica la stessa funzione invece di introdurre una nuova astrazione condivisa.

## Global Constraints

- Niente TypeScript: solo JavaScript (Vite + React 18).
- Niente dipendenze nuove: solo React, Tailwind, lucide-react, idb-keyval, @supabase/supabase-js, leaflet, react-leaflet (già in `package.json`) — nessuna di queste task ne aggiunge.
- Niente router: il routing verso `/admin` usa lo stesso pattern già in `App.jsx` per `/j/CODE` (regex su `window.location.pathname`).
- Un componente per file, nessun file oltre ~250 righe.
- Copy in italiano, tono piano, seconda persona; errori diretti senza scusarsi.
- `schema.js` (`normalizeTrip`/`exportTrip`) non cambia: stesso identico formato dati per stato in memoria, IndexedDB, import/export e Supabase.
- Test automatici solo per la logica non-UI (le modifiche a `sync.js`); i componenti vista nuovi si verificano a mano con `npm run build && npm run preview`, come già oggi per il resto dell'app.
- Layout `/admin` non è mobile-first: larghezza propria (`max-w-5xl` o simile), non vincolata al `max-w-2xl` del resto dell'app — quel vincolo resta invariato per le viste da viaggio esistenti.

---

## Task 1: `ownerId` in `syncState` (sync.js)

**Files:**
- Modify: `src/data/sync.js`
- Test: `src/data/sync.test.js`

**Interfaces:**
- Produces: `activateTripSync(trip, displayName)` → aggiunge `ownerId: session.user.id` all'oggetto restituito.
- Produces: `pullTrip(syncState)` → `result.syncState` include ora `ownerId` letto da `tv_trips.owner_id`.
- Produces: `joinTripByCode(code, displayName)` → `result.syncState` include ora `ownerId` letto da `tv_trips.owner_id`.
- Produces: `fetchTripOwnerId(remoteId): Promise<string>` — nuova funzione, legge solo `owner_id` per un viaggio remoto, usata dalla dashboard per completare un `syncState` salvato prima di questa modifica (che non ha ancora `ownerId`).

- [ ] **Step 1: Estendi i test esistenti per `activateTripSync`, `pullTrip`, `joinTripByCode` e aggiungi il test per `fetchTripOwnerId`**

In `src/data/sync.test.js`, sostituisci il blocco `describe('activateTripSync', ...)`:

```js
describe('activateTripSync', () => {
  it('crea la riga tv_trips e la membership owner, torna remoteId/shareCode/ownerId', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
    const insertTrip = vi.fn().mockReturnValue({
      select: () => ({ single: async () => ({ data: { id: 'trip-remote-1', share_code: 'AB12CD', updated_at: '2026-08-18T10:00:00Z' }, error: null }) })
    })
    const insertMember = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation((table) => {
      if (table === 'tv_trips') return { insert: insertTrip }
      if (table === 'tv_trip_members') return { insert: insertMember }
      throw new Error(`tabella inattesa: ${table}`)
    })

    const trip = normalizeTrip({ name: 'Ponza' })
    const result = await activateTripSync(trip, 'Vincenzo')

    expect(result).toEqual({ remoteId: 'trip-remote-1', shareCode: 'AB12CD', lastSyncedAt: '2026-08-18T10:00:00Z', role: 'editor', dirty: false, ownerId: 'user-1' })
    expect(insertMember).toHaveBeenCalledWith({ trip_id: 'trip-remote-1', user_id: 'user-1', role: 'editor', display_name: 'Vincenzo' })
  })

  it('rifiuta se non c\'è una sessione', async () => {
    mockGetSession.mockResolvedValue(null)
    const trip = normalizeTrip({ name: 'Ponza' })
    await expect(activateTripSync(trip, 'Vincenzo')).rejects.toThrow()
  })
})
```

Sostituisci il blocco `describe('pullTrip', ...)`:

```js
describe('pullTrip', () => {
  it('normalizza il viaggio remoto, aggiorna lastSyncedAt e ownerId', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { data: { name: 'Ponza' }, updated_at: '2026-08-18T12:00:00Z', owner_id: 'user-1' }, error: null }) }) })
    })
    const syncState = { remoteId: 'trip-remote-1', role: 'viewer', lastSyncedAt: '2026-08-18T10:00:00Z', dirty: false }
    const result = await pullTrip(syncState)
    expect(result.trip.name).toBe('Ponza')
    expect(result.syncState).toEqual({ ...syncState, lastSyncedAt: '2026-08-18T12:00:00Z', dirty: false, ownerId: 'user-1' })
  })
})
```

Sostituisci il blocco `describe('joinTripByCode', ...)`:

```js
describe('joinTripByCode', () => {
  it('chiama la RPC join_trip poi legge il viaggio, torna ruolo viewer e ownerId', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-2' } })
    mockRpc.mockResolvedValue({ data: 'trip-remote-1', error: null })
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'trip-remote-1', data: { name: 'Ponza' }, updated_at: '2026-08-18T10:00:00Z', owner_id: 'user-1' }, error: null }) }) })
    })
    const { joinTripByCode } = await import('./sync.js')
    const result = await joinTripByCode('AB12CD', 'Giulia')
    expect(mockRpc).toHaveBeenCalledWith('join_trip', { code: 'AB12CD', display_name: 'Giulia' })
    expect(result.trip.name).toBe('Ponza')
    expect(result.syncState).toEqual({ remoteId: 'trip-remote-1', role: 'viewer', lastSyncedAt: '2026-08-18T10:00:00Z', dirty: false, ownerId: 'user-1' })
  })
})
```

Aggiungi, dopo il blocco `describe('restoreLastVersion', ...)`, un nuovo blocco:

```js
describe('fetchTripOwnerId', () => {
  it('legge solo owner_id per il viaggio remoto', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { owner_id: 'user-9' }, error: null }) }) })
    })
    const { fetchTripOwnerId } = await import('./sync.js')
    expect(await fetchTripOwnerId('trip-remote-1')).toBe('user-9')
  })

  it('rilancia l\'errore Supabase come Error leggibile', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'non trovato' } }) }) })
    })
    const { fetchTripOwnerId } = await import('./sync.js')
    await expect(fetchTripOwnerId('trip-remote-1')).rejects.toThrow('non trovato')
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano nel modo atteso**

Run: `npm test -- sync.test.js`
Expected: FAIL — `ownerId` mancante nei risultati attesi, e `fetchTripOwnerId` non è una funzione esportata.

- [ ] **Step 3: Aggiorna `src/data/sync.js`**

In `activateTripSync`, nel ramo di successo dell'inserimento, aggiungi `ownerId: session.user.id` all'oggetto restituito:

```js
if (!error) {
  const { error: memberError } = await supabase
    .from('tv_trip_members')
    .insert({ trip_id: data.id, user_id: session.user.id, role: 'editor', display_name: displayName })
  if (memberError) throw new Error(memberError.message)
  return { remoteId: data.id, shareCode: data.share_code, lastSyncedAt: data.updated_at, role: 'editor', dirty: false, ownerId: session.user.id }
}
```

Sostituisci `pullTrip`:

```js
export async function pullTrip(syncState) {
  const { data: row, error } = await supabase
    .from('tv_trips')
    .select('data, updated_at, owner_id')
    .eq('id', syncState.remoteId)
    .single()
  if (error) throw new Error(error.message)
  return {
    trip: normalizeTrip(row.data),
    syncState: { ...syncState, lastSyncedAt: row.updated_at, dirty: false, ownerId: row.owner_id }
  }
}
```

Sostituisci `joinTripByCode`:

```js
export async function joinTripByCode(code, displayName) {
  const session = await getSession()
  if (!session) throw new Error('Devi accedere prima di unirti al viaggio.')

  const { data: remoteId, error: rpcError } = await supabase.rpc('join_trip', { code, display_name: displayName })
  if (rpcError) throw new Error(rpcError.message)

  const { data: row, error: selectError } = await supabase
    .from('tv_trips')
    .select('id, data, updated_at, owner_id')
    .eq('id', remoteId)
    .single()
  if (selectError) throw new Error(selectError.message)

  return {
    trip: normalizeTrip(row.data),
    syncState: { remoteId: row.id, role: 'viewer', lastSyncedAt: row.updated_at, dirty: false, ownerId: row.owner_id }
  }
}
```

Aggiungi, dopo `restoreLastVersion`, la nuova funzione:

```js
export async function fetchTripOwnerId(remoteId) {
  const { data, error } = await supabase
    .from('tv_trips')
    .select('owner_id')
    .eq('id', remoteId)
    .single()
  if (error) throw new Error(error.message)
  return data.owner_id
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- sync.test.js`
Expected: PASS, tutti i test verdi.

- [ ] **Step 5: Esegui l'intera suite per assicurarti di non aver rotto altro**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/sync.js src/data/sync.test.js
git commit -m "Propaga owner_id del viaggio dentro syncState"
```

---

## Task 2: Routing `/admin` + lista/creazione viaggi (`AdminApp`, `AdminTripList`)

**Files:**
- Create: `src/admin/AdminApp.jsx`
- Create: `src/admin/AdminTripList.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `loadTrips()`, `saveTrips(trips)` da `src/data/storage.js` (firme invariate); `normalizeTrip(raw)` da `src/data/schema.js`.
- Produces: `AdminApp` — nessuna prop, componente montato da `App.jsx`. Gestisce internamente `trips` e il viaggio selezionato.
- Produces: `AdminTripList({ trips, onSelect(id), onCreate(raw) })` — lista + pannello di creazione persistente.

- [ ] **Step 1: Crea `src/admin/AdminTripList.jsx`**

```jsx
import { useState } from 'react'
import { Plus } from 'lucide-react'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { name: '', emoji: '', place: '', start: '', end: '', palette: 'mountain', people: '' }

function formatRange(start, end) {
  if (!start || !end) return ''
  return `${start} → ${end}`
}

export default function AdminTripList({ trips, onSelect, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM)

  function submit(e) {
    e.preventDefault()
    onCreate({ ...form, people: form.people.split(',').map((p) => p.trim()).filter(Boolean) })
    setForm(EMPTY_FORM)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="font-display font-semibold text-4xl mb-6">Dashboard admin</h1>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="flex flex-col divide-y divide-[var(--line)] bg-[var(--card)] rounded-2xl border border-[var(--line)] overflow-hidden">
          {trips.length === 0 && <p className="px-5 py-6 text-base text-[var(--muted)]">Nessun viaggio ancora: creane uno dal pannello a destra.</p>}
          {trips.map((trip) => (
            <button key={trip.id} onClick={() => onSelect(trip.id)} className="text-left px-5 py-4 hover:bg-[var(--tint)] transition-colors">
              <span className="font-display font-semibold text-xl">{trip.emoji} {trip.name}</span>
              {trip.place && <span className="text-base text-[var(--muted)] ml-2">{trip.place}</span>}
              <p className="font-mono text-sm text-[var(--muted)] mt-1">{formatRange(trip.start, trip.end) || 'Date da definire'}</p>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
          <h2 className="font-display font-semibold text-xl mb-1">Nuovo viaggio</h2>
          <input required placeholder="Nome del viaggio" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          <input placeholder="Emoji" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className={inputClass} />
          <input placeholder="Luogo" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} className={inputClass} />
          <div className="flex gap-2">
            <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={`flex-1 ${inputClass}`} />
            <input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={`flex-1 ${inputClass}`} />
          </div>
          <select value={form.palette} onChange={(e) => setForm({ ...form, palette: e.target.value })} className={inputClass}>
            <option value="mountain">Montagna</option>
            <option value="sea">Mare</option>
            <option value="city">Città</option>
            <option value="wild">Natura</option>
          </select>
          <input placeholder="Persone (separate da virgola)" value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} className={inputClass} />
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={17} /> Crea il viaggio
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crea `src/admin/AdminApp.jsx`**

```jsx
import { useCallback, useEffect, useState } from 'react'
import { loadTrips, saveTrips } from '../data/storage.js'
import { normalizeTrip } from '../data/schema.js'
import AdminTripList from './AdminTripList.jsx'
import AdminTripEditor from './AdminTripEditor.jsx'

export default function AdminApp() {
  const [trips, setTrips] = useState(null)
  const [activeTripId, setActiveTripId] = useState(null)

  useEffect(() => {
    loadTrips().then(setTrips)
  }, [])

  const persist = useCallback((next) => {
    setTrips(next)
    saveTrips(next)
  }, [])

  function createTrip(raw) {
    const trip = normalizeTrip(raw)
    persist([...trips, trip])
    setActiveTripId(trip.id)
  }

  function updateTrip(id, updater) {
    persist(trips.map((t) => (t.id === id ? updater(t) : t)))
  }

  function deleteTrip(id) {
    persist(trips.filter((t) => t.id !== id))
    setActiveTripId(null)
  }

  if (trips === null) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-[#6E7B72]">Carico i viaggi…</div>
  }

  if (activeTripId) {
    const trip = trips.find((t) => t.id === activeTripId)
    if (!trip) {
      setActiveTripId(null)
      return null
    }
    return (
      <AdminTripEditor
        trip={trip}
        onBack={() => setActiveTripId(null)}
        onUpdate={(updater) => updateTrip(trip.id, updater)}
        onDelete={() => deleteTrip(trip.id)}
      />
    )
  }

  return <AdminTripList trips={trips} onSelect={setActiveTripId} onCreate={createTrip} />
}
```

Nota: questo file importa `AdminTripEditor.jsx`, creato nel Task 3. Finché non esiste, il build fallisce: è previsto, il Task 3 lo crea subito dopo.

- [ ] **Step 3: Crea un placeholder minimo di `AdminTripEditor.jsx` così il progetto builda (verrà sostituito nel Task 3)**

```jsx
export default function AdminTripEditor({ trip, onBack }) {
  return (
    <div className="p-10">
      <button onClick={onBack}>← Tutti i viaggi</button>
      <p>{trip.name}</p>
    </div>
  )
}
```

Salva questo contenuto in `src/admin/AdminTripEditor.jsx`.

- [ ] **Step 4: Collega la rotta in `src/App.jsx`**

Aggiungi l'import in cima al file, insieme agli altri:

```js
import AdminApp from './admin/AdminApp.jsx'
```

Subito dopo la dichiarazione di `joinCode` (dopo il blocco `useState` che la calcola), aggiungi lo stesso pattern per `/admin`:

```js
const [isAdmin] = useState(() => window.location.pathname === '/admin')
```

Nel corpo del componente, prima del controllo `if (trips === null) { ... }`, aggiungi:

```js
if (isAdmin) {
  return <AdminApp />
}
```

Così `/admin` non aspetta il caricamento di `trips` in `App.jsx` (li carica per conto suo `AdminApp`), e nessuno degli effetti/gesture della vista da viaggio (swipe-back, tab bar) viene montato per la dashboard.

- [ ] **Step 5: Verifica manuale**

Run: `npm run dev`

In un browser:
1. Vai su `http://localhost:5173/admin` — deve apparire "Dashboard admin" con la lista dei viaggi seed (Dolomiti Friulane, Ponza) e il pannello "Nuovo viaggio" a destra.
2. Compila solo "Nome del viaggio" con "Prova" e clicca "Crea il viaggio" — deve apparire la vista placeholder con "← Tutti i viaggi" e "Prova".
3. Clicca "← Tutti i viaggi" — deve tornare alla lista, ora con "Prova" incluso.
4. Vai su `http://localhost:5173/` — l'app normale deve funzionare come prima (Home con i viaggi, incluso "Prova").

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/admin/AdminApp.jsx src/admin/AdminTripList.jsx src/admin/AdminTripEditor.jsx
git commit -m "Aggiungi rotta /admin con lista e creazione viaggi"
```

---

## Task 3: `AdminTripEditor` — struttura, permesso proprietario, navigazione sezioni

**Files:**
- Modify (sostituzione completa del placeholder): `src/admin/AdminTripEditor.jsx`

**Interfaces:**
- Consumes: `getSession`, `subscribeAuth` da `src/data/supabase.js`; `getSyncState`, `setSyncState`, `getDisplayNamePreference` da `src/data/storage.js`; `fetchTripOwnerId` da `src/data/sync.js` (Task 1); `MagicLinkForm` da `src/components/MagicLinkForm.jsx`.
- Produces: `AdminTripEditor({ trip, onBack(), onUpdate(updater), onDelete() })`. Passa `activeDisplayName` (stringa, eventualmente vuota) ai figli dei prossimi task (`AdminMetaForm`, `AdminDaysEditor`, `AdminSectionEditor`) esattamente come `TripView.jsx` fa oggi con `cloudDisplayName`.
- Section shape prodotta da `addSection`: `{ id, title, icon, type, ...(type === 'notes' ? { text: '' } : { items: [] }) }` — identica a quella di `Overview.jsx`.

- [ ] **Step 1: Sostituisci `src/admin/AdminTripEditor.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Map, CheckSquare, StickyNote, Ticket, Utensils, Bed, Bus, Star, Users, CalendarDays, Info } from 'lucide-react'
import { getSession, subscribeAuth } from '../data/supabase.js'
import { getSyncState, setSyncState as persistSyncState, getDisplayNamePreference } from '../data/storage.js'
import { fetchTripOwnerId } from '../data/sync.js'
import MagicLinkForm from '../components/MagicLinkForm.jsx'
import AdminMetaForm from './AdminMetaForm.jsx'
import AdminDaysEditor from './AdminDaysEditor.jsx'
import AdminSectionEditor from './AdminSectionEditor.jsx'

const ICONS = { map: Map, check: CheckSquare, note: StickyNote, ticket: Ticket, food: Utensils, bed: Bed, bus: Bus, star: Star, people: Users }
const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

function isFixedSection(section) {
  if (section.type === 'transport' || section.type === 'lodging' || section.type === 'map') return true
  return section.type === 'cards' && section.title === 'Ristoranti'
}

export default function AdminTripEditor({ trip, onBack, onUpdate, onDelete }) {
  const [activeTab, setActiveTab] = useState('info')
  const [session, setSession] = useState(undefined)
  const [syncState, setSyncStateValue] = useState(undefined)
  const [displayName, setDisplayName] = useState('')
  const [sectionForm, setSectionForm] = useState(null)
  const [sectionError, setSectionError] = useState('')

  useEffect(() => {
    let cancelled = false
    getSession().then((s) => { if (!cancelled) setSession(s) })
    const unsubscribe = subscribeAuth((s) => { if (!cancelled) setSession(s) })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  useEffect(() => {
    let cancelled = false
    setSyncStateValue(undefined)
    getSyncState(trip.id).then(async (state) => {
      if (cancelled) return
      if (state && !state.ownerId) {
        try {
          const ownerId = await fetchTripOwnerId(state.remoteId)
          const next = { ...state, ownerId }
          await persistSyncState(trip.id, next)
          state = next
        } catch {
          // offline o remoto irraggiungibile: si riprova al prossimo apertura
        }
      }
      if (!cancelled) setSyncStateValue(state)
    })
    getDisplayNamePreference().then((name) => { if (!cancelled) setDisplayName(name) })
    return () => { cancelled = true }
  }, [trip.id])

  function addSection(e) {
    e.preventDefault()
    if (sectionForm.type === 'cards' && sectionForm.title.trim() === 'Ristoranti') {
      setSectionError('"Ristoranti" è già una sezione fissa: scegli un altro titolo.')
      return
    }
    const section = {
      id: crypto.randomUUID(),
      title: sectionForm.title,
      icon: sectionForm.icon,
      type: sectionForm.type,
      ...(sectionForm.type === 'notes' ? { text: '' } : { items: [] })
    }
    onUpdate((t) => ({ ...t, sections: [...t.sections, section] }))
    setSectionForm(null)
    setActiveTab(section.id)
  }

  function removeSection(section) {
    if (window.confirm(`Eliminare la sezione "${section.title}"? Non si può annullare.`)) {
      onUpdate((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== section.id) }))
      if (activeTab === section.id) setActiveTab('info')
    }
  }

  function removeTrip() {
    if (window.confirm(`Eliminare il viaggio "${trip.name}"? Non si può annullare.`)) {
      onDelete()
    }
  }

  // undefined = ancora in caricamento, null = nessuna sync (viaggio locale)
  const loadingOwnership = syncState === undefined || session === undefined
  const canEdit = loadingOwnership ? null : (!syncState || (session && syncState.ownerId === session.user.id))

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <button onClick={onBack} className="flex items-center gap-1.5 text-base text-[var(--muted)] mb-4">
        <ArrowLeft size={17} /> Tutti i viaggi
      </button>
      <h1 className="font-display font-semibold text-4xl mb-6">{trip.emoji} {trip.name}</h1>

      {loadingOwnership && <p className="text-base text-[var(--muted)]">Verifico chi può modificare questo viaggio…</p>}

      {!loadingOwnership && syncState && !session && (
        <div className="max-w-sm flex flex-col gap-3">
          <p className="text-base">Questo viaggio è sincronizzato: per modificarlo da qui devi prima accedere.</p>
          <MagicLinkForm />
        </div>
      )}

      {!loadingOwnership && (!syncState || session) && !canEdit && (
        <div className="max-w-md flex flex-col gap-3">
          <p className="text-base">
            Questo viaggio è sincronizzato da un altro account: da qui puoi solo vederne il nome, non modificarlo.
            Le modifiche restano possibili dall'app normale, secondo i permessi di editor/viewer già in uso.
          </p>
        </div>
      )}

      {!loadingOwnership && canEdit && (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
          <nav className="flex flex-col gap-1">
            <button onClick={() => setActiveTab('info')} className={`text-left px-3 py-2 rounded-lg flex items-center gap-2 ${activeTab === 'info' ? 'bg-[var(--tint)] font-medium' : ''}`}>
              <Info size={16} /> Info viaggio
            </button>
            <button onClick={() => setActiveTab('days')} className={`text-left px-3 py-2 rounded-lg flex items-center gap-2 ${activeTab === 'days' ? 'bg-[var(--tint)] font-medium' : ''}`}>
              <CalendarDays size={16} /> Giorni
            </button>
            {trip.sections.map((section) => {
              const Icon = ICONS[section.icon] ?? Star
              return (
                <div key={section.id} className={`flex items-center gap-1 rounded-lg ${activeTab === section.id ? 'bg-[var(--tint)]' : ''}`}>
                  <button onClick={() => setActiveTab(section.id)} className={`flex-1 text-left px-3 py-2 flex items-center gap-2 ${activeTab === section.id ? 'font-medium' : ''}`}>
                    <Icon size={16} /> {section.title || 'Sezione'}
                  </button>
                  {!isFixedSection(section) && (
                    <button onClick={() => removeSection(section)} aria-label={`Elimina ${section.title}`} className="mr-1 p-1.5 text-[var(--muted)]">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )
            })}
            <button onClick={() => { setSectionError(''); setSectionForm({ title: '', icon: 'star', type: 'cards' }) }} className="text-left px-3 py-2 rounded-lg flex items-center gap-2 text-[var(--accent)]">
              <Plus size={16} /> Aggiungi sezione
            </button>
            <hr className="border-[var(--line)] my-2" />
            <button onClick={removeTrip} className="text-left px-3 py-2 rounded-lg flex items-center gap-2 text-[var(--accent)]">
              <Trash2 size={16} /> Elimina viaggio
            </button>
          </nav>

          <div>
            {activeTab === 'info' && <AdminMetaForm trip={trip} onUpdate={onUpdate} />}
            {activeTab === 'days' && <AdminDaysEditor trip={trip} onUpdate={onUpdate} activeDisplayName={displayName} />}
            {trip.sections.map((section) =>
              activeTab === section.id ? (
                <AdminSectionEditor key={section.id} trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={displayName} />
              ) : null
            )}
          </div>
        </div>
      )}

      {sectionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSectionForm(null)}>
          <form onSubmit={addSection} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm flex flex-col gap-3 bg-[var(--card)] rounded-2xl p-5">
            <h2 className="font-display font-semibold text-xl">Nuova sezione</h2>
            <input required placeholder="Titolo" value={sectionForm.title} onChange={(e) => { setSectionError(''); setSectionForm({ ...sectionForm, title: e.target.value }) }} className={inputClass} />
            {sectionError && <p className="text-base text-[var(--accent)]">{sectionError}</p>}
            <select value={sectionForm.icon} onChange={(e) => setSectionForm({ ...sectionForm, icon: e.target.value })} className={inputClass}>
              {Object.keys(ICONS).map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
            <select value={sectionForm.type} onChange={(e) => setSectionForm({ ...sectionForm, type: e.target.value })} className={inputClass}>
              <option value="cards">Schede</option>
              <option value="checklist">Lista da spuntare</option>
              <option value="notes">Note</option>
            </select>
            <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
              Aggiungi sezione
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
```

Nota: questo file importa `AdminMetaForm.jsx`, `AdminDaysEditor.jsx` e `AdminSectionEditor.jsx`, creati nei task successivi. Finché non esistono, il build fallisce: previsto, sono i prossimi task.

- [ ] **Step 2: Crea placeholder minimi per sbloccare il build**

`src/admin/AdminMetaForm.jsx`:
```jsx
export default function AdminMetaForm({ trip }) {
  return <p>{trip.name}</p>
}
```

`src/admin/AdminDaysEditor.jsx`:
```jsx
export default function AdminDaysEditor({ trip }) {
  return <p>{trip.days.length} giorni</p>
}
```

`src/admin/AdminSectionEditor.jsx`:
```jsx
export default function AdminSectionEditor({ section }) {
  return <p>{section.title}</p>
}
```

- [ ] **Step 3: Verifica manuale**

Run: `npm run dev`, poi su `http://localhost:5173/admin`:
1. Apri un viaggio locale (seed, mai sincronizzato) — deve apparire subito la navigazione a sinistra (Info viaggio, Giorni, le sezioni) senza nessun prompt di login, coerente con "nessuna schermata di login bloccante".
2. Clicca "Aggiungi sezione", crea una sezione "Prova" di tipo "Lista da spuntare" — deve apparire in navigazione e diventare la tab attiva.
3. Clicca l'icona cestino sulla sezione "Prova" — deve chiedere conferma e poi sparire.
4. Clicca "Elimina viaggio" su un viaggio di prova (non uno dei due seed) — deve chiedere conferma, poi tornare alla lista.

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminTripEditor.jsx src/admin/AdminMetaForm.jsx src/admin/AdminDaysEditor.jsx src/admin/AdminSectionEditor.jsx
git commit -m "Aggiungi struttura e permesso proprietario alla dashboard admin"
```

---

## Task 4: `AdminMetaForm` — metadati viaggio e persone

**Files:**
- Modify (sostituzione del placeholder): `src/admin/AdminMetaForm.jsx`

**Interfaces:**
- Consumes: nessuna funzione nuova — solo `onUpdate(updater)` passato da `AdminTripEditor`.
- Produces: `AdminMetaForm({ trip, onUpdate(updater) })`, nessun valore di ritorno rilevante per altri task.

- [ ] **Step 1: Sostituisci `src/admin/AdminMetaForm.jsx`**

```jsx
import { useEffect, useState } from 'react'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

function fieldsFromTrip(trip) {
  return {
    name: trip.name,
    emoji: trip.emoji,
    place: trip.place,
    start: trip.start,
    end: trip.end,
    palette: trip.palette,
    people: trip.people.join(', ')
  }
}

export default function AdminMetaForm({ trip, onUpdate }) {
  const [form, setForm] = useState(() => fieldsFromTrip(trip))
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setForm(fieldsFromTrip(trip))
  }, [trip.id])

  function save(e) {
    e.preventDefault()
    const people = form.people.split(',').map((p) => p.trim()).filter(Boolean)
    onUpdate((t) => ({ ...t, ...form, people }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 max-w-md bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
      <h2 className="font-display font-semibold text-2xl mb-1">Info viaggio</h2>
      <input required placeholder="Nome del viaggio" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
      <input placeholder="Emoji" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className={inputClass} />
      <input placeholder="Luogo" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} className={inputClass} />
      <div className="flex gap-2">
        <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={`flex-1 ${inputClass}`} />
        <input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={`flex-1 ${inputClass}`} />
      </div>
      <select value={form.palette} onChange={(e) => setForm({ ...form, palette: e.target.value })} className={inputClass}>
        <option value="mountain">Montagna</option>
        <option value="sea">Mare</option>
        <option value="city">Città</option>
        <option value="wild">Natura</option>
      </select>
      <input placeholder="Persone (separate da virgola)" value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} className={inputClass} />
      <button type="submit" className="self-start inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
        Salva
      </button>
      {saved && <p className="text-sm text-[var(--muted)]">Salvato.</p>}
    </form>
  )
}
```

- [ ] **Step 2: Verifica manuale**

Run: `npm run dev`, apri `http://localhost:5173/admin`, apri un viaggio, tab "Info viaggio":
1. Cambia il nome e la palette, clicca "Salva" — deve comparire "Salvato." e il titolo in cima alla pagina ("{emoji} {nome}") deve aggiornarsi (verifica ricaricando la tab o tornando alla lista e rientrando).
2. Apri lo stesso viaggio nell'app normale (`http://localhost:5173/`) — le modifiche devono essere visibili lì (stesso IndexedDB).

- [ ] **Step 3: Commit**

```bash
git add src/admin/AdminMetaForm.jsx
git commit -m "Aggiungi editor admin dei metadati del viaggio"
```

---

## Task 5: `AdminDaysEditor` — giorni e voci itinerario

**Files:**
- Modify (sostituzione del placeholder): `src/admin/AdminDaysEditor.jsx`

**Interfaces:**
- Consumes: `stampModified`, `dayItemFieldsForKind` da `src/data/schema.js` (firme invariate).
- Produces: `AdminDaysEditor({ trip, onUpdate(updater), activeDisplayName })`.

- [ ] **Step 1: Sostituisci `src/admin/AdminDaysEditor.jsx`**

```jsx
import { useState } from 'react'
import { Plus, Pencil, Trash2, Mountain, Waves, Utensils } from 'lucide-react'
import { stampModified, dayItemFieldsForKind } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const DATE_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })

function formatDate(date) {
  return date ? DATE_FMT.format(new Date(date)) : ''
}

const EMPTY_DAY = { date: '', title: '', note: '' }
const EMPTY_ITEM = { kind: '', time: '', title: '', detail: '', link: '', durata: '', dislivello: '', difficolta: '', accesso: '', servizi: '', luogo: '', prenotato: false }

const KIND_OPTIONS = [
  { value: '', label: 'Generica' },
  { value: 'sentiero', label: 'Sentiero' },
  { value: 'spiaggia', label: 'Spiaggia' },
  { value: 'pasto', label: 'Pasto' }
]

const KIND_ICONS = { sentiero: Mountain, spiaggia: Waves, pasto: Utensils }

function KindIcon({ kind }) {
  const Icon = KIND_ICONS[kind]
  if (!Icon) return null
  return <Icon size={15} className="inline mr-1.5 -mt-0.5 text-[var(--muted)]" />
}

const ALL_KIND_FIELDS = ['durata', 'dislivello', 'difficolta', 'accesso', 'servizi', 'luogo', 'prenotato']

function withoutKindFields(item) {
  const clean = { ...item }
  for (const field of ALL_KIND_FIELDS) delete clean[field]
  return clean
}

function fieldsForForm(itemForm) {
  const common = { time: itemForm.time, title: itemForm.title, kind: itemForm.kind, detail: itemForm.detail, link: itemForm.link }
  for (const field of dayItemFieldsForKind(itemForm.kind)) common[field] = itemForm[field]
  return common
}

export default function AdminDaysEditor({ trip, onUpdate, activeDisplayName }) {
  const [dayForm, setDayForm] = useState(null)
  const [itemForm, setItemForm] = useState(null)

  function saveDay(e) {
    e.preventDefault()
    onUpdate((t) => {
      if (dayForm.id) {
        return { ...t, days: t.days.map((d) => (d.id === dayForm.id ? stampModified({ ...d, ...dayForm }, activeDisplayName) : d)) }
      }
      const day = stampModified({ id: crypto.randomUUID(), items: [], ...dayForm }, activeDisplayName)
      return { ...t, days: [...t.days, day].sort((a, b) => a.date.localeCompare(b.date)) }
    })
    setDayForm(null)
  }

  function removeDay(day) {
    if (window.confirm(`Eliminare "${day.title || formatDate(day.date)}"? Non si può annullare.`)) {
      onUpdate((t) => ({ ...t, days: t.days.filter((d) => d.id !== day.id) }))
    }
  }

  function saveItem(e) {
    e.preventDefault()
    const { dayId, id } = itemForm
    const fields = fieldsForForm(itemForm)
    onUpdate((t) => ({
      ...t,
      days: t.days.map((d) => {
        if (d.id !== dayId) return d
        if (id) return { ...d, items: d.items.map((it) => (it.id === id ? stampModified({ ...withoutKindFields(it), ...fields }, activeDisplayName) : it)) }
        return { ...d, items: [...d.items, stampModified(withoutKindFields({ id: crypto.randomUUID(), ...fields }), activeDisplayName)] }
      })
    }))
    setItemForm(null)
  }

  function removeItem(dayId, item) {
    if (window.confirm(`Eliminare "${item.title}"? Non si può annullare.`)) {
      onUpdate((t) => ({ ...t, days: t.days.map((d) => (d.id === dayId ? { ...d, items: d.items.filter((it) => it.id !== item.id) } : d)) }))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-6">
        {trip.days.length === 0 && <p className="text-base text-[var(--muted)]">Nessun giorno ancora: aggiungine uno dal pannello a destra.</p>}
        {trip.days.map((day) => (
          <div key={day.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">{formatDate(day.date)}</p>
                <p className="font-display font-semibold text-2xl">{day.title || 'Senza titolo'}</p>
                {day.note && <p className="text-base text-[var(--muted)] mt-1">{day.note}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setDayForm({ id: day.id, date: day.date, title: day.title, note: day.note })} aria-label="Modifica giorno" className="p-2 text-[var(--muted)]">
                  <Pencil size={16} />
                </button>
                <button onClick={() => removeDay(day)} aria-label="Elimina giorno" className="p-2 text-[var(--muted)]">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {day.items.length > 0 && (
              <ul className="flex flex-col gap-2 mt-3 border-l-2 border-[var(--line)] pl-4">
                {day.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-1">
                    <div className="flex-1">
                      {item.time && <span className="font-mono text-sm text-[var(--muted)] mr-2">{item.time}</span>}
                      <KindIcon kind={item.kind} />
                      <span className="text-base">{item.title}</span>
                      {item.detail && <p className="text-sm text-[var(--muted)] mt-0.5">{item.detail}</p>}
                    </div>
                    <button onClick={() => setItemForm({ dayId: day.id, id: item.id, ...EMPTY_ITEM, ...item })} aria-label="Modifica voce" className="p-1.5 text-[var(--muted)]">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => removeItem(day.id, item)} aria-label="Elimina voce" className="p-1.5 text-[var(--muted)]">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button onClick={() => setItemForm({ dayId: day.id, ...EMPTY_ITEM })} className="mt-3 flex items-center gap-1 text-base text-[var(--accent)]">
              <Plus size={16} /> Aggiungi voce
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!dayForm && !itemForm && (
          <>
            <h2 className="font-display font-semibold text-xl">Nuovo giorno</h2>
            <button onClick={() => setDayForm(EMPTY_DAY)} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
              <Plus size={16} /> Aggiungi giorno
            </button>
          </>
        )}

        {dayForm && (
          <form onSubmit={saveDay} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{dayForm.id ? 'Modifica giorno' : 'Nuovo giorno'}</h2>
            <input required type="date" value={dayForm.date} onChange={(e) => setDayForm({ ...dayForm, date: e.target.value })} className={inputClass} />
            <input placeholder="Titolo del giorno" value={dayForm.title} onChange={(e) => setDayForm({ ...dayForm, title: e.target.value })} className={inputClass} />
            <textarea placeholder="Nota" value={dayForm.note} onChange={(e) => setDayForm({ ...dayForm, note: e.target.value })} className={inputClass} rows={2} />
            <div className="flex gap-2">
              <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">Salva</button>
              <button type="button" onClick={() => setDayForm(null)} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Annulla</button>
            </div>
          </form>
        )}

        {itemForm && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{itemForm.id ? 'Modifica voce' : 'Nuova voce'}</h2>
            <select value={itemForm.kind} onChange={(e) => setItemForm({ ...itemForm, kind: e.target.value })} className={inputClass}>
              {KIND_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <input type="time" value={itemForm.time} onChange={(e) => setItemForm({ ...itemForm, time: e.target.value })} className={inputClass} />
            <input required placeholder="Titolo" value={itemForm.title} onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })} className={inputClass} />
            <textarea placeholder="Dettaglio" value={itemForm.detail} onChange={(e) => setItemForm({ ...itemForm, detail: e.target.value })} className={inputClass} rows={2} />
            <input placeholder="Link" value={itemForm.link} onChange={(e) => setItemForm({ ...itemForm, link: e.target.value })} className={inputClass} />
            {itemForm.kind === 'sentiero' && (
              <>
                <input placeholder="Durata (es. 5h14)" value={itemForm.durata} onChange={(e) => setItemForm({ ...itemForm, durata: e.target.value })} className={inputClass} />
                <input placeholder="Dislivello (es. 480 m D+)" value={itemForm.dislivello} onChange={(e) => setItemForm({ ...itemForm, dislivello: e.target.value })} className={inputClass} />
                <input placeholder="Difficoltà (es. media, EE)" value={itemForm.difficolta} onChange={(e) => setItemForm({ ...itemForm, difficolta: e.target.value })} className={inputClass} />
              </>
            )}
            {itemForm.kind === 'spiaggia' && (
              <>
                <input placeholder="Come arrivarci" value={itemForm.accesso} onChange={(e) => setItemForm({ ...itemForm, accesso: e.target.value })} className={inputClass} />
                <input placeholder="Servizi (bar, ombrelloni...)" value={itemForm.servizi} onChange={(e) => setItemForm({ ...itemForm, servizi: e.target.value })} className={inputClass} />
              </>
            )}
            {itemForm.kind === 'pasto' && (
              <>
                <input placeholder="Nome del locale" value={itemForm.luogo} onChange={(e) => setItemForm({ ...itemForm, luogo: e.target.value })} className={inputClass} />
                <label className="flex items-center gap-2 text-base">
                  <input type="checkbox" checked={itemForm.prenotato} onChange={(e) => setItemForm({ ...itemForm, prenotato: e.target.checked })} />
                  Prenotato
                </label>
              </>
            )}
            <div className="flex gap-2">
              <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">Salva</button>
              <button type="button" onClick={() => setItemForm(null)} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Annulla</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verifica manuale**

Su `http://localhost:5173/admin`, tab "Giorni" di un viaggio:
1. Aggiungi un giorno con data e titolo — deve comparire ordinato per data tra gli altri.
2. Aggiungi una voce di kind "Sentiero" con durata/dislivello/difficoltà — devono comparire nella lista e restare dopo aver modificato solo il titolo (verifica che `withoutKindFields`/`fieldsForForm` non li perdano).
3. Apri lo stesso viaggio nell'app normale, tab "Itinerario" — il giorno e la voce devono comparire identici.

- [ ] **Step 3: Commit**

```bash
git add src/admin/AdminDaysEditor.jsx
git commit -m "Aggiungi editor admin di giorni e voci itinerario"
```

---

## Task 6: `AdminSectionEditor` (dispatcher) + `AdminCardsEditor`

**Files:**
- Modify (sostituzione del placeholder): `src/admin/AdminSectionEditor.jsx`
- Create: `src/admin/AdminCardsEditor.jsx`

**Interfaces:**
- Consumes: `stampModified` da `src/data/schema.js`.
- Produces: `AdminSectionEditor({ trip, section, onUpdate, activeDisplayName })` — smista per `section.type`; i tipi creati nei Task 7-11 vengono importati qui via placeholder fino a quando non esistono (vedi Step 3).
- Produces: `AdminCardsEditor({ trip, section, onUpdate, activeDisplayName })`.

- [ ] **Step 1: Crea `src/admin/AdminCardsEditor.jsx`**

```jsx
import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { stampModified } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { title: '', meta: '', detail: '', link: '', tags: '' }

export default function AdminCardsEditor({ section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...rest } = form
    const tags = rest.tags.split(',').map((x) => x.trim()).filter(Boolean)
    const fields = { ...rest, tags }
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    setForm(null)
  }

  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.title}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-3">
        {section.items.length === 0 && <p className="text-base text-[var(--muted)]">Nessuna scheda ancora.</p>}
        {section.items.map((item) => (
          <div key={item.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display font-semibold text-xl">{item.title || 'Senza titolo'}</p>
              <div className="flex gap-1">
                <button onClick={() => setForm({ id: item.id, title: item.title, meta: item.meta, detail: item.detail, link: item.link, tags: item.tags.join(', ') })} aria-label="Modifica scheda" className="p-2 text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina scheda" className="p-2 text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {item.meta && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.meta}</p>}
            {item.detail && <p className="text-base mt-2">{item.detail}</p>}
            {item.tags.length > 0 && <p className="text-sm text-[var(--muted)] mt-2">{item.tags.join(' · ')}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!form && (
          <button onClick={() => setForm(EMPTY_FORM)} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={16} /> Nuova scheda
          </button>
        )}
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{form.id ? 'Modifica scheda' : 'Nuova scheda'}</h2>
            <input required placeholder="Titolo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
            <input placeholder="Info breve (es. km, orario)" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} className={inputClass} />
            <textarea placeholder="Dettaglio" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} className={inputClass} rows={2} />
            <input placeholder="Link" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className={inputClass} />
            <input placeholder="Tag (separati da virgola)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">Salva</button>
              <button type="button" onClick={() => setForm(null)} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Annulla</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crea placeholder minimi per i tipi non ancora fatti (Task 7-11), così `AdminSectionEditor` può importarli fin da ora**

`src/admin/AdminChecklistEditor.jsx`, `src/admin/AdminNotesEditor.jsx`, `src/admin/AdminTransportEditor.jsx`, `src/admin/AdminLodgingEditor.jsx`, `src/admin/AdminMapEditor.jsx` — ognuno con lo stesso contenuto placeholder:

```jsx
export default function PLACEHOLDER_NAME({ section }) {
  return <p>{section.title}</p>
}
```

(sostituisci `PLACEHOLDER_NAME` con il nome del file, es. `AdminChecklistEditor`).

- [ ] **Step 3: Sostituisci `src/admin/AdminSectionEditor.jsx`**

```jsx
import AdminCardsEditor from './AdminCardsEditor.jsx'
import AdminChecklistEditor from './AdminChecklistEditor.jsx'
import AdminNotesEditor from './AdminNotesEditor.jsx'
import AdminTransportEditor from './AdminTransportEditor.jsx'
import AdminLodgingEditor from './AdminLodgingEditor.jsx'
import AdminMapEditor from './AdminMapEditor.jsx'

export default function AdminSectionEditor({ trip, section, onUpdate, activeDisplayName }) {
  const props = { trip, section, onUpdate, activeDisplayName }
  if (section.type === 'checklist') return <AdminChecklistEditor {...props} />
  if (section.type === 'notes') return <AdminNotesEditor {...props} />
  if (section.type === 'transport') return <AdminTransportEditor {...props} />
  if (section.type === 'lodging') return <AdminLodgingEditor {...props} />
  if (section.type === 'map') return <AdminMapEditor {...props} />
  return <AdminCardsEditor {...props} />
}
```

- [ ] **Step 4: Verifica manuale**

Su `http://localhost:5173/admin`, apri la sezione "Ristoranti" (tipo `cards`, fissa) di un viaggio:
1. Aggiungi una scheda con titolo, info breve, dettaglio, tag — deve comparire nella lista a sinistra.
2. Modificala, verifica che i tag restino corretti.
3. Apri lo stesso viaggio nell'app normale, tab "Ristoranti" — la scheda deve comparire identica.

- [ ] **Step 5: Commit**

```bash
git add src/admin/AdminSectionEditor.jsx src/admin/AdminCardsEditor.jsx src/admin/AdminChecklistEditor.jsx src/admin/AdminNotesEditor.jsx src/admin/AdminTransportEditor.jsx src/admin/AdminLodgingEditor.jsx src/admin/AdminMapEditor.jsx
git commit -m "Aggiungi smistamento sezioni admin ed editor Schede"
```

---

## Task 7: `AdminChecklistEditor`

**Files:**
- Modify (sostituzione del placeholder): `src/admin/AdminChecklistEditor.jsx`

**Interfaces:**
- Consumes: `stampModified` da `src/data/schema.js`.
- Produces: `AdminChecklistEditor({ section, onUpdate, activeDisplayName })`.

- [ ] **Step 1: Sostituisci `src/admin/AdminChecklistEditor.jsx`**

```jsx
import { useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { stampModified } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

export default function AdminChecklistEditor({ section, onUpdate, activeDisplayName }) {
  const [text, setText] = useState('')

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function addItem(e) {
    e.preventDefault()
    if (!text.trim()) return
    updateItems((items) => [...items, stampModified({ id: crypto.randomUUID(), text: text.trim(), done: false }, activeDisplayName)])
    setText('')
  }

  function toggleItem(item) {
    updateItems((items) => items.map((it) => (it.id === item.id ? stampModified({ ...it, done: !it.done }, activeDisplayName) : it)))
  }

  function removeItem(item) {
    updateItems((items) => items.filter((it) => it.id !== item.id))
  }

  return (
    <div className="max-w-xl flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-[var(--line)] bg-[var(--card)] border border-[var(--line)] rounded-2xl overflow-hidden">
        {section.items.length === 0 && <li className="px-4 py-3.5 text-base text-[var(--muted)]">Niente da spuntare ancora.</li>}
        {section.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <button onClick={() => toggleItem(item)} aria-pressed={item.done} aria-label={item.done ? 'Segna come da fare' : 'Segna come fatto'} className="flex items-center justify-center">
              <span className={`h-5 w-5 rounded border flex items-center justify-center ${item.done ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--line)]'}`}>
                {item.done && <Check size={14} className="text-[var(--paper)]" />}
              </span>
            </button>
            <span className={`flex-1 text-base ${item.done ? 'line-through text-[var(--muted)]' : ''}`}>{item.text}</span>
            <button onClick={() => removeItem(item)} aria-label="Elimina voce" className="p-1.5 text-[var(--muted)]">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={addItem} className="flex gap-2">
        <input placeholder="Nuova voce" value={text} onChange={(e) => setText(e.target.value)} className={`flex-1 ${inputClass}`} />
        <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-12 px-5 bg-[var(--tint)]">
          <Plus size={17} />
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verifica manuale**

Crea una sezione libera di tipo "Lista da spuntare" da `AdminTripEditor` (Task 3), apri la sua tab:
1. Aggiungi due voci, spuntane una — deve apparire barrata.
2. Eliminane una — deve sparire.
3. Apri lo stesso viaggio nell'app normale — la sezione deve comparire identica, con lo stato spuntato coerente.

- [ ] **Step 3: Commit**

```bash
git add src/admin/AdminChecklistEditor.jsx
git commit -m "Aggiungi editor admin delle liste da spuntare"
```

---

## Task 8: `AdminNotesEditor`

**Files:**
- Modify (sostituzione del placeholder): `src/admin/AdminNotesEditor.jsx`

**Interfaces:**
- Consumes: `stampModified` da `src/data/schema.js`.
- Produces: `AdminNotesEditor({ section, onUpdate, activeDisplayName })`.

- [ ] **Step 1: Sostituisci `src/admin/AdminNotesEditor.jsx`**

```jsx
import { useState } from 'react'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

export default function AdminNotesEditor({ section, onUpdate, activeDisplayName }) {
  const [draft, setDraft] = useState(section.text ?? '')

  function save() {
    onUpdate((t) => ({
      ...t,
      sections: t.sections.map((s) => {
        if (s.id !== section.id) return s
        if (!activeDisplayName) return { ...s, text: draft }
        return { ...s, text: draft, modifiedBy: activeDisplayName, modifiedAt: new Date().toISOString() }
      })
    }))
  }

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      placeholder="Scrivi qui le tue note."
      rows={16}
      className={`${inputClass} w-full max-w-2xl font-sans`}
    />
  )
}
```

- [ ] **Step 2: Verifica manuale**

Apri la sezione "Note" (se il viaggio ne ha una libera, altrimeno creane una di tipo "Note" da `AdminTripEditor`):
1. Scrivi del testo, clicca fuori dal campo (blur) — deve salvare.
2. Riapri la tab (cambia tab e torna) — il testo deve essere rimasto.
3. Apri lo stesso viaggio nell'app normale — il testo deve comparire identico.

- [ ] **Step 3: Commit**

```bash
git add src/admin/AdminNotesEditor.jsx
git commit -m "Aggiungi editor admin delle note"
```

---

## Task 9: `AdminTransportEditor`

**Files:**
- Modify (sostituzione del placeholder): `src/admin/AdminTransportEditor.jsx`

**Interfaces:**
- Consumes: `stampModified` da `src/data/schema.js`.
- Produces: `AdminTransportEditor({ section, onUpdate, activeDisplayName })`.

- [ ] **Step 1: Sostituisci `src/admin/AdminTransportEditor.jsx`**

```jsx
import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { stampModified } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { mode: '', from: '', to: '', date: '', time: '', ticketLink: '', note: '' }

function sortKey(item) {
  return `${item.date}T${item.time || '00:00'}`
}

export default function AdminTransportEditor({ section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...fields } = form
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    setForm(null)
  }

  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.mode} ${item.from} → ${item.to}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  const sorted = [...section.items].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-3">
        {sorted.length === 0 && <p className="text-base text-[var(--muted)]">Nessun trasporto ancora.</p>}
        {sorted.map((item) => (
          <div key={item.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display font-semibold text-xl">{item.mode} · {item.from} → {item.to}</p>
              <div className="flex gap-1">
                <button onClick={() => setForm({ ...item })} aria-label="Modifica trasporto" className="p-2 text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina trasporto" className="p-2 text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(item.date || item.time) && <p className="font-mono text-sm text-[var(--muted)] mt-1">{[item.date, item.time].filter(Boolean).join(' · ')}</p>}
            {item.note && <p className="text-base mt-2">{item.note}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!form && (
          <button onClick={() => setForm(EMPTY_FORM)} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={16} /> Nuovo trasporto
          </button>
        )}
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{form.id ? 'Modifica trasporto' : 'Nuovo trasporto'}</h2>
            <input required placeholder="Mezzo (treno, aereo, aliscafo...)" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={inputClass} />
            <input required placeholder="Da" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className={inputClass} />
            <input required placeholder="A" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <input placeholder="Link biglietto" value={form.ticketLink} onChange={(e) => setForm({ ...form, ticketLink: e.target.value })} className={inputClass} />
            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <div className="flex gap-2">
              <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">Salva</button>
              <button type="button" onClick={() => setForm(null)} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Annulla</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verifica manuale**

Apri la sezione "Trasporti" (fissa) di un viaggio:
1. Aggiungi un trasporto con mezzo/da/a/data/ora/link — deve comparire ordinato cronologicamente tra gli altri.
2. Apri lo stesso viaggio nell'app normale, tab "Trasporti" — deve comparire identico, incluso l'ordinamento.

- [ ] **Step 3: Commit**

```bash
git add src/admin/AdminTransportEditor.jsx
git commit -m "Aggiungi editor admin dei trasporti"
```

---

## Task 10: `AdminLodgingEditor`

**Files:**
- Modify (sostituzione del placeholder): `src/admin/AdminLodgingEditor.jsx`

**Interfaces:**
- Consumes: `stampModified` da `src/data/schema.js`.
- Produces: `AdminLodgingEditor({ section, onUpdate, activeDisplayName })`.

- [ ] **Step 1: Sostituisci `src/admin/AdminLodgingEditor.jsx`**

```jsx
import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { stampModified } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { name: '', checkIn: '', checkOut: '', address: '', bookingLink: '', note: '' }

export default function AdminLodgingEditor({ section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...fields } = form
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    setForm(null)
  }

  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.name}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  const sorted = [...section.items].sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-3">
        {sorted.length === 0 && <p className="text-base text-[var(--muted)]">Nessun alloggio ancora.</p>}
        {sorted.map((item) => (
          <div key={item.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display font-semibold text-xl">{item.name || 'Senza nome'}</p>
              <div className="flex gap-1">
                <button onClick={() => setForm({ ...item })} aria-label="Modifica alloggio" className="p-2 text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina alloggio" className="p-2 text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(item.checkIn || item.checkOut) && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.checkIn || '?'} → {item.checkOut || '?'}</p>}
            {item.address && <p className="text-base mt-2">{item.address}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!form && (
          <button onClick={() => setForm(EMPTY_FORM)} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={16} /> Nuovo alloggio
          </button>
        )}
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{form.id ? 'Modifica alloggio' : 'Nuovo alloggio'}</h2>
            <input required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <input placeholder="Indirizzo" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
            <input placeholder="Link prenotazione" value={form.bookingLink} onChange={(e) => setForm({ ...form, bookingLink: e.target.value })} className={inputClass} />
            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <div className="flex gap-2">
              <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">Salva</button>
              <button type="button" onClick={() => setForm(null)} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Annulla</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verifica manuale**

Apri la sezione "Pernottamento" (fissa) di un viaggio:
1. Aggiungi un alloggio con nome/check-in/check-out/indirizzo/link — deve comparire ordinato per check-in.
2. Apri lo stesso viaggio nell'app normale, tab "Pernottamento" — deve comparire identico.

- [ ] **Step 3: Commit**

```bash
git add src/admin/AdminLodgingEditor.jsx
git commit -m "Aggiungi editor admin degli alloggi"
```

---

## Task 11: `AdminMapEditor`

**Files:**
- Modify (sostituzione del placeholder): `src/admin/AdminMapEditor.jsx`

**Interfaces:**
- Consumes: `stampModified` da `src/data/schema.js`.
- Produces: `AdminMapEditor({ section, onUpdate, activeDisplayName })`. Nessuna mappa interattiva (fuori scopo, vedi spec) — solo campi, incluse latitudine/longitudine manuali.

- [ ] **Step 1: Sostituisci `src/admin/AdminMapEditor.jsx`**

```jsx
import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { stampModified } from '../data/schema.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { name: '', category: '', mapsLink: '', lat: '', lng: '', note: '' }

export default function AdminMapEditor({ section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...raw } = form
    const toCoord = (value) => {
      if (value === '') return null
      const n = Number(value)
      return Number.isFinite(n) ? n : null
    }
    const fields = { ...raw, lat: toCoord(raw.lat), lng: toCoord(raw.lng) }
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    setForm(null)
  }

  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.name}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-3">
        {section.items.length === 0 && <p className="text-base text-[var(--muted)]">Nessun punto ancora.</p>}
        {section.items.map((item) => (
          <div key={item.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display font-semibold text-xl">{item.name || 'Senza nome'}</p>
                {item.category && <p className="text-sm text-[var(--muted)]">{item.category}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setForm({ ...item, lat: item.lat ?? '', lng: item.lng ?? '' })} aria-label="Modifica punto" className="p-2 text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina punto" className="p-2 text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(item.lat !== null && item.lng !== null) && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.lat}, {item.lng}</p>}
            {item.note && <p className="text-base mt-2">{item.note}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!form && (
          <button onClick={() => setForm(EMPTY_FORM)} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={16} /> Nuovo punto
          </button>
        )}
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{form.id ? 'Modifica punto' : 'Nuovo punto'}</h2>
            <input required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <input placeholder="Categoria (spiaggia, ristorante, punto panoramico...)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} />
            <input placeholder="Link Google/Apple Maps" value={form.mapsLink} onChange={(e) => setForm({ ...form, mapsLink: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="number" step="any" placeholder="Latitudine" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="number" step="any" placeholder="Longitudine" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <div className="flex gap-2">
              <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">Salva</button>
              <button type="button" onClick={() => setForm(null)} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Annulla</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verifica manuale**

Apri la sezione "Mappa" (fissa) di un viaggio:
1. Aggiungi un punto con nome/categoria/link/lat/lng — deve comparire nella lista con le coordinate mostrate.
2. Aggiungi un punto senza coordinate — non deve dare errore, `lat`/`lng` restano `null`.
3. Apri lo stesso viaggio nell'app normale, tab "Mappa" — i punti con coordinate devono comparire sulla mappa Leaflet.

- [ ] **Step 3: Commit**

```bash
git add src/admin/AdminMapEditor.jsx
git commit -m "Aggiungi editor admin dei punti mappa"
```

---

## Task 12: Verifica finale end-to-end

**Files:** nessuna modifica — solo verifica.

- [ ] **Step 1: Esegui l'intera suite automatica**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Build di produzione e verifica PWA**

Run: `npm run build && npm run preview`

- [ ] **Step 3: Percorso completo da `/admin`**

Nel browser aperto su `npm run preview`:
1. Vai su `/admin`, crea un viaggio nuovo da zero con nome, emoji, luogo, date, palette, persone.
2. Aggiungi almeno un giorno con una voce, e almeno una voce in ciascuna delle 6 sezioni (Ristoranti, una checklist libera, una nota libera, Trasporti, Pernottamento, Mappa) — crea le sezioni libere mancanti da "+ Aggiungi sezione".
3. Vai su `/` (l'app normale), apri lo stesso viaggio: verifica che tutto il contenuto inserito da `/admin` sia visibile e corretto in ogni tab.
4. In DevTools → Network, seleziona "Offline", ricarica `/admin` e riapri lo stesso viaggio: la lista e l'editor devono funzionare (dati locali via IndexedDB), coerente col requisito local-first.
5. Se hai un progetto Supabase raggiungibile e configurato in `.env.local`: attiva la sincronizzazione su un viaggio dall'app normale, poi apri quel viaggio da `/admin` — deve risultare modificabile (sei tu il proprietario). Prova ad aprire `/admin` da una sessione senza login: deve comparire il prompt di accesso solo per quel viaggio sincronizzato, non per l'intera dashboard.

- [ ] **Step 4: Riporta l'esito**

Se tutto corrisponde, la dashboard admin è pronta. Annota qui eventuali scostamenti trovati durante la verifica, prima di considerare il lavoro concluso.
