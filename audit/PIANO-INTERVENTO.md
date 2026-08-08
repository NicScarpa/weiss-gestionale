# Piano di intervento — weiss-gestionale

**Ordinato per rischio economico ed effetto sul lavoro quotidiano, non per facilità.**
Ogni lotto: obiettivo, file toccati, rischio di regressione, test da scrivere **prima**, criterio di "fatto".
Non iniziare la correzione prima dell'approvazione del piano. Un lotto per volta.

> Prerequisito trasversale a ogni lotto contabile: lavorare su **DB locale** (mai il `.env` di
> produzione), scrivere il test che riproduce il bug **prima** del fix, e verificare la quadratura
> dopo.

---

## LOTTO 0 — Messa in sicurezza immediata (blocca danni, non tocca la logica)
**Perché prima:** elimina i modi in cui un gesto di routine distrugge dati, senza rischio di regressione.

- **Obiettivo:** rendere impossibile il wipe accidentale della produzione e la fuga di credenziali.
- **Azioni:**
  - `package.json`: rimuovere/rinominare `db:reset`; aggiungere a `seed.ts` e a `db:push`/`db:reset` un guard che **aborta se `DATABASE_URL` contiene `pooler.supabase.com`** salvo `I_KNOW_THIS_IS_PROD=1` (A3-DATA-003, A2p-03).
  - Spostare `credenziali.env` e `credenziali_fluida.env` fuori dall'albero di progetto, in un password manager (A2p-02).
  - REC-01/02/03/04: chiedere al titolare le verifiche fuori-codice (credenziali reali non default; `migrate diff` per il drift; cron Railway; Upstash in prod).
- **File:** `package.json`, `prisma/seed.ts`, i due file credenziali.
- **Rischio regressione:** nullo.
- **Test prima:** uno unit che verifica che il guard aborti su URL di produzione.
- **Fatto quando:** `npm run db:reset` con `.env` di produzione si rifiuta di partire; i file credenziali non sono più nella cartella.

## LOTTO 1 — Il segno del pagamento (P0 contabile)
**Perché:** ogni pagamento eseguito sta falsando il saldo banca di due volte l'importo. È il danno più diretto e in corso.

- **Obiettivo:** i pagamenti in uscita riducono il saldo banca; bonificare i dati già scritti.
- **Azioni:** in `api/pagamenti/[id]/esegui/route.ts:53` scrivere `creditAmount` invece di `debitAmount`; avvolgere create movimento + update pagamento in `$transaction`; migrazione dati che inverte i movimenti esistenti con `paymentId` valorizzato (A3-DATA-001).
- **File:** `api/pagamenti/[id]/esegui/route.ts`, script di bonifica una tantum.
- **Rischio regressione:** medio (tocca i saldi). Mitigazione: test di quadratura prima/dopo su dataset locale.
- **Test prima:** unit che esegue un pagamento e verifica che `GET /api/prima-nota/saldi` scenda dell'importo; test sulla bonifica.
- **Fatto quando:** un pagamento da 1.000 € abbassa il saldo banca di 1.000 €; i movimenti storici con `paymentId` sono corretti e i saldi tornano.

## LOTTO 2 — Chiusura validata e generazione scritture atomica (P0 + P1 correlati)
**Perché:** la contabilità di una giornata può divergere in modo permanente; la doppia validazione duplica gli incassi.

- **Obiettivo:** modificare una chiusura validata rigenera le scritture nella stessa transazione; la validazione è a prova di concorrenza.
- **Azioni:** nella PUT chiusura VALIDATED, dentro `$transaction`, soft-delete + rigenerazione scritture (o vietare la modifica e imporre rifiuto→correzione→rivalidazione) (A3-DATA-002); in `closure-service.ts` usare `updateMany({where:{id,status:'SUBMITTED'}})` e abortire se `count===0`, guardia anti-duplicato in generazione (A3-DATA-013).
- **File:** `api/chiusure/[id]/route.ts`, `services/closure-service.ts`, `closure-journal-entries.ts`.
- **Rischio regressione:** alto (cuore contabile). Mitigazione: test su `validateClosure` (oggi a 0 → LOTTO 6a anticipato qui).
- **Test prima:** A6-TEST-004 (validateClosure): valida→modifica→verifica coerenza scritture; due validazioni concorrenti→un solo set di scritture.
- **Fatto quando:** chiusura, prima nota, saldi e budget dello stesso giorno coincidono dopo una modifica; doppia validate non duplica.

