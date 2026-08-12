# Backlog prioritizzato

Le **55 voci** della matrice con verdetto 🔴 (assente, da implementare — 39) o 🟠
(presente ma risolto meglio da loro — 16), ordinate per priorità.

Regola di ordinamento: **quick win in cima** (impatto ≥3 ed effort S), poi
impatto decrescente, poi effort crescente. A parità di tutto, prima ciò che
previene un numero sbagliato.

Ogni voce è implementabile senza riaprire i software concorrenti: la matrice
(`02-matrice-5vie.md`) contiene già cosa fanno loro, e i ticket in `09-issues/`
contengono i file del repo da toccare. `08-quick-wins.md` e `09-issues/` sono
allineati allo stato dell'Onda 1 (marcatori di stato in testa a ciascuna voce
chiusa o parziale).

**Escluse per costruzione**: le 17 voci ⚪, ciascuna motivata nella propria cella
di matrice, e le 10 famiglie escluse per scala in `01-tassonomia.md` §4. Non
tornano.

**Aggiornamento — Onda 1 (11-12 agosto 2026).** Quindici voci sono state
implementate e sono uscite dal backlog: l'elenco è in «Fatto nell'Onda 1» qui
sotto. Tre voci restano aperte ma con lo scopo ristretto a ciò che
effettivamente manca (`SCD-08`, `CLS-06`, `RET-07`); `SCD-02` è stata rimossa
dall'onda in corsa e riclassificata da P0 a P2 (l'effort reale è M, non S — la
sua voce spiega il perché). L'esecuzione ha anche fatto emergere sei difetti
non mappati sulla matrice, mai corretti: sono in fondo, in «Trovati durante
l'esecuzione».

---

## Riepilogo

| Priorità | Criterio | Voci | Effort complessivo indicativo |
|---|---|---|---|
| **P0** | Quick win: impatto ≥3, effort S | 7 | ~3 giornate |
| **P1** | Impatto 5 | 4 (di cui 1 già in P0) | ~1,5 settimane |
| **P2** | Impatto 4, effort M | 9 | ~3 settimane |
| **P3** | Impatto 4, effort L | 7 | ~2 mesi |
| **P4** | Impatto 3, effort M | 19 [nota 1] | ~5 settimane |
| **P5** | Impatto 3, effort L | 6 | ~1,5 mesi |
| **P6** | Impatto 2 | 6 | — |

[nota 1] Il testo introduttivo della sezione P4 dichiara «venti voci»; l'elenco
ne contiene diciannove. Inconsistenza preesistente all'Onda 1, non toccata da
questo aggiornamento — nessuna delle voci P4 fa parte delle diciotto verificate.

Il totale è volutamente più grande di ciò che si farà: serve a decidere cosa
**non** fare sapendo cosa si sta lasciando. Sono escluse le sei voci di
«Trovati durante l'esecuzione», che non hanno un ID di matrice.

---

## Fatto nell'Onda 1

Quindici voci passate a ✅ nella matrice, con l'effort indicativo che avevano in
questo backlog prima di chiudersi. Dettaglio dello stato attuale nella cella
`weiss-gestionale` di ciascuna riga in `02-matrice-5vie.md`.

| ID | Cosa | Era | Effort che aveva |
|---|---|---|---|
| `RPT-04` | Separatore decimale italiano coerente sui due export CSV | P0 | S |
| `RPT-10` | Riga dei totali nell'export dello scadenzario | P6 | S |
| `SCD-04` | Anzianità del ritardo dentro il badge di stato | P0 | S |
| `SCD-14` | Ritardo effettivo confrontato con i termini pattuiti | P0 | S |
| `PRV-01` | Le tre rotte previsionali condividono un solo motore | P2 | M |
| `PRV-03` | Nessun doppio conteggio fra fonti previsionali diverse | P1 | M |
| `PRV-04` | Gerarchia di affidabilità delle fonti, ora arbitrata davvero | P2 | M |
| `PRV-15` | Selettore di periodo per ancora + durata | P0 | S |
| `RIC-03` | Motivazioni in chiaro accanto al punteggio di match | P0 | S |
| `RIC-04` | Pesi e soglie del punteggio dichiarati all'utente | P0 | S |
| `KPI-02` | Giudizio sintetico in linguaggio naturale | P0 | S |
| `KPI-03` | Banda di rischio disegnata sul grafico | P0 | S |
| `CLS-09` | Anteprima dell'impatto prima di applicare una regola | P0 | S |
| `CLS-16` | Tasso di categorizzazione come KPI con obiettivo | P0 | S |
| `PLT-07` | Stati vuoti che insegnano invece di constatare | P0 | S |

