# Agicap — pagine prodotto del sito italiano e casi studio

**Analisi competitiva WEISS S.r.l. — Fase 0**
**Data di accesso a tutte le fonti: 11 agosto 2026**
**Perimetro: sito pubblico agicap.com, versione italiana (`/it/`). Nessun accesso al prodotto.**

---

## Fonti consultate

Tutte le pagine sono state scaricate in HTML e convertite in testo; il testo grezzo di ciascuna è archiviato in `assets/agicap/materiali-pubblici/`. Nessun browser interattivo è stato usato.

### Come è stata costruita la mappa

La navigazione del sito espone i moduli su **due gerarchie distinte** che non coincidono: `/it/prodotti/` (i moduli commerciali, quelli che compaiono nel menu «Prodotti») e `/it/funzionalita/` (le singole capacità, in parte trasversali ai moduli, in parte residuo di una tassonomia precedente). L'elenco completo è stato ricavato dalla sitemap dichiarata in `robots.txt` (`https://agicap.com/sitemap-IT.xml`), non dal solo menu: la sitemap espone 7 pagine prodotto, 11 pagine funzionalità e 36 casi studio, diversi dei quali non sono raggiungibili dalla navigazione principale.

### Pagine prodotto (7)

| URL | Modulo |
|---|---|
| `https://agicap.com/it/prodotti/gestione-della-tesoreria/` | Gestione della tesoreria |
| `https://agicap.com/it/prodotti/pianificazione-liquidita/` | Pianificazione della liquidità |
| `https://agicap.com/it/prodotti/comunicazione-bancaria/` | Connettività bancaria & ERP |
| `https://agicap.com/it/prodotti/paga-i-fornitori/` | Gestione delle spese |
| `https://agicap.com/it/prodotti/pagamenti/` | Pagamenti |
| `https://agicap.com/it/prodotti/fatti-pagare-dai-clienti/` | Gestione dei crediti |
| `https://agicap.com/it/prodotti/applicazione-mobile/` | Applicazione mobile |

### Pagine funzionalità (11)

`monitoraggio-cash-flow`, `tesoreria-previsionale`, `reporting`, `consolidamento`, `cash-pooling-automatizzato`, `gestione-del-debito`, `gestione-delle-spese`, `carte-aziendali`, `metodi-di-pagamento`, `solleciti-di-pagamento`, `mcp-server` — tutte sotto `https://agicap.com/it/funzionalita/<slug>/`.

### Integrazioni

`https://agicap.com/it/le-nostre-integrazioni/` e `https://agicap.com/it/le-nostre-integrazioni/fatture-in-cloud/`

### Casi studio letti integralmente (12 dei 36 disponibili)

miscusi, Mediterranean Hospitality, Bofrost*, VetPartners, Vivason, Gruppo Madeo, Girasole Energies, Instilla, Manetti Group, GV Filtri Industriali, Seiven, Corriere dello Sport — tutti sotto `https://agicap.com/it/clienti/<slug>/`. La selezione ha privilegiato horeca, retail, multi-sede e PMI italiane.

### Materiale visivo

Le pagine incorporano **video dimostrativi del prodotto localizzati in italiano**, ospitati su `videos.ctfassets.net`. Sono stati scaricati e campionati in fotogrammi per leggere l'interfaccia reale:

- `boucle_site_product_demo_CM_IT.mp4` (Cash Management) — dalla pagina Gestione della tesoreria
- `boucle_site_product_demo_CFP_IT.mp4` (Cash Flow Planning) — dalle pagine Gestione della tesoreria e Pianificazione della liquidità
- `boucle_site_product_demo_AR_IT.mp4` (Accounts Receivable) — dalla pagina Solleciti di pagamento

Sono la fonte più informativa di tutta la ricerca: mostrano schermate reali con etichette italiane. **Restano però materiale promozionale**, girato su un'azienda fittizia («Gruppo ACME»): mostrano che una schermata esiste e com'è fatta, non come si comporta il prodotto sotto carico o con dati sporchi.

I fotogrammi più significativi sono archiviati in `assets/agicap/materiali-pubblici/schermate-demo/`: `situazione-di-cassa-CM.png`, `tabella-saldi-per-conto-CM.png`, `griglia-categorie-mensili-CFP.png`, `previsionale-mensile-CFP.png`, `analisi-crediti-DSO-AR.png`, `segmentazione-clienti-tag-AR.png`.

---

## Nota di lettura

- `[DA DOCUMENTAZIONE]` marca ciò che è **soltanto dichiarato** dal marketing e non verificato.
- `[DA VIDEO]` marca ciò che è **visibile in un fotogramma** del video dimostrativo: l'elemento di interfaccia esiste ed è etichettato così, ma il comportamento non è verificato.
- `[FUORI SCALA]` marca ciò che presuppone strutture più grandi di WEISS.

Praticamente tutto il contenuto qui sotto è dichiarativo: nessuno di questi moduli è stato provato.

---

# PARTE A — I moduli, uno per uno

## Come Agicap organizza la propria offerta

Il posizionamento dichiarato in homepage (`https://agicap.com/it/`) è: **«Tesoreria, crediti e debiti, finalmente in sintonia»**, con il sottotitolo «La piattaforma AI che connette i flussi bancari e contabili: previsioni e gestione della tesoreria, esecuzione dei pagamenti, gestione delle spese e recupero crediti».

Il menu «Prodotti» espone **cinque moduli commerciali**: Gestione della tesoreria, Connettività bancaria & ERP, Gestione delle spese, Pagamenti, Gestione dei crediti. Pianificazione della liquidità e Applicazione mobile esistono come pagine ma non compaiono nel menu principale.

Sotto il nome commerciale italiano si intravede la nomenclatura interna anglosassone, che affiora nei nomi dei file video e in alcune FAQ: **Cash Management (CM)**, **Cash Flow Planning (CFP)**, **Account Payable (AP)**, **Account Receivable (AR)**, **Spend Management**, **Payment Factory**. Utile saperlo perché la documentazione internazionale e le recensioni usano questi nomi.

---

## A1. Gestione della tesoreria

**URL:** `https://agicap.com/it/prodotti/gestione-della-tesoreria/`
**Nome interno:** Cash Management

**Job-to-be-done dichiarato:** «Gestisci la tesoreria della tua azienda in un'unica piattaforma — Connetti, prevedi e ottimizza i tuoi flussi di cassa, in tempo reale.» I tre benefici in testa alla pagina: *Prendi decisioni consapevoli basate su dati affidabili*, *Ottimizza le performance di cassa*, *Automatizza i processi e migliora la collaborazione*.

È il modulo centrale, quello a cui tutti gli altri si agganciano.

### Funzionalità elencate, con le label esatte

**«Automatizza e ottimizza la gestione della tesoreria a breve termine»**

| Label | Descrizione dichiarata |
|---|---|
| Monitoraggio delle posizioni di cassa giornaliere | «Visualizza e anticipa tutti i tuoi saldi, tenendo conto di previsioni, linee di credito, investimenti e fatture.» |
| Bilanciamento dei conti e dei pagamenti | «Automatizza il cash pooling, il netting e il calcolo con la pre-registrazione degli interessi.» `[FUORI SCALA]` |
| Riconciliazione automatica dei flussi | «Usa l'AI per automatizzare la riconciliazione dei flussi di cassa tra i movimenti bancari e le tue fatture.» |
| Creazione delle scritture contabili | «Genera facilmente le registrazioni bancarie per mantenere la tua contabilità aggiornata.» |

