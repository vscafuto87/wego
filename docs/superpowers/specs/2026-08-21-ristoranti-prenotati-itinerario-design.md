# Ristoranti prenotati nell'itinerario del giorno

Data: 2026-08-21

## Obiettivo

Una scheda della sezione Ristoranti può avere una prenotazione (data + ora). Quando
l'ha, compare anche nella lista trascinabile del giorno corrispondente, esattamente
come già succede oggi per i Trasporti. Dentro la sezione Ristoranti, le schede si
raggruppano visivamente in "Prenotati" e "Consigliati" in base alla presenza della
prenotazione.

## Contesto — cosa c'è già

Il pattern esiste già per i Trasporti (commit `2b424fd`, "Unifica voci giorno e
trasporti in un'unica lista trascinabile"):

- `day.order` (`schema.js`) è una sequenza di tag (`DAY_ORDER_TAGS`, oggi
  `['item', 'transport']`) che descrive come si interfogliano `day.items` e i
  trasporti di quella data. `buildDayTimeline(day, transportItems)` costruisce la
  lista unica seguendo `day.order`, appendendo in coda le voci nuove/non elencate.
- `collectExternalDayItems()` raccoglie dalla sezione Trasporti gli item con `date`
  impostata e li trasforma in voci di timeline (`{ id, date, time, mode, title,
  note, link, origin: { tab } }`) — mai copiate, solo derivate a runtime.
- `Days.jsx` usa `@dnd-kit` con un unico `SortableContext` sulla timeline
  combinata. `handleDragEnd` riordina la timeline, la rispezza in `day.items` +
  sottoinsieme di trasporti di quella data, scrive `day.items`/`day.order` e
  riordina (per indice) il sottoinsieme trasporti dentro la sezione Trasporti —
  con una guardia: se nel frattempo il conteggio dei trasporti di quella data è
  cambiato (edit concorrente), salta il riordino dei trasporti per non corromperlo.
- `TransportDayCard` è sola lettura nel giorno (maniglia di drag ma non di
  modifica contenuto): un pulsante "Vai a Trasporti" porta alla sezione per
  modificare davvero la voce.
- Le schede Ristoranti (`normalizeCardItem`) oggi non hanno alcun campo data:
  `{ id, title, meta, detail, link, tags, lat, lng }`.

## Decisioni

### 1. Le schede Ristoranti guadagnano `date` e `time`

`normalizeCardItem()` in `schema.js` aggiunge due campi opzionali, stringa vuota di
default (come ogni altro campo dello schema): `date` (AAAA-MM-GG) e `time`
(HH:MM) — stessa forma di Trasporti. Nessun nuovo campo booleano: "prenotato"
significa semplicemente "`date` non è vuota". Questi due campi si aggiungono a
**tutte** le sezioni di tipo `cards` (non solo Ristoranti) perché è lo stesso tipo
di sezione — ma solo la sezione fissa Ristoranti partecipa al merge nell'itinerario
(punto 2) e al raggruppamento visivo (punto 4); altre eventuali sezioni `cards`
personalizzate ignorano semplicemente questi campi.

### 2. Merge nella timeline del giorno

`DAY_ORDER_TAGS` passa da `['item', 'transport']` a `['item', 'transport', 'card']`.
`collectExternalDayItems()` guadagna un secondo parametro (le schede Ristoranti
prenotate di quella data) e produce anche voci `{ id, date, time, title, meta,
detail, link, origin: { tab: ristorantiSection.id } }` per ciascuna. La sezione
Ristoranti fissa si identifica come già fa `Section.jsx` (`type === 'cards' &&
title === 'Ristoranti'`). `buildDayTimeline()` interfoglia le tre fonti seguendo
`day.order`.

La scheda **resta** nella sezione Ristoranti (nel gruppo "Prenotati", vedi punto 4)
— non viene mai spostata o duplicata, stesso principio dei Trasporti.

### 3. Days.jsx: split a tre nel drag&drop

`handleDragEnd` si estende per rispezzare la timeline riordinata in tre gruppi
(`day.items`, sottoinsieme trasporti della data, sottoinsieme schede Ristoranti
della data) invece di due, con la stessa guardia anti-conflitto (se il conteggio di
un gruppo è cambiato rispetto a quando la timeline è stata calcolata, si salta il
riordino di quel gruppo).

Nuovo componente `RestaurantDayCard` (stesso ruolo di `TransportDayCard`): sola
lettura nel giorno, maniglia di drag, pulsante "Vai a Ristoranti" che naviga alla
sezione per modificare davvero la scheda.

### 4. Section.jsx: raggruppamento Prenotati/Consigliati, drag tra i due gruppi

Solo per la sezione fissa Ristoranti, le schede si dividono in due liste con
intestazione — "Prenotati" (`date` non vuota) e "Consigliati" (le altre) — ognuna
in **ordine manuale** (posizione nell'array `section.items`, filtrato per gruppo),
non ordinate per data/ora: stessa filosofia già in vigore per l'Itinerario ("l'ordine
manuale sostituisce l'ordinamento per orario"). `time`/`date` restano solo
informativi, mostrati come badge sulla scheda.

Due `SortableContext` di `@dnd-kit`, uno per gruppo, entrambi dentro un unico
`DndContext`: **trascinare una scheda nell'altro gruppo cambia la prenotazione**.
Verso "Prenotati": un prompt (`window.prompt`, come i `window.confirm` già usati per
le eliminazioni) chiede data e ora; annullare il prompt annulla lo spostamento.
Verso "Consigliati": svuota `date`/`time` senza chiedere conferma. Ogni gruppo resta
un'area di drop valida anche da vuoto (contenitore `useDroppable` dedicato), pattern
standard "board a più colonne" di dnd-kit.

Il form di modifica scheda espone comunque campi data/ora espliciti (per chi
preferisce non usare il drag). Sezioni `cards` non fisse (create manualmente
dall'utente, non "Ristoranti") non mostrano né il raggruppamento né questi campi:
restano una singola lista come oggi, anche se lo schema li supporta.

## Edge case

- **Scheda con `date` ma vuota di orario**: valida, va in "Prenotati" e compare
  nella timeline del giorno senza orario (come una voce senza `time`, appesa in
  coda secondo `day.order` — stesso comportamento già esistente per trasporti/voci
  senza orario).
- **`date` non corrisponde a nessun giorno del viaggio**: la scheda resta
  "Prenotata" nella sezione Ristoranti ma non compare in nessuna timeline (nessun
  giorno la richiede) — nessun errore, nessuna sezione "fuori viaggio" da gestire.
- **Edit concorrente** (conteggio schede Ristoranti della data cambiato tra
  costruzione della timeline e drop): si salta il riordino di quel gruppo, stesso
  pattern già in uso per i trasporti.
- **`modifiedBy`/`modifiedAt`**: impostare/rimuovere la prenotazione (modifica
  contenuto scheda) li aggiorna come ogni altra modifica; il solo riordino nella
  timeline del giorno no — coerente con la regola già in vigore per item/trasporti.

## File toccati

- `src/data/schema.js` — `normalizeCardItem()` (+`date`/`time`), `DAY_ORDER_TAGS`,
  `collectExternalDayItems()` (ora ritorna anche voci `type: 'card'`, oltre a
  `type: 'transport'`), `buildDayTimeline()` (terza coda).
- `src/views/Days.jsx` — split a tre in `handleDragEnd`, nuovo
  `RestaurantDayCard`, `TimelineBlock`/`SortableTimelineEntry`/`DragOverlay`
  estesi al terzo tipo, `DayItemsList` (parametro rinominato in `externalItems`
  perché non è più solo trasporti).
- `src/views/Section.jsx` — campi data/ora nel form scheda, raggruppamento
  Prenotati/Consigliati e drag tra gruppi solo per la sezione fissa Ristoranti.
- `src/views/Today.jsx` — stesso motivo di Days.jsx: `collectExternalDayItems()`
  ora mischia trasporti e ristoranti prenotati, quindi `groupByDaypart`,
  `AgendaRow`, `AgendaGroup` (icona e card intera in corso) devono distinguere
  i tre tipi invece di due, altrimenti un ristorante prenotato apparirebbe con
  l'icona del bus nell'agenda di Oggi.
- `src/admin/AdminDaysEditor.jsx` — stesso motivo: `reorderTimeline()` e il
  render della timeline (drag HTML5 nativo) gestiscono tre tipi invece di due.

Non toccati: `sync.js` (nessuna trasformazione, stesso schema `data` su Supabase),
`ExportPanel.jsx`/import (i due campi nuovi seguono lo stesso giro degli altri
campi scheda, nessuna gestione speciale).

## Testing

`npm run build && npm run preview`, verifica offline come da prassi del progetto.
Verifica manuale: prenotare una scheda Ristoranti con data che cade in un giorno
del viaggio → deve apparire nella timeline di quel giorno, restare anche nella
lista Ristoranti sotto "Prenotati", ed essere trascinabile in entrambi i posti
(riordino nel giorno e riordino nella sezione sono indipendenti). Nessun test
automatico nuovo: il progetto non ha test di componente, solo test dati con
vitest — se `collectExternalDayItems`/`buildDayTimeline` hanno già una suite,
estenderla con un caso a tre fonti.
