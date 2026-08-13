# Trezy — Sito pubblico, prodotto e pricing

**Analisi condotta l'11 agosto 2026** sul solo materiale pubblico (sito trezy.io, blog, stampa, banche dati di funding).
**Perimetro:** homepage e pagine prodotto, listino, integrazioni, posizionamento, lessico, azienda. Nessun accesso all'applicazione.

**Convenzione di affidabilità usata in tutto il documento:**
- `[OSSERVATO]` — letto direttamente su una pagina, con URL.
- `[DEDOTTO]` — ricostruito per ragionamento a partire da fatti osservati.
- `[IPOTESI]` — congettura non verificata.

**Nota di riconciliazione.** Due conclusioni tratte dal solo materiale pubblico sono state corrette dopo aver riscontrato evidenza raccolta dentro il prodotto da un'analisi parallela: il provider di open banking (è **Powens**, §5.1) e l'assenza di aggancio al ciclo fiscale italiano (un connettore **SDI via Invopop esiste**, §5.4). In entrambi i casi il sito pubblico tace: resta vero che *dal sito* quelle informazioni non sono ricavabili, ed è un fatto significativo di per sé.

Una premessa che cambia la lettura di tutto il resto: **Trezy non è una società italiana**. È una SAS francese con sede a Parigi, che ha aperto il mercato italiano nel 2026 con una localizzazione linguistica del prodotto europeo. Il dettaglio ha conseguenze concrete su integrazioni, schemi contabili e adempimenti, discusse più avanti.

---

## 1. Posizionamento e azienda

### 1.1 L'azienda