**«Prendi decisioni con dati affidabili e previsioni accurate»**

| Label | Descrizione dichiarata |
|---|---|
| La previsione di cassa da più fonti più completa sul mercato | Previsioni generate «sul tuo budget, sugli indicatori aziendali e finanziari e sulle performance passate» |
| Creazione automatica di previsioni dirette | Arricchimento dagli altri moduli: «flussi di finanziamento, flussi infragruppo, movimenti fornitori e clienti» |
| Gestione su più orizzonti temporali | «previsioni giornaliere, settimanali e mensili» in «moduli dedicati a diversi orizzonti temporali: settimanale, 13 settimane e annuale» |
| Simulazioni | «Crea scenari per visualizzare l'impatto delle tue decisioni sui flussi di cassa e sugli indicatori chiave, anche collegando più scenari tra loro» |

**Blocchi rivolti a strutture più grandi** — tutti `[FUORI SCALA]` per WEISS:

- **Gestione del Forex (FX):** esposizione FX consolidata di gruppo, simulazione della strategia di copertura (spot, forward, swap, opzioni vanilla ed esotiche), report sulle performance con tasso medio ponderato e coverage ratio.
- **Gestione del debito:** centralizzazione di debiti bancari e infragruppo, leasing, linee di credito; Posizione Finanziaria Netta e covenant; prestiti intercompany; previsioni sul debito.
- **Finanziamento dei crediti:** impatto del factoring sui flussi, centralizzazione delle condizioni contrattuali, abbinamento automatico fatture/soluzioni di finanziamento.
- **Gestione della liquidità investita:** quantificazione della liquidità in eccesso, simulazione investimenti, monitoraggio di importi investiti, interessi maturati, scadenze e tassi.

**«Esporta e condividi i tuoi report con un solo clic»:** dashboard personalizzabili, analisi dettagliata degli scostamenti «a livello di gruppo, azienda e singola categoria», consolidamento multi-entità, esportazione in Excel e PDF.

### Cosa mostra la schermata `[DA VIDEO]`

Il video `boucle_site_product_demo_CM_IT.mp4` mostra la schermata **«Situazione di cassa»**, in italiano. È la vista principale del prodotto.

**Barra di navigazione superiore:** `Tesoreria` (menu a tendina) · `Banca` · `In attesa` con badge numerico rosso `2` · `Riconciliazione` (a tendina) · `Area Finanziaria` (a tendina) · `Dashboards`. A destra: icona «aggiungi», ricerca, selettore di entità. In un secondo video il selettore mostra **«Gruppo ACME»**, cioè la scelta dell'entità/gruppo è un controllo globale sempre presente.

**Barra dei comandi:** filtro `Nessun fondo cassa` (selettore di raggruppamento dei conti), poi tre pulsanti d'azione: `Ripartire il previsionale`, `Assegnazione delle transazioni in attesa`, `Bilanciamento a…` (troncato).

**Grafico principale:** curva del saldo con asse Y da 0 a 3M €. Un tratto **grigio** a sinistra (consuntivo) e un tratto **blu** a destra (previsione), separati da una linea verticale tratteggiata etichettata **«Oggi»**. Ogni punto della serie è un cerchietto. Una **linea tratteggiata rossa orizzontale sullo zero** segna la soglia di scoperto. Asse X per giorni: 28 novembre → 2 gennaio. In alto a sinistra una card: **«Tesoreria attuale + 1.972.760,32 €»**.

**Sotto il grafico, due schede:** `Riepilogo dei saldi` | `Calendario delle transazioni`.

**Tabella dei saldi** — questa è la struttura dati che conta:
- Le **colonne sono i giorni** (Mercoledì 04/12, Giovedì 05/12, Venerdì 06/12, Sabato 07/12, Domenica 08/12, Lunedì 09/12, Martedì 10/12…). Il giorno corrente ha **due sottocolonne**: `Tesoreria attuale` e `Fine giornata`. I giorni non lavorativi (sabato, domenica) hanno un'icona a orologio e valori in grigio, riportati dal giorno precedente.
- Le **righe sono i conti**, su tre livelli: `Tutti i conti` (totale) → `Nessun fondo cassa` (raggruppamento espandibile) → i singoli conti bancari, nominati **`Intesa Sanpaolo - Conto 1726/12239`**, **`MPS - Conto n. 538285`**, **`Unicredit - C/C 93859`**.
- Ogni importo ha un **pallino colorato** a sinistra (rosso/viola) come indicatore di stato. Il conto Intesa mostra saldi negativi (−789.956,22 €), quindi la vista gestisce esplicitamente lo scoperto.

L'URL visibile in fondo allo schermo del mockup è `…icap.com/it/eco/cashflow`.

**Lettura per WEISS:** la struttura è *conti bancari × giorni*. La dimensione «punto vendita» non compare in questa vista; il raggruppamento disponibile è per fondo cassa e per conto. Vedi il caso miscusi in Parte B: la vista per singolo locale si ottiene con la funzione **Progetti**, non nativamente.

### FAQ della pagina — i dati di mercato che Agicap cita

La pagina chiude con sei FAQ lunghe, scritte in chiave SEO, che contengono le statistiche che Agicap usa come argomento di vendita in Italia (tutte attribuite alla propria *CFO Survey*, `[DA DOCUMENTAZIONE]`):

- Le aziende italiane registrano uno **scostamento medio del 17%** tra previsioni e flussi reali. Dove lo scostamento supera il 20%, «le commissioni di scoperto bancario sono in media l'88% più alte».
- Il **56% dei CFO italiani non monitora regolarmente i tempi di incasso**; il **49% delle PMI** ha registrato un peggioramento del DSO negli ultimi sei mesi.
- La previsione a **13 settimane** è presentata come «essenziale anche in Italia per adempiere agli adeguati assetti organizzativi previsti dal **Codice della Crisi d'Impresa**». È l'aggancio normativo su cui Agicap costruisce l'urgenza commerciale in Italia.

---

## A2. Pianificazione della liquidità

**URL:** `https://agicap.com/it/prodotti/pianificazione-liquidita/`
**Nome interno:** Cash Flow Planning

**Job-to-be-done dichiarato:** «Pianifica la liquidità a lungo termine consolidando i dati provenienti da diverse fonti, migliorando la creazione delle previsioni e il confronto con i dati effettivi.» I tre benefici: *Automatizza il rolling forecast da diverse fonti*, *Riduci il rischio legato a crisi economiche e volatilità del mercato*, *Identifica le opportunità*.

È il gemello a lungo termine del Cash Management: mentre quello copre il giorno e le 13 settimane, questo copre l'anno e oltre.

### Funzionalità elencate