---

## P0 · Quick win — impatto ≥3, effort S

Tredici delle sedici voci originarie sono fatte (v. «Fatto nell'Onda 1») o
riclassificate (`SCD-02`, spostata a P2). Restano quattro voci, più tre difetti
trovati durante l'esecuzione che hanno la stessa taglia impatto/effort (v.
«Trovati durante l'esecuzione» in fondo al documento — non hanno un ID di
matrice, quindi non sono in questa tabella).

| # | ID | Cosa | V | Imp |
|---|---|---|---|---|
| 1 | `SCD-08` | **Il pagamento manuale non genera movimento** — il contatore che intercetta il buco c'è già (`schedule-summary-cards.tsx`); manca ancora generare il `JournalEntry` da `POST /api/scadenzario/[id]/pagamenti`, decidendo conto e registro di destinazione | 🟠 | **5** |
| 2 | `RET-07` | **Il bonus del numero di distinta non arriva alla soglia di automatico** — 0,86 contro `AUTO_MATCH = 0.9` sullo scenario ambiguo misurato: aiuta a decidere, non decide da solo. Da rivedere come taratura del punteggio (peso del bonus o soglia), non come funzionalità mancante | 🟠 | 3 |
| 3 | `DOC-11` | **Controllo di plausibilità** sul documento in ingresso | 🔴 | 3 |
| 4 | `CLS-06` | **Il suggeritore raggruppa su un campo diverso da quello su cui il motore aggancia** — `proposals/route.ts:35` raggruppa per `counterpartName`, `recategorize/route.ts:82` aggancia solo su `description`: le regole nate da una proposta spesso funzionano una volta sola e poi non intercettano più nulla. L'anteprima delle righe colpite (impatto 3, la lacuna originaria) è già stata fatta | 🟠 | 3 |

---

## P1 · Impatto 5 — le cose che cambiano un numero

Sono le voci in cui l'assenza produce un **numero sbagliato** o una **decisione
mancata**, non un'inconvenienza.

### `SCD-08` · Il pagamento manuale non genera movimento · effort **M** → già in P0

Non più un quick win: il contatore (il pezzo economico) è fatto, resta la
generazione del `JournalEntry`, che è una decisione di prodotto su conto e
registro, non una scrittura da mezza giornata. Vedi la voce in P0 sopra.

### `PRV-03` + `PRV-01` + `PRV-04` · Una sola fonte per la previsione di cassa · effort M → **fatto**

Le tre rotte previsionali proiettano ora dalla stessa funzione pura
(`src/lib/previsionale/proietta.ts`), con la gerarchia `movimento registrato >
scadenza aperta > ricorrente non scadenzata > stima`. Verificato numericamente:
`/cash-flow` e `/scadenzario` mostrano lo stesso saldo finale sulla stessa
finestra. `RecurringExpense` e `Recurrence` restano due modelli disgiunti — la
sovrapposizione è arbitrata alla lettura, non eliminata alla scrittura —
un'unificazione resta una decisione di prodotto aperta, da prendere prima
dell'Onda 5 (snapshot delle previsioni), non un rischio di doppio conteggio
oggi. Dettaglio in `02-matrice-5vie.md` (righe `PRV-01`, `PRV-03`, `PRV-04`).

### `ALR-03` · Avviso su scadenza in avvicinamento · effort M

**Il problema.** `ScheduleReminder` è **schema morto**: il modello esiste con
`giorniPrima`, `tipo` e `inviato`, e non ha alcun consumer runtime — l'unico
riferimento in tutto `src/` è il tipo TypeScript. Nessun `NotificationType`
copre le scadenze. L'unico segnale è il badge rosso sulla voce di menu, che si
vede solo se si è già dentro l'applicazione.

