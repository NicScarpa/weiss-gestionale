# Agicap — lista della spesa video per la Fase 1 (browser reale)

Redatta l'**11 agosto 2026** a partire dal censimento in
[`video-demo-comparazioni.md`](./video-demo-comparazioni.md).

In Fase 0 il blocco è stato **di accesso, non di esistenza**: i video esistono e sono
identificati, ma YouTube restituisce a WebFetch solo il footer, i player incorporati non
espongono la sorgente nel markup, e i payload Goldcast arrivano troncati. Con un browser reale
quasi tutto questo cade.

Ordinamento: **quanto il contenuto mostra il prodotto in uso su dati realistici**, non la
data né il tono istituzionale.

---

## Metodi di estrazione

I metodi sono definiti qui una volta sola; la tabella li richiama per sigla.

### M1 — Payload Goldcast, senza far partire il video

**È il metodo che ha già funzionato in Fase 0**, ed è il più economico di tutti. Come ci sono
arrivato: ho fatto un WebFetch normale della pagina on-demand chiedendo i capitoli, e la
risposta conteneva — oltre ai capitoli — una nota che segnalava la presenza di *«interventi dei
relatori (Orlando, Giacomo e Enrico)»*. Cioè il **testo parlato era già dentro la conversione
markdown della pagina**, senza login, senza riproduzione. Un secondo fetch con un prompt che
chiedeva esplicitamente quel testo ha restituito ~6 minuti verbatim; oltre, la copia si
interrompeva per il limite di lunghezza dello strumento.

Procedura col browser:

1. `browser_navigate` sulla pagina on-demand. **Non cliccare play.**
2. Verificare se compare un form. Se compare, fermarsi (vedi "Non lo prendiamo, e perché").
3. Dumpare il payload completo, che è la parte che a WebFetch arrivava tagliata:
   `browser_evaluate` con `() => document.documentElement.outerHTML` — o, se troppo grande,
   estrarre solo i `<script>` con dentro JSON e cercare le chiavi che contengono i capitoli.
4. Il marcatore da cercare: i capitoli hanno **timestamp in secondi a virgola mobile**
   (es. `1425.315`), formato inconfondibile. La trascrizione, dove c'è, sta nello stesso
   oggetto o poco sotto.
5. Se il payload iniziale non contiene la trascrizione, guardare `browser_network_requests`:
   è plausibile — **non l'ho verificato** — che chapters e transcript arrivino da una chiamata
   XHR separata verso l'API di Goldcast. In quel caso il JSON grezzo della risposta è la fonte
   migliore.

Costo: 5-10 minuti a webinar. Resa: potenzialmente 60 minuti di parlato per webinar.

### M2 — Pannello trascrizione di YouTube

Sotto il video, menu `···` → **"Mostra trascrizione"**. Il pannello si renderizza nel DOM e
si legge con `browser_snapshot` o con un `browser_evaluate` che raccoglie i segmenti.
Non richiede riproduzione. Se la voce non c'è nel menu, il video **non ha sottotitoli** (né
manuali né automatici) e va trattato con M5.

Costo: 3-5 minuti a video.

### M3 — Tracce sottotitoli YouTube dal payload del player

Alternativa a M2, più affidabile quando il pannello non si apre. Nel sorgente della pagina
watch c'è l'oggetto `ytInitialPlayerResponse`. Da lì:

- `videoDetails.lengthSeconds` → **la durata**, che in Fase 0 non ho quasi mai avuto
- `videoDetails.shortDescription` → la descrizione completa (in Fase 0 ne avevo solo
  parafrasi di seconda mano dagli snippet di ricerca)
- `captions.playerCaptionsTracklistRenderer.captionTracks[]` → per ogni traccia un `baseUrl`
  che restituisce i sottotitoli temporizzati

Attenzione: YouTube cambia spesso questi nomi interni. Se non li trovi, ripiega su M2.
Le tracce automatiche italiane hanno codice tipo `a.it`: sono ASR e vanno trattate con la
stessa cautela della trascrizione Goldcast già raccolta (errori sistematici sui nomi propri —
in quella che ho, «Agicap» diventa «laggi capitali»).

Costo: 3-5 minuti a video.

### M4 — Sorgente di un player incorporato

Per i due video demo sul sito, che non sono su YouTube e non espongono iframe:

1. `browser_navigate` sulla pagina.
2. Aprire il monitor di rete, poi **far partire la riproduzione** — la richiesta del media è
   quasi certamente lazy e senza play non parte.
