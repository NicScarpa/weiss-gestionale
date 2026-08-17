# Tassonomia unificata — sintesi a cinque vie

Fase 1 del confronto Agicap · Trezy · Cash King · Sibill · weiss-gestionale.

Questo documento fa una cosa sola: stabilire **un vocabolario comune** e mappare
su di esso ciò che i quattro prodotti chiamano con nomi diversi, prima che
qualunque confronto venga fatto. Non contiene giudizi, non contiene verdetti,
non contiene priorità: quelli stanno nei documenti 02-08.

Gli identificativi assegnati qui (`RIC-04`, `PRV-11`, …) sono **stabili** e
vengono riusati come chiave in tutti i documenti successivi.

---

## 0. Premesse che condizionano tutto il resto

### 0.1 Correzione allo stack del gestionale

`METODO.md` (e il prompt che lo istanzia) descriveva il backend del gestionale
come **FastAPI + SQLAlchemy + Alembic**, con chiavi primarie UUID. **Era
sbagliato**, e andava corretto qui perché la traduzione di ogni accorgimento nel
nostro stack dipende da questo:

| Componente | Dichiarato | Reale (verificato nel repo) |
|---|---|---|
| Frontend | Next.js 14 App Router + React + Tailwind + shadcn/ui | Next.js App Router + React + Tailwind + shadcn/ui ✔ |
| Backend | FastAPI | **Route handler Next.js** (`src/app/api/**/route.ts`, 190 rotte) |
| ORM | SQLAlchemy | **Prisma 7** (`@prisma/client`, `@prisma/adapter-pg`) |
| Migrazioni | Alembic | **`prisma migrate`** (`prisma/migrations`) |
| Database | PostgreSQL, PK UUID | PostgreSQL ✔, **PK `cuid()`** |
| Altro | — | Serwist (PWA/offline), Sentry, NextAuth (JWE), RLS su tutte le tabelle |

Nel repo non esiste alcun file Python applicativo né alcuna cartella `alembic`.
Ogni riga "come lo faremmo" nei documenti successivi userà route handler, modelli
Prisma e componenti shadcn/ui.

**`METODO.md` è stato corretto** (agosto 2026): porta ora lo stack reale e
un'avvertenza a verificarlo invece di fidarsi dell'elenco, così la prossima
analisi non ripropaga l'errore. Chi legge questa tabella la trova quindi come
documentazione di un errore chiuso, non di uno aperto.

### 0.2 Peso dell'evidenza per fonte

Ripetuto qui perché governa la lettura di ogni cella della matrice.

| Fonte | Ambiente | Accesso | Qualità dell'evidenza | Peso di prodotto |
|---|---|---|---|---|
| **Cash King** | sandbox, dati demo ricchi | completo | **ALTA** — API lette, calcoli verificati, guida in-app estratta dal bundle (88 schermate) | medio |
| **Agicap** | produzione WEISS, dati reali scarni | **parziale** (moduli non acquistati) | **MEDIA** — poche schermate osservate, molta Fase 0 documentale, alcune formule verificate con input noti | **ALTO** (leader europeo) |
| **Trezy** | produzione, dati reali | completo | **MEDIA-BASSA** sul previsionale (zero previsioni inserite), **ALTA** sui documenti e sulla pre-contabilità (249 fatture, 749 movimenti, 3 368 scritture) | basso-medio |
| **Sibill** | reverse engineering precedente | payload reali + bundle JS | **ALTA ma DATATA** — il prodotto può essere evoluto dopo la nostra analisi | medio |
| **weiss-gestionale** | codice sorgente | totale | **MASSIMA** — lettura diretta di schema, route, servizi e componenti | — |

Conseguenza operativa: **l'evidenza di Trezy sul previsionale è debole per stato
dell'account, non per debolezza del prodotto**, e va marcata `[NON POPOLATO]`
ovunque; l'evidenza di Agicap è debole per gating commerciale e va marcata
`[NON ACCESSIBILE]`. Nessuna delle due è un'assenza di funzionalità.

### 0.3 Fonti lette per costruire questa tassonomia

- `docs/agicap/` — 12 file (`00-ricognizione-pubblica`, `02-aree-funzionali/01-03`, `04`, `04b`, e i file di `00-fonti/`)
- `docs/trezy/` — `02-aree-funzionali/01-05`, `README`
- `docs/cashking/` — `02-aree-funzionali/01-07`, `04b`
- `docs/Ciclo_Tesoreria_Modello_Sibill.md` + `prompt-conti-sibill.md`
- **Codice**: `prisma/schema.prisma` (2 601 righe, 87 modelli), le 190 route
  `src/app/api/**`, `src/lib/{saldi,reconciliation,scadenzario,services,schedule-rules,report,line-categorization,accounts}`,
  i componenti `src/components/{cashflow,scadenzario,reconciliation,prima-nota,invoices}`,
  `src/components/layout/sidebar.tsx`, le 71 pagine di `src/app/(dashboard)`.

---

## 1. Le quattordici aree

La tassonomia è a due livelli: **area** (prefisso dell'ID) e **voce** (la riga
della matrice). Le aree sono state scelte in modo che ciascuna corrisponda a un
job-to-be-done distinto, non alla struttura di menu di nessuno dei cinque
prodotti — che è esattamente la cosa su cui divergono di più.

| Prefisso | Area | Domanda a cui risponde |
|---|---|---|
| `BNK` | Conti, saldi e connessione bancaria | Quanti soldi ho, adesso, e da dove lo so |
| `MOV` | Movimenti: acquisizione, lista, stati | Cosa è successo sui conti |
| `CLS` | Classificazione: piano, regole, apprendimento | A cosa si imputa ciò che è successo |
| `DOC` | Documenti: fatture, acquisizione, righe | Cosa mi hanno fatturato e cosa ho fatturato |
| `SCD` | Scadenzario e aging | Cosa devo pagare e incassare, e quanto è vecchio |
| `RIC` | Riconciliazione | Quale movimento salda quale scadenza |
| `PRV` | Previsionale, ricorrenze, scenari | Quanti soldi avrò |
| `SCS` | Scostamento previsto/consuntivo | Ci avevo azzeccato |
| `KPI` | Indicatori, cruscotti, giudizi | Devo preoccuparmi |
| `RPT` | Reportistica, stampe, export | Cosa porto in banca o dal commercialista |
| `ALR` | Alert, notifiche, comportamenti nel tempo | Il software mi avvisa prima |
| `RET` | Punto vendita: incassi, POS, contanti | Quanto ho incassato al banco e quando arriva in banca |
| `FIS` | Adempimenti italiani | IVA, F24, SDI, corrispettivi |
| `PLT` | Piattaforma: utenti, multi-sede, UX trasversale | Chi vede cosa, e come ci si muove dentro |

Due aree meritano una parola sul perché esistono separate:

- **`SCS` (scostamento) è staccata da `PRV` (previsionale)** perché è la
  discriminante fra un prodotto di tesoreria maturo e uno immaturo, ed è l'unica
  area in cui i quattro si separano nettamente: Agicap la costruisce (snapshot
  settimanale congelato), Cash King l'ha **solo nel modulo Retail** e non in
  tesoreria, Trezy ha il selettore «ultimo periodo effettivo» ma nessuna
  previsione da confrontare, Sibill non ne ha traccia. Tenerla dentro `PRV`
  l'avrebbe resa invisibile.
- **`RET` esiste** perché è il nostro caso d'uso, non perché sia una categoria
  standard: solo Cash King la modella (modulo a pagamento) e solo Trezy la
  sfiora (beta food cost). Tenere gli incassi da banco dentro `MOV` avrebbe
  fatto sparire la differenza che ci riguarda di più.

---

## 2. Mapping — area per area

Legenda delle celle: il **nome che il prodotto usa** per la stessa cosa. Un `—`
significa "non ha un nome perché la voce non è emersa in quel prodotto", e va
letto insieme al tag di lacuna: `[NA]` non accessibile · `[NP]` non popolato ·
`[NV]` non verificabile · `[DD]` da documentazione · `[?]` corrispondenza dubbia,
discussa al § 3.

### BNK — Conti, saldi e connessione bancaria

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| BNK-01 | Anagrafica conto corrente | «Conti bancari» (4 collegati) | `bank-accounts`, 3 conti | `/settings/bank-accounts`, scheda per conto | conti bancari | `BankAccount` (nome, IBAN cifrato, BIC, colore) |
| BNK-02 | Saldo iniziale con data di partenza | — [NA] | «saldo iniziale alla data di partenza» (import) [DD] | «Saldo Iniziale 25.000 € al 10/08» | — | `InitialBalance` **per anno**, non per conto |
| BNK-03 | Saldo per singolo conto | sì (4 conti, 3 a zero) | sì, per conto | sì, riga per conto nella griglia Tesoreria | sì | **assente**: `JournalEntry` non ha `bankAccountId`, i saldi sono per `registerType` CASH/BANK |
| BNK-04 | Saldo consolidato multi-conto | «liquidità effettivamente disponibile» | «Saldo totale di 3 account» | «Saldo Attuale» / «Saldo Totale» | sì | `saldiAlGiorno()` → `totalAvailable` (cassa + banca) |
| BNK-05 | Fido / affidamento e saldo disponibile | «Scoperto autorizzato» (soglia per conto) | — | «Fido di Cassa: accordato/utilizzato/residuo» + SBF | — | **assente** |
| BNK-06 | Connessione bancaria PSD2 / aggregatore | PSD2, EBICS, SWIFT, host-to-host, 300+ banche [DD] | Enable Banking (osservato) · Powens · Plaid [DD] | costruita ma **non consegnata** ai clienti | PSD2 | flag `BankAccount.openBankingReady`, **nessuna integrazione** |
| BNK-07 | Import estratto conto da file | Excel (stime); movimenti da banca | CSV/XLSX/XLS con mappatura colonne [DD] | CSV/Excel + modelli di import salvati | — | `POST /api/bank-transactions/import` (CSV), `ImportBatch` |
| BNK-08 | Modelli di importazione riutilizzabili | interruttore «compilare solo le settimane vuote» [?] | mappatura colonne, non salvata [DD] | **`/import/models`**, salvati durante l'import | — | **assente** |
| BNK-09 | Distinzione conti attivi/passivi e costo dello sbilanciamento | — | — | «Totale Banche attive/passive», «Tasso medio creditore/debitore», «Interessi Stimati» | — | **assente** |

### MOV — Movimenti: acquisizione, lista, stati

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| MOV-01 | Lista movimenti con filtri | lista movimenti bancari | `/transaction`, elenco **raggruppato per giorno** | `/transactions`, tabella con schede | `transaction` | `/prima-nota/movimenti`, `MovimentiClient` |
| MOV-02 | Stati del movimento | `Realizzato` / `In attesa` | `isIgnored` (Incluse/Escluse) | **5 stati**: Consolidato · Completo · Previsto · Provvisorio · Non riconciliato | `verificationStatus`, `hidden` | `verified` (bool), `hiddenAt`, `deletedAt`; nessun enum di stato |
| MOV-03 | Verifica umana come asse ortogonale | — | `verification-stats` (749/749) | — | **`verificationStatus`** VERIFIED/TO_VERIFY | `JournalEntry.verified` + `Schedule.verificata` |
| MOV-04 | Cestino / cancellazione morbida | — | — | **scheda «Cestino» con contatore**, `trashedAt` | — | `deletedAt` su tutti i modelli di `SOFT_DELETE_MODELS`, **nessuna UI di cestino** |
| MOV-05 | Suddivisione di un movimento su più imputazioni | — | `isSplitParent` (esiste, mai usato) [NP] | — | **split per categoria** | **`JournalEntryAllocation`** + dialog «Suddividi importo» + badge «Suddiviso (N)» |
| MOV-06 | Raggruppamento dei movimenti simili | «88 transazioni corrispondenti» (in anteprima regola) | **badge `similarTransactionsCount`** + `transaction_hash` su descrizione normalizzata | — | — | **assente** |
| MOV-07 | Provenienza del dato (macchina vs persona) | — | `categoryValidatedAt` (esiste, nullo) [NP] | **`isManuallyMatched`**, colonna «Origine» sui sinonimi | `categorizationSource` | `categorizationSource`, `costCenterSource`, `dataAttesaSource`, `JournalEntryAllocation.origine`, `InvoiceLineAccount.fonte` |
| MOV-08 | Causale/tipo operazione distinta dall'imputazione | — | — | colonna **«Causale»** (Incasso fattura, Mutuo, Leasing…) | — | **`JournalEntry.entryType`** (enum `EntryType`) |
| MOV-09 | Giroconto fra conti propri riconosciuto come coppia | — | categoria `Trasferimento interbancario` (Stato Patrimoniale) | **`hasPeerReconciliations`** | — | **`JournalEntry.transferId`** (lega le due righe del trasferimento) |
| MOV-10 | Movimenti con data futura distinti dai realizzati | «Realizzato e in attesa» | — | **no**, ed è un difetto: gonfia il «Saldo Attuale» | — | `saldiAlGiorno()` **esclude** il futuro per definizione |
| MOV-11 | Azioni di massa sulla lista | selezione multipla + menu «...» | `Seleziona tutto (749)` + `Categorizza` / `Esporta` | casella «seleziona tutto» + azioni bulk | — | `POST /api/prima-nota/recategorize` (batch), nessuna selezione multipla in UI [?] |

