# Cash King — Inventario rotte e mappa dell'applicazione

**Prodotto:** Cash King (CashKing) — cashking.biz
**Versione osservata:** v0.26.5 (indicata in fondo alla sidebar)
**Account:** trial Weiss Srl, utente Nicola Scarpa — ambiente sandbox con dataset dimostrativo
**Data rilevazione:** 10 agosto 2026
**Scadenza accesso:** 30 agosto 2026

Convenzione dei tag: `[OSSERVATO]` = visto direttamente in UI o in risposta API ·
`[VERIFICATO]` = confermato da un esperimento con input noti **oppure da una
ricerca esaustiva dichiarata** (per esempio: cercata una schermata in tutte le
sezioni, o una stringa in tutto il bundle, e non trovata) ·
`[DEDOTTO]` = ricostruito con ragionamento · `[IPOTESI]` = congettura da validare ·
`[NON ESPLORABILE]` = esiste ma non accessibile con questo account.

---

## 1. Architettura tecnica di superficie

`[OSSERVATO]` Single Page Application React servita da Google App Engine
(header `server: Google Frontend`), build Vite: la pagina è un guscio
`<div id="root">` con un unico bundle `/assets/index-iAgxfbLC.js` da **7,2 MB**.

`[OSSERVATO]` Le pagine pubbliche sono pre-renderizzate lato server (una GET di
`/prezzi` restituisce 466 KB con `<title>` e meta Open Graph propri), mentre le
pagine applicative sono renderizzate solo lato client.

`[OSSERVATO]` L'HTML di produzione referenzia anche `https://cashking.biz/src/main.tsx?v=...`,
cioè l'entry point sorgente tipico del dev server Vite, accanto al bundle compilato.

`[OSSERVATO]` L'`og:image` punta a `https://cash-king--bassajen.replit.app/opengraph.jpg`:
un dominio Replit, cioè l'ambiente in cui il prodotto è stato originariamente
sviluppato. Il riferimento è rimasto in produzione.

`[OSSERVATO]` L'interfaccia è sistematicamente strumentata con attributi
`data-testid` parlanti (`input-email`, `button-login`, `btn-whats-new-next`).

`[OSSERVATO]` Esiste un endpoint `/api/events` che non restituisce mai una
risposta completa a una lettura ordinaria: la richiesta resta aperta.
`[DEDOTTO]` È uno stream Server-Sent Events per gli aggiornamenti in tempo reale.

`[OSSERVATO]` Esiste `/api/auth/api-token`, interrogato a ogni caricamento, e
restituisce effettivamente un token: una stringa base64 di 32 byte. *(Valore non
riportato qui: è una credenziale viva della nostra sessione.)*

`[VERIFICATO]` Cercata la schermata di gestione: **non esiste**. La pagina
`/settings/profile` ha cinque schede — Profilo, Cambia Password, Gestione Team,
Log Attività, Statistiche Utilizzo — e in nessuna compare la parola token, API,
chiave o integrazione.

`[DEDOTTO]` Il token è a uso interno del client, con ogni probabilità un token
di sessione o anti-CSRF, non una chiave per accesso programmatico. **L'ipotesi
di un'API pubblica a token non è confermata e va anzi verso il no**: non c'è
modo per l'utente di ottenerne una, né documentazione che la citi.

### Log Attività: c'è, ma registra quasi nulla `[OSSERVATO]`

La scheda «Log Attività» di `/settings/profile` è descritta come «Cronologia
delle azioni eseguite dagli utenti dell'azienda». Dopo una giornata intensa di
prove conteneva **due sole voci**, entrambe cancellazioni di fatture, con
utente, azione, entità, un frammento JSON grezzo del documento e l'orario.

Non risultano registrate: la creazione di fatture, il collegamento di un
pagamento, il collegamento di una nota di credito, la correzione di stato dal
report delle incongruenze, l'approvazione di una proposta di riconciliazione, né
il cambio della periodicità IVA nelle impostazioni azienda.

`[DEDOTTO]` Il registro copre le cancellazioni e poco altro. Le modifiche che
alterano i saldi — e la correzione di stato in blocco, che può toccare quindici
documenti in un clic — restano invisibili. Si veda anche il flag `isEdited` che
resta falso dopo quella correzione: le due assenze si sommano.

