# Estratto conto nella prima nota — consegna B: le azioni contabili

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dalla lista dell'estratto conto (consegna A, in produzione) una riga della banca si **promuove a scrittura di prima nota** con un servizio unico: **Categorizza** (singola e in blocco: le 62 commissioni in un colpo), **Collega fattura** con residuo (scadenze, o una scrittura esistente = R4) e **Scollega**, **Riconcilia** verso `/riconciliazione?movimento=<id>`, la colonna **Categoria**, il residuo dei documenti **denormalizzato** sulla riga così che «Solo non riconciliati» prenda anche i parziali in SQL, e la sotto-scheda Scritture che dice «dalla banca» su ogni scrittura nata da una riga. Il piano A2 (task 3) smette di avere un servizio suo e riusa questo.

**Architecture:** due colonne nuove sulla riga di banca (`origineScrittura`, `residuoDocumenti`) e un enum; un modulo `residuo-documenti.ts` che riscrive il residuo dovunque cambino le riconciliazioni (promozione, scollegamento, `riconciliaInTransazione`, annullo, vecchio auto-match); il servizio `promuoviRigaBancaria` / `scollegaRigaBancaria` in `src/lib/services/promozione-riga-bancaria-service.ts` (una transazione sola, esito tipizzato, variante «in transazione» per l'A2); quattro rotte nuove sotto `/api/bank-transactions` (`[id]/categorizza`, `[id]/collega`, `[id]/scollega`, `categorizza-in-blocco`) che sostituiscono `[id]/match` e `[id]/unmatch`; la lista legge lo stato dalla colonna e non più sommando le riconciliazioni; tre dialoghi nuovi (`CategorizzaDialog`, `CollegaFatturaDialog`, `ScollegaDialog`) e le azioni di riga; il contorno che serve ai dialoghi (`aperte=1` sullo scadenzario, `senzaRigaBancaria` e `bankTransactionId` sulla lista della prima nota).

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + PostgreSQL, TanStack Query, shadcn/ui (Radix), Vitest (unit jsdom + integrazione su PostgreSQL locale 5433), zod.

**Spec:** `docs/superpowers/specs/2026-08-16-movimenti-bancari-in-prima-nota-design.md`, sezione «Le azioni contabili (consegna B)» e «Gli stati» — il piano argomenta dalla spec; chi esegue legge entrambi. La spec madre è `docs/superpowers/specs/2026-08-13-riconciliazione-assistita-design.md` («Cosa succede approvando»); il piano A2 da aggiornare è `docs/superpowers/plans/2026-08-16-riconciliazione-a2-primo-taglio.md`.

## Global Constraints

- **Node 22 via nvm, sempre**: ogni comando `npm`/`npx`/`node` va lanciato come `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx …` (il `source nvm.sh` non passa il guard del worktree).
- **Mai `prisma db push` né `prisma migrate dev`** contro il `.env` del worktree: punta alla produzione. Le migrazioni si scrivono a mano in `prisma/migrations/<timestamp>_<nome>/migration.sql` e si provano su un database vuoto locale del 5433 (Task 1, step 3).
- **Test d'integrazione**: `TEST_DB_SUFFIX=consegnab PATH=… npx vitest run --config vitest.integration.config.ts <file>` (PostgreSQL locale sul 5433, database `weiss_itest_consegnab_*`; il suffisso evita di calpestare altri worktree; ~20 s di preparazione al primo giro).
- **Ogni rotta nuova passa da `withAuth`** con `{ roles: ['admin', 'manager'], venueScoped: true }`; il cricchetto `node scripts/check-route-auth.mjs --ratchet` non deve salire (baseline **252** in `scripts/check-route-auth.mjs:292`; il Task 5 toglie due handler senza `withAuth` e la abbassa a **250**, mai si alza).
- **Data, data valuta, importo, verso, conto, codice banca, identificativo del provider sono immutabili** sulle righe non `MANUAL` (spec, decisione 2). La scrittura promossa li eredita: data = `transactionDate`, importo = `|amount|`, verso dal segno. Nessuna rotta di questa consegna li tocca.
- **Una scrittura per riga** (`matchedEntryId` è `@unique`); **la somma delle riconciliazioni non supera l'importo della riga**; **una scrittura già legata a un'altra riga si rifiuta** (spec, «promuoviRigaBancaria»).
- **Lo scollegamento ritira solo ciò che la promozione ha creato**: `origineScrittura` non nullo → riconciliazioni annullate e scrittura ritirata (soft delete); nullo (R4) → si slega e basta.
- **`TransactionClient` da `@/lib/prisma`**, mai `Prisma.TransactionClient` (non è assegnabile al client esteso). L'estensione soft-delete inietta `deletedAt: null` solo dove manca: per toccare il Cestino il `deletedAt` va scritto esplicito.
- **Le scritture contabili non si cancellano**: `deletedAt`, mai `delete()`. Importi sempre `Decimal` in Prisma; nei calcoli `Number()` e arrotondamento a due decimali (`Math.round(x * 100) / 100`), tolleranza `TOLLERANZA_IMPORTI` (0,005) da `@/lib/scadenzario/stato-schedule`.
- **Ordine dei lock**: sempre movimento (`bloccaMovimento`) prima della scadenza (`bloccaScadenza`), come nel servizio delle riconciliazioni; il servizio di promozione blocca prima la riga di banca (`FOR UPDATE`), poi entra nelle riconciliazioni che rispettano quell'ordine.
- **Prisma non annida transazioni interattive**: chi ha già una `tx` entra dalle varianti `…InTransazione`; le code fuori transazione (`dopoLaRiconciliazione`, `dopoAnnulloRiconciliazione`) le chiama chi ha aperto la transazione.
- **Niente UI che promette ciò che non c'è**: «Riconcilia» apre `/riconciliazione?movimento=<id>`, che oggi è la vecchia pagina **filtrata su quella riga** (Task 9): uno strumento che esiste, non la coda A2. Quando l'A2 sostituirà la pagina, lo stesso indirizzo aprirà la coda filtrata (nota nel piano A2, Task 10).
- **`react-hooks/set-state-in-effect` è errore nel lint**: niente `setState` dentro `useEffect`; per lo stato «solo browser» c'è `useSyncExternalStore` (già in `EstrattoConto.tsx`).
- **Radix nei test**: `TabsTrigger` si attiva su `mousedown`, `DropdownMenuTrigger` su `pointerdown` (gli aiutanti stanno in `src/components/banca/estratto-conto/__tests__/EstrattoConto.test.tsx`).
- **Testi UI in italiano**, con gli accenti giusti; commenti nel codice che dicono *perché*. Solo token semantici (`text-muted-foreground`, `bg-muted/50`…), mai colori cablati salvo quelli già in uso nella lista (verde/rosso degli importi, viola del conto).
- **Commit piccoli**, uno per task, con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; mai `git add -A`.
- **La build va eseguita, in entrambe le forme** (`npm run build` e `npx next build --webpack`), senza `| tail`; e `typecheck:test`, lint, knip, cricchetto.

## Decisioni del piano (dove la spec lascia un margine)

1. **La categoria di budget non si sceglie**: `JournalEntry.budgetCategoryId` è deprecato nello schema (si deriva dal conto via `AccountBudgetMapping`, spec 2026-08-05); Categorizza chiede **conto e centro di costo**, come `EditContoCentroDialog`. Costo se sbagliato: un campo in più in un dialogo, aggiungibile senza toccare il servizio (accetta già `imputazione` estendibile).
2. **Il conto contabile della scrittura promossa senza imputazione** viene, nell'ordine, da `Supplier.defaultAccountId` del fornitore della prima scadenza, poi da `ElectronicInvoice.accountId` della sua fattura, altrimenti resta nullo (la R4 non crea nulla). Il centro lo risolve `risolviCentroDiCosto` in contesto `'interattivo'` se c'è un'imputazione, `'automatico'` altrimenti (nessun form ha il campo): un centro `'supposto'` lascia `verified: false`, ogni altro esito `verified: true`.
3. **Il verso della scrittura esistente (R4) deve combaciare con quello della riga** (un'entrata non si lega a un'uscita); l'importo no — è il caso dell'incasso POS di una chiusura, che può non coincidere al centesimo — e la lista mostra il residuo dei documenti come per ogni altra riga.
4. **Una riga con `status = TO_REVIEW`** (proposta del vecchio motore, che scrive `matchedEntryId` senza conferma) è «Non abbinato» col puntino «c'è una proposta» (spec, «Gli stati»), non «Riconciliato»: la legenda guarda `status` prima di `matchedEntryId`, e «Solo non riconciliati» la include.
5. **Categorizza su una riga già promossa** aggiorna conto e centro della scrittura collegata (spec, «Le azioni»); se la scrittura è ripartita in fette dalla fattura, si rifiuta con `imputazione_non_valida` («si modifica dalla prima nota»), come già fanno `PUT /api/prima-nota/[id]` e `categorize`.
6. **`[id]/match` e `[id]/unmatch` spariscono**: erano una seconda porta verso `matchedEntryId` con una semantica diversa (l'`unmatch` avrebbe lasciato orfana una scrittura creata dalla promozione). La vecchia pagina `/riconciliazione` chiama `collega` (con `scritturaEsistenteId`) e `scollega`, finché esiste.
7. **Scollega su una riga non collegata** non è un errore: riporta `status` a `PENDING` (è ciò che faceva `unmatch`) e risponde `ok` senza aver ritirato nulla.
8. **La colonna Categoria si vede da subito anche per chi aveva già salvato le colonne**: la scelta passa da «elenco delle visibili» a «elenco delle nascoste» (`weiss.estrattoConto.colonneNascoste`), leggendo una volta la chiave vecchia; una colonna nuova nasce visibile.
9. **`residuoDocumenti` lo mantiene chi scrive le riconciliazioni**, non solo la promozione: `riconciliaInTransazione`, l'annullo, il vecchio auto-match. Senza, una riconciliazione fatta dallo scadenzario su una scrittura promossa lascerebbe la colonna — e quindi legenda e filtro — sbagliata.
10. **Il collegamento profondo a una riga** è `?register=BANK&movimento=<id>` (parametro `movimento` nei filtri della lista): lo usano la scheda Scritture («dalla banca») e la vecchia `/riconciliazione`.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20260817090000_azioni_contabili_estratto_conto/migration.sql` | `origineScrittura`, `residuoDocumenti`, enum `OrigineScritturaBancaria`, riempimento delle righe già collegate |
| `src/lib/banca/residuo-documenti.ts` (+ `__tests__/residuo-documenti.test.ts`, `__tests__/residuo-documenti.itest.ts`) | `calcolaResiduoDocumenti` (pura) e `ricalcolaResiduoDocumenti(tx, journalEntryId)` |
| `src/lib/services/schedule-reconciliation-service.ts` | aggancio del residuo in `riconciliaInTransazione`; estrazione di `annullaRiconciliazioneInTransazione` + `dopoAnnulloRiconciliazione` dall'`undoScheduleReconciliation` |
| `src/lib/reconciliation/matcher.ts`, `src/lib/reconciliation/index.ts` | il vecchio auto-match ricalcola il residuo; via `manualMatch` e `unmatch` |
| `src/lib/banca/stato-legenda.ts` (+ test) | stato dalla colonna, con `proposta` |
| `src/lib/banca/filtri-estratto-conto.ts` (+ test) | parametro `movimento` |
| `src/lib/banca/query-estratto-conto.ts` | `where` con parziali e `movimento`, `SELEZIONE_RIGA` con la Categoria, `mappaRiga` |
| `src/types/reconciliation.ts` | `ScritturaCollegata`, `OrigineScritturaBancaria`, i campi nuovi di `RigaEstrattoConto` |
| `src/lib/services/promozione-riga-bancaria-service.ts` (+ `__tests__/promozione-riga-bancaria-service.itest.ts`) | `promuoviRigaBancaria`, `promuoviRigaBancariaInTransazione`, `PromozioneRifiutata`, `scollegaRigaBancaria` |
| `src/lib/banca/esiti-promozione.ts` | la traduzione esito → stato HTTP + messaggio, condivisa dalle rotte |
| `src/lib/validations/reconciliation.ts` | `imputazioneSchema`, `categorizzaSchema`, `collegaSchema`, `categorizzaInBloccoSchema`; via `matchTransactionSchema` |
| `src/app/api/bank-transactions/[id]/{categorizza,collega,scollega}/route.ts`, `src/app/api/bank-transactions/categorizza-in-blocco/route.ts` (+ itest) | le rotte nuove |
| rimossi: `src/app/api/bank-transactions/[id]/match/route.ts`, `…/[id]/unmatch/route.ts` | la seconda porta |
| `src/lib/reconciliation/__tests__/transazioni-cancellate.itest.ts` | passa da `unmatch` a `scollega` |
| `scripts/check-route-auth.mjs` | `BASELINE` 252 → 250 |
| `src/app/api/scadenzario/route.ts` (+ itest) | `aperte=1` |
| `src/app/api/prima-nota/route.ts`, `src/app/api/prima-nota/[id]/route.ts`, `src/types/prima-nota.ts` (+ itest) | `senzaRigaBancaria=true`, `bankTransactionId` per riga, la data di una scrittura «dalla banca» non si cambia |
| `src/components/banca/estratto-conto/colonne.ts` (+ test) | colonna `categoria`, memoria delle nascoste |
| `src/components/banca/estratto-conto/TabellaEstrattoConto.tsx`, `IconaStato.tsx`, `BarraSelezione.tsx`, `EstrattoConto.tsx` (+ test) | Categoria, azioni di riga, puntino della proposta, chip «un solo movimento», Categorizza in blocco |
| `src/components/banca/estratto-conto/CategorizzaDialog.tsx`, `CollegaFatturaDialog.tsx`, `ScollegaDialog.tsx` (+ test) | i tre dialoghi |
| `src/components/prima-nota/movimenti/MovimentiTable.tsx` (+ test) | «dalla banca» con il collegamento alla riga |
| `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx`, `page.tsx`, `src/components/reconciliation/MatchDialog.tsx` | `?movimento=`, `collega`/`scollega` al posto di `match`/`unmatch` |
| `docs/superpowers/plans/2026-08-16-riconciliazione-a2-primo-taglio.md`, `docs/RIPRESA-16-AGOSTO-SERA.md` | il task 3 dell'A2 riusa il servizio; il task 5 legge `?movimento=`; nota di ripresa |

---

## Task 1: `origineScrittura`, `residuoDocumenti` e chi li mantiene

**Files:**
- Modify: `prisma/schema.prisma` (modello `BankTransaction`, righe ~1966-1975; enum accanto a `SezioneMovimentoBancario`, riga ~2790)
- Create: `prisma/migrations/20260817090000_azioni_contabili_estratto_conto/migration.sql`
- Create: `src/lib/banca/residuo-documenti.ts`
- Test: `src/lib/banca/__tests__/residuo-documenti.test.ts`, `src/lib/banca/__tests__/residuo-documenti.itest.ts`
- Modify: `src/lib/services/schedule-reconciliation-service.ts` (`riconciliaInTransazione` riga ~863; `undoScheduleReconciliation` righe 992-1100)
- Modify: `src/lib/reconciliation/matcher.ts` (`reconcileVenueTransactions`, righe 282-290)

**Interfaces:**
- Consumes: `TransactionClient` da `@/lib/prisma`; `EsitoRicalcolo`, `bloccaMovimento`, `bloccaScadenza`, `ricalcolaStatoSchedule` da `@/lib/scadenzario/stato-schedule` (già importati nel servizio); `applicaStimaSuScadenza`, `ricalcolaStimeFornitore` da `@/lib/scadenzario/stima-data-attesa`.
- Produces:
  ```ts
  // src/lib/banca/residuo-documenti.ts
  export function calcolaResiduoDocumenti(amount: number, importiRiconciliati: number[]): number
  export async function ricalcolaResiduoDocumenti(tx: TransactionClient, journalEntryId: string): Promise<number | null>
  // src/lib/services/schedule-reconciliation-service.ts
  export async function annullaRiconciliazioneInTransazione(tx: TransactionClient, reconciliationId: string): Promise<EsitoRicalcolo | null>
  export async function dopoAnnulloRiconciliazione(esito: EsitoRicalcolo, venueId: string): Promise<void>
  ```
  e i campi Prisma `BankTransaction.origineScrittura: OrigineScritturaBancaria | null`, `BankTransaction.residuoDocumenti: Prisma.Decimal | null`.

- [ ] **Step 1: il test unitario della funzione pura**

Creare `src/lib/banca/__tests__/residuo-documenti.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcolaResiduoDocumenti } from '../residuo-documenti'

describe('calcolaResiduoDocumenti', () => {
  it('senza riconciliazioni vale zero: una riga categorizzata senza documenti è chiusa', () => {
    expect(calcolaResiduoDocumenti(-68.93, [])).toBe(0)
  })

  it('è ciò che i documenti non coprono, sul valore assoluto della riga', () => {
    expect(calcolaResiduoDocumenti(-100, [60, 30])).toBe(10)
    expect(calcolaResiduoDocumenti(907.9, [907.9])).toBe(0)
  })

  it('non scende sotto zero e arrotonda a due decimali', () => {
    expect(calcolaResiduoDocumenti(-100, [100.004])).toBe(0)
    expect(calcolaResiduoDocumenti(-100, [33.333, 33.333])).toBe(33.33)
  })
})
```

- [ ] **Step 2: eseguirlo e vederlo fallire**

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca/__tests__/residuo-documenti.test.ts` → rosso: modulo assente.

- [ ] **Step 3: schema e migrazione**

In `prisma/schema.prisma`, dentro `model BankTransaction`, subito dopo `sezione     SezioneMovimentoBancario @default(ATTIVI)`:

```prisma
  /// Da quale azione la promozione ha CREATO la scrittura collegata:
  /// `CATEGORIZZA` · `COLLEGA` · `PROPOSTA`. Nullo quando la riga è agganciata a
  /// una scrittura che esisteva già (la R4). È l'unica cosa che lo scollegamento
  /// deve ritirare (spec, «promuoviRigaBancaria»).
  origineScrittura OrigineScritturaBancaria? @map("origine_scrittura")
  /// Il residuo dei documenti, denormalizzato: |importo| − Σ riconciliazioni
  /// VERIFIED della scrittura collegata quando ne ha almeno una; 0 quando la
  /// riga è collegata senza documenti; NULL quando non è collegata. Lo
  /// mantengono la promozione, lo scollegamento e chi scrive o toglie una
  /// riconciliazione (`residuo-documenti.ts`): è ciò che permette a «Solo non
  /// riconciliati» di prendere anche i parziali in SQL, senza sommare al volo.
  residuoDocumenti Decimal? @map("residuo_documenti") @db.Decimal(12, 2)
```

e, subito dopo l'enum `SezioneMovimentoBancario`:

```prisma
/// Da quale azione è nata la scrittura collegata a una riga dell'estratto
/// conto, quando l'ha creata la promozione (spec, «Modello dati»).
enum OrigineScritturaBancaria {
  CATEGORIZZA
  COLLEGA
  PROPOSTA
}
```

Creare `prisma/migrations/20260817090000_azioni_contabili_estratto_conto/migration.sql`:

```sql
-- Estratto conto nella prima nota, consegna B: le azioni contabili.
-- Spec: docs/superpowers/specs/2026-08-16-movimenti-bancari-in-prima-nota-design.md
--
-- `origine_scrittura` dice se la scrittura collegata l'ha creata la promozione
-- e da quale azione (è ciò che lo scollegamento ritira); `residuo_documenti` è
-- il residuo dei documenti denormalizzato sulla riga, così «Solo non
-- riconciliati» prende anche i parziali in SQL.

CREATE TYPE "OrigineScritturaBancaria" AS ENUM ('CATEGORIZZA', 'COLLEGA', 'PROPOSTA');

ALTER TABLE "bank_transactions"
  ADD COLUMN "origine_scrittura" "OrigineScritturaBancaria",
  ADD COLUMN "residuo_documenti" DECIMAL(12,2);

-- Le righe già collegate a una scrittura ricevono il residuo calcolato dalle
-- riconciliazioni di quella scrittura: 0 se non ne ha (collegata senza
-- documenti), altrimenti |importo| − somma, mai sotto zero. In produzione al
-- 17 agosto nessuna riga è collegata: la UPDATE non tocca nulla, ma la
-- migrazione deve valere anche su un database che ha già usato la
-- riconciliazione.
UPDATE "bank_transactions" bt
SET "residuo_documenti" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "schedule_reconciliations" sr
    WHERE sr."journal_entry_id" = bt."matched_entry_id" AND sr."status" = 'VERIFIED'
  )
  THEN GREATEST(
    0,
    ABS(bt."amount") - (
      SELECT COALESCE(SUM(sr."amount"), 0) FROM "schedule_reconciliations" sr
      WHERE sr."journal_entry_id" = bt."matched_entry_id" AND sr."status" = 'VERIFIED'
    )
  )
  ELSE 0
END
WHERE bt."matched_entry_id" IS NOT NULL;
```

- [ ] **Step 4: verificare che schema e migrazione concordino, su un database vuoto locale**

```bash
/opt/homebrew/opt/libpq/bin/psql "postgresql://nicolascarpa@127.0.0.1:5433/postgres" -X -c 'DROP DATABASE IF EXISTS weiss_migrazioni_prova' -c 'CREATE DATABASE weiss_migrazioni_prova'
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_migrazioni_prova" PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx prisma migrate deploy
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_migrazioni_prova" PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
```

Atteso: `migrate deploy` applica tutte le migrazioni compresa `20260817090000…` (exit 0). L'output del `diff` **non deve citare** `bank_transactions` né `OrigineScritturaBancaria` (può citare gli indici parziali di `prisma/sql/constraints.sql`, che Prisma non modella: quelli sono attesi). Se cita una colonna nostra, correggere la migrazione, non lo schema.

Poi: `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx prisma generate` (exit 0) e `/opt/homebrew/opt/libpq/bin/psql "postgresql://nicolascarpa@127.0.0.1:5433/postgres" -X -c 'DROP DATABASE IF EXISTS weiss_migrazioni_prova'`.

- [ ] **Step 5: il modulo `residuo-documenti.ts`**

Creare `src/lib/banca/residuo-documenti.ts`:

```ts
import { Prisma } from '@prisma/client'
import type { TransactionClient } from '@/lib/prisma'

/**
 * Il residuo dei documenti di una riga collegata a una scrittura: |importo| −
 * Σ riconciliazioni, mai sotto zero, a due decimali. Senza riconciliazioni
 * vale 0: una riga categorizzata senza documenti è chiusa (spec, «Gli stati»),
 * e «Parzialmente abbinato» esiste solo quando qualche documento c'è ma non
 * copre tutto.
 */
export function calcolaResiduoDocumenti(amount: number, importiRiconciliati: number[]): number {
  if (importiRiconciliati.length === 0) return 0
  const coperto = importiRiconciliati.reduce((somma, x) => somma + x, 0)
  return Math.max(0, Math.round((Math.abs(amount) - coperto) * 100) / 100)
}

/**
 * Riscrive `residuoDocumenti` sulla riga di banca collegata alla scrittura, se
 * ce n'è una. Va chiamata DENTRO la transazione che ha appena creato o tolto
 * una riconciliazione, o collegato la riga: è l'unico modo perché la colonna
 * dica sempre ciò che dicono le riconciliazioni — la promozione non è l'unica
 * a scriverle, lo fa anche lo scadenzario su una scrittura promossa.
 *
 * Restituisce il residuo scritto, `null` se nessuna riga viva è collegata (una
 * riga nel Cestino non può esserlo: il Cestino rifiuta le righe collegate).
 */
export async function ricalcolaResiduoDocumenti(
  tx: TransactionClient,
  journalEntryId: string
): Promise<number | null> {
  const riga = await tx.bankTransaction.findFirst({
    where: { matchedEntryId: journalEntryId },
    select: { id: true, amount: true },
  })
  if (!riga) return null

  const riconciliazioni = await tx.scheduleReconciliation.findMany({
    where: { journalEntryId, status: 'VERIFIED' },
    select: { amount: true },
  })
  const residuo = calcolaResiduoDocumenti(
    Number(riga.amount),
    riconciliazioni.map((r) => Number(r.amount))
  )
  await tx.bankTransaction.update({
    where: { id: riga.id },
    data: { residuoDocumenti: new Prisma.Decimal(residuo.toFixed(2)) },
  })
  return residuo
}
```

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca/__tests__/residuo-documenti.test.ts` → verde.

- [ ] **Step 6: il test d'integrazione dell'aggancio (prima di scrivere l'aggancio)**

Creare `src/lib/banca/__tests__/residuo-documenti.itest.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaMovimento, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import {
  reconcileScheduleWithEntry,
  undoScheduleReconciliation,
} from '@/lib/services/schedule-reconciliation-service'
import { reconcileVenueTransactions } from '@/lib/reconciliation/matcher'

setupIntegrationDb()

async function rigaCollegata(journalEntryId: string, importo: number) {
  const venue = await venueDiTest()
  const conto = await prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Weiss', accountType: 'BANK' } })
  return prisma.bankTransaction.create({
    data: {
      venueId: venue.id,
      bankAccountId: conto.id,
      transactionDate: new Date('2026-08-03'),
      description: 'Bonifico fornitore',
      amount: importo,
      importSource: 'PSD2_GOCARDLESS',
      status: 'MANUAL',
      matchedEntryId: journalEntryId,
      residuoDocumenti: 0,
    },
  })
}

async function residuoDi(id: string) {
  const r = await prisma.bankTransaction.findUniqueOrThrow({ where: { id }, select: { residuoDocumenti: true } })
  return r.residuoDocumenti === null ? null : Number(r.residuoDocumenti)
}

describe('residuoDocumenti segue le riconciliazioni della scrittura collegata', () => {
  // La riga è collegata (0 = chiusa senza documenti); una riconciliazione fatta
  // dallo scadenzario, non dalla promozione, deve comunque aggiornarla.
  it('riconciliare la scrittura con una scadenza dallo scadenzario riscrive il residuo della riga', async () => {
    const venue = await venueDiTest()
    const movimento = await creaMovimento({ uscita: 100 })
    const riga = await rigaCollegata(movimento.id, -100)
    const scadenza = await creaScadenza({ importoTotale: 60 })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId: venue.id,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')
    expect(await residuoDi(riga.id)).toBe(40)

    if (esito.outcome !== 'ok') throw new Error('impossibile')
    const annullo = await undoScheduleReconciliation({ reconciliationId: esito.reconciliationId, venueId: venue.id })
    expect(annullo.outcome).toBe('ok')
    // Tolta l'unica riconciliazione la riga resta collegata, senza documenti: 0.
    expect(await residuoDi(riga.id)).toBe(0)
  })

  it('il vecchio auto-match che aggancia una scrittura scrive il residuo della riga', async () => {
    const venue = await venueDiTest()
    const conto = await prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Weiss', accountType: 'BANK' } })
    // Stessa data, stesso importo, stessa descrizione: il punteggio supera la
    // soglia di auto-match e la riga viene agganciata.
    const movimento = await creaMovimento({ uscita: 250, description: 'Bonifico fornitore Rossi', date: new Date('2026-08-03') })
    const riga = await prisma.bankTransaction.create({
      data: {
        venueId: venue.id,
        bankAccountId: conto.id,
        transactionDate: new Date('2026-08-03'),
        description: 'Bonifico fornitore Rossi',
        amount: -250,
        importSource: 'PSD2_GOCARDLESS',
        status: 'PENDING',
      },
    })

    await reconcileVenueTransactions(venue.id)

    const dopo = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: riga.id } })
    expect(dopo.matchedEntryId).toBe(movimento.id)
    expect(Number(dopo.residuoDocumenti)).toBe(0)
  })
})
```

`TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/lib/banca/__tests__/residuo-documenti.itest.ts` → rosso: il residuo resta 0 / `null` perché nessuno lo ricalcola. (Se il secondo test non aggancia — punteggio sotto soglia — alzare la somiglianza usando esattamente la stessa descrizione e la stessa data, come sopra: la soglia di auto-match è 0,9 e con importo, data e descrizione identici il punteggio è 1.)

- [ ] **Step 7: gli agganci nel servizio delle riconciliazioni e nel vecchio motore**

In `src/lib/services/schedule-reconciliation-service.ts`:

1. Aggiungere l'import `import { ricalcolaResiduoDocumenti } from '@/lib/banca/residuo-documenti'` e `type EsitoRicalcolo` nell'import da `@/lib/scadenzario/stato-schedule`.

2. In `riconciliaInTransazione`, subito dopo `const stato = await ricalcolaStatoSchedule(tx, scheduleId)` / `if (!stato) return …` e prima del `return { outcome: 'ok', … }`:

```ts
  // La riga di banca collegata al movimento, se c'è, porta il residuo dei
  // documenti denormalizzato: si riallinea qui, dove la riconciliazione nasce,
  // e non solo nella promozione — lo scadenzario riconcilia anche scritture
  // promosse, e la lista deve dirlo.
  await ricalcolaResiduoDocumenti(tx, journalEntryId)
