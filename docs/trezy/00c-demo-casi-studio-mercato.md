# Trezy — materiali dimostrativi, casi studio e percezione di mercato

Ricognizione pubblica del 11 agosto 2026. Perimetro: solo Trezy (trezy.io).
Le pagine di comparazione pubblicate da Trezy sono state lette esclusivamente per estrarne le
affermazioni che Trezy fa su sé stessa.

**Convenzioni**
`[OSSERVATO]` = visto direttamente, con URL · `[DA DOCUMENTAZIONE]` = ricostruito da materiale
promozionale, con fonte · `[DEDOTTO]` = inferenza da elementi osservati · `[IPOTESI]` = congettura
non verificata.

Il ritrovamento che vale più di tutti gli altri: la demo interattiva del sito non è un video, è un
**tour Supademo di 75 passi con 47 screenshot dell'applicazione reale a 3016×1448 px**, scaricabili
senza autenticazione. È la fonte migliore in assoluto per documentare l'interfaccia di Trezy senza
avere un account. Tutti gli screenshot sono salvati in
`/Users/nicolascarpa/Desktop/accounting/assets/trezy/materiali-pubblici/`.

---

## 1. Materiali dimostrativi disponibili

| Tipo | URL | Durata / ampiezza | Aree mostrate | Stato |
|---|---|---|---|---|
| Tour interattivo guidato (Supademo) | https://www.trezy.io/it/demo-interattiva → embed `https://app.supademo.com/embed/cmf0sua0u9kr4v9kqwbx68qm4` | 75 passi: 47 fermo-immagine + 28 micro-clip per ~119 s di video e ~124 s di narrazione audio | Cash flow, previsionale, scenari, piano di tesoreria, categorie, transazioni, documenti/fatture, analisi fornitori | `[OSSERVATO]` |
| Tour interattivo «Trezy Demo» (Supademo) | embed `https://app.supademo.com/embed/cmffe9xzdar7e39ozc4ir63qz`, incorporato nella documentazione | 6 passi, ~12 s di clip | Collegamento di un conto bancario, dalla lista conti fino al consenso presso l'aggregatore | `[OSSERVATO]` |
| Video di prodotto in homepage (file MP4/WebM autoprodotti, non YouTube) | `https://www.trezy.io/it/` — sorgenti `uploads-ssl.webflow.com/…ScreenStory_29_04_2024…mp4` e `…ScreenStory_30_04_2024…mp4` | 2 clip mute in autoplay, registrate il 29 e 30 aprile 2024 | Cash flow con «Smart forecast»; scheda «Performance ratios» | `[OSSERVATO]` |
| Ambienti demo pubblici | https://www.trezy.io/it/dati-demo-eur e https://www.trezy.io/it/dati-demo-gbp | pagine di atterraggio per popolare un account con dati fittizi in euro o sterline | — | `[OSSERVATO]` |
| Calcolatori pubblici usabili senza account | `/it/simulatore-cash-flow`, `/it/calcolatore-punto-pareggio`, `/it/calcolatore-punto-pareggio-avanzato`, `/it/calcolatore-runway`, `/it/calcolatore-margine`, `/it/calcolatore-prezzi` | 6 strumenti | Proiezione 12 mesi, punto di pareggio, runway, margine, prezzi | `[OSSERVATO]` |
| Onboarding «live» con demo del CEO | dichiarato su https://www.trezy.io/it/miglior-software-tesoreria-2026 | sessioni dal vivo | — | `[DA DOCUMENTAZIONE]` |
| Formazione dichiarata alle directory | Capterra / GetApp: «In Person, Live Online, Webinars, Documentation, Videos» | — | — | `[DA DOCUMENTAZIONE]` |

### Cosa NON esiste (ricerche a vuoto, elencate per onestà)

- **Nessun canale YouTube né alcun video Trezy su YouTube**: ricerche `"Trezy" site:youtube.com cash flow software`, `Trezy youtube demo video tesoreria software`, e lettura diretta della pagina risultati YouTube. Nessun risultato. Nessun embed YouTube, Vimeo, Wistia, Loom o Vidyard in nessuna delle 20+ pagine del sito scaricate e ispezionate.
- **Nessun webinar registrato pubblicamente accessibile**, malgrado i webinar siano dichiarati come canale di formazione su Capterra e GetApp.
- **Nessuna pagina «webinar», «video» o «eventi»** nella sitemap (7,6 MB, scandagliata per intero).
- **Nessuna presenza su Product Hunt né discussione su Reddit** trovata.

### Un dettaglio che dice molto sulla localizzazione italiana

La demo interattiva è **integralmente in francese** — interfaccia registrata, hotspot testuali, narrazione
audio sintetica — anche quando la si apre da `/it/demo-interattiva`. La stessa pagina italiana ha il titolo
della sezione rimasto in francese: «*Découvrez Trezy en action — Explorez notre démo interactive…*»
`[OSSERVATO]`. L'italiano di Trezy è quindi uno strato SEO sopra un prodotto e un materiale dimostrativo
francesi. La demo contiene anche refusi mai corretti («previsionnon», «rtoujours», «Vous souhaitez faire
une prevision croissante?»).

