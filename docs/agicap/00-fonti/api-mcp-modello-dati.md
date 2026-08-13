# Agicap — API, MCP e modello dati

**Analisi competitiva per WEISS S.r.l.** — modulo tesoreria del gestionale interno
**Data di redazione**: 11 agosto 2026
**Metodo**: sole fonti pubbliche, via ricerca e recupero web e via `gh` per i repository pubblici. Nessun account, nessuna credenziale, nessun browser.

> **Perimetro rispettato**: non ho tentato in alcun modo di configurare, installare o interrogare il server MCP di Agicap, né di chiamare la loro API. Tutto ciò che segue viene da documentazione, specifiche e metadati pubblicati.

---

## Fonti consultate

### Fonti ufficiali Agicap

| URL | Cosa contiene | Esito |
|---|---|---|
| `https://api.agicap.com/treasury-bank-journal/detailed_documentation.pdf` | **Guida ufficiale in PDF, 9 pagine**: credenziali, autenticazione, i tre endpoint del giornale di banca, paginazione, schermata della UI | letto integralmente |
| `https://api.agicap.com/portal-api/apis` | Endpoint del portale sviluppatori: elenco ufficiale delle 18 API con id, versione e descrizione | letto |
| `https://myaccount.agicap.com/.well-known/openid-configuration` | **Discovery OpenID Connect**: issuer, grant types, **283 scope** | letto |
| `https://agicap.com/en-us/article/agicap-mcp-claude/` | Annuncio dell'Agicap MCP (18 giugno 2026) | letto (già in `changelog-roadmap.md`) |
| `https://api.agicap.com/apis`, `/api-details/*`, `/guides/*`, `/llms.txt` | Portale sviluppatori | **SPA**: WebFetch restituisce solo il titolo. Non leggibile senza browser |
| `https://app.agicap.com/*` | Applicazione | dietro login |

### Fonti di terze parti

| URL | Cosa contiene | Natura |
|---|---|---|
| `https://github.com/api-evangelist/agicap` — cartella `openapi/_original/` | **19 specifiche OpenAPI 3.0.0 di Agicap**, 1,09 MB, ~490 schemi | copia di materiale pubblico Agicap — **autenticità verificata**, vedi sotto |
| stesso repo — `mcp/`, `data-model/`, `agentic-access/`, `skills/`, `scopes/`, `authentication/`, `conformance/` | elaborazioni automatiche di API Evangelist | **derivate, non Agicap**. Marcate `method: derived`/`generated`. Da non citare come fonte |
| `https://github.com/MC2IT/Agicap.net` e `Agicap.ps1` | Librerie client .NET e PowerShell di terze parti, aggiornate il 7 agosto 2026 | conferma indipendente degli scope e delle entità |
| `https://sessionize.com/pauline-jamin/` | Abstract dei talk di Pauline Jamin (Head of Engineering, Agicap) su ReBAC/OpenFGA | fonte primaria sul modello di autorizzazione |
| `https://apitracker.io/a/agicap-fr`, `openbankingtracker.com` | directory di API | **HTTP 429**, non letti |
| `zapier.com/apps/agicap/integrations` | — | **HTTP 404**: nessun connettore Zapier |

**Perché considero autentiche le specifiche OpenAPI.** Tre verifiche indipendenti: (1) i path del giornale di banca, dell'auth e delle organizzazioni **coincidono carattere per carattere** con la guida ufficiale in PDF di Agicap; (2) i 18 identificativi di API coincidono con quelli restituiti da `api.agicap.com/portal-api/apis`, recuperato direttamente; (3) ogni specifica dichiara due server, `https://api.agicap.com` e **`https://api.agicap.internal`** — un hostname interno che solo un artefatto di build Agicap può contenere. Dettagli in `assets/agicap/materiali-pubblici/api-superficie-endpoint.md`.

Testi grezzi archiviati in `assets/agicap/materiali-pubblici/api-*.md` (4 file).

---

## 1. La documentazione tecnica dell'MCP non è pubblica

`[OSSERVATO]`

**Non esiste alcun elenco pubblico dei tool MCP di Agicap**: nessun nome di tool, nessuno schema di parametri, nessun endpoint, nessuna istruzione di configurazione. Ricerche tutte negative l'11 agosto 2026:

- l'endpoint ufficiale `api.agicap.com/portal-api/apis` elenca 18 API e **nessuna si chiama «mcp»**
- nessun repository Agicap su GitHub (13 repo che citano «agicap», nessuno della società)
- nessun pacchetto `@agicap` su npm, nessun `agicap` su PyPI
- nessuna voce Agicap nei registri MCP (mcp.so, glama.ai, MCP Registry)
- nessun connettore Zapier (404), Make, n8n o Power Automate

**Attenzione a una trappola.** Il repository `api-evangelist/agicap` contiene un file `mcp/agicap-mcp.yml` con 106 «tool». **Non sono i tool MCP di Agicap.** Il file stesso lo dichiara: *«No official Agicap MCP server was found… This is a DERIVED candidate tool list mapping marquee Public API operations to MCP tools»*. Sono `operationId` OpenAPI riscritti a macchina da un terzo. Non vanno usati come contratto, e non li riporto.