```

3. Sostituire per intero `undoScheduleReconciliation` (righe 992-1100) con le tre funzioni seguenti — il corpo della transazione è **lo stesso di prima**, spostato in `annullaRiconciliazioneInTransazione` con la rilettura degli identificativi dentro la transazione e il ricalcolo del residuo in fondo; i commenti esistenti si conservano:

```ts
/**
 * Il corpo dell'annullo, dentro una transazione GIÀ APERTA: come
 * `riconciliaInTransazione`, esiste perché Prisma non annida le transazioni
 * interattive e lo scollegamento di una riga di banca deve ritirare le
 * riconciliazioni della scrittura promossa nello stesso atto in cui la ritira.
 *
 * Restituisce l'esito del ricalcolo della scadenza (per `dopoAnnulloRiconciliazione`)
 * o `null` se la riconciliazione non c'è (più).
 */
export async function annullaRiconciliazioneInTransazione(
  tx: TransactionClient,
  reconciliationId: string
): Promise<EsitoRicalcolo | null> {
  const riferimento = await tx.scheduleReconciliation.findFirst({
    where: { id: reconciliationId, status: 'VERIFIED' },
    select: { scheduleId: true, journalEntryId: true },
  })
  if (!riferimento) return null

  // Stesso ordine di acquisizione dei lock della riconciliazione
  // (movimento, poi scadenza): invertirlo qui basterebbe a produrre deadlock
  // fra un annullo e una riconciliazione concorrenti.
  const movimento = await bloccaMovimento(tx, riferimento.journalEntryId)
  await bloccaScadenza(tx, riferimento.scheduleId)

  const reconciliation = await tx.scheduleReconciliation.findFirst({
    where: { id: reconciliationId, status: 'VERIFIED' },
    select: { id: true, scheduleId: true, journalEntryId: true, paymentId: true },
  })
  if (!reconciliation) return null

  // Le fette come stanno PRIMA della cancellazione: dopo la `deleteMany` la
  // domanda «quanta IVA dichiaravano in tutto» non è più rispondibile, e
  // senza quella risposta non si può decidere se l'IVA di testata sia
  // nostra da ritirare (vedi `ritiraIvaDiTestata`).
  const fettePrima = movimento
    ? await tx.journalEntryAllocation.findMany({
        where: { journalEntryId: reconciliation.journalEntryId },
        select: { iva: true, reconciliationId: true },
      })
    : []

  // Le fette ereditate (Fase 3) vanno ritirate PRIMA di cancellare la
  // riconciliazione: la FK JournalEntryAllocation.reconciliationId è
  // onDelete: SetNull, quindi cancellando prima la riconciliazione il DB
  // azzera solo il riferimento e le fette restano orfane invece di sparire.
  const fetteRitirate = await tx.journalEntryAllocation.deleteMany({
    where: { reconciliationId },
  })

  await tx.scheduleReconciliation.delete({ where: { id: reconciliationId } })

  if (reconciliation.paymentId) {
    await tx.schedulePayment.delete({ where: { id: reconciliation.paymentId } })
  }

  const stato = await ricalcolaStatoSchedule(tx, reconciliation.scheduleId)

  // Nessuna fetta ritirata: niente è cambiato sul movimento, non si tocca
  // (stesso principio del no-op di setEntryAllocations).
  //
  // Il movimento può anche non esserci più: eliminare una chiusura di cassa
  // cancella le scritture che ha generato, riconciliate comprese. L'annullo
  // deve comunque liberare la scadenza — altrimenti resterebbe pagata per
  // sempre a fronte di un movimento inesistente — ma su una riga cancellata
  // non si scrive.
  //
  // Il centro di costo non viene toccato: contesto interattivo, asimmetrico
  // rispetto all'ereditarietà e di proposito. L'undo è un gesto umano
  // deliberato, e il centro precedente non è ripristinabile perché non se ne
  // tiene lo storico. Il movimento conserva quindi il centro che
  // l'ereditarietà gli aveva dato, ma con la sua provenienza: se era
  // 'supposto' resta 'supposto', quindi nessuna automazione lo promuoverà a
  // verificato e la prossima riconciliazione lo rivaluterà da capo.
  if (movimento && fetteRitirate.count > 0) {
    // L'IVA di testata segue le fette anche all'indietro: se era la loro,
    // scende a quella delle rimaste, o torna a `null` se non ne resta
    // nessuna. Prima dell'ereditarietà con l'IVA questo passaggio non
    // serviva, perché `vatAmount` non veniva mai scritto.
    await ritiraIvaDiTestata(tx, {
      journalEntryId: reconciliation.journalEntryId,
      reconciliationId,
      fettePrima,
    })

    const numeroFette = await aggiornaContoDominante(tx, reconciliation.journalEntryId)
    if (numeroFette === 0) {
      // Fette ereditate ritirate e nessuna residua: il movimento torna alla
      // categorizzazione semplice, accountId resta l'ultimo valorizzato.
      await tx.journalEntry.update({
        where: { id: reconciliation.journalEntryId },
        data: { categorizationSource: 'manual' },
      })
    }
  }

  // La riga di banca collegata, se c'è, deve smettere di contare questa
  // riconciliazione nel suo residuo (vedi `riconciliaInTransazione`).
  await ricalcolaResiduoDocumenti(tx, reconciliation.journalEntryId)

  return stato
}

/**
 * Il seguito dell'annullo, FUORI dalla transazione: la scadenza è di nuovo
 * aperta e la storia del fornitore ha un'osservazione in meno. Lo devono fare
 * entrambi i chiamanti — l'annullo dallo scadenzario e lo scollegamento della
 * riga di banca — e tenerlo dentro la transazione allungherebbe i lock per un
 * lavoro che non ha bisogno di essere atomico con essi.
 */
export async function dopoAnnulloRiconciliazione(esito: EsitoRicalcolo, venueId: string): Promise<void> {
  // La scadenza è di nuovo aperta: se il fornitore ha una storia, la data
  // attesa torna a essere stimata invece di restare secca sulla contrattuale
  await applicaStimaSuScadenza(esito.scheduleId, venueId)

  // L'undo toglie anche un'osservazione dalla storia del fornitore: le stime
  // delle sue altre scadenze aperte non devono più incorporare il dato revocato
  if (esito.tipo === 'passiva' && esito.supplierId) {
    await ricalcolaStimeFornitore(esito.supplierId, venueId)
  }
}

/**
 * Annulla una riconciliazione: cancella il record e il pagamento generato,
 * ricalcola lo stato della scadenza. È l'operazione inversa, per quando un match
 * si rivela sbagliato.
 *
 * Il ritorno indietro riguarda anche la fattura: prima l'undo cancellava
 * riconciliazione e pagamento ma lasciava `ElectronicInvoice` su PAID, e la
 * fattura restava pagata per sempre. Se ne occupa `ricalcolaStatoSchedule`,
 * che allinea la fattura in entrambe le direzioni.
 */
export async function undoScheduleReconciliation({
  reconciliationId,
  venueId,
}: {
  reconciliationId: string
  venueId: string
}): Promise<{ outcome: 'ok'; scheduleStato: string } | { outcome: 'not_found' }> {
  const riferimento = await prisma.scheduleReconciliation.findFirst({
    where: { id: reconciliationId, status: 'VERIFIED', schedule: { venueId } },
    select: { id: true },
  })
  if (!riferimento) return { outcome: 'not_found' }

  const esito = await prisma.$transaction((tx) => annullaRiconciliazioneInTransazione(tx, reconciliationId))
  if (!esito) return { outcome: 'not_found' }

  await dopoAnnulloRiconciliazione(esito, venueId)

  return { outcome: 'ok', scheduleStato: esito.stato }
}
```

(Le tre righe di documentazione che precedevano `undoScheduleReconciliation` — «Annulla una riconciliazione…», «Il ritorno indietro riguarda anche la fattura…» — restano sulla funzione pubblica come sopra: controllare di non lasciarne una copia orfana.)

In `src/lib/reconciliation/matcher.ts`, aggiungere in cima `import { ricalcolaResiduoDocumenti } from '@/lib/banca/residuo-documenti'` e, in `reconcileVenueTransactions`, subito dopo la `prisma.bankTransaction.update({ … data: { status: newStatus, matchedEntryId, matchConfidence } })` (riga ~290):

```ts
    // L'aggancio a una scrittura esistente porta con sé il residuo dei suoi
    // documenti sulla riga: senza, la legenda direbbe «abbinato» anche dove
    // la scrittura copre solo una parte.
    if (matchedEntryId) await ricalcolaResiduoDocumenti(prisma, matchedEntryId)
```

- [ ] **Step 8: eseguire i test toccati**

```bash
TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/lib/banca/__tests__/residuo-documenti.itest.ts src/lib/services/__tests__ src/app/api/scadenzario src/app/api/prima-nota
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
```

Atteso: tutto verde (le suite delle riconciliazioni e dell'annullo esistenti coprono l'estrazione: se una cade, è l'estrazione ad aver cambiato comportamento, non il test), `tsc` exit 0.

- [ ] **Step 9: commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260817090000_azioni_contabili_estratto_conto src/lib/banca/residuo-documenti.ts src/lib/banca/__tests__/residuo-documenti.test.ts src/lib/banca/__tests__/residuo-documenti.itest.ts src/lib/services/schedule-reconciliation-service.ts src/lib/reconciliation/matcher.ts
git commit -m "feat(banca): origine della scrittura e residuo dei documenti sulla riga, mantenuto da chi scrive le riconciliazioni

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: la lista legge lo stato dalla colonna, e mostra la Categoria

**Files:**
- Modify: `src/lib/banca/stato-legenda.ts` (+ riscrivere `src/lib/banca/__tests__/stato-legenda.test.ts`)
- Modify: `src/lib/banca/filtri-estratto-conto.ts` (+ `src/lib/banca/__tests__/filtri-estratto-conto.test.ts`)
- Modify: `src/lib/banca/query-estratto-conto.ts`
- Modify: `src/types/reconciliation.ts`
- Modify: `src/app/api/bank-transactions/__tests__/lista.itest.ts`

**Interfaces:**
- Consumes: `residuoDocumenti`, `origineScrittura` (Task 1).
- Produces:
  ```ts
  // src/lib/banca/stato-legenda.ts
  export function statoLegenda(r: { matchedEntryId: string | null; status: string; amount: number; residuoDocumenti: number | null }): { stato: StatoLegenda; residuo: number; proposta: boolean }
  // src/types/reconciliation.ts
  export type OrigineScritturaBancaria = 'CATEGORIZZA' | 'COLLEGA' | 'PROPOSTA'
  export interface ScritturaCollegata { id; date; description; debitAmount; creditAmount; documentRef; account: { id; code; name } | null; costCenter: { id; code; name } | null; fette: number }
  // RigaEstrattoConto: + matchedEntry: ScritturaCollegata | null, origineScrittura, residuoDocumenti, proposta
  // filtri: + movimento?: string
  ```

- [ ] **Step 1: riscrivere il test della legenda**

Sostituire per intero `src/lib/banca/__tests__/stato-legenda.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { statoLegenda } from '../stato-legenda'

describe('statoLegenda — la legenda di CashKing sul nostro modello, letta dalla colonna', () => {
  it('senza scrittura è «Non abbinato», col residuo pari all\'importo', () => {
    expect(statoLegenda({ matchedEntryId: null, status: 'PENDING', amount: -68.93, residuoDocumenti: null })).toEqual({
      stato: 'non_abbinato',
      residuo: 68.93,
      proposta: false,
    })
  })

  // Il vecchio motore scrive matchedEntryId anche sulle proposte da rivedere:
  // una proposta non è un abbinamento, e si segnala col puntino.
  it('una proposta da rivedere è «Non abbinato» col puntino, anche se porta una scrittura', () => {
    expect(statoLegenda({ matchedEntryId: 'e1', status: 'TO_REVIEW', amount: 100, residuoDocumenti: 0 })).toEqual({
      stato: 'non_abbinato',
      residuo: 100,
      proposta: true,
    })
  })

  it('collegata con documenti che non coprono tutto è «Parzialmente abbinato» col residuo', () => {
    expect(statoLegenda({ matchedEntryId: 'e1', status: 'MANUAL', amount: -100, residuoDocumenti: 40 })).toEqual({
      stato: 'parziale',
      residuo: 40,
      proposta: false,
    })
  })

  it('collegata dall\'utente, senza residuo, è «Abbinato manualmente»', () => {
    expect(statoLegenda({ matchedEntryId: 'e1', status: 'MANUAL', amount: -0.75, residuoDocumenti: 0 })).toEqual({
      stato: 'abbinato_manualmente',
      residuo: 0,
      proposta: false,
    })
  })

  it('collegata dal motore o da una proposta approvata, senza residuo, è «Riconciliato»', () => {
    expect(statoLegenda({ matchedEntryId: 'e1', status: 'MATCHED', amount: 907.9, residuoDocumenti: 0 })).toEqual({
      stato: 'riconciliato',
      residuo: 0,
      proposta: false,
    })
  })

  // Le righe agganciate prima della colonna, o dal vecchio motore senza
  // ricalcolo, hanno la colonna nulla: collegate senza documenti.
  it('una colonna nulla su una riga collegata vale zero', () => {
    expect(statoLegenda({ matchedEntryId: 'e1', status: 'MATCHED', amount: 10, residuoDocumenti: null }).stato).toBe('riconciliato')
  })
})
```

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca/__tests__/stato-legenda.test.ts` → rosso (la firma è ancora quella con `importiRiconciliati`).

- [ ] **Step 2: `stato-legenda.ts`**

Sostituire per intero:

```ts
import type { StatoLegenda } from '@/types/reconciliation'

/**
 * La legenda di CashKing sul nostro modello (spec, «Gli stati»): «abbinato»
 * vuol dire collegata a una scrittura, con o senza documenti; il residuo dei
 * documenti sta denormalizzato sulla riga (`residuoDocumenti`, consegna B) ed è
 * la stessa colonna che filtra «Solo non riconciliati» in SQL, così legenda,
 * filtro e conteggi dicono la stessa cosa. Pura.
 *
 * `status = TO_REVIEW` è una proposta del vecchio motore, che scrive
 * `matchedEntryId` senza che nessuno abbia confermato: non è un abbinamento, e
 * si segnala col puntino («c'è una proposta»).
 */
export function statoLegenda(r: {
  matchedEntryId: string | null
  status: string
  amount: number
  residuoDocumenti: number | null
}): { stato: StatoLegenda; residuo: number; proposta: boolean } {
  const proposta = r.status === 'TO_REVIEW'
  if (!r.matchedEntryId || proposta) {
    return { stato: 'non_abbinato', residuo: Math.abs(r.amount), proposta }
  }
  const residuo = r.residuoDocumenti ?? 0
  if (residuo > 0) return { stato: 'parziale', residuo, proposta: false }
  if (r.status === 'MANUAL') return { stato: 'abbinato_manualmente', residuo: 0, proposta: false }
  return { stato: 'riconciliato', residuo: 0, proposta: false }
}
```

→ il test del passo 1 verde.

- [ ] **Step 3: i tipi**

In `src/types/reconciliation.ts`:

1. Dopo `export type StatoLegenda = …` aggiungere:

```ts
export type OrigineScritturaBancaria = 'CATEGORIZZA' | 'COLLEGA' | 'PROPOSTA'

/**
 * La scrittura collegata come la vede la lista: quanto basta alla colonna
 * Categoria e ai dialoghi. `fette` conta le ripartizioni: con fette, Categorizza
 * non riscrive il conto (lo governa la suddivisione).
 */
export interface ScritturaCollegata {
  id: string
  date: Date
  description: string
  debitAmount: number | null
  creditAmount: number | null
  documentRef: string | null
  account: { id: string; code: string; name: string } | null
  costCenter: { id: string; code: string; name: string } | null
  fette: number
}
```

2. In `RigaEstrattoConto` aggiungere i campi:

```ts
  matchedEntry: ScritturaCollegata | null
  /** Da quale azione la promozione ha creato la scrittura; nullo se esisteva già (R4) o se non è collegata. */
  origineScrittura: OrigineScritturaBancaria | null
  /** Il residuo dei documenti denormalizzato; nullo se la riga non è collegata. */
  residuoDocumenti: number | null
  /** C'è una proposta del motore da rivedere (`status = TO_REVIEW`). */
  proposta: boolean
```

- [ ] **Step 4: il filtro `movimento` e il test**

In `src/lib/banca/filtri-estratto-conto.ts`, dentro `filtriEstrattoContoSchema` dopo `status`:

```ts
  // Il collegamento profondo a una riga sola («dalla banca» nella scheda
  // Scritture, `/riconciliazione?movimento=`): la lista mostra quella riga e un
  // chip per tornare a tutte.
  movimento: z.string().min(1).max(50).optional(),
```

e in `filtriInSearchParams`, dopo `metti('dateTo', …)`: `metti('movimento', f.movimento, undefined)`.

In `src/lib/banca/__tests__/filtri-estratto-conto.test.ts` aggiungere un caso (in fondo al `describe` esistente):

```ts
  it('«movimento» va e torna dall\'URL', () => {
    const f = filtriDaSearchParams(new URLSearchParams('movimento=abc123'))
    expect(f.movimento).toBe('abc123')
    expect(filtriInSearchParams(f).get('movimento')).toBe('abc123')
    expect(filtriInSearchParams({ ...f, movimento: undefined }).has('movimento')).toBe(false)
  })
```

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca/__tests__/filtri-estratto-conto.test.ts` → verde.

- [ ] **Step 5: i casi nuovi della lista, prima di toccare la query**

In `src/app/api/bank-transactions/__tests__/lista.itest.ts`:

1. Nell'aiutante `riga(…)`, ai `dati` accettati aggiungere `residuoDocumenti?: number` e nel `create` la riga `residuoDocumenti: dati.residuoDocumenti ?? null,`.

2. Sostituire il caso `'calcola lo stato della legenda per riga'` con questi tre:

```ts
  it('calcola lo stato della legenda per riga, dalla colonna del residuo', async () => {
    const { venueId, contoId, centroId } = await contesto()
    const conto = await prisma.account.findFirstOrThrow({ where: { type: 'COSTO', isActive: true } })
    const scrittura = await prisma.journalEntry.create({
      data: { venueId, date: new Date('2026-08-01'), registerType: 'BANK', description: 'Commissioni', creditAmount: 0.75, costCenterId: centroId, accountId: conto.id },
    })
    const parziale = await prisma.journalEntry.create({
      data: { venueId, date: new Date('2026-08-02'), registerType: 'BANK', description: 'Bonifico', creditAmount: 100, costCenterId: centroId },
    })
    await riga(venueId, contoId, { data: '2026-08-01', importo: -0.75, descrizione: 'commissione', matchedEntryId: scrittura.id, status: 'MANUAL', residuoDocumenti: 0 })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -100, descrizione: 'parziale', matchedEntryId: parziale.id, status: 'MANUAL', residuoDocumenti: 40 })
    await riga(venueId, contoId, { data: '2026-08-03', importo: -20, descrizione: 'libera' })

    const tutte = await lista('ordina=data&verso=asc')
    expect(tutte.body.data.map((r) => [r.descrizione, r.stato, r.residuo])).toEqual([
      ['commissione', 'abbinato_manualmente', 0],
      ['parziale', 'parziale', 40],
      ['libera', 'non_abbinato', 20],
    ])
    // La Categoria viene dalla scrittura collegata.
    expect(tutte.body.data[0].matchedEntry?.account?.code).toBe(conto.code)
    expect(tutte.body.data[0].matchedEntry?.costCenter?.id).toBe(centroId)
    expect(tutte.body.data[2].matchedEntry).toBeNull()
  })

  it('«Solo non riconciliati» prende le libere, i parziali e le proposte da rivedere', async () => {
    const { venueId, contoId, centroId } = await contesto()
    const s1 = await prisma.journalEntry.create({ data: { venueId, date: new Date('2026-08-01'), registerType: 'BANK', description: 'a', creditAmount: 10, costCenterId: centroId } })
    const s2 = await prisma.journalEntry.create({ data: { venueId, date: new Date('2026-08-02'), registerType: 'BANK', description: 'b', creditAmount: 10, costCenterId: centroId } })
    const s3 = await prisma.journalEntry.create({ data: { venueId, date: new Date('2026-08-03'), registerType: 'BANK', description: 'c', creditAmount: 10, costCenterId: centroId } })
    await riga(venueId, contoId, { data: '2026-08-01', importo: -10, descrizione: 'chiusa', matchedEntryId: s1.id, status: 'MANUAL', residuoDocumenti: 0 })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -10, descrizione: 'parziale', matchedEntryId: s2.id, status: 'MANUAL', residuoDocumenti: 4 })
    await riga(venueId, contoId, { data: '2026-08-03', importo: -10, descrizione: 'proposta', matchedEntryId: s3.id, status: 'TO_REVIEW', residuoDocumenti: 0 })
    await riga(venueId, contoId, { data: '2026-08-04', importo: -10, descrizione: 'libera' })

    const aperte = await lista('soloNonRiconciliati=1&ordina=data&verso=asc')
    expect(aperte.body.data.map((r) => [r.descrizione, r.stato, r.proposta])).toEqual([
      ['parziale', 'parziale', false],
      ['proposta', 'non_abbinato', true],
      ['libera', 'non_abbinato', false],
    ])
  })

  it('«movimento» restringe la lista a una riga sola', async () => {
    const { venueId, contoId } = await contesto()
    const una = await riga(venueId, contoId, { data: '2026-08-01', importo: -1, descrizione: 'una' })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -2, descrizione: 'altra' })
    const sola = await lista(`movimento=${una.id}`)
    expect(sola.body.data.map((r) => r.descrizione)).toEqual(['una'])
    expect(sola.body.pagination.total).toBe(1)
  })
```

`TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/app/api/bank-transactions/__tests__/lista.itest.ts` → rossi i tre casi nuovi (e `tsc` si lamenta di `residuoDocumenti` in `mappaRiga`: è atteso finché il passo 6 non è fatto).

- [ ] **Step 6: `query-estratto-conto.ts`**

Sostituire per intero:

```ts
import { Prisma } from '@prisma/client'
import type { FiltriEstrattoConto } from './filtri-estratto-conto'
import { CAMPI_BADGE } from './cronologia'
import { statoLegenda } from './stato-legenda'
import type { RigaEstrattoConto } from '@/types/reconciliation'

/** Il `where` della lista. `deletedAt` è sempre esplicito: è ciò che apre o chiude il Cestino. */
export function costruisciWhere(f: FiltriEstrattoConto, venueId: string): Prisma.BankTransactionWhereInput {
  const where: Prisma.BankTransactionWhereInput = { venueId }
  if (f.cestino) {
    where.deletedAt = { not: null }
  } else {
    where.deletedAt = null
    where.sezione = f.sezione
  }
  if (f.movimento) where.id = f.movimento
  if (f.tipo === 'entrate') where.amount = { gt: 0 }
  if (f.tipo === 'uscite') where.amount = { lt: 0 }
  if (f.bankAccountId) where.bankAccountId = f.bankAccountId
  // «Non riconciliata» = Non abbinato + Parzialmente abbinato (spec, «Gli
  // stati»): senza scrittura, con una proposta da rivedere, o col residuo dei
  // documenti ancora aperto. In `AND`, perché `OR` è della ricerca.
  if (f.soloNonRiconciliati) {
    where.AND = [{ OR: [{ matchedEntryId: null }, { status: 'TO_REVIEW' }, { residuoDocumenti: { gt: 0 } }] }]
  }
  if (f.status) where.status = f.status
  if (f.dateFrom || f.dateTo) {
    where.transactionDate = {
      ...(f.dateFrom ? { gte: new Date(`${f.dateFrom}T00:00:00.000Z`) } : {}),
      ...(f.dateTo ? { lte: new Date(`${f.dateTo}T00:00:00.000Z`) } : {}),
    }
  }
  if (f.search) {
    const contiene = { contains: f.search, mode: 'insensitive' as const }
    where.OR = [
      { descrizione: contiene },
      { causale: contiene },
      { note: contiene },
      { description: contiene },
      { bankReference: contiene },
    ]
  }
  return where
}

/** Ordinamento lato server, due stati; le righe non ancora ricalcolate (descrizione nulla) vanno in fondo. */
export function costruisciOrderBy(f: FiltriEstrattoConto): Prisma.BankTransactionOrderByWithRelationInput[] {
  switch (f.ordina) {
    case 'descrizione':
      return [{ descrizione: { sort: f.verso, nulls: 'last' } }, { transactionDate: 'desc' }]
    case 'causale':
      return [{ causale: { sort: f.verso, nulls: 'last' } }, { transactionDate: 'desc' }]
    case 'importo':
      return [{ amount: f.verso }, { transactionDate: 'desc' }]
    default:
      return [{ transactionDate: f.verso }, { createdAt: f.verso }]
  }
}

export const SELEZIONE_RIGA = {
  include: {
    venue: { select: { id: true, name: true, code: true } },
    bankAccount: { select: { id: true, name: true } },
    // La scrittura collegata porta la Categoria (conto e centro) e il numero di
    // fette; il residuo dei documenti NON si somma qui: sta sulla riga
    // (`residuoDocumenti`), ed è la stessa colonna che filtra.
    matchedEntry: {
      select: {
        id: true,
        date: true,
        description: true,
        debitAmount: true,
        creditAmount: true,
        documentRef: true,
        account: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        _count: { select: { allocations: true } },
      },
    },
    // Il badge «Modificato» guarda solo i campi del movimento: spostare di
    // scheda non è una modifica (spec, «La cronologia»). L'elenco è quello di
    // `CAMPI_BADGE` e non una copia scritta qui: due liste della stessa cosa
    // divergono al primo campo aggiunto, e il badge lo direbbe di nascosto.
    _count: { select: { modifiche: { where: { campo: { in: [...CAMPI_BADGE] } } } } },
  },
} satisfies Prisma.BankTransactionDefaultArgs

export function mappaRiga(r: Prisma.BankTransactionGetPayload<typeof SELEZIONE_RIGA>): RigaEstrattoConto {
  const amount = Number(r.amount)
  const residuoDocumenti = r.residuoDocumenti === null ? null : Number(r.residuoDocumenti)
  const { stato, residuo, proposta } = statoLegenda({
    matchedEntryId: r.matchedEntryId,
    status: r.status,
    amount,
    residuoDocumenti,
  })
  const { _count, matchedEntry, ...resto } = r
  return {
    ...resto,
    amount,
    balanceAfter: r.balanceAfter ? Number(r.balanceAfter) : null,
    matchConfidence: r.matchConfidence ? Number(r.matchConfidence) : null,
    residuoDocumenti,
    matchedEntry: matchedEntry
      ? {
          id: matchedEntry.id,
          date: matchedEntry.date,
          description: matchedEntry.description,
          debitAmount: matchedEntry.debitAmount ? Number(matchedEntry.debitAmount) : null,
          creditAmount: matchedEntry.creditAmount ? Number(matchedEntry.creditAmount) : null,
          documentRef: matchedEntry.documentRef,
          account: matchedEntry.account,
          costCenter: matchedEntry.costCenter,
          fette: matchedEntry._count.allocations,
        }
      : null,
    modificato: _count.modifiche > 0,
    stato,
    residuo,
    proposta,
  }
}
```

(`origineScrittura` arriva con `...resto`, come `sezione` e `note`.)

- [ ] **Step 7: eseguire**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca src/components/banca
TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/app/api/bank-transactions
```

