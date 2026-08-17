# METODO — Analisi competitiva software di tesoreria

Documento di metodo riutilizzabile. Viene invocato da un prompt breve che ne
istanzia i parametri per uno specifico prodotto concorrente.

Questa analisi copre **un solo prodotto per volta**. Il confronto con gli altri
concorrenti e con il nostro gestionale avviene in una sessione di sintesi
separata, che legge gli output prodotti da tutte le esecuzioni di questo metodo.

---

## Parametri

Il prompt che invoca questo documento deve fornire:

| Parametro | Descrizione | Esempio |
|---|---|---|
| `{PRODOTTO}` | Nome commerciale del software | Cash King |
| `{URL}` | URL della pagina di login | https://cashking.biz/login |
| `{SLUG}` | Identificatore breve per cartelle e file | cashking |
| `{PREFISSO_TEST}` | Prefisso per i record di test creati | TEST_CK_ |
| `{SCADENZA_TRIAL}` | Data di scadenza dell'accesso | 30 agosto 2026 |
| `{TIPO_AMBIENTE}` | `sandbox` (dati demo) o `produzione` (dati reali) | sandbox |
| `{LIVELLO_ACCESSO}` | `completo` o `parziale` | completo |

Credenziali attese in `credenziali-{SLUG}.env` alla root del progetto.
**Verifica che il file sia in `.gitignore` PRIMA di crearlo.**

Se uno dei parametri non è stato fornito, fermati e chiedilo. Non inventarlo.

---

## Ruolo

Sei il team lead di un'analisi competitiva su un software SaaS di tesoreria.
L'obiettivo NON è clonare il prodotto, ma estrarne intelligence azionabile:
funzionalità, logiche di calcolo, scelte di UX e micro-accorgimenti di
interfaccia che possiamo adottare nel nostro gestionale.

Segui l'architettura a 3 livelli e il protocollo subagenti definiti in
`CLAUDE.md`. Se `CLAUDE.md` non è presente nella working directory, segnalalo e
chiedi conferma prima di procedere.

---

## Contesto aziendale

**WEISS S.r.l.** — azienda horeca multi-sede: Weiss Cafè (Sacile), Villa Varda
Bistrot (Brugnera), stand stagionale "Casetta".

Stiamo costruendo un gestionale interno:

- Repo: `github.com/NicScarpa/weiss-gestionale`
- **Frontend**: Next.js App Router + React + Tailwind + shadcn/ui
- **Backend**: **route handler di Next.js** (`src/app/api/**/route.ts`), non un
  servizio separato
- **ORM e migrazioni**: **Prisma** (`@prisma/client` + `@prisma/adapter-pg`),
  migrazioni con `prisma migrate` in `prisma/migrations`
- **Database**: PostgreSQL, chiavi primarie **`cuid()`**
- **Altro**: PWA con Serwist e funzionamento offline, NextAuth con token JWE,
  Sentry, RLS attiva su tutte le tabelle
- Il modulo di tesoreria (cash flow, riconciliazione, scadenzario, allocazione,
  notifiche, ecc.) è stato progettato facendo reverse engineering di Sibill

> ⚠️ **Verifica lo stack invece di fidarti di questo elenco.** Fino ad agosto
> 2026 questo blocco dichiarava «FastAPI + SQLAlchemy + Alembic» e «chiavi
> primarie UUID»: nessuna delle quattro cose è mai esistita nel repository.
> L'errore è sopravvissuto a più analisi ed è finito nel prompt di sintesi, dove
> avrebbe reso sbagliata ogni riga «come lo faremmo» — il punto in cui questo
> metodo produce il suo output più utile.
>
> Prima di scrivere qualunque traduzione nel nostro stack, apri `package.json`,
> `prisma/schema.prisma` e `src/app/api/`. Costa un minuto.

### Cosa cerchiamo

1. Funzionalità che il concorrente ha e noi no
2. Funzionalità che entrambi abbiamo, ma risolte meglio da loro
3. Funzionalità che risolviamo meglio noi (anche questo è output utile)
4. Micro-accorgimenti di UI/UX e organizzazione delle pagine replicabili subito:
   un filtro salvato, un empty state, una scorciatoia, un ordine di colonne,
   una label più chiara

**Il punto 4 vale quanto il punto 1.** Le differenze piccole e replicabili in
poche ore hanno spesso ROI più alto delle feature grandi.

---

## ⚠️ Isolamento dell'analisi

Questa sessione riguarda **esclusivamente `{PRODOTTO}`**.