### Cosa invece è pubblicamente provato dell'MCP

`[OSSERVATO]` Il documento di discovery OIDC di Agicap — pubblico per progetto — espone **sette scope** che dimostrano l'esistenza dell'MCP come risorsa OAuth di prima classe:

```
mcp          mcp:read      mcp:write      mcp:gateway
mcp-gateway:user           mcp-gateway:list_tools
access_management:ai_assistant
```

`[DEDOTTO]` La coppia `mcp:read` / `mcp:write` corrisponde punto per punto alla scelta fra connessione in sola lettura e in lettura-scrittura che Agicap descrive nell'articolo del 18 giugno 2026. `mcp-gateway:list_tools` implica un meccanismo di scoperta dei tool a runtime — cioè il catalogo esiste, ma è servito solo a un client autenticato. `access_management:ai_assistant` mostra che l'assistente IA è un'abilitazione di prodotto separata, come lo sono cashflow o payments.

### La via aperta: il modello dati sta nell'API REST

`[DEDOTTO]` L'MCP di Agicap è quasi certamente un gateway sopra i servizi che alimentano anche la Public API REST. La Public API **è documentata in modo esaustivo**: 19 specifiche OpenAPI, ~90 operazioni, ~490 schemi con nomi di campo, tipi e descrizioni. È da lì che ricostruisco il modello dati, ed è materiale di qualità molto superiore a un elenco di tool.

**Ma la sovrapposizione è parziale, e l'asimmetria è la scoperta più interessante di questa analisi.** Confrontando ciò che Agicap dice di esporre via MCP con ciò che espone via REST:

| Dato dichiarato nell'MCP | Corrispettivo nella Public API REST |
|---|---|
| Dati AP/AR | ✅ `invoices-management v1`, `ar-clients v1`, `suppliers v1`, `business-documents v2` |
| Fatture scadute | ✅ `Client.consolidatedDueAmount`, `dueAmountSummary`; `ClientInvoiceDtoV2.status = due` |
| Scadenze del debito | ⚠️ solo infragruppo (`intragroup-financing v1`). Il debt management vero **non ha API pubblica** |
| Posizioni di cassa per entità e valuta | ❌ **nessun endpoint pubblico** |
| Previsioni di flusso di cassa | ❌ **nessun endpoint pubblico** |
| KPI finanziari | ❌ **nessun endpoint pubblico** |
| Analisi degli scostamenti | ❌ **nessun endpoint pubblico** |

`[DEDOTTO]` **L'MCP espone più della Public API REST.** Le quattro voci mancanti sono proprio il cuore del prodotto — posizione di cassa, previsione, KPI, scostamenti — e per tutte e quattro esistono scope interni nella discovery OIDC (`cashflow:read`, `expectations:read`, `custom-dashboards-intake:cashflow`, `debt-management:debt-data-series-read`, `cf-banking:read`, `cf-bankjournal:read`, `refinement:*`, `consolidations_read`, `budget_controls:read`) **senza alcuna API REST pubblica corrispondente**.

`[IPOTESI]` La lettura più plausibile: la Public API REST è nata come **API di integrazione ERP** — serve a far entrare e uscire dati contabili e documentali — mentre l'MCP è la prima interfaccia che apre all'esterno il **livello analitico** del prodotto. Se è così, l'MCP non è un wrapper della REST: è un secondo canale, con una superficie propria e più ampia.

---

## 2. Endpoint della Public API

18 API (19 specifiche, `business-documents` in due versioni), base `https://api.agicap.com`, prefisso costante `/public/`. Elenco completo in `assets/agicap/materiali-pubblici/api-superficie-endpoint.md`. Sintesi per modulo:

| API | Operazioni | Ambito |
|---|---|---|
| `auth v1` | 1 | Token OAuth2 |
| `organizations v1` | 2 | Organizzazioni ed entità |
| `treasury-bank-journal v1` | 6 | Export del giornale di banca, causali, riscontro import |
| `purchase-journal v1` | 2 | Export del giornale acquisti |
| `card-expenses-bank-journal v1` | 1 | Export delle spese con carta contabilizzate |
| `chart-of-accounts v1` | 8 | Conti contabili, terze parti, assi analitici |
| `business-documents v1` / `v2` | 35 / 38 | Fatture, note di credito, preventivi, ordini, DDT — CRUD completo |
| `invoices-management v1` (P2P) | 4 | Inbox documenti, fatture, ordini, marcatura come verificate |
| `suppliers v1` | 3 | Anagrafica fornitori, sincronizzazione a lotti |
| `ar-clients v1` | 17 | Clienti, indirizzi, contatti esterni e interni, diritti utente |
| `client-risk v1` | 4 | Limiti di fido cliente |
| `payments v2` | 11 | Beneficiari, import di file di pagamento e distinte |
| `banking-documents v1` | 12 | Connessioni bancarie, estratti conto, report, file |
| `einvoicing v1` | 5 | Flussi di fatturazione elettronica, e-reporting B2C |
| `financial-investments v1` | 4 | Investimenti, liquidità investita, ratei di interesse |
| `intragroup-financing v1` | 3 | Finanziamenti infragruppo, estratto interessi |
| `events v1` | 6 | Gestione dei webhook |
| `httpbin v1` | — | API di test, senza valore di modello |