---

## 2. Schermate ricostruite dai materiali

Tutte le descrizioni che seguono sono `[DA DOCUMENTAZIONE]` (screenshot ad alta risoluzione pubblicati
nella demo interattiva e nei poster video della homepage) e sono state **osservate direttamente** immagine
per immagine. I file sono in `assets/trezy/materiali-pubblici/screenshot-demo-interattiva/step-NN.jpg`.

### 2.1 Struttura comune dell'applicazione

Barra laterale sinistra stretta (~105 px), fondo grigio chiarissimo, **sole icone senza etichette**,
avatar circolare nero in cima. Sei voci nell'ordine: grafico a barre (Tesoreria), frecce circolari
(Transazioni), documento con spunta (Documenti), edificio (Fornitori), ingranaggio (Impostazioni),
e in fondo una freccia di espansione del menu. Bolla di chat in-app in basso a destra su ogni schermata
(supporto conversazionale sempre presente). Palette: verde-acqua `#37c8b0`/`#55d1bd` per le entrate,
rosa per le uscite, viola tenue per il selettore di scenario, nero per i pulsanti primari.
Nessuna intestazione di pagina: l'area di lavoro comincia subito con i comandi.

### 2.2 Cash flow — la schermata centrale del prodotto

`step-03.jpg`, `step-15.jpg`, `step-17.jpg`, `step-40.jpg`, `step-47.jpg`

**Barra dei comandi.** In alto a sinistra un selettore-pillola viola **«Scénario Principal»** con pallino
colorato. In alto a destra un segmentato **Jour / Semaine / Mois / Trimestre** (giorno, settimana, mese,
trimestre) e un pulsante di esportazione con icona di download.

**Card di saldo.** Sotto a sinistra, «Solde total de N comptes» con menu a tendina, e una card bianca
bordata: **Solde actuel 63 257,54 €** con variazione «0.0% vs mois dernier». Nella versione inglese della
homepage la stessa card è «Current Balance € 1.459,01 / −41% vs last month» con freccia rossa.

**Grafico.** Coppie di barre verticali per periodo: verde-acqua = incassi, rosa = pagamenti.
**Tinta piena = consuntivo, righe diagonali = previsionale** — la separazione passato/futuro è codificata
dalla texture, non dal colore. Una linea nera con marcatori circolari attraversa il grafico ed è il saldo
di cassa: **continua sul consuntivo, tratteggiata sul previsionale**. Doppio asse: sinistro per i flussi
(0 → 225k), destro per il saldo (0 → 750k). Il periodo selezionato ha una banda grigia verticale a tutta
altezza. Sull'asse dei mesi compaiono etichette-pillola per il cambio d'anno («2026»). Frecce `<` `>` ai
lati per scorrere l'orizzonte temporale.

**Griglia sottostante — è il cuore dell'interfaccia.** Colonne = periodi, allineate al grafico, con una
**interruzione visiva fra un anno e l'altro** (i gruppi di colonne sono separati da uno spazio bianco).
Righe gerarchiche espandibili con chevron. Struttura osservata:

| Livello | Righe |
|---|---|
| Riga di apertura | `Trésorerie au début` (icona libro) |
| Blocco entrate | `Encaissement` (icona freccia ascendente) → `Chiffre d'affaires` → `Ventes de biens` |
| Blocco uscite | `Décaissement` (icona freccia discendente) → `Autres frais`, `Services de cloud computing`, `Remboursement client`, `Échéances pret bancaire`, `Entretien et réparations`, `Charges d'exploitation diverses`, `Fournitures non stockables (eau, é…)`, `Honoraires professionnels`, `Locations immobilières`, `Achats de matériel et de travaux`, `Achats de services externes`, `Achats de biens`, `Achats d'autres fournitures`, `Achats d'emballages`, `Achats de matières premières`, `Achats d'études et de services`, `Remboursement pret bancaire`, `Outils SaaS`, `Salaires et traitements` |
| Riga di chiusura | `Trésorerie à la fin` (icona libro) |

Le celle del **periodo corrente** mostrano una notazione a due valori — `0 / 250K`, `0 / 33 996`,
`0 / 155.4K` — con a sinistra una percentuale grigia `0%`: è **realizzato / previsto** più la percentuale
di avanzamento del mese in corso. È una scelta di interfaccia notevole: nella stessa cella convivono il
consuntivo parziale e l'obiettivo. I valori assenti sono resi con `-`, mai con `0`.

**Modifica del previsionale.** Doppio clic su una cella per editarla; passando sopra una cella compare una
mini-barra di quattro pulsanti con tooltip **«Méthodes de prévision supplémentaires»**: icona istogramma,
icona trend, icona `=`, e `...`. La scelta «trend» apre un pannello **«Sélectionner le taux de croissance»**
con due file di pulsanti — **AUGMENTER: +1% +3% +5% +10%** e **DIMINUER: −1% −3% −5% −10%** — più un campo
`Personnalisé` e un pulsante scuro **Appliquer**. Altre opzioni citate nella narrazione: propagazione della
modifica ai periodi futuri con un clic, e **duplicazione dell'anno precedente** come base di previsione.
Il previsionale si esporta in **CSV o Excel**.