- **Aggregazione multi-fonte:** «Riunisci i dati di previsione relativi a operazioni, finanziamenti e investimenti in un'unica interfaccia a livello di gruppo.»
- **Convertitore P&L → cassa:** «Converti il P&L previsto in una previsione di cassa con il convertitore dedicato.» È una funzione ricorrente in tutto il sito: si importa il conto economico previsionale o il budget e il sistema lo traduce in flussi di cassa.
- **Plug-in per fogli di calcolo:** «Collega i fogli di calcolo con il plug-in di Agicap per importare il budget o qualsiasi altro dato utile per le previsioni.»
- **Previsione in-app:** «dati storici, performance, stagionalità, formule» per affinare ipotesi e proiezioni.
- **Scenari multipli** per valutare opportunità di sviluppo.
- **Analisi degli scostamenti** tra reale e previsionale e tra scenari diversi, approfondibile «a livello di gruppo, divisione o entità».
- **Gestione del debito** integrata: prestiti e leasing in tutte le valute, strumenti di copertura (CAP, SWAP, FLOOR), calcolo automatico degli interessi su tasso fisso e variabile, indicatori condivisibili (debito netto, DSCR, capitale residuo). `[FUORI SCALA]`
- **Reportistica automatizzata** su flussi bancari, indebitamento netto, disponibilità nette, commissioni per banca, actual vs forecast.

La pagina propone anche tre coppie prima/dopo: *Ottimizza scadenze e tassi*, *Ottimizza l'autofinanziamento*, *Gestisci al meglio i castelletti bancari*.

### Cosa mostrano le schermate `[DA VIDEO]`

Il video `boucle_site_product_demo_CFP_IT.mp4` contiene due schermate molto istruttive.

**Schermata 1 — importazione e conversione del budget.** Stessa barra di navigazione (`Tesoreria`, `Banca`, `In attesa`, `Riconciliazione`, `Area Finanziaria`, `Dashboards`) con selettore «Gruppo ACME». In alto a destra i pulsanti `Importare nuovo` e `Convertire` (blu, primario). Il corpo è una griglia:

- **Colonne:** i mesi, da `GEN 24` a `GIU 25` — 18 mesi affiancati, con `DIC 24` evidenziato.
- **Righe:** le voci del piano dei conti, in italiano e con segno (ricavi positivi, costi negativi):
  *Vendita Beni ed Accessori · Vendita Merci · **Vendita per Corrispettivi** · Ricavi Vari · Acquisto Merci · Acquisti Vari · Acquisti di Pezzi di Ricambio · Acquisti Beni · Acquisti di Cancelleria · Competenze Personale · Consulenze Tecniche · Addestramento Personale · Contributi INPS · Carburante Automezzi · Spese Telefoniche · Spese Illuminazione · Premi assicurativi · Oneri Fiscali · Abbuoni e Sconti Passivi*

  Vale la pena notarlo: il piano dei conti mostrato è **italiano e realistico**, e include **«Vendita per Corrispettivi»** come categoria di flusso di primo livello. La granularità è quella di un piano dei conti di cassa, non di una contabilità generale.

**Schermata 2 — vista previsionale mensile.** Qui la navigazione ha etichette diverse (`Contanti`, `Banca 12`, `Previsto 7`, `Riconciliazione`, `Area Finanziaria`, `Pannello di controllo`): è **una localizzazione precedente e incoerente** con l'altra schermata — «Contanti» per *Cash*, «Pannello di controllo» per *Dashboard*. Segnale di una traduzione italiana stratificata nel tempo.

- **Filtri:** `Tutti i progetti` · `Gen. -> Dic.` · `Scenario principale` · `Vista consolidata`. Pulsanti `Aggiornare calcolo` e `Opzioni`.
- **Card KPI sovrapposte in alto a sinistra:** `+€2.998.785 Saldo in contanti` · `+€820.000 Regolazione` · `+€625.000 Investimenti` · `+€1.497.600 Totale`.
- **Grafico combinato:** barre verticali verdi (entrate) e rosse (uscite) per mese — **piene per il consuntivo, tratteggiate per il previsionale** — sovrapposte a una linea del saldo continua nel passato e tratteggiata nel futuro. Asse Y 0–250K.
- **Tabella sottostante:** righe `Tesoreria a inizio mese`, `Entrate` (icona verde, espandibile in sotto-voci), `Uscite` (icona rossa), `Tesoreria alla fine del mese`, `Indicatori chiave` (icona stella). Le colonne dei mesi passati sono in nero, quelle future in **corsivo grigio**. Il mese corrente è evidenziato in azzurro e accanto a ogni importo mostra una **percentuale di realizzazione** (67%, 63%, 45%, 46%): quanto del previsto si è già materializzato.

Due elementi di design meritano di essere rubati: la distinzione tipografica consuntivo/previsionale (nero vs corsivo grigio, barra piena vs tratteggiata) e la percentuale di avanzamento del mese in corso accanto al valore.

---

## A3. Connettività bancaria & ERP

**URL:** `https://agicap.com/it/prodotti/comunicazione-bancaria/`

**Job-to-be-done dichiarato:** «Software di connettività bancaria ed ERP: connetti banche e sistemi ERP ovunque nel mondo». Si autodefinisce «il tassello mancante nella tua suite finanziaria».

### Funzionalità elencate

- **Connettività bancaria:** «Centralizza tutti i tuoi dati bancari […] grazie ai protocolli SWIFT e ai collegamenti diretti Host-to-Host (H2H). Effettua pagamenti in tutta sicurezza, ovunque nel mondo e in qualsiasi valuta.»
- **Connettività ERP:** «Recupera fatture e ordini. Esporta gli estratti conto bancari. Integra i tuoi file di pagamento. Invia le scritture contabili, i registri degli acquisti e delle vendite.»
- **API pubblica** con portale sviluppatori, più connessione via **SFTP**.
- Dichiarati **«Più di 400 ERP integrati»** e «centinaia di altri business tool». `[DA DOCUMENTAZIONE]`

### I protocolli, con la rilevanza italiana esplicitata

Le FAQ di questa pagina sono la parte tecnicamente più densa del sito. `[DA DOCUMENTAZIONE]`

| Protocollo | Ambito dichiarato |
|---|---|
| **CBI (Corporate Banking Interbancario)** | «Mercato Italiano» — presentato come lo standard per accentrare ricezione flussi e invio disposizioni in Italia |
| **SWIFT** | Rete globale, «oltre 10.000 istituti in più di 200 Paesi», formati MT e MX. `[FUORI SCALA]` |
| **H2H (Host-to-Host)** | Connessione diretta cifrata server-banca, per grandi volumi; richiede implementazione dedicata per ciascuna banca |
| **AFT/SFTP** | Alternativa a H2H quando l'integrazione diretta non è possibile |
| **EBICS** | Area DACH e Francia |
| **BACS / EDITRAN** | Regno Unito (solo pagamenti) e Spagna |

Sull'integrazione ERP viene insistito sul fatto che debba essere **bidirezionale**: inbound gli estratti conto normalizzati in tracciati CBI o **ISO 20022 camt.053**; outbound le distinte di pagamento e l'aggiornamento delle scadenze aperte.

Sulla sicurezza dei pagamenti: cifratura in transito (TLS) e a riposo (AES 256), **ISO 27001**, GDPR, matrici di firma con doppia validazione e separazione preparazione/firma, controfirme per importi elevati, **RBAC** con diritti di preparazione, validazione e firma assegnati a profili distinti, avvisi su ogni modifica dei beneficiari.

Altrove (pagina Metodi di pagamento) si aggiungono **MFA**, **controlli automatici dell'IBAN** e la firma con token **SWIFT 3Skey**.

### Le integrazioni dichiarate

**URL:** `https://agicap.com/it/le-nostre-integrazioni/`

La pagina raggruppa i connettori in Banca · ERP & Contabilità · PSP · Altro. Elenco osservato:

**Banche italiane:** Intesa Sanpaolo, UniCredit, Banco BPM, Banco Desio, Poste Italiane, Banca Sella, Banca Popolare di Sondrio, MPS, Credem, BPER Banca, Volksbank. **Estere/neobanche:** Qonto, Revolut, Crédit Agricole.

**ERP e gestionali italiani** — la lista è notevolmente localizzata: **TeamSystem – Gamma Enterprise**, **TeamSystem – Alyante**, **Sistemi – eSolver**, **Sistemi – PROFIS**, **Passepartout – Mexal**, **Wolters Kluwer – Arca Evolution**, **Centro Software – SAM ERP2**, **Panthera**, **Sanmarco Informatica – Jgalileo**, **NTS – Business Cube**.

**ERP internazionali:** Dynamics 365 Business Central, Microsoft Dynamics Navision, SAP Business One, SAP S4 HANA, Oracle NetSuite, Oracle JD Edwards, Odoo, Sage X3, Xero, QuickBooks, Datev Koinos, IBM AS400.

**PSP:** Stripe, PayPal, Adyen, Payplug, Payoneer. **Altro:** SharePoint, Google Sheet, Drive, Excel.

Per chi non trova il proprio strumento sono offerte tre vie: **matrici personalizzate** («Possiamo integrarci a qualsiasi strumento in due click»), **Open API**, **SFTP**.

**Integrazione Fatture in Cloud** (`https://agicap.com/it/le-nostre-integrazioni/fatture-in-cloud/`): permette di «visualizzare in tempo reale l'impatto delle fatture emesse e ricevute in sospeso sul tuo flusso di cassa», tracciare le fatture scadute per ottimizzare i promemoria, centralizzare fatturazione e liquidità. Dichiara anche l'integrazione automatica dei **preventivi** nelle previsioni.

### Sulla fatturazione elettronica italiana e l'SDI

**Nelle pagine prodotto italiane non esiste alcuna menzione di SDI, Sistema di Interscambio o fatturazione elettronica.** Ho cercato l'intero testo di tutte le 38 pagine scaricate — prodotti, funzionalità, integrazioni e casi studio — per «SDI», «Sistema di Interscambio», «fattura/fatturazione elettronica» e «Agenzia delle Entrate»: zero occorrenze. Anche «corrispettivi» compare una volta sola, in senso generico («l'effettivo incasso del corrispettivo», nella definizione di DSO), mai come istituto fiscale.

Il modello di Agicap è **mediato**: non si collega all'Agenzia delle Entrate, si collega al gestionale (Fatture in Cloud, TeamSystem, Sistemi, Passepartout…) che a sua volta gestisce il ciclo SDI. Le fatture entrano in Agicap come dati di scadenzario provenienti dall'ERP, via API o SFTP. Per un'azienda che non ha un gestionale già integrato, questo è un anello mancante da costruire.

---

## A4. Gestione delle spese

**URL:** `https://agicap.com/it/prodotti/paga-i-fornitori/` (e `https://agicap.com/it/funzionalita/gestione-delle-spese/`)
**Nome interno:** Account Payable / Spend Management

**Job-to-be-done dichiarato:** «Il software di gestione delle spese tutto in uno — Carte aziendali, budget, note spese e pagamenti fornitori: tutto su un'unica piattaforma.» Copre l'intero ciclo passivo, dalla richiesta d'acquisto alla riconciliazione.

### Funzionalità elencate

Il blocco «Controlla tutte le tue spese» elenca nove aree: *Carte aziendali e note spese · Budget · Documenti d'ordine e di consegna · Scansione e verifica delle fatture · Automazione contabile · Richieste di rimborso spese · Pagamenti · Connettività ERP · Sincronizzazione con le previsioni*.

**«Riduci i costi e gestisci i budget in tempo reale»** — il blocco più rilevante per un'azienda multi-sede:

| Label | Descrizione dichiarata |
|---|---|
| **Monitoraggio del budget per centro di costo** | «Crea centri di costo e definisci budget per controllare le spese a livello di team. Monitora l'utilizzo del budget e il suo impatto sul flusso di cassa in tempo reale.» |
| **Categorizzazione automatica delle spese** | «Assegna e categorizza automaticamente tutte le spese a un centro di costo.» |
| Richieste di acquisto e processo di approvazione | «Assicurati che ogni spesa sostenuta dall'azienda sia stata previamente approvata.» |
| Definizione delle restrizioni di pagamento | «Limita l'uso delle carte in base alle tue regole interne.» |

**Carte aziendali:** raccolta delle ricevute («Recupera facilmente il 100% delle ricevute dei tuoi team»), limiti e autorizzazioni per carta, multi-valuta su circuito **Agicap Mastercard**, carte fisiche e virtuali (usa-e-getta o per abbonamenti).

### Il flusso approvativo, come descritto nelle FAQ `[DA DOCUMENTAZIONE]`

I workflow si configurano per **soglie di importo**, **natura merceologica** e **centro di costo o dipartimento**. Approvata la richiesta, il sistema genera l'ordine d'acquisto che resta collegato alla bolla e alla fattura — **three-way matching** esplicito. Contestualmente «l'approvazione genera una transazione previsionale che aggiorna in tempo reale il piano di cash flow»: l'impegno di spesa entra nel forecast prima della fattura.

La **pre-contabilità** estrae i dati da fatture fornitore, note di credito e transazioni con carta, e associa ogni operazione «al corretto centro di costo e al relativo codice IVA» prima dell'export verso l'ERP.

### Numeri dichiarati `[DA DOCUMENTAZIONE]`

- Costo medio in Italia per elaborare e pagare una fattura fornitore: **8,34 €**; per una PMI «con volumi standard», fino a ~300.000 €/anno.
- **59%** dei CFO non usa un software specifico per le fatture fornitori; **12%** gestisce i pagamenti solo con Excel; **58%** dichiara difficoltà a controllare le spese non autorizzate.
- Benefici promessi: **−50%** attività manuali, **−10%** spese operative, chiusura contabile **3 volte più rapida**.

---

## A5. Pagamenti

**URL:** `https://agicap.com/it/prodotti/pagamenti/` (e `https://agicap.com/it/funzionalita/metodi-di-pagamento/`)
**Nome interno:** Payment Factory

**Job-to-be-done dichiarato:** «Software di gestione dei pagamenti multibanca — La Payment Factory di Agicap si collega a banche ed ERP per automatizzare, centralizzare e mettere in sicurezza ogni pagamento aziendale.»

### Funzionalità elencate

**Paga da tutte le banche in tutte le valute:** soluzione multi-protocollo (CBI, H2H, SWIFT), pagamenti multi-valuta conformi **ISO 20022**, **gestione del PSR** («Ricevi tutti i livelli di conferma supportati dalla tua banca direttamente in Agicap»).

**Metti in sicurezza i tuoi processi:** convalida da mobile, **regole di firma** (singola o doppia), **gestione dei beneficiari** con notifica su ogni modifica dell'anagrafica, **storico delle firme** («Tieni traccia di ogni azione effettuata su ciascun pagamento, dalla firma all'invio in banca»).

Tipi di pagamento supportati dichiarati: fornitori, stipendi, giroconti interni. Il modulo è collegato direttamente alle previsioni: «Monitora in tempo reale l'impatto di tutti i pagamenti sul flusso di cassa a breve, medio e lungo termine.»

---

## A6. Gestione dei crediti

