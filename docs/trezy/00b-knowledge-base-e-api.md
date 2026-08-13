# Trezy — Knowledge base, changelog e API

**Perimetro**: documentazione utente, changelog, API pubblica, requisiti di onboarding.
**Data della rilevazione**: 11 agosto 2026. Tutte le affermazioni sono datate a quel giorno.
**Metodo**: consultazione diretta delle fonti pubbliche (sito, sitemap, `llms.txt`, changelog) e
lettura degli asset JavaScript serviti pubblicamente dal sito e dall'applicazione. Nessun accesso
autenticato, nessuna credenziale, nessun invio di dati.

**Legenda**: `[OSSERVATO]` = letto direttamente, con URL · `[DEDOTTO]` = inferenza da evidenza
osservata · `[IPOTESI]` = congettura non verificata.

---

## 1. Che cosa esiste come documentazione pubblica, e che cosa no

### 1.1 La risposta breve

**Trezy non ha un centro assistenza pubblico.** Ha una pagina di documentazione con **11 articoli,
scritti solo in francese**, e un changelog **fermo da 28 mesi**. Non esiste API pubblica né
documentazione per sviluppatori. La documentazione operativa vera — quella che spiega le regole di
calcolo — esiste, è tradotta in italiano, ma **vive dentro il prodotto**, dopo il login, e si chiama
*Trezy Academy*.

### 1.2 Che cosa ho cercato e con quale esito

`[OSSERVATO]` Sottodomini sondati via HTTPS e DNS (11 agosto 2026):