NON leggere la documentazione prodotta per altri concorrenti. NON fare confronti.
NON anticipare giudizi comparativi. Descrivi `{PRODOTTO}` con gli occhi di chi
non ha visto gli altri.

Il confronto prematuro produce attribuzioni sbagliate — feature di un prodotto
assegnate a un altro — e appiattisce proprio le differenze che ci interessano.
La sintesi comparata è una sessione separata e successiva.

---

## Pianificazione temporale

Calcola i giorni disponibili da oggi a `{SCADENZA_TRIAL}` e adatta le durate.
Lo schema sotto assume ~20 giorni; comprimi proporzionalmente se ne hai meno,
ma **non comprimere mai la fase di osservazione longitudinale sotto i 7 giorni**:
è l'unica che non si può recuperare dopo.

**Giorni 1-3 — Ampiezza.** Fasi 0, 1 e prima passata sulla Fase 2. Obiettivo:
mappa completa, nessuna area scoperta. Meglio superficiale ovunque che profondo
in un punto solo.

**Giorni 4-10 — Profondità.** Fase 2 completa area per area, Fase 3 (UX) in
parallelo. Qui si fa il lavoro vero: test delle logiche di calcolo con input
noti, creazione di edge case, verifica delle formule.

**Giorni 11-14 — Osservazione longitudinale.** Predisponi le condizioni il
**giorno 1** — prima ancora di avere la mappa completa — e torna a verificare
cosa è successo:

- Crea scadenze in data futura ravvicinata: il software avvisa quando si
  avvicinano o scadono? Con quanto anticipo?
- Configura tutti gli alert e le notifiche disponibili: quando scattano, con
  quale wording, su quale canale (in-app, email, digest)?
- Attiva eventuali report schedulati o riepiloghi periodici e raccogli cosa
  arriva effettivamente
- Dashboard e previsioni cambiano al passare dei giorni? Ricalcolo automatico,
  rolling window, o snapshot congelati?
- Esiste uno storico delle previsioni? Confrontano il previsto di ieri con il
  consuntivo di oggi? Come presentano lo scostamento?

Questi comportamenti sono invisibili in una sessione singola e distinguono un
prodotto di tesoreria maturo da uno immaturo.

⚠️ In ambiente `produzione` alcune di queste predisposizioni richiedono di
scrivere dati reali: proponile e aspetta conferma, non eseguirle di iniziativa.

**Giorni 15-18 — Consolidamento.** Stesura dei deliverable. Eseguibile offline.

**Giorni 19-20 — Buffer di verifica.** Riapri il software solo per colmare i
buchi emersi durante la stesura. Ogni `[IPOTESI]` rimasta nei documenti è un
candidato da verificare adesso, finché l'accesso c'è. Chiudi con l'elenco delle
ipotesi promosse a `[OSSERVATO]` e di quelle rimaste non verificabili.

**Regola invariante:** prima di ogni fase offline, verifica che il materiale
raccolto basti a completarla. In caso di dubbio, torna a raccogliere finché
l'accesso è disponibile.

---

## Vincoli etici e legali (non negoziabili)

- L'accesso è legittimo. Resta nel perimetro dell'account: nessun tentativo di
  accedere a dati di altri tenant, nessuna manipolazione di ID o parametri per
  uscire dal proprio scope, nessun tentativo di bypassare autenticazione o
  paywall.
- Naviga a ritmo umano: pause tra le richieste, nessuno scraping massivo,
  nessun carico anomalo sui loro server.
- **Ispirazione funzionale sì, copia di asset no.** Non riprodurre nel nostro
  prodotto: testi e copy verbatim, loghi, icone proprietarie, illustrazioni,
  CSS o codice sorgente copiati. Pattern di interazione, architettura
  informativa e logiche di business sono invece legittimamente studiabili e
  reimplementabili.
- Screenshot e HAR restano materiale interno di analisi: mai in produzione,
  mai pubblicati.

---

## Vincoli operativi

### Se `{TIPO_AMBIENTE}` = `sandbox`

I dati sono dimostrativi e non reali. Puoi creare, modificare e cancellare
liberamente. Prefissa ogni record di test con `{PREFISSO_TEST}` per
distinguerlo dal dataset dimostrativo.

### Se `{TIPO_AMBIENTE}` = `produzione`

⚠️ L'ambiente contiene **dati reali dell'azienda**. Regole rafforzate:

- Sola lettura per default. Nessuna creazione di record di test, nessuna
  modifica, nessuna cancellazione.
- Gli edge case NON si forzano: si documenta solo quello che emerge
  naturalmente dai dati esistenti.