Abbiamo push VAPID funzionanti, un `NotificationLog`, preferenze per utente e
due cron già configurati su Railway: **l'infrastruttura c'è tutta e non è
collegata al modulo che ne ha più bisogno**.

**Cosa fanno loro.** Nessuno dei tre lo ha mostrato: Cash King lo vende come
addon a 2,99 €/mese (quindi ritiene che il mercato lo paghi), Agicap non è
osservabile senza scrivere in produzione, Trezy ha solo la soglia di saldo. La
convergenza è `0/3` — ma il valore per WEISS non dipende da loro.

**Cosa facciamo.** Cron giornaliero che legge `ScheduleReminder`, invia push ed
email, marca `inviato`. Più `NotificationType.SCADENZA_IN_AVVICINAMENTO` e
`SCADENZA_SCADUTA`.

### `RET-04` · Anagrafica degli acquirer POS · effort M

**Il problema.** `CashStation.posAmount` registra quanto è stato incassato con
carta, e **da lì non succede nulla**: non nasce alcun credito verso l'acquirer,
nessuno sa quando quel denaro arriverà in banca né al netto di quali commissioni.

**Cosa fa Cash King** (dalla guida in-app, `[NA]` per addon): `settlementPolicy`
(giornaliero / settimanale / mensile), `feePercentBps`, `feeFixedCents`,
`feeMonthly`, conto di accredito, flag `active` per non rompere lo storico
quando si cambia acquirer. Percentuale in **punti base** e quota fissa in
**centesimi**, interi, per evitare gli errori di arrotondamento su migliaia di
micro-transazioni.

**Cosa facciamo.** Stesso modello, come prerequisito di `RET-05`. È un modello,
non un'integrazione: i dati si prendono dal contratto dell'acquirer.

### `RET-05` · Accredito POS atteso calcolato · effort L

**Il problema che risolve**, con le parole dell'analisi: *«l'acquirer accredita
in ritardo, o al netto di commissioni diverse da quelle pattuite, o accorpa più
giornate. Senza un atteso calcolato non te ne accorgi. Con un atteso calcolato,
la differenza salta fuori da sola.»*

Per un bar che incassa la maggior parte del fatturato con carta, è la voce di
cassa più grande e oggi è completamente cieca fra l'incasso e l'estratto conto.

**Cosa facciamo.** Job che genera gli attesi da `CashStation.posAmount` +
`PosOperator`, con lordo, commissioni stimate, netto atteso e periodo coperto.
Poi `RET-06` (sei motivi di eccezione) e `RET-08` (riconciliazione).

⚠️ **Lacuna nota**: il modulo Cash King non è stato eseguito, quindi non sappiamo
come si comporta sull'accorpamento di più giornate — che è il caso più frequente.
Vedi `06-lacune-di-conoscenza.md` §3.1: l'alternativa più economica è leggere il
contratto dell'acquirer di WEISS.

---

## P2 · Impatto 4, effort M

