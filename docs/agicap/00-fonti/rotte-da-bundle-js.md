# Agicap — mappa delle rotte di `app.agicap.com` ricostruita dal bundle JavaScript

Ricognizione su risorse statiche pubbliche, per WEISS S.r.l.
**Data della ricognizione: 11 agosto 2026.**

---

## Metodo e confini rispettati

| Vincolo | Come è stato rispettato |
|---|---|
| Solo risorse statiche pubbliche | Solo file `.js` e il documento HTML della pagina di login, serviti da `https://app.agicap.com/`. |
| Nessun user-agent falsificato | `curl` con il proprio user-agent predefinito. Il dominio risponde normalmente: **non blocca i client non-browser**, a differenza di `help.agicap.com`. |
| Nessuna chiamata alle API | Nessun endpoint interrogato. Dove il bundle rinvia al server (griglia tariffaria, feature flag, traduzioni) mi sono fermato e l'ho annotato come lacuna. |
| Nessun tentativo di login | Nessuna credenziale, nessuna richiesta autenticata. La pagina di login è stata solo scaricata, non compilata. |
| Nessuna ricerca di accessi | Non ho sondato URL a tentativi né cercato di raggiungere rotte protette. Le rotte sotto sono lette dal codice, non visitate. |
| Ritmo umano | 20 file scaricati in tutto, con pausa fra le richieste. |

**Esito tecnico**: il bundle è **completamente leggibile**. È Angular compilato con esbuild; il codice
è minificato ma non offuscato, e le rotte non sono stringhe sparse — sono costruite da un registro
tipizzato con chiamate `append("segmento", …)`, il che ha permesso di ricostruire l'albero delle URL
in modo esaustivo anziché per campionamento.

> **[DEDOTTO] vale per tutto questo documento.** Nessuna rotta è stata visitata. Una rotta presente
> nel registro può essere morta, sperimentale, dietro un flag mai acceso, o riservata a un modulo che
> nessun cliente ha comprato. Non trattare questo elenco come un inventario di funzionalità esistenti:
> è un inventario di **ciò che il codice prevede**.

### File letti

`/it/app/account/login` (HTML, 41 KB) · `main-7ZD6MHNE.js` (113 KB) · `polyfills-56NDLJYW.js` ·
`chunk-TYGMUP5S.js` (registro globale) · `chunk-4KGADOQN.js` (registro tesoreria, 130 KB) ·
`chunk-HVHRAA5U.js` (permessi, 39 KB) · `chunk-QDEXM3D4.js` (prodotti) · `chunk-NYGO3QBF.js`
(tesoreria) · `chunk-ZOMGJKD5.js` (consolidamento) · `chunk-NSL54GYO.js` (impostazioni) ·
`chunk-MOBTYCLY.js` (abbonamento, 142 KB) · `chunk-3SSR5INR.js` (accesso) · `chunk-M5CIOQHQ.js` ·
`chunk-5MEJWBMA.js` · `chunk-5MQEDEY2.js` (layout) · `chunk-Y7ETUKNT.js` · `chunk-NARDMHQU.js` ·
`chunk-4DPT2MFE.js` (locale it) · `chunk-TS2JADFN.js` · `chunk-HUP5WLRJ.js`.

Estratti grezzi in `assets/agicap/materiali-pubblici/bundle-*.md`.

---

## 1. Struttura delle URL

```
https://app.agicap.com/<locale>/app/<rotta>
                        ─┬────  ─┬─
                         │       └─ prefisso fisso dell'applicazione
                         └───────── it | fr | de | es | en | en-us
```

`https://app.agicap.com/` reindirizza (302) a `/en/`. Il `<base href>` del documento è `/`, quindi i
chunk stanno alla radice del dominio, non sotto il locale.

**220 rotte canoniche distinte** ricostruite dai due registri. Sotto sono raggruppate per area.

---

## 2. Rotte fuori dall'applicazione autenticata

