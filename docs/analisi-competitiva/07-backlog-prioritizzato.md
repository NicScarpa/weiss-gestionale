# Backlog prioritizzato

Le **70 voci** della matrice con verdetto 🔴 (assente, da implementare — 50) o 🟠
(presente ma risolto meglio da loro — 20), ordinate per priorità.

Regola di ordinamento: **quick win in cima** (impatto ≥3 ed effort S), poi
impatto decrescente, poi effort crescente. A parità di tutto, prima ciò che
previene un numero sbagliato.

Ogni voce è implementabile senza riaprire i software concorrenti: la matrice
(`02-matrice-5vie.md`) contiene già cosa fanno loro, e i ticket in `09-issues/`
contengono i file del repo da toccare.

**Escluse per costruzione**: le 17 voci ⚪, ciascuna motivata nella propria cella
di matrice, e le 10 famiglie escluse per scala in `01-tassonomia.md` §4. Non
tornano.

---

## Riepilogo

| Priorità | Criterio | Voci | Effort complessivo indicativo |
|---|---|---|---|
| **P0** | Quick win: impatto ≥3, effort S | 16 | ~6-8 giornate |
| **P1** | Impatto 5 | 5 (di cui 1 già in P0) | ~2 settimane |
| **P2** | Impatto 4, effort M | 10 | ~3 settimane |
| **P3** | Impatto 4, effort L | 7 | ~2 mesi |
| **P4** | Impatto 3, effort M | 20 | ~5 settimane |
| **P5** | Impatto 3, effort L | 6 | ~1,5 mesi |
| **P6** | Impatto 2 | 7 | — |

Il totale è volutamente molto più grande di ciò che si farà: serve a decidere
cosa **non** fare sapendo cosa si sta lasciando.

---

## P0 · Quick win — impatto ≥3, effort S

Sedici voci, dettagliate una per una in `08-quick-wins.md` con i path dei file.
Qui solo l'elenco ordinato, perché è la lista che si esegue.

