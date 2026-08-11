# Divergenze — dove i quattro si separano, e cosa scegliamo noi

Le voci in cui i prodotti verificabili **non** risolvono allo stesso modo. Qui
non esiste una best practice da adottare: esiste una scelta di prodotto, e la
scelta va fatta guardando al caso d'uso — **horeca multi-sede, tre punti vendita
in una sola società, incasso prevalentemente al banco**.

Per ciascuna: come si separano, chi ha ragione nel merito, cosa facciamo noi e
perché.

---

## D1 · Qual è l'asse di imputazione (`CLS-01`)

| Prodotto | Scelta |
|---|---|
| Agicap | Categoria a 4 livelli, **due alberi separati** entrata e uscita, e le foglie sono **mezzi di pagamento** (Fornitori Italia → SDD / Bonifici / RIBA / Assegno) |
| Trezy | Categoria a 3 livelli **più** un codice contabile, con badge C/E vs patrimoniale |
| Cash King | Categoria **piatta**, 20 voci che mescolano costi, fiscale e finanziario |
| Sibill | Categoria/sottocategoria, **nessun piano dei conti**, asse unico |

**Chi ha ragione.** Agicap è coerente con sé stesso — a chi guarda la cassa
interessa il canale di pagamento e la sua tempistica — ma la sua stessa analisi
registra il prezzo: *«questo piano non risponde alla domanda quanto ho speso di
materie prime»*. Trezy ha l'intuizione giusta (la categoria fa da ponte verso un
piano contabile) e la esegue male, perché il piano dietro è francese e quello
italiano è un contenitore vuoto.

**La nostra scelta, confermata.** Il **conto del piano v4** è l'asse unico e la
categoria di budget si *deriva* (`AccountBudgetMapping`), con
`JournalEntry.budgetCategoryId` in pensione dichiarata. Il mezzo di pagamento
sta su `Schedule.metodoPagamento`, che è dove appartiene: è un attributo della
scadenza, non una voce di piano.

**Perché per un bar è la scelta giusta.** Il food cost è la voce di costo
dominante, e si legge solo su un piano per natura di costo. Un piano per mezzo
di pagamento direbbe quanto è uscito per SDD, che non serve a decidere niente.

---

## D2 · Fin dove spingere la contabilità (`CLS-02`, `KPI-09`, `KPI-10`)

| Prodotto | Scelta |
|---|---|
| Agicap | Si ferma alla riclassificazione per aree; l'EBITDA è «Analisi Economica», una stima |
| Trezy | **Genera partita doppia vera** dai movimenti bancari (3 368 scritture, quadratura verificata su 45 gruppi su 45), e ci costruisce sopra C/E, stato patrimoniale, break-even e valutazione d'impresa |
| Cash King | Non ci prova |
| Sibill | Dichiaratamente no |

**Chi ha ragione.** La direzione di Trezy è ambiziosa e tecnicamente seria; il
punto in cui si rompe è istruttivo. Lo stato patrimoniale **non quadra del 112%**
perché la contabilità stimata parte da zero e da un estratto conto non si ricava
il capitale sociale. Il prodotto lo sa — l'API restituisce `isReconciled: false`
e lo scarto esatto — e non lo traduce mai in un avviso: la riga si chiama
«Controllo del saldo» invece di «Sbilancio da saldi di apertura mancanti».

**La lezione non è "non fare contabilità": è che il conto economico si può fare
onestamente dai movimenti, lo stato patrimoniale no.**

**La nostra scelta, confermata.** Partita doppia sì (`debitAmount`/`creditAmount`
+ `counterpartId`), conto economico sì e con un'invariante di quadratura
verificata nei test in centesimi interi, **stato patrimoniale no**. È il taglio
giusto e va tenuto: `KPI-10` resta ⚪ per una ragione strutturale, non per
mancanza di tempo.

---

## D3 · Qual è l'oggetto della riconciliazione (`RIC-01`)

| Prodotto | Lega |
|---|---|
| Sibill e noi | **Scadenza ↔ movimento** — il documento entra solo come contenitore di scadenze |
| Trezy | **Documento ↔ transazione** |
| Cash King | **Movimento ↔ fattura / rata ricorrente / estratto conto carta**, sei regole |

**Chi ha ragione.** Il modello Sibill è il più pulito, e la ragione è il
principio che lo regge: *sono i movimenti a portare l'imputazione contabile, mai
le scadenze*. Legare il movimento al documento — come fa Trezy — costringe poi a
inventare un modo di gestire le fatture con più rate, ed è la ragione per cui
Cash King ha dovuto aggiungere la R4 (banca ↔ rata ricorrente) dopo aver scritto
la guida.