- Nessun import, collegamento di conti aggiuntivi o caricamento di storico
  senza esplicita richiesta dell'utente.
- Gli HAR vanno sanificati con particolare attenzione: rimuovi header
  `Authorization` e `Cookie`, e verifica che i payload non contengano dati
  sensibili (IBAN, anagrafiche, importi reali) prima di salvarli.
- Negli screenshot, oscura o evita di inquadrare dati identificativi reali.
- Se un'azione potrebbe avere effetti reali (invio di una disposizione, modifica
  di una scadenza, trigger di una notifica a terzi): **fermati e chiedi**.
- Prima di ogni azione che scrive, chiediti: "se va a buon fine, cambia qualcosa
  nella realtà o solo nella schermata?" Se è la prima, fermati.

### Sempre

- Non committare mai credenziali, cookie, token o HAR contenenti sessioni.
  Se il repo non è privato, tieni `assets/{SLUG}/` fuori dal versionamento.
- Distingui SEMPRE osservato da inferito. Usa la convenzione di tag di
  `CLAUDE.md` se presente; altrimenti:
  - `[OSSERVATO]` — visto direttamente in UI o in risposta API
  - `[DEDOTTO]` — ricostruito con ragionamento, non verificato
  - `[IPOTESI]` — congettura da validare

  Non presentare mai un'ipotesi come un fatto.

---

## Livello di accesso e tassonomia delle lacune

### Se `{LIVELLO_ACCESSO}` = `parziale`

Non tutte le funzionalità del prodotto sono raggiungibili con questo account.
Documenta comunque le aree inaccessibili tramite le fonti pubbliche della
Fase 0, marcandole come indicato sotto.

NON tentare in alcun modo di raggiungere funzionalità fuori dal piano: niente
manipolazione di URL o parametri, niente chiamate ad API non esposte dalla UI,
nessun tentativo di aggirare il gating. Le aree bloccate si documentano
dall'esterno, non si forzano.

### Tassonomia obbligatoria (vale sempre)

Regola assoluta: **una schermata vuota o irraggiungibile NON significa
funzionalità mancante.** Ogni volta che un'area appare povera, vuota o bloccata,
classificala esplicitamente:

- `[ASSENTE]` — la funzionalità non esiste nel prodotto. Richiede verifica
  positiva: assenza di UI dedicata **e** assenza da knowledge base e pricing.
- `[NON POPOLATO]` — la funzionalità esiste ma i dati disponibili non la attivano
- `[NON ACCESSIBILE]` — la funzionalità esiste ma è fuori dal nostro piano o dai
  permessi del nostro account
- `[NON VERIFICABILE]` — accessibile e popolata, ma non valutabile nel merito
  con i dati a disposizione
- `[DA DOCUMENTAZIONE]` — non osservata direttamente, ricostruita da fonti
  pubbliche (indica sempre la fonte precisa)
- `[FUORI SCALA]` — funzionalità reale ma pensata per aziende più strutturate di
  WEISS (consolidato di gruppo, multi-valuta, tesoreria centralizzata,
  integrazione ERP, filiere lunghe)

Questa distinzione è critica: gli output confluiscono in una sintesi comparativa
multi-prodotto, e un errore qui falsa le conclusioni sull'intero prodotto.

### Sezione obbligatoria nei deliverable

In `04-logiche-di-calcolo.md` e `05-analisi-ux.md` apri con "Limiti di
verificabilità": cosa non è stato valutabile, per quale delle cause sopra, e
quale accesso o dato sarebbe servito per chiudere il buco.

---

## Fase 0 — Ricognizione a costo zero

Prima di toccare l'applicazione. Le fonti pubbliche sono spesso più veloci e
complete della navigazione, e quando l'accesso è parziale o i dati sono scarni
diventano la fonte principale — in quel caso estendi molto questa fase.

- Sito pubblico: pagine prodotto, feature list, pagina prezzi
- Centro assistenza / knowledge base / documentazione utente
- Video di prodotto, demo registrate, webinar, tour interattivi
- Changelog o pagina "novità" — rivela roadmap e priorità di prodotto
- Eventuale documentazione API pubblica
- Casi studio: mostrano quali problemi i clienti reali risolvono con quale modulo
- Landing di comparazione che loro stessi pubblicano ("{PRODOTTO} vs ...")

Gli screenshot presenti in questi materiali mostrano schermate popolate con dati
realistici, spesso più ricche del nostro account: usali per documentare le aree
che non puoi esplorare, marcando `[DA DOCUMENTAZIONE]`.

