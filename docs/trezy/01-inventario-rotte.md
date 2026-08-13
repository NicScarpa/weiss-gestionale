# Trezy — Inventario delle rotte e mappa dell'applicazione

**Prodotto:** Trezy · **Ambiente:** produzione (`appv2.trezy.io`) · **Account:** reale, azienda della ristorazione
**Piano:** Premium in prova (39 €/mese) · **Osservazione:** 11 agosto 2026
**Livello di accesso:** completo sul piano più alto

> Nota di metodo: tutto ciò che segue è stato raccolto in **sola lettura**. Nessun
> record creato, modificato o cancellato; nessun collegamento di riconciliazione
> confermato; nessun alert configurato. Le uniche interazioni sono state
> navigazione, apertura di pannelli e cambio di vista.

---

## 1. Autenticazione

| Elemento | Valore |
|---|---|
| URL di ingresso | `https://appv2.trezy.io/login` |
| Titolo della pagina | «Trezy \| The Simple Cash Flow Tool» (identico su **tutte** le rotte) |
| Campi | E-mail, Password |
| Azioni | Accedi · Password dimenticata? · Crea un account |
| Endpoint | `POST auth.trezy.io/api/v2/auth/login` |
| Risposta | `{ user, currentAccount, accessToken, refreshToken, expiresIn }` |
| Atterraggio | `/cashflow` |

Sulla schermata di login compaiono due frasi di posizionamento: «Una visione del
futuro» e «È magia». `[OSSERVATO]`

Nessun accesso sociale (Google, Microsoft), nessun SSO, nessuna autenticazione a
due fattori offerta in questa schermata. `[OSSERVATO]` — l'assenza di 2FA nelle
impostazioni di profilo è confermata dal tab «Il mio profilo», che offre solo il
cambio password.

---

## 2. Rotte accessibili

Otto voci di menu, tutte raggiungibili con il piano Premium. Il menu è verticale
a sinistra e resta identico su ogni schermata.

| # | Rotta | Voce di menu | Scopo | Entità mostrate |
|---|---|---|---|---|
| 1 | `/cashflow` | Flusso di cassa | Tabella pivot categorie × periodi, consuntivo e previsionale, saldo proiettato | Categorie, transazioni aggregate, previsioni, documenti, IVA |
| 2 | `/performance` | Prestazioni | Bilancio *stimato* dai movimenti bancari: C/E, stato patrimoniale, break-even, valutazione, KPI, scritture | Scritture in partita doppia, indicatori |
| 3 | `/reporting` | Reporting `BETA` | Costruttore di report a widget | Widget (nessuno creato) |
| 4 | `/transaction` | Transazioni | Elenco dei movimenti bancari, categorizzazione, filtri | Transazioni, gruppi di simili, conti |
| 5 | `/document` | Documenti | Fatture, scadenzario, aging, anagrafiche, riconciliazione | Fatture, fornitori, clienti |
| 6 | `/categories` | Categorie | Anagrafica categorie e regole di classificazione | Categorie, regole |
| 7 | `/settings` | Impostazioni | Otto tab di configurazione | Account, utenti, piani, integrazioni, notifiche |
| 8 | `/academy` | Academy `NUOVO` | Knowledge base dentro il prodotto: video e FAQ | Contenuti didattici |

Un nono collegamento in fondo al menu, **«Prenota una demo»**, punta fuori
dall'applicazione (`meet.trezy.io/demo-30mn`). `[OSSERVATO]`

### Una rotta in più su mobile: `/accounting`

A 390 px di larghezza il menu laterale sparisce e compare una **barra di
navigazione inferiore a cinque voci**, che non è un sottoinsieme di quella
desktop `[OSSERVATO]`:

| Barra mobile | Destinazione | Presente nel menu desktop? |
|---|---|---|
| Flusso di cassa | `/cashflow` | sì |
| Prestazioni | `/performance` | sì |
| **Contabilità** | **`/accounting`** | **no** |
| Transazioni | `/transaction` | sì |
| Documenti | `/document` | sì |