| Host | HTTP | Esito |
|---|---|---|
| `help.trezy.io` | 404 | non esiste |
| `support.trezy.io` | 404 | non esiste |
| `docs.trezy.io` | 404 | non esiste |
| `developers.trezy.io` / `developer.trezy.io` | 404 | non esiste |
| `api.trezy.io` | 404 su `/`, `/docs`, `/redoc`, `/openapi.json`, `/swagger`, `/graphql`, `/health`, `/v1`, `/api/v1` | **esiste** (referenziata dall'app) ma **priva di documentazione pubblica**; nginx risponde 404 su tutto |
| `status.trezy.io` | 404 | nessuna status page |
| `data.trezy.io` | 404 | **prodotto dismesso** (era il benchmarking settoriale del 2023) |
| `app.trezy.io` | 503 | vecchia applicazione, fuori servizio |
| `appv2.trezy.io` | 200 | **applicazione corrente** |
| `classify.trezy.io` | 404 (certificato TLS non corrispondente, punta a un gateway `prm.sh`) | non raggiungibile |

`[OSSERVATO]` Ricerche per un help center esterno su Intercom, Zendesk, HelpScout, Notion:
**nessun risultato riferibile a trezy.io**. I risultati che emergono appartengono a *Treez.io*,
azienda diversa (gestionale per dispensari) — attenzione all'omonimia, è una trappola ricorrente.

`[OSSERVATO]` `robots.txt` (`https://www.trezy.io/robots.txt`, generato il 30 luglio 2026) non
dichiara alcuna sezione di supporto; la sitemap contiene **4.124 URL**, di cui la stragrande
maggioranza sono articoli di blog, glossario e pagine di comparazione. Le uniche voci non
promozionali sono `/{lingua}/documentazione` (una per lingua) e `/{lingua}/changelog`.

### 1.3 La documentazione pubblica: 11 articoli, solo in francese

`[OSSERVATO]` `https://www.trezy.io/it/documentazione` (e le omologhe in 9 lingue) è un **guscio**:
il contenuto è caricato da un unico file JavaScript,
**`https://www.trezy.io/js/documentation-content.js`** (34 KB), che contiene l'intera knowledge base
in un oggetto `documentationContent`.

`[OSSERVATO]` **Il file non è mai stato tradotto.** Il titolo della pagina italiana è «Guida Trezy —
Setup in 5 Minuti | Documentazione Completa», ma l'`<h1>` recita *«Bienvenue dans la documentation
Trezy»* e ogni articolo è in francese. Anche i video sono solo francesi (`bank-account-fr.mp4`, ecc.).

`[OSSERVATO]` Nel menu di navigazione la voce «Documentazione» porta la classe CSS **`french-only`**
(come la voce «Demo»): l'intenzione di limitarla al mercato francese è esplicita nel codice.

**Struttura completa — 5 categorie, 11 articoli:**

| Categoria | Articoli |
|---|---|
| Configuration Initiale | Connessione bancaria · Import manuale · Integrazione Pennylane |
| Plan de Trésorerie | Creare sotto-categorie · Spostare categorie · Risalire al livello padre · Eliminare categorie |
| Catégorisation | Categorizzazione automatica · Categorizzare le transazioni |
| Prévisions | Basi delle previsioni · Previsioni avanzate |
| Export de données | Export Excel |

`[OSSERVATO]` La profondità è molto disomogenea: l'articolo sulla connessione bancaria è ricco
(5 passaggi, FAQ, sezione sicurezza, demo interattiva Supademo); gli altri dieci sono **stub** da tre
schede di una riga. La funzione `renderDocContent` prevede un ripiego `«Contenu en cours de
rédaction...»` per le voci non scritte.

**Aree del tutto assenti dalla documentazione pubblica:**
riconciliazione bancaria · scadenzario e aging · configurazione degli alert · gestione documenti e
OCR · monitoraggio IVA · fatturazione elettronica · scenari · KPI e performance · analisi fornitori ·
multi-azienda e permessi · CashBooster.

### 1.4 La documentazione vera: *Trezy Academy*, dentro il prodotto

`[OSSERVATO]` Il bundle di localizzazione dell'applicazione
(`https://appv2.trezy.io/static/js/locales.0bc75978.js`, 4,1 MB, 8 lingue, **9.971 stringhe per
lingua**) contiene un ramo `academy` con **13 schede-funzionalità** e **13 FAQ operative**, con
percorsi di accesso, video dimostrativi e tag (`getting-started`, `troubleshooting`, `advanced`).

`[DEDOTTO]` È questa la knowledge base effettiva di Trezy: è tradotta in italiano corretto, spiega le
formule, ed è l'unica fonte che risponda alle domande sul funzionamento reale. Ma **è accessibile solo
dopo il login**: un potenziale cliente non può leggerla prima di iscriversi.

Trascrizione integrale: `assets/trezy/materiali-pubblici/kb-05-academy-faq-regole-di-calcolo.md`.

### 1.5 Contraddizioni fra le fonti dello stesso sito

`[OSSERVATO]` Tre discrepanze rilevanti, tutte fra documentazione e marketing:

| Tema | Documentazione / prodotto | Marketing (`llms-full.txt`, FAQ) |
|---|---|---|
| Banche supportate | «più di **300 banche europee**» (doc) · «**centinaia** di banche» (Academy) | «**oltre 2.000** banche» · «**12.000+** istituti via Plaid» (changelog gen 2024) |
| Storico importato | «Importa i tuoi **ultimi 3 mesi** di storico» (doc) | «importa **fino a 24 mesi** di storico» (FAQ) |
| Formati di import | «CSV, **OFX**, **QIF**» (doc) | l'app accetta **solo** `.csv`, `.xlsx`, `.xls` |

`[DEDOTTO]` La documentazione francese è più vecchia del materiale commerciale e non è stata
aggiornata. Il dato «3 mesi» è quello che conta per valutare la qualità delle prime previsioni.

---

## 2. Funzionamento delle aree chiave

### 2.1 Previsionale — da che cosa nasce una previsione

`[OSSERVATO]` **Non esiste un previsionale automatico da fatture o scadenze.** Una previsione in
Trezy è un **valore inserito su una cella di una griglia categoria × periodo**, generato con uno di
questi metodi (documentazione + stringhe dell'app):

- **Stabile** — media degli **ultimi 3 periodi**, proiettata avanti
- **Crescita** — media degli ultimi 3 periodi + tasso, `compound` o `flat`
- **Duplica A-1** — ricopia l'anno precedente, con o senza crescita
- **Costante** — valore fisso su tutti i periodi
- **Media personalizzata** / **Crescita personalizzata** — su un intervallo scelto
- **Ricorrente** — motore completo (frequenza, giorno del mese, giorni della settimana, occorrenze o
  data di fine o «per sempre», crescita annuale)
- **Formula** — «questa categoria = X% di *un'altra categoria* da N periodi prima»

`[OSSERVATO]` **Finestra temporale**: la risoluzione determina l'orizzonte. Giornaliera → il mese
successivo; settimanale → l'anno successivo; mensile e trimestrale → **i prossimi 3 anni**.
Il claim commerciale «12 mesi» è quindi conservativo rispetto a ciò che l'interfaccia consente.

`[OSSERVATO]` **Ricalcolo**: non è un ricalcolo continuo. Le previsioni sono valori persistiti che
l'utente sostituisce (`Sostituisci`) o somma (`Aggiungi`); c'è annullamento con `⌘Z/Ctrl+Z` e un
endpoint `/forecasts/unified/undo`. Ciò che si aggiorna automaticamente è lo **stato di pagamento**
della previsione, per effetto della riconciliazione (§ 3.1).

`[OSSERVATO]` **Previsione con IA**: `/scenarios/ai-forecast` e `/scenarios/ai-pl-forecast`. Testo
dell'app: «L'AI analizzerà le tue categorie di profitti e perdite degli **ultimi 24 mesi** per
generare previsioni per i **prossimi 36 mesi**. **Richiede dati contabili (caricamento FEC)**».
`[DEDOTTO]` Per un'azienda italiana la previsione IA sul conto economico è di fatto inaccessibile,
perché il FEC è il tracciato fiscale francese; resta il ripiego di un libro mastro generico
`.xlsx`/`.csv`.

`[OSSERVATO]` **Ponte P&L → cassa** (`forecastBridge`), la parte più interessante del motore:
«L'importo HT viene moltiplicato per (1 + IVA), quindi distribuito nei mesi in base ai termini di
pagamento». Bucket: immediato, 15, 30, 45, 60, 90 giorni, con percentuali che devono sommare a 100.
Il rilevamento automatico dallo storico avvisa quando il campione è scarso («affidabilità limitata»)
e quando le aliquote sono miste («utilizzando la media ponderata»).

Dettaglio completo: `kb-04-previsioni-metodi.md`.

### 2.2 Riconciliazione

`[OSSERVATO]` Esistono **due riconciliazioni distinte**, da non confondere:

**a) Previsione ↔ transazione** (Academy, FAQ «forecastReconciliation»):
> «Quando una transazione bancaria corrisponde a una previsione (**stessa categoria, stesso
> periodo**), puoi collegarla. […] Se la previsione è di 5.000 e colleghi una transazione di 3.000,
> il residuo scende a 2.000. Quando il totale è coperto, la previsione viene contrassegnata come
> pagata. **La riconciliazione è per scenario.**»

**b) Scadenza/fattura ↔ transazione** (`payment.*`), con motore di matching a sei livelli (§ 3.2).

