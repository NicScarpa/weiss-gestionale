# Quick win — impatto ≥3, effort S

**Aggiornamento — Onda 1 (11-12 agosto 2026).** Undici di queste sedici voci
sono state chiuse per intero, e sono marcate ✅ sotto il proprio titolo. Tre
(`SCD-08`, `CLS-06`, `RET-07`) sono state implementate ma non chiudono la
lacuna originaria: la nota sotto il titolo dice cosa resta. `SCD-02` è stata
rimossa dall'onda in corsa e non è più un quick win (v. `07-backlog-prioritizzato.md`,
P2). `DOC-11` non è stata toccata. Stato pieno e priorità aggiornata in
`07-backlog-prioritizzato.md`; stato riga per riga in `02-matrice-5vie.md`.

Sedici interventi da **meno di mezza giornata ciascuno**, con i file del repo da
toccare. Nessuno richiede una migrazione di dati; tre richiedono una colonna
nuova, segnalata dove serve.

Ordinati per impatto. Ogni voce risponde a tre domande: **cosa manca**, **cosa
fanno loro**, **cosa tocchiamo**.

I ticket pronti per `gh issue create` stanno in `09-issues/`.

---

## 1 · `SCD-08` — Contatore «pagate senza movimento» · impatto **5**

🟠 **Parziale nell'Onda 1** (commits `56b2e3b..122e7cf`): il contatore e il
filtro descritti sotto sono fatti. **Non chiuso**: `POST
/api/scadenzario/[id]/pagamenti` continua a non generare alcun `JournalEntry`
— resta la parte che decide dove scrivere il movimento. Dettaglio in
`07-backlog-prioritizzato.md` (P0) e `02-matrice-5vie.md` riga `SCD-08`.

### Cosa manca

`POST /api/scadenzario/[id]/pagamenti` crea un `SchedulePayment`, aggiorna
`importoPagato` e ricalcola lo stato — e **non genera alcun `JournalEntry`**.

La conseguenza è silenziosa e grave: la scadenza esce dal previsionale (il saldo
scalare somma il residuo, che è andato a zero) e il denaro **non compare mai nel
consuntivo**, perché in prima nota non è successo niente. Il saldo di cassa non
scende. Nessuna delle due schermate sbaglia da sola; insieme raccontano due
storie diverse.

È il percorso legittimo per i pagamenti che non transitano da un estratto conto —
ma senza un controllo, distinguere «pagata in contanti e registrata altrove» da
«qualcuno ha spuntato pagata per sbaglio» è impossibile.

### Cosa fa Cash King

Il riquadro **«Saldate fuori sistema»** in cima allo scadenzario, con contatore
cliccabile e questo testo:

> *Fatture marcate come pagate ma senza alcun movimento collegato. Non incidono
> sul cashflow: probabilmente saldate in cassa, con nota spese o con
> compensazione manuale.*

Il dettaglio che fa la differenza è l'ultima frase: **spiega perché può essere
legittimo** invece di presentarle come errori. Lo stesso insieme compare poi come
report con azione correttiva in blocco — avvertimento durante il lavoro
quotidiano, lista da bonificare quando ci si dedica.

### Cosa tocchiamo

- `src/app/api/scadenzario/summary/route.ts` — aggiungere due campi:
  `pagateSenzaMovimento` (conteggio) e `pagateSenzaMovimentoImporto`. La query è
  `stato: 'pagata'` (o `importoPagato > 0`) **e** `reconciliations: { none: {} }`.
- `src/types/schedule.ts` — estendere `ScheduleSummary`.
- `src/components/scadenzario/schedule-summary-cards.tsx` — quinta card, con il
  testo esplicativo. Cliccabile: applica il filtro alla lista.
- `src/app/(dashboard)/scadenzario/page.tsx` — accettare il filtro.

**Da non copiare da Cash King**: il loro «Correggi Tutte» tocca quindici documenti
in un clic **senza lasciare traccia** (`isEdited` resta `false` dopo la
correzione). Se aggiungiamo un'azione, va nell'audit log.

---

## 2 · `RIC-03` — Motivazioni accanto al punteggio di match · impatto 4

✅ **Chiuso nell'Onda 1** (commits `9164c83..7021583`).

### Cosa manca