| Rotta | Cosa fa [DEDOTTO] |
|---|---|
| `access/signin` | login |
| `access/signup` | registrazione autonoma |
| `access/sign-out` | uscita |
| `access/forgot-password` | recupero password |
| `access/company-configuration` | configurazione iniziale dell'azienda dopo la registrazione |
| `access/invitation`, `invitations` | accettazione di un invito |
| `first-connection` (alias legacy `premiereConnexion`) | onboarding alla prima connessione |
| `product-demo` | percorso demo di prodotto |
| `account-manager/request-demo` (alias `request-demo`) | richiesta di demo |
| `no-product-accesses` | schermata mostrata a chi non ha alcun prodotto attivo |
| `partner`, `partners`, `partners/cdn`, `partners/cdn/connect` | connessione via partner |
| `auth/callback`, `callback` | ritorno dal provider di identità |

---

## 3. I cinque prodotti — l'unità di vendita nel codice

Enum dei prodotti, trascritto da `chunk-QDEXM3D4.js`:

| Simbolo | Sigla | Etichetta UI (sorgente EN) | Rotta d'ingresso | Relazione di attivazione |
|---|---|---|---|---|
| `CashFlow` | CF | Cashflow | `default-page` | `has_product_cashflow` |
| `AccountsPayable` | AP | Expenses | `expenses` | `has_product_accounts_payable` |
| `CashCollect` | CC | CashCollect | `cashcollect` | `has_product_accounts_receivable` |
| `Payment` | — | Payment | `payments` | `has_product_payments` |
| `EInvoicing` | — | E-Invoicing | `e-invoicing` | `has_product_einvoicing` |

All'avvio l'app valuta le cinque relazioni `has_product_*`, prende il primo prodotto a cui l'utente
ha accesso e ci reindirizza; se nessuno, manda a `no-product-accesses`.

**[DEDOTTO]** Questi cinque nomi corrispondono uno a uno alle linee di prodotto della pagina tariffe
francese del redesign 2026 (Gestion de trésorerie, Gestion du poste fournisseurs, Gestion du poste
clients, Paiements, e la fatturazione elettronica). La sesta linea commerciale — «Connectivité
bancaire & ERP» — **non esiste come prodotto nel codice**: è infrastruttura, coerentemente con la
nota di pagina «connettività inclusa in ogni offerta».

---

## 4. Rotte del prodotto Cashflow / Tesoreria

| Rotta | Cosa fa [DEDOTTO] | Fonte nel bundle |
|---|---|---|
| `default-page` | pagina di ingresso del prodotto | `treasuryRoutes` |
| `cashflow` → `cashflow/forecast` | piano di cassa previsionale | MFE `mfe-cash-flow-plan` |
| `cashflow/forecast/category` | previsionale per categoria | MFE `mfe-cash-flow-plan-category` |
| `cashflow/comparison` | confronto fra scenari | MFE `mfe-cash-flow-plan-comparison` |
| `cashflow/project-based` | previsionale per progetto | MFE `mfe-cash-flow-plan-project` |
| `cashflow/forecast/google-sheets/authorize`, `.../import` | import da Google Sheets | `treasuryRoutes` |
| `cashflow/forecast/microsoft-sheets/import` | import da Excel Online | `treasuryRoutes` |
| `short-term-cash-management` (alias `short-term`, `visionJournaliere`) | tesoreria a breve | `treasuryRoutes` |
| `short-term-cash-management/balance-summary` · `/timeline` | saldi e linea temporale | registro |
| `short-term-cash-management/cash-flow-table` | tabella dei flussi | registro |
| `short-term-cash-management/value-date-statement` | estratto per data valuta | registro |
| `13-weeks-forecast` | scorciatoia: reindirizza alla tabella con `frequency=Weekly&from=4&to=13` | `treasuryRoutes` |
| `paid`, `paid/list`, `paid/cold-categorization` | transazioni incassate/pagate, ricategorizzazione massiva | `PAID_TRANSACTIONS_LIST_ROUTES` |
| `expected`, `/list`, `/late`, `/cold-categorization`, `/recurrences`, `/recurrences-suggestions` | transazioni attese, scadute, ricorrenze e loro suggerimenti | `EXPECTED_TRANSACTIONS_LIST_ROUTES` |
| `categories`, `categories/inflow`, `categories/outflow` (alias FR `encaissements`/`decaissements`) | albero delle categorie | `CategoriesModule` |
| `pnl-to-cash`, `/conversion`, `/conversion/categories`, `/conversion/delay-due-date`, `/conversion/investment-funding` | conversione del budget di conto economico in previsionale di cassa | `treasuryRoutes` |
| `reconciliation` | riconciliazione | MFE `ReconciliationMfeComponent` |
| `bank-journal` | giornale di banca | `BankJournalModule` |
| `chart-of-accounts` | piano dei conti | registro |
| `banks` | conti bancari e integrazioni | `BankAndIntegrationsComponent` |
| `banking-fees` | **commissioni bancarie** | MFE `banking-fees-app` |
| `financial-position` | posizione finanziaria netta | MFE `financial-position-front-mfe` |
| `debt-management` | gestione del debito | MFE `debt-management-front-mfe` |
| `financial-investments` | impieghi e investimenti | MFE `financial-investments-front-mfe` |
| `internal-financing`, `/financings` | finanziamenti infragruppo | MFE `internal-financing-front-mfe` |
| `risk-management`, `/fx-management/hedging` | rischio di cambio e coperture | MFE `risk-management-mfe` |
| `invoice-financing` | factoring / finanziamento fatture | `InvoiceFinancingModule` |
| `reporting`, `/mfe`, `/edition`, `/default` | reportistica | `treasuryRoutes` |
| `dashboards` | cruscotti | registro |
| `search` | ricerca transazioni | MFE `mfe-entity-search-transactions` |
| `import`, `import/:id/details` | import dati | `importRoutes` |
| `export/excel` | export Excel | `ExportExcelModule` |
| `banqueApi` | collegamento API bancaria | registro |

