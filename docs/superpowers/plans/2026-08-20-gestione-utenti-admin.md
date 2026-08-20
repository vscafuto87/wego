# Gestione utenti dalla dashboard admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login email+password per tutti (non solo l'admin) e una schermata "Utenti" nella dashboard admin da cui creare account, assegnare il ruolo globale admin/non-admin, e decidere per ciascun utente quali viaggi può vedere/modificare.

**Architecture:** Il login diventa un gate bloccante in `App.jsx` (email+password, sostituendo il magic link ovunque). La gestione privilegiata (creare utenti, cambiare ruoli, decidere l'accesso a un viaggio di cui non si è owner) passa da nuove Vercel Serverless Function sotto `api/admin/`, che verificano loro stesse — prima di qualunque operazione — che chi chiama sia un admin autenticato, poi usano la `service_role key` di Supabase (mai esposta al client) per bypassare deliberatamente la RLS.

**Tech Stack:** React 18 + JavaScript (invariato), Vercel Serverless Functions (Node, stesso hosting già in uso), `@supabase/supabase-js` (già una dipendenza, riusata anche dentro le funzioni serverless).

**Spec:** [docs/superpowers/specs/2026-08-20-gestione-utenti-admin-design.md](../specs/2026-08-20-gestione-utenti-admin-design.md)

## Nota sullo stato del repo a inizio piano

Tra la scrittura della spec e la scrittura di questo piano, un altro lavoro
("login obbligatorio e sincronizzazione di default") è stato completato e
mergiato su `main` (`f8eb744`). Di conseguenza, rispetto a quanto la spec
descriveva come ancora da fare:

- `App.jsx` ha **già** un gate di login bloccante (`LoginGate.jsx`) e il
  bootstrap/riconciliazione dei viaggi — non va costruito da questo piano.
- `src/views/JoinView.jsx` è **già** semplificato a una sola conferma
  (nessun passo email).
- `src/views/ActivateSyncModal.jsx` è **già stato rimosso** dal repo.
- Restano da fare, rispetto al magic link: `LoginGate.jsx` lo usa ancora
  (tramite `MagicLinkForm`), insieme a `AdminTripEditor.jsx` (un ramo morto,
  vedi Task 1) e ai file del magic link stesso.

Il Task 1 di questo piano è quindi più piccolo di quanto la spec lasciasse
intendere: si tratta solo di sostituire gli ultimi usi di `MagicLinkForm`,
non di costruire un gate che già esiste.

## Global Constraints

- Niente TypeScript: solo JavaScript.
- Nessuna dipendenza nuova: le funzioni serverless usano `@supabase/supabase-js`, già presente.
- Nessuna migrazione SQL: `tv_trips`/`tv_trip_members` e le loro RLS restano esattamente come sono in `supabase/sql/`.
- `schema.js` non cambia.
- La `service_role key` vive solo in `process.env.SUPABASE_SERVICE_ROLE_KEY` (variabile Vercel), letta solo dentro `api/`, mai con prefisso `VITE_`, mai nel repo, mai nel bundle client.
- Copy in italiano, tono piano, seconda persona.
- Un admin non può togliersi l'admin da solo (né da UI né dall'endpoint).
- Test automatici solo per la logica non-UI con vera logica da verificare (l'helper `requireAdmin`); i componenti vista e gli endpoint stessi si verificano a mano, coerente con la convenzione già in uso nel progetto.

---

## Task 1: Ultimo miglio del login — `LoginForm` condiviso, rimozione del magic link

**Files:**
- Create: `src/components/LoginForm.jsx`
- Modify: `src/admin/AdminApp.jsx`
- Modify: `src/admin/AdminTripEditor.jsx`
- Modify: `src/views/LoginGate.jsx`
- Modify: `CLAUDE.md`
- Delete: `src/admin/AdminLoginForm.jsx`
- Delete: `src/components/MagicLinkForm.jsx`
- Modify: `src/data/supabase.js` (rimuovi `sendMagicLink`)

**Interfaces:**
- Produces: `LoginForm()` — nessuna prop, componente autosufficiente (email + password, chiama `signInWithPassword` da `../data/supabase.js`, già esistente e non cambia firma).

- [ ] **Step 1: Crea `src/components/LoginForm.jsx`**

```jsx
import { useState } from 'react'
import Btn from './Btn.jsx'
import { signInWithPassword } from '../data/supabase.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithPassword(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
      <h2 className="font-display font-semibold text-2xl mb-1">Accedi</h2>
      {error && <p className="text-base text-[var(--accent)]">{error}</p>}
      <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      <input required type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      <Btn type="submit" disabled={loading} className="self-start">
        {loading ? 'Accesso in corso…' : 'Accedi'}
      </Btn>
    </form>
  )
}
```

- [ ] **Step 2: Aggiorna `src/views/LoginGate.jsx` per usare `LoginForm` invece di `MagicLinkForm`**

Sostituisci l'intero file:

```jsx
import { useEffect, useState } from 'react'
import LoginForm from '../components/LoginForm.jsx'
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
      if (!navigator.onLine && name) {
        // Offline e già entrato una volta su questo device (c'è un nome
        // salvato): la sessione può risultare vuota solo perché il token è
        // scaduto e non c'è rete per rinnovarlo, non perché non si è mai
        // fatto login. L'offline è il requisito principale di questa app:
        // non si blocca l'accesso ai dati già sul device per questo.
        onReady()
        return
      }
      setNamePreference(name)
      setStep(session ? 'name' : 'login')
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
        {step === 'login' && (
          <>
            <p className="text-sm text-[var(--muted)]">Serve un account per vedere e sincronizzare i tuoi viaggi.</p>
            <LoginForm />
          </>
        )}
        {step === 'name' && <DisplayNameForm initialValue={namePreference} onSubmit={handleName} />}
      </div>
    </div>
  )
}
```

(Unica differenza logica dal file attuale: lo step si chiama `'login'` invece di `'email'`, e mostra `LoginForm` invece di `MagicLinkForm`. Il resto — il controllo offline, il passo del nome — resta identico.)

- [ ] **Step 3: Aggiorna `src/admin/AdminApp.jsx` per usare `LoginForm` invece di `AdminLoginForm`**

Sostituisci l'import:
```js
import LoginForm from '../components/LoginForm.jsx'
```
al posto di `import AdminLoginForm from './AdminLoginForm.jsx'`, e nel branch `if (!session) { ... }` sostituisci `<AdminLoginForm />` con `<LoginForm />`.

- [ ] **Step 4: Elimina `src/admin/AdminLoginForm.jsx`**

Il file non serve più: nessun altro punto lo importa dopo lo Step 3.

- [ ] **Step 5: Rimuovi l'uso di `MagicLinkForm` da `src/admin/AdminTripEditor.jsx`**

Nel file, rimuovi l'import `import MagicLinkForm from '../components/MagicLinkForm.jsx'` e rimuovi per intero questo blocco JSX (il ramo non può più essere raggiunto: `AdminTripEditor` viene montato solo dentro `AdminApp`, che garantisce già una sessione prima di arrivarci):

```jsx
{!loadingOwnership && syncState && !session && (
  <div className="max-w-sm flex flex-col gap-3">
    <p className="text-base">Questo viaggio è sincronizzato: per modificarlo da qui devi prima accedere.</p>
    <MagicLinkForm />
  </div>
)}
```

Non toccare altro in questo file (il calcolo di `canEdit`, `loadingOwnership`, ecc. restano invariati — sono ancora corretti, solo quel ramo diventa irraggiungibile e va rimosso perché importa un componente che stiamo eliminando).

- [ ] **Step 6: Elimina `src/components/MagicLinkForm.jsx`**

- [ ] **Step 7: Rimuovi `sendMagicLink` da `src/data/supabase.js`**

Elimina questa funzione (non serve più a nessuno dopo gli step precedenti):

```js
export async function sendMagicLink(email) {
  if (!isCloudConfigured) throw new Error('La sincronizzazione non è configurata su questo dispositivo.')
  // Il magic link deve riportare l'utente dov'era: per un invitato è /j/<codice>,
  // altrimenti il redirect di default lo scarica sulla lista dei viaggi.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 8: Verifica che non resti nessun riferimento**

Run: `grep -rn "MagicLinkForm\|sendMagicLink" src/`
Expected: nessun risultato.

- [ ] **Step 9: Aggiorna `CLAUDE.md`**

Nella tabella "Decisioni bloccate", sostituisci le due righe Auth con una sola:

```
| Auth | Supabase email+password per tutti (login obbligatorio all'apertura) | l'admin crea l'account e comunica la password fuori dall'app; nessun amico deve inventarsi o gestire un magic link |
```

(rimuovi sia la vecchia riga `Auth` col magic link sia la riga `Auth admin`, ora superflua — l'accesso admin usa lo stesso meccanismo, la distinzione è solo `app_metadata.is_admin`).

Nella sezione "Dashboard admin (`/admin`)", nella frase che inizia con "**Accesso**: email+password (`AdminLoginForm.jsx`)...", sostituisci `AdminLoginForm.jsx` con `LoginForm.jsx` (il componente condiviso).

Nella sezione "Roadmap", dove la Fase 1 dice "Auth magic link obbligatorio quando Supabase è configurato", cambia in "Auth email+password obbligatorio quando Supabase è configurato".

- [ ] **Step 10: Build e test**

Run: `npm run build`
Expected: nessun errore (nessun import rotto).

Run: `npm test`
Expected: tutti i test passano (nessuno testava `sendMagicLink`).

- [ ] **Step 11: Verifica manuale**

Run: `npm run dev`.
1. Su `http://localhost:5173/`, senza sessione attiva, deve apparire "Accedi a WeGo" con `LoginForm` (email+password), non più un invio di magic link.
2. Accedi con le tue credenziali admin (funzionano anche qui: è lo stesso account Supabase) — la Home deve apparire con i viaggi.
3. Su `http://localhost:5173/admin`, se non sei loggato, vedi lo stesso `LoginForm`. Accedi: la dashboard si apre come prima.

- [ ] **Step 12: Commit**

```bash
git add src/components/LoginForm.jsx src/admin/AdminApp.jsx src/admin/AdminTripEditor.jsx src/views/LoginGate.jsx src/data/supabase.js CLAUDE.md
git rm src/admin/AdminLoginForm.jsx src/components/MagicLinkForm.jsx
git commit -m "Sostituisci il magic link con l'accesso email+password ovunque"
```

---

## Task 2: Helper `requireAdmin` per gli endpoint privilegiati

**Files:**
- Create: `api/_lib/requireAdmin.js`
- Test: `api/_lib/requireAdmin.test.js`

**Interfaces:**
- Produces: `requireAdmin(req): Promise<{ id: string, email: string }>` — legge `req.headers.authorization`, verifica il token con Supabase, controlla `app_metadata.is_admin`. Risolve con l'utente admin se tutto è ok; altrimenti lancia un `Error` con una proprietà `.status` (`401` o `403`) e `.message` leggibile.
- Produces: `serviceClient(): SupabaseClient` — client Supabase costruito con la `service_role key`, da usare solo dopo che `requireAdmin` ha già validato la richiesta.

- [ ] **Step 1: Scrivi il test**

Crea `api/_lib/requireAdmin.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } })
}))

const { requireAdmin } = await import('./requireAdmin.js')

beforeEach(() => {
  mockGetUser.mockReset()
  process.env.VITE_SUPABASE_URL = 'https://x.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'
})

describe('requireAdmin', () => {
  it('rifiuta se manca l\'header Authorization', async () => {
    await expect(requireAdmin({ headers: {} })).rejects.toMatchObject({ status: 401 })
  })

  it('rifiuta se il token non è valido', async () => {
    mockGetUser.mockResolvedValue({ data: null, error: { message: 'token scaduto' } })
    await expect(requireAdmin({ headers: { authorization: 'Bearer xxx' } })).rejects.toMatchObject({ status: 401 })
  })

  it('rifiuta se l\'utente non è admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@x.it', app_metadata: {} } }, error: null })
    await expect(requireAdmin({ headers: { authorization: 'Bearer xxx' } })).rejects.toMatchObject({ status: 403 })
  })

  it('risolve con l\'utente se è admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@x.it', app_metadata: { is_admin: true } } }, error: null })
    const user = await requireAdmin({ headers: { authorization: 'Bearer xxx' } })
    expect(user).toEqual({ id: 'u1', email: 'a@x.it', app_metadata: { is_admin: true } })
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che falliscano nel modo atteso**

Run: `npx vitest run api/_lib/requireAdmin.test.js`
Expected: FAIL — `api/_lib/requireAdmin.js` non esiste ancora.

- [ ] **Step 3: Scrivi `api/_lib/requireAdmin.js`**

```js
import { createClient } from '@supabase/supabase-js'

export async function requireAdmin(req) {
  const header = req.headers.authorization || ''
  const token = header.replace(/^Bearer\s+/i, '')
  if (!token) {
    const err = new Error('Token mancante.')
    err.status = 401
    throw err
  }

  const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data?.user) {
    const err = new Error('Token non valido.')
    err.status = 401
    throw err
  }
  if (!data.user.app_metadata?.is_admin) {
    const err = new Error('Il tuo account non ha accesso admin.')
    err.status = 403
    throw err
  }
  return data.user
}

export function serviceClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run api/_lib/requireAdmin.test.js`
Expected: PASS, 4/4.

- [ ] **Step 5: Aggiungi la cartella `api/` alla config di test se serve**

Controlla `vitest` di default include tutti i file `*.test.js` nel progetto — se `npx vitest run` (senza percorso) non raccoglie `api/_lib/requireAdmin.test.js`, apri `vite.config.js` e verifica che non ci sia un `include`/`exclude` che tagli fuori `api/`. Se manca del tutto una config test restrittiva, non serve modificare nulla.

Run: `npm test`
Expected: include anche i 4 test nuovi, tutti verdi, nessun altro test rotto.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/requireAdmin.js api/_lib/requireAdmin.test.js
git commit -m "Aggiungi requireAdmin, il controllo condiviso degli endpoint admin"
```

---

## Task 3: Endpoint privilegiati (`users`, `role`, `access`, `password`)

**Files:**
- Create: `api/admin/users.js`
- Create: `api/admin/role.js`
- Create: `api/admin/access.js`
- Create: `api/admin/password.js`

**Interfaces:**
- Consumes: `requireAdmin(req)`, `serviceClient()` da `../_lib/requireAdmin.js` (Task 2).
- Produces (contratto HTTP, usato dal Task 4):
  - `GET /api/admin/users` → `200 { users: [{id, email, isAdmin}], trips: [{id, name}], access: [{userId, tripId, role}] }`
  - `POST /api/admin/users` body `{ email, password }` → `200 { id, email }`
  - `POST /api/admin/role` body `{ userId, isAdmin }` → `200 { ok: true }`
  - `POST /api/admin/access` body `{ userId, tripId, role }` (`role` ∈ `'viewer' | 'editor' | null`) → `200 { ok: true }`
  - `POST /api/admin/password` body `{ userId, password }` → `200 { ok: true }`
  - Ogni errore (auth, validazione, Supabase) → `{ error: "messaggio leggibile" }` con lo status appropriato (`401`/`403`/`400`/`405`/`500`).

- [ ] **Step 1: Crea `api/admin/users.js`**

```js
import { requireAdmin, serviceClient } from '../_lib/requireAdmin.js'

export default async function handler(req, res) {
  try {
    await requireAdmin(req)
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message })
    return
  }

  const supabase = serviceClient()

  if (req.method === 'GET') {
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers()
    if (usersError) { res.status(500).json({ error: usersError.message }); return }

    const { data: trips, error: tripsError } = await supabase.from('tv_trips').select('id, data')
    if (tripsError) { res.status(500).json({ error: tripsError.message }); return }

    const { data: members, error: membersError } = await supabase.from('tv_trip_members').select('trip_id, user_id, role')
    if (membersError) { res.status(500).json({ error: membersError.message }); return }

    res.status(200).json({
      users: usersData.users.map((u) => ({ id: u.id, email: u.email, isAdmin: Boolean(u.app_metadata?.is_admin) })),
      trips: trips.map((t) => ({ id: t.id, name: t.data?.name || 'Senza nome' })),
      access: members.map((m) => ({ userId: m.user_id, tripId: m.trip_id, role: m.role }))
    })
    return
  }

  if (req.method === 'POST') {
    const { email, password } = req.body || {}
    if (!email || !password) { res.status(400).json({ error: 'Email e password sono obbligatorie.' }); return }
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) { res.status(400).json({ error: error.message }); return }
    res.status(200).json({ id: data.user.id, email: data.user.email })
    return
  }

  res.status(405).json({ error: 'Metodo non supportato.' })
}
```

- [ ] **Step 2: Crea `api/admin/role.js`**

```js
import { requireAdmin, serviceClient } from '../_lib/requireAdmin.js'

export default async function handler(req, res) {
  let admin
  try {
    admin = await requireAdmin(req)
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message })
    return
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Metodo non supportato.' }); return }

  const { userId, isAdmin } = req.body || {}
  if (!userId || typeof isAdmin !== 'boolean') { res.status(400).json({ error: 'userId e isAdmin sono obbligatori.' }); return }
  if (userId === admin.id) { res.status(400).json({ error: 'Non puoi cambiare il tuo stesso ruolo admin da qui.' }); return }

  const supabase = serviceClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: { is_admin: isAdmin } })
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(200).json({ ok: true })
}
```

- [ ] **Step 3: Crea `api/admin/access.js`**

```js
import { requireAdmin, serviceClient } from '../_lib/requireAdmin.js'

export default async function handler(req, res) {
  try {
    await requireAdmin(req)
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message })
    return
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Metodo non supportato.' }); return }

  const { userId, tripId, role } = req.body || {}
  if (!userId || !tripId || !['viewer', 'editor', null].includes(role)) {
    res.status(400).json({ error: 'userId, tripId e role (viewer, editor o null) sono obbligatori.' })
    return
  }

  const supabase = serviceClient()

  if (role === null) {
    const { error } = await supabase.from('tv_trip_members').delete().eq('trip_id', tripId).eq('user_id', userId)
    if (error) { res.status(400).json({ error: error.message }); return }
    res.status(200).json({ ok: true })
    return
  }

  const { error } = await supabase
    .from('tv_trip_members')
    .upsert({ trip_id: tripId, user_id: userId, role }, { onConflict: 'trip_id,user_id' })
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(200).json({ ok: true })
}
```

- [ ] **Step 4: Crea `api/admin/password.js`**

```js
import { requireAdmin, serviceClient } from '../_lib/requireAdmin.js'

export default async function handler(req, res) {
  try {
    await requireAdmin(req)
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message })
    return
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Metodo non supportato.' }); return }

  const { userId, password } = req.body || {}
  if (!userId || !password) { res.status(400).json({ error: 'userId e password sono obbligatori.' }); return }

  const supabase = serviceClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, { password })
  if (error) { res.status(400).json({ error: error.message }); return }
  res.status(200).json({ ok: true })
}
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: nessun errore (questi file non sono importati dal bundle client, ma devono restare JS valido).

Run: `node --check api/admin/users.js && node --check api/admin/role.js && node --check api/admin/access.js && node --check api/admin/password.js`
Expected: nessun errore di sintassi.

- [ ] **Step 6: Commit**

```bash
git add api/admin/users.js api/admin/role.js api/admin/access.js api/admin/password.js
git commit -m "Aggiungi gli endpoint admin per utenti, ruolo, accesso ai viaggi e password"
```

---

## Task 4: Client `adminApi.js`

**Files:**
- Create: `src/admin/adminApi.js`

**Interfaces:**
- Consumes: `getSession()` da `../data/supabase.js` (firma invariata); gli endpoint del Task 3 (stesso contratto HTTP descritto lì).
- Produces:
  - `fetchUsers(): Promise<{users, trips, access}>`
  - `createUser(email, password): Promise<{id, email}>`
  - `setUserRole(userId, isAdmin): Promise<{ok: true}>`
  - `setTripAccess(userId, tripId, role): Promise<{ok: true}>` (`role` ∈ `'viewer' | 'editor' | null`)
  - `resetPassword(userId, password): Promise<{ok: true}>`
  - Ognuna lancia `Error(message)` leggibile se la richiesta fallisce (stesso stile di `sync.js`).

- [ ] **Step 1: Crea `src/admin/adminApi.js`**

```js
import { getSession } from '../data/supabase.js'

async function authFetch(path, options = {}) {
  const session = await getSession()
  if (!session) throw new Error('Devi accedere.')
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {})
    }
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Richiesta non riuscita.')
  return body
}