**Selettore dei conti.** `screenshot-demo-connessione-banca/step-01.jpg`: cliccando «Solde total de 4 comptes»
si apre un pannello con una riga per conto — nome, saldo, **interruttore on/off** e **icona cestino rossa** —
e in fondo **«Nouveau compte bancaire»**. L'interruttore include/esclude il conto dai calcoli: filtro di
visualizzazione, non cancellazione.

### 2.3 Scenari

`step-40.jpg`

Il selettore viola in alto a sinistra apre l'elenco degli scenari, ciascuno con un **pallino di colore
identificativo** e un'**icona occhio barrato** per mostrarlo o nasconderlo nel grafico. Scenari presenti
nell'account demo: `Scénario Principal`, `test`, `Pret bancaire`, `Simulation pret bancaire`,
`Simulation pret`. In fondo **«+ Créer un nouveau scénario»**. La narrazione conferma: creazione illimitata,
duplicazione di uno scenario esistente, rinomina.

Con più scenari attivi (`step-53.jpg`) il grafico sovrappone **più linee di saldo tratteggiate di colore
diverso** — nera, rosa, blu — sulle stesse barre. Il confronto è visivo e simultaneo, non affiancato in
tabella. La narrazione lo descrive come «comparer les impacts de vos différentes stratégies», e afferma
che tutti gli scenari confluiscono nel «plan de trésorerie».

### 2.4 Gestione delle categorie dentro la griglia

`step-47.jpg`

Le categorie si modificano **in linea nella griglia del cash flow**, non in una pagina di impostazioni
separata. Espandendo una voce compaiono le sottocategorie, ciascuna con una **maniglia di trascinamento**
a sinistra (riordino) e un'**icona cestino rossa** a destra. Sotto le sottocategorie esplicite compare
sempre una riga **`Autres` in corsivo**, che raccoglie il residuo non attribuito. Cancellando una categoria
il sistema chiede di **riassegnare le transazioni** che vi appartenevano scegliendo la nuova categoria.

### 2.5 Transazioni

`step-55.jpg`

Card di saldo in alto («Solde total de 1 comptes» / «Solde actuel 63 257,54 €»). Barra di filtri:
campo di ricerca a lente **«Rechercher des transactions…»**, quattro tendine — **Catégories, Date, Montant,
Type** — e un pulsante nero **«Importer des transactions»** (import manuale possibile, quindi non solo
open banking).

Lista raggruppata per giorno, con intestazione di data in grassetto («Samedi 30 Août 2025»). Ogni riga:
**casella di selezione multipla**, descrizione grezza dell'operazione bancaria in maiuscolo
(`UBER * EATS PENDING`, `ALIM CARREFOUR CITY`, `FOLIES`), **categoria assegnata in grigio**
(`Charges d'exploitation diverses`, `Achats de biens`) e **importo a destra** con segno
(`−21,10 €`, `−58,60 €`, `−7,70 €`, `−13,40 €`). Righe alte e spaziate. Notevole: la descrizione resta
il testo bancario originale, non normalizzato in nome commerciale.

### 2.6 Documenti / fatture

`step-56.jpg`

Titolo di pagina **«Documents»**. In alto a destra una zona di trascinamento: **«Télécharger des documents
ou glisser-déposer — PDF, PNG, JPG jusqu'à 10MB»** con due pulsanti-scorciatoia `PDF` e `PNG/JPG`.
Barra filtri: ricerca, **Montant**, **Date d'émission**, **Date de création**, **Type**, e un pulsante
**«› Plus»** per i filtri aggiuntivi.