Restano fuori dalla barra mobile Reporting, Categorie, Impostazioni e Academy —
non è stato individuato un menu secondario che le raggiunga. `[NON VERIFICABILE]`

La voce **«Contabilità» punta a `/accounting`, che reindirizza a `/cashflow`**:
il collegamento è esposto in produzione ma la rotta non esiste. `[OSSERVATO]`
Va letta insieme a due altri indizi: l'entitlement `accounting` è attivo
sull'account, e il modulo Prestazioni genera già scritture in partita doppia. Un
modulo di contabilità sembra in preparazione, con la voce di menu arrivata prima
della pagina. `[IPOTESI]`

### Sotto-navigazione

Le sezioni interne **non cambiano l'URL**: sono tab client-side. L'indirizzo resta
`/performance` o `/settings` qualunque tab sia attivo. Conseguenza pratica: nessuna
sezione interna è indirizzabile con un link, e il tasto «indietro» del browser non
torna al tab precedente. `[OSSERVATO]`

| Rotta | Tab interni |
|---|---|
| `/performance` | Dashboard ✨ · C/E · Stato Patrimoniale · Pareggio · Valutazione · KPI · Registrazioni |
| `/document` | Fatture · Fornitori · Clienti |
| `/categories` | Categorie · Regole di classificazione `NUOVO` |
| `/settings` | Il mio profilo · Analitico · Gestisci organizzazioni · Fatturazione e abbonamenti · Integrazioni · 🎁 Referral `NEW` · Notifications · Funzionalità |

### Pannelli e modali osservati

| Pannello | Da dove si apre | Contenuto |
|---|---|---|
| Casella di posta delle previsioni | Si apre **da sola** entrando in `/cashflow` | Tre code di lavoro: verifica transazioni, riconciliazione previsioni, monitoraggio fatture |
| Dettaglio di cella | Click su una cella della tabella cashflow | Dettaglio del periodo, con «Periodo precedente / successivo» e «Aggiungi previsione» |
| Menu scenari | Click su «Scenario Principale» | Elenco scenari e «Crea nuovo scenario» |
| Filtri transazioni | Pulsante «Filtri» | Categoria, periodo, importo, tipo, stato, documento, nota |
| Chiedi a Trezy | Pulsante in testata al cashflow | Assistente conversazionale con tre suggerimenti precaricati |
| Catalogo widget | «Aggiungi widget» in `/reporting` | Nove tipi di widget |
| Candidati di riconciliazione | Riga fattura in `/document` | Transazioni proposte per il collegamento |

---

## 3. Rotte e funzionalità non accessibili

Il piano in prova è il più alto disponibile: **nessuna area è bloccata da paywall**.
Le lacune osservate hanno altra natura.

| Funzionalità | Stato | Motivo |
|---|---|---|
| `cashBooster` | `[NON ACCESSIBILE]` | Entitlement attivo nell'API (`GET /accounts/{id}/entitlements`) ma **nessuna interfaccia raggiungibile** in tutta l'applicazione |
| `factoringMarketplace` | `[NON ACCESSIBILE]` | Idem: attivo lato API, assente dall'interfaccia |
| Prodotti · Analisi fornitori · Analisi prezzi | `[NON POPOLATO]` | Interruttori presenti in Impostazioni › Funzionalità, non attivati su questo account |
| Ricette · Analisi costi ricette · Inventario (`BETA`) | `[NON POPOLATO]` | Idem. Compaiono come schede in Documenti una volta abilitate |
| Contabilità analitica (centri di costo, nature, codici) | `[NON POPOLATO]` | Struttura presente in Impostazioni › Analitico, zero elementi creati |
| Scenari alternativi | `[NON POPOLATO]` | Esiste solo lo «Scenario Principale» di default |
| Report e widget | `[NON POPOLATO]` | Catalogo disponibile, nessun widget creato |
| Rotta `/accounting` («Contabilità», solo su mobile) | `[NON ACCESSIBILE]` | Voce di menu presente, rotta reindirizzata a `/cashflow`: non implementata |
| Voci Reporting, Categorie, Impostazioni, Academy da mobile | `[NON VERIFICABILE]` | Assenti dalla barra inferiore, nessun menu secondario individuato |
| Notifiche diverse dagli avvisi di saldo | `[NON VERIFICABILE]` | Vedi `04b-comportamenti-nel-tempo.md`: la finestra temporale non ha consentito di osservarne l'innesco |