3. In `browser_network_requests` cercare `.mp4`, `.m3u8` o `.webm`. L'host atteso è il CDN dei
   media di Contentful (le immagini del sito stanno su `images.ctfassets.net`, quindi i video
   plausibilmente su `videos.ctfassets.net`) — **inferenza, da verificare**.
4. Verificare se il player espone una traccia testuale (`<track>` nel DOM, o pulsante CC).
   Se il video è un **muto con testi a schermo** — formato tipico dei video prodotto da 1-3
   minuti — non ci sarà nessuna traccia e serve M5.

### M5 — Cattura fotogrammi (costoso, ultima risorsa)

Riproduzione con pause e `browser_take_screenshot` a intervalli. Ha senso **solo** dove il
valore è nelle schermate e non nel parlato: video muti con testi a schermo, o segmenti di demo
dal vivo in cui il relatore dice «come vedete qui» senza descrivere.

Costo realistico: 15-20 minuti per un video di 3 minuti se si vuole coprire ogni schermata.
Per un webinar da 60 minuti è fuori discussione integralmente: al massimo si campionano i
minuti indicati dai capitoli.

---

## La lista, in ordine di priorità

### Priorità ALTA

| # | URL | Titolo | Lingua | Durata | Cosa mi aspetto di ricavarne | Come | 
|---|---|---|---|---|---|---|
| 1 | `agicap.com/it/video-dimostrazione/` | Video demo home IT | IT | 3 min dichiarati | Il giro completo del prodotto che Agicap sceglie di mostrare per primo. Su 3 minuti ogni secondo è scelto: è la gerarchia delle schermate secondo loro. Mi aspetto la dashboard principale con dati realistici — la cosa che non vedremo mai in un account di prova vuoto. | M4, poi M5 se muto |
| 2 | `agicap.com/en/video-demo/` | Video demo home EN | EN | 3 min | Confronto con il #1: se le schermate differiscono, la differenza dice cosa considerano vendibile in Italia e cosa no. Se è lo stesso montaggio, si salta. | M4, poi M5 |
| 3 | `agicap.ondemand.goldcast.io/on-demand/ed481b7e-6f91-4cc8-9338-1d4a115507e0` | Soluzioni per il controllo della liquidità e la crescita aziendale | IT | 63m28s | **I 57 minuti che mi mancano** dei 63. Ho i primi 6 e contengono già il trigger d'acquisto del cliente (passaggio a 4 banche). Il resto ha il racconto operativo di un cliente italiano reale su come usa il prodotto. | **M1** — l'unico su cui il metodo è già provato: partire da qui per validarlo |
| 4 | `agicap.registration.goldcast.io/events/50acf686-f428-40b7-ac59-0f9c5c6f9df8` | Agicap in azione: demo completa dei moduli di tesoreria | IT | 60m32s | **Il pezzo di maggior valore assoluto della lista.** I capitoli dicono ~34 minuti di demo dal vivo modulo per modulo: riconciliazione bancaria (23:45), gestione finanziaria (29:21), previsioni (36:37), ciclo attivo e pagamenti (39:32). | M1 per il testo. Il **video** è dietro registrazione: vedi sezione finale |
| 5 | `agicap.ondemand.goldcast.io/on-demand/b224bcec-dfa1-4cb0-bc2d-e95a854ce631` | Gestione delle uscite e monitoraggio dei costi | IT | 67m28s | Il capitolo "Aree Finanziarie e Fiscali" (20:00) è l'unico punto in tutto il materiale dove Agicap parla di fiscalità italiana. Per noi è il confine fra il loro modello e il nostro piano dei conti. | M1 |
| 6 | `youtube.com/watch?v=` *(ID da trovare)* | Automatizza la creazione delle registrazioni di prima nota con Agicap | IT | 3 min | **Il più rilevante per il nostro perimetro contabile**: come generano scritture di prima nota dai movimenti bancari, con che granularità e che regole di mappatura. È esattamente il problema che risolviamo noi. | ID non trovato in Fase 0: cercarlo su `@AgicapItalia`, poi M2/M3 |

### Priorità MEDIA

