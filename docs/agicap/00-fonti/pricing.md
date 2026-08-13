# Agicap — pricing e composizione dei piani

Ricognizione su fonti pubbliche, per WEISS S.r.l. (horeca, tre punti vendita).
**Data della ricognizione: 11 agosto 2026.**

---

## Fonti consultate

### Ufficiali (agicap.com)

| URL | Cosa contiene | Accesso |
|---|---|---|
| https://agicap.com/it/tariffe/ | pagina prezzi italiana — **nessun listino**, solo un calcolatore-form | 11 ago 2026 |
| https://agicap.com/page-data/it/tariffe/page-data.json | contenuto CMS della pagina sopra (la pagina è una SPA) | 11 ago 2026 |
| https://agicap.com/fr/tarifs-2/ | pagina prezzi francese, **redesign 2026** — espone la struttura modulare | 11 ago 2026 |
| https://agicap.com/fr/tarifs/ | pagina prezzi francese, versione precedente | 11 ago 2026 |
| https://agicap.com/en-us/pricing/ | pagina prezzi internazionale — FAQ con impegno 12 mesi | 11 ago 2026 |
| https://agicap.com/de/preise/ · https://agicap.com/es/precios/ | equivalenti tedesca e spagnola | 11 ago 2026 |
| https://agicap.com/it/gtc/agicap-srl-site/ | **Condizioni Generali del Servizio, Agicap Italy S.r.l.** | 11 ago 2026 |
| https://agicap.com/it/funzionalita/gestione-delle-spese/ | Spend Management «gratuito» + la soglia dei 5k€ | 11 ago 2026 |
| https://agicap.com/it/funzionalita/carte-aziendali/ | carte aziendali, limiti, nessun costo | 11 ago 2026 |
| https://agicap.com/it/azienda/piccola/ · /media/ · /grande/ | segmentazione per fatturato (1-10M / 10-50M / >50M) | 11 ago 2026 |
| https://agicap.com/it/settore/ristorazione/ | posizionamento sul settore ristorazione | 11 ago 2026 |
| https://agicap.com/sitemap-IT.xml · https://agicap.com/robots.txt | inventario delle pagine italiane | 11 ago 2026 |

### Terze (non ufficiali)

| URL | Natura | Accesso |
|---|---|---|
| https://www.capterra.com/p/196637/Agicap/ | directory + recensioni | 11 ago 2026 |
| https://www.getapp.com/finance-accounting-software/a/agicap/ | directory | 11 ago 2026 |
| https://www.softwareadvice.com/accounting/agicap-profile/ | directory + recensioni | 11 ago 2026 |
| https://tool-advisor.fr/logiciel-tresorerie/agicap/ | comparatore francese, forchetta stimata | 11 ago 2026 |
| https://comparateur-efacturation.fr/plateforme/agicap | comparatore francese, prezzo d'ingresso | 11 ago 2026 |
| https://checkthat.ai/brands/agicap/pricing | aggregatore di costi | 11 ago 2026 |
| https://pricingnow.com/question/agicap-pricing/ | aggregatore di costi | 11 ago 2026 |
| https://www.assintel.it/cerco-offro/da-agicap-la-soluzione-gratuita-per-la-gestione-efficiente-delle-spese-aziendali/ | comunicato stampa ripreso | 11 ago 2026 |
| https://www.g2.com/products/agicap/pricing | **non accessibile, HTTP 403** | 11 ago 2026 |
| https://www.apogea.fr/agicap-avis-tarif/ | **non accessibile, HTTP 403** | 11 ago 2026 |

Materiale grezzo trascritto in `assets/agicap/materiali-pubblici/pricing-*.md`.

---

## 1. Il fatto principale: Agicap non pubblica prezzi. Da nessuna parte.

**[OSSERVATO]** La pagina italiana https://agicap.com/it/tariffe/ si intitola *«Prezzi che si adattano
alle tue esigenze!»* e **non contiene un solo numero**. Nel documento HTML servito al browser, al posto
del listino c'è la stringa `caricamento..`. Il contenuto reale, letto dal page-data del CMS, è un
componente di tipo `ContentfulPriceCalculationForm` — entry `Core - Price calculator - All in one - IT`
— che si risolve in due form HubSpot (portale 2856475). Non esiste alcun nodo con nomi di piano, cifre,
valute o limiti.