| ID | Cosa | V | Nota di implementazione |
|---|---|---|---|
| `MOV-06` | **Raggruppamento dei movimenti simili** con contatore sulla riga | 🔴 | Hash della descrizione normalizzata (cifre rimosse), come Trezy. Categorizzare una riga con badge 173 dichiara la categoria di 173 movimenti — **e la riga deve dirlo**, che è il difetto di Trezy da non copiare |
| `CLS-12` | **Dizionario di sinonimi delle controparti** | 🔴 | Tabella `CounterpartySynonym` con testo normalizzato e **origine**; il dizionario si accumula come effetto collaterale dell'approvazione di un abbinamento, non compilandolo. Cancellazione morbida con ripristino: un sinonimo sbagliato attribuisce movimenti alla controparte sbagliata in silenzio |
| `RIC-14` | **Segnalare la corrispondenza in attesa** sulla riga scaduta | 🔴 | Trezy ha 6.431 € di scaduto apparente per non averlo fatto. Badge sulla scadenza quando esiste un candidato sopra `SUGGESTED` |
| `SCD-02` | **Mese corrente spezzato** in «scaduto» e «da saldare» | 🔴 | Riclassificata da P0: non è un raggruppamento da sostituire, la lista è una tabella piatta con ordinamento per colonna, e i due si contendono lo stesso spazio — va decisa come funzionalità, non improvvisata dentro un quick win. Il Task 8 dell'Onda 1 (`SCD-04`, anzianità nel badge) copre buona parte del bisogno nel frattempo |
| `PRV-08` | **Ricorrenza sul calendario lavorativo** | 🔴 | «ultimo giorno lavorativo del mese» + spostamento su giorno non lavorativo (precedente / successivo / non modificare). È il caso di stipendi e F24, che oggi cadono di sabato nel previsionale |
| `SCS-01` | **Snapshot storico delle previsioni** | 🔴 | Congelamento settimanale come Agicap. Senza, `SCS-02` non ha un termine di paragone |
| `RET-06` | **Sei motivi di eccezione** sull'accredito POS | 🔴 | Enum Prisma; dipende da `RET-05` |
| `RET-09` | **Aggiustamento per evento** nella previsione di vendita | 🟠 | `DailyClosure.isEvent` e `eventName` **esistono già** e non entrano nella previsione: la media per giorno della settimana include le sagre |
| `BNK-05` | **Fido di cassa e saldo disponibile** | 🔴 | Campi su `BankAccount`; dipende da `BNK-03` per avere senso per conto |

---

## P3 · Impatto 4, effort L

| ID | Cosa | V | Perché è L, e cosa sblocca |
|---|---|---|---|
| `BNK-03` | **Saldo per singolo conto corrente** | 🔴 | Richiede `bankAccountId` su `JournalEntry` e una migrazione dei dati storici. **È l'unica convergenza 4/4 in cui siamo fuori** e sblocca `BNK-02`, `BNK-05` e le curve per conto |
| `BNK-06` | **Connessione bancaria PSD2** | 🔴 | Il design c'è già (`docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md`). Impatto 5 sul tempo risparmiato, effort L sull'integrazione e sulla riautenticazione a 90 giorni |
| `SCS-02` | **Analisi degli scostamenti** previsto/consuntivo | 🔴 | Dipende da `SCS-01`. Cash King lo fa **solo nel Retail** («varianza previsione»: verde ≤5%, giallo ≤15%, rosso >15% = modello da rivedere) e non in tesoreria, che è la promessa principale del prodotto |
| `KPI-08` | **Rendiconto finanziario per famiglie di cassa** | 🔴 | Il piano è già scritto (`docs/superpowers/plans/2026-08-11-riclassificazione-cash-flow.md`): 9 famiglie, 39 sottogruppi. Da Agicap si prende la convenzione tipografica `+ − =` e l'idea che **le aree del piano siano gli operandi delle formule** |
| `RET-08` | **Riconciliazione retail** banca ↔ incassi e versamenti | 🔴 | Dipende da `RET-05` e `RET-07` |
| `DOC-15` | **Food cost, ricette, inventario** | 🔴 | Trezy le ha in beta e **non può farle funzionare** perché non estrae le righe. Noi le righe le abbiamo (`InvoiceLineAccount`) e la memoria per prodotto (`SupplierProductAccount`): il presupposto tecnico c'è già tutto |
| `FIS-05` | **Ricezione fatture dal canale SDI** | 🔴 | Codice Destinatario e intermediario accreditato. Nessuno dei quattro lo fa davvero: Agicap lo dichiara e l'API non ne ha traccia, Trezy ha il connettore Invopop nel bundle e non renderizzato |
| `RET-11` | **Integrazione registratore di cassa** | 🔴 | Cash King la annuncia e non la consegna. Da valutare insieme a `FIS-06` (corrispettivi telematici): sono lo stesso provider fiscale |

---

## P4 · Impatto 3, effort M

Venti voci [nota 1]. Raggruppate per tema, perché conviene farle a lotti.

**Riconciliazione** — `RIC-02` (punteggio a più fattori: aggiungere controparte,
segno e unicità ai tre attuali) · `RIC-06` (approvazione in blocco dei match
sopra soglia) · `RIC-08` (rilevamento dei conflitti fra proposte che si
contendono lo stesso movimento).

