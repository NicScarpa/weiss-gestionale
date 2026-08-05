# Il ciclo di tesoreria: modello Sibill e stato dell'implementazione

**Ultimo aggiornamento:** 5 agosto 2026 (pomeriggio: completate le fasi 3 e 4)

Questo documento spiega il modello di ragionamento su cui è costruito il ciclo
fattura → scadenza → movimento → riconciliazione, cosa è già implementato e
cosa resta da fare. Serve a chi riprende il lavoro per non dover ricostruire il
contesto da capo.

---

## Il modello di ragionamento

Il gestionale replica **Sibill**, piattaforma italiana di tesoreria aziendale.
Il reverse engineering vive in `/Users/nicolascarpa/Desktop/Progetti/sibill-re`.

**Quali fonti sono attendibili**, in ordine:

1. I payload reali catturati in `sibill-offline/api-responses/` — fonte primaria.
2. `docs/06-riconciliazione.md` e `docs/07-scadenzario.md`, estratti dal bundle
   JavaScript con enum e schemi di validazione letterali.
3. **`tasks/prd-*.md` NON descrive Sibill**: sono riprogettazioni per il
   gestionale target. L'algoritmo di matching che contengono è dichiarato dallo
   stesso autore come "ricostruito dalle best practice del settore", non
   osservato. Non trattarlo come specifica.

### Il principio guida

> Lo scadenzario è un recap di cosa c'è da pagare e si riconcilia con i
> movimenti. Sono i **movimenti** a portare l'imputazione contabile, mai le
> scadenze.

Confermato dai dati con quattro prove indipendenti: la scadenza (`flow`) non ha
alcuna relazione con la categoria, verificato su venti scadenze reali; il
movimento (`transaction`) ha `category`, `subcategory`, `allocations` e
`categorizationSource`; il documento porta la categoria in un caso su
cinquanta; e nel cash flow le righe che vengono dalle scadenze hanno sempre
`categoryId` nullo, mentre quelle dai movimenti sono ripartite per categoria.

### Come i pezzi si incastrano in Sibill

```
documento (fattura)
    │  1:N
    ▼
  flow (scadenza)  ←── riconciliazione (N:M) ──→  transaction (movimento)
                                                   porta la categoria
```

- La riconciliazione lega **sempre** scadenza e movimento, mai movimento e
  documento. Il documento entra solo come contenitore delle scadenze.
- Le proposte di match **non sono persistite**: si ricalcolano quando servono.
- Il rifiuto di una proposta **crea** un record `REJECTED` invece di cancellare,
  così resta memoria di ciò che il sistema aveva proposto.
- Lo stato di pagamento della fattura è **derivato** dalle sue rate.
- Sibill **non ha piano dei conti né partita doppia**: il suo asse è
  categoria/sottocategoria, analitico-gestionale. Il nostro gestionale ha
  entrambi, perché a un bar italiano servono.

### La scoperta che ha semplificato il lavoro

`JournalEntry` (la prima nota) **è già l'equivalente strutturale della
`transaction` di Sibill**:

| Sibill `transaction` | Weiss `JournalEntry` |
|---|---|
| `category` / `subcategory` | `budgetCategoryId` → `BudgetCategory` (gerarchica) |
| `categorizationSource` | `categorizationSource` |
| `verificationStatus` | `verified` |
| `hidden` | `hiddenAt` |
| regola applicata | `appliedRuleId` |

`BankTransaction` non è il movimento di Sibill: è solo lo **staging
dell'import** dell'estratto conto. Non serve quindi spostare la categoria lì —
il movimento con l'imputazione esiste già.

---

## Fase 1 — Riconciliare movimento e scadenza ✅

Commit `87936b1`.

Prima il ciclo era spezzato: pagare una scadenza non generava movimenti, un
movimento non chiudeva alcuna scadenza.

- **`ScheduleReconciliation`**: relazione N:M fra `Schedule` e `JournalEntry`,
  con `status` (VERIFIED/REJECTED), `source` (MANUAL/AUTOMATIC/PROPOSAL/RULE),
  `amount`, `confidence` e il pagamento generato.
