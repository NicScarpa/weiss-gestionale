# Convergenze — le best practice di settore e dove noi deviamo

Fase 2 del confronto. Qui stanno solo le voci in cui **tutti i prodotti in cui la
funzione è stata verificabile la risolvono allo stesso modo**. Una convergenza
totale è un'indicazione forte: se noi facciamo diversamente, la deviazione va
giustificata esplicitamente o corretta.

Il denominatore è sempre dichiarato. Dove un prodotto non è stato verificabile,
esce dal conto e il fatto è scritto nella riga: `2/2 tra i verificabili
(Agicap non accessibile)` non è `2/4`.

---

## 1. Come leggere la forza di una convergenza

Non tutte le convergenze pesano uguale, e il peso si legge su due assi.

**Il denominatore.** Una convergenza `4/4` è un fatto di settore; una `2/2` è un
indizio. In questa matrice i denominatori alti sono rari perché tre dei quattro
prodotti sono stati osservati con accesso o dati parziali: **solo due voci
raggiungono un denominatore ≥3 con noi fuori allineamento**, ed è già
un'informazione.

**La presenza di Agicap fra i convergenti.** Agicap ha l'evidenza più debole ma
il peso di prodotto maggiore: le sue scelte sono validate su una base clienti
molto più ampia. Quando concorda con gli altri, una `2/2` vale quasi quanto una
`3/3`; quando dissente, il § 4 spiega perché.

---

## 2. Le convergenze totali dove siamo fuori allineamento

Sono **quindici**. In ordine di forza della convergenza, poi di impatto.

### 2.1 — `BNK-03` Il saldo del singolo conto corrente · **4/4**

L'unica convergenza a denominatore pieno dell'intera matrice. Agicap, Trezy,
Cash King e Sibill mostrano tutti il saldo per singolo conto; Cash King arriva a
metterne due progressivi affiancati sulla stessa riga, quello del conto e quello
aziendale, «per leggere l'effetto locale e quello consolidato insieme».

**Noi no, e non è una svista di interfaccia: è il modello.** `JournalEntry` non
ha un `bankAccountId`. I saldi esistono solo per `registerType` (CASH / BANK
aggregato), e `BankAccount` è un'anagrafica che non partecipa ai conti — la sua
unica relazione verso i movimenti passa da `ScheduleRule.bankAccountId`, cioè
dalle regole, non dai movimenti.

**La deviazione non è giustificabile.** WEISS ha più conti; sapere quanto c'è
*su quale* conto è la precondizione di qualunque decisione di pagamento. Va
corretta — è l'unico L che finisce in cima al backlog.

> `src/lib/saldi.ts:45` · `prisma/schema.prisma:424-512` · cashking/02-02 §3

### 2.2 — `MOV-11` Azioni di massa sulla lista movimenti · **3/3**

Agicap (selezione multipla + menu azioni), Trezy (`Seleziona tutto (749)` +
`Categorizza`) e Cash King (casella in testata) la risolvono tutti allo stesso
modo. Da noi il motore c'è — `POST /api/prima-nota/recategorize` accetta un
batch — ma **non esiste selezione multipla nell'interfaccia**: la route è
raggiungibile solo dal flusso delle proposte di regola.

Nota di merito nostra, però, e va scritta perché la convergenza qui è
*imperfetta*: in Trezy «Seleziona tutto (749)» e «Categorizza» sono adiacenti
**senza conferma né annullamento osservati**, su un dato che alimenta conto
economico e previsioni. Se copiamo il pattern, copiamo la conferma che loro non
hanno.

> `src/app/api/prima-nota/recategorize/route.ts` · trezy/02-03 §2

### 2.3 — `PRV-03` Nessun doppio conteggio **fra fonti previsionali diverse** · 2/2, con Agicap

Questa è la convergenza più importante del documento, perché tocca la
correttezza di un numero e non la comodità di leggerlo.

Agicap e Trezy hanno **due meccanismi diversi per lo stesso problema**:

- Agicap spegne le ricorrenze nel breve termine, con la glossa esplicita: *«il
  periodo mobile in cui le previsioni sono coperte da altre fonti (ad es.
  pagamenti programmati)»*;
- Trezy tiene **tre stime concorrenti** della stessa cella (previsione manuale,
  fatture future, fatture scadute) e ne **sceglie** una via `pickedSource`,
  invece di sommarle.

Convergono sul principio: **quando due fonti prevedono lo stesso flusso, una
sola deve vincere.**

**Noi non arbitriamo, e la causa è più a monte di quanto sembri.** Esistono **due
modelli disgiunti dello stesso concetto** — un'uscita che si ripete:

| Modello | Chi lo scrive | Chi lo legge |
|---|---|---|
| `RecurringExpense` | `/spese-ricorrenti` | **solo** `/api/dashboard/forecast` |
| `Recurrence` → genera `Schedule` | `/scadenzario/ricorrenze` | **solo** `/api/scadenzario/saldo-scalare` |

Verificato: nessun percorso converte l'uno nell'altro
(`grep -rn recurringExpense src` restituisce il CRUD e la sola rotta forecast).
Le conseguenze sono due, e la seconda è peggiore della prima:

1. **L'affitto inserito in una sola delle due pagine sparisce dall'altra
   proiezione.** Nessuna delle due schermate mostra mai il quadro completo, e
   nessuna delle due lo dichiara.
2. **L'affitto inserito in entrambe viene contato due volte** — cosa del tutto
   plausibile, visto che le due pagine esistono entrambe, si chiamano quasi allo
   stesso modo e nessuna nomina l'altra.

**Non è giustificabile.** Va scelta una gerarchia — *movimento registrato >
scadenza aperta > ricorrente non ancora scadenzata* — e applicata in un punto
solo, dopo aver deciso quale dei due modelli sopravvive.

> `src/app/api/dashboard/forecast/route.ts:106-115` · `src/app/api/scadenzario/saldo-scalare/route.ts:51-75` · `prisma/schema.prisma:761, 1836` · agicap/02-03 §3 · trezy/02-01 §4.3

### 2.4 — `BNK-06` Connessione bancaria automatica · 2/2, con Agicap

Agicap la dà per scontata («è il fossato competitivo, non il prodotto»: è
inclusa in ogni piano) e Trezy la compra da terzi (Enable Banking sul percorso
italiano). Cash King l'ha costruita e **non consegnata**, il che la toglie dal
denominatore ma dice comunque dove pensa di dover andare.

Da noi esiste solo il flag `BankAccount.openBankingReady`, che non fa nulla. Il
design è già scritto (`docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md`)
e mai eseguito.

La deviazione ha una giustificazione **temporanea** e onesta: è un L costoso e
finora l'import CSV ha retto. Non è però una scelta di prodotto difendibile a
lungo, ed è la funzione che i clienti reali di Agicap citano più spesso — in
positivo quando funziona e in negativo quando si rompe (37 menzioni su cinque
anni di recensioni).

> `prisma/schema.prisma:207` · trezy/02-03 §8.2 · agicap/00 §3

### 2.5 — `CLS-16` Il tasso di categorizzazione come KPI con un obiettivo · 2/2, con Agicap

Agicap mette in cima alla lista dei movimenti una **barra di progresso con
obiettivo dichiarato (95%)** e un invito all'azione a fianco; Trezy un contatore
«249 da verificare».

Il principio su cui convergono: *la manutenzione dei dati è noiosa e rimandabile,
e trasformarla in un progresso misurabile con un traguardo cambia il
comportamento*. Costa quasi nulla.

Nota critica sulla versione di Trezy, che è il modo sbagliato di farlo: il
contatore vale per tutti i documenti indistintamente e **quindi non ordina
nulla** — l'utente non sa da quale cominciare. Agicap invece affianca al numero
i 66 suggerimenti già scritti, cioè la strada per abbassarlo.

Noi non abbiamo né il numero né il traguardo.

> agicap/02-01 §1 · trezy/02-02 §8.1

### 2.6-2.15 — Le altre dieci, in breve