| # | URL | Titolo | Lingua | Durata | Cosa mi aspetto di ricavarne | Come |
|---|---|---|---|---|---|---|
| 7 | `youtube.com/watch?v=pR3xdyI-F18` | Come Agicap migliora la pianificazione del tuo flusso di cassa | IT | n.d. | Il funzionamento del rolling forecast: da quali fonti pesca e come le consolida. | M2, M3 per la durata |
| 8 | `agicap.ondemand.goldcast.io/on-demand/0b799831-db4b-4897-93d2-bc19729ad554` | Modernizza la tua azienda: perché investire in un TMS | IT | 61m20s | I capitoli "Digitalizzazione e Vantaggi" (21:13) e "Vantaggi Finanziari Concreti" (32:43): come quantificano il ROI davanti a una PMI italiana. Argomenti di vendita, non prodotto. | M1 |
| 9 | `agicap.ondemand.goldcast.io/on-demand/3ddb3a09-9fb8-4c65-9630-659d0ea8e501` | Gestione delle entrate e controllo della liquidità | IT | 67m00s | Lato incassi del budget di tesoreria. La seconda metà non è capitolata: contenuto ignoto, potenziale demo non annunciata. | M1 |
| 10 | `youtube.com/watch?v=1T1WP2T9t-g` | Come Agicap automatizza la gestione dei pagamenti fornitori | IT | n.d. | Il modulo Agicap Payment: workflow di approvazione, e soprattutto l'**esportazione delle scritture contabili** citata sulle pagine prodotto. | M2 |
| 11 | `youtube.com/watch?v=oPFbR2OrX3c` | Come Agicap automatizza la gestione dei crediti commerciali | IT | n.d. | Modulo CashCollect: sequenze di sollecito, canali (incluse le lettere fisiche via MySendingBox). | M2 |
| 12 | `youtube.com/watch?v=WYOY94_RKzI` | Come Agicap migliora la gestione della tua liquidità aziendale | IT | n.d. | La schermata di sincronizzazione banche + ERP: quali connettori mostrano davvero a un pubblico italiano. | M2 |
| 13 | `youtube.com/watch?v=3DcQ37S0yR8` | Trasforma il tuo budget in un piano di tesoreria | IT | 1:30 | Il passaggio budget → piano di tesoreria: la meccanica di conversione, che è una scelta di modello dati interessante per noi. | M2 |
| 14 | `agicap.com/it/event/treasury-day/` e `treasuryday.agicap.com/milan` | Treasury Day Milano, 25 giugno 2026 | IT/EN | n.d. | **Agicap MCP, Smart Report, Assistente AI**: i tre annunci di prodotto 2026. La pagina rimanda a "Rivivi i momenti chiave" senza esporre URL video — col browser si vede dove punta davvero. | Apri la pagina, segui il rimando; M4 sui player che trovi |
| 15 | `youtube.com/watch?v=9VztdsTKMwg` | Meet Agicap: The Next-Generation Treasury Management Platform | EN | n.d. | Il posizionamento istituzionale 2025 in forma compatta. Utile per capire il messaggio, poco per il prodotto. | M2 |

### Priorità BASSA

| # | URL | Titolo | Lingua | Cosa mi aspetto | Come |
|---|---|---|---|---|---|
| 16 | `youtube.com/watch?v=6b6L0oiOtTk` | Gestione semplificata del Cash Pooling | IT | `[FUORI SCALA]` Cash pooling: irrilevante per WEISS. Vale solo per mappare l'estensione della gamma. | M2 |
| 17 | — | La gestione del rischio di cambio con il modulo Fx | IT | `[FUORI SCALA]` Multi-valuta. ID YouTube non trovato. | cercare, poi M2 |
| 18 | `youtube.com/watch?v=r4dqKGi5gPQ` | Monitora tutti i tuoi finanziamenti | IT | Gestione finanziamenti e piani di ammortamento. Marginale per noi, ma è un modulo che un account di prova non raggiunge. | M2 |
| 19 | `youtube.com/watch?v=BJl6qa0G3qE` | Gestisci il flusso di cassa del tuo gruppo | IT | `[FUORI SCALA]` Consolidato di gruppo. | M2 |
| 20 | `youtube.com/watch?v=KFgG9zWK2wI` | Liquidità nel settore delle rinnovabili | IT | Caso settoriale lontano dall'horeca. | M2 |
| 21 | `youtube.com/watch?v=lMvyOJan_H0`, `pf8YTGzKZLA` | Versioni 2023 di video già in lista | IT | Solo se serve datare l'evoluzione dell'interfaccia: confrontare la stessa schermata a due anni di distanza mostra cosa hanno cambiato. Altrimenti saltare. | M5 mirato |
| 22 | `youtube.com/watch?v=xnpejFPSQO4` | Webinar GESTIRE LA TESORERIA 2026 (Lineacomputer) | IT | **Non è Agicap**: è un rivenditore. Interessante per un solo motivo — cita l'integrazione con **Passepartout Mexal**, gestionale diffuso nelle PMI italiane. Da citare sempre come fonte terza. | M2 |
| 23 | `content.agicap.com/insights` | Docu-serie "Insights", EP1 ed EP2 | EN | Contenuto narrativo su CFO, nessun prodotto. Recuperare solo se avanza tempo. | M4 |

