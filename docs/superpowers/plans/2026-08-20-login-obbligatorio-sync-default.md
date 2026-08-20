# Login obbligatorio e sincronizzazione di default — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il login (magic link) diventa un gate obbligatorio, una tantum, all'apertura dell'app; da quel momento ogni viaggio è sincronizzato di default (niente più "Attiva sincronizzazione" per-viaggio), e la Home mostra i viaggi legati all'account, aggiornati dal server quando c'è rete.

**Architecture:** `App.jsx` guadagna uno stato di sessione e un passaggio di bootstrap che, dopo il login, adotta i viaggi locali non ancora sincronizzati e riconcilia la lista con `tv_trips` via una nuova funzione pura `reconcileTripList()` in `sync.js` (stesso stile di `decideSyncAction`, già testata). La logica di sync per-viaggio esistente in `TripView.jsx`/`sync.js` non cambia. `ActivateSyncModal.jsx` viene rimosso; `JoinView.jsx` si semplifica perché sessione e nome sono già garantiti dal gate.

**Tech Stack:** React 18 + Vite, JavaScript (no TypeScript), Tailwind, `@supabase/supabase-js`, `idb-keyval`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-login-obbligatorio-sync-default-design.md`

## Global Constraints

- JavaScript, non TypeScript — il modello dati si valida a runtime.
- Nessuna dipendenza nuova: il budget resta React, Tailwind, lucide-react, idb-keyval, @supabase/supabase-js, vite-plugin-pwa, leaflet, react-leaflet.
- Un componente per file, niente file oltre ~250 righe, niente cartella `utils/` generica.
- Copy in italiano, tono piano, seconda persona; i bottoni dicono cosa succede.
- Le chiavi Supabase restano in `.env.local`, mai nel codice.
- Commit piccoli, messaggio in italiano all'imperativo.
- Ogni fase finisce con `npm run build` che passa e una verifica offline in `preview`.
- Le migrazioni SQL si applicano dalla dashboard Supabase hosted o con `supabase db push` — mai stack locale (niente Docker).

---

### Task 1: Migrazione SQL — policy di eliminazione

**Files:**
- Create: `supabase/sql/0004_trip_delete_policies.sql`

**Interfaces:**
- Produces: policy `tv_trips_delete` (owner) e `tv_trip_members_delete_self` (propria riga), usate dai Task 3 e 9.

- [ ] **Step 1: Scrivi la migrazione**

```sql
-- Nessuna policy "delete" esisteva finora su tv_trips/tv_trip_members (solo
-- select/insert/update in 0001/0002): senza queste, un viaggio sincronizzato
-- non si può cancellare dal client. L'owner cancella l'intero viaggio (la
-- cascata su tv_trip_members è già "on delete cascade" da 0001); un membro
-- cancella solo la propria riga di iscrizione, cioè esce dal viaggio senza
-- toccarlo per gli altri.

drop policy if exists "tv_trips_delete" on tv_trips;
create policy "tv_trips_delete" on tv_trips for delete
  using (owner_id = auth.uid());

drop policy if exists "tv_trip_members_delete_self" on tv_trip_members;
create policy "tv_trip_members_delete_self" on tv_trip_members for delete
  using (user_id = auth.uid());
