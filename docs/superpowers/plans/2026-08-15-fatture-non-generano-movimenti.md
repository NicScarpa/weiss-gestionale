# Un documento fiscale non genera denaro — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Togliere la possibilità che un documento fiscale generi un movimento di prima nota, e sostituirla con l'associazione a un movimento realmente avvenuto.

**Architecture:** Si elimina `POST /api/invoices/[id]/record` e lo stato `RECORDED`. Il caso «movimento già in prima nota» usa la rotta di riconciliazione che esiste già; il caso contante ottiene un endpoint nuovo che crea il movimento di cassa e lo riconcilia nella stessa transazione, riusando il motore della riconciliazione assistita.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Prisma 7 con adapter `@prisma/adapter-pg`, PostgreSQL (Supabase in produzione), Vitest + Testing Library, TanStack Query, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-15-fatture-non-generano-movimenti-design.md`

## Global Constraints

- **L'invariante da stabilire:** ogni riga di prima nota corrisponde a un movimento di denaro realmente avvenuto; i documenti si associano ai movimenti, mai il contrario.
- **`.env` punta alla PRODUZIONE.** Nessun comando Prisma che scriva su database va eseguito contro quella stringa: niente `prisma migrate dev`, `db push`, `db seed`. La migrazione si scrive a mano e va in produzione con `prisma migrate deploy` in fase di deploy.
- **Node 22 obbligatorio:** anteporre `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH"` a ogni comando `npm`/`npx`/`node` sulla stessa riga.
- **Mai `git add -A`:** `docs/fatture/` contiene fatture vere con IBAN e partite IVA. Elencare sempre i file.
- **Mai `npm run build | tail`:** il codice d'uscita diventa quello di `tail` e una build rotta sembra verde.
- **Autorizzazione:** le rotte con dati finanziari richiedono ruolo `admin` o `manager` (`src/CLAUDE.md`).
- **Le nuove rotte devono usare `withAuth`** oppure non aumentare il cricchetto: `node scripts/check-route-auth.mjs --ratchet` deve restare «pari alla baseline».
- **Scritture contabili:** mai `delete()`, sempre `deletedAt` (`SOFT_DELETE_MODELS` in `src/lib/prisma.ts`).
- **Importi:** sempre `Decimal` in Prisma, mai `Float`.
- **Il verso dare/avere non si scrive a mano:** si usa `toDebitCredit(registerType, entryType, amount)` da `src/lib/prima-nota-utils.ts:162`, unico posto dove vive la convenzione.
- **Lingua:** percorsi API e nomi nuovi in italiano; commenti e messaggi in italiano.

---

## Struttura dei file

| File | Responsabilità | Azione |
|---|---|---|
| `src/app/api/invoices/[id]/record/route.ts` | crea il movimento dalla fattura | **eliminato** |
| `src/app/api/invoices/[id]/record/__tests__/porta-chiusa.test.ts` | prova che la rotta non risponde più | creato |
| `src/components/invoices/InvoiceDetail.tsx` | scheda fattura | bottone/mutation/badge rimossi; azione nuova aggiunta (Task 6) |
| `src/components/invoices/InvoiceDetailSections.tsx` | sezioni della scheda | `isRegistered` e `MetadataSection` senza `RECORDED`/`recordedAt` |
| `src/components/invoices/InvoiceList.tsx` | lista fatture | filtri e selezione senza `RECORDED` |
| `src/lib/invoice-utils.ts` | etichette di stato | `getSimpleStatus` senza `RECORDED` |
| `src/lib/scadenzario/stato-schedule.ts` | stato fattura ↔ scadenze | `statoFatturaNonPagata` senza il gradino `RECORDED` |
| `src/app/api/invoices/bulk-delete/route.ts` | cancellazione massiva | `STATI_NON_ELIMINABILI` = `['PAID']` |
| `prisma/schema.prisma` | schema | enum senza `RECORDED`; via `journalEntryId`/`recordedAt` e la relazione |
| `prisma/migrations/20260815120000_via_stato_registrata/migration.sql` | migrazione | creato |
| `src/lib/services/schedule-reconciliation-service.ts` | motore di riconciliazione | estratta `riconciliaInTransazione(tx, input)` |
| `src/app/api/scadenzario/[id]/paga-in-contanti/route.ts` | pagamento in contanti | creato |
| `src/components/invoices/SegnaComePagataDialog.tsx` | dialogo sulla fattura | creato |

---

## Task 1: La porta si chiude

**Files:**
- Delete: `src/app/api/invoices/[id]/record/route.ts` (e la cartella `record/`, incluso `CLAUDE.md` se presente)
- Create: `src/app/api/invoices/[id]/__tests__/porta-chiusa.test.ts`
- Modify: `src/components/invoices/InvoiceDetail.tsx` (righe 136-145 `recordInvoice`, 310-321 `recordMutation`, 415 `canEdit` resta a Task 2, 479-511 il bottone, 621-631 il badge, 647 `recordedAt`)
- Modify: `src/components/invoices/InvoiceDetailSections.tsx` (`MetadataSection`, riga 1257)

**Interfaces:**
- Consumes: niente da task precedenti.
- Produces: `MetadataSection` senza le prop `recordedAt` e `journalEntryDescription`.

- [ ] **Step 1: Scrivere il test che prova la porta chiusa**