Lo stesso vale per **tutti i locale**: francese, inglese-US, tedesco, spagnolo. Nessuna pagina prezzi di
nessuna lingua espone una cifra.

**[OSSERVATO]** `/it/tariffe/` **non compare nella sitemap italiana** (`sitemap-IT.xml`, 642 URL). La
pagina esiste, è nel menu e nel footer, ma non è offerta ai motori di ricerca.

**[DEDOTTO]** Il «calcolatore di prezzo» non calcola un prezzo per l'utente: è uno strumento di
qualificazione del lead che raccoglie i parametri di dimensionamento e li passa al commerciale. Il
prezzo esiste solo dentro un Preventivo individuale.

### Conseguenza per l'analisi competitiva

La domanda «quale funzionalità sta in quale tier» **non ha una risposta pubblica**. Quello che si può
ricostruire, e che vale altrettanto, è: **quale funzionalità è venduta come modulo a sé**. Perché nel
modello Agicap l'unità di vendita non è il tier, è il modulo.

---

## 2. Cosa fa variare il prezzo

**[OSSERVATO — CGS art. 5.1]**
> I prezzi applicabili [...] **variano a seconda dei Servizi scelti dal Cliente**.

**[OSSERVATO — CGS, definizioni]** L'unità di conteggio contrattuale è l'**«Interfaccia Azienda»**:
> il Cliente può disporre di tante Interfacce Aziendali quante previste nell'Ordine

e l'aggiunta di un'Interfaccia Azienda è classificata come **«Opzione principale»**, cioè un servizio
aggiuntivo a pagamento. In pratica: **si paga per entità legale**.

**[FONTE TERZA]** checkthat.ai e pricingnow.com concordano sulle variabili di quotazione: **numero di
conti bancari, numero di entità legali, fatturato, integrazioni ERP richieste**. checkthat.ai riferisce
inoltre che le fasce di quotazione sono definite per **numero di conti bancari: 1-2, 3-6, oltre 6, oltre
15**. pricingnow.com nota esplicitamente che la metrica di valore **non è il numero di utenti**.

**[DEDOTTO]** Il pricing è *account-based ed entity-based*, non *seat-based*. Questo è coerente con la
natura del prodotto (un aggregatore di conti) e ha una conseguenza precisa: **un'azienda piccola con
molti conti correnti paga come una grande**. Le due recensioni raccolte che lamentano il costo dicono
esattamente questo: *«the licensing costs can be very high if you are operating with more than two bank
accounts»*.

---

## 3. I tre tier nominali: Business / Premium / Enterprise

**[OSSERVATO]** Nessuna fonte ufficiale Agicap nomina questi piani. Non compaiono nel CMS di nessuna
pagina prezzi, né nelle CGS.

**[FONTE TERZA]** Tre directory indipendenti li elencano concordemente:

| Fonte | Piani | Prezzo esposto |
|---|---|---|
| Capterra | Business, Premium, Enterprise | «contact vendor» per tutti e tre |
| GetApp | Business, Premium, Enterprise | «No pricing info» per tutti e tre |
| SoftwareAdvice | Business, Enterprise, Premium | «No plan information available» per tutti e tre |

**[OSSERVATO — CGS art. 3.1.4]** L'esistenza di edizioni con perimetro funzionale diverso è confermata
dal contratto:
> alcune funzionalità possono essere disponibili solo con **determinate versioni o edizioni delle
> Soluzioni, soggette al pagamento di tariffe aggiuntive**

**[DEDOTTO]** I tre tier esistono davvero come listino interno, ma Agicap ha deliberatamente scelto di
non pubblicarne né i prezzi né il perimetro. Le directory hanno raccolto i nomi da un vendor form,
non da una pagina pubblica.

### Ricostruzione del contenuto dei tier — attendibilità bassa

**[IPOTESI]** L'unica ricostruzione circolante (aggregatori, non verificata su fonte Agicap) è:

| Tier | Contenuto attribuito |
|---|---|
| Business | monitoraggio cash flow, previsioni, creazione di scenari, analytics standard |
| Enterprise | + integrazione ERP, consolidamento, import del forecast |
| Premium | + consolidamento multi-società, multi-valuta |