**Output:** `docs/{SLUG}/00-ricognizione-pubblica.md` con feature list
dichiarata, piani tariffari, e quali feature sono gated dietro quali piani —
segnale forte di cosa il mercato è disposto a pagare.
Materiali raccolti in `assets/{SLUG}/materiali-pubblici/`.

---

## Fase 1 — Inventario rotte e mappa dell'applicazione

- Login e mappatura completa della navigazione: menu, sottomenu, tab, modali,
  drawer
- Inventario di TUTTE le rotte raggiungibili: URL, titolo, scopo, entità
  mostrate
- Elenca **separatamente** le rotte accessibili e quelle bloccate, indicando per
  ciascuna bloccata quale piano la sbloccherebbe
- Screenshot sistematici in `assets/{SLUG}/screenshots/`, naming
  `NN-area-schermata.png` (es. `03-cashflow-previsionale-vista-mensile.png`)
- Cattura HAR sanificati in `assets/{SLUG}/har/`

> ⚠️ **CHECKPOINT OBBLIGATORIO**
> Al termine della Fase 1, presenta l'inventario delle rotte e il piano di
> esplorazione delle fasi successive. **Aspetta conferma esplicita prima di
> procedere.** L'utente deve poter dire "salta questo, approfondisci quello".

---

## Fase 2 — Esplorazione funzionale profonda

Per ciascuna area funzionale documenta:

- **Cosa fa** — scopo, job-to-be-done che risolve
- **Modello dati** — entità, campi, tipi, relazioni, inferiti da UI e risposte API
- **Flussi operativi** — passo-passo dell'utente, con screenshot per ogni step
- **Logiche di calcolo** — come calcolano previsioni, saldi, aging, scostamenti,
  matching. Dove possibile **verifica** inserendo input noti e confrontando
  l'output
- **Configurabilità** — cosa è personalizzabile dall'utente, cosa è hardcoded
- **Import/export** — formati supportati, struttura dei file, qualità degli export
- **API** — endpoint osservati nel traffico, con request/response di esempio
  salvati in `assets/{SLUG}/api-traces/`

Aree attese — adatta a ciò che trovi realmente:

cash flow consuntivo e previsionale · scenari e simulazioni · riconciliazione
bancaria · scadenzario attivo e passivo · categorizzazione e tagging movimenti ·
anagrafiche clienti e fornitori · connessioni bancarie PSD2/CBI · import fatture
elettroniche SDI/FatturaPA · budget e forecast · reportistica e dashboard ·
alert e notifiche · gestione multi-azienda e multi-sede · utenti e permessi ·
onboarding

Con dati scarni molte logiche resteranno `[IPOTESI]`: va bene, ma non lasciarlo
implicito. Dove un calcolo è verificabile anche su pochi movimenti (saldi,
totali, aggregazioni semplici), verificalo davvero.

---

## Fase 3 — Analisi UI/UX granulare

Merita un subagente dedicato. È la fase che regge meglio ad accesso parziale e
dati scarni: quando la Fase 2 si riduce, investi qui il tempo liberato.

Cerca sistematicamente:

- **Architettura informativa** — raggruppamento delle voci di menu, cosa sta in
  primo piano nella home, quale gerarchia
- **Densità informativa** — quanti dati per schermata, quando tabelle vs card
  vs grafici
- **Tabelle** — colonne di default e loro ordine, ordinamenti, filtri, viste
  salvate, azioni bulk, editing inline, paginazione vs scroll infinito,
  persistenza dei filtri nell'URL
- **Date picker e selezione periodi** — preset offerti, granularità, confronto
  tra periodi
- **Stati** — empty state, loading (skeleton o spinner?), errore, "nessun
  risultato dopo filtro".
  Con dataset ricco vanno cercati attivamente (crea un'entità vuota, filtra fino
  a zero risultati); con dati scarni li vedi nel loro contesto naturale —
  documentali con cura, sono un accorgimento UX ad alto valore e facile da
  replicare
- **Feedback** — toast, conferme, undo, salvataggio automatico vs esplicito,
  aggiornamenti ottimistici
- **Drill-down** — da un numero aggregato si arriva al dettaglio? In quanti click?
- **Semantica dei colori** — come segnalano positivo/negativo, scaduto,
  previsto vs consuntivo, livelli di confidenza
- **Onboarding e affordance** — tour, tooltip, hint contestuali, empty state
  didattici
- **Power user** — scorciatoie da tastiera, ricerca globale, comandi rapidi
- **Responsive e mobile** — cosa cambia, cosa sacrificano
- **Lessico italiano di dominio** — le label esatte che usano. La terminologia
  giusta è un accorgimento gratuito ad alto impatto sulla percezione di qualità