**La nostra scelta, confermata — con una precisazione che vale la pena scrivere.**
Abbiamo **due riconciliazioni**, e non è ridondanza:

- `ScheduleReconciliation` (scadenza ↔ movimento) è il ciclo vero;
- `BankTransaction.matchedEntryId` (transazione importata ↔ movimento) è lo
  **staging dell'import**: serve a dire «questa riga dell'estratto conto è già
  registrata in prima nota», che è una domanda diversa.

Il rischio è che il secondo venga scambiato per il primo. Il commento in cima a
`docs/Ciclo_Tesoreria_Modello_Sibill.md` lo dice, ma il codice no: vale la pena
un commento in testa a `src/lib/reconciliation/matcher.ts` che dichiari il
perimetro, altrimenti la prossima sessione ci costruirà sopra il ciclo sbagliato.

---

## D4 · Cosa succede a un pagamento parziale (`SCD-07`)

| Prodotto | Scelta |
|---|---|
| Sibill | **Il residuo diventa una nuova scadenza**: una scadenza è o interamente pagata o interamente aperta |
| Noi | `importoPagato` sulla stessa scadenza, con residuo |
| Trezy, Cash King | [NV] — nessuno dei due account presentava il caso |

**La nostra scelta, confermata, ed è una divergenza deliberata già documentata.**
Il gestionale gestisce i pagamenti parziali con la relativa interfaccia e i
relativi test da prima della riconciliazione; riscrivere lo scadenzario alla
Sibill avrebbe richiesto di buttare quel lavoro per guadagnare una semplicità che
non ci serve.

Va però registrata una **conseguenza** che la scelta porta con sé e che
l'analisi di Sibill rende esplicita: sul riallineamento della `dataAttesa`,
riallineare anche sui parziali avrebbe spostato il residuo nel passato. Il codice
lo evita già — il riallineamento scatta **solo quando la riconciliazione salda**
— ed è la parte della divergenza che costa attenzione ogni volta che si tocca
quel percorso.

---

## D5 · Come nasce la previsione (`PRV-01`)

| Prodotto | Fonte primaria |
|---|---|
| Agicap | **Stima settimanale per categoria**, caricata da Excel; nel piano osservato nessuna generazione automatica |
| Trezy | **Previsione manuale cella per cella**; il motore non estrapola nulla finché l'utente non alimenta la griglia |
| Cash King | **Scadenze + rate ricorrenti + fatture**, con nove serie distinte nel grafico |
| Sibill | Scadenze |

**Chi ha ragione.** Cash King, per il nostro caso, e la ragione è che è l'unico
approccio che produce una previsione **il primo giorno**. Agicap e Trezy
chiedono all'utente di costruire il budget prima di ottenere qualcosa: è
sostenibile per un controller, non per un titolare che apre il software alle
sette del mattino. L'osservazione su Trezy lo mostra in modo brutale — la
proiezione è una retta piatta su tutto il futuro, e la causa principale è che
nessuno ha inserito previsioni.

**La nostra scelta.** Siamo già sul modello Cash King (previsione dedotta dai
dati esistenti), ma con **tre motori invece di uno**, ed è il problema:

| Rotta | Base | Orizzonte |
|---|---|---|
| `/api/dashboard/forecast` | spese ricorrenti + storico chiusure | 30 gg (max 90) |
| `/api/scadenzario/saldo-scalare` | scadenze aperte | 90 gg |
| `/api/cashflow/projection` | movimenti già registrati | finestra libera |

Tre risposte alla domanda «quanti soldi avrò», con basi diverse e nessun raccordo
— che è **esattamente il difetto che l'analisi rimprovera a Cash King** (tre
endpoint, tre valori per lo stesso saldo). Il fatto che ce lo siamo fatti da soli
non lo rende meno grave.

E a monte c'è una duplicazione di modello, non solo di calcolo: **`RecurringExpense`
e `Recurrence` descrivono la stessa cosa** — un'uscita che si ripete — e sono
disgiunti. Il primo è letto solo dal forecast della dashboard, il secondo genera
`Schedule` lette solo dal saldo scalare, e **nessun percorso converte l'uno
nell'altro** (verificato). L'affitto inserito in una pagina sparisce dall'altra
proiezione; inserito in entrambe viene contato due volte.

**La decisione:** una fonte sola, che unisce scadenze + ricorrenti non ancora
scadenzate + storico, con la gerarchia di `PRV-04` ad arbitrare, **dopo aver
scelto quale dei due modelli ricorrenti sopravvive** (raccomandazione:
`Recurrence`, perché genera scadenze vere e quindi riconciliabili). Le tre rotte
restano come viste, non come motori. → `07-backlog` voce `PRV-01/03/04`.

---

## D6 · Cos'è uno scenario (`PRV-13`)