⚠️ Questa tabella è **congetturale e internamente incoerente** (consolidamento appare sia in Enterprise
sia in Premium; l'ordinamento Business < Enterprise < Premium non è dichiarato da nessuno). La riporto
solo per completezza. **Non usarla come base di decisione.**

---

## 4. La matrice che conta davvero: modulo × linea di prodotto

**[OSSERVATO]** La pagina francese `/fr/tarifs-2/` — template CMS `Core Page - Pricing - redesign 2026` —
è l'unica del sito che espone la struttura commerciale. È il modello verso cui Agicap sta migrando;
l'equivalente italiano non esiste ancora (`/it/tariffe-2/` → HTTP 404).

Intestazione:
> **Votre offre sur mesure, selon vos besoins** — Choisissez **la suite** pour piloter votre cash,
> automatiser vos factures et accélérer vos encaissements **ou les modules** répondant à vos besoins
> spécifiques.

Cioè: si compra o la suite completa («Treasury Suite») o i singoli moduli.

Legenda della colonna «Rilevanza WEISS»:
**✅** utile a un'azienda horeca con tre punti vendita · **➖** marginale · **[FUORI SCALA]** presuppone
strutture di gruppo più grandi.

### 4.1 Linea «Gestione della tesoreria»

| Modulo | Contenuto | Rilevanza WEISS |
|---|---|---|
| **Gestione e previsioni di tesoreria** | visibilità in tempo reale dei flussi di tutte le banche ed entità; categorizzazione automatica e riconciliazione; dettaglio per natura e per attività; suggerimenti di giroconti di riequilibrio e **cash pooling** con regole; previsionale a 13 settimane (giornaliero e settimanale) | ✅ è il cuore; il cash pooling è **[FUORI SCALA]** |
| **Finanziamento intra-gruppo** | debito e interessi infragruppo in tempo reale; scritture contabili automatiche | **[FUORI SCALA]** |
| **Contabilità di tesoreria** | riconciliazione automatica e generazione delle scritture del giornale di banca; export verso ERP o software contabile | ✅ |
| **Finanziamento e investimento** | gestione del debito (prestiti, linee di credito, leasing), copertura del rischio tasso, calcolo della posizione finanziaria netta, gestione degli impieghi | ➖ (il leasing sì, la copertura tassi no) |
| **Gestione del rischio di cambio** | esposizione netta per entità e di gruppo; swap, forward, opzioni nel previsionale; ratio di copertura | **[FUORI SCALA]** |
| **Previsioni a lungo termine** | proiezioni mensili assistite da IA a 12+ mesi; conversione del budget di P&L in previsionale di cassa; varianza *previsto vs realizzato* in tempo reale; scenari e stress test | ✅ |
| **Dashboard & KPI** | cruscotti personalizzabili a livello entità e consolidato; KPI aggiornati in continuo; export PDF ed Excel | ✅ (il consolidato è **[FUORI SCALA]**) |

### 4.2 Linea «Pagamenti»

| Modulo | Contenuto | Rilevanza WEISS |
|---|---|---|
| **Fatturazione elettronica (e-invoicing & e-reporting)** | invio e ricezione; punto d'accesso **Peppol**, Plateforme Agréée in Francia, formato **EN16931** | ➖ in Italia lo SdI copre già il caso |
| **Payment factory** | pagamenti nazionali e internazionali, **oltre 120 divise**; pagamenti massivi, istantanei, ricorrenti; circuiti di validazione personalizzabili anche da app mobile; file **ISO 20022**; segregazione dei compiti; alert su anomalie (importo inusuale, duplicato); stato dei pagamenti (PSR); storico completo per utente | **[FUORI SCALA]** salvo gli alert su anomalie |
| **Gestione dei beneficiari** | identificazione dei beneficiari a rischio con verifica obbligatoria delle coordinate prima del pagamento; alert su modifica dell'anagrafica; storico delle modifiche per utente | ✅ antifrode, utile a qualunque scala |

### 4.3 Linea «Gestione del ciclo passivo» (poste fornitori)

| Modulo | Contenuto | Rilevanza WEISS |
|---|---|---|
| **Incluso nell'offerta** | connettività ERP/contabile e bancaria per i pagamenti; automazione contabile con aggiornamento del giornale acquisti e partite fornitori; **monitoraggio budget in tempo reale**; cruscotti dedicati (stato fatture, scaduto per fasce); sincronizzazione del previsionale in tempo reale | ✅ |
| **Fatturazione elettronica** | conformità **italiana** oltre a francese, tedesca, belga; generazione dell'e-reporting; previsioni affinate sullo stato del ciclo di vita della fattura | ➖ |
| **Gestione degli acquisti** | tracciabilità richiesta d'acquisto → ordine → bolla → fattura; **OCR** per l'estrazione dati; riconciliazione automatica a 2 e 3 vie; circuiti di approvazione personalizzati; pagamento innescato da Agicap e scritture esportate all'ERP | ✅ il 3-way match su ordini e bolle è esattamente il problema horeca |
| **Gestione delle spese dipendenti** | carte Mastercard fisiche e virtuali, Apple/Google Wallet; regole di spesa (plafond, fasce orarie, restrizioni); note spese e rimborsi anche da app; trasferte con indennità chilometriche e diarie; raccolta giustificativi con estrazione automatica | ✅ |

### 4.4 Linea «Gestione del ciclo attivo» (poste clienti)

| Modulo | Contenuto | Rilevanza WEISS |
|---|---|---|
| **Incluso nell'offerta** | connettività ERP/contabile, fatturazione elettronica, sincronizzazione previsionale | ➖ |
| **Fatturazione elettronica** | invio/ricezione nei formati ufficiali; stato del ciclo di vita per adattare i solleciti | ➖ |
| **Analisi del poste clienti** | scaduto cliente per cliente e fattura per fattura; scaduto per fasce e **DSO**; principali debitori; limiti di credito per cliente | ➖ l'horeca incassa in contanti/carta, il credito clienti è marginale |
| **Gestione degli incassi** | riconciliazione assistita da IA fra fatture aperte e incassi; scritture del giornale vendite ed export all'ERP | ✅ per la parte riconciliazione |
| **Affacturage / factoring** | modellazione dell'impatto del factoring sul cash | **[FUORI SCALA]** |

### 4.5 Linea «Connettività bancaria & ERP»

| Modulo | Contenuto | Rilevanza WEISS |
|---|---|---|
| **Connettività bancaria** | copertura mondiale, protocolli **EBICS TS, SWIFT, H2H**; sicurezza e ridondanza; console di monitoraggio delle connessioni | protocolli **[FUORI SCALA]**; la connessione ai conti è ✅ |
| **Connettività ERP & strumenti di business** | integrazioni native con **Sage, SAP, Oracle, Microsoft**; integrazioni su misura via **API pubblica**; console di monitoraggio | **[FUORI SCALA]** per gli ERP; l'API pubblica è ✅ |

**[OSSERVATO]** Nota trasversale della pagina:
> Profitez de la **connectivité bancaire et ERP incluse dans chaque offre**

La connettività **non è un modulo a pagamento**: è inclusa ovunque. È la base su cui poggia tutto il
resto — ed è anche il vero fossato del prodotto.

### 4.6 «Treasury Suite» — l'offerta bundle

> Sbloccate tutti i moduli di Agicap per beneficiare delle sinergie [...] pilotaggio in tempo reale
> della tesoreria, miglior controllo di OPEX e capitale circolante, automazione dei processi contabili,
> aggiornamento automatico dei cruscotti pronti per **investitori e creditori**.

**[DEDOTTO]** «Treasury Suite» è il nome commerciale dell'all-in-one nel modello 2026 e ha un proprio
`hubspotId`, cioè è una voce di listino a sé. Il destinatario dichiarato del bundle — investitori e
creditori — dice a chi è rivolto.

### 4.7 Incluso in tutti gli abbonamenti

**[OSSERVATO]** Il blocco *«Et en plus, inclus dans votre abonnement»* elenca ciò che **non** è mai
gated:

- **App mobile**: report settimanali, posizione di cassa, validazione pagamenti, accesso ai cruscotti
- **IA Agicap**: riconciliazioni automatiche, alert di anomalia, analisi, affinamento delle proiezioni
- **Sicurezza**: dati su Google Cloud Platform **in Belgio**, data center ISO/IEC 27701, **ISO 27001:2022**,
  TLS, GDPR
- **Accompagnamento**: team di implementazione dedicato, account manager, consulenza esperta, supporto

**[DEDOTTO]** Che l'IA sia inclusa e non venduta come add-on è una scelta di posizionamento: nel 2026
l'IA è tavolo, non differenziatore di prezzo.

---

## 5. L'unica condizione economica quantificata pubblicata

**[OSSERVATO]** Su https://agicap.com/it/funzionalita/gestione-delle-spese/:

> La gestione delle spese **gratuita\***
> Prova Spend Management! Con 1 o 100 carte, è gratis\*!
> **\*A condizione di un minimo di 5k€ di spesa mensile**

Argomentario associato:
> Adotta una soluzione il cui **prezzo sia indipendente dal numero di transazioni e dal numero di utenti**
> Investi la liquidità invece di immobilizzare importi significativi sul conto Swan: non è richiesto un
> importo minimo

Le carte sono Mastercard emesse tramite **Swan** (istituto di moneta elettronica autorizzato ACPR).
Limiti: 100k€/mese per carte virtuali e fisiche, 100k€ per transazione per le monouso.

**[FONTE TERZA]** Il comunicato ripreso da Assintel sostiene che la remunerazione di Agicap su questo
modulo venga dalle **commissioni interbancarie sulle transazioni**, non dal cliente.

**[DEDOTTO]** È un modulo *interchange-funded*: gratuito finché il volume transato ripaga il costo. La
soglia di 5.000 €/mese di spesa su carta è alla portata di WEISS. **È l'unico pezzo di Agicap con un
prezzo pubblico, ed è zero.** Serve da esca per portare in piattaforma il ciclo passivo.

---

## 6. Condizioni contrattuali — la parte che il sito non dice e il contratto sì

Fonte: **Condizioni Generali del Servizio, Agicap Italy S.r.l.** (https://agicap.com/it/gtc/agicap-srl-site/),
linkate dal footer italiano. Tutto **[OSSERVATO]**.

| Voce | Clausola |
|---|---|
| **Durata** | «Periodo Iniziale» stabilito nel Preventivo (art. 12.1). Le CGS **non** fissano una durata minima; la FAQ EN-US dichiara *«annual, with a minimum 12-month subscription»* |
| **Rinnovo** | **tacito**, «per periodi successivi della stessa durata» |
| **Disdetta** | per **raccomandata A/R o PEC**, con preavviso: **30 giorni** (contratti a 12 mesi), **60 giorni** (>12 e ≤24 mesi), **90 giorni** (>24 mesi) |
| **Indicizzazione** | prezzo fisso nel Periodo Iniziale; a ogni rinnovo **P1 = P0 × (1+y)^n**, con **y = 5%** |
| **Fatturazione** | «il Prezzo è dovuto **interamente al momento dell'invio dell'Ordine**» — pagamento anticipato dell'intero periodo, bonifico/addebito SEPA via **Stripe** |
| **Mora** | tasso BCE **+8%**, più penale fissa di **€ 40** |
| **Riduzione del perimetro** | l'eliminazione di opzioni «avrà effetto **solo al momento del rinnovo**» (art. 4.2) — si può salire subito, scendere solo a scadenza |
| **Setup/onboarding** | **inclusi**: formazione preliminare (art. 3.2.1), implementazione e configurazione (art. 3.2.2) |
| **Fuori dal prezzo** | preventivo separato per: server **SFTP**, import di grossi volumi di storico, **revisione della struttura delle categorie**, **creazione di KPI**, **formazione di nuovi utenti dopo l'implementazione** |
| **Penale nascosta** | **€ 125/ora + IVA** se il cliente salta o disdetta con meno di 48h un appuntamento di formazione |
| **Supporto** | solo **chat online**, lun-ven, 9:00-12:30 e 14:00-18:00 CET |
| **Prova** | l'account demo dà «accesso gratuito ai Servizi temporanei»; viene **revocato se non si conclude l'Ordine**. Nessuna durata dichiarata nelle CGS (fonti terze: 14 giorni) |

### La contraddizione da segnalare

**[OSSERVATO]** Le tre fonti ufficiali dicono cose diverse sullo stesso punto:

| Fonte | Cosa dice |
|---|---|
| FAQ **italiana** su `/it/tariffe/` | «L'offerta Agicap è **senza impegno**. Puoi cancellare il tuo account in qualsiasi momento» |
| FAQ **EN-US** su `/en-us/pricing/` | «The Agicap offer is **annual, with a minimum 12-month subscription**» |
| **CGS italiane**, art. 12.1 | Periodo Iniziale + **rinnovo tacito** + disdetta scritta con **30-90 giorni** di preavviso |

**[DEDOTTO]** La FAQ italiana è marketing, il contratto è il contratto. Chiunque valuti Agicap in Italia
dovrebbe leggere le CGS prima della pagina tariffe: si entra con un impegno pluriennale rinnovabile
tacitamente, pagato anticipatamente per intero, con indicizzazione al 5% annuo e una finestra di uscita
che va aperta mesi prima della scadenza.

---

## 7. Segmentazione per dimensione e per settore

**[OSSERVATO]** Tre pagine ufficiali, tre fasce di fatturato:

| Pagina | Fascia | Cosa viene messo in vetrina |
|---|---|---|
| `/it/azienda/piccola/` | **1-10 M€** | sincronizzazione conti, categorizzazione automatica («fino a 10 ore a settimana»), previsioni, solleciti, pagamenti fornitori, dashboard |
| `/it/azienda/media/` | **10-50 M€** | consolidamento dati in tempo reale, consuntivo vs previsionale **per entità e gruppo**, integrazioni ERP via API |
| `/it/azienda/grande/` | **> 50 M€** | flussi bancari via **EBICS**, vista consolidata di gruppo, ERP/CRM/spese/fatturazione, **validazione pagamenti multi-banca via EBICS TS** |

**[OSSERVATO]** Il menu «Clienti > Dimensioni dell'azienda» espone **solo** `>50 M€` e `10-50 M€`. La
pagina «1-10 M€» esiste in sitemap ma non è raggiungibile dalla navigazione.

**[DEDOTTO]** WEISS ricade nella fascia 1-10 M€, cioè in quella che Agicap ha smesso di promuovere. Il
baricentro commerciale si è spostato verso il mid-market: la pagina prezzi francese 2026 parla di
consolidamento di gruppo, EBICS TS, 120 divise, factoring e rischio di cambio — tutti temi che una PMI
horeca non ha. La testimonianza scelta per la pagina tariffe italiana (miscusi, catena di ristorazione)
è la traccia che il segmento resta servito, ma non è più il target di punta.

**[OSSERVATO]** Esiste `/it/settore/ristorazione/` («Il tool di gestione della tesoreria progettato per
i ristoratori»), ma il menu «Settori» espone manifatturiero, edilizia, immobiliare, agenzie, moda e
private equity — non la ristorazione. La pagina cita previsioni a 1/3/6/12 mesi, scenari di crisi
(calo fatturato, riduzione oraria), classificazione automatica delle transazioni e **analisi delle spese
per ristorante**. Non cita incassi giornalieri, integrazione POS, food cost, né gestione operativa
multi-punto-vendita.

**[DEDOTTO]** La copertura del settore ristorazione è di posizionamento, non di prodotto. Agicap tratta
un ristorante come un centro di costo con un conto corrente: sa dirti quanto ha speso il punto vendita,
non sa nulla di quanto ha incassato per turno né di come si compone il costo del venduto.

---

## 8. Cifre circolanti — tutte non ufficiali

Nessuna delle seguenti è confermabile: non esiste un listino contro cui verificarle.

| Fonte | Cifra | Natura |
|---|---|---|
| comparateur-efacturation.fr | **da 99 €/mese** + IVA | prezzo d'ingresso dichiarato; segnala che l'emissione di fatture clienti è un **modulo a pagamento extra** |
| tool-advisor.fr (e, per riporto, apogea.fr) | **150-799 €/mese** + IVA | forchetta dichiarata come stima interna della redazione |
| recensione su Capterra | **> 3.000 €/anno** con più di 2 conti e 2 società | importo riferito da un cliente |
| recensione su SoftwareAdvice | **≈ 200 £/mese** | importo riferito da un cliente |
| pricingnow.com | **$ 3.000+/anno** per un utente | dichiarata «rough estimate» |
| checkthat.ai | **€ 4.500** per un setup esteso su 6 mesi | attribuita a recensioni |

**Value for money**: 3,7/5 su Capterra (148 recensioni) e su GetApp — il punteggio più basso fra tutte le
dimensioni valutate su entrambe le piattaforme.

**[DEDOTTO]** Il punto di ingresso realistico per un'azienda della fascia di WEISS si colloca tra 150 e
300 €/mese per il solo modulo di tesoreria, e sale rapidamente con il numero di conti correnti e di
società. Il vincolo economico non è la funzionalità: è la struttura bancaria. Tre punti vendita con
conti separati costano più di tre punti vendita su un conto unico, **a parità di funzionalità usate**.

---

## 9. Le cinque scelte di gating che dicono di più

Non sono gating «per tier» — quelli non sono pubblici — ma **cosa Agicap vende separatamente**. Il segnale
è lo stesso: dove sta il valore che il mercato paga.

1. **La connettività bancaria e ERP è inclusa ovunque, non è un modulo.** Il pezzo più costoso da
   costruire (EBICS, SWIFT, H2H, oltre 300 banche europee, oltre 150 software contabili) è dato per
   scontato. È il fossato, non il prodotto.
2. **La riconciliazione contabile è un modulo a pagamento** («Comptabilité de trésorerie»: scritture
   automatiche del giornale di banca ed export all'ERP). Chi vede il flusso bancario non
   necessariamente compra il diritto di trasformarlo in scritture.
3. **Il previsionale è spaccato in due voci vendute separatamente**: le 13 settimane a maglia
   giornaliera stanno nel modulo base; i **12+ mesi con IA, la conversione del budget di P&L in cassa e
   gli stress test** sono un modulo a sé. Il breve termine è commodity, il medio-lungo si paga.
4. **La gestione delle spese aziendali è gratis sopra i 5.000 €/mese di transato.** Agicap regala il
   modulo di controllo delle spese e si paga sull'interchange: il valore percepito del *controllo* è
   basso, quello del *flusso di pagamento* è alto.
5. **La struttura delle categorie e i KPI sono servizi professionali a preventivo separato** (CGS
   art. 3.2.2). Il piano dei conti gestionale e gli indicatori — cioè la parte che rende lo strumento
   davvero tuo — non sono nel prezzo del software.

---

## Cosa non sono riuscito a determinare, e perché

1. **I prezzi effettivi di listino.** Non esistono in forma pubblica, in nessuna lingua. Non è una
   difficoltà di ricognizione: è una scelta commerciale di Agicap. L'unico modo per ottenerli è passare
   dal form e parlare con un commerciale, che è esattamente quello che il calcolatore è progettato per
   far succedere.

2. **La matrice funzionalità × tier (Business/Premium/Enterprise).** I nomi dei tier vengono solo da
   directory terze; il loro perimetro non è pubblicato da nessuna parte. La ricostruzione al § 3 è
   congetturale e internamente incoerente. Ho preferito costruire la matrice **per modulo** (§ 4), che
   è osservata e verificabile.

3. **I parametri esatti del calcolatore di prezzo.** Il form HubSpot (portale 2856475, form
   `79f8bd12-b8b2-4b17-9cd7-f635ca07206e`) non è interrogabile: gli endpoint pubblici delle form API
   HubSpot rispondono 404. Le fasce di conti bancari (1-2, 3-6, >6, >15) provengono da un aggregatore
   terzo e non le ho potute confermare sulla fonte.

4. **Limiti quantitativi per tier** — numero massimo di conti, utenti, entità inclusi. Le CGS dicono
   solo che il numero di «Interfacce Azienda» e di «Utenti» è quello previsto nell'Ordine, senza
   quantificare. Nessuna pagina pubblica espone una soglia.

5. **Costi di setup e onboarding.** Le CGS dicono che formazione preliminare, implementazione e
   configurazione sono incluse, ed elencano cosa richiede un preventivo separato — ma non quantificano
   né gli uni né gli altri. L'unico importo pubblicato è la penale di **125 €/ora** per gli appuntamenti
   saltati.

6. **Costi delle carte e commissioni Spend Management.** La pagina dichiara «gratis» sopra i 5k€/mese di
   spesa, ma non dice cosa succede sotto quella soglia, né se ci sono canoni per carta, commissioni su
   cambio valuta o prelievi. Il modello interchange è affermato da una fonte terza, non da Agicap.

7. **Due fonti terze rilevanti sono risultate inaccessibili**: G2 (`/products/agicap/pricing`) e
   apogea.fr, entrambe **HTTP 403**. Di G2 ho solo il riporto indiretto dei motori di ricerca; di
   apogea.fr solo la forchetta 150-799 €/mese ripresa altrove.

8. **La differenza fra la FAQ italiana («senza impegno») e le CGS italiane (rinnovo tacito con preavviso
   30-90 giorni) non l'ho potuta risolvere**: sono entrambe fonti ufficiali Agicap e si contraddicono.
   Prevale il contratto, ma la discrepanza va verificata direttamente in fase di trattativa.