Creare `src/app/api/invoices/[id]/__tests__/porta-chiusa.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('la fattura non può più generare un movimento', () => {
  it('la rotta /api/invoices/[id]/record non esiste più', () => {
    // Una rotta assente in App Router risponde 404 senza che serva un server:
    // il file È la rotta. Se qualcuno la ricrea, questo test lo dice subito,
    // e il motivo sta nella spec 2026-08-15-fatture-non-generano-movimenti.
    const percorso = resolve(process.cwd(), 'src/app/api/invoices/[id]/record/route.ts')
    expect(existsSync(percorso)).toBe(false)
  })

  it('nessun modulo sotto src/app/api/invoices crea un JournalEntry', async () => {
    const { globSync } = await import('node:fs')
    const { readFileSync } = await import('node:fs')
    const files = globSync('src/app/api/invoices/**/*.ts', { cwd: process.cwd() })
      .filter((f) => !f.includes('__tests__'))

    const colpevoli = files.filter((f) =>
      readFileSync(resolve(process.cwd(), f), 'utf8').includes('journalEntry.create')
    )

    expect(colpevoli).toEqual([])
  })
})
```

- [ ] **Step 2: Eseguirlo e vederlo fallire**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/app/api/invoices/[id]/__tests__/porta-chiusa.test.ts`

Expected: **FAIL** su entrambi — il file esiste e contiene `journalEntry.create`. Se passa, la cancellazione è già avvenuta e il test non prova nulla: fermarsi e capire perché.

- [ ] **Step 3: Eliminare la rotta**

```bash
git rm -r "src/app/api/invoices/[id]/record"
```

- [ ] **Step 4: Togliere la mutation dal client**

In `src/components/invoices/InvoiceDetail.tsx` eliminare per intero la funzione `recordInvoice` (righe 136-145) e il blocco `recordMutation` (righe 310-321).

- [ ] **Step 5: Togliere il bottone**

Eliminare l'intero blocco `{isCategorizedWithAccount && ( ... )}` che contiene i due rami «Registra in Prima Nota» (righe 479-511), insieme alle variabili che servivano solo a lui: `isCategorizedWithAccount`, `costCenterMissingButRequired` e il commento che le spiega. Rimuovere l'import di `BookOpen` se non più usato.

- [ ] **Step 6: Togliere il badge e la prop**

Eliminare il blocco `{invoice.journalEntry && ( ... )}` con «✓ Registrata in Prima Nota» (righe 621-631). Nella chiamata a `MetadataSection` togliere `recordedAt={invoice.recordedAt}` e `journalEntryDescription={invoice.journalEntry?.description}`.

In `src/components/invoices/InvoiceDetailSections.tsx` togliere `recordedAt` e `journalEntryDescription` da `MetadataSectionProps` e dal corpo di `MetadataSection`, insieme ai due blocchi JSX che li mostrano.

- [ ] **Step 7: Eseguire il test e vederlo passare**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/app/api/invoices/[id]/__tests__/porta-chiusa.test.ts`

Expected: PASS (2 test).

- [ ] **Step 8: Controllare i tipi e la suite**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit`
Expected: nessun errore. Se `InvoiceDetail.test.tsx` cita il bottone, aggiornarlo togliendo quei casi.

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:run`
Expected: tutto verde.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/invoices/[id]" src/components/invoices/InvoiceDetail.tsx src/components/invoices/InvoiceDetailSections.tsx
git commit -m "feat(fatture): la fattura non genera più un movimento di prima nota"
```

---

## Task 2: `RECORDED` esce dal codice

**Files:**
- Modify: `src/lib/scadenzario/stato-schedule.ts:229-247`
- Modify: `src/app/api/invoices/bulk-delete/route.ts:14-19`
- Modify: `src/components/invoices/InvoiceDetail.tsx:415`
- Modify: `src/components/invoices/InvoiceList.tsx:86, 295, 495-496, 555, 628`
- Modify: `src/components/invoices/InvoiceDetailSections.tsx:164`
- Modify: `src/lib/invoice-utils.ts:74-80`
- Modify: `src/app/api/invoices/[id]/route.ts:25, 355`
- Test: `src/app/api/invoices/bulk-delete/__tests__/route.test.ts`

**Interfaces:**
- Consumes: da Task 1, la rotta `record` non esiste più.
- Produces: nessun modulo `src/` nomina più `RECORDED`. `statoFatturaNonPagata` restituisce `'IMPORTED' | 'MATCHED' | 'CATEGORIZED'`.

- [ ] **Step 1: Aggiornare il test della cancellazione massiva**

In `src/app/api/invoices/bulk-delete/__tests__/route.test.ts`, nel test «dice quante fatture ha saltato perché registrate o pagate», sostituire lo stato `RECORDED` con `PAID` così che restino due fatture non eliminabili:

```ts
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([
      { id: 'inv-1', status: 'IMPORTED' },
      { id: 'inv-2', status: 'PAID' },
      { id: 'inv-3', status: 'PAID' },
    ] as never)
```

E nel test «rifiuta con 400 quando ogni fattura scelta è registrata o pagata» sostituire `RECORDED` con `PAID`.

Aggiungere il test che fissa la nuova regola:

```ts
  it('una fattura solo categorizzata resta eliminabile', async () => {
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([
      { id: 'inv-1', status: 'CATEGORIZED' },
    ] as never)
    vi.mocked(prisma.electronicInvoice.updateMany).mockResolvedValue({ count: 1 } as never)

    const res = await POST(richiesta(['inv-1']))
    const body = await res.json()

    // Prima «CATEGORIZED» poteva diventare «RECORDED» e bloccarsi. Ora ciò che
    // protegge una fattura è avere pagamenti nello scadenzario, non uno stato.
    expect(res.status).toBe(200)
    expect(body.deleted).toBe(1)
    expect(body.saltatePerStato).toBeUndefined()
  })
```

- [ ] **Step 2: Eseguirlo e vederlo fallire**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/app/api/invoices/bulk-delete/__tests__/route.test.ts`

Expected: il test nuovo PASSA già (CATEGORIZED non è oggi in `STATI_NON_ELIMINABILI`) ed è quindi un guardiano, non una prova del cambiamento. I due test modificati devono passare: se falliscono, la sostituzione `RECORDED`→`PAID` è stata fatta male.