**Regole e classificazione** — `CLS-05` (grammatica: operatori su importo e data,
non solo `contiene` su keyword) · `CLS-10` (statistiche di esecuzione per regola:
ultima esecuzione, conteggi — è ciò che rende manutenibile un insieme che cresce).

**Movimenti** — `MOV-02` (distinguere «registrato» da «atteso» quando un
movimento nasce da una regola con data futura) · `MOV-04` (cestino visibile con
conteggio: il soft delete c'è ma è irrecuperabile dall'interfaccia) · `MOV-11`
(selezione multipla e azioni di massa — il motore `recategorize` esiste già).

**Previsionale** — `PRV-18` (coda di lavoro sulla manutenzione, senza il difetto
di Trezy che blocca la pagina) · `SCS-03` (confine consuntivo/previsione
governabile: il mese in corso è incompleto per definizione).

**Anagrafiche e documenti** — `DOC-12` (deduplica per partita IVA con merge
assistito).

**Conti** — `BNK-02` (saldo iniziale per conto con data, dipende da `BNK-03`).

**Indicatori e report** — `KPI-04` (DPO, non DSO) · `RPT-07` (digest periodico
via email: l'infrastruttura di notifica c'è).

**Alert** — `ALR-01` (soglia per conto invece che per sede; le prime due di
Agicap, non la terza) · `ALR-05` (centro notifiche in-app che includa gli eventi
di tesoreria, non solo il personale).

**Piattaforma** — `PLT-02` (ruolo di sola lettura per il commercialista) ·
`PLT-05` (ricerca globale: `cmdk` è già una dipendenza, usata solo nelle
combobox) · `PLT-06` (filtri nell'URL: oggi 3 pagine su 71, e una vista filtrata
non si condivide né sopravvive a un refresh).

---

## P5 · Impatto 3, effort L

| ID | Cosa | Nota |
|---|---|---|
| `DOC-04` | Canale email dedicato per l'acquisizione | Da Trezy, ma **per XML e P7M inoltrati**, non come OCR. Attenzione al difetto loro: l'indirizzo è derivato dall'id account, quindi indovinabile |
| `PRV-09` | Rilevamento automatico delle ricorrenze dai movimenti | Dipende da `MOV-06` (raggruppamento dei simili), che ne è il presupposto tecnico |
| `KPI-06` | Indicatori personalizzabili con formula | Da fare **dopo** `KPI-08`: le famiglie di cassa sono gli operandi |
| `FIS-02` | IVA per competenza vs per cassa | Trezy dichiara che il proprio saldo IVA «non è un importo da portare in F24»; se lo facciamo, deve esserlo |
| `FIS-03` | Liquidazione IVA e deleghe F24 | — |
| `FIS-06` | Corrispettivi telematici | Oggi è una pagina segnaposto onesta. Dipende dal provider fiscale, come `RET-11` |

---

## P6 · Impatto 2

`DOC-13` (lordo e imponibile sulla stessa riga di lista, S) · `RPT-08` (report di
posizione aperta stampabile, S) · `FIS-04` (scheda dedicata per CBILL/pagoPA, S) ·
`BNK-08` (modelli di importazione riutilizzabili, M) · `SCD-13` (import di
scadenzario misto, M) · `PRV-07` (costruttore di ricorrenze in linguaggio
naturale, M).