**URL:** `https://agicap.com/it/prodotti/fatti-pagare-dai-clienti/` (e `https://agicap.com/it/funzionalita/solleciti-di-pagamento/`)
**Nome interno:** Account Receivable / CashCollect

**Job-to-be-done dichiarato:** «Incassa i crediti in modo semplice e rapido — Agicap automatizza i promemoria per i clienti, migliorando la gestione e il monitoraggio dei crediti.» I tre benefici: *Automatizza il recupero crediti e riduci l'uso dei finanziamenti a breve termine*, *Centralizza le comunicazioni tra i team*, *Analizza il rischio cliente, monitora il DSO e adegua la politica creditizia*.

### Funzionalità elencate

| Label | Descrizione dichiarata |
|---|---|
| Monitoraggio degli indicatori chiave | «visione in tempo reale del DSO, dello scadenzario e dei crediti in sospeso. Identifica e monitora i clienti morosi» |
| Consolidamento dei dati | tempo medio di incasso a livello di gruppo |
| **Integrazione con la previsione di cassa** | «Rendi più affidabili le previsioni di cassa, integrando il **DSO effettivo di ciascun cliente**» |
| Recupero automatico delle fatture | «Collega il tuo ERP e i business tool tramite API e SFTP per recuperare fatture, clienti e contatti» |
| Promemoria automatizzati | template personalizzabili «includendo un link per il pagamento» |
| Gestione delle controversie | «Contrassegna le tue fatture contestate per sospendere temporaneamente i promemoria automatici» |
| Gestione del rischio cliente | «Stabilisci un limite di insoluti per ogni cliente» |

L'idea più interessante è **il DSO per singolo cliente che alimenta il forecast**: la data di incasso attesa non è la scadenza teorica della fattura ma quella stimata dal comportamento storico di quel cliente. Ricompare in tutto il sito come argomento centrale sull'accuratezza delle previsioni.

**Sequenze di sollecito:** combinano **email automatiche** e **promemoria di chiamata** per il team. La pagina è esplicita su un limite: «la chiamata resta comunque un'attività manuale, **Agicap non contatta il cliente al posto tuo**». Le sequenze possono essere completamente automatiche o semi-automatiche con validazione preventiva per i key account; possono essere per singola fattura o **di gruppo** (tutte le fatture aperte dello stesso cliente in un solo sollecito). I clienti si segmentano «per dimensione, area geografica o categoria».

Sulle contestazioni: il flag «in contestazione» esclude la fattura dai solleciti; l'esclusione dalle previsioni di cassa è possibile ma **«è un'opzione da attivare nelle impostazioni, non un comportamento automatico di default»**.

### Cosa mostra la schermata `[DA VIDEO]`

Il video `boucle_site_product_demo_AR_IT.mp4` mostra la scheda **«Analisi»** del modulo crediti, in italiano.

**Navigazione del modulo:** `Fatture clienti` · `Analisi` (attiva) · `Clienti` · `Promemoria` con badge `12`. Filtri: `Valuta: €-EUR` e `Filtra`. Selettore entità «Gruppo ACME».

**Quattro riquadri:**

1. **«Importo rimanente»** — cifra grande **€634.585**, sotto una barra orizzontale divisa in due segmenti (verde/rosso) e la ripartizione: `Non scaduta €112.212` con badge verde `37%` · `Scaduto €522.273` con badge rosso `63%`.
2. **«Saldo parziale»** — istogramma per **fasce di anzianità dello scaduto**, con importo e numero di fatture sopra ogni barra: `Non scaduta €39.393 / 3 fatture` (verde) · `<30j €44.900 / 7 fatture` (rosso scuro) · `30-60j €15.002 / 3 fatture` · `60-90j €5.300 / 2 fatture` · `>90j €2.000 / 1 fattura`. Asse Y 0–75.000 €. Le barre sfumano dal rosso intenso al rosa al crescere dell'anzianità.
3. **«DSO»** — numero grande **`38 giorni`** con variazione **`-53%`** e freccia verde discendente; selettore di periodo `3 mesi | 6 mesi | 12 mesi`. Sotto, istogramma mensile del DSO con etichetta su ogni barra: Ago 41g · Sett 38g · Otto 58g · Nov 91g · Dic 81g · Genn 38g, su una **linea tratteggiata di riferimento a 50 giorni**. Le barre passano dall'azzurro chiaro al blu scuro col tempo.
4. Un **riquadro didattico** «DSO, days sales outstanding: un indicatore di performance della tua tesoreria», con spiegazione e link «Scopri di più», chiudibile con una X. Onboarding educativo dentro la dashboard.

Una seconda illustrazione della stessa pagina mostra la schermata **«Segmentare i clienti»**: righe cliente con **tag colorati** — `Controversia` (bandiera rossa), `Account chiave` (azzurro), `Cattivo pagatore` (viola), `Italy` (grigio) — e un pannello **«Assegnare i tag»** con menu a tendina, due campi data e pulsante `Convalidare`.

---

## A7. Applicazione mobile

**URL:** `https://agicap.com/it/prodotti/applicazione-mobile/`

**Job-to-be-done dichiarato:** «Gestisci. Decidi. Cresci. Tutto dal tuo smartphone — Non aspettare di essere in ufficio per controllare i tuoi KPI.»

Funzionalità elencate: cattura foto della ricevuta e invio istantaneo della nota spese; **«riepilogo del lunedì mattina»** (recap settimanale automatico sullo stato della tesoreria); approvazione dei pagamenti da mobile; visualizzazione di saldi e transazioni recenti; monitoraggio budget; **notifiche push** su ogni operazione importante; dashboard preferite in home e condivisione in PDF con un clic; individuazione di rischi di scoperto e opportunità di investimento.

Il pattern del «riepilogo del lunedì mattina» ricorre anche nella pagina MCP come caso d'uso via Slack: è un tema di prodotto, non una singola funzione.

---

## A8. Funzionalità trasversali

### Monitoraggio cash flow
**URL:** `https://agicap.com/it/funzionalita/monitoraggio-cash-flow/`