**[DEDOTTO]** `banking-fees` — l'analisi delle commissioni bancarie — non compare in nessuna pagina
pubblica di Agicap, in nessuna lingua. Ha un micro-frontend dedicato e due livelli di attivazione
(`has_module_treasury_bank_fees` e `has_module_treasury_bank_fees_advanced`).

---

## 5. Rotte degli altri prodotti

Il bundle radice contiene solo i punti d'ingresso; gli alberi interni stanno in chunk che non ho
scaricato (sarebbe stato scraping massivo per poco valore).

| Prodotto | Punto d'ingresso | Note dal codice |
|---|---|---|
| Expenses (AccountsPayable) | `expenses`, `expenses/invoices` | un matcher riscrive `payments` sotto `expenses` |
| CashCollect (AccountsReceivable) | `cashcollect` | matcher su prefisso `cashcollect` |
| Payment | `payments` | matcher su prefisso `payments`; flag `PaymentAsProduct` decide se è prodotto a sé |
| E-Invoicing | `e-invoicing` | `E_INVOICING_ROUTE` |
| Assistente IA | `ai-assistant` | doppia implementazione: `AiAssistantComponent` e `AiAssistantOldComponent`, con flag `core.foundations.new_ai_assistant_front` |

---

## 6. Consolidamento — 33 rotte

Tutte sotto `consolidation/:consolidationId/…`, più `consolidation/from-workspace-id/:workspaceId`.

`default-page` · `dashboard` · `dashboards` · `cash-flow` · `balance_sheet` · `accounts-receivable` ·
`short-term-cash-management` (+ `/cash-flow-table`) · `expected` (+ `/list`, `/recurrences`,
`/recurrences-suggestions`) · `categories` (+ `/inflow`, `/outflow`) · `export` · `no-company` ·
`financial-position` · `debt-management` · `financial-investments` · `internal-financing` ·
`risk-management` · `parameters` (+ `/users`, `/key-indicators`) · `settings` (+ `/management-rules`,
`/kpis`, `/categories/inflow`, `/categories/outflow`).

**[DEDOTTO]** Il consolidamento replica quasi per intero l'albero del prodotto Cashflow a un livello
superiore. È una seconda applicazione, non una vista aggregata. Per WEISS è **[FUORI SCALA]**.

---

## 7. Impostazioni — 68 rotte sotto `all-settings`, 11 sotto `organization-advanced-settings`

La struttura è la prova più netta di come Agicap separa **entità** e **organizzazione**: ogni area di
impostazioni ha due alberi paralleli caricati dallo stesso chunk
(`…EntitiesLevelSettingsRoutes` / `…OrganizationLevelSettingsRoutes`).

**`all-settings/general`** — `preaccounting` · `public-api` · `mcp-settings` · `ai-assistant-settings`
· `webhooks-settings` · `security`

