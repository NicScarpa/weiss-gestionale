# Agicap — integrazioni, connessioni bancarie e API

Analisi competitiva per WEISS S.r.l. — capitolo integrazioni.
Data della ricerca: **11 agosto 2026**. Tutte le fonti sono pubbliche e consultate senza autenticazione.

## Fonti consultate

| # | Fonte | URL | Natura |
|---|---|---|---|
| F1 | Catalogo integrazioni, locale italiano | `https://agicap.com/it/le-nostre-integrazioni/` | pagina commerciale |
| F2 | Payload Contentful della griglia integrazioni | `https://agicap.com/page-data/it/le-nostre-integrazioni/page-data.json` e `https://agicap.com/page-data/sq/d/{169707088,1775559011,925620795}.json` | dati strutturati dietro F1 |
| F3 | Prodotto "Connettività bancaria & ERP" | `https://agicap.com/it/prodotti/comunicazione-bancaria/` | pagina commerciale + FAQ tecnica |
| F4 | Prodotto "Pagamenti" | `https://agicap.com/it/prodotti/pagamenti/` | pagina commerciale + FAQ tecnica |
| F5 | Funzionalità "Metodi di pagamento" (Payment Factory) | `https://agicap.com/it/funzionalita/metodi-di-pagamento/` | pagina commerciale + FAQ |
| F6 | Funzionalità "MCP Server" | `https://agicap.com/it/funzionalita/mcp-server/` | pagina commerciale + FAQ |
| F7 | Funzionalità "Solleciti di pagamento" | `https://agicap.com/it/funzionalita/solleciti-di-pagamento/` | pagina commerciale + FAQ |
| F8 | Scheda integrazione Fatture in Cloud | `https://agicap.com/it/le-nostre-integrazioni/fatture-in-cloud/` | pagina commerciale |
| F9 | Articolo "Quale software per fattura elettronica scegliere" | `https://agicap.com/it/articolo/software-fattura-elettronica/` | contenuto editoriale/SEO |
| F10 | **Portale sviluppatori — elenco API** | `https://api.agicap.com/apis` e il suo backend `https://api.agicap.com/portal-api/apis` | contratto tecnico |
| F11 | **Specifiche OpenAPI complete, 19 documenti** | `https://api.agicap.com/portal-api/apis/{apiId}/schema` | contratto tecnico |
| F12 | Guida PDF "API User Guide - Bank Journal" | `https://api.agicap.com/treasury-bank-journal/detailed_documentation.pdf` | documentazione tecnica |
| F13 | API legacy deprecata (ancora servita) | `https://openapi.agicap.com/docs/index.html` e `https://openapi.agicap.com/swagger/v1/swagger.json` | contratto tecnico |
| F14 | Trust Center | `https://trust.agicap.com/` | compliance |
| F15 | Politica di riservatezza italiana | `https://agicap.com/it/politica-di-riservatezza/` | legale |
| F16 | Salt Edge — scheda cliente Agicap e comunicato | `https://www.saltedge.com/company/success_stories/agicap`, `https://blog.saltedge.com/agicap-digitalise-cash-flow-management/` (27 ottobre 2020) | fornitore terzo |
| F17 | Powens — customer story Agicap | `https://www.powens.com/customer-stories/agicap/` (17 ottobre 2022) | fornitore terzo |
| F18 | robots.txt e sitemap italiana | `https://agicap.com/robots.txt`, `https://agicap.com/sitemap-IT.xml` (642 URL) | tecnica |

I testi grezzi sono in `assets/agicap/materiali-pubblici/integrazioni-*.md`; le 19 specifiche OpenAPI in formato originale sono in `assets/agicap/api-traces/openapi-specs/`.

**Convenzioni di marcatura.** `[OSSERVATO]` = letto direttamente sulla fonte citata. `[DA DOCUMENTAZIONE]` = dichiarato da Agicap ma non verificabile nel prodotto senza un account. `[DEDOTTO]` = inferenza da più fatti osservati. `[IPOTESI]` = congettura esplicita.

---

## Sintesi

Il risultato più importante di questa ricerca è che **Agicap pubblica in chiaro, senza autenticazione, le specifiche OpenAPI complete di 18 prodotti API**. È la via più diretta al loro modello dati, ed è documentata nel dettaglio nella sezione 5.

Il secondo risultato è che **il catalogo bancario italiano è pubblico ma è una vetrina, non un catalogo**: 14 loghi con la dicitura "E molto altro", nessuna pagina che elenchi le banche supportate una per una.

Il terzo è una contraddizione da tenere presente: **il sito italiano dichiara l'integrazione con lo SDI, l'API pubblica non ne ha traccia** — l'API E-Invoicing di Agicap è costruita per la riforma francese e belga (sezione 2).

---

## 1. Connessioni bancarie

### 1.1 Catalogo delle banche italiane

**Non esiste una pagina "banche supportate" consultabile pubblicamente** `[OSSERVATO]`. Quello che esiste è una griglia di loghi filtrabile per categoria (`Tutte` / `Banca` / `ERP & Contabilità` / `PSP` / `Altro`) sulla pagina F1, che si chiude con l'etichetta **"E molto altro"** e con tre vie di fuga esplicite: matrici personalizzate, Open API, SFTP.

Le voci con logo di banca mostrate sul locale italiano sono **14** `[OSSERVATO su F1/F2]`:

| Istituto | Note |
|---|---|
| Intesa Sanpaolo | |
| UniCredit | |
| Banco BPM | |
| Banca Monte dei Paschi di Siena (MPS) | |
| BPER Banca | |
| Banca Popolare di Sondrio | |
| Banca Sella | |
| Banco Desio | |
| Credem | |
| Poste Italiane | |
| Qonto | neobanca (Francia), opera in Italia |
| Revolut | neobanca, opera in Italia |
| Volksbank | nel CMS è raggruppata con gli istituti tedeschi; in Italia il marchio corrisponde a Banca Popolare dell'Alto Adige `[IPOTESI]` — la pagina non disambigua |
| Crédit Agricole | nel CMS è raggruppata con gli istituti francesi; in Italia esiste Crédit Agricole Italia `[IPOTESI]` — la pagina non disambigua |

Il payload Contentful dietro la griglia (F2) contiene **73 voci** in categoria `Bank` sommando tutti i mercati Agicap (FR, DE, ES, UK, US, IT) — comprese cinque etichette segnaposto ("E molto altro" e le sue traduzioni) classificate per errore come banche. Le 14 sopra sono quelle che il locale italiano espone.

**Interpretazione.** Le 14 voci sono un campione commerciale, non una copertura. Un catalogo di aggregazione PSD2 vero ha centinaia di istituti italiani; qui mancano completamente le BCC, Banca Popolare di Bari, Banca Ifis, Illimity, Fineco, Widiba, N26, e in generale tutto il tessuto delle popolari e delle banche di credito cooperativo che serve la maggior parte delle PMI italiane. Questo **non significa** che non siano supportate: significa che Agicap non lo dichiara pubblicamente e che l'unica risposta certa passa da un contatto commerciale `[DEDOTTO]`.