**Gerarchia costante**: quasi ogni risorsa è annidata sotto `/entities/{entityId}/`. Le sole eccezioni sono `organizations`, i `bank-accounts` (a livello di organizzazione) e i webhook (per organizzazione). `[OSSERVATO]`

---

## 3. Entità → campi → tipo

Trascritto dalle specifiche OpenAPI. `*` = obbligatorio. Il dump integrale, con le descrizioni originali, è in `assets/agicap/materiali-pubblici/api-schemi-entita-campi.md`.

### 3.1 Radice organizzativa

| Entità | Campo | Tipo | Note |
|---|---|---|---|
| **Organization** | `id` | `string(uuid)` | |
| | `name` | `string` | |
| **Entity** | `id` | `integer(int32)` | ⚠️ **intero**, non UUID, a differenza dell'organizzazione |
| | `name` | `string` | |
| | `country` | `string` | |

### 3.2 Giornale di banca — l'entità contabile centrale

| Entità | Campo | Tipo | Note |
|---|---|---|---|
| **BankJournalEntry** | `agicapUniqueId`* | `uuid` | generato da Agicap |
| | `exportEntryReference`* | `string` | univoco per entità, **max 8 caratteri**, formato compatibile ERP |
| | `indexInExport`* | `int32` | parte da 1 |
| | `indexInYear`* | `int32` | parte da 1 |
| | `name`* | `string` | titolo |
| | `type`* | `string` | `BANK` \| `CASH_IN_TRANSIT` |
| | `paymentDate`* | `date` | data valuta bancaria |
| | `bankAccountName`* | `string` | |
| | `accountingAccountNumber`* | `string` | |
| | `accountingAccountExternalId` | `string` | id ERP opzionale |
| | `journalCode` | `string` | |
| | `entryMemo` | `string` | |
| | `causale` | `string` | **solo per entità con opzione causale attiva** |
| | `originalCurrency`* / `accountingCurrency`* | `string` | ISO 4217 |
| | `exchangeRate` | `double` | |
| | `debitInOriginalCurrency`, `creditInOriginalCurrency` | `double` | 4 decimali |
| | `debitInAccountingCurrency`, `creditInAccountingCurrency` | `double` | 4 decimali |
| | `counterparts`* | `array<Counterpart>` | |
| **Counterpart** | `name`*, `accountingAccountNumber`* | `string` | |
| | `accountingAccountType`* | enum | `OTHER\|SUPPLIER\|CLIENT\|EXPENSE\|PRODUCT\|VAT\|BANK` |
| | `thirdPartyCode`, `thirdPartyName`, `thirdPartyExternalId` | `string` | |
| | `taxKey` | `string` | solo conti IVA |
| | `analyticalCodes`* | `object` | codici analitici |
| | quattro colonne dare/avere + `exchangeRate` | `double` | come sopra |
| | `customFields` | `array<CustomField>` | dall'atteso riconciliato, include l'id ERP |
| | `document` | `→Document` | |
| | `linkedExportedEntry` | `→LinkedExportedEntry` | per riconciliazione ERP |
| **Document** | `uniqueId`* | `string` | **8 caratteri alfanumerici** |
| | `documentType`* | `string` | `CLIENT_INVOICE`, `CLIENT_CREDIT_NOTE`, `SUPPLIER_INVOICE`, `SUPPLIER_CREDIT_NOTE`, `CLIENT_QUOTE`, … |
| | `documentReference` | `string` | numero fattura / ordine |
| | `documentIssueDate` | `date-time` | |
| | `originalDueDate`* | `date` | |
| | `externalId`, `externalEntityId` | `string` | id nel sistema di origine |
| **BankJournalExport** | `exportId`* | `uuid` | **generato dal chiamante** |
| | `exportDateUtc`*, `exportYear`*, `exportIndexInYear`* | | |
| | `numberOfEntries`* | `int32` | max 5000 per chiamata |
| | `indexInYearOfFirstEntry…`*, `…LastEntry…`* | `int32` | |
| **Causale** | `code`*, `description`* | `string` | |

### 3.3 Giornale acquisti e spese con carta