```

- [ ] **Step 2: Applica la migrazione sul progetto hosted**

Incollala nell'SQL Editor della dashboard Supabase del progetto
`txfgxxaabhltazckabud` (o `supabase db push` se preferisci la CLI) ed eseguila.
È idempotente (`drop policy if exists`), si può rieseguire senza problemi.

- [ ] **Step 3: Verifica manuale**

Dalla dashboard, tabella `tv_trips`: prova a cancellare a mano una riga di
test come l'utente owner (via SQL Editor con `set role` o dal pannello Auth
impersonando l'utente) — deve riuscire. Prova a cancellare una riga di cui
non sei owner — deve fallire per RLS. Elimina eventuali righe di test create
per la verifica.

- [ ] **Step 4: Commit**

```bash
git add supabase/sql/0004_trip_delete_policies.sql
git commit -m "aggiungi policy di eliminazione per tv_trips e tv_trip_members"
```

---

### Task 2: `sync.js` — `listMyTrips()`

**Files:**
- Modify: `src/data/sync.js`
- Test: `src/data/sync.test.js`

**Interfaces:**
- Consumes: `supabase` e `getSession` da `./supabase.js` (già importati nel file), `normalizeTrip` da `./schema.js` (già importato).
- Produces: `listMyTrips(): Promise<Array<{ remoteId: string, role: 'editor'|'viewer', trip: object, updatedAt: string }>>` — usata dal Task 7.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in fondo a `src/data/sync.test.js`:

```js
describe('listMyTrips', () => {
  it('elenca i viaggi visibili con il proprio ruolo', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
    const eqFn = vi.fn().mockResolvedValue({
      data: [
        { trip_id: 'trip-remote-1', role: 'editor', tv_trips: { data: { name: 'Ponza' }, updated_at: '2026-08-18T10:00:00Z' } },
        { trip_id: 'trip-remote-2', role: 'viewer', tv_trips: { data: { name: 'Dolomiti' }, updated_at: '2026-08-18T11:00:00Z' } }
      ],
      error: null
    })
    mockFrom.mockReturnValue({ select: () => ({ eq: eqFn }) })

    const { listMyTrips } = await import('./sync.js')
    const result = await listMyTrips()

    expect(mockFrom).toHaveBeenCalledWith('tv_trip_members')
    expect(eqFn).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result).toEqual([
      { remoteId: 'trip-remote-1', role: 'editor', trip: expect.objectContaining({ name: 'Ponza' }), updatedAt: '2026-08-18T10:00:00Z' },
      { remoteId: 'trip-remote-2', role: 'viewer', trip: expect.objectContaining({ name: 'Dolomiti' }), updatedAt: '2026-08-18T11:00:00Z' }
    ])
  })

  it('rifiuta se non c\'è una sessione', async () => {
    mockGetSession.mockResolvedValue(null)
    const { listMyTrips } = await import('./sync.js')
    await expect(listMyTrips()).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm test -- sync.test.js`
Expected: FAIL con `listMyTrips is not a function` (o simile).

- [ ] **Step 3: Implementa `listMyTrips`**

In `src/data/sync.js`, aggiungi (vicino a `joinTripByCode`, stesso stile):

```js
export async function listMyTrips() {
  const session = await getSession()
  if (!session) throw new Error('Devi accedere prima di vedere i tuoi viaggi.')

  const { data, error } = await supabase
    .from('tv_trip_members')
    .select('trip_id, role, tv_trips(data, updated_at)')
    .eq('user_id', session.user.id)
  if (error) throw new Error(error.message)

  return data.map((row) => ({
    remoteId: row.trip_id,
    role: row.role,
    trip: normalizeTrip(row.tv_trips.data),
    updatedAt: row.tv_trips.updated_at
  }))
}
```

Nota: si filtra esplicitamente su `tv_trip_members`, non su `tv_trips`, perché
la propria riga di iscrizione (owner compreso: `activateTripSync` inserisce
già l'owner in `tv_trip_members` con ruolo `editor`) è l'unico posto da cui
si legge sia il `trip_id` visibile sia il proprio ruolo su quel viaggio in
una sola query.

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npm test -- sync.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/sync.js src/data/sync.test.js
git commit -m "aggiungi listMyTrips per elencare i viaggi dell'account"
```

---

### Task 3: `sync.js` — `deleteTripAsOwner` e `leaveTripAsMember`

**Files:**
- Modify: `src/data/sync.js`
- Test: `src/data/sync.test.js`

**Interfaces:**
- Consumes: policy `tv_trips_delete`/`tv_trip_members_delete_self` (Task 1).
- Produces: `deleteTripAsOwner(remoteId: string): Promise<void>`,
  `leaveTripAsMember(remoteId: string): Promise<void>` — usate dal Task 9.

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in fondo a `src/data/sync.test.js`:

```js
describe('deleteTripAsOwner', () => {
  it('cancella la riga tv_trips per id', async () => {
    const eqFn = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ delete: () => ({ eq: eqFn }) })

    const { deleteTripAsOwner } = await import('./sync.js')
    await deleteTripAsOwner('trip-remote-1')

    expect(mockFrom).toHaveBeenCalledWith('tv_trips')
    expect(eqFn).toHaveBeenCalledWith('id', 'trip-remote-1')
  })

  it('propaga l\'errore di Supabase', async () => {
    mockFrom.mockReturnValue({ delete: () => ({ eq: vi.fn().mockResolvedValue({ error: { message: 'negato' } }) }) })
    const { deleteTripAsOwner } = await import('./sync.js')
    await expect(deleteTripAsOwner('trip-remote-1')).rejects.toThrow('negato')
  })
})

describe('leaveTripAsMember', () => {
  it('cancella solo la propria riga di iscrizione', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-2' } })
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockFrom.mockReturnValue({ delete: () => ({ eq: eq1 }) })

    const { leaveTripAsMember } = await import('./sync.js')
    await leaveTripAsMember('trip-remote-1')

    expect(mockFrom).toHaveBeenCalledWith('tv_trip_members')
    expect(eq1).toHaveBeenCalledWith('trip_id', 'trip-remote-1')
    expect(eq2).toHaveBeenCalledWith('user_id', 'user-2')
  })

  it('rifiuta se non c\'è una sessione', async () => {
    mockGetSession.mockResolvedValue(null)
    const { leaveTripAsMember } = await import('./sync.js')
    await expect(leaveTripAsMember('trip-remote-1')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- sync.test.js`
Expected: FAIL con `deleteTripAsOwner is not a function` (o simile).

- [ ] **Step 3: Implementa le due funzioni**

In `src/data/sync.js`:

```js
export async function deleteTripAsOwner(remoteId) {
  const { error } = await supabase.from('tv_trips').delete().eq('id', remoteId)
  if (error) throw new Error(error.message)
}

export async function leaveTripAsMember(remoteId) {
  const session = await getSession()
  if (!session) throw new Error('Devi accedere prima di uscire dal viaggio.')

  const { error } = await supabase
    .from('tv_trip_members')
    .delete()
    .eq('trip_id', remoteId)
    .eq('user_id', session.user.id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- sync.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/sync.js src/data/sync.test.js
git commit -m "aggiungi deleteTripAsOwner e leaveTripAsMember"
```

---

### Task 4: `sync.js` — `reconcileTripList()` (pura)

**Files:**
- Modify: `src/data/sync.js`
- Test: `src/data/sync.test.js`

**Interfaces:**
- Consumes: nessuna dipendenza esterna (funzione pura, come `decideSyncAction`).
- Produces:
  ```
  reconcileTripList({
    localTrips: Array<Trip>,               // Trip = oggetto normalizzato, ha .id
    syncStates: Array<{ localId: string, syncState: SyncState | null }>,
    remoteTrips: Array<{ remoteId: string, role: string, trip: Trip, updatedAt: string }>
  }): {
    trips: Array<Trip>,
    additions: Array<{ trip: Trip, syncState: SyncState }>
  }
  ```
  dove `SyncState = { remoteId, role, lastSyncedAt, dirty }`. Usata dal Task 7.

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in fondo a `src/data/sync.test.js`:

```js
describe('reconcileTripList', () => {
  const tripA = normalizeTrip({ name: 'A' })
  const tripB = normalizeTrip({ name: 'B' })
  const stateA = { remoteId: 'remote-A', role: 'editor', lastSyncedAt: null, dirty: false }

  it('rimuove un viaggio locale il cui remoteId non è più visibile', () => {
    const result = reconcileTripList({
      localTrips: [tripA],
      syncStates: [{ localId: tripA.id, syncState: stateA }],
      remoteTrips: []
    })
    expect(result.trips).toEqual([])
    expect(result.additions).toEqual([])
  })

  it('tiene un viaggio locale ancora visibile remotamente, senza duplicarlo', () => {
    const result = reconcileTripList({
      localTrips: [tripA],
      syncStates: [{ localId: tripA.id, syncState: stateA }],
      remoteTrips: [{ remoteId: 'remote-A', role: 'editor', trip: tripA, updatedAt: '2026-08-18T10:00:00Z' }]
    })
    expect(result.trips).toEqual([tripA])
    expect(result.additions).toEqual([])
  })

  it('tiene un viaggio locale senza syncState (adozione non ancora riuscita)', () => {
    const result = reconcileTripList({
      localTrips: [tripA],
      syncStates: [{ localId: tripA.id, syncState: null }],
      remoteTrips: []
    })
    expect(result.trips).toEqual([tripA])
  })

  it('aggiunge un viaggio remoto non ancora presente sul device', () => {
    const result = reconcileTripList({
      localTrips: [tripA],
      syncStates: [{ localId: tripA.id, syncState: stateA }],
      remoteTrips: [
        { remoteId: 'remote-A', role: 'editor', trip: tripA, updatedAt: '2026-08-18T10:00:00Z' },
        { remoteId: 'remote-B', role: 'viewer', trip: tripB, updatedAt: '2026-08-18T11:00:00Z' }
      ]
    })
    expect(result.trips).toHaveLength(2)
    expect(result.additions).toHaveLength(1)
    expect(result.additions[0].syncState).toEqual({ remoteId: 'remote-B', role: 'viewer', lastSyncedAt: '2026-08-18T11:00:00Z', dirty: false })
    expect(result.additions[0].trip.name).toBe('B')
    expect(result.additions[0].trip.id).not.toBe(tripB.id)
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test -- sync.test.js`
Expected: FAIL con `reconcileTripList is not a function`.

- [ ] **Step 3: Implementa `reconcileTripList`**

In `src/data/sync.js`:

```js
export function reconcileTripList({ localTrips, syncStates, remoteTrips }) {
  const syncStateByLocalId = new Map(syncStates.map((s) => [s.localId, s.syncState]))
  const remoteById = new Map(remoteTrips.map((r) => [r.remoteId, r]))

  const survivors = localTrips.filter((trip) => {
    const state = syncStateByLocalId.get(trip.id)
    return !state || remoteById.has(state.remoteId)
  })

  const knownRemoteIds = new Set(
    localTrips
      .map((trip) => syncStateByLocalId.get(trip.id))
      .filter(Boolean)
      .map((state) => state.remoteId)
  )

  const additions = remoteTrips
    .filter((remote) => !knownRemoteIds.has(remote.remoteId))
    .map((remote) => ({
      trip: { ...remote.trip, id: crypto.randomUUID() },
      syncState: { remoteId: remote.remoteId, role: remote.role, lastSyncedAt: remote.updatedAt, dirty: false }
    }))

  return { trips: [...survivors, ...additions.map((a) => a.trip)], additions }
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test -- sync.test.js`
Expected: PASS (tutti i test del file, non solo quelli nuovi).

- [ ] **Step 5: Commit**

```bash
git add src/data/sync.js src/data/sync.test.js
git commit -m "aggiungi reconcileTripList per calcolare la lista viaggi dell'account"
```

---

### Task 5: `LoginGate.jsx` — schermata di accesso obbligatoria

**Files:**
- Create: `src/views/LoginGate.jsx`

**Interfaces:**
- Consumes: `getSession`, `subscribeAuth` da `../data/supabase.js` (esistenti);
  `getDisplayNamePreference`, `setDisplayNamePreference` da `../data/storage.js`
  (esistenti); componenti `MagicLinkForm`/`DisplayNameForm` (esistenti,
  invariati).
- Produces: `<LoginGate onReady={() => void} />` — chiama `onReady` non appena
  c'è sia una sessione sia un nome visualizzato salvato. Usato dal Task 6.

- [ ] **Step 1: Crea il componente**

```jsx
import { useEffect, useState } from 'react'
import MagicLinkForm from '../components/MagicLinkForm.jsx'
import DisplayNameForm from '../components/DisplayNameForm.jsx'
import { getSession, subscribeAuth } from '../data/supabase.js'
import { getDisplayNamePreference, setDisplayNamePreference } from '../data/storage.js'

export default function LoginGate({ onReady }) {
  const [step, setStep] = useState('loading')
  const [namePreference, setNamePreference] = useState('')

  useEffect(() => {
    let cancelled = false

    async function checkReady(session) {
      const name = await getDisplayNamePreference()
      if (cancelled) return
      if (session && name) {
        onReady()
        return
      }
      setNamePreference(name)
      setStep(session ? 'name' : 'email')
    }

    getSession().then(checkReady)
    const unsubscribe = subscribeAuth(checkReady)
    return () => { cancelled = true; unsubscribe() }
  }, [onReady])

  async function handleName(name) {
    await setDisplayNamePreference(name)
    onReady()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 font-sans">
      <div className="max-w-sm w-full flex flex-col gap-4">
        <h1 className="font-display text-2xl">Accedi a WeGo</h1>
        {step === 'loading' && <p className="text-sm text-[var(--muted)]">Un attimo…</p>}
        {step === 'email' && (
          <>
            <p className="text-sm text-[var(--muted)]">Serve un account per vedere e sincronizzare i tuoi viaggi.</p>
            <MagicLinkForm />
          </>
        )}
        {step === 'name' && <DisplayNameForm initialValue={namePreference} onSubmit={handleName} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verifica manuale**

```bash
npm run dev
```

Apri l'app in una finestra anonima (nessuna sessione salvata): deve comparire
subito "Accedi a WeGo" con il form email, prima di qualunque viaggio. Invia
un magic link a un indirizzo che puoi controllare, clicca il link: l'app deve
tornare sulla pagina e passare da sola allo step "nome" (grazie a
`subscribeAuth`). Non c'è ancora nulla dopo lo step nome (arriva nel Task 6):
per ora è normale se la pagina resta bianca dopo aver inviato il nome.

- [ ] **Step 3: Commit**

```bash
git add src/views/LoginGate.jsx
git commit -m "aggiungi la schermata di accesso obbligatoria LoginGate"
```

---

### Task 6: `App.jsx` — attivare il gate di login

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `isCloudConfigured` da `./data/supabase.js`; `LoginGate` (Task 5).
- Produces: nessuna nuova interfaccia esterna — questo task cambia solo
  l'ordine di rendering di `App`.

- [ ] **Step 1: Aggiungi lo stato `authReady` e il branch di rendering**

In `src/App.jsx`, aggiungi l'import e lo stato in cima al componente:

```js
import { isCloudConfigured } from './data/supabase.js'
import LoginGate from './views/LoginGate.jsx'
```

```js
const [authReady, setAuthReady] = useState(!isCloudConfigured)
```

Nel corpo del componente, come primo `if` di rendering (prima di
`if (trips === null)`):

```js
if (!authReady) {
  return <LoginGate onReady={() => setAuthReady(true)} />
}
```

- [ ] **Step 2: Verifica manuale**

```bash
npm run build && npm run preview
```

Da una finestra anonima: si apre su "Accedi a WeGo", non sulla Home. Con
`.env.local` senza le chiavi Supabase (`isCloudConfigured === false`), l'app
deve invece aprirsi direttamente come oggi, senza gate (verifica commentando
temporaneamente le due righe in `.env.local`, poi ripristinale).

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "aggiungi il gate di login obbligatorio in App"
```

---

### Task 7: `App.jsx` — bootstrap: adozione e riconciliazione

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `getSyncState`, `setSyncState`, `getDisplayNamePreference` da
  `./data/storage.js` (esistenti); `activateTripSync`, `listMyTrips`,
  `reconcileTripList` da `./data/sync.js` (Task 2, Task 4, esistente).
- Produces: sostituisce l'effect `loadTrips().then(setTrips)` esistente.

- [ ] **Step 1: Sostituisci l'effect di caricamento viaggi**

In `src/App.jsx`, aggiorna gli import:

```js
import { loadTrips, saveTrips, getSyncState, setSyncState, getDisplayNamePreference } from './data/storage.js'
import { activateTripSync, listMyTrips, reconcileTripList } from './data/sync.js'
```

Sostituisci l'effect esistente:

```js
useEffect(() => {
  loadTrips().then(setTrips)
}, [])
```

con:

```js
useEffect(() => {
  if (!authReady) return
  let cancelled = false

  async function bootstrap() {
    const local = await loadTrips()
    if (cancelled) return

    if (!isCloudConfigured) {
      setTrips(local)
      return
    }

    const displayName = await getDisplayNamePreference()
    const syncStates = []
    for (const trip of local) {
      let state = await getSyncState(trip.id)
      if (!state) {
        try {
          state = await activateTripSync(trip, displayName)
          await setSyncState(trip.id, state)
        } catch {
          state = null
        }
      }
      syncStates.push({ localId: trip.id, syncState: state })
    }
    if (cancelled) return

    let finalTrips = local
    if (navigator.onLine) {
      try {
        const remoteTrips = await listMyTrips()
        const { trips: reconciled, additions } = reconcileTripList({ localTrips: local, syncStates, remoteTrips })
        for (const { trip, syncState } of additions) await setSyncState(trip.id, syncState)
        finalTrips = reconciled
      } catch {
        // offline durante il pull, o errore di rete: resta la lista locale
      }
    }

    await saveTrips(finalTrips)
    if (!cancelled) setTrips(finalTrips)
  }

  bootstrap()
  return () => { cancelled = true }
}, [authReady])
```

Nota: il primo `for` adotta ogni viaggio locale privo di `syncState` (seed
appena creati alla primissima apertura, viaggi "vecchio modello" già sul
device, viaggi creati offline mai spinti) — è il meccanismo di migrazione
automatica descritto nello spec, nessun caso speciale per i seed.

- [ ] **Step 2: Verifica manuale — primo login su un device pulito**

```bash
npm run build && npm run preview
```

Finestra anonima → completa il login (Task 5/6) → la Home deve mostrare i
due viaggi seed (Dolomiti, Ponza), e ciascuno deve avere ora un `syncState`
persistito: verificalo in DevTools → Application → IndexedDB →
`keyval-store` → cerca chiavi `wego:sync:<id>`, devono avere `remoteId` e
`shareCode` valorizzati.

- [ ] **Step 3: Verifica manuale — secondo device, stesso account**

Ripeti il login con la stessa email su un altro browser/finestra anonima:
dopo il login, la Home deve mostrare gli stessi viaggi (scaricati da
`listMyTrips`), non una nuova coppia di seed duplicati.

- [ ] **Step 4: Verifica manuale — offline dopo il primo login**

DevTools → Network → Offline, poi ricarica la pagina: l'app deve aprirsi
direttamente sulla Home con l'ultima lista nota, senza mostrare `LoginGate`.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "aggiungi bootstrap di adozione e riconciliazione dei viaggi dopo il login"
```

---

### Task 8: `App.jsx` — creazione e importazione sincronizzate di default

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/views/Home.jsx`
- Modify: `src/views/ImportView.jsx`

**Interfaces:**
- Consumes: `activateTripSync`, `getDisplayNamePreference`/`setSyncState` (già
  importati dal Task 7).
- Produces: `createTrip`/`importTrips` in `App.jsx` diventano `async` e
  ritornano `boolean` (esito); `Home`'s `onCreate` e `ImportView`'s
  `onImport` vengono `await`ati dai rispettivi form.

- [ ] **Step 1: Rendi `createTrip` sincrona-al-server e fallibile**

In `src/App.jsx`, sostituisci:

```js
function createTrip(raw) {
  const trip = normalizeTrip(raw)
  persist([...trips, trip])
  openTrip(trip.id)
}
```

con:

```js
async function createTrip(raw) {
  const trip = normalizeTrip(raw)
  if (isCloudConfigured) {
    try {
      const displayName = await getDisplayNamePreference()
      const state = await activateTripSync(trip, displayName)
      await setSyncState(trip.id, state)
    } catch (e) {
      window.alert(`Non è stato possibile creare il viaggio. Controlla la rete e riprova.\n\n${e.message}`)
      return false
    }
  }
  persist([...trips, trip])
  openTrip(trip.id)
  return true
}
```

- [ ] **Step 2: Stesso trattamento per `importTrips`**

Sostituisci:

```js
function importTrips(raw) {
  const list = Array.isArray(raw) ? raw : [raw]
  const newTrips = list.map(normalizeTrip)
  persist([...trips, ...newTrips])
  openTrip(newTrips[0].id)
}
```

con:

```js
async function importTrips(raw) {
  const list = Array.isArray(raw) ? raw : [raw]
  const newTrips = list.map(normalizeTrip)
  if (isCloudConfigured) {
    const displayName = await getDisplayNamePreference()
    try {
      for (const trip of newTrips) {
        const state = await activateTripSync(trip, displayName)
        await setSyncState(trip.id, state)
      }
    } catch (e) {
      window.alert(`Non è stato possibile caricare il viaggio. Controlla la rete e riprova.\n\n${e.message}`)
      return false
    }
  }
  persist([...trips, ...newTrips])
  openTrip(newTrips[0].id)
  return true
}
```

- [ ] **Step 3: `Home.jsx` — attendi l'esito prima di chiudere il form**

In `src/views/Home.jsx`, sostituisci:

```js
function submit(e) {
  e.preventDefault()
  onCreate({ ...form, people: form.people.split(',').map((p) => p.trim()).filter(Boolean) })
  setForm(null)
}
```

con:

```js
async function submit(e) {
  e.preventDefault()
  const ok = await onCreate({ ...form, people: form.people.split(',').map((p) => p.trim()).filter(Boolean) })
  if (ok) setForm(null)
}
```

- [ ] **Step 4: `ImportView.jsx` — `await` l'importazione**

In `src/views/ImportView.jsx`, sostituisci:

```js
function submit(e) {
  e.preventDefault()
  setError('')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    setError('Il testo non è un JSON valido: controlla di averlo copiato per intero.')
    return
  }
  try {
    onImport(parsed)
  } catch (err) {
    setError(err.message)
  }
}
```

con:

```js
async function submit(e) {
  e.preventDefault()
  setError('')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    setError('Il testo non è un JSON valido: controlla di averlo copiato per intero.')
    return
  }
  try {
    await onImport(parsed)
  } catch (err) {
    setError(err.message)
  }
}
```

- [ ] **Step 5: Verifica manuale**

```bash
npm run build && npm run preview
```

Online: crea un nuovo viaggio dalla Home → deve aprirsi subito e comparire
già con `syncState` valorizzato (stesso controllo IndexedDB del Task 7).
Offline (DevTools → Network → Offline): prova a crearne uno → deve comparire
un alert con l'errore, il form resta aperto con i dati inseriti, nessun
viaggio orfano compare in Home. Ripeti la prova di creazione offline anche
per "Carica il viaggio" (import).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/views/Home.jsx src/views/ImportView.jsx
git commit -m "sincronizza ogni viaggio nuovo di default alla creazione/importazione"
```

---

### Task 9: `App.jsx` — eliminare un viaggio (owner vs membro)

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `deleteTripAsOwner`, `leaveTripAsMember` da `./data/sync.js`
  (Task 3); `getSyncState` (già importato).

- [ ] **Step 1: Rendi `deleteTrip` consapevole del ruolo**

In `src/App.jsx`, aggiorna l'import da `./data/sync.js` aggiungendo
`deleteTripAsOwner, leaveTripAsMember`, poi sostituisci:

```js
function deleteTrip(id) {
  persist(trips.filter((t) => t.id !== id))
  goHome()
}
```

con:

```js
async function deleteTrip(id) {
  const syncState = await getSyncState(id)
  if (syncState) {
    try {
      if (syncState.role === 'editor') {
        await deleteTripAsOwner(syncState.remoteId)
      } else {
        await leaveTripAsMember(syncState.remoteId)
      }
    } catch (e) {
      window.alert(`Non è stato possibile eliminare il viaggio. Controlla la rete e riprova.\n\n${e.message}`)
      return
    }
  }
  persist(trips.filter((t) => t.id !== id))
  goHome()
}
```

- [ ] **Step 2: Verifica manuale — owner elimina**

```bash
npm run build && npm run preview
```

Da Home o da Impostazioni del viaggio, elimina un viaggio di cui sei owner
(online): deve sparire subito. Controlla nella dashboard Supabase che la
riga `tv_trips` sia sparita.

- [ ] **Step 3: Verifica manuale — membro esce, owner non perde nulla**

Con un secondo account che ha fatto `join_trip` su un viaggio (share_code),
elimina il viaggio da quell'account: deve sparire solo per lui. Controlla che
per l'owner il viaggio resti (riapri l'app dell'owner, o forza un bootstrap).

- [ ] **Step 4: Verifica manuale — offline**

Offline, prova a eliminare un viaggio sincronizzato: deve comparire l'alert
con l'errore, il viaggio resta in Home.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "distingui eliminazione owner ed uscita membro in deleteTrip"
```

---

### Task 10: Rimuovi `ActivateSyncModal` e il flusso manuale di attivazione

**Files:**
- Delete: `src/views/ActivateSyncModal.jsx`
- Modify: `src/views/TripView.jsx`
- Modify: `src/views/Settings.jsx`
- Modify: `src/views/Section.jsx`
- Modify: `src/views/Lodging.jsx`

**Interfaces:**
- Produces: `Settings` guadagna una prop `shareCode` al posto di
  `syncActive`/`onOpenActivate`; `Section`/`Lodging` perdono la prop
  `onOpenActivate`.

- [ ] **Step 1: Elimina il file**

```bash
git rm src/views/ActivateSyncModal.jsx
```

- [ ] **Step 2: `TripView.jsx` — togli lo stato e il modal**

Rimuovi l'import `import ActivateSyncModal from './ActivateSyncModal.jsx'`.

Rimuovi la riga `const [activateOpen, setActivateOpen] = useState(false)`.

Rimuovi del tutto la funzione `handleActivated` (non serve più: il
`syncState` di un viaggio è già garantito dal bootstrap in `App.jsx` prima
che `TripView` venga mai montato).

Sostituisci la chiamata a `Settings`:

```jsx
<Settings
  trip={trip}
  onUpdate={handleUpdate}
  onDelete={onDelete}
  syncActive={!!syncState}
  onOpenActivate={() => setActivateOpen(true)}
  onRestore={syncState && syncState.role === 'editor' ? handleRestore : null}
  onClose={() => setSettingsOpen(false)}
/>
```

con:

```jsx
<Settings
  trip={trip}
  onUpdate={handleUpdate}
  onDelete={onDelete}
  shareCode={syncState?.shareCode ?? null}
  onRestore={syncState && syncState.role === 'editor' ? handleRestore : null}
  onClose={() => setSettingsOpen(false)}
/>
```

Nella chiamata a `Section`, rimuovi la prop `onOpenActivate={() => setActivateOpen(true)}`.

Rimuovi del tutto il blocco JSX:

```jsx
<ActivateSyncModal open={activateOpen} trip={trip} onClose={() => setActivateOpen(false)} onActivated={handleActivated} />
```

- [ ] **Step 3: `Settings.jsx` — sostituisci "Attiva sync" con "Condividi"**

Cambia la firma del componente da:

```js
export default function Settings({ trip, onUpdate, onDelete, syncActive, onOpenActivate, onRestore, onClose }) {
```

a:

```js
export default function Settings({ trip, onUpdate, onDelete, shareCode, onRestore, onClose }) {
```

Rimuovi l'import `import { isCloudConfigured } from '../data/supabase.js'`
(non serve più in questo file).

Aggiungi, vicino alle altre funzioni del componente:

```js
function copyShareLink() {
  navigator.clipboard.writeText(`${window.location.origin}/j/${shareCode}`)
}
```

Sostituisci:

```jsx
{!syncActive && isCloudConfigured && (
  <Btn variant="secondary" onClick={onOpenActivate}>
    <Share2 size={16} /> Attiva sync
  </Btn>
)}
```

con:

```jsx
{shareCode && (
  <Btn variant="secondary" onClick={copyShareLink}>
    <Share2 size={16} /> Copia link d'invito
  </Btn>
)}
```

- [ ] **Step 4: `Section.jsx` — togli `onOpenActivate`**

Cambia la firma da:

```js
export default function Section({ trip, section, onUpdate, activeDisplayName, onNavigate, syncState, onOpenActivate }) {
```

a:

```js
export default function Section({ trip, section, onUpdate, activeDisplayName, onNavigate, syncState }) {
```

Nella chiamata a `Lodging`, rimuovi la riga `onOpenActivate={onOpenActivate}`.

- [ ] **Step 5: `Lodging.jsx` — togli il pulsante di attivazione**

Cambia la firma da:

```js
export default function Lodging({ trip, section, onUpdate, activeDisplayName, remoteId, role, onOpenActivate }) {
```

a:

```js
export default function Lodging({ trip, section, onUpdate, activeDisplayName, remoteId, role }) {
```

Sostituisci il blocco:

```jsx
{!remoteId && (
  <div className="flex flex-col gap-2 rounded-2xl border border-[var(--line)] p-4">
    <p className="text-sm text-[var(--muted)]">Attiva la sincronizzazione per allegare documenti.</p>
    <Btn type="button" variant="secondary" onClick={onOpenActivate} className="self-start">Attiva la sincronizzazione</Btn>
  </div>
)}
```

con:

```jsx
{!remoteId && (
  <p className="text-sm text-[var(--muted)]">L'allegato sarà disponibile appena il viaggio si sincronizza.</p>
)}
```

(Questo branch resta come rete di sicurezza per il solo caso raro in cui
l'adozione automatica non sia ancora riuscita — vedi Task 7 — non è più
un'azione manuale.)

- [ ] **Step 6: Verifica manuale**

```bash
npm run build && npm run preview
```

Apri le Impostazioni di un viaggio sincronizzato: deve comparire "Copia
link d'invito" (non più "Attiva sync"), il link copiato deve aprire
`JoinView` (Task 11) per un altro account. Apri la sezione Pernottamento e
verifica che l'upload PDF funzioni direttamente, senza nessuno step di
attivazione — è la domanda originale da cui è partito questo lavoro.

- [ ] **Step 7: Commit**

```bash
git add -A src/views/ActivateSyncModal.jsx src/views/TripView.jsx src/views/Settings.jsx src/views/Section.jsx src/views/Lodging.jsx
git commit -m "rimuovi il flusso manuale di attivazione della sincronizzazione"
```

---

### Task 11: Semplifica `JoinView.jsx`

**Files:**
- Modify: `src/views/JoinView.jsx`

**Interfaces:**
- Consumes: `joinTripByCode` da `../data/sync.js` (invariata);
  `getDisplayNamePreference`, `setSyncState` da `../data/storage.js`.
- Produces: nessuna nuova interfaccia esterna — `onJoined`/`onCancel` restano
  identiche per `App.jsx`, che non cambia.

- [ ] **Step 1: Riscrivi il componente**

```jsx
import { useState } from 'react'
import Btn from '../components/Btn.jsx'
import { joinTripByCode } from '../data/sync.js'
import { getDisplayNamePreference, setSyncState } from '../data/storage.js'

export default function JoinView({ code, onJoined, onCancel }) {
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  async function handleJoin() {
    setError('')
    setJoining(true)
    try {
      const name = await getDisplayNamePreference()
      const { trip, syncState } = await joinTripByCode(code, name)
      await setSyncState(trip.id, syncState)
      onJoined(trip)
    } catch (e) {
      setError(e.message)
      setJoining(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 font-sans">
      <div className="max-w-sm w-full flex flex-col gap-4">
        <h1 className="font-display text-2xl">Ti hanno invitato a un viaggio</h1>
        <p className="text-sm text-[var(--muted)]">Codice: {code}</p>
        {error && <p className="text-sm text-[var(--accent)]">{error}</p>}
        <Btn onClick={handleJoin} disabled={joining}>{joining ? 'Un attimo…' : 'Unisciti al viaggio'}</Btn>
        <Btn variant="ghost" onClick={onCancel}>Annulla</Btn>
      </div>
    </div>
  )
}
```

Nota: `App.jsx` mostra `LoginGate` prima di `JoinView` ogni volta che manca
la sessione (Task 6), quindi quando `JoinView` viene montato sessione e nome
sono già garantiti — niente più step email/nome qui dentro.

- [ ] **Step 2: Verifica manuale**

```bash
npm run build && npm run preview
```

Da una finestra anonima, apri un link `/j/<codice>` di un viaggio esistente:
prima compare `LoginGate` (login + nome), poi `JoinView` con un solo tasto
"Unisciti al viaggio". Conferma: il viaggio compare in Home. Prova anche con
un codice inesistente: deve comparire l'errore restituito da
`joinTripByCode` senza bloccare l'app.

- [ ] **Step 3: Commit**

```bash
git add src/views/JoinView.jsx
git commit -m "semplifica JoinView: sessione e nome sono già noti dal gate di login"
```

---

### Task 12: Verifica end-to-end e build finale

**Files:** nessuno (solo verifica)

- [ ] **Step 1: Suite di test**

```bash
npm test
```

Expected: tutti i test passano, inclusi quelli nuovi dei Task 2-4.

- [ ] **Step 2: Build e preview**

```bash
npm run build && npm run preview
```

- [ ] **Step 3: Percorso completo, due account**

Con due indirizzi email diversi (o due finestre anonime): il primo account fa
login, ottiene i due viaggi seed sincronizzati; crea un terzo viaggio; lo
condivide via "Copia link d'invito"; il secondo account apre quel link, fa
login la prima volta, si unisce. Verifica che entrambi vedano il viaggio
condiviso, che l'owner possa eliminarlo e che sparisca per entrambi al
bootstrap successivo del secondo account (basta ricaricare l'app online).

- [ ] **Step 4: Percorso offline**

DevTools → Network → Offline: riapri l'app già loggata → Home con l'ultima
lista nota, nessun gate di login. Apri un viaggio, modifica qualcosa (es. una
checklist), torna online → verifica nell'indicatore di stato di `TripView`
che passi da "modifiche in coda" a "sincronizzato".

- [ ] **Step 5: Migrazione di un device "vecchio modello"**

Simula un device con dati del modello precedente: in DevTools → Application →
IndexedDB → `keyval-store`, aggiungi a mano un viaggio a `wego:trips` senza
nessuna chiave `wego:sync:<id>` corrispondente (o semplicemente incolla un
viaggio con "Carica il viaggio" e poi cancella manualmente la sua chiave
`wego:sync:<id>` da IndexedDB per simulare "creato prima di questa modifica").
Ricarica l'app: al bootstrap successivo quel viaggio deve ottenere un
`syncState` valido (visibile in IndexedDB) e un link d'invito funzionante
dalle sue Impostazioni, senza che nessuna modifica sia andata persa.

- [ ] **Step 6: Aggiorna `CLAUDE.md` se necessario**

Se durante l'implementazione sono emersi dettagli che meritano di restare
documentati come decisioni bloccate (es. la Fase 1 ora descrive un login
opzionale: va aggiornata a "obbligatorio, persistito offline"), aggiornali in
`CLAUDE.md` §Roadmap, in un commit separato.
