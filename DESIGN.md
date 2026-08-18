---
name: WeGo
description: Il diario di viaggio condiviso che si veste dell'ambiente in cui vivi il viaggio.
colors:
  mountain-paper: "#F0EDE3"
  mountain-card: "#FBFAF4"
  mountain-ink: "#1C2721"
  mountain-muted: "#6E7B72"
  mountain-line: "#DED7C6"
  mountain-accent: "#B5502F"
  mountain-accent2: "#2F6B52"
  mountain-tint: "#E6E1D1"
  sea-paper: "#E9F0F1"
  sea-card: "#F9FCFC"
  sea-ink: "#11262F"
  sea-muted: "#5D7A83"
  sea-line: "#CDDDDF"
  sea-accent: "#1F6E8C"
  sea-accent2: "#D3982F"
  sea-tint: "#DBE7E9"
  city-paper: "#EFEBEF"
  city-card: "#FBF9FB"
  city-ink: "#241F2B"
  city-muted: "#6F6878"
  city-line: "#DBD3DE"
  city-accent: "#6A4A9C"
  city-accent2: "#B5502F"
  city-tint: "#E4DDE7"
  wild-paper: "#EBEEE4"
  wild-card: "#F9FBF5"
  wild-ink: "#1D2618"
  wild-muted: "#68755E"
  wild-line: "#D5DCC7"
  wild-accent: "#4B7A2B"
  wild-accent2: "#A8621F"
  wild-tint: "#DFE5D3"
typography:
  display:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.01em"
  headline:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "normal"
  sectionHeader:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "normal"
  title:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  tab:
    fontFamily: "'IBM Plex Sans', sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "'IBM Plex Sans', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.08em"
  mono:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "28px"
  "2xl": "36px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
  "2xl": "48px"
components:
  button-primary:
    backgroundColor: "radial-gradient(130% 160% at 18% -10%, {colors.mountain-accent}, {colors.mountain-accent2})"
    textColor: "{colors.mountain-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "60px"
    padding: "0 28px"
  button-secondary:
    backgroundColor: "{colors.mountain-tint}"
    textColor: "{colors.mountain-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "60px"
    padding: "0 28px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.mountain-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "0 20px"
  trip-card:
    backgroundColor: "radial-gradient(130% 160% at 18% -10%, {colors.mountain-accent}, {colors.mountain-accent2})"
    textColor: "{colors.mountain-paper}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  modal-sheet:
    backgroundColor: "{colors.mountain-card}"
    textColor: "{colors.mountain-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.xl}"
    padding: "20px"
---

# Design System: WeGo

## 1. Overview

**Creative North Star: "Il Diario di Viaggio Condiviso"**

WeGo si legge come un quaderno di viaggio passato di mano in mano tra amici, non come
un cruscotto software. Ogni viaggio ha un ambiente — montagna, mare, città, natura — e
l'app cambia letteralmente pelle per adattarvisi: il bagliore radiale della card, il
terreno disegnato sotto l'header e la tab attiva sono la prima cosa che comunica dove
sei diretto, prima ancora di leggere una parola. Il tono resta caldo e pratico, ma con
la Fase 1 "moderna" la mano è più decisa: tipografia più grande e più pesante, bottoni
più massicci, superfici più tattili — pensata per essere letta e toccata al volo, non
solo sfogliata con calma.

**Key Characteristics:**
- Quattro ambienti (mountain / sea / city / wild), stessa struttura di ruoli colore,
  valori diversi: il viaggio "sceglie" la propria identità visiva a runtime via CSS
  custom properties.
- Superfici accese: card viaggio, bottone primario e tab attiva usano lo stesso
  bagliore radiale `accent → accent2` dell'ambiente, decentrato in alto a sinistra
  invece che un gradiente lineare piatto — più profondità, più "superficie che si
  illumina" che semplice sfondo colorato.
- Raggi molto generosi (28–36px su card e trip-card, pillola sui bottoni) e bottoni
  alti 60px: il primo segnale che rende l'interfaccia un'app tattile e non un
  documento da leggere.
- Due famiglie tipografiche con ruoli netti: condensata (ora anche in semi-bold, non
  solo regular) per titoli e numeri di sezione, sans per corpo del testo e — nuovo —
  per le etichette della navigazione; mono resta riservato ai dati misurabili.