- [ ] **Step 3: Togliere `RECORDED` da `STATI_NON_ELIMINABILI`**

In `src/app/api/invoices/bulk-delete/route.ts`:

```ts
/**
 * Stati che rendono una fattura non eliminabile: il documento risulta pagato.
 *
 * `RECORDED` non esiste più (spec 2026-08-15-fatture-non-generano-movimenti):
 * ciò che protegge una fattura dalla cancellazione è avere pagamenti registrati
 * sulle sue scadenze, e quel controllo è `checkInvoicesDeletable`.
 */
const STATI_NON_ELIMINABILI: InvoiceStatus[] = ['PAID']
```

- [ ] **Step 4: Togliere il gradino da `statoFatturaNonPagata`**

In `src/lib/scadenzario/stato-schedule.ts` sostituire la funzione e il suo commento:

```ts
/**
 * Stato a cui riportare una fattura che non è più interamente pagata.
 *
 * Lo stato precedente non è memorizzato da nessuna parte, quindi non si può
 * "ripristinare": si dichiara il massimo che i dati sanno dimostrare, scendendo
 * la scala del flusso IMPORTED → MATCHED → CATEGORIZED.
 */
function statoFatturaNonPagata(invoice: {
  accountId: string | null
  supplierId: string | null
}): 'IMPORTED' | 'MATCHED' | 'CATEGORIZED' {
  if (invoice.accountId) return 'CATEGORIZED'
  if (invoice.supplierId) return 'MATCHED'
  return 'IMPORTED'
}
```

E in `allineaFattura` togliere `journalEntryId: true` e `recordedAt: true` dalla `select`.

- [ ] **Step 5: Togliere `RECORDED` dal client**

- `InvoiceDetail.tsx:415` → `const canEdit = invoice.status !== 'PAID'`
- `InvoiceList.tsx:86` → il tipo dello stato diventa `'IMPORTED' | 'MATCHED' | 'CATEGORIZED' | 'PAID'`
- `InvoiceList.tsx:295, 495, 496, 555` → ogni `inv.status !== 'RECORDED' && inv.status !== 'PAID'` diventa `inv.status !== 'PAID'`
- `InvoiceDetailSections.tsx:164` → `const isRegistered = status === 'PAID'`, e l'etichetta del badge va rivista: non è più «registrata» ma «pagata». Rinominare la variabile in `isPagata`.
- `invoice-utils.ts:74-80` → `getSimpleStatus` diventa:

```ts
// Helper per stato semplificato (pagata / da pagare)
export function getSimpleStatus(status: string): { label: string; color: string } {
  const isPagata = status === 'PAID'
  return {
    label: isPagata ? 'Pagata' : 'Da pagare',
    color: isPagata ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600',
  }
}
```

- `src/app/api/invoices/[id]/route.ts:25` → `z.enum(['IMPORTED', 'MATCHED', 'CATEGORIZED', 'PAID'])`
- `src/app/api/invoices/[id]/route.ts:355` → `if (existingInvoice.status !== 'PAID') {`

- [ ] **Step 6: Verificare che nessuno lo nomini più**

Run: `grep -rn "RECORDED" src/ --include=*.ts --include=*.tsx | grep -v __tests__ | grep -v ".itest."`
Expected: nessuna riga.

Run: `grep -rn "RECORDED" src/` — restano solo le fixture e i test d'integrazione, che si sistemano nello Step 7.

- [ ] **Step 7: Aggiornare fixture e test d'integrazione**

In `src/test/integration/fixtures/scadenzario.ts`, `src/lib/scadenzario/__tests__/pagamenti-e-stato.itest.ts`, `src/lib/scadenzario/__tests__/riconciliazione.itest.ts`, `src/lib/invoices/__tests__/riallineamento.itest.ts`, `src/test/integration/vincoli-unicita.itest.ts`, `src/app/api/invoices/__tests__/import-politica-duplicati.itest.ts` e `src/components/invoices/__tests__/InvoiceDetail.test.tsx`: sostituire `'RECORDED'` con `'CATEGORIZED'` dove lo stato serve solo a rappresentare «già lavorata», e con `'PAID'` dove serve a rappresentare «chiusa». Le asserzioni che verificano il ritorno a `RECORDED` dopo un dis-abbinamento vanno cambiate in `CATEGORIZED`.

- [ ] **Step 8: Suite e tipi**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit && PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test`
Expected: nessun errore.

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:run`
Expected: tutto verde.

- [ ] **Step 9: Commit**

```bash
git add src/ 
git commit -m "refactor(fatture): lo stato RECORDED esce dal codice"
```

---

## Task 3: La migrazione

**Files:**
- Modify: `prisma/schema.prisma` (enum `InvoiceStatus`, modello `ElectronicInvoice`, modello `JournalEntry`)
- Create: `prisma/migrations/20260815120000_via_stato_registrata/migration.sql`

**Interfaces:**
- Consumes: da Task 2, nessun codice nomina più `RECORDED` né legge `journalEntryId`/`recordedAt` della fattura.
- Produces: `InvoiceStatus` con quattro valori; `ElectronicInvoice` senza `journalEntryId`/`recordedAt`/`journalEntry`; `JournalEntry` senza `electronicInvoice`.

- [ ] **Step 1: Aggiornare lo schema**

In `prisma/schema.prisma`:

```prisma
enum InvoiceStatus {
  IMPORTED
  MATCHED
  CATEGORIZED
  PAID
}
```

Nel modello `ElectronicInvoice` eliminare le righe `journalEntryId`, `recordedAt` e la relazione `journalEntry`, più l'eventuale `@@index([journalEntryId])`.

Nel modello `JournalEntry` eliminare la riga `electronicInvoice ElectronicInvoice?`.