⚠️ `[OSSERVATO]` Una delle tre cancellazioni fatte oggi **non compare nel
registro**: proprio quella che aveva restituito l'errore «Failed to delete
invoice» pur avendo cancellato il documento. Il record è sparito, il registro
non lo sa.

`[OSSERVATO]` Il frammento JSON (`{"type":"customer","amount":"-420.00"}`) è
mostrato all'utente grezzo, senza formattazione.
Vedi `assets/cashking/screenshots/19-log-attivita-solo-cancellazioni.png`.

### Un solo bundle per tutti, area di amministrazione compresa

`[OSSERVATO]` Il bundle servito a un utente cliente contiene anche le rotte e le
chiamate dell'area di amministrazione del fornitore: 20 rotte `/sysadmin/*` e
~60 endpoint `/api/sysadmin/*`, fra cui gestione utenti e aziende, CRM e
campagne, ticket, backup, roadmap, editor delle email e **impersonificazione**
degli utenti.

**Non ho tentato di accedervi**: sarebbe uscire dal perimetro del nostro account.
Le rotte restano `[NON ESPLORABILE]`. Il fatto che il codice sia spedito a tutti
i clienti è però osservabile e va annotato come scelta architetturale.

---

## 2. Numeri della mappa

| Misura | Valore |
|---|---|
| Rotte totali nel router | 173 `[OSSERVATO]` |
| di cui articoli di blog | 40 |
| di cui pagine vetrina pubbliche | ~20 |
| di cui rotte applicative | ~93 |
| di cui area amministrativa del fornitore | 20 `[NON ESPLORABILE]` |
| Endpoint `/api/*` referenziati nel bundle | 279 `[OSSERVATO]` |
| di cui `/api/sysadmin/*` | ~60 |

---

## 3. Navigazione principale osservata nella sidebar

`[OSSERVATO]` Voci di primo livello, nell'ordine in cui compaiono:

| Etichetta in italiano | Rotta |
|---|---|
| Dashboard | `/dashboard` |
| Cash Command | `/cash-command` |
| Scadenziario | `/due-schedule` |
| Tesoreria | `/cash-control-room` |
| Riconciliazione Assistita | `/assisted-reconciliation` |
| Pianificazione | *(gruppo richiudibile)* |
| Fatture e Movimenti | *(gruppo richiudibile, aperto di default)* |
| Solleciti | *(gruppo richiudibile)* |
| Modulo Retail | *(gruppo richiudibile)* |
| Importazione Dati | *(gruppo richiudibile)* |
| Anagrafica | *(gruppo richiudibile)* |
| Stampe | *(gruppo richiudibile)* |
| Impostazioni | *(gruppo richiudibile)* |

`[OSSERVATO]` Il gruppo **Fatture e Movimenti** è l'unico espanso all'ingresso, e contiene:
Fatture `/invoices` · Movimenti Banca `/transactions` · Movimenti Carta
`/credit-card-movements` · Entrate/Uscite Ricorrenti `/manual` · Altre
Uscite/Entrate `/other-costs` · Ritenute d'Acconto `/withholdings` · Anticipi SBF
`/sbf-advances` · Prospetto IVA (Base) `/vat-prospectus`.

`[DEDOTTO]` L'etichetta «Prospetto IVA (**Base**)» segnala l'esistenza di una
versione avanzata del prospetto IVA, presumibilmente legata all'addon fiscale.

`[OSSERVATO]` In fondo alla sidebar: pulsante «Prenota Call», numero di versione
`v0.26.5`, campanello delle novità e selettore del tema.

---

## 4. Inventario completo delle rotte applicative

### 4.1 Autenticazione e ingresso
`/login` · `/register` · `/forgot-password` · `/reset-password` ·
`/reset-password/:token` · `/registrazione-completata` · `/accetta-invito` ·
`/invitation/:token` · `/home` · `/come-funziona`

`[DEDOTTO]` Le due rotte di invito (`/accetta-invito` e `/invitation/:token`)
implicano un flusso di invito di utenti a un'azienda esistente.

### 4.2 Cruscotti e viste di sintesi
| Rotta | Etichetta | Scopo desunto |
|---|---|---|
| `/dashboard` | Dashboard | Home operativa con KPI, grafico di flusso, classifiche |
| `/cash-command` | Cash Command | `[IPOTESI]` vista di comando/priorità sulla cassa |
| `/cash-control-room` | Tesoreria | `[IPOTESI]` sala di controllo della tesoreria |
| `/due-schedule` | Scadenziario | Scadenze attive e passive |