Atteso: `tsc` pulito; unit verdi (i test dei componenti costruiscono righe finte con `as unknown as RigaEstrattoConto`, quindi non si rompono per i campi nuovi; se una fixture tipizzata li richiede, aggiungere `origineScrittura: null, residuoDocumenti: null, proposta: false`); integrazione verde compresi i tre casi nuovi.

- [ ] **Step 8: commit**

```bash
git add src/lib/banca/stato-legenda.ts src/lib/banca/__tests__/stato-legenda.test.ts src/lib/banca/filtri-estratto-conto.ts src/lib/banca/__tests__/filtri-estratto-conto.test.ts src/lib/banca/query-estratto-conto.ts src/types/reconciliation.ts src/app/api/bank-transactions/__tests__/lista.itest.ts
git commit -m "feat(banca): la lista legge stato e residuo dalla colonna, con la Categoria e il filtro per un solo movimento

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: `promuoviRigaBancaria`, il servizio unico

**Files:**
- Create: `src/lib/services/promozione-riga-bancaria-service.ts`
- Test: `src/lib/services/__tests__/promozione-riga-bancaria-service.itest.ts`

**Interfaces:**
- Consumes: `riconciliaInTransazione`, `dopoLaRiconciliazione`, `EsitoInterno`, `ReconcileInput` da `@/lib/services/schedule-reconciliation-service` (righe 758-941); `toDebitCredit` da `@/lib/prima-nota-utils:162`; `risolviCentroDiCosto` da `@/lib/services/cost-center-service:149` (accetta il client di transazione); `TOLLERANZA_IMPORTI` da `@/lib/scadenzario/stato-schedule`; `ricalcolaResiduoDocumenti` (Task 1).
- Produces:
  ```ts
  export type OriginePromozione = 'categorizza' | 'collega' | 'proposta'
  export interface Imputazione { accountId: string; costCenterId?: string }
  export interface InputPromozione {
    bankTransactionId: string; venueId: string; userId: string | null; origine: OriginePromozione
    imputazione?: Imputazione
    scadenze?: Array<{ scheduleId: string; amount: number }>
    scritturaEsistenteId?: string
    confidence?: number
  }
  export type EsitoPromozione =
    | { outcome: 'ok'; journalEntryId: string; reconciliationIds: string[]; residuo: number; creata: boolean }
    | { outcome: 'riga_non_trovata' } | { outcome: 'riga_nel_cestino' }
    | { outcome: 'riga_gia_collegata'; journalEntryId: string }
    | { outcome: 'importo_eccedente'; residuo: number }
    | { outcome: 'scrittura_non_trovata' } | { outcome: 'scrittura_gia_collegata_ad_altra_riga' }
    | { outcome: 'imputazione_non_valida'; motivo: string; code?: string }
    | { outcome: 'riconciliazione_rifiutata'; scheduleId: string; motivo: string }
  export class PromozioneRifiutata extends Error { readonly esito: Exclude<EsitoPromozione, { outcome: 'ok' }> }
  export interface PromozioneInTransazione { esito: Extract<EsitoPromozione, { outcome: 'ok' }>; seguiti: Array<{ risultato: EsitoInterno; input: ReconcileInput }> }
  export async function promuoviRigaBancariaInTransazione(tx: TransactionClient, input: InputPromozione): Promise<PromozioneInTransazione>  // lancia PromozioneRifiutata
  export async function promuoviRigaBancaria(input: InputPromozione): Promise<EsitoPromozione>
  ```
  Il piano A2 (task 3) chiama `promuoviRigaBancariaInTransazione` dentro la propria transazione, cattura `PromozioneRifiutata` e chiama `dopoLaRiconciliazione` per ogni voce di `seguiti` fuori dalla transazione (Task 10 di questo piano lo scrive nel piano A2).

- [ ] **Step 1: il test d'integrazione**

Creare `src/lib/services/__tests__/promozione-riga-bancaria-service.itest.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest, centroDiCosto } from '@/test/integration/fixtures/closures'
import { creaMovimento, creaScadenza, fornitoreDiTest, rileggiScadenza } from '@/test/integration/fixtures/scadenzario'
import { promuoviRigaBancaria } from '../promozione-riga-bancaria-service'

setupIntegrationDb()

async function contesto() {
  const venue = await venueDiTest()
  const conto = await prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Weiss', accountType: 'BANK' } })
  const contoCosto = await prisma.account.findFirstOrThrow({ where: { type: 'COSTO', isActive: true, costCenterRule: 'DEFAULT_STR' } })
  return { venueId: venue.id, contoId: conto.id, contoCostoId: contoCosto.id }
}

/** Una riga della banca come la scrive il mapper: testo grezzo, descrizione e causale separate. */
async function rigaBanca(venueId: string, contoId: string, importo: number, extra: { descrizione?: string | null } = {}) {
  return prisma.bankTransaction.create({
    data: {
      venueId,
      bankAccountId: contoId,
      transactionDate: new Date('2026-08-10'),
      description: 'Bonifico tramite Internet Banking *ROSSI SRL FT 12',
      descrizione: extra.descrizione === undefined ? 'ROSSI SRL FT 12' : extra.descrizione,
      causale: 'Bonifico tramite internet banking',
      amount: importo,
      importSource: 'PSD2_GOCARDLESS',
      status: 'PENDING',
    },
  })
}

/** La scrittura come sta sul database, cancellata compresa: il client la filtrerebbe. */
async function scritturaGrezza(id: string) {
  const righe = await prisma.$queryRaw<
    Array<{ deleted_at: Date | null; account_id: string | null; cost_center_id: string; verified: boolean; debit_amount: unknown; credit_amount: unknown; description: string; date: Date; entry_type: string | null; register_type: string; counterpart_name: string | null; document_ref: string | null }>
  >`SELECT deleted_at, account_id, cost_center_id, verified, debit_amount, credit_amount, description, date, entry_type, register_type, counterpart_name, document_ref FROM journal_entries WHERE id = ${id}`
  return righe[0] ?? null
}

async function rigaDopo(id: string) {
  return prisma.bankTransaction.findUniqueOrThrow({ where: { id } })
}

/** Un conto con la regola OBBLIGATORIO: dal seed, o creato apposta se il seed non ne ha. */
async function contoObbligatorio() {
  const dalSeed = await prisma.account.findFirst({ where: { costCenterRule: 'OBBLIGATORIO', isActive: true } })
  if (dalSeed) return dalSeed
  return prisma.account.create({ data: { code: 'PROVA-OBB', name: 'Conto di prova (centro obbligatorio)', type: 'COSTO', costCenterRule: 'OBBLIGATORIO' } })
}

describe('promuoviRigaBancaria', () => {
  it('Categorizza crea la scrittura BANK dalla riga, una sola volta, e la lega', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const centro = await centroDiCosto('WEISS')
    const riga = await rigaBanca(venueId, contoId, -68.93)

    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza',
      imputazione: { accountId: contoCostoId, costCenterId: centro },
    })
    expect(esito.outcome).toBe('ok')
    if (esito.outcome !== 'ok') throw new Error('impossibile')
    expect(esito.creata).toBe(true)
    expect(esito.reconciliationIds).toEqual([])
    expect(esito.residuo).toBe(0)

    const scrittura = await scritturaGrezza(esito.journalEntryId)
    expect(scrittura?.register_type).toBe('BANK')
    expect(scrittura?.entry_type).toBe('USCITA')
    expect(scrittura?.date.toISOString().slice(0, 10)).toBe('2026-08-10')
    expect(Number(scrittura?.credit_amount)).toBe(68.93)
    expect(scrittura?.debit_amount).toBeNull()
    expect(scrittura?.description).toBe('ROSSI SRL FT 12') // descrizione ?? description
    expect(scrittura?.account_id).toBe(contoCostoId)
    expect(scrittura?.cost_center_id).toBe(centro)
    expect(scrittura?.verified).toBe(true)

    const dopo = await rigaDopo(riga.id)
    expect(dopo.matchedEntryId).toBe(esito.journalEntryId)
    expect(dopo.status).toBe('MANUAL')
    expect(dopo.origineScrittura).toBe('CATEGORIZZA')
    expect(Number(dopo.residuoDocumenti)).toBe(0)
    expect(dopo.reconciledAt).not.toBeNull()

    // Una seconda categorizzazione aggiorna la stessa scrittura: non ne nasce un'altra.
    const altroConto = await prisma.account.findFirstOrThrow({ where: { type: 'COSTO', isActive: true, costCenterRule: 'DEFAULT_STR', id: { not: contoCostoId } } })
    const secondo = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: altroConto.id },
    })
    expect(secondo.outcome).toBe('ok')
    if (secondo.outcome !== 'ok') throw new Error('impossibile')
    expect(secondo.creata).toBe(false)
    expect(secondo.journalEntryId).toBe(esito.journalEntryId)
    expect((await scritturaGrezza(esito.journalEntryId))?.account_id).toBe(altroConto.id)
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(1)
  })

  it('senza descrizione letta la scrittura prende il testo grezzo della banca', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, 250, { descrizione: null })
    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId } })
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)
    const scrittura = await scritturaGrezza(esito.journalEntryId)
    expect(scrittura?.description).toBe('Bonifico tramite Internet Banking *ROSSI SRL FT 12')
    expect(scrittura?.entry_type).toBe('INCASSO')
    expect(Number(scrittura?.debit_amount)).toBe(250)
  })

  it('Collega con una scadenza intera: conto dal fornitore, riconciliazione, pagamento, scadenza pagata, residuo zero', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const fornitore = await fornitoreDiTest()
    await prisma.supplier.update({ where: { id: fornitore.id }, data: { defaultAccountId: contoCostoId } })
    const scadenza = await creaScadenza({ importoTotale: 100, supplierId: fornitore.id, numeroDocumento: 'FT 12' })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'collega',
      scadenze: [{ scheduleId: scadenza.id, amount: 100 }],
    })
    expect(esito.outcome).toBe('ok')
    if (esito.outcome !== 'ok') throw new Error('impossibile')
    expect(esito.creata).toBe(true)
    expect(esito.reconciliationIds).toHaveLength(1)
    expect(esito.residuo).toBe(0)

    const scrittura = await scritturaGrezza(esito.journalEntryId)
    expect(scrittura?.account_id).toBe(contoCostoId)
    expect(scrittura?.document_ref).toBe('FT 12')
    expect(scrittura?.counterpart_name).toBe(fornitore.name)

    const riconciliazione = await prisma.scheduleReconciliation.findUniqueOrThrow({ where: { id: esito.reconciliationIds[0] } })
    expect(riconciliazione.source).toBe('MANUAL')
    expect(Number(riconciliazione.amount)).toBe(100)
    expect(riconciliazione.paymentId).not.toBeNull()

    expect((await rileggiScadenza(scadenza.id)).stato).toBe('pagata')
    const dopo = await rigaDopo(riga.id)
    expect(dopo.origineScrittura).toBe('COLLEGA')
    expect(dopo.status).toBe('MANUAL')
    expect(Number(dopo.residuoDocumenti)).toBe(0)
  })

  it('Collega parziale: due scadenze che non coprono la riga lasciano il residuo', async () => {
    const { venueId, contoId } = await contesto()
    const s1 = await creaScadenza({ importoTotale: 60 })
    const s2 = await creaScadenza({ importoTotale: 30 })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'collega',
      scadenze: [{ scheduleId: s1.id, amount: 60 }, { scheduleId: s2.id, amount: 30 }],
    })
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)
    expect(esito.reconciliationIds).toHaveLength(2)
    expect(esito.residuo).toBe(10)
    expect(Number((await rigaDopo(riga.id)).residuoDocumenti)).toBe(10)
    // Nessuna imputazione e nessun fornitore: la scrittura nasce senza conto,
    // col centro operativo supposto, e resta da verificare.
    const scrittura = await scritturaGrezza(esito.journalEntryId)
    expect(scrittura?.account_id).toBeNull()
    expect(scrittura?.verified).toBe(false)
  })

  it('importo eccedente: l\'esito porta il residuo e non si scrive nulla', async () => {
    const { venueId, contoId } = await contesto()
    const s1 = await creaScadenza({ importoTotale: 80 })
    const s2 = await creaScadenza({ importoTotale: 30 })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'collega',
      scadenze: [{ scheduleId: s1.id, amount: 80 }, { scheduleId: s2.id, amount: 30 }],
    })
    expect(esito).toEqual({ outcome: 'importo_eccedente', residuo: 100 })
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(0)
    expect(await prisma.scheduleReconciliation.count()).toBe(0)
    expect((await rigaDopo(riga.id)).matchedEntryId).toBeNull()
  })

  it('una scadenza già pagata fa cadere tutta la promozione', async () => {
    const { venueId, contoId } = await contesto()
    const aperta = await creaScadenza({ importoTotale: 40 })
    const pagata = await creaScadenza({ importoTotale: 40, stato: 'pagata', importoPagato: 40 })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'collega',
      scadenze: [{ scheduleId: aperta.id, amount: 40 }, { scheduleId: pagata.id, amount: 40 }],
    })
    expect(esito.outcome).toBe('riconciliazione_rifiutata')
    if (esito.outcome !== 'riconciliazione_rifiutata') throw new Error('impossibile')
    expect(esito.scheduleId).toBe(pagata.id)
    // Rollback intero: nemmeno la prima gamba resta scritta.
    expect(await prisma.scheduleReconciliation.count()).toBe(0)
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(0)
    expect((await rigaDopo(riga.id)).status).toBe('PENDING')
  })

  it('la R4 lega una scrittura che esiste già, senza crearne una', async () => {
    const { venueId, contoId } = await contesto()
    const esistente = await creaMovimento({ uscita: 100, description: 'Incasso POS' })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: esistente.id })
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)
    expect(esito.creata).toBe(false)
    expect(esito.journalEntryId).toBe(esistente.id)
    const dopo = await rigaDopo(riga.id)
    expect(dopo.matchedEntryId).toBe(esistente.id)
    expect(dopo.origineScrittura).toBeNull()
    expect(dopo.status).toBe('MANUAL')
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(1)
  })

  it('una scrittura del verso opposto non si lega', async () => {
    const { venueId, contoId } = await contesto()
    const entrata = await creaMovimento({ entrata: 100 })
    const riga = await rigaBanca(venueId, contoId, -100)
    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: entrata.id })
    expect(esito.outcome).toBe('imputazione_non_valida')
  })

  it('una scrittura già legata a un\'altra riga si rifiuta', async () => {
    const { venueId, contoId } = await contesto()
    const esistente = await creaMovimento({ uscita: 100 })
    const prima = await rigaBanca(venueId, contoId, -100)
    const seconda = await rigaBanca(venueId, contoId, -100)
    await promuoviRigaBancaria({ bankTransactionId: prima.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: esistente.id })

    const esito = await promuoviRigaBancaria({ bankTransactionId: seconda.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: esistente.id })
    expect(esito).toEqual({ outcome: 'scrittura_gia_collegata_ad_altra_riga' })
    expect((await rigaDopo(seconda.id)).matchedEntryId).toBeNull()
  })

  it('una riga nel Cestino non si promuove; una riga inesistente nemmeno', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, -10)
    await prisma.bankTransaction.update({ where: { id: riga.id }, data: { deletedAt: new Date() } })
    expect(await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId } })).toEqual({ outcome: 'riga_nel_cestino' })
    expect(await promuoviRigaBancaria({ bankTransactionId: 'non-esiste', venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId } })).toEqual({ outcome: 'riga_non_trovata' })
  })

  it('la proposta approvata scrive MATCHED sulla riga e PROPOSAL con la confidenza sulla riconciliazione', async () => {
    const { venueId, contoId } = await contesto()
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const riga = await rigaBanca(venueId, contoId, -100)
    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'proposta',
      scadenze: [{ scheduleId: scadenza.id, amount: 100 }], confidence: 0.98,
    })
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)
    const dopo = await rigaDopo(riga.id)
    expect(dopo.status).toBe('MATCHED')
    expect(dopo.origineScrittura).toBe('PROPOSTA')
    expect(Number(dopo.matchConfidence)).toBe(0.98)
    const riconciliazione = await prisma.scheduleReconciliation.findUniqueOrThrow({ where: { id: esito.reconciliationIds[0] } })
    expect(riconciliazione.source).toBe('PROPOSAL')
    expect(Number(riconciliazione.confidence)).toBe(0.98)
  })

  it('un conto con centro obbligatorio senza centro si rifiuta col codice, e non crea nulla', async () => {
    const { venueId, contoId } = await contesto()
    const conto = await contoObbligatorio()
    const riga = await rigaBanca(venueId, contoId, -10)
    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: conto.id } })
    expect(esito.outcome).toBe('imputazione_non_valida')
    if (esito.outcome !== 'imputazione_non_valida') throw new Error('impossibile')
    expect(esito.code).toBe('CENTRO_DI_COSTO_OBBLIGATORIO')
    expect((await rigaDopo(riga.id)).matchedEntryId).toBeNull()
  })

  it('un conto inesistente si rifiuta come imputazione non valida', async () => {
    const { venueId, contoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, -10)
    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: 'non-esiste' } })
    expect(esito.outcome).toBe('imputazione_non_valida')
  })
})
```

- [ ] **Step 2: eseguirlo e vederlo fallire**

`TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/lib/services/__tests__/promozione-riga-bancaria-service.itest.ts` → rosso: modulo assente.

- [ ] **Step 3: il servizio**

Creare `src/lib/services/promozione-riga-bancaria-service.ts`:

```ts
import { Prisma } from '@prisma/client'
import { prisma, type TransactionClient } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { toDebitCredit } from '@/lib/prima-nota-utils'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'
import { TOLLERANZA_IMPORTI, type EsitoRicalcolo } from '@/lib/scadenzario/stato-schedule'
import {
  riconciliaInTransazione,
  dopoLaRiconciliazione,
  annullaRiconciliazioneInTransazione,
  dopoAnnulloRiconciliazione,
  type EsitoInterno,
  type ReconcileInput,
} from '@/lib/services/schedule-reconciliation-service'
import { ricalcolaResiduoDocumenti } from '@/lib/banca/residuo-documenti'

/**
 * La promozione di una riga dell'estratto conto a scrittura di prima nota:
 * «l'anello che manca» della spec madre, costruito una volta e usato da
 * Categorizza, Collega fattura e dall'approvazione delle proposte (A2).
 *
 * Spec: docs/superpowers/specs/2026-08-16-movimenti-bancari-in-prima-nota-design.md,
 * «promuoviRigaBancaria, il servizio unico».
 *
 * Tutto in una transazione: la scrittura si CREA se la riga non ne ha, si
 * RIUSA se `matchedEntryId` è già valorizzato, si LEGA se arriva
 * `scritturaEsistenteId` (la R4); poi una riconciliazione per scadenza; la
 * riga passa a MANUAL (utente) o MATCHED (proposta). Un esito negativo dentro
 * la transazione è un'eccezione (`PromozioneRifiutata`) che la fa cadere per
 * intero: mai una scrittura scritta a metà.
 */

export type OriginePromozione = 'categorizza' | 'collega' | 'proposta'

const ORIGINE_SCRITTURA = {
  categorizza: 'CATEGORIZZA',
  collega: 'COLLEGA',
  proposta: 'PROPOSTA',
} as const

export interface Imputazione {
  accountId: string
  costCenterId?: string
}

export interface InputPromozione {
  bankTransactionId: string
  venueId: string
  userId: string | null
  origine: OriginePromozione
  imputazione?: Imputazione
  scadenze?: Array<{ scheduleId: string; amount: number }>
  /** La R4: la riga si lega a una scrittura che esiste già, non se ne crea una. */
  scritturaEsistenteId?: string
  /** Punteggio della proposta (0-1): finisce su `ScheduleReconciliation.confidence` e su `matchConfidence`. */
  confidence?: number
}

export type EsitoPromozione =
  | { outcome: 'ok'; journalEntryId: string; reconciliationIds: string[]; residuo: number; creata: boolean }
  | { outcome: 'riga_non_trovata' }
  | { outcome: 'riga_nel_cestino' }
  | { outcome: 'riga_gia_collegata'; journalEntryId: string }
  | { outcome: 'importo_eccedente'; residuo: number }
  | { outcome: 'scrittura_non_trovata' }
  | { outcome: 'scrittura_gia_collegata_ad_altra_riga' }
  | { outcome: 'imputazione_non_valida'; motivo: string; code?: string }
  | { outcome: 'riconciliazione_rifiutata'; scheduleId: string; motivo: string }

/**
 * Un esito negativo sollevato DENTRO la transazione: la fa cadere per intero
 * e chi l'ha aperta lo traduce in esito (`promuoviRigaBancaria` qui sotto, o
 * l'approvazione delle proposte nell'A2).
 */
export class PromozioneRifiutata extends Error {
  readonly esito: Exclude<EsitoPromozione, { outcome: 'ok' }>

  constructor(esito: Exclude<EsitoPromozione, { outcome: 'ok' }>) {
    super(esito.outcome)
    this.name = 'PromozioneRifiutata'
    this.esito = esito
  }
}

/** Ciò che la transazione restituisce e che il chiamante completa fuori da essa. */
export interface PromozioneInTransazione {
  esito: Extract<EsitoPromozione, { outcome: 'ok' }>
  /** Le riconciliazioni scritte, per `dopoLaRiconciliazione` fuori dalla transazione. */
  seguiti: Array<{ risultato: EsitoInterno; input: ReconcileInput }>
}

function arrotonda(n: number): number {
  return Math.round(n * 100) / 100
}

function motivoRifiuto(esito: EsitoInterno): string {
  switch (esito.outcome) {
    case 'schedule_not_found':
      return 'Scadenza non trovata'
    case 'entry_not_found':
      return 'Scrittura non trovata'
    case 'already_reconciled':
      return 'La scadenza è già riconciliata con questa scrittura'
    case 'schedule_closed':
      return `La scadenza è ${esito.stato}`
    case 'invalid_amount':
    case 'amount_exceeds_capacity':
      return esito.motivo
    default:
      return 'Riconciliazione rifiutata'
  }
}

/** Il conto dell'imputazione deve esistere ed essere attivo: un id sbagliato è un 400, non una FK violata. */
async function esigiConto(tx: TransactionClient, accountId: string): Promise<void> {
  const conto = await tx.account.findFirst({ where: { id: accountId, isActive: true }, select: { id: true } })
  if (!conto) {
    throw new PromozioneRifiutata({ outcome: 'imputazione_non_valida', motivo: 'Conto inesistente o disattivato' })
  }
}

/**
 * Categorizza su una riga già promossa: aggiorna conto e centro della
 * scrittura collegata (spec, «Le azioni»). Con le fette il conto lo governa la
 * suddivisione (`aggiornaContoDominante`): riscriverlo qui darebbe un conto che
 * nessuna fetta sostiene, come già rifiutano `PUT /api/prima-nota/[id]` e
 * `categorize`.
 */
async function aggiornaImputazione(tx: TransactionClient, journalEntryId: string, imputazione: Imputazione): Promise<void> {
  const scrittura = await tx.journalEntry.findFirst({
    where: { id: journalEntryId },
    select: { id: true, _count: { select: { allocations: true } } },
  })
  if (!scrittura) throw new PromozioneRifiutata({ outcome: 'scrittura_non_trovata' })
  if (scrittura._count.allocations > 0) {
    throw new PromozioneRifiutata({
      outcome: 'imputazione_non_valida',
      motivo: 'La scrittura è ripartita su più conti dalla fattura: si modifica dalla prima nota',
    })
  }
  await esigiConto(tx, imputazione.accountId)
  const centro = await risolviCentroDiCosto(
    tx,
    { accountId: imputazione.accountId, costCenterId: imputazione.costCenterId ?? null },
    'interattivo'
  )
  if (centro.outcome === 'invalid') {
    throw new PromozioneRifiutata({ outcome: 'imputazione_non_valida', motivo: centro.motivo, code: centro.code })
  }
  await tx.journalEntry.update({
    where: { id: journalEntryId },
    data: {
      accountId: imputazione.accountId,
      costCenterId: centro.costCenterId,
      costCenterSource: centro.origine,
      categorizationSource: 'manual',
      verified: centro.origine !== 'supposto',
    },
  })
}

/**
 * Il corpo della promozione, dentro una transazione GIÀ APERTA. Lancia
 * `PromozioneRifiutata` per ogni esito negativo: la transazione cade e chi
 * l'ha aperta la traduce. Chi la chiama deve poi passare ogni voce di
 * `seguiti` a `dopoLaRiconciliazione`, fuori dalla transazione.
 */
