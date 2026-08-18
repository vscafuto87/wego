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
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "0.02em"
  headline:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "normal"
  tab:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "'IBM Plex Sans', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: "0.6875rem"
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
  lg: "20px"
  xl: "24px"
  "2xl": "28px"
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
    backgroundColor: "linear-gradient(135deg, {colors.mountain-accent}, {colors.mountain-accent2})"
    textColor: "{colors.mountain-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "{colors.mountain-tint}"
    textColor: "{colors.mountain-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "0 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.mountain-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 16px"
  trip-card:
    backgroundColor: "linear-gradient(135deg, {colors.mountain-accent}, {colors.mountain-accent2})"
    textColor: "{colors.mountain-paper}"
    rounded: "{rounded.xl}"
    padding: "20px"
  modal-sheet:
    backgroundColor: "{colors.mountain-card}"
    textColor: "{colors.mountain-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.2xl}"
    padding: "20px"
---

# Design System: WeGo

## 1. Overview

**Creative North Star: "Il Diario di Viaggio Condiviso"**

WeGo si legge come un quaderno di viaggio passato di mano in mano tra amici, non come
un cruscotto software. Ogni viaggio ha un ambiente — montagna, mare, città, natura — e
l'app cambia letteralmente pelle per adattarvisi: il gradiente della card, il terreno
disegnato sotto l'header e la tab attiva sono la prima cosa che comunica dove sei
diretto, prima ancora di leggere una parola. Il tono è caldo e pratico: niente
burocrazia visiva, niente schermate che chiedono conferme superflue.

**Key Characteristics:**
- Quattro ambienti (mountain / sea / city / wild), stessa struttura di ruoli colore,
  valori diversi: il viaggio "sceglie" la propria identità visiva a runtime via CSS
  custom properties.
- Superfici elevate: card viaggio, bottone primario e tab attiva usano un gradiente a
  due toni `accent → accent2` dell'ambiente con un'ombra soffusa dello stesso colore —
  profondità e colore raccontano l'ambiente insieme, non uno dei due soltanto.
- Raggi generosi (20–28px su liste/card/modali, pillola sui bottoni) al posto degli
  angoli squadrati: è il primo segnale che rende l'interfaccia un'app e non un
  documento.
- Tre famiglie tipografiche con ruoli netti e non intercambiabili: condensata per
  titoli e tab, sans per il corpo del testo, mono per dati (date, orari, distanze).

## 2. Colors

Quattro palette "ambiente" con la stessa struttura di otto ruoli (paper, card, ink,
muted, line, accent, accent2, tint); cambiano insieme quando cambia il viaggio aperto,
non si mescolano mai tra loro nella stessa schermata. La palette *mountain* è
l'ambiente di riferimento (usata nella shell dell'app, in Home, negli esempi sotto);
le altre tre coprono gli stessi ruoli con valori propri.

### Mountain (ambiente di riferimento)
- **Rust Terracotta** (`#B5502F`, `mountain-accent`): primo tono del gradiente su card/bottone primario/tab attiva, stato "in corso"/"tra N giorni".
- **Deep Pine** (`#2F6B52`, `mountain-accent2`): secondo tono dello stesso gradiente.
- **Warm Parchment** (`#F0EDE3`, `mountain-paper`): sfondo pagina; anche colore del testo sopra al gradiente accent/accent2.
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

**The Accent Confidence Rule.** `accent` e `accent2` insieme, in gradiente a 135°,
formano l'unica superficie "piena" per schermata: la card del viaggio in Home, il
bottone primario, la tab attiva. Non si usano come sfondo pieno altrove — il resto
della UI resta su `paper`/`card`/`tint`; il gradiente non decora mai testo, icone o
bordi al di fuori di queste tre superfici.

## 3. Typography

**Display Font:** Barlow Condensed (fallback: sans-serif)
**Body Font:** IBM Plex Sans (fallback: sans-serif)
**Label/Mono Font:** IBM Plex Mono (fallback: monospace)

**Character:** una condensata da carta escursionistica per titoli e tab (stessa
famiglia, un solo peso: regular — l'accento visivo viene dalla forma condensata delle
lettere, non dal grassetto), una sans neutra e leggibile per il corpo, una mono per
tutto ciò che è dato misurabile: date, orari, intervalli, valori.