`RPT-10` (riga dei totali nell'export) è fatta nell'Onda 1 — v. sopra.

Le prime tre sono effort S e possono essere accodate a un'onda di quick win
se avanza tempo.

---

## Sequenza consigliata

Non è un piano, è un ordine di dipendenze: chi esegue decide quanto ne fa.

**Onda 1 — eseguita l'11-12 agosto 2026, ampliata rispetto al piano.** Invece di
fermarsi alle quattro voci sui numeri sbagliati, ha coperto in un'unica
esecuzione anche il resto dei quick win originariamente previsto per «Onda 2»:
quindici voci chiuse (v. «Fatto nell'Onda 1»), più `SCD-08` nella sola parte di
rilevamento. Restata fuori `SCD-02` (rimossa in corsa e riclassificata a P2 —
non era un quick win) e `DOC-11` (mai stata nel perimetro dell'esecuzione).
Dettaglio task per task: `.superpowers/sdd/2026-08-11-analisi-competitiva-onda-1/progress.md`.

**Residuo dell'Onda 1 — da chiudere prima della prossima onda** (~3-5 giornate)
`SCD-08` (generare il movimento) · `CLS-06` (allineare la chiave del
suggeritore al motore) · `RET-07` (taratura del bonus) · `DOC-11` · i sei
difetti in «Trovati durante l'esecuzione» più sotto.
> Nessuna di queste è più un quick win puro nel senso originario: `SCD-08` e
> `RET-07` richiedono una decisione di prodotto (dove scrivere il movimento; se
> alzare il bonus o abbassare la soglia di automatico), `CLS-06` un cambio nel
> motore delle regole condiviso con altre funzioni. `DOC-11` resta un vero
> quick win, semplicemente non fatto.

**Onda 3 — «il ciclo POS»** (~3 settimane)
`RET-04` → `RET-05` → `RET-06` → `RET-07`
> È la sequenza che chiude il buco più grande del nostro caso d'uso: oggi fra
> l'incasso con carta e l'accredito in banca non c'è niente.

**Onda 4 — «avvisare prima»** (~1 settimana)
`ALR-03` · `ALR-01` · `RPT-07`
> L'infrastruttura di notifica esiste già ed è collegata solo al personale.

**Onda 5 — «il conto bancario diventa un oggetto vero»** (~3 settimane)
`BNK-03` → `BNK-02` → `BNK-05`
> Migrazione dei dati storici inclusa. È il prerequisito di qualunque cosa
> multi-conto, PSD2 compresa.

**Onda 6 — «lo scostamento»** (~3 settimane)
`SCS-01` → `SCS-02` → `SCS-03`
> Serve a rispondere alla domanda che oggi nessuno può porre: la previsione di
> un mese fa era giusta?

**Poi, in ordine di appetito**: `KPI-08` (riclassificazione, il piano è già
scritto) · `BNK-06` (PSD2, il design è già scritto) · `DOC-15` (food cost, il
presupposto tecnico c'è già) · P4.

---

## Trovati durante l'esecuzione dell'Onda 1 — non ancora corretti

Non hanno un ID di matrice: sono difetti di coerenza interna scoperti
verificando i brief dei task o nella revisione finale, non lacune rispetto ai
concorrenti. Priorità assegnata con lo stesso criterio impatto/effort delle
voci sopra. Dettaglio completo in
`.superpowers/sdd/2026-08-11-analisi-competitiva-onda-1/progress.md`.

**Equivalenti P0 — impatto ≥3, effort S**

- **La soglia di liquidità bassa esiste in due versioni.**
  `src/app/(dashboard)/cash-flow/page.tsx:131` passa `sogliaMinima={5000}`
  cablata nel codice; il cruscotto (`CashFlowForecast.tsx`) legge invece
  `settings.lowBalanceThreshold`. Chi configura una soglia diversa da 5.000 €
  ottiene due schermate che dissentono — inclusa la banda ambra che `KPI-03`
  (appena chiusa) disegna ora sul grafico: il disegno è corretto, il valore può
  non esserlo. Impatto 4, effort S: far leggere la pagina dallo stesso
  `CashFlowSetting`.
- **«Non categorizzato» significa due cose diverse in due posti.** Il filtro
  della lista movimenti (`src/app/api/prima-nota/route.ts:215`) seleziona
  `budgetCategoryId = null`, colonna marcata `@deprecated` nello schema; il KPI
  di `CLS-16` (appena chiuso) misura `accountId`, l'asse vivo via
  `AccountBudgetMapping`. Barra e filtro possono dare numeri diversi sugli
  stessi movimenti. Impatto 4, effort S: allineare il filtro all'asse
  `accountId`, o togliere `budgetCategoryId` dal filtro esplicitamente.
- **Il pannello «Come nasce la previsione» può elencare una voce che il totale
  non ha contata.** I numeri sono giusti: `forecast/route.ts` calcola
  `totalExpectedExpenses` da `punto.uscite`, cioè dalla serie già deduplicata
  da `proietta()`. Ma l'elenco «Spese ricorrenti nel periodo»
  (`speseRicorrentiPerGiorno`, riga 158) si costruisce ciclando su
  `flussiBase` — l'uscita grezza di `leggiFlussi`, **prima** che `proietta()`
  risolva le sovrapposizioni. Un flusso di fonte `ricorrente` scartato perché
  una `scadenza` con la stessa chiave lo copre sparisce dal totale ma resta
  nell'elenco: la spiegazione non torna col numero che dovrebbe spiegare,
  anche se il numero stesso è corretto. **Esposizione stretta**:
  `generaFlussiRicorrenze` parte da `prossimaGenerazione`, quindi una
  ricorrenza già scadenzata normalmente non riemette un flusso, e
  `generaFlussiSpeseRicorrenti` sopprime già le spese agganciate per
  euristica a monte. Il caso residuo è quando `prossimaGenerazione` è rimasta
  indietro — un caso di confine, non un difetto sistematico: chi lo riproduce
  deve cercare proprio quello, non una ricorrenza qualsiasi. Impatto 3, effort
  S (filtrare l'elenco sugli stessi superstiti che `proietta()` tiene, non sui
  flussi grezzi).

**Equivalenti P6 — impatto 2**

- **Il tasso di categorizzazione (`CLS-16`) può uscire dal range o sparire in
  silenzio.** I due `count` di `GET /api/prima-nota/categorizzazione` non
  stanno in una `$transaction`: se fra le due query entra un movimento senza
  conto, `senzaConto` può superare `totale` e la percentuale uscire dal range.
  La query non gestisce l'errore come fa quella dei movimenti nello stesso
  file (`toast.error` su `isError`): se la rotta fallisce, la barra sparisce
  senza segnale. Effort S: clamp o query raggruppata unica, più un `toast` di
  errore coerente col resto del file.
- **Il banner di giudizio (`KPI-02`) sparisce in silenzio se
  `/api/scadenzario/summary` fallisce in modo permanente.** Nessun log, nessun
  fallback — compromesso accettabile (meglio muto che bugiardo) ma resta un
  fallimento silenzioso. Effort S: un log lato client.
- **Debito minore del refactor previsionale (Task 4), non regressivo.**
  `perFonte.ricorrente` è una somma con segno che annulla incasso e uscita
  ricorrenti dello stesso giorno nel tooltip; la quota da `schedulesInRange`
  ignora la deduplica; `giorniDellaFinestra` esiste in due copie; «oggi» si
  calcola in due modi diversi fra le rotte previsionali (`startOfDay` locale
  contro `giornoCorrente()` su Roma) — la stessa classe di bug di fuso che
  l'onda ha dovuto correggere altrove (`SCD-04`), ora più rilevante perché le
  tre rotte condividono la stessa proiezione. Effort complessivo S/M.

---

## Le tre voci che vale la pena **non** fare, pur essendo nel backlog

Le segnalo perché il backlog da solo non lo dice, e perché una lista lunga
invita a eseguirla tutta.

1. **`PLT-05` ricerca globale.** Cash King ce l'ha marcata come mancanza grave
   perché ha **93 rotte**. Noi ne abbiamo 71, gli utenti sono tre e usano quattro
   pagine. Il costo è M, il beneficio reale è vicino a zero finché non cresce il
   numero di persone.
2. **`RIC-06` approvazione in blocco.** Sul dataset di Cash King il pulsante
   «Approva Tutte le Sicure» **non ha nulla da approvare**, perché la taratura
   conservativa lascia vuota la fascia alta. Prima di costruire l'azione in
   blocco va validata la soglia `SUGGESTED = 0.75` sui nostri dati: se anche da
   noi la fascia alta è vuota, l'azione è inutile.
3. **`CLS-05` grammatica delle regole più ricca.** È il punto in cui Agicap
   dissente da Cash King e ha ragione: la potenza sta nel suggeritore, non nel
   costruttore. `CLS-06` e `CLS-09` (conteggio e anteprima) sono state fatte
   nell'Onda 1; resta aperto in `CLS-06` un difetto di aggancio fra
   suggeritore e motore (v. P0), non la ricchezza della grammatica. Prima di
   investire in espressioni regolari, chiudere quel difetto e guardare se
   qualcuno ne sente ancora il bisogno.