| # | ID | Cosa | V | Imp |
|---|---|---|---|---|
| 1 | `SCD-08` | **Contatore «pagate senza movimento»** — intercetta l'errore che falsa il previsionale in silenzio | 🔴 | **5** |
| 2 | `RIC-03` | **Motivazioni accanto al punteggio di match** — «importo identico», «unico match possibile» | 🔴 | 4 |
| 3 | `CLS-16` | **Tasso di categorizzazione come KPI** con obiettivo dichiarato | 🔴 | 4 |
| 4 | `SCD-02` | **Mese corrente spezzato** in «scaduto» e «da saldare» | 🔴 | 4 |
| 5 | `SCD-04` | **Anzianità del ritardo dentro il badge** («Scaduta +117g») | 🔴 | 4 |
| 6 | `KPI-02` | **Giudizio sintetico in linguaggio naturale** sopra i numeri | 🔴 | 4 |
| 7 | `CLS-09` | **Anteprima dell'impatto** prima di applicare una regola | 🟠 | 4 |
| 8 | `RPT-04` | **Separatore decimale italiano nell'export dello scadenzario** — oggi quegli importi arrivano a Excel come testo, mentre l'export della prima nota è già corretto | 🔴 | 3 |
| 9 | `RIC-04` | **Fattori del punteggio dichiarati** prima dell'esecuzione | 🔴 | 3 |
| 10 | `KPI-03` | **Banda «zona negativa»** sul grafico del saldo (la linea di soglia c'è già) | 🟠 | 3 |
| 11 | `SCD-14` | **Ritardo effettivo confrontato con i termini pattuiti** | 🟠 | 3 |
| 12 | `PRV-15` | **Selettore di periodo per ancora + durata**, con preset asimmetrico | 🔴 | 3 |
| 13 | `RET-07` | **Numero di distinta sul versamento** contanti | 🟠 | 3 |
| 14 | `DOC-11` | **Controllo di plausibilità** sul documento in ingresso | 🔴 | 3 |
| 15 | `CLS-06` | **Anteprima delle righe colpite** dalla proposta di regola (il conteggio c'è già) | 🟠 | 3 |
| 16 | `PLT-07` | **Stati vuoti che insegnano** invece di constatare | 🟠 | 3 |

---

## P1 · Impatto 5 — le cinque cose che cambiano un numero

Sono le voci in cui l'assenza produce un **numero sbagliato** o una **decisione
mancata**, non un'inconvenienza.

### `SCD-08` · Contatore «pagate senza movimento» · effort **S** → già in P0

Il più urgente di tutti, ed è anche il più economico. Vedi `08-quick-wins.md` §1.

### `PRV-03` · Una sola fonte per la previsione di cassa · effort M

**Il problema.** Tre motori con basi diverse rispondono alla stessa domanda:

| Rotta | Base | Orizzonte |
|---|---|---|
| `/api/dashboard/forecast` | spese ricorrenti + storico chiusure | 30 gg |
| `/api/scadenzario/saldo-scalare` | scadenze aperte | 90 gg |
| `/api/cashflow/projection` | movimenti già registrati | libero |

E a monte ci sono **due modelli disgiunti della stessa uscita ricorrente**:
`RecurringExpense` (letto solo dal forecast) e `Recurrence` → `Schedule` (letta
solo dal saldo scalare). Nessuno dei due sa dell'altro, e nessun percorso
converte l'uno nell'altro. La stessa uscita fissa inserita in una sola pagina
sparisce dall'altra proiezione; inserita in entrambe viene contata due volte.
È la stessa famiglia di difetto che l'analisi rimprovera a Cash King, che ha tre
valori per lo stesso saldo.

**Cosa fanno loro.** Agicap spegne le ricorrenze nel breve termine, dove i
pagamenti programmati sono una fonte migliore. Trezy tiene tre stime concorrenti
e ne **sceglie** una (`pickedSource`) invece di sommarle.

**Cosa facciamo.** Una funzione unica di proiezione in `src/lib/`, con la
gerarchia `movimento registrato > scadenza aperta > spesa ricorrente non ancora
scadenzata`. Le tre rotte restano come **viste** su finestre diverse, non come
motori. Va insieme a `PRV-04`.

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
| `PRV-01` | **Un solo motore previsionale** | 🟠 | Va insieme a `PRV-03` e `PRV-04`: è lo stesso intervento visto da tre angoli |
| `PRV-04` | **Gerarchia di affidabilità delle fonti** dichiarata | 🔴 | `ConfidenceLevel` esiste già su `CashFlowForecastLine` ma non arbitra nulla: farlo arbitrare |
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

Venti voci. Raggruppate per tema, perché conviene farle a lotti.

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
posizione aperta stampabile, S) · `RPT-10` (riga dei totali e sigle espanse
nell'export, S) · `FIS-04` (scheda dedicata per CBILL/pagoPA, S) · `BNK-08`
(modelli di importazione riutilizzabili, M) · `SCD-13` (import di scadenzario
misto, M) · `PRV-07` (costruttore di ricorrenze in linguaggio naturale, M).

Le prime quattro sono effort S e possono essere accodate a un'onda di quick win
se avanza tempo.

---

## Sequenza consigliata

Non è un piano, è un ordine di dipendenze: chi esegue decide quanto ne fa.

**Onda 1 — «i numeri devono essere giusti»** (~2 settimane)
`SCD-08` · `RPT-04` · `PRV-03` + `PRV-01` + `PRV-04` (un intervento solo) ·
`DOC-11`
> Sono le quattro voci in cui oggi il gestionale può mostrare un numero
> sbagliato senza che nessuno se ne accorga. Vanno prima di qualunque cosa
> nuova.

**Onda 2 — «il resto dei quick win»** (~1 settimana)
Le altre 12 voci di P0, in qualunque ordine. Sono indipendenti fra loro.

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
   costruttore. Prima si fanno `CLS-06` e `CLS-09` (conteggio e anteprima, due
   quick win), poi si guarda se qualcuno ha ancora bisogno delle espressioni
   regolari.
