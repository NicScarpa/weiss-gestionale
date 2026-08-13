# Agicap — Centro assistenza e documentazione utente

Analisi competitiva WEISS S.r.l. — fase 0, area «help center e documentazione utente».
Data di accesso di tutte le fonti: **11 agosto 2026**. Autore: subagente `fase0-help`.

> **Documento gemello:** `help-center-da-leggere-con-browser.md`, in questa stessa cartella — la lista prioritizzata di URL del centro assistenza da recuperare col browser in Fase 1. Il centro assistenza qui è documentato dall'esterno perché blocca i client non-browser; con un browser reale la fonte si apre e quel file dice da dove cominciare.

---

## Fonti consultate

### Raggiungibili e lette direttamente `[OSSERVATO]`

| URL | Cosa contiene |
|---|---|
| `https://agicap.com/it/supporto/` | pagina supporto commerciale, cita un «Help Center» senza collegarlo |
| `https://agicap.com/robots.txt` | 8 sitemap dichiarate; blocco esplicito di GPTBot e CCBot |
| `https://agicap.com/sitemap_index.xml` e `sitemap-IT.xml` | indice completo delle pagine italiane |
| `https://agicap.com/it/funzionalita/monitoraggio-cash-flow/` | modulo consuntivo, sincronizzazione, categorizzazione, riconciliazione |
| `https://agicap.com/it/funzionalita/tesoreria-previsionale/` | previsionale, 13 settimane, scenari, scostamenti |
| `https://agicap.com/it/funzionalita/reporting/` | report e KPI |
| `https://agicap.com/it/funzionalita/solleciti-di-pagamento/` | piani di sollecito |
| `https://agicap.com/it/funzionalita/gestione-delle-spese/` | carte e note spese |
| `https://agicap.com/it/funzionalita/consolidamento/` | consolidamento multi-entità |
| `https://agicap.com/it/funzionalita/mcp-server/` | server MCP per assistenti AI |
| `https://agicap.com/it/prodotti/gestione-della-tesoreria/` | mappa dei moduli e KPI |
| `https://agicap.com/it/prodotti/pianificazione-liquidita/` | rolling forecast, coperture, scostamenti |
| `https://agicap.com/it/prodotti/fatti-pagare-dai-clienti/` | ciclo attivo, DSO, solleciti |
| `https://agicap.com/it/prodotti/paga-i-fornitori/` | ciclo passivo, OCR, approvazioni, ISO 20022 |
| `https://agicap.com/it/prodotti/comunicazione-bancaria/` | protocolli e formati bancari |
| `https://agicap.com/it/prodotti/applicazione-mobile/` | app mobile, notifiche |
| `https://agicap.com/it/le-nostre-integrazioni/` | elenco integrazioni (banche, ERP, PSP) |
| `https://agicap.com/it/le-nostre-integrazioni/fatture-in-cloud/` | integrazione fatturazione elettronica italiana |
| `https://agicap.com/it/glossario/definizione-dso-days-sales-outstanding/` | formula del DSO |
| `https://agicap.com/it/articolo/software-di-riconciliazione-bancaria/` | criteri di matching |
| `https://agicap.com/it/articolo/cash-flow-previsionale/` | formula del previsionale |
| `https://agicap.com/it/articolo/scadenzario-pagamenti/` | campi dello scadenzario |
| `https://agicap.com/fr/article/analyse-des-ecarts-tresorerie-avec-agicap/` | analisi degli scostamenti dentro il prodotto |
| `https://agicap.com/en-us/article/agicap-mcp-claude/` | MCP, tre livelli Ask/Act/Automate |
| **`https://api.agicap.com/treasury-bank-journal/detailed_documentation.pdf`** | **guida API ufficiale, 9 pagine, con endpoint e uno screenshot dell'interfaccia** |
| `https://helpcenter.spendesk.com/en/articles/5747463-connect-spendesk-with-agicap` | procedura di collegamento vista dal lato di un partner |

### Individuate ma **non leggibili** `[OSSERVATO: il blocco]`

| URL | Esito |
|---|---|
| `https://help.agicap.com/` | HTTP 404 |
| `https://help.agicap.com/it/`, `/fr/`, `/en/` | HTTP 404 |
| `https://help.agicap.com/it/articles/10038456-...` (articolo reale) | HTTP 404 |
| `https://help.agicap.com/hc/it`, `/hc/en-us`, `/hc/it/categories` | HTTP 403 |
| `https://help.agicap.com/sitemap.xml` | HTTP 404 |
| `https://api.agicap.com/` e `/guides/authentication` | pagina servita, ma è una SPA: torna solo il titolo «Agicap Developer Portal» |
| `https://www.postman.com/agicap-data-int/agicap-public/...` | SPA, contenuto non estraibile |
| `https://docs.celigo.com/hc/en-us/articles/30494709375515-Set-up-a-connection-to-Agicap` | HTTP 403 |
| `web.archive.org`, `archive.ph` | irraggiungibili da questo strumento |

---