export function fetchUsers() {
  return authFetch('/api/admin/users')
}

export function createUser(email, password) {
  return authFetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function setUserRole(userId, isAdmin) {
  return authFetch('/api/admin/role', { method: 'POST', body: JSON.stringify({ userId, isAdmin }) })
}

export function setTripAccess(userId, tripId, role) {
  return authFetch('/api/admin/access', { method: 'POST', body: JSON.stringify({ userId, tripId, role }) })
}

export function resetPassword(userId, password) {
  return authFetch('/api/admin/password', { method: 'POST', body: JSON.stringify({ userId, password }) })
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: nessun errore.

Run: `node --check src/admin/adminApi.js`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/admin/adminApi.js
git commit -m "Aggiungi il client per gli endpoint admin"
```

---

## Task 5: `AdminUserList` — la schermata Utenti

**Files:**
- Create: `src/admin/AdminUserList.jsx`

**Interfaces:**
- Consumes: `fetchUsers`, `createUser`, `setUserRole`, `setTripAccess`, `resetPassword` da `./adminApi.js` (Task 4); `getSession` da `../data/supabase.js`.
- Produces: `AdminUserList()` — nessuna prop, si carica i dati da sé.

- [ ] **Step 1: Crea `src/admin/AdminUserList.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { fetchUsers, createUser, setUserRole, setTripAccess, resetPassword } from './adminApi.js'
import { getSession } from '../data/supabase.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { email: '', password: '' }

export default function AdminUserList() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [resetForm, setResetForm] = useState(null)

  function load() {
    fetchUsers().then(setData).catch((e) => setError(e.message))
  }

  useEffect(() => {
    load()
    getSession().then((s) => setCurrentUserId(s?.user?.id ?? null))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    try {
      await createUser(form.email, form.password)
      setForm(EMPTY_FORM)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRoleChange(userId, isAdmin) {
    setError('')
    try {
      await setUserRole(userId, isAdmin)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAccessChange(userId, tripId, role) {
    setError('')
    try {
      await setTripAccess(userId, tripId, role)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setError('')
    try {
      await resetPassword(resetForm.userId, resetForm.password)
      setResetForm(null)
    } catch (err) {
      setError(err.message)
    }
  }

  if (!data) {
    return error
      ? <p className="text-base text-[var(--accent)]">{error}</p>
      : <p className="text-base text-[var(--muted)]">Carico gli utenti…</p>
  }

  function accessFor(userId, tripId) {
    const row = data.access.find((a) => a.userId === userId && a.tripId === tripId)
    return row ? row.role : ''
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-4">
        {error && <p className="text-base text-[var(--accent)]">{error}</p>}
        {data.users.map((user) => (
          <div key={user.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display font-semibold text-xl">{user.email}</p>
              <label className="flex items-center gap-2 text-base">
                <input
                  type="checkbox"
                  checked={user.isAdmin}
                  disabled={user.id === currentUserId}
                  onChange={(e) => handleRoleChange(user.id, e.target.checked)}
                />
                Admin
              </label>
            </div>
            <button onClick={() => setResetForm({ userId: user.id, password: '' })} className="text-base text-[var(--accent)] underline mt-2">
              Reimposta password
            </button>
            <div className="mt-3 flex flex-col gap-2">
              {data.trips.map((trip) => (
                <div key={trip.id} className="flex items-center justify-between gap-2">
                  <span className="text-base">{trip.name}</span>
                  <select
                    value={accessFor(user.id, trip.id)}
                    onChange={(e) => handleAccessChange(user.id, trip.id, e.target.value || null)}
                    className={inputClass}
                  >
                    <option value="">Nessun accesso</option>
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        <h2 className="font-display font-semibold text-xl mb-1">Nuovo utente</h2>
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
        <input required type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
          <Plus size={17} /> Crea utente
        </button>
      </form>

      {resetForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setResetForm(null)}>
          <form onSubmit={handleResetPassword} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm flex flex-col gap-3 bg-[var(--card)] rounded-2xl p-5">
            <h2 className="font-display font-semibold text-xl">Reimposta password</h2>
            <input required type="password" placeholder="Nuova password" value={resetForm.password} onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })} className={inputClass} />
            <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-12 px-6 text-[var(--paper)] bg-[var(--accent)]">
              Salva
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: nessun errore (il file non è ancora montato da nessuno — lo sarà nel Task 6 — ma deve essere JS valido).

- [ ] **Step 3: Commit**

```bash
git add src/admin/AdminUserList.jsx
git commit -m "Aggiungi la schermata Utenti della dashboard admin"
```

---

## Task 6: Integrazione — nav Viaggi/Utenti in `AdminApp`

**Files:**
- Modify: `src/admin/AdminApp.jsx`
- Modify: `src/admin/AdminTripList.jsx`

**Interfaces:**
- Consumes: `AdminUserList` (Task 5).

- [ ] **Step 1: Adatta `src/admin/AdminTripList.jsx` per vivere dentro la chrome di `AdminApp`**

Oggi `AdminTripList` si disegna come pagina intera per conto suo (`style={themeStyle('mountain')}`, header "Dashboard admin" + bottone "Esci"). Questo passa a `AdminApp`, che ora possiede la chrome comune (tab Viaggi/Utenti + Esci). Sostituisci l'intero file:

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
        <input required pattern=".*\S.*" title="Il nome non può essere vuoto" placeholder="Nome del viaggio" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
        <input placeholder="Emoji" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className={inputClass} />
        <input placeholder="Luogo" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} className={inputClass} />
        <div className="flex gap-2">
          <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={`flex-1 min-w-0 ${inputClass}`} />
          <input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={`flex-1 min-w-0 ${inputClass}`} />
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
  )
}
```

(Unica differenza dal file attuale: niente `style`/`className` di pagina intera, niente header "Dashboard admin", niente bottone "Esci", e la prop `onLogout` è sparita — se l'IDE/linter segnala che `onLogout` non è più usato da nessuna chiamata dopo lo Step 2, è corretto.)

- [ ] **Step 2: Aggiorna `src/admin/AdminApp.jsx`: chrome comune + tab Viaggi/Utenti**

Sostituisci l'intero file:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { loadTrips, saveTrips } from '../data/storage.js'
import { normalizeTrip } from '../data/schema.js'
import { getSession, subscribeAuth, signOut } from '../data/supabase.js'
import { themeStyle } from '../theme/themes.js'
import LoginForm from '../components/LoginForm.jsx'
import AdminTripList from './AdminTripList.jsx'
import AdminTripEditor from './AdminTripEditor.jsx'
import AdminUserList from './AdminUserList.jsx'

function isAdminSession(session) {
  return Boolean(session?.user?.app_metadata?.is_admin)
}

export default function AdminApp() {
  const [trips, setTrips] = useState(null)
  const [activeTripId, setActiveTripId] = useState(null)
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('trips')

  useEffect(() => {
    loadTrips().then(setTrips)
  }, [])

  useEffect(() => {
    let cancelled = false
    getSession().then((s) => { if (!cancelled) setSession(s) })
    const unsubscribe = subscribeAuth((s) => { if (!cancelled) setSession(s) })
    return () => { cancelled = true; unsubscribe() }
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

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-[#6E7B72]">Verifico l'accesso…</div>
  }

  if (!session) {
    return (
      <div style={themeStyle('mountain')} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans flex items-center justify-center px-6">
        <div className="max-w-sm w-full flex flex-col gap-4">
          <h1 className="font-display font-semibold text-4xl">Dashboard admin</h1>
          <LoginForm />
        </div>
      </div>
    )
  }

  if (!isAdminSession(session)) {
    return (
      <div style={themeStyle('mountain')} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans flex items-center justify-center px-6">
        <div className="max-w-sm w-full flex flex-col gap-4 text-center">
          <p className="text-base">Questo account non ha accesso alla dashboard admin.</p>
          <button onClick={signOut} className="text-base text-[var(--accent)] underline">Esci</button>
        </div>
      </div>
    )
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

  return (
    <div style={themeStyle('mountain')} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans">
      <div className="max-w-5xl mx-auto px-6 pt-10 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display font-semibold text-4xl mb-3">Dashboard admin</h1>
          <div className="inline-flex items-center gap-1 bg-[var(--card)] border border-[var(--line)] rounded-full p-1">
            <button onClick={() => setTab('trips')} className={`px-4 py-2 rounded-full text-base ${tab === 'trips' ? 'bg-[var(--tint)] font-medium' : ''}`}>Viaggi</button>
            <button onClick={() => setTab('users')} className={`px-4 py-2 rounded-full text-base ${tab === 'users' ? 'bg-[var(--tint)] font-medium' : ''}`}>Utenti</button>
          </div>
        </div>
        <button onClick={signOut} className="text-base text-[var(--muted)] underline">Esci</button>
      </div>
      <div className="max-w-5xl mx-auto px-6 py-6">
        {tab === 'trips'
          ? <AdminTripList trips={trips} onSelect={setActiveTripId} onCreate={createTrip} />
          : <AdminUserList />}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build e test**

Run: `npm run build && npm test`
Expected: entrambi senza errori.

- [ ] **Step 4: Verifica manuale**

Run: `npm run dev`, poi su `http://localhost:5173/admin`, dopo login:
1. Devi vedere le due tab "Viaggi"/"Utenti" in cima, e "Esci" a destra.
2. Tab "Viaggi": lista e creazione funzionano come prima (nessuna regressione).
3. Tab "Utenti": la pagina chiama `/api/admin/users` — in locale con `npm run dev` questa richiesta fallisce (le funzioni Vercel non girano sotto Vite): è normale vedere un messaggio d'errore invece della lista. La verifica reale di questa parte avviene dopo il deploy su Vercel (Task 7).
4. "Esci" riporta al form di login.

- [ ] **Step 5: Commit**

```bash
git add src/admin/AdminApp.jsx src/admin/AdminTripList.jsx
git commit -m "Aggiungi la tab Utenti alla navigazione della dashboard admin"
```

---

## Task 7: Verifica finale end-to-end

**Files:** nessuna modifica — solo verifica.

- [ ] **Step 1: Suite automatica e build**

Run: `npm test`
Expected: tutti i test passano (inclusi i 4 nuovi di `requireAdmin`).

Run: `npm run build`
Expected: nessun errore.

- [ ] **Step 2: Variabile d'ambiente su Vercel**

Prima di verificare gli endpoint dal vero, serve impostare `SUPABASE_SERVICE_ROLE_KEY` come variabile d'ambiente del progetto su Vercel (Project Settings → Environment Variables), con lo stesso valore già usato a mano in questa sessione — **senza** prefisso `VITE_`. Senza questa variabile, ogni endpoint sotto `api/admin/` risponde con un errore a runtime (la `service_role key` sarebbe `undefined`).

- [ ] **Step 3: Deploy e verifica sul sito pubblico**

Dopo il deploy (automatico al push su `main`, o `vercel --prod` se disponibile in locale):
1. Vai su `/`, verifica che senza sessione compaia il gate di login (non la Home).
2. Accedi con le tue credenziali admin — la Home deve apparire con i viaggi.
3. Vai su `/admin`, tab "Utenti": la lista utenti/viaggi deve caricarsi (qui l'endpoint gira davvero, non più in locale sotto Vite).
4. Crea un utente di prova, assegnagli accesso `viewer` su un viaggio.
5. Da un altro browser (o in incognito), accedi con quelle credenziali su `/` — solo quel viaggio deve comparire.
6. Prova a disattivare l'admin sulla tua stessa riga in "Utenti" — lo switch deve restare disabilitato/l'azione rifiutata.
7. Reimposta la password dell'utente di prova, verifica che la vecchia password non funzioni più.

- [ ] **Step 4: Riporta l'esito**

Annota qui eventuali scostamenti trovati durante la verifica, prima di considerare il lavoro concluso.