«Niente più ore passate su Excel». Elenca: **sincronizzazione bancaria** — dichiarata compatibile con «oltre 300 banche italiane ed europee» `[DA DOCUMENTAZIONE]`; **classificazione automatica dei flussi** («Definisci le categorie delle entrate e uscite di cassa e anche le regole di classificazione avanzate. Lascia che l'intelligenza artificiale di Agicap classifichi automaticamente tutte le tue operazioni bancarie»); **confronto in tempo reale tra situazione effettiva e budget**, con budget impostabili «per ogni categoria di entrate e uscite di cassa»; **esportazione in Excel** con un clic; **riconciliazione bancaria automatica** («Agicap suggerisce automaticamente la riconciliazione tra le operazioni pagate e quelle impegnate»); **monitoraggio delle linee di credito** («Visualizza il castelletto utilizzato e disponibile, sia in aggregato che banca per banca», con proiezione di quando si libererà e su quale banca conviene anticipare le fatture).

Le illustrazioni di questa pagina sono asset stilizzati **in inglese** (`Automate flows categorisation`, `Automatic cash reconciliation`), non localizzati: mostrano una lista di transazioni con badge `To categorise` e un pannello `Categories` a icone (aereo, casa, treno, ristorante, globo, persone), e una lista di movimenti con importi verdi/rossi più un pannello `Forecast matching` con menu a tendina, due date e pulsante `Validate`.

### Tesoreria previsionale
**URL:** `https://agicap.com/it/funzionalita/tesoreria-previsionale/`

Combina aggregazione bancaria e dati previsionali da AP/AR «e altri flussi prevedibili (affitti, stipendi, tasse, debiti, ecc.)»; riconciliazione avanzata; previsione a 13 settimane; convertitore P&L→cassa; analisi dello storico; impatto automatico del DSO sulla previsione; scenari.

**Nota sulla qualità della localizzazione:** questa pagina ha **quattro bullet non tradotti, rimasti in francese** («Analysez vos écarts en comparant le réel avec le prévisionnel…») e la **CTA finale in spagnolo** («¡Prueba con tus datos! / Pruébalo gratis»). È un indizio concreto di quanto la versione italiana sia manutenuta a rincorsa sulla base francese.

### Reporting e collaborazione
**URL:** `https://agicap.com/it/funzionalita/reporting/`

Report «per il tesoriere, il CFO, l'amministratore delegato e gli investitori». Le sei tematiche elencate come schede: **Pool bancario · Cash burn e runway · Analisi degli scostamenti · Indebitamento · Investimenti · DSO**. Sul pool bancario: consolidamento dei dati di tutti i conti, volume dei flussi in entrata/uscita per banca, importo delle commissioni e capitale in circolazione per banca, per «analizzare la distribuzione delle commissioni bancarie».

### Consolidamento `[FUORI SCALA]` (in parte)
**URL:** `https://agicap.com/it/funzionalita/consolidamento/`

Navigazione immediata tra vista per singola azienda e vista consolidata, **più livelli di consolidamento** configurabili, tabella dei saldi su tutti i conti, confronto grafico delle performance tra società, individuazione degli scostamenti dal budget. Gestione multi-valuta con tassi aggiornati quotidianamente o personalizzati.

Il meccanismo di **navigazione gerarchica gruppo → entità → conto** è concettualmente rilevante anche per WEISS (gruppo → punto vendita), ma qui è costruito sull'entità giuridica, non sul punto vendita.

### Cash pooling automatizzato `[FUORI SCALA]`
**URL:** `https://agicap.com/it/funzionalita/cash-pooling-automatizzato/`

Definizione dei cash pool e dei conti di destinazione, mappatura delle relazioni tra pool, **suggerimenti automatici di giroconti di bilanciamento** basati su struttura dei pool e previsioni a breve, con anteprima dell'impatto sulla cassa; i bonifici convalidati passano automaticamente al modulo Pagamenti e sono marcati come interni.

### Gestione del debito `[FUORI SCALA]`
**URL:** `https://agicap.com/it/funzionalita/gestione-del-debito/`

Centralizzazione di finanziamenti a tasso fisso e variabile e leasing in tutte le valute, tabelle di ammortamento automatiche, **calcolo degli interessi su tasso variabile con aggiornamento quotidiano dell'EURIBOR**, strumenti di copertura (CAP, SWAP, FLOOR) applicabili a parte del montante o del periodo, indicatori (capitale residuo, servizio del debito, debito netto), valutazione dell'esposizione per banca.

### Carte aziendali
**URL:** `https://agicap.com/it/funzionalita/carte-aziendali/` — vedi A4, stesso perimetro.

---

## A9. Il modulo AI: Agicap MCP Server

**URL:** `https://agicap.com/it/funzionalita/mcp-server/`

È l'unico modulo del sito interamente costruito attorno all'AI, ed è recente.

**Job-to-be-done dichiarato:** «Agicap MCP: i dati della tua tesoreria, in ogni assistente AI — Trasforma il cash flow, la gestione di debiti e crediti e le previsioni in una fonte di dati intelligente. Interroga, automatizza e agisci sui dati della tesoreria in tempo reale, usando il linguaggio naturale.»

### Come funziona, secondo la pagina `[DA DOCUMENTAZIONE]`

Espone i dati Agicap via **Model Context Protocol**, lo standard aperto di Anthropic, verso assistenti esterni — **Claude e ChatGPT sono citati per nome**. Un unico endpoint sicuro («gateway universale») al posto di un'integrazione per piattaforma.

Sul controllo degli accessi la pagina è insolitamente precisa: ogni richiesta «passa attraverso il tuo identity provider ed **eredita i permessi Agicap dell'utente**, così nessuno strumento AI può accedere a dati che la persona che lo utilizza non è autorizzata a vedere». Gli amministratori scelgono quali strumenti collegare e se l'accesso è **in sola lettura o anche in scrittura** sui dati di tesoreria. «Se un utente può accedere solo a determinate entità, anche l'assistente AI potrà recuperare esclusivamente i dati di quelle entità.» Nessuna API key, nessun codice: «progettato per i team Finance, non per gli sviluppatori».

### I sei casi d'uso dichiarati (attribuiti a clienti reali) `[DA DOCUMENTAZIONE]`

1. **Briefing settimanale sulla liquidità per il CEO** — ogni lunedì un report sintetico su Slack con posizioni di cassa, variazioni sulla settimana precedente e punti di attenzione.
2. **Aggiornamento automatico del Board Pack** — l'AI recupera i dati e aggiorna la presentazione prima del board.
3. **Domande ad hoc e accesso self-service** — «Le continue richieste interne trasformano il team Finance in un help desk»: il chatbot risponde al posto loro.
4. **Analisi degli scostamenti on demand** — cause e fattori esplicativi degli scostamenti, per qualsiasi periodo, entità o categoria.
5. **Creazione assistita delle previsioni di cassa** — usa «il modello di **Machine Learning** di Agicap» per generare scenari ottimistici, mediani e pessimistici, più what-if in linguaggio naturale («Cosa succede se il costo delle materie prime aumenta del 10%?»).
6. **Ricategorizzazione massiva delle transazioni** — «Ricategorizza centinaia di transazioni con un'istruzione, usando controparte, importo o altri criteri. Rivedi le modifiche prima di applicarle.»

Il punto 5 conferma en passant l'esistenza di un **modello di ML proprietario per il forecasting**, citato qui e in nessun'altra pagina prodotto. Il punto 6 è il più concreto: la ricategorizzazione massiva con revisione prima dell'applicazione.

Due citazioni interne inquadrano la strategia: l'AI Engineer Kelly Roussel sull'integrazione «negli strumenti di AI che il tuo team utilizza già ogni giorno», e il CEO Sébastien Beyet: «Fare domande è solo il primo passo: il vero valore sta nell'agire sui tuoi dati. La maggior parte delle automazioni in ambito finance non fallisce perché la logica è sbagliata, ma perché si basa su dati non aggiornati.»

### AI altrove nel prodotto

Oltre a MCP, l'AI è dichiarata in tre punti: **riconciliazione automatica dei flussi** «usa l'AI» (pagina Tesoreria); **classificazione automatica delle operazioni bancarie** (pagina Monitoraggio cash flow); **creazione ed export delle scritture contabili** «grazie a regole e suggerimenti basati su AI» (caso Madeo, dove è quantificata al 95%).

---

# PARTE B — Casi studio

I 36 casi studio pubblicati sono schedati con una griglia costante: **settore · dimensione · sede · use case**, più «punti chiave», numeri in evidenza, esigenze, soluzione e conclusioni. La griglia stessa è informativa: gli use case ricorrenti sono *Monitoraggio quotidiano della liquidità*, *Creazione di previsioni più accurate*, *Automazione del reporting*, *Ottimizzazione dei pagamenti*, *Gruppo*, *Finanziamento e controllo del capitale circolante*.

## I tre casi più rilevanti per WEISS

### 1. miscusi — ristorazione multi-locale, Milano

`https://agicap.com/it/clienti/miscusi/`

**È il caso più vicino a WEISS di tutto il sito.** Settore: **Hospitality e ristorazione**. Dimensione: PMI (fatturato 10–50M). Sede: Milano. Numeri: **15 ristoranti**, **oltre 300 dipendenti**, **5 conti bancari collegati**. Use case dichiarati: finanziamento e controllo del capitale circolante, monitoraggio quotidiano della liquidità, previsioni più accurate, ottimizzazione dei pagamenti, gruppo, alto fabbisogno di capitale circolante.

**Problema di partenza:** «un semplice foglio Excel con cadenza settimanale» con due problemi dichiarati da Marcello Caroli, Accountant: errori umani che intaccavano l'accuratezza delle previsioni, e mancanza di aggiornamento in tempo reale.

**Moduli adottati:** Cash Management con **scenari**, e **Agicap Payment**.

**Benefici dichiarati** (nessuno quantificato, a differenza di altri casi):
- Snellimento della raccolta dati finanziari, prima «un lavoro manuale e senza valore aggiunto» — citato esplicitamente il download manuale degli estratti conto da più banche.
- Scenari: «Attualmente lo scenario che utilizziamo maggiormente è quello che prende in considerazione il **budget annuale**, che ci permette di avere un'analisi aggiornata degli scostamenti rispetto al previsionale.»
- Centralizzazione dei pagamenti fornitori, prima effettuati da più banche, con separazione dei ruoli: tutti gli utenti possono predisporre e inviare, l'utente pagatore approva.

**Il passaggio più utile per noi** è l'osservazione sul ciclo di cassa della ristorazione: «*Poiché esiste un sostanziale allineamento tra tempo di incasso e consumazione del cliente, la gestione della tesoreria nella ristorazione non prevede grandi peculiarità a livello attivo. Questo però non è altrettanto vero per la fatturazione passiva*», con pagamenti fornitori a 30 o 60 giorni. Cioè: nell'horeca il valore di un sistema di tesoreria si concentra quasi tutto sul **ciclo passivo**, non sui crediti. L'intero modulo Gestione dei crediti — DSO, solleciti, segmentazione clienti, il pezzo su cui Agicap investe di più — è in larga parte **irrilevante per un'azienda che incassa per cassa**.

**Il limite che il caso rivela.** Sotto «Prossimi passi»: «*L'azienda sta implementando la funzione "Project Management" per gestire anche il cash flow di ogni singolo store e avere così una view specifica per ristorante.*»

Questo è il rilievo più importante dell'intera ricerca: **la dimensione «punto vendita» non è nativa in Agicap**. Con 15 ristoranti attivi e il caso studio già pubblicato, la vista per singolo locale era ancora «in implementazione», ottenuta piegando allo scopo una funzione **Progetti** pensata per la commessa (il filtro `Tutti i progetti` è visibile nella schermata previsionale). Per WEISS, che nasce con tre punti vendita e centri di costo come dimensione primaria, è esattamente il punto in cui un gestionale proprio può fare meglio di uno strumento generalista.

### 2. Mediterranean Hospitality — gruppo alberghiero familiare, Ricadi (VV)

`https://agicap.com/it/clienti/mediterranean-hospitality/`

Settore: **Hospitality e ristorazione**. Dimensione: PMI (fatturato 10–50M). **Quattro società**, ~250 collaboratori, 245 camere, nato nel 1978. Problema di cash flow schedato: «Gestione di CAPEX in uscita con conseguente squilibrio di cassa» — ristrutturazioni durante la chiusura stagionale, con uscite concentrate quando non ci sono entrate. **La stagionalità estrema è il tratto che condivide con l'horeca in generale.**

**Problema di partenza:** «Prima di Agicap, gestivamo la tesoreria attraverso l'utilizzo di un foglio di calcolo Excel. Gestendo più aziende dovevamo elaborare più file. L'analisi veniva fatta mensilmente, non in tempo reale» (Stefania Rito, Responsabile Contabilità, Finanza e Controllo).

**Moduli adottati:** **Dashboard** e **Consolidamento**.

**Benefici dichiarati** (nessuno quantificato): dashboard per KPI specifici — con un uso interessante: «*una dashboard che ci permette di analizzare in termini percentuali quanto impatta una determinata entrata o uscita nel mese di riferimento*», cioè l'incidenza percentuale di ogni voce sul mese, non il valore assoluto. Il consolidamento permette di vedere il flusso di una sola società, di più società o di tutto il gruppo.

### 3. Gruppo Madeo — agroalimentare, San Demetrio Corone (CS)

`https://agicap.com/it/clienti/madeo/`

Non è horeca ma è **il caso studio più dettagliato e quantificato del sito italiano**, ed è una PMI familiare italiana di scala confrontabile. Settore: industria alimentare. **€30M di fatturato, 5 società, 150 dipendenti**, 7 banche, oltre 25 conti correnti, >50% export.

**Problema di partenza:** accessi quotidiani a più portali bancari, download dei movimenti, registrazioni manuali sul gestionale, «quasi mezza giornata solo per aggiornare i saldi, con il coinvolgimento di 2 o più persone». Bonifici inseriti a mano, **5–10 minuti ciascuno per ~150 operazioni al mese**.

**Moduli adottati:** praticamente tutti — connettività bancaria, riconciliazione e scritture contabili, previsione a 13 settimane, cash pooling, pagamenti massivi, carte aziendali, gestione dei crediti.

**Benefici quantificati dichiarati:**
- **95% della creazione ed export delle scritture contabili automatizzato**, su volumi di **~1.200 movimenti al mese (~50 al giorno)**, «grazie a regole e suggerimenti basati su AI».
- Risparmio quotidiano di **15–30 minuti** solo sul recupero movimenti da 7 banche.
- Pagamenti: da bonifici singoli a **distinte massive fino a 50 bonifici**, via file XML.
- **8 persone lavorano nella stessa piattaforma** su incassi, pagamenti, carte e liquidità.
- Portafoglio di **900 clienti** gestito con regole di sollecito differenziate; disponibile un **portale cliente** dove il cliente consulta le proprie fatture scadute e in scadenza.

Da notare la distinzione, esplicitata solo qui, tra **due automazioni diverse**: l'*abbinamento movimento↔fattura* (chiusura delle partite) e la *creazione delle scritture contabili* (pre-contabilizzazione ed export verso l'ERP). È il 95% della seconda, non della prima.