### Hierarchy
- **Display** (400, 1.875rem/30px, line-height 1.15, tracking 0.02em): il wordmark "WeGo" in Home e il nome del viaggio nell'header di TripView.
- **Headline** (400, 1.5rem/24px, line-height 1.2): il nome del viaggio sulle card di Home.
- **Title** (400, 1.25rem/20px, line-height 1.25): titolo di modali e stati vuoti.
- **Tab** (400, 1rem/16px): etichette della navigazione a tab in TripView, in condensata — non in sans, per restare coerente con i titoli.
- **Body** (400, 0.875rem/14px, line-height 1.5, max ~65ch): luogo, dettagli, testo dei form; il registro di default per tutto ciò che non è titolo o dato.
- **Label** (400, 11px, tracking 0.08em, maiuscolo, mono): etichette di sezione, stato del viaggio, meta-informazioni brevi.

### Named Rules
**The One Weight Rule.** Solo il peso regular (400) è caricato per Barlow Condensed nei
titoli attivi nel codice; la gerarchia si fa con la dimensione e con la forma
condensata, non con il grassetto. Non introdurre `font-bold`/`font-semibold` sui
titoli senza motivo — romperebbe la voce silenziosa del sistema.

**The Mono-For-Data Rule.** Qualunque cosa sia un dato misurabile — data, intervallo di
giorni, orario, valore in una `Stat` — va in IBM Plex Mono, mai in sans o condensata.

## 4. Elevation

Ogni ombra è tinta con `ink` o `accent` dell'ambiente attivo, mai grigio o nero
generico. Quattro ruoli, dal più leggero al più vistoso: **contact** (bottone
secondario, liste raggruppate) è un solo strato quasi impercettibile a contatto con la
superficie; **card** (schede di una sezione) aggiunge una seconda ombra più ampia e
morbida in `ink`; **modal** usa la stessa coppia di strati ma più estesa, per il foglio
che copre lo schermo; **glow** è riservato alle tre superfici che portano il gradiente
`accent → accent2` (card viaggio, bottone primario, tab attiva) ed è tinto di `accent`
invece che di `ink` — l'elevazione più vistosa è sempre quella colorata dall'ambiente.
Le curve del terreno restano il livello di profondità "ambientale" dietro header e
card: dove disegnano sopra il gradiente (Home), le linee passano da stroke `line` a
stroke `paper` con opacità ridotta (15–35% invece di 30–70%) per restare leggibili sul
fondo saturo.

### Shadow Vocabulary
- **Contact** (`0 1px 2px rgb(ink / 5%)`): bottone secondario, liste raggruppate.
- **Card** (`0 1px 2px rgb(ink / 5%), 0 10px 24px -14px rgb(ink / 25%)`): schede di una sezione.
- **Modal** (`0 1px 2px rgb(ink / 6%), 0 24px 48px -16px rgb(ink / 35%)`): foglio modale.
- **Glow** (`0 1px 2px rgb(ink / 6%), 0 20px 40px -16px rgb(accent / 55%)` sulla card viaggio; `0 10px 24px -8px rgb(accent / 45%)` su bottone primario e tab attiva): le tre superfici col gradiente `accent → accent2`.

### Named Rules
**The Colored-Shadow Rule.** Ogni ombra usa `ink` (neutra) o `accent` (Glow)
dell'ambiente attivo, mai un grigio o nero generico: anche l'elevazione fa parte
dell'identità del viaggio aperto.

## 5. Components

### Buttons
- **Shape:** pillola (`rounded-full`), altezza 48px per primario/secondario, 44px per ghost/danger (area toccabile sempre garantita).
- **Primary:** gradiente `accent → accent2` a 135°, testo `paper` dell'ambiente attivo, ombra Glow; unico bottone "pieno" in schermata.
- **Secondary:** sfondo pieno `tint`, testo `ink`, ombra Contact — non più bordo-e-basta: un tono tonale pieno, coerente con le liste raggruppate.
- **Ghost:** sfondo trasparente, nessun bordo né ombra, testo `ink` — per azioni terziarie (es. chiudi, torna indietro).
- **Danger:** stessa forma di ghost, testo in `accent` invece di `ink` — nessun rosso di sistema, l'urgenza si segna col colore d'ambiente stesso.
- **Stato:** `active:scale-[0.97]` (150ms ease-out) oltre a `active:opacity-70` come feedback al tocco; `disabled:opacity-40` senza cambi di forma. Entrambi disattivati sotto `prefers-reduced-motion`.