- **`src/lib/reconciliation/schedule-matcher.ts`** — punteggio di affinità:
  importo 55%, data 25%, descrizione 20%, finestra da −90 a +30 giorni, bonus
  del 15% se il numero documento compare nella causale.
  I pesi vengono dall'evidenza: nei match automatici reali di Sibill l'importo
  coincide al centesimo in 50 casi su 50, mentre la controparte diverge in 11
  casi su 50 — un bonifico intestato a "ESTENERGY" può saldare una fattura
  "HERA". L'importo è il criterio forte, il nome solo un rafforzativo.
- **`src/lib/services/schedule-reconciliation-service.ts`**:
  `reconcileScheduleWithEntry`, `rejectScheduleMatch`,
  `undoScheduleReconciliation`.
- **Route**: `src/app/api/scadenzario/[id]/riconciliazioni/` e la sottorotta
  `[reconciliationId]` per l'annullamento.
- **UI**: `src/components/scadenzario/schedule-reconciliation-panel.tsx`, nella
  tab "Riconciliazione" del dettaglio scadenza.

**Divergenza deliberata da Sibill.** Sulle riconciliazioni parziali Sibill
riscrive lo scadenzario: il residuo diventa una nuova scadenza, perché una
scadenza è o interamente pagata o interamente aperta. Qui si mantiene
`importoPagato`, che il gestionale già gestisce con i pagamenti parziali, la
relativa interfaccia e i test. Non è una svista: non "correggerla".

## Fase 2 — Le regole nel loro vero significato ✅

Commit `a099474`.

L'azione `crea_riconcilia_movimento` ora fa ciò che il nome dice.

- **`ScheduleRule.bankAccountId`** — il conto della regola è quello **bancario**
  su cui creare il movimento, non una voce del piano dei conti. Il vecchio
  campo `contoId` resta deprecato finché i dati non sono migrati.
- **`applicaRegolaCreaMovimento`** in `src/lib/schedule-rules/engine.ts`,
  agganciata a `POST /api/scadenzario`: quando una scadenza corrisponde ai
  criteri, genera il movimento sul conto indicato e lo riconcilia. Serve per
  ciò che non arriva da un estratto conto — contanti, POS, addebiti automatici.
- **L'imputazione contabile del movimento si eredita da
  `Supplier.defaultAccountId`**, mai dalla regola: è il movimento a portare il
  conto, la scadenza no.

**Il doppio conteggio non c'è**, verificato: il saldo scalare somma il
*residuo*, non l'importo. Alla riconciliazione il residuo va a zero, la
scadenza esce dal previsionale e resta solo il movimento nel consuntivo. L'aging
filtra anche esplicitamente le scadenze pagate.

---

## Fase 3 — La seconda data ✅

In Sibill la scadenza ha due date: `paymentDate` (scadenza contrattuale) e
`expectedPaymentDate` (data attesa di cassa), e quest'ultima viene
**riallineata alla data del movimento reale** al momento della riconciliazione.
Il cash flow lavora sulla seconda.

Verificato sui dati: sulle scadenze riconciliate `expectedPaymentDate` coincide
con la data del movimento in 50 casi su 50, mentre `paymentDate` conserva
l'originale e diverge fino a 29 giorni.

**Com'è stato implementato**:

