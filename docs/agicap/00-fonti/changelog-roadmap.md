# Agicap — Changelog, novità di prodotto e direzione strategica

**Analisi competitiva per WEISS S.r.l.** — modulo tesoreria del gestionale interno
**Data di redazione**: 11 agosto 2026
**Metodo**: sole fonti pubbliche via ricerca e recupero web. Nessun accesso all'applicazione, nessun account, nessun browser.

---

## Fonti consultate

### Fonti ufficiali Agicap

| URL | Cosa contiene | Esito |
|---|---|---|
| https://agicap.com/en-us/article/agicap-mcp-claude/ | Annuncio Agicap MCP (18 giu 2026) | letto |
| https://agicap.com/en-us/features/ai-cash-flow-management/ | Pagina prodotto «Agicap AI», 5 capacità | letto |
| https://agicap.com/fr/article/agicap-plateforme-agreee-facturation-electronique/ | Immatricolazione DGFiP (20 gen 2026) | letto |
| https://agicap.com/it/articolo/agicap-rebranding/ | Rebranding «Treasury Powerhouse» (24 feb 2025) | letto |
| https://agicap.com/fr/article/partenariat-agicap-pennylane/ | Partnership Pennylane (17 mar 2025) | letto |
| https://agicap.com/en-us/article/agicap-raises-euros-forty-five-million-series-c/ | Serie C €45M (12 nov 2024) | letto |
| https://agicap.com/fr/article/voix-du-client-produit-agicap/ | Processo di roadmap (9 giu 2022) | letto |
| https://agicap.com/fr/article/calendrier-evenements-webinaires-agicap/ | Calendario eventi e webinar 2026 | letto |
| https://agicap.com/fr/categorie/actualites/ e /fr/categorie/facturation-electronique/ | Indici di categoria del blog FR | letti |
| https://agicap.com/it/categorie/notizie/ | Indice categoria «Notizie» IT | letto |
| https://agicap.com/fr/presse/ | Pagina stampa, profilo societario | letto |
| https://agicap.com/en-us/ e https://agicap.com/it/ | Menu prodotti, claim | letti |
| https://treasuryday.agicap.com/ | Evento Treasury Day, tre città | letto |
| https://agicap.com/en-us/product-updates/ | — | **HTTP 404** |
| https://help.agicap.com/ | — | **HTTP 404** |
| https://app.agicap.com/ | Applicazione | dietro login, non accessibile |
| https://medium.com/agicap-product | Pubblicazione «Agicap Produit» | pagina vuota di contenuti recuperabili (solo metadati: 64 follower, editor Ezzabdi Maël e Luc Chaffard) |

### Fonti terze

| URL | Cosa contiene | Esito |
|---|---|---|
| https://www.lememento.paris/article_23-06-2026-... | Resoconto Treasury Day 2026 e strategia IA | letto |
| https://www.comparatif-facture-electronique.fr/agicap-facturation-electronique-avis/ | Data immatricolazione PA, formati, prezzi | letto |
| https://www.datamanager.it/2023/03/agicap-automatizza-completamente-la-gestione-della-tesoreria/ | SDI + SFTP per l'Italia (23 mar 2023) | letto |
| https://forbes.it/2023/11/24/...agicap-spend-management | Lancio Spend Management (24 nov 2023) | letto |
| https://wayes.de/en/news-en/agicap-days-march-2026-... | Agicap Days Germania marzo 2026 | letto |
| https://www.mercuria.fr/actualites/ia-tresorerie-agicap/ | Casi d'uso IA in tesoreria secondo Agicap | letto |
| https://techcrunch.com/2024/11/11/agicap-secures-48-million... | Serie C, cifra in dollari | via snippet |
| https://itsocial.fr/.../agicap-dote-sa-plateforme-... | Server MCP e assistente IA | **HTTP 403**, solo titolo/snippet |
| https://www.tipranks.com/news/private-companies/agicap-* | Riconoscimenti G2 Spring/Summer 2026 | **HTTP 403**, solo snippet |
| Tracxn, Crunchbase, PitchBook | Assenza di acquisizioni | via snippet |

Testi grezzi archiviati in `assets/agicap/materiali-pubblici/changelog-*.md` (7 file).

---

## Premessa che cambia la lettura di tutto il resto

> **Agicap non pubblica un changelog.** [OSSERVATO]