| ID | Convergenza | Cosa fanno tutti | Cosa facciamo noi | V |
|---|---|---|---|---|
| `MOV-06` | 2/2, con Agicap | Rendono visibile che *questo* movimento ne rappresenta 173 uguali, e ne fanno la leva della categorizzazione di massa | Nulla: ogni movimento è un caso a sé | 🔴 |
| `KPI-03` | 2/2, con Agicap | Disegnano il rischio invece di descriverlo: banda «Zona Negativa» sul grafico (Cash King), celle arancioni sotto soglia (Agicap) | La soglia esiste come numero, non come area sul grafico | 🔴 |
| `KPI-06` | 2/2, con Agicap | Indicatori derivati definibili dall'utente con una formula (43 KPI in Agicap, widget `(A+B)/C` in Trezy) | Assente | 🔴 |
| `SCS-03` | 2/2 | Governano il confine fra consuntivo e previsione, perché il periodo in corso è incompleto per definizione | Il confine è sempre oggi, e il mese corrente entra nei report come se fosse chiuso | 🔴 |
| `KPI-02` | 2/2 | Traducono i numeri in una frase che risponde alla domanda vera («devo preoccuparmi?») | Solo numeri e alert tecnici | 🔴 |
| `ALR-01` | 2/2, con Agicap | Soglia di saldo **per conto**; Agicap ne ha tre, e la terza segnala anche il denaro fermo in eccesso | Una soglia sola, per sede | 🟠 |
| `PRV-07` | 2/2, con Agicap | Costruttore di ricorrenze espressivo; Agicap propone **le letture plausibili della data in linguaggio naturale** invece di una griglia di parametri | Elenco fisso di frequenze + giorno del mese | 🟠 |
| `PRV-18` | 2/2, con Agicap | Una coda di lavoro esplicita sulla manutenzione del modello, messa davanti all'utente | Assente | 🟠 |
| `PLT-07` | 2/2 | Lo stato vuoto **insegna** invece di constatare: la risoluzione dei conflitti fra regole (Trezy), il funzionamento del motore di match (Cash King) | Uno solo lo fa (`CashFlowSourcePanel`) | 🟠 |
| `RET-07` | 2/2 | Il versamento porta il **riferimento** che lo rende verificabile contro l'estratto conto | Trasferimento fra registri senza numero di distinta | 🟠 |

---

## 3. Le convergenze totali dove **siamo già allineati**

Vale la pena elencarle: sono il perimetro su cui non serve toccare nulla, e in
alcuni casi ci siamo arrivati per strade diverse dalle loro.

| ID | Convergenza | Come la risolviamo |
|---|---|---|
| `BNK-01` 4/4 | Anagrafica del conto | `BankAccount` con IBAN cifrato dall'estensione Prisma |
| `BNK-04` 4/4 | Saldo consolidato | `saldiAlGiorno().totalAvailable`, **fonte unica dichiarata** — e qui siamo più rigorosi di Cash King, che ne ha tre |
| `BNK-07` 3/3 | Import da file | `ImportBatch` con conteggio duplicati ed errori |
| `MOV-09` 3/3 | Il giroconto è una coppia | `transferId`, che lega le due righe e le cancella insieme |
| `CLS-03` 3/3 | Economico vs patrimoniale | `AccountType`; solo RICAVO e COSTO entrano nel conto economico |
| `CLS-08` 2/2 | Regole retroattive | `recategorize` + `test` |
| `CLS-11` 3/3 | Ordine esplicito, prima corrispondenza vince | Documentato nel motore, con riordino per trascinamento |
| `CLS-14` 3/3 | La correzione manuale insegna | `SupplierProductAccount`, con precedenza assoluta sull'AI |
| `CLS-15` 2/2 | Imputazione di default sull'anagrafica | `Supplier.defaultAccountId`, ereditato dai movimenti generati dalle regole |
| `DOC-03` 2/2 | P7M accettato | `src/lib/p7m-utils.ts` |
| `DOC-10` 2/2 | Rate multiple per documento | `InvoiceDeadline` con `Schedule.invoiceDeadlineId` unique: l'import ripetuto non duplica |
| `SCD-03` 2/2 | Aging a fasce | Sei fasce contro le quattro cablate di Trezy, e nessuna aperta senza fondo |
| `SCD-09` 3/3 | Ricorrenze | `Recurrence` con anteprima |
| `PRV-02` 3/3 | Nessun doppio conteggio previsto/realizzato | Il saldo scalare somma il **residuo**; verificato in fase 2 e documentato |
| `PRV-05` 2/3 | Le fatture attese entrano nel previsionale | Via le scadenze generate dalle rate — e qui **battiamo Trezy**, che le mostra e non le usa |
| `PRV-06` 2/3 | Lo scaduto entra nel previsionale | `scaduto.saldoFinaleIncluso` — di nuovo meglio di Trezy |
| `PRV-16` 3/3 | Il previsionale mostra i propri addendi | `CashFlowSourcePanel` |
| `PRV-17` 3/3 | Drill-down dall'aggregato al dettaglio | Conto economico → prima nota |
| `RIC-05` 1/1 | Alternative con punteggio ciascuna | Fino a 5 candidati ordinati, con badge percentuale |
| `RIC-07` 2/2 | Il rifiuto lascia memoria | `ScheduleReconciliationStatus.REJECTED` |
| `RIC-10` 1/1 | Riesecuzione che esclude il già riconciliato | `findEntryCandidates` |
| `RPT-05` 2/2 | Excel con celle numeriche vere | `chiusure/[id]/excel` |
| `PLT-01` 3/3 | Modello dei ruoli | `Role`/`Permission`/`RolePermission` + RLS su 80 tabelle — **più severo di tutti e tre** |
| `FIS-08` 1/1 | ODA/RDA | `riferimentoDocumento` + `references` |