- [ ] **Step 2: Scrivere la migrazione a mano**

Creare `prisma/migrations/20260815120000_via_stato_registrata/migration.sql`:

```sql
-- Un documento fiscale non genera denaro.
-- Spec: docs/superpowers/specs/2026-08-15-fatture-non-generano-movimenti-design.md
--
-- L'ordine è obbligato: PostgreSQL non sa eliminare un valore da un enum, e non
-- accetta di ricrearlo finché qualche riga lo usa ancora.

-- 1. Le fatture che dicevano «registrata» scendono al gradino che i dati sanno
--    dimostrare. È la stessa regola di statoFatturaNonPagata.
UPDATE "electronic_invoices"
SET "status" = 'CATEGORIZED'
WHERE "status" = 'RECORDED' AND "account_id" IS NOT NULL;

UPDATE "electronic_invoices"
SET "status" = 'MATCHED'
WHERE "status" = 'RECORDED' AND "account_id" IS NULL AND "supplier_id" IS NOT NULL;

UPDATE "electronic_invoices"
SET "status" = 'IMPORTED'
WHERE "status" = 'RECORDED';

-- 2. L'enum si ricrea senza RECORDED.
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";

CREATE TYPE "InvoiceStatus" AS ENUM ('IMPORTED', 'MATCHED', 'CATEGORIZED', 'PAID');

ALTER TABLE "electronic_invoices"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "InvoiceStatus" USING ("status"::text::"InvoiceStatus"),
  ALTER COLUMN "status" SET DEFAULT 'IMPORTED';

DROP TYPE "InvoiceStatus_old";

-- 3. Le due colonne che servivano solo al bottone eliminato. Toglierle è ciò
--    che rende la regola strutturale invece che convenuta: senza di esse non
--    esiste più il modo di dire «questa fattura ha generato questo movimento».
ALTER TABLE "electronic_invoices"
  DROP COLUMN "journal_entry_id",
  DROP COLUMN "recorded_at";
```

- [ ] **Step 3: Verificare la migrazione su un database usa-e-getta**

**Non** contro `DATABASE_URL` del `.env`, che è la produzione. Creare un database locale sulla 5433 e applicarci lo storico completo:

```bash
/opt/homebrew/opt/postgresql@16/bin/createdb -h 127.0.0.1 -p 5433 weiss_prova_migrazione
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_prova_migrazione" \
  PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx prisma migrate deploy
```

Expected: tutte le migrazioni applicate, inclusa `20260815120000_via_stato_registrata`, senza errori.

- [ ] **Step 4: Verificare che il valore sia sparito davvero**

```bash
/opt/homebrew/opt/postgresql@16/bin/psql "postgresql://nicolascarpa@127.0.0.1:5433/weiss_prova_migrazione" \
  -X -A -c "SELECT unnest(enum_range(NULL::\"InvoiceStatus\"))::text;"
```

Expected: quattro righe — `IMPORTED`, `MATCHED`, `CATEGORIZED`, `PAID`.

```bash
/opt/homebrew/opt/postgresql@16/bin/psql "postgresql://nicolascarpa@127.0.0.1:5433/weiss_prova_migrazione" \
  -X -A -c "SELECT column_name FROM information_schema.columns WHERE table_name='electronic_invoices' AND column_name IN ('journal_entry_id','recorded_at');"
```

Expected: nessuna riga.

- [ ] **Step 5: Rigenerare il client e ricontrollare i tipi**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx prisma generate`
Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit`
Expected: nessun errore. Se ne compaiono, sono punti che leggevano ancora `journalEntryId`/`recordedAt` sfuggiti al Task 2.

- [ ] **Step 6: Buttare il database di prova**

