# Product

## Register

product

## Users

Vincenzo e il suo gruppo di viaggio: la compagna e un piccolo gruppo di amici. Non
sono tecnici, non vogliono creare un account o capire un'interfaccia complessa: aprono
l'app per sapere "cosa facciamo oggi" e "dove dormiamo stanotte". Il contesto d'uso reale
è in montagna o su un'isola, spesso senza rete e con il telefono al sole: l'app deve
restare leggibile e usabile anche offline, a schermo pieno luce.

## Product Purpose

WeGo raccoglie in un unico posto tutte le informazioni di un viaggio di gruppo:
itinerario giorno per giorno, biglietti, programma, consigli su dove mangiare e dormire.
Ogni viaggio ha un'identità visiva propria (palette, texture, tab) in cui l'app si
"riveste" quando lo si apre. Il successo è: gli amici aprono il link, installano l'app
sulla home, e in modalità aereo vedono comunque tutto — itinerario, biglietti, sezioni —
senza attriti e senza dover pensare alla sincronizzazione.

## Brand Personality

Pratico, caldo, condiviso. Un'app da usare insieme — non un tool personale — pensata per
essere passata di mano in mano tra amici durante il viaggio. Il tono di voce è piano,
in seconda persona, senza tecnicismi: i bottoni dicono cosa succede ("Carica il
viaggio"), gli errori dicono cosa fare senza scusarsi, le schermate vuote invitano invece
di avvisare.

## Design Principles

- **Local-first**: l'app funziona per intero senza account e senza rete; il cloud è
  sincronizzazione, non prerequisito. Nessuna schermata di login bloccante.
- **Il terreno racconta l'ambiente**: creste per montagna e natura, linee batimetriche
  per il mare — è la palette (`theme/themes.js`) e non solo il colore a distinguere un
  viaggio dall'altro.
- **Superfici tattili, non silenziose**: dalla Fase 0 "modernizzata" la gerarchia si
  fa anche con bagliori colorati e profondità, non solo con tipografia e spaziatura —
  ma resta puntuale: il bagliore `accent → accent2` vive solo su card viaggio, bottone
  primario e tab attiva, mai diffuso su testo, icone o bordi.
- **Mobile-first, leggibile al sole, con testo e bottoni grandi**: si progetta a
  380px, tema chiaro perché l'app si usa all'aperto; aree toccabili ben oltre i 44px
  minimi (bottoni primari/secondari a 60px), testo di corpo a 16px non 14px.
- **Un solo schema, nessuna trasformazione**: lo stesso JSON del viaggio vale per stato
  in memoria, IndexedDB, import ed export — è ciò che rende possibile il caricamento
  rapido via Claude.

## Accessibility & Inclusion

Nessun livello WCAG formale fissato. Requisiti pratici già in uso: aree toccabili da
almeno 44px, focus sempre visibile, `prefers-reduced-motion` rispettato, tema chiaro ad
alto contrasto pensato per l'uso alla luce diretta del sole.