## LOTTO 3 — Atomicità e idempotenza di scadenzario/riconciliazione/import (cluster CR2)
**Perché:** è la famiglia P1 più numerosa; ogni doppio click o errore di rete lascia numeri sbagliati.

- **Obiettivo:** operazioni multi-tabella in transazione, con vincoli DB che impediscono i duplicati.
- **Azioni:**
  - `$transaction` su: pagamento manuale scadenza (A3-DATA-007), generazione ricorrenze (A3-DATA-011), import fatture→scadenze (A3-DATA-010), import estratto conto (A3-DATA-018).
  - Vincoli unique parziali (`WHERE deleted_at IS NULL`): `(scheduleId,journalEntryId)` per riconciliazione (A3-DATA-005), `(recurrenceId,dataScadenza)` (A3-DATA-011), `(invoiceNumber,invoiceDate,supplierVat)` (A3-DATA-010), `Supplier.vatNumber` normalizzata (A3-DATA-024).
  - Tetto di capienza sul movimento in riconciliazione (A3-DATA-004); blocco cancellazione movimenti riconciliati/matchati (A3-DATA-009).
- **File:** `services/schedule-reconciliation-service.ts`, `api/scadenzario/[id]/pagamenti/route.ts`, `api/scadenzario/ricorrenze/[id]/genera/route.ts`, `api/invoices/route.ts`, `api/bank-transactions/import/route.ts`, `api/prima-nota/[id]/route.ts`, `prisma/schema.prisma` (+ migrazione).
- **Rischio regressione:** alto. Mitigazione: i vincoli DB vanno aggiunti con `prisma migrate` (LOTTO 8), non `db push`.
- **Test prima:** A6-TEST-006 (matcher/parser) + test di concorrenza (doppia POST).
- **Fatto quando:** doppie POST parallele non creano duplicati; sovra-riconciliazione rifiutata; import ripetuto idempotente.

## LOTTO 4 — Unificare la macchina a stati del pagamento e la data pagamento (cluster CR3/CR6)
**Perché:** stati e importi divergono tra le 4 copie; la data pagamento si corrompe.

- **Obiettivo:** un'unica funzione di ricalcolo stato/residuo, in `Decimal`, chiamata da tutti i percorsi.
- **Azioni:** `ricalcolaStatoSchedule(scheduleId, tx)` unica (service), usata da POST/DELETE pagamenti e PATCH stato (A5-API-017); rimuovere il blocco che setta `dataPagamento` su SCADUTA + bonifica righe (A5-API-018); PATCH scadenza ricalcola stato e rifiuta totale < pagato (A3-DATA-014); PATCH pagamenti con Zod whitelist (A3-DATA-015); aritmetica `decimal.js` nei servizi (A3-DATA-021).
- **File:** `services/schedule-reconciliation-service.ts`, `api/scadenzario/[id]/{route,stato,pagamenti}.ts`, `api/pagamenti/[id]/route.ts`.
- **Rischio regressione:** medio. **Test prima:** transizioni stato + caso PAGATA-con-residuo.
- **Fatto quando:** una sola sorgente di stato; nessuna scadenza "pagata" con residuo; `dataPagamento` mai fittizia.

## LOTTO 5 — Cash flow, budget e saldi: far quadrare i numeri mostrati (cluster CR3/CR6)
**Perché:** oggi la dashboard mostra cifre false o incoerenti su cui si prendono decisioni.

- **Obiettivo:** un'unica definizione di "saldo" e previsione, alimentata dai dati reali.
- **Azioni:** riscrivere `/api/cashflow/summary` usando `calculateBalancesFromEntries`, togliere i cast `::uuid`, ridefinire trend/previsione per giorno (A3-DATA-017/A1-BUILD-002); saldi prima nota con finestra temporale (iniziale anno + movimenti fino a oggi, no futuri) (A3-DATA-012); budget actual da `JournalEntry` con ripartizione ricavi (A3-DATA-016); storico saldi da `InitialBalance` (A3-DATA-022); soft delete nelle query raw dei summary (A2p-10/A3-DATA-020); filtro `hidden` corretto (A3-DATA-020).
- **File:** `api/cashflow/summary/route.ts`, `api/prima-nota/saldi{,/storico}/route.ts`, `lib/budget/category-aggregator.ts`, `api/pagamenti/summary/route.ts`.
- **Rischio regressione:** medio-alto. **Test prima:** unit sui calcoli di saldo/previsione/budget con dataset noto.
- **Fatto quando:** saldi, budget-liquidity e cash-flow danno la **stessa** cifra per "quanti soldi abbiamo"; KPI cash-flow plausibili.