`[OSSERVATO]` Il collegamento è **sempre proposto, mai imposto**: `Collega ora` / `Non ora`. In
blocco: «Abbiamo trovato {{count}} **corrispondenze affidabili**. Verifica e seleziona quelle da
collegare.»

`[DEDOTTO]` Non esiste una riconciliazione bancaria in senso contabile (saldo estratto conto vs
mastro): l'estratto conto *è* la sorgente di verità, e ciò che si riconcilia sono le **attese**
(previsioni e scadenze) contro i movimenti reali.

### 2.3 Scadenzario e aging

`[OSSERVATO]` Stati di una scadenza: `Pagato` · `Parzialmente pagato` · `Scaduto` (`late`) ·
`In arrivo` · `Riconciliato` · `In attesa` · `Pagato in eccesso`.
Badge in elenco: «In ritardo +{{days}} g».

`[OSSERVATO]` **Aging a quattro bucket fissi**, nella scheda «Scadenzario»
(`accounting.clientsSuppliers.agedBalance`): **0-30 · 31-60 · 61-90 · > 90 giorni**, con avviso
«sono scaduti da oltre 90 giorni». `[DEDOTTO]` Non configurabili: sono cablati nelle stringhe.

`[OSSERVATO]` Lo scadenzario vive nella sezione **contabilità**, alimentata da FEC o da fatture
importate — non dalla banca. `[DEDOTTO]` Senza contabilità caricata o fatture, non c'è aging.

`[OSSERVATO]` Un piano di rate è modellabile (`createPaymentPlan`, `addInstallment`), e una singola
transazione può coprire più scadenze (`smartMatch.multiSchedule`).

### 2.4 Categorie e tassonomia

`[OSSERVATO]` **Esiste una tassonomia predefinita: 444 voci** (ramo `cashflowCategories`), con codici
strutturati per prefisso: `EXP-` (191 spese), `INC-` (44 entrate), `EMP-` (34 personale), `FIN-` (22),
`OPS-` (19), `TRF-` (17), `EXC-` (17), `TAX-` (15), `LEG-` (12), `REV-` (10), `MKT-` (9), `AST-` (9),
più conti di sistema (`BANK_ACCOUNTS`, `VAT_DEDUCTIBLE`, `VAT_COLLECTED`, `ACCOUNTS_RECEIVABLE`,
`ACCOUNTS_PAYABLE`, `RETAINED_EARNINGS`).

`[OSSERVATO]` **La tassonomia è in larga parte di finanza personale, non aziendale.** La serie
`EXP-100C…EXP-19xxC` include: «Spese abitative», «Rate mutuo», «Pagamenti affitto», «Bollette
elettriche», «TV via cavo e satellitare», «Acquisti supermercato», «Bar e caffetterie», «Servizi di
ride-hailing», «Tasse universitarie», «Attrezzatura ricreativa». `[IPOTESI]` Il suffisso `C` sta per
*consumer*: sembra un piano dei conti retail riusato, affiancato da un secondo insieme
genuinamente aziendale (`TAX-`, `EMP-`, `OPS-`, `LEG-`, `AST-`).

`[OSSERVATO]` **Errori di traduzione contabile in italiano**: `ACCOUNTS_RECEIVABLE` è tradotto
«**Risconti Attivi**» e `ACCOUNTS_PAYABLE` «**Risconti Passivi**». Sono termini sbagliati: i risconti
sono quote di costi/ricavi differiti, non crediti e debiti commerciali. Le voci corrette sarebbero
«Crediti verso clienti» e «Debiti verso fornitori». `[DEDOTTO]` La traduzione italiana non è passata
per una revisione contabile.

