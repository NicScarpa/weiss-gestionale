# A3 — Integrità del dato e coerenza contabile

**Agente:** A3 · **Data:** 2026-08-06 · **Branch:** `scadenzario/stima-data-attesa` (HEAD `68be147`)
**Scope:** schema Prisma, servizi contabili, scadenzario, riconciliazione, budget, route API contabili.
**Metodo:** sola lettura del codice; nessuna query al DB di produzione. Dove il comportamento dipende
dallo stato reale del DB lo dichiaro esplicitamente.

---

## Tabella riassuntiva

| ID | Sev | Confidenza | Titolo |
|----|-----|-----------|--------|
| A3-DATA-001 | P0 | Certa | Pagamento eseguito registrato col segno invertito: il saldo banca SALE |
| A3-DATA-002 | P0 | Certa | L'admin modifica una chiusura VALIDATA ma le scritture di prima nota restano quelle vecchie |
| A3-DATA-003 | P0 | Certa | `npm run db:reset` = wipe della produzione; nessuna storia migrazioni, solo `db push` |
| A3-DATA-004 | P1 | Certa | La riconciliazione può imputare più del valore del movimento (over-allocation) |
| A3-DATA-005 | P1 | Certa | Riconciliazione: read-modify-write fuori transazione + nessun vincolo unique → duplicati |
| A3-DATA-006 | P1 | Certa | L'annullo riconciliazione non ripristina la fattura PAID; invariante `dataAttesaSource` violata |
| A3-DATA-007 | P1 | Certa | Pagamento manuale scadenza: 4 scritture separate senza transazione, sovrapagamento libero |
| A3-DATA-008 | P1 | Certa | Soft delete bypassato da `findUnique`/`update`; gli unique includono i cancellati (giorno chiusura bloccato per sempre) |
| A3-DATA-009 | P1 | Certa | Si può cancellare un movimento riconciliato con una scadenza o matchato in banca |
| A3-DATA-010 | P1 | Certa | Import fatture: dedup check-then-act senza vincolo DB; se le scadenze falliscono non si può ritentare |
| A3-DATA-011 | P1 | Certa | Generazione ricorrenze non idempotente: doppio click = scadenze duplicate |
| A3-DATA-012 | P1 | Certa | Saldi prima nota: saldo iniziale dell'anno corrente + movimenti di TUTTI gli anni, futuri inclusi |
| A3-DATA-013 | P1 | Probabile | Doppia approvazione concorrente della chiusura duplica le scritture |
| A3-DATA-014 | P1 | Certa | PATCH scadenza: `importoTotale` riducibile sotto il pagato, `stato` e `dataPagamento` scrivibili senza coerenza |
| A3-DATA-015 | P1 | Certa | PATCH pagamenti: mass assignment senza validazione — importo modificabile dopo l'esecuzione |
| A3-DATA-016 | P1 | Certa | Budget: gli actual ignorano la prima nota; il totale ricavi è assegnato a OGNI categoria REVENUE |
| A3-DATA-017 | P1 | Certa/Probabile | `/api/cashflow/summary`: legge una tabella mai scritta, cast `::uuid` su cuid, trend matematicamente errato |
| A3-DATA-018 | P1 | Certa | Import estratto conto: il dedup scarta transazioni legittime identiche; `bankReference` sintetico collide |
| A3-DATA-019 | P2 | Da verificare | Contraddizione schema/codice: `deleteMany` delle stazioni con `CashCount` in `onDelete: Restrict` → o la PUT fallisce o il DB è in drift |
| A3-DATA-020 | P2 | Certa | Filtro `hidden` invertito in GET prima-nota; i saldi ignorano `hiddenAt` |
| A3-DATA-021 | P2 | Certa | Denaro come float JS in tutto il dominio, con tolleranze ±0,01 per compensare |
| A3-DATA-022 | P2 | Certa | Storico saldi parte da zero (ignora `InitialBalance`); aggregazioni fatte in JS caricando tutte le righe |
| A3-DATA-023 | P2 | Certa | Stati contabili come stringhe libere: 7 enum Prisma definiti e mai usati; due convenzioni di annullamento scadenza |
| A3-DATA-024 | P2 | Certa | Vincoli e indici mancanti sui modelli che muovono denaro |
| A3-DATA-025 | P2 | Certa | `calcolaProssimaGenerazione` triplicata, due copie senza clamp di fine mese (31/1 → 3/3) |
| A3-DATA-026 | P2 | Certa | La nota di credito importata non riduce le scadenze della fattura originaria |
| A3-DATA-027 | P3 | Certa | `runningBalance` mai scritto ma esportato; colonna `totale_entrare` (typo); `dataAttesaSource='manuale'` promesso e non scrivibile |

**Conteggio:** 3×P0 · 15×P1 · 8×P2 · 1×P3.

---

## Findings

### [A3-DATA-001] Pagamento eseguito registrato col segno invertito: il saldo banca SALE
- **Severità:** P0
- **Confidenza:** Certa
- **File:** src/app/api/pagamenti/[id]/esegui/route.ts:46-60
- **Evidenza:**
  ```ts
  // POST /api/pagamenti/[id]/esegui — pagamento in uscita (BONIFICO/F24)
  const journalEntry = await prisma.journalEntry.create({
    data: {
      registerType: 'BANK',
      description: `Pagamento: ${payment.beneficiarioNome}...`,
      debitAmount: Number(payment.importo),   // ← DARE = entrata
      creditAmount: undefined,
  ```
  La convenzione del modulo è l'opposto: `prima-nota-utils.ts:29-36` (BANK + USCITA → CREDIT),
  `schedule-rules/engine.ts:312-313` (`creditAmount: isIncasso ? null : residuo`),
  `saldi/route.ts:91` (`closing = opening + debits - credits`).
- **Perché è un problema:** ogni bonifico/F24 "eseguito" AUMENTA il saldo banca del suo importo
  invece di ridurlo. L'errore è doppio (importo che manca in uscita + importo aggiunto in entrata):
  un pagamento da 1.000 € falsa il saldo di 2.000 €. Il movimento nasce anche `verified: true`,
  quindi sembra controllato da un umano.
- **Come verificarlo:** creare un pagamento in dev, chiamare `POST /api/pagamenti/{id}/esegui`,
  leggere `GET /api/prima-nota/saldi`: il saldo BANK sale dell'importo. In produzione: confrontare i
  movimenti con `payment_id` non nullo e `debit_amount` valorizzato.
- **Correzione proposta:** scrivere `creditAmount` per i pagamenti in uscita; migrare i movimenti
  esistenti con `paymentId` invertendo la colonna; avvolgere create+update in `$transaction`.