> Nessuna di queste voci è classificata `[ASSENTE]`: la verifica positiva
> richiesta dal metodo — assenza di interfaccia **e** assenza da knowledge base e
> pricing — non è stata raggiunta per nessuna di esse.

---

## 4. Architettura tecnica osservata

Applicazione a pagina singola che parla con **tre origini distinte**:

| Origine | Ruolo | Esempi di endpoint |
|---|---|---|
| `auth.trezy.io/api/v2/` | Identità, utenti, abbonamenti, entitlement | `auth/login`, `users/{id}/onboarding`, `subscriptions/accounts/{id}/status`, `accounts/{id}/entitlements` |
| `p3001-…-gtw.…prm.sh/api/v2/` | Dominio applicativo | `cashflow/batch`, `forecast-breakdown`, `forecasts/scenario/{id}/period`, `forecasts/reconciliation`, `categories`, `bank-accounts`, `account-settings`, `transactions/verification-stats`, `ai-chat/*` |
| `p8080-…-gtw.…prm.sh/api/` | Servizio fatture | `invoices/future-cumulative` |

I due gateway applicativi espongono **la porta di servizio nel sottodominio**
(`p3001-`, `p8080-`) su un dominio di piattaforma di anteprima. È un impianto che
ci si aspetta in staging più che in produzione: suggerisce un'infrastruttura non
ancora consolidata, o un'esposizione diretta di servizi interni tramite gateway
generato. `[DEDOTTO]` — l'osservazione dell'host è `[OSSERVATO]`, l'interpretazione no.

Nessun endpoint GraphQL osservato: l'API è REST, con risposte JSON.

---

## 5. Stato del dataset

Elemento necessario per interpretare tutto il resto: **quanto profondo è lo storico**.

| Grandezza | Valore osservato |
|---|---|
| Conti bancari collegati | 3, tutti presso lo stesso istituto |
| Transazioni | 749 |
| Fatture | 249 (tutte di acquisto; vendita: 0) |
| Scritture di pre-contabilità generate | 3.368 |
| Categorie | 6 di entrata, 31 di uscita |
| Regole di classificazione | 0 |
| Previsioni manuali | 0 |
| Scenari | 1 (quello di default) |
| Esercizi disponibili in Prestazioni | 1 |
| Copertura temporale dei movimenti nel cashflow | da ottobre 2025 ad agosto 2026 con valori; le colonne si estendono fino a giugno 2027 vuote |
| Account creato il | 5 agosto 2026 |

**Conseguenza metodologica.** Lo storico copre circa **dieci mesi** e un solo
esercizio. Ogni giudizio su previsioni, confronti anno su anno e indicatori di
ciclo (DSO, DPO, DIO) va letto come comportamento del prodotto *in condizioni di
dati insufficienti*, non come suo comportamento a regime. Nei documenti di area
questa distinzione è marcata caso per caso con `[NON POPOLATO]`.

---

## 6. Materiali raccolti

| Tipo | Percorso | Quantità |
|---|---|---|
| Screenshot | `assets/trezy/screenshots/` | 41 |
| HAR sanificati | `assets/trezy/har/` | 8 sessioni |
| Tracce API con corpi di risposta | `assets/trezy/api-traces/` | 8 file |
| Snapshot per il confronto nel tempo | `assets/trezy/api-traces/SNAPSHOT-2026-08-11.json` | 1 |
| Materiali pubblici (Fase 0) | `assets/trezy/materiali-pubblici/` | 26 documenti + screenshot |

Gli HAR sono stati sanificati alla fonte: intestazioni `Authorization`, `Cookie`,
`Set-Cookie` e affini sostituite, cookie svuotati, e i corpi di richiesta
contenenti credenziali rimossi. La cartella `assets/trezy/` è esclusa dal
versionamento (il repository è pubblico e i materiali contengono dati aziendali
reali).