`[OSSERVATO]` **Regole automatiche**: sì, ma di forma minima — un solo campo `pattern` di testo,
predicato «**contiene**», **non sensibile alle maiuscole**, con ambito su tipo (entrata/uscita/tutte)
e su conto bancario. Niente espressioni regolari, niente condizioni su importo, nessun operatore
logico fra criteri. Priorità per **ordinamento manuale** (trascinamento), la prima regola che
corrisponde vince. **Non retroattive** salvo click esplicito su «Applica tutte le regole».

`[OSSERVATO]` **Apprendimento automatico**: due transazioni sono «simili» se hanno **la stessa
descrizione anonimizzata** — uguaglianza esatta del testo normalizzato, non similarità fuzzy
(endpoint `/transactions/grouped-by-hash-unverified`). Validare un gruppo propaga la categoria a
tutto il gruppo. Le regole possono spezzare i gruppi.

`[OSSERVATO]` Ogni categoria porta tre attributi contabili: **categoria contabile**, **termini di
pagamento in giorni** (con segno) e **aliquota IVA**. I termini di pagamento «non influiscono sulla
vista cashflow»: agiscono solo su contabilità e performance.

`[OSSERVATO]` Profondità raccomandata dalla documentazione: **massimo 3 livelli**.

### 2.5 Onboarding e requisiti per collegare una banca

`[OSSERVATO]` **Tre aggregatori coesistono** nell'applicazione corrente:
- **Enable Banking** (widget `tilisy.enablebanking.com` caricato dal guscio dell'app; endpoint
  `/api/enablebanking/*`; alla connessione si sceglie fra utente privato e **business**)
- **Powens** (ex Budget Insight — presente nella gestione errori e nella scelta del metodo di connessione)
- **Plaid** (`/api/plaid/link-token`, `/api/plaid/exchange-token`)

`[OSSERVATO]` Il changelog del 29 gennaio 2024 citava **Plaid, Salt Edge e Bridge**; quello del
2 gennaio 2024 annunciava il passaggio a Plaid. `[DEDOTTO]` Il parco fornitori è cambiato almeno due
volte in tre anni: **Bridge → Plaid/Salt Edge → Enable Banking + Powens + Plaid**.
`[OSSERVATO]` **Nessuna traccia di Fabrick, CBI Globe, Tink o Nordigen/GoCardless.**

`[OSSERVATO]` Requisiti e vincoli dichiarati:
- Autenticazione presso la banca via redirezione PSD2; le credenziali non transitano da Trezy
- Accesso **in sola lettura**, nessuna disposizione di pagamento
- Sincronizzazione automatica **ogni mattina**, più sincronizzazione manuale a richiesta
- **Riautenticazione periodica obbligatoria, «generalmente ogni 90 giorni»**, con notifica
- Import iniziale: **3 mesi** secondo la documentazione (24 secondo il marketing)
- Alcune banche «richiedono di attivare l'accesso API nelle impostazioni di sicurezza»
- Ripiego se la banca non è supportata: **import da file**

`[OSSERVATO]` **Formati accettati**:
- Transazioni bancarie: **CSV, XLSX, XLS**. Con mappatura delle colonne, intervallo di date dedotto
  dal file, anteprima e **impostazione del saldo iniziale alla data di partenza**.
  (La documentazione promette anche OFX e QIF: non trovano riscontro nel prodotto.)
- Documenti/fatture: **PDF, PNG, JPG, XML fino a 10 MB**, più un **indirizzo email dedicato** per
  account su cui inoltrare allegati che vengono processati automaticamente
- Contabilità: **FEC `.txt`** (francese), oppure libro mastro `.xlsx`/`.csv` con rilevamento
  automatico delle colonne
- Piano dei conti: import codici via CSV/XLSX

`[OSSERVATO]` **Italia — fatturazione elettronica via Invopop**, non documentata pubblicamente:
si registra la **partita IVA**, si ottiene un **Codice Destinatario** da registrare presso
l'**Agenzia delle Entrate**, e da quel momento le fatture elettroniche passive (SDI) e attive
vengono importate. Sincronizzazione tramite azione esplicita. Dettaglio in
`kb-07-sdi-invopop-fatturazione-elettronica.md`. `[DEDOTTO]` È la funzione più significativa per il
mercato italiano e Trezy non la comunica in nessun materiale pubblico.

---

## 3. Regole di calcolo e di matching

### 3.1 Le due formule dichiarate esplicitamente

`[OSSERVATO]` **Saldo futuro di cassa** (Academy, FAQ «cashflowBalance»):

> **saldo finale = saldo bancario attuale + Σ previsioni di entrata *residue* − Σ previsioni di uscita *residue***

> «La parola "residuo" è fondamentale: se una previsione di 10.000 ha già 6.000 in transazioni
> collegate, solo i **4.000 residui** vengono conteggiati. Il calcolo è coerente indipendentemente
> dalla risoluzione (giornaliera, settimanale, mensile, trimestrale).»