`calculateScheduleMatchScore` restituisce un `number`. Il pannello di
riconciliazione lo rende come badge percentuale, e basta: l'utente vede «72%» e
deve fidarsi.

### Cosa fa Cash King

Accanto al punteggio, le frasi che lo giustificano:

```
              72
  Importo identico alla rata
  Rata #3 di "Telefonia e Internet"
  Unico match possibile
```

L'analisi lo definisce **«l'accorgimento più trasferibile dell'intero
prodotto»**, e il motivo è preciso: *«l'utente non deve fidarsi di un 72: legge
"importo identico, unico match possibile" e decide in un secondo.»* Non il
punteggio, che è banale — le frasi.

### Cosa tocchiamo

- `src/lib/reconciliation/schedule-matcher.ts` — cambiare la firma della funzione
  pura da `number` a `{ score: number; reasons: string[] }`. I contributi ci sono
  già tutti nel codice, basta nominarli mentre si sommano:

  | Ramo esistente | Frase |
  |---|---|
  | `diff < 0.01` | «Importo identico» |
  | `diff <= 1` | «Importo quasi identico» |
  | `importoEntry < residuo` | «Acconto parziale» |
  | `giorni === 0` | «Stessa data» |
  | `giorni <= 3` | «Entro tre giorni dalla scadenza» |
  | bonus numero documento | «Numero documento nella causale» |
  | similarità descrizione > 0.6 | «Controparte compatibile» |
  | un solo candidato sopra `MINIMUM` | «Unico match possibile» |

- `src/lib/reconciliation/__tests__/schedule-matcher.test.ts` — i test esistono e
  vanno estesi alle motivazioni: è una funzione pura, costa poco.
- `src/components/scadenzario/schedule-reconciliation-panel.tsx:186-210` — una
  fila di `<Badge variant="secondary">` sotto il punteggio.

L'ultima riga della tabella («unico match possibile») si calcola in
`findEntryCandidates`, non nella funzione pura: dipende dall'insieme.

---

## 3 · `CLS-16` — Tasso di categorizzazione come KPI con obiettivo · impatto 4

✅ **Chiuso nell'Onda 1** (commit `57108d7`). Due difetti minori non corretti
(percentuale non transazionale, errore silenzioso sulla query): v.
`07-backlog-prioritizzato.md`, «Trovati durante l'esecuzione».

### Cosa manca

Non sappiamo quanti movimenti sono senza conto, e nessuno ce lo dice.

### Cosa fa Agicap

In cima alla lista dei movimenti, una barra di progresso:

> **0%** — Transazioni bancarie categorizzate negli ultimi 15 giorni. Raggiungere
> fino al 95% con il creatore di regole di categorizzazione.

Accanto, il pulsante «Rivedere le regole suggerite» con pallino rosso.

Perché funziona, con le parole dell'analisi: *«trasforma la manutenzione dei
dati — attività noiosa e rimandabile — in un progresso misurabile con un
traguardo. È un accorgimento a costo quasi nullo e alto rendimento.»*

**Da non copiare da Trezy**: il loro contatore «249 da verificare» vale per tutti
i documenti indistintamente e quindi non ordina nulla — l'utente non sa da quale
cominciare. Il numero deve avere accanto la strada per abbassarlo.

### Cosa tocchiamo

- `src/app/api/prima-nota/route.ts` (o una rotta `/summary` dedicata) —
  conteggio dei `JournalEntry` con `accountId: null` sugli ultimi N giorni, sul
  totale.
- `src/components/prima-nota/movimenti/MovimentiClient.tsx` — barra `Progress`
  di shadcn sopra la tabella, con il pulsante che apre
  `CategorizationProposalsDialog` (**esiste già**).

L'obiettivo del 95% è una costante, non una configurazione.

---

## 4 · `SCD-02` — Mese corrente spezzato in scaduto e da saldare · impatto 4