## 1. Il centro assistenza esiste, è su Intercom, e non è leggibile da qui

**`[OSSERVATO]`** Il centro assistenza di Agicap vive su **`help.agicap.com`**, è costruito su **Intercom** ed è multilingua. Lo schema degli URL è quello tipico di Intercom:

```
https://help.agicap.com/{locale}/collections/{id}-{slug}
https://help.agicap.com/{locale}/articles/{id}-{slug}
```

I locale attestati sono **`it`, `en`, `de`, `fr`, `es`** (i primi tre verificati su URL reali; `fr` ed `es` dedotti dal fatto che il sito commerciale ha quelle lingue — `[DEDOTTO]`). Il titolo delle pagine alterna «Help Center» e «Help-Center - FAQs».

**Il blocco.** Ogni richiesta a `help.agicap.com` fatta con lo strumento di fetch riceve 404 o 403, comprese le URL di articoli che i motori di ricerca hanno indicizzato e che quindi esistono. Non è un problema di indirizzi sbagliati: lo stesso strumento legge senza attriti altri centri assistenza Intercom (verificato su `helpcenter.spendesk.com`). È un filtro sui client non-browser posto da Agicap, coerente con il loro `robots.txt`, che vieta nominalmente **GPTBot** e **CCBot** oltre a un elenco di circa trecento crawler.

**Non ho aggirato il filtro.** Niente user-agent falsificato, niente proxy di terze parti, niente archivi alternativi (peraltro irraggiungibili). Di conseguenza **l'indice completo della knowledge base — categorie, sottocategorie, elenco degli articoli — non è ottenibile per questa via**, e va considerato un buco strutturale di questa fase, non una lacuna colmabile con più tempo.

Quello che segue è quindi costruito su due sostituti:
1. ciò che i motori di ricerca hanno indicizzato del centro assistenza (poche pagine, ma con titoli e URL verificabili);
2. la documentazione pubblica di prodotto su `agicap.com`, che è ricca e in italiano, più la **guida API ufficiale in PDF**, che è vera documentazione tecnica e contiene anche uno screenshot dell'interfaccia.

---

## 2. Struttura della knowledge base: quello che se ne vede dall'esterno

**`[NON VERIFICATO — solo titolo e URL dai motori di ricerca]`** — otto pagine del centro assistenza risultano indicizzate. L'esistenza di ciascuna URL e il suo titolo sono accertati; **il contenuto no, non l'ho letto**. Il titolo non autorizza a dedurre cosa dica l'articolo.

