# Allocation — Fasi 0-2 (raccordo, fette manuali, righe fattura) — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** raccordare conto/categoria (il conto è l'unico asse, la categoria si deriva), introdurre le fette (`JournalEntryAllocation`) con split manuale in prima nota, e la categorizzazione manuale per conto delle righe fattura.

**Architecture:** vedi la spec approvata `docs/superpowers/specs/2026-08-05-allocation-design.md` — leggerla prima di iniziare. Le Fasi 3-4 (ereditarietà pro-quota e AI) sono un piano successivo.

**Tech Stack:** Next.js App Router, Prisma 7 (PostgreSQL/Supabase condiviso con la produzione), Zod, Vitest, shadcn/ui.

## Global Constraints

- **Directory di lavoro: SOLO il worktree `/Users/nicolascarpa/Desktop/accounting-stima` (branch main).** Il tree `/Users/nicolascarpa/Desktop/accounting` è di un'altra sessione: solo lettura dei file `.superpowers`.
- MAI `git add -A` / `git add .` / `git commit -a`: staging esplicito dei soli file del task.
- Asse unico: le fette e ogni nuova categorizzazione puntano ad `accountId` (Account, modello GLOBALE senza venueId); `budgetCategoryId` si deriva SEMPRE via `AccountBudgetMapping` (1:1, `accountId @unique`, schema.prisma:745) quando c'è un conto.
- Invariante fette: somma ≤ importo utile del movimento (`debitAmount` per le entrate, `creditAmount` per le uscite); con fette presenti `accountId` = conto dominante (fetta di importo maggiore; a parità, la prima) e `categorizationSource='split'`.
- Le fette NON entrano in `SOFT_DELETE_MODELS` (src/lib/prisma.ts): sono attributi replace-all del movimento.
- Importi `Decimal(10,2)`; route in italiano; ogni route `auth()` + ruoli admin/manager; venue via `getVenueId()` dove serve (JournalEntry ha venueId; Account no).
- Schema SOLO additivo. **`npm run db:push` è VIETATO in questo piano**: il database condiviso contiene tabelle della sessione presenze che il nostro schema su main non ha — un push le cancellerebbe. Le tabelle nuove si creano con DDL esplicito via `npx prisma db execute --stdin` (script SQL fornito nel task), poi `npx prisma generate` per il client.
- TDD: test PRIMA, RED osservato per il motivo giusto, GREEN, poi `npx tsc --noEmit`. Suite base attuale: 524 verdi.
- Test di route/service: pattern mock-prisma esistenti (es. `src/lib/services/__tests__/schedule-reconciliation-service.test.ts`, `src/app/api/scadenzario/[id]/__tests__/route.test.ts`): vi.mock di @/lib/prisma, @/lib/auth, @/lib/audit, @/lib/logger, @/lib/venue.

---

### Task 1: Fase 0 — helper di derivazione conto → categoria

**Files:**
- Create: `src/lib/accounts/mapping.ts`
- Test: `src/lib/accounts/__tests__/mapping.test.ts`

**Interfaces:**
- Produces: `derivaBudgetCategoryDaConto(accountId: string): Promise<string | null>` — null se il conto non è mappato o la mappatura ha `includeInBudget: false`.