## Gli altri casi letti

| Cliente | Settore / dimensione / sede | Problema di partenza | Moduli | Benefici quantificati dichiarati |
|---|---|---|---|---|
| **Bofrost\*** (filiale Spagna) | Industria alimentare, >50M, Cordova | 35 filiali semi-autonome, ERP SAP S/4 HANA non aggiornato da 15 anni, reporting alla capogruppo tedesca fino a **2 settimane** | Cash Management, reporting, scenari, pagamenti; connettività EDITRAN + SAP | 18.000 fatture/anno, **1.500 fatture/mese** riconciliate, 35 sedi, 1.000 dipendenti |
| **VetPartners España** | Servizi (cliniche veterinarie), >50M, Madrid `[FUORI SCALA]` (fondo, LBO) | **Oltre 35 cliniche**, visibilità sulla liquidità di ciascuna, reporting agli azionisti UK | Cashflow, viste consolidate e per entità, dashboard, Payment | Nessuno quantificato |
| **Vivason** | **Retail** (apparecchi acustici), >50M, Parigi | **Oltre 50 centri**, alto fabbisogno di circolante per attesa dei rimborsi assicurativi | Consolidamento, previsioni, reporting | **~3 ore/settimana** risparmiate dal CFO |
| **Girasole Energies** | Energia, 10–50M, Parigi `[FUORI SCALA]` | 30+ società, 100+ impianti, 15M€ di debito | Cash management, pagamenti, investimenti | **Oltre 300 fornitori pagati al mese** |
| **Seiven** | Servizi, 10–50M, Francia `[FUORI SCALA]` (LBO, build-up) | Consolidamento manuale dei saldi, **30 min/mattina** in Excel; nessun indicatore di circolante | EBICS TS, ERP, Gestione delle spese | Modulo spese attivo **in meno di 3 settimane**; **oltre 500.000 €** di liquidità liberata |
| **Corriere dello Sport** | Servizi (editoria), 10–50M, Roma | Tesoreria su Excel, tempi di incasso lunghi | Cash management, scenari, dashboard | Gestione degli incassi **da alcuni giorni a 10 minuti** grazie alla classificazione automatica |
| **Instilla** | Servizi (lavoro su commessa), 10–50M, Milano | Flussi prospettici su commessa; **conformità al Codice della Crisi d'Impresa** (previsione a 12 mesi) | Previsioni, reporting | Reportistica **da una giornata o più a 1–2 ore** |
| **GV Filtri Industriali** | Manifatturiero, 10–50M, Baldissero Torinese | Cash flow su commessa; ERP non connesso alle banche | Sincronizzazione bancaria (5 banche), scenari | **Onboarding in 48 ore**; formazione in mezza giornata |
| **Manetti Group** | Servizi (consulenza), <10M, Prato | Strumento per seguire i clienti nel controllo di gestione | Previsionali, scenari, KPI | **200+ aziende seguite**; «oltre il 30% di aumento dei margini di tesoreria su base annua» |
| **Nutrisens** (citato) | Industria alimentare, Collegno | Solleciti manuali una volta al mese | Gestione dei crediti | **DSO −14% in tre mesi**, con crescita del fatturato del 27%; ~100 profili cliente/mese |
| **Gruppo Plenetude** (citato) | — | 9 società, 12 conti bancari, Excel alimentato a mano | Consolidamento | Nessuno quantificato |
| **Hennecke** (citato) | — | 4 persone per un giorno intero a settimana sul forecast | Previsioni | Da un giorno a **~2 ore**; **~1.200 ore/anno** risparmiate |
| **Trocellen** (citato) | — | — | Monitoraggio KPI | **Cash Conversion Cycle da 55 a 33 giorni** |