| Prodotto | Scelta |
|---|---|
| Trezy | Lo scenario è una **copia del piano di lavoro**: cambiando scenario cambiano previsioni, collegamenti e stati di pagamento |
| Noi | Varianti tipizzate di una previsione salvata (`ForecastType`: base, ottimistico, pessimistico, personalizzato) |
| Agicap | Modulo separato [NA] |
| Cash King | Assente |

**Chi ha ragione.** Trezy, in astratto: uno scenario che condivide le
riconciliazioni non è davvero uno scenario. Ma la sua stessa analisi nota che è
«potente e insieme un moltiplicatore di lavoro manuale», e su un prodotto in cui
le previsioni si inseriscono a mano cella per cella il moltiplicatore è il costo
dominante.

**La nostra scelta, confermata.** Per WEISS lo scenario serve a rispondere a
domande concrete e circoscritte — *apro la Casetta anche a settembre? assumo?
reggo un aumento del 15% sulle materie prime?* — non a mantenere due contabilità
parallele. Le varianti tipizzate bastano.

---

## D7 · Come si acquisiscono i documenti (`DOC-03`, `DOC-05`)

| Prodotto | Scelta |
|---|---|
| Trezy | **OCR generativo** su PDF/immagini, con canale email dedicato; righe di dettaglio **non estratte** |
| Cash King | Parser di **XML, P7M e PDF del Cassetto Fiscale** |
| Noi | Parser XML/P7M deterministico, righe estratte e imputabili una per una |

**Chi ha ragione.** Noi e Cash King, e la ragione è normativa: in Italia il ciclo
passivo passa dallo SDI in XML, che è dato strutturato. L'OCR serve dove
l'e-invoicing non è obbligatorio — cioè nel mercato d'origine di Trezy.