| Locale | Tipo | ID | Titolo | URL |
|---|---|---|---|---|
| it | articolo | 10038456 | Cos'è l'OCR e Come Può Aiutarti? | `https://help.agicap.com/it/articles/10038456-cos-e-l-ocr-e-come-puo-aiutarti` |
| en | articolo | 10038431 | What is the 'Uncategorized' Category and How Can It Help You? | `https://help.agicap.com/en/articles/10038431-what-is-the-uncategorized-category-and-how-can-it-help-you` |
| en | articolo | 10038284 | How to Synchronize Payments and Cash Positioning for Cash Pooling in Agicap? 💡 | `https://help.agicap.com/en/articles/10038284-how-to-synchronize-payments-and-cash-positioning-for-cash-pooling-in-agicap` |
| en | **collezione** | 10349191 | Cashflow Table | `https://help.agicap.com/en/collections/10349191-cashflow-table` |
| de | **collezione** | 1856195 | Mit Agicap anfangen (iniziare con Agicap) | `https://help.agicap.com/de/collections/1856195-mit-agicap-anfangen` |
| de | articolo | 10216798 | So erstellen Sie Ihr Agicap-Zahlungskonto (creare il conto di pagamento Agicap) | `https://help.agicap.com/de/articles/10216798-so-erstellen-sie-ihr-agicap-zahlungskonto` |
| de | articolo | 10037980 | Wie man einen Vorgang in Agicap aufteilt (come dividere un'operazione) | `https://help.agicap.com/de/articles/10037980-wie-man-einen-vorgang-in-agicap-aufteilt` |
| de | articolo | 8074146 | DATEV Belegtransfer für erfolgreiche Datenübermittlung vorbereiten | `https://help.agicap.com/de/articles/8074146-datev-belegtransfer-fur-erfolgreiche-datenubermittlung-vorbereiten` |

**Cosa si legge negli identificativi** `[DEDOTTO]`:
- gli ID sono globali di workspace Intercom e crescono nel tempo. La collezione `1856195` («iniziare con Agicap») è di parecchie generazioni più vecchia della collezione `10349191` («Cashflow Table»): il centro assistenza è stratificato, con un nucleo di onboarding storico e collezioni recenti costruite intorno alle viste nuove del prodotto;
- gli articoli `10037980`, `10038284`, `10038431`, `10038456` stanno in una finestra strettissima di ID: sono stati creati **nella stessa sessione di redazione**. Quattro articoli scritti insieme che parlano di split di un'operazione, cash pooling, categoria «Uncategorized» e OCR: è la firma di un rilascio o di una riscrittura d'insieme della documentazione operativa sui movimenti;
- lo stesso articolo esiste con lo **stesso ID** in tutte le lingue, cambia solo lo slug. Quindi `https://help.agicap.com/it/articles/10038431-...` esiste in italiano, anche se il motore di ricerca ha indicizzato solo la versione inglese.

**Collezioni note per nome**: `Cashflow Table` (en), `Mit Agicap anfangen` (de). Dai frammenti indicizzati emergono altri raggruppamenti citati — «Cashflow», «Cashflow Plan», «Accounts Payable and Payment with EBICS & H2H» — ma questi arrivano da sintesi del motore di ricerca e **non da una pagina che ho letto**: `[DA INDICE DI RICERCA, non verificato]`.

---

## 3. Contenuto degli articoli: solo frammenti

`[DA INDICE DI RICERCA]` — quanto segue proviene dalle sintesi che il motore di ricerca produce a partire dal testo indicizzato delle pagine. È la cosa più vicina al contenuto reale che ho potuto ottenere, ma **non l'ho letto sulla pagina**: va trattato come indizio, non come citazione.

**«What is the 'Uncategorized' Category and How Can It Help You?»** — la categoria «Uncategorized» viene **creata automaticamente quando si collega un conto bancario** e raccoglie tutte le transazioni non ancora categorizzate; l'utente le rivede e le categorizza manualmente. È il pattern di una coda di lavoro esplicita, non di un fallback silenzioso.

**«How to Synchronize Payments and Cash Positioning for Cash Pooling in Agicap?»** — i conti bancari si sincronizzano e attivano nella pagina **«Banks & Integration»**; i conti sincronizzati compaiono in **Settings > Bank Accounts (ebics)** dentro il modulo Payments. Della sincronizzazione passano **solo nome e IBAN**. Per usare un conto nel modulo pagamenti bisogna **associarlo a un contratto EBICS/H2H** e aggiungere un BIC, oppure dichiararlo come conto esterno. I conti non sincronizzati si possono aggiungere a mano. Compare un permesso chiamato **«Prepare payments»**.

**«Cos'è l'OCR e Come Può Aiutarti?»** — l'OCR rileva le informazioni nei documenti (PDF), legge i dati della fattura e li compila automaticamente.

**«So erstellen Sie Ihr Agicap-Zahlungskonto»** — creazione del conto di pagamento Agicap, che permette di pagare i fornitori direttamente da Agicap, con bonifici in EUR nell'area SEPA.

**«Wie man einen Vorgang in Agicap aufteilt»** — esiste una funzione di **split di un'operazione** su più categorie. Del funzionamento non ho ottenuto nulla di più.

**«DATEV Belegtransfer»** — preparazione del trasferimento documenti verso DATEV (contabilità tedesca). `[FUORI SCALA]` per WEISS.

---

## 4. Moduli di prodotto

`[DA DOCUMENTAZIONE]` — fonte: pagine prodotto e funzionalità italiane di `agicap.com`, lette direttamente. Non sono articoli di help center: descrivono *cosa* fa il modulo, raramente *come si fa* passo per passo. Dove il passo operativo c'è, lo segnalo.

### 4.1 Monitoraggio del cash flow (consuntivo)
Fonte: `/it/funzionalita/monitoraggio-cash-flow/`. Titolo di pagina: «Monitora il cash flow in tempo reale».
- **Sincronizzazione bancaria**: «Connetti in modo sicuro i tuoi conti bancari e il protocollo EBICS», dichiarati oltre **300 banche italiane ed europee**, aggiornamento automatico senza importazioni manuali.
- **Classificazione automatica dei flussi**: si definiscono categorie di entrate e uscite più «regole avanzate»; l'intelligenza artificiale classifica le operazioni.
- **Confronto in tempo reale tra situazione effettiva e budget**: budget impostati **per categoria**, con controllo degli scostamenti.
- **Riconciliazione bancaria automatica**: «in pochi click», con **suggerimenti automatici tra operazioni pagate e impegnate**.
- **Monitoraggio linee di credito**: **castelletto utilizzato e disponibile**, con la liberazione nei mesi successivi.

### 4.2 Tesoreria previsionale
Fonte: `/it/funzionalita/tesoreria-previsionale/`. Titolo: «Un approccio unico e completo alle previsioni di cassa».
- Breve termine: aggregazione bancaria **più** dati previsionali da **AP/AR** e flussi prevedibili (affitti, stipendi, tasse, debiti); **previsione a 13 settimane**.
- Lungo termine: **convertitore dedicato** che trasforma le previsioni annuali di conto economico in una visione di cassa; previsioni basate su **storico** e su **ipotesi**; **impatto del DSO considerato automaticamente nella previsione**.
- **Scenari** costruibili per testare opportunità e mitigare rischi.
- **Analisi degli scostamenti**: reale contro previsionale, oppure piano contro piano, con dettaglio per gruppo, entità e progetti.

### 4.3 Pianificazione della liquidità
Fonte: `/it/prodotti/pianificazione-liquidita/`.
- **Rolling forecast** automatizzato da più fonti; dati previsionali di operazioni, finanziamenti e investimenti in un'unica interfaccia.
- Conversione del **P&L previsto** in previsione di cassa.
- Scostamenti «tra reale e previsionale e tra diversi scenari», con drill down su gruppo, divisione, entità.
- Debiti a tasso fisso e variabile centralizzati, strumenti di copertura **CAP, SWAP, FLOOR**, **calcolo automatico degli interessi futuri**. `[FUORI SCALA]`

### 4.4 Scadenzario clienti e solleciti (ciclo attivo)
Fonti: `/it/prodotti/fatti-pagare-dai-clienti/`, `/it/funzionalita/solleciti-di-pagamento/`.
- KPI in tempo reale su **DSO**, **scadenzario**, **crediti in sospeso**; identificazione dei **clienti morosi**.
- Recupero automatico delle fatture dall'ERP via **API o SFTP**.
- **Piani di sollecito** come «sequenze personalizzate che combinano email e promemoria di chiamata, in base alla segmentazione dei clienti». Segmentazione per **dimensione, area geografica, categoria**, e in altro punto per **storico cliente, importo e giorni di ritardo**.
- Canali: **email** con modello personalizzabile, allegato PDF della fattura e **link di pagamento**; **telefono**, dove è automatico solo il promemoria al team, non la chiamata.
- Due modalità: **completamente automatica** oppure **guidata**, con validazione manuale sui key account.
- **Fatture in contestazione**: si etichettano e vengono **escluse automaticamente** dai solleciti.
- Riconciliazione automatica incasso-fattura e aggiornamento dinamico degli indicatori.

### 4.5 Ciclo passivo e pagamenti fornitori
Fonte: `/it/prodotti/paga-i-fornitori/`.
1. Ricezione: centralizza «fatture fornitore, note di credito e transazioni tramite carta di credito aziendale».
2. **OCR e pre-contabilizzazione**: il sistema estrae i dati e «assegna automaticamente ogni impegno di spesa a un corretto **centro di costo** e al relativo **codice IVA**».
3. **Flussi approvativi** configurabili su «**soglie di importo**, **natura merceologica** della spesa e **centro di costo**».
4. Pagamenti eseguiti via **H2H, SWIFT, BACS, EBICS TS**, con file di pagamento «nei formati e nelle valute richiesti, in conformità con lo standard **ISO 20022**».
5. Riconciliazione con trasferimento automatico delle registrazioni all'ERP e **three-way matching** ordine/bolla/fattura.

### 4.6 Connessioni bancarie
Fonte: `/it/prodotti/comunicazione-bancaria/`.
- Protocolli: **CBI** (mercato italiano), **SWIFT**, **H2H**, **AFT/SFTP**, **EBICS**, **BACS**, **EDITRAN**.
- Formati: **MT e MX SWIFT**, **ISO 20022 camt.053**, tracciati **CBI**, XML EBICS.
- Nota: in questa pagina **non si parla di PSD2 né di open banking**; l'aggregazione «bancaria» compare altrove come funzione, ma il canale dichiarato qui è quello corporate. `[DEDOTTO]` La connettività retail PSD2 esiste (il collegamento a Qonto e Revolut lo implica) ma non è il canale che raccontano.
- Metriche dichiarate: 8.000+ reparti finanziari clienti; fino al **95% delle scritture contabili automatizzate** in un caso cliente; aggiornamento saldi «da mezza giornata a pochi minuti».

### 4.7 Reporting
Fonte: `/it/funzionalita/reporting/`. Report citati: **situazioni di cassa**, **commissioni bancarie per istituto**, **DSO**, **indebitamento**, **investimenti**, **runway** (cash burn), **gestione del pool bancario** (volume operazioni per banca). Livelli: **gruppo, entità, categoria**. Condivisione con gli stakeholder e consultazione da app mobile.

### 4.8 Gestione delle spese e carte aziendali
Fonte: `/it/funzionalita/gestione-delle-spese/`. Carte **virtuali**, **fisiche**, **monouso**; Apple Pay e Google Pay; limiti fino a 100.000 € mensili; validazione digitale delle ricevute con certificazione legale via **Universign**; partner emittente **Swan**; promemoria automatici per il caricamento delle ricevute. Soglia dichiarata di 5.000 € di spesa mensile per l'accesso gratuito al modulo.

### 4.9 App mobile
Fonte: `/it/prodotti/applicazione-mobile/`. Foto delle ricevute e richieste di rimborso; approvazione dei pagamenti dal telefono; saldi e transazioni recenti; KPI; condivisione della dashboard in PDF; saldi storici e previsionali. **Notifiche push «per ogni operazione importante»** e un **«riepilogo del lunedì mattina»** sullo stato della tesoreria.

### 4.10 MCP server e AI
Fonti: `/it/funzionalita/mcp-server/`, `/en-us/article/agicap-mcp-claude/`.
- Espone a un assistente AI: posizioni di cassa, previsioni, transazioni e fatture, report, scostamenti.
- Azioni: interrogazioni in linguaggio naturale, generazione di report ricorrenti, **ricategorizzazione massiva di transazioni**, **creazione di scenari what-if**, aggiornamento di presentazioni.
- Tre livelli dichiarati nell'articolo inglese: **Ask / Act / Automate**.
- Permessi: l'amministratore sceglie **quali strumenti** possono connettersi e se l'accesso è **sola lettura** o **lettura-scrittura**; i permessi dell'utente Agicap si **ereditano**, l'AI vede solo ciò che l'utente vedrebbe.

### 4.11 Consolidamento multi-entità `[FUORI SCALA]`
Fonte: `/it/funzionalita/consolidamento/`. «Diversi livelli di consolidamento» su gruppo, entità, divisione; conversione delle posizioni nella valuta di riferimento con **tassi di cambio aggiornati quotidianamente**, oppure tassi personalizzati applicati alla frequenza desiderata.

### 4.12 Debito, rischio cambio, investimenti, cash pooling `[FUORI SCALA]`
Fonte: `/it/prodotti/gestione-della-tesoreria/`. Centralizzazione dei finanziamenti multivaluta, automazione dei piani di rimborso e del calcolo interessi, **Posizione Finanziaria Netta** in tempo reale, rilevamento automatico delle **transazioni infragruppo**; consolidamento dell'esposizione in valuta e simulazione delle coperture; quantificazione della liquidità investibile e simulazione degli investimenti.

### 4.13 Integrazioni
Fonte: `/it/le-nostre-integrazioni/`. **Banche**: Intesa Sanpaolo, UniCredit, Banco BPM, Qonto, Banco Desio, Revolut, Poste Italiane, Banca Sella, Banca Popolare di Sondrio, MPS, Credem, BPER, Volksbank, Crédit Agricole. **ERP e contabilità**: Dynamics 365 Business Central, SAP Business One, TeamSystem Gamma Enterprise e Alyante, Sistemi eSolver e PROFIS, Passepartout Mexal, Wolters Kluwer Arca Evolution, IBM AS400, Oracle NetSuite, Odoo, Centro Software SAM ERP2, Panthera, Oracle JD Edwards, Sanmarco Informatica Jgalileo, NTS Business Cube, Xero, QuickBooks, Sage X3, Datev Koinos, Navision, SAP S/4HANA. **PSP**: Payplug, Payoneer, Stripe, PayPal, Adyen. **File e collaborazione**: SharePoint, Google Sheet, Google Drive, Excel.

**Fatturazione elettronica italiana**: l'unica integrazione italiana con pagina dedicata è **Fatture in Cloud** (`/it/le-nostre-integrazioni/fatture-in-cloud/`): sincronizza fatture **emesse e ricevute**, permette di «visualizzare in tempo reale l'impatto delle fatture emesse e ricevute in sospeso sul tuo flusso di cassa» e di «tenere traccia delle fatture dei clienti scadute, per ottimizzare i promemoria». **Nessun riferimento diretto a SdI o XML FatturaPA** in tutta la documentazione pubblica che ho letto: l'ingresso delle fatture italiane passa dal gestionale, non dal canale fiscale.

---

## 5. Logiche di calcolo documentate

Questa è la sezione che il centro assistenza avrebbe dovuto riempire e che ho potuto solo abbozzare. Quanto segue è **tutto** ciò che ho trovato di esplicito.

**DSO** `[DA DOCUMENTAZIONE]` — `/it/glossario/definizione-dso-days-sales-outstanding/` riporta **una sola formula**:

> DSO = Totale crediti commerciali ÷ Fatturato giornaliero medio

con esempio: 100.000 € di crediti su 10.000 € di fatturato giornaliero danno **10 giorni**. Il metodo *count-back* (esaurimento) non è citato. Notare che sulle pagine prodotto il DSO viene detto «considerato automaticamente nell'impatto sulla previsione» senza spiegare come.

**Cash flow previsionale** `[DA DOCUMENTAZIONE]` — `/it/articolo/cash-flow-previsionale/`: **Entrate previste − Uscite previste = cash flow previsionale**. Le entrate elencate sono saldi di fatture già emesse, sussidi o rimborsi approvati, incassi regolari da contratto; le uscite sono pagamenti differiti a fornitori, affitti, compensi, abbonamenti software, contributi, rate di rimborso. Orizzonte citato **12-24 mesi**, con riferimento al Codice della Crisi d'Impresa.

**Riconciliazione, criteri di abbinamento** `[DA DOCUMENTAZIONE]` — `/it/articolo/software-di-riconciliazione-bancaria/`: il matching si basa su **importo**, **data**, **riferimenti e descrizioni** (con tolleranza quando i dati non coincidono perfettamente), **tassi di cambio** per il multivaluta. L'IA «identifica e classifica automaticamente ogni transazione bancaria, abbinandola alle corrispondenti voci contabili» e riconosce operazioni «con descrizioni diverse o arrotondamenti». Il sistema segnala **discrepanze, doppioni, importi sospetti**. **Nessun punteggio di confidenza, nessuna soglia numerica, nessuna finestra temporale dichiarata.**

**Scostamenti** `[DA DOCUMENTAZIONE]` — `/fr/article/analyse-des-ecarts-tresorerie-avec-agicap/`: confronto immediato fra previsionale e reale in una scheda «reale e previsionale», analisi per **categoria**, per **conto bancario**, per **operazione**; saldi importati «più volte al giorno»; categorizzazione via algoritmo di machine learning; conversione del P&L in previsionale. **Nessuna formula di scostamento** (assoluto, percentuale, cumulato) è pubblicata.

**Categorizzazione** `[DA INDICE DI RICERCA]` — le sintesi tedesche parlano di regole «**Wenn → Dann**» (se → allora) definibili dall'utente, accanto all'IA. La documentazione italiana dice «regole avanzate» senza definirne la grammatica: non so quali campi siano confrontabili, né quale sia la precedenza fra regola utente e classificazione IA, né se le regole siano per conto o comuni a tutti i conti — la versione francese di una pagina commerciale accenna a «regole specifiche o comuni a tutti i conti» `[DA INDICE DI RICERCA, non verificato]`.

**Orizzonti temporali** `[DA DOCUMENTAZIONE]` — `/it/prodotti/gestione-della-tesoreria/` elenca esplicitamente **giornaliero, settimanale, 13 settimane, annuale**.

**Interessi e cambio** `[DA DOCUMENTAZIONE]` — calcolo automatico degli interessi futuri sui finanziamenti; conversione con tassi di cambio aggiornati quotidianamente o tassi personalizzati. `[FUORI SCALA]`

---

## 6. Lessico italiano di dominio

Termini presi dalle pagine italiane di Agicap. Dove il testo era riportato fra virgolette dalla mia estrazione, è marcato con l'asterisco: gli altri potrebbero avere una resa leggermente diversa in pagina e vanno riconfermati se li usiamo come etichette.

| Termine Agicap | Dove | Come lo chiamiamo noi / nota |
|---|---|---|
| «Monitora il cash flow in tempo reale»* | funzionalità consuntivo | il nostro consuntivo di tesoreria |
| Sincronizzazione bancaria | consuntivo | — |
| **Classificazione automatica dei flussi** | consuntivo | altrove usano «categorizzazione»: convivono le due parole |
| Categorie di entrate e uscite; **regole avanzate** | consuntivo | le nostre regole di categorizzazione |
| Riconciliazione bancaria automatica | consuntivo | — |
| Operazioni **pagate** e **impegnate** | consuntivo | distinzione fra movimento bancario e impegno previsto |
| **Castelletto** utilizzato e disponibile | consuntivo | linee di credito autoliquidanti |
| Posizione di cassa | prodotto tesoreria | — |
| **Previsioni di cassa**, tesoreria previsionale | previsionale | — |
| **Previsione a 13 settimane** | previsionale | orizzonte standard del settore |
| **Analisi degli scostamenti** (reale contro previsionale) | previsionale | — |
| **Rolling forecast** | pianificazione liquidità | resta in inglese anche in italiano |
| Scenari (pessimistico, realistico, ottimistico) | previsionale | — |
| **Scadenzario** | ciclo attivo | — |
| **Crediti in sospeso**, clienti morosi | ciclo attivo | — |
| Fatture **in contestazione** | solleciti | stato che sospende i solleciti |
| **Piani di sollecito**, promemoria | solleciti | — |
| **Solleciti di pagamento**, recupero crediti | ciclo attivo | fase stragiudiziale |
| DSO (giorni incasso), DPO (giorni pagamento), **Cash Conversion Cycle** | prodotto tesoreria | — |
| **Posizione Finanziaria Netta** | prodotto tesoreria | — |
| **Impegno di spesa** | ciclo passivo | — |
| **Centro di costo**, **codice IVA** | ciclo passivo | l'OCR li assegna |
| **Soglie di importo**, **natura merceologica** | flussi approvativi | criteri di instradamento |
| **Note di credito** | ciclo passivo | — |
| **Comunicazione bancaria** | protocolli | il canale corporate |
| **Runway** | reporting | cash burn |
| **Riepilogo del lunedì mattina*** | app mobile | notifica ricorrente |
| Non tradotto: «Uncategorized» | help center EN | l'etichetta italiana non è verificabile |
| **Monitoraggio cash flow** | indice funzionalità | nome ufficiale del modulo consuntivo |
| **Tesoreria previsionale** | indice funzionalità | nome ufficiale del modulo previsionale |
| **Consolidamento delle aziende** | indice funzionalità | non «delle entità»: dicono aziende |
| **Reporting e collaborazione** | indice funzionalità | reporting e condivisione stanno insieme |
| **Payment Factory** | prodotto pagamenti | il modulo pagamenti resta in inglese |
| **Distinte di pagamento** | prodotto pagamenti | «invio di distinte massive» contro il bonifico singolo |
| **Scadenziario fornitori*** | prodotto pagamenti | **variante ortografica**: qui «scadenziario», altrove «scadenzario» |
| **Regole di firma**, firma singola o doppia | prodotto pagamenti | chi prepara la distinta e chi ha i poteri di firma |
| **Storico delle firme** | prodotto pagamenti | traccia di ogni azione su ciascun pagamento |
| **Gestione dei beneficiari** | prodotto pagamenti | anagrafica separata, con processo sicuro di modifica |
| **Gestione del PSR** | prodotto pagamenti | Payment Status Report: i livelli di conferma della banca |
| **Convalida da mobile** | prodotto pagamenti | «convalida», non «approvazione», per il passo su telefono |
| Carte **virtuali**, **fisiche**, **monouso** | carte aziendali | i tre tipi, con questi nomi |
| **Tracciabilità delle spese**; **ricevute** | carte aziendali | ricevute con validità legale |
| **Cash pool**, **conti di destinazione**, **giroconti** | cash pooling | i giroconti sono «identificati come interni» `[FUORI SCALA]` |
| **Capitale residuo**, **servizio del debito**, **debito netto** | gestione del debito | terne standard del reporting finanziario `[FUORI SCALA]` |
| **Leasing finanziari**; tasso fisso e variabile; **EURIBOR** aggiornato quotidianamente | gestione del debito | `[FUORI SCALA]` |

**Da annotare:** la stessa nozione compare come **scadenzario** (ciclo attivo, articoli) e **scadenziario** (pagina pagamenti). Se costruiamo un glossario interno conviene scegliere «scadenzario» e restare coerenti: la doppia grafia è un difetto loro, non un modello da imitare.

---

## 7. API pubblica: esiste, è documentata, ed è la fonte più concreta che ho trovato

`[OSSERVATO]` — portale sviluppatori su **`https://api.agicap.com`** (SPA, con rotte `/apis`, `/api-details/{nome-api}`, `/guides/authentication`) e **guida PDF scaricabile**: `https://api.agicap.com/treasury-bank-journal/detailed_documentation.pdf` — «API User Guide - Bank Journal», 9 pagine, letta integralmente. Testo grezzo in `assets/agicap/materiali-pubblici/help-api-bank-journal.md`.

**Credenziali** — dall'interfaccia: si accede come amministratore a
`https://app.agicap.com/{locale}/app/organization-advanced-settings/public-api/clients`, si crea una API key e si annotano **Client ID** e **Client Secret**. Sulla stessa pagina compare l'**Organization ID** in formato UUID.

**Autenticazione** — OAuth2 **client credentials**:

```
POST https://api.agicap.com/public/auth/v1/token
Content-Type: application/x-www-form-urlencoded
client_id, client_secret, grant_type=client_credentials, scope=agicap:public-api
→ access_token, expires_in   (validità dichiarata: qualche ora)
```
Il token va poi in `Authorization: Bearer {token}`.

**Entità** — `GET https://api.agicap.com/public/organizations/v1/{organizationId}/entities`, paginato con `pageNumber` (parte da 1) e `pageSize`.

**Treasury Bank Journal** — esportazione delle scritture contabili di banca:

| Metodo | Path | Note |
|---|---|---|
| GET | `/public/treasury-bank-journal/v1/entities/{entityId}/exports` | storico esportazioni: identificativi, date, numero di scritture per export, indici nell'anno, intervallo degli indici. Parametri `size` (max 100), `after`, `before` (ISO 8601), cursore in `cursor.after` |
| GET | `/public/treasury-bank-journal/v1/entities/{entityId}/exports/{exportId}` | contenuto completo di un export: metadati (entità, anno, indice) e lista dettagliata delle scritture |
| POST | `/public/treasury-bank-journal/v1/entities/{entityId}/exports/{exportId}` | crea un export: `exportId` è un **UUID generato dal chiamante**, massimo **5000 scritture per chiamata**; 204 se non c'era nulla da esportare |

**Modello di stato che se ne deduce** `[DEDOTTO ma esplicito nel PDF]`: ogni scrittura ha uno stato **«Ready to export» → «Exported»**; l'export è l'atto che fa transitare tutte le scritture pronte. Alla prima esportazione dell'anno si possono passare due contatori opzionali, `currentBankJournalsCountInYear` e `currentBankJournalEntriesCountInYear`, per **continuare la numerazione di giornali e scritture create fuori da Agicap** (esempio del PDF: se ne esistono già 5, il prossimo sarà il #6). È una risposta pulita a un problema che avremo identico noi: numerazione contabile continua quando due sistemi scrivono lo stesso registro.

---

## 8. Screenshot: cosa mostrano

`[OSSERVATO]` — l'unico screenshot che ho potuto guardare davvero sta a pagina 2 del PDF dell'API e vale più di molte pagine di marketing, perché mostra la **navigazione reale delle impostazioni** (interfaccia in francese, dati parzialmente reali):

- colonna di sinistra, **Paramètres de l'organisation**: `Entités et consolidations`, `Utilisateurs et permissions`, `Gestion des comptes bancaires`, `Paramètres avancés`, `Demandes d'accès`, `FAQ`, `Nouveautés`, `Mon compte`, `Déconnexion`;
- dentro **Paramètres avancés**, tre voci: `Categorie`, `API settings`, `Cash-Pools`;
- il pannello **API settings** mostra `ID de l'organisation` (UUID copiabile) e una tabella «Informations d'identification API» con colonne **Nom, Client Id, Client Secret (mascherato), Créé (data), Scope** e cestino per revocare; sei credenziali attive con nomi operativi («SFTP - EBICS», «SFTP test», «Test»…) e date da giugno 2024 a gennaio 2025; in alto a destra i pulsanti «Accédez au portail des développeurs» e «Générer de nouvelles informations d'identification».

Da qui si legge una cosa utile per noi: **le richieste di accesso (`Demandes d'accès`) sono una voce di primo livello del pannello organizzazione**, cioè c'è un flusso formale con cui un utente chiede l'accesso a un'entità e un amministratore lo concede — non solo una lista utenti.

Gli screenshot delle pagine prodotto non sono descrivibili con gli strumenti che ho: il fetch restituisce testo, non immagini.

---

## Cosa non sono riuscito a determinare e perché

1. **L'indice completo della knowledge base** — categorie, sottocategorie, elenco articoli. Motivo: `help.agicap.com` risponde 404/403 a qualunque client non-browser e non ho aggirato il filtro. Restano note 8 pagine su un totale ignoto (gli ID Intercom suggeriscono un ordine di grandezza di centinaia di articoli, ma è `[IPOTESI]`).
2. **Il testo integrale di qualunque articolo del centro assistenza.** Ho solo frammenti mediati dai motori di ricerca, che vanno riverificati prima di costruirci sopra qualsiasi conclusione.
3. **La grammatica delle regole di categorizzazione**: quali campi si possono confrontare, quali operatori, la precedenza fra regola manuale e IA, se la regola è per conto o globale, se è retroattiva sui movimenti già importati.
4. **L'algoritmo di riconciliazione**: nessuna soglia, finestra temporale, tolleranza di importo o punteggio di confidenza è pubblicato. So *quali campi* guarda, non *come decide*.
5. **Il metodo statistico delle previsioni**: «basate su storico e su ipotesi» è tutto ciò che dicono. Non so se ci sia stagionalità, media mobile, regressione, né come il DSO entri numericamente nella previsione degli incassi.
6. **Le formule degli scostamenti** e la definizione esatta di runway e degli altri KPI di reporting.
7. **Onboarding**: esiste una collezione «Mit Agicap anfangen» ma il percorso guidato di primo accesso non è documentato pubblicamente.
8. **Utenti e permessi**: conosco due nomi di permesso («Prepare payments», dai frammenti) e l'esistenza di `Utilisateurs et permissions` e `Demandes d'accès` dallo screenshot. Il modello dei ruoli non è documentato.
9. **Alert e notifiche**: so che esistono notifiche push «per ogni operazione importante» e il riepilogo del lunedì; non conosco le soglie configurabili, i tipi di alert, i canali.
10. **Fatturazione elettronica italiana**: nessuna traccia pubblica di integrazione diretta con SdI o del trattamento dell'XML FatturaPA. L'unico canale italiano documentato è Fatture in Cloud.
11. **Il resto della documentazione API**: il portale è una SPA e non ho potuto enumerare le altre API. So che esistono almeno due collezioni Postman pubbliche (workspace `agicap-data-int`, id `15193554` e `16057249`) e che il PDF della Bank Journal segue uno schema di URL (`/{nome-api}/detailed_documentation.pdf`) che probabilmente vale anche per le altre — non ho tentato enumerazioni a tappeto.

**L'indice dei motori di ricerca è esaurito.** Ho continuato a cercare con vocabolari diversi e in quattro lingue (italiano, inglese, francese, tedesco) e con filtro di dominio su `help.agicap.com`: tornano sempre le stesse otto pagine. Non è pigrizia della ricerca, è che di quel sito è indicizzato pochissimo — conseguenza prevedibile del blocco ai crawler. Ulteriori ricerche non produrranno altre URL: la fonte si riapre solo col browser.

**Il seguito è pianificato.** `help-center-da-leggere-con-browser.md`, in questa cartella, contiene la lista prioritizzata di ciò che va recuperato in Fase 1 con un browser reale: punti di ingresso, i pochi articoli con URL accertata, e le ricerche interne da fare tema per tema, ordinate secondo le priorità di questa analisi (prima le logiche di calcolo, poi la configurazione che rivela il modello dati, poi le connessioni bancarie).

**Nota metodologica.** Il testo delle pagine mi arriva attraverso uno strato di estrazione che riassume: le frasi fra virgolette sono riportate come citazioni da quello strato, non copiate da me dal sorgente. Prima di usare una di queste stringhe come etichetta di prodotto o come citazione in un documento esterno, va riaperta la pagina e riletta.