⛔ **Rimossa dall'Onda 1 in corsa, non è un quick win.** Non è un
raggruppamento da sostituire: la lista è una tabella piatta con ordinamento
per colonna, e i due si contendono lo stesso spazio — va decisa come
funzionalità, non improvvisata qui. Riclassificata a P2 (effort M) in
`07-backlog-prioritizzato.md`. `SCD-04` (anzianità nel badge, chiusa
nell'Onda 1) copre buona parte del bisogno nel frattempo.

### Cosa manca

Le scadenze si raggruppano per mese. Ad agosto, «pagato in ritardo dal 3» e
«scade il 28» finiscono nello stesso secchio.

### Cosa fa Cash King

Due righe distinte: **«Agosto 2026 — Scaduto»** e **«Agosto 2026 — Da Saldare»**,
con `data-testid` che confermano lo schema (`month-overdue-pay-2026-08`,
`month-pay-2026-09`). E i mesi passati **non** vengono collassati in un unico
«scaduto»: aprile, maggio e luglio restano righe distinte, così l'anzianità resta
leggibile senza aprire un report separato.

### Cosa tocchiamo

- `src/app/(dashboard)/scadenzario/page.tsx` — la chiave di raggruppamento passa
  da `{anno-mese}` a `{anno-mese, scaduto: boolean}`, dove `scaduto` è
  `(dataAttesa ?? dataScadenza) < oggi`.

Nessuna modifica al backend: il dato c'è già.

---

## 5 · `SCD-04` — Anzianità del ritardo dentro il badge di stato · impatto 4

✅ **Chiuso nell'Onda 1** (commits `a44a69f..f15a48e`). Ha richiesto un giro di
correzione su un bug di fuso orario, verificato su quattro fusi.

### Cosa manca

`ScheduleStatusBadge` mostra «Scaduta». Quanto scaduta si scopre solo aprendo
`/scadenzario/aging`, che è un'altra pagina.

### Cosa fa Trezy

La cella STATO contiene **«Scaduto +117g»**, «Scaduto +6g», «Scaduto +1247g».

Perché funziona: *«il badge di stato porta con sé la gravità, e la lista diventa
scorribile per urgenza senza ordinarla. Il costo cognitivo è nullo.»*

### Cosa tocchiamo

- `src/components/scadenzario/schedule-status-badge.tsx` — prop opzionale
  `giorniRitardo?: number`, resa come suffisso `+117g` quando presente.
- Il chiamante nella lista scadenzario calcola i giorni da
  `dataAttesa ?? dataScadenza`.

Il caso limite di Trezy («+1247g») va tenuto presente ma non ci riguarda: il
nostro aging ha già la fascia `>120 gg` invece di un contenitore aperto.

---

## 6 · `KPI-02` — Giudizio sintetico in linguaggio naturale · impatto 4

✅ **Chiuso nell'Onda 1** (commits `f15a48e..23018d7`).

### Cosa manca

La dashboard mostra numeri e alert tecnici. Nessuna frase risponde alla domanda
che il titolare fa davvero.

### Cosa fa Cash King

Tre giudizi in linguaggio naturale, ciascuno da una soglia sulla curva proiettata:

| Indicatore | Valore |
|---|---|
| Stato Cash Flow | «Nessuna tensione prevista» |
| Linea di Credito | «Non necessaria» |
| Acid Test di Cassa | «12+ mesi — Stabile» |

*«Sono le due domande che un imprenditore fa davvero, e tradurre i numeri in
quelle due risposte è un accorgimento a costo quasi nullo.»*

**Da non copiare**: il loro giudizio resta «nessuna tensione» con 54.000 € di
fornitori scaduti, perché guarda solo alla proiezione del saldo e ignora
l'anzianità dei debiti. Il nostro deve tenerne conto.

### Cosa tocchiamo

- `src/components/dashboard/CashFlowForecast.tsx` — derivare la frase dai dati
  che l'endpoint **restituisce già**: `summary.minBalance`,
  `summary.minBalanceDate`, `settings.lowBalanceThreshold`, `alerts[]`. Più lo
  scaduto passivo da `/api/scadenzario/summary`.

Tre stati bastano: *nessuna tensione prevista* · *attenzione dal <data>* ·
*tensione prevista dal <data>*. Nessuna nuova query.

---

## 7 · `CLS-09` — Anteprima dell'impatto prima di applicare una regola · impatto 4

✅ **Chiuso nell'Onda 1** (commit `b229e48`, insieme a `CLS-06`).

### Cosa manca

`POST /api/categorization-rules/test` esiste, ma il form di creazione della
regola (`RegolaFormDialog.tsx`) non mostra quanti movimenti la regola
catturerebbe **prima** di salvarla.

### Cosa fa Agicap

Per ogni suggerimento: **«88 transazioni corrispondenti»** e l'anteprima delle
transazioni che verrebbero colpite, **col pattern evidenziato in giallo dentro il
testo della causale**.

*«Rimuove la paura di applicare una regola sbagliata su centinaia di
movimenti.»*

### Cosa tocchiamo

- `src/components/prima-nota/regole/RegolaFormDialog.tsx` — chiamare
  `/api/categorization-rules/test` in `debounce` sulle keyword, e mostrare
  conteggio + prime 5 righe.
- L'evidenziazione: `<mark>` sulla porzione di descrizione che corrisponde alla
  keyword. Non serve nulla di sofisticato — la keyword è letterale.

---

## 8 · `RPT-04` — Separatore decimale italiano nell'export scadenzario · impatto 3

✅ **Chiuso nell'Onda 1** (commits `770aff2..46590fb`), insieme a `RPT-10`
(riga dei totali, non in questo elenco perché originariamente P6).

### Cosa manca

`src/app/api/scadenzario/export/route.ts` scrive gli importi con `.toFixed(2)`,
cioè col **punto**, e usa `;` come separatore di campo. Su Excel con impostazioni
italiane quegli importi arrivano come **testo** e non si possono sommare — cioè
esattamente la seccatura che un export dovrebbe evitare.

L'export della prima nota **è già corretto**: usa
`toLocaleString('it-IT', { minimumFractionDigits: 2 })`. È un'incoerenza interna,
non una lacuna di progetto.

### Cosa fa (male) Cash King

Stesso difetto, aggravato: il loro CSV col punto decimale **ignora
l'impostazione `decimalNotation: comma` che il prodotto stesso offre**. Il BOM
UTF-8 in testa invece è corretto e ce l'abbiamo già.

### Cosa tocchiamo

- `src/app/api/scadenzario/export/route.ts:68-71` — sostituire i tre `.toFixed(2)`
  con la stessa `formatNumber` di `prima-nota/export/route.ts:301-308`.

Meglio ancora: spostare quella funzione in `src/lib/formatters.ts` come
`formatCurrencyCsv` e usarla da entrambe, così il terzo export che qualcuno
scriverà nascerà giusto.

Vale la pena farlo insieme a `RPT-10` (riga dei totali nell'export), che è nello
stesso file e nello stesso spirito.

---

## 9 · `RIC-04` — Fattori del punteggio dichiarati prima dell'esecuzione · impatto 3

✅ **Chiuso nell'Onda 1** (commits `7021583..a44a69f`).

### Cosa manca

`SCHEDULE_MATCH_WEIGHTS` (importo 55%, data 25%, descrizione 20%) e
`SCHEDULE_MATCH_THRESHOLDS` (`SUGGESTED = 0.75`, `MINIMUM = 0.45`) sono **cablate
nel codice e mai mostrate**. L'utente non sa perché sotto una certa soglia i
candidati spariscono.

### Cosa fa Cash King

Prima di lanciare l'analisi mostra la tabella delle sei regole con sigla e
descrizione, e dichiara le soglie. *«Mostrare l'elenco delle regole prima di
eseguire trasforma "il software ha deciso" in "il software ha applicato la regola
R4", che è contestabile e quindi credibile.»*

Nel loro caso questo ha permesso anche di scoprire un'incoerenza: `minScore: 50`
rende la fascia documentata «bassa 0-49» **strutturalmente irraggiungibile**.
Dichiarare le soglie è ciò che rende trovabili errori del genere.

### Cosa tocchiamo

- `src/components/scadenzario/schedule-reconciliation-panel.tsx` — un
  `<Collapsible>` «Come funziona il punteggio» sopra la lista dei candidati, con
  i tre pesi e le due soglie lette dalle costanti, non riscritte a mano.

Costa un componente e rende auto-documentante una scelta che oggi vive solo in un
commento sorgente.

---

## 10 · `KPI-03` — Banda «zona negativa» sul grafico · impatto 3

✅ **Chiuso nell'Onda 1** (commits `b1056d9..8dcdd52`). La soglia mostrata
resta duplicata fra due schermate (difetto adiacente, non di questo task): v.
`02-matrice-5vie.md` riga `KPI-03`.

### Cosa manca

`CashFlowChart` ha già una `ReferenceLine` orizzontale sulla soglia minima e una
verticale su «Oggi». Manca l'**area**: sotto lo zero non c'è nulla che marchi
visivamente il pericolo.

### Cosa fa Cash King

Una banda **«Zona Negativa»** sul Radar di Liquidità. *«Disegna il rischio invece
di descriverlo: si vede a colpo d'occhio se la curva ci entra.»*

### Cosa tocchiamo

- `src/components/cashflow/CashFlowChart.tsx:79-91` — aggiungere una
  `<ReferenceArea y1={min} y2={0} />` di Recharts con colore di pericolo
  attenuato, sotto le `ReferenceLine` esistenti.

Una riga di JSX. Il componente importa già `ReferenceLine` dallo stesso pacchetto.

---

## 11 · `SCD-14` — Ritardo effettivo confrontato con i termini pattuiti · impatto 3

✅ **Chiuso nell'Onda 1** (commits `aafa40c` + `7d7687b`).

### Cosa manca

`Supplier.paymentTermsDays` esiste. `stima-data-attesa.ts` calcola già la
**mediana dei ritardi del fornitore** per proiettare la data attesa. I due numeri
non si incontrano mai, e nessuno dei due si vede.

### Cosa fa Cash King

Il report DSO/DPO affianca per ogni soggetto: termini pattuiti · giorni effettivi
· **differenza** · giudizio (**Migliore** se paga prima, **Peggiore** se dopo,
**In linea** entro ±2 giorni).

Il caso che mostra perché conta: un cliente con termini «Bonifico anticipato −7
giorni» e DSO effettivo di 4 giorni sembrerebbe ottimo in assoluto; misurato
contro l'impegno, è in ritardo di undici. *«È esattamente il ribaltamento di
giudizio che un DSO nudo non produce mai.»*

### Cosa tocchiamo

- `src/lib/scadenzario/stima-data-attesa.ts` — esporre la mediana già calcolata
  (oggi resta interna alla stima).
- La scheda fornitore in `src/app/(dashboard)/anagrafiche/fornitori/` — tre celle:
  pattuito, effettivo, differenza con badge.

Nessun calcolo nuovo: si mostra ciò che già si calcola.

---

## 12 · `PRV-15` — Selettore di periodo per ancora + durata · impatto 3

✅ **Chiuso nell'Onda 1** (commit `bfb715d`).

### Cosa manca

Il saldo scalare accetta un `range` numerico e parte sempre da oggi.

### Cosa fa Cash King

Due gruppi di pulsanti invece di due date:

- **PARTE DA**: Oggi · −15 giorni · −30 giorni · −60 giorni
- **DURATA FINESTRA**: 7 · 14 · 30 · 60 · 90 giorni

più il preset **«Storico 30gg + Prev. 90gg»**, asimmetrico di proposito: poco
passato per il contesto, molto futuro per la decisione.

*«Scegliere "da dove parto" e "quanto guardo" invece di due date assolute è più
vicino al modo in cui si ragiona in tesoreria, e rende la vista riutilizzabile
senza reimpostare nulla il giorno dopo.»*

### Cosa tocchiamo

- `src/components/scadenzario/saldo-scalare-panel.tsx` — due `ToggleGroup` di
  shadcn.
- `src/app/api/scadenzario/saldo-scalare/route.ts` — accettare `from` oltre a
  `range`. La rotta calcola già da `today`; basta parametrizzare l'ancora.

---

## 13 · `RET-07` — Numero di distinta sul versamento contanti · impatto 3

🟠 **Implementato nell'Onda 1** (commit `9c02f20`): il campo si inserisce, è
mostrato in lista, il bonus di riconciliazione scatta anche con punteggiatura
diversa (fix successivo `295abee`). **Non chiude del tutto**: sullo scenario
ambiguo misurato il bonus porta il punteggio a 0,86 contro una soglia di
abbinamento automatico di 0,90 — aiuta a decidere, non decide da solo.
Dettaglio in `07-backlog-prioritizzato.md` (P0).

### Cosa manca

Il versamento in banca è un trasferimento fra registri legato da `transferId`.
Non porta il riferimento della distinta, quindi abbinarlo alla riga
dell'estratto conto è a occhio.

### Cosa fa Cash King

Il campo `reference` sul versamento è **«il numero della distinta di versamento
bancaria»**, ed è *«ciò che rende verificabile l'abbinamento col movimento
bancario»*.

### Cosa tocchiamo

- `JournalEntry.documentRef` **esiste già** e non è usato sui trasferimenti:
  basta valorizzarlo con il numero di distinta.
- `src/components/prima-nota/movimenti/MovimentoFormDialog.tsx` — campo
  «Riferimento distinta» quando `entryType` è un trasferimento verso BANK.
- Mostrarlo nella riga della lista.

Nessuna colonna nuova.

---

## 14 · `DOC-11` — Controllo di plausibilità sul documento in ingresso · impatto 3

⬜ **Non incluso nell'Onda 1.** Il piano lo prevedeva; è rimasto fuori
dall'esecuzione (v. `07-backlog-prioritizzato.md`, P0). Resta un vero quick
win, semplicemente non fatto.

### Cosa manca

L'import fattura deduplica su `sdiId` e non controlla nient'altro.

### Cosa fa (male) Trezy

Accetta senza obiezioni una fattura **intestata a un soggetto terzo** — che poi
concorre ai totali e compare come cliente a sé nell'anagrafica — e una data
documento a **quattro mesi nel futuro**, che manda in tilt la colonna «ultima
attività» («tra 5 mesi»).

*«Su un'area il cui KPI principale è un'esposizione debitoria, ammettere
silenziosamente documenti altrui è un difetto di igiene del dato, non un
dettaglio.»* Il controllo sarebbe banale avendo la partita IVA.

### Cosa tocchiamo

- `src/lib/sdi/parser.ts` o `src/app/api/invoices/route.ts` — due controlli non
  bloccanti, che marcano il documento invece di rifiutarlo:
  1. **destinatario** — la P.IVA del cessionario nell'XML corrisponde a quella di
     WEISS? Altrimenti avviso «destinatario non riconosciuto».
  2. **data** — `invoiceDate` è nel futuro o più vecchia di N anni? Avviso.
- `src/components/invoices/InvoiceList.tsx` — badge di avviso sulla riga.

Non bloccare l'import è deliberato: un falso positivo che impedisce di caricare
una fattura costa più dell'avviso che si ignora.

---

## 15 · `CLS-06` — Anteprima delle righe colpite dalla proposta di regola · impatto 3

🟠 **Implementato nell'Onda 1** (commit `b229e48`, insieme a `CLS-09`):
l'anteprima descritta sotto è fatta. **Non chiude un difetto più profondo**,
emerso durante l'esecuzione: il suggeritore raggruppa per
`counterpartName?.trim() || description` (`proposals/route.ts:35`), mentre il
motore che applica le regole aggancia solo su `entry.description`
(`recategorize/route.ts:82`). Le regole nate da una proposta funzionano
spesso una volta sola e poi non intercettano più nulla. Dettaglio in
`07-backlog-prioritizzato.md` (P0).

### Cosa manca

`CategorizationProposalsDialog` mostra già la keyword e **«N risultati»** — il
conteggio c'è. Manca l'elenco delle righe.

### Cosa fa Agicap

Sotto ogni suggerimento, **l'anteprima delle transazioni** che verrebbero colpite,
col pattern evidenziato in giallo dentro la causale.

### Cosa tocchiamo

- `src/app/api/categorization-rules/proposals/route.ts` — la GET restituisce già
  `matchingEntryIds`; aggiungere `sampleDescriptions` (le prime 3 descrizioni del
  gruppo), che costa zero perché i movimenti sono già in memoria nella funzione.
- `src/components/prima-nota/regole/CategorizationProposalsDialog.tsx:196` — le
  tre righe sotto il conteggio, con `<mark>` sulla keyword.

È la stessa idea di `CLS-09`, applicata al suggeritore invece che al costruttore:
conviene farle nella stessa sessione.

---

## 16 · `PLT-07` — Stati vuoti che insegnano · impatto 3

✅ **Chiuso nell'Onda 1** (commits `1e5fd5d` + `619d2d7`).

### Cosa manca

`CashFlowSourcePanel` spiega come nasce la previsione, ed è l'unico. Gli altri
stati vuoti constatano che non c'è niente.

### Cosa fanno loro

**Trezy**, nello stato vuoto delle regole di classificazione, insegna la regola
semantica più difficile del sistema con un esempio concreto:

> *Trascina le regole per cambiare la priorità. Le regole in alto vengono
> applicate per prime. Esempio: per «Stipendio Matthieu» e «Stipendio Jean», se
> la regola «Matthieu» è sopra la regola «Stipendio», «Stipendio Matthieu»
> corrisponderà prima a «Matthieu».*

Il momento è quello giusto: appare quando la persona non ha ancora nulla da
perdere e sta per prendere la decisione che condizionerà tutte le successive, e
sparisce quando le regole esistono.

**Cash King**, nello stato di attesa della riconciliazione, spiega il motore con
la tabella delle regole invece di mettere un'illustrazione: *«occupa con una
spiegazione lo spazio in cui l'utente ha una domanda»*.

**Cash King**, nei modelli di import: *«Salva un modello durante l'importazione
per vederlo qui»* — dice **dove** si crea la cosa che manca, non che manca.

### Cosa tocchiamo

Tre stati vuoti, tre frasi:

| File | Frase da scrivere |
|---|---|
| `src/components/prima-nota/regole/RulesTable.tsx` | L'ordine conta e perché: la regola più specifica va sopra la più generica, con un esempio nostro (es. «Enel Energia» sopra «Enel») |
| `src/components/scadenzario/rule-table.tsx` | Stessa cosa per le regole scadenzario, dove `ordine` governa già «la prima che corrisponde vince» |
| `src/components/scadenzario/recurrence-table.tsx` | Dove si crea una ricorrenza e cosa genera |

---

## Riepilogo operativo

Stato dopo l'Onda 1: ✅ chiuso · 🟠 implementato ma non chiude la lacuna · ⛔
rimosso dall'onda · ⬜ non toccato.

| # | ID | File principale | Nuova colonna? | Stato |
|---|---|---|---|---|
| 1 | `SCD-08` | `src/app/api/scadenzario/summary/route.ts` | no | 🟠 |
| 2 | `RIC-03` | `src/lib/reconciliation/schedule-matcher.ts` | no | ✅ |
| 3 | `CLS-16` | `src/components/prima-nota/movimenti/MovimentiClient.tsx` | no | ✅ |
| 4 | `SCD-02` | `src/app/(dashboard)/scadenzario/page.tsx` | no | ⛔ |
| 5 | `SCD-04` | `src/components/scadenzario/schedule-status-badge.tsx` | no | ✅ |
| 6 | `KPI-02` | `src/components/dashboard/CashFlowForecast.tsx` | no | ✅ |
| 7 | `CLS-09` | `src/components/prima-nota/regole/RegolaFormDialog.tsx` | no | ✅ |
| 8 | `RPT-04` | `src/app/api/scadenzario/export/route.ts` | no | ✅ |
| 9 | `RIC-04` | `src/components/scadenzario/schedule-reconciliation-panel.tsx` | no | ✅ |
| 10 | `KPI-03` | `src/components/cashflow/CashFlowChart.tsx` | no | ✅ |
| 11 | `SCD-14` | `src/lib/scadenzario/stima-data-attesa.ts` | no | ✅ |
| 12 | `PRV-15` | `src/components/scadenzario/saldo-scalare-panel.tsx` | no | ✅ |
| 13 | `RET-07` | `src/components/prima-nota/movimenti/MovimentoFormDialog.tsx` | no | 🟠 |
| 14 | `DOC-11` | `src/lib/sdi/parser.ts` | no | ⬜ |
| 15 | `CLS-06` | `src/app/api/categorization-rules/proposals/route.ts` | no | 🟠 |
| 16 | `PLT-07` | tre `*-table.tsx` | no | ✅ |

**Nessuno dei sedici richiede una migrazione né una colonna nuova.** È il motivo
per cui sono quick win: il dato c'è già, manca il modo di leggerlo.

Tre coppie conviene farle insieme perché toccano lo stesso file o la stessa idea:
`RIC-03` + `RIC-04` (punteggio), `CLS-06` + `CLS-09` (anteprima), `RPT-04` +
`RPT-10` (export).