---

## 4. Dove Agicap dissente dagli altri, e perché conta

La regola di evidenza dice di indagare prima di ignorare un dissenso di Agicap.
Sono tre i casi, e in due su tre **il dissenso è motivato dalla scala del
cliente, non dalla qualità della soluzione**.

**4.1 — La grammatica delle regole (`CLS-05`).** Cash King dà 13 operatori e le
espressioni regolari; Agicap dà **due campi e tre operatori testuali**, e in
cambio 66 regole già scritte dall'analisi dei tuoi dati. Non è povertà: è una
scommessa di prodotto dichiarata — *la potenza sta nel suggeritore, non nel
costruttore*, perché la maggior parte degli utenti non scriverebbe mai una regola
complessa.

Ha ragione Agicap, per il nostro caso. Il nostro suggeritore
(`/api/categorization-rules/proposals`) è già l'idea giusta; ciò che gli manca
non è espressività ma **l'anteprima dell'impatto** e il conteggio, che è la
metà che convince l'utente a premere il pulsante.

Il prezzo della scelta di Agicap è però reale, e per un horeca è concreto:
quando il pattern non sta nel titolo, l'utente non ha strumenti. Gli incassi POS
arrivano come 88 accrediti con lo stesso titolo, e distinguere **quale punto
vendita** li ha generati non è esprimibile con quei mezzi. Da noi lo risolve il
centro di costo, che è un asse diverso.

**4.2 — Le tre soglie di liquidità (`ALR-01`).** Trezy e Cash King segnalano solo
il denaro che manca; Agicap ha anche una soglia di **eccedenza di liquidità**,
cioè segnala il denaro fermo. È un dissenso che nasce dal suo cliente tipo (un
CFO che deve impiegare la giacenza), e per WEISS vale poco. Adottiamo le prime
due, non la terza.

**4.3 — La previsione da storico (`PRV-10`).** Agicap offre **una sola** opzione,
«media degli ultimi 3 periodi», e nessuna correzione di stagionalità. È il
dissenso in cui ha torto, e la nostra analisi lo dice con un esempio nostro:
per un'attività stagionale la media dei tre mesi precedenti calcolata a settembre
include luglio e agosto e sovrastima sistematicamente l'autunno. Noi facciamo
già meglio (60% stesso periodo dell'anno precedente + 40% media per giorno della
settimana) e non c'è ragione di allinearci.

---

## 5. Le tre convergenze che non abbiamo potuto misurare

Onestà del denominatore: tre voci sono verificabili su **un solo** prodotto, e
quindi per il metodo non producono convergenza. Le segnalo perché la tentazione
di trattarle come best practice è forte e sarebbe scorretta.

| ID | Verificabile solo su | Perché non conclude |
|---|---|---|
| `CLS-12` sinonimi delle controparti | Cash King | Trezy ha il campo `counterparty_name` ma **nullo su tutto il campione italiano**: l'aggregatore non lo popola, quindi il problema per loro non si pone nello stesso modo. Agicap [NA] |
| `RIC-03` motivazioni accanto al punteggio | Cash King | Agicap [NA], Trezy non apre il pannello «Candidati». Resta comunque il singolo accorgimento più trasferibile dell'intera analisi, e va in quick win per merito proprio, non per convergenza |
| `SCD-08` controllo «pagate senza movimento» | Cash King | Nessun altro lo espone. Ma il **difetto che previene esiste da noi ed è verificato nel codice**, il che vale più di una convergenza |

---

## 6. Il criterio con cui una deviazione resta

Riassunto operativo, perché il backlog vi si appoggia.

Una nostra deviazione da una convergenza totale **resta** solo se ricade in uno
di questi tre casi:

1. **Il problema non esiste per noi** — es. `PRV-12`, il «giorno di stima» di
   Agicap, che risolve un'ambiguità della grana settimanale che noi non abbiamo.
2. **La nostra soluzione è dimostrabilmente migliore** — es. `PRV-10`, la
   previsione da storico; `BNK-04`, il saldo consolidato da fonte unica;
   `SCD-03`, sei fasce di aging invece di quattro con l'ultima aperta.
3. **La deviazione è temporanea e dichiarata** — es. `BNK-06`, la connessione
   PSD2: il design c'è, il costo è alto, la scelta è di rinvio e non di merito.

Tutto il resto va corretto. Le quindici voci del § 2 sono, per costruzione,
quelle che non ricadono in nessuno dei tre casi.