Tabella con intestazioni maiuscole: **INVOICE NUMBER · ORGANIZATION · DATE · AMOUNT · ACTIONS**.
Nella colonna organizzazione ogni valore è preceduto da una **freccia `←`** (indicatore di direzione del
documento: ricevuto). L'importo è su due righe — **totale in verde** e sotto **«… excl.»** in grigio
(imponibile al netto dell'IVA). Azioni per riga: **occhio** (anteprima) e **cestino**. Fornitori reali
visibili: SCI CME, Out Fry - Korean Fried Chicken, METRO France, M\ndeliveroo (nome corrotto da un escape
non gestito), Starsmash by Amixem. Molti importi sono **€0.00**: l'estrazione automatica dei totali fallisce
su una parte non trascurabile dei documenti `[OSSERVATO]` — è un difetto visibile nel materiale
promozionale stesso.

La narrazione dichiara: «Sélectionnez une facture : Trezy en extrait instantanément chaque ligne»
(estrazione riga per riga, non solo del totale).

### 2.7 Analisi fornitori — il modulo più distintivo

`step-60.jpg`, `step-68.jpg`

Sottotitolo di pagina: «Analysez les performances et les tendances des fournisseurs». Barra dei filtri con
tre controlli: selettore **«Tous les fournisseurs»**, selettore di periodo **«May 24 - Aug 22, 2025»**, e un
blocco **«| COMPARER À → Période précédente → Feb 22 - May 23, 2025»**. Il confronto fra periodi è un
cittadino di prima classe, non un'opzione nascosta.

Scheda per fornitore (esempio: **Transgourmet**) con tre riquadri KPI in fila:

| KPI | Valore d'esempio | Semantica |
|---|---|---|
| TOTAL COMMANDES (HT) | 76 223 € | spesa nel periodo, al netto IVA |
| FRÉQUENCE MOY. | 2.1 jours | intervallo medio fra un ordine e l'altro |
| INFLATION ANNUELLE | −0.2% (in verde) | variazione di prezzo ponderata; **verde = prezzo che scende**, rosso = prezzo che sale |

Sotto, la tabella dei prodotti acquistati da quel fornitore: **Produit · Total (HT) · Prix moyen · Quantité**.
Ogni valore porta **in apice una percentuale di variazione colorata** rispetto al periodo di confronto —
verde per il calo, rosso per l'aumento. Esempio letto: `Crisscut Aromatise avec Peau 2.5 Kg — 4 472 €⁻⁷⁰·²%
— 7,36 €⁺²·²% — 608⁻⁷⁰·⁹%`. La granularità è **la riga di fattura**, con la denominazione commerciale
esatta del prodotto («Aiguillettes Poulet Marinees Panees Pepe 2.5 Kg X4», «Pain Burger Fresh 65g X60»,
«Huile Tradition 7.5 L»). In fondo un «Afficher les 114 produits supplémentaires».

Cliccando un prodotto si apre un **pannello laterale «Analyse du produit»** sopra un fondo sfocato:

- **Résumé global** a tre KPI: `INFLATION ANNUELLE +5.7%` · `DÉPENSES TOTALES (PÉRIODE) 1724 €` ·
  `FACTURES CONTENANT LE PRODUIT 15`.
- **Données d'inflation du produit**: tabella `Date de commande | Prix | Variation (%)` con una riga per
  ogni acquisto. Le righe senza cambio di prezzo hanno un trattino; la riga in cui il prezzo cambia
  evidenzia la variazione in rosso (`07/04/2025 — 13,06 € — +5.7%`, dopo un lungo tratto a 12,35 €).

Questo modulo è il vero elemento differenziante che Trezy mostra: **serie storica del prezzo unitario per
singolo prodotto, ricostruita dalle righe delle fatture d'acquisto**, con l'inflazione calcolata per
fornitore e per prodotto. La narrazione lo chiude con l'uso commerciale: «afin de négocier vos prix en vous
basant sur des données concrètes».

### 2.8 Collegamento bancario e aggregatore

`screenshot-demo-connessione-banca/step-04.jpg`

La schermata di consenso è **fuori dall'applicazione Trezy**. Colonna sinistra con lo stato di avanzamento
in quattro passi — **1 Choix de l'établissement · 2 Authentification · 3 Sélection des comptes ·
4 Redirection** — e in fondo il logo **Powens** con la dicitura «Powens est agréé en qualité d'établissement
de paiement par l'Autorité de Contrôle Prudentiel et de Résolution (ACPR), sous le numéro CIB 16948»,
«Version 4.52.1». Colonna destra: «Choisissez les comptes à utiliser avec Trezy», «Tout sélectionner»,
una card per conto (nome, ultime 4 cifre, saldo), «+ Connecter d'autres comptes», pulsante **Connecter**.

`[DEDOTTO]` L'aggregatore bancario di Trezy è **Powens** (ex Budget Insight), istituto di pagamento
francese vigilato ACPR. Le «2.000+ banche connesse» e la compatibilità dichiarata con Intesa Sanpaolo,
Unicredit, BPER, Mediolanum e ING Italia sono quindi la copertura del fornitore, non un'integrazione
proprietaria — con tutto ciò che ne consegue in termini di qualità e continuità del servizio in Italia.
Uno dei conti nell'esempio è in **USD** («Compte chèque USD — 2 473,17 $US»): il multivaluta arriva
dall'aggregatore.

---

## 3. Casi studio

Trezy pubblica **tre** casi studio, tutti francesi, tutti riferiti alla fase iniziale del prodotto
(2021-2022), tutti privi di metriche verificabili tranne uno. Indice: https://www.trezy.io/it/clienti
e https://www.trezy.io/en-us/customers.

### 3.1 La Manufacture — ristorazione, 7 locali `[OSSERVATO]`
https://www.trezy.io/it/customers/la-manufacture

**Problema.** Pizzeria fondata nel 2015. Riceveva solo il bilancio annuale. L'arrivo di Uber Eats e
Deliveroo (2017-2018) ha cambiato il modello: il **costo del venduto è passato dal 20-30% al 60%** per
via delle commissioni dei canali di consegna. I report mensili del commercialista costavano
**600 € per ristorante al mese, pari all'1,8% del fatturato**, ed erano faticosi da produrre. Gli
strumenti di previsione di cassa non davano visibilità sulla performance operativa reale; i software
contabili richiedevano settimane di impianto e manutenzione a tempo pieno.

**Modulo risolutivo.** Visibilità in tempo reale sulla performance per singolo locale, raccolta
automatica di scontrini e fatture, gestione del cash flow, KPI.

**Risultato dichiarato.** Nessun numero. Solo la citazione:
«Since we started using Trezy, we have real-time performance visibility for each one of our restaurants.»
— Frédéric Lacroix.

Il dato interessante non è il risultato ma il **problema**: il caso studio nasce come alternativa
economica al reporting mensile del commercialista, non come strumento di tesoreria in senso stretto.

### 3.2 Hélacom — agenzia di marketing digitale, 7 persone `[OSSERVATO]`
https://www.trezy.io/en-us/customers/helacom

**Problema.** Fondata a gennaio 2020 da Danielle Diomande, cresciuta da 1 a 7 dipendenti. Non riusciva a
vedere il costo pieno di un'assunzione (**~80% di oneri sociali sul netto**); dagli strumenti di
fatturazione e dai conti bancari non ricavava il risultato netto; l'IVA trimestrale e i ritardi di
incasso variabili rendevano illeggibile la redditività mensile. Ogni mese toglieva a mano l'IVA e
ricollocava le date delle operazioni per stimare il risultato. Competenza finanziaria limitata.

**Modulo risolutivo.** Analisi di performance e redditività, import automatico delle scritture contabili
dell'anno precedente.

**Risultato dichiarato.** L'unico caso con una metrica: ha capito di essere appena al pareggio e ha
**deciso di rallentare le assunzioni cinque mesi prima** del bilancio del commercialista di marzo 2022.
«Without Trezy, I would have carried on until my accountant's annual statement in March 2022. It enabled
me to make decisions five months beforehand.»

### 3.3 T2F — studio di commercialisti, 450+ clienti, Parigi e Tolosa `[OSSERVATO]`
https://www.trezy.io/en-us/customers/t2f

Non è un cliente: è un **partner-prescrittore**, e il CEO Thibault Faure è indicato come «uno degli
iniziatori di Trezy».

**Problema.** Post-pandemia la domanda di visibilità finanziaria è esplosa, ma il reporting mensile era
troppo costoso per i clienti piccoli. Riconciliazione manuale delle fatture (le fatture settimanali di
Uber Eats e Deliveroo vanno spezzate a cavallo del mese); dipendenza dai clienti per la consegna
tempestiva di scontrini, fatture e giacenze.

**Modulo risolutivo.** Visibilità in tempo reale, accesso automatico ai dati di scontrini e fatture.

**Risultati dichiarati.** Il **20% del fatturato dello studio** viene dalla produzione di report, e non si
prevede di perderlo; circa il **50% dei clienti** esprimeva il bisogno di maggiore visibilità finanziaria.
Le quattro citazioni sono tutte in chiave di vendita allo studio professionale: «Trezy increases the
portfolio of services an accounting firm can offer», «Trezy creates a smooth collaboration with accountants
without changing current processes».

Lo stesso studio ha pubblicato un proprio articolo su Trezy il 28 marzo 2024
(https://www.groupe-t2f.eu/post/trezy-gestion-et-previsionnel-de-tresorerie-en-temps-reel), inserendolo
nella propria offerta «Business» e sottolineando che «le soluzioni funzionano meglio in collaborazione con
un Expert-Comptable» `[OSSERVATO]`.

### 3.4 Casi studio assenti

Nessun caso studio italiano, spagnolo, tedesco, olandese, polacco, britannico o nordamericano — benché il
sito sia localizzato in nove lingue e Trezy dichiari presenza in Europa, Stati Uniti e Canada.
`[DEDOTTO]` L'espansione linguistica è avvenuta per via SEO, senza ancora produrre referenze locali.

---

## 4. Percezione di mercato

### 4.1 Il fatto centrale: Trezy è praticamente invisibile sulle piattaforme di recensioni

| Piattaforma | Voto | Recensioni |
|---|---|---|
| Capterra | 0.0 | **0** |
| GetApp | — | **0** |
| G2 | profilo venditore presente, nessuna recensione recuperabile (403 in lettura) | — |
| Trustpilot FR | positiva | **1** |
| Appvizer IT | 5,0 (aggregato esterno) | **0** dell'utenza |
| Appvizer FR | 5,0 | **3** |

Totale verificabile: **quattro recensioni** in tutto il web pubblico, a fronte di una rivendicazione di
oltre 2.500 aziende clienti. `[OSSERVATO]`

Peggio: delle tre recensioni Appvizer FR leggibili, una è firmata **Jean Bonnenfant, Head of Growth** —
che era **Head of Growth di Trezy stessa** (confermato da fonti terze sul suo profilo professionale) — e
un'altra da **Frederic Lacroix**, cioè il testimonial del caso studio La Manufacture. `[OSSERVATO]`

E ancora: il comunicato del round seed e le pagine «Trezy vs …» in italiano rivendicano **«4,8 stelle su
127 recensioni»**. Non esiste nessuna piattaforma pubblica che ospiti 127 recensioni di Trezy. L'origine
del dato è ignota. `[OSSERVATO]`

### 4.2 Le testimonianze delle landing recenti sono personas, non clienti

Le pagine di prodotto pubblicate nel 2025-2026 portano testimonianze con avatar a iniziali, nomi generici
e settori senza ragione sociale: *James Baker, CFO, «Azienda SaaS» (75% di tempo risparmiato)*;
*Sophie Martin, Proprietaria, «Catena di Negozi» (+15% margini)*; *Alex Chen, CEO, «Gruppo di Ristoranti»
(30% di efficienza)*; *Pierre Dubois, Direttore Operazioni, «Produzione» (45.000 € risparmiati)*;
*Anna Schmidt, CFO, «Catena Ristoranti» (−12% costi)*; *Marco Colombo, Proprietario, «Distributore
Alimentare»*; *Marie Dubois, PDG, «TechStart» (4-8 ore a settimana)*. Nessuno di questi nomi trova
riscontro esterno, e nessuno compare fra i tre casi studio reali. `[OSSERVATO]`
`[DEDOTTO]` Sono contenuti generati per il posizionamento SEO, non referenze.

### 4.3 Pregi ricorrenti citati dalle fonti indipendenti

- **Interfaccia semplice e presa in mano rapida** — è il punto su cui convergono tutte le fonti:
  independant.io («interface facile à prendre en main», «épurée et facile à appréhender»),
  logiciels.pro, Trustpilot, Appvizer.
- **Prezzo semplice e senza moduli a pagamento**: tutto incluso, utenti illimitati, conti bancari
  illimitati, scenari illimitati (independant.io, logiciels.pro).
- **Automazione della categorizzazione** con regole apprese dall'IA.
- **Impianto rapido**: sotto i 30 minuti secondo logiciels.pro, sotto i 5 minuti secondo Trezy.
- **Non richiede competenze finanziarie** — è il posizionamento che tutte le fonti terze riprendono.

### 4.4 Debolezze ricorrenti — la parte che conta

| Debolezza | Fonte | Nota |
|---|---|---|
| **Nessuna applicazione mobile** | independant.io, elencata come unico «inconvénient» esplicito | In contraddizione con Capterra/GetApp che dichiarano deployment «Android, iPhone/iPad». Una delle due fonti è sbagliata: `[IPOTESI]` esiste solo un'app web responsiva. |
| **Elenco di integrazioni molto limitato** | independant.io («encore limitée»), logiciels.pro | independant.io al momento del test vedeva **solo Pennylane e Xero**. Oggi il sito aggiunge QuickBooks e l'import FEC/Cegid, ma resta lontano dalle «10.000+ integrazioni» citate nel caso studio T2F. |
| **Non fa fatturazione né contabilità** | logiciels.pro, independant.io | «Trezy n'inclut pas de module complémentaire, tel que la facturation ou la comptabilité». Chi cerca un ciclo attivo completo deve affiancare un altro strumento. |
| **Non sostituisce il commercialista** | independant.io, e Trezy stessa lo ammette | Posizionamento deliberato ma è un limite funzionale reale. |
| **Inadatto a imprese medio-grandi / ETI** | independant.io | Esplicitamente fuori target. |
| **Rischio di conformità nell'affidare i dati a un editore SaaS** | logiciels.pro | Generico, ma vedi la riga seguente. |
| **Dati ospitati negli Stati Uniti** | logiciels.pro | `[IPOTESI]` da verificare: se confermato è un problema serio per un cliente italiano attento al GDPR. Nessun'altra fonte lo conferma né lo smentisce. |
| **Contraddizione sull'IA** | logiciels.pro: «ne semble pas être doté de fonctionnalité IA» | Una fonte editoriale, dopo aver esaminato il prodotto, contesta la rivendicazione centrale del marketing («95% di accuratezza», «400+ categorie»). |
| **Estrazione dei documenti incompleta** | `[OSSERVATO]` nello screenshot `step-56.jpg` della demo ufficiale | Diverse fatture in elenco hanno importo **€0.00**: l'OCR/estrazione fallisce su una parte dei documenti, e il difetto è visibile nel materiale promozionale. |
| **Nomi commerciali corrotti** | `[OSSERVATO]`, stesso screenshot | «M\ndeliveroo»: un carattere di escape non gestito arriva fino all'interfaccia mostrata al pubblico. |
| **Prezzo pubblicato incoerente fra le fonti** | Capterra/GetApp/Appvizer/logiciels.pro: **39 €/mese** unico piano · sito Trezy 2026: piano gratuito + Starter da **7,50 €/mese** | `[DEDOTTO]` Riposizionamento di prezzo verso il basso avvenuto dopo la schedatura sulle directory, che non è stata aggiornata. Anche la prova gratuita balla: 7 giorni (independant.io, Trustpilot), 14 giorni (sito attuale), «non disponibile» (Capterra). |
| **Demo e materiali non localizzati in italiano** | `[OSSERVATO]` | Demo interattiva integralmente in francese, titolo francese sulla pagina italiana. |
| **Refusi non corretti nel materiale ufficiale** | `[OSSERVATO]` nella demo | «previsionnon», «rtoujours», «Vous souhaitez faire une prevision croissante?». |

`[DEDOTTO]` Nessuna delle fonti indipendenti riporta lamentele su bug, prestazioni, assistenza o
affidabilità della sincronizzazione bancaria. Ma questo **non è un segnale positivo**: è la conseguenza
dell'assenza quasi totale di recensioni d'uso reale. Le uniche voci critiche disponibili sono editoriali,
non di utenti.

---

## 5. Ecosistema e partnership

### 5.1 Fornitori tecnologici

- **Powens** (ex Budget Insight), istituto di pagamento vigilato ACPR, CIB 16948 — aggregatore bancario
  che sta dietro alle «2.000+ banche». `[OSSERVATO]` dallo screenshot della demo di collegamento.
- **Supademo** — piattaforma delle demo interattive. `[OSSERVATO]`
- **Webflow** — CMS del sito. `[OSSERVATO]`

### 5.2 Integrazioni contabili dichiarate

- **Pennylane** — https://www.trezy.io/it/partnership-pennylane. Trezy si dichiara «partenaire certifié».
  Sincronizzazione e categorizzazione automatica del 100% delle transazioni; **funzionamento in sola
  lettura**: «Trezy lit et analyse vos données sans jamais toucher à vos écritures comptables».
  Benefici rivendicati: 4-8 ore risparmiate a settimana, rilevamento dei rischi di cassa con 30 giorni di
  anticipo. `[DA DOCUMENTAZIONE]` — nessun numero di adozione, nessun programma dedicato agli studi.
- **QuickBooks** — https://www.trezy.io/it/quickbooks-integration.
- **Xero** — citato da independant.io.
- **Import FEC, Cegid, Pennylane** — citati nella pagina per i CFO esterni.

Nessuna integrazione con software gestionali o fiscali **italiani** (nessun Fatture in Cloud, TeamSystem,
Zucchetti, SDI/fatturazione elettronica) è dichiarata come partnership: TeamSystem e Fattureincloud
compaiono soltanto come pagine di comparazione, cioè come concorrenti. `[OSSERVATO]` dalla sitemap.

### 5.3 Programmi per professionisti

- **Offerta per CFO esterni / DAF esternalizzati** — https://www.trezy.io/it/offre-daf. Dashboard
  centralizzata multi-azienda per chi segue più clienti. **20 €/mese per azienda** con impegno annuale
  (240 €/anno, −20%) oppure **25 €/mese senza impegno**, con **minimo 3 aziende**. Include P&L in tempo
  reale con struttura SIG e stato patrimoniale, «27+ KPI», previsioni a 12 mesi, accesso multiutente con
  permessi. `[DA DOCUMENTAZIONE]`
- **Programma referral** — https://www.trezy.io/it/programma-referral. Aperto a chiunque, senza requisiti
  professionali. **10% della fatturazione** per 1-5 clienti segnalati, **15% per cliente** oltre i 5,
  su licenze mensili e annuali; link di affiliazione richiesto via email, bonifico mensile. Nessun
  marketplace di consulenti, nessun contratto, nessun minimo. `[DA DOCUMENTAZIONE]`
- `[DEDOTTO]` Non esiste un vero programma per studi commercialisti: c'è un'offerta a volume per CFO
  frazionali e un'affiliazione aperta a chiunque. Il canale professionale è gestito in modo leggero.

### 5.4 Azienda e finanziamento

- Fondata nel **2020-2021** (Crunchbase/LinkedIn: 2021; tech.eu: 2020) da **Quentin Lacointa** e
  **Pierre Houdyer**. Quentin Lacointa è anche l'autore di entrambe le demo Supademo. `[OSSERVATO]`
- Sede **Parigi**, seconda sede **Amsterdam**; **11-50 dipendenti** secondo LinkedIn.
  Nome legale della pagina LinkedIn: **easytreasury**. `[OSSERVATO]`
- **Round seed da 3 milioni di euro**, giugno 2023, guidato da **Seedcamp** e **Playfair Capital**, con
  **Kima Ventures**, **Discovery Ventures** e il cofondatore di **SumUp** Stefan Jeschonnek.
  Copertura: EU-Startups, tech.eu, Silicon Canals, Finextra, Financial IT, TechFundingNews.
  Uso dichiarato dei fondi: crescita della base clienti, funzionalità di IA generativa, team in Paesi
  Bassi, Francia e Regno Unito; poi espansione in Nord America. `[OSSERVATO]`
- Metriche dichiarate nel comunicato: **2.500+ aziende**, **14 milioni di scritture contabili**,
  **2 milioni di transazioni bancarie** in banca dati. `[DA DOCUMENTAZIONE]`
- **Nessuna copertura stampa italiana** trovata: nessun articolo su testate italiane, nessuna partnership
  con banche italiane, nessun accordo con ordini o associazioni di commercialisti. Ricerche effettuate:
  «Trezy Italia PMI tesoreria commercialisti partnership banca stampa 2026», «Trezy Italia», ricerche
  incrociate su comunicati del Consiglio Nazionale dei Dottori Commercialisti. `[OSSERVATO]` — risultato
  nullo. La presenza italiana di Trezy è, ad oggi, **esclusivamente un sito tradotto**.

---

## 6. Materiali salvati

In `/Users/nicolascarpa/Desktop/accounting/assets/trezy/materiali-pubblici/`:

| File | Contenuto |
|---|---|
| `demo-01-tour-interattivo-supademo.md` | Trascrizione integrale dei 75 passi del tour interattivo, con testo di ogni hotspot e riferimento allo screenshot |
| `demo-02-connessione-banca-powens.md` | I 6 passi del tour di collegamento bancario e il ritrovamento su Powens |
| `demo-03-video-homepage-screenstory.md` | I due video di prodotto della homepage, con la descrizione analitica dei fermo-immagine |
| `demo-04-testimonianze-e-recensioni.md` | Inventario completo di testimonianze e recensioni, con il giudizio di attendibilità di ciascuna |
| `screenshot-demo-interattiva/step-NN.jpg` | 47 screenshot dell'applicazione, 3016×1448 px |
| `screenshot-demo-connessione-banca/step-NN.jpg` | 4 screenshot del flusso di collegamento bancario, 2240×1260 px |
| `screenshot-homepage/home-video-NN-*.jpg` | 2 fermo-immagine dei video di homepage |

---

## 7. Fonti

**Sito Trezy — prodotto e demo**
- https://www.trezy.io/it/demo-interattiva
- https://www.trezy.io/en-us/interactive-demo
- https://www.trezy.io/fr/demo-interactive
- https://app.supademo.com/embed/cmf0sua0u9kr4v9kqwbx68qm4
- https://app.supademo.com/embed/cmffe9xzdar7e39ozc4ir63qz
- https://www.trezy.io/it/ (video ScreenStory in homepage)
- https://www.trezy.io/it/prodotto-flusso-cassa · `/it/prodotto-prestazioni` · `/it/prodotto-transazioni` · `/it/prodotto-documenti` · `/it/prodotto-fornitori` · `/it/prodotto-punto-pareggio`
- https://www.trezy.io/it/soluzione-tesoreria
- https://www.trezy.io/it/dati-demo-eur · `/it/dati-demo-gbp`
- https://www.trezy.io/sitemap.xml

**Sito Trezy — clienti, partnership, programmi**
- https://www.trezy.io/it/clienti · https://www.trezy.io/en-us/customers
- https://www.trezy.io/it/customers/la-manufacture
- https://www.trezy.io/en-us/customers/helacom
- https://www.trezy.io/en-us/customers/t2f
- https://www.trezy.io/it/partnership-pennylane
- https://www.trezy.io/it/quickbooks-integration
- https://www.trezy.io/it/offre-daf
- https://www.trezy.io/it/programma-referral
- https://www.trezy.io/it/trezy-vs-sibill (solo affermazioni su Trezy)
- https://www.trezy.io/it/miglior-software-tesoreria-2026
- https://www.trezy.io/en-us/blog/trezy-secures-3-million-in-seed-funding

**Directory e recensioni**
- https://www.capterra.com/p/10019866/Trezy/
- https://www.getapp.com/finance-accounting-software/a/trezy/
- https://www.g2.com/sellers/trezy (403 in lettura diretta)
- https://fr.trustpilot.com/review/trezy.io (403 in lettura diretta; contenuto tramite ricerca)
- https://www.appvizer.it/finanza-contabilita/tesoreria/trezy
- https://www.appvizer.fr/finance-comptabilite/tresorerie/trezy

**Recensioni editoriali indipendenti**
- https://independant.io/avis/trezy/
- https://www.logiciels.pro/logiciel-saas/trezy/
- https://www.lafabriquedunet.fr/logiciel/trezy/ (403, non letta)

**Stampa e ecosistema**
- https://tech.eu/2023/06/15/trezy-secures-3-million-to-support-smes-reduce-cash-flow-issues-with-its-ai-driven-predictive-cash-flow-management-platform/
- https://www.eu-startups.com/2023/06/paris-based-trezy-lands-e3-million-seed-to-expand-its-ai-driven-predictive-cash-flow-management-platform/
- https://siliconcanals.com/franco-dutch-fintech-trezy-bags-3m/
- https://www.finextra.com/pressarticle/97258/trezy-lands-3-million-seed-to-expand-ai-driven-predictive-cash-flow-management-platform-to-the-uk
- https://www.linkedin.com/company/easytreasury/
- https://www.groupe-t2f.eu/post/trezy-gestion-et-previsionnel-de-tresorerie-en-temps-reel