```bash
/opt/homebrew/opt/postgresql@16/bin/dropdb -h 127.0.0.1 -p 5433 weiss_prova_migrazione
```

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260815120000_via_stato_registrata
git commit -m "feat(db): via lo stato RECORDED e le colonne che lo sostenevano"
```

---

## Task 4: Estrarre il corpo della riconciliazione

Refactor meccanico e senza cambi di comportamento. Serve al Task 5: `reconcileScheduleWithEntry` apre la propria `prisma.$transaction`, e Prisma non annida transazioni interattive — quindi «creo il movimento e lo riconcilio atomicamente» richiede un punto d'ingresso che accetti una transazione già aperta.

**Files:**
- Modify: `src/lib/services/schedule-reconciliation-service.ts:759-880`

**Interfaces:**
- Consumes: niente.
- Produces:
  ```ts
  export async function riconciliaInTransazione(
    tx: TransactionClient,
    input: ReconcileInput
  ): Promise<ReconcileOutcome>
  ```
  `reconcileScheduleWithEntry(input)` resta invariata nella firma e nel comportamento.

- [ ] **Step 1: Esportare `ReconcileInput`**

Oggi è `interface ReconcileInput` (riga 55), senza `export`: la firma pubblica del Task 4 la usa, quindi va esportata.

```ts
export interface ReconcileInput {
```

`TransactionClient` è già importato in cima al file (riga 23) e non va toccato.

- [ ] **Step 2: Estrarre la callback**

In `src/lib/services/schedule-reconciliation-service.ts`, prendere il corpo della callback passata a `prisma.$transaction` dentro `reconcileScheduleWithEntry` e spostarlo in una funzione esportata, senza cambiarne una riga:

```ts
/**
 * Il corpo della riconciliazione, dentro una transazione già aperta.
 *
 * Esportata perché il pagamento in contanti deve creare il movimento e
 * riconciliarlo nello stesso atto: Prisma non annida transazioni interattive,
 * quindi chi ha già una `tx` in mano entra da qui invece che da
 * `reconcileScheduleWithEntry`, che la transazione la apre lui.
 */
export async function riconciliaInTransazione(
  tx: TransactionClient,
  { scheduleId, journalEntryId, venueId, userId, amount, source = 'MANUAL', confidence }: ReconcileInput
): Promise<ReconcileOutcome> {
  // ...corpo identico a quello che stava dentro prisma.$transaction...
}
```

E ridurre `reconcileScheduleWithEntry` a:

```ts
export async function reconcileScheduleWithEntry(
  input: ReconcileInput
): Promise<ReconcileOutcome> {
  const esegui = () => prisma.$transaction((tx) => riconciliaInTransazione(tx, input))
  // ...il resto invariato: il try/catch con la rete di sicurezza su P2002...
}
```

Verificare che `TransactionClient` sia già il tipo usato altrove nel file; se ha un altro nome, usare quello.

- [ ] **Step 3: Verificare che nulla sia cambiato**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/services/__tests__/`
Expected: tutti i test del servizio verdi, senza averne toccato nessuno. È esattamente ciò che un refactor deve produrre: comportamento identico, test intatti.

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/schedule-reconciliation-service.ts
git commit -m "refactor(riconciliazione): il corpo entra anche da una transazione già aperta"
```

---

## Task 5: `POST /api/scadenzario/[id]/paga-in-contanti`

**Files:**
- Create: `src/app/api/scadenzario/[id]/paga-in-contanti/route.ts`
- Create: `src/app/api/scadenzario/[id]/paga-in-contanti/__tests__/route.test.ts`
- Create: `src/app/api/scadenzario/[id]/paga-in-contanti/__tests__/paga-in-contanti.itest.ts`

**Interfaces:**
- Consumes: `riconciliaInTransazione(tx, input)` dal Task 4; `toDebitCredit` da `src/lib/prima-nota-utils.ts:162`; `risolviCentroDiCosto(db, input, contesto)` da `src/lib/services/cost-center-service.ts:149`.
- Produces: `POST /api/scadenzario/[id]/paga-in-contanti` con corpo `{ dataPagamento: string (ISO), importo?: number }`.

- [ ] **Step 1: Scrivere il test unitario**

Creare `src/app/api/scadenzario/[id]/paga-in-contanti/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { Prisma } from '@prisma/client'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/venue', () => ({ getVenueId: vi.fn().mockResolvedValue('venue-1') }))
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findFirst: vi.fn() },
    journalEntry: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/services/cost-center-service', () => ({
  risolviCentroDiCosto: vi.fn(),
}))

vi.mock('@/lib/services/schedule-reconciliation-service', () => ({
  riconciliaInTransazione: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'
import { riconciliaInTransazione } from '@/lib/services/schedule-reconciliation-service'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function richiesta(corpo: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/scadenzario/sc-1/paga-in-contanti', {
    method: 'POST',
    body: JSON.stringify(corpo),
  })
}

const contesto = { params: Promise.resolve({ id: 'sc-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
    id: 'sc-1',
    tipo: 'passiva',
    stato: 'da_pagare',
    importoTotale: new Prisma.Decimal(100),
    importoPagato: new Prisma.Decimal(0),
    descrizione: 'Fattura 1 - TIM',
    invoice: { accountId: 'conto-telefonia', invoiceNumber: '123' },
  } as never)
  vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'mov-1' } as never)
  vi.mocked(risolviCentroDiCosto).mockResolvedValue({
    outcome: 'ok', costCenterId: 'centro-weiss', origine: 'piano',
  } as never)
  vi.mocked(riconciliaInTransazione).mockResolvedValue({
    outcome: 'ok', reconciliationId: 'ric-1', quota: 100, stato: 'pagata',
  } as never)
  vi.mocked(prisma.$transaction).mockImplementation(
    async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma) as never
  )
})