### 1.2 Tecnologia dichiarata

La FAQ di F3 è la fonte più precisa e merita di essere letta per intero. Elenca sei canali `[OSSERVATO su F3]`:

| Canale | Ambito dichiarato da Agicap | Citazione |
|---|---|---|
| **CBI** (Corporate Banking Interbancario) | "Mercato italiano" | "Infrastruttura di rete che interconnette gli istituti operanti in Italia... permette alle aziende di accentrare la ricezione dei flussi transazionali e l'invio delle disposizioni" |
| **SWIFT** | Rete globale | "oltre 10.000 istituti in più di 200 Paesi... formati MT e MX" |
| **H2H** (Host-to-Host) | Universale | "Canale di connessione diretta e cifrata tra i server aziendali e la banca... richiedendo un'implementazione dedicata per ciascuna banca" |
| **AFT/SFTP** | Universale | "Opzione alternativa rispetto ad Host-to-Host, disponibile qualora non fosse possibile integrarsi direttamente con i server della banca" |
| **EBICS** | "Area DACH e Francia" | "ampiamente diffuso in Francia, Germania, Austria e Svizzera" |
| **BACS ed EDITRAN** | Mercati locali | "EDITRAN è il protocollo di riferimento in Spagna. BACS... è specifico del Regno Unito ma solo per l'esecuzione dei pagamenti" |

**Il dettaglio decisivo:** in tutta la pagina F3 — 198 righe di testo, comprese quattro FAQ tecniche dedicate alla connettività — **l'open banking compare una volta sola, e per il Regno Unito**: "per l'aggregazione dei dati bancari in UK, Agicap utilizza AFT/H2H, SWIFT oppure Open Banking" `[OSSERVATO]`. Sull'Italia, la parola non compare. Il canale italiano che Agicap nomina è **CBI**, non PSD2.

Questo è coerente con il posizionamento: F3 e F4 parlano a gruppi con "panel bancario" multiplo, holding, cash pooling, EBICS TS con firma elettronica rafforzata. Un canale CBI o H2H richiede un contratto e un onboarding con ciascuna banca — è infrastruttura da media impresa in su, non l'autoconnessione in tre click `[DEDOTTO]`.

Che l'open banking esista comunque nel prodotto è però certo, e lo dice l'API: la descrizione di `banking-documents-v1` avverte `[OSSERVATO su F11]`:

> ⚠️ This API cannot be used to export banking data that is retrieved in Agicap via an **Open Banking / PSD2 connection**.

e, sul canale a file:

> Agicap synchronizes your bank files with **EBICS, EDITRAN, SWIFT or Host to Host** protocol.

Ne segue una conclusione operativa: in Agicap esistono **due mondi separati** — le connessioni PSD2 (dati grezzi, non esportabili via API) e le connessioni a file/protocollo (dati esportabili) `[DEDOTTO]`.

**Chi fornisce l'aggregazione PSD2.** Agicap non lo dice da nessuna parte: F15 elenca i subappaltatori solo per categoria merceologica, senza nomi, e F14 espone le certificazioni (Pentest Intercert, ISO 27001:2022, SOC 2 Type 2 "in completamento", 82 controlli) ma non i sub-processor `[OSSERVATO]`. Due fornitori si dichiarano invece pubblicamente:

- **Salt Edge** — scheda cliente e comunicato del **27 ottobre 2020** (F16): prodotti "Data Aggregation, Data Enrichment", "access to bank accounts data of more than 5000 banks in 50+ countries". Il comunicato colloca l'Italia fra i mercati ancora da aprire: "planning to cover other European markets, such as Italy and Spain".
- **Powens** (ex Budget Insight) — customer story del **17 ottobre 2022** (F17): "With Powens' Bank product, Agicap automatically collects its customers bank transactions, invoices and account balances", 11 paesi europei nel 2022, Italia non menzionata.

`[DEDOTTO]` Agicap ha usato o usa entrambi. Quale dei due copra oggi l'Italia, e con quale profondità, non è determinabile pubblicamente.

### 1.3 Frequenza di aggiornamento di saldi e movimenti

**Non dichiarata in nessun punto** `[OSSERVATO]`. Le pagine commerciali usano "in tempo reale" (F3, F6, la pagina tesoreria) e "quotidianamente" una volta sola, in una FAQ di F3 sul flusso inbound: "Il software intercetta **quotidianamente** gli estratti conto tramite i protocolli attivi (CBI, SWIFT, H2H)". Nessun SLA, nessuna cadenza di polling, nessun numero.

`[DEDOTTO]` Il vocabolario è coerente con la tecnologia: un canale a file bancario (CBI, CAMT.053, MT940) produce per costruzione un estratto conto **giornaliero**, non un flusso continuo. "Tempo reale" nel materiale Agicap si riferisce alla propagazione interna del dato una volta acquisito, non alla frequenza di acquisizione dalla banca.

### 1.4 Riautenticazione periodica PSD2 (SCA a 90/180 giorni)