- [ ] **Step 1: Test che falliscono**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { accountBudgetMapping: { findUnique: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { derivaBudgetCategoryDaConto } from '../mapping'

beforeEach(() => vi.clearAllMocks())

describe('derivaBudgetCategoryDaConto', () => {
  it('restituisce la categoria mappata sul conto', async () => {
    vi.mocked(prisma.accountBudgetMapping.findUnique).mockResolvedValue({
      accountId: 'conto-1',
      budgetCategoryId: 'cat-1',
      includeInBudget: true,
    } as never)

    await expect(derivaBudgetCategoryDaConto('conto-1')).resolves.toBe('cat-1')
    expect(prisma.accountBudgetMapping.findUnique).toHaveBeenCalledWith({
      where: { accountId: 'conto-1' },
      select: { budgetCategoryId: true, includeInBudget: true },
    })
  })

  it('conto non mappato: null', async () => {
    vi.mocked(prisma.accountBudgetMapping.findUnique).mockResolvedValue(null)
    await expect(derivaBudgetCategoryDaConto('conto-x')).resolves.toBeNull()
  })

  it('mappatura esclusa dal budget: null', async () => {
    vi.mocked(prisma.accountBudgetMapping.findUnique).mockResolvedValue({
      budgetCategoryId: 'cat-1',
      includeInBudget: false,
    } as never)
    await expect(derivaBudgetCategoryDaConto('conto-1')).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: RED** — `npx vitest run src/lib/accounts/__tests__/mapping.test.ts` → FAIL (modulo inesistente).

- [ ] **Step 3: Implementazione**

```ts
import { prisma } from '@/lib/prisma'

/**
 * Il conto del piano dei conti è l'unico asse di imputazione: la categoria di
 * budget è un'etichetta derivata dalla mappatura AccountBudgetMapping (1:1).
 * Null quando il conto non è mappato o è escluso dal budget: in quel caso il
 * movimento resta senza categoria derivata, mai inventarne una.
 * Vedi docs/superpowers/specs/2026-08-05-allocation-design.md (Fase 0).
 */
export async function derivaBudgetCategoryDaConto(accountId: string): Promise<string | null> {
  const mapping = await prisma.accountBudgetMapping.findUnique({
    where: { accountId },
    select: { budgetCategoryId: true, includeInBudget: true },
  })
  if (!mapping || !mapping.includeInBudget) return null
  return mapping.budgetCategoryId
}
```

- [ ] **Step 4: GREEN** — stesso comando, 3/3. Poi `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounts/mapping.ts src/lib/accounts/__tests__/mapping.test.ts
git commit -m "feat(conti): la categoria di budget si deriva dal conto"
```

---

### Task 2: Fase 0 — la route categorize deriva la categoria dal conto

**Files:**
- Modify: `src/app/api/prima-nota/[id]/categorize/route.ts` (file completo: 85 righe, leggerlo tutto)
- Test: `src/app/api/prima-nota/[id]/categorize/__tests__/route.test.ts` (nuovo)

**Interfaces:**
- Consumes: `derivaBudgetCategoryDaConto` (Task 1).
- Produces: nuova semantica PATCH — con `accountId` nel body la categoria si deriva SEMPRE dal conto (il conto vince anche se il client manda entrambi); `budgetCategoryId` esplicito senza conto resta accettato (transizione); scrive `categorizationSource: 'manual'`.

- [ ] **Step 1: Test che falliscono** (nuovo file; mock: auth, prisma `journalEntry {findUnique, update}`, audit, e `@/lib/accounts/mapping` con `derivaBudgetCategoryDaConto: vi.fn()`)

Casi (stile `src/app/api/scadenzario/[id]/__tests__/route.test.ts`, sessione admin, `current` mock `{id:'entry-1'}`):

```ts
it('con accountId la categoria si deriva dal conto', async () => {
  vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
  vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

  const { request, context } = patchCon({ accountId: 'conto-1' })
  const response = await PATCH(request, context)

  expect(response.status).toBe(200)
  expect(prisma.journalEntry.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        accountId: 'conto-1',
        budgetCategoryId: 'cat-derivata',
        categorizationSource: 'manual',
      }),
    })
  )
})

it('il conto vince: budgetCategoryId esplicito ignorato se c\'è accountId', async () => {
  vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
  vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

  const { request, context } = patchCon({ accountId: 'conto-1', budgetCategoryId: 'cat-esplicita' })
  await PATCH(request, context)

  const data = vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data
  expect(data.budgetCategoryId).toBe('cat-derivata')
})

it('conto non mappato: la categoria derivata è null', async () => {
  vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue(null)
  vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

  const { request, context } = patchCon({ accountId: 'conto-1' })
  await PATCH(request, context)

  expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.budgetCategoryId).toBeNull()
})

it('senza conto, la categoria esplicita resta accettata (transizione)', async () => {
  vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

  const { request, context } = patchCon({ budgetCategoryId: 'cat-1' })
  await PATCH(request, context)

  const data = vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data
  expect(data.budgetCategoryId).toBe('cat-1')
  expect(derivaBudgetCategoryDaConto).not.toHaveBeenCalled()
})
```

Helper `patchCon(body)` come nei test del repo (NextRequest PATCH + `context.params` Promise).

- [ ] **Step 2: RED** — 4 test falliscono (la route attuale non deriva e non scrive la source).

- [ ] **Step 3: Implementazione** — nella route, sostituire il blocco update (righe 46-55):

```ts
    // Il conto è l'asse di imputazione: se arriva, la categoria si deriva
    // sempre dalla mappatura (il conto vince su una categoria esplicita).
    // Una categoria senza conto resta accettata durante la transizione
    const budgetCategoryId = validated.accountId
      ? await derivaBudgetCategoryDaConto(validated.accountId)
      : validated.budgetCategoryId || null

    const updated = await prisma.journalEntry.update({
      where: { id: id },
      data: {
        budgetCategoryId,
        accountId: validated.accountId || undefined,
        notes: validated.notes || undefined,
        categorizationSource: 'manual',
        verified: true, // Auto-verify su categorizzazione manuale
      },
    })
```

più l'import del helper in testa.

- [ ] **Step 4: GREEN** — 4/4, poi `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/prima-nota/[id]/categorize/route.ts" "src/app/api/prima-nota/[id]/categorize/__tests__/route.test.ts"
git commit -m "fix(prima-nota): la categorize deriva la categoria dal conto e firma la source"
```

---

### Task 3: Fase 0 — derivazione negli altri punti di scrittura + deprecazione

**Files:**
- Modify: `src/lib/schedule-rules/engine.ts` (la create del movimento, righe ~305-320)
- Modify: `src/app/api/prima-nota/recategorize/route.ts` (il loop di match, righe 54-92)
- Modify: `prisma/schema.prisma` (commento deprecazione su `JournalEntry.budgetCategoryId`, riga ~402)
- Test: `src/lib/schedule-rules/__tests__/engine.test.ts` (estendere)

**Interfaces:**
- Consumes: `derivaBudgetCategoryDaConto` (Task 1).

- [ ] **Step 1: Test che fallisce (engine)** — nel file di test esistente (mock prisma già presente; aggiungere `vi.mock('@/lib/accounts/mapping', ...)` e, se il mock prisma non copre le entità usate da `applicaRegolaCreaMovimento` — schedule, bankAccount, journalEntry — leggere prima il describe esistente di quella funzione, se c'è, e integrarsi; altrimenti crearne uno con i mock minimi):

```ts
it('il movimento creato dalla regola eredita la categoria derivata dal conto del fornitore', async () => {
  // fixture: scadenza passiva con supplier.defaultAccountId = 'conto-forn'
  vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-forn')
  // ... mock schedule/bankAccount/regola come da pattern del file, journalEntry.create mockato
  // atteso:
  expect(prisma.journalEntry.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        accountId: 'conto-forn',
        budgetCategoryId: 'cat-forn',
      }),
    })
  )
})
```

Se `applicaRegolaCreaMovimento` non ha ancora un describe con i mock necessari, il test va costruito completo (schedule.findFirst → scadenza passiva con supplier, risolviRegolaScadenza soddisfatta via scheduleRule.findMany, bankAccount.findFirst valido, reconcile mockato via vi.mock del service). Guardare il file di test esistente per lo stile.

- [ ] **Step 2: RED verificato.**

- [ ] **Step 3: Implementazione**

In `engine.ts`, nella create del movimento (dopo aver risolto `schedule.supplier?.defaultAccountId`):

```ts
      const contoMovimento = schedule.supplier?.defaultAccountId ?? null
      const categoriaDerivata = contoMovimento
        ? await derivaBudgetCategoryDaConto(contoMovimento)
        : null
```

e nella `data` della create: `accountId: contoMovimento, budgetCategoryId: categoriaDerivata,` (al posto del solo accountId attuale).

In `recategorize/route.ts`, dove la regola vincente viene applicata (update con `budgetCategoryId: rule.budgetCategoryId`, riga ~83): se la regola ha `accountId`, impostare anche quello e derivare la categoria dal conto (che vince su `rule.budgetCategoryId`); senza conto, comportamento attuale. Aggiungere `categorizationSource: 'rule'` se manca.

In `prisma/schema.prisma`, sopra `budgetCategoryId` di JournalEntry:

```prisma
  /// @deprecated Asse in pensione graduale: si deriva dal conto via
  /// AccountBudgetMapping (spec 2026-08-05-allocation-design.md, Fase 0).
  /// Rimozione decisa nella fase report.
```

(solo commento: nessun cambiamento di colonna, niente db:push necessario).

- [ ] **Step 4: GREEN + suite del file + typecheck** — `npx vitest run src/lib/schedule-rules/__tests__/engine.test.ts && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule-rules/engine.ts src/app/api/prima-nota/recategorize/route.ts prisma/schema.prisma src/lib/schedule-rules/__tests__/engine.test.ts
git commit -m "feat(conti): derivazione della categoria dal conto in regole e movimenti generati"
```

---

### Task 4: Fase 1 — schema JournalEntryAllocation

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: modello `JournalEntryAllocation` + relazioni inverse su JournalEntry (`allocations`), Account, ScheduleReconciliation, User.

- [ ] **Step 1: Modello** (accanto agli altri modelli di prima nota; nomi relazioni inverse da aggiungere sui modelli citati):

```prisma
/// Fetta di ripartizione di un movimento su un conto (allocation).
/// Attributo replace-all del movimento: NON va in SOFT_DELETE_MODELS, il
/// soft-delete vive sul JournalEntry. Invariante: somma fette ≤ importo utile
/// del movimento; con fette presenti JournalEntry.accountId = conto dominante
/// e categorizationSource = 'split'.
/// Vedi docs/superpowers/specs/2026-08-05-allocation-design.md (Fase 1).
model JournalEntryAllocation {
  id               String   @id @default(cuid())
  journalEntryId   String   @map("journal_entry_id")
  accountId        String   @map("account_id")
  importo          Decimal  @db.Decimal(10, 2)
  /// 'manuale' (editor split) | 'ereditata' (pro-quota dalla riconciliazione, Fase 3)
  origine          String
  /// Riconciliazione che ha generato la fetta ereditata: chiave dell'undo (Fase 3)
  reconciliationId String?  @map("reconciliation_id")
  note             String?
  createdById      String?  @map("created_by")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  journalEntry   JournalEntry            @relation(fields: [journalEntryId], references: [id], onDelete: Cascade)
  account        Account                 @relation(fields: [accountId], references: [id], onDelete: Restrict)
  reconciliation ScheduleReconciliation? @relation(fields: [reconciliationId], references: [id], onDelete: SetNull)
  createdBy      User?                   @relation("JournalEntryAllocationCreatedBy", fields: [createdById], references: [id])

  @@index([journalEntryId])
  @@index([reconciliationId])
  @@index([accountId])
  @@map("journal_entry_allocations")
}
```

- [ ] **Step 2: Creazione tabella via DDL esplicito** (NO db push — vedi Global Constraints). Salvare questo SQL in un file dentro il workspace .superpowers e passarlo a `npx prisma db execute --stdin` (cwd nel worktree):

```sql
CREATE TABLE IF NOT EXISTS "journal_entry_allocations" (
  "id" TEXT NOT NULL,
  "journal_entry_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "importo" DECIMAL(10,2) NOT NULL,
  "origine" TEXT NOT NULL,
  "reconciliation_id" TEXT,
  "note" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journal_entry_allocations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "journal_entry_allocations_journal_entry_id_idx" ON "journal_entry_allocations"("journal_entry_id");
CREATE INDEX IF NOT EXISTS "journal_entry_allocations_reconciliation_id_idx" ON "journal_entry_allocations"("reconciliation_id");
CREATE INDEX IF NOT EXISTS "journal_entry_allocations_account_id_idx" ON "journal_entry_allocations"("account_id");
ALTER TABLE "journal_entry_allocations" ADD CONSTRAINT "journal_entry_allocations_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entry_allocations" ADD CONSTRAINT "journal_entry_allocations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entry_allocations" ADD CONSTRAINT "journal_entry_allocations_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "schedule_reconciliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entry_allocations" ADD CONSTRAINT "journal_entry_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Nota: gli ALTER non hanno IF NOT EXISTS — se lo script viene rieseguito, gli errori "constraint already exists" sono attesi e innocui.

- [ ] **Step 3: Generate + verifica** — `npx prisma generate`, poi verificare la tabella con una query su information_schema (script node/pg come .superpowers, o `psql` se disponibile): colonne e FK presenti. Infine `npx tsc --noEmit`.

- [ ] **Step 4: Commit** — SOLO `prisma/schema.prisma`:

```bash
git add prisma/schema.prisma
git commit -m "feat(prima-nota): tabella delle fette di ripartizione dei movimenti"
```

---

### Task 5: Fase 1 — `ripartisciProQuota` (funzione pura)

**Files:**
- Create: `src/lib/services/allocation-service.ts`
- Test: `src/lib/services/__tests__/allocation-service.test.ts`

**Interfaces:**
- Produces: `ripartisciProQuota(fette: Array<{accountId: string, importo: number}>, quota: number): Array<{accountId: string, importo: number}>` — riparte `quota` proporzionalmente agli importi delle fette; arrotondamento al centesimo con quadratura della differenza sull'ultima fetta; fette a importo 0 escluse dal risultato. Usata in Fase 3 per l'ereditarietà.

- [ ] **Step 1: Test che falliscono**

```ts
import { describe, it, expect } from 'vitest'
import { ripartisciProQuota } from '../allocation-service'

describe('ripartisciProQuota', () => {
  it('quota piena: le fette restano identiche', () => {
    expect(
      ripartisciProQuota([{ accountId: 'a', importo: 700 }, { accountId: 'b', importo: 300 }], 1000)
    ).toEqual([{ accountId: 'a', importo: 700 }, { accountId: 'b', importo: 300 }])
  })

  it('quota parziale: pro-quota al centesimo', () => {
    expect(
      ripartisciProQuota([{ accountId: 'a', importo: 700 }, { accountId: 'b', importo: 300 }], 500)
    ).toEqual([{ accountId: 'a', importo: 350 }, { accountId: 'b', importo: 150 }])
  })

  it('gli arrotondamenti quadrano sull\'ultima fetta: la somma è sempre la quota', () => {
    const out = ripartisciProQuota(
      [{ accountId: 'a', importo: 33.33 }, { accountId: 'b', importo: 33.33 }, { accountId: 'c', importo: 33.34 }],
      50
    )
    const somma = out.reduce((s, f) => s + f.importo, 0)
    expect(Math.round(somma * 100) / 100).toBe(50)
    out.forEach((f) => expect(f.importo).toBe(Math.round(f.importo * 100) / 100))
  })

  it('fette che si azzerano vengono escluse', () => {
    const out = ripartisciProQuota(
      [{ accountId: 'a', importo: 1000 }, { accountId: 'b', importo: 0.01 }],
      0.5
    )
    expect(out.every((f) => f.importo > 0)).toBe(true)
    expect(Math.round(out.reduce((s, f) => s + f.importo, 0) * 100) / 100).toBe(0.5)
  })
})
```

- [ ] **Step 2: RED** — modulo inesistente.

- [ ] **Step 3: Implementazione**

```ts
export interface FettaInput {
  accountId: string
  importo: number
}

/**
 * Riparte una quota proporzionalmente alle fette date, al centesimo.
 * La differenza di arrotondamento quadra sull'ultima fetta non nulla, così la
 * somma restituita è SEMPRE esattamente la quota. Pura: nessun accesso al DB.
 */
export function ripartisciProQuota(fette: FettaInput[], quota: number): FettaInput[] {
  const totale = fette.reduce((s, f) => s + f.importo, 0)
  if (totale <= 0 || quota <= 0) return []

  const out: FettaInput[] = []
  let residuo = Math.round(quota * 100)
  fette.forEach((f, i) => {
    const centesimi =
      i === fette.length - 1 ? residuo : Math.round((quota * f.importo * 100) / totale)
    residuo -= centesimi
    if (centesimi > 0) out.push({ accountId: f.accountId, importo: centesimi / 100 })
  })
  return out
}
```

- [ ] **Step 4: GREEN** — 4/4, typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/allocation-service.ts src/lib/services/__tests__/allocation-service.test.ts
git commit -m "feat(prima-nota): ripartizione pro-quota delle fette"
```

---

### Task 6: Fase 1 — `setEntryAllocations` (split manuale)

**Files:**
- Modify: `src/lib/services/allocation-service.ts`
- Test: `src/lib/services/__tests__/allocation-service.test.ts`

**Interfaces:**
- Consumes: `derivaBudgetCategoryDaConto` (Task 1), modello Prisma (Task 4).
- Produces: `setEntryAllocations({journalEntryId, venueId, userId, fette}): Promise<SetAllocationsOutcome>` con `SetAllocationsOutcome = {outcome:'ok', allocazioni: number} | {outcome:'entry_not_found'} | {outcome:'invalid'; motivo: string}`. Regole: valida conti esistenti/attivi e importi > 0; somma ≤ importo utile (debit per entrate, credit per uscite, tolleranza 0.01); transazione replace-all delle sole fette `origine:'manuale'` (le 'ereditate' di Fase 3 non si toccano); con fette → `accountId` = conto dominante, `budgetCategoryId` derivato, `categorizationSource:'split'`; array vuoto → rimuove le manuali e, se non restano fette, ripristina `categorizationSource:'manual'` lasciando accountId/categoria correnti.

- [ ] **Step 1: Test che falliscono** (mock prisma esteso: `journalEntry {findFirst, update}`, `journalEntryAllocation {findMany, deleteMany, createMany}`, `account {findMany}`, `$transaction` che passa il mock come tx — pattern di schedule-reconciliation-service.test.ts; mock di `@/lib/accounts/mapping` e `@/lib/logger`)

Casi minimi:

```ts
it('scrive le fette, il conto dominante e la source split', async () => {
  vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
    id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
  } as never)
  vi.mocked(prisma.account.findMany).mockResolvedValue([
    { id: 'conto-a', isActive: true }, { id: 'conto-b', isActive: true },
  ] as never)
  vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([] as never)
  vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-a')

  const esito = await setEntryAllocations({
    journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
    fette: [
      { accountId: 'conto-a', importo: 700 },
      { accountId: 'conto-b', importo: 300 },
    ],
  })

  expect(esito).toEqual({ outcome: 'ok', allocazioni: 2 })
  expect(prisma.journalEntryAllocation.deleteMany).toHaveBeenCalledWith({
    where: { journalEntryId: 'entry-1', origine: 'manuale' },
  })
  expect(prisma.journalEntryAllocation.createMany).toHaveBeenCalled()
  expect(prisma.journalEntry.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        accountId: 'conto-a', // dominante (700 > 300)
        budgetCategoryId: 'cat-a',
        categorizationSource: 'split',
      }),
    })
  )
})

it('somma oltre l\'importo utile: invalid', async () => { /* credit 1000, fette 700+400 → outcome invalid, nessuna scrittura */ })

it('conto inesistente o non attivo: invalid', async () => { /* account.findMany ne restituisce meno dei richiesti */ })

it('array vuoto: rimuove le manuali e ripristina la source manual', async () => {
  /* findMany post-delete → [] ; atteso update con categorizationSource 'manual' e nessun cambio di accountId */
})

it('le fette ereditate non si toccano', async () => {
  /* dopo la replace delle manuali, findMany restituisce anche una fetta origine 'ereditata':
     il dominante si calcola su TUTTE le fette presenti */
})
```

(Completare i corpi seguendo il primo caso; ogni test asserisce su chiamate mock reali.)

- [ ] **Step 2: RED.** — funzione non esportata.

- [ ] **Step 3: Implementazione** — nello stesso file del Task 5:

```ts
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'

export type SetAllocationsOutcome =
  | { outcome: 'ok'; allocazioni: number }
  | { outcome: 'entry_not_found' }
  | { outcome: 'invalid'; motivo: string }

export async function setEntryAllocations({
  journalEntryId, venueId, userId, fette,
}: {
  journalEntryId: string
  venueId: string
  userId: string | null
  fette: FettaInput[]
}): Promise<SetAllocationsOutcome> {
  const entry = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId, venueId, deletedAt: null },
    select: { id: true, debitAmount: true, creditAmount: true, accountId: true },
  })
  if (!entry) return { outcome: 'entry_not_found' }

  const importoUtile = Number(entry.debitAmount ?? entry.creditAmount ?? 0)

  if (fette.some((f) => f.importo <= 0)) {
    return { outcome: 'invalid', motivo: 'Ogni fetta deve avere un importo positivo' }
  }
  const somma = fette.reduce((s, f) => s + f.importo, 0)
  if (somma > importoUtile + 0.01) {
    return {
      outcome: 'invalid',
      motivo: `La somma delle fette (${somma.toFixed(2)} €) supera l'importo del movimento (${importoUtile.toFixed(2)} €)`,
    }
  }
  if (fette.length > 0) {
    const conti = await prisma.account.findMany({
      where: { id: { in: fette.map((f) => f.accountId) }, isActive: true },
      select: { id: true },
    })
    if (conti.length !== new Set(fette.map((f) => f.accountId)).size) {
      return { outcome: 'invalid', motivo: 'Uno o più conti non esistono o non sono attivi' }
    }
  }

  const risultato = await prisma.$transaction(async (tx) => {
    await tx.journalEntryAllocation.deleteMany({
      where: { journalEntryId, origine: 'manuale' },
    })
    if (fette.length > 0) {
      await tx.journalEntryAllocation.createMany({
        data: fette.map((f) => ({
          journalEntryId,
          accountId: f.accountId,
          importo: new Prisma.Decimal(f.importo.toFixed(2)),
          origine: 'manuale',
          createdById: userId,
        })),
      })
    }
    // Il dominante si calcola su TUTTE le fette rimaste (manuali + ereditate)
    const tutte = await tx.journalEntryAllocation.findMany({
      where: { journalEntryId },
      select: { accountId: true, importo: true },
    })
    if (tutte.length > 0) {
      const dominante = tutte.reduce((max, f) =>
        Number(f.importo) > Number(max.importo) ? f : max
      )
      await tx.journalEntry.update({
        where: { id: journalEntryId },
        data: {
          accountId: dominante.accountId,
          budgetCategoryId: await derivaBudgetCategoryDaConto(dominante.accountId),
          categorizationSource: 'split',
        },
      })
    } else {
      // Split rimosso: il movimento torna alla categorizzazione semplice
      await tx.journalEntry.update({
        where: { id: journalEntryId },
        data: { categorizationSource: 'manual' },
      })
    }
    return tutte.length
  })

  logger.info('Fette del movimento aggiornate', { journalEntryId, allocazioni: risultato })
  return { outcome: 'ok', allocazioni: risultato }
}
```

- [ ] **Step 4: GREEN + typecheck.**

- [ ] **Step 5: Commit** (stessi due file del Task 5).

```bash
git add src/lib/services/allocation-service.ts src/lib/services/__tests__/allocation-service.test.ts
git commit -m "feat(prima-nota): split manuale del movimento in fette per conto"
```

---

### Task 7: Fase 1 — route `PUT/DELETE /api/prima-nota/[id]/suddivisione`

**Files:**
- Create: `src/app/api/prima-nota/[id]/suddivisione/route.ts`
- Test: `src/app/api/prima-nota/[id]/suddivisione/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `setEntryAllocations` (Task 6).
- Produces: `PUT` body `{fette: [{accountId, importo, note?}]}` → 200 con esito ok; 400 su invalid (col motivo); 404 su entry_not_found; `DELETE` = `setEntryAllocations` con array vuoto. Auth + admin/manager, venue da `getVenueId()`.

- [ ] **Step 1: Test che falliscono** — mock del service (`vi.mock('@/lib/services/allocation-service')`), di auth/venue/logger. Casi: 401 senza sessione; 403 ruolo staff; PUT ok (service chiamato con venueId della sessione e fette del body, 200); PUT invalid → 400 col motivo; PUT entry_not_found → 404; DELETE → service con `fette: []`. Zod: `fette: z.array(z.object({ accountId: z.string().min(1), importo: z.number().positive(), note: z.string().optional() }))`.

- [ ] **Step 2: RED** (route inesistente: creare prima uno stub 501 come da prassi, osservare i fallimenti giusti).

- [ ] **Step 3: Implementazione** — struttura identica alle altre route del repo (auth, ruoli, getVenueId, zod parse, switch sugli outcome, audit log UPDATE su JournalEntry, logger.error nel catch).

- [ ] **Step 4: GREEN + typecheck.**

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/prima-nota/[id]/suddivisione/route.ts" "src/app/api/prima-nota/[id]/suddivisione/__tests__/route.test.ts"
git commit -m "feat(prima-nota): API di suddivisione del movimento"
```

---

### Task 8: Fase 1 — UI: select conti condivisa, dialog Suddividi, badge

**Files:**
- Create: `src/components/prima-nota/shared/AccountGroupedSelect.tsx`
- Create: `src/components/prima-nota/movimenti/SplitEntryDialog.tsx`
- Modify: `src/components/prima-nota/movimenti/MovimentoRowActions.tsx` (nuova azione "Suddividi importo")
- Modify: `src/components/prima-nota/movimenti/MovimentiTable.tsx` (badge "Suddiviso (N)" accanto alla categoria quando `entry.allocations?.length > 0`; la lista deve includere `allocations` nel fetch — verificare la route GET /api/prima-nota e aggiungere l'include se manca, con conteggio)
- Modify: `src/app/(dashboard)/prima-nota/movimenti/MovimentiClient.tsx` (stato dialog + handler PUT/DELETE)
- Modify: `src/types/prima-nota.ts` (tipo `JournalEntryAllocation` + campo `allocations?` sull'entry)

UI senza test automatici (convenzione repo): verifica = typecheck + suite intera + smoke nel Task 12.

- [ ] **Step 1: AccountGroupedSelect** — select shadcn con i conti attivi raggruppati per categoria derivata: fetch da `GET /api/accounts` se esiste (VERIFICARE con grep; se non esiste una route che restituisce conti + mappatura, estenderne una esistente o crearne una GET semplice `/api/conti` con select id/code/name + categoria derivata via include della mappatura). Optgroup per nome categoria, gruppo finale "Senza categoria". Props: `value`, `onChange`, `disabled`.
- [ ] **Step 2: SplitEntryDialog** — righe dinamiche (AccountGroupedSelect + input importo + nota), residuo live (`importo movimento − somma fette`), bottone "Quadra" sull'ultima riga, submit disabilitato se somma > importo; azione "Rimuovi suddivisione" (DELETE). Stile dei dialog esistenti del file movimenti.
- [ ] **Step 3: Collegamenti** — azione in MovimentoRowActions ("Suddividi importo", visibile per movimenti non nascosti), badge in tabella, handler in MovimentiClient con refresh della lista dopo il salvataggio.
- [ ] **Step 4: Verifica** — `npx tsc --noEmit && npx vitest run` (tutta la suite).
- [ ] **Step 5: Commit** — SOLO i file toccati elencati sopra:

```bash
git add src/components/prima-nota/shared/AccountGroupedSelect.tsx src/components/prima-nota/movimenti/SplitEntryDialog.tsx src/components/prima-nota/movimenti/MovimentoRowActions.tsx src/components/prima-nota/movimenti/MovimentiTable.tsx "src/app/(dashboard)/prima-nota/movimenti/MovimentiClient.tsx" src/types/prima-nota.ts
git commit -m "feat(prima-nota): editor di suddivisione e badge in lista"
```

(più l'eventuale route conti creata/estesa nello Step 1 — aggiungerla allo staging e citarla nel report).

---

### Task 9: Fase 2 — schema `InvoiceLineAccount`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Modello**

```prisma
/// Imputazione per conto di una singola riga di fattura elettronica.
/// Ancorata a numeroLinea dell'XML (stabile); snapshot di descrizione,
/// codice articolo e importo per matching e audit anche se l'XML cambia.
/// stato: 'proposta' (pallino giallo) | 'confermata'.
/// fonte: 'ai' | 'regola-appresa' | 'manuale'.
/// Vedi docs/superpowers/specs/2026-08-05-allocation-design.md (Fase 2).
model InvoiceLineAccount {
  id             String    @id @default(cuid())
  invoiceId      String    @map("invoice_id")
  numeroLinea    Int       @map("numero_linea")
  descrizione    String
  codiceArticolo String?   @map("codice_articolo")
  importo        Decimal   @db.Decimal(10, 2)
  accountId      String    @map("account_id")
  stato          String    @default("proposta")
  fonte          String
  confidence     Decimal?  @db.Decimal(3, 2)
  motivazioneAi  String?   @map("motivazione_ai")
  confirmedById  String?   @map("confirmed_by")
  confirmedAt    DateTime? @map("confirmed_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  invoice     ElectronicInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  account     Account           @relation(fields: [accountId], references: [id], onDelete: Restrict)
  confirmedBy User?             @relation("InvoiceLineAccountConfirmedBy", fields: [confirmedById], references: [id])

  @@unique([invoiceId, numeroLinea])
  @@index([invoiceId])
  @@map("invoice_line_accounts")
}
```

(relazioni inverse su ElectronicInvoice `lineAccounts InvoiceLineAccount[]`, Account, User).

- [ ] **Step 2: DDL esplicito + generate + typecheck** — stesso metodo del Task 4 (NO db push): CREATE TABLE "invoice_line_accounts" con colonne mappate dal modello (id PK, invoice_id, numero_linea INTEGER, descrizione, codice_articolo NULL, importo DECIMAL(10,2), account_id, stato DEFAULT 'proposta', fonte, confidence DECIMAL(3,2) NULL, motivazione_ai NULL, confirmed_by NULL, confirmed_at NULL, created_at/updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP), UNIQUE ("invoice_id","numero_linea") via CREATE UNIQUE INDEX "invoice_line_accounts_invoice_id_numero_linea_key", indice su invoice_id, FK verso "electronic_invoices"(id) ON DELETE CASCADE (verificare il @@map reale di ElectronicInvoice nello schema), "accounts"(id) RESTRICT, "users"(id) SET NULL. Poi `npx prisma generate` e `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — solo `prisma/schema.prisma`:

```bash
git add prisma/schema.prisma
git commit -m "feat(fatture): imputazione per conto delle righe fattura"
```

---

### Task 10: Fase 2 — API: merge righe nel GET + PATCH righe-conti

**Files:**
- Modify: `src/app/api/invoices/[id]/route.ts` (GET, zona righe 107-134: il parse dell'XML già avviene lì)
- Create: `src/app/api/invoices/[id]/righe-conti/route.ts`
- Test: `src/app/api/invoices/[id]/righe-conti/__tests__/route.test.ts`

**Interfaces:**
- Consumes: modello Task 9, `derivaBudgetCategoryDaConto` (per esporre la categoria derivata nel payload).
- Produces:
  - GET dettaglio: ogni riga di `parsedData.dettaglioLinee` arricchita con `imputazione: {accountId, stato, fonte, confidence, motivazioneAi} | null` (merge per `numeroLinea` da `prisma.invoiceLineAccount.findMany({where:{invoiceId}})`).
  - `PATCH /api/invoices/[id]/righe-conti` body: `{righe: [{numeroLinea, accountId}], confermaTutte?: boolean}` — upsert per (invoiceId, numeroLinea) con `fonte:'manuale'`, `stato:'confermata'`, `confirmedById/At`, snapshot descrizione/codiceArticolo/importo presi dalle righe riparsate dall'XML della fattura (obbligatorio: se `numeroLinea` non esiste nell'XML → 400); `confermaTutte: true` senza righe = tutte le righe in stato 'proposta' passano a 'confermata' (updateMany). Auth + admin/manager. Fatture della venue (`getVenueId()`).

- [ ] **Step 1: Test che falliscono** — mock prisma (`electronicInvoice.findFirst`, `invoiceLineAccount {findMany, upsert, updateMany}`), auth/venue/audit/logger, e mock del parser (`vi.mock('@/lib/sdi/parser')` con `parseFatturaPA` che restituisce `dettaglioLinee` fisse). Casi: 401/403; 404 fattura; PATCH righe → upsert con snapshot e stato confermata; numeroLinea inesistente → 400; confermaTutte → updateMany su stato proposta.

- [ ] **Step 2: RED** (stub 501 per la nuova route).

- [ ] **Step 3: Implementazione** — nel GET riusare il `parsedData` già calcolato; niente doppio parse. Nella PATCH parsare l'XML una volta per gli snapshot.

- [ ] **Step 4: GREEN + typecheck.**

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/invoices/[id]/route.ts" "src/app/api/invoices/[id]/righe-conti/route.ts" "src/app/api/invoices/[id]/righe-conti/__tests__/route.test.ts"
git commit -m "feat(fatture): lettura e conferma delle imputazioni per riga"
```

---

### Task 11: Fase 2 — UI dettaglio fattura

**Files:**
- Modify: `src/components/invoices/InvoiceDetailSections.tsx` (`LineItemsTable`, righe ~297-360)
- Modify: `src/components/invoices/InvoiceDetail.tsx` (props/refetch)

Comportamento: nuova colonna "Conto" nella tabella righe — `AccountGroupedSelect` (riuso dal Task 8) precompilata con l'imputazione salvata; pallino giallo (stato 'proposta') / verde ('confermata') accanto; se nessuna imputazione, select vuota con suggerimento non salvato = conto di default del fornitore (passato dal padre se disponibile). Bottone "Accetta tutte" in testa alla tabella (visibile se esiste almeno una 'proposta') → PATCH `confermaTutte`. Ogni cambio select → PATCH della singola riga → refetch. UI senza test automatici; verifica typecheck + suite + smoke Task 12.

- [ ] **Step 1: Implementare.**
- [ ] **Step 2: `npx tsc --noEmit && npx vitest run`.**
- [ ] **Step 3: Commit**

```bash
git add src/components/invoices/InvoiceDetailSections.tsx src/components/invoices/InvoiceDetail.tsx
git commit -m "feat(fatture): imputazione per conto delle righe dal dettaglio"
```

---

### Task 12: Chiusura ondata A — verifiche e smoke

- [ ] **Step 1:** `npx vitest run && npx tsc --noEmit && npx eslint src/lib/accounts src/lib/services/allocation-service.ts src/app/api/prima-nota src/app/api/invoices src/components/prima-nota src/components/invoices` — tutto verde, zero errori nuovi (81 warning preesistenti nel repo sono noti).
- [ ] **Step 2: Smoke di avvio** — `PORT=3106 npm run dev` in background nel worktree; login page 200; `GET /api/prima-nota` senza sessione → redirect/401 senza crash; kill. NON toccare dati di produzione.
- [ ] **Step 3:** Report finale con numeri (test, typecheck, lint) — nessun commit docs qui (la doc di progetto si aggiorna a fine Fase 4).

**NON pushare: il push lo decide il controller.**