describe('POST /api/scadenzario/[id]/paga-in-contanti', () => {
  it('crea un movimento di CASSA alla data indicata, in uscita', async () => {
    await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          registerType: 'CASH',
          date: new Date('2026-08-10'),
          // Una scadenza passiva è denaro che esce: avere.
          creditAmount: new Prisma.Decimal('100.00'),
          debitAmount: null,
        }),
      })
    )
  })

  it('porta il conto della fattura in testata', async () => {
    await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    // Senza fette il conto economico legge la testata: una fattura priva di
    // imputazione di riga sparirebbe dal conto economico.
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accountId: 'conto-telefonia' }) })
    )
  })

  it('segna il movimento come verificato', async () => {
    await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    // Qui non c'è nulla di indovinato: un umano sta dichiarando un fatto.
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verified: true }) })
    )
  })

  it('riconcilia il movimento con la scadenza nella stessa transazione', async () => {
    const res = await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(riconciliaInTransazione).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ scheduleId: 'sc-1', journalEntryId: 'mov-1', venueId: 'venue-1' })
    )
    expect(res.status).toBe(200)
  })

  it('usa il residuo quando l\'importo non è indicato', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      id: 'sc-1', tipo: 'passiva', stato: 'parzialmente_pagata',
      importoTotale: new Prisma.Decimal(100), importoPagato: new Prisma.Decimal(30),
      descrizione: 'Fattura 1 - TIM', invoice: { accountId: 'c1', invoiceNumber: '123' },
    } as never)

    await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditAmount: new Prisma.Decimal('70.00') }) })
    )
  })

  it('rifiuta una scadenza già chiusa senza creare nulla', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      id: 'sc-1', tipo: 'passiva', stato: 'pagata',
      importoTotale: new Prisma.Decimal(100), importoPagato: new Prisma.Decimal(100),
      descrizione: 'x', invoice: { accountId: 'c1', invoiceNumber: '123' },
    } as never)

    const res = await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(res.status).toBe(409)
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
  })

  it('rifiuta una scadenza di un\'altra sede', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null as never)

    const res = await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(res.status).toBe(404)
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
  })

  it('nega l\'accesso a un dipendente', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u', role: 'employee' } } as never)

    const res = await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Eseguirlo e vederlo fallire**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run "src/app/api/scadenzario/[id]/paga-in-contanti"`
Expected: FAIL — il modulo `../route` non esiste.

- [ ] **Step 3: Scrivere la rotta**

Creare `src/app/api/scadenzario/[id]/paga-in-contanti/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { toDebitCredit } from '@/lib/prima-nota-utils'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'
import { riconciliaInTransazione } from '@/lib/services/schedule-reconciliation-service'

/**
 * Paga una scadenza in contanti.
 *
 * Per la cassa non esiste un flusso da importare: il movimento lo deve creare
 * qualcuno. Questa rotta lo crea — vero, alla data in cui il denaro è uscito —
 * e lo riconcilia con la scadenza nello stesso atto, passando dal motore che
 * usa anche la banca. Non è una seconda porta d'ingresso in prima nota: è la
 * stessa porta, con una maniglia più comoda.
 *
 * Spec: docs/superpowers/specs/2026-08-15-fatture-non-generano-movimenti-design.md
 */
const corpoSchema = z.object({
  dataPagamento: z.coerce.date(),
  /** Quota da pagare: se assente si salda il residuo della scadenza. */
  importo: z.number().positive('L\'importo deve essere positivo').optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const venueId = await getVenueId()
    const { dataPagamento, importo } = corpoSchema.parse(await request.json())

    const schedule = await prisma.schedule.findFirst({
      where: { id, venueId },
      select: {
        id: true,
        tipo: true,
        stato: true,
        importoTotale: true,
        importoPagato: true,
        descrizione: true,
        invoice: { select: { accountId: true, invoiceNumber: true } },
      },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    if (schedule.stato === 'pagata' || schedule.stato === 'annullata') {
      return NextResponse.json(
        { error: `La scadenza è ${schedule.stato}: non può essere pagata` },
        { status: 409 }
      )
    }

    const residuo = Number(schedule.importoTotale) - Number(schedule.importoPagato)
    const quota = importo ?? residuo

    if (quota <= 0) {
      return NextResponse.json(
        { error: 'La scadenza non ha residuo da pagare' },
        { status: 400 }
      )
    }

    // Il centro si valuta sul conto ECONOMICO della fattura: è il costo a dover
    // essere imputato a un centro, non la cassa da cui esce il denaro.
    const centro = await risolviCentroDiCosto(
      prisma,
      { accountId: schedule.invoice?.accountId ?? null },
      'interattivo'
    )
    if (centro.outcome === 'invalid') {
      return NextResponse.json({ error: centro.motivo, code: centro.code }, { status: 400 })
    }

    // Una scadenza passiva è denaro che esce, una attiva denaro che entra. Il
    // verso non si scrive a mano: lo decide l'unico posto in cui vive la
    // convenzione dare/avere del progetto.
    const { debitAmount, creditAmount } = toDebitCredit(
      'CASH',
      schedule.tipo === 'passiva' ? 'USCITA' : 'ENTRATA',
      new Prisma.Decimal(quota.toFixed(2))
    )

    const esito = await prisma.$transaction(async (tx) => {
      const movimento = await tx.journalEntry.create({
        data: {
          venueId,
          date: dataPagamento,
          registerType: 'CASH',
          description: `Pagamento in contanti: ${schedule.descrizione}`,
          documentRef: schedule.invoice?.invoiceNumber ?? null,
          debitAmount,
          creditAmount,
          // Testata di ripiego: quando la riconciliazione eredita le fette
          // dalla fattura questo conto viene ignorato dal conto economico, ma
          // senza fette è l'unica fonte, e il costo sparirebbe dai report.
          accountId: schedule.invoice?.accountId ?? null,
          costCenterId: centro.costCenterId,
          costCenterSource: centro.origine,
          // Nessuna supposizione: un umano sta dichiarando di aver pagato.
          verified: true,
          createdById: session.user.id,
        },
      })

      const riconciliazione = await riconciliaInTransazione(tx, {
        scheduleId: id,
        journalEntryId: movimento.id,
        venueId,
        userId: session.user.id,
        amount: quota,
        source: 'MANUAL',
      })

      // Se la riconciliazione non riesce l'eccezione fa cadere anche la
      // creazione del movimento: non deve restare cassa uscita senza motivo.
      if (riconciliazione.outcome !== 'ok') {
        throw new ErroreRiconciliazione(riconciliazione)
      }

      return { movimento, riconciliazione }
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'ScheduleReconciliation',
      entityId: esito.riconciliazione.reconciliationId,
      venueId,
      newValues: {
        scheduleId: id,
        journalEntryId: esito.movimento.id,
        registro: 'CASH',
        quota,
      },
    })

    return NextResponse.json({
      journalEntryId: esito.movimento.id,
      reconciliationId: esito.riconciliazione.reconciliationId,
      quota: esito.riconciliazione.quota,
      stato: esito.riconciliazione.stato,
      message: 'Pagamento in contanti registrato',
    })
  } catch (error) {
    if (error instanceof ErroreRiconciliazione) {
      return NextResponse.json({ error: error.messaggio }, { status: error.stato })
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/scadenzario/[id]/paga-in-contanti', error)
    return NextResponse.json(
      { error: 'Errore nella registrazione del pagamento' },
      { status: 500 }
    )
  }
}

/**
 * Porta fuori dalla transazione l'esito negativo della riconciliazione,
 * facendola cadere per intero: senza eccezione il movimento resterebbe scritto
 * e la cassa si muoverebbe senza che nulla risulti pagato.
 */
class ErroreRiconciliazione extends Error {
  readonly stato: number
  readonly messaggio: string

  constructor(esito: { outcome: string; motivo?: string }) {
    super(esito.outcome)
    this.name = 'ErroreRiconciliazione'
    this.messaggio = esito.motivo ?? 'Il movimento non è stato riconciliato con la scadenza'
    this.stato = esito.outcome === 'amount_exceeds_capacity' ? 422 : 409
  }
}
```

- [ ] **Step 4: Eseguire il test e vederlo passare**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run "src/app/api/scadenzario/[id]/paga-in-contanti"`
Expected: PASS (8 test).

- [ ] **Step 5: Il test d'integrazione, su database vero**

Creare `src/app/api/scadenzario/[id]/paga-in-contanti/__tests__/paga-in-contanti.itest.ts` seguendo il modello di `src/lib/scadenzario/__tests__/riconciliazione.itest.ts` (leggerlo prima: mostra come si prepara sede, conto, fornitore, fattura e scadenza). Il test deve verificare, dopo una chiamata alla rotta:

1. esiste un `JournalEntry` con `registerType: 'CASH'`, `date` uguale alla data indicata e `creditAmount` uguale all'importo;
2. la `Schedule` ha `stato: 'pagata'` e `importoPagato` uguale all'importo;
3. la `ElectronicInvoice` ha `status: 'PAID'`;
4. esiste una `ScheduleReconciliation` che lega i due, con il suo `SchedulePayment`;
5. **il saldo cassa letto da `calcolaSaldi` si è mosso esattamente dell'importo**, e il saldo banca non si è mosso affatto.

- [ ] **Step 6: Eseguire i test d'integrazione**

Run: `TEST_DB_SUFFIX=pagacontanti PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:integration -- paga-in-contanti`
Expected: PASS. Il suffisso è obbligatorio: senza, due suite si ricreano il database a vicenda.

- [ ] **Step 7: Cricchetto e tipi**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" node scripts/check-route-auth.mjs --ratchet`
Expected: «pari alla baseline». Se sale, convertire la rotta a `withAuth` seguendo una rotta sorella già convertita.

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit && PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test`

- [ ] **Step 8: Commit**

```bash
git add "src/app/api/scadenzario/[id]/paga-in-contanti"
git commit -m "feat(scadenzario): pagare una scadenza in contanti crea il movimento e lo riconcilia"
```

---

## Task 6: Il dialogo «Segna come pagata»

**Files:**
- Create: `src/components/invoices/SegnaComePagataDialog.tsx`
- Create: `src/components/invoices/__tests__/SegnaComePagataDialog.test.tsx`
- Modify: `src/components/invoices/InvoiceDetail.tsx` (dove stava il bottone eliminato al Task 1)

**Interfaces:**
- Consumes: `POST /api/scadenzario/[id]/paga-in-contanti` dal Task 5; `GET|POST /api/scadenzario/[id]/riconciliazioni` già esistenti.
- Produces: `<SegnaComePagataDialog invoiceId schedules open onOpenChange />`.

- [ ] **Step 1: Scrivere il test del componente**

Creare `src/components/invoices/__tests__/SegnaComePagataDialog.test.tsx`. Usare `fireEvent`, **non** `@testing-library/user-event`: i componenti Radix usati qui (radio, checkbox, dialog) non fanno pointer capture, e `fireEvent` basta. Casi da coprire:

```tsx
it('con una sola rata aperta non chiede quale rata', () => { /* la scelta non è nel documento */ })
it('elenca i movimenti candidati restituiti dal server', () => { /* fetch mockata */ })
it('con «in contanti» chiede la data e propone oggi', () => { /* input date valorizzato */ })
it('propone il residuo come importo', () => { /* input importo = residuo */ })
it('chiama paga-in-contanti con data e importo scelti', () => { /* fetch asserita */ })
it('chiama riconciliazioni quando si sceglie un movimento esistente', () => { /* fetch asserita */ })
it('mostra l\'errore del server senza chiudersi', () => { /* 409 → messaggio visibile, dialog aperto */ })
```

- [ ] **Step 2: Eseguirlo e vederlo fallire**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/invoices/__tests__/SegnaComePagataDialog.test.tsx`
Expected: FAIL — il modulo non esiste.

- [ ] **Step 3: Scrivere il componente**

Creare `src/components/invoices/SegnaComePagataDialog.tsx`. Struttura:

1. **Scelta della rata.** Se `schedules` filtrate su stato aperto ha lunghezza 1, si usa quella e non si mostra nulla. Altrimenti un `RadioGroup` con descrizione, scadenza e residuo.
2. **Scelta della strada**, un `RadioGroup` con due voci:
   - *«Con un movimento già in prima nota»* → carica `GET /api/scadenzario/{scheduleId}/riconciliazioni` e mostra i candidati (descrizione, data, importo, motivazione del punteggio), più un campo di ricerca libera.
   - *«In contanti, movimento non ancora registrato»* → un campo data (predefinito: oggi, in fuso Roma via `src/lib/timezone.ts`) e un campo importo (predefinito: il residuo).
3. **Conferma** che chiama la rotta corrispondente e, in caso di successo, invalida `['invoice', invoiceId]` e `['invoices']`, mostra un toast e chiude.

Usare `Dialog` di shadcn con `sm:max-w-2xl` — **non** `max-w-2xl`: `tailwind-merge` non fonde classi con breakpoint diversi e la larghezza base `sm:max-w-lg` vincerebbe. Dare `min-w-0` al contenitore che ospita l'elenco dei candidati, altrimenti un figlio di grid non scende sotto la larghezza del proprio contenuto e la finestra scrolla in orizzontale.

- [ ] **Step 4: Agganciarlo alla scheda fattura**

In `src/components/invoices/InvoiceDetail.tsx`, dove stava il bottone eliminato, mettere:

```tsx
{scadenzeAperte.length > 0 && (
  <Button onClick={() => setSegnaPagataOpen(true)}>
    <Wallet className="mr-2 h-4 w-4" />
    Segna come pagata
  </Button>
)}
```

dove `scadenzeAperte` filtra `invoice.schedules` sugli stati diversi da `pagata` e `annullata`. Il bottone non compare quando non ci sono scadenze aperte — nota di credito, documento di rettifica, o fattura già saldata — perché lì non c'è nulla da saldare.

- [ ] **Step 5: Eseguire i test e vederli passare**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/invoices/`
Expected: verde.

- [ ] **Step 6: Provarlo davvero nel browser**

Avviare il server su una porta libera con un database locale, non la produzione:

```bash
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_dev_pagata" \
  PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run dev -- --port 3022
```

Aprire una fattura con una scadenza aperta, usare entrambe le strade, e verificare con gli occhi che: il dialogo si veda per intero senza scorrere, i bottoni siano raggiungibili, e il tema scuro non produca testo invisibile.

- [ ] **Step 7: Commit**

```bash
git add src/components/invoices/SegnaComePagataDialog.tsx src/components/invoices/__tests__/SegnaComePagataDialog.test.tsx src/components/invoices/InvoiceDetail.tsx
git commit -m "feat(fatture): «Segna come pagata» associa la fattura a un movimento vero"
```

---

## Task 7: L'invariante, e la verifica finale

**Files:**
- Create: `src/lib/__tests__/invariante-saldi-fatture.itest.ts`

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces: niente che altri task usino.

- [ ] **Step 1: Scrivere il test dell'invariante**

Creare `src/lib/__tests__/invariante-saldi-fatture.itest.ts`, seguendo il modello di preparazione dati di `src/lib/scadenzario/__tests__/riconciliazione.itest.ts`:

I nomi veri sono `saldiAlGiorno(venueId, giorno)` da `src/lib/saldi.ts:178`, e dalle fixture `creaFattura`, `creaScadenza`, `fornitoreDiTest` (`src/test/integration/fixtures/scadenzario.ts:41-189`).

```ts
describe('un documento fiscale non genera denaro', () => {
  it('importare e categorizzare una fattura non muove né banca né cassa', async () => {
    const prima = await saldiAlGiorno(venueId, '2026-12-31')

    const fornitore = await fornitoreDiTest()
    const fattura = await creaFattura({
      supplierId: fornitore.id,
      accountId: contoAcquisti.id,
      totalAmount: 1200,
      status: 'CATEGORIZED',
    })
    await creaScadenza({ invoiceId: fattura.id, importoTotale: 1200, tipo: 'passiva' })

    const dopo = await saldiAlGiorno(venueId, '2026-12-31')

    // È il test che, se fosse esistito, avrebbe impedito i 92,60 € di TIM
    // comparsi in banca senza che la banca si muovesse.
    expect(dopo.bankBalance).toBe(prima.bankBalance)
    expect(dopo.cashBalance).toBe(prima.cashBalance)
  })

  it('annullare una riconciliazione non cancella il movimento', async () => {
    // Decisione 5 della spec. Oggi è già il comportamento: questo test lo
    // rende una regola invece che una coincidenza. Il movimento dice «di
    // cassa ne è uscita, quel giorno», e il fatto non dipende da quale
    // documento salda.
    const { scheduleId, journalEntryId } = await scadenzaPagataInContanti()

    await rejectScheduleMatch({ scheduleId, journalEntryId, venueId, userId, amount: 100 })

    const movimento = await prisma.journalEntry.findUnique({ where: { id: journalEntryId } })
    expect(movimento).not.toBeNull()
    expect(movimento?.deletedAt).toBeNull()
  })
})
```

Verificare le firme esatte delle fixture prima di scrivere: se `creaFattura` non accetta `accountId`, aggiungerlo alla fixture invece di aggirarlo con una `update` nel test.

- [ ] **Step 2: Eseguirlo**

Run: `TEST_DB_SUFFIX=invariante PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:integration -- invariante-saldi`
Expected: PASS. **Questo test è verde anche prima del lavoro**, perché il solo import non creava movimenti: è un guardiano del futuro, non una prova del cambiamento. La prova del cambiamento è il test del Task 1, che è stato visto rosso.

- [ ] **Step 3: La suite intera**

```bash
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:run
TEST_DB_SUFFIX=finale PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:integration
```
Expected: tutto verde.

- [ ] **Step 4: I gate della CI, tutti**

```bash
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run lint
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:e2e
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" node scripts/check-route-auth.mjs --ratchet
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run knip
```
Expected: lint 0 errori, cricchetto pari alla baseline, knip senza export nuovi inutilizzati.

- [ ] **Step 5: Le due build, che hanno severità diverse**

```bash
DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder' NEXTAUTH_URL='http://localhost:3000' NEXTAUTH_SECRET='placeholder' AUTH_SECRET='placeholder' PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx next build --webpack
DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder' NEXTAUTH_URL='http://localhost:3000' NEXTAUTH_SECRET='placeholder' AUTH_SECRET='placeholder' PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run build
```

Entrambe: webpack rifiuta export estranei da un `route.ts` che Turbopack lascia passare, e la produzione gira su Turbopack. Mai incanalare l'output in `tail`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/__tests__/invariante-saldi-fatture.itest.ts
git commit -m "test(saldi): una fattura importata non muove i saldi"
```

---

## Dopo il piano

Il deploy porta con sé una migrazione che **cancella due colonne**: è irreversibile. Prima del merge in `main`:

1. fare un backup del database di produzione (vedi `[[backup-database-supabase]]`: serve il client libpq 18);
2. verificare con `railway logs -d` che `prisma migrate deploy` abbia applicato `20260815120000_via_stato_registrata` senza errori;
3. controllare in produzione che la fattura TIM sia tornata `CATEGORIZED` e che si riesca a cancellarla.