## 2. Colors

Quattro palette "ambiente" con la stessa struttura di otto ruoli (paper, card, ink,
muted, line, accent, accent2, tint); cambiano insieme quando cambia il viaggio aperto,
non si mescolano mai tra loro nella stessa schermata. La palette *mountain* è
l'ambiente di riferimento (usata nella shell dell'app, in Home, negli esempi sotto);
le altre tre coprono gli stessi ruoli con valori propri.

### Mountain (ambiente di riferimento)
- **Rust Terracotta** (`#B5502F`, `mountain-accent`): fuoco del bagliore radiale su card/bottone primario/tab attiva, stato "in corso"/"tra N giorni".
- **Deep Pine** (`#2F6B52`, `mountain-accent2`): bordo esterno dello stesso bagliore.
- **Warm Parchment** (`#F0EDE3`, `mountain-paper`): sfondo pagina; anche colore del testo sopra al bagliore accent/accent2.
- **Warm Off-White** (`#FBFAF4`, `mountain-card`): sfondo di liste raggruppate e modali.
- **Deep Pine-Black** (`#1C2721`, `mountain-ink`): testo principale; base di ogni ombra tinta.
- **Sage Grey-Green** (`#6E7B72`, `mountain-muted`): testo secondario, etichette, tab inattive.
- **Warm Sand** (`#DED7C6`, `mountain-line`): divisori interni da 1px nelle liste raggruppate.
- **Pale Sand Tint** (`#E6E1D1`, `mountain-tint`): sfondo pieno del bottone secondario e dei cerchi delle icone di navigazione.

### Sea
- **Deep Teal** (`#1F6E8C`, `sea-accent`) · **Warm Ochre** (`#D3982F`, `sea-accent2`) · **Sea Mist** (`#E9F0F1`, `sea-paper`) · **Foam White** (`#F9FCFC`, `sea-card`) · **Deep Petrol-Navy** (`#11262F`, `sea-ink`) · **Slate Teal** (`#5D7A83`, `sea-muted`) · **Soft Aqua-Grey** (`#CDDDDF`, `sea-line`) · **Pale Aqua Tint** (`#DBE7E9`, `sea-tint`).