## LOTTO 6 — Autorizzazione centralizzata (causa radice CR1)
**Perché:** chiude in un colpo i buchi di ruolo attuali e impedisce i futuri.

- **Obiettivo:** un wrapper unico di auth/ruolo, adottato dalle route finanziarie, con guardia in CI.
- **Azioni:** `withAuth(handler,{roles,venueScoped})` basato su `requireAuth`/`requireRole` esistenti; migrare le route finanziarie; guard di ruolo su `categorization-rules`/`budget-categories`/`proposals` + `venueId` da sessione (A2-SEC-002/A2p-01); GET invito senza side effect (A5-API-012); `mustChangePassword` enforced via wrapper (A2-SEC-006/019); check CI che fallisce se una route non passa dal wrapper (A2-SEC-003, A4-INT-007).
- **File:** `lib/api-utils.ts`, route finanziarie, `api/staff/invite/route.ts`, CI.
- **Rischio regressione:** medio (tocca molte route). Mitigazione: migrazione a piccoli gruppi.
- **Test prima:** per ogni gruppo, test "staff riceve 403".
- **Fatto quando:** una sola definizione di guard; staff non scrive route finanziarie; CI blocca route senza wrapper.

## LOTTO 7 — Riattivare la rete di qualità (causa radice CR5)
**Perché:** senza questa, i lotti precedenti possono regredire in silenzio.

- **Azioni:** `instrumentation.ts` per Sentry + `global-error.tsx` (A1-BUILD-004); CI su Node 22 (A1-BUILD-006); togliere `continue-on-error` da `npm audit` (almeno `critical`) e aggiungere soglia coverage (A1-BUILD-007); decidere il destino della E2E (reinstallare `@playwright/test` + env di test locale, o rimuovere `e2e/`) (A6-TEST-001); ratchet strict-mode e poi `strict:true` (A1-BUILD-001); `npm audit fix` + bump next-auth appena stabile (A2-SEC-001); Serwist/Turbopack per il SW offline (A1-BUILD-008).
- **File:** `instrumentation.ts` (nuovo), `ci.yml`, `tsconfig.json`, `package.json`, `next.config.ts`.
- **Rischio regressione:** basso (infrastruttura). **Fatto quando:** un errore di produzione arriva a Sentry; la CI blocca CVE critiche e regressioni di coverage; strict non peggiora.

## LOTTO 8 — Migrazioni versionate e fotografia del drift (causa radice CR5)
**Perché:** senza migrazioni non si può mettere in produzione nessuno dei vincoli DB dei LOTTI 3-4 in sicurezza.

- **Azioni:** `prisma migrate diff` per fotografare il drift (REC-02/A3-DATA-019); baseline `prisma migrate` dallo stato attuale di produzione; da qui in poi ogni cambiamento schema via migrazione, mai `db push` in produzione.
- **Rischio regressione:** alto se fatto male (tocca lo schema reale). Da eseguire con il titolare, con backup verificato.
- **Fatto quando:** esiste `prisma/migrations/` con la baseline; il drift è noto e risolto.

## LOTTO 9 — Bonifica dei moduli scollegati (causa radice CR4)
**Perché:** riduce superficie, rumore e UI che mente; non urgente ma sblocca lo sviluppo futuro.

- **Azioni:** per ognuna delle 26 route orfane, decidere collega-o-cancella (A4-INT-006); collegare push (o togliere il toggle) (A4-INT-001); collegare `refreshBalances`/`saldi` (A4-INT-003); decidere RecurringExpense e cash-flow forecasts (A4-INT-004/005); cron su Railway (A1-BUILD-005/A4-INT-002); eliminare tipi/validazioni/componenti morti (A4-INT-008/011/013/014); unificare i due flussi import fatture e `formatCurrency` (A4-INT-009/010); knip in CI con ignore-list.
- **Rischio regressione:** basso (per lo più cancellazioni verificate). **Fatto quando:** knip in CI è verde con la lista concordata; nessuna UI promette funzioni assenti.