export async function promuoviRigaBancariaInTransazione(
  tx: TransactionClient,
  input: InputPromozione
): Promise<PromozioneInTransazione> {
  const { bankTransactionId, venueId, userId, origine } = input

  // Il lock sulla riga serializza due promozioni della stessa riga: la seconda
  // vede la prima già scritta invece di creare due scritture.
  await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${bankTransactionId} FOR UPDATE`

  const riga = await tx.bankTransaction.findFirst({
    where: { id: bankTransactionId, venueId, deletedAt: null },
    select: {
      id: true,
      amount: true,
      transactionDate: true,
      description: true,
      descrizione: true,
      matchedEntryId: true,
      origineScrittura: true,
    },
  })
  if (!riga) {
    const cestinata = await tx.bankTransaction.findFirst({
      where: { id: bankTransactionId, venueId, deletedAt: { not: null } },
      select: { id: true },
    })
    throw new PromozioneRifiutata(cestinata ? { outcome: 'riga_nel_cestino' } : { outcome: 'riga_non_trovata' })
  }

  const importo = arrotonda(Math.abs(Number(riga.amount)))
  const verso = Number(riga.amount) > 0 ? 'INCASSO' : 'USCITA'
  const scadenze = input.scadenze ?? []

  // Le scadenze si leggono PRIMA di creare la scrittura: il fornitore e la
  // fattura della prima decidono il conto e il riferimento del documento.
  const scadenzeLette =
    scadenze.length > 0
      ? await tx.schedule.findMany({
          where: { id: { in: scadenze.map((s) => s.scheduleId) }, venueId },
          select: {
            id: true,
            numeroDocumento: true,
            supplier: { select: { name: true, defaultAccountId: true } },
            invoice: { select: { accountId: true, invoiceNumber: true } },
          },
        })
      : []
  for (const s of scadenze) {
    if (!scadenzeLette.some((l) => l.id === s.scheduleId)) {
      throw new PromozioneRifiutata({ outcome: 'riconciliazione_rifiutata', scheduleId: s.scheduleId, motivo: 'Scadenza non trovata' })
    }
  }
  const primaScadenza = scadenze.length > 0 ? (scadenzeLette.find((l) => l.id === scadenze[0].scheduleId) ?? null) : null

  let journalEntryId: string
  let creata = false

  if (input.scritturaEsistenteId) {
    // La R4: si lega, non si crea.
    if (riga.matchedEntryId && riga.matchedEntryId !== input.scritturaEsistenteId) {
      throw new PromozioneRifiutata({ outcome: 'riga_gia_collegata', journalEntryId: riga.matchedEntryId })
    }
    const scrittura = await tx.journalEntry.findFirst({
      where: { id: input.scritturaEsistenteId, venueId, registerType: 'BANK' },
      select: { id: true, debitAmount: true, creditAmount: true, bankTransaction: { select: { id: true } } },
    })
    if (!scrittura) throw new PromozioneRifiutata({ outcome: 'scrittura_non_trovata' })
    if (scrittura.bankTransaction && scrittura.bankTransaction.id !== riga.id) {
      throw new PromozioneRifiutata({ outcome: 'scrittura_gia_collegata_ad_altra_riga' })
    }
    // Il verso deve combaciare: un'entrata della banca non si lega a un'uscita.
    const scritturaEntra = Number(scrittura.debitAmount ?? 0) > 0
    if (scritturaEntra !== (verso === 'INCASSO')) {
      throw new PromozioneRifiutata({
        outcome: 'imputazione_non_valida',
        motivo: 'La scrittura ha il verso opposto a quello del movimento bancario',
      })
    }
    journalEntryId = scrittura.id
  } else if (riga.matchedEntryId) {
    // Già promossa: si riusa la scrittura; con un'imputazione la si aggiorna.
    journalEntryId = riga.matchedEntryId
    if (input.imputazione) await aggiornaImputazione(tx, journalEntryId, input.imputazione)
  } else {
    // Si crea (spec madre, «Cosa succede approvando», terzo caso): registro
    // BANK, data e importo della riga, verso dal segno, conto dall'imputazione
    // o dal fornitore della scadenza — mai da una regola.
    if (input.imputazione) await esigiConto(tx, input.imputazione.accountId)
    const accountId =
      input.imputazione?.accountId ??
      primaScadenza?.supplier?.defaultAccountId ??
      primaScadenza?.invoice?.accountId ??
      null
    // Con un'imputazione c'è un umano davanti a un form che ha il campo del
    // centro (contesto interattivo); senza, nessuno può sceglierlo adesso e il
    // sistema suppone (automatico), lasciando la scrittura da verificare.
    const centro = await risolviCentroDiCosto(
      tx,
      { accountId, costCenterId: input.imputazione?.costCenterId ?? null },
      input.imputazione ? 'interattivo' : 'automatico'
    )
    if (centro.outcome === 'invalid') {
      throw new PromozioneRifiutata({ outcome: 'imputazione_non_valida', motivo: centro.motivo, code: centro.code })
    }
    const { debitAmount, creditAmount } = toDebitCredit('BANK', verso, new Prisma.Decimal(importo.toFixed(2)))
    const scrittura = await tx.journalEntry.create({
      data: {
        venueId,
        date: riga.transactionDate,
        registerType: 'BANK',
        entryType: verso,
        description: riga.descrizione ?? riga.description,
        documentRef:
          scadenzeLette.length === 1
            ? (primaScadenza?.numeroDocumento ?? primaScadenza?.invoice?.invoiceNumber ?? null)
            : null,
        counterpartName: primaScadenza?.supplier?.name ?? null,
        debitAmount,
        creditAmount,
        accountId,
        costCenterId: centro.costCenterId,
        costCenterSource: centro.origine,
        categorizationSource: input.imputazione ? 'manual' : accountId ? 'automatic' : null,
        // Una supposizione sul centro richiede uno sguardo umano; tutto il
        // resto l'ha deciso una persona o il piano dei conti.
        verified: centro.origine !== 'supposto',
        createdById: userId,
      },
      select: { id: true },
    })
    journalEntryId = scrittura.id
    creata = true
  }

  if (riga.matchedEntryId !== journalEntryId) {
    await tx.bankTransaction.update({
      where: { id: riga.id },
      data: {
        matchedEntryId: journalEntryId,
        status: origine === 'proposta' ? 'MATCHED' : 'MANUAL',
        reconciledBy: userId,
        reconciledAt: new Date(),
        matchConfidence: input.confidence !== undefined ? new Prisma.Decimal(input.confidence.toFixed(2)) : null,
        origineScrittura: creata ? ORIGINE_SCRITTURA[origine] : null,
      },
    })
  }

  // La somma delle riconciliazioni non supera l'importo della riga: si
  // controlla prima di scriverne una, così l'eccedenza torna come esito col
  // residuo e non come rifiuto della seconda gamba. `riconciliaInTransazione`
  // rifà il controllo sulla capienza del movimento: è la stessa cifra, e va
  // bene che ci sia due volte.
  const reconciliationIds: string[] = []
  const seguiti: PromozioneInTransazione['seguiti'] = []
  if (scadenze.length > 0) {
    const gia = await tx.scheduleReconciliation.aggregate({
      where: { journalEntryId, status: 'VERIFIED' },
      _sum: { amount: true },
    })
    const capienza = arrotonda(importo - Number(gia._sum.amount ?? 0))
    const richiesto = arrotonda(scadenze.reduce((somma, s) => somma + s.amount, 0))
    if (richiesto > capienza + TOLLERANZA_IMPORTI) {
      throw new PromozioneRifiutata({ outcome: 'importo_eccedente', residuo: capienza })
    }
    for (const s of scadenze) {
      const ingresso: ReconcileInput = {
        scheduleId: s.scheduleId,
        journalEntryId,
        venueId,
        userId,
        amount: s.amount,
        source: origine === 'proposta' ? 'PROPOSAL' : 'MANUAL',
        confidence: input.confidence,
      }
      const risultato = await riconciliaInTransazione(tx, ingresso)
      if (risultato.outcome !== 'ok') {
        throw new PromozioneRifiutata({
          outcome: 'riconciliazione_rifiutata',
          scheduleId: s.scheduleId,
          motivo: motivoRifiuto(risultato),
        })
      }
      reconciliationIds.push(risultato.reconciliationId)
      seguiti.push({ risultato, input: ingresso })
    }
  }

  const residuo = (await ricalcolaResiduoDocumenti(tx, journalEntryId)) ?? 0

  return { esito: { outcome: 'ok', journalEntryId, reconciliationIds, residuo, creata }, seguiti }
}

/**
 * La promozione con la propria transazione: Categorizza e Collega entrano da
 * qui. L'approvazione delle proposte (A2) entra da
 * `promuoviRigaBancariaInTransazione`, perché deve bloccare la proposta e
 * promuovere nello stesso atto.
 */
export async function promuoviRigaBancaria(input: InputPromozione): Promise<EsitoPromozione> {
  let interno: PromozioneInTransazione
  try {
    interno = await prisma.$transaction((tx) => promuoviRigaBancariaInTransazione(tx, input))
  } catch (error) {
    if (error instanceof PromozioneRifiutata) return error.esito
    // La corsa sull'unicità di `matchedEntryId`: due righe che si legano alla
    // stessa scrittura nello stesso istante; la perdente esce come esito e non
    // come guasto del server.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { outcome: 'scrittura_gia_collegata_ad_altra_riga' }
    }
    throw error
  }

  // Fuori dalla transazione: stime del fornitore e log, per ciascuna gamba.
  for (const seguito of interno.seguiti) {
    await dopoLaRiconciliazione(seguito.risultato, seguito.input)
  }

  logger.info('Riga bancaria promossa a scrittura di prima nota', {
    bankTransactionId: input.bankTransactionId,
    journalEntryId: interno.esito.journalEntryId,
    origine: input.origine,
    creata: interno.esito.creata,
    riconciliazioni: interno.esito.reconciliationIds.length,
    residuo: interno.esito.residuo,
  })

  return interno.esito
}

export type EsitoScollegamento =
  | { outcome: 'ok'; scritturaRitirata: boolean; riconciliazioniAnnullate: number }
  | { outcome: 'riga_non_trovata' }

/**
 * Lo scollegamento: toglie le riconciliazioni e, se la scrittura l'aveva
 * creata la promozione (`origineScrittura` non nullo), la ritira in
 * cancellazione logica; azzera il legame e la riga torna PENDING. Se la
 * scrittura esisteva già (R4), la si slega e basta: le sue riconciliazioni sono
 * sue. Una riga senza scrittura ma con uno stato di abbinamento (vecchio
 * motore) torna semplicemente PENDING: non è un errore.
 */
export async function scollegaRigaBancaria(input: {
  bankTransactionId: string
  venueId: string
  userId: string | null
}): Promise<EsitoScollegamento> {
  const interno = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${input.bankTransactionId} FOR UPDATE`
    const riga = await tx.bankTransaction.findFirst({
      where: { id: input.bankTransactionId, venueId: input.venueId, deletedAt: null },
      select: { id: true, matchedEntryId: true, origineScrittura: true },
    })
    if (!riga) return null

    const esitiAnnullo: EsitoRicalcolo[] = []
    let scritturaRitirata = false

    if (riga.matchedEntryId && riga.origineScrittura !== null) {
      // La scrittura è nostra: prima le sue riconciliazioni (con pagamenti,
      // fette e stato delle scadenze), poi lei — in cancellazione logica, come
      // ogni scrittura contabile.
      const riconciliazioni = await tx.scheduleReconciliation.findMany({
        where: { journalEntryId: riga.matchedEntryId, status: 'VERIFIED' },
        select: { id: true },
      })
      for (const r of riconciliazioni) {
        const esito = await annullaRiconciliazioneInTransazione(tx, r.id)
        if (esito) esitiAnnullo.push(esito)
      }
      await tx.journalEntry.update({
        where: { id: riga.matchedEntryId },
        data: { deletedAt: new Date(), deletedById: input.userId },
      })
      scritturaRitirata = true
    }

    await tx.bankTransaction.update({
      where: { id: riga.id },
      data: {
        matchedEntryId: null,
        origineScrittura: null,
        status: 'PENDING',
        reconciledBy: null,
        reconciledAt: null,
        matchConfidence: null,
        residuoDocumenti: null,
      },
    })

    return { scritturaRitirata, riconciliazioniAnnullate: esitiAnnullo.length, esitiAnnullo }
  })

  if (!interno) return { outcome: 'riga_non_trovata' }

  for (const esito of interno.esitiAnnullo) {
    await dopoAnnulloRiconciliazione(esito, input.venueId)
  }

  logger.info('Riga bancaria scollegata', {
    bankTransactionId: input.bankTransactionId,
    scritturaRitirata: interno.scritturaRitirata,
    riconciliazioniAnnullate: interno.riconciliazioniAnnullate,
  })

  return {
    outcome: 'ok',
    scritturaRitirata: interno.scritturaRitirata,
    riconciliazioniAnnullate: interno.riconciliazioniAnnullate,
  }
}
```

(Lo scollegamento è già qui, con i suoi test nel Task 4: si scrive tutto il modulo una volta, si prova a pezzi.)

- [ ] **Step 4: eseguire**

```bash
TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/lib/services/__tests__/promozione-riga-bancaria-service.itest.ts
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
```

Atteso: verde, `tsc` pulito. Se il caso «una scrittura già legata a un'altra riga si rifiuta» torna `ok`: il controllo su `scrittura.bankTransaction` legge la relazione inversa `JournalEntry.bankTransaction` (uno-a-uno via `matchedEntryId`); verificare che la `select` la includa. Se il caso del conto OBBLIGATORIO trova il seed senza conti OBBLIGATORIO, l'aiutante ne crea uno: non toccare il seed.

- [ ] **Step 5: commit**

```bash
git add src/lib/services/promozione-riga-bancaria-service.ts src/lib/services/__tests__/promozione-riga-bancaria-service.itest.ts
git commit -m "feat(banca): promuoviRigaBancaria, il servizio unico che porta una riga della banca in prima nota

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: lo scollegamento ritira solo ciò che ha creato

**Files:**
- Modify: `src/lib/services/promozione-riga-bancaria-service.ts` (solo se i test lo chiedono: il codice di `scollegaRigaBancaria` è nel Task 3)
- Test: `src/lib/services/__tests__/promozione-riga-bancaria-service.itest.ts` (un `describe` in più)

**Interfaces:**
- Produces:
  ```ts
  export type EsitoScollegamento = { outcome: 'ok'; scritturaRitirata: boolean; riconciliazioniAnnullate: number } | { outcome: 'riga_non_trovata' }
  export async function scollegaRigaBancaria(input: { bankTransactionId: string; venueId: string; userId: string | null }): Promise<EsitoScollegamento>
  ```

- [ ] **Step 1: i test**

Aggiungere in fondo al file di test del Task 3 (stessi aiutanti; aggiungere `scollegaRigaBancaria` all'import):

```ts
describe('scollegaRigaBancaria', () => {
  it('su una riga promossa con documenti ritira riconciliazioni, pagamenti e scrittura; la scadenza torna aperta', async () => {
    const { venueId, contoId } = await contesto()
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const riga = await rigaBanca(venueId, contoId, -100)
    const promossa = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'collega',
      scadenze: [{ scheduleId: scadenza.id, amount: 100 }],
    })
    if (promossa.outcome !== 'ok') throw new Error(promossa.outcome)
    expect((await rileggiScadenza(scadenza.id)).stato).toBe('pagata')

    const esito = await scollegaRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null })
    expect(esito).toEqual({ outcome: 'ok', scritturaRitirata: true, riconciliazioniAnnullate: 1 })

    expect(await prisma.scheduleReconciliation.count({ where: { journalEntryId: promossa.journalEntryId } })).toBe(0)
    expect(await prisma.schedulePayment.count({ where: { scheduleId: scadenza.id } })).toBe(0)
    const dopoScadenza = await rileggiScadenza(scadenza.id)
    expect(dopoScadenza.stato).toBe('aperta')
    expect(dopoScadenza.importoPagatoNum).toBe(0)
    // Ritirata, non cancellata: la riga esiste ancora, con deleted_at.
    expect((await scritturaGrezza(promossa.journalEntryId))?.deleted_at).not.toBeNull()

    const dopo = await rigaDopo(riga.id)
    expect(dopo.matchedEntryId).toBeNull()
    expect(dopo.origineScrittura).toBeNull()
    expect(dopo.status).toBe('PENDING')
    expect(dopo.residuoDocumenti).toBeNull()
    expect(dopo.reconciledAt).toBeNull()
  })

  it('su una R4 slega e basta: la scrittura resta in prima nota con le sue riconciliazioni', async () => {
    const { venueId, contoId } = await contesto()
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const esistente = await creaMovimento({ uscita: 100 })
    // La scrittura era già riconciliata dallo scadenzario, prima del legame.
    const { reconcileScheduleWithEntry } = await import('@/lib/services/schedule-reconciliation-service')
    const ric = await reconcileScheduleWithEntry({ scheduleId: scadenza.id, journalEntryId: esistente.id, venueId, userId: null })
    expect(ric.outcome).toBe('ok')
    const riga = await rigaBanca(venueId, contoId, -100)
    await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: esistente.id })
    expect(Number((await rigaDopo(riga.id)).residuoDocumenti)).toBe(0)

    const esito = await scollegaRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null })
    expect(esito).toEqual({ outcome: 'ok', scritturaRitirata: false, riconciliazioniAnnullate: 0 })
    expect((await scritturaGrezza(esistente.id))?.deleted_at).toBeNull()
    expect(await prisma.scheduleReconciliation.count({ where: { journalEntryId: esistente.id } })).toBe(1)
    expect((await rigaDopo(riga.id)).matchedEntryId).toBeNull()
  })

  it('su una riga categorizzata ritira la scrittura, senza riconciliazioni da annullare', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, -0.75)
    const promossa = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId } })
    if (promossa.outcome !== 'ok') throw new Error(promossa.outcome)
    const esito = await scollegaRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null })
    expect(esito).toEqual({ outcome: 'ok', scritturaRitirata: true, riconciliazioniAnnullate: 0 })
    expect((await scritturaGrezza(promossa.journalEntryId))?.deleted_at).not.toBeNull()
    // Dopo lo scollegamento la riga si può promuovere di nuovo, e nasce una scrittura nuova.
    const di_nuovo = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId } })
    if (di_nuovo.outcome !== 'ok') throw new Error(di_nuovo.outcome)
    expect(di_nuovo.creata).toBe(true)
    expect(di_nuovo.journalEntryId).not.toBe(promossa.journalEntryId)
  })

  it('su una riga non collegata riporta lo stato a PENDING senza errore; su una riga inesistente risponde riga_non_trovata', async () => {
    const { venueId, contoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, -10)
    await prisma.bankTransaction.update({ where: { id: riga.id }, data: { status: 'MATCHED' } })
    expect(await scollegaRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null })).toEqual({ outcome: 'ok', scritturaRitirata: false, riconciliazioniAnnullate: 0 })
    expect((await rigaDopo(riga.id)).status).toBe('PENDING')
    expect(await scollegaRigaBancaria({ bankTransactionId: 'non-esiste', venueId, userId: null })).toEqual({ outcome: 'riga_non_trovata' })
  })
})
```

- [ ] **Step 2: eseguire**

`TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/lib/services/__tests__/promozione-riga-bancaria-service.itest.ts` → verde. Se un caso cade, correggere `scollegaRigaBancaria` nel servizio (non il test): il comportamento atteso è quello scritto sopra e nella spec.

- [ ] **Step 3: commit**

```bash
git add src/lib/services/__tests__/promozione-riga-bancaria-service.itest.ts src/lib/services/promozione-riga-bancaria-service.ts
git commit -m "test(banca): lo scollegamento ritira solo ciò che la promozione ha creato

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: le rotte — categorizza, collega, scollega, categorizza-in-blocco; via match e unmatch

**Files:**
- Modify: `src/lib/validations/reconciliation.ts` (schemi nuovi; via `matchTransactionSchema` e `MatchTransaction`)
- Create: `src/lib/banca/esiti-promozione.ts`
- Create: `src/app/api/bank-transactions/[id]/categorizza/route.ts`, `src/app/api/bank-transactions/[id]/collega/route.ts`, `src/app/api/bank-transactions/[id]/scollega/route.ts`, `src/app/api/bank-transactions/categorizza-in-blocco/route.ts`
- Test: `src/app/api/bank-transactions/__tests__/azioni-contabili.itest.ts`
- Delete: `src/app/api/bank-transactions/[id]/match/route.ts`, `src/app/api/bank-transactions/[id]/unmatch/route.ts`
- Modify: `src/lib/reconciliation/matcher.ts` (via `manualMatch` e `unmatch`, righe 341-420), `src/lib/reconciliation/index.ts` (via i due export)
- Modify: `src/lib/reconciliation/__tests__/transazioni-cancellate.itest.ts` (da `unmatch` a `scollega`)
- Modify: `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx` (`handleUnmatch` → `scollega`), `src/components/reconciliation/MatchDialog.tsx` (`handleMatch` → `collega`)
- Modify: `scripts/check-route-auth.mjs` (`BASELINE` 252 → 250)

**Interfaces:**
- Consumes: il servizio del Task 3/4; `withAuth` da `@/lib/api-utils`; `createAuditLog` da `@/lib/audit`; `filtriDaSearchParams`, `costruisciWhere` (per il filtro in blocco).
- Produces (rotte, tutte `withAuth`, `admin`/`manager`, per sede):
  - `POST /api/bank-transactions/[id]/categorizza` — corpo `{ accountId, costCenterId? }` → 200 `{ ok, journalEntryId, reconciliationIds, residuo, creata }`
  - `POST /api/bank-transactions/[id]/collega` — corpo `{ scadenze: [{ scheduleId, amount }] }` **oppure** `{ scritturaEsistenteId }` → come sopra
  - `POST /api/bank-transactions/[id]/scollega` — senza corpo → 200 `{ ok, scritturaRitirata, riconciliazioniAnnullate }`
  - `POST /api/bank-transactions/categorizza-in-blocco` — corpo `{ ids? | filtro?, imputazione: { accountId, costCenterId? } }` → 200 `{ toccate, saltate, dettagli: [{ id, motivo }] }` (i dettagli al massimo 20)
  - stati: 400 imputazione/corpo non validi (con `code` se lo dà il centro di costo), 404 movimento o scrittura non trovati, 409 Cestino / già collegata / scrittura di un'altra riga, 422 importo eccedente o riconciliazione rifiutata (con `scheduleId`).

- [ ] **Step 1: gli schemi**

In `src/lib/validations/reconciliation.ts` sostituire il blocco «Match manuale» (righe 52-55, `matchTransactionSchema`) con:

```ts
// Le azioni contabili della consegna B (spec, «Le azioni»). L'imputazione è
// conto + centro: la categoria di budget si deriva dal conto e non si chiede.
export const imputazioneSchema = z.object({
  accountId: z.string().min(1),
  costCenterId: z.string().min(1).optional(),
})
export const categorizzaSchema = imputazioneSchema.strict()

// Collega: le scadenze con la quota di ciascuna, OPPURE una scrittura esistente
// (la R4). Mai entrambe: la R4 si lega, non aggiunge documenti.
export const collegaSchema = z
  .object({
    scadenze: z
      .array(z.object({ scheduleId: z.string().min(1), amount: z.number().positive() }))
      .min(1)
      .max(50)
      .optional(),
    scritturaEsistenteId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => !!v.scadenze !== !!v.scritturaEsistenteId, {
    message: 'Indica le scadenze oppure la scrittura esistente, non entrambe',
  })

// Categorizza in blocco: per elenco di id o per filtro, come le altre azioni in blocco.
export const categorizzaInBloccoSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(1000).optional(),
    filtro: z.record(z.string(), z.string()).optional(),
    imputazione: imputazioneSchema,
  })
  .refine((v) => !!v.ids !== !!v.filtro, { message: 'Indica ids oppure filtro, non entrambi' })
```

e togliere, in fondo, `export type MatchTransaction = z.infer<typeof matchTransactionSchema>`.

- [ ] **Step 2: la traduzione degli esiti**

Creare `src/lib/banca/esiti-promozione.ts`:

```ts
import { formatCurrency } from '@/lib/formatters'
import type { EsitoPromozione } from '@/lib/services/promozione-riga-bancaria-service'

/**
 * L'esito del servizio tradotto in stato HTTP e corpo, una volta per tutte le
 * rotte: il messaggio finisce nel toast così com'è, e deve dire cosa fare
 * («scollegalo prima»), non solo che non si è potuto.
 */
export function rispostaPerEsito(esito: EsitoPromozione): { status: number; corpo: Record<string, unknown> } {
  switch (esito.outcome) {
    case 'ok':
      return {
        status: 200,
        corpo: {
          ok: true,
          journalEntryId: esito.journalEntryId,
          reconciliationIds: esito.reconciliationIds,
          residuo: esito.residuo,
          creata: esito.creata,
        },
      }
    case 'riga_non_trovata':
      return { status: 404, corpo: { error: 'Movimento non trovato' } }
    case 'scrittura_non_trovata':
      return { status: 404, corpo: { error: 'Scrittura non trovata' } }
    case 'riga_nel_cestino':
      return { status: 409, corpo: { error: 'Il movimento è nel Cestino: ripristinalo prima' } }
    case 'riga_gia_collegata':
      return {
        status: 409,
        corpo: { error: 'Il movimento è già collegato a una scrittura: scollegalo prima', journalEntryId: esito.journalEntryId },
      }
    case 'scrittura_gia_collegata_ad_altra_riga':
      return { status: 409, corpo: { error: 'La scrittura è già collegata a un altro movimento bancario' } }
    case 'importo_eccedente':
      return {
        status: 422,
        corpo: { error: `Gli importi superano il residuo del movimento (${formatCurrency(esito.residuo)})`, residuo: esito.residuo },
      }
    case 'riconciliazione_rifiutata':
      return { status: 422, corpo: { error: esito.motivo, scheduleId: esito.scheduleId } }
    case 'imputazione_non_valida':
      return { status: 400, corpo: { error: esito.motivo, ...(esito.code ? { code: esito.code } : {}) } }
  }
}
```

- [ ] **Step 3: il test d'integrazione delle rotte, prima delle rotte**

Creare `src/app/api/bank-transactions/__tests__/azioni-contabili.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { creaMovimento, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { POST as categorizza } from '../[id]/categorizza/route'
import { POST as collega } from '../[id]/collega/route'
import { POST as scollega } from '../[id]/scollega/route'
import { POST as inBlocco } from '../categorizza-in-blocco/route'

setupIntegrationDb()

async function contesto() {
  const venue = await prisma.venue.findFirstOrThrow()
  const conto = await prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Weiss', accountType: 'BANK' } })
  const contoCosto = await prisma.account.findFirstOrThrow({ where: { type: 'COSTO', isActive: true, costCenterRule: 'DEFAULT_STR' } })
  return { venueId: venue.id, contoId: conto.id, contoCostoId: contoCosto.id }
}

async function riga(venueId: string, contoId: string, importo: number, extra: { sezione?: 'ATTIVI' | 'DELEGHE_F24' | 'CBILL_PAGOPA'; deletedAt?: Date } = {}) {
  return prisma.bankTransaction.create({
    data: {
      venueId, bankAccountId: contoId, transactionDate: new Date('2026-08-10'),
      description: 'Commissioni', descrizione: null, causale: 'Commissioni', amount: importo,
      importSource: 'PSD2_GOCARDLESS', status: 'PENDING', sezione: extra.sezione ?? 'ATTIVI', deletedAt: extra.deletedAt ?? null,
    },
  })
}

type Corpo = { error?: string; code?: string; ok?: boolean; journalEntryId?: string; residuo?: number; creata?: boolean; scritturaRitirata?: boolean; toccate?: number; saltate?: number; dettagli?: Array<{ id: string; motivo: string }> }

const post = (handler: Parameters<typeof callRoute>[0], url: string, id: string | null, body?: unknown) =>
  id
    ? callRoute<Corpo, { id: string }>(handler, jsonRequest(url, { method: 'POST', body }), { id })
    : callRoute<Corpo>(handler, jsonRequest(url, { method: 'POST', body }))

describe('le azioni contabili sull\'estratto conto', () => {
  beforeEach(async () => {
    logout()
    await entraCome('admin')
  })

  it('POST categorizza promuove la riga e risponde con la scrittura', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const r = await riga(venueId, contoId, -0.75)
    const risposta = await post(categorizza, `http://localhost/api/bank-transactions/${r.id}/categorizza`, r.id, { accountId: contoCostoId })
    expect(risposta.status).toBe(200)
    expect(risposta.body.creata).toBe(true)
    expect(risposta.body.residuo).toBe(0)
    const dopo = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })
    expect(dopo.matchedEntryId).toBe(risposta.body.journalEntryId)
    expect(dopo.origineScrittura).toBe('CATEGORIZZA')
  })

  it('POST categorizza rifiuta per forma un corpo con campi in più o senza conto', async () => {
    const { venueId, contoId } = await contesto()
    const r = await riga(venueId, contoId, -1)
    expect((await post(categorizza, `http://localhost/api/bank-transactions/${r.id}/categorizza`, r.id, {})).status).toBe(400)
    expect((await post(categorizza, `http://localhost/api/bank-transactions/${r.id}/categorizza`, r.id, { accountId: 'x', amount: 5 })).status).toBe(400)
  })

  it('POST collega con le scadenze; l\'eccedenza è un 422 col residuo', async () => {
    const { venueId, contoId } = await contesto()
    const s = await creaScadenza({ importoTotale: 100 })
    const r = await riga(venueId, contoId, -100)
    const troppo = await post(collega, `http://localhost/api/bank-transactions/${r.id}/collega`, r.id, { scadenze: [{ scheduleId: s.id, amount: 120 }] })
    expect(troppo.status).toBe(422)
    expect(troppo.body.residuo).toBe(100)

    const ok = await post(collega, `http://localhost/api/bank-transactions/${r.id}/collega`, r.id, { scadenze: [{ scheduleId: s.id, amount: 100 }] })
    expect(ok.status).toBe(200)
    expect(ok.body.residuo).toBe(0)
  })

  it('POST collega con una scrittura esistente (R4), e la stessa scrittura per una seconda riga è un 409', async () => {
    const { venueId, contoId } = await contesto()
    const esistente = await creaMovimento({ uscita: 50 })
    const prima = await riga(venueId, contoId, -50)
    const seconda = await riga(venueId, contoId, -50)
    expect((await post(collega, `http://localhost/api/bank-transactions/${prima.id}/collega`, prima.id, { scritturaEsistenteId: esistente.id })).status).toBe(200)
    expect((await post(collega, `http://localhost/api/bank-transactions/${seconda.id}/collega`, seconda.id, { scritturaEsistenteId: esistente.id })).status).toBe(409)
    // Le due forme insieme sono un 400.
    expect((await post(collega, `http://localhost/api/bank-transactions/${seconda.id}/collega`, seconda.id, { scritturaEsistenteId: esistente.id, scadenze: [] })).status).toBe(400)
  })

  it('POST scollega riporta la riga a PENDING; su una riga inesistente è 404', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const r = await riga(venueId, contoId, -0.75)
    await post(categorizza, `http://localhost/api/bank-transactions/${r.id}/categorizza`, r.id, { accountId: contoCostoId })
    const risposta = await post(scollega, `http://localhost/api/bank-transactions/${r.id}/scollega`, r.id)
    expect(risposta.status).toBe(200)
    expect(risposta.body.scritturaRitirata).toBe(true)
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('PENDING')
    expect((await post(scollega, 'http://localhost/api/bank-transactions/nessuna/scollega', 'nessuna')).status).toBe(404)
  })

  it('POST categorizza-in-blocco per id e per filtro, con le saltate spiegate', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const a = await riga(venueId, contoId, -0.75)
    const b = await riga(venueId, contoId, -0.5)
    const nelCestino = await riga(venueId, contoId, -0.25, { deletedAt: new Date() })
    const f24 = await riga(venueId, contoId, -300, { sezione: 'DELEGHE_F24' })

    const perId = await post(inBlocco, 'http://localhost/api/bank-transactions/categorizza-in-blocco', null, {
      ids: [a.id, b.id, nelCestino.id], imputazione: { accountId: contoCostoId },
    })
    expect(perId.status).toBe(200)
    expect(perId.body.toccate).toBe(2)
    expect(perId.body.saltate).toBe(1)
    expect(perId.body.dettagli?.[0]?.id).toBe(nelCestino.id)
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(2)

    // Il filtro è quello della lista: la scheda Deleghe F24 prende solo la delega.
    const perFiltro = await post(inBlocco, 'http://localhost/api/bank-transactions/categorizza-in-blocco', null, {
      filtro: { sezione: 'DELEGHE_F24' }, imputazione: { accountId: contoCostoId },
    })
    expect(perFiltro.body).toMatchObject({ toccate: 1, saltate: 0 })
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: f24.id } })).matchedEntryId).not.toBeNull()

    // Ricategorizzare le stesse righe non crea altre scritture.
    const di_nuovo = await post(inBlocco, 'http://localhost/api/bank-transactions/categorizza-in-blocco', null, { ids: [a.id, b.id], imputazione: { accountId: contoCostoId } })
    expect(di_nuovo.body.toccate).toBe(2)
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(3)
  })

  it('come staff tutte e quattro rispondono 403', async () => {
    logout()
    await entraCome('staff')
    const { venueId, contoId, contoCostoId } = await contesto()
    const r = await riga(venueId, contoId, -1)
    expect((await post(categorizza, `http://localhost/api/bank-transactions/${r.id}/categorizza`, r.id, { accountId: contoCostoId })).status).toBe(403)
    expect((await post(collega, `http://localhost/api/bank-transactions/${r.id}/collega`, r.id, { scritturaEsistenteId: 'x' })).status).toBe(403)
    expect((await post(scollega, `http://localhost/api/bank-transactions/${r.id}/scollega`, r.id)).status).toBe(403)
    expect((await post(inBlocco, 'http://localhost/api/bank-transactions/categorizza-in-blocco', null, { ids: [r.id], imputazione: { accountId: contoCostoId } })).status).toBe(403)
  })
})
```

`TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/app/api/bank-transactions/__tests__/azioni-contabili.itest.ts` → rosso: le rotte non esistono. (Se `callRoute` senza `params` non accetta la firma usata in `post`, guardare `src/test/integration/api.ts:80` e adeguare l'aiutante, non le rotte.)

- [ ] **Step 4: le quattro rotte**

`src/app/api/bank-transactions/[id]/categorizza/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { categorizzaSchema } from '@/lib/validations/reconciliation'
import { promuoviRigaBancaria } from '@/lib/services/promozione-riga-bancaria-service'
import { rispostaPerEsito } from '@/lib/banca/esiti-promozione'