### Trip Card (segnavia component)
- **Corner Style:** angoli grandi (`rounded-[24px]`).
- **Background:** gradiente `accent → accent2` a 135° dell'ambiente del viaggio, con `Terrain` in SVG (stroke `paper`, opacità 15–35%) a piena estensione dietro il contenuto; testo in `paper`.
- **Elevazione:** ombra Glow (tinta `accent`); nessun bordo in `line`, il gradiente stesso separa la card dalla pagina.
- **Internal Padding:** 20px.
- **Comportamento:** l'intera card è un bottone (`onOpen`); un secondo bottone "Elimina" vive sotto un divisore interno in `paper` a opacità ridotta, mai sovrapposto al contenuto principale.

### Modal / Bottom Sheet
- **Style:** foglio ancorato in basso su mobile (`rounded-t-[28px]`), centrato con angoli pieni da desktop in su (`rounded-[28px]`); sfondo `card`, ombra Modal; scrim di sfondo con leggero `backdrop-blur`.
- **Focus:** si chiude con `Escape` o tap fuori dall'area; bottone di chiusura sempre 44×44px, dentro un cerchio `tint`.
- **Struttura:** titolo in `title`, contenuto libero, footer opzionale con azioni allineate a destra.

### Inputs / Fields
- **Style:** bordo 1px in `line`, sfondo `paper`/`card`, angoli morbidi (`rounded-xl`, 12px; `rounded-2xl`, 16px sui campi di testo estesi), testo `body` (14px).
- **Focus:** anello di focus in `accent` (`focus:ring-2`) oltre al contorno del browser — mai rimosso via CSS.

### Grouped List (liste raggruppate)
Sezioni, checklist e schede che prima erano bordate diventano una card `card` con
`rounded-[20px]` e ombra Contact, righe separate da `divide-y` in `line` interno: lo
stesso pattern per la lista sezioni in Panoramica, la checklist e le schede di una
sezione (quest'ultime con ombra Card) — un solo modo di presentare "un gruppo di righe
correlate".

### Navigation (tab)
- **Style:** ogni tab è un bottone a pillola indipendente in riga scrollabile orizzontalmente, non più un'etichetta nuda con sottolineatura.
- **Active state:** la tab attiva porta il gradiente `accent → accent2` con testo `paper` e ombra Glow; le altre restano testo `muted` su sfondo trasparente.

### Terrain (signature component)
Curve di livello o linee batimetriche generate proceduralmente in SVG da un seed
(l'id del viaggio) e dalla palette attiva: creste irregolari e fitte per gli ambienti
mountain/wild, linee morbide e regolari per sea/city. Stesso seed produce sempre lo
stesso disegno — è la "firma" visiva non ripetibile di ogni viaggio, non un pattern
decorativo generico. Sull'header (sfondo `paper`) resta in `line`, opacità 30%→70%;
sulla card viaggio (sfondo gradiente) passa a stroke `paper`, opacità 15%→35%, per
restare leggibile senza appiattire il gradiente sottostante.

## 6. Do's and Don'ts

### Do:
- **Do** tenere ogni schermata dentro un solo ambiente/palette: tutte le variabili CSS (`--paper`…`--tint`) cambiano insieme, mai a metà.
- **Do** usare il gradiente `accent → accent2` solo sulle tre superfici piene (card viaggio, bottone primario, tab attiva). Se compare una quarta superficie piena nella stessa vista, è un errore.
- **Do** portare ogni dato misurabile (data, orario, intervallo, valore) in IBM Plex Mono.
- **Do** mantenere aree toccabili di almeno 44×44px su ogni elemento interattivo.
- **Do** rispettare `prefers-reduced-motion`: transizioni e `active:scale` si disattivano, resta solo il cambio di stato.
- **Do** tingere ogni ombra con `ink` o `accent` dell'ambiente attivo, mai grigio/nero puro.

### Don't:
- **Don't** applicare il gradiente `accent → accent2` a testo, icone o bordi: è un trattamento di sfondo per superfici piene, non un accento decorativo diffuso.
- **Don't** introdurre vetro smerigliato (glassmorphism) decorativo sulle card: il blur è ammesso solo sullo scrim dietro un modale.
- **Don't** animare oltre il feedback al tocco e le transizioni di stato (150–250ms): niente ingressi coreografati, niente scroll-driven animation.
- **Don't** usare il grassetto sui titoli in Barlow Condensed: la gerarchia è già nella dimensione e nella forma condensata.
- **Don't** mescolare ambienti/palette diverse nella stessa schermata, nemmeno per un singolo dettaglio decorativo.
- **Don't** introdurre un quinto tipo di sezione oltre `cards` / `checklist` / `notes` per "arricchire" una vista: la flessibilità sta nel numero di sezioni, non nella loro varietà.