`[OSSERVATO]` Esistono endpoint dedicati `/api/cash-command` e `/api/cash-control-room`,
quindi sono viste con logica propria lato server, non semplici filtri del cruscotto.

### 4.3 Documenti e movimenti
`/invoices` (Fatture) · `/transactions` (Movimenti Banca) ·
`/credit-card-movements` (Movimenti Carta) · `/credit-card-statements` (estratti carta) ·
`/manual` (Entrate/Uscite Ricorrenti) · `/other-costs` (Altre Uscite/Entrate) ·
`/withholdings` (Ritenute d'Acconto) · `/sbf-advances` (Anticipi SBF) ·
`/vat-prospectus` (Prospetto IVA Base) · `/gateway-movements` ·
`/psd2-movements` · `/online-payments`

`[DEDOTTO]` La separazione fra `/gateway-movements`, `/online-payments` e
`/psd2-movements` distingue tre origini diverse del dato: incassi da gateway di
pagamento (tipo Stripe/PayPal), pagamenti online, e movimenti da connessione
bancaria PSD2.

### 4.4 Riconciliazione
`/assisted-reconciliation` (Riconciliazione Assistita)

`[OSSERVATO]` Endpoint correlati: `/api/assisted-reconciliation/batches`,
`/api/bulk-reconciliation/{invoice,other-cost,create-other-cost}`,
`/api/credit-card-bulk-reconciliation/*`, `/api/transaction-reconciliations`,
`/api/payment-gateway-reconciliations`.
`[DEDOTTO]` La riconciliazione lavora a lotti e in blocco, non solo riga per riga,
ed è replicata su tre canali distinti: banca, carta di credito, gateway.

### 4.5 Pianificazione e ricavi
`/orders-planning` · `/revenue/orders` · `/revenue/invoice-calendar` ·
`/revenue/payment-planning` · `/payment-terms`

`[OSSERVATO]` Endpoint: `/api/payment-planning/auto-link`, `/api/payment-terms/seed-standard`,
`/api/planned-billing-rows`, `/api/orders`.
`[DEDOTTO]` Il prodotto pianifica il fatturato futuro a partire dagli ordini, non
solo dalle fatture emesse; `seed-standard` suggerisce un catalogo precaricato di
termini di pagamento italiani standard (30/60/90 gg, fine mese...).
Test necessario per confermare.

### 4.6 Modulo Retail — documentato per intero in `02-aree-funzionali/02-04`
`/retail/dashboard` · `/retail/cash-register` · `/retail/daily-sales` ·
`/retail/deposits` · `/retail/operators` · `/retail/reconciliation` ·
`/retail/settlements` · `/retail/forecast`

`[OSSERVATO]` Endpoint: `/api/retail/z-reports`, `/api/retail/dashboard/kpis`,
`/api/retail/deposits`, `/api/retail/operators`, `/api/retail/settlements/generate`,
`/api/retail/reconciliation/{match,suggestions}`, `/api/retail/forecast/{models,adjustments}`.

`[DEDOTTO]` È un modulo di cassa per punti vendita: chiusure Z del registratore
di cassa, vendite giornaliere, versamenti in banca, operatori di cassa,
quadrature e previsione delle vendite con modelli.

### 4.7 Modulo fiscale — `[NON ESPLORABILE]`, addon a pagamento
`/fiscal/f24` · `/fiscal/f24/new` · `/fiscal/f24/:id` · `/fiscal/f24/:id/edit` ·
`/fiscal/debts` · `/fiscal/installment-plans` · `/fiscal/ravvedimento` ·
`/fiscal/strategy` · `/fiscal/tax-codes`

`[OSSERVATO]` L'addon si chiama **F24 Facile**, costa 19,99 €/mese o 199,90 €/anno,
ed è disponibile solo sui piani PMI e PMI Plus. È configurato con
`hideIfNoSubscription: true`, quindi l'intero modulo è **invisibile nel menu**
per chi non lo ha: non appare nemmeno come voce disabilitata.
`[OSSERVATO]` La chiamata `/api/fiscal/installments/pending-for-cashflow` fatta
dal cruscotto risponde **403** sul nostro account.

`[OSSERVATO]` Endpoint del modulo, indicativi delle sue capacità:
`/api/fiscal/ravvedimento/{calculate,eligible,generate-f24}` ·
`/api/fiscal/legal-interest-rates` con `refresh` e `refresh-status` ·
`/api/fiscal/leverage/{summary,simulate-installment-plan,simulate-non-payment}` ·
`/api/fiscal/debts/parse-pdf` · `/api/fiscal/f24/parse-pdf` ·
`/api/fiscal/installment-plans/risk-summary` · `/api/fiscal/special-schemes`.

`[DEDOTTO]` Il modulo calcola il ravvedimento operoso con i tassi di interesse
legale tenuti aggiornati automaticamente, genera l'F24 corrispondente, legge le
cartelle e gli F24 da PDF, e — dato più interessante — **simula il debito
fiscale come leva finanziaria**, confrontando l'ipotesi di rateizzare con quella
di non pagare.

### 4.8 Anagrafiche e classificazione
`/clients` · `/suppliers` · `/client-groups` · `/categories` · `/synonyms`

`[OSSERVATO]` Endpoint: `/api/client-synonyms`, `/api/supplier-synonyms`,
`/api/trashed-synonyms`, `/api/clients/{merge,bulk-edit,bulk-delete,update-types}`,
`/api/categories/{reorder,totals}`, `/api/sections`, `/api/sections/reorder`.

`[DEDOTTO]` Esiste un dizionario di **sinonimi** delle controparti: serve a
riconoscere che «GREEN ENERGY COOP SOC COOP» in un bonifico e «Green Energy Coop»
in anagrafica sono lo stesso soggetto. Le categorie sono organizzate in
«sezioni» e sono riordinabili a mano dall'utente.

### 4.9 Solleciti — addon a pagamento
`/reminders` · `/settings/reminders` · `/settings/reminder-templates`

`[OSSERVATO]` Aprendo `/settings/reminders` compare un blocco a tutta pagina:
«Attiva Promemoria automatici — Questa sezione richiede l'addon Promemoria
automatici. Attivalo dalla pagina abbonamento per accedere a queste
funzionalità.» con il pulsante «Vai all'abbonamento».
Costo: 2,99 €/mese o 29,99 €/anno, disponibile su tutti e tre i piani.
Vedi `assets/cashking/screenshots/03-gate-addon-promemoria.png`.

`[OSSERVATO]` Endpoint: `/api/reminders/{settings,templates,queue,logs}`,
`/api/reminders/scheduler/{status,trigger}`.
`[DEDOTTO]` I solleciti hanno una coda, un registro degli invii, dei modelli
di messaggio e uno scheduler con trigger manuale.

### 4.10 Importazione dati
`/import/invoices` · `/import/invoices-pdf` · `/import/transactions` ·
`/import/credit-card-movements` · `/import/models` · `/import/history`

`[OSSERVATO]` Endpoint: `/api/invoices/{xml-import,parse-xml-preview,server-import,import-rows}`,
`/api/credit-card-pdf/{parse,parse-ocr}`, `/api/transactions/{server-preview,server-import}`,
`/api/import-models`, `/api/import-batches`, `/api/import-logs/bulk`.

`[DEDOTTO]` Import di fatture elettroniche in XML con anteprima prima di
confermare, import di fatture da PDF, import di movimenti con anteprima, e
**modelli di importazione riutilizzabili** (mappature colonne salvate).
`[OSSERVATO]` Per le carte di credito esiste un parser OCR distinto dal parser
normale, quindi accettano estratti conto scansionati.

### 4.11 Connessioni bancarie PSD2: costruite, non consegnate `[VERIFICATO]`

`[OSSERVATO]` Endpoint `/api/enable-banking/{aspsps,connect,connections,status}`.
L'aggregazione PSD2 è realizzata tramite **Enable Banking** come fornitore terzo
(«ASPSP» è il termine PSD2 per l'istituto bancario).

Verifica dell'11 agosto, e il risultato è netto:

| Sonda | Risposta |
|---|---|
| `/api/enable-banking/status` | `{"configured": true}` |
| `/api/enable-banking/aspsps` | **337 istituti**, fra cui ING, N26, Revolut, bunq, BBVA, Qonto, Deutsche Bank |
| `/api/enable-banking/connections` | `{"connections": []}` |
| Pagina `/settings/bank-accounts` | nessun comando di collegamento: solo Nuovo Conto, Modifica, Elimina, Imposta predefinito |
| Pagina `/psd2-movements` | **«Accesso riservato — Questa sezione è disponibile solo per gli amministratori di sistema.»** |

`[DEDOTTO]` L'integrazione è **configurata e funzionante lato piattaforma** — le
credenziali del fornitore ci sono e il catalogo delle banche risponde — ma
**non esiste alcun modo per un cliente di usarla**. L'unica schermata che la
riguarda è riservata agli amministratori del fornitore, e la pagina dei conti
bancari non offre nemmeno un pulsante per avviare un collegamento.

Il dato dei conti lo conferma: i tre conti dimostrativi hanno un **saldo
iniziale** con data (25.000 €, 50.000 €, 8.500 € al 10/08/26) sopra il quale si
accumulano i movimenti. È il modello di chi inserisce a mano o importa file, non
di chi sincronizza con la banca.

`[DEDOTTO]` La funzione è costruita ma non consegnata. Per un prodotto di
tesoreria è l'assenza più pesante dell'intero impianto: senza collegamento
bancario ogni previsione poggia su dati che qualcuno deve caricare, e la
freschezza del saldo dipende dalla diligenza dell'utente.

`[IPOTESI]` Il fatto che l'unica interfaccia esistente sia quella
amministrativa suggerisce un rilascio graduale in cui il fornitore collega le
banche per conto del cliente durante l'onboarding assistito. Non verificabile
dall'esterno.

### 4.12 Stampe e report
`/prints/treasury-control` · `/prints/dso-dpo` · `/prints/expected-collections` ·
`/prints/expected-invoices` · `/prints/open-invoices` · `/prints/open-bank-movements` ·
`/prints/open-creditcard-movements` · `/prints/payment-reconciliation` ·
`/prints/invoice-inconsistencies` · `/prints/vat-overview` · `/prints/withholding-f24`

`[OSSERVATO]` Esiste `/api/reports/invoice-inconsistencies/fix`: il report delle
incoerenze non si limita a segnalarle, propone di correggerle.
`[OSSERVATO]` Esiste una stampa dedicata a **DSO e DPO**, i giorni medi di
incasso e di pagamento.

### 4.13 Impostazioni
`/settings` · `/settings/company` · `/settings/profile` · `/settings/bank-accounts` ·
`/settings/credit-cards` · `/settings/payment-gateways` · `/settings/rules` ·
`/settings/uploaded-files` · `/settings/billing` · `/settings/subscription` ·
`/settings/manage-plan` · `/impostazioni` · `/billing-plans`

`[OSSERVATO]` Esiste `/settings/rules` con endpoint `/api/rules`.
`[DEDOTTO]` Motore di regole configurabile dall'utente. **Verificato:** dieci tipi, tredici
operatori, undici azioni, e la creazione che fallisce sempre. Vedi
`02-aree-funzionali/02-05-regole-e-sinonimi.md`, capp. 1 e 1b.

`[OSSERVATO]` Convivono `/settings` (inglese) e `/impostazioni` (italiano).
`[IPOTESI]` Residuo di una migrazione di naming; da verificare se una delle due
sia un semplice redirect.

`[OSSERVATO]` La fatturazione passa da Stripe: `/api/stripe/create-checkout-session`,
`create-portal-session`, `update-subscription`.

### 4.14 Aiuto
`/help` · `/help/faq` · `/help/tours`

`[OSSERVATO]` La voce «Tutorial Interattivi» del changelog rimanda qui: tour
guidati passo-passo per Dashboard, Fatture, Movimenti e Import.

### 4.15 Multi-azienda e collaborazione
`[OSSERVATO]` Endpoint `/api/auth/switch-company`, `/api/company/{members,invite,invitations,transfer-ownership,usage-statistics}`.
`[OSSERVATO]` La novità principale della v0.26.5 recita: «Ora puoi appartenere a
più aziende con lo stesso account e passare dall'una all'altra in qualsiasi
momento dal menu profilo in alto a destra. Perfetto per commercialisti e per chi
gestisce più partite IVA.»
`[DEDOTTO]` Il multi-azienda è **recentissimo**, non un fondamento
dell'architettura. È inoltre possibile trasferire la proprietà di un'azienda.

---

## 5. Changelog in-app (v0.26.5) `[OSSERVATO]`

Al primo accesso si apre un carosello «Novità» di tre schede, con pulsanti
«Avanti» e «Salta tutto e non mostrare più»:

1. **Gestisci più aziende** — appartenenza a più aziende con lo stesso account,
   cambio dal menu profilo. Rivolto esplicitamente a commercialisti e a chi
   gestisce più partite IVA.
2. **Tutorial Interattivi** — tour guidati passo-passo, accessibili dalla
   sezione Aiuto, su Dashboard, Fatture, Movimenti e Import.
3. **Gestione Carte di Credito** — tracciamento movimenti delle carte aziendali,
   riconciliazione con gli estratti conto, pianificazione dei pagamenti mensili.

`[DEDOTTO]` Le tre novità dicono dove sta andando il prodotto: apertura al
canale dei commercialisti, riduzione dell'attrito di apprendimento, e copertura
di un terzo canale di pagamento oltre a banca e contanti.

---

## 6. Piani, limiti e feature a pagamento `[OSSERVATO]`

Dati letti da `/api/public/billing/plans` e `/api/public/billing/addons`.
Copia integrale in `assets/cashking/api-traces/02-billing-piani-addon.json`.

| Piano | Mensile | Annuale | Early bird mens. | Early bird ann. | Movimenti | Conti | Utenti |
|---|---|---|---|---|---|---|---|
| Micro | 59 € | 597 € | 49 € | 497 € | 150 | 3 | 1 |
| PMI | 89 € | 897 € | 69 € | 697 € | 500 | 10 | 3 |
| PMI Plus | 129 € | 1.297 € | 99 € | 997 € | illimitati | illimitati | illimitati |

Il «da 49 €/mese» della comunicazione pubblica è il prezzo *early bird* del
piano Micro; il prezzo di listino è 59 €.

| Addon | Mensile | Annuale | Piani ammessi | Nascosto se non attivo |
|---|---|---|---|---|
| F24 Facile | 19,99 € | 199,90 € | PMI, PMI Plus | sì |
| Promemoria automatici | 2,99 € | 29,99 € | tutti | no |

`[OSSERVATO]` Il contatore dei limiti è già esposto: `movementsUsed: 46`,
`movementsAvg: 42`, `accountsUsed: 3`, `usersUsed: 1`. Sul nostro trial tutti i
tetti valgono `null`, cioè illimitati.
`[DEDOTTO]` Il limite «movimenti» è misurato su base mensile con una media
mobile — esiste sia il valore corrente sia la media. Con 150 movimenti/mese il
piano Micro è tarato su volumi molto piccoli.

`[OSSERVATO]` Tutti e tre i piani hanno `includesConsultantAccess: false`,
`onboardingCalls: 0` e `prioritySupport: false`, nonostante la comunicazione
pubblica parli di onboarding incluso.
`[VERIFICATO]` La pagina pubblica promette «onboarding personalizzato (3 call
incluse)», «supporto prioritario» e «accesso commercialista incluso» sul piano
PMI Plus, mentre i tre campi valgono 0 e falso su tutti i piani; e la pagina
`/onboarding` descrive **una sola call da 45 minuti, uguale per tutti**. Tre
fonti concordi. Vedi `00-ricognizione-pubblica.md`, capp. 2 e 10.7.

---

## 7. Cosa non è stato ancora aperto

Alla chiusura della Fase 1 restano non visitate quasi tutte le schermate
applicative. L'esplorazione finora ha toccato `/login`, `/dashboard`,
`/settings/reminders` e `/settings/manage-plan`.

Anomalia da ricontrollare: `/settings/manage-plan` ha portato la scheda a
`about:blank` invece di renderizzare. Non è chiaro se sia un difetto del
prodotto o un incidente del browser di automazione; va riprovato a mano.

---

## 8. Materiali raccolti

| File | Contenuto |
|---|---|
| `assets/cashking/screenshots/01-auth-login.png` | Pagina di accesso |
| `assets/cashking/screenshots/02-dashboard-modale-novita.png` | Cruscotto con il carosello delle novità |
| `assets/cashking/screenshots/03-gate-addon-promemoria.png` | Blocco di upsell dell'addon Promemoria |
| `assets/cashking/api-traces/01-dashboard-avvio.txt` | Traffico di rete della prima sessione (pagine pubbliche e autenticazione). **Non contiene chiamate `/api/dashboard/*`**: la descrizione precedente era errata |
| `assets/cashking/api-traces/03-cruscotto-caricamento-completo.txt` | Caricamento completo del cruscotto: 33 chiamate, nessuna a `receivables` o `payables` |
| `assets/cashking/api-traces/02-billing-piani-addon.json` | Listino piani e addon, limiti dell'account |