| Entità | Campo | Tipo | Note |
|---|---|---|---|
| **PurchaseJournalEntry** | `agicapUniqueId`*, `uniqueId`* | `uuid` / `string` | |
| | `title`*, `note`* | `string` | inseriti manualmente |
| | `typology`* | enum | `OwedInvoice\|CreditNote\|CardExpenseReceipt\|CardRefundReceipt\|ExpenseClaim` |
| | `invoiceOrReceiptNumber`* | `string` | |
| | `orderNumbers`* | `array<string>` | |
| | `billingDate`* | `date-time` | |
| | `dueDate` | `date` | |
| | `performanceDate` | `date-time` | data della prestazione |
| | `prepaidExpenseStartDate` / `EndDate` | `date` | **risconti** |
| | `paymentMethod` | enum | 14 valori, fra cui `RIBA`, `BillOfExchange`, `Compensation` |
| | `supplierOrMerchant`*, `supplierErpExternalId` | `string` | |
| | `originalFileExtension`, `originalFileUrl` | `string` | |
| | `accountingLines`* | `array<AccountingLine>` | |
| **AccountingLine** | `accountNumber`* | `string` | |
| | `accountType`* | enum | `SupplierAccount\|ExpenseAccount\|VatAccount` |
| | `type`* | `string` | «G» per General |
| | `taxKey`, `vatAccountName`, `thirdPartyAccount` | `string` | |
| | `currency`*, `accountingCurrency`*, `conversionRate`* | | |
| | `debit`*, `credit`*, `convertedDebitAmount`*, `convertedCreditAmount`* | `double` | |
| | `analyticalCodes`* | `object` | legati al **conto di costo** |
| | `additionalAnalyticalCodes`* | `object` | legati al **portatore di costo** |
| | `lineItemId` | `uuid` | |
| **CardExpenseTransaction** | `uniqueId`*, `title`*, `supplierOrMerchant`*, `paymentDate`* | | |
| | `debit`*, `credit`* | oggetti | `accountNumber`, `accountType` (`SupplierAccount\|BankLedger`), `thirdPartyAccount`, `amount`, `currency` |

### 3.4 Piano dei conti e analitica

| Entità | Campo | Tipo | Note |
|---|---|---|---|
| **AccountingAccount** | `accountingAccountNumber`* | `string` | **unico** |
| | `accountingAccountName`* | `string` | |
| | `accountingAccountType` | `string` | `Bank`, `Client`, `Supplier`, `Expense`, `Product`, `Vat`… |
| | `taxKey`, `vatRate` | `string` / `double` | solo conti IVA |
| | `externalId` | `string` | id ERP, max 300 caratteri |
| **ThirdParty** | `thirdPartyCode`* | `string` | **unico dentro un conto** |
| | `thirdPartyName`* | `string` | |
| | `accountingAccountNumber`* | `string` | deve già esistere |
| | `externalId` | `string` | max 300 caratteri |
| **AnalyticalAxis** | `id`*, `name`*, `codes`* | `uuid`, `string`, array | l'asse è il **centro di costo** |
| **AnalyticalCode** | `id`*, `code`*, `description` | | |

### 3.5 Documenti commerciali (Business Documents v2)

| Entità | Campo | Tipo | Note |
|---|---|---|---|
| **ClientInvoice** / **SupplierInvoice** | `id`* | `uuid` | generato da Agicap |
| | `externalId`* | `string` | **chiave nel sistema di origine** |
| | `invoiceNumber`, `label` | `string` | |
| | `status`* | `string` | `draft\|due\|paid\|cancelled\|deleted` |
| | `currency`* | `string` | ISO 4217 |
| | `issueDate`, `dueDate` | `date-time` | |
| | `expectedPaymentDate` | `date-time` | **data attesa di pagamento** |
| | `paymentDate` | `date-time` | pagamento integrale |
| | `amounts`* | oggetto | `totalAmount`, `taxesAmount`, `dueAmount` |
| | `counterParty` | oggetto | `id` (origine) + `name` |
| | `accounting` | oggetto | `accountNumber`, `accountCode`, `amount`, `currency` |
| | `instalments` | array | rate |
| | `financingSolution` | `string` | solo lato cliente |
| | `hasReadable` | `boolean` | file allegato |
| | `erpIdentificationFields`, `metadata` | `object` | **JSON libero** |
| **Instalment** | `externalId`*, `label`, `dueDate`, `paymentDate`, `paymentMethod` | | |
| | `status`* | `string` | `draft\|due\|partiallyPaid\|paid\|cancelled\|paymentInProgress` |
| **PurchaseOrder** | `status`* | `string` | `draft\|sent\|accepted\|refused\|expired\|partiallyinvoiced\|invoiced\|cancelled\|deleted` |
| | `issueDate`, `dueDate`, `deliveryDate`, `lineItems` | | |
| **DeliveryNote** (solo v2) | `deliveryNoteNumber`*, `deliveryDate`*, `lineItems` | | |
| **Connection** | `id`, `entityId`, `name` | | |
| | `integrationName` | `string` | «nome della fonte dati. Esempio: Sage100, SAP B1» |
| | `source` | `string` | identifica il team responsabile del connettore |

### 3.6 Anagrafiche