### City
- **Violet Plum** (`#6A4A9C`, `city-accent`) · **Rust Terracotta** (`#B5502F`, `city-accent2`, condiviso con l'accento primario mountain) · **Pale Mauve-Grey** (`#EFEBEF`, `city-paper`) · **Near-White Lilac** (`#FBF9FB`, `city-card`) · **Deep Aubergine-Black** (`#241F2B`, `city-ink`) · **Dusty Mauve** (`#6F6878`, `city-muted`) · **Soft Lilac-Grey** (`#DBD3DE`, `city-line`) · **Pale Lilac Tint** (`#E4DDE7`, `city-tint`).

### Wild
- **Deep Leaf Green** (`#4B7A2B`, `wild-accent`) · **Burnt Amber-Brown** (`#A8621F`, `wild-accent2`) · **Pale Moss-Cream** (`#EBEEE4`, `wild-paper`) · **Near-White Sage** (`#F9FBF5`, `wild-card`) · **Deep Forest-Black** (`#1D2618`, `wild-ink`) · **Olive Grey-Green** (`#68755E`, `wild-muted`) · **Soft Moss-Grey** (`#D5DCC7`, `wild-line`) · **Pale Moss Tint** (`#DFE5D3`, `wild-tint`).

### Named Rules
**The One Environment Rule.** Una sola palette per schermata: quando si entra in un
viaggio, ogni componente su quella pagina legge le stesse otto variabili CSS
(`--paper`, `--card`, `--ink`, `--muted`, `--line`, `--accent`, `--accent2`, `--tint`).
Non si mescolano palette diverse nella stessa vista, nemmeno per un dettaglio.

**The Accent Confidence Rule.** `accent` e `accent2` insieme, nello stesso bagliore
radiale (`radial-gradient(130% 160% at 18% -10%, accent, accent2)`), formano l'unica
superficie "accesa" per schermata: la card del viaggio in Home, il bottone primario, la
tab attiva nella nav flottante. Non si usano come sfondo pieno altrove — il resto della
UI resta su `paper`/`card`/`tint`; il bagliore non decora mai testo, icone o bordi al
di fuori di queste tre superfici.

## 3. Typography

**Display Font:** Barlow Condensed (fallback: sans-serif)
**Body Font:** IBM Plex Sans (fallback: sans-serif)
**Label/Mono Font:** IBM Plex Mono (fallback: monospace)

**Character:** la condensata da carta escursionistica resta la voce dei titoli, ma ora
in semi-bold (600) invece che regular: più presenza, stessa forma. Il corpo del testo è
salito di un gradino (14px → 16px) perché doveva essere leggibile al volo, non solo al
sole. Le etichette della navigazione sono passate dalla condensata alla sans — la
nuova tab bar flottante somiglia più a un controllo segmentato che a un segnavia, e la
sans regge meglio a quella scala.

### Hierarchy
- **Display** (600, 2.25rem/36px, line-height 1): il wordmark "WeGo" in Home, il nome del viaggio nell'header di TripView **e** il nome del viaggio sulle card di Home — le tre ricorrenze del nome-viaggio condividono ora la stessa scala, non due scale diverse come prima.
- **Section Header** (600, 1.875rem/30px, line-height 1.15): titolo di una sezione dentro TripView (es. "Riserve e alternative").
- **Title** (600, 1.5rem/24px, line-height 1.2): titolo di modali, stati vuoti, titolo di un giorno in Giorni.
- **Tab** (500, 1rem/16px, sans): etichette della nav flottante in basso — non più condensata.
- **Body** (400, 1rem/16px, line-height 1.5, max ~65ch): luogo, dettagli, testo dei form; il registro di default per tutto ciò che non è titolo o dato.
- **Label** (400, 12px, tracking 0.08em, maiuscolo, mono): etichette di sezione, stato del viaggio, meta-informazioni brevi.

### Named Rules
**The Two Weight Rule.** Barlow Condensed carica due pesi, regular (400, riservato al
body quando serve in condensata, oggi non usato in un ruolo attivo) e semi-bold (600,
tutti i ruoli display/headline/section-header/title in questo file). Il 600 è una
scelta attiva per una UI più moderna e leggibile a colpo d'occhio, non un bold
decorativo: non introdurre un terzo peso senza motivo.

**The Mono-For-Data Rule.** Qualunque cosa sia un dato misurabile — data, intervallo di
giorni, orario, valore in una `Stat` — va in IBM Plex Mono, mai in sans o condensata.
Il valore di una `Stat` usa una variante enfatizzata a 1.25rem/20px dello stesso ruolo
Mono.

## 4. Elevation

Ogni ombra è tinta con `ink` o `accent` dell'ambiente attivo, mai grigio o nero
generico. Quattro ruoli, dal più leggero al più vistoso: **contact** (bottone
secondario, liste raggruppate) è un solo strato quasi impercettibile a contatto con la
superficie; **card** (schede di una sezione) aggiunge una seconda ombra più ampia e
morbida in `ink`; **modal** usa la stessa coppia di strati ma più estesa, per il foglio
che copre lo schermo **e ora anche per la nav flottante in basso**, che è a tutti gli
effetti un piccolo modale sempre visibile; **glow** è riservato alle tre superfici che
portano il bagliore radiale `accent → accent2` (card viaggio, bottone primario, tab
attiva) ed è tinto di `accent` invece che di `ink`, con uno strato di contatto più
marcato rispetto a prima (`0 2px 4px` invece di `0 1px 2px`) per reggere la scala più
grande delle superfici. Le curve del terreno restano il livello di profondità
"ambientale" dietro header e card: dove disegnano sopra il bagliore (Home), le linee
passano da stroke `line` a stroke `paper` con opacità ridotta (15–35% invece di
30–70%) per restare leggibili sul fondo saturo.

### Shadow Vocabulary
- **Contact** (`0 1px 2px rgb(ink / 5%)`): liste raggruppate.
- **Card** (`0 1px 2px rgb(ink / 5%), 0 10px 24px -14px rgb(ink / 25%)`): schede di una sezione.
- **Modal / Floating Nav** (`0 1px 2px rgb(ink / 6%), 0 20px 40px -18px rgb(ink / 30–35%)`): foglio modale e barra di navigazione flottante in basso (quest'ultima anche con `backdrop-blur` e sfondo `card` al 90% di opacità).
- **Glow** (`0 2px 4px rgb(ink / 8%), 0 30px 50px -20px rgb(accent / 55%)` sulla card viaggio; `0 24px 38px -16px rgb(accent / 55%)` sul bottone primario; `0 10px 20px -10px rgb(accent / 55%)` sulla tab attiva): le tre superfici col bagliore `accent → accent2`.

### Named Rules
**The Colored-Shadow Rule.** Ogni ombra usa `ink` (neutra) o `accent` (Glow)
dell'ambiente attivo, mai un grigio o nero generico: anche l'elevazione fa parte
dell'identità del viaggio aperto.

## 5. Components

### Buttons
- **Shape:** pillola (`rounded-full`), altezza 60px per primario/secondario (prima 48px), 48px per ghost/danger (prima 44px) — area toccabile più ampia della soglia minima, non solo garantita.
- **Primary:** bagliore radiale `accent → accent2` (`radial-gradient(130% 160% at 18% -10%, ...)`, non più lineare a 135°), testo `paper` dell'ambiente attivo, ombra Glow; unico bottone "acceso" in schermata.
- **Secondary:** sfondo pieno `tint`, testo `ink`, ombra Contact, stessa altezza 60px del primario — i due si leggono come pari peso visivo, diversi solo per colore.
- **Ghost:** sfondo trasparente, nessun bordo né ombra, testo `ink` — per azioni terziarie (es. chiudi, torna indietro).
- **Danger:** stessa forma di ghost, testo in `accent` invece di `ink` — nessun rosso di sistema, l'urgenza si segna col colore d'ambiente stesso.
- **Stato:** `active:scale-[0.97]` (150ms ease-out) oltre a `active:opacity-70` come feedback al tocco; `disabled:opacity-40` senza cambi di forma. Entrambi disattivati sotto `prefers-reduced-motion`.

### Trip Card (segnavia component)
- **Corner Style:** angoli molto grandi (`rounded-[36px]`, prima 24px).
- **Background:** bagliore radiale `accent → accent2` dell'ambiente del viaggio, con `Terrain` in SVG (stroke `paper`, opacità 15–35%) a piena estensione dietro il contenuto; testo in `paper`.
- **Header della card:** riga superiore con badge emoji in vetro (`rounded-2xl`, sfondo `paper` al 20% di opacità via `rgb(var(--paper-rgb)/0.2)`, `backdrop-blur`) a sinistra e pillola di stato in `paper` al 95% a destra — prima lo stato stava in basso accanto alla data, ora è la prima cosa che si legge.
- **Elevazione:** ombra Glow (tinta `accent`), più marcata di prima; nessun bordo in `line`, il bagliore stesso separa la card dalla pagina.
- **Internal Padding:** 24px (prima 20px).
- **Comportamento:** l'intera card è un bottone (`onOpen`); un secondo bottone "Elimina" vive sotto un divisore interno in `paper` a opacità ridotta, mai sovrapposto al contenuto principale.

### Modal / Bottom Sheet
- **Style:** foglio ancorato in basso su mobile (`rounded-t-[28px]`), centrato con angoli pieni da desktop in su (`rounded-[28px]`); sfondo `card`, ombra Modal; scrim di sfondo con leggero `backdrop-blur`.
- **Focus:** si chiude con `Escape` o tap fuori dall'area; bottone di chiusura sempre 44×44px, dentro un cerchio `tint`.
- **Struttura:** titolo in `title` (ora semi-bold), contenuto libero, footer opzionale con azioni allineate a destra.

### Inputs / Fields
- **Style:** bordo 1px in `line`, sfondo `paper`/`card`, angoli morbidi (`rounded-2xl`, 16px su tutti i campi, prima 12px), testo `body` (ora 16px, prima 14px).
- **Focus:** anello di focus in `accent` (`focus:ring-2`) oltre al contorno del browser — mai rimosso via CSS.

### Grouped List (liste raggruppate)
Sezioni, checklist e schede vivono in una card `card` con `rounded-[24px]` (prima 20px)
e ombra Contact o Card, righe separate da `divide-y` in `line` interno: lo stesso
pattern per la lista sezioni in Panoramica, la checklist e le schede di una sezione —
un solo modo di presentare "un gruppo di righe correlate".

### Navigation (floating pill bar)
- **Style:** non più una riga di tab sticky in cima sotto l'header, ma una barra
  flottante ancorata in fondo allo schermo (`fixed inset-x-0 bottom-0`), pillola
  (`rounded-full`) su sfondo `card` al 90% di opacità con `backdrop-blur-lg` e ombra
  Modal/Floating Nav — resta visibile mentre si scorre il contenuto della sezione,
  scorre orizzontalmente se le tab non entrano.
- **Active state:** la tab attiva porta il bagliore radiale `accent → accent2` con
  testo `paper` e ombra Glow; le altre restano testo `muted` su sfondo trasparente, in
  sans invece che condensata.
- **Perché in basso:** più raggiungibile col pollice su schermi grandi, e lascia
  all'header in cima solo il nome del viaggio — un cambio di posizione deliberato
  rispetto alla Fase 0, non solo un restyling della stessa barra.

### Terrain (signature component)
Curve di livello o linee batimetriche generate proceduralmente in SVG da un seed
(l'id del viaggio) e dalla palette attiva: creste irregolari e fitte per gli ambienti
mountain/wild, linee morbide e regolari per sea/city. Stesso seed produce sempre lo
stesso disegno — è la "firma" visiva non ripetibile di ogni viaggio, non un pattern
decorativo generico. Sull'header (sfondo `paper`) resta in `line`, opacità 30%→70%;
sulla card viaggio (sfondo bagliore) passa a stroke `paper`, opacità 15%→35%, per
restare leggibile senza appiattire il bagliore sottostante.

## 6. Do's and Don'ts

### Do:
- **Do** tenere ogni schermata dentro un solo ambiente/palette: tutte le variabili CSS (`--paper`…`--tint`) cambiano insieme, mai a metà.
- **Do** usare il bagliore radiale `accent → accent2` solo sulle tre superfici piene (card viaggio, bottone primario, tab attiva). Se compare una quarta superficie piena nella stessa vista, è un errore.
- **Do** portare ogni dato misurabile (data, orario, intervallo, valore) in IBM Plex Mono.
- **Do** mantenere aree toccabili di almeno 44×44px su ogni elemento interattivo (i bottoni primari/secondari sono ora 60px, ben oltre la soglia).
- **Do** comporre colori-con-opacità su variabili CSS come `rgb(var(--paper-rgb) / 0.2)`, mai come `bg-[var(--paper)]/20`: quest'ultima sintassi non applica l'opacità in questo progetto (Tailwind non sa scomporre una custom property in canali RGB) e produce uno sfondo invisibile o pieno.
- **Do** rispettare `prefers-reduced-motion`: transizioni e `active:scale` si disattivano, resta solo il cambio di stato.
- **Do** tingere ogni ombra con `ink` o `accent` dell'ambiente attivo, mai grigio/nero puro.

### Don't:
- **Don't** applicare il bagliore `accent → accent2` a testo, icone o bordi: è un trattamento di sfondo per superfici piene, non un accento decorativo diffuso.
- **Don't** introdurre vetro smerigliato (glassmorphism) decorativo ovunque: è ammesso solo sul badge emoji e sulla pillola di stato della trip-card e sulla nav flottante — tre usi puntuali, non un trattamento generale delle card.
- **Don't** animare oltre il feedback al tocco e le transizioni di stato (150–250ms): niente ingressi coreografati, niente scroll-driven animation.
- **Don't** introdurre un terzo peso di Barlow Condensed oltre 400/600 senza motivo.
- **Don't** mescolare ambienti/palette diverse nella stessa schermata, nemmeno per un singolo dettaglio decorativo.
- **Don't** introdurre un quinto tipo di sezione oltre `cards` / `checklist` / `notes` per "arricchire" una vista: la flessibilità sta nel numero di sezioni, non nella loro varietà.