Non esiste una pagina di release notes, non esiste una sezione «Nouveautés / Novità / Product updates», non esiste una board pubblica di feature request votabili (né Canny, né Productboard, né equivalenti), non esiste una roadmap pubblica. L'Help Centre è citato nella pagina di supporto **senza URL**: è raggiungibile solo da dentro l'applicazione, che è dietro login.

Il blog non ha una categoria «Prodotto»: gli annunci di funzionalità sono sparsi dentro «Actualités» / «Notizie», mescolati ad articoli SEO divulgativi, e in molti casi il **rilascio non viene annunciato affatto** — la funzionalità appare direttamente sulle pagine di prodotto, senza data.

La conseguenza pratica: la cronologia qui sotto è **ricostruita**, non trascritta. La densità delle voci riflette la densità della comunicazione stampa, non il ritmo reale delle release. Il ritmo reale è quasi certamente molto più fitto — 30% del fatturato in R&S, e ~200 richieste di miglioramento nuove a settimana nel 2022 — ma non è osservabile dall'esterno. `[DEDOTTO]`

---

## Cronologia ricostruita

Legenda: `[OSS]` = osservato sulla fonte · `[DED]` = dedotto · `[IPO]` = ipotesi

| Data | Funzionalità / evento | Modulo | Note |
|---|---|---|---|
| 2016 | Fondazione a Lione (Beyet, Mauguet, Bertola) | — | `[OSS]` |
| mag 2021 | Serie B $100M (€82M), lead Greenoaks + BlackFin + Partech | — | Totale raccolto $121M, valutazione >$500M `[OSS]` |
| giu 2022 | **Agicap CashCollect** — solleciti clienti automatizzati | Ciclo attivo (AR) | Nasce da feedback cliente `[OSS]` |
| giu 2022 | **Agicap Payment** — centralizzazione fatture e pagamenti fornitori | Ciclo passivo (AP) | `[OSS]` |
| 9 giu 2022 | Pubblicazione del processo di roadmap: 80 CSM, ~200 idee/settimana su 11.000 accumulate, prioritizzazione settimanale a coppie di PM | Processo | `[OSS]` |
| 23 mar 2023 | **Integrazione SDI** (Agenzia delle Entrate): import automatico fatture clienti/fornitori con le credenziali del cassetto fiscale | Connettività — **Italia** | Unica funzionalità annunciata specificamente per l'Italia `[OSS]` |
| 23 mar 2023 | **Integrazione SFTP**: import automatico da gestionali, ERP, sistemi bancari | Connettività | Posizionata per le grandi realtà `[OSS]` |
| 24 nov 2023 | **Agicap Spend Management**: carte fisiche/virtuali/monouso per dipendenti, limiti, alert, raccolta ricevute, IVA recuperabile | Spese | **Gratuito**, monetizzato via interchange `[OSS]` |
| 12 nov 2024 | **Serie C €45M**, lead AVP. 8.000 clienti, ricavi 7x dalla Serie B, >50% ricavi fuori Francia | — | Fondi destinati a midmarket, **modulo FX** e **credit management** `[OSS]` |
| 24 feb 2025 | **Rebranding «Treasury Powerhouse»**: nuova identità, tre pilastri (ottimizzazione liquidità / gestione commerciale / massimizzazione rendimenti). Compaiono cash pooling e gestione degli investimenti | Posizionamento | **Zero menzioni di AI** `[OSS]` |
| 17 mar 2025 | **Partnership Pennylane**: estratti conto via EBICS in tempo reale, validazione pagamenti fornitori mobile e multi-livello, riconciliazione istantanea | Connettività + AP | Distribuita solo via integratori certificati `[OSS]` |
| 20 gen 2026 | **Immatricolazione come Plateforme Agréée** DGFiP: Factur-X/UBL/CII, EDI, e-reporting, **14 stati fattura**, aggancio fatture↔flussi bancari, previsioni sui cicli di fatturazione reali | Fatturazione elettronica — **Francia** | Una delle 112 piattaforme approvate `[OSS]` |
| 10-19 mar 2026 | Agicap Days Berlino, Francoforte, Monaco | Go-to-market DACH | `[OSS]` |
| primavera 2026 | **#1 G2** in Cash Flow Management e Treasury Management Systems (report Spring 2026) | — | Confermato nei report Summer 2026 `[OSS]`, via snippet |
| 9 giu 2026 | **Treasury Day Parigi, 2ª edizione — svolta IA.** Tre annunci: | | >300 CFO e tesorieri presenti `[OSS]` |
| ↳ | **Smart Reports** — reporting in linguaggio naturale, genera tabelle e grafici da richieste tipo «evoluzione degli incassi per filiale» | Reporting / BI | **Disponibile per tutti i clienti** `[OSS]` |
| ↳ | **Assistente IA** — copilota conversazionale che interroga i dati *e agisce* (es. categorizza transazioni) | Trasversale | **Beta da fine Q2 2026** `[OSS]` |
| ↳ | **Server MCP** — standard Anthropic, collega la tesoreria ad agenti IA e ad altre fonti (ERP, CRM, acquisti) | Integrazione | **Beta pubblica** `[OSS]` |
| 18 giu 2026 | Articolo dedicato: **Agicap MCP dentro Claude**. Modalità read-only o read-write, ogni scrittura richiede approvazione umana, permessi ereditati per ruolo ed entità, ISO 27001:2022, GDPR, nessun training sui dati clienti | Integrazione | `[OSS]` |
| 25 giu 2026 | Treasury Day Milano | Go-to-market Italia | `[OSS]` |
| 8 lug 2026 | Serata conferenza sulla fatturazione elettronica in sede | Go-to-market FR | `[OSS]` |
| 23 lug 2026 | Webinar «L'IA dans Agicap» (Kelly Roussel) | Formazione clienti | `[OSS]` |
| 1 set 2026 | Scadenza normativa FR: obbligo di **ricezione** fatture elettroniche per tutti i soggetti IVA | Contesto | Non è una release Agicap `[OSS]` |
| 22 set 2026 | Treasury Day Colonia — «Cash Management nell'era dell'IA» | Go-to-market DACH | Futuro `[OSS]` |