| Dato | Valore | Affidabilità |
|---|---|---|
| Ragione sociale | Trezy SAS | `[OSSERVATO]` schema JSON-LD su https://www.trezy.io/en-us/ |
| Sede legale | 40 rue Alexandre Dumas, 75011 Parigi (FR) | `[OSSERVATO]` stesso schema |
| Fondazione | 2021 secondo il sito; **2020** secondo la stampa francese | `[OSSERVATO]` sito vs. [Maddyness](https://www.maddyness.com/2023/10/16/comptatech-10-startups-qui-simplifient-la-gestion-de-tresorerie-des-entreprises/) — il sito e la stampa si contraddicono |
| Fondatori | Quentin Lacointa (il sito nomina solo lui) e Pierre Houdyer | `[OSSERVATO]` sito + [Silicon Canals](https://siliconcanals.com/fr/news/startups/franco-dutch-fintech-trezy-bags-3m/) |
| Identità geografica | fintech «franco-olandese», quartier generale europeo ad Amsterdam, sede a Parigi | `[OSSERVATO]` [Silicon Canals](https://siliconcanals.com/news/startups/amsterdam-paris-trezy-bags-1m/) |
| Raccolta totale | ~4,2 M$ | `[OSSERVATO]` [Crunchbase](https://www.crunchbase.com/organization/trezy) |
| Ultimo round | Seed da 3 M€ / 3,24 M$, 15 giugno 2023, guidato da **Seedcamp** e **Playfair Capital**; con Kima Ventures, Discovery Ventures, Expansion Capital | `[OSSERVATO]` [Crunchbase](https://www.crunchbase.com/organization/trezy), [planet-fintech](https://www.planet-fintech.com/Trezy-leve-3-M-pour-etendre-sa-plateforme-de-gestion-de-tresorerie-basee-sur-l-IA-au-Royaume-Uni_a4388.html) |
| Serie A | dichiarata in preparazione, contando su fondi europei | `[OSSERVATO]` [CFNEWS](https://cfnews.net/L-actualite/Capital-innovation-developpement/Operations/1er-tour/Trezy-compte-sur-des-fonds-europeens-pour-sa-serie-A-445374) — data non verificata |
| Organico | 12 (Tracxn, dic. 2024) — 16 (PitchBook) — 20 (GetLatka, 2024) | `[OSSERVATO]` fonti terze discordanti |
| Ricavi | 2,8 M$ dichiarati per il 2024 | `[OSSERVATO]` [GetLatka](https://getlatka.com/companies/trezy) — fonte autodichiarata, affidabilità bassa |
| Lingue del prodotto | inglese (GB/US/CA), francese, tedesco, spagnolo, italiano, olandese, polacco | `[OSSERVATO]` https://www.trezy.io/sitemap.xml |

`[DEDOTTO]` Con ~15 persone, sette lingue e cinque mercati, la superficie prodotto dichiarata (sei moduli) è molto ampia rispetto alla capacità produttiva. La profondità di ciascun modulo è verosimilmente sottile.

`[DEDOTTO]` Il round è del giugno 2023: al momento dell'analisi ha oltre tre anni. Una Serie A «in preparazione» dopo tre anni da un seed di 3 M€ indica che la società sta operando vicino al limite della propria dotazione o con crescita organica.

### 1.2 A chi si rivolgono

`[OSSERVATO]` Il destinatario è la PMI **senza funzione finanza**, non l'impresa strutturata. Le formule ricorrenti sono «imprenditori impegnati che necessitano di insights, non complessità» e «progettato per proprietari di aziende senza background contabile» (https://www.trezy.io/it/prodotto-prestazioni). La descrizione lunga della homepage precisa il taglio dimensionale: «Dagli imprenditori individuali alle aziende con cinquanta dipendenti».

`[OSSERVATO]` Sette verticali hanno una landing page dedicata: ristoranti, e-commerce, SaaS, manifatturiero, retail, consulenza, costruzioni. Altri quattro sono nominati senza pagina: agenzie, servizi professionali, freelancer, sanità.

`[OSSERVATO]` Esiste un secondo destinatario, con listino separato: il **CFO esterno / commercialista che gestisce un portafoglio di aziende** (https://www.trezy.io/it/offre-daf).

### 1.3 Il problema che dichiarano di risolvere

`[OSSERVATO]` La tesi è ripetuta identica su ogni pagina: «L'82% dei fallimenti aziendali è causato da problemi di cash flow» (fonte mai citata). Il corollario è la separazione tra utile e cassa: «Il tuo P&L mostra profitti, ma il tuo conto bancario è vuoto» (https://www.trezy.io/it/prodotto-flusso-cassa).

`[OSSERVATO]` Gli antagonisti nominati sono due: il foglio di calcolo e il commercialista. Il secondo è un'aggiunta della localizzazione italiana — la headline italiana promette «Niente attese dal commercialista», mentre l'originale inglese dice solo «No delayed reports» (confronto tra https://www.trezy.io/it/ e https://www.trezy.io/en-us/). La tagline del modulo KPI è ancora più diretta: «Il tuo commercialista vede il passato. Tu devi vedere ora.»

`[DEDOTTO]` Il posizionamento è **contro la latenza contabile**, non contro il software contabile. La proposta è: la contabilità resta dov'è, Trezy legge i conti correnti e produce lo stesso quadro con giorni invece che settimane di ritardo.

### 1.4 Metriche vantate

Tutte `[OSSERVATO]`, tutte prive di metodologia pubblicata:

| Claim | Dove |
|---|---|
| 2.500+ aziende clienti | ovunque |
| 2.000+ banche connesse | ovunque |
| **95% di precisione delle previsioni** | ovunque |
| 95% di precisione della categorizzazione automatica | modulo transazioni |
| 99% di precisione OCR | modulo documenti |
| 12 mesi di orizzonte previsionale | modulo cash flow |
| 20+ KPI (ma «27+» in tre altre pagine) | modulo KPI vs. offerta CFO |
| 80% di riduzione del tempo di reporting | modulo KPI |
| 5-15% di risparmio sui costi di approvvigionamento; 38K€ di risparmio medio | modulo fornitori |
| 10+ ore risparmiate a settimana (ma «otto ore» nel testo lungo della stessa homepage) | ovunque |
| 4,8/5 su 127 recensioni; 98% di retention | schema JSON-LD e pagine prodotto |
| Operatività in meno di 5 minuti; import di 24 mesi di storico | onboarding |

`[DEDOTTO]` **Il claim del 95% di precisione previsionale è privo di significato come pubblicato.** Non è dichiarato su quale orizzonte (una previsione a 30 giorni e una a 12 mesi non sono confrontabili), su quale metrica di errore, né su quale grandezza — saldo finale, singoli movimenti, totali mensili. Un errore del 5% sul saldo di fine mese di un'azienda con margine del 3% è la differenza tra utile e perdita. È un numero di marketing.

### 1.5 Segnali di qualità del contenuto pubblico

Elementi rilevati che indicano una produzione di contenuti in larga parte automatizzata:

- `[OSSERVATO]` **Il glossario «italiano» ha i lemmi in francese.** Su https://www.trezy.io/it/glossario le voci sono *Amortissement*, *Chiffre d'affaires*, *Compte de résultat*, *Fonds de roulement*, *Trésorerie*, *Numéro de SIRET*, *Liasse fiscale*, con le definizioni tradotte in italiano. Sono 231 lemmi, in ordine alfabetico francese, molti fiscalmente francesi (Kbis, avoir fiscal, quitus fiscal) e alcuni palesemente fuori tema (*King-size*, *Xerox*, *Kilométrage*).
- `[OSSERVATO]` **La pagina italiana della partnership Pennylane serve testo in francese** (https://www.trezy.io/it/partnership-pennylane). Lo stesso vale per la pagina demo. L'URL dell'offerta CFO resta `offre-daf`.
- `[OSSERVATO]` **Blocchi in inglese dentro pagine italiane**: il verticale «Manufacturing & Production» compare non tradotto su tre pagine prodotto.
- `[OSSERVATO]` **Testimonianze incoerenti tra pagine.** «Sophie Martin» è «Proprietaria, Catena di Negozi» sulla pagina KPI e «CFO Startup Tecnologica» sulla pagina transazioni. La pagina Clienti riporta tre nomi (Frédéric Lacroix / La Manufacture, Amelia Jade / Rosewood, Danielle Fraudeau-Diomande / Helacom) che non compaiono nelle pagine prodotto, dove ricorrono invece Sarah Johnson, Michael Kim, Emma Martinez, James Baker, Alex Chen, Lisa Chen, Rachel Green, Pierre Dubois, Anna Schmidt, Marco Colombo. Nessun logo aziendale accompagna la maggior parte di questi nomi.
- `[OSSERVATO]` **Contraddizioni sui numeri**: 20+ vs 27+ KPI; 10+ vs 8 ore risparmiate a settimana nella stessa pagina; «24/7 Supporto Disponibile» sulle pagine prodotto contro «customer support during business hours» nella descrizione lunga della homepage; trial di 14 giorni su tutte le pagine contro «7-day free trial» nello schema JSON-LD della homepage inglese.

`[DEDOTTO]` Il sito è un impianto SEO multilingue generato in massa a partire da un originale francese, con revisione umana scarsa o assente sulla versione italiana. Le testimonianze delle pagine prodotto sono da trattare come **placeholder, non come clienti reali**; solo quelle della pagina Clienti, accompagnate da logo, hanno una qualche pretesa di verificabilità.

`[IPOTESI]` Il numero «2.500+ aziende» potrebbe contare gli account free e i trial mai convertiti, non i clienti paganti. Con 2,8 M$ di ricavi 2024 dichiarati e un ARPU da listino self-service di 90-390 €/anno, 2.500 clienti paganti su questi piani produrrebbero al massimo ~1 M$: `[DEDOTTO]` la maggior parte del fatturato viene da altrove — verosimilmente dall'offerta CFO esterno a portafoglio, o da contratti fuori listino.

---

## 2. Feature list dichiarata, modulo per modulo

Sei moduli, tutti `[OSSERVATO]` dalle rispettive pagine prodotto.

### 2.1 Gestione Flusso di Cassa — https://www.trezy.io/it/prodotto-flusso-cassa

| Funzione | Claim | Cosa promette di risolvere |
|---|---|---|
| Posizione di cassa in tempo reale | «Il tuo saldo di cassa si aggiorna durante il giorno»; consolidamento multibanca; multivaluta | il «caos dei dati»: più conti, nessuna vista unificata |
| Previsione IA a 12 mesi | ML su «modelli storici, stagionalità e transazioni ricorrenti» sugli ultimi 24 mesi; 95% | il «volare alla cieca»: non sapere se ci sarà cassa il mese prossimo |
| Scenari what-if | «scenari illimitati», confronto affiancato, modellazione di assunzioni/investimenti/caso peggiore | decidere prima di impegnarsi |
| Avvisi di tensione | «ti avvisa di potenziali carenze di flusso di cassa con settimane di anticipo» | arrivare in tempo a negoziare o finanziarsi |

`[OSSERVATO]` **Il meccanismo degli alert non è descritto in nessun punto**: non si sa se siano soglie configurabili, se il canale sia email o in-app, né se siano disponibili sul piano gratuito.

`[DEDOTTO]` La previsione è costruita **sui movimenti bancari passati**, non su un portafoglio di scadenze. Non compare mai un concetto di scadenzario alimentato da fatture attive/passive aperte con data di scadenza contrattuale: le fatture entrano come oggetti da riconciliare e come «tracciamento pagamenti fatture», non come motore della previsione. È una differenza sostanziale nel modo di produrre il previsionale.

### 2.2 Analisi delle Prestazioni e KPI — https://www.trezy.io/it/prodotto-prestazioni

| Funzione | Claim |
|---|---|
| Conto economico automatico | «si aggiorna con le transazioni», «formati specifici per paese», analisi dei margini |
| 20+ KPI precalcolati | semaforo verde/giallo/rosso su ogni indicatore |
| Report con un click | export Excel, PDF, **PowerPoint**, con logo proprio; modelli ricorrenti solo su Premium |
| Benchmarking di settore | confronto dei propri KPI «con le medie di settore di aziende simili» |

`[OSSERVATO]` KPI nominati: margine lordo, EBITDA, margine di profitto netto, rapporto spese operative, ricavi per dipendente, ciclo di conversione del contante, capitale circolante, tasso di crescita dei ricavi, costo di acquisizione cliente. L'offerta CFO aggiunge CCN e DSO.

`[OSSERVATO]` Gli standard contabili citati sono «PCG francese, US GAAP, ecc.». **Nessuno schema italiano è nominato** (né lo schema civilistico art. 2424/2425 c.c., né il bilancio abbreviato, né il micro).

`[OSSERVATO]` La fonte dei dati di benchmark, la numerosità del campione e la granularità settoriale non sono dichiarate da nessuna parte.

`[DEDOTTO]` Un conto economico costruito sui movimenti bancari è **un conto economico per cassa**, non per competenza. Ammortamenti, ratei, risconti, rimanenze e fatture da ricevere non hanno una controparte bancaria e non possono comparire. Il claim «margine lordo, EBITDA» su base bancaria è quindi un'approssimazione: `[IPOTESI]` la precisione dipende interamente dal fatto che il cliente colleghi anche un gestionale contabile via Pennylane o QuickBooks — che è funzione solo Premium.

### 2.3 Gestione Transazioni — https://www.trezy.io/it/prodotto-transazioni

| Funzione | Claim |
|---|---|
| Connessione multi-banca | 2.000+ banche, PSD2/Open Banking, sola lettura, credenziali non memorizzate |
| Frequenza di sync | «ogni poche ore durante il giorno, a seconda della disponibilità dell'API della tua banca», più trigger manuale |
| Categorizzazione IA | 95%, su descrizione, nome commerciante, importo, pattern; apprende dalle correzioni |
| Tassonomia | categorie personalizzate, **sottocategorie**, **tag** |
| Regole | automatiche su commerciante, importo, descrizione «o qualsiasi combinazione» |
| Operazioni massive | modifica in blocco e **applicazione retroattiva** delle categorie |
| Riconciliazione | abbinamento automatico transazione ↔ documento su **importi, date e riferimenti**, con conferma a un clic e matching manuale |
| Multivaluta | conversione automatica in valuta base a cambi in tempo reale; report in qualsiasi valuta |
| Ricerca | filtri avanzati e viste salvate |
| Export | Excel, CSV, PDF con selezione di colonne, categorie, conti, intervalli |

`[OSSERVATO]` **Il provider PSD2 sottostante non è mai nominato**, né sulle pagine prodotto né sulla privacy policy (https://www.trezy.io/privacy-policy non elenca sub-processor, hosting o certificazioni).

`[DEDOTTO]` Le 2.000+ banche e la copertura EU+US+CA indicano l'uso di un aggregatore terzo, non di connessioni proprietarie: nessuna società da 15 persone certifica direttamente duemila istituti.

`[DEDOTTO]` La riconciliazione dichiarata è **documento ↔ movimento bancario**. Non è dichiarata alcuna riconciliazione verso scritture in partita doppia, né la generazione di scritture contabili. Trezy legge, non scrive: entrambe le pagine di integrazione lo affermano esplicitamente («senza mai modificare libri, piano dei conti o transazioni»).

### 2.4 Hub di Gestione Documenti — https://www.trezy.io/it/prodotto-documenti

| Funzione | Claim |
|---|---|
| OCR | 99% su fatture, ricevute, contratti, estratti; campi estratti: **fornitore, data, importo, IVA, voci di riga, dettagli fiscali, termini di pagamento** |
| Formati | PDF, JPEG, PNG, TIFF, HEIC, multipagina; foto da telefono |
| Velocità | 5-10 secondi per documento; batch in parallelo |
| Acquisizione | drag-and-drop, **inoltro/collegamento della casella email**, sincronizzazione cartelle, app mobile, import da software contabile |
| Archiviazione | automatica per tipo/fornitore/data/categoria, cartelle e tag personalizzati, regole di archiviazione, cronologia versioni |
| Ricerca | full-text nel contenuto, **query in linguaggio naturale** (esempio pubblicato: «fatture da Acme Corp superiori a €1000 nell'ultimo trimestre»), risultati sotto il secondo |
| Conformità | 256 bit, GDPR, «segue gli standard SOC 2 Type II», controlli di accesso per membro del team |

`[OSSERVATO]` La formula usata è «segue gli standard SOC 2 Type II», non «è certificata SOC 2 Type II». `[DEDOTTO]` È una scelta lessicale prudente: non esiste attestazione dichiarata.

`[OSSERVATO]` **Nessuna menzione di fatturazione elettronica, XML FatturaPA, SDI o conservazione a norma**, su nessuna pagina del sito — pur esistendo nel prodotto un connettore SDI non comunicato (vedi §5.4).

`[DEDOTTO]` L'estrazione delle **voci di riga** è la funzione abilitante del modulo fornitori: senza righe non esiste il tracciamento prezzi a livello di prodotto.

### 2.5 Analisi Fornitori e Intelligence dei Costi — https://www.trezy.io/it/prodotto-fornitori

È il modulo più distintivo e l'unico interamente riservato a Premium.

| Funzione | Claim |
|---|---|
| Inflazione per prodotto | tracciamento prezzo di ogni prodotto per ogni fornitore nel tempo, con grafici storici |
| Ponderazione | «calcoli inflazione ponderati basati sulla spesa» — l'inflazione è pesata sul volume d'acquisto |
| Avvisi | «avvisi automatici quando i prezzi salgono» |
| Dashboard fornitore | spesa totale, frequenza ordini, termini di pagamento, tendenze e previsioni, drill-down a prodotto, confronto affiancato |
| Raccomandazioni | consolidamento fornitori, soglie di sconto volume prossime, fornitori alternativi su prodotti simili, prodotti con inflazione anomala — ciascuna «con risparmi previsti» |
| Export negoziale | scheda fornitore in PDF/Excel da portare in trattativa |

`[OSSERVATO]` Fonti dati dichiarate: «il tuo software contabile (come PennyLane, QuickBooks, Xero) o conti bancari», con import automatico delle **fatture di acquisto**; storico fino a 24 mesi.

`[DEDOTTO]` Questo modulo è quello con il valore percepito più alto per un ristorante o un retail — dove il costo del venduto è la voce dominante e l'inflazione fornitore erode direttamente il margine — ed è collocato dietro il gate di prezzo più alto. Non è un caso.

### 2.6 Calcolatore di Pareggio — https://www.trezy.io/it/prodotto-punto-pareggio

| Funzione | Claim |
|---|---|
| Calcolo | punto di pareggio = costi fissi ÷ margine di contribuzione, dove il margine è (1 − rapporto costi variabili). Esempio pubblicato: 50.000 € fissi, 30% variabili → 71.429 € |
| Visualizzazione | grafico interattivo con «zona di profitto», aggiornato al variare delle ipotesi |
| Scenari | strutture di costo alternative |
| Insight IA | «raccomandazioni attuabili su come migliorare la tua posizione di punto di pareggio» |
| Granularità | analisi per prodotto o reparto dichiarata come funzione della versione premium |

`[DEDOTTO]` È il modulo più leggero: una formula elementare con un grafico. Il claim «99,9% Precisione di calcolo» applicato a una divisione è puro riempitivo. `[IPOTESI]` Esiste soprattutto come contenuto SEO e come sesta casella nel menu prodotti.

---

## 3. Piani tariffari

`[OSSERVATO]` da https://www.trezy.io/it/prezzi e https://www.trezy.io/pricing.

| Piano | Annuale | Mensile | Limite conti bancari | Prova | Supporto |
|---|---|---|---|---|---|
| **Gratis** | 0 € | 0 € | **1** | — («gratuito per sempre») | Email |
| **Starter** (marcato «più popolare») | **7,50 €/mese** (90 €/anno) | 9,00 €/mese | **1** | 14 giorni | Prioritario |
| **Premium** | **32,50 €/mese** (390 €/anno) | 39,00 €/mese | **Illimitati** | 14 giorni | Prioritario |
| **CFO Esterno (DAF)** | **20 €/mese per azienda** + IVA | 25 €/mese per azienda + IVA | non dichiarato | non dichiarata | non dichiarato |

Note `[OSSERVATO]`:
- Sconto annuale dichiarato: 17% sui piani self-service, 20% sull'offerta CFO.
- L'offerta CFO richiede **minimo 3 aziende**; i clienti si possono aggiungere e togliere in qualsiasi momento.
- L'IVA è dichiarata esclusa solo sull'offerta CFO; sui piani self-service non è specificata.
- Pagamenti: Visa, Mastercard, Amex, SEPA Direct Debit, bonifico «per abbonamenti enterprise annuali» — `[DEDOTTO]` esistono quindi contratti fuori listino non pubblicati.
- Sconti dichiarati ma non quantificati per non profit, startup early-stage, istituzioni educative.
- **Nessun limite pubblicato** su numero di utenti, transazioni, documenti, movimenti o mesi di storico. L'unica leva quantitativa a listino è il numero di conti bancari.

`[DEDOTTO]` **Il gate strutturale è uno solo: il secondo conto corrente.** Free e Starter danno un solo conto; il multi-banca costa 4,3 volte lo Starter. Per un'azienda italiana con un conto operativo, uno di appoggio e una carta aziendale, il piano Premium non è un upgrade opzionale: è l'unico piano utilizzabile. `[DEDOTTO]` Il salto 7,50 → 32,50 €/mese non è graduato: manca deliberatamente un gradino intermedio, così che chiunque abbia più di un conto sia spinto direttamente al piano massimo.

`[DEDOTTO]` Lo Starter a 7,50 € con un solo conto serve a monetizzare la microimpresa e il freelance, non la PMI. È un prodotto diverso venduto sotto lo stesso marchio.

---

## 4. Matrice feature → piano minimo che la sblocca

È il segnale più informativo del listino: dice quali funzioni Trezy ritiene che il mercato paghi.

| Funzione | Piano minimo | Lettura |
|---|---|---|
| Monitoraggio flusso di cassa | **Gratis** | esca |
| Categorizzazione automatica IA | **Gratis** | esca — il claim tecnologico di punta è regalato |
| Gestione transazioni e storico | **Gratis** | esca |
| Report di base | **Gratis** | esca |
| Previsione IA — **sola visualizzazione** | **Gratis** | vedi il futuro ma non puoi toccarlo |
| Un conto bancario | **Gratis** | |
| **Modifica manuale delle previsioni** | **Starter** (7,50 €) | prima monetizzazione: il controllo, non il dato |
| **Pianificazione scenari** | **Starter** | |
| **Analisi prestazioni e KPI (P&L, bilancio, break-even)** | **Starter** | tutto il modulo KPI è gated a partire dal primo piano a pagamento |
| **Gestione documenti** | **Starter** | |
| Fatture e tracciamento pagamenti fatture | **Starter** | |
| **Secondo conto bancario e successivi** | **Premium** (32,50 €) | il vero muro |
| **Analisi fornitori e monitoraggio inflazione** | **Premium** | il modulo più differenziante è al piano più alto |
| **Collaborazione team / più utenti** | **Premium** | anche due sole persone in azienda impongono il salto |
| **Report personalizzati ed esportazioni** | **Premium** | portare via i propri dati in forma utile si paga |
| **Modelli di report ricorrenti** | **Premium** | dichiarato nella FAQ del modulo KPI |
| **Integrazione Pennylane** | **Premium** | |
| **Integrazione QuickBooks** | **Premium** | |
| Analisi break-even per prodotto/reparto | **Premium** | dichiarato come «versione premium» nella FAQ |
| Supporto prioritario | **Starter** | |
| **Import scritture contabili (FEC, Cegid, Pennylane)** | **offerta CFO** | mai offerto sui piani self-service |
| **Formule KPI personalizzate** | **offerta CFO** | idem |
| **Avvisi e obiettivi sui KPI** | **offerta CFO** | idem |
| **Multi-azienda con permessi per cliente** | **offerta CFO** | idem |
| **Bilancio in 4 viste, confronto N/N-1** | **offerta CFO** | idem |

### Cosa insegna questa matrice

`[DEDOTTO]` **Il dato è gratis, il controllo si paga.** La previsione IA — il claim su cui è costruita l'intera comunicazione — è disponibile a costo zero in sola lettura. Ciò che viene monetizzato al primo scalino è la possibilità di *correggerla* e di *simulare*. Trezy ha capito che l'imprenditore non paga per vedere una previsione automatica; paga per poterla contraddire con quello che sa e che il modello non può sapere.

`[DEDOTTO]` **Il multi-conto è il vero prodotto.** Quattro delle cinque funzioni Premium riguardano il moltiplicarsi delle dimensioni: più conti, più persone, più fornitori, più sistemi collegati. La complessità organizzativa, non la sofisticazione analitica, è l'asse di prezzo.

`[DEDOTTO]` **Il modulo fornitori è la scommessa di differenziazione.** È l'unico interamente Premium, l'unico con casi studio numerici, l'unico che promette un ritorno monetario diretto (5-15% sugli acquisti) invece che tempo risparmiato. Su un'azienda con 500K€ di acquisti annui, il 5% sono 25.000 €: paga il canone 64 volte. È l'argomento di vendita più forte del listino.

`[DEDOTTO]` **Il portafoglio multi-azienda è un listino a parte, non uno scaglione.** 20 €/azienda/mese contro 32,50 € del Premium significa che il commercialista paga meno per azienda pur ricevendo *più* funzioni (import scritture, formule personalizzate, obiettivi). `[IPOTESI]` È un canale indiretto: acquisire il professionista per arrivare al suo portafoglio clienti, accettando un ARPU per azienda più basso in cambio di un'acquisizione a blocchi.

---

## 5. Integrazioni dichiarate

### 5.1 Bancarie

`[OSSERVATO]` PSD2 / Open Banking, 2.000+ istituti in Europa, USA e Canada, connessione in sola lettura, sincronizzazione «ogni poche ore» con trigger manuale, import iniziale fino a 24 mesi di storico.

Banche italiane nominate: **Intesa Sanpaolo, UniCredit, BNL, Fineco, Banca Mediolanum** (homepage IT) e in più **Banco BPM** «e centinaia di banche regionali e casse di risparmio» (articolo di lancio italiano).
Banche europee nominate altrove: BNP Paribas, Société Générale, Crédit Agricole, HSBC, Barclays, Deutsche Bank, ING.

`[OSSERVATO]` **Il nome dell'aggregatore PSD2 non compare in nessun punto del sito pubblico**, inclusa la privacy policy, che non elenca sub-processor né dichiara l'ubicazione dell'hosting.

`[OSSERVATO]` **L'aggregatore è Powens** (ex Budget Insight). Non lo dice il copy: lo rivela uno screenshot del tour Supademo incorporato nella pagina documentazione, dove la schermata di selezione dei conti è l'interfaccia di Powens, con la dicitura «Powens est agréé en qualité d'établissement de paiement par l'Autorité de Contrôle Prudentiel et de Résolution (ACPR), sous le numéro CIB 16948». Rilevamento di un'analisi parallela sul prodotto, in `assets/trezy/materiali-pubblici/demo-02-connessione-banca-powens.md`.

`[DEDOTTO]` Le «2.000+ banche connesse» sono quindi la copertura del catalogo Powens, non un asset di Trezy. Il claim è vero ma non è un differenziale proprietario: è acquistabile da chiunque.

### 5.2 Software contabile

| Integrazione | Stato | Piano | Direzione | Fonte |
|---|---|---|---|---|
| **Pennylane** | pagina dedicata, «partner certificato» | Premium | Pennylane → Trezy, sola lettura | https://www.trezy.io/it/partnership-pennylane |
| **QuickBooks** | pagina dedicata | Premium | QuickBooks → Trezy, sola lettura | https://www.trezy.io/it/quickbooks-integration |
| **Xero** | citato una sola volta, senza pagina né riga a listino | non dichiarato | — | FAQ del modulo fornitori |
| **FEC** (file scritture contabili francese) | import | offerta CFO | file → Trezy | https://www.trezy.io/it/offre-daf |
| **Cegid** | import | offerta CFO | → Trezy | idem |

`[OSSERVATO]` Oggetti importati da QuickBooks: fatture e pagamenti (crediti/debiti), transazioni bancarie categorizzate e riconciliate, **piano dei conti**, anagrafiche fornitori e clienti, note spese e ricevute, categorie e aliquote fiscali.

`[DEDOTTO]` L'import del **piano dei conti** è la scelta architetturale più significativa osservata: Trezy non impone una propria tassonomia di categorie, eredita quella del gestionale a monte e ci costruisce sopra la categorizzazione. È l'opposto di un prodotto che pretende di sostituire la contabilità.

`[DEDOTTO]` Entrambe le integrazioni sono **rigorosamente in sola lettura e unidirezionali**, e il sito lo ripete come garanzia commerciale («senza mai toccare le tue scritture contabili»). Trezy si vende al commercialista come strumento innocuo, che non sporca i libri.

### 5.3 Cosa non è integrato

`[OSSERVATO]` Non compare, in nessun punto del sito pubblico:
- **Sistema di Interscambio, FatturaPA, fatturazione elettronica italiana, conservazione a norma** — ma attenzione: il connettore SDI *esiste nel prodotto*, vedi §5.4
- gestionali italiani (TeamSystem, Zucchetti, Danea Easyfatt, Fatture in Cloud, Aruba) — sono nominati nell'articolo di lancio *come sistemi da tenere*, non da integrare
- ERP
- sistemi di cassa / POS / incassi elettronici
- payroll
- API pubblica, webhook, documentazione per sviluppatori
- marketplace o directory di integrazioni

`[OSSERVATO]` La posizione ufficiale sul perimetro italiano è dichiarata nell'articolo di lancio: Trezy «non sostituisce il tuo software di fatturazione»; il cliente deve continuare a usare il proprio sistema «per la compliance fiscale e gli obblighi di fatturazione elettronica verso l'Agenzia delle Entrate» (https://www.trezy.io/it/blog/trezy-arriva-italia-pmi-gestione-tesoreria).

### 5.4 Correzione importante: il prodotto ha lo SDI, il sito no

Il silenzio del sito su questo punto **non riflette il prodotto**. Un'analisi parallela sulle stringhe dell'applicazione (`assets/trezy/materiali-pubblici/kb-07-sdi-invopop-fatturazione-elettronica.md`) documenta una funzione esistente e italiana in senso proprio:

`[OSSERVATO]` In `Impostazioni → Integrazioni → Fatturazione elettronica` esiste un connettore verso **Invopop** che consente di registrare un'azienda tramite **partita IVA** e di importare «le sue fatture elettroniche **ricevute (SDI) ed emesse**». Il flusso prevede la registrazione di un **Codice Destinatario** presso l'**Agenzia delle Entrate**, affinché le fatture dei fornitori vengano recapitate a Trezy, seguita dal completamento della registrazione SDI. La sincronizzazione è esposta come azione manuale. Fra i formati documento accettati compare **XML** accanto a PDF e immagini.

`[DEDOTTO]` **Che questa funzione non compaia in nessun punto del sito pubblico è di per sé il ritrovamento più significativo di questa analisi.** È l'unica capacità che rende Trezy realmente utilizzabile su un'azienda italiana — riceve le partite passive dal canale certificato invece che dall'OCR — ed è invisibile a chiunque valuti il prodotto dal sito, dal listino o dalla documentazione. `[IPOTESI]` Le spiegazioni plausibili sono due: la funzione è recente e la macchina SEO multilingue non l'ha ancora assorbita, oppure è in prova su pochi clienti e non è considerata pronta per essere promessa.

`[DEDOTTO]` Resta invece vera, e va corretta solo nella portata, la deduzione sul previsionale: lo SDI porta dentro le **fatture**, ma non è dichiarato da nessuna parte che le loro scadenze alimentino la previsione di cassa. Il motore descritto pubblicamente resta statistico, costruito su 24 mesi di storico bancario. Se le partite aperte da SDI confluiscano nel previsionale come scadenzario è una domanda aperta, da verificare sul prodotto.

`[DEDOTTO]` Non risultano invece coperti: la **trasmissione** di fatture attive allo SDI, la **conservazione sostitutiva a norma**, la **liquidazione IVA** e l'import del **libro giornale italiano** (il tracciato contabile supportato resta il FEC francese).

`[OSSERVATO]` La documentazione pubblica (https://www.trezy.io/it/documentazione) è una pagina di intestazione senza indice: non esiste documentazione tecnica navigabile.

---

## 6. Lessico di dominio osservato

Annotazione lessicale a fini di analisi: sono i termini esatti usati nell'interfaccia pubblica italiana, utili a capire come Trezy nomina i concetti e con quale registro parla al mercato.

### Nucleo tesoreria
tesoreria · flusso di cassa · **posizione di cassa** · saldo di cassa · saldo netto · **pagamenti in entrata** / **spese in uscita** · consolidamento multibanca · **crisi di liquidità** / carenza di flusso di cassa · runway · previsione flusso di cassa · **previsioni IA** · analisi predittiva · transazioni ricorrenti · aggiustamenti stagionali · **pianificazione degli scenari** · scenari what-if · «cosa succede se» · confronto affiancato

### Nucleo performance
conto economico · P&L · rendiconti P&L · bilancio · **margine lordo** · margine di profitto netto · EBITDA · **punto di pareggio** · margine di contribuzione · rapporto costi variabili · zona di profitto · costi fissi / costi variabili · utile operativo · **rapporto spese operative** · ricavi per dipendente · **ciclo di conversione del contante** · **capitale circolante** · tasso di crescita dei ricavi · costo di acquisizione cliente · **indicatori di salute a semaforo** · benchmark di settore

### Dall'offerta CFO (registro tecnico, di matrice francese)
**SIG** (*soldes intermédiaires de gestion*) · **CCN** (capitale circolante netto) · **DSO** · confronto N/N-1 · bilancio in 4 viste · **FEC** · liasse fiscale · formule personalizzate · avvisi e obiettivi

### Nucleo transazioni e documenti
categorizzazione IA · auto-categorizzazione · sottocategorie · tag · **regole personalizzate** · applicazione retroattiva · modifica in blocco · **auto-riconciliazione** · abbinamento documento-transazione · OCR · estrazione dati · **voci** (righe di fattura) · archiviazione intelligente · archivi pronti per l'audit · cronologia versioni · ricerca full-text · query in linguaggio naturale · valuta di base · multivaluta

### Nucleo fornitori
**inflazione dei fornitori** · inflazione nascosta · tracciamento **a livello di prodotto** · calcoli ponderati sulla spesa · spesa per fornitore · frequenza ordini · **termini di pagamento** · consolidamento fornitori · **sconti volume** · soglie di sconto · fornitori alternativi · costi di approvvigionamento · scheda fornitore

### Registro commerciale ricorrente
«in tempo reale» (onnipresente) · «a colpo d'occhio» · «volare alla cieca» · «niente fogli di calcolo» · «niente attese dal commercialista» · «cruscotto» / «dashboard unificata» · «chiarezza finanziaria» · «insight azionabili» · «gratis per sempre» · «pronto in meno di 5 minuti»

### Termini che il sito italiano **non** usa mai
`[OSSERVATO]` Assenti: **scaduto**, **scadenzario**, **partite aperte**, **posizione finanziaria netta**, **incassi previsti** (usa «pagamenti in entrata»), **insoluto**, **castelletto**, **anticipo fatture**, **affidamento**, **RIBA**, **F24**, **liquidazione IVA**, **fatturazione elettronica**, **SDI**, **partita doppia**, **prima nota**, **competenza economica**.

`[DEDOTTO]` L'assenza è coerente: il lessico **del sito** è quello di un prodotto costruito attorno al conto corrente e tradotto dal francese, rivolto a chi non conosce il vocabolario contabile.

**Correzione importante — nel prodotto quei termini esistono quasi tutti.** Le stringhe dell'applicazione (vedi `assets/trezy/materiali-pubblici/kb-06-riconciliazione-matching-pagamenti.md`) contengono lo stato **«Scaduto»**, la scheda **«Scadenzario»** con aging a quattro fasce (0-30, 31-60, 61-90, oltre 90 giorni), **DSO** («Giorni Medi di Incasso») e **DPO** («Giorni Medi di Pagamento»), «Da incassare», «In ritardo +n g» e l'azione **«Sollecita il cliente»**. Il monitoraggio IVA distingue IVA raccolta, IVA detraibile e importo netto dovuto.

`[DEDOTTO]` Il divario non è quindi fra il lessico italiano e il prodotto, ma **fra il prodotto e la sua comunicazione**: Trezy ha costruito il vocabolario del credito commerciale e ha scelto di non venderlo. Restano davvero assenti, anche nel prodotto, solo i termini degli adempimenti e degli strumenti bancari italiani: F24, liquidazione IVA telematica, castelletto, anticipo fatture, RIBA, insoluto, prima nota in senso proprio.

---

## 7. Sintesi dei limiti osservati

Elencati per utilità, tutti `[DEDOTTO]` da fatti osservati sopra:

1. **Il ciclo fiscale italiano è coperto nel prodotto ma taciuto ovunque.** Il connettore SDI via Invopop esiste; il sito, il listino e la documentazione non lo nominano mai, e l'articolo di lancio italiano dichiara anzi il contrario («non sostituisce il tuo software di fatturazione»). Restano fuori trasmissione allo SDI, conservazione a norma e liquidazione IVA.
2. **Previsione statistica, e i termini di pagamento non spostano la cassa.** L'orizzonte nasce da 24 mesi di storico bancario, con metodi elementari (media delle ultime tre osservazioni, crescita composta o lineare, duplicazione dell'anno precedente). Lo scadenzario esiste nel prodotto, ma la knowledge base interna dichiara che i termini di pagamento «non influiscono sulla vista cashflow» e servono solo a contabilità e performance. Su un'azienda con poche fatture di importo grande, l'estrapolazione ha errore alto proprio dove serve precisione. Vedi la sintesi in [`00-ricognizione-pubblica.md`](00-ricognizione-pubblica.md).
3. **Conto economico per cassa presentato come P&L.** Senza competenza, ammortamenti e rimanenze, i margini dichiarati sono approssimazioni — a meno di collegare un gestionale, che è funzione Premium.
4. **Nessuno schema di bilancio italiano.** PCG francese e US GAAP nominati, civilistico italiano no.
5. **Un solo conto bancario fino a 32,50 €/mese.** Per la PMI italiana media il piano d'ingresso reale è il Premium.
6. **Integrazioni contabili solo in lettura e solo verso due prodotti**, nessuno dei quali diffuso in Italia (Pennylane è francese, QuickBooks marginale sul mercato italiano).
7. **Nessuna API pubblica né documentazione tecnica.**
8. **Qualità della localizzazione italiana bassa**: glossario con lemmi francesi, pagine non tradotte, testimonianze incoerenti, numeri contraddittori. `[DEDOTTO]` Segnala un investimento italiano leggero, di natura SEO, non un presidio di mercato.
9. **Claim non verificabili**: nessuna metodologia pubblicata dietro il 95%, il 99% e il 98% di retention.

---

## 8. Fonti

### Sito Trezy — pagine consultate direttamente
- https://www.trezy.io/it/ — homepage italiana
- https://www.trezy.io/en-us/ — homepage inglese (US), include lo schema JSON-LD con i dati societari
- https://www.trezy.io/it/prezzi — listino italiano
- https://www.trezy.io/pricing — listino inglese
- https://www.trezy.io/it/prodotto-flusso-cassa — modulo cash flow
- https://www.trezy.io/it/prodotto-prestazioni — modulo KPI e P&L
- https://www.trezy.io/it/prodotto-transazioni — modulo transazioni
- https://www.trezy.io/it/prodotto-documenti — modulo documenti
- https://www.trezy.io/it/prodotto-fornitori — modulo fornitori
- https://www.trezy.io/it/prodotto-punto-pareggio — calcolatore di pareggio
- https://www.trezy.io/it/offre-daf — offerta CFO esterno
- https://www.trezy.io/it/partnership-pennylane — integrazione Pennylane (serve contenuto in francese)
- https://www.trezy.io/it/quickbooks-integration — integrazione QuickBooks
- https://www.trezy.io/it/clienti — pagina clienti
- https://www.trezy.io/it/glossario — glossario (lemmi in francese)
- https://www.trezy.io/it/calcolatore-prezzi — calcolatore di pricing gratuito
- https://www.trezy.io/it/documentazione — pagina documentazione (senza indice)
- https://www.trezy.io/it/demo-interattiva — demo (senza tour testuale)
- https://www.trezy.io/privacy-policy — privacy (senza sub-processor né hosting)
- https://www.trezy.io/sitemap.xml — mappa del sito, per la struttura multilingue
- https://www.trezy.io/it/blog/trezy-arriva-italia-pmi-gestione-tesoreria — articolo di lancio italiano

### Fonti terze
- https://www.crunchbase.com/organization/trezy — funding e investitori
- https://siliconcanals.com/fr/news/startups/franco-dutch-fintech-trezy-bags-3m/ — round da 3 M€, fondatori
- https://siliconcanals.com/news/startups/amsterdam-paris-trezy-bags-1m/ — round precedente, quartier generale europeo ad Amsterdam
- https://www.planet-fintech.com/Trezy-leve-3-M-pour-etendre-sa-plateforme-de-gestion-de-tresorerie-basee-sur-l-IA-au-Royaume-Uni_a4388.html — uso dei fondi ed espansione UK
- https://cfnews.net/L-actualite/Capital-innovation-developpement/Operations/1er-tour/Trezy-compte-sur-des-fonds-europeens-pour-sa-serie-A-445374 — Serie A dichiarata in preparazione
- https://www.maddyness.com/2023/10/16/comptatech-10-startups-qui-simplifient-la-gestion-de-tresorerie-des-entreprises/ — anno di fondazione 2020, fondatori
- https://getlatka.com/companies/trezy — ricavi 2024 e organico (autodichiarati, affidabilità bassa)
- https://tracxn.com/d/companies/trezy/ e https://pitchbook.com/profiles/company/496537-12 — organico
- https://www.appvizer.it/finanza-contabilita/tesoreria/trezy — scheda di terze parti; riporta «39,00 USD/mese» e zero recensioni verificate nonostante un punteggio 5,0 esposto

### Materiali di analisi parallele usati per la riconciliazione
- `assets/trezy/materiali-pubblici/demo-02-connessione-banca-powens.md` — identificazione di Powens come aggregatore PSD2
- `assets/trezy/materiali-pubblici/kb-07-sdi-invopop-fatturazione-elettronica.md` — connettore SDI via Invopop nelle stringhe dell'applicazione

### Materiali salvati
Trascrizioni strutturate delle pagine più significative in `/Users/nicolascarpa/Desktop/accounting/assets/trezy/materiali-pubblici/`:
`sito-01-homepage-it.md` · `sito-02-prezzi-it.md` · `sito-03-prodotto-flusso-cassa.md` · `sito-04-prodotto-prestazioni-kpi.md` · `sito-05-prodotto-transazioni.md` · `sito-06-prodotto-documenti.md` · `sito-07-prodotto-fornitori-e-pareggio.md` · `sito-08-offerta-cfo-esterno.md` · `sito-09-integrazioni.md` · `sito-10-blog-ingresso-italia.md`