**Nessuna fonte pubblica affronta il tema** `[OSSERVATO]`. Non compare nelle pagine prodotto, non compare nelle FAQ, non compare nelle specifiche OpenAPI (che sull'open banking dicono solo che i suoi dati non sono esportabili). Il Centro assistenza esiste — è citato in `https://agicap.com/it/supporto/` — ma non è raggiungibile a un URL pubblico: `help.agicap.com` risponde 404 e `support.agicap.com` non risolve `[OSSERVATO]`.

Questo è un buco significativo per il confronto, perché la riautenticazione SCA è esattamente il punto in cui l'esperienza utente di un aggregatore si rompe.

### 1.5 Formati di import accettati

Qui la documentazione tecnica è invece esplicita e verificabile. `banking-documents-v1` dichiara, per l'endpoint `POST .../connections/{connectionId}/files` `[OSSERVATO su F11]`:

> **Supported File Formats** — Bank files: **CAMT.053, CAMT.052, N43, CFONB120, MT940, CBI, BAI2**. ZIP files: containing multiple bank files.

| Formato | Origine | Rilevante per l'Italia |
|---|---|---|
| **CBI** | standard italiano | **sì, direttamente** |
| CAMT.053 | ISO 20022, estratto conto di fine giornata | sì |
| CAMT.052 | ISO 20022, movimenti infragiornalieri | sì |
| MT940 | SWIFT, estratto conto | sì |
| BAI2 | standard USA | no |
| N43 | standard spagnolo (Norma 43) | no |
| CFONB120 | standard francese | no |

**Assenti dall'elenco: CSV, XLS/XLSX, OFX, QIF, MT942.** Nella pagina F1 l'import di file arbitrari è offerto come percorso separato — "Usa le **matrici personalizzate**: possiamo integrarci a qualsiasi strumento in due click" — e l'API legacy (F13) conferma che esiste un endpoint `POST /api/imports/matrix` per "import a new data file" con entità `MatrixImportDto {id, filename}` `[OSSERVATO]`. Il formato accettato da quel canale non è documentato pubblicamente.

Sull'export, il formato restituito è quello di ingresso: "The format of the downloaded file will match the format of the imported file" `[OSSERVATO su F11]`. Agicap deduplica gli estratti conto e li marca (`IsDuplicate`, parametro `includeDuplicates`) — un dettaglio di prodotto onesto, che segnala che il doppio import capita.

---

## 2. Fatturazione elettronica italiana (SDI / FatturaPA)

Su questo punto le fonti si contraddicono, e la contraddizione è utile.

### Cosa dice il sito italiano

L'articolo F9 (contenuto editoriale, dichiara di riportare informazioni "tratte dai siti dei fornitori nel luglio 2025") inserisce Agicap in una tabella comparativa di software di fatturazione elettronica accanto a Fatture in Cloud, Danea Easyfatt, Aruba, Legalinvoice, e afferma `[OSSERVATO, DA DOCUMENTAZIONE]`:

> "Si integra con il **Sistema di Interscambio** per l'invio e la raccolta automatica delle fatture, e garantisce conformità alla normativa"

> "agevola le aziende nella creazione e nella ricezione delle fatture elettroniche. E le invia, anche, grazie all'integrazione con il **Sistema di Interscambio (SDI)**"

> "ogni fattura viene archiviata in digitale – e in automatico – come richiesto dalla normativa italiana... non servirà più preoccuparsi della **conservazione sostitutiva**... perché con Agicap sarà automatica"

Lo stesso articolo però intitola la sezione **"Agicap non è un software di fatturazione elettronica. È molto di più"**.

### Cosa dice l'API

Agicap ha un prodotto API chiamato **E-Invoicing** (`einvoicing-v1`, lifecycle *stable*, "Manage e-invoicing flows"). I suoi tipi enumerati sono inequivocabili `[OSSERVATO su F11]`:

```
ValidationCountry = ['FR', 'BE']
FlowProfile       = ['Basic', 'CIUS', 'Extended-CTC-FR']
FlowSyntax        = ['CII', 'UBL', 'Factur-X', 'CDAR', 'FRR', 'PEPPOL_BIS_3.0', 'JsonInvoice', 'JsonLifecycle']
FlowType          = ['CustomerInvoice', 'SupplierInvoice', 'CustomerInvoiceLC', 'SupplierInvoiceLC',
                     'TransactionReport', 'PaymentReport', 'AggregatedMultiflowReport']
ProcessingRule    = ['B2B', 'B2BInt', 'B2C']
```

`Extended-CTC-FR`, `Factur-X`, `FRR`, l'endpoint `POST /e-reportings/b2c-transactions`: è l'architettura della riforma francese della fatturazione elettronica (e-invoicing + e-reporting), estesa al Belgio. **Il paese di validazione ammette due valori, e nessuno dei due è l'Italia.**

Inoltre, su tutte le 19 specifiche OpenAPI scaricate: **zero occorrenze** di `FatturaPA`, `SDI`, `Sistema di Interscambio`, `codice destinatario`, `Italy`, `Italia` `[OSSERVATO]`. L'unico campo che potrebbe ospitare un identificativo italiano è generico, in `ar-clients-v1`:

```json
"electronicInvoicingAddress": {
  "description": "Address used for electronic invoicing (Chorus Pro, Peppol, etc.)",
  "example": "83486222100034"
}
```

L'esempio è un SIRET francese a 14 cifre, non un codice destinatario italiano a 7 caratteri. Il campo accetta 256 caratteri, quindi ci starebbe — ma nessuna semantica italiana è dichiarata.

### Lettura

`[DEDOTTO]` Tre spiegazioni sono compatibili con le fonti, in ordine di plausibilità:

1. **L'integrazione SDI passa da un intermediario, non da Agicap.** Agicap si collega a gestionali italiani che già dialogano con lo SDI (Fatture in Cloud, TeamSystem, Sistemi, Passepartout) e riceve da loro le fatture già transitate. L'articolo F9 comprime questo in "si integra con lo SDI". Questa lettura è la più coerente con la scheda F8 su Fatture in Cloud e con l'assenza totale di FatturaPA nell'API.
2. **Esiste un canale SDI di prodotto non esposto via API pubblica.** Possibile ma non documentato in nessuna fonte pubblica.
3. **L'articolo è impreciso** — è contenuto SEO, non documentazione.

In ogni caso: **nessuna fonte pubblica dimostra che Agicap sia un intermediario SDI accreditato per l'Italia**, e l'unica infrastruttura di fatturazione elettronica che Agicap documenta tecnicamente è francese e belga `[OSSERVATO]`.

### Import di fatture attive e passive

Qui il prodotto è invece ben documentato, e non dipende dallo SDI. Tre API distinte `[OSSERVATO su F11]`:

- **`business-documents-v2`** (beta) — 19 path, sincronizzazione bidirezionale con il gestionale: `client-invoices`, `client-credit-notes`, `client-quotes`, `proforma-invoices`, `sales-orders`, `purchase-orders`, `supplier-invoices`, `supplier-credit-notes`, `delivery-notes`. Ogni tipo ha GET/POST/PUT più `attach-readable` / `unattach-readable` per allegare il PDF leggibile.
- **`invoices-management-v1`** (Purchase-to-Pay, stable) — `GET /inbox/documents` restituisce i documenti riconosciuti dall'OCR con `extension ∈ {Jpg, Pdf, Png, Xml, Unknown}` e `type ∈ {Invoice, CreditNote, PurchaseOrder, Delivery}`. C'è quindi un **inbox con riconoscimento automatico** dei documenti caricati.
- **`einvoicing-v1`** — i flussi FR/BE di cui sopra.

L'import è quindi **automatico via connettore ERP o via API, e assistito da OCR per i documenti caricati a mano** `[DA DOCUMENTAZIONE]`.

---

## 3. Gestionali, ERP e software contabili integrati

Agicap dichiara **"Più di 400 ERP integrati"** su F3 `[DA DOCUMENTAZIONE]` — cifra non verificabile e non accompagnata da un elenco. Il catalogo pubblico (F1/F2) ne mostra 41 sommando tutti i mercati, di cui **22 sul locale italiano**.

### 3.1 Integrazioni rilevanti per il mercato italiano

| Prodotto | Fornitore | Segmento | Rilevanza per WEISS |
|---|---|---|---|
| **Fatture in Cloud** | TeamSystem | micro/PMI | **alta** — non è nella griglia, ma ha una scheda dedicata (F8); vedi sotto |
| TeamSystem – Alyante | TeamSystem | PMI/media impresa | media |
| TeamSystem – Gamma Enterprise | TeamSystem | media impresa | bassa |
| Sistemi – eSolver | Sistemi | media impresa | bassa |
| Sistemi – PROFIS | Sistemi | studi commercialisti | media — è il software del commercialista |
| Passepartout – Mexal | Passepartout | PMI | media |
| Wolters Kluwer – Arca Evolution | Wolters Kluwer | PMI | media |
| Datev Koinos | DATEV | studi commercialisti | media |
| NTS – Business Cube | NTS Informatica | PMI | bassa |
| Sanmarco Informatica – Jgalileo | Sanmarco Informatica | media impresa | bassa |
| Centro Software – SAM ERP2 | Centro Software | manifattura | bassa |
| Panthera | Panthera (Formula) | media impresa | bassa |

### 3.2 Integrazioni fuori scala

| Prodotto | Marcatura |
|---|---|
| SAP S/4HANA | `[FUORI SCALA]` |
| SAP Business One | `[FUORI SCALA]` |
| Oracle NetSuite | `[FUORI SCALA]` |
| Oracle – JD Edwards | `[FUORI SCALA]` |
| Microsoft Dynamics 365 Business Central | `[FUORI SCALA]` |
| Microsoft Dynamics Navision | `[FUORI SCALA]` |
| Sage X3 | `[FUORI SCALA]` |
| IBM – AS400 | `[FUORI SCALA]` |
| (sugli altri mercati) Workday, Acumatica, Sage Intacct, Sage FRP1000, Cegid XRP Flex | `[FUORI SCALA]` |

### 3.3 Altre categorie

- **PSP**: Stripe, PayPal, Adyen, Payplug, Payoneer (scritto "Payoneeer" sulla pagina) `[OSSERVATO]`.
- **Altro**: Sharepoint, Google Sheet, Drive, Excel `[OSSERVATO]`.
- **Fuori dal locale italiano** ma nel catalogo globale: Xero, QuickBooks, Odoo, Pennylane, Holded, Zoho Books, Weclapp, Billomat, EBP, ACD, Cegid Quadra, Sage 50/100/200, Datev, A3erp, Bill.

### 3.4 La scheda Fatture in Cloud

Fatture in Cloud **non compare nella griglia** delle 45 voci del locale italiano, ma ha una pagina propria, presente nella sitemap italiana: `https://agicap.com/it/le-nostre-integrazioni/fatture-in-cloud/` (F8) `[OSSERVATO]`. Le sole altre integrazioni con scheda dedicata sul locale italiano sono Oracle NetSuite e Odoo, entrambe raggiungibili dal link "Per saperne di più" nella griglia.

Quello che la scheda dichiara di sincronizzare `[OSSERVATO, DA DOCUMENTAZIONE]`:

> "Visualizzare in tempo reale l'impatto delle fatture emesse e ricevute **in sospeso** sul tuo flusso di cassa"
> "Tenere traccia delle fatture dei clienti **scadute**"
> "Le previsioni sono affidabili grazie all'integrazione automatica dei **preventivi**"

Quindi: fatture attive, fatture passive, scadenze, preventivi → previsionale di cassa. È esattamente il ponte che serve a una PMI italiana che fattura con Fatture in Cloud.

### 3.5 Le tre vie di fuga

Quando l'integrazione non c'è, F1 propone tre alternative `[OSSERVATO]`:

1. **Matrici personalizzate** — "Possiamo integrarci a qualsiasi strumento in due click" (in realtà: import di file su tracciato mappato, cfr. `POST /api/imports/matrix` dell'API legacy).
2. **Open API** — con link a `https://openapi.agicap.com/docs/index.html`.
3. **SFTP** — "puoi importare tutti i tuoi dati".

Da notare: il link "Vedi la documentazione" della pagina italiana **punta ancora all'API deprecata**, che nella sua stessa specifica si dichiara "deprecated and will be removed in early 2025" `[OSSERVATO su F13]`. Ad agosto 2026 è ancora servita, ma il sito commerciale non è stato aggiornato al nuovo portale.

---

## 4. Pagamenti in uscita

**Sì, Agicap genera e trasmette disposizioni di pagamento** — è un modulo di prodotto a sé, la *Payment Factory* `[OSSERVATO su F4/F5]`.

### Cosa dichiara

| Aspetto | Dichiarazione |
|---|---|
| Protocolli di invio | "Esegui i tuoi pagamenti utilizzando i protocolli più sicuri sul mercato: **CBI, H2H, SWIFT**" (F5); "le disposizioni di pagamento vengono veicolate tramite canali protetti H2H o, nei mercati compatibili, sistemi evoluti con firma elettronica rafforzata come **EBICS TS**" (F3) |
| Formati | "Genera i tuoi file di pagamento nei formati e nelle valute richiesti, in conformità con lo standard **ISO 20022**" (F5) |
| Tipi di pagamento | "fornitori, stipendi, giroconti interni" (F5); l'API aggiunge "or even **requesting debits from clients**" (F11) |
| Conferme bancarie | "**Gestione del PSR** — Ricevi tutti i livelli di conferma supportati dalla tua banca direttamente in Agicap" (F5) |
| Sicurezza | matrici di firma configurabili, firma singola/doppia, controfirma per importi elevati, convalida da app mobile, token **SWIFT 3SKey**, MFA, controlli automatici dell'IBAN, RBAC con separazione preparazione/validazione/firma, storico delle firme, notifiche sulle modifiche ai beneficiari (F3, F4, F5) |

### Serve un contratto aggiuntivo?

**Sì, e l'API lo dice esplicitamente** `[OSSERVATO su F11, descrizione di `payments-v2`]`:

> **Activate the right modules** — For routing use case, you need to activate a payment solution on your entity. **Contact your Account Manager** to activate the appropriate payment solution for your Agicap entities. *Note that this API is not compatible with all payment solutions.*
>
> **Set up your payment solution. Work with Agicap's team to:** 1. Establish connections with your banks. 2. Create and link your bank accounts to these connections.

Quindi: modulo a contratto, onboarding assistito, e un setup bancario per ciascuna banca `[OSSERVATO]`. Non è una funzione che si attiva da sé.

### Cosa espone l'API dei pagamenti

`payments-v2` (stable) copre due casi d'uso, e nessuno dei due è "crea un bonifico" `[OSSERVATO]`:

- **Anagrafica beneficiari**: CRUD + `POST /Beneficiaries/sync` per l'upsert massivo con chiave `erpId`. Campi del beneficiario: `name`, `bankAccount {bankName, bic, country, identifier, intermediaryBankBic, localClearingCode}`, `postalAddress`, `companyLegalId`, `supplierErpIds[]`. Stati: `validationStatus ∈ {Validated, PendingValidation}` e `uncertaintyStatus ∈ {Uncertain, NotUncertain, Irrelevant}` — c'è un motore di sospetto sui beneficiari.
- **Routing di file di pagamento**: `POST /payments-files/import` e `/payments-files/secured-import` (quest'ultimo "with signed beneficiaries"), più gli alias `/remittances/import` e `/remittances/secured-import`. "This API enables you to route them into Agicap **in any standard banking format**. Once imported, the files are processed and sent to the bank **without any modifications**. Supported Formats: the API supports all standard banking formats in `.xml` and `.txt`".

`[DEDOTTO]` L'API non permette di **comporre** un pagamento: permette di **instradare** un file già generato altrove, o di tenere allineata l'anagrafica dei beneficiari. La composizione della distinta resta nell'interfaccia Agicap.

---

## 5. API pubblica

### 5.1 Dove si trova e quanto è aperta

**Portale sviluppatori: `https://api.agicap.com/apis`** (SPA React). Il portale ha rotte `/apis`, `/api-details/:apiId`, `/guides`, `/guides/:guideId`, `/api-keys`, `/usage-plans`, `/login`.

Il fatto rilevante: il backend del portale, `https://api.agicap.com/portal-api/`, **risponde senza autenticazione** su due endpoint `[OSSERVATO]`:

- `GET /portal-api/apis` → catalogo completo dei 18 prodotti API con descrizioni integrali (34 KB di JSON)
- `GET /portal-api/apis/{apiId}/schema` → **la specifica OpenAPI 3 completa** di ciascun prodotto

Sono state scaricate tutte e 19 le specifiche (18 prodotti, `business-documents` in due versioni), per un totale di ~800 KB. `GET /portal-api/usage-plans` risponde `[]`. Le **guide** (`/guides/introduction`, `/guides/authentication`) non sono servite dal backend pubblico e risultano quindi dietro login `[OSSERVATO]`.

Esiste inoltre una guida PDF liberamente scaricabile: `https://api.agicap.com/treasury-bank-journal/detailed_documentation.pdf` (F12).

### 5.2 Autenticazione

`[OSSERVATO su F11 (`auth-v1`) e F12]`

```
POST https://api.agicap.com/public/auth/v1/token
Content-Type: application/x-www-form-urlencoded

client_id=...&client_secret=...&grant_type=client_credentials&scope=agicap:public-api
→ { access_token, token_type, expires_in, scope }
```

- **OAuth2 client credentials**. La specifica precisa: "must be `client_credentials`, `authorization_code` is not yet supported".
- Scope unico osservato su tutte le rotte: **`agicap:public-api`**. Alcune API dichiarano però "Each route will specify the required scope" e chiedono di selezionare lo scope al momento della generazione delle credenziali — quindi esiste una granularità di scope non visibile nelle specifiche pubbliche `[DEDOTTO]`.
- Le credenziali si generano **solo da amministratore** dall'interfaccia: `https://app.agicap.com/{lang}/app/organization-advanced-settings/public-api/clients`. Lo screenshot in F12 mostra che ogni credenziale ha una **data di scadenza** ("Échu") e uno scope.
- Token con "limited validity period (**usually a few hours**)" — F12 raccomanda di rinnovarlo prima di `expires_in`.
- Header: `Authorization: Bearer {token}`.

### 5.3 Catalogo dei prodotti API

18 prodotti, 19 versioni `[OSSERVATO su F10]`:

| Prodotto | apiId | Lifecycle | Path | Cosa fa |
|---|---|---|---|---|
| Agicap OAuth2 Authentication | `auth-v1` | stable | 1 | genera l'access token |
| Organization | `organizations-v1` | stable | 2 | elenca organizzazioni ed entità |
| Banking documents | `banking-documents-v1` | Beta | 9 | import/export di file bancari, connessioni, estratti conto, conti |
| Treasury Bank Journal | `treasury-bank-journal-v1` | Preview | 5 | export delle scritture di prima nota banca |
| Chart of accounts | `chart-of-accounts-v1` | Preview | 8 | piano dei conti, terze parti, **piano analitico** |
| Purchase journal | `purchase-journal-v1` | stable | 2 | export del registro acquisti |
| Card expenses bank journal | `card-expenses-bank-journal-v1` | stable | 1 | export delle spese da carta aziendale |
| Payments | `payments-v2` | stable | 8 | beneficiari + routing dei file di pagamento |
| Suppliers | `suppliers-v1` | beta | 3 | anagrafica fornitori |
| Purchase-to-Pay | `invoices-management-v1` | stable | 4 | inbox documenti, fatture, ordini d'acquisto |
| Business Documents | `business-documents-v2` / `v1` | beta | 19 / 18 | fatture, note di credito, preventivi, ordini, DDT |
| Clients AR | `ar-clients-v1` | stable | 5 (17 op.) | anagrafica clienti, indirizzi, contatti, diritti utente |
| Client Risk | `client-risk-v1` | stable | 1 | limiti di fido per cliente |
| E-Invoicing | `einvoicing-v1` | stable | 5 | flussi di fatturazione elettronica FR/BE |
| Financial investments | `financial-investments-v1` | stable | 4 | investimenti, cedole, interessi maturati |
| Intragroup financing | `intragroup-financing-v1` | preview | 3 | finanziamenti infragruppo |
| Webhooks | `events-v1` | beta | 5 | registrazione e gestione dei webhook |
| Agicap HttpBin | `httpbin-v1` | stable | 52 | sandbox per testare le chiamate |

### 5.4 Il modello dati che l'API rivela

Questa è la parte da riportare nel file sul modello dati. Riassunto delle entità e dei campi più significativi `[OSSERVATO su F11]`.

#### Gerarchia di base

```
Organization (UUID)  ──►  Entity (id: integer, name, country)  ──►  tutto il resto
```

Quasi ogni path è nella forma `/public/{prodotto}/{ver}/entities/{entityId}/...`. L'**entità** (una ragione sociale) è l'unità di partizionamento dei dati. Le organizzazioni sono UUID, le entità sono interi.

L'API legacy (F13) esplicita il modello concettuale del lato "dati previsionali":

```
Company ──► Connection ──► Account ──► ExpectedTransaction
```

> "A **Connection** is an entity that hosts one or several **Account**. Usually, our clients create one Connection per tool they are connecting... In this context, an **Account** is an entity that hosts **Expected Transactions**."

`ExpectedTransaction { id, amount, isCashInflow: boolean, externalReference, name, paymentDate, billingDate, metadata }` — il previsionale di Agicap è, alla radice, una lista di movimenti attesi con data di pagamento e data di competenza distinte, e un flag di segno. `[OSSERVATO]`

#### Contabilità e piano dei conti — `chart-of-accounts-v1`

```
AccountingAccountDto { accountingAccountNumber, accountingAccountName, accountingAccountType,
                       externalId, taxKey, vatRate }
ThirdPartyDto        { thirdPartyCode, thirdPartyName, accountingAccountNumber, externalId }
AnalyticalAxe        { id, name, codes: [AnalyticalCode{ id, code, description }] }
```

`accountingAccountType ∈ {Bank, Client, Supplier, Expense, Product, Vat, Other}`.

Il dettaglio interessante per WEISS: **il piano analitico è multi-asse**. Non un singolo campo "centro di costo", ma N assi ciascuno con i propri codici, gestiti in bulk (`bulk-create`, `bulk-update`, `bulk-delete`). Sulle scritture, gli assi appaiono come dizionari: `analyticalCodes: object` e `additionalAnalyticalCodes: object`.

Nota di ambito, dichiarata dal portale: il piano dei conti serve "Treasury's bank journal & Account Receivable's sales journal preaccounting features (**does not work for Account Payable's purchase journal**)".

#### Prima nota banca — `treasury-bank-journal-v1`

L'entità centrale è la scrittura esportata:

```
ExportedBankJournalEntry {
  agicapUniqueId, indexInYear, indexInExport, exportEntryReference,
  journalCode, causale, name, entryMemo, paymentDate, type,
  bankAccountName, accountingAccountNumber, accountingAccountExternalId,
  debitInOriginalCurrency, creditInOriginalCurrency, originalCurrency,
  debitInAccountingCurrency, creditInAccountingCurrency, accountingCurrency, exchangeRate,
  counterparts: [ ExportedCounterpart ]
}

ExportedCounterpart {
  accountingAccountNumber, accountingAccountType, thirdPartyCode, thirdPartyName,
  debit*/credit*, analyticalCodes, customFields[], taxKey,
  document: { documentType, documentReference, documentIssueDate, originalDueDate,
              externalId, externalEntityId, uniqueId },
  linkedExportedEntry
}
```

**Il campo `causale` e l'endpoint `POST /entities/{entityId}/causales` sono localizzazione italiana esplicita** `[OSSERVATO]`: la *causale contabile* è un concetto del piano dei conti italiano. `CausaleRequestDto { code, description }`. Nell'API non c'è nulla di equivalente per la Francia. È il segnale più forte che Agicap ha fatto lavoro di prodotto specifico per l'Italia sul lato pre-contabilità.

Il ciclo di export è a stati e riconciliato con l'ERP `[OSSERVATO su F12]`:
- le scritture in stato **"Ready to export"** passano a **"Exported"** quando si chiama `POST .../exports/{exportId}`;
- l'`exportId` è un **UUID generato dal chiamante** (idempotenza lato client);
- massimo **5.000 scritture per chiamata**;
- l'ERP richiama poi `mark-as-imported` o `mark-as-not-imported`, quest'ultimo con errori tipizzati: `UNKNOWN_JOURNAL_CODE`, `UNKNOWN_ACCOUNTING_ACCOUNT`, `UNKNOWN_THIRD_PARTY`, `UNKNOWN_ANALYTICAL_CODE`, `OTHER`;
- i contatori `currentBankJournalsCountInYear` e `currentBankJournalEntriesCountInYear` servono a riprendere la numerazione progressiva annuale se il registro è stato iniziato fuori da Agicap.

#### Registro acquisti — `purchase-journal-v1`

```
PublicApiPurchaseJournalPresentation {
  agicapUniqueId, uniqueId, title, note, invoiceOrReceiptNumber, orderNumbers[],
  billingDate, dueDate, performanceDate, prepaidExpenseStartDate, prepaidExpenseEndDate,
  supplierOrMerchant, supplierErpExternalId, taxKey, paymentMethod, typology,
  originalFileUrl, originalFileExtension,
  accountingLines: [ PurchaseJournalAccountingLine ],
  invoiceInformation: { costCenter, currency, natures[], lineItems[], linkedPurchaseOrders[], ... }
}
```

Due enum degni di nota `[OSSERVATO]`:

```
Typology              = ['OwedInvoice','CreditNote','CardExpenseReceipt','CardRefundReceipt','ExpenseClaim']
AccountingLinePaymentMethod = ['Check','CreditCard','DebitCard','DirectDebit','WireTransfer','Cash',
                               'Paypal','Giropay','Girocard','RIBA','BillOfExchange','Compensation','Other','None']
```

**`RIBA`** (Ricevuta Bancaria) è italiano; `Giropay` e `Girocard` sono tedeschi. La lista dei metodi di pagamento è quindi un'unione di localizzazioni nazionali, e l'Italia c'è. `[OSSERVATO]`

Ci sono anche `prepaidExpenseStartDate` / `prepaidExpenseEndDate`: **ratei e risconti** sono modellati sulla singola fattura.

#### Documenti commerciali — `business-documents-v2`

Nove tipi di documento, tutti con la stessa forma:

```
{ id, externalId, erpIdentificationFields: object, metadata: object,
  counterParty { id, name }, label, currency, issueDate, dueDate, status,
  amounts { totalAmount, taxesAmount, dueAmount | remainingAmount },
  accounting { accountCode, accountNumber, amount, currency } }
```

Le fatture aggiungono: `invoiceNumber`, `paymentDate`, `expectedPaymentDate`, `financingSolution`, e soprattutto **`instalments[]`** — le rate:

```
Instalment { externalId, label, dueDate, paymentDate, paymentMethod, status,
             amounts { totalAmount, taxesAmount, dueAmount },
             accountingAmount { amount, currency }, erpIdentificationFields, metadata }
```

`[OSSERVATO]` Il pagamento rateale è un'entità di primo livello, non un campo. Questo è il punto in cui il previsionale di Agicap si aggancia al dato reale: `expectedPaymentDate` (stima) vs `dueDate` (scadenza contrattuale) vs `paymentDate` (incasso effettivo), per singola rata.

Ogni documento è connesso a una **`Connection`** (`{ id, entityId, name, source, integrationName }`) — la sorgente da cui proviene.

#### Anagrafiche

```
Supplier { id, erpId, name, legalName, legalCompanyId, vatCode, thirdPartyCode, language,
           status, tags[], legalAddress{...}, contacts[{name,email,phone,role}], primaryContact,
           createdAt, updatedAt }

Client   { id, externalId, name, reference, legalId, electronicInvoicingAddress, tags[],
           averagePaymentDelay, consolidatedDueAmount, consolidatedOutstandingAmount,
           consolidatedCurrency, dueAmountSummary[], outstandingAmountSummary[], numberOfContacts }

Beneficiary { id, name, companyLegalIdentifier, bankAccount{ identifier, bic, bankName, country,
              intermediaryBankBic, localClearingCode }, postalAddress, validationStatus, uncertaintyStatus }
```

`[OSSERVATO]` **Fornitore ≠ beneficiario**, ed è documentato perché: "The same supplier may have several beneficiaries (multiple bank accounts), and a single beneficiary may be shared across suppliers (**e.g. a factoring company** collecting on behalf of multiple suppliers)". Il legame si stabilisce via `supplierErpIds[]` in fase di sync dei beneficiari.

Due semantiche di sincronizzazione **diverse e documentate**, che vale la pena copiare come pattern:
- fornitori: "Suppliers absent from the synchronisation payload are **automatically deleted** from Agicap" (sync riflessivo);
- beneficiari: "beneficiaries absent from the payload are **not deleted** — the sync is purely additive" (sync additivo).

Sul cliente, `averagePaymentDelay` è calcolato da Agicap: è la base del "DSO effettivo per cliente" venduto su F7.

#### Altri

```
Investment { id, entityId, name, amount, currency, rate, subscriptionDate, maturityDate,
             closingDate, status, interests { due, accrued { thisMonth, lastMonth, thisYear, lastYear } } }

Financing  { id, name, lender/borrower: Stakeholder{name,type}, startDate,
             balance: Amount, accruedInterests: Amount }
DailyPosition { date, balance, drawDown, repayment, periodInterests, accruedInterests, transactions[] }
```

`[OSSERVATO]` I finanziamenti infragruppo hanno una **posizione giornaliera** con interessi maturati per periodo.

### 5.5 Webhook

`events-v1` (beta) `[OSSERVATO]`:

```
POST   /public/events/v1/webhooks              { url, secret, eventTypes[], description, enabled }
GET    /public/events/v1/webhooks/{id}
DELETE /public/events/v1/webhooks/{id}
POST   /public/events/v1/webhooks/{id}/enable
POST   /public/events/v1/webhooks/{id}/disable
POST   /public/events/v1/webhooks/{id}/send-example   { eventType }
```

- Firma **HMAC-SHA256** con secret in chiaro fornito alla creazione, **minimo 24 caratteri**, con endpoint di rotazione dedicato ("rotate later via the dedicated rotate-secret endpoint" — citato nella descrizione ma non presente fra i path pubblicati).
- Stati: `active`, `disabled_manually`, `disabled_by_organization`, **`disabled_for_errors`** — c'è un circuit breaker: "Re-enables a webhook that was previously disabled (manually, **by the platform after repeated failures**, or by org-wide deactivation)".
- Alla creazione il webhook nasce disabilitato salvo `enabled: true`.
- `send-example` consegna un payload sintetico del tipo richiesto: c'è un modo per testare senza generare eventi reali.

**L'elenco degli `eventTypes` non è pubblicato** — il campo è `array<string>` senza enum. Si possono però ricostruire alcuni eventi dagli schemi presenti nelle altre specifiche `[DEDOTTO]`:

- da `invoices-management-v1`: `DocumentRecognized`, `InvoiceMarkedAsToVerify`, `InvoiceMarkedAsVerified`, `InvoiceMarkedAsRefused`, `InvoiceMarkedAsDisputed`, `InvoiceMarkedAsToDelete`, `CreditNoteApproved`, `CreditNoteHasDataToVerify`;
- da `ar-clients-v1` / `client-risk-v1` (eventi di avanzamento di operazioni massive, via SignalR): `BulkSetPromisedPaymentDate*`, `BulkExtendPromisedPaymentDate*`, `DeleteInvoices*`, `LinkDocuments*`, `RemittanceProcessing{Started,Completed,Failed}` — ciascuno nelle varianti `Progress` / `Completed` / `Failed` con `{workflowId, entityId, total, updated, skipped, error}`.

### 5.6 Limiti, paginazione, gestione errori

| Aspetto | API attuale | API legacy (F13) |
|---|---|---|
| Rate limit | **non pubblicato**; `429 "Too many requests. Please try again later."` è documentato su tutte le rotte di tutte le 18 API; `/portal-api/usage-plans` restituisce `[]` | **100 richieste/minuto per utente**, esplicito |
| Paginazione | mista: `pageNumber`/`pageSize` (organizations, banking-documents, purchase-journal), `pageindex`/`pagesize` (business-documents), cursore `after`/`before`/`size` (treasury-bank-journal, suppliers), `token` (ar-clients), `offset`/`limit` (financial-investments, intragroup-financing, einvoicing) | link `next` in risposta, max **1000** elementi/pagina, default 100 |
| Dimensione massima | export prima nota: **max 100** per pagina in lettura, **max 5.000 scritture** per export | — |
| Errori | RFC 7807 `ProblemDetails { type, title, status, detail, instance }` ovunque | codici numerici (17101, 17102) |
| Sincronizzazione incrementale | `LastSynchronizationDate` (purchase-journal, card-expenses), `updatedsince` (business-documents), `createdSince`/`createdUntil` (banking-documents) | — |

`[DEDOTTO]` La disomogeneità della paginazione (cinque convenzioni diverse) e la coesistenza di `business-documents` v1 e v2 con DTO duplicati (`AccountingDto` / `AccountingDtoV2`, `CounterPartyDto` / `CounterPartyDtoV2`) indicano che l'API è cresciuta per accrezione da team diversi, non da un design unitario. Anche i nomi degli schemi lo tradiscono: alcuni sono nomi di classe .NET completi (`PaymentsPreparation.Web.Models.Presentations.Beneficiary.BeneficiaryPresentation`, `InvoicesManagement.Web.Controllers.PublicApi.Responses.InvoiceResponse`), cioè generati automaticamente senza curatela.

### 5.7 MCP Server — il secondo canale programmatico

Agicap ha un **server MCP** (Model Context Protocol) con pagina di prodotto dedicata `[OSSERVATO su F6]`. È rilevante qui perché è un canale di accesso ai dati alternativo alla REST API, con un modello di sicurezza diverso:

| Aspetto | REST API | MCP Server |
|---|---|---|
| Autenticazione | client credentials (client_id/secret generati da admin) | "Ogni richiesta passa attraverso il tuo **identity provider** ed eredita i permessi Agicap dell'utente" |
| Autorizzazione | scope `agicap:public-api` | permessi dell'utente autenticato, per entità |
| Setup | tecnico | "Nessun codice, **nessuna API key**, nessun ticket IT" |
| Governance | — | "Gli amministratori possono scegliere quali strumenti collegare e definire se l'accesso è **in sola lettura** o consente anche di **agire** sui dati" |

Casi d'uso dichiarati che rivelano capacità di scrittura: "**Ricategorizzazione massiva delle transazioni** — Ricategorizza centinaia di transazioni con un'istruzione, usando controparte, importo o altri criteri. Rivedi le modifiche prima di applicarle". E, sul previsionale: "Usa il **modello di Machine Learning** di Agicap per creare scenari ottimistici, mediani e pessimistici" `[DA DOCUMENTAZIONE]`.

L'endpoint MCP non è pubblicato; la configurazione avviene dalle impostazioni dell'assistente AI con le credenziali Agicap.

### 5.8 Zapier e Make

**Nessun connettore pubblico** `[OSSERVATO]`. `https://zapier.com/apps/agicap/integrations` risponde **404**. `https://www.make.com/en/integrations/agicap` risponde **403** (blocco anti-bot, quindi indeterminato: si veda la sezione finale). Nessuna pagina Agicap menziona Zapier o Make.

`[DEDOTTO]` Coerente con il posizionamento: Agicap si integra via connettori nativi, API, SFTP e matrici, non via automazione no-code di consumo.

---

## 6. Incassi

| Capacità | Stato | Fonte |
|---|---|---|
| **Solleciti automatici multicanale** | sì, modulo Gestione dei crediti | F7 `[OSSERVATO]` |
| — sequenze e-mail automatiche | sì, con modelli e PDF allegato | F7 |
| — promemoria di chiamata | sì, ma "la chiamata resta un'attività manuale, **Agicap non contatta il cliente al posto tuo**" | F7 (dichiarazione esplicita, insolitamente onesta) |
| — sequenze semi-automatiche con validazione | sì, per i key account | F7 |
| — solleciti raggruppati per cliente multi-fattura | sì | F7 |
| — segmentazione clienti (dimensione, area, categoria) | sì | F7 |
| — flag "in contestazione" che esclude dai solleciti | sì; l'esclusione dal previsionale è "un'opzione da attivare nelle impostazioni, **non un comportamento automatico di default**" | F7 |
| **Limiti di fido per cliente** | sì, API dedicata `client-risk-v1` | F11 |
| **DSO effettivo per cliente** | sì, campo `averagePaymentDelay` sul cliente | F11 |
| **Addebiti SDD / RID** | **indiretto**: si generano come file di pagamento — "requesting debits from clients" | F11 `[OSSERVATO]` |
| **RIBA** | presente come metodo di pagamento nel registro acquisti | F11 `[OSSERVATO]` |
| **Integrazione PSP** | Stripe, PayPal, Adyen, Payplug, Payoneer nel catalogo | F1 `[OSSERVATO]` |
| **Link di pagamento / pagamento in-app della fattura** | **nessuna evidenza pubblica** | — |
| **Integrazione POS / registratore di cassa** | **nessuna evidenza pubblica** | — |
| **Factoring / anticipo fatture** | campo `financingSolution` sulle fatture cliente e sulle rate; la pagina prodotto cita "finanziamento delle fatture" | F11, F5 `[OSSERVATO]` |

`[DEDOTTO]` L'incasso in Agicap è **credit management**, non **acquiring**: ottimizza il recupero di crediti commerciali B2B con scadenza, non l'incasso al banco. Per un'azienda horeca come WEISS — dove il grosso dell'incasso è contante e POS al momento della vendita, senza fattura né scadenza — l'intero modulo Gestione dei crediti è largamente fuori bersaglio. Il catalogo PSP (Stripe, Adyen, PayPal) riguarda l'e-commerce, non il POS fisico di un bar.

---

## 7. Cosa se ne ricava per WEISS

Osservazioni fattuali, non raccomandazioni.

1. **Il modello a due date sulle rate è il pezzo di design più riutilizzabile.** `dueDate` (scadenza contrattuale) / `expectedPaymentDate` (stima) / `paymentDate` (effettivo), per singola rata e non per fattura, è esattamente la struttura che serve a un previsionale che si corregge sul dato reale.

2. **Il piano analitico multi-asse.** Agicap non ha "un" centro di costo: ha N assi con codici, e sulle scritture due dizionari (`analyticalCodes`, `additionalAnalyticalCodes`). Va confrontato con la scelta a centro di costo singolo del piano v4.

3. **La `causale` e `RIBA` dimostrano che la localizzazione italiana della pre-contabilità è possibile e Agicap l'ha fatta**, ma limitatamente: nessuna traccia di FatturaPA, e il piano dei conti API "does not work for Account Payable's purchase journal".

4. **Il ciclo di export a stati con riconoscimento dall'ERP** (`Ready to export` → `Exported` → `mark-as-imported` / `mark-as-not-imported` con errori tipizzati, più i contatori di ripresa della numerazione annuale) è un pattern di integrazione contabile maturo e a basso costo di implementazione.

5. **Sull'Italia bancaria, Agicap è più debole di quanto sembri.** 14 loghi in vetrina, nessun catalogo, il canale italiano dichiarato è CBI (che richiede contratto bancario), e i pagamenti in uscita richiedono un modulo a contratto con onboarding assistito banca per banca. Non è una soluzione che una PMI attiva da sola.

6. **Fatture in Cloud è l'unico ponte italiano documentato per la fascia PMI**, e sincronizza fatture emesse/ricevute in sospeso, scadute, e preventivi verso il previsionale.

---

## Cosa non sono riuscito a determinare e perché

1. **L'elenco reale delle banche italiane supportate.** Non esiste una pagina pubblica di copertura. La griglia di F1 è una vetrina di 14 loghi chiusa da "E molto altro", e il payload Contentful dietro di essa contiene solo le stesse voci con la loro categoria. Non ho dedotto un catalogo perché non ci sono elementi per farlo: sarebbe stato inventarlo. L'unica via è chiedere ad Agicap.

2. **Se Volksbank e Crédit Agricole, sulla pagina italiana, siano le controllate italiane o le case madri.** Nel CMS sono raggruppate rispettivamente con gli istituti tedeschi e francesi, ma sono mostrate sul locale italiano. La pagina non disambigua.

3. **Quale aggregatore PSD2 copra oggi l'Italia, e con quale profondità.** Agicap non pubblica i sub-processor: la politica di riservatezza italiana li descrive solo per categoria merceologica e il Trust Center espone solo le certificazioni. I due nomi che ho (Salt Edge, ottobre 2020; Powens, ottobre 2022) vengono dai fornitori, sono datati di 4-6 anni, e nessuno dei due comunicati nomina l'Italia come mercato coperto.

4. **La frequenza di aggiornamento di saldi e movimenti.** Nessun numero, nessun SLA in nessuna fonte. Solo "in tempo reale" nel materiale commerciale e un "quotidianamente" riferito all'intercettazione degli estratti conto.

5. **Come Agicap presenta all'utente la riautenticazione SCA.** Tema assente da tutte le fonti pubbliche. Il Centro assistenza, che è il posto dove starebbe la risposta, non è raggiungibile pubblicamente: `help.agicap.com` risponde 404 e `support.agicap.com` non risolve. Servirebbe un account.

6. **Le guide del portale sviluppatori** (`/guides/introduction`, `/guides/authentication`), citate come link dalle descrizioni delle API. Il backend `/portal-api` non le serve pubblicamente — sono dietro login. Le specifiche OpenAPI, che sono la parte sostanziale, lo sono invece.

7. **Il rate limit dell'API attuale.** `429` è documentato ovunque ma senza soglia; `/portal-api/usage-plans` risponde con un array vuoto e la rotta `/api-keys` del portale richiede autenticazione. L'unico numero che ho è quello dell'**API deprecata**: 100 richieste/minuto per utente.

8. **L'elenco completo dei tipi di evento dei webhook.** Il campo `eventTypes` è `array<string>` senza enum. Ho ricostruito una parte degli eventi dagli schemi `Event.*` presenti nelle altre specifiche, ma è una deduzione parziale.

9. **La granularità reale degli scope OAuth.** Le descrizioni dicono "Each route will specify the required scope" e chiedono di selezionare lo scope alla generazione delle credenziali, ma tutte le rotte pubblicate dichiarano lo stesso `agicap:public-api`. Gli scope fini si vedono presumibilmente solo dall'interfaccia di generazione delle chiavi.

10. **Se esista un connettore Make.** `make.com` ha risposto **403** a una richiesta diretta: è un blocco anti-bot, non una risposta di assenza. Per Zapier il 404 è invece conclusivo. Non ho insistito con tecniche di aggiramento.

11. **Se e come Agicap invii davvero allo SDI.** È il punto aperto più rilevante. Il sito italiano lo afferma in un articolo editoriale, l'API pubblica non ne ha alcuna traccia e la sua API E-Invoicing ammette due soli paesi di validazione, `FR` e `BE`. Le tre spiegazioni possibili sono elencate nella sezione 2; nessuna è verificabile senza un account o una domanda diretta ad Agicap.

12. **Il formato accettato dalle "matrici personalizzate".** È il canale con cui Agicap dichiara di potersi collegare "a qualsiasi strumento", e quindi la porta d'ingresso per CSV/Excel — ma né la pagina commerciale né l'API attuale lo documentano. L'API deprecata ha un endpoint `POST /api/imports/matrix` con un solo campo, `filename`.