- **Effort:** S (fix) + M (bonifica dati)

### [A3-DATA-002] L'admin modifica una chiusura VALIDATA ma la prima nota resta quella vecchia
- **Severità:** P0
- **Confidenza:** Certa
- **File:** src/app/api/chiusure/[id]/route.ts:383-479
- **Evidenza:**
  ```ts
  // Solo DRAFT può essere modificata (admin può modificare qualsiasi stato)
  if (existingClosure.status !== 'DRAFT' && session.user.role !== 'admin') { ... }
  // ...la transazione aggiorna metadati, stations, expenses — MAI le journalEntries
  ```
  Le scritture vengono generate solo alla validazione (`closure-service.ts:135-171`). La UI ne è
  consapevole: `ModificaChiusuraClient.tsx:69-77` mostra "le modifiche potrebbero influire sulle
  scritture contabili generate" — e si ferma all'avviso.
- **Perché è un problema:** l'admin corregge 500 € di contanti su una chiusura validata; incasso,
  versamento e uscite in prima nota restano quelli vecchi. Chiusura, prima nota, saldi e budget
  raccontano numeri diversi per lo stesso giorno, in modo permanente e senza traccia.
- **Come verificarlo:** validare una chiusura in dev, modificare `cashAmount` via PUT da admin,
  confrontare `GET /api/prima-nota?dateFrom=...` con la chiusura.
- **Correzione proposta:** nella PUT su chiusura VALIDATED, nella stessa transazione: soft-delete
  delle scritture esistenti (`deleteJournalEntriesForClosure`) e rigenerazione
  (`generateJournalEntriesFromClosure`); oppure vietare la modifica e imporre
  rifiuto → correzione → rivalidazione.
- **Effort:** M

### [A3-DATA-003] `npm run db:reset` = wipe della produzione; nessuna migrazione, solo `db push`
- **Severità:** P0
- **Confidenza:** Certa
- **File:** package.json:20-22; prisma/migrations/ (contiene solo `enable_rls_all_tables.sql`)
- **Evidenza:**
  ```json
  "db:push": "prisma db push",
  "db:reset": "prisma db push --force-reset && tsx prisma/seed.ts",
  ```
  `.env` del progetto punta al DB di produzione (regola nota del repo). Non esiste una directory di
  migrazioni versionate; esiste `prisma/schema.prisma.bak`, segno di gestione manuale.
- **Perché è un problema:** (a) un solo comando lanciato per abitudine distrugge il database di
  produzione e lo risemina; (b) senza storia migrazioni non c'è modo di sapere quale versione dello
  schema è applicata in produzione: `db push` non registra nulla, non è reversibile, e su modifiche
  di tipo/vincolo può **droppare colonne e dati** senza preavviso esplicito nei log di deploy;
  (c) il drift reale è già sospettato (vedi A3-DATA-019) e non è diagnosticabile dal repo.
- **Come verificarlo:** `ls prisma/migrations` (nessuna migration); leggere gli script npm. Per il
  drift: `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma`
  (comando di sola lettura) eseguito da chi ha accesso.
- **Correzione proposta:** rimuovere/rinominare `db:reset` (o proteggerlo con guard su
  `NODE_ENV`); adottare `prisma migrate` con baseline dallo stato attuale di produzione; eseguire
  subito un `migrate diff` per fotografare il drift.
- **Effort:** M