## LOTTO 10 — UI / responsiveness (A8)
**Perché:** alcuni difetti UI sono bug contabili visti dall'utente; vanno con i lotti relativi, il resto è mobile.

- **Da agganciare ai lotti contabili (non rimandare):**
  - A8-UI-002 (doppio submit → scadenze duplicate) e A8-UI-003 (errore creazione silenzioso) →
    stesso intervento di **LOTTO 3** (idempotenza) + stato `isSubmitting` e toast nel dialog.
  - A8-UI-004 (data scadenza −1 giorno per timezone) → **subito, è un P1 sui dati**: inviare la data
    come `yyyy-MM-dd` calcolata in locale, come già fa il modulo presenze (`lib/timezone.ts`).
  - A8-UI-006 (Cash Flow 500 mostrato come "0,00 €") → il fix backend è nel **LOTTO 5**; qui aggiungere
    lato pagina la distinzione tra stato d'errore e valore zero (banner + retry).
- **Mobile / responsiveness (lotto UI a sé):**
  - P1: chiusura cassa a 390px (`CashCountGrid.tsx:99`, meteo `ClosureMetadataSection.tsx:126`) e
    voce "Chiusura" del portale fuori schermo (`PortalNavigation.tsx`).
  - P2: pattern trasversale toolbar/tab che sforano su ~10 pagine (header `flex-wrap` + bottoni a
    icona sotto `sm:`; togliere `w-fit` dalle tab bar); `overflow-x-auto` su `PagamentiTable.tsx:113`
    e sugli altri ~18 componenti-tabella senza wrapper; dark mode (decidere: montare `ThemeProvider` +
    toggle o rimuovere il blocco `.dark`); sidebar `aria-label` + gestione touch del flyout.
  - P3: refusi ("Iniziana", "liquidita"), `aria-label` sui bottoni icon-only, truthy-zero in dashboard,
    errore Zod inglese nel form ferie, `tabular-nums`/virgola sugli importi.
- **Refactor separato (P2, non urgente):** spezzare i componenti giganti — `ferie-permessi` 1098 righe,
  `anagrafiche/personale` 1057, `scadenzario/[id]` 907.
- **Test prima:** per il mobile, aggiungere a Playwright i viewport 390/768 (oggi solo Desktop Chrome —
  A6/A1) e uno smoke test "nessun overflow orizzontale" (scrollWidth di `main` ≤ clientWidth) sulle
  pagine chiave.
- **Fatto quando:** nessuna pagina admin scrolla lateralmente a 390px; chiusura cassa e dettaglio
  scadenza leggibili su telefono; il doppio submit non duplica; la data salvata coincide con quella scelta.

---

## Ordine e dipendenze

```
LOTTO 0 (sicurezza)  ─┬─────────────────────────────────────────────► indipendente, subito
LOTTO 1 (segno pagam.)│
LOTTO 2 (chiusura)    │  P0/P1 contabili — richiedono test-prima
LOTTO 3 (atomicità)   │      LOTTO 3 e 4 dipendono da LOTTO 8 per i vincoli DB in produzione
LOTTO 4 (stati pagam.)│
LOTTO 5 (saldi/budget)┘
LOTTO 6 (auth)  ───────── indipendente dai contabili, alto valore preventivo
LOTTO 7 (qualità) ─────── abilita e protegge tutti gli altri: conviene anticiparlo in parte
LOTTO 8 (migrazioni) ──── prerequisito dei vincoli DB dei LOTTI 3-4
LOTTO 9 (scollegati) ──── dopo, riduce debito
LOTTO 10 (UI) ─────────── in parallelo, non blocca i contabili
```

**Raccomandazione di sequenza reale:** LOTTO 0 subito → parte di LOTTO 7 (Sentry, CI, migrate diff) per
avere rete e visibilità → LOTTO 8 (baseline migrazioni) → poi i contabili LOTTO 1→2→3→4→5 con i vincoli
DB applicati via migrazione → LOTTO 6 (auth) → LOTTO 9 e 10 a chiudere.