`[OSSERVATO]` **Stato di pagamento di una previsione**: non pagata / parzialmente pagata / totalmente
pagata, **calcolato dalle transazioni collegate**. Le previsioni saldate appaiono «in grigio e
barrate». Solo il residuo entra nella proiezione.

`[OSSERVATO]` **Ciclo di conversione di cassa**: «**DSO + DIO − DPO**».

`[OSSERVATO]` **P&L → cassa**: `importo_cassa = importo_HT × (1 + aliquota_IVA)`, distribuito sui
bucket di pagamento (immediato/15/30/45/60/90 gg) secondo percentuali che sommano a 100.

`[OSSERVATO]` **IVA nel cashflow**: calcolata dall'aliquota della categoria; il saldo netto viene
«iniettato» in una categoria di spesa se a debito, di entrata se a credito.

### 3.2 Il motore di matching: sei livelli di affidabilità

`[OSSERVATO]` `payment.matchReason.*` — le motivazioni mostrate all'utente, dalla più forte:

| Livello | Etichetta | Criterio implicito |
|---|---|---|
| `perfect_match` | «Corrispondenza perfetta (**importo + data**)» | entrambi esatti |
| `near_perfect` | «Corrispondenza quasi perfetta» | entrambi, con scarto |
| `exact_amount` | «Importo esatto» | solo importo |
| `close_amount` | «**Importo simile**» | importo entro tolleranza |
| `due_date_close` | «**Data di scadenza vicina**» | solo prossimità temporale |
| `best_guess` | «Possibile corrispondenza» | ripiego debole |

Accanto compare un indicatore **`matchConfidence` = «Affidabilità della riconciliazione»**.

`[OSSERVATO]` **Le tolleranze numeriche non sono dichiarate da nessuna fonte pubblica.** Le etichette
«importo simile» e «data vicina» implicano una soglia su euro/percentuale e una su giorni, ma il
valore non compare né nella documentazione né nelle stringhe. `[IPOTESI]` Sono costanti nel backend,
non configurabili dall'utente: non esiste alcuna stringa di impostazione che le esponga.
**È il parametro più importante da misurare sul campo.**

`[DEDOTTO]` Esiste una soglia interna oltre la quale una corrispondenza è definita «affidabile»:
è quella che alimenta il collegamento massivo («Abbiamo trovato {{count}} corrispondenze affidabili»).

### 3.3 Gestione degli scostamenti

`[OSSERVATO]` **Pagamento parziale** → tre uscite: rimuovere lo stato pagato, **creare uno
scadenzario** per il residuo, oppure segnare il residuo come pagato manualmente.

