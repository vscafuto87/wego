# Gestione utenti dalla dashboard admin (login password per tutti)

Data: 2026-08-20
Stato: approvato, in attesa di piano di implementazione

## Contesto

Oggi l'unico modo per popolare la lista di chi vede un viaggio è il flusso
`share_code`/`/j/<codice>`: un invitato riceve un link, accede con magic
link, si iscrive da sé come `viewer`. Non esiste un posto dove vedere "chi
sono tutti gli utenti dell'app" né dove decidere, per una persona, quali
viaggi può vedere — bisogna passare dal link per ciascun viaggio.

Questo lavoro sposta quella gestione nella dashboard admin: una schermata
"Utenti" da cui l'admin crea account (email+password), decide chi è admin, e
per ciascun utente assegna direttamente l'accesso (nessuno / viewer / editor)
a ciascun viaggio — senza passare da un link di invito.

Decisione raccolta in brainstorming, e deviazione esplicita da CLAUDE.md:

- **Il login diventa email+password per tutti**, non solo per l'admin. Il
  magic link (`Auth | Supabase magic link via email`, riga bloccata in
  CLAUDE.md) viene ritirato: la motivazione originale ("nessuna password da
  spiegare agli amici") non vale più, perché ora è l'admin a impostare la
  password di ciascun amico e a comunicarla fuori dall'app — l'amico non
  deve inventarsi né spiegarsi nulla. CLAUDE.md va aggiornato di conseguenza
  quando si implementa.
- La "visibilità dei viaggi" gestita dall'admin **sostituisce** il flusso
  self-service via `share_code`. Il flusso `/j/<codice>` non viene toccato
  né rimosso in questo giro — resta codice esistente, semplicemente non è
  più la via principale con cui qualcuno ottiene accesso a un viaggio.

## Rapporto con `2026-08-20-login-obbligatorio-sync-default-design.md`

Quella spec (già scritta, non ancora implementata) resta valida quasi per
intero: bootstrap/adozione dei viaggi locali, sincronizzazione di default
alla creazione, rimozione di `ActivateSyncModal`, e le nuove policy `delete`
su `tv_trips`/`tv_trip_members` non dipendono dal metodo di login. **Solo la
sua sezione "1. Login gate" è sostituita** da quanto descritto qui sotto:
dove quella sezione parla di `MagicLinkForm`, si legga `LoginForm`
(email+password); il resto di quella spec (sezioni 2-6) si applica com'è
scritto. `JoinView.jsx` si riduce comunque a un'unica conferma come già
previsto lì, per lo stesso motivo (email e sessione già garantiti dal gate).

## 1. Login unico, email+password

- Nuovo componente condiviso `src/components/LoginForm.jsx`: stessi campi e
  stessa chiamata (`signInWithPassword`) di `AdminLoginForm.jsx`, che viene
  rimosso — `AdminApp.jsx` e il nuovo `LoginGate` di `App.jsx` usano lo
  stesso componente.
- `App.jsx`: prima di qualunque altro branch (`joinCode` compreso), se non
  c'è sessione si mostra `LoginGate` (schermo intero, riusa `LoginForm`). La
  persistenza offline della sessione non cambia: resta quella già gestita da
  `@supabase/supabase-js` via `localStorage`.
- **Rimossi**: `src/components/MagicLinkForm.jsx`, `sendMagicLink()` in
  `src/data/supabase.js`. Nessun altro punto dell'app li usa dopo questo
  lavoro (verificare con una ricerca nel repo durante l'implementazione,
  nel caso qualcosa li richiami ancora).
- Se `isCloudConfigured` è `false` (dev senza `.env.local`), il gate non
  blocca — stesso comportamento già previsto per il magic link, riguarda
  solo l'ambiente di sviluppo.

## 2. Endpoint privilegiati (Vercel Serverless Functions)

Nuova cartella `api/admin/`, funzioni Node su Vercel (stesso hosting/deploy
già in uso, nessun nuovo strumento):

- `api/_lib/requireAdmin.js` — helper condiviso, richiamato per primo da
  ogni endpoint sotto. Legge l'header `Authorization: Bearer <token>`,
  verifica il token con un client Supabase "anonimo" (`supabase.auth.getUser(token)`),
  controlla `data.user.app_metadata.is_admin === true`. Se manca l'header,
  il token non è valido, o l'utente non è admin: risposta `403` e stop.
  Questo controllo vive in un solo file apposta — è l'unico punto che decide
  chi può usare questi endpoint, sbagliarlo in una copia sarebbe un buco di
  sicurezza.
- `api/admin/users.js`:
  - `GET` → `requireAdmin`, poi con un client Supabase costruito con la
    `service_role key` (`process.env.SUPABASE_SERVICE_ROLE_KEY`, variabile
    d'ambiente Vercel, **mai** con prefisso `VITE_`, mai nel repo): legge
    tutti gli utenti (`supabase.auth.admin.listUsers()`), tutti i viaggi
    (`select id, data->>'name' as name from tv_trips`) e tutte le righe di
    `tv_trip_members`; risponde con `{ users: [{id, email, isAdmin}], trips:
    [{id, name}], access: [{userId, tripId, role}] }`.
  - `POST { email, password }` → `requireAdmin`, poi
    `supabase.auth.admin.createUser({ email, password, email_confirm: true })`
    (confermata subito: niente email di verifica da mandare, l'account lo
    crea l'admin).
- `api/admin/role.js` — `POST { userId, isAdmin }` → `requireAdmin`, poi
  `supabase.auth.admin.updateUserById(userId, { app_metadata: { is_admin: isAdmin } })`.
  Rifiuta (`400`) se `userId` coincide con l'id di chi chiama: non ci si può
  togliere l'admin da soli (vedi sezione 4).
- `api/admin/access.js` — `POST { userId, tripId, role }` con
  `role` ∈ `'viewer' | 'editor' | null`. `requireAdmin`, poi con la
  `service_role key`: se `role` è `null`, `delete` la riga
  `tv_trip_members` per quella coppia; altrimenti `upsert` con quel `role`
  (`display_name` lasciato vuoto — lo stesso pattern già usato da
  `join_trip`, che lo lascia impostare all'utente al primo accesso se manca).
- `api/admin/password.js` — `POST { userId, password }` → `requireAdmin`,
  poi `supabase.auth.admin.updateUserById(userId, { password })`.

Nessuna migrazione SQL: le RLS di `tv_trips`/`tv_trip_members` restano
esattamente come sono in `supabase/sql/`. Questi endpoint le bypassano
deliberatamente con la `service_role key`, solo dopo aver verificato loro
stessi che chi chiama è admin — la RLS continua a proteggere ogni altra via
di accesso (client normale, join via codice) esattamente come oggi.

## 3. Schermata "Utenti" nella dashboard

- `AdminApp.jsx` guadagna una navigazione minima in cima, tra la lista
  viaggi e la nuova vista: due voci, "Viaggi" (quello che c'è già) e
  "Utenti".
- Nuovo `src/admin/AdminUserList.jsx`:
  - Chiama `GET /api/admin/users` al montaggio (header `Authorization`
    preso dalla sessione corrente via `getSession()`).
  - Per ciascun utente: email, uno switch "Admin" (chiama
    `/api/admin/role`; disabilitato per la propria riga, vedi sezione 4),
    un bottone "Reimposta password" (apre un piccolo form con un campo
    password, chiama `/api/admin/password`), e sotto la lista di **tutti**
    i viaggi con un `<select>` per ciascuno — "Nessun accesso / Viewer /
    Editor" — che chiama `/api/admin/access` a ogni cambio.
  - Un pannello "Nuovo utente" persistente (stesso pattern desktop già
    usato da `AdminTripList`/gli editor di sezione: form sempre visibile,
    non un modale) con email e password, che chiama `POST /api/admin/users`
    e poi ricarica la lista.

## 4. Casi particolari

- **Auto-blocco admin**: un admin non può togliersi l'admin da solo, né
  dalla UI (switch disabilitato sulla propria riga) né dall'endpoint
  (`api/admin/role.js` lo rifiuta). Se serve comunque, resta possibile da
  terminale con la `service_role key`, come oggi.
- **Propagazione dei permessi**: un cambio di ruolo o di accesso a un
  viaggio si riflette per l'utente interessato al suo prossimo refresh del
  token o login, non in tempo reale — nessuna sottoscrizione realtime da
  costruire per questo.
- **`display_name` mancante**: un utente aggiunto dall'admin (non tramite
  `join_trip`) ha `display_name` vuoto in `tv_trip_members` finché non lo
  imposta lui stesso al primo accesso al viaggio (stesso comportamento già
  gestito oggi da `DisplayNameForm`/`getDisplayNamePreference`).
- **Reset password**: gestito solo dall'admin tramite
  `api/admin/password.js`; nessun flusso di "password dimenticata"
  self-service in questo giro.

## 5. Cosa non cambia

- Il formato del documento viaggio (`schema.js`) è invariato.
- Le RLS e le tabelle `tv_trips`/`tv_trip_members` sono invariate (nessuna
  migrazione).
- Il flusso `/j/<codice>` (`JoinView.jsx`, `join_trip`, `generateShareCode`)
  resta nel codice, non viene rimosso in questo lavoro — semplicemente non è
  più la via principale per dare accesso a un viaggio.
- Le sezioni 2-6 di `2026-08-20-login-obbligatorio-sync-default-design.md`
  si applicano come scritte.

## 6. Testing

- Nuovi test per `api/_lib/requireAdmin.js` (accetta un admin valido,
  rifiuta token assente/invalido/non-admin) — mockando
  `supabase.auth.getUser` come già fatto per gli altri test di `sync.js`.
- Nessun test automatico per gli endpoint stessi né per `AdminUserList.jsx`,
  coerente con la convenzione già in uso nel progetto (i componenti vista e
  le funzioni che parlano solo con Supabase via rete non hanno test
  automatici, si verificano a mano).
- Verifica manuale: creare un utente dalla dashboard, impostargli accesso
  `viewer` su un viaggio, accedere con quelle credenziali su un altro
  browser/dispositivo e controllare che quel viaggio (e solo quello)
  compaia; provare a disattivare l'admin sulla propria riga e verificare che
  sia bloccato; reimpostare una password e verificare che il vecchio
  accesso non funzioni più.