## Cosa dice la distribuzione dei casi

**Horeca/retail/multi-sede.** Su 36 casi pubblicati, il settore «Hospitality e ristorazione» compare due volte (miscusi, Mediterranean Hospitality), «Retail» una (Vivason). Le realtà **multi-sede** sono invece numerose (miscusi 15 ristoranti, Bofrost 35 filiali, VetPartners 35 cliniche, Vivason 50 centri, Girasole 100 impianti): è chiaramente un segmento che Agicap presidia, ma **quasi sempre come multi-*entità giuridica* o multi-*filiale con conto proprio***, non come multi-punto-vendita che condivide conti e incassa per cassa.

**Il pattern narrativo è sempre lo stesso**: si parte da Excel aggiornato a mano, si passa alla connettività bancaria automatica, si guadagna tempo, si arriva agli scenari. Il beneficio più frequentemente quantificato è **tempo risparmiato**, non denaro.

**Il tema del punto vendita affiora due volte come problema aperto**: in miscusi, con i «Progetti» da implementare per avere la vista per ristorante; in Bofrost, dove l'esigenza dichiarata è «automazione della categorizzazione manuale di tutte le transazioni bancarie e della **loro assegnazione alla filiale corretta** (tutte le operazioni confluiscono su un unico conto bancario)». Quel «tutte le operazioni confluiscono su un unico conto bancario» è precisamente la condizione di un'azienda con più punti vendita e una banca sola — la condizione di WEISS.

---

# Cosa non sono riuscito a determinare e perché

**1. Il comportamento reale del prodotto.** Non ho accesso all'applicazione. Tutto quanto sopra viene da pagine di vendita e da video promozionali girati su un'azienda fittizia. Le pagine marketing descrivono l'intenzione del prodotto, non la sua resa: dove ho scritto `[DA VIDEO]` posso garantire che una schermata con quelle etichette esiste, non che funzioni come promette.

**2. La pagina «Perimetro Agicap»** (`https://agicap.com/it/perimetro-agicap/`) — probabilmente la definizione ufficiale dell'ambito funzionale — **carica il contenuto via JavaScript** e restituisce solo «Caricamento…» a chi non esegue script. Non l'ho potuta leggere: recuperarla richiederebbe un browser, escluso dal mandato di questa fase.

**3. Se e come si possa modellare il punto vendita.** So che miscusi stava usando la funzione **Progetti** a questo scopo e che nell'interfaccia esiste un filtro `Tutti i progetti`, ma il sito non ha una pagina dedicata a Progetti né spiega quali dimensioni analitiche siano disponibili (progetto, centro di costo, tag, entità) e come si combinino. È la domanda aperta più importante per il confronto con WEISS.

**4. Come le transazioni vengono attribuite a una sede quando i punti vendita condividono un conto.** L'esigenza è dichiarata nel caso Bofrost, la soluzione no: non è detto se l'assegnazione avvenga per regola sulla causale, per AI, o manualmente.

**5. Corrispettivi, POS e incasso per cassa.** «Vendita per Corrispettivi» compare come riga del piano dei conti in una schermata, ma **nessuna pagina del sito tratta l'incasso in contanti, la chiusura di cassa, il registratore telematico o la riconciliazione degli incassi POS**. Non so se Agicap consideri questo perimetro o lo dia per risolto a monte dal gestionale.

**6. L'integrazione con l'SDI.** Confermo l'assenza totale di menzioni nelle 38 pagine lette. Non posso escludere che esista e sia documentata altrove (documentazione tecnica, area riservata, materiale commerciale): posso solo dire che **non è un argomento di vendita sul sito italiano**.

**7. I numeri non verificabili.** «Oltre 400 ERP integrati», «oltre 300 banche italiane ed europee», «8.000+ reparti finanziari», «−80% di tempo sulle attività manuali», il costo di 8,34 € per fattura: sono tutte affermazioni dell'azienda su sé stessa o studi commissionati da Agicap (la *CFO Survey* con Innofact). Nessuna è verificabile da fonte terza in questa fase.

**8. Prezzi e confezionamento dei moduli.** Fuori dal mio perimetro; il sito rimanda a `/it/tariffe/` e la maggior parte delle CTA porta a «Richiedi una demo», il che suggerisce vendita assistita. Oggetto di un'altra parte dell'analisi.

**9. Ventiquattro casi studio su 36 non li ho letti.** Ho selezionato i 12 più vicini al profilo WEISS. I restanti (in prevalenza manifatturiero e servizi in area DACH e Francia) potrebbero contenere altri dettagli funzionali, ma la loro rilevanza per noi è bassa.