### Funzionalità presenti nel prodotto ma senza data di rilascio pubblica

Sono elencate sulle pagine prodotto senza alcun annuncio datato. Il posizionamento è quello attuale, la data di introduzione non è determinabile. `[OSS]` per l'esistenza, `[DED]` per la collocazione temporale.

| Funzionalità | Modulo | Data probabile |
|---|---|---|
| Zero-Touch Reconciliation & Journaling — 95% delle scritture di banca automatizzate | Riconciliazione / contabilità | post-2024 `[DED]` |
| Automated Recovery — agente IA che scrive solleciti personalizzati adattando il tono allo storico pagamenti; speech-to-text per le note di chiamata | Credit management | 2025-2026 `[DED]` |
| Cash Flow Forecasting Assistant — categorizzazione automatica, spiegazione degli scostamenti, rilevamento di ricorrenze | Previsioni | 2024-2025 `[DED]` |
| AI Fraud & Error Shield — rileva documenti falsi generati da IA, duplicati, anomalie di pagamento | Pagamenti | 2025-2026 `[DED]` |
| Intelligent Data Extraction Agents — OCR su ordini, bolle, fatture, ricevute | Ciclo passivo | 2024-2026 `[DED]` |
| Modulo **rischio di cambio (FX)**: collega previsioni di budget, flussi reali e strumenti di copertura; simula l'impatto di una nuova copertura prima di eseguirla | Rischi | Finanziato dalla Serie C (nov 2024), quindi 2025-2026 `[DED]` |
| **Cash pooling** automatizzato e arbitraggio infragruppo | Liquidità | Compare nel rebranding di feb 2025 `[DED]` |
| Gestione degli **investimenti della liquidità in eccesso** | Liquidità | Compare nel rebranding di feb 2025 `[DED]` |
| Modulo di **BI / report personalizzati** (posizioni di cassa, commissioni bancarie, DSO, debito, investimenti, runway) | Reporting | pre-2026, poi esteso da Smart Reports `[DED]` |

---

## Lettura della direzione strategica

### 1. Il pivot sull'IA è avvenuto fra marzo 2025 e giugno 2026, ed è netto `[DEDOTTO]`

Il dato più eloquente di tutta la ricerca è un'assenza. Il rebranding del **24 febbraio 2025** — un documento di posizionamento, il punto in cui un'azienda dice cosa è — **non nomina l'intelligenza artificiale nemmeno una volta**. Parla di visibilità in tempo reale, liquidità, rendimenti. Sedici mesi dopo, la homepage si presenta come «AI-powered platform», l'intero Treasury Day è costruito sull'IA, e il claim di apertura in Germania è «Cash Management nell'era dell'IA».

Non è un'evoluzione graduale: è una riscrittura della narrazione di prodotto in poco più di un anno. `[DEDOTTO]`

