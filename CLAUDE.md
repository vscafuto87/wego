# WeGo — app PWA per i viaggi con compagna e amici

## Cos'è

App web installabile (PWA) che raccoglie tutte le informazioni di un viaggio.
All'apertura si sceglie il viaggio; da lì l'app si "riveste" con l'identità di quel
viaggio (palette, texture, tab) e mostra itinerario, biglietti, programma, consigli.
Due modi per inserire i dati: modifica manuale dentro l'app e **caricamento rapido**
(si incolla un JSON generato da Claude a partire da appunti grezzi).

Uso reale: la si apre in montagna e su un'isola, spesso **senza rete**. L'offline non
è un extra, è il requisito principale.

Primi due viaggi già pronti in `seed/trips.json` (Dolomiti Friulane 24–28/08/2026,
Ponza 30/08–05/09/2026).

---

## Decisioni bloccate — non rimetterle in discussione senza chiedere

| Ambito | Scelta | Perché |
|---|---|---|
| Build | Vite + React 18 + JavaScript (no TypeScript) | velocità di modifica per un dev part-time; il modello dati è validato a runtime, non a compile time |
| Stile | Tailwind CSS | già usato nel prototipo |
| PWA | `vite-plugin-pwa` (Workbox), `registerType: 'autoUpdate'` | precache dell'app shell, aggiornamento trasparente |
| Persistenza locale | IndexedDB via `idb-keyval` | i viaggi devono sopravvivere offline e a Safari |
| Backend (fase 1) | Supabase (progetto esistente `txfgxxaabhltazckabud`), tabelle con prefisso `tv_` | già configurato |
| Auth | Supabase email+password per tutti (login obbligatorio all'apertura) | l'admin crea l'account e comunica la password fuori dall'app; è il flusso più semplice da spiegare ad amici non tecnici |
| Hosting | Vercel, deploy da GitHub | zero config, HTTPS necessario per la PWA |
| Icona/nome | "WeGo", icona con le curve di livello | vedi Design system |

**Local-first**: l'app funziona per intero senza account e senza rete. Supabase è
sincronizzazione, non prerequisito. Se Supabase è irraggiungibile, l'app deve
funzionare lo stesso sui dati in IndexedDB. Il login (Fase 1) è obbligatorio una tantum
quando Supabase è configurato, ma non ricompare più una volta fatto: resta valido
offline finché il device ha una sessione o un nome salvato.

---

## Comandi

```bash
npm install
npm run dev        # sviluppo su http://localhost:5173
npm run build      # build di produzione in dist/
npm run preview    # verifica la PWA sulla build (il service worker NON gira in dev)
```

Test manuale della PWA prima di ogni deploy: `npm run build && npm run preview`,
poi DevTools → Application → Service Workers, e Network → Offline per verificare
che l'app si apra e mostri i viaggi.

**Bypass login per verifica in dev**: `VITE_DEV_SKIP_LOGIN=true` in `.env.local`
salta il `LoginGate` solo sotto `npm run dev` (`import.meta.env.DEV`, sempre `false`
in `npm run build`/`preview`/produzione — mai un rischio per l'app deployata). Serve
a Claude Code per verificare le schermate nel browser senza credenziali reali. Non
disattivarlo per "pulizia" e non estenderlo oltre il gate di login.

---

## Vincoli d'ambiente

- Si sviluppa su Mac. La rete aziendale passa da un proxy HTTP con SSL inspection:
  `curl` funziona ma **Docker non eredita il proxy**.
- Di conseguenza: **niente `supabase start` / stack Supabase locale** (richiede Docker).
  Si lavora sempre contro il progetto Supabase hosted. Le migrazioni SQL si applicano
  dalla dashboard o con `supabase db push`, mai con lo stack locale.
- Se `npm install` fallisce per il proxy, configurarlo (`npm config set proxy ...`) o
  lavorare dalla rete di casa. Non aggirare il problema aggiungendo mirror o disattivando
  la verifica TLS nel repo.

---

## Struttura

```
src/
  main.jsx
  App.jsx                 # routing di stato: home | trip | import
  data/
    schema.js             # normalizzazione + validazione di un viaggio (unica fonte di verità)
    storage.js            # IndexedDB: load/save, coda di scrittura offline
    sync.js               # Supabase: pull/push, risoluzione conflitti (fase 1)
    seed.js               # import di seed/trips.json alla prima apertura
  theme/
    themes.js             # palette per ambiente
    Terrain.jsx           # curve di livello / batimetria generate in SVG
  components/             # Btn, Label, Modal, Empty, Stripe, Stat
  views/
    Home.jsx  TripView.jsx  Overview.jsx  Days.jsx  Section.jsx
    Transport.jsx  Lodging.jsx  MapSection.jsx
    ImportView.jsx  ExportPanel.jsx
seed/trips.json
```

Regole di file: un componente per file, niente file oltre ~250 righe, niente cartella
`utils/` generica (le funzioni stanno vicino a chi le usa).

---

## Modello dati

Un viaggio è un **documento JSON autoconsistente**. Stesso identico schema per:
lo stato in memoria, IndexedDB, l'import, l'export e la colonna `data` su Supabase.
Nessuna trasformazione tra i livelli: questo è ciò che rende il caricamento rapido
possibile, quindi non introdurre un formato interno diverso.

```jsonc
{
  "name": "Ponza",
  "emoji": "🌊",
  "place": "Ponza (LT)",
  "start": "2026-08-30",              // sempre AAAA-MM-GG
  "end": "2026-09-05",
  "palette": "mountain | sea | city | wild",
  "people": ["Vincenzo", "..."],
  "days": [
    { "date": "2026-08-30", "title": "Arrivo", "note": "",
      "items": [ { "time": "14:30", "title": "Aliscafo", "detail": "", "link": "" } ] }
      // items di kind "sentiero"/"spiaggia"/"pasto" possono avere anche "lat"/"lng" (numero o null)
  ],
  "sections": [
    { "title": "Ristoranti", "icon": "food", "type": "cards",
      "items": [ { "title": "", "meta": "", "detail": "", "link": "", "tags": [], "lat": null, "lng": null, "date": null, "time": null } ] },
    { "title": "Da prenotare", "icon": "check", "type": "checklist",
      "items": [ { "text": "", "done": false } ] },
    { "title": "Note", "icon": "note", "type": "notes", "text": "" },
    { "title": "Trasporti", "icon": "bus", "type": "transport",
      "items": [ { "mode": "", "from": "", "to": "", "date": "", "time": "", "ticketLink": "", "note": "" } ] },
    { "title": "Pernottamento", "icon": "bed", "type": "lodging",
      "items": [ { "name": "", "checkIn": "", "checkOut": "", "address": "", "bookingLink": "", "note": "" } ] },
    { "title": "Mappa", "icon": "map", "type": "map",
      "items": [ { "name": "", "category": "", "mapsLink": "", "lat": null, "lng": null, "note": "" } ] }
  ]
}
```

Sei tipi di sezione: `cards`, `checklist`, `notes`, `transport`, `lodging`, `map`.
**Non aggiungerne altri**: la flessibilità sta nel numero di sezioni, non nella varietà
dei tipi. Un tipo nuovo va discusso prima, perché rompe l'import e le sezioni già scritte
(gli ultimi tre — transport/lodging/map — sono già stati discussi e approvati, vedi lo
spec in `docs/superpowers/specs/2026-08-18-sezioni-fisse-viaggio-design.md`).

Quattro sezioni sono fisse (garantite da `normalizeTrip()`, non cancellabili dalla
gestione manuale): Trasporti (`transport`), Pernottamento (`lodging`), Ristoranti
(`cards` con titolo "Ristoranti") e Mappa (`map`). `transport` gestisce spostamenti
(mezzo, da, a, data/ora, link biglietto); `lodging` gestisce alloggi (nome, check-in/out,
indirizzo, link prenotazione); `map` gestisce punti d'interesse con coordinate mostrate
su una mappa Leaflet (nome, categoria, link maps, lat/lng, nota). Anche gli item `cards`
e le voci giorno di kind `sentiero`/`spiaggia`/`pasto` possono avere `lat`/`lng`
opzionali (numero o null): se presenti, confluiscono nella mappa aggregata della tab
Mappa insieme ai punti propri della sezione. Le schede `cards` di Ristoranti possono
avere anche `date`/`time` opzionali (AAAA-MM-GG / HH:MM, o vuoti) per segnare una
prenotazione confermata: quando presenti, la scheda compare anche nell'itinerario del
giorno corrispondente.

`icon` ∈ `map, check, note, ticket, food, bed, bus, star, people`.
Gli `id` sono generati al caricamento e non vengono mai esportati.
`normalizeTrip()` in `schema.js` accetta un oggetto sporco, riempie i campi mancanti
con stringhe vuote e lancia un errore leggibile solo se manca `name`.

---

## Supabase (fase 1)

```sql
create table tv_trips (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id),
  share_code  text not null unique,     -- 6 caratteri, per invitare gli amici
  data        jsonb not null,           -- il viaggio, stesso schema di sopra
  updated_at  timestamptz not null default now()
);

create table tv_trip_members (
  trip_id  uuid references tv_trips(id) on delete cascade,
  user_id  uuid references auth.users(id),
  role     text not null default 'viewer',   -- viewer | editor
  primary key (trip_id, user_id)
);
```

I file in `supabase/sql/` si applicano in ordine numerico sul progetto hosted (dashboard
o `supabase db push`). `0003_trip_attachments_storage.sql` (bucket e policy per gli
allegati PDF alle prenotazioni) va applicato al progetto live prima che il caricamento
dei PDF funzioni: senza, l'upload fallisce con "Bucket not found".

RLS attiva su entrambe. Lettura: owner o membro. Scrittura su `tv_trips`: owner o
membro con ruolo `editor`. Ingresso in un viaggio tramite `share_code` (funzione RPC
`join_trip(code)` che inserisce il membro come `viewer`).

Sincronizzazione: il viaggio si scrive intero, last-write-wins su `updated_at`. Se il
remoto è più recente di quello locale non ancora sincronizzato, **non sovrascrivere in
silenzio**: mostrare all'utente quale versione tenere. Le spunte delle checklist sono
condivise (stanno dentro `data`); se in futuro dovranno essere personali, servirà una
tabella separata — non farlo ora.

---

## Dashboard admin (`/admin`)

Sezione separata dell'app, pensata per la preparazione dei viaggi a tavolino
(desktop, non mobile-first come il resto): lista viaggi, creazione, ed editor
completo di metadati, giorni/itinerario e tutte le sezioni. Vive in `src/admin/`,
riusa il layer dati esistente (`schema.js`, `storage.js`, `sync.js`), non introduce
un formato diverso. Non compare in nessun link dell'app normale: si raggiunge solo
digitando l'URL.

**Accesso**: stesso `LoginForm.jsx` (email+password) usato da tutti — amici e
admin — non un sistema separato. Per essere ammessi alla dashboard non basta
accedere: l'account deve avere `app_metadata.is_admin = true`, un campo **non
modificabile dal client**. La schermata Utenti dentro `/admin` crea account e
attiva/disattiva `is_admin` per gli utenti esistenti; resta manuale, una tantum,
solo il primissimo admin, perché prima che esista un admin nessuno può aprire
quella schermata: va creato ed elevato a mano dalla dashboard Supabase
(Authentication → Utenti → modifica utente → `raw_app_meta_data`).

Essere admin apre solo la porta della dashboard: dentro, l'editor di un singolo
viaggio sincronizzato resta comunque riservato al suo `owner_id` (stesso controllo
di proprietà di oggi), non a "chiunque sia admin".

Non esiste un gate d'accesso separato per l'admin: `/` e `/admin` usano lo stesso
`LoginForm`/`signInWithPassword`. A distinguere chi entra in dashboard è solo
`app_metadata.is_admin`, controllato dopo il login.

---

## Design system — è l'identità del prodotto, non decorazione

Font: `Barlow Condensed` (titoli e tab, come le etichette di una carta escursionistica),
`IBM Plex Sans` (testo), `IBM Plex Mono` (date, distanze, dislivelli, orari).

Palette per ambiente (`theme/themes.js`), tema chiaro perché l'app si legge al sole:

| chiave | paper | card | ink | muted | line | accent | accent2 | tint |
|---|---|---|---|---|---|---|---|---|
| mountain | #F0EDE3 | #FBFAF4 | #1C2721 | #6E7B72 | #DED7C6 | #B5502F | #2F6B52 | #E6E1D1 |
| sea | #E9F0F1 | #F9FCFC | #11262F | #5D7A83 | #CDDDDF | #1F6E8C | #D3982F | #DBE7E9 |
| city | #EFEBEF | #FBF9FB | #241F2B | #6F6878 | #DBD3DE | #6A4A9C | #B5502F | #E4DDE7 |
| wild | #EBEEE4 | #F9FBF5 | #1D2618 | #68755E | #D5DCC7 | #4B7A2B | #A8621F | #DFE5D3 |

Mobile-first: si progetta a 380px e si allarga fino a `max-w-2xl` centrato. Aree
toccabili da almeno 44px. Focus visibile sempre.

---

## Copy

Italiano, tono piano, seconda persona. I bottoni dicono cosa succede ("Carica il
viaggio", non "Invia"). Gli errori dicono cosa è andato storto e come si ripara, senza
scusarsi. Le schermate vuote sono un invito, non un avviso.

---

## Regole di lavoro per Claude Code

- Fai solo ciò che è stato chiesto. Non aggiungere feature, dipendenze o astrazioni
  non richieste; non rifattorizzare codice che funziona per il gusto di farlo.
- Prima di installare una dipendenza nuova, chiedi. Il budget è: React, Tailwind,
  lucide-react, idb-keyval, @supabase/supabase-js, vite-plugin-pwa, leaflet,
  react-leaflet. Nient'altro.
- Dopo ogni step scrivi in una riga cosa hai completato.
- Fermati e chiedi prima di: cancellare file, cambiare lo schema del viaggio, toccare
  le migrazioni Supabase, modificare i token del design system.
- Le chiavi stanno in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`),
  mai nel codice, mai nei commit.
- `SUPABASE_SERVICE_ROLE_KEY` è una variabile d'ambiente solo Vercel (Project
  Settings → Environment Variables), letta solo dentro `api/`: mai prefissata
  `VITE_`, mai in `.env.local`. Senza, ogni endpoint `api/admin/*` fallisce a runtime.
- Commit piccoli, messaggio in italiano all'imperativo: "aggiungi vista itinerario".
- Ogni fase finisce con `npm run build` che passa e una verifica offline in `preview`.

---

## Roadmap

**Fase 0 — PWA locale, deployabile.** Scaffold, design system, viste (home, viaggio,
itinerario, sezioni, import, export), IndexedDB, seed dei due viaggi, manifest e service
worker, deploy su Vercel. Fatto quando: gli amici aprono il link, aggiungono l'app alla
Home, attivano la modalità aereo e vedono ancora tutto.

**Fase 1 — Cloud.** Auth email+password obbligatorio quando Supabase è configurato (gate
di login prima di tutto il resto, sessione e nome persistiti offline), `tv_trips`, sync
di default per ogni viaggio fin dalla creazione, `share_code` per invitare, indicatore
di stato (sincronizzato / in coda / offline).

**Fase 2 — Insieme.** Ruolo `editor`, spese divise (recuperabili da TrailMates), foto per
giorno, mappa dei luoghi, esportazione dell'itinerario in calendario.

Non anticipare le fasi successive mentre lavori su quella corrente.

---

## Design Context

Il context strategico e visivo dettagliato per lo skill `impeccable` vive in due file
a parte, generati da `/impeccable init`:

- **[PRODUCT.md](PRODUCT.md)** — registro, utenti, scopo, personalità di brand,
  anti-riferimenti, principi di design strategici.
- **[DESIGN.md](DESIGN.md)** — token e sistema visivo (le 4 palette ambiente, la
  gerarchia tipografica, i componenti), con sidecar in `.impeccable/design.json`.

Le decisioni bloccate in questo file restano la fonte di verità in caso di conflitto;
quei due file la espandono, non la sostituiscono.