/**
 * Categorizza: promuove la riga a scrittura di prima nota con conto e centro,
 * senza documenti; su una riga già promossa aggiorna l'imputazione (spec,
 * «Le azioni»).
 */
export const POST = withAuth<{ id: string }>(
  async (request, { venueId, user, params }) => {
    const parsed = categorizzaSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Imputazione non valida', details: parsed.error.issues }, { status: 400 })
    }

    const esito = await promuoviRigaBancaria({
      bankTransactionId: params.id,
      venueId,
      userId: user.id ?? null,
      origine: 'categorizza',
      imputazione: parsed.data,
    })

    if (esito.outcome === 'ok') {
      await createAuditLog({
        userId: user.id ?? null,
        action: esito.creata ? 'CREATE' : 'UPDATE',
        entityType: 'JournalEntry',
        entityId: esito.journalEntryId,
        venueId,
        newValues: { daRigaBancaria: params.id, ...parsed.data },
      })
    }
    const { status, corpo } = rispostaPerEsito(esito)
    return NextResponse.json(corpo, { status })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

`src/app/api/bank-transactions/[id]/collega/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { collegaSchema } from '@/lib/validations/reconciliation'
import { promuoviRigaBancaria } from '@/lib/services/promozione-riga-bancaria-service'
import { rispostaPerEsito } from '@/lib/banca/esiti-promozione'

/**
 * Collega fattura: le scadenze con la quota di ciascuna (residuo sulla riga
 * se non coprono tutto), oppure una scrittura esistente — la R4, che si lega
 * senza creare nulla (spec, «Le azioni»).
 */
export const POST = withAuth<{ id: string }>(
  async (request, { venueId, user, params }) => {
    const parsed = collegaSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Richiesta non valida', details: parsed.error.issues }, { status: 400 })
    }

    const esito = await promuoviRigaBancaria({
      bankTransactionId: params.id,
      venueId,
      userId: user.id ?? null,
      origine: 'collega',
      scadenze: parsed.data.scadenze,
      scritturaEsistenteId: parsed.data.scritturaEsistenteId,
    })

    if (esito.outcome === 'ok') {
      await createAuditLog({
        userId: user.id ?? null,
        action: esito.creata ? 'CREATE' : 'UPDATE',
        entityType: 'JournalEntry',
        entityId: esito.journalEntryId,
        venueId,
        newValues: { daRigaBancaria: params.id, ...parsed.data, riconciliazioni: esito.reconciliationIds },
      })
    }
    const { status, corpo } = rispostaPerEsito(esito)
    return NextResponse.json(corpo, { status })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

`src/app/api/bank-transactions/[id]/scollega/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { scollegaRigaBancaria } from '@/lib/services/promozione-riga-bancaria-service'

/** Scollega: ritira ciò che la promozione ha creato, o slega la R4 (spec, «promuoviRigaBancaria»). */
export const POST = withAuth<{ id: string }>(
  async (_request, { venueId, user, params }) => {
    const esito = await scollegaRigaBancaria({ bankTransactionId: params.id, venueId, userId: user.id ?? null })
    if (esito.outcome === 'riga_non_trovata') {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }
    await createAuditLog({
      userId: user.id ?? null,
      action: 'UPDATE',
      entityType: 'BankTransaction',
      entityId: params.id,
      venueId,
      newValues: { scollegata: true, scritturaRitirata: esito.scritturaRitirata, riconciliazioniAnnullate: esito.riconciliazioniAnnullate },
    })
    return NextResponse.json({ ok: true, scritturaRitirata: esito.scritturaRitirata, riconciliazioniAnnullate: esito.riconciliazioniAnnullate })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

`src/app/api/bank-transactions/categorizza-in-blocco/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { categorizzaInBloccoSchema } from '@/lib/validations/reconciliation'
import { filtriDaSearchParams } from '@/lib/banca/filtri-estratto-conto'
import { costruisciWhere } from '@/lib/banca/query-estratto-conto'
import { promuoviRigaBancaria } from '@/lib/services/promozione-riga-bancaria-service'
import { rispostaPerEsito } from '@/lib/banca/esiti-promozione'

/**
 * Categorizza N righe con la stessa imputazione (le 62 commissioni in un
 * colpo), per elenco di id o per filtro — lo stesso della lista, così «tutte
 * le N del filtro» sono esattamente quelle che si vedono.
 *
 * Una promozione per riga, ciascuna nella propria transazione: qui non c'è
 * una `updateMany` possibile, perché ogni riga crea la propria scrittura. Le
 * righe che non si possono promuovere (nel Cestino, scrittura ripartita…) si
 * saltano e si contano, coi primi motivi nella risposta.
 */
export const POST = withAuth(
  async (request, { venueId, user }) => {
    const parsed = categorizzaInBloccoSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Richiesta non valida', details: parsed.error.issues }, { status: 400 })
    }
    const { ids, filtro, imputazione } = parsed.data

    const where = ids
      ? { id: { in: ids }, venueId, deletedAt: null }
      : costruisciWhere(filtriDaSearchParams(new URLSearchParams(filtro)), venueId)
    const righe = await prisma.bankTransaction.findMany({
      where,
      select: { id: true },
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
    })
    // Gli id chiesti ma non trovati (Cestino, altra sede) contano fra le saltate.
    const trovate = new Set(righe.map((r) => r.id))
    const dettagli: Array<{ id: string; motivo: string }> = (ids ?? [])
      .filter((id) => !trovate.has(id))
      .map((id) => ({ id, motivo: 'Movimento non trovato o nel Cestino' }))

    let toccate = 0
    for (const r of righe) {
      const esito = await promuoviRigaBancaria({
        bankTransactionId: r.id,
        venueId,
        userId: user.id ?? null,
        origine: 'categorizza',
        imputazione,
      })
      if (esito.outcome === 'ok') toccate++
      else dettagli.push({ id: r.id, motivo: String(rispostaPerEsito(esito).corpo.error ?? esito.outcome) })
    }

    await createAuditLog({
      userId: user.id ?? null,
      action: 'UPDATE',
      entityType: 'BankTransaction',
      venueId,
      newValues: { categorizzaInBlocco: true, toccate, saltate: dettagli.length, ...imputazione },
    })

    return NextResponse.json({ toccate, saltate: dettagli.length, dettagli: dettagli.slice(0, 20) })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

- [ ] **Step 5: via `match` e `unmatch`, e i loro consumatori**

1. `git rm "src/app/api/bank-transactions/[id]/match/route.ts" "src/app/api/bank-transactions/[id]/unmatch/route.ts"`.
2. In `src/lib/reconciliation/matcher.ts` togliere per intero le funzioni `manualMatch` (righe 341-398) e `unmatch` (righe 400-420); in `src/lib/reconciliation/index.ts` togliere `manualMatch,` e `unmatch,` dall'export.
3. In `src/lib/reconciliation/__tests__/transazioni-cancellate.itest.ts`: l'import diventa `import { POST as scollegaRiga } from '@/app/api/bank-transactions/[id]/scollega/route'`; le due chiamate usano `scollegaRiga` e l'URL `/api/bank-transactions/${transazione.id}/scollega`; il titolo del `describe` diventa `'POST /api/bank-transactions/[id]/scollega'`; il commento in testa al file dice che `scollega` (come prima `unmatch`) risponde 404 su una riga cancellata. Le asserzioni restano identiche (404 senza toccarla; 200 e `PENDING` sulla riga viva).
4. In `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx`, in `handleUnmatch` l'URL diventa `` `/api/bank-transactions/${id}/scollega` `` e il toast «Movimento scollegato».
5. In `src/components/reconciliation/MatchDialog.tsx`, in `handleMatch` l'URL diventa `` `/api/bank-transactions/${transactionId}/collega` `` e il corpo `JSON.stringify({ scritturaEsistenteId: selectedEntryId })`; il toast «Movimento collegato alla scrittura».
6. In `scripts/check-route-auth.mjs`: `const BASELINE = 250` (riga 292); aggiornare anche il commento «COME AGGIORNARE LA BASELINE» se cita il numero.

- [ ] **Step 6: eseguire**

```bash
TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/app/api/bank-transactions src/lib/reconciliation/__tests__/transazioni-cancellate.itest.ts
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node scripts/check-route-auth.mjs --ratchet
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/reconciliation src/lib/reconciliation
```

Atteso: integrazione verde; `tsc` pulito (se `.next/types` cita ancora `match`/`unmatch`, `PATH=… npx next typegen` e cancellare la cartella `.next/types` delle due rotte); il cricchetto stampa «pari alla baseline» a 250; unit verdi.

- [ ] **Step 7: commit**

```bash
git add src/lib/validations/reconciliation.ts src/lib/banca/esiti-promozione.ts "src/app/api/bank-transactions/[id]/categorizza" "src/app/api/bank-transactions/[id]/collega" "src/app/api/bank-transactions/[id]/scollega" src/app/api/bank-transactions/categorizza-in-blocco src/app/api/bank-transactions/__tests__/azioni-contabili.itest.ts src/lib/reconciliation/matcher.ts src/lib/reconciliation/index.ts src/lib/reconciliation/__tests__/transazioni-cancellate.itest.ts "src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx" src/components/reconciliation/MatchDialog.tsx scripts/check-route-auth.mjs
git commit -m "feat(banca): categorizza, collega, scollega e categorizza in blocco; via match e unmatch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: il contorno che serve ai dialoghi e alla scheda Scritture

**Files:**
- Modify: `src/app/api/scadenzario/route.ts` (`GET`, filtri righe 102-201) + Test: `src/app/api/scadenzario/__tests__/aperte.itest.ts` (nuovo)
- Modify: `src/app/api/prima-nota/route.ts` (`GET`, righe 121-138 e 221-303 e 325-380) + Test: `src/app/api/prima-nota/__tests__/dalla-banca.itest.ts` (nuovo)
- Modify: `src/app/api/prima-nota/[id]/route.ts` (`PUT`, righe 121-131 e 216-262)
- Modify: `src/types/prima-nota.ts` (`JournalEntry`, riga ~112)

**Interfaces:**
- Produces:
  - `GET /api/scadenzario?aperte=1` → solo `stato ∈ {aperta, parzialmente_pagata, scaduta}` (ignorato se arriva anche `stato`)
  - `GET /api/prima-nota?senzaRigaBancaria=true` → solo scritture senza riga bancaria collegata; ogni riga della risposta porta `bankTransactionId: string | null`
  - `PUT /api/prima-nota/[id]` con `date` diversa da quella della riga bancaria collegata → 409 `{ error, code: 'DATA_DALLA_BANCA' }`
  - `JournalEntry.bankTransactionId?: string | null` (tipo client)

- [ ] **Step 1: i test, prima**

Creare `src/app/api/scadenzario/__tests__/aperte.itest.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { GET } from '../route'

setupIntegrationDb()

async function lista(searchParams: Record<string, string>) {
  return callRoute<{ data: Array<{ descrizione: string; importoResiduo: number }> }>(GET, jsonRequest('/api/scadenzario', { searchParams }))
}

// Il dialogo «Collega fattura» chiede solo ciò che si può ancora saldare: gli
// stati aperti sono tre, e `stato=` ne prende uno solo.
describe('GET /api/scadenzario?aperte=1', () => {
  it('prende aperte, parzialmente pagate e scadute; non pagate né annullate', async () => {
    await loginAs('admin')
    await creaScadenza({ descrizione: 'aperta', importoTotale: 100 })
    await creaScadenza({ descrizione: 'parziale', importoTotale: 100, importoPagato: 40, stato: 'parzialmente_pagata' })
    await creaScadenza({ descrizione: 'scaduta', importoTotale: 100, stato: 'scaduta' })
    await creaScadenza({ descrizione: 'pagata', importoTotale: 100, importoPagato: 100, stato: 'pagata' })
    await creaScadenza({ descrizione: 'annullata', importoTotale: 100, stato: 'annullata' })

    const risposta = await lista({ aperte: '1', sortBy: 'descrizione', sortOrder: 'asc' })
    expect(risposta.status).toBe(200)
    expect(risposta.body.data.map((s) => s.descrizione)).toEqual(['aperta', 'parziale', 'scaduta'])
    expect(risposta.body.data.find((s) => s.descrizione === 'parziale')?.importoResiduo).toBe(60)
  })
})
```

(`descrizione` deve stare fra le colonne ordinabili di `CAMPI_ORDINABILI`, riga ~29 di `route.ts`: se non c'è, ordinare per `dataScadenza` dando date diverse alle cinque scadenze e adeguare l'atteso.)

Creare `src/app/api/prima-nota/__tests__/dalla-banca.itest.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaMovimento } from '@/test/integration/fixtures/scadenzario'
import { GET } from '../route'
import { PUT } from '../[id]/route'

setupIntegrationDb()

async function rigaCollegata(journalEntryId: string) {
  const venue = await venueDiTest()
  return prisma.bankTransaction.create({
    data: {
      venueId: venue.id, transactionDate: new Date('2026-08-03'), description: 'Bonifico', amount: -100,
      importSource: 'PSD2_GOCARDLESS', status: 'MANUAL', matchedEntryId: journalEntryId, residuoDocumenti: 0,
    },
  })
}

describe('le scritture nate da una riga bancaria', () => {
  it('la lista dice da quale riga nasce ogni scrittura, e sa escludere quelle collegate', async () => {
    await loginAs('admin')
    const collegata = await creaMovimento({ uscita: 100, description: 'collegata' })
    const libera = await creaMovimento({ uscita: 50, description: 'libera' })
    const riga = await rigaCollegata(collegata.id)

    const tutte = await callRoute<{ data: Array<{ id: string; bankTransactionId: string | null }> }>(GET, jsonRequest('/api/prima-nota', { searchParams: { registerType: 'BANK' } }))
    expect(tutte.status).toBe(200)
    expect(tutte.body.data.find((e) => e.id === collegata.id)?.bankTransactionId).toBe(riga.id)
    expect(tutte.body.data.find((e) => e.id === libera.id)?.bankTransactionId).toBeNull()

    const senza = await callRoute<{ data: Array<{ id: string }> }>(GET, jsonRequest('/api/prima-nota', { searchParams: { registerType: 'BANK', senzaRigaBancaria: 'true' } }))
    expect(senza.body.data.map((e) => e.id)).toEqual([libera.id])
  })

  it('la data di una scrittura collegata alla banca non si cambia dalla prima nota', async () => {
    await loginAs('admin')
    const collegata = await creaMovimento({ uscita: 100, date: new Date('2026-08-03') })
    await rigaCollegata(collegata.id)

    const spostata = await callRoute<{ error?: string; code?: string }, { id: string }>(
      PUT,
      jsonRequest(`/api/prima-nota/${collegata.id}`, { method: 'PUT', body: { date: '2026-08-04', description: 'x' } }),
      { id: collegata.id }
    )
    expect(spostata.status).toBe(409)
    expect(spostata.body.code).toBe('DATA_DALLA_BANCA')

    // La stessa data, o nessuna data: la descrizione si cambia come sempre.
    const stessaData = await callRoute<{ id?: string }, { id: string }>(
      PUT,
      jsonRequest(`/api/prima-nota/${collegata.id}`, { method: 'PUT', body: { date: '2026-08-03', description: 'nuova descrizione' } }),
      { id: collegata.id }
    )
    expect(stessaData.status).toBe(200)
  })
})
```

Eseguire entrambi (`TEST_DB_SUFFIX=consegnab PATH=… npx vitest run --config vitest.integration.config.ts src/app/api/scadenzario/__tests__/aperte.itest.ts src/app/api/prima-nota/__tests__/dalla-banca.itest.ts`) → rossi.

- [ ] **Step 2: scadenzario `aperte=1`**

In `src/app/api/scadenzario/route.ts`, nel `GET`, dopo `const stato = searchParams.get('stato')` aggiungere `const aperte = searchParams.get('aperte') === '1'`, e sostituire il blocco «Filro per stato»:

```ts
    // Filtro per stato: uno solo, oppure «aperte» = i tre stati ancora
    // saldabili (il dialogo «Collega fattura» dell'estratto conto chiede questi).
    if (stato) {
      where.stato = stato as ScheduleStatus
    } else if (aperte) {
      where.stato = { in: ['aperta', 'parzialmente_pagata', 'scaduta'] }
    }
```

- [ ] **Step 3: prima nota — `senzaRigaBancaria` e `bankTransactionId`**

In `src/app/api/prima-nota/route.ts`, `GET`:

1. Dopo `const hidden = …` (riga ~138): `const senzaRigaBancaria = searchParams.get('senzaRigaBancaria') === 'true'`.
2. Dopo il blocco `if (!hidden) { where.hiddenAt = null }` (riga ~218):

```ts
    // «Scrittura esistente» nel dialogo Collega fattura: le scritture BANK che
    // nessuna riga della banca ha ancora agganciato (la R4).
    if (senzaRigaBancaria) {
      where.bankTransaction = null
    }
```

3. Nell'`include` della `findMany` (dopo `scheduleReconciliations: {…}`, riga ~296):

```ts
          // La riga dell'estratto conto da cui la scrittura è nata (o a cui è
          // legata): la lista mostra «dalla banca» e ci porta.
          bankTransaction: { select: { id: true } },
```

4. In `formattedEntries` (dopo `transferId: entry.transferId,`): `bankTransactionId: entry.bankTransaction?.id ?? null,`.

In `src/types/prima-nota.ts`, dopo `riconciliazioni?: …` (riga ~112):

```ts
  // La riga dell'estratto conto collegata: presente sulle scritture promosse
  // dalla banca (o legate a mano); la lista mostra «dalla banca» e ci porta.
  bankTransactionId?: string | null
```

- [ ] **Step 4: prima nota — la data «dalla banca» non si cambia**

In `src/app/api/prima-nota/[id]/route.ts`, `PUT`:

1. Nella `select` di `existingEntry` (riga ~124-130) aggiungere `bankTransaction: { select: { id: true, transactionDate: true } },`.
2. Prima di `// Cambiare conto o centro rimette in discussione…` (riga ~216), dopo il ramo delle chiusure:

```ts
    // La scrittura nata da una riga della banca ha la data della banca (spec
    // estratto conto, decisione 2): si cambia scollegando, non da qui. La
    // stessa data va bene — il form rispedisce tutti i campi.
    if (
      existingEntry.bankTransaction &&
      validatedData.date &&
      validatedData.date.toISOString().slice(0, 10) !== existingEntry.bankTransaction.transactionDate.toISOString().slice(0, 10)
    ) {
      return NextResponse.json(
        {
          error: 'La data di questa scrittura viene dalla banca: si modifica dall\'estratto conto, scollegando la riga',
          code: 'DATA_DALLA_BANCA',
        },
        { status: 409 }
      )
    }
```

- [ ] **Step 5: eseguire e committare**

```bash
TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/app/api/scadenzario src/app/api/prima-nota
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/app/api/prima-nota src/app/api/scadenzario
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
git add src/app/api/scadenzario/route.ts src/app/api/scadenzario/__tests__/aperte.itest.ts src/app/api/prima-nota/route.ts "src/app/api/prima-nota/[id]/route.ts" src/app/api/prima-nota/__tests__/dalla-banca.itest.ts src/types/prima-nota.ts
git commit -m "feat(prima-nota): le scadenze aperte, le scritture senza riga bancaria e la data che viene dalla banca

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: la colonna Categoria, le azioni di riga e il dialogo Categorizza

**Files:**
- Modify: `src/components/banca/estratto-conto/colonne.ts` (+ `__tests__/colonne.test.ts`)
- Modify: `src/components/banca/estratto-conto/IconaStato.tsx`
- Modify: `src/components/banca/estratto-conto/TabellaEstrattoConto.tsx`
- Create: `src/components/banca/estratto-conto/CategorizzaDialog.tsx` (+ `__tests__/CategorizzaDialog.test.tsx`)
- Modify: `src/components/banca/estratto-conto/EstrattoConto.tsx` (+ `__tests__/EstrattoConto.test.tsx`)

**Interfaces:**
- Consumes: `RigaEstrattoConto` con `matchedEntry: ScritturaCollegata | null`, `proposta`, `origineScrittura` (Task 2); rotte `[id]/categorizza`, `categorizza-in-blocco` (Task 5); `AccountCombobox` (`src/components/prima-nota/shared/AccountCombobox.tsx`: `value?`, `onChange(accountId | undefined)`, `disabled?`), `CostCenterSelect` (`value?`, `onChange`, `required?`, `disabled?`), `useAccountsForCombobox()` + `buildCostCenterRuleMap` da `@/hooks/useImputableAccounts` (leggono `/api/accounts` → `{ accounts }` e `/api/cost-centers` → `{ costCenters }`).
- Produces:
  ```ts
  // colonne.ts
  export type IdColonna = 'data' | 'descrizione' | 'causale' | 'conto' | 'categoria' | 'stato' | 'importo'
  export const CHIAVE_COLONNE_NASCOSTE = 'weiss.estrattoConto.colonneNascoste'
  // CategorizzaDialog.tsx
  export type BersaglioCategorizza = { tipo: 'riga'; riga: RigaEstrattoConto } | { tipo: 'selezione'; ids: string[] } | { tipo: 'filtro'; filtro: Record<string, string>; totale: number }
  export function CategorizzaDialog(p: { bersaglio: BersaglioCategorizza | null; open: boolean; onOpenChange: (o: boolean) => void; onFatto: () => void })
  // TabellaEstrattoConto: prop in più  onCategorizza(riga)   (onCollega/onScollega: Task 8)
  // IconaStato: prop in più  proposta?: boolean
  ```

- [ ] **Step 1: i test delle colonne**

In `src/components/banca/estratto-conto/__tests__/colonne.test.ts`, dentro `describe('colonne visibili')`, sostituire i due casi «ignora identificativi sconosciuti…» e «rispetta l'ordine…» e aggiungerne due:

```ts
  // La memoria della consegna A elencava le VISIBILI: si legge una volta e si
  // capisce cosa era nascosto fra le colonne di allora. Una colonna nuova
  // (Categoria) nasce visibile anche per chi aveva già salvato.
  it('legge la memoria della consegna A e mostra comunque la colonna nuova', () => {
    expect([...leggiColonneVisibili(memoria({ 'weiss.estrattoConto.colonne': '["data","fantasma"]' }))]).toEqual(['data', 'categoria'])
    expect([...leggiColonneVisibili(memoria({ 'weiss.estrattoConto.colonne': '{rotto' }))]).toEqual(COLONNE.map((c) => c.id))
  })

  it('rispetta l\'ordine delle colonne, non quello salvato', () => {
    const m = memoria()
    salvaColonneVisibili(m, new Set(['importo', 'data']))
    expect([...leggiColonneVisibili(m)]).toEqual(['data', 'importo'])
  })

  it('salva le NASCOSTE, così una colonna futura nasce visibile', () => {
    const m = memoria()
    salvaColonneVisibili(m, new Set(['data', 'descrizione', 'conto', 'categoria', 'stato', 'importo']))
    expect(m.dati['weiss.estrattoConto.colonneNascoste']).toBe('["causale"]')
    expect(m.dati['weiss.estrattoConto.colonne']).toBeUndefined()
  })

  it('la memoria nuova vince su quella vecchia', () => {
    const m = memoria({ 'weiss.estrattoConto.colonne': '["data"]', 'weiss.estrattoConto.colonneNascoste': '["importo"]' })
    expect([...leggiColonneVisibili(m)]).toEqual(['data', 'descrizione', 'causale', 'conto', 'categoria', 'stato'])
  })
```

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca/estratto-conto/__tests__/colonne.test.ts` → rosso.

- [ ] **Step 2: `colonne.ts`**

Sostituire il tipo, l'elenco e le due funzioni delle colonne:

```ts
export type IdColonna = 'data' | 'descrizione' | 'causale' | 'conto' | 'categoria' | 'stato' | 'importo'

export const COLONNE: readonly Colonna[] = [
  { id: 'data', etichetta: 'Data', ordina: 'data' },
  { id: 'descrizione', etichetta: 'Descrizione', ordina: 'descrizione' },
  { id: 'causale', etichetta: 'Causale', ordina: 'causale' },
  { id: 'conto', etichetta: 'Conto Bancario' },
  { id: 'categoria', etichetta: 'Categoria' },
  { id: 'stato', etichetta: 'Stato' },
  { id: 'importo', etichetta: 'Importo', ordina: 'importo', aDestra: true },
]

/** La chiave della consegna A: elencava le VISIBILI. Si legge ancora, non si scrive più. */
export const CHIAVE_COLONNE = 'weiss.estrattoConto.colonne'
/** Da qui in poi si salvano le NASCOSTE: una colonna aggiunta dopo nasce visibile. */
export const CHIAVE_COLONNE_NASCOSTE = 'weiss.estrattoConto.colonneNascoste'
export const CHIAVE_RIGHE = 'weiss.estrattoConto.righePerPagina'
export const RIGHE_PER_PAGINA = [20, 50, 100] as const

const TUTTE = COLONNE.map((c) => c.id)
/** Le colonne che esistevano quando la memoria salvava le visibili: da lì si capisce cosa era stato nascosto. */
const COLONNE_DELLA_CONSEGNA_A: readonly IdColonna[] = ['data', 'descrizione', 'causale', 'conto', 'stato', 'importo']

function daNascoste(nascoste: unknown): Set<IdColonna> {
  if (!Array.isArray(nascoste)) return new Set(TUTTE)
  const visibili = TUTTE.filter((id) => !nascoste.includes(id))
  return new Set(visibili.length > 0 ? visibili : TUTTE)
}

export function leggiColonneVisibili(storage: Pick<Storage, 'getItem'> | null): Set<IdColonna> {
  try {
    const nascoste = storage?.getItem(CHIAVE_COLONNE_NASCOSTE)
    if (nascoste) return daNascoste(JSON.parse(nascoste))
    // La memoria della consegna A: ciò che non c'era, era nascosto — ma solo
    // fra le colonne di allora, così la Categoria compare anche a chi aveva
    // già scelto le sue colonne.
    const grezzo = storage?.getItem(CHIAVE_COLONNE)
    if (!grezzo) return new Set(TUTTE)
    const visibiliAllora = JSON.parse(grezzo)
    if (!Array.isArray(visibiliAllora)) return new Set(TUTTE)
    return daNascoste(COLONNE_DELLA_CONSEGNA_A.filter((id) => !visibiliAllora.includes(id)))
  } catch {
    return new Set(TUTTE)
  }
}

export function salvaColonneVisibili(
  storage: Pick<Storage, 'setItem'> | null,
  visibili: Set<IdColonna>
): void {
  storage?.setItem(CHIAVE_COLONNE_NASCOSTE, JSON.stringify(TUTTE.filter((id) => !visibili.has(id))))
}
```

(`leggiRighePerPagina`/`salvaRighePerPagina` invariate.) → il test del passo 1 verde. In `EstrattoConto.test.tsx`, nel caso «il menu Colonne nasconde una colonna e resta aperto», le due asserzioni finali diventano:

```ts
    expect(window.localStorage.getItem('weiss.estrattoConto.colonneNascoste')).toContain('"causale"')
    expect(window.localStorage.getItem('weiss.estrattoConto.colonneNascoste')).not.toContain('"data"')
```

- [ ] **Step 3: il test del dialogo Categorizza**

Creare `src/components/banca/estratto-conto/__tests__/CategorizzaDialog.test.tsx`:

```tsx
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CategorizzaDialog, type BersaglioCategorizza } from '../CategorizzaDialog'
import { installaStubDom } from '@/components/scadenzario/__tests__/render-helpers'
import type { RigaEstrattoConto } from '@/types/reconciliation'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

// Il combobox dei conti è già provato per conto suo: qui si sostituisce con un
// select nudo, così il test parla della categorizzazione e non di Radix.
vi.mock('@/components/prima-nota/shared/AccountCombobox', () => ({
  AccountCombobox: ({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) => (
    <select aria-label="Conto" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">—</option>
      <option value="c-costo">05.01 Commissioni bancarie</option>
      <option value="c-obbligatorio">02.01 Materie prime</option>
    </select>
  ),
}))
vi.mock('@/components/prima-nota/shared/CostCenterSelect', () => ({
  CostCenterSelect: ({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) => (
    <select aria-label="Centro di costo" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">Nessuno</option>
      <option value="cc-weiss">WEISS</option>
    </select>
  ),
}))
vi.mock('@/hooks/useImputableAccounts', () => ({
  useAccountsForCombobox: () => ({
    data: [
      { id: 'c-costo', code: '05.01', name: 'Commissioni bancarie', type: 'COSTO', costCenterRule: 'DEFAULT_STR' },
      { id: 'c-obbligatorio', code: '02.01', name: 'Materie prime', type: 'COSTO', costCenterRule: 'OBBLIGATORIO' },
    ],
  }),
  buildCostCenterRuleMap: (conti: Array<{ id: string; costCenterRule: string }>) => new Map(conti.map((c) => [c.id, c.costCenterRule])),
}))

beforeAll(() => installaStubDom())

const RIGA = {
  id: 't1', venueId: 'v1', transactionDate: '2026-08-14', valueDate: null, description: 'Commissioni', descrizione: null,
  causale: 'Commissioni', note: null, amount: -0.75, balanceAfter: null, bankReference: null, importBatchId: null,
  importedAt: '2026-08-16T09:58:00.000Z', importSource: 'PSD2_GOCARDLESS', status: 'PENDING', sezione: 'ATTIVI', bankTransactionCode: '16//00',
  matchedEntryId: null, matchConfidence: null, reconciledBy: null, reconciledAt: null, createdAt: '2026-08-16T09:58:00.000Z', deletedAt: null,
  matchedEntry: null, bankAccount: { id: 'c1', name: 'Weiss' }, modificato: false, stato: 'non_abbinato', residuo: 0.75,
  origineScrittura: null, residuoDocumenti: null, proposta: false,
} as unknown as RigaEstrattoConto

let chiamate: Array<{ url: string; init?: RequestInit }> = []
let fatto = 0
function monta(bersaglio: BersaglioCategorizza, risposta: unknown = { ok: true, creata: true }) {
  chiamate = []
  fatto = 0
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    chiamate.push({ url: String(url), init })
    return { ok: true, json: async () => risposta }
  }) as unknown as typeof fetch
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CategorizzaDialog bersaglio={bersaglio} open onOpenChange={() => {}} onFatto={() => fatto++} />
    </QueryClientProvider>
  )
}

describe('CategorizzaDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('su una riga mostra il riepilogo e manda conto e centro alla rotta della riga', async () => {
    monta({ tipo: 'riga', riga: RIGA })
    expect(screen.getByText('Categorizza movimento')).toBeInTheDocument()
    expect(screen.getByText('Commissioni')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Categorizza' })).toBeDisabled() // niente conto, niente invio

    fireEvent.change(screen.getByLabelText('Conto'), { target: { value: 'c-costo' } })
    fireEvent.change(screen.getByLabelText('Centro di costo'), { target: { value: 'cc-weiss' } })
    fireEvent.click(screen.getByRole('button', { name: 'Categorizza' }))

    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(chiamate[0].url).toBe('/api/bank-transactions/t1/categorizza')
    expect(JSON.parse(String(chiamate[0].init?.body))).toEqual({ accountId: 'c-costo', costCenterId: 'cc-weiss' })
    await waitFor(() => expect(fatto).toBe(1))
  })

  it('un conto con centro obbligatorio non parte senza centro', () => {
    monta({ tipo: 'riga', riga: RIGA })
    fireEvent.change(screen.getByLabelText('Conto'), { target: { value: 'c-obbligatorio' } })
    expect(screen.getByRole('button', { name: 'Categorizza' })).toBeDisabled()
    expect(screen.getByText(/obbligatorio per questo conto/)).toBeInTheDocument()
  })

  it('su una selezione manda gli id alla rotta in blocco', async () => {
    monta({ tipo: 'selezione', ids: ['a', 'b', 'c'] }, { toccate: 3, saltate: 0 })
    expect(screen.getByText('Categorizza 3 movimenti')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Conto'), { target: { value: 'c-costo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Categorizza' }))
    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(chiamate[0].url).toBe('/api/bank-transactions/categorizza-in-blocco')
    expect(JSON.parse(String(chiamate[0].init?.body))).toEqual({ ids: ['a', 'b', 'c'], imputazione: { accountId: 'c-costo' } })
  })

  it('su «tutte le N del filtro» manda il filtro, non gli id', async () => {
    monta({ tipo: 'filtro', filtro: { search: 'commissioni' }, totale: 62 }, { toccate: 62, saltate: 0 })
    expect(screen.getByText('Categorizza 62 movimenti')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Conto'), { target: { value: 'c-costo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Categorizza' }))
    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(JSON.parse(String(chiamate[0].init?.body))).toEqual({ filtro: { search: 'commissioni' }, imputazione: { accountId: 'c-costo' } })
  })

  it('su una riga già promossa parte dalla categoria attuale, e con le fette non si può', () => {
    const promossa = { ...RIGA, matchedEntryId: 'e1', stato: 'abbinato_manualmente', matchedEntry: { id: 'e1', date: '2026-08-14', description: 'Commissioni', debitAmount: null, creditAmount: 0.75, documentRef: null, account: { id: 'c-costo', code: '05.01', name: 'Commissioni bancarie' }, costCenter: { id: 'cc-weiss', code: 'WEISS', name: 'Weiss' }, fette: 2 } } as unknown as RigaEstrattoConto
    monta({ tipo: 'riga', riga: promossa })
    expect((screen.getByLabelText('Conto') as HTMLSelectElement).value).toBe('c-costo')
    expect(screen.getByText(/ripartita/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Categorizza' })).toBeDisabled()
  })
})
```

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca/estratto-conto/__tests__/CategorizzaDialog.test.tsx` → rosso: modulo assente.

- [ ] **Step 4: `CategorizzaDialog.tsx`**

```tsx
'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AccountCombobox } from '@/components/prima-nota/shared/AccountCombobox'
import { CostCenterSelect } from '@/components/prima-nota/shared/CostCenterSelect'
import { useAccountsForCombobox, buildCostCenterRuleMap } from '@/hooks/useImputableAccounts'
import { formatCurrency } from '@/lib/formatters'
import type { RigaEstrattoConto } from '@/types/reconciliation'

/** Su cosa si categorizza: una riga, le righe selezionate, o tutte quelle del filtro. */
export type BersaglioCategorizza =
  | { tipo: 'riga'; riga: RigaEstrattoConto }
  | { tipo: 'selezione'; ids: string[] }
  | { tipo: 'filtro'; filtro: Record<string, string>; totale: number }

interface Props {
  bersaglio: BersaglioCategorizza | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A cose fatte: il contenitore ricarica la lista e svuota la selezione. */
  onFatto: () => void
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function quante(b: BersaglioCategorizza): number {
  if (b.tipo === 'riga') return 1
  if (b.tipo === 'selezione') return b.ids.length
  return b.totale
}

/**
 * Categorizza: la riga diventa una scrittura di prima nota con conto e centro
 * (spec, «Le azioni»); in blocco, N righe con la stessa imputazione — le 62
 * commissioni in un colpo. La categoria di budget non si chiede: si deriva dal
 * conto (piano dei conti v4).
 */
export function CategorizzaDialog({ bersaglio, open, onOpenChange, onFatto }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        {/* La `key` rifà il modulo da capo quando cambia il bersaglio senza
            chiudere: i campi nascono già dalla riga, senza un effetto. */}
        {bersaglio && (
          <Modulo
            key={bersaglio.tipo === 'riga' ? bersaglio.riga.id : `${bersaglio.tipo}-${quante(bersaglio)}`}
            bersaglio={bersaglio}
            onChiudi={() => onOpenChange(false)}
            onFatto={onFatto}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Modulo({
  bersaglio,
  onChiudi,
  onFatto,
}: {
  bersaglio: BersaglioCategorizza
  onChiudi: () => void
  onFatto: () => void
}) {
  const riga = bersaglio.tipo === 'riga' ? bersaglio.riga : null
  const n = quante(bersaglio)
  const [accountId, setAccountId] = React.useState<string | undefined>(riga?.matchedEntry?.account?.id)
  const [costCenterId, setCostCenterId] = React.useState<string | undefined>(riga?.matchedEntry?.costCenter?.id)
  const [inCorso, setInCorso] = React.useState(false)

  const { data: conti = [] } = useAccountsForCombobox()
  const regolaPerConto = React.useMemo(() => buildCostCenterRuleMap(conti), [conti])
  const centroObbligatorio = accountId ? regolaPerConto.get(accountId) === 'OBBLIGATORIO' : false
  const centroMancante = centroObbligatorio && !costCenterId
  // Con le fette il conto lo governa la suddivisione: la rotta rifiuterebbe,
  // e qui lo si dice prima.
  const conFette = (riga?.matchedEntry?.fette ?? 0) > 0

  const invia = async () => {
    if (!accountId || centroMancante || conFette) return
    setInCorso(true)
    try {
      const imputazione = { accountId, ...(costCenterId ? { costCenterId } : {}) }
      let url: string
      let corpo: unknown
      if (bersaglio.tipo === 'riga') {
        url = `/api/bank-transactions/${bersaglio.riga.id}/categorizza`
        corpo = imputazione
      } else {
        url = '/api/bank-transactions/categorizza-in-blocco'
        corpo = bersaglio.tipo === 'selezione' ? { ids: bersaglio.ids, imputazione } : { filtro: bersaglio.filtro, imputazione }
      }
      const r = await fetch(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(corpo) })
      const json = (await r.json().catch(() => ({}))) as { error?: string; creata?: boolean; toccate?: number; saltate?: number }
      if (!r.ok) throw new Error(json.error || 'Categorizzazione non riuscita')

      if (riga) {
        toast.success(json.creata ? 'Movimento categorizzato' : 'Categoria aggiornata')
      } else {
        const toccate = json.toccate ?? 0
        const saltate = json.saltate ?? 0
        toast.success(
          `${toccate} ${toccate === 1 ? 'movimento categorizzato' : 'movimenti categorizzati'}` +
            (saltate > 0 ? ` · ${saltate} ${saltate === 1 ? 'saltato' : 'saltati'}` : '')
        )
      }
      onFatto()
      onChiudi()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore sconosciuto')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {riga ? 'Categorizza movimento' : n === 1 ? 'Categorizza 1 movimento' : `Categorizza ${n} movimenti`}
        </DialogTitle>
        <DialogDescription>
          {riga
            ? 'Il movimento diventa una scrittura di prima nota con il conto e il centro scelti. Data, importo e verso restano quelli della banca.'
            : 'Ogni movimento diventa una scrittura di prima nota con lo stesso conto e centro; quelli già categorizzati ricevono la nuova imputazione.'}
        </DialogDescription>
      </DialogHeader>

      {riga && (
        <div className="space-y-1.5 rounded-lg border bg-muted/50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Data</span>
            <span className="font-medium">{format(new Date(riga.transactionDate), 'dd/MM/yyyy', { locale: it })}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="shrink-0 text-muted-foreground">Descrizione</span>
            <span className="min-w-0 truncate text-right font-medium">{riga.descrizione ?? riga.description}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Importo</span>
            <span className="font-medium">
              {riga.amount > 0 ? '+' : '−'}
              {formatCurrency(Math.abs(riga.amount))}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label>Conto</Label>
          <AccountCombobox value={accountId} onChange={setAccountId} disabled={inCorso || conFette} />
        </div>
        <div className="space-y-1.5">
          <Label>Centro di costo{centroObbligatorio ? ' *' : ''}</Label>
          <CostCenterSelect value={costCenterId} onChange={setCostCenterId} required={centroObbligatorio} disabled={inCorso || conFette} />
          {centroMancante && <p className="text-xs text-destructive">Il centro di costo è obbligatorio per questo conto.</p>}
        </div>
        {conFette && (
          <p className="text-xs text-muted-foreground">
            La scrittura collegata è ripartita su più conti dalla fattura: la categoria si modifica dalla prima nota.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onChiudi} disabled={inCorso}>
          Annulla
        </Button>
        <Button type="button" onClick={invia} disabled={inCorso || !accountId || centroMancante || conFette}>
          {inCorso ? 'Salvataggio…' : 'Categorizza'}
        </Button>
      </DialogFooter>
    </>
  )
}
```

→ il test del passo 3 verde (`npx vitest run src/components/banca/estratto-conto/__tests__/CategorizzaDialog.test.tsx`).

- [ ] **Step 5: i test della lista con le azioni nuove**

In `src/components/banca/estratto-conto/__tests__/EstrattoConto.test.tsx`:

1. Nella funzione `riga(...)` aggiungere ai campi di default `origineScrittura: null, residuoDocumenti: null, proposta: false,`.
2. In `stubTutto`, prima della voce `['/api/bank-transactions', lista]`, aggiungere le tre rotte nuove (la ricerca si ferma al primo prefisso): `['/api/bank-transactions/categorizza-in-blocco', { toccate: 2, saltate: 0 }],`, e in fondo `['/api/accounts', { accounts: [] }], ['/api/cost-centers', { costCenters: [] }], ['/api/scadenzario', { data: [] }], ['/api/prima-nota', { data: [] }],`.
3. Aggiungere questi casi al `describe('EstrattoConto')`:

```tsx
  it('mostra la colonna Categoria dalla scrittura collegata', async () => {
    const collegata = riga('3', {
      amount: -0.75, matchedEntryId: 'e1', status: 'MANUAL', stato: 'abbinato_manualmente', residuo: 0, residuoDocumenti: 0,
      origineScrittura: 'CATEGORIZZA',
      matchedEntry: { id: 'e1', date: '2026-08-14', description: 'Commissioni', debitAmount: null, creditAmount: 0.75, documentRef: null, account: { id: 'a1', code: '05.01', name: 'Commissioni bancarie' }, costCenter: { id: 'cc1', code: 'STR', name: 'Struttura' }, fette: 0 },
    })
    stubTutto({ ...RISPOSTA, data: [riga('1'), collegata] })
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')
    expect(perTesto('Categoria', 'th')).toBeTruthy()
    expect(testoDellaPagina()).toContain('05.01')
    expect(testoDellaPagina()).toContain('Commissioni bancarie')
  })

  it('le azioni di riga: Categorizza e Riconcilia nel menu di una riga libera', async () => {
    const collegata = riga('3', { matchedEntryId: 'e1', status: 'MANUAL', stato: 'abbinato_manualmente', residuo: 0, residuoDocumenti: 0, origineScrittura: 'COLLEGA',
      matchedEntry: { id: 'e1', date: '2026-08-14', description: 'x', debitAmount: 907.9, creditAmount: null, documentRef: null, account: null, costCenter: null, fette: 0 } })
    stubTutto({ ...RISPOSTA, data: [riga('1'), collegata] })
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    // Il menu ⋯ della riga libera ha Categorizza e Riconcilia; Riconcilia porta alla pagina di riconciliazione filtrata.
    const menu = document.querySelectorAll('button[aria-label="Altre azioni"]')[0]
    await aprireMenu(menu)
    await attendiChe(() => !!perTesto('Categorizza', '[role="menuitem"]'), 'il menu')
    const riconcilia = perTesto('Riconcilia', '[role="menuitem"] a, a[role="menuitem"]') ?? perTesto('Riconcilia', 'a')
    expect(riconcilia?.getAttribute('href')).toBe('/riconciliazione?movimento=1')

    // Categorizza apre il dialogo sulla riga.
    await cliccare(perTesto('Categorizza', '[role="menuitem"]'))
    await attendiChe(() => testoDellaPagina().includes('Categorizza movimento'), 'il dialogo')
  })

  it('con «movimento» nell\'URL mostra il chip e «Mostra tutti» lo toglie', async () => {
    stubTutto({ ...RISPOSTA, data: [riga('1')], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })
    await montare(<EstrattoConto venueId="v1" filtriIniziali={{ ...FILTRI_DEFAULT, movimento: '1' }} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'la riga')
    expect(testoDellaPagina()).toContain('Stai guardando un solo movimento')
    await cliccare(perTesto('Mostra tutti', 'button'))
    await attendiChe(() => richiesteLista().some((u) => !u.includes('movimento=')), 'la lista intera')
  })

  it('«Categorizza» dalla barra della selezione apre il dialogo per le righe scelte', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')
    await cliccare(document.querySelector('tbody [role="checkbox"]'))
    await attendiChe(() => testoDellaPagina().includes('1 selezionato'), 'la barra')
    await cliccare(perTesto('Categorizza', 'button'))
    await attendiChe(() => testoDellaPagina().includes('Categorizza 1 movimento'), 'il dialogo')
  })
```

(L'ultimo caso appartiene al Task 9 quanto a comportamento, ma vive qui perché il dialogo e il contenitore si toccano una volta sola: se la barra non ha ancora «Categorizza» quando si esegue questo task, il caso resta rosso fino al Task 9 — segnarlo nel report, non cancellarlo. La casella si seleziona come negli altri casi del file: `document.querySelector('tbody [role="checkbox"]')`.)

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca/estratto-conto/__tests__/EstrattoConto.test.tsx` → rossi i casi nuovi.

- [ ] **Step 6: `IconaStato.tsx` — il puntino della proposta**

Sostituire la firma e il corpo:

```tsx
export function IconaStato({ stato, residuo, proposta = false }: { stato: StatoLegenda; residuo: number; proposta?: boolean }) {
  const { Icona, classe } = STILE[stato]
  return (
    <span className="inline-flex items-center gap-1.5" title={ETICHETTE_STATO[stato]}>
      {/* `role="img"`: su un elemento generico l'`aria-label` non viene letto,
          e lo stato resterebbe un quadratino colorato e muto. */}
      <span
        role="img"
        className={cn('relative inline-flex h-6 w-8 items-center justify-center rounded-md', classe)}
        aria-label={ETICHETTE_STATO[stato]}
      >
        <Icona className="h-3.5 w-3.5" aria-hidden />
        {/* «C'è una proposta»: il puntino della spec sul Non abbinato (una
            proposta del motore da rivedere non è un abbinamento). */}
        {proposta && (
          <span
            role="img"
            aria-label="C'è una proposta da rivedere"
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-amber-500"
          />
        )}
      </span>
      {/* Il residuo si scrive solo se c'è: nella legenda l'icona compare a
          residuo zero, e «0,00 €» accanto a «Parzialmente abbinato» è rumore. */}
      {stato === 'parziale' && residuo > 0 && (
        <span className="text-xs text-orange-600">{formatCurrency(residuo)}</span>
      )}
    </span>
  )
}
```

- [ ] **Step 7: `TabellaEstrattoConto.tsx`**

1. Import: aggiungere `Link` da `next/link`, e da `lucide-react` `Tag, ArrowLeftRight` (niente altro cambia negli import esistenti; `Link2` e `Unlink` arrivano col Task 8).
2. `Props`: aggiungere

```ts
  onCategorizza: (riga: RigaEstrattoConto) => void
```

   (`onCollega` e `onScollega` arrivano col Task 8, insieme ai loro pulsanti: qui non si aggiunge nessun bottone che non faccia ancora nulla.)

3. La cella `stato` passa il puntino: `case 'stato': return <IconaStato stato={r.stato} residuo={r.residuo} proposta={r.proposta} />`.
4. Aggiungere la cella `categoria` (dopo `case 'conto'`):

```tsx
    case 'categoria': {
      const scrittura = r.matchedEntry
      // Una proposta da rivedere porta una scrittura che nessuno ha confermato:
      // la sua categoria non è ancora quella della riga.
      if (!scrittura || r.proposta) return <span className="text-muted-foreground">—</span>
      // Dalla scrittura collegata (spec, decisione 3): conto e centro; senza
      // conto (una R4 senza imputazione, o una collega senza fornitore) si
      // dice «da imputare» — è collegata, ma la categoria manca ancora.
      return (
        <div className="max-w-[16rem]">
          {scrittura.account ? (
            <span className="block truncate" title={`${scrittura.account.code} ${scrittura.account.name}`}>
              <span className="font-mono text-xs text-muted-foreground">{scrittura.account.code}</span> {scrittura.account.name}
            </span>
          ) : (
            <span className="text-muted-foreground">da imputare</span>
          )}
          {scrittura.costCenter && (
            <span className="block truncate text-xs text-muted-foreground" title={scrittura.costCenter.name}>
              {scrittura.costCenter.code} · {scrittura.costCenter.name}
            </span>
          )}
        </div>
      )
    }
```

5. La cella delle azioni diventa (al posto del blocco `<td className="px-3 py-2 text-right whitespace-nowrap">…</td>` attuale):

```tsx
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <Button variant="ghost" size="icon" aria-label="Modifica" onClick={() => p.onModifica(r)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
                {/* Qui, fra Modifica e il menu, il Task 8 mette Collega fattura / Scollega. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Altre azioni">
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!p.filtri.cestino && (
                      <>
                        <DropdownMenuItem onClick={() => p.onCategorizza(r)}>
                          <Tag className="mr-2 h-4 w-4" aria-hidden />
                          Categorizza
                        </DropdownMenuItem>
                        {/* Riconcilia porta allo strumento, filtrato su questa
                            riga: oggi la pagina di riconciliazione, domani la
                            coda delle proposte allo stesso indirizzo. Solo
                            sulle righe non collegate: una collegata non ha
                            nulla da riconciliare. */}
                        {(!r.matchedEntryId || r.proposta) && (
                          <DropdownMenuItem asChild>
                            <Link href={`/riconciliazione?movimento=${r.id}`}>
                              <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden />
                              Riconcilia
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Sposta in</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {SEZIONI.filter((s) => s.valore !== r.sezione).map((s) => (
                              <DropdownMenuItem key={s.valore} onClick={() => p.onSposta(r, s.valore)}>
                                {s.etichetta}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </>
                    )}
                    <DropdownMenuItem onClick={() => p.onDettagli(r)}>Vedi dettagli</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {p.filtri.cestino ? (
                  <Button variant="ghost" size="icon" aria-label="Ripristina" onClick={() => p.onRipristina(r)}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" aria-label="Sposta nel Cestino" onClick={() => p.onCestino(r)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </td>
```

- [ ] **Step 8: `EstrattoConto.tsx` — i dialoghi, il chip, il filtro `movimento`**

1. Import: `import { CategorizzaDialog, type BersaglioCategorizza } from './CategorizzaDialog'`; da `lucide-react` aggiungere `X`.
2. In `FILTRI_PULITI` aggiungere `movimento: undefined,` (così «Cancella filtri» toglie anche il collegamento profondo, e `ciSonoFiltri` lo conta).
3. Stato nuovo, accanto agli altri `useState`: `const [daCategorizzare, impostaDaCategorizzare] = useState<BersaglioCategorizza | null>(null)`.
4. In `azioneInBlocco`, prima di comporre `corpo`:

```ts
    if (azione === 'categorizza') {
      // Non una rotta insiemistica ma un dialogo: la scelta di conto e centro
      // vale per tutte le righe, poi il server le promuove una per una.
      impostaDaCategorizzare(
        tutteDelFiltro
          ? { tipo: 'filtro', filtro: Object.fromEntries(filtriInSearchParams(filtri)), totale }
          : { tipo: 'selezione', ids: [...selezionati] }
      )
      return
    }
```

   e il tipo di `FATTO` diventa `Record<Exclude<AzioneInBlocco, 'categorizza'>, [string, string]>` (la voce `categorizza` non c'è: si esce prima). L'indicizzazione `FATTO[azione]` va scritta dopo il `return`, quindi `azione` è già ristretta — se TypeScript non lo restringe da solo, usare `FATTO[azione as Exclude<AzioneInBlocco, 'categorizza'>]`.
5. Il chip del collegamento profondo, subito sotto `<PannelloFiltri …/>`:

```tsx
      {filtri.movimento && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span>Stai guardando un solo movimento.</span>
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => cambiaFiltri({ movimento: undefined, page: 1 })}>
            Mostra tutti
          </Button>
        </div>
      )}
```

6. Alla `<TabellaEstrattoConto …>` aggiungere la prop:

```tsx
          onCategorizza={(riga) => impostaDaCategorizzare({ tipo: 'riga', riga })}
```

   (`onCollega`/`onScollega`, i loro stati e i loro dialoghi arrivano col Task 8.)
7. In fondo, accanto agli altri dialoghi:

```tsx
      <CategorizzaDialog
        bersaglio={daCategorizzare}
        open={!!daCategorizzare}
        onOpenChange={(aperto) => !aperto && impostaDaCategorizzare(null)}
        onFatto={() => {
          impostaSelezionati(new Set())
          impostaTutteDelFiltro(false)
          ricarica()
        }}
      />
```

8. In `BarraSelezione.tsx` estendere **solo il tipo**: `export type AzioneInBlocco = 'sposta' | 'cestino' | 'ripristina' | 'categorizza'` — senza il tipo esteso il confronto `azione === 'categorizza'` del punto 4 è un errore di compilazione (TS2367, i tipi non si sovrappongono). Il pulsante «Categorizza» nella barra arriva col Task 9.

- [ ] **Step 9: eseguire**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca src/lib/banca
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run lint
```

Atteso: verdi (tranne l'ultimo caso del passo 5, che aspetta il Task 9: segnarlo nel report), `tsc` e lint puliti. Se il menu ⋯ nel test non mostra «Riconcilia» come `[role="menuitem"] a`: `DropdownMenuItem asChild` con `Link` rende un `<a role="menuitem">`; adeguare il selettore del test, non il componente.

- [ ] **Step 10: commit**

```bash
git add src/components/banca/estratto-conto
git commit -m "feat(banca): la colonna Categoria, Categorizza singola e il puntino della proposta nell'estratto conto

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Collega fattura (due schede) e Scollega

**Files:**
- Create: `src/components/banca/estratto-conto/CollegaFatturaDialog.tsx` (+ `__tests__/CollegaFatturaDialog.test.tsx`)
- Create: `src/components/banca/estratto-conto/ScollegaDialog.tsx`
- Modify: `src/components/banca/estratto-conto/TabellaEstrattoConto.tsx` (i due pulsanti e la voce «Collega altra fattura»)
- Modify: `src/components/banca/estratto-conto/EstrattoConto.tsx` (+ `__tests__/EstrattoConto.test.tsx`)

**Interfaces:**
- Consumes: `GET /api/scadenzario?aperte=1&tipo=…&search=…&limit=20&sortBy=dataScadenza&sortOrder=asc` → `{ data: [{ id, descrizione, dataScadenza, numeroDocumento, controparteNome, importoResiduo, supplier: { id, name } | null }] }` (Task 6); `GET /api/prima-nota?registerType=BANK&senzaRigaBancaria=true&direction=inflow|outflow&dateFrom&dateTo&search&limit=20` → `{ data: [{ id, date, description, debitAmount, creditAmount, documentRef, account }] }` (Task 6; `direction`, `dateFrom`, `dateTo`, `search` esistono già nella rotta); `POST [id]/collega`, `POST [id]/scollega` (Task 5); `useDebounce` da `@/hooks/useDebounce`; `Tabs` da `@/components/ui/tabs`; `AlertDialog*` da `@/components/ui/alert-dialog`.
- Produces:
  ```ts
  export function CollegaFatturaDialog(p: { riga: RigaEstrattoConto | null; open: boolean; onOpenChange: (o: boolean) => void; onFatto: () => void })
  export function ScollegaDialog(p: { riga: RigaEstrattoConto | null; open: boolean; onOpenChange: (o: boolean) => void; onFatto: () => void })
  // TabellaEstrattoConto: props in più  onCollega(riga), onScollega(riga)
  ```

- [ ] **Step 1: il test del dialogo Collega fattura**

Creare `src/components/banca/estratto-conto/__tests__/CollegaFatturaDialog.test.tsx`:

```tsx
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CollegaFatturaDialog } from '../CollegaFatturaDialog'
import { installaStubDom } from '@/components/scadenzario/__tests__/render-helpers'
import type { RigaEstrattoConto } from '@/types/reconciliation'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

beforeAll(() => installaStubDom())

const RIGA = {
  id: 't1', venueId: 'v1', transactionDate: '2026-08-14', valueDate: null, description: 'Bonifico tramite Internet Banking *ROSSI SRL', descrizione: 'ROSSI SRL',
  causale: 'Bonifico tramite internet banking', note: null, amount: -100, balanceAfter: null, bankReference: null, importBatchId: null,
  importedAt: '2026-08-16T09:58:00.000Z', importSource: 'PSD2_GOCARDLESS', status: 'PENDING', sezione: 'ATTIVI', bankTransactionCode: '26//11',
  matchedEntryId: null, matchConfidence: null, reconciledBy: null, reconciledAt: null, createdAt: '2026-08-16T09:58:00.000Z', deletedAt: null,
  matchedEntry: null, bankAccount: { id: 'c1', name: 'Weiss' }, modificato: false, stato: 'non_abbinato', residuo: 100,
  origineScrittura: null, residuoDocumenti: null, proposta: false,
} as unknown as RigaEstrattoConto

const SCADENZE = {
  data: [
    { id: 's1', descrizione: 'Fattura Rossi 12', dataScadenza: '2026-08-15', numeroDocumento: 'FT 12', controparteNome: null, importoResiduo: 60, supplier: { id: 'f1', name: 'Rossi Srl' } },
    { id: 's2', descrizione: 'Fattura Rossi 13', dataScadenza: '2026-08-20', numeroDocumento: 'FT 13', controparteNome: null, importoResiduo: 70, supplier: { id: 'f1', name: 'Rossi Srl' } },
  ],
}
const SCRITTURE = {
  data: [
    { id: 'e1', date: '2026-08-14', description: 'Incasso POS 14/08', debitAmount: null, creditAmount: 100, documentRef: null, account: { code: '10.01', name: 'Banca' } },
    { id: 'e2', date: '2026-08-13', description: 'Altro', debitAmount: null, creditAmount: 40, documentRef: null, account: null },
  ],
}

let chiamate: Array<{ url: string; init?: RequestInit }> = []
let fatto = 0
function monta(riga: RigaEstrattoConto = RIGA) {
  chiamate = []
  fatto = 0
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    chiamate.push({ url: u, init })
    if (u.startsWith('/api/scadenzario')) return { ok: true, json: async () => SCADENZE }
    if (u.startsWith('/api/prima-nota')) return { ok: true, json: async () => SCRITTURE }
    return { ok: true, json: async () => ({ ok: true, residuo: 0, reconciliationIds: ['r1'] }) }
  }) as unknown as typeof fetch
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CollegaFatturaDialog riga={riga} open onOpenChange={() => {}} onFatto={() => fatto++} />
    </QueryClientProvider>
  )
}

const collegaPost = () => chiamate.find((c) => c.init?.method === 'POST')

describe('CollegaFatturaDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('elenca le scadenze aperte del verso giusto, col residuo di ciascuna', async () => {
    monta()
    await waitFor(() => expect(screen.getByText('Fattura Rossi 12')).toBeInTheDocument())
    const richiesta = chiamate.find((c) => c.url.startsWith('/api/scadenzario'))!
    expect(richiesta.url).toContain('aperte=1')
    expect(richiesta.url).toContain('tipo=passiva') // la riga è un'uscita
    // `formatCurrency` mette uno spazio unificatore prima di «€»: si cerca la cifra.
    expect(screen.getByText(/60,00/)).toBeInTheDocument()
  })

  it('spuntare una scadenza propone la quota; la somma oltre il residuo della riga blocca il pulsante', async () => {
    monta()
    await waitFor(() => expect(screen.getByText('Fattura Rossi 12')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Seleziona Fattura Rossi 12'))
    expect((screen.getByLabelText('Importo per Fattura Rossi 12') as HTMLInputElement).value).toBe('60,00')
    fireEvent.click(screen.getByLabelText('Seleziona Fattura Rossi 13'))
    // Restavano 40 su 100: la proposta è il minore fra residuo della scadenza e residuo della riga.
    expect((screen.getByLabelText('Importo per Fattura Rossi 13') as HTMLInputElement).value).toBe('40,00')
    expect(screen.getByRole('button', { name: 'Collega' })).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Importo per Fattura Rossi 13'), { target: { value: '70' } })
    expect(screen.getByRole('button', { name: 'Collega' })).toBeDisabled()
    expect(screen.getByText(/superano il residuo/)).toBeInTheDocument()
  })

  it('«Collega» manda le scadenze con le quote alla rotta della riga', async () => {
    monta()
    await waitFor(() => expect(screen.getByText('Fattura Rossi 12')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Seleziona Fattura Rossi 12'))
    fireEvent.change(screen.getByLabelText('Importo per Fattura Rossi 12'), { target: { value: '55,50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Collega' }))
    await waitFor(() => expect(collegaPost()).toBeTruthy())
    expect(collegaPost()!.url).toBe('/api/bank-transactions/t1/collega')
    expect(JSON.parse(String(collegaPost()!.init?.body))).toEqual({ scadenze: [{ scheduleId: 's1', amount: 55.5 }] })
    await waitFor(() => expect(fatto).toBe(1))
  })

  it('la scheda «Scrittura esistente» elenca le scritture libere del verso giusto e ne manda una', async () => {
    monta()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Scrittura esistente/ }))
    await waitFor(() => expect(screen.getByText('Incasso POS 14/08')).toBeInTheDocument())
    const richiesta = chiamate.find((c) => c.url.startsWith('/api/prima-nota'))!
    expect(richiesta.url).toContain('senzaRigaBancaria=true')
    expect(richiesta.url).toContain('direction=outflow')
    expect(richiesta.url).toContain('registerType=BANK')

    fireEvent.click(screen.getByLabelText('Scegli Incasso POS 14/08'))
    fireEvent.click(screen.getByRole('button', { name: 'Collega' }))
    await waitFor(() => expect(collegaPost()).toBeTruthy())
    expect(JSON.parse(String(collegaPost()!.init?.body))).toEqual({ scritturaEsistenteId: 'e1' })
  })

  it('l\'errore del server resta nel toast e il dialogo non chiama onFatto', async () => {
    monta()
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/scadenzario')) return { ok: true, json: async () => SCADENZE }
      if (init?.method === 'POST') return { ok: false, json: async () => ({ error: 'La scadenza è pagata' }) }
      return { ok: true, json: async () => ({ data: [] }) }
    }) as unknown as typeof fetch
    await waitFor(() => expect(screen.getByText('Fattura Rossi 12')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Seleziona Fattura Rossi 12'))
    fireEvent.click(screen.getByRole('button', { name: 'Collega' }))
    const { toast } = await import('sonner')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('La scadenza è pagata'))
    expect(fatto).toBe(0)
  })
})
```

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca/estratto-conto/__tests__/CollegaFatturaDialog.test.tsx` → rosso: modulo assente.

- [ ] **Step 2: `CollegaFatturaDialog.tsx`**

```tsx
'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { RigaEstrattoConto } from '@/types/reconciliation'

/** Una scadenza come la restituisce `GET /api/scadenzario` (i soli campi usati qui). */
interface ScadenzaAperta {
  id: string
  descrizione: string
  dataScadenza: string
  numeroDocumento: string | null
  controparteNome: string | null
  importoResiduo: number
  supplier: { id: string; name: string } | null
}

/** Una scrittura BANK senza riga bancaria (`GET /api/prima-nota?senzaRigaBancaria=true`). */
interface ScritturaLibera {
  id: string
  date: string
  description: string
  debitAmount: number | null
  creditAmount: number | null
  documentRef: string | null
  account: { code: string; name: string } | null
}

interface Props {
  riga: RigaEstrattoConto | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onFatto: () => void
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const TOLLERANZA = 0.005

const arrotonda = (n: number) => Math.round(n * 100) / 100
const giorno = (d: string | Date) => format(new Date(d), 'dd/MM/yyyy', { locale: it })
/** Da un importo digitato («55,50») al numero; ciò che non si legge vale 0. */
const leggiImporto = (testo: string) => arrotonda(Number(testo.replace(/\./g, '').replace(',', '.')) || 0)
const scriviImporto = (n: number) => n.toFixed(2).replace('.', ',')
function spostaGiorni(d: string | Date, giorni: number): string {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + giorni)
  return x.toISOString().slice(0, 10)
}

/**
 * Collega fattura: due schede (spec, «Le azioni»). *Fattura / scadenza*: le
 * scadenze aperte del verso giusto, col residuo di ciascuna, più d'una con la
 * sua quota; *Scrittura esistente*: le scritture BANK non ancora legate a una
 * riga — la R4. Entrambe chiamano la promozione.
 */
export function CollegaFatturaDialog({ riga, open, onOpenChange, onFatto }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        {riga && <Modulo key={riga.id} riga={riga} onChiudi={() => onOpenChange(false)} onFatto={onFatto} />}
      </DialogContent>
    </Dialog>
  )
}

function Modulo({ riga, onChiudi, onFatto }: { riga: RigaEstrattoConto; onChiudi: () => void; onFatto: () => void }) {
  const entrata = riga.amount > 0
  const importoRiga = Math.abs(riga.amount)
  // Su una riga collegata con documenti che non coprono tutto («Collega altra
  // fattura») si può imputare solo il residuo; su una riga libera, tutto.
  const residuoRiga = riga.matchedEntryId && !riga.proposta ? (riga.residuoDocumenti ?? 0) : importoRiga

  const [scheda, setScheda] = React.useState<'scadenze' | 'scrittura'>('scadenze')
  const [ricerca, setRicerca] = React.useState('')
  const ricercaDifferita = useDebounce(ricerca, 300)
  /** scheduleId → importo digitato (testo, con la virgola). */
  const [scelte, setScelte] = React.useState<Map<string, string>>(new Map())
  const [scritturaId, setScritturaId] = React.useState<string | null>(null)
  const [inCorso, setInCorso] = React.useState(false)

  const scadenze = useQuery({
    queryKey: ['collega-fattura', 'scadenze', riga.id, entrata, ricercaDifferita],
    queryFn: async (): Promise<ScadenzaAperta[]> => {
      const sp = new URLSearchParams({
        aperte: '1',
        tipo: entrata ? 'attiva' : 'passiva',
        limit: '20',
        sortBy: 'dataScadenza',
        sortOrder: 'asc',
      })
      if (ricercaDifferita.trim()) sp.set('search', ricercaDifferita.trim())
      const r = await fetch(`/api/scadenzario?${sp}`)
      if (!r.ok) throw new Error('Errore nel caricamento delle scadenze')
      return ((await r.json()) as { data: ScadenzaAperta[] }).data
    },
    enabled: scheda === 'scadenze',
  })

  const scritture = useQuery({
    queryKey: ['collega-fattura', 'scritture', riga.id, entrata, ricercaDifferita],
    queryFn: async (): Promise<ScritturaLibera[]> => {
      // ±30 giorni dalla data del movimento: la scrittura di una chiusura sta
      // lì vicino; una ricerca per testo allarga dentro la stessa finestra.
      const sp = new URLSearchParams({
        registerType: 'BANK',
        senzaRigaBancaria: 'true',
        direction: entrata ? 'inflow' : 'outflow',
        dateFrom: spostaGiorni(riga.transactionDate, -30),
        dateTo: spostaGiorni(riga.transactionDate, 30),
        limit: '20',
      })
      if (ricercaDifferita.trim()) sp.set('search', ricercaDifferita.trim())
      const r = await fetch(`/api/prima-nota?${sp}`)
      if (!r.ok) throw new Error('Errore nel caricamento delle scritture')
      return ((await r.json()) as { data: ScritturaLibera[] }).data
    },
    enabled: scheda === 'scrittura',
  })

  const importoDi = (id: string) => leggiImporto(scelte.get(id) ?? '')
  const totale = arrotonda([...scelte.keys()].reduce((somma, id) => somma + importoDi(id), 0))
  const eccede = totale > residuoRiga + TOLLERANZA
  const importiNonValidi = [...scelte.keys()].some((id) => importoDi(id) <= 0)

  const spunta = (s: ScadenzaAperta, on: boolean) => {
    const prossime = new Map(scelte)
    if (on) {
      // La quota proposta è il minore fra il residuo della scadenza e ciò che
      // resta della riga dopo le altre spunte: un bonifico cumulativo si
      // ripartisce da sé, e si corregge a mano dove serve.
      const proposta = Math.max(0, Math.min(s.importoResiduo, arrotonda(residuoRiga - totale)))
      prossime.set(s.id, scriviImporto(proposta))
    } else {
      prossime.delete(s.id)
    }
    setScelte(prossime)
  }

  const invia = async () => {
    const corpo =
      scheda === 'scadenze'
        ? { scadenze: [...scelte.keys()].map((scheduleId) => ({ scheduleId, amount: importoDi(scheduleId) })) }
        : { scritturaEsistenteId: scritturaId }
    setInCorso(true)
    try {
      const r = await fetch(`/api/bank-transactions/${riga.id}/collega`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(corpo),
      })
      const json = (await r.json().catch(() => ({}))) as { error?: string; residuo?: number; reconciliationIds?: string[] }
      if (!r.ok) throw new Error(json.error || 'Collegamento non riuscito')
      if (scheda === 'scadenze') {
        const n = json.reconciliationIds?.length ?? scelte.size
        toast.success(
          `${n === 1 ? 'Scadenza collegata' : `${n} scadenze collegate`}` +
            ((json.residuo ?? 0) > 0 ? ` · resta un residuo di ${formatCurrency(json.residuo ?? 0)}` : '')
        )
      } else {
        toast.success('Movimento collegato alla scrittura')
      }
      onFatto()
      onChiudi()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore sconosciuto')
    } finally {
      setInCorso(false)
    }
  }

  const puoInviare =
    !inCorso && (scheda === 'scadenze' ? scelte.size > 0 && !eccede && !importiNonValidi : !!scritturaId)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Collega fattura</DialogTitle>
        <DialogDescription>
          Movimento del {giorno(riga.transactionDate)} · {entrata ? '+' : '−'}
          {formatCurrency(importoRiga)} · <span className="break-words">{riga.descrizione ?? riga.description}</span>
        </DialogDescription>
      </DialogHeader>

      <Tabs value={scheda} onValueChange={(v) => setScheda(v as 'scadenze' | 'scrittura')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="scadenze">Fattura / scadenza</TabsTrigger>
          <TabsTrigger value="scrittura">Scrittura esistente</TabsTrigger>
        </TabsList>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            aria-label={scheda === 'scadenze' ? 'Cerca fra le scadenze' : 'Cerca fra le scritture'}
            placeholder={scheda === 'scadenze' ? 'Fornitore, numero, descrizione…' : 'Descrizione…'}
            className="pl-8"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
          />
        </div>

        <TabsContent value="scadenze" className="mt-3 space-y-3">
          <div className="max-h-[40vh] overflow-y-auto rounded-md border">
            {scadenze.isPending ? (
              <p className="p-3 text-sm text-muted-foreground">Caricamento…</p>
            ) : (scadenze.data ?? []).length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nessuna scadenza aperta corrisponde.</p>
            ) : (
              <ul className="divide-y">
                {(scadenze.data ?? []).map((s) => {
                  const scelta = scelte.has(s.id)
                  const nome = s.supplier?.name ?? s.controparteNome ?? s.descrizione
                  return (
                    <li key={s.id} className={cn('flex flex-wrap items-center gap-3 px-3 py-2 text-sm', scelta && 'bg-muted/50')}>
                      <Checkbox
                        aria-label={`Seleziona ${s.descrizione}`}
                        checked={scelta}
                        onCheckedChange={(v) => spunta(s, v === true)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" title={s.descrizione}>
                          {s.descrizione}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {nome}
                          {s.numeroDocumento ? ` · ${s.numeroDocumento}` : ''} · scade il {giorno(s.dataScadenza)}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        residuo
                        <div className="text-sm font-medium text-foreground">{formatCurrency(s.importoResiduo)}</div>
                      </div>
                      {scelta && (
                        <Input
                          aria-label={`Importo per ${s.descrizione}`}
                          inputMode="decimal"
                          className="w-28 text-right"
                          value={scelte.get(s.id) ?? ''}
                          onChange={(e) => setScelte(new Map(scelte).set(s.id, e.target.value))}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className={cn(eccede ? 'text-destructive' : 'text-muted-foreground')}>
              Imputato {formatCurrency(totale)} di {formatCurrency(residuoRiga)}
              {eccede && ' — gli importi superano il residuo del movimento'}
              {!eccede && importiNonValidi && ' — ogni quota deve essere positiva'}
            </span>
          </div>
        </TabsContent>

        <TabsContent value="scrittura" className="mt-3 space-y-3">
          <div className="max-h-[40vh] overflow-y-auto rounded-md border" role="radiogroup" aria-label="Scritture libere">
            {scritture.isPending ? (
              <p className="p-3 text-sm text-muted-foreground">Caricamento…</p>
            ) : (scritture.data ?? []).length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nessuna scrittura libera in questi giorni.</p>
            ) : (
              <ul className="divide-y">
                {(scritture.data ?? []).map((e) => {
                  const importo = e.debitAmount ?? e.creditAmount ?? 0
                  const stessoImporto = Math.abs(importo - importoRiga) < TOLLERANZA
                  return (
                    <li key={e.id}>
                      <label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm', scritturaId === e.id && 'bg-muted/50')}>
                        <input
                          type="radio"
                          name="scrittura-esistente"
                          aria-label={`Scegli ${e.description}`}
                          checked={scritturaId === e.id}
                          onChange={() => setScritturaId(e.id)}
                        />
                        <span className="w-20 shrink-0 text-muted-foreground">{giorno(e.date)}</span>
                        <span className="min-w-0 flex-1 truncate" title={e.description}>
                          {e.description}
                          {e.account && <span className="ml-1 text-xs text-muted-foreground">{e.account.code}</span>}
                        </span>
                        <span className={cn('font-medium', stessoImporto && 'text-emerald-700')}>{formatCurrency(importo)}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Scritture del registro Banca non ancora legate a una riga della banca, nei 30 giorni prima e dopo il movimento; in
            verde quelle dello stesso importo. La riga si lega alla scrittura così com'è, senza crearne una nuova.
          </p>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onChiudi} disabled={inCorso}>
          Annulla
        </Button>
        <Button type="button" onClick={invia} disabled={!puoInviare}>
          {inCorso ? 'Collegamento…' : 'Collega'}
        </Button>
      </DialogFooter>
    </>
  )
}
```

→ il test del passo 1 verde. Se `Checkbox` di Radix non riceve il `click` nel test via `getByLabelText`: il `Checkbox` rende un `button[role="checkbox"]` con l'`aria-label`, e `fireEvent.click` lo cambia; se non funziona, usare `fireEvent.click(screen.getByRole('checkbox', { name: 'Seleziona Fattura Rossi 12' }))`.

- [ ] **Step 3: `ScollegaDialog.tsx`**

```tsx
'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { RigaEstrattoConto } from '@/types/reconciliation'

interface Props {
  riga: RigaEstrattoConto | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onFatto: () => void
}

/**
 * Scollega: la conferma dice cosa succede davvero, che dipende da chi ha
 * creato la scrittura (spec, «promuoviRigaBancaria»): se la promozione, viene
 * ritirata con le sue riconciliazioni; se esisteva già, la riga si slega e
 * basta.
 */
export function ScollegaDialog({ riga, open, onOpenChange, onFatto }: Props) {
  const [inCorso, setInCorso] = React.useState(false)
  const nostra = !!riga?.origineScrittura

  const conferma = async () => {
    if (!riga) return
    setInCorso(true)
    try {
      const r = await fetch(`/api/bank-transactions/${riga.id}/scollega`, { method: 'POST' })
      const json = (await r.json().catch(() => ({}))) as { error?: string; scritturaRitirata?: boolean }
      if (!r.ok) throw new Error(json.error || 'Scollegamento non riuscito')
      toast.success(json.scritturaRitirata ? 'Movimento scollegato: la scrittura è stata ritirata' : 'Movimento scollegato')
      onFatto()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore sconosciuto')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Scollegare il movimento?</AlertDialogTitle>
          <AlertDialogDescription>
            {nostra
              ? 'La scrittura di prima nota creata da questa riga verrà ritirata e le scadenze collegate torneranno aperte. Il movimento bancario resta com\'è, da lavorare di nuovo.'
              : 'La riga verrà slegata dalla scrittura, che resta in prima nota con le sue riconciliazioni.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={inCorso}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // La conferma resta aperta finché la rotta non risponde: si chiude
              // da `conferma`, non dal clic.
              e.preventDefault()
              void conferma()
            }}
            disabled={inCorso}
          >
            {inCorso ? 'Scollegamento…' : 'Scollega'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 4: i pulsanti nella tabella e i dialoghi nel contenitore**

In `TabellaEstrattoConto.tsx`:

1. Import da `lucide-react`: aggiungere `Link2, Unlink`.
2. `Props`: aggiungere `onCollega: (riga: RigaEstrattoConto) => void` e `onScollega: (riga: RigaEstrattoConto) => void`.
3. Al posto del commento `{/* Qui, fra Modifica e il menu, il Task 8 mette Collega fattura / Scollega. */}`:

```tsx
                {/* Collega fattura / Scollega: l'icona cambia con lo stato del
                    legame (spec, «Le azioni»); una proposta da rivedere non è un
                    legame. Nel Cestino non si tocca la contabilità. */}
                {!p.filtri.cestino &&
                  (r.matchedEntryId && !r.proposta ? (
                    <Button variant="ghost" size="icon" aria-label="Scollega" onClick={() => p.onScollega(r)}>
                      <Unlink className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" aria-label="Collega fattura" onClick={() => p.onCollega(r)}>
                      <Link2 className="h-4 w-4" aria-hidden />
                    </Button>
                  ))}
```

4. Nel menu ⋯, dopo la voce «Categorizza» e prima di «Riconcilia», per le righe parziali:

```tsx
                        {/* Un bonifico che copre più fatture si può completare senza
                            scollegare: la promozione riusa la scrittura. */}
                        {r.stato === 'parziale' && (
                          <DropdownMenuItem onClick={() => p.onCollega(r)}>
                            <Link2 className="mr-2 h-4 w-4" aria-hidden />
                            Collega altra fattura
                          </DropdownMenuItem>
                        )}
```

In `EstrattoConto.tsx`:

1. Import: `import { CollegaFatturaDialog } from './CollegaFatturaDialog'` e `import { ScollegaDialog } from './ScollegaDialog'`.
2. Stati: `const [daCollegare, impostaDaCollegare] = useState<RigaEstrattoConto | null>(null)` e `const [daScollegare, impostaDaScollegare] = useState<RigaEstrattoConto | null>(null)`.
3. Alla tabella: `onCollega={(riga) => impostaDaCollegare(riga)}` e `onScollega={(riga) => impostaDaScollegare(riga)}`.
4. In fondo, accanto agli altri dialoghi:

```tsx
      <CollegaFatturaDialog
        riga={daCollegare}
        open={!!daCollegare}
        onOpenChange={(aperto) => !aperto && impostaDaCollegare(null)}
        onFatto={ricarica}
      />
      <ScollegaDialog
        riga={daScollegare}
        open={!!daScollegare}
        onOpenChange={(aperto) => !aperto && impostaDaScollegare(null)}
        onFatto={ricarica}
      />
```

- [ ] **Step 5: il test della lista**

In `EstrattoConto.test.tsx` aggiungere:

```tsx
  it('Collega fattura sulla riga libera, Scollega su quella collegata, «Collega altra fattura» sulla parziale', async () => {
    const collegata = riga('3', { matchedEntryId: 'e1', status: 'MANUAL', stato: 'abbinato_manualmente', residuo: 0, residuoDocumenti: 0, origineScrittura: 'COLLEGA',
      matchedEntry: { id: 'e1', date: '2026-08-14', description: 'x', debitAmount: 907.9, creditAmount: null, documentRef: null, account: null, costCenter: null, fette: 0 } })
    const parziale = riga('4', { amount: -100, matchedEntryId: 'e2', status: 'MANUAL', stato: 'parziale', residuo: 40, residuoDocumenti: 40, origineScrittura: 'COLLEGA',
      matchedEntry: { id: 'e2', date: '2026-08-14', description: 'y', debitAmount: null, creditAmount: 100, documentRef: null, account: null, costCenter: null, fette: 0 } })
    stubTutto({ ...RISPOSTA, data: [riga('1'), collegata, parziale] })
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    expect(document.querySelectorAll('button[aria-label="Collega fattura"]')).toHaveLength(1)
    expect(document.querySelectorAll('button[aria-label="Scollega"]')).toHaveLength(2)
    expect(testoDellaPagina()).toContain('40,00') // il residuo accanto allo stato parziale

    await cliccare(document.querySelector('button[aria-label="Collega fattura"]'))
    await attendiChe(() => testoDellaPagina().includes('Collega fattura') && testoDellaPagina().includes('Fattura / scadenza'), 'il dialogo Collega')

    // Scollega chiede conferma e poi chiama la rotta.
    await cliccare(document.querySelectorAll('button[aria-label="Scollega"]')[0])
    await attendiChe(() => testoDellaPagina().includes('Scollegare il movimento?'), 'la conferma')
    await cliccare(perTesto('Scollega', '[role="alertdialog"] button'))
    await attendiChe(() => richieste.some((r) => r.url === '/api/bank-transactions/3/scollega' && r.init?.method === 'POST'), 'la rotta di scollegamento')
  })
```

(In `stubTutto` deve esserci la risposta di `/api/bank-transactions/3/scollega`: la voce generica `['/api/bank-transactions', lista]` risponde con la lista, che ha `ok: true` — basta; se il dialogo si lamenta di `json.error`, aggiungere `['/api/bank-transactions/3/scollega', { ok: true, scritturaRitirata: true }]` **prima** della voce generica.)

- [ ] **Step 6: eseguire e committare**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run lint
git add src/components/banca/estratto-conto
git commit -m "feat(banca): Collega fattura con residuo, Scollega con conferma, Collega altra fattura sulle parziali

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: Categorizza in blocco, «dalla banca» nelle Scritture, la vecchia riconciliazione filtrata su una riga

**Files:**
- Modify: `src/components/banca/estratto-conto/BarraSelezione.tsx`
- Modify: `src/components/prima-nota/movimenti/MovimentiTable.tsx` (+ Test: `src/components/prima-nota/movimenti/__tests__/MovimentiTable.test.tsx`, nuovo)
- Modify: `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx`, `src/app/(dashboard)/riconciliazione/page.tsx`

**Interfaces:**
- Consumes: `AzioneInBlocco` in `EstrattoConto` (il ramo `categorizza` del Task 7); `JournalEntry.bankTransactionId` (Task 6); il filtro `movimento` della lista (Task 2).
- Produces: `AzioneInBlocco = 'sposta' | 'cestino' | 'ripristina' | 'categorizza'`; il collegamento `/prima-nota/movimenti?register=BANK&movimento=<id>` dalla scheda Scritture; `/riconciliazione?movimento=<id>` che mostra quella riga sola.

- [ ] **Step 1: la barra della selezione**

In `BarraSelezione.tsx` (il tipo `AzioneInBlocco` porta già `'categorizza'` dal Task 7):

1. Import da `lucide-react`: aggiungere `Tag`.
2. Prima del `DropdownMenu` «Sposta in» (dentro `{!nelCestino && (…)}` — spezzare il blocco in due o avvolgere entrambi in un frammento):

```tsx
        {!nelCestino && (
          <Button variant="outline" size="sm" onClick={() => onAzione('categorizza')}>
            <Tag className="mr-1 h-4 w-4" aria-hidden />
            Categorizza
          </Button>
        )}
```

Il contenitore (`EstrattoConto.tsx`, ramo `categorizza` di `azioneInBlocco`, Task 7) apre il dialogo per la selezione o per il filtro; l'ultimo caso del passo 5 del Task 7 diventa verde qui.

- [ ] **Step 2: il test della scheda Scritture**

Creare `src/components/prima-nota/movimenti/__tests__/MovimentiTable.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MovimentiTable } from '../MovimentiTable'
import type { JournalEntry } from '@/types/prima-nota'

function scrittura(extra: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'e1', venueId: 'v1', date: new Date('2026-08-14'), registerType: 'BANK', entryType: 'USCITA',
    description: 'Commissioni', creditAmount: 0.75, createdAt: new Date(), updatedAt: new Date(),
    ...extra,
  } as JournalEntry
}

describe('MovimentiTable — «dalla banca»', () => {
  it('una scrittura nata da una riga della banca lo dice, e porta alla riga', () => {
    render(<MovimentiTable data={[scrittura({ bankTransactionId: 'bt1' })]} />)
    const link = screen.getByRole('link', { name: /dalla banca/ })
    expect(link).toHaveAttribute('href', '/prima-nota/movimenti?register=BANK&movimento=bt1')
  })

  it('una scrittura senza riga non lo dice', () => {
    render(<MovimentiTable data={[scrittura()]} />)
    expect(screen.queryByText(/dalla banca/)).toBeNull()
  })
})
```

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/prima-nota/movimenti/__tests__/MovimentiTable.test.tsx` → rosso.

- [ ] **Step 3: «dalla banca» in `MovimentiTable.tsx`**

1. Import: `import Link from 'next/link'` e, da `lucide-react`, aggiungere `Landmark`.
2. Nella cella Descrizione, subito dopo il blocco `{trasferimento && (…)}` (riga ~201):

```tsx
                      {/* La scrittura nata da una riga della banca (o legata a
                          mano) lo dice, e ci porta: è l'estratto conto la sua
                          origine, e lì si scollega. */}
                      {entry.bankTransactionId && (
                        <Link
                          href={`/prima-nota/movimenti?register=BANK&movimento=${entry.bankTransactionId}`}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Landmark className="h-3 w-3 shrink-0" aria-hidden />
                          dalla banca
                        </Link>
                      )}
```

→ test verde.

- [ ] **Step 4: la vecchia `/riconciliazione` filtrata su una riga**

In `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx`:

1. Import: `useRouter, useSearchParams` da `next/navigation`; `Link` da `next/link`.
2. In cima al componente: `const router = useRouter()`, `const searchParams = useSearchParams()`, `const movimento = searchParams.get('movimento')`.
3. Nella `queryKey`: aggiungere `movimento`; nella URL della lista aggiungere `` ${movimento ? `&movimento=${encodeURIComponent(movimento)}` : ''} `` (dopo `&page=${page}`).
4. Sopra la tabella (prima di `<BankTransactionTable …>`):

```tsx
      {movimento && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span>Stai guardando un solo movimento dell'estratto conto.</span>
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => router.replace('/riconciliazione')}>
            Mostra tutti
          </Button>
          <Link href={`/prima-nota/movimenti?register=BANK&movimento=${encodeURIComponent(movimento)}`} className="ml-auto underline-offset-4 hover:underline">
            Torna all'estratto conto
          </Link>
        </div>
      )}
```

(`Button` è già importato nella pagina; verificare.)

In `src/app/(dashboard)/riconciliazione/page.tsx`: avvolgere il client in `Suspense` — `useSearchParams` in un componente client sotto una pagina statica lo richiede alla build:

```tsx
import { Suspense } from 'react'
import { RiconciliazioneClient } from './RiconciliazioneClient'

export const metadata = {
  title: 'Riconciliazione Bancaria | Weiss Gestionale',
  description: 'Importa e riconcilia i movimenti bancari',
}

export default function RiconciliazionePage() {
  return (
    <Suspense fallback={null}>
      <RiconciliazioneClient />
    </Suspense>
  )
}
```

- [ ] **Step 5: eseguire e committare**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca src/components/prima-nota "src/app/(dashboard)/riconciliazione"
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run lint
git add src/components/banca/estratto-conto/BarraSelezione.tsx src/components/prima-nota/movimenti/MovimentiTable.tsx src/components/prima-nota/movimenti/__tests__/MovimentiTable.test.tsx "src/app/(dashboard)/riconciliazione"
git commit -m "feat(banca): Categorizza in blocco dalla selezione, «dalla banca» nelle scritture, la riconciliazione filtrata su una riga

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: il piano A2 riusa il servizio, la nota di ripresa, la verifica finale

**Files:**
- Modify: `docs/superpowers/plans/2026-08-16-riconciliazione-a2-primo-taglio.md` (Task 3 e Task 5)
- Modify: `docs/RIPRESA-16-AGOSTO-SERA.md` (una sezione in più, in cima)
- Nessun file sorgente: solo verifiche.

- [ ] **Step 1: il piano A2 — Task 3**

In `docs/superpowers/plans/2026-08-16-riconciliazione-a2-primo-taglio.md`:

1. Nel blocco **Interfaces → Consumes** del Task 3 (riga ~270) sostituire la riga con:

```
- Consumes: `promuoviRigaBancariaInTransazione(tx, input)`, `PromozioneRifiutata`, `PromozioneInTransazione` da `src/lib/services/promozione-riga-bancaria-service.ts` (consegna B dell'estratto conto: il servizio unico che crea la scrittura BANK dalla riga, la lega, scrive le riconciliazioni e il residuo — questo task NON crea più la scrittura da sé); `dopoLaRiconciliazione` da `src/lib/services/schedule-reconciliation-service.ts` per le code fuori transazione.
```

2. Sostituire per intero lo **Step 3: Scrivere il servizio** del Task 3 (righe ~315-325) con:

```
- [ ] **Step 3: Scrivere il servizio**

`approvaProposta` in una sola `prisma.$transaction`:

1. blocca la proposta (`SELECT ... FOR UPDATE` via `$queryRaw` dentro la transazione) e verifica `stato === 'in_attesa'`;
2. rilegge le due parti e **ricontrolla la freschezza** (decisione 6 della spec madre): se la scadenza è già `pagata`/`annullata`, o la riga bancaria ha già `matchedEntryId`, marca la proposta `superata` e restituisce senza scrivere altro;
3. chiama **`promuoviRigaBancariaInTransazione(tx, { bankTransactionId, venueId, userId, origine: 'proposta', confidence: punteggio / 100, scadenze: gambe.map((g) => ({ scheduleId: g.scheduleId, amount: Number(g.importo) })) })`** — oppure, se la proposta è una **R4** (`journalEntryId` valorizzato, nessuna gamba), `{ …, origine: 'proposta', scritturaEsistenteId: proposta.journalEntryId }`. È il servizio a creare la scrittura BANK (data, dare/avere, descrizione, conto dal fornitore della scadenza, centro via `risolviCentroDiCosto`), a legarla (`matchedEntryId`, `status: 'MATCHED'`, `origineScrittura: 'PROPOSTA'`), a scrivere le `ScheduleReconciliation` con `source: 'PROPOSAL'` e il residuo dei documenti sulla riga. Un esito negativo arriva come eccezione `PromozioneRifiutata`: la si lascia salire (la transazione cade per intero) e **fuori** dalla transazione la si cattura e si traduce in `{ outcome: 'riconciliazione_rifiutata', motivo }` (dal campo `esito` dell'eccezione: `importo_eccedente`, `riconciliazione_rifiutata`, `scrittura_gia_collegata_ad_altra_riga`… → il motivo lo dà `rispostaPerEsito` di `src/lib/banca/esiti-promozione.ts`, campo `corpo.error`);
4. aggiorna la proposta a `approvata` con `decisoDaId` e `decisoAt`, e incrementa `contaApprovate` sul lotto; restituisce anche `seguiti` della promozione.

Fuori dalla transazione: per ogni voce di `seguiti`, `dopoLaRiconciliazione(voce.risultato, voce.input)`, come fa la rotta del pagamento in contanti.

Lo scarto di una proposta approvata (se un giorno servirà «annulla approvazione») passa da `scollegaRigaBancaria` dello stesso modulo: ritira solo ciò che la promozione ha creato.
```

3. Nel Task 5, **Step 4: Scrivere i componenti**, dopo il paragrafo su `RiconciliazioneClient` aggiungere:

```
`RiconciliazioneClient` legge anche `?movimento=<id>` (`useSearchParams`, la pagina è già in `Suspense`): con quel parametro la coda mostra solo le proposte di quella riga bancaria (`bankTransactionId`), con un chip «Stai guardando un solo movimento · Mostra tutti» e il ritorno all'estratto conto (`/prima-nota/movimenti?register=BANK&movimento=<id>`). È l'indirizzo che l'azione «Riconcilia» dell'estratto conto apre già dalla consegna B: sostituendo la pagina, il contratto resta.
```

- [ ] **Step 2: la nota di ripresa**

In `docs/RIPRESA-16-AGOSTO-SERA.md`, subito dopo il titolo e prima di «## 1. Dove siamo», aggiungere:

```
> **Aggiornamento del 17 agosto — consegna B.** Il piano `docs/superpowers/plans/2026-08-17-estratto-conto-in-prima-nota-consegna-b.md` è stato eseguito sul branch `banca/estratto-conto-consegna-b`: `promuoviRigaBancaria`/`scollegaRigaBancaria` (`src/lib/services/promozione-riga-bancaria-service.ts`), colonne `origine_scrittura` e `residuo_documenti` (migrazione `20260817090000_azioni_contabili_estratto_conto`), rotte `[id]/categorizza`, `[id]/collega`, `[id]/scollega`, `categorizza-in-blocco` (via `match`/`unmatch`, cricchetto 250), la colonna Categoria, i dialoghi Categorizza / Collega fattura / Scollega, «dalla banca» nella scheda Scritture, `?movimento=` sull'estratto conto e sulla vecchia riconciliazione. Il piano A2 (task 3) ora riusa il servizio. Prossimo passo dopo il merge: il piano A2, task 3-7.
```

- [ ] **Step 3: le suite**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:run
TEST_DB_SUFFIX=consegnab PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts
```

Atteso: tutto verde (al 16 agosto: unit 1948, integrazione 647; qui di più).

- [ ] **Step 4: i cancelli**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run lint
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" node scripts/check-route-auth.mjs --ratchet
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run knip
```

Atteso: `tsc` e `typecheck:test` puliti; lint 0 errori; il cricchetto «pari alla baseline» a 250; knip senza file orfani né dipendenze nuove (gli `exports` inutilizzati sono avvisi, non blocchi: nessuno nuovo deve arrivare da questo branch — se `PromozioneInTransazione` o `EsitoScollegamento` risultassero «unused export», sono API di dominio deliberate come `ReconcileOutcome`: lasciarle).

- [ ] **Step 5: le due build, senza `| tail`**

```bash
DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder' NEXTAUTH_URL='http://localhost:3000' NEXTAUTH_SECRET='placeholder' AUTH_SECRET='placeholder' PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx next build --webpack
DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder' NEXTAUTH_URL='http://localhost:3000' NEXTAUTH_SECRET='placeholder' AUTH_SECRET='placeholder' PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run build
```

Entrambe exit 0. La prima è quella della CI (webpack), più severa sui tipi delle rotte; la seconda (Turbopack) è quella del deploy.

- [ ] **Step 6: la prova nel browser, su un database locale (mai la produzione)**

1. Il database di prova, clonato dal template dei test d'integrazione (esiste dopo lo Step 3; ha il seed: sede WEISS, conti, centri, utenti, fornitori) e riempito con una manciata di righe vere nella forma:

```bash
/opt/homebrew/opt/libpq/bin/psql "postgresql://nicolascarpa@127.0.0.1:5433/postgres" -X -c 'DROP DATABASE IF EXISTS weiss_prova_consegnab' -c 'CREATE DATABASE weiss_prova_consegnab TEMPLATE weiss_itest_consegnab_template'
```

   Poi il seguente SQL (con `psql … -X -f <file>` da un file nella scratchpad, non incollato in shell):

```sql
-- Un conto bancario, otto righe della banca, due scadenze aperte del
-- fornitore del seed, una scrittura BANK già esistente (la R4).
INSERT INTO bank_accounts (id, venue_id, name, account_type, is_active, is_default, currency, initial_balance, created_at, updated_at)
SELECT 'prova-conto', v.id, 'Banca della Marca - Weiss', 'BANK', true, true, 'EUR', 0, now(), now() FROM venues v WHERE v.code = 'WEISS';

INSERT INTO bank_transactions (id, venue_id, bank_account_id, transaction_date, description, descrizione, causale, amount, import_source, status, sezione, bank_transaction_code)
SELECT x.id, v.id, 'prova-conto', x.data::date, x.grezzo, x.descr, x.causale, x.importo, 'PSD2_GOCARDLESS', 'PENDING', 'ATTIVI', x.codice
FROM venues v, (VALUES
  ('prova-r1', '2026-08-01', 'Commissioni', NULL, 'Commissioni', -0.75, '16//00'),
  ('prova-r2', '2026-08-02', 'Commissioni', NULL, 'Commissioni', -1.50, '16//00'),
  ('prova-r3', '2026-08-03', 'Commissioni su bonifico tramite in', NULL, 'Commissioni su bonifico tramite internet banking', -0.50, '16//37'),
  ('prova-r4', '2026-08-04', 'Bonifico tramite Internet Banking *ROSSI SRL FT 12 E FT 13', 'ROSSI SRL FT 12 E FT 13', 'Bonifico tramite internet banking', -1000.00, '26//11'),
  ('prova-r5', '2026-08-05', 'Bonifico a vs favore *WORLDLINE MERCHANT SERVICES', 'WORLDLINE MERCHANT SERVICES', 'Bonifico a vs favore', 907.90, '48//00'),
  ('prova-r6', '2026-08-06', 'Imposte e tasse:Delega Unificata(p *C.ATT:283', 'C.ATT:283', 'Imposte e tasse: delega unificata', -320.00, '19//83'),
  ('prova-r7', '2026-08-07', 'Bonifico tramite Internet Banking *BIANCHI SNC SALDO', 'BIANCHI SNC SALDO', 'Bonifico tramite internet banking', -250.00, '26//11'),
  ('prova-r8', '2026-08-08', 'Versamento contante allo sportello', NULL, 'Versamento contante allo sportello', 500.00, '78//10')
) AS x(id, data, grezzo, descr, causale, importo, codice)
WHERE v.code = 'WEISS';

INSERT INTO schedules (id, venue_id, tipo, stato, descrizione, importo_totale, importo_pagato, data_scadenza, numero_documento, supplier_id, priorita, source, created_at, updated_at)
SELECT x.id, v.id, 'passiva', 'aperta', x.descr, x.tot, 0, x.scad::date, x.num, s.id, 'normale', 'manuale', now(), now()
FROM venues v, (SELECT id FROM suppliers ORDER BY name ASC LIMIT 1) s, (VALUES
  ('prova-s1', 'Fattura FT 12 Rossi', 600.00, '2026-08-10', 'FT 12'),
  ('prova-s2', 'Fattura FT 13 Rossi', 700.00, '2026-08-20', 'FT 13')
) AS x(id, descr, tot, scad, num)
WHERE v.code = 'WEISS';

INSERT INTO journal_entries (id, venue_id, date, register_type, entry_type, description, debit_amount, credit_amount, cost_center_id, verified, azienda, created_at, updated_at)
SELECT 'prova-e1', v.id, '2026-08-05', 'BANK', 'INCASSO', 'Incasso POS 05/08 (chiusura)', 907.90, NULL, c.id, true, 'WEISS S.r.l.', now(), now()
FROM venues v, (SELECT id FROM cost_centers WHERE is_default = true LIMIT 1) c WHERE v.code = 'WEISS';
```

   (Se una colonna NOT NULL senza default manca dall'INSERT — `updated_at` è la solita — aggiungerla; non toccare lo schema.)

2. Il server, dopo la build Turbopack dello Step 5:

```bash
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_prova_consegnab" ENCRYPTION_KEY="<la chiave dei test: 32 byte in base64, è quella scritta in docs/RIPRESA-16-AGOSTO-SERA.md, §8>" NEXTAUTH_URL="http://localhost:3200" AUTH_URL="http://localhost:3200" APP_URL="http://localhost:3200" PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx next start -p 3200
```

   (La chiave non si scrive qui perché il pre-commit la scambierebbe per un segreto: è la stessa dei test d'integrazione, `test-key-test-key-test-key-test!` in base64.) Login `admin@weisscafe.it` / `admin123` (utente del seed, `must_change_password=false`); se il cookie di una sessione precedente non combacia, prima `http://localhost:3200/api/auth/signout`.

3. Cosa guardare (e annotare nel report, con uno screenshot per punto):
   - `/prima-nota/movimenti?register=BANK`: la colonna **Categoria** c'è (anche col menu Colonne), le 8 righe «Non abbinato»;
   - riga `prova-r1` → ⋯ → **Categorizza** → conto «Commissioni» (o simile), centro proposto → la riga diventa «Abbinato manualmente», Categoria valorizzata; ⋯ non mostra più «Riconcilia»; l'icona è **Scollega**;
   - selezionare `prova-r2` e `prova-r3` → barra → **Categorizza** → stessa imputazione → toast «2 movimenti categorizzati»; poi «Seleziona tutte le N del filtro» su una ricerca `commiss` → Categorizza → toast con le saltate a 0 e le tre righe categorizzate (le già promosse ricevono l'imputazione, non una seconda scrittura: la sotto-scheda **Scritture** ne conta 3);
   - riga `prova-r4` (−1.000) → **Collega fattura** → scheda *Fattura / scadenza*: le due FT (600 e 700) con residuo; spuntarne una → quota 600; spuntare l'altra → quota 400 (il resto della riga), poi correggere a 700 → il pulsante si disabilita col messaggio; riportare a 400 → **Collega** → la riga è «Parzialmente abbinato»? No: 600 + 400 = 1.000 → **abbinata**, residuo 0, Categoria dal fornitore (se il fornitore del seed ha `default_account_id`, altrimenti «da imputare»); lo scadenzario mostra FT 12 pagata e FT 13 parzialmente pagata (300 di residuo);
   - riga `prova-r7` (−250) → Collega fattura → nessuna scadenza aperta corrisponde a `bianchi` → chiudere; ⋯ → **Riconcilia** → si apre `/riconciliazione?movimento=prova-r7` con la sola riga e il chip; «Torna all'estratto conto» riporta a `?register=BANK&movimento=prova-r7` con il chip «Stai guardando un solo movimento» → «Mostra tutti»;
   - riga `prova-r5` (+907,90) → Collega fattura → scheda *Scrittura esistente*: `Incasso POS 05/08` in verde (stesso importo) → scegliere → Collega → «Abbinato manualmente», Categoria vuota o «da imputare»; poi **Scollega** → conferma «La riga verrà slegata dalla scrittura, che resta in prima nota…» → la riga torna «Non abbinato» e la scrittura resta nella sotto-scheda Scritture;
   - riga `prova-r4` → **Scollega** → conferma «La scrittura … verrà ritirata e le scadenze collegate torneranno aperte» → FT 12 e FT 13 di nuovo aperte, la scrittura sparita dalle Scritture, la riga «Non abbinato»;
   - sotto-scheda **Scritture**: le scritture promosse portano «dalla banca» e il collegamento apre l'estratto conto sulla riga; su una di esse, Modifica → cambiare la data → 409 col messaggio; cambiare la descrizione → ok;
   - «Solo non riconciliati» dopo aver collegato `prova-r4` a una sola FT (600): la riga parziale compare col residuo 400 accanto allo stato;
   - Cestino su una riga collegata → 409 «scollega prima» (comportamento della A, invariato).

4. Fermare il server; `DROP DATABASE weiss_prova_consegnab`.

- [ ] **Step 7: commit finale del task**

```bash
git add docs/superpowers/plans/2026-08-16-riconciliazione-a2-primo-taglio.md docs/RIPRESA-16-AGOSTO-SERA.md
git commit -m "docs(banca): il piano A2 riusa promuoviRigaBancaria; nota di ripresa della consegna B

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Poi `superpowers:finishing-a-development-branch`: push del branch `banca/estratto-conto-consegna-b`, PR verso `main` con la sintesi (cosa c'è, rotte, migrazione, verifiche, cosa guardare dopo il deploy: **la migrazione la applica `railway.json` → `npm run db:migrate:deploy`; nessuno script da lanciare a mano**), CI verde 5/5; il merge lo decide l'utente.

---

## Autoverifica del piano (fatta scrivendolo)

- **Copertura della spec (sezione B)**: `promuoviRigaBancaria` con il contratto della spec più gli esiti che servono davvero (Task 3); crea/riusa/lega, riconciliazioni con `SchedulePayment` via `riconciliaInTransazione`, `MANUAL`/`MATCHED`, invarianti (Task 3); scollegamento che ritira solo ciò che ha creato (Task 4); Categorizza singola/in blocco (Task 5, 7, 9); Collega fattura a due schede con residuo, Scollega (Task 5, 8); Riconcilia → `/riconciliazione?movimento=<id>` (Task 7, 9); colonna Categoria (Task 2, 7); Scritture «dalla banca» (Task 6, 9); `residuoDocumenti` denormalizzato e «Solo non riconciliati» coi parziali in SQL (Task 1, 2); piano A2 task 3 (Task 10). Le note raccolte durante la A: puntino TO_REVIEW (Task 2/7, decisione 4); «PATCH amount su riga MANUAL collegata → 409» — la `PATCH` della A accetta `amount` solo su righe `MANUAL`: **resta aperta**, la si tratta con la nota nel report finale (una riga manuale collegata che cambia importo diverge dalla scrittura; la scelta — rifiutare, o riallineare la scrittura — è dell'utente).
- **Segnaposto**: nessun «TBD»; ogni passo di codice porta il codice. I punti dove il piano dice «se … adeguare il test/l'aiutante» sono contingenze note dell'ambiente (Radix, `callRoute`), non lavoro rimandato.
- **Coerenza dei nomi**: `promuoviRigaBancaria` / `promuoviRigaBancariaInTransazione` / `PromozioneRifiutata` / `PromozioneInTransazione` / `scollegaRigaBancaria` (Task 3, 4, 5, 10); `ricalcolaResiduoDocumenti(tx, journalEntryId)` (Task 1, 3); `annullaRiconciliazioneInTransazione` / `dopoAnnulloRiconciliazione` (Task 1, 3); `rispostaPerEsito` (Task 5, 10); `BersaglioCategorizza` (Task 7, 9); `AzioneInBlocco` con `'categorizza'` (Task 7, 9); filtro `movimento` (Task 2, 7, 9); `bankTransactionId` sul tipo client (Task 6, 9); `CHIAVE_COLONNE_NASCOSTE` (Task 7); `aperte=1`, `senzaRigaBancaria=true` (Task 6, 8).
- **Cricchetto**: 252 → 250 nel Task 5 (via `match`, `unmatch`); tutte le rotte nuove con `withAuth`.
- **Ordine dei task**: 1 → 2 (la lista legge la colonna) → 3 → 4 (servizio) → 5 (rotte, e la vecchia pagina non chiama più rotte cancellate) → 6 (contorno) → 7 → 8 → 9 (UI) → 10. Ogni task lascia il branch verde a `tsc` e ai suoi test; l'unico caso che aspetta è il quinto del passo 5 del Task 7 (la barra), verde col Task 9 — dichiarato lì.