Va notato che Agicap stessa cita un dato che rende la mossa più difensiva di quanto sembri: l'adozione dell'IA nelle direzioni finanziarie è passata da ~0% (2022) a oltre 50% (2024), **poi si è quasi fermata nel 2025 (+2-3 punti)**. Stanno spingendo su un mercato che ha già smesso di crescere da solo. `[DEDOTTO]`

### 2. La scommessa specifica: l'IA come *interfaccia*, non come motore predittivo `[DEDOTTO]`

Le tre novità di giugno 2026 hanno un tratto comune che è facile mancare: **nessuna delle tre migliora l'accuratezza della previsione di cassa**. Smart Reports, Assistente IA e server MCP sono tutti e tre modi diversi di *parlare* con dati che esistevano già.

La tesi implicita è quella espressa dal CEO: «per una strategia IA efficace in finanza serve un dato affidabile e immediatamente azionabile». Cioè: il valore sta nella base dati normalizzata (banche + ERP + contabilità + fatture), e l'IA è il livello che la rende interrogabile. Chi ha la base dati vince; il modello è commodity. `[DEDOTTO]`

Questa è, per WEISS, la lezione più direttamente trasferibile — e anche la più scomoda, perché è esattamente il pezzo che un gestionale interno *già possiede* per il proprio perimetro.

### 3. Il server MCP è la mossa più interessante e la più rischiosa `[DEDOTTO]`

Aprire un server MCP significa accettare che l'utente non apra più Agicap: interroga la tesoreria da Claude, insieme all'ERP e al CRM. È un'azienda che rinuncia volontariamente al controllo della propria interfaccia in cambio di diventare la *fonte* nel workflow altrui.

Le garanzie annunciate sono la parte da studiare, perché disegnano il perimetro di ciò che è considerato accettabile far fare a un agente sui dati finanziari:

- distinzione esplicita **read-only / read-write** decisa dall'amministratore
- **ogni scrittura richiede approvazione umana** — nessuna azione autonoma
- permessi **ereditati per ruolo ed entità** dalla piattaforma, non ridefiniti
- i dati **restano nell'infrastruttura Agicap**
- **nessun addestramento sui dati dei clienti**
- ISO 27001:2022 e GDPR

E un limite che dichiarano onestamente: la sorte dei dati *dentro la conversazione* dipende dal piano che il cliente ha con il fornitore dell'IA, non da Agicap. `[OSSERVATO]`

### 4. Tre cantieri paralleli sotto la narrazione IA `[DEDOTTO]`

- **Conformità normativa come leva commerciale.** L'immatricolazione come Plateforme Agréée (gen 2026) e il calendario fittissimo di webinar sulla fatturazione elettronica — un «Café Agicap» *ogni venerdì* — mostrano che la scadenza francese del settembre 2026 è il principale motore di acquisizione dell'anno. Il prodotto ha 14 stati fattura contro i pochi obbligatori: stanno usando la conformità come pretesto per entrare nel ciclo documentale, non solo in quello di cassa. `[DEDOTTO]`
- **Risalita verso il midmarket.** I fondi della Serie C erano dichiaratamente destinati a FX e credit management «per il midmarket». Cash pooling, arbitraggio infragruppo, multi-entità e multi-valuta sono ormai in vetrina. `[FUORI SCALA]` per WEISS.
- **Distribuzione indiretta.** Pennylane venduta «esclusivamente attraverso integratori certificati», Agicap Days e Treasury Day come macchina eventi in 5 paesi, partnership con studi e system integrator. Il motore di crescita non è più solo il self-service. `[DEDOTTO]`

### 5. Cosa NON stanno facendo `[DEDOTTO]`

- **Nessuna acquisizione**, mai (verificato su Tracxn e Crunchbase). Tutto costruito in casa.
- **Nessun changelog, nessuna roadmap pubblica, nessuna board di voto.** Per un prodotto B2B con 8.000 clienti è una scelta, non una dimenticanza: la relazione col cliente passa dagli 80+ account manager e dal processo interno di prioritizzazione, non dalla trasparenza pubblica. La conseguenza è che i clienti non possono anticipare le release, e i concorrenti non possono leggerle. `[DEDOTTO]`
- **Nessun modulo di gestione operativa** (magazzino, personale, POS). Restano rigorosamente sul finanziario.

---

## Cosa è rilevante per WEISS e cosa no

### Direttamente rilevante