- **`Schedule.dataAttesa`, nullable con semantica "null = coincide con
  `dataScadenza`"**. Non viene materializzata alla creazione: si valorizza solo
  quando diverge davvero. Il comportamento osservabile è identico
  all'inizializzazione "uguale a dataScadenza" di Sibill, ma senza migrazione
  NOT NULL sul database condiviso con la produzione (il codice vecchio avrebbe
  rotto gli insert nell'intervallo fra push dello schema e deploy) e senza il
  problema della data "congelata" quando si modifica `dataScadenza` di una
  scadenza mai divergita.
- **Riallineamento in `reconcileScheduleWithEntry`**, ma solo quando la
  riconciliazione **salda** la scadenza. Su un acconto parziale il residuo
  resta atteso alla data contrattuale: in Sibill il caso non esiste (il
  parziale genera una nuova scadenza che eredita la data originale), quindi
  riallineare anche sui parziali avrebbe spostato il residuo nel passato.
  L'annullamento della riconciliazione riporta `dataAttesa` a null.
- **Il previsionale legge `dataAttesa ?? dataScadenza`**: saldo scalare, aging
  e anche `summary` (i contatori "scadute" e "in scadenza 7 giorni" sarebbero
  rimasti incoerenti con l'aging). Nei `where` Prisma il fallback è un `OR`
  sulle due colonne; in `summary` sta dentro un `AND` per non sovrascrivere
  l'`OR` di base sulle ricorrenze.

**Perché conta**: rende onesto il previsionale. Se un fornitore paga sempre con
dieci giorni di ritardo, il grafico lo riflette invece di continuare a
promettere la data contrattuale. La stima preventiva è ora implementata: sulle
scadenze passive aperte, `dataAttesa` viene proiettata dalla **mediana dei
ritardi di pagamento del fornitore negli ultimi 12 mesi** (scadenza per
scadenza, `dataPagamento − dataScadenza`), con soglie di applicabilità —
campione minimo di 3 osservazioni, mediana di almeno 2 giorni in valore
assoluto — sotto le quali la stima non si applica e la data resta quella
contrattuale. Una nuova colonna `dataAttesaSource` distingue la provenienza
con gerarchia `riconciliazione` > `manuale` > `stima`: il dato reale del
movimento sovrascrive sempre, la mano dell'utente vince sulla stima, la stima
non tocca mai le altre due. Il ricalcolo scatta alla creazione della
scadenza, quando una scadenza dello stesso fornitore viene saldata
(riconciliazione, pagamento manuale o PATCH che imposta lo stato — ricalcola
tutte le aperte con source null o stima), alla modifica di `dataScadenza` o
del fornitore, e sull'annullamento di una riconciliazione (che ristima invece
di tornare secco a null e ricalcola anche le altre aperte del fornitore,
perché l'undo toglie un'osservazione dalla storia). Il campo è
visibile e modificabile nel dettaglio scadenza; svuotarlo torna alla stima
automatica. Dettagli su calcolo e casi limite in
`docs/superpowers/specs/2026-08-05-stima-data-attesa-design.md`.

## Fase 4 — La verifica come asse ortogonale ✅

In Sibill `verificationStatus` (VERIFIED / TO_VERIFY) è indipendente da
pagamento e riconciliazione: dice *"un umano ha guardato"*, non *"è pagato"*.
Esiste sia sul movimento sia sulla scadenza, e nei match automatici la
transazione passa a VERIFIED mentre la scadenza resta TO_VERIFY: i due assi
sono trattati separatamente.

**Com'è stato implementato**, riusando il pattern della prima nota
(`JournalEntry.verified`):

- **`Schedule.verificata`** (`Boolean @default(false)`): le scadenze nascono
  da verificare, comprese quelle generate da fatture, ricorrenze e regole —
  coerente con Sibill, dove i flow restano TO_VERIFY anche nei match
  automatici.
- **`PATCH /api/scadenzario/[id]/verifica`**: toggle, speculare a
  `PATCH /api/prima-nota/[id]/verify`, con isolamento sede e audit log.
- **Filtro `verificata`** su `GET /api/scadenzario` (true/false/assente).
- **UI**: select "Verifica" nei filtri dello scadenzario, colonna con toggle
  ✓/○ nella lista, badge cliccabile nel dettaglio scadenza.

---

## Altre cose aperte

- **`ScheduleRule.contoId`** deprecato: rimuovere dopo la migrazione dei dati.
- **Allocation**: Sibill può spezzare un singolo movimento su più categorie. Il
  gestionale non ha questo concetto.
- **Regole sui movimenti**: in Sibill una regola può avere più azioni insieme
  (imposta categoria, nascondi, segna verificato, crea e riconcilia) e c'è un
  suggeritore che propone quali regole scrivere guardando dove si accumula
  lavoro manuale (`/transactions/proposed-rules`, keyword mining sulle
  descrizioni non categorizzate). Entrambi assenti qui.