| Entità | Campo | Tipo | Note |
|---|---|---|---|
| **Supplier** | `id` | `uuid` | identificativo stabile Agicap |
| | `erpId` | `string` | **chiave di match nelle sincronizzazioni** |
| | `name`, `legalName`, `legalCompanyId`, `vatCode` | `string` | |
| | `thirdPartyCode` | `string` | codice contabile |
| | `status`, `language` (ISO 639-1), `tags` | | |
| | `legalAddress` | oggetto | `number`, `streetName` (**ISO 20022**), `postalCode`, `city`, `state`, `country` |
| | `primaryContact`, `contacts` | | `name`, `email`, `phone`, `role` |
| | `createdAt`, `updatedAt` | `date-time` | |
| **Client (AR)** | `id`*, `externalId`*, `name`*, `reference`*, `legalId`* | `string` | |
| | `electronicInvoicingAddress`* | `string` | Chorus Pro, Peppol |
| | `tags`*, `numberOfContacts`* | | |
| | `averagePaymentDelay`* | `number` | **ritardo medio di pagamento in giorni**, `null` se i dati non bastano |
| | `consolidatedCurrency`*, `consolidatedDueAmount`*, `consolidatedOutstandingAmount`* | | in **unità di valuta**, non centesimi |
| | `dueAmountSummary`*, `outstandingAmountSummary`* | array | ripartizione per valuta con conversione |
| **ExternalContact** | `id`*, `externalId`*, `clientExternalId`*, `name`*, `surname`*, `email`*, `phoneNumber`*, `notes`*, `isMainContact`*, `createdDate`* | | contatto presso il cliente |
| **InternalContact** | `id`*, `externalId`*, `clientExternalId`*, `email`*, `createdDate`* | | referente interno |
| **CreditLimit** | `limit`* / `limitCents`* | `number` | in lettura entrambi, **in scrittura solo i centesimi** |
| | `currency`* | | |
| **Beneficiary** | `id`*, `name`*, `companyLegalIdentifier` | | |
| | `bankAccount`* | oggetto | `identifier` (IBAN/BBAN), `bic`, `bankName`, `country`, `intermediaryBankBic`, `localClearingCode` |
| | `postalAddress` | oggetto | `streetName`*, `city`*, `country`*, `number`, `state`, `zipCode` |
| | `validationStatus` | enum | `Validated\|PendingValidation` |
| | `uncertaintyStatus` | enum | `Uncertain\|NotUncertain\|Irrelevant` |

### 3.7 Connettività bancaria

| Entità | Campo | Tipo | Note |
|---|---|---|---|
| **Connection** | `Id`, `Name` | | |
| | `Type` | `string` | `PUBLIC_API\|SWIFT\|EBICS\|EDITRAN` |
| **BankAccount** | `AccountNumber`, `ConnectionId`, `EntityId`, `CreatedAt` | | ⚠️ **nessun campo di saldo** |
| **Statement** | `Id`, `FileId`, `ConnectionId`, `AccountNumber`, `Filename`, `Format`, `CreatedAt` | | |
| | `IsDuplicate` | `boolean` | «True se l'estratto è già stato importato» |
| **BankFile** | `Id`, `ConnectionId`, `Name`, `Format`, `CreatedAt` | | |
| | `Type` | `string` | `STATEMENT\|ACCOUNT_REPORT\|OTHER\|UNKNOWN` |

### 3.8 Fatturazione elettronica, investimenti, finanziamenti — `[FUORI SCALA]` in gran parte

| Entità | Campi salienti |
|---|---|
| **Flow** (e-invoicing) | `flowId`*, `trackingId`, `flowDirection` (`In\|Out`), `flowType` (`CustomerInvoice\|SupplierInvoice\|CustomerInvoiceLC\|SupplierInvoiceLC\|TransactionReport\|PaymentReport`), `flowSyntax` (`CII\|UBL\|Factur-X\|CDAR\|FRR\|PEPPOL_BIS_3.0\|JsonInvoice\|JsonLifecycle`), `flowProfile` (`Basic\|CIUS\|Extended-CTC-FR`), `submittedAt`, `updatedAt`, `acknowledgement`*. Esiste `FlowMode = Production\|Sandbox` |
| **PivotInvoice** | modello EN 16931 completo: 72 schemi (Seller, Buyer, Payee, Invoicee, TaxRepresentative, Delivery, PaymentMeans, DirectDebit, PaymentCard, InvoicingPeriod, Line, Item, ItemAttribute, Allowance, Charge, TaxBreakdown, Totals…) |
| **Investment** | `id`, `name`, `status`, `amount`, `currency`, `rate`, `subscriptionDate`, `maturityDate`, `closingDate`, `interests {due, accrued}` |
| **Financing** (infragruppo) | `id`, `name`, `startDate`, `lender {name,type}`, `borrower {name,type}`, `balance {value,currency}`, `accruedInterests` |
| **DailyPosition** | `date`, `balance`, `drawDown`, `repayment`, `periodInterests`, `accruedInterests`, `transactions` |