---

## Non lo prendiamo, e perché

La regola decisa in Fase 0 resta valida col browser: **niente form compilati con dati falsi per
sbloccare materiale gated.** Il vincolo non cambia perché cambia lo strumento.

Ricade qui:

1. **Il video del webinar "Agicap in azione: demo completa dei moduli di tesoreria"** (riga 4).
   L'URL è su `registration.goldcast.io/events/…`, cioè una pagina di registrazione. Il
   *payload* con capitoli ed eventuale trascrizione è leggibile in chiaro e quello lo prendiamo
   (M1); la **riproduzione** no, se richiede il form. Da verificare in apertura: se il player
   parte senza form, non c'è gate e si procede; se compare il form, ci si ferma al testo.
   Stessa verifica vale per i quattro `ondemand.goldcast.io`: in Fase 0 il loro payload era
   accessibile senza registrazione, ma non ho testato la riproduzione.
2. **I 15 webinar replay in inglese su `event.agicap.com`** — elencati in
   `video-demo-comparazioni.md` §A.4. Sono replay dietro landing di registrazione. Non li
   prendiamo, e comunque sono fuori dal perimetro italiano.
3. **I 15 whitepaper/ebook su `agicap.com/it/risorse/`** (incluso "AI in tesoreria: la guida
   pratica per CFO" e "Ricerca - Le priorità di tesoreria dei CFO 2025-2026"). Tutti dietro
   form di download.
4. **La prova gratuita di 24 ore** (`agicap.com/it/registrati/`) e il form
   `/it/dimostrazione/`. Non è materiale da recuperare: è un rapporto commerciale, e aprirlo
   con dati inventati è la stessa cosa che compilare un form gated.
5. **`agicap.registration.goldcast.io/events/d43fe225-…`** — evento dal titolo troncato
   («Scopri come automatizzare la gestione della tesoreria con…»), che in Fase 0 non ha
   restituito contenuto. Vale un tentativo M1 in apertura; se è solo una landing di
   registrazione, si lascia.

---

## Punto aperto da segnalare: quante banche sono connesse davvero

Non lo risolvo — lo lascio come osservazione, perché il fatto che si contraddicano è già
il dato.

| Cifra dichiarata | Fonte | Data della fonte |
|---|---|---|
| «Connects with 300+ apps, **3000+ banks**, ERP systems» | `https://agicap.com/en/article/treasury-management-system/` | 23 maggio 2025 |
| «Connects with 300+ apps and **3000+ banks**» | `https://agicap.com/en/article/liquidity-software/` | 5 giugno 2025 |
| «Sage Intaact, QuickBooks, SAP, **14,000+ banks**, SWIFT, EBICS» | `https://agicap.com/en-us/article/cash-management-solutions/` | 8 luglio 2023, agg. 24 giugno 2024 |

Un fattore **4,7×** di scarto su un numero che è il loro argomento di copertura principale, e
per giunta con la cifra più alta nel documento **più vecchio**: se fosse crescita organica
l'ordine sarebbe inverso. Le ipotesi plausibili sono almeno tre — conteggi diversi (istituti
contro filiali/BIC raggiungibili via aggregatore), copertura diretta contro copertura via
partner di open banking, oppure semplice mancato allineamento fra articoli SEO scritti in
momenti diversi — e non ho elementi per scegliere.

Quel che conta a monte: **le cifre di copertura pubblicate da Agicap non sono coerenti fra
loro**, quindi nessuna di esse va ripresa nella nostra analisi come dato, ma solo come
"dichiarano X in questa pagina alla data Y". Se in Fase 1 il prodotto è raggiungibile, la
verifica seria è un'altra: contare quante banche **italiane** compaiono davvero nel selettore
di connessione. È l'unico numero che ci riguarda.