**`all-settings/treasury`** — `categories` · `management-rules` · `calendar` · `exchange-rates` ·
`cash-flow-plan` · `home-page` · `fx-management` · `cashs-pools` · `reconciliation/v3` ·
`bank-journal` (+ `/general`, `/automations`) · `cash-positioning` (+ `/type-and-thresholds`,
`/balancing-transfer`, `/estimate-rules`, `/overdraft-availability`) · `variance-analysis`
(+ `/freeze-forecast`, `/thresholds`)

**`all-settings/account-payable`** — `mandatory-fields` · `budgets` · `cost-centers` ·
`expense-natures` · `line-items` · `beneficiaries` · `suppliers` · `spend-controls` ·
`spend-notifications` · `spend` (+ `/funding-sources`, `/transaction-approval-workflow`) ·
`accounting` (+ `/accounting-plan`, `/analytical-plan`, `/purchase-journal-automations`,
`/export-settings`, `/datev-integration`) · `workflows/invoice` · `workflows/purchase-request` ·
`workflows/card-requests` · `workflows/expense-claims`

**`all-settings/accounts-receivable`** — `general-settings` · `follow-ups` · `expected-transactions` ·
`invoice-financing` · `advanced-settings` · `payments`

**`all-settings/payments`** — `security` · `all-in-one-preference` · `company-legal-information` ·
`validation-rules` · `aggregated-bank-accounts` · `expected-transactions`

**`all-settings/e-invoicing`** — `registrations`

**`organization-advanced-settings`** — `homepage` · `cash-pool` · `public-api` · `categories` ·
`exchange-rates` · `liquidity-planning` · `reconciliation-settings/v2` · `payments/beneficiaries` ·
`preaccounting/preaccounting` · `account-payable/mandatory-fields`

**[DEDOTTO] Tre osservazioni che contano per WEISS:**
- `account-payable/cost-centers`, `expense-natures`, `analytical-plan`, `accounting-plan`: esiste una
  **contabilità analitica** con centri di costo e piano analitico separato dal piano dei conti.
- `treasury/variance-analysis/freeze-forecast`: il previsionale si può **congelare** per confrontare
  consuntivo e budget su una baseline immutabile.
- `treasury/cash-positioning/estimate-rules`: regole di **stima** della data di incasso/pagamento.

---

## 8. Amministrazione, abbonamento, integrazione

| Rotta | Cosa fa [DEDOTTO] |
|---|---|
| `entities-management`, `/consolidations` | gestione delle entità legali e dei perimetri di consolidamento |
| `user-rights-management`, `/users`, `/invitations` | utenti, ruoli, inviti |
| `access-requests` | richieste di accesso (MFE `user-access-requests-mfe`) |
| `user-account` | profilo dell'utente |
| `subscription`, `/current`, `/invoices`, `/billing-information`, `/payment-method` | **abbonamento self-service**: fatture, dati di fatturazione, metodo di pagamento |
| `subscription/subscribe` | **flusso di sottoscrizione con griglia tariffaria** |
| `data-integration`, `/connectivity`, `/bank-account-manager`, `/banking-audit` | connessioni bancarie, gestione conti, audit della connettività |
| `public-api` | console API pubblica |
| `all-settings/general/mcp-settings` | configurazione del server MCP |

---

## 9. Feature flag e chiavi di gating

### 9.1 Cosa c'è nel bundle

Solo tre flag compaiono come stringa letterale:

| Chiave | Dove |
|---|---|
| `core.foundations.new_ai_assistant_front` | guardia `canMatch` della rotta `ai-assistant` — decide fra la nuova e la vecchia implementazione |
| `core.tracking.gtm.remove_for_safari` | tracciamento |
| `PaymentAsProduct` | chiave di enum valutata a runtime: decide se «Payments» è un prodotto a sé |

L'elenco completo dei flag arriva da un endpoint (`FEATURE_FLAGS_ENDPOINT`). **Non interrogato.**

### 9.2 Il vero meccanismo di gating: 362 «relazioni»

`chunk-HVHRAA5U.js` contiene l'enum completo delle relazioni che il front-end valuta. Sono divise in
famiglie che rivelano l'architettura commerciale con precisione:

| Prefisso | N. | Significato [DEDOTTO] |
|---|---|---|
| `has_product_*` | 5 | il **prodotto** è nell'abbonamento |
| `has_module_*` | 24 | il **modulo** è attivo |
| `has_organization_module_*` / `has_organization_product_*` | 20 | attivo a livello di organizzazione, non di singola entità |
| `has_temporary_module_*_access` / `has_temporary_product_*_access` | 22 | **accesso temporaneo/prova, modulo per modulo** |
| `has_feature_*` | 3 | interruttori fini |
| `can_access_*` | 57 | permesso dell'utente di aprire l'area |
| `can_read_*` | 32 | permesso di lettura |
| `can_write_*` / `can_manage_*` | 55 | permesso di scrittura/amministrazione |
| `can_export_*` | 6 | permesso di esportare |
| `active_subscription`, `active_trial_period`, `can_subscribe`, `can_access_with_subscription` | 4 | stato commerciale |

**I 24 moduli attivabili** (`has_module_*`):
`treasury_pnltocash` · `treasury_bank_journal` · `treasury_bank_fees` · `treasury_bank_fees_advanced`
· `debt_management` · `financial_investments` · `internal_financing` · `risk_management` ·
`try_reconciliation` · `ar_reconciliation` · `ap_preaccounting` (`accounts_payable_preaccounting`) ·
`ar_preaccounting` · `cash_collect` · `card_expenses` · `expense_claims` · `purchase_order` ·
`purchase_requests` · `supplier_invoices` · `payments` · `einvoicing_activation` ·
`einvoicing_client_invoice` · `einvoicing_supplier_invoice` · `einvoicing_ereporting` · `ai_assistant`

### 9.3 Cosa questo dice del modello commerciale

1. **Il gating è a tre livelli**, non due: prodotto → modulo → permesso utente. Un cliente può avere
   il prodotto Cashflow ma non il modulo `treasury_bank_journal`; e un utente dentro quel cliente può
   avere il modulo ma non il permesso di scriverci.
2. **La distinzione organizzazione/entità è cablata nel prodotto.** Corrisponde esattamente
   all'«Interfaccia Azienda» delle Condizioni Generali, cioè all'unità su cui si paga.
3. **Esiste un intero apparato di accesso temporaneo per singolo modulo** (`has_temporary_*`). È il
   meccanismo con cui si accende una prova su un modulo specifico — coerente con una vendita
   incrementale modulo per modulo.
4. **`has_module_treasury_bank_fees` e `has_module_treasury_bank_fees_advanced`**: perfino un singolo
   modulo ha due livelli. Il gating è più granulare di qualsiasi listino a tre tier.
5. **`has_module_ai_assistant` esiste.** L'IA è un modulo attivabile, benché la pagina tariffe
   francese la presenti come inclusa in ogni abbonamento. **[DEDOTTO]** o la nota commerciale è
   generosa, o il flag serve solo a spegnere l'IA su richiesta del cliente.

### 9.4 La griglia tariffaria esiste, ma non è nel bundle

Il modulo abbonamento contiene un componente che rende una **matrice piani × sezioni × funzionalità**:

```js
this.pricingGrids$ = c(Bt).getPricingGrids()...
planFeatures(i,e,n){ return i.map(o => o.features.find(l => l.sectionId===e && l.featureId===n)) }
u("disabled", !n.canChoosePlan)
```

I nomi dei piani e il contenuto delle celle arrivano da `getPricingGrids()`, cioè dal server.
**Non interrogato**, per vincolo di incarico. È la conferma che la matrice funzionalità × piano che
non trovavamo sul sito pubblico **esiste come dato strutturato**, visibile solo dentro
`/app/subscription/subscribe` a utente autenticato.

---

## 10. Lessico italiano — esito negativo, e perché

**Le stringhe italiane non sono nel bundle statico.** L'app usa `$localize` di Angular con traduzioni
caricate a runtime: nel bundle restano gli **identificatori di messaggio** e il **testo sorgente in
inglese**.

```js
gs(() => Yt(M.TRANSLATIONS_BUCKET).pipe(O(e => `${e}/v1/${Dp}/${Op}`)))
// Dp = "cm-agicap-front"   Op = "agicap-app"
```

L'URL del bucket viene dalla configurazione runtime, risolta da una chiamata al server: fermato lì.

L'unico artefatto italiano servito staticamente è il locale di **moment.js** (`chunk-4DPT2MFE.js`,
2 067 byte): nomi di mesi e giorni, formati di data, `"alcuni secondi"`, `"un minuto"`, `"un giorno"`.
Non è lessico di dominio.