### 3.9 Webhook ed eventi

| Entità | Campo | Tipo | Note |
|---|---|---|---|
| **Webhook** | `id`, `url`, `description` | | |
| | `secret`* | `string` | **HMAC-SHA256 in chiaro, minimo 24 caratteri**, fornito dal sottoscrittore e ruotabile |
| | `eventTypes` | `array<string>` | |
| | `status` | enum | `active\|disabled_by_organization\|disabled_manually\|disabled_for_errors` |
| | `createdAt` | `date-time` | |

⚠️ **Il catalogo dei tipi di evento non è enumerato in nessuna specifica.** `eventTypes` è un array di stringhe libere; l'unico modo documentato per scoprire la forma di un evento è chiamare `send-example` con un tipo che si conosce già. Frammenti ricavabili da altre specifiche (payload minimali, contengono solo l'id della risorsa): `DocumentRecognized`, `InvoiceMarkedAsToVerify / Verified / Disputed / Refused / ToDelete`, `CreditNoteApproved`, `CreditNoteHasDataToVerify`. Separati dai webhook esistono eventi **SignalR** a progressione (`DeleteInvoicesProgress/Completed/Failed`, `LinkDocumentsProgress/Completed/Failed`) con `workflowId`, `entityId`, contatori.

---

## 4. Modello dei ruoli e dei permessi

### 4.1 Cosa dichiara Agicap

`[OSSERVATO]` L'accesso via MCP è «limitato per ruolo e per entità», con gli stessi permessi della piattaforma, e ogni scrittura richiede approvazione umana (articolo del 18 giugno 2026).

`[OSSERVATO]` La guida ufficiale in PDF distingue un solo ruolo esplicito: **l'amministratore**, unico abilitato a generare credenziali API da `app.agicap.com/fr/app/organization-advanced-settings/public-api/clients`.

**Nessun elenco pubblico di ruoli nominati** (tipo «Admin», «Controller», «Viewer») è stato trovato. Non esiste documentazione pubblica di chi vede cosa.

### 4.2 L'architettura: ReBAC su OpenFGA

`[OSSERVATO]` Dagli abstract dei talk di **Pauline Jamin**, Head of Engineering in Agicap e specialista IAM (sessionize.com/pauline-jamin):

- Agicap è **migrata da RBAC a ReBAC** (Relationship-Based Access Control), allineandosi alle raccomandazioni OWASP
- l'implementazione usa **OpenFGA**, progetto sandbox CNCF
- il motivo dichiarato è la risalita verso il midmarket: la logica di autorizzazione era «incorporata nel codice applicativo e difficile da adattare»
- usano strumenti **BDD** perché i Product Manager possano definire direttamente i casi d'uso di autorizzazione
- a Devoxx France 2026 (aprile 2026) hanno presentato **«ReBAC à l'échelle : sauvons le p99»**: la latenza al 99° percentile è il loro problema aperto. Il repository delle slide esiste ma è vuoto

`[DEDOTTO]` In ReBAC non ci sono ruoli globali: il permesso deriva dalla **relazione** fra un utente e un oggetto di dominio. Questo spiega perché non esista una lista pubblica di ruoli — nel loro modello non è la nozione portante.

### 4.3 Le tracce del modello nelle API pubbliche

`[OSSERVATO]`

- `POST /public/ar-clients/v1/entities/{entityId}/user-rights` — «Assign users to clients by external id». Assegna **utenti identificati per email** a un **cliente identificato per id ERP**. È una relazione utente↔oggetto: la forma esatta di una tupla ReBAC, non di un ruolo.
- Nella UI: voci di menu **«Utilisateurs et permissions»** e **«Demandes d'accès»**. Gli scope `email_template:access_request:send-request / send-granter / send-requester / send-response / send-accept-requester / send-reject-requester` descrivono un **flusso di richiesta e concessione dell'accesso fra utenti** — non un'assegnazione top-down da parte di un amministratore.
- Gerarchia dei perimetri, dagli scope: **organizzazione → workspace → entità** (`access_management:organization`, `:workspace`, `:entity`).

### 4.4 La tassonomia dei diritti, dagli scope OIDC

`[OSSERVATO]` 32 scope `access_management:*` su tre livelli distinti:

- **`product_*`** — l'abbonamento: `product_cashflow`, `product_payments`, `product_accounts_payable`, `product_accounts_receivable`, `product_cashcollect`, `product_invoicing`, `product_einvoicing`
- **`module_*`** — funzioni attivabili: `module_expense_claims`, `module_treasury_bank_journal`, `module_treasury_pnltocash`, `module_try_reconciliation`
- **perimetri e trasversali**: `organization`, `entity`, `workspace`, `internal_user`, `permissions`, `subscription`, `invitation_flows`, `ai_assistant`, `lab`, più i domini `risk_management`, `debt_management`, `financial_investments`, `internal_financing`, `treasury_bank_fees`, `spend`