`[OSSERVATO]` **Pagamento in eccesso** → quattro uscite: applicare solo a questa scadenza
(«l'eccesso **non viene monitorato**»), applicare alle prossime, applicare a tutte le non pagate,
oppure adattare manualmente il piano. Stati: `fullyAllocated` / `unallocated` / `overAllocated`.

`[OSSERVATO]` **Anomalie rilevate automaticamente sulle fatture**: sovrapagamento («verifica se è
prevista una nota di credito o un pagamento duplicato»), scaduto («{{days}} giorni di ritardo»),
**picco di prezzo** («+{{pct}}% rispetto all'ultimo prezzo pagato»), ciascuna con azione correttiva
proposta.

### 3.4 Estrazione documentale

`[OSSERVATO]` L'OCR produce campi con un **punteggio di affidabilità**, e i campi sotto soglia
innescano una **verifica guidata**: «{{n}} campi estratti con bassa affidabilità. Avvia la verifica
guidata» → conferma campo per campo → «Tutti i campi verificati. Documento affidabile.»
Fra i controlli: **coerenza fra IVA e totali**.

---

## 4. Alert e notifiche

`[OSSERVATO]` **Questa è l'area più debole e peggio documentata del prodotto.** Non esiste un
articolo, pubblico o interno, che spieghi come si configurano gli alert. La documentazione pubblica
li promette due volte («Alertes proactives: sii avvisato prima delle tensioni di tesoreria»,
«Configura degli alert: definisci delle soglie») senza mai spiegarli.

### 4.1 Che cosa risulta effettivamente esistere

| Evento | Canale | Anticipo | Evidenza |
|---|---|---|---|
| Sincronizzazione bancaria completata | in-app | immediato | `notifications.bankSync.successfullySyncedBankAccounts`; «Ricevute {{totalTransactions}} nuove transazioni da {{totalAccounts}} conti» |
| **Connessione bancaria scaduta / da riautenticare** | notifica + push | alla scadenza (~90 gg) | Academy: «Quando la connessione scade, riceverai una notifica»; changelog 29 gen 2024: **possibilità di posticipare (snooze)** l'avviso |
| Fatture scadute o in arrivo | **Forecast Inbox** | all'apertura del cashflow | Academy FAQ «forecastInbox» |
| Transazioni da verificare | Forecast Inbox | all'apertura | idem |
| Previsioni riconciliabili | Forecast Inbox | all'apertura | idem |
| Analisi pronta | in-app | a completamento | «Ti sarai notificato quando l'analisi sarà pronta» |
| Aumento prezzo fornitore | scheda anomalie | a rilevazione | «{{product}} costa il {{pct}}% in meno da {{supplier}}»; «Aumento di maggiore impatto» |
| Sotto il punto di pareggio | insight in-app | a calcolo | «Allerta: stai attualmente operando sotto il punto di pareggio» |
| **Saldo previsto negativo** | insight testuale nei report | orizzonte di previsione | «Secondo le proiezioni, il saldo di cassa **potrebbe diventare negativo** in {{period}}, raggiungendo {{amount}}. È necessario agire ora per prevenire una crisi di liquidità: **accelerare i crediti, posticipare spese non critiche o garantire una linea di credito**.» |
| Gap di liquidità previsto | CashBooster | «tra {{days}} giorni» | «Gap di liquidità previsto tra {{days}} giorni — considera opzioni di finanziamento» |
| Cliente in ritardo | CashBooster | — | «{{name}} è in ritardo di {{days}} giorni ({{amount}})» |

`[OSSERVATO]` **Canali**: in-app (centro notifiche con `notifications.title` / `notifications.empty`)
e **push su dispositivo mobile** (`/notifications/register`, `/notifications/preferences`), con la
limitazione esplicita «Le notifiche push sono disponibili **solo su dispositivo**» e «Le impostazioni
si applicano **solo a questo dispositivo**». **Nessuna evidenza di alert via email o Slack.**

`[OSSERVATO]` **Soglie**: esiste un endpoint `/balance-thresholds`. È l'unico appiglio a soglie di
saldo configurabili. `[IPOTESI]` Alimenta l'avviso di saldo previsto negativo; non ho trovato
stringhe di interfaccia che ne descrivano la configurazione, il che suggerisce una funzione
rudimentale o non ancora esposta.

### 4.2 Lettura

`[DEDOTTO]` **Trezy ha sostituito gli alert con una coda di lavoro.** La *Forecast Inbox* «si apre
automaticamente quando accedi al cashflow e ci sono elementi che richiedono la tua attenzione»,
in ordine prescritto: prima le transazioni da verificare, poi le previsioni, poi le fatture.
È un modello **pull**: l'utente deve entrare nell'applicazione perché il sistema gli parli. Gli unici
eventi che lo raggiungono altrove sono la scadenza della connessione bancaria e le push mobile.

`[OSSERVATO]` Il changelog conferma che il lavoro sulle notifiche si è fermato presto: la sola voce
sul tema è del **14 agosto 2023** — «modifiche backend che permetteranno avvisi più tempestivi e
utili, come un **aggiornamento giornaliero di cassa** e **avvisi per previsione di flusso di cassa
negativo**». `[DEDOTTO]` Erano annunciate come abilitazioni future; a tre anni di distanza non
risultano stringhe di prodotto che descrivano un digest giornaliero configurabile.

---

## 5. Changelog

`[OSSERVATO]` `https://www.trezy.io/changelog` — **14 voci, dal 31 luglio 2023 all'8 aprile 2024**.
**Nessun aggiornamento da 28 mesi**, benché la pagina resti linkata dal piè di pagina di tutte le
lingue come «Aggiornamenti del prodotto». Le voci sono in inglese anche sulle versioni localizzate.

| Data | Tipo | Voce principale |
|---|---|---|
| 8 apr 2024 | 🚀 | **Trezy 3.0 in beta pubblica** — redesign, opt-out, dati invariati |
| 26 feb 2024 | 🐛 | Impossibile ricategorizzare manualmente le transazioni (corretto) |
| 29 gen 2024 | 🚀 | **Snooze** degli avvisi di riautenticazione bancaria; scelta fra **Plaid, Salt Edge, Bridge** |
| 15 gen 2024 | 🐛 | Export P&L limitato all'anno corrente; categorizzazione degradata su alcune banche |
| 2 gen 2024 | 🚀 | **Passaggio a Plaid** (12.000+ istituti UK/EU); nuovo signup; **accuratezza classificazione da 60,99% a 95,69%** |
| 18 dic 2023 | ✨ | `data.trezy.io`: **700 settori francesi**, 2 mln di imprese europee, valutazione IA per azienda |
| 6 nov 2023 | 🚀 | Cashflow responsive su mobile; confronto per 4 ratio su data.trezy.io; fix su categorizzazioni sovrascritte che tornavano indietro |
| 23 ott 2023 | 🚀 | Sotto-categorie automatiche nella lingua del paese; **nuova tecnologia di forecasting a serie storiche** |
| 9 ott 2023 | 🚀🐛 | Zloty polacco; fix: riconoscimento fatture in blocco (centinaia) non funzionante |
| 25 set 2023 | 🚀🐛 | Classificatore migliorato per utenti con pochi dati storici |
| 11 set 2023 | 🚀 | **Creazione automatica di sotto-categorie (closed beta)** dalle descrizioni; fix: categoria di segno opposto |
| 28 ago 2023 | ✨ | **Benchmarking in beta** (su richiesta); import transazioni con mappatura colonne, anteprima e **saldo iniziale** |
| 14 ago 2023 | 🚀 | Cashflow responsive; **backend per avvisi**: aggiornamento giornaliero di cassa e avviso di cash flow negativo |
| 31 lug 2023 | 🚀 | Esperienza mobile; profili azienda su data.trezy.io da dati del governo francese |

`[DEDOTTO]` **Che cosa rivela il changelog:**
1. La priorità assoluta del 2023-24 è stata la **categorizzazione automatica** (7 voci su 14): è il
   problema che Trezy ha deciso di risolvere per primo, e il salto 60,99% → 95,69% è l'origine del
   claim commerciale.
2. Un intero prodotto — **`data.trezy.io`**, il benchmarking settoriale, 5 voci di changelog — è stato
   **dismesso** (oggi 404). `[DEDOTTO]` Investimento abbandonato.
3. **Riconciliazione e scadenzario non compaiono mai** in 14 voci: sono funzioni arrivate dopo aprile
   2024, in un periodo non documentato.
4. Il silenzio dopo aprile 2024 coincide con «Trezy 3.0»: `[IPOTESI]` la comunicazione di prodotto è
   stata spostata altrove (in-app, Academy) e la pagina pubblica semplicemente abbandonata.

---

## 6. API pubblica

`[OSSERVATO]` **Non esiste.** Nessuna documentazione per sviluppatori, nessuna specifica OpenAPI,
nessun portale, nessuna chiave API menzionata in alcun materiale. `api.trezy.io` risponde `404` da
nginx su tutti i percorsi standard provati (§ 1.2), pur essendo referenziata dall'applicazione.

`[OSSERVATO]` L'unico accenno a integrazione programmatica in tutta la documentazione pubblica è la
riga «**Webhooks pour intégrations**» nella scheda «Automazione» dell'articolo Export Excel. Non è
documentata altrove. Nell'applicazione, le stringhe `webhooks.*` riguardano webhook **in entrata**
ricevuti dall'aggregatore bancario (`webhookReceived`, `errors.invalidSignature`,
`errors.missingConnectionIdentifier`). `[IPOTESI]` Il webhook in uscita per il cliente non esiste
o non è mai stato realizzato.

`[OSSERVATO]` Le integrazioni disponibili sono **preconfezionate, non programmabili**: Pennylane
(OAuth), QuickBooks Online (OAuth, sola lettura), Invopop (SDI italiano), Falco.

### Modello dati ricostruito

`[OSSERVATO]` Dal bundle pubblico `main.a1fc669a.js` ho estratto **225 percorsi**. Inventario
completo e commentato: `assets/trezy/materiali-pubblici/kb-09-inventario-endpoint-e-modello-dati.md`.
Le aree che emergono:

- **`/api/v2/estimated-accounting/*`** — il concetto centrale: da movimenti bancari categorizzati
  Trezy *stima* scritture di prima nota, bilancio di verifica, conto economico e stato patrimoniale
  (`entries`, `trial-balance`, `profit-loss`, `balance-sheet`, `cash-flow`, `regenerate`). Accanto
  vive `/api/v2/accounting/*` per la contabilità vera importata da FEC.
- **`/fec/*`** (19 percorsi) — struttura, mapping, previsioni e **valutazione d'azienda** a partire dal
  tracciato contabile francese. `[DEDOTTO]` L'impianto contabile è progettato attorno alla Francia.
- **`/api/payment-schedules/*`**, **`/transaction-links/*`** — scadenze e legami con le transazioni.
- **`/cashbooster`, `/boost/*`, `/api/credit-allocations`** — marketplace di finanziamento
  (factoring, linea di credito, finanziamento scorte, prestito di tesoreria) con criteri di
  ammissibilità per partner. `[DEDOTTO]` È una via di monetizzazione oltre l'abbonamento.
- **`/recipes`, `/inventory/sessions`, `/api/products/*`** — ricette, inventari e prezzi per prodotto:
  ambizione verso la **ristorazione**.
- **`/share/report/:token`** — report condivisibile via link pubblico.
- **`/auth/switch-account`** — struttura multi-azienda nativa (coerente con l'offerta per
  commercialisti e CFO esterni).

`[OSSERVATO]` Stack osservabile: React con Mantine e TanStack Query, **PostHog** per il prodotto
analytics, GTM/Segment/TikTok/AppLovin/Axon per il marketing, widget **Enable Banking (Tilisy)** per
l'open banking, sito vetrina su **Webflow**.

---

## 7. Sintesi dei punti che contano

1. **La documentazione pubblica è un mercato solo: la Francia.** Undici articoli non tradotti, voce di
   menu marcata `french-only`, integrazione contabile costruita sul FEC, integrazione contabile
   partner (Pennylane) francese. L'italiano esiste nel prodotto, non nella documentazione.
2. **La conoscenza operativa è chiusa dietro il login.** Chi valuta Trezy non può sapere come
   funzionano riconciliazione, aging o previsioni prima di iscriversi.
3. **Il changelog è fermo da 28 mesi** e un prodotto intero (`data.trezy.io`) è stato dismesso senza
   comunicazione.
4. **Le regole di calcolo, dove sono dichiarate, sono chiare e ragionevoli** — la formula del saldo
   residuo e il ponte P&L→cassa con IVA e distribuzione dei pagamenti sono ben concepiti.
5. **Le tolleranze di matching non sono dichiarate** ed è la lacuna più rilevante da colmare con
   l'osservazione diretta.
6. **Gli alert sono il punto debole**: nessun avviso proattivo configurabile, nessuna email, un
   modello pull basato sulla Forecast Inbox.
7. **Le regole di categorizzazione sono primitive**: un solo «contiene» case-insensitive, senza
   condizioni su importo né operatori logici.
8. **Nessuna API pubblica**, nessun webhook in uscita verificabile.
9. **L'Italia è servita da un'integrazione SDI reale ma taciuta**, costruita su Invopop, con
   registrazione del Codice Destinatario presso l'Agenzia delle Entrate.
10. **La tassonomia predefinita è per metà di finanza personale**, e la traduzione italiana contiene
    errori contabili sostanziali («Risconti Attivi» per i crediti verso clienti).

---

## 8. Fonti

**Sito e documentazione**
- `https://www.trezy.io/it/documentazione` — pagina di documentazione italiana (contenuto in francese)
- `https://www.trezy.io/js/documentation-content.js` — **contenuto integrale della KB pubblica (11 articoli)**
- `https://www.trezy.io/documentation`, `/fr/documentation`, `/en-us/documentation`, `/es/documentacion`, `/de/dokumentation`, `/nl/documentatie`, `/pl/dokumentacja` — varianti linguistiche
- `https://www.trezy.io/sitemap.xml` — 4.124 URL
- `https://www.trezy.io/robots.txt` — generato il 30 luglio 2026
- `https://www.trezy.io/llms.txt` — sintesi commerciale per modelli linguistici
- `https://www.trezy.io/llms-full.txt` — **scheda prodotto, prezzi, specifiche tecniche, FAQ (8 sezioni)**

**Changelog** (consultate tutte e 14 le pagine di dettaglio)
- `https://www.trezy.io/changelog` e `https://www.trezy.io/it/changelog`
- `/changelog/apr-08`, `/feb-26`, `/jan-29`, `/jan-15`, `/jan-02`, `/dec-18`, `/nov-6`, `/oct-23`, `/oct-09`, `/sep-25`, `/sep-11`, `/aug-28`, `/aug-14`, `/july-31`

**Applicazione**
- `https://appv2.trezy.io/` — guscio dell'applicazione corrente
- `https://appv2.trezy.io/static/js/main.a1fc669a.js` — **bundle applicativo, 225 percorsi**
- `https://appv2.trezy.io/static/js/locales.0bc75978.js` — **bundle di localizzazione, 8 lingue, 9.971 stringhe italiane, ramo `academy`**
- `https://app.trezy.io/` — vecchia applicazione (HTTP 503)
- `https://tilisy.enablebanking.com/lib/widgets.umd.min.js` — widget open banking caricato dall'app

**Verificati come inesistenti** (11 agosto 2026)
- `help.trezy.io`, `support.trezy.io`, `docs.trezy.io`, `developers.trezy.io`, `developer.trezy.io`, `status.trezy.io`, `classify.trezy.io` — tutti HTTP 404
- `data.trezy.io` — HTTP 404 (prodotto dismesso, citato in 5 voci di changelog del 2023)
- `api.trezy.io` — HTTP 404 su `/`, `/docs`, `/redoc`, `/openapi.json`, `/swagger`, `/swagger.json`, `/api/docs`, `/v1`, `/api/v1`, `/health`, `/graphql`

**Materiali estratti** (in `assets/trezy/materiali-pubblici/`)
- `kb-01-connessione-bancaria.md`
- `kb-02-import-manuale-pennylane-export.md`
- `kb-03-gestione-categorie.md`
- `kb-04-previsioni-metodi.md`
- `kb-05-academy-faq-regole-di-calcolo.md` ← **il più importante**
- `kb-06-riconciliazione-matching-pagamenti.md`
- `kb-07-sdi-invopop-fatturazione-elettronica.md`
- `kb-08-changelog-2023-2024.md`
- `kb-09-inventario-endpoint-e-modello-dati.md`