Ho comunque raccolto **68 identificatori di messaggio con il loro testo sorgente inglese** dai chunk
letti (in `bundle-localizzazione.md`). I namespace osservati — `product.*`, `subscription.*`,
`consolidation.*`, `short-term-management.*`, `user-menu.*`, `import.*`, `country.*` — sono a loro
volta una mappa delle aree dell'applicazione.

Lingue nel menu utente: EN, EN-US, FR, DE, **IT**, ES. Nel bundle esiste anche il locale `nl-NL`, che
nel menu non compare — **[DEDOTTO]** olandese in preparazione o dismesso.

Il documento HTML di `/it/app/account/login` ha `<html translate="no" lang="en">` e non contiene testo
visibile oltre alla parola «Agicap»: l'intera interfaccia è renderizzata dal JavaScript.

---

## 11. Entità e campi esposti dal client

Il bundle non espone uno schema di dominio: è Angular compilato, i tipi TypeScript sono cancellati.
Quello che resta sono i **nomi dei parametri di rotta** e gli identificatori del modulo abbonamento.

Parametri di rotta osservati: `companyId`, `userId`, `organizationId`, `consolidationId`,
`workspaceId`, `entityId`, `:estEncaissement/:estEngagee` (residuo francese nella rotta di import:
«è un incasso» / «è impegnata»).

Header applicativo: `EntityIdHeader`. Prefissi API citati nel codice ma **non interrogati**:
`/api/`, `/api/bff-categories/v2`, `/connect/userinfo`, più host di configurazione
(`rebaccaApiHost`, `myAccountHost`, `featureFlagsEndpoint`).

Identificatori del modulo abbonamento: `subscriptionId`, `subscriptionName`, `subscriptionOrder`,
`subscriptionOrderId`, `billingInformation`, `billingAddressLine1/2`, `billingCity`,
`billingPostalCode`, `billingCountry`, `paymentMethod`, `paymentMethodTypes`, `paymentSchedule`,
`paymentScheduleTypeLabel`, `paymentReceipts`, `invoices`, `couponValue`.

**[DEDOTTO]** L'esistenza di `couponValue` nel flusso di sottoscrizione conferma che gli sconti sono
previsti nel prodotto, non solo in trattativa — coerente con la clausola delle Condizioni Generali che
esclude gli «sconti eccezionali» dalla base di indicizzazione al rinnovo.

---

## 12. Cosa non sono riuscito a determinare, e perché

1. **Le stringhe italiane dell'interfaccia.** Caricate a runtime da un bucket il cui URL viene dalla
   configurazione server. Recuperabile solo dal browser, in Fase 1.
2. **L'elenco completo dei feature flag.** Arriva da `FEATURE_FLAGS_ENDPOINT`. Non interrogato.
3. **I nomi dei piani e la matrice funzionalità × piano.** Esistono come dato (`getPricingGrids()`)
   ma vivono dietro l'autenticazione, nel flusso `/app/subscription/subscribe`.
4. **Gli alberi interni di Expenses, CashCollect, Payments ed E-Invoicing.** Ho mappato i punti
   d'ingresso; scendere avrebbe richiesto di scaricare decine di chunk. Se serve, si fa mirato.
5. **Lo schema delle entità di dominio.** I tipi TypeScript non sopravvivono alla compilazione.
6. **Quali rotte siano vive.** Nessuna è stata visitata, per vincolo di incarico. `AiAssistantOldComponent`
   accanto a `AiAssistantComponent`, e `reconciliation/v3` accanto a `reconciliation-settings/v2`,
   sono indizi che l'albero contiene sia il vecchio sia il nuovo.

---

## 13. Come usare questo documento nella fase successiva

L'inventario delle rotte accessibili/bloccate si costruisce incrociando due elenchi:

- **questo**, che dice *cosa esiste nel codice* — 220 rotte, 5 prodotti, 24 moduli;
- quello che risulterà **dalla navigazione autenticata**, che dirà *cosa è raggiungibile*.

La differenza fra i due è l'inventario delle lacune. Le relazioni `has_product_*` e `has_module_*`
sono la chiave di lettura: ogni rotta non raggiungibile ricade sotto una di quelle 29 relazioni, e
sapere quale dice **perché** è bloccata — prodotto non acquistato, modulo non attivo, o permesso
utente mancante.