### 4.5 I permessi della Public API: quattro scope granulari, e sono tutti sui pagamenti

`[OSSERVATO]` L'intera Public API è governata da cinque scope, confermati sia dalla discovery OIDC sia dalla libreria client .NET di terze parti:

| Scope | Copre |
|---|---|
| `agicap:public-api` | **tutto il resto**: giornale di banca, fatture, clienti, piano dei conti, webhook… |
| `public-api:import_payment_files` | importare file di pagamento |
| `public-api:import_payment_files_with_signed_beneficiaries` | idem, con IBAN firmati obbligatori |
| `public-api:manage-payment-beneficiaries` | gestire i beneficiari |
| `public-api:manage-suppliers` | gestire i fornitori |

`[DEDOTTO]` Quattro permessi dedicati su ~90 operazioni, e riguardano tutti e quattro il denaro che esce o l'anagrafica di chi lo riceve. Cancellare tutti i clienti AR di un'entità richiede lo stesso scope che serve a leggere il piano dei conti. **La granularità è stata investita esattamente dove il rischio è irreversibile e monetario**, non dove il volume di dati è grande. È una scelta di progetto difendibile e vale la pena imitarla.

---

## 5. Cosa è scrittura e cosa sola lettura

`[OSSERVATO]`

### Sola lettura (nessuna operazione di modifica)

| API | Note |
|---|---|
| `organizations v1` | 2 GET |
| `card-expenses-bank-journal v1` | 1 GET |
| `financial-investments v1` | 4 GET |
| `intragroup-financing v1` | 3 GET |

### Lettura + scrittura ristretta

| API | Cosa si può scrivere |
|---|---|
| `treasury-bank-journal v1` | **non si scrivono scritture**: si crea un *export* (POST) che cambia lo stato da «Ready to export» a «Exported», si creano causali, si riscontra l'esito dell'import nell'ERP |
| `purchase-journal v1` | solo segnalare errori sulle scritture già esportate |
| `invoices-management v1` | solo `mark-as-verified`. Le liste sono POST **ma sono letture** (filtro nel body) |
| `banking-documents v1` | creare/eliminare connessioni, caricare ed eliminare file. Non si scrivono transazioni |
| `client-risk v1` | CRUD completo sui limiti di fido |
| `events v1` | CRUD sui webhook |

### Scrittura piena, incluse cancellazioni di massa

| API | Operazione più pesante |
|---|---|
| `ar-clients v1` | `DELETE /clients` — cancellazione di clienti; idem indirizzi e contatti |
| `payments v2` | `DELETE /Beneficiaries` — **«Delete all beneficiaries»**; import di file di pagamento |
| `business-documents v1/v2` | POST/PUT su nove tipi documentali |
| `chart-of-accounts v1` | import e cancellazione di conti e terze parti; bulk-create/update/delete sugli assi analitici |
| `suppliers v1` | sincronizzazione a lotti (crea, aggiorna, cancella in una chiamata) |
| `einvoicing v1` | creazione di flussi, aggiunta di transazioni B2C all'e-reporting |

`[DEDOTTO]` Il criterio di fondo: **la contabilità di Agicap non è scrivibile dall'esterno.** Il giornale di banca e il giornale acquisti si possono solo leggere ed esportare; ciò che entra sono documenti, anagrafiche e file bancari, che Agicap poi contabilizza per conto proprio. Il confine passa fra «dati che alimentano il motore» (scrivibili) e «risultati del motore» (in sola lettura). È una scelta che protegge l'integrità del libro contabile e che vale per WEISS almeno quanto per loro.

---

## 6. Osservazioni di modellazione riusabili da WEISS

`[DEDOTTO]` Le scelte che mi paiono meritevoli di essere copiate o almeno considerate:

1. **Doppio identificativo su ogni entità: `id` interno + `externalId` del sistema di origine.** Compare ovunque — fatture, clienti, fornitori, conti, terze parti, beneficiari, documenti. Su fornitori e beneficiari l'`erpId` è esplicitamente **la chiave di upsert**. È il meccanismo che rende le sincronizzazioni idempotenti senza tabelle di corrispondenza.

2. **Il chiamante genera l'identificativo dell'export.** `exportId` è un UUID prodotto dal client e passato nell'URL: l'operazione diventa idempotente e ripetibile senza rischio di duplicati. Vale la pena adottarlo per le chiusure di cassa.

3. **Contatori di continuità con l'esterno.** `currentBankJournalsCountInYear` e `currentBankJournalEntriesCountInYear` servono a innestare la numerazione di Agicap su quella di un sistema preesistente. È il problema che si presenta ogni volta che un gestionale nuovo affianca uno vecchio a metà anno.

4. **Doppia colonna valuta su ogni riga contabile**: `originalCurrency` + `accountingCurrency`, con `exchangeRate` e quattro colonne dare/avere. Per WEISS, monovaluta, è `[FUORI SCALA]` — ma la struttura a due assi analitici distinti (`analyticalCodes` sul conto di costo, `additionalAnalyticalCodes` sul portatore di costo) è direttamente pertinente al piano dei conti v4 con centri di costo.