### CLS — Classificazione: piano, regole, apprendimento

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| CLS-01 | Asse di imputazione | **categoria** (due alberi separati entrata/uscita, 4 livelli) | **categoria** (3 livelli) + **codice contabile** | **categoria** piatta (20 voci demo) | **categoria/sottocategoria**, nessun piano dei conti | **piano dei conti v4** (`Account`, mastro/gruppo denormalizzati) + `BudgetCategory` derivata via `AccountBudgetMapping` |
| CLS-02 | Partita doppia vera | no (analitico-gestionale) | **sì**, generata: `entryGroupId`, giornali BQ/VE/AC/OD, quadratura 45/45 | no | **no** (dichiarato) | **sì**: `JournalEntry` dare/avere + `counterpartId` |
| CLS-03 | Distinzione conto economico / patrimoniale | «aree» (OPERATIVA, FINANZIARIA, FISCALE, INVESTIMENTI, EQUITY) | **badge `C/E` vs `STATO PATRIMONIALE`** sulla categoria | mescolati nella stessa lista piatta | — | `AccountType` (RICAVO/COSTO/ATTIVO/PASSIVO) |
| CLS-04 | Seconda dimensione analitica (sede/centro/commessa) | consolidamento multi-entità [FUORI SCALA] | **Analitico**: Centri di costo · Nature · Codici analitici — tutti a 0 [NP] | multi-azienda [NV] | — | **`CostCenter`** (STR/VVB/CAS) su movimenti, chiusure, spese, regole; `CostCenterRule` per conto |
| CLS-05 | Grammatica delle regole automatiche | **povera**: 2 campi (Titolo, Importo), 3 operatori testuali, connettore `E` | **poverissima**: 1 parola chiave sulla descrizione, ambito entrata/uscita, elenco conti [DD] | **ricca**: 10 tipi, 11 campi, **13 operatori incl. regex**, AND/OR, 11 azioni | regola con **più azioni insieme** | `CategorizationRule`: array `keywords`, `direction`, `priority`, azioni `accountId`/`budgetCategoryId`/`autoVerify`/`autoHide` |
| CLS-06 | Suggeritore di regole dai dati | **66 regole già scritte**, con impatto («88 transazioni») e pattern evidenziato | — | — | **`/transactions/proposed-rules`** (keyword mining) | **`GET /api/categorization-rules/proposals`** (raggruppa per controparte/descrizione, soglia ≥2) |
| CLS-07 | Regola creata dal gesto sul dato | — | **selezione del testo dentro la riga** → regola | — | — | **assente** |
| CLS-08 | Esecuzione retroattiva delle regole | domanda aperta | **no per default**, comando «Applica tutte le regole» [DD] | **sì**, con statistiche per regola | — | `POST /api/prima-nota/recategorize`; `POST /api/categorization-rules/test` |
| CLS-09 | Anteprima dell'impatto prima di applicare | **sì** (conteggio + evidenziazione) | [NA] | «testa sempre le regole» [DD], creazione **rotta** (400 su `companyId`) | — | `/api/categorization-rules/test` |
| CLS-10 | Statistiche di esecuzione per regola | — | — | **ultima esecuzione, n. esecuzioni, documenti trovati** | — | **assente** |
| CLS-11 | Ordinamento e risoluzione dei conflitti fra regole | — | trascinamento, **stato vuoto didattico** con esempio | `priority` numerica (default 50), prima corrispondenza vince | — | `priority` int; `ScheduleRule.ordine` con riordino per trascinamento |
| CLS-12 | Dizionario di sinonimi delle controparti | — | `counterparty_name` **nullo** sul percorso italiano [NP] | **`/synonyms`**, con cestino, origine, corrispondenza parziale, **creati come effetto collaterale** | — | **assente** (esiste `payee-suggestions`, che è un'altra cosa: autocompletamento) |
| CLS-13 | Categorizzazione automatica AI | dichiarata; contributo non isolabile [NV] | `categorizationMode: "trezy_ai"` | — | — | **`categorizzaRigheFattura`** (claude-haiku-4-5) sulle **righe fattura**, non sui movimenti |
| CLS-14 | Memoria delle correzioni manuali | «considera le transazioni già categorizzate» | apprendimento sui simili **futuri** [DD] | sinonimi appresi all'approvazione | — | **`SupplierProductAccount`** (fornitore + prodotto → conto), precedenza sull'AI |
| CLS-15 | Imputazione di default sull'anagrafica | — | colonna **CATEGORIA** sul fornitore (mai usata) [NP] | assegnazione automatica cliente/fornitore (tipi 6-7) | — | `Supplier.defaultAccountId`, `Customer.defaultAccountId` |
| CLS-16 | Tasso di categorizzazione come KPI | **barra di progresso, obiettivo 95%**, badge «228 da categorizzare» | contatore «249 da verificare» | — | — | **assente** |

### DOC — Documenti: fatture, acquisizione, righe

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| DOC-01 | Archivio fatture passive | ciclo passivo (modulo separato) [NA] | `/document`, 249 fatture | `/invoices` | `documento` | `ElectronicInvoice` + `/fatture/ricevute` |
| DOC-02 | Archivio fatture attive | ciclo attivo [NA] [FUORI SCALA] | tab «Vendita» a 0 [NP] | sì | sì | `/fatture/emesse` |
| DOC-03 | Acquisizione: upload file | — | PDF/PNG/JPG/XML ≤10 MB | CSV/Excel/**XML/P7M/PDF Cassetto Fiscale** | — | `POST /api/invoices/parse` (XML/P7M), `src/lib/p7m-utils.ts` |
| DOC-04 | Acquisizione: canale email dedicato | — | **`factures-<id>@reply.trezy.io`** | — | — | **assente** |
| DOC-05 | Estrazione dati da documento (OCR/AI) | — | **`ocrv2_primary`**, generativa, con ritentativo su estrazione degenere | — | — | **parser XML deterministico** (`src/lib/sdi/parser.ts`), nessun OCR |
| DOC-06 | Giudizio di affidabilità dell'estrazione | — | **`TRUST`/`REVIEW`** (13/98) — **calcolato e mai mostrato** | — | — | `InvoiceLineAccount.confidence` + `motivazioneAi` (mostrati) |
| DOC-07 | Righe di dettaglio del documento | — | **non estratte** (vuote su 100/100) | — | — | `lineItems` JSON + **`InvoiceLineAccount`** per riga con conto |
| DOC-08 | Imputazione per riga di documento | — | — | — | — | **`PATCH /api/invoices/[id]/righe-conti`**, stato proposta/confermata, «Accetta tutte» |
| DOC-09 | Stato di pagamento derivato dalle rate | — | 4 stati, di cui uno (`unpaid`) senza card | sì | **derivato dalle rate** | derivato: `Schedule.stato` da `importoPagato` |
| DOC-10 | Rate / scadenze multiple per documento | — | — | sì | `flow` 1:N | **`InvoiceDeadline`** 1:N + `Schedule.invoiceDeadlineId` unique |
| DOC-11 | Controllo di plausibilità sul documento in ingresso | — | **nessuno** (fattura di terzi accettata, data futura accettata) | rilevamento duplicati (tipo 8) | — | dedup su `sdiId` unique; nessun controllo su destinatario |
| DOC-12 | Deduplica anagrafiche per partita IVA | — | **non fatta**: chiave = denominazione estratta, 4 schede per 1 P.IVA | unione anagrafiche + sinonimi | — | `Supplier.vatNumber`, `fiscalCodeHash`; nessun merge assistito |
| DOC-13 | Doppio importo per riga (lordo e imponibile) | — | **«€2.135,00 / €1.750 excl.»** | netto e IVA inclusa affiancati | — | `totalAmount` / `netAmount` / `vatAmount` in dettaglio |
| DOC-14 | Analisi prezzi prodotto e variazioni | — | «Analisi prezzi prodotti» (spenta, e senza righe estratte non funzionerebbe) [NP] | — | — | **`Product` + `PriceHistory` + `PriceAlert`** attivo, con `/prodotti` e alert su variazione |
| DOC-15 | Food cost, ricette, inventario | — | **3 beta**: analisi costi ricette · ricette · inventario [NP] | — | — | **assente** |

### SCD — Scadenzario e aging

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| SCD-01 | Elenco scadenze attive e passive | «In attesa» / transazioni attese [NP] | card Pagato/Scaduto/In arrivo | **`/due-schedule`**, due colonne per mese | **`flow`** | `/scadenzario`, `Schedule` (tipo attiva/passiva) |
| SCD-02 | Raggruppamento per mese con scaduto separato | — | — | **«Agosto — Scaduto» e «Agosto — Da Saldare» righe distinte**; mesi passati non collassati | — | raggruppamento per mese, **scaduto non separato** |
| SCD-03 | Aging a fasce | — | **4 fasce cablate** (0-30/30-60/60-90/**90+ aperta**) | 6 mesi mobili | — | **6 fasce** (0-15/15-30/30-60/60-90/90-120/>120), `GET /api/scadenzario/aging` |
| SCD-04 | Anzianità del ritardo sulla riga | — | **badge «Scaduto +117g»** dentro la cella di stato | — | — | **assente** (l'anzianità sta solo nel report aging) |
| SCD-05 | Due date: contrattuale e attesa di cassa | — | «PAGAMENTO PREVISTO» = data di scadenza [?] | — | **`paymentDate` + `expectedPaymentDate`**, riallineata alla riconciliazione | **`dataScadenza` + `dataAttesa`** con riallineamento e `dataAttesaSource` |
| SCD-06 | Stima della data attesa dal comportamento del fornitore | — | **non la stima** (limite dichiarato) | termini dedotti dalle date del documento | — | **mediana dei ritardi del fornitore a 12 mesi**, soglie di applicabilità (≥3 osservazioni, ≥2 giorni) |
| SCD-07 | Pagamenti parziali / acconti | — | [NV] | — | **no**: il residuo diventa una nuova scadenza | **`importoPagato`** + `SchedulePayment` (divergenza deliberata da Sibill) |
| SCD-08 | Controllo di integrità «pagate senza movimento» | — | — | **«Saldate fuori sistema»** (contatore + report + «Correggi Tutte») | — | **assente** |
| SCD-09 | Ricorrenze / rate ricorrenti | «Frequenze» + **rilevamento automatico** | previsione ricorrente [DD] | «rate ricorrenti», rata #N | — | **`Recurrence`** + `Schedule.isRicorrente`, `/scadenzario/ricorrenze`, generazione |
| SCD-10 | Regole sullo scadenzario | — | — | «Termini Pagamento Automatici», «Avvisi Scadenze» | — | **`ScheduleRule`** con azione `crea_riconcilia_movimento`, ordine, centro di costo |
| SCD-11 | Priorità della scadenza | — | — | — | — | **`Schedule.priorita`** (bassa/normale/alta/urgente) + badge |
| SCD-12 | Allegati sulla scadenza | — | il documento **è** l'oggetto | — | — | **`ScheduleAttachment`** |
| SCD-13 | Import scadenzario misto senza documento | — | — | **modalità «Scadenziario»** nell'import fatture | — | **assente** |
| SCD-14 | Termini pattuiti confrontati con l'effettivo | — | — | **report DSO/DPO**: termini · giorni effettivi · differenza · giudizio Migliore/In linea/Peggiore | — | `Supplier.paymentTermsDays` esiste, **nessun confronto** |

### RIC — Riconciliazione

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| RIC-01 | Oggetto della riconciliazione | modulo `treasury_bank_journal` [NA] | **documento ↔ transazione** | **movimento ↔ fattura / rata / estratto carta** | **scadenza ↔ movimento**, mai documento↔movimento | **scadenza ↔ movimento di prima nota** (`ScheduleReconciliation` N:M) + **transazione bancaria ↔ movimento** (`BankTransaction.matchedEntryId`) |
| RIC-02 | Punteggio di confidenza | «score % + soglia auto-match configurabile» [DD] | 6 livelli dichiarati, solo l'importo esatto osservato | **0-100 con 6 fattori** (importo, controparte, data, testo, segno, unicità) | score % | **0-1**, 3 fattori: importo 55% · data 25% · descrizione 20% + bonus 15% n. documento |
| RIC-03 | Motivazioni in chiaro accanto al punteggio | — | — | **«Importo identico», «Unico match possibile», «3 alternative»** | — | **assente** (solo il numero) |
| RIC-04 | Regole di abbinamento dichiarate prima dell'esecuzione | — | — | **tabella R1…R6** mostrata nello stato di attesa | — | **assente** |
| RIC-05 | Alternative esplicite con punteggio ciascuna | — | pulsante «Candidati» [NA] | **«SELEZIONA ABBINAMENTO»**, un punteggio per candidato | proposte ricalcolate | `findScheduleCandidates` / `findEntryCandidates` restituiscono fino a 5 candidati ordinati |
| RIC-06 | Approvazione in blocco dei match sicuri | «accettazione bulk» [DD] | [NA] | **«Approva Tutte le Sicure»** (vuoto sul demo per taratura conservativa) | — | **assente** |
| RIC-07 | Scarto permanente vs scarto singolo | — | — | **«per sempre o solo per questa volta»** | **record `REJECTED`** invece di cancellazione | **`ScheduleReconciliationStatus.REJECTED`** (memoria del rifiuto) |
| RIC-08 | Rilevamento e propagazione dei conflitti | — | — | **triangolo giallo + `supersededCount`** | — | **assente** |
| RIC-09 | Lotti di analisi con storico e ripresa | — | — | **`/api/assisted-reconciliation/batches`**, «Storico Analisi», «Riprendi» | proposte **non persistite** | **non persistite** (ricalcolate, come Sibill) |
| RIC-10 | Riesecuzione iterativa che esclude il già riconciliato | — | — | **dichiarata e prevista** | — | `findEntryCandidates` esclude i già riconciliati con quella scadenza |
| RIC-11 | Match parziale e multi-scadenza | [DD] | [NV] | pagamento parziale non testato | acconti → nuova scadenza | **N:M con `amount` per riconciliazione**, multi-rata accumula |
| RIC-12 | Ereditarietà dell'imputazione alla riconciliazione | — | — | — | il movimento porta la categoria | **ereditarietà pro-quota dalle righe fattura** (`ripartisciProQuota`), fette `origine='ereditata'` |
| RIC-13 | Annullamento della riconciliazione | — | — | — | sì | `DELETE .../riconciliazioni/[id]`: rimuove le fette proprie, ricalcola il conto dominante, ristima `dataAttesa` |
| RIC-14 | Corrispondenza già trovata ma non confermata, segnalata | — | **no**, ed è il difetto: 6.431 € di scaduto apparente | conflitti segnalati | — | **assente** |

### PRV — Previsionale, ricorrenze, scenari

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| PRV-01 | Fonte primaria della previsione | **stima settimanale per categoria** (da Excel) | **previsione manuale per cella** categoria × periodo | **scadenze + rate ricorrenti + fatture** | scadenze | **spese ricorrenti + storico chiusure** (dashboard) e **scadenze** (saldo scalare): due motori diversi |
| PRV-02 | Doppio conteggio previsto/realizzato | **la stima è un tetto: il consuntivo la erode** («Fine settimana» = residuo) | **residuo** = previsione − collegato | il saldo somma anche il futuro (difetto) | — | il saldo scalare somma il **residuo**, non l'importo; `saldiAlGiorno` esclude il futuro |
| PRV-03 | Doppio conteggio fra fonti previsionali diverse | **«disattivare le ricorrenti per un periodo mobile a breve termine»** | `picked`/`pickedSource`: **tre fonti, un arbitro** | — | — | **assente**: spese ricorrenti e scadenze non si escludono a vicenda |
| PRV-04 | Gerarchia di affidabilità delle fonti | **movimento reale > pagamento programmato > ricorrenza stimata** | `pickedSource` (valori non osservati) [NP] | 9 serie separate nel grafico | — | **assente** come concetto; `ConfidenceLevel` esiste su `CashFlowForecastLine` |
| PRV-05 | Le fatture attese entrano nel saldo previsto | [NP] | **no** (`includeInvoices: false`) — limite di prodotto | sì | sì | **sì** via scadenze generate dalle rate fattura |
| PRV-06 | Lo scaduto entra nel previsionale | [NP] | **no** (`lateInvoiceForecast` a zero) | sì | sì | **sì**, `scaduto.saldoFinaleIncluso` |
| PRV-07 | Costruttore di ricorrenze | **frequenze generate dalla data**, in linguaggio naturale | frequenza/giorno/occorrenze [DD] | rate ricorrenti | — | `Recurrence`: frequenza, giorno del mese, giorno della settimana, fine |
| PRV-08 | Ricorrenza ancorata al calendario lavorativo | **«ultimo giorno lavorativo del mese»** + spostamento su giorno non lavorativo | — | — | — | **assente** |
| PRV-09 | Rilevamento automatico delle ricorrenze dai movimenti | **«Frequenze suggerite»** [Beta] | — | — | — | **assente** |
| PRV-10 | Importo previsto dallo storico | **«media degli ultimi 3 periodi»**, unica opzione | «Media personalizzata» [DD] | modelli Retail (media mobile, ponderata, regressione) | — | **HYBRID 60% stesso periodo anno scorso + 40% media per giorno della settimana**, configurabile (`ForecastMethod`) |
| PRV-11 | Stagionalità settimanale (pesi per giorno) | — | — | **`weekdayWeights`** (modulo Retail) | — | **`dayOfWeekAverages`** nella previsione dashboard |
| PRV-12 | Dove cade il flusso dentro il periodo | **«giorno di stima» per categoria** | — | — | — | granularità giornaliera nativa: non si pone |
| PRV-13 | Scenari alternativi | scenari e stress test [NA] | **scenario = copia del piano di lavoro** (riconciliazione per scenario) | — | — | **`CashFlowScenario`** + `ForecastType` (BASE/OTTIMISTICO/PESSIMISTICO/PERSONALIZZATO) |
| PRV-14 | Orizzonte e granularità | giornaliero/settimanale/13 sett./annuale (contestato) | 21 colonne fisse, 10 periodi futuri; giornaliero **rotto** | 7/14/30/60/90 gg, ancora + ampiezza | — | 30 gg (dashboard, max 90) · 90 gg (saldo scalare) · finestra libera (`projection`, max 366) |
| PRV-15 | Selettore di periodo per ancora + durata | preset di periodo | 4 pulsanti di risoluzione | **«PARTE DA» × «DURATA FINESTRA»**, preset «Storico 30gg + Prev. 90gg» | — | slider/`range` semplice |
| PRV-16 | Il previsionale mostra i propri addendi | convenzione `+ − =` nei KPI | campo **`calculation`** in ogni cella | **schede che elencano gli addendi fino alla riga `=`** | — | **`CashFlowSourcePanel`** («Come nasce la previsione», con l'elenco delle spese ricorrenti) |
| PRV-17 | Drill-down dal numero al dettaglio | celle di periodo | **pannello laterale** con transazioni, previsioni, mini-grafico | drill-down su categorie | — | `/report/conto-economico` con drill-down verso la prima nota |
| PRV-18 | Coda di lavoro sulla manutenzione del modello | «Rivedere le regole suggerite» | **«casella di posta delle previsioni»**, 3 code in ordine, si apre da sola | proposte di riconciliazione | — | **assente** |

### SCS — Scostamento previsto/consuntivo

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| SCS-01 | Snapshot storico delle previsioni | **congelamento settimanale automatico** (lun 13:00) | — | **assente in tesoreria** (verificato per esclusione su 173 rotte e 279 endpoint) | — | **assente** |
| SCS-02 | Analisi degli scostamenti | modulo dedicato, distingue l'origine dello scarto [NP] | «Confronta con la previsione» [NP] | **solo nel Retail**: «Varianza Previsione» verde ≤5% / giallo ≤15% / rosso >15% | — | `/budget/confronto` (budget vs consuntivo, non previsione di cassa) |
| SCS-03 | Confine consuntivo/previsione governabile | — | **«ULTIMO PERIODO EFFETTIVO»**: Auto · M-2 · M-3 · M-4 | «Ad oggi» vs «Fine periodo» | — | **assente** |

### KPI — Indicatori, cruscotti, giudizi

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| KPI-01 | Saldo minimo previsto e quando arriva | soglie per conto e per periodo | — | **«Saldo Minimo Previsto — In 8 gg»** + «Punto minimo: … (20 ago)» | — | **`summary.minBalance` + `minBalanceDate` + `daysUntilLowBalance`** (calcolati, resa in UI da verificare) |
| KPI-02 | Giudizio sintetico in linguaggio naturale | — | «Insight aziendale» (break-even) | **«Nessuna tensione prevista»**, «Linea di Credito: Non necessaria», «Acid Test di Cassa» | — | **assente** |
| KPI-03 | Banda di rischio disegnata sul grafico | celle arancioni sotto soglia | — | **«Zona Negativa»** sul Radar di Liquidità | — | **assente** |
| KPI-04 | DSO / DPO / ciclo di cassa | dichiarato [NP] | KPI a **0 giorni** per costruzione (nessuna partita aperta) | **pesato e puro**, con periodo precedente | — | **assente** |
| KPI-05 | Utilizzo del fido | — | — | **in giorni al mese** | — | **assente** |
| KPI-06 | Indicatori personalizzabili con formula | **43 KPI**, gruppi, ordinabili e nascondibili, formule | widget «Formula di categoria» `(A+B)/C` | — | — | **assente** |
| KPI-07 | Indicatori di legge italiani | **Codice della Crisi**: DSCR, indice di liquidità, ROIC, copertura interessi | — | — | — | **assente** |
| KPI-08 | Rendiconto finanziario per aree | **Saldo Area OPERATIVA/FISCALE/… → Cash Flow Mensile** | `cash-flow-statement` (endpoint senza UI) | — | — | **riclassificazione cash flow in 9 famiglie** progettata (`docs/superpowers/plans/2026-08-11`), non implementata |
| KPI-09 | Conto economico | «Analisi Economica» (EBITDA stimato) | **C/E a margini progressivi** (SIG francesi), additività verificata | — | — | **`/report/conto-economico`**, pivot voce × centro di costo, invariante di quadratura testata |
| KPI-10 | Stato patrimoniale | — | **presente e non quadra** (sbilancio = 112% dell'attivo, saldi di apertura assenti) | — | — | **assente** (fuori perimetro dichiarato) |
| KPI-11 | Break-even e punto morto | BEP Finanziario nei KPI | **verificato alla 12ª cifra**, ma su **due basi di ricavo diverse nella stessa schermata** | — | — | **assente** |
| KPI-12 | Valutazione d'impresa | — | multipli pesati, tornado, matrice 2D | — | — | **assente** [FUORI SCALA] |

### RPT — Reportistica, stampe, export

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| RPT-01 | Catalogo di stampe pronte | Smart Report [DD] | — | **11 rotte `/prints/*`** (posizione aperta + analisi) | — | 5 report (`analisi-costi`, `confronto-annuale`, `conto-economico`, `incassi-giornalieri`, `riepilogo-mensile`) |
| RPT-02 | Costruttore di report a widget | — | **`/reporting` BETA**: 9 widget, formula, testo narrativo, tela con annotazioni | — | — | **assente** |
| RPT-03 | Condivisione del report con link | — | `shareToken` + `/share/report/:token` [NV] | — | — | **assente** |
| RPT-04 | Export CSV con BOM UTF-8 | — | [NA] | **sì**, ma separatore decimale `.` contro l'impostazione dell'utente | — | **sì** con BOM (`prima-nota/export`, `scadenzario/export`, `attendance/export/payroll`) |
| RPT-05 | Export Excel con celle numeriche vere | Excel bidirezionale sulle stime | [NA] | **sì**, OOXML regolare | — | `chiusure/[id]/excel`, `schedules/[id]/export/excel` |
| RPT-06 | Export PDF | — | [NA] | Stampa | — | `chiusure/[id]/pdf`, `schedules/[id]/export/pdf`, `ClosurePdfTemplate` |
| RPT-07 | Report schedulati / digest periodici | non osservati [NP] | non osservati | non risultano | — | **assente** |
| RPT-08 | Report di posizione aperta (fatture/movimenti non chiusi) | — | — | `open-invoices`, `open-bank-movements`, `open-creditcard-movements` | — | `/api/reconciliation/summary`, `/api/scadenzario/summary` |

### ALR — Alert, notifiche, comportamenti nel tempo

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| ALR-01 | Soglia di saldo basso | **3 soglie**: scoperto autorizzato · liquidità bassa · **eccedenza di liquidità** | «Balance alerts» per conto, via email, con oggetto e corpo personalizzabili | — | — | **`CashFlowSetting.lowBalanceThreshold`** (5.000 € default) + `CashFlowAlert` |
| ALR-02 | Alert per periodo, non solo globale | **cella arancione per conto e per periodo** | — | — | — | l'alert dice **da quale giorno** (`daysUntilLowBalance`) |
| ALR-03 | Avviso su scadenza in avvicinamento | non osservabile [NP] | non osservato | addon a pagamento (2,99 €/mese) [NA] | — | **`ScheduleReminder` è schema morto**: modello e tipo TS esistono, **nessun consumer runtime**; nessun `NotificationType` per scadenze |
| ALR-04 | Solleciti verso terzi | ciclo attivo [NA] [FUORI SCALA] | — | addon «Promemoria automatici» [NA] | — | **assente** |
| ALR-05 | Centro notifiche in-app | widget novità | **nessuna campanella** | campanello **inerte** | — | `NotificationLog` + `/api/notifications/*`, **solo per personale e presenze** |
| ALR-06 | Notifiche push su dispositivo | — | rotte nel bundle, nessuna UI [NA] | — | — | **VAPID attivo dal 7 ago 2026**, `PushSubscription`, service worker |
| ALR-07 | Ricalcolo automatico nel tempo | da verificare | — | **lo stato `overdue` lo scrive il browser** all'apertura della lista fatture | — | lo scaduto si calcola **al momento della lettura** (confronto date), non è uno stato scritto |

### RET — Punto vendita: incassi, POS, contanti

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| RET-01 | Registrazione incassi giornalieri (chiusura Z) | — | — | **«Incassi Giornalieri»**, lordi per metodo, finalizza/riapri [NA, da guida] | — | **`DailyClosure` + `CashStation`**: corrispettivi, fatture, sospesi, contanti, POS, non scontrinato, fondo cassa |
| RET-02 | Conta fisica del contante | — | — | — | — | **`CashCount`**: 15 tagli banconote e monete, `totalCounted` vs `expectedTotal` vs `difference` |
| RET-03 | Parziali orari e indicatori di attività | — | — | — | — | **`HourlyPartial`**: progressivi scontrini/POS, **contatore caffè**, meteo per fascia |
| RET-04 | Anagrafica operatori POS / acquirer | — | — | **`retailOperators`**: `settlementPolicy`, `feePercentBps`, `feeFixedCents`, `feeMonthly`, conto di accredito [NA] | — | **assente** |
| RET-05 | Accrediti POS attesi calcolati | — | — | **«Accrediti Attesi»**: lordo − commissioni = netto atteso, generati dagli incassi [NA] | — | **assente** |
| RET-06 | Eccezioni sull'accredito | — | — | **6 motivi codificati**: mancante · importo diverso · data diversa · duplicato · commissione cambiata · parziale [NA] | — | **assente** |
| RET-07 | Versamenti contanti in banca con distinta | — | categoria «Versamento contanti» | **«Versamenti Contanti»** con `reference` = numero distinta [NA] | — | trasferimento fra registri (`transferId`), **senza numero di distinta** |
| RET-08 | Riconciliazione retail (banca ↔ incassi/versamenti) | — | — | «il momento della verità», manuale [NA] | — | **assente** |
| RET-09 | Previsione di vendita del punto vendita | — | — | modelli con pesi per giorno + aggiustamenti per evento [NA] | — | previsione entrate dalle chiusure storiche (`/api/dashboard/forecast`) |
| RET-10 | Finalizza / riapri la giornata | — | — | **`finalizedAt` + riapertura** [NA] | — | **`ClosureStatus`** DRAFT → SUBMITTED → VALIDATED, con `/validate`, `/submit` e riapertura |
| RET-11 | Integrazione registratore di cassa | — | — | **annunciata, non consegnata** | — | **assente** |
| RET-12 | Scritture contabili generate dalla chiusura | — | — | — | — | **`closure-journal-entries.ts`**: la validazione della chiusura genera la prima nota |

### FIS — Adempimenti italiani

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| FIS-01 | Aliquota IVA corretta per l'Italia | — | **20% di default** (aliquota francese), 22/10/4/5 assenti | 22% nel modulo fattura ✔ | — | aliquote reali dall'XML SDI; `vatAmount` per movimento |
| FIS-02 | IVA per competenza vs per cassa | serie IVA isolata | **per cassa e per categoria**: «non è un importo da portare in F24» | serie IVA separata, periodicità mensile/trimestrale | — | `vatSummary` per fattura, **nessuna liquidazione** |
| FIS-03 | Liquidazione IVA / F24 | AREA FISCALE **vuota** nell'account | — | addon `f24_facile`, scheda **Deleghe F24** nei movimenti | — | **assente** |
| FIS-04 | Bollettini CBILL / pagoPA | — | — | **scheda dedicata con contatore** | — | **assente** |
| FIS-05 | Ricezione fatture dallo SDI | dichiarata dal sito, **assente dall'API** | connettore **Invopop → SDI** nel bundle, **non renderizzato** [NA] | XML/P7M/PDF cassetto fiscale (import file) | — | **import file** XML/P7M; nessun canale accreditato |
| FIS-06 | Corrispettivi telematici | riferito assente dagli utenti retail | — | — | — | **pagina segnaposto** dichiarata («arriverà con il provider fiscale») |
| FIS-07 | Piano dei conti italiano | categorie configurate a mano (servizio professionale a pagamento) | **«Italia — Personalizzato»** = contenitore vuoto; le scritture usano il PCG francese | piano piatto orientato alla cassa | **nessun piano dei conti** | **piano dei conti v4 WEISS**, mastro/gruppo, `piano-conti-weiss-v4.ts` |
| FIS-08 | Riferimenti ODA / RDA | — | — | **campi sull'ordine**, riportati in fattura | — | `riferimentoDocumento` su `Schedule`, `references` JSON su fattura |

### PLT — Piattaforma: utenti, multi-sede, UX trasversale

| ID | Voce | Agicap | Trezy | Cash King | Sibill | weiss-gestionale |
|---|---|---|---|---|---|---|
| PLT-01 | Modello dei ruoli | **ReBAC su OpenFGA**, 362 relazioni, 24 moduli, 283 scope | **3 ruoli** (Proprietario/Utente/Assistente), **senza matrice dei permessi** | **2 ruoli** (Membro/Amministratore) + `isOwner` | — | **`Role` + `Permission` + `RolePermission`**, ruoli admin/manager/staff, RLS su 80 tabelle |
| PLT-02 | Accesso del commercialista | modulo | ruolo «Assistente» [NV] | **venduto e inesistente** nel modulo di invito | — | **assente** come ruolo dedicato |
| PLT-03 | Multi-azienda / multi-entità | consolidamento [FUORI SCALA] | selettore **`BETA`** | annunciato, non osservabile con un account | — | single-venue per scelta (`src/lib/venue.ts`) |
| PLT-04 | Disaggregazione per sede dentro un'unica entità | **non offerto** (offrono l'opposto) | Centri di costo vuoti [NP] | — | — | **`CostCenter`** STR/VVB/CAS su movimenti, chiusure e report |
| PLT-05 | Ricerca globale / palette comandi | — | ricerca per schermata | **verificato assente** (`cmdk` non nel DOM, 93 rotte) | — | **assente** (cmdk usato solo nelle combobox) |
| PLT-06 | Filtri persistiti nell'URL / viste salvate | — | **URL nudi**, nessuna vista salvata `[ASSENTE]` | filtri per schermata | — | `useSearchParams` in 3 pagine su 71; nessuna vista salvata |
| PLT-07 | Stato vuoto didattico | — | **esempio di conflitto fra regole** nello stato vuoto | **stato di attesa che spiega il motore** (tabella R1-R6) | — | parziale (`CashFlowSourcePanel` spiega la previsione) |
| PLT-08 | Tour guidati e guida in-app | Academy [NA] | **`/academy`** | **4 tour + «Guida Completa» di 88 schermate** | — | **assente** |
| PLT-09 | Mobile | — | **barra a 5 voci**; impostazioni, reporting, categorie e academy **irraggiungibili** | — | — | responsive verificato a 390px; **PWA con offline** (Serwist) |
| PLT-10 | Assistente conversazionale sui propri dati | **Agicap MCP + Assistente AI** (annunciati giugno 2026) [DD] | **«Chiedi a Trezy»**: legge i dati veri, ma **sbaglia una percentuale di 21 punti** | — | — | **assente** (l'AI è usata solo sulle righe fattura) |
| PLT-11 | Registro delle attività / audit | — | — | scheda «Log Attività» | — | **`AuditLog`** |
| PLT-12 | Contatori d'uso trasparenti | — | — | totale · mese corrente · **media mensile** per entità | — | **assente** |

---

## 3. Corrispondenze parziali o dubbie

Sono i punti in cui la mappatura ha richiesto una decisione, ed è dove conviene
guardare per primi: quasi sempre nascondono una differenza di modello, non di
nome.

**3.1 — «Categoria» non è la stessa cosa cinque volte (CLS-01).**
In Agicap le foglie sono **mezzi di pagamento** (Fornitori Italia → SDD /
Bonifici / RIBA), non nature di costo: quel piano non risponde a «quanto ho
speso di materie prime». In Cash King il piano è **piatto** e mescola costi,
voci fiscali e voci finanziarie. In Trezy la categoria porta un **codice
contabile** che la lega al piano dei conti, e un badge C/E vs patrimoniale. In
Sibill la categoria è l'**unico** asse. Da noi l'asse è il **conto del piano
v4** e la categoria di budget si *deriva* (`AccountBudgetMapping`), con
`budgetCategoryId` in pensione dichiarata. Sono cinque oggetti diversi con lo
stesso nome: nella matrice vanno confrontati sul **job** («a cosa imputo»), non
sul termine.

**3.2 — «Riconciliazione» ha tre oggetti diversi (RIC-01).**
Sibill e noi riconciliamo **scadenza ↔ movimento** (il documento entra solo come
contenitore di scadenze). Trezy riconcilia **documento ↔ transazione**. Cash King
riconcilia **movimento ↔ (fattura | rata ricorrente | estratto conto carta)**,
sei regole. La conseguenza è che «esiste la riconciliazione parziale?» ha
risposte non confrontabili finché non si dichiara l'oggetto. Noi abbiamo
**entrambi** i modelli, e questo è un fatto da tenere presente: `BankTransaction`
è staging dell'import e si abbina al movimento, `ScheduleReconciliation` è il
ciclo vero.

**3.3 — «Scaduto» ha due definizioni anche dentro lo stesso prodotto (ALR-07).**
In Cash King è **verificato** che lo stato `overdue` viene scritto dal client
all'apertura della lista fatture, mentre lo scadenzario confronta le date al
momento della lettura: due numeri diversi (51.994 € contro 52.604 €) per la
stessa grandezza. Da noi lo scaduto è **sempre** calcolato al momento della
lettura, quindi il problema strutturalmente non esiste — ma va detto
esplicitamente nella matrice, altrimenti sembra una funzione mancante.

**3.4 — «Data attesa» (SCD-05) è una corrispondenza forte ma con una sfumatura.**
`expectedPaymentDate` di Sibill e `dataAttesa` nostra coincidono nel ruolo. La
colonna «PAGAMENTO PREVISTO» di Trezy **sembra** la stessa cosa e non lo è:
mostra la data di scadenza estratta, mentre il campo *data di pagamento prevista*
esiste ed è nullo su 100 documenti su 100. Marcata `[?]` perché il nome inganna.

**3.5 — «Rilevamento delle ricorrenze» (PRV-09) contro «raggruppamento dei
simili» (MOV-06).** Agicap propone **ricorrenze** («ogni mese, ultimo giorno
lavorativo»); Trezy raggruppa **transazioni identiche** per hash della
descrizione normalizzata. Sono due meccanismi diversi con un'aria di famiglia:
il primo produce previsioni, il secondo produce categorizzazioni di massa. Non
vanno messi sulla stessa riga.

**3.6 — «Scenario» (PRV-13).** In Trezy uno scenario è una **copia del piano di
lavoro**: cambiando scenario cambiano previsioni, collegamenti e stati di
pagamento. Da noi `CashFlowScenario` e `ForecastType` sono varianti di una
previsione salvata. Il termine è lo stesso, il costo di gestione è opposto.

**3.7 — «Centri di costo» (CLS-04 / PLT-04).** Trezy li ha come dimensione
analitica generica (con Nature e Codici analitici accanto), vuota sull'account.
Noi li usiamo per **disaggregare le tre sedi dentro un'unica società** — che è
esattamente l'opposto del consolidamento multi-entità che Agicap vende. Stessa
parola, funzione inversa. È annotato in due voci distinte per non perdere la
differenza.

**3.8 — «Interruttore compilare solo le settimane vuote» (BNK-08).** L'ho
accostato ai modelli di import perché è un accorgimento sull'import, ma non è la
stessa funzione dei `/import/models` di Cash King (che salvano la mappatura
colonne). Corrispondenza **debole**, marcata `[?]`: nella matrice andranno su due
righe.

**3.9 — `payee-suggestions` non è un dizionario di sinonimi (CLS-12).** Nostro
endpoint che autocompleta il campo «Pagato a» delle uscite di cassa unendo
fornitori attivi e beneficiari storici. Utile, ma non risolve il problema che i
sinonimi risolvono — riconoscere che «GREEN ENERGY COOP SOC COOP A RL» e «Green
Energy Coop» sono lo stesso soggetto durante l'abbinamento. Sono cose diverse e
vanno tenute separate.

**3.10 — Due motori previsionali da noi (PRV-01).** `/api/dashboard/forecast`
proietta da **spese ricorrenti + storico chiusure**; `/api/scadenzario/saldo-scalare`
proietta dalle **scadenze**; `/api/cashflow/projection` disegna la curva del
saldo dai **movimenti già registrati**. Tre risposte alla domanda «quanti soldi
avrò», con basi diverse — che è precisamente il difetto rilevato in Cash King
(tre valori per lo stesso saldo). Va portato in matrice come voce nostra, non
come lacuna dei concorrenti.

---

## 4. Cosa la tassonomia esclude, e perché

Voci emerse nei documenti sorgente ma **non** portate in matrice, in coerenza
con il filtro di scala del § Fase 4 del metodo. Ciascuna resta recuperabile se
il committente dissente.

| Voce | Fonte | Motivo dell'esclusione |
|---|---|---|
| Cash pooling, finanziamento infragruppo | Agicap | struttura di gruppo assente: WEISS è una società sola |
| Consolidamento multi-entità | Agicap, Trezy | ci serve l'opposto (disaggregare per sede): coperto da `PLT-04` |
| Multi-valuta e rischio di cambio | Agicap, Trezy (59 valute) | tutto in euro |
| Gestione del debito, covenant, DSCR, PFN/EBITDA | Agicap | nessun covenant bancario; il DSCR resta in `KPI-07` solo come indicatore di legge |
| Modulo crediti: DSO, solleciti, portale cliente, anticipo fatture | Agicap | strutturalmente inapplicabile a chi incassa alla consumazione. `KPI-04` resta per il **DPO**, che invece ci riguarda |
| `cashBooster` / `factoringMarketplace` | Trezy | intermediazione finanziaria, fuori perimetro |
| Valutazione d'impresa, multipli, DCF | Trezy | tenuta come `KPI-12` marcata [FUORI SCALA] perché il committente la veda esclusa esplicitamente |
| Note spese e carte aziendali | Agicap | non esiste il processo |
| Integrazione ERP / connettori contabili esteri (Pennylane, QuickBooks) | Trezy | irrilevanti in Italia |
| Programma referral, academy come prodotto | Trezy | non è software di tesoreria |

---

## 5. Convenzioni per i documenti successivi

- **Denominatore dichiarato sempre.** Ogni riga della matrice porterà la
  convergenza nella forma `n/m tra i verificabili (X non accessibile)`. Mai
  `n/4` se il denominatore reale è 3.
- **Le lacune non contano come assenze.** `[NA]`, `[NP]`, `[NV]` escono dal
  denominatore; `[ASSENTE]` (verifica positiva) ci resta.
- **Sibill si marca `[SIBILL DA RIVERIFICARE]`** ogni volta che una funzione è
  presente nei tre prodotti osservati ora e assente nella nostra ricostruzione:
  il reverse engineering è precedente e il prodotto può essere evoluto.
- **Le celle di weiss-gestionale citano il file.** Ogni affermazione sul nostro
  prodotto rimanda a un path del repo, così che la riga sia verificabile senza
  riaprire il codice.

---

## 6. Numeri

| | |
|---|---|
| Aree | 14 |
| Voci di tassonomia | **159** |
| Voci in cui il gestionale ha un corrispettivo (anche parziale) | 107 |
| Voci in cui il gestionale è vuoto o ha schema morto | 52 |
| Corrispondenze parziali o dubbie segnalate | 10 |
| Voci escluse per scala | 10 |

Distribuzione per area: `PRV` 18 · `CLS` 16 · `DOC` 15 · `SCD` 14 · `RIC` 14 ·
`KPI` 12 · `RET` 12 · `PLT` 12 · `MOV` 11 · `BNK` 9 · `RPT` 8 · `FIS` 8 ·
`ALR` 7 · `SCS` 3.

I 52 «vuoti» **non sono 52 gap**: molti sono deliberati (stato patrimoniale,
valutazione d'impresa), altri sono coperti diversamente (l'aging inline di Trezy
contro il nostro report aging a 6 fasce). La separazione fra 🔴 e ⚪ è lavoro
della matrice, non della tassonomia.