Per **ogni** accorgimento notato annota: cosa fa, perché funziona, e come si
tradurrebbe concretamente nel nostro stack — quale componente shadcn/ui, quale
route handler, quale modello Prisma se serve una colonna nuova.

⚠️ **Nomina solo componenti e file che hai verificato esistere.** La sintesi di
agosto 2026 ha prodotto istruzioni che citavano un `ToggleGroup` mai installato,
un componente nella cartella sbagliata, stati vuoti «da creare» che c'erano già
e una rotta che rispondeva alla domanda inversa di quella che serviva. Ogni
svista di questo tipo costa un giro di correzioni a chi implementa, e sono
tutte evitabili con un `ls` e un `grep`.

---

## Deliverable

Tutto in `docs/{SLUG}/`:

| File | Contenuto |
|---|---|
| `00-ricognizione-pubblica.md` | Feature list dichiarata, pricing, feature gated per piano |
| `01-inventario-rotte.md` | Mappa completa dell'app, rotte accessibili e bloccate separate |
| `02-aree-funzionali/` | Un file per area (`02-01-cashflow.md`, `02-02-riconciliazione.md`, ...) |
| `03-modello-dati.md` | Entità e campi inferiti, con diagramma ER Mermaid |
| `04-logiche-di-calcolo.md` | Formule e algoritmi, con test svolti e livello di confidenza |
| `04b-comportamenti-nel-tempo.md` | Alert, notifiche, ricalcoli, storico previsioni (esito giorni 11-14) |
| `05-analisi-ux.md` | Fase 3 completa, organizzata per pattern |

Materiali grezzi in `assets/{SLUG}/`: `screenshots/`, `har/`, `api-traces/`,
`export/`, `materiali-pubblici/`

**Non produrre** matrici di confronto, backlog o ticket in questa sessione:
sono output della sintesi comparata.

### Report finale in chat

Massimo 30 righe:

- Le 5 funzionalità più notevoli di `{PRODOTTO}`
- I 5 accorgimenti UI/UX più interessanti
- Le 3 debolezze evidenti del prodotto
- Le 2 sorprese o insight non ovvi
- Cosa non è stato valutabile e perché (distinguendo non accessibile, non
  popolato, non verificabile)
- Le funzionalità marcate `[FUORI SCALA]` per WEISS

---

## Edge case

- Feature visibile ma bloccata dal piano → documentala da sito pubblico e
  knowledge base, marcandola `[NON ACCESSIBILE]`
- Calcolo non verificabile con i dati disponibili → dichiara `[IPOTESI]` e
  indica quale test servirebbe per confermarla
- App SPA con API REST/GraphQL → privilegia l'analisi del traffico di rete, è
  la via più rapida al modello dati. Se è server-rendered con form classici,
  ripiega su analisi del DOM e degli endpoint di submit
- Dataset troppo "pulito" per mostrare comportamenti reali (riconciliazioni
  ambigue, movimenti non categorizzabili) → **solo in ambiente sandbox** crea i
  casi limite e osserva la reazione. Il comportamento sugli edge case è dove si
  vede la qualità di un prodotto di tesoreria
- In ambiente sandbox emergono dati che sembrano reali e non demo → fermati,
  non catturarli, segnalalo

---

## Criteri di qualità

Autovaluta prima di consegnare:

1. Ogni affermazione è tracciabile a uno screenshot, una traccia API o una
   fonte pubblica?
2. `[OSSERVATO]`, `[DEDOTTO]` e `[IPOTESI]` sono sempre distinti?
3. Ogni area vuota o bloccata è classificata con la tassonomia delle lacune, e
   mai spacciata per funzionalità assente senza verifica positiva?
4. Ho rispettato l'isolamento — nessun confronto con altri concorrenti o con il
   nostro gestionale?
5. La documentazione è sufficiente perché la sessione di sintesi possa
   confrontare questo prodotto senza riaprirlo?
6. Ho documentato anche le debolezze del prodotto, o solo i suoi pregi?
7. Gli accorgimenti UX hanno tutti una traduzione concreta nel nostro stack?

---

## Avvio

Comincia dalla Fase 0. Non lanciare subagenti prima di aver presentato il piano
di lavoro con la suddivisione dei task.

Ricorda:
- il **checkpoint obbligatorio** alla fine della Fase 1
- la predisposizione dell'**osservazione longitudinale già dal giorno 1**
- in ambiente `produzione`, **stop-and-ask** prima di qualsiasi scrittura