Il confronto è netto sui risultati: Trezy ha investito in un motore generativo
serio (con controllo di sanità e ritentativo sull'estrazione degenerata) e
**non estrae le righe di dettaglio**, il che fa cadere il presupposto di sei
funzioni annunciate, food cost incluso. Noi le righe le abbiamo, e ci abbiamo
costruito sopra l'imputazione per riga e la memoria per prodotto.

**Ciò che vale la pena prendere da Trezy è il canale, non il motore**:
l'inoltro per email elimina il passaggio più fastidioso — scaricare l'allegato e
ricaricarlo altrove. → `DOC-04` nel backlog, ma come **ingestione di XML e P7M
inoltrati**, non come OCR.

---

## D8 · Multi-azienda o multi-sede (`PLT-03`, `PLT-04`, `CLS-04`)

| Prodotto | Scelta |
|---|---|
| Agicap | **Consolidamento** multi-entità: aggrega società diverse |
| Trezy | Selettore di organizzazione con badge `BETA` + tre dimensioni analitiche vuote |
| Cash King | Multi-azienda annunciato, non osservabile con un account |
| Noi | **Single-venue** per scelta, con `CostCenter` a disaggregare le tre sedi |

**Chi ha ragione.** Nessuno dei tre risolve il nostro problema, e l'analisi di
Agicap lo dice con precisione: *«le nostre tre sedi sono una società sola: ci
servirebbe l'opposto, disaggregare per sede dentro un'unica entità»*. Il mercato
mid-market ha bisogno di aggregare, noi di separare.

**La nostra scelta, confermata e rivendicata.** I centri di costo STR / VVB / CAS
attraversano movimenti, chiusure, spese e regole, portano la propria provenienza
(`costCenterSource`) e producono un conto economico a colonne per centro. È il
punto in cui siamo strutturalmente avanti a tutti e quattro, ed è documentato in
`05-cosa-facciamo-meglio.md`.

---

## D9 · Le proposte di match si persistono? (`RIC-09`)

| Prodotto | Scelta |
|---|---|
| Cash King | **Lotti persistiti** con periodo, parametri (`minScore`, `rulesUsed`), contatori, storico e pulsante «Riprendi» |
| Sibill e noi | **Non persistite**: si ricalcolano quando servono |

**Chi ha ragione.** Cash King, in un contesto con centinaia di righe da lavorare:
*«il lavoro di riconciliazione è lungo e si interrompe, e poterlo riprendere
conta»*. La loro stessa analisi mostra però che il lotto persistito porta con sé
un problema di coerenza — i contatori del lotto mescolano due unità di misura e
danno «In Attesa: 0» con nove proposte ancora da decidere.

**La nostra scelta, confermata.** Con i volumi WEISS (decine di scadenze aperte,
non centinaia) la sessione di riconciliazione non si interrompe, e le proposte
ricalcolate sono sempre aggiornate per costruzione. `RIC-09` resta ⚪.

**Ciò che invece va preso da quel lotto è un parametro**: `minScore: 50`. Cash
King dichiara la soglia minima di emissione delle proposte nei parametri del
lotto, e questo permette di scoprire — come la loro analisi ha fatto — che la
fascia «bassa» documentata è strutturalmente irraggiungibile. Noi abbiamo
`SCHEDULE_MATCH_THRESHOLDS.MINIMUM = 0.45` e `SUGGESTED = 0.75` **cablate nel
codice e mai mostrate**. Renderle visibili costa nulla.

---

## D10 · Quanti stati ha un movimento (`MOV-02`)

| Prodotto | Scelta |
|---|---|
| Cash King | **5 stati** in un enum: Consolidato · Completo · Previsto · Provvisorio · Non riconciliato |
| Agicap | 2: Realizzato / In attesa |
| Trezy | 2: Incluse / Escluse, **mai spiegate**, su un attributo che modifica i totali |
| Sibill e noi | **Assi ortogonali** invece di un enum: verificato, nascosto, cancellato |

**Chi ha ragione.** Dipende dalla domanda, e conviene tenerle separate:

- *«questo movimento è reale o previsto?»* → un enum di stato è la risposta
  giusta, ed è quello che Cash King fa bene;
- *«un umano l'ha guardato?»* → è **ortogonale** al pagamento, ed è la scoperta
  di Sibill che abbiamo copiato: nei match automatici la transazione passa a
  VERIFIED mentre la scadenza resta TO_VERIFY.

**La nostra scelta.** Gli assi ortogonali restano. Ma **ci manca l'enum**: da noi
un movimento previsto e uno realizzato non si distinguono, perché tutto ciò che
sta in prima nota è già accaduto. È coerente e forse è la scelta giusta — il
previsto vive nello scadenzario, non in prima nota — ma va **dichiarato**, perché
oggi non lo è da nessuna parte, e la colonna `entryType` che avrebbe potuto
portare quella semantica è nulla su tutti i percorsi automatici.

Verdetto in matrice 🟠 con effort M: non un enum di cinque stati, ma la
distinzione «registrato / atteso» resa esplicita nella lista dei movimenti quando
un movimento nasce da una regola di scadenzario con data futura.

---

## D11 · L'esperienza mobile è consultazione o operatività (`PLT-09`)

| Prodotto | Scelta |
|---|---|
| Trezy | **Consultazione**: da telefono spariscono impostazioni, reporting, categorie e academy — inclusi gli avvisi di saldo, che servono proprio a chi è fuori ufficio |
| Cash King, Agicap | Non misurato |
| Noi | **Operatività**: PWA con funzionamento offline, push attive, responsive verificato a 390px con criterio dedicato |

**Chi ha ragione.** Noi, e per una ragione che nasce dal dominio: da noi il
mobile non è il titolare che consulta, è **lo staff che compila la chiusura di
cassa alle due di notte con il wifi che va e viene**. È un caso d'uso che nessuno
dei quattro ha, e giustifica un investimento che per loro non avrebbe senso.

La divergenza va tenuta, e va tenuta anche la sua conseguenza: la scelta di Trezy
(«nessuno cambia il piano dei conti in metropolitana») è ragionevole per la
*configurazione*, e possiamo adottarla lì senza contraddirci.

---

## D12 · Quanto si racconta all'utente del proprio motore

Questa non è una voce della matrice ma un asse che le attraversa, e merita di
essere nominato perché è il tratto su cui i quattro si separano di più.

| Prodotto | Posizione |
|---|---|
| Trezy | **Massima trasparenza, involontaria**: il campo `calculation` porta la formula in linguaggio quasi naturale accanto a ogni cella; le formule delle modalità di previsione sono scritte dentro l'interfaccia; `_futureRemaining` e `_futureAdjusted` viaggiano al client |
| Cash King | **Trasparenza deliberata**: le sei regole dichiarate prima dell'esecuzione, le motivazioni accanto al punteggio, le schede che elencano i propri addendi |
| Agicap | **Trasparenza tipografica**: la convenzione `+ − =` che rende leggibile una cascata di calcoli senza disegnare nulla |
| Noi | Parziale: `CashFlowSourcePanel` spiega la previsione, il resto no |

**La scelta.** Adottiamo la posizione di Cash King, non quella di Trezy: la
formula si dichiara **dove l'utente sta decidendo**, non ovunque. Un campo
`calculation` su ogni cella è debug che finisce in produzione; una tabella delle
regole sopra il pulsante di avvio è progettazione.

Il principio operativo che ne ricaviamo, e che governa tre voci del backlog
(`RIC-03`, `RIC-04`, `CLS-09`): **ogni volta che il software decide qualcosa al
posto dell'utente, accanto alla decisione ci va il perché.** Non il numero: la
frase.