5. **`expectedPaymentDate` distinta da `dueDate` e da `paymentDate`.** Tre date diverse: scadenza contrattuale, data attesa stimata, data di pagamento effettiva. È esattamente la distinzione che serve a una previsione di cassa onesta.

6. **`metadata: object` e `erpIdentificationFields: object` come JSON libero** su tutti i documenti commerciali. Valvola di sfogo per l'eterogeneità dei sistemi di origine, senza migrazioni di schema.

7. **`averagePaymentDelay` calcolato e memorizzato sul cliente**, con `null` esplicito quando i dati non bastano. Un campo derivato che diventa parte dell'anagrafica.

8. **Stati documentali espliciti e granulari**: fattura `draft|due|paid|cancelled|deleted`, rata `draft|due|partiallyPaid|paid|cancelled|paymentInProgress`, ordine con nove stati incluso `partiallyinvoiced`. Il `paymentInProgress` sulla rata è quello che manca a molti modelli e che serve per non contare due volte un pagamento in volo.

9. **Il webhook secret lo fornisce il sottoscrittore**, non Agicap: HMAC-SHA256, minimo 24 caratteri, ruotabile. E gli stati del webhook distinguono `disabled_for_errors` da `disabled_manually` da `disabled_by_organization` — chi l'ha spento e perché.

10. **Granularità dei permessi concentrata sulle operazioni irreversibili e monetarie.** Quattro scope dedicati su novanta operazioni, tutti sui pagamenti e sui beneficiari.

### `[FUORI SCALA]` per WEISS

Multi-valuta con tasso di cambio su ogni riga · cash pooling e arbitraggio infragruppo (`intragroup-financing`, `access_management:internal_financing`) · consolidamenti (`consolidations_read`) · gestione degli investimenti della liquidità in eccesso (`financial-investments`) · EBICS, SWIFT, EDITRAN, Konfipay · integrazione ERP (Sage100, SAP B1, NetSuite) · fatturazione elettronica francese (Factur-X, CDAR, `Extended-CTC-FR`, Chorus Pro) — l'Italia ha SDI dal 2019 · gerarchia organizzazione→workspace→entità con più entità giuridiche · `treasury_bank_fees` e `debt_management`.

---

## Cosa non sono riuscito a determinare e perché

1. **I tool MCP di Agicap: nomi, parametri, schemi.** Non sono pubblici, e non esiste un endpoint, un pacchetto o un registro da cui leggerli. È il limite centrale di questo incarico. Ho stabilito con certezza che l'MCP esiste (sette scope OAuth dedicati) e cosa dichiara di esporre, ma il contratto tecnico è servito solo a un client autenticato — e connettersi era fuori perimetro.

2. **Le istruzioni di configurazione dell'MCP.** Nessuna trovata: né sul sito, né nel blog, né in guide. Se esistono, vivono nell'help center in-app, dietro login.

3. **Il modello dati del livello analitico** — posizione di cassa, previsione, KPI, scostamenti, gestione del debito. Non ha API REST pubblica. Ne conosco l'esistenza solo dagli scope interni (`cashflow:read`, `expectations:read`, `refinement:*`, `custom-dashboards-intake:cashflow`, `debt-management:debt-data-series-read`) e da ciò che l'MCP dichiara di esporre. **Le entità e i campi di quella parte restano ignoti**, ed è proprio la parte più vicina a ciò che WEISS sta costruendo.

4. **Il catalogo dei tipi di evento dei webhook.** `eventTypes` è un array di stringhe libere; nessuna specifica lo enumera. Ho solo otto nomi ricavati indirettamente dagli schemi `Event.*` del modulo P2P.

5. **I limiti di rate.** Il 429 è documentato come risposta possibile, ma nessuna specifica dichiara soglie numeriche.

6. **L'elenco dei ruoli nominati e la matrice chi-vede-cosa.** Non esiste documentazione pubblica. So che il modello è ReBAC su OpenFGA e che il PDF distingue l'amministratore, ma la matrice dei permessi non è ricostruibile dall'esterno — e in un modello ReBAC potrebbe semplicemente non esistere in quella forma.

7. **Il contenuto del portale sviluppatori** (`api.agicap.com/apis`, `/api-details/*`, `/guides/*`, `llms.txt`). È una SPA: WebFetch restituisce solo il titolo. Le specifiche le ho lette da una copia di terze parti, verificata contro due fonti Agicap indipendenti, ma il testo delle guide narrative resta non letto.

8. **Le slide di «ReBAC à l'échelle : sauvons le p99»** (Devoxx France, aprile 2026): il repository esiste ma è vuoto. Il video del talk precedente su ReBAC esiste su YouTube e non l'ho trascritto.

9. **Se le due versioni di `business-documents` siano entrambe attive** o se la v1 sia in deprecazione. Nessun avviso di deprecazione nelle specifiche.