| Elemento Agicap | Perché conta per un gestionale horeca a tre punti vendita |
|---|---|
| **Integrazione SDI** (mar 2023) | Stesso problema, stesso paese, stessa soluzione: le fatture sono già sullo SDI, reinserirle è lavoro sprecato. È l'unica funzione Agicap pensata per l'Italia. |
| **Categorizzazione automatica dei flussi** («>90% dalla prima settimana») | È la metrica di riferimento contro cui misurare il proprio motore di categorizzazione. |
| **Zero-touch reconciliation** (95% delle scritture di banca) | Obiettivo numerico dichiarato per la riconciliazione automatica. |
| **Smart Reports** — reporting in linguaggio naturale | La funzione più imitabile con costo contenuto: non richiede nuova base dati, solo un livello di interrogazione sopra quella esistente. |
| **Server MCP con permessi ereditati e approvazione umana sulle scritture** | Il modello di sicurezza è direttamente riusabile, e il gestionale interno ha già il modello di permessi da cui ereditare. |
| **Spend Management gratuito monetizzato via interchange** | Un modello di business, non solo una funzionalità: dice che il valore percepito della gestione spese da sola è basso. |

### `[FUORI SCALA]` per WEISS

- **Cash pooling** e arbitraggio infragruppo — presuppongono più entità giuridiche con conti da compensare
- **Modulo FX / rischio di cambio** — presuppone esposizione in valute diverse dall'euro
- **Multi-valuta e multi-entità** nelle posizioni di cassa esposte via MCP
- **EBICS** — protocollo di comunicazione bancaria per volumi e strutture corporate
- **Integrazione ERP** (NetSuite, SAP e simili) — WEISS *è* il proprio ERP
- **Gestione degli investimenti della liquidità in eccesso** — presuppone eccedenze strutturali da collocare
- **Plateforme Agréée DGFiP** — normativa francese, l'Italia ha SDI dal 2019
- **Consolidato di gruppo e tesoreria centralizzata** — impliciti in tutta la comunicazione midmarket post-Serie C

---

## Cosa non sono riuscito a determinare e perché

1. **La cronologia reale delle release.** Non esiste un changelog pubblico (verificato: 404 su `/product-updates/` e su `help.agicap.com`, nessuna categoria «Nouveautés» nel blog, nessuna board Canny/Productboard). La tabella qui sopra è ricostruita da comunicati stampa e articoli, che coprono forse una release su venti. Il ritmo reale non è osservabile dall'esterno.

2. **Eventuali release notes in-app.** L'Help Centre è citato in `agicap.com/en-us/support/` senza URL e `app.agicap.com` è dietro login. Se Agicap pubblica novità ai propri clienti, lo fa lì dentro, e senza credenziali non è raggiungibile. Questo è probabilmente il buco più grande di questa analisi.

3. **La pubblicazione Medium «Agicap Produit»** esiste (64 follower, due editor) ma la pagina indice non ha restituito alcun articolo al recupero. Potrebbe essere abbandonata, potrebbe caricare i contenuti via JavaScript. Non risolto.

4. **Le date di introduzione delle cinque capacità AI di prodotto** (riconciliazione zero-touch, recupero crediti automatizzato, assistente alle previsioni, scudo antifrode, agenti di estrazione dati). La pagina prodotto le presenta tutte come operative, senza date e senza marker beta. Le collocazioni in tabella sono dedotte dal contesto dei comunicati, non osservate.

5. **Il contenuto dell'articolo IT Social sul server MCP** (HTTP 403) e **degli articoli TipRanks sui riconoscimenti G2** (HTTP 403). Ho usato solo titoli e snippet indicizzati, chiaramente marcati come tali nei materiali grezzi.

6. **L'agenda dettagliata dei Treasury Day** e il contenuto del video ufficiale su YouTube. Il sito dell'evento espone solo date e città. Il video non è stato trascritto. È plausibile che lì siano stati annunciati altri rilasci minori.

7. **Se l'Assistente IA sia effettivamente uscito dalla beta.** L'annuncio di giugno 2026 diceva «beta da fine Q2 2026»; a metà agosto 2026 non ho trovato conferme di disponibilità generale.

8. **Quante delle richieste dei clienti diventino funzionalità.** Il dato del 2022 (200 nuove idee a settimana su 11.000 accumulate) è l'unico pubblico e ha ormai quattro anni. Nessuna board pubblica permette di vedere le richieste più votate — semplicemente non esiste.