### [A3-DATA-004] La riconciliazione può imputare più del valore del movimento
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/lib/services/schedule-reconciliation-service.ts:100-125; src/app/api/scadenzario/[id]/riconciliazioni/route.ts:17
- **Evidenza:**
  ```ts
  const quota = amount ?? Math.min(residuo, disponibile)
  if (quota <= 0) { ... }
  if (quota > residuo + 0.01) { ... }   // ← unico tetto: il residuo della SCADENZA
  ```
  `amount` arriva dal client (`z.number().positive().optional()`). Non c'è alcun confronto con
  `disponibile` (l'importo del movimento) né con la somma delle quote già riconciliate su quello
  stesso `journalEntryId`.
- **Perché è un problema:** un bonifico da 100 € può "saldare" scadenze per 500 €: basta
  riconciliarlo più volte su scadenze diverse (o una volta con `amount` maggiorato). Le scadenze
  risultano pagate, escono dal previsionale, la fattura può passare a PAID — a fronte di denaro mai
  uscito. Il commento in schema ("Quota del movimento imputata... non coincide necessariamente con
  l'importo del movimento") descrive il caso legittimo dei match multipli, ma senza il vincolo di
  capienza il modello N:M non quadra mai per costruzione.
- **Come verificarlo:** in dev: creare un movimento da 100 €, due scadenze da 100 €, chiamare due
  volte `POST /api/scadenzario/{id}/riconciliazioni` con lo stesso `journalEntryId`: entrambe
  risultano pagate.
- **Correzione proposta:** nel servizio, calcolare la capienza residua del movimento
  (`disponibile − somma quote VERIFIED esistenti`) e rifiutare `quota` eccedente; fare il controllo
  dentro la transazione.
- **Effort:** M

### [A3-DATA-005] Riconciliazione: read-modify-write fuori transazione + nessun unique → duplicati
- **Severità:** P1
- **Confidenza:** Certa (struttura); Probabile (frequenza della race)
- **File:** src/lib/services/schedule-reconciliation-service.ts:67-169; prisma/schema.prisma:600-602
- **Evidenza:**
  ```ts
  const schedule = await prisma.schedule.findFirst({...})          // lettura FUORI tx
  const esistente = await prisma.scheduleReconciliation.findFirst({...}) // dedup FUORI tx
  ...
  const risultato = await prisma.$transaction(async (tx) => {
    ...
    const nuovoPagato = Number(schedule.importoPagato) + quota      // valore stantio
  ```
  In schema solo indici, nessun vincolo:
  ```prisma
  @@index([scheduleId, status])
  @@index([journalEntryId, status])
  ```
- **Perché è un problema:** doppio click su "Riconcilia" (o la RULE dell'engine concorrente con un
  match manuale) supera il check `esistente` in entrambe le richieste: due `SchedulePayment`, due
  `ScheduleReconciliation` per la stessa coppia, e `importoPagato` calcolato da un valore letto
  prima dell'altra scrittura — la scadenza risulta pagata due volte o con un totale sbagliato.
- **Come verificarlo:** due `POST /api/scadenzario/{id}/riconciliazioni` in parallelo (`curl &`):
  si ottengono due record VERIFIED per la stessa coppia.
- **Correzione proposta:** vincolo parziale unique su `(scheduleId, journalEntryId)` per
  `status='VERIFIED'`; dentro la transazione rileggere la scadenza (o usare
  `importoPagato: { increment: quota }`) e ripetere il check di chiusura.
- **Effort:** M

### [A3-DATA-006] L'annullo riconciliazione non ripristina la fattura PAID; invariante `dataAttesaSource` violata
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/lib/services/schedule-reconciliation-service.ts:154-166 e 270-288; prisma/schema.prisma:517-520
- **Evidenza:**
  ```ts
  // reconcile, a saldo: setta la data ma NON la source
  ...(saldata ? { dataAttesa: entry.date } : {}),
  // undo: azzera la data ma NON la source, e non tocca la fattura
  data: { importoPagato: ..., stato: nuovoStato, dataPagamento: null, dataAttesa: null }
  ```
  Lo schema dichiara: `dataAttesaSource ... 'riconciliazione' (riallineata alla data del movimento
  che ha saldato). Null se e solo se dataAttesa è null.`
- **Perché è un problema:** tre incoerenze concrete. (1) Se l'ultima rata era saldata la fattura è
  passata a `PAID` (righe 172-183, peraltro fuori transazione): l'undo riapre la rata ma la fattura
  resta PAID per sempre. (2) Il riallineamento scrive `dataAttesa` lasciando `dataAttesaSource`
  com'era (null o 'stima'): l'invariante documentata è falsa nei dati appena il modulo nuovo va in
  produzione, e il ricalcolo stime (`ricalcolaStimeFornitore`, che filtra su `source in (null,
  'stima')`) può sovrascrivere una data che in realtà veniva da una riconciliazione. (3) L'undo
  azzera `dataAttesa` anche quando la stima preventiva l'aveva valorizzata legittimamente.
- **Come verificarlo:** riconciliare a saldo l'unica rata di una fattura, poi
  `DELETE .../riconciliazioni/{id}`: `ElectronicInvoice.status` resta PAID. Ispezionare
  `data_attesa_source` dopo una riconciliazione a saldo: non vale 'riconciliazione'.
- **Correzione proposta:** in reconcile scrivere `dataAttesaSource: 'riconciliazione'` a saldo; in
  undo ricalcolare lo stato fattura (contando le rate aperte) e riapplicare la stima
  (`applicaStimaSuScadenza`) invece del null secco.
- **Effort:** M

### [A3-DATA-007] Pagamento manuale scadenza: 4 scritture separate senza transazione, sovrapagamento libero
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/app/api/scadenzario/[id]/pagamenti/route.ts:101-157
- **Evidenza:**
  ```ts
  const payment = await prisma.schedulePayment.create({...})       // 1
  const aggregatedPayments = await prisma.schedulePayment.aggregate({...}) // 2
  const updatedSchedule = await prisma.schedule.update({...})      // 3
  ... await prisma.electronicInvoice.update({ data: { status: 'PAID' } }) // 4
  ```
  Nessun `$transaction`; nessun confronto fra `importo` e il residuo.
- **Perché è un problema:** se il passo 3 fallisce resta un pagamento registrato con
  `importoPagato` non aggiornato: la lista pagamenti e il residuo della scadenza si contraddicono.
  In più si può registrare 10.000 € su una scadenza da 100 €: stato → `pagata`, residuo negativo
  che poi entra nei totali del saldo scalare col segno invertito. Il percorso gemello
  (riconciliazione) invece blocca il sovrapagamento: due regole diverse per la stessa operazione.
- **Come verificarlo:** `POST /api/scadenzario/{id}/pagamenti` con `importo` > residuo: accettato.
- **Correzione proposta:** avvolgere i 4 passi in `$transaction`; validare
  `importo ≤ residuo + 0.01` come nel servizio di riconciliazione (o gestire esplicitamente il
  sovrapagamento come caso di dominio).
- **Effort:** S

### [A3-DATA-008] Soft delete bypassato da `findUnique`/`update`; gli unique includono i cancellati
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/lib/prisma.ts:66-78; src/app/api/chiusure/route.ts:410-424; src/app/api/chiusure/[id]/submit/route.ts:25; src/app/api/pagamenti/[id]/esegui/route.ts:26
- **Evidenza:**
  ```ts
  // prisma.ts — l'estensione copre solo:
  findMany, findFirst, findFirstOrThrow, count, aggregate, groupBy, updateMany
  ```
  `findUnique`, `findUniqueOrThrow`, `update`, `delete`, `upsert` NON sono coperti. Grep: ~40 call
  site di `findUnique` su modelli in `SOFT_DELETE_MODELS` (chiusure, fatture, pagamenti, forecast,
  budget), fra cui submit/validate/esegui/record.
- **Perché è un problema:** due effetti opposti, entrambi contabili.
  (1) *I morti camminano:* una chiusura soft-deleted in stato SUBMITTED si può ancora validare
  (`validateClosure` usa `findUnique`, closure-service.ts:87) generando prima nota per una chiusura
  cancellata; un pagamento soft-deleted si può "eseguire"; una fattura cancellata si legge e
  registra. (2) *I morti bloccano i vivi:* `@@unique([venueId, date])` include i cancellati, e la
  POST chiusure usa `findUnique` sul vincolo (route.ts:410): cancellata per errore la chiusura del
  5/8, quel giorno risponde per sempre "Esiste già una chiusura per questa data" — blocco del
  lavoro quotidiano senza rimedio da UI. Stessa classe: `Budget @@unique([venueId, year])`,
  `BankTransaction @@unique([venueId, bankReference])`, `Schedule.invoiceDeadlineId`.
- **Come verificarlo:** in dev: `DELETE /api/chiusure/{id}` poi `POST /api/chiusure` stessa data →
  409. Oppure: soft-delete di una chiusura SUBMITTED e `POST /api/chiusure/{id}/validate` → passa.
- **Correzione proposta:** estendere l'hook a `findUnique/findUniqueOrThrow` (riscrivendole come
  `findFirst` quando la where lo consente) e aggiungere guardie esplicite `deletedAt: null` nelle
  route di mutazione; per gli unique, passare a indici parziali Postgres
  (`WHERE deleted_at IS NULL`) via SQL, dato che Prisma non li esprime nativamente.
- **Effort:** L

### [A3-DATA-009] Si può cancellare un movimento riconciliato con una scadenza o matchato in banca
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/app/api/prima-nota/[id]/route.ts:214-227
- **Evidenza:**
  ```ts
  // Non eliminabile se generato da chiusura
  if (existingEntry.closureId) { ... 400 }
  // nessun controllo su scheduleReconciliations, bankTransaction, paymentId
  await prisma.journalEntry.update({ where: { id }, data: { deletedAt: new Date() } })
  ```
- **Perché è un problema:** cancellato il movimento, la scadenza resta `pagata` con
  `importoPagato` pieno e una `ScheduleReconciliation` che punta a un movimento che i saldi non
  vedono più; una `BankTransaction` MATCHED resta agganciata a un movimento sparito. I moduli si
  contraddicono: lo scadenzario dice "pagato", la prima nota dice che quel denaro non è mai uscito.
- **Come verificarlo:** riconciliare scadenza+movimento, poi `DELETE /api/prima-nota/{id}` sul
  movimento: 200 OK; la scadenza resta pagata.
- **Correzione proposta:** in DELETE (e PUT) bloccare se esistono riconciliazioni VERIFIED, un
  `paymentId` o una `bankTransaction` collegata, indicando l'operazione di sgancio da fare prima.
- **Effort:** S

### [A3-DATA-010] Import fatture: dedup check-then-act senza vincolo DB; retry impossibile se le scadenze falliscono
- **Severità:** P1
- **Confidenza:** Certa (struttura); Probabile (occorrenza della race)
- **File:** src/app/api/invoices/route.ts:284-305 e 459-492; prisma/schema.prisma:1187-1230
- **Evidenza:**
  ```ts
  const existingInvoice = await prisma.electronicInvoice.findFirst({ where: { invoiceNumber, invoiceDate, OR: [supplierVat...] } })
  if (existingInvoice) { ... 409 }
  // ...
  const invoice = await prisma.electronicInvoice.create({...})  // nessun vincolo unique naturale in schema
  ...
  } catch (scheduleError) {
    // La fattura è già stata importata: un errore qui non deve annullarla
  ```
  In schema l'unico unique è `sdiId` (nullo negli import manuali). La generazione scadenze è fuori
  transazione e l'errore viene solo loggato.
- **Perché è un problema:** (a) due import paralleli dello stesso XML (doppio click, upload bulk)
  passano entrambi il check → fattura, rate e scadenze duplicate → debito raddoppiato nello
  scadenzario; (b) se `generateSchedulesFromInvoice` fallisce, la fattura resta senza scadenze e
  il re-import risponde 409 "Fattura già importata": non esiste alcun endpoint per rigenerare le
  scadenze → divergenza fattura/scadenzario permanente e silenziosa (solo log).
- **Come verificarlo:** due `POST /api/invoices` concorrenti con lo stesso XML; grep del log
  "Errore generazione scadenze da fattura" e confronto `electronic_invoices` ↔ `schedules`.
- **Correzione proposta:** indice unique (parziale su `deleted_at IS NULL`) su
  `(invoiceNumber, invoiceDate, supplierVat)` con P.IVA normalizzata; endpoint o job di recovery
  che rigenera le scadenze mancanti (la dedup su `invoiceDeadlineId` lo rende già idempotente).
- **Effort:** M

### [A3-DATA-011] Generazione ricorrenze non idempotente: doppio click = scadenze duplicate
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/app/api/scadenzario/ricorrenze/[id]/genera/route.ts:55-87; src/app/api/scadenzario/[id]/genera-prossima/route.ts:63-96
- **Evidenza:**
  ```ts
  const schedule = await prisma.schedule.create({...})            // 1
  ...
  await prisma.recurrence.update({ data: { prossimaGenerazione } }) // 2 — fuori tx
  ```
  Nessun unique su `(recurrenceId, dataScadenza)` né su `(ricorrenzaParentId, dataScadenza)`.
- **Perché è un problema:** due POST ravvicinate leggono la stessa `prossimaGenerazione` e creano
  due scadenze identiche per lo stesso periodo (l'affitto di settembre due volte: 2× importo nel
  saldo scalare). Se il passo 2 fallisce, la prossima invocazione rigenera lo stesso periodo.
- **Come verificarlo:** due `POST /api/scadenzario/ricorrenze/{id}/genera` in parallelo → due
  schedule con stessa `dataScadenza` e stesso `recurrenceId`.
- **Correzione proposta:** `$transaction` su create+update; vincolo unique parziale su
  `(recurrence_id, data_scadenza)`; idem per il percorso `ricorrenzaParentId`.
- **Effort:** S

### [A3-DATA-012] Saldi prima nota: saldo iniziale dell'anno corrente + movimenti di TUTTI gli anni, futuri inclusi
- **Severità:** P1
- **Confidenza:** Certa (logica; l'impatto dipende dai dati pluriennali)
- **File:** src/app/api/prima-nota/saldi/route.ts:42-101; src/lib/schedule-rules/engine.ts:305-320
- **Evidenza:**
  ```ts
  const currentYear = new Date().getFullYear()
  const initialBalance = await prisma.initialBalance.findUnique({ where: { venueId_year: { venueId, year: currentYear } } })
  ...
  const aggregation = await prisma.journalEntry.aggregate({
    where: { venueId, registerType },   // ← nessun filtro data: né piso dell'anno né tetto a oggi
  ```
- **Perché è un problema:** due difetti indipendenti. (1) *Cavallo d'anno:* il saldo somma
  l'`InitialBalance` del 2026 **più** tutti i movimenti dal primo giorno di vita del sistema: se il
  saldo iniziale 2026 incorpora l'attività 2025, i movimenti 2025 sono contati due volte; a gennaio
  2027, finché non esiste la riga 2027, il saldo perde il riporto. (2) *Futuri inclusi:* le regole
  dello scadenzario creano movimenti datati alla `dataScadenza` (engine.ts:308), cioè nel futuro; il
  "saldo attuale" li include già oggi. Il budget (`getLiquidity`) e lo storico usano formule ancora
  diverse (vedi A3-DATA-016/022): tre risposte diverse alla domanda "quanti soldi abbiamo".
- **Come verificarlo:** creare una scadenza futura che matcha una regola con conto bancario; il
  saldo BANK di oggi cambia immediatamente.
- **Correzione proposta:** definire la semantica (saldo a oggi = iniziale anno + movimenti
  dall'1/1 dell'anno a oggi) e applicarla con `date: { gte: firstOfYear, lte: today }`; documentare
  il riporto a nuovo anno come procedura (o calcolarlo).
- **Effort:** M

### [A3-DATA-013] Doppia approvazione concorrente della chiusura duplica le scritture
- **Severità:** P1
- **Confidenza:** Probabile
- **File:** src/lib/services/closure-service.ts:87-171
- **Evidenza:**
  ```ts
  const closure = await prisma.dailyClosure.findUnique({...})  // fuori tx
  if (closure.status !== 'SUBMITTED') { return ... }           // check fuori tx
  ...
  await prisma.$transaction(async (tx) => {
    const updated = await tx.dailyClosure.update({ where: { id: closureId }, ... }) // senza guardia su status
    const journalResult = await generateJournalEntriesFromClosure(...) // createMany, nessuna dedup
  ```
- **Perché è un problema:** due validazioni simultanee (due manager, o doppio click con rete
  lenta) vedono entrambe SUBMITTED e generano due set completi di scritture: incassi e versamenti
  del giorno raddoppiati in prima nota. `generateJournalEntriesFromClosure` non cancella né
  verifica scritture esistenti.
- **Come verificarlo:** due `POST /api/chiusure/{id}/validate` in parallelo su una chiusura
  SUBMITTED; contare le `journal_entries` con quel `closureId`.
- **Correzione proposta:** `updateMany({ where: { id, status: 'SUBMITTED' }, ... })` dentro la
  transazione e abort se `count === 0`; in generazione, guardia "nessuna scrittura viva per questo
  closureId".
- **Effort:** S

### [A3-DATA-014] PATCH scadenza: importo, stato e dataPagamento scrivibili senza coerenza
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/app/api/scadenzario/[id]/route.ts:10-30 e 138-146
- **Evidenza:**
  ```ts
  importoTotale: z.number().positive().optional(),
  stato: z.nativeEnum(ScheduleStatus).optional(),
  ...
  if (validatedData.dataPagamento && !validatedData.stato) {
    updateData.stato = ScheduleStatus.PAGATA      // pagata con 0 pagamenti registrati
  }
  ```
- **Perché è un problema:** si può (a) ridurre `importoTotale` sotto `importoPagato` → residuo
  negativo, stato non ricalcolato; (b) alzare il totale di una scadenza `pagata` → resta `pagata`
  con residuo positivo che sparisce da aging e scaduto (che filtrano `pagata`): debito reale
  invisibile; (c) settare `dataPagamento` o direttamente `stato='pagata'` senza alcun pagamento —
  bypassando pagamenti, riconciliazioni e l'aggiornamento dello stato fattura. Inoltre il PATCH di
  `dataScadenza` non ricalcola la stima (`dataAttesa` resta ancorata alla data vecchia:
  nessuna chiamata a `applicaStimaSuScadenza`).
- **Come verificarlo:** PATCH con `importoTotale` < pagato → 200; la scadenza mostra residuo
  negativo in `GET /api/scadenzario`.
- **Correzione proposta:** dopo ogni PATCH ricalcolare stato da `importoPagato` vs nuovo totale;
  rifiutare totale < pagato; togliere `stato` dal payload utente (o limitarlo ad 'annullata');
  riapplicare la stima quando cambia `dataScadenza`.
- **Effort:** M

### [A3-DATA-015] PATCH pagamenti: mass assignment senza validazione
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/app/api/pagamenti/[id]/route.ts:83-91
- **Evidenza:**
  ```ts
  const body = await request.json()
  const updated = await prisma.payment.update({
    where: { id: id },
    data: { ...body, updatedAt: new Date() },
  })
  ```
- **Perché è un problema:** unica route contabile senza schema Zod: il client può scrivere
  qualunque colonna — `importo` di un pagamento già DISPOSTO (il movimento collegato conserva
  l'importo vecchio → pagamenti e prima nota divergono), `stato: 'COMPLETATO'` saltando il flusso,
  `journalEntryId`, perfino `deletedAt`. Un typo nel client corrompe il record senza errori.
- **Come verificarlo:** `PATCH /api/pagamenti/{id}` con `{"importo": 1, "stato": "COMPLETATO"}` su
  un pagamento disposto → 200.
- **Correzione proposta:** schema Zod con whitelist dei campi; vietare modifica `importo` se
  esiste `journalEntryId` (o riallineare il movimento nella stessa transazione).
- **Effort:** S

### [A3-DATA-016] Budget: gli actual ignorano la prima nota; il totale ricavi va a OGNI categoria REVENUE
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/lib/budget/category-aggregator.ts:82-158, 210-228, 375-385; src/app/api/budget/confronto/route.ts:107-149
- **Evidenza:**
  ```ts
  // actual costi: SOLO DailyExpense delle chiusure validate
  const expenses = await prisma.dailyExpense.findMany({ where: { closure: {...} } })
  // ricavi: assegnazione, non somma, del TOTALE a ogni categoria REVENUE mappata
  if (cat.categoryType === 'REVENUE') { actualValues = totalRevenueValues }
  // liquidity: senza saldo iniziale
  return totalDebit - totalCredit
  ```
- **Perché è un problema:** (1) i costi pagati via banca — le fatture fornitori, cioè la parte
  maggiore dei costi di un bar — vivono in `JournalEntry`/`ElectronicInvoice` e non entrano MAI
  negli actual: il confronto budget/actual sottostima i costi strutturalmente, e l'intero lavoro di
  categorizzazione Sibill (`JournalEntry.budgetCategoryId`) non alimenta il budget. (2) Con più di
  una categoria REVENUE ognuna mostra il totale complessivo dei ricavi (assegnazione invece di
  ripartizione): somme di colonna gonfie. (3) `liquidity` non somma l'`InitialBalance`, quindi non
  quadra con `/api/prima-nota/saldi`.
- **Come verificarlo:** creare due categorie REVENUE mappate e aprire il budget: stessa cifra su
  entrambe. Registrare un costo via prima nota con categoria budget: gli actual non cambiano.
- **Correzione proposta:** alimentare gli actual da `JournalEntry` (groupBy su
  `budgetCategoryId`/conto, escludendo `hiddenAt`), tenendo le chiusure solo per i ricavi di cassa;
  ripartire i ricavi per conto mappato; riusare la stessa funzione di saldo della prima nota.
- **Effort:** L

### [A3-DATA-017] `/api/cashflow/summary`: tabella mai scritta, cast `::uuid` su cuid, trend errato
- **Severità:** P1
- **Confidenza:** Certa (formule e tabella mai scritta); Probabile (crash a runtime)
- **File:** src/app/api/cashflow/summary/route.ts:23-73
- **Evidenza:**
  ```ts
  prisma.registerBalance.findUnique({ where: { ...date: today } })  // today è una STRINGA 'YYYY-MM-DD'
  ...
  WHERE venue_id = ${venueId}::uuid          -- gli id sono cuid ('cm...'), non uuid
  ...
  const trend7gg = saldoAttuale - Number(oldBalance[0].balance)  // saldo puntuale − SOMMA di 7 saldi giornalieri
  ```
  Grep su tutto `src/`: nessuna scrittura su `registerBalance` — la tabella è sempre vuota.
- **Perché è un problema:** la card "saldo attuale" del cash flow legge una tabella che nessun
  codice popola (sempre 0); le query raw castano un cuid a `uuid` (errore Postgres, e la route non
  ha try/catch → 500); il trend sottrae a un saldo puntuale la SOMMA dei saldi di 7 giorni (unità
  disomogenee); `previsione30gg` usa la media per-movimento, non per-giorno, e `deltaPrevisione` è
  la stessa identica espressione. La pagina `cash-flow/page.tsx:40` consuma questo endpoint: i
  numeri mostrati sono spazzatura o la chiamata fallisce. (Coerente con i 4 errori strict di
  baseline su questo file.)
- **Come verificarlo:** `curl /api/cashflow/summary` in dev con un venue cuid: errore Postgres
  `invalid input syntax for type uuid` (o card a 0 se gli id fossero uuid).
- **Correzione proposta:** riusare `calculateBalancesFromEntries` della prima nota (senza
  `RegisterBalance`); rimuovere i cast `::uuid`; ridefinire trend e previsione su aggregati per
  giorno; decidere se `RegisterBalance` va popolata o eliminata dallo schema.
- **Effort:** M

### [A3-DATA-018] Import estratto conto: il dedup scarta transazioni legittime identiche
- **Severità:** P1
- **Confidenza:** Certa (logica); Probabile (frequenza)
- **File:** src/app/api/bank-transactions/import/route.ts:134-172
- **Evidenza:**
  ```ts
  const existing = await prisma.bankTransaction.findFirst({
    where: { venueId, transactionDate: row.transactionDate, amount: row.amount, description: row.description },
  })
  if (existing) { duplicatesSkipped++; continue }
  ...
  bankReference: row.reference || bankReference,  // sintetico: data_importo_descrizione(50 char)
  ```
- **Perché è un problema:** due addebiti reali identici nello stesso giorno (due commissioni da
  2,50 €, due SDD uguali, due POS accrediti identici) sono normali in un estratto conto: il secondo
  viene scartato in silenzio come "duplicato" → il saldo banca ricostruito non quadrerà mai con la
  banca, senza alcun segnale. In direzione opposta, quando `row.reference` manca il riferimento
  sintetico tronca la descrizione a 50 caratteri: due righe distinte possono collidere sul vincolo
  `@@unique([venueId, bankReference])` e far esplodere l'import a metà (il loop non è in
  transazione: batch parziale con `recordCount = 0`). Inoltre `BankTransaction` non ha alcun legame
  con `BankAccount`: con più conti correnti gli estratti si mescolano per sede.
- **Come verificarlo:** importare un CSV con due righe identiche → `duplicatesSkipped: 1`.
- **Correzione proposta:** deduplicare per batch/file (hash riga + progressivo occorrenza) o solo
  su `bankReference` reale; avvolgere il loop in transazione; aggiungere `bankAccountId` al
  modello.
- **Effort:** M

### [A3-DATA-019] Contraddizione schema/codice su CashCount: o la modifica chiusure fallisce o il DB è in drift
- **Severità:** P2 (P1 se confermato il drift)
- **Confidenza:** Da verificare (la contraddizione nel repo è Certa; quale dei due rami valga in produzione dipende dal DB)
- **File:** prisma/schema.prisma:294; src/app/api/chiusure/[id]/route.ts:402-404; src/lib/closure-calculations.ts:87-96
- **Evidenza:**
  ```prisma
  station CashStation @relation(fields: [stationId], references: [id], onDelete: Restrict)
  ```
  ```ts
  // PUT chiusure — commento e codice presumono il contrario:
  // 2. Se stations fornite: delete + recreate (cascade elimina CashCount)
  await tx.cashStation.deleteMany({ where: { closureId: id } })
  ```
  `buildClosurePayload` (closure-form-utils.ts:157-171) invia SEMPRE `stations` con `cashCount`
  nella PUT, e `buildStationCreateData` crea i conteggi nested già in bozza.
- **Perché è un problema:** con lo schema attuale, cancellare una `CashStation` che ha un
  `CashCount` viola il FK `RESTRICT`: ogni salvataggio di una chiusura esistente con conteggio
  contanti dovrebbe fallire con 500. Se invece in produzione la modifica funziona, significa che il
  FK reale è ancora `CASCADE`: il DB non riflette `schema.prisma` (drift da `db push` mai
  applicato) — la prova concreta del rischio descritto in A3-DATA-003, su una tabella di conteggio
  contanti.
- **Come verificarlo:** in dev con schema pushato: creare bozza con conteggio, salvare di nuovo →
  errore FK. In produzione (sola lettura):
  `SELECT confdeltype FROM pg_constraint WHERE conname LIKE '%cash_counts%station%'`.
- **Correzione proposta:** decidere l'intento (probabilmente: cancellare esplicitamente i
  `cashCount` prima del `deleteMany` delle stazioni, tenendo `Restrict`); eseguire il
  `migrate diff` per fotografare il drift complessivo.
- **Effort:** S (fix codice) + M (verifica drift)

### [A3-DATA-020] Filtro `hidden` invertito in GET prima-nota; i saldi ignorano `hiddenAt`
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/api/prima-nota/route.ts:129 e 204-206; src/app/api/prima-nota/saldi/route.ts:71-80
- **Evidenza:**
  ```ts
  const hidden = searchParams.get('hidden') !== 'true' // exclude hidden by default
  ...
  if (!hidden) { where.hiddenAt = null }
  ```
  Param assente → `hidden=true` → nessun filtro → i nascosti SI VEDONO. `?hidden=true` →
  `hidden=false` → `hiddenAt = null` → chiedendo di vederli li si nasconde. L'esatto contrario del
  commento. I saldi (`/saldi`, `/saldi/storico`, budget `getLiquidity`) non filtrano mai
  `hiddenAt`.
- **Perché è un problema:** la feature "nascondi movimento" (asse Sibill) non fa nulla di ciò che
  promette in lista, e comunque i movimenti nascosti continuano a pesare su tutti i saldi: se
  l'utente la usa per escludere un movimento anomalo, i totali non lo escludono. Numeri diversi tra
  lista (dipende dal toggle, invertito) e saldi (sempre inclusi).
- **Come verificarlo:** nascondere un movimento (`PATCH /api/prima-nota/{id}/hide`), ricaricare la
  lista senza parametri: è ancora visibile.
- **Correzione proposta:** correggere la condizione (`if (hidden) where.hiddenAt = null` con
  semantica esplicita); decidere e documentare se `hiddenAt` esclude dai saldi, e applicarlo
  uniformemente.
- **Effort:** S

### [A3-DATA-021] Denaro come float JS in tutto il dominio
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/lib/closure-journal-entries.ts:47-66; src/lib/services/schedule-reconciliation-service.ts:100-151; src/app/api/scadenzario/saldo-scalare/route.ts:9-11; src/lib/services/closure-service.ts:45-49
- **Evidenza:**
  ```ts
  const cashIncome = totalCash + totalExpenses            // somma float scritta in Decimal(10,2)
  const nuovoPagato = Number(schedule.importoPagato) + quota
  const saldata = nuovoPagato >= Number(schedule.importoTotale) - 0.01   // tolleranza-cerotto
  ```
- **Perché è un problema:** i Decimal del DB vengono convertiti in `number` alla prima occasione e
  sommati in binario; le scritture generate ricevono float grezzi (es. `587.9000000000001`) che
  Postgres arrotonda in silenzio a 2 decimali. Le soglie `±0.01` sparse (riconciliazione, quota,
  chiusura per saldata) ammettono ufficialmente l'errore: una scadenza può risultare `pagata` con 1
  centesimo di residuo. Il progetto HA già la soluzione — `decimal.js` configurato in
  `prima-nota-utils.ts:1-5` e `calculations.ts` — ma i moduli scadenzario/riconciliazione/chiusure
  non la usano. Oggi gli errori restano sotto il centesimo per la taglia degli importi; è debito
  che morde al crescere di volumi e di catene di ricalcolo.
- **Come verificarlo:** `node -e "console.log(0.1+0.2)"`; grep `Number(` nei file citati.
- **Correzione proposta:** convenzione unica: aritmetica con `Prisma.Decimal`/`decimal.js` nei
  servizi che scrivono importi; `toNumber()` solo alla serializzazione verso la UI.
- **Effort:** L (progressivo per modulo)

### [A3-DATA-022] Storico saldi parte da zero; aggregazioni in JS caricando tutte le righe
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/api/prima-nota/saldi/storico/route.ts:175-186; src/app/api/prima-nota/route.ts:264-280
- **Evidenza:**
  ```ts
  const runningBalances: Record<string, number> = { CASH: 0, BANK: 0 }  // ignora InitialBalance
  // e in GET prima-nota, per i totali di testata:
  const allEntries = await prisma.journalEntry.findMany({ where, select: {...} }) // TUTTE le righe, in JS
  ```
- **Perché è un problema:** (1) lo storico presenta come "saldo di chiusura" un progressivo che
  parte da 0 e, se l'utente filtra per data, ignora anche tutto ciò che precede la finestra: non
  quadrerà mai con `/saldi` (che parte dall'`InitialBalance`). (2) Il pattern "carica tutto e somma
  in JS" (qui, in storico, in `aging`, in `saldo-scalare`) rilegge l'intera prima nota a ogni
  render della pagina: oggi lento, domani insostenibile — Postgres sa fare `SUM`/`GROUP BY`.
- **Come verificarlo:** confrontare l'ultimo `closingBalance` dello storico con il saldo di
  `/api/prima-nota/saldi` a parità di filtri.
- **Correzione proposta:** partire dall'`InitialBalance` + saldo pregresso alla data di inizio
  finestra; sostituire i findMany-di-tutto con `aggregate`/`groupBy`.
- **Effort:** M

### [A3-DATA-023] Stati contabili come stringhe libere: 7 enum definiti e mai usati; due convenzioni di annullamento
- **Severità:** P2
- **Confidenza:** Certa
- **File:** prisma/schema.prisma:503-539 (Schedule), 1991-2054 (enum); src/app/api/scadenzario/[id]/route.ts:226-229
- **Evidenza:**
  ```prisma
  tipo   String                  // 'attiva' o 'passiva'
  stato  String @default("aperta") // 'aperta', 'parzialmente_pagata', ...
  ```
  In fondo allo schema esistono `ScheduleType`, `ScheduleStatus`(scadenze), `SchedulePriority`,
  `ScheduleDocumentType`, `ScheduleSource`, `SchedulePaymentMethod`, `RecurrenceType`,
  `ShiftScheduleStatus`: nessuno è referenziato da una colonna. E il DELETE scadenza:
  ```ts
  // Soft delete - aggiorna stato ad ANNULLATA
  data: { stato: 'annullata' }        // mentre il modello ha anche deletedAt (SOFT_DELETE_MODELS)
  ```
- **Perché è un problema:** il DB accetta `stato='pagta'` senza errori; ogni typo diventa una
  scadenza fantasma che i filtri (`notIn: ['pagata','annullata']`) non catturano più. Le scadenze
  hanno DUE modi di "sparire" — `stato='annullata'` (DELETE UI) e `deletedAt` (delete fattura) —
  con effetti diversi: l'annullata resta visibile nelle liste senza filtro stato e, soprattutto,
  blocca per sempre il passaggio a PAID della fattura madre (il conteggio rate aperte usa
  `stato != 'pagata'`, che include le annullate: schedule-reconciliation-service.ts:172-183).
- **Come verificarlo:** `UPDATE`-free: creare fattura a 2 rate, pagarne una, annullare l'altra da
  UI: la fattura non diventerà mai PAID.
- **Correzione proposta:** migrare le colonne agli enum già scritti (migrazione dati inclusa);
  scegliere UNA convenzione di annullamento; nel conteggio rate escludere annullate/cancellate.
- **Effort:** L

### [A3-DATA-024] Vincoli e indici mancanti sui modelli che muovono denaro
- **Severità:** P2
- **Confidenza:** Certa
- **File:** prisma/schema.prisma:1427-1450 (Payment), 579-603 (ScheduleReconciliation), 1187-1230 (ElectronicInvoice), 446-475 (Supplier), 563-568 (Schedule)
- **Evidenza:** in schema mancano:
  - `Payment`: nessun `@@index` (filtri tipici: venueId, stato, dataEsecuzione);
  - `ScheduleReconciliation`: nessun `@@unique(scheduleId, journalEntryId)` (vedi A3-DATA-005);
  - `ElectronicInvoice`: nessun unique naturale (vedi A3-DATA-010) e nessun indice su `invoiceNumber`;
  - `Supplier.vatNumber` non unique → `matchSupplier`/`createSupplierFromData` possono creare doppioni dello stesso fornitore (P.IVA uguale), spezzando lo storico ritardi usato dalla stima `dataAttesa`;
  - `Schedule.dataAttesa` senza indice: il previsionale filtra sempre con `OR [dataAttesa, dataScadenza]` (saldo-scalare, aging, summary) e l'OR non usa l'indice esistente su `[venueId, dataScadenza]`;
  - `CategorizationRule`/`CashFlowForecast`: nessun indice su `venueId`.
- **Perché è un problema:** i vincoli assenti sono le protezioni di idempotenza citate nei finding
  P1; gli indici assenti sono seq-scan su tabelle destinate a crescere (scadenze, pagamenti).
- **Come verificarlo:** grep `@@unique`/`@@index` nei modelli citati; `EXPLAIN` sulle query del
  saldo scalare.
- **Correzione proposta:** aggiungere i vincoli parziali (`WHERE deleted_at IS NULL`) e gli indici
  elencati; per i fornitori, unique su P.IVA normalizzata.
- **Effort:** M

### [A3-DATA-025] `calcolaProssimaGenerazione` triplicata, due copie senza clamp di fine mese
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/api/scadenzario/route.ts:331-356; src/app/api/scadenzario/[id]/genera-prossima/route.ts:122-145; src/lib/recurrence-utils.ts:18-47
- **Evidenza:**
  ```ts
  case 'mensile':
    result.setMonth(result.getMonth() + 1)   // 31/1 → 3/3 (overflow JS), nessun clamp
  ```
  La versione in `recurrence-utils.ts:36-43` ha il clamp corretto (`setDate(0)`), le due copie
  locali nelle route no.
- **Perché è un problema:** una ricorrenza mensile con scadenza il 29-31 del mese salta febbraio:
  l'affitto del 31/1 genera la prossima occorrenza il 3/3 invece che a fine febbraio; da lì in poi
  la serie deriva. Tre implementazioni dello stesso calcolo garantiscono che il bug sopravviva ai
  fix parziali.
- **Come verificarlo:** `node -e "const d=new Date('2026-01-31');d.setMonth(d.getMonth()+1);console.log(d)"` → 3 marzo.
- **Correzione proposta:** cancellare le due copie locali e importare `recurrence-utils`.
- **Effort:** S

### [A3-DATA-026] La nota di credito importata non riduce le scadenze della fattura originaria
- **Severità:** P2
- **Confidenza:** Certa (comportamento nel codice; l'impatto dipende dall'operatività)
- **File:** src/lib/services/invoice-schedule-service.ts:28-97
- **Evidenza:**
  ```ts
  const TIPI_DOCUMENTO_SENZA_SCADENZA = new Set(['TD04', 'TD05', 'TD08', 'TD09'])
  // "Una nota di credito riduce quanto dovuto al fornitore" — ma nessun codice applica la riduzione
  return { created: 0, skipped: invoice.deadlines.length }
  ```
- **Perché è un problema:** giustamente la NC non genera una scadenza; però non rettifica nemmeno
  le scadenze della fattura che storna. Il debito verso il fornitore resta esposto per l'importo
  pieno nello scadenzario, nell'aging e nel saldo scalare: si rischia di pagare il lordo quando si
  deve il netto. Il documento di dominio elenca "Allocation" come gap: questo è il suo costo
  contabile concreto.
- **Come verificarlo:** importare fattura TD01 da 1.000 € e NC TD04 da 200 € dello stesso
  fornitore: lo scadenzario continua a mostrare 1.000 € da pagare.
- **Correzione proposta:** come minimo, segnalare in UI le NC non allocate del fornitore accanto
  alle sue scadenze aperte; a regime, flusso di compensazione che riduce `importoTotale`/crea un
  pagamento figurativo con riferimento alla NC.
- **Effort:** L

### [A3-DATA-027] Colonne morte e promesse non mantenute
- **Severità:** P3
- **Confidenza:** Certa
- **File:** prisma/schema.prisma:397 e 1484; src/app/api/prima-nota/export/route.ts:94; src/lib/scadenzario/stima-data-attesa.ts
- **Evidenza:**
  - `JournalEntry.runningBalance`: nessuna scrittura in tutto `src/` (grep), ma viene letto e
    incluso nell'export Excel/lista (`runningBalance: e.runningBalance ? Number(...) : null`) →
    colonna sempre vuota nei file esportati; il saldo progressivo reale si calcola al volo in
    `prima-nota-utils.ts:65-83`.
  - `CashFlowForecast.totaleEntrate` → `@map("totale_entrare")`: typo cristallizzato nel nome
    colonna.
  - `Schedule.dataAttesaSource` documenta il valore `'manuale'` ma nessuna route permette di
    scrivere `dataAttesa` a mano (il PATCH scadenza non include il campo): promessa di schema senza
    codice.
- **Perché è un problema:** rumore che confonde chi legge lo schema e chi riceve un export con una
  colonna "saldo" vuota.
- **Come verificarlo:** grep citati; export prima nota.
- **Correzione proposta:** droppare `runningBalance` (o popolarlo), rinominare la colonna col
  typo alla prossima migrazione vera, implementare o rimuovere `'manuale'` dal contratto.
- **Effort:** S

---

## Cosa funziona bene

- La validazione chiusura (stato + generazione scritture) e gli annulli riconciliazione sono in
  transazione; i bulk-delete fatture chiedono la password e bloccano i documenti con pagamenti.
- Il soft delete centralizzato in `prisma.ts` copre anche `aggregate`/`groupBy` — scelta rara e giusta.
- `Schedule.invoiceDeadlineId @unique` rende idempotente la generazione scadenze da fattura.
- Il previsionale legge coerentemente `dataAttesa ?? dataScadenza` in saldo scalare, aging e summary.
- Importi sempre `Decimal` a livello di schema, mai `Float`; audit log presente su quasi tutte le mutazioni.

## Zone d'ombra / DA VERIFICARE

- **Stato reale del DB di produzione**: drift schema↔DB non verificabile da repo (A3-DATA-003/019);
  serve `prisma migrate diff` eseguito da chi ha accesso.
- **PDF/Excel**: il percorso Decimal→file (chiusure/[id]/pdf|excel, scadenzario/export) è stato solo
  campionato, non auditato riga per riga.
- **Doppio conteggio operativo**: una scadenza saldata da regola (movimento su conto bancario) la cui
  spesa venga registrata ANCHE come uscita di chiusura produrrebbe due uscite; dipende dall'uso, non
  l'ho potuto verificare sui dati.
- **Ricorrenze senza cron**: la generazione è solo manuale (`genera`, `genera-prossima`);
  `ricorrenzaProssimaGenerazione` non è consumata da alcun job — se l'utente non clicca, le scadenze
  ricorrenti non nascono.
- **`GET/PATCH/DELETE` scadenze e pagamenti senza filtro `venueId`** (`where: { id }` secco): oggi
  tautologico (single-venue), da sistemare prima di qualunque multi-sede — segnalato anche ad A2.
