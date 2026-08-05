# Allocation: split dei movimenti per conto, dalle righe fattura

## Contesto

Il gestionale replica il ciclo tesoreria di Sibill (fattura → scadenza → movimento → riconciliazione, `docs/Ciclo_Tesoreria_Modello_Sibill.md`). Manca l'ultimo concetto: l'**allocation**, cioè spezzare l'importo di un movimento in più fette con imputazioni diverse (la fattura del cash & carry con frigorifero + alimenti + attrezzatura). Requisiti raccolti dal committente:

- Lo split vive sul **movimento** (JournalEntry); nasce dalle **righe della fattura elettronica** (già parsate dall'XML SDI), collegata via riconciliazione. Fattura e movimento "viaggiano insieme".
- Facoltativo: nessuna fetta = comportamento attuale. Split manuale sempre possibile anche senza fattura.
- **AI all'import della fattura**: propone un conto per riga (stato "proposta", pallino giallo); l'operatore accetta in un click o corregge. Le **overrule vengono memorizzate** (fornitore+prodotto→conto) e hanno precedenza; l'AI può rimettere in dubbio quando il contesto cambia.
- Pagamenti parziali: **pro-quota automatico**.
- **Decisione fondativa (raccordo)**: il **conto del piano dei conti è l'unico asse di imputazione**; la categoria di budget si deriva dalla mappatura esistente `AccountBudgetMapping` (1:1, `accountId @unique` — verificato schema.prisma:745). `JournalEntry.budgetCategoryId` va in pensione graduale. I report budget attuali girano già per conto (`src/lib/budget/category-aggregator.ts` su DailyExpense): restano intoccati.
- La **fase report** (report per categoria che somma le fette) è rimandata: qui si lascia solo il confine pulito.

## Decisioni architetturali

1. **Invariante di quadratura**: somma fette ≤ importo utile del movimento (verso debit/credit come `importoUtile` in `src/lib/services/schedule-reconciliation-service.ts:44`). Il non allocato è esplicito. L'editor UI propone la quadratura piena.
2. **Con fette presenti**: `JournalEntry.accountId` resta valorizzato al **conto dominante** (fetta maggiore) e `categorizationSource='split'`. Mai azzerarlo: i report per conto esistenti non devono perdere i movimenti suddivisi. `budgetCategoryId` derivato dal conto dominante.
3. **Righe fattura**: tabella relazionale **leggera** ancorata a `numeroLinea` (non una InvoiceLine completa, non JSON arricchito: il JSON `lineItems` non ha consumer e il dettaglio riparsa l'XML a ogni GET — `src/app/api/invoices/[id]/route.ts:107-134`).
4. **AI best-effort**: l'import fatture non fallisce MAI per l'AI (stesso pattern del price tracking, `src/app/api/invoices/route.ts:518+`). Senza `ANTHROPIC_API_KEY` → skip loggato, resta il flusso manuale.
5. Le fette NON vanno in `SOFT_DELETE_MODELS`: sono attributi sostituibili (replace-all) del movimento, che è lui l'entità soft-deleted.

## Fase 0 — Raccordo dei due assi (piccola, consegnabile da sola)

- Helper `derivaBudgetCategoryDaConto(accountId)` in nuovo `src/lib/accounts/mapping.ts` (legge AccountBudgetMapping, rispetta `includeInBudget`).
- `PATCH /api/prima-nota/[id]/categorize` (`src/app/api/prima-nota/[id]/categorize/route.ts:50`): **bug verificato** — `budgetCategoryId: validated.budgetCategoryId || null` azzera la categoria se il client manda solo il conto. Nuova semantica: se arriva `accountId`, la categoria si deriva SEMPRE dal conto (il conto vince); categoria esplicita senza conto accettata in transizione. Fix contestuale: scrivere `categorizationSource: 'manual'` (oggi mai scritto).
- Stessa derivazione dove si imposta `accountId`: import fatture (eredita da `Supplier.defaultAccountId`), regole scadenzario (`src/lib/schedule-rules/engine.ts:315`), batch `recategorize` quando la regola ha `accountId` (`src/app/api/prima-nota/recategorize/route.ts:54-92`).
- `JournalEntry.budgetCategoryId`: solo commento `/// @deprecated` nello schema; rimozione decisa nella fase report.

## Fase 1 — Fette del movimento + split manuale

- Modello `JournalEntryAllocation` (`@@map journal_entry_allocations`): `journalEntryId`, `accountId`, `importo Decimal(10,2)`, `origine` ('manuale'|'ereditata'), `reconciliationId String?` (FK a ScheduleReconciliation — chiave dell'undo in Fase 3), `note`, `createdById`, timestamps. Indici su journalEntryId e reconciliationId.
- Service nuovo `src/lib/services/allocation-service.ts`:
  - `setEntryAllocations({journalEntryId, venueId, userId, fette})`: valida (somma ≤ importo utile, conti esistenti e attivi — Account è globale, senza venueId), transazione replace-all delle sole fette 'manuale'; array vuoto = rimuove lo split; aggiorna conto dominante + categoria derivata + `categorizationSource='split'` (o ripristina 'manual' se svuotato).
  - `ripartisciProQuota(fette, quota)` **pura**: arrotondamento al centesimo, quadratura della differenza sull'ultima fetta (riusata in Fase 3).
- Route `PUT/DELETE /api/prima-nota/[id]/suddivisione` (auth + admin/manager, convenzioni italiane).
- UI: dialog "Suddividi importo" da `MovimentoRowActions.tsx`; badge "Suddiviso (N)" in `MovimentiTable.tsx`. Select dei conti **condivisa** con optgroup per categoria derivata + gruppo "Senza categoria" per i conti non mappati (riusata in Fase 2).
- Test: pattern mock-prisma di `src/lib/services/__tests__/schedule-reconciliation-service.test.ts`.

## Fase 2 — Categorizzazione manuale delle righe fattura

- Modello `InvoiceLineAccount` (`@@map invoice_line_accounts`): `@@unique(invoiceId, numeroLinea)`, snapshot `descrizione`+`codiceArticolo`+`importo` (matching/audit), `accountId`, `stato` ('proposta'|'confermata'), `fonte` ('ai'|'regola-appresa'|'manuale'), `confidence`, `motivazioneAi`, `confirmedBy/At`.
- `GET /api/invoices/[id]`: merge per `numeroLinea` fra righe riparsate dall'XML e categorizzazioni salvate.
- Nuova `PATCH /api/invoices/[id]/righe-conti`: batch per riga + azione `confermaTutte`.
- UI dettaglio fattura (`src/components/invoices/InvoiceDetailSections.tsx:297-360`): select conto per riga (precompilata col conto del fornitore come suggerimento non salvato), pallino giallo/verde, bottone "Accetta tutte".

## Fase 3 — Ereditarietà pro-quota alla riconciliazione + undo

- Aggancio DENTRO la transazione di `reconcileScheduleWithEntry` (`schedule-reconciliation-service.ts:127-169`): copre gratis anche le regole scadenzario che riconciliano via lo stesso service (`engine.ts:322`).
- Regole: solo se `schedule.invoiceId` presente e **copertura totale** delle righe (proposte incluse: l'operatore vede la provenienza); fette 'manuale' preesistenti vincono (no-op). Pesi = importi riga per conto normalizzati sulla **somma righe effettiva** (non su netAmount: difesa da sconti globali; l'IVA si distribuisce pro-quota). Fette = `ripartisciProQuota(pesi, quota)` con `origine='ereditata'` e `reconciliationId` → saldo pieno e parziale sono lo stesso codice; multi-rata accumula fette per riconciliazione, ognuna quadrata sulla propria quota. Al termine: conto dominante + categoria derivata.
- Undo (`undoScheduleReconciliation`, stessa transazione): `deleteMany({where:{reconciliationId}})` + ricalcolo del conto dominante sulle fette residue.

## Fase 4 — AI all'import + memoria delle overrule

Prerequisito: `ANTHROPIC_API_KEY` in env (segnalare al committente). In implementazione caricare la skill `claude-api`.

- Memoria `SupplierProductAccount`: `@@unique(venueId, supplierId, nomeNormalizzato)` + `codiceArticolo`, `accountId`, contatore `conferme`. Matching: prima `codiceArticolo` esatto, poi nome normalizzato (riuso `normalizeProductName` da `src/lib/price-tracking/index.ts:46-53`). Scrittura: upsert a ogni conferma/overrule nella PATCH di Fase 2.
- Pipeline `src/lib/line-categorization/index.ts`, agganciata in `src/app/api/invoices/route.ts` accanto al price tracking (~riga 520), try/catch best-effort. Solo fatture passive. Una chiamata batch per fattura: modello `claude-haiku-4-5-20251001`, structured output; payload = righe + piano dei conti attivi di tipo costo **raggruppato per categoria derivata**; output per riga `{numeroLinea, accountId, confidence, motivo, dubbioSuMemoria?}`.
- Precedenza: match esatto di memoria → riga 'confermata' fonte 'regola-appresa' PRIMA della chiamata; le righe risolte passano comunque all'AI (marcate) che può rispondere `dubbioSuMemoria` con alternativa → stato torna 'proposta' (giallo) con motivazione. Anti-allucinazione: `accountId` inesistenti scartati con log.
- Opzionale: script backfill per le fatture esistenti (pattern `scripts/backfill-invoice-extended-data.ts`).

## Confine per la futura fase report

Helper unico `getContiEffettivi(entry)` in allocation-service (fette se presenti, altrimenti `{accountId, importo}` singolo, residuo non allocato esplicito) come solo punto di lettura. `category-aggregator.ts`, `AccountBudgetMapping` e i report attuali: **zero tocchi** (già coerenti: il conto dominante resta sempre valorizzato). La deprecazione definitiva di `budgetCategoryId` si decide lì.

## Rischi

- Fase 3: somma righe ≠ netAmount (sconti/abbuoni) → normalizzazione sui pesi effettivi, test dedicato.
- Fase 4: latenza chiamata sincrona post-import (accettabile: il price tracking fa già così; spostabile in coda differita); qualità proposte mitigata dal giallo mai auto-applicato e dalla memoria.
- Fase 2: reimport della stessa fattura → divergenza XML/tabella, mitigata da `@@unique` + snapshot.
- Schema sempre solo additivo (`npm run db:push` su DB Supabase condiviso con la produzione — come le feature precedenti).

## Ambiente e verifica

- **Working tree**: il tree principale è della sessione presenze; lavorare in un **worktree dedicato su main** (`git worktree add ~/Desktop/accounting-stima main`), `nvm use 22` prima di `npm ci` (Node di sistema incompatibile). Mai `git add -A`.
- TDD per ogni fase (vitest, mock prisma sui pattern esistenti); typecheck `npx tsc --noEmit`; suite completa a ogni fase (base attuale: 524 verdi).
- Verifica end-to-end per fase: F0 categorize con solo conto → categoria derivata; F1 split manuale da UI e badge; F2 categorizzazione righe da dettaglio fattura; F3 riconciliazione di una fattura categorizzata → fette pro-quota sul movimento, undo le rimuove; F4 import di una fattura vera → proposte gialle, conferma → memoria che si riapplica al reimport.
- Ogni fase è consegnabile e committabile da sola, nell'ordine 0→4.
