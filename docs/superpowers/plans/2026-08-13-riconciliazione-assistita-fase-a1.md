# Riconciliazione assistita — Fase A1: il motore propone

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generare lotti di proposte di abbinamento fra righe di estratto conto e scadenze, con un punteggio 0-100 scomposto in sei fattori e motivato in italiano, e misurarne la qualità sui 678 movimenti bancari veri.

**Architecture:** Il calcolo vive in funzioni pure senza database (`src/lib/reconciliation/`), esattamente come `schedule-matcher.ts`: è ciò che permette di esercitarlo sui movimenti veri e di scriverne i test sulle causali autentiche. Un service (`src/lib/services/reconciliation-batch-service.ts`) legge il database, chiama le funzioni pure e persiste il lotto. Le rotte espongono generazione e lettura. Nessuna approvazione e nessuna schermata: sono la Fase A2.

**Tech Stack:** Next.js App Router, Prisma + PostgreSQL, Zod, Vitest (unit + integration), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-08-13-riconciliazione-assistita-design.md`

> **Questa fase non aspetta la Fase 3 dell'open banking.** La spec la mette come
> prerequisito perché senza movimenti sincronizzati la *schermata* non ha nulla
> da mostrare — ma A1 non ha schermata: i test di integrazione seminano i propri
> movimenti, e la misurazione del Task 9 legge gli snapshot da file. Le due cose
> possono procedere in parallelo, e A2 troverà entrambe pronte.

## Global Constraints

- **Ramo**: aprire da `origin/main`. Il ramo `conti/cash-flow-prospetto` è indietro di 142 commit e non ha i tre campi nuovi di `BankTransaction` (`bankAccountId`, `providerTransactionId`, `bankTransactionCode`) su cui questo piano si appoggia.
- **Node**: anteporre `nvm use 22` a ogni comando `npm`. Il Node di sistema è incompatibile.
- **Lingua delle rotte**: italiano. `/api/riconciliazione-assistita/...`. Non creare la variante inglese di una rotta che esiste in italiano.
- **Autorizzazione**: ogni rotta usa `withAuth` da `@/lib/api-utils` con `{ roles: ['admin', 'manager'], venueScoped: true }`. Usare `withAuth` e non `auth()` diretto: lo script `scripts/check-route-auth.mjs --ratchet` conta gli handler che non lo usano, e la baseline è già sforata.
- **Importi**: sempre `Decimal` in Prisma, mai `Float`.
- **Sede**: sempre `venueId` dal contesto di `withAuth`, mai `venue.findFirst()`.
- **Migrazioni**: file SQL esplicito sotto `prisma/migrations/<timestamp>_<nome>/migration.sql`. **Mai `prisma db push` verso il database indicato da `.env`, che è la produzione.** In locale usare `npm run db:migrate`.
- **RLS**: `prisma migrate deploy` non sa nulla di RLS, e ogni tabella nuova nasce scoperta. Dopo la migrazione va eseguito `npm run rls:enable` (lo fa già `db:migrate:deploy`), e `npm run rls:check` deve tornare pulito.
- **Build**: `npm run build` va **eseguita** e mai con `| tail` — l'exit code diventerebbe quello di `tail`. È l'unico controllo che vede un import da client verso Prisma.
- **Tolleranza sugli importi**: 0,01 €. Costante unica, non ripetuta.
- **Soglie del punteggio**: Alta ≥ 85, Media ≥ 60, Bassa ≥ 40, sotto 40 non si propone. In **una costante sola**, perché la spec la dichiara da rivedere dopo la misurazione del Task 9.

---

### Task 1: Lo schema e la migrazione

Cinque tabelle nuove. Nessun ponte fra banca e fattura: la catena
`BankTransaction → JournalEntry → ScheduleReconciliation → Schedule` esiste già.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260814090000_riconciliazione_assistita/migration.sql`
- Test: `src/lib/reconciliation/__tests__/schema-riconciliazione.itest.ts`

**Interfaces:**
- Consumes: modelli esistenti `Venue`, `User`, `BankTransaction`, `JournalEntry`, `Schedule`, `Supplier`, `Customer`
- Produces: modelli Prisma `ReconciliationBatch`, `ReconciliationProposal`, `ReconciliationProposalLeg`, `CounterpartyAlias`, `ReconciliationExclusion`

- [ ] **Step 1: Scrivi il test di integrazione che fallisce**

Crea `src/lib/reconciliation/__tests__/schema-riconciliazione.itest.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'

/**
 * Le tabelle del lotto esistono e i vincoli mordono.
 *
 * L'unicità su (venueId, testoNormalizzato) degli alias è quella che impedisce
 * alla memoria delle controparti di contenere due risposte diverse alla stessa
 * domanda. Prisma non sa rappresentare gli indici parziali ma questo è totale,
 * quindi vive nello schema.
 */
setupIntegrationDb()

describe('schema della riconciliazione assistita', () => {
  it('crea un lotto con una proposta e una gamba', async () => {
    const venue = await venueDiTest()

    const lotto = await prisma.reconciliationBatch.create({
      data: {
        venueId: venue.id,
        dateFrom: new Date('2026-05-01'),
        dateTo: new Date('2026-08-31'),
        regoleUsate: ['R1', 'R2'],
        sogliaMinima: 40,
      },
    })

    expect(lotto.stato).toBe('in_corso')
    expect(lotto.contaProposte).toBe(0)
    expect(lotto.regoleUsate).toEqual(['R1', 'R2'])
  })

  it('rifiuta due alias con lo stesso testo nella stessa sede', async () => {
    const venue = await venueDiTest()

    await prisma.counterpartyAlias.create({
      data: {
        venueId: venue.id,
        testoNormalizzato: 'ROMA GIANFRANCO SRL',
        origine: 'manuale',
      },
    })

    await expect(
      prisma.counterpartyAlias.create({
        data: {
          venueId: venue.id,
          testoNormalizzato: 'ROMA GIANFRANCO SRL',
          origine: 'ai',
        },
      })
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `nvm use 22 && npm run test:integration -- schema-riconciliazione`
Expected: FAIL — `prisma.reconciliationBatch` non esiste sul client.

- [ ] **Step 3: Aggiungi i modelli allo schema**

In `prisma/schema.prisma`, dopo `model BankTransaction`:

```prisma
/// Un'esecuzione dell'analisi di riconciliazione assistita su un periodo.
/// Le proposte si conservano — servono lo storico, il "Riprendi" e il referto
/// dell'AI — ma alla rilettura ognuna viene ricontrollata per freschezza.
model ReconciliationBatch {
  id            String   @id @default(cuid())
  venueId       String   @map("venue_id")
  dateFrom      DateTime @map("date_from") @db.Date
  dateTo        DateTime @map("date_to") @db.Date
  /// Le sigle usate in questa esecuzione: ["R1","R2","R3","R4","R5"]
  regoleUsate   String[] @map("regole_usate")
  /// Sotto questo punteggio non si emettono proposte
  sogliaMinima  Int      @default(40) @map("soglia_minima")
  stato         String   @default("in_corso")
  contaProposte Int      @default(0) @map("conta_proposte")
  contaApprovate Int     @default(0) @map("conta_approvate")
  contaScartate Int      @default(0) @map("conta_scartate")
  contaSuperate Int      @default(0) @map("conta_superate")
  /// Quando l'AI ha riletto il lotto. Null = mai.
  aiRefertoAt   DateTime? @map("ai_referto_at")
  aiReferto     Json?     @map("ai_referto")
  createdById   String?   @map("created_by")
  createdAt     DateTime  @default(now()) @map("created_at")

  venue     Venue                    @relation(fields: [venueId], references: [id])
  createdBy User?                    @relation("ReconciliationBatchCreatedBy", fields: [createdById], references: [id])
  proposte  ReconciliationProposal[]

  @@index([venueId, createdAt])
  @@map("reconciliation_batches")
}

/// Una proposta di abbinamento. Il punteggio è la somma dei sei fattori, che
/// restano separati perché la barra segmentata e le motivazioni li mostrano.
model ReconciliationProposal {
  id         String @id @default(cuid())
  batchId    String @map("batch_id")
  /// R1..R8, vedi la spec
  regola     String
  punteggio  Int
  /// { importo, riferimento, controparte, data, codiceBanca, unicita }
  fattori    Json
  /// [{ testo, segno }] — segno è "+" o "-"
  motivazioni Json
  stato      String @default("in_attesa")
  /// Quale approvazione ha superato questa proposta
  supersededByProposalId String? @map("superseded_by_proposal_id")
  /// Il movimento a sinistra. Null solo per R6 (nota di credito ↔ fattura).
  bankTransactionId String? @map("bank_transaction_id")
  /// Usato dalla R4, dove il movimento contabile esiste già e non c'è documento
  journalEntryId    String? @map("journal_entry_id")
  decisoDaId String?   @map("deciso_da")
  decisoAt   DateTime? @map("deciso_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  batch           ReconciliationBatch         @relation(fields: [batchId], references: [id], onDelete: Cascade)
  bankTransaction BankTransaction?            @relation(fields: [bankTransactionId], references: [id])
  journalEntry    JournalEntry?               @relation(fields: [journalEntryId], references: [id])
  decisoDa        User?                       @relation("ReconciliationProposalDecisoDa", fields: [decisoDaId], references: [id])
  gambe           ReconciliationProposalLeg[]

  @@index([batchId, stato])
  @@index([bankTransactionId])
  @@map("reconciliation_proposals")
}

/// Il lato destro di una proposta. Più righe = pagamento cumulativo; una riga
/// con importo minore del residuo = acconto.
model ReconciliationProposalLeg {
  id         String  @id @default(cuid())
  proposalId String  @map("proposal_id")
  /// La scadenza saldata. Alternativo a peerBankTransactionId.
  scheduleId String? @map("schedule_id")
  /// L'altra riga bancaria, per i giroconti (R5)
  peerBankTransactionId String? @map("peer_bank_transaction_id")
  /// Quota imputata a questa gamba
  importo    Decimal @db.Decimal(10, 2)

  proposal ReconciliationProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  schedule Schedule?              @relation(fields: [scheduleId], references: [id])
  peer     BankTransaction?       @relation("ProposalLegPeer", fields: [peerBankTransactionId], references: [id])

  @@index([proposalId])
  @@index([scheduleId])
  @@map("reconciliation_proposal_legs")
}

/// La memoria delle controparti: "nella causale compare X → è il fornitore Y".
/// Risolve il buco lasciato da GoCardless, che non manda il beneficiario.
/// Si consulta prima del punteggio e si riempie dalle correzioni manuali.
model CounterpartyAlias {
  id                String   @id @default(cuid())
  venueId           String   @map("venue_id")
  /// Maiuscolo, senza punteggiatura, spazi normalizzati
  testoNormalizzato String   @map("testo_normalizzato")
  supplierId        String?  @map("supplier_id")
  customerId        String?  @map("customer_id")
  /// 'manuale' | 'ai' | 'import'
  origine           String
  confermeConta     Int      @default(1) @map("conferme_conta")
  ultimaConferma    DateTime @default(now()) @map("ultima_conferma")
  createdById       String?  @map("created_by")
  createdAt         DateTime @default(now()) @map("created_at")

  venue    Venue     @relation(fields: [venueId], references: [id])
  supplier Supplier? @relation("CounterpartyAliasSupplier", fields: [supplierId], references: [id])
  customer Customer? @relation("CounterpartyAliasCustomer", fields: [customerId], references: [id])

  @@unique([venueId, testoNormalizzato])
  @@index([venueId, supplierId])
  @@map("counterparty_aliases")
}

/// Coppie scartate per sempre. Consultate PRIMA di generare: senza questa
/// tabella ogni rilancio ripropone gli stessi falsi positivi, e il motore
/// diventa più caro a ogni giro invece che meno.
model ReconciliationExclusion {
  id                String   @id @default(cuid())
  venueId           String   @map("venue_id")
  bankTransactionId String?  @map("bank_transaction_id")
  scheduleId        String?  @map("schedule_id")
  motivo            String?
  createdById       String?  @map("created_by")
  createdAt         DateTime @default(now()) @map("created_at")

  venue           Venue            @relation(fields: [venueId], references: [id])
  bankTransaction BankTransaction? @relation("ExclusionBankTransaction", fields: [bankTransactionId], references: [id])
  schedule        Schedule?        @relation("ExclusionSchedule", fields: [scheduleId], references: [id])

  @@index([venueId, bankTransactionId])
  @@map("reconciliation_exclusions")
}
```

Aggiungi le relazioni inverse ai modelli esistenti:

```prisma
// dentro model Venue
  reconciliationBatches   ReconciliationBatch[]
  counterpartyAliases     CounterpartyAlias[]
  reconciliationExclusions ReconciliationExclusion[]

// dentro model User
  reconciliationBatchesCreated ReconciliationBatch[]    @relation("ReconciliationBatchCreatedBy")
  reconciliationProposalsDecise ReconciliationProposal[] @relation("ReconciliationProposalDecisoDa")

// dentro model BankTransaction
  reconciliationProposals ReconciliationProposal[]
  proposalLegsAsPeer      ReconciliationProposalLeg[] @relation("ProposalLegPeer")
  reconciliationExclusions ReconciliationExclusion[]  @relation("ExclusionBankTransaction")

// dentro model JournalEntry
  reconciliationProposals ReconciliationProposal[]

// dentro model Schedule
  proposalLegs            ReconciliationProposalLeg[]
  reconciliationExclusions ReconciliationExclusion[]  @relation("ExclusionSchedule")

// dentro model Supplier
  counterpartyAliases CounterpartyAlias[] @relation("CounterpartyAliasSupplier")

// dentro model Customer
  counterpartyAliases CounterpartyAlias[] @relation("CounterpartyAliasCustomer")
```

- [ ] **Step 4: Scrivi la migrazione SQL**

Crea `prisma/migrations/20260814090000_riconciliazione_assistita/migration.sql`:

```sql
-- Riconciliazione assistita, Fase A1: i lotti di proposte e la memoria delle
-- controparti.
-- Spec: docs/superpowers/specs/2026-08-13-riconciliazione-assistita-design.md

CREATE TABLE "reconciliation_batches" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "regole_usate" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "soglia_minima" INTEGER NOT NULL DEFAULT 40,
    "stato" TEXT NOT NULL DEFAULT 'in_corso',
    "conta_proposte" INTEGER NOT NULL DEFAULT 0,
    "conta_approvate" INTEGER NOT NULL DEFAULT 0,
    "conta_scartate" INTEGER NOT NULL DEFAULT 0,
    "conta_superate" INTEGER NOT NULL DEFAULT 0,
    "ai_referto_at" TIMESTAMP(3),
    "ai_referto" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reconciliation_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reconciliation_proposals" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "regola" TEXT NOT NULL,
    "punteggio" INTEGER NOT NULL,
    "fattori" JSONB NOT NULL,
    "motivazioni" JSONB NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'in_attesa',
    "superseded_by_proposal_id" TEXT,
    "bank_transaction_id" TEXT,
    "journal_entry_id" TEXT,
    "deciso_da" TEXT,
    "deciso_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reconciliation_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reconciliation_proposal_legs" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "schedule_id" TEXT,
    "peer_bank_transaction_id" TEXT,
    "importo" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "reconciliation_proposal_legs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "counterparty_aliases" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "testo_normalizzato" TEXT NOT NULL,
    "supplier_id" TEXT,
    "customer_id" TEXT,
    "origine" TEXT NOT NULL,
    "conferme_conta" INTEGER NOT NULL DEFAULT 1,
    "ultima_conferma" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "counterparty_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reconciliation_exclusions" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "bank_transaction_id" TEXT,
    "schedule_id" TEXT,
    "motivo" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reconciliation_exclusions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reconciliation_batches_venue_id_created_at_idx" ON "reconciliation_batches"("venue_id", "created_at");
CREATE INDEX "reconciliation_proposals_batch_id_stato_idx" ON "reconciliation_proposals"("batch_id", "stato");
CREATE INDEX "reconciliation_proposals_bank_transaction_id_idx" ON "reconciliation_proposals"("bank_transaction_id");
CREATE INDEX "reconciliation_proposal_legs_proposal_id_idx" ON "reconciliation_proposal_legs"("proposal_id");
CREATE INDEX "reconciliation_proposal_legs_schedule_id_idx" ON "reconciliation_proposal_legs"("schedule_id");
CREATE UNIQUE INDEX "counterparty_aliases_venue_id_testo_normalizzato_key" ON "counterparty_aliases"("venue_id", "testo_normalizzato");
CREATE INDEX "counterparty_aliases_venue_id_supplier_id_idx" ON "counterparty_aliases"("venue_id", "supplier_id");
CREATE INDEX "reconciliation_exclusions_venue_id_bank_transaction_id_idx" ON "reconciliation_exclusions"("venue_id", "bank_transaction_id");

ALTER TABLE "reconciliation_batches" ADD CONSTRAINT "reconciliation_batches_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliation_batches" ADD CONSTRAINT "reconciliation_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposals" ADD CONSTRAINT "reconciliation_proposals_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "reconciliation_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposals" ADD CONSTRAINT "reconciliation_proposals_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposals" ADD CONSTRAINT "reconciliation_proposals_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposals" ADD CONSTRAINT "reconciliation_proposals_deciso_da_fkey" FOREIGN KEY ("deciso_da") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposal_legs" ADD CONSTRAINT "reconciliation_proposal_legs_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "reconciliation_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposal_legs" ADD CONSTRAINT "reconciliation_proposal_legs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposal_legs" ADD CONSTRAINT "reconciliation_proposal_legs_peer_fkey" FOREIGN KEY ("peer_bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "counterparty_aliases" ADD CONSTRAINT "counterparty_aliases_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "counterparty_aliases" ADD CONSTRAINT "counterparty_aliases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "counterparty_aliases" ADD CONSTRAINT "counterparty_aliases_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_exclusions" ADD CONSTRAINT "reconciliation_exclusions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliation_exclusions" ADD CONSTRAINT "reconciliation_exclusions_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reconciliation_exclusions" ADD CONSTRAINT "reconciliation_exclusions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

> Verifica i nomi delle tabelle referenziate (`venues`, `users`, `bank_transactions`, `journal_entries`, `schedules`, `suppliers`, `customers`) contro `@@map` nello schema prima di eseguire: un nome sbagliato fallisce all'applicazione della migrazione, non a `prisma generate`.

- [ ] **Step 5: Applica la migrazione e rigenera il client**

Run: `nvm use 22 && npm run db:migrate -- --name riconciliazione_assistita`
Expected: la migrazione si applica sul database locale (il guard `assert-not-prod` deve passare — se blocca, `DATABASE_URL` punta alla produzione e va corretto prima).

- [ ] **Step 6: Esegui il test e verifica che passi**

Run: `nvm use 22 && npm run test:integration -- schema-riconciliazione`
Expected: PASS, 2 test.

- [ ] **Step 7: Verifica la RLS**

Run: `nvm use 22 && npm run rls:enable && npm run rls:check`
Expected: nessuna tabella scoperta. Le cinque nuove devono comparire fra quelle protette.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260814090000_riconciliazione_assistita src/lib/reconciliation/__tests__/schema-riconciliazione.itest.ts
git commit -m "feat(riconciliazione): lo schema dei lotti di proposte e la memoria delle controparti"
```

---

### Task 2: Leggere la causale — normalizzazione ed estrazione

GoCardless non manda la controparte: il campo strutturato è vuoto sul 100% dei
movimenti. Tutto quello che sappiamo di un movimento sta dentro una stringa come
questa, che è autentica e va usata come caso di test:

```
*INSTANT DEL 07/07/2026 ORE 12:19 ID. 07084000412224084864990649901T BEN ROMA
GIANFRANCO SRLFT 4320 Info aggiuntive: Codice Riferimento Operazione: ...
Nominativo beneficiario: ROMA GIANFRANCO SRL Codice causale: 26 ... Causale: FT 4320
```

Il numero fattura e il nome del fornitore ci sono entrambi, e in un caso sono
appiccicati (`SRLFT 4320`): un `\b` prima di `FT` non li separerebbe.

**Files:**
- Create: `src/lib/reconciliation/causale.ts`
- Test: `src/lib/reconciliation/__tests__/causale.test.ts`

**Interfaces:**
- Consumes: niente
- Produces:
  - `normalizzaTesto(testo: string): string`
  - `contieneRiferimento(causale: string, numeroDocumento: string): boolean`
  - `estraiRiferimentiDocumento(causale: string): string[]`
  - `estraiPartiteIva(causale: string): string[]`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/lib/reconciliation/__tests__/causale.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  normalizzaTesto,
  contieneRiferimento,
  estraiRiferimentiDocumento,
  estraiPartiteIva,
} from '../causale'

/**
 * I casi vengono da causali autentiche di Banca Della Marca, scaricate nella
 * Fase 0 dell'open banking. Non inventare stringhe: la forma di queste causali
 * è l'unica cosa che il motore ha da leggere, perché il campo controparte
 * arriva vuoto.
 */
const CAUSALE_INSTANT =
  '*INSTANT DEL 07/07/2026 ORE 12:19 ID. 07084000412224084864990649901T BEN ROMA ' +
  'GIANFRANCO SRLFT 4320 Info aggiuntive: Codice Riferimento Operazione: ' +
  '07084000412224084864990649901T Iban beneficiario: IT78S07084612000000000900667 ' +
  'Nominativo beneficiario: ROMA GIANFRANCO SRL Codice causale: 26 ' +
  'Data contabile: 07/07/2026 Causale: FT 4320 Esito: Eseguita Importo: -846.95 ' +
  'Codice Fiscale/Partita Iva ordinante: 01723900930'

describe('normalizzaTesto', () => {
  it('porta a maiuscolo, toglie la punteggiatura e comprime gli spazi', () => {
    expect(normalizzaTesto('  Roma  Gianfranco S.r.l. ')).toBe('ROMA GIANFRANCO SRL')
  })

  it('toglie gli accenti, perché le causali della banca li perdono già', () => {
    // Nelle causali osservate "Località" arriva come "Localit?"
    expect(normalizzaTesto('Società Cooperativa')).toBe('SOCIETA COOPERATIVA')
  })

  it('collassa le sigle societarie, che la banca scrive senza punti', () => {
    expect(normalizzaTesto('Bar S.p.A.')).toBe('BAR SPA')
    expect(normalizzaTesto('Alfa S.n.c.')).toBe('ALFA SNC')
  })

  it('ma gli altri segni separano le parole invece di sparire', () => {
    // Cancellare tutta la punteggiatura darebbe PAGAMENTOFATTURA, che non
    // troverebbe mai "Pagamento fattura" scritto nell'anagrafica
    expect(normalizzaTesto('PAGAMENTO-FATTURA')).toBe('PAGAMENTO FATTURA')
    expect(normalizzaTesto('ACME,SPA')).toBe('ACME SPA')
  })

  it('sulla stringa vuota torna la stringa vuota', () => {
    expect(normalizzaTesto('')).toBe('')
  })
})

describe('contieneRiferimento', () => {
  it('trova il numero fattura anche quando è appiccicato alla ragione sociale', () => {
    expect(contieneRiferimento(CAUSALE_INSTANT, '4320')).toBe(true)
  })

  it('trova un numero scritto con la barra ignorando la punteggiatura', () => {
    expect(contieneRiferimento('Pagamento fatt. 2026/123', '2026/123')).toBe(true)
  })

  it('rifiuta i riferimenti troppo corti, che troverebbero qualunque cosa', () => {
    // "12" comparirebbe dentro l'ID operazione di ogni bonifico
    expect(contieneRiferimento(CAUSALE_INSTANT, '12')).toBe(false)
  })

  it('non trova un numero che non c\'è', () => {
    expect(contieneRiferimento(CAUSALE_INSTANT, '9999')).toBe(false)
  })
})

describe('estraiRiferimentiDocumento', () => {
  it('estrae il numero preceduto da FT anche senza spazio prima', () => {
    expect(estraiRiferimentiDocumento(CAUSALE_INSTANT)).toContain('4320')
  })

  it('estrae il numero preceduto da FATTURA', () => {
    expect(estraiRiferimentiDocumento('Saldo FATTURA N. 2026/45')).toContain('2026/45')
  })

  it('non ripete lo stesso riferimento due volte', () => {
    // CAUSALE_INSTANT contiene "SRLFT 4320" e "Causale: FT 4320"
    const trovati = estraiRiferimentiDocumento(CAUSALE_INSTANT)
    expect(trovati.filter((r) => r === '4320')).toHaveLength(1)
  })
})

describe('estraiPartiteIva', () => {
  it('estrae la partita IVA dell\'ordinante', () => {
    expect(estraiPartiteIva(CAUSALE_INSTANT)).toContain('01723900930')
  })

  it('non scambia per partita IVA l\'ID operazione, che è più lungo', () => {
    expect(estraiPartiteIva(CAUSALE_INSTANT)).not.toContain('07084000412224084864990649901')
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `nvm use 22 && npm run test:run -- causale`
Expected: FAIL — il modulo `../causale` non esiste.

- [ ] **Step 3: Scrivi l'implementazione**

Crea `src/lib/reconciliation/causale.ts`:

```typescript
/**
 * Leggere una causale bancaria.
 *
 * Modulo puro: nessun accesso al database, nessun effetto. È qui perché tutto
 * ciò che il motore sa di un movimento arriva da una stringa — GoCardless
 * restituisce il campo controparte vuoto sul 100% dei movimenti osservati, e
 * l'unica fonte del nome e del numero fattura è il testo.
 *
 * La forma delle causali di Banca Della Marca è documentata negli snapshot in
 * `scripts/gocardless/snapshots/`: prima un blocco sintetico, poi "Info
 * aggiuntive" con coppie etichetta-valore. Il numero fattura compare due volte,
 * una appiccicato alla ragione sociale ("SRLFT 4320") e una dopo l'etichetta
 * "Causale:". La prima è il motivo per cui le espressioni regolari qui sotto
 * non usano `\b` prima di FT.
 */

/** Lunghezza minima di un riferimento perché cercarlo abbia senso. */
const LUNGHEZZA_MINIMA_RIFERIMENTO = 3

/**
 * Maiuscolo, senza accenti, senza punteggiatura, spazi singoli.
 *
 * Gli accenti si tolgono perché la banca li perde già per conto suo: nelle
 * causali osservate "Località" arriva come "Localit?", e confrontare una
 * ragione sociale accentata con la sua versione mutilata non funzionerebbe.
 *
 * **Il punto si cancella, il resto della punteggiatura diventa spazio.** Non è
 * un capriccio: in italiano il punto è il segno dell'abbreviazione societaria —
 * `S.r.l.`, `S.p.A.`, `S.n.c.` — e la banca scrive quelle sigle *senza* punti.
 * Se il punto diventasse spazio, `S.r.l.` darebbe `S R L` e non troverebbe mai
 * `SRL` nella causale. Gli altri segni invece separano parole (`PAGAMENTO-FATTURA`
 * deve dare due parole, non una), e cancellarli tutti creerebbe il difetto
 * opposto.
 */
export function normalizzaTesto(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Solo cifre e lettere, per confronti che ignorano barre, punti e spazi. */
function soloAlfanumerici(testo: string): string {
  return testo.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Il numero documento compare nella causale?
 *
 * Il confronto ignora la punteggiatura da entrambi i lati, così "2026/123"
 * trova "fatt. 2026 123". Sotto i tre caratteri non si cerca: un "12"
 * comparirebbe dentro l'identificativo operazione di qualunque bonifico, e
 * regalerebbe venti punti a ogni coppia.
 */
export function contieneRiferimento(causale: string, numeroDocumento: string): boolean {
  const ago = soloAlfanumerici(numeroDocumento)
  if (ago.length < LUNGHEZZA_MINIMA_RIFERIMENTO) return false
  return soloAlfanumerici(causale).includes(ago)
}

/**
 * I riferimenti a documento che la causale nomina esplicitamente.
 *
 * Serve a precompilare la ricerca manuale, non al punteggio — il punteggio usa
 * `contieneRiferimento`, che parte dal numero vero della scadenza e non deve
 * indovinare nulla.
 */
export function estraiRiferimentiDocumento(causale: string): string[] {
  // Niente \b prima di FT: nelle causali vere compare come "SRLFT 4320"
  const espressioni = [
    /FT\.?\s*(\d[\d/\-]{1,15})/gi,
    /FATT(?:URA)?\.?\s*N?\.?\s*(\d[\d/\-]{1,15})/gi,
    /N\.\s*DOC\.?\s*(\d[\d/\-]{1,15})/gi,
  ]

  const trovati = new Set<string>()
  for (const espressione of espressioni) {
    for (const occorrenza of causale.matchAll(espressione)) {
      const valore = occorrenza[1].replace(/[-/]+$/, '')
      if (soloAlfanumerici(valore).length >= LUNGHEZZA_MINIMA_RIFERIMENTO) {
        trovati.add(valore)
      }
    }
  }
  return [...trovati]
}

/**
 * Le partite IVA nominate nella causale.
 *
 * Undici cifre esatte, delimitate: senza il delimitatore si estrarrebbero
 * undici cifre qualunque dall'identificativo operazione, che ne ha ventinove.
 */
export function estraiPartiteIva(causale: string): string[] {
  const trovate = new Set<string>()
  for (const occorrenza of causale.matchAll(/(?<![0-9])(\d{11})(?![0-9])/g)) {
    trovate.add(occorrenza[1])
  }
  return [...trovate]
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `nvm use 22 && npm run test:run -- causale`
Expected: PASS, 12 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reconciliation/causale.ts src/lib/reconciliation/__tests__/causale.test.ts
git commit -m "feat(riconciliazione): leggere la controparte e il numero fattura dalla causale"
```

---

### Task 3: Il punteggio — i cinque fattori della coppia

Cinque fattori qui; il sesto — l'unicità — dipende dagli *altri* candidati e si
applica nel Task 5. La funzione resta pura e prende alias e mappa dei codici
come argomenti, mai dal database.

**Files:**
- Create: `src/lib/reconciliation/punteggio.ts`
- Test: `src/lib/reconciliation/__tests__/punteggio.test.ts`

**Interfaces:**
- Consumes: `normalizzaTesto`, `contieneRiferimento`, `estraiPartiteIva` da `./causale`; `stringSimilarity`, `daysDifference` da `./matcher`
- Produces:
  - `PESI`, `SOGLIE` (costanti)
  - tipi `MovimentoBanca`, `ScadenzaCandidata`, `Fattori`, `Motivazione`, `Valutazione`
  - `valutaCoppia(movimento, scadenza, contesto): Valutazione | null`
  - `fascia(punteggio: number): 'alta' | 'media' | 'bassa'`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/lib/reconciliation/__tests__/punteggio.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  valutaCoppia,
  fascia,
  PESI,
  SOGLIE,
  type MovimentoBanca,
  type ScadenzaCandidata,
  type ContestoValutazione,
} from '../punteggio'

const CONTESTO_VUOTO: ContestoValutazione = {
  alias: new Map(),
  mappaCodiciBanca: new Map(),
}

function movimento(over: Partial<MovimentoBanca> = {}): MovimentoBanca {
  return {
    id: 'btx-1',
    data: new Date('2026-07-07'),
    causale: 'BEN ROMA GIANFRANCO SRLFT 4320 Causale: FT 4320',
    importo: -846.95, // negativo = uscita
    bankTransactionCode: null,
    ...over,
  }
}

function scadenza(over: Partial<ScadenzaCandidata> = {}): ScadenzaCandidata {
  return {
    id: 'sch-1',
    tipo: 'passiva',
    dataScadenza: new Date('2026-07-07'),
    descrizione: 'Roma Gianfranco SRL — fattura 4320',
    residuo: 846.95,
    numeroDocumento: '4320',
    controparteNome: 'ROMA GIANFRANCO SRL',
    controparteIban: null,
    supplierId: 'sup-1',
    partitaIvaControparte: null,
    metodoPagamento: null,
    ...over,
  }
}

describe('il segno è un filtro, non un fattore', () => {
  it('un\'uscita non produce proposta su una scadenza attiva', () => {
    const esito = valutaCoppia(movimento(), scadenza({ tipo: 'attiva' }), CONTESTO_VUOTO)
    expect(esito).toBeNull()
  })

  it('un\'entrata non produce proposta su una scadenza passiva', () => {
    const esito = valutaCoppia(
      movimento({ importo: 846.95 }),
      scadenza({ tipo: 'passiva' }),
      CONTESTO_VUOTO
    )
    expect(esito).toBeNull()
  })

  it('una scadenza senza residuo non produce proposta', () => {
    const esito = valutaCoppia(movimento(), scadenza({ residuo: 0 }), CONTESTO_VUOTO)
    expect(esito).toBeNull()
  })
})

describe('il fattore importo', () => {
  it('dà il massimo quando l\'importo coincide col residuo', () => {
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.fattori.importo).toBe(PESI.IMPORTO)
  })

  it('dà meno per un acconto, in proporzione a quanto copre', () => {
    const esito = valutaCoppia(
      movimento({ importo: -400 }),
      scadenza({ residuo: 800 }),
      CONTESTO_VUOTO
    )!
    // metà del residuo → metà dei 15 punti dell'acconto
    expect(esito.fattori.importo).toBe(8)
    expect(esito.motivazioni.some((m) => m.segno === '-' && /[Aa]cconto/.test(m.testo))).toBe(true)
  })

  it('non dà nulla quando il movimento eccede il residuo, e lo dice', () => {
    const esito = valutaCoppia(
      movimento({ importo: -2000 }),
      scadenza({ residuo: 800 }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.importo).toBe(0)
    expect(esito.motivazioni.some((m) => m.segno === '-' && /eccede/.test(m.testo))).toBe(true)
  })
})

describe('il fattore data è asimmetrico', () => {
  it('dà il massimo il giorno della scadenza', () => {
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.fattori.data).toBe(PESI.DATA)
  })

  it('penalizza poco il ritardo, che è normale', () => {
    const esito = valutaCoppia(
      movimento({ data: new Date('2026-07-10') }),
      scadenza({ dataScadenza: new Date('2026-07-07') }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.data).toBe(13)
  })

  it('penalizza di più l\'anticipo, che è raro, e lo dice', () => {
    const esito = valutaCoppia(
      movimento({ data: new Date('2026-07-04') }),
      scadenza({ dataScadenza: new Date('2026-07-07') }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.data).toBe(8)
    expect(esito.motivazioni.some((m) => m.segno === '-' && /prima della scadenza/.test(m.testo))).toBe(
      true
    )
  })

  it('un pagamento di giugno non guadagna nulla su una rata di agosto', () => {
    const esito = valutaCoppia(
      movimento({ data: new Date('2026-06-26') }),
      scadenza({ dataScadenza: new Date('2026-08-10') }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.data).toBe(0)
  })
})

describe('il fattore riferimento documento', () => {
  it('dà il massimo quando il numero è nella causale, anche appiccicato', () => {
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.fattori.riferimento).toBe(PESI.RIFERIMENTO)
  })

  it('non dà nulla quando la scadenza non ha numero documento', () => {
    const esito = valutaCoppia(movimento(), scadenza({ numeroDocumento: null }), CONTESTO_VUOTO)!
    expect(esito.fattori.riferimento).toBe(0)
  })
})

describe('il fattore controparte', () => {
  it('dà il massimo quando un alias appreso indica il fornitore', () => {
    const contesto: ContestoValutazione = {
      alias: new Map([['BEN ROMA GIANFRANCO SRLFT 4320 CAUSALE FT 4320', 'sup-1']]),
      mappaCodiciBanca: new Map(),
    }
    const esito = valutaCoppia(
      movimento(),
      scadenza({ controparteNome: 'NOME COMPLETAMENTE DIVERSO' }),
      contesto
    )!
    expect(esito.fattori.controparte).toBe(PESI.CONTROPARTE)
  })

  it('riconosce l\'IBAN quando compare nella causale', () => {
    const esito = valutaCoppia(
      movimento({ causale: 'Iban beneficiario: IT78S07084612000000000900667' }),
      scadenza({ controparteNome: null, controparteIban: 'IT78S07084612000000000900667' }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.controparte).toBe(18)
  })

  it('riconosce la partita IVA quando compare nella causale', () => {
    const esito = valutaCoppia(
      movimento({ causale: 'Partita Iva ordinante: 01723900930' }),
      scadenza({ controparteNome: null, partitaIvaControparte: '01723900930' }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.controparte).toBe(18)
  })

  it('la ragione sociale per intero nella causale vale quanto un IBAN', () => {
    // "ROMA GIANFRANCO SRL" (19 caratteri) compare dentro "…SRLFT 4320":
    // una ragione sociale così lunga non ci finisce per caso
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.fattori.controparte).toBe(18)
  })

  it('un nome corto vale meno, perché la coincidenza è plausibile', () => {
    const esito = valutaCoppia(
      movimento({ causale: 'Bonifico ACME per fornitura' }),
      scadenza({ controparteNome: 'ACME', numeroDocumento: null }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.controparte).toBe(12)
  })

  it('non dà nulla quando non riconosce nessuno', () => {
    const esito = valutaCoppia(
      movimento({ causale: 'Addebito commissioni trimestrali' }),
      scadenza({ controparteNome: 'ROMA GIANFRANCO SRL', numeroDocumento: null }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.controparte).toBe(0)
  })
})

describe('il fattore codice banca', () => {
  const mappa = new Map([['13//05', ['sdd']]])

  it('dà il massimo quando il codice concorda col metodo atteso', () => {
    const esito = valutaCoppia(
      movimento({ bankTransactionCode: '13//05' }),
      scadenza({ metodoPagamento: 'sdd' }),
      { alias: new Map(), mappaCodiciBanca: mappa }
    )!
    expect(esito.fattori.codiceBanca).toBe(PESI.CODICE_BANCA)
  })

  it('non dà nulla e lo motiva quando il codice contraddice il metodo atteso', () => {
    const esito = valutaCoppia(
      movimento({ bankTransactionCode: '13//05' }),
      scadenza({ metodoPagamento: 'bonifico' }),
      { alias: new Map(), mappaCodiciBanca: mappa }
    )!
    expect(esito.fattori.codiceBanca).toBe(0)
    expect(esito.motivazioni.some((m) => m.segno === '-' && /codice/i.test(m.testo))).toBe(true)
  })

  it('non dà nulla e non si lamenta quando la mappa è vuota', () => {
    // È lo stato iniziale: la mappa va ricavata dai 678 movimenti veri
    const esito = valutaCoppia(
      movimento({ bankTransactionCode: '13//05' }),
      scadenza({ metodoPagamento: 'bonifico' }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.codiceBanca).toBe(0)
    expect(esito.motivazioni.every((m) => !/codice/i.test(m.testo))).toBe(true)
  })
})

describe('il totale e le fasce', () => {
  it('la coppia perfetta arriva a 83 senza contare l\'unicità', () => {
    // 30 importo + 20 riferimento + 18 controparte + 15 data + 0 codice banca.
    // Con l'unicità (unico candidato, +5) fa 88: fascia Alta. È il collaudo
    // della taratura — se la coppia più evidente possibile non arrivasse in
    // Alta, "Approva tutte le sicure" non avrebbe mai nulla da approvare, che
    // è il difetto di CashKing che la spec vieta di copiare.
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.punteggioParziale).toBe(83)
    expect(esito.fattori.unicita).toBe(0)
  })

  it('nessun fattore supera il suo massimo', () => {
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.fattori.importo).toBeLessThanOrEqual(PESI.IMPORTO)
    expect(esito.fattori.riferimento).toBeLessThanOrEqual(PESI.RIFERIMENTO)
    expect(esito.fattori.controparte).toBeLessThanOrEqual(PESI.CONTROPARTE)
    expect(esito.fattori.data).toBeLessThanOrEqual(PESI.DATA)
    expect(esito.fattori.codiceBanca).toBeLessThanOrEqual(PESI.CODICE_BANCA)
  })

  it('i pesi sommano esattamente a 100', () => {
    const somma =
      PESI.IMPORTO + PESI.RIFERIMENTO + PESI.CONTROPARTE + PESI.DATA + PESI.CODICE_BANCA + PESI.UNICITA
    expect(somma).toBe(100)
  })

  it('le fasce coprono l\'intervallo senza buchi né sovrapposizioni', () => {
    expect(fascia(100)).toBe('alta')
    expect(fascia(SOGLIE.ALTA)).toBe('alta')
    expect(fascia(SOGLIE.ALTA - 1)).toBe('media')
    expect(fascia(SOGLIE.MEDIA)).toBe('media')
    expect(fascia(SOGLIE.MEDIA - 1)).toBe('bassa')
    expect(fascia(SOGLIE.MINIMA)).toBe('bassa')
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `nvm use 22 && npm run test:run -- punteggio`
Expected: FAIL — il modulo `../punteggio` non esiste.

- [ ] **Step 3: Scrivi l'implementazione**

Crea `src/lib/reconciliation/punteggio.ts`:

```typescript
import { stringSimilarity, daysDifference } from './matcher'
import { normalizzaTesto, contieneRiferimento, estraiPartiteIva } from './causale'

/**
 * Il punteggio di una coppia movimento-scadenza, da 0 a 100.
 *
 * Modulo puro: nessun accesso al database. Alias e mappa dei codici banca
 * arrivano come argomenti, così il motore si può esercitare sui 678 movimenti
 * veri degli snapshot senza montare niente.
 *
 * ## Tre scelte deliberate, contro CashKing
 *
 * **Niente base fissa.** CashKing regala trenta punti a ogni proposta per il
 * solo fatto di esistere, ed è ciò che poi gli costringe le soglie a non
 * tornare: la fascia che documenta come 0-49 è irraggiungibile perché il motore
 * non emette nulla sotto 50. Qui si parte da zero.
 *
 * **Il segno è un filtro, non un fattore.** CashKing gli assegna dieci punti
 * sempre soddisfatti, cioè un altro regalo a tutti. Qui un'uscita su una
 * scadenza attiva non produce una proposta debole: non produce proposta.
 *
 * **Le motivazioni dicono anche cosa abbassa.** Un 62 deve spiegare perché non
 * è 90, quindi ogni motivazione porta un segno.
 */

export const PESI = {
  IMPORTO: 30,
  RIFERIMENTO: 20,
  CONTROPARTE: 20,
  DATA: 15,
  CODICE_BANCA: 10,
  UNICITA: 5,
} as const

/**
 * Le soglie delle fasce.
 *
 * ALTA è una stima da rivedere dopo la prima misurazione sui movimenti veri:
 * è la fascia che si approva in blocco senza aprire le schede, quindi un falso
 * positivo lì è un errore contabile che nessuno vede passare. Sta qui, in un
 * posto solo, proprio perché va cambiata guardando un numero.
 */
export const SOGLIE = {
  ALTA: 85,
  MEDIA: 60,
  MINIMA: 40,
} as const

/** Differenze sotto questa soglia sono arrotondamenti, non discrepanze. */
export const TOLLERANZA = 0.01

export interface MovimentoBanca {
  id: string
  data: Date
  causale: string
  /** Firmato: negativo = uscita, positivo = entrata */
  importo: number
  /** `proprietaryBankTransactionCode`, formato NN//NN */
  bankTransactionCode: string | null
}

export interface ScadenzaCandidata {
  id: string
  tipo: 'attiva' | 'passiva'
  dataScadenza: Date
  descrizione: string
  /** importoTotale − importoPagato */
  residuo: number
  numeroDocumento: string | null
  controparteNome: string | null
  controparteIban: string | null
  supplierId: string | null
  partitaIvaControparte: string | null
  metodoPagamento: string | null
}

export interface Fattori {
  importo: number
  riferimento: number
  controparte: number
  data: number
  codiceBanca: number
  /** Applicato dopo, quando si conoscono le alternative: vedi `applicaUnicita` */
  unicita: number
}

export interface Motivazione {
  testo: string
  segno: '+' | '-'
}

export interface Valutazione {
  fattori: Fattori
  motivazioni: Motivazione[]
  /** Somma dei fattori senza l'unicità */
  punteggioParziale: number
}

export interface ContestoValutazione {
  /** testo normalizzato della causale → supplierId o customerId */
  alias: Map<string, string>
  /** bankTransactionCode → metodi di pagamento compatibili */
  mappaCodiciBanca: Map<string, string[]>
}

export function fascia(punteggio: number): 'alta' | 'media' | 'bassa' {
  if (punteggio >= SOGLIE.ALTA) return 'alta'
  if (punteggio >= SOGLIE.MEDIA) return 'media'
  return 'bassa'
}

/** L'importo del movimento nel verso che interessa la scadenza; 0 se sbagliato. */
function importoUtile(movimento: MovimentoBanca, tipo: 'attiva' | 'passiva'): number {
  if (tipo === 'attiva') return movimento.importo > 0 ? movimento.importo : 0
  return movimento.importo < 0 ? -movimento.importo : 0
}

function punteggioImporto(importo: number, residuo: number, motivazioni: Motivazione[]): number {
  const differenza = Math.abs(importo - residuo)

  if (differenza < TOLLERANZA / 2) {
    motivazioni.push({ testo: 'Importo identico al residuo', segno: '+' })
    return PESI.IMPORTO
  }
  if (differenza <= TOLLERANZA) {
    motivazioni.push({ testo: 'Importo a meno di un centesimo dal residuo', segno: '+' })
    return 28
  }
  if (differenza <= 1) {
    motivazioni.push({ testo: 'Importo a meno di un euro dal residuo', segno: '+' })
    return 24
  }
  if (importo < residuo) {
    const quota = importo / residuo
    motivazioni.push({
      testo: `Acconto: copre il ${Math.round(quota * 100)}% del residuo`,
      segno: '-',
    })
    return Math.round(15 * quota)
  }
  motivazioni.push({ testo: 'Il movimento eccede il residuo della scadenza', segno: '-' })
  return 0
}

/**
 * La finestra della data è asimmetrica, e non per gusto: pagare in ritardo è
 * normale, pagare in anticipo è raro. Un motore simmetrico propone pagamenti
 * di giugno per rate di agosto — che è il difetto osservato in CashKing.
 */
function punteggioData(giorni: number, motivazioni: Motivazione[]): number {
  if (giorni === 0) {
    motivazioni.push({ testo: 'Pagato il giorno di scadenza', segno: '+' })
    return PESI.DATA
  }

  if (giorni > 0) {
    if (giorni <= 5) {
      motivazioni.push({ testo: `Pagato ${giorni} giorni dopo la scadenza`, segno: '+' })
      return 13
    }
    if (giorni <= 20) {
      motivazioni.push({ testo: `Pagato ${giorni} giorni dopo la scadenza`, segno: '+' })
      return 10
    }
    if (giorni <= 60) {
      motivazioni.push({ testo: `Pagato ${giorni} giorni dopo la scadenza`, segno: '-' })
      return 6
    }
    if (giorni <= 120) {
      motivazioni.push({ testo: `Pagato ${giorni} giorni dopo la scadenza`, segno: '-' })
      return 2
    }
    motivazioni.push({ testo: `Pagato ${giorni} giorni dopo la scadenza`, segno: '-' })
    return 0
  }

  const anticipo = -giorni
  if (anticipo <= 5) {
    motivazioni.push({ testo: `Pagato ${anticipo} giorni prima della scadenza`, segno: '-' })
    return 8
  }
  if (anticipo <= 15) {
    motivazioni.push({ testo: `Pagato ${anticipo} giorni prima della scadenza`, segno: '-' })
    return 3
  }
  motivazioni.push({ testo: `Pagato ${anticipo} giorni prima della scadenza`, segno: '-' })
  return 0
}

function punteggioControparte(
  movimento: MovimentoBanca,
  scadenza: ScadenzaCandidata,
  contesto: ContestoValutazione,
  motivazioni: Motivazione[]
): number {
  const causaleNormalizzata = normalizzaTesto(movimento.causale)

  // 1. L'alias appreso: la prova più forte, perché qualcuno l'ha confermata
  const identita = scadenza.supplierId
  if (identita) {
    for (const [testo, id] of contesto.alias) {
      if (id === identita && causaleNormalizzata.includes(testo)) {
        motivazioni.push({ testo: 'Controparte riconosciuta da un abbinamento già confermato', segno: '+' })
        return PESI.CONTROPARTE
      }
    }
  }

  // 2. L'IBAN: non ambiguo, ma non sempre presente nella causale
  if (scadenza.controparteIban) {
    const iban = normalizzaTesto(scadenza.controparteIban)
    if (iban.length >= 15 && causaleNormalizzata.includes(iban)) {
      motivazioni.push({ testo: 'IBAN della controparte presente nella causale', segno: '+' })
      return 18
    }
  }

  // 3. La partita IVA
  if (scadenza.partitaIvaControparte) {
    if (estraiPartiteIva(movimento.causale).includes(scadenza.partitaIvaControparte)) {
      motivazioni.push({ testo: 'Partita IVA della controparte presente nella causale', segno: '+' })
      return 18
    }
  }

  // 4. Il nome. Se compare **per intero e alla lettera** vale quanto l'IBAN:
  // una ragione sociale di otto caratteri o più non finisce per caso dentro la
  // causale di un bonifico. Sotto gli otto caratteri la coincidenza è
  // plausibile ("ACME" dentro "ACMEBANK") e il punteggio scende.
  if (scadenza.controparteNome) {
    const nome = normalizzaTesto(scadenza.controparteNome)
    if (nome.length >= 8 && causaleNormalizzata.includes(nome)) {
      motivazioni.push({ testo: 'Nome della controparte presente nella causale', segno: '+' })
      return 18
    }
    if (nome.length >= 4 && causaleNormalizzata.includes(nome)) {
      motivazioni.push({ testo: 'Nome breve della controparte presente nella causale', segno: '+' })
      return 12
    }
    const somiglianza = stringSimilarity(causaleNormalizzata, nome)
    if (somiglianza >= 0.6) {
      motivazioni.push({ testo: 'Nome della controparte simile a quello nella causale', segno: '+' })
      return 6
    }
  }

  motivazioni.push({ testo: 'Controparte non riconosciuta nella causale', segno: '-' })
  return 0
}

function punteggioCodiceBanca(
  movimento: MovimentoBanca,
  scadenza: ScadenzaCandidata,
  contesto: ContestoValutazione,
  motivazioni: Motivazione[]
): number {
  const codice = movimento.bankTransactionCode
  if (!codice || !scadenza.metodoPagamento) return 0

  const attesi = contesto.mappaCodiciBanca.get(codice)
  // Mappa vuota o codice sconosciuto: il fattore tace. È lo stato iniziale —
  // la mappa va ricavata leggendo i movimenti veri, non inventata qui.
  if (!attesi || attesi.length === 0) return 0

  if (attesi.includes(scadenza.metodoPagamento)) {
    motivazioni.push({ testo: 'Il codice operazione della banca concorda col metodo atteso', segno: '+' })
    return PESI.CODICE_BANCA
  }

  motivazioni.push({
    testo: `Il codice operazione indica ${attesi.join(' o ')}, ma la scadenza dice ${scadenza.metodoPagamento}`,
    segno: '-',
  })
  return 0
}

/**
 * Valuta una coppia. Torna `null` quando la coppia è impossibile — verso
 * sbagliato o scadenza già chiusa — invece di restituire un punteggio basso:
 * una proposta impossibile non è una proposta debole.
 */
export function valutaCoppia(
  movimento: MovimentoBanca,
  scadenza: ScadenzaCandidata,
  contesto: ContestoValutazione
): Valutazione | null {
  const importo = importoUtile(movimento, scadenza.tipo)
  if (importo <= 0) return null
  if (scadenza.residuo <= TOLLERANZA) return null

  const motivazioni: Motivazione[] = []

  const fattori: Fattori = {
    importo: punteggioImporto(importo, scadenza.residuo, motivazioni),
    riferimento: 0,
    controparte: punteggioControparte(movimento, scadenza, contesto, motivazioni),
    data: 0,
    codiceBanca: punteggioCodiceBanca(movimento, scadenza, contesto, motivazioni),
    unicita: 0,
  }

  if (scadenza.numeroDocumento && contieneRiferimento(movimento.causale, scadenza.numeroDocumento)) {
    fattori.riferimento = PESI.RIFERIMENTO
    motivazioni.push({ testo: 'Riferimento della fattura presente nella causale', segno: '+' })
  }

  // daysDifference torna il valore assoluto: il verso lo ricaviamo qui, e ci
  // serve, perché ritardo e anticipo non valgono uguale
  const giorniAssoluti = daysDifference(movimento.data, scadenza.dataScadenza)
  const inRitardo = movimento.data.getTime() >= scadenza.dataScadenza.getTime()
  fattori.data = punteggioData(inRitardo ? giorniAssoluti : -giorniAssoluti, motivazioni)

  const punteggioParziale =
    fattori.importo + fattori.riferimento + fattori.controparte + fattori.data + fattori.codiceBanca

  return { fattori, motivazioni, punteggioParziale }
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `nvm use 22 && npm run test:run -- punteggio`
Expected: PASS, 25 test.

- [ ] **Step 5: Verifica i tipi**

Run: `nvm use 22 && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reconciliation/punteggio.ts src/lib/reconciliation/__tests__/punteggio.test.ts
git commit -m "feat(riconciliazione): il punteggio a fattori, col segno come filtro e le motivazioni negative"
```

---

### Task 4: I pagamenti cumulativi, con la briglia corta

Un bonifico da 3.240 € che salda tre fatture dello stesso fornitore è una
proposta con tre gambe. Senza limiti la ricerca esplode e comincia a proporre
somme che tornano per caso — che è peggio di non proporre niente, perché una
somma casuale che quadra sembra un abbinamento giusto.

**Files:**
- Create: `src/lib/reconciliation/combinazioni.ts`
- Test: `src/lib/reconciliation/__tests__/combinazioni.test.ts`

**Interfaces:**
- Consumes: `ScadenzaCandidata`, `TOLLERANZA` da `./punteggio`
- Produces: `trovaCombinazioni(importo: number, candidate: ScadenzaCandidata[], opzioni?: OpzioniCombinazioni): ScadenzaCandidata[][]`, `MAX_GAMBE`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/lib/reconciliation/__tests__/combinazioni.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { trovaCombinazioni, MAX_GAMBE } from '../combinazioni'
import type { ScadenzaCandidata } from '../punteggio'

function scadenza(id: string, residuo: number, supplierId = 'sup-1'): ScadenzaCandidata {
  return {
    id,
    tipo: 'passiva',
    dataScadenza: new Date('2026-07-07'),
    descrizione: `Scadenza ${id}`,
    residuo,
    numeroDocumento: null,
    controparteNome: 'FORNITORE UNO',
    controparteIban: null,
    supplierId,
    partitaIvaControparte: null,
    metodoPagamento: null,
  }
}

describe('trovaCombinazioni', () => {
  it('trova le tre fatture che un bonifico unico salda', () => {
    const combinazioni = trovaCombinazioni(3240, [
      scadenza('a', 1080),
      scadenza('b', 1080),
      scadenza('c', 1080),
      scadenza('d', 500),
    ])
    expect(combinazioni).toHaveLength(1)
    expect(combinazioni[0].map((s) => s.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('non restituisce le combinazioni di una gamba sola', () => {
    // Quelle sono già coperte dalla valutazione coppia per coppia
    const combinazioni = trovaCombinazioni(1000, [scadenza('a', 1000)])
    expect(combinazioni).toHaveLength(0)
  })

  it('tollera un centesimo di differenza, non di più', () => {
    expect(trovaCombinazioni(1000.01, [scadenza('a', 500), scadenza('b', 500)])).toHaveLength(1)
    expect(trovaCombinazioni(1000.5, [scadenza('a', 500), scadenza('b', 500)])).toHaveLength(0)
  })

  it('non mescola controparti diverse', () => {
    const combinazioni = trovaCombinazioni(1000, [
      scadenza('a', 500, 'sup-1'),
      scadenza('b', 500, 'sup-2'),
    ])
    expect(combinazioni).toHaveLength(0)
  })

  it('non supera il numero massimo di gambe', () => {
    // cinque da 200 farebbero 1000, ma sono più di MAX_GAMBE
    const cinque = [1, 2, 3, 4, 5].map((n) => scadenza(`s${n}`, 200))
    expect(MAX_GAMBE).toBe(4)
    expect(trovaCombinazioni(1000, cinque)).toHaveLength(0)
  })

  it('non esplode su molte candidate', () => {
    const molte = Array.from({ length: 60 }, (_, i) => scadenza(`s${i}`, 100 + i))
    const inizio = Date.now()
    trovaCombinazioni(1_000_000, molte) // importo irraggiungibile: esplora tutto
    expect(Date.now() - inizio).toBeLessThan(2000)
  })

  it('su nessuna candidata torna una lista vuota', () => {
    expect(trovaCombinazioni(1000, [])).toEqual([])
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `nvm use 22 && npm run test:run -- combinazioni`
Expected: FAIL — il modulo `../combinazioni` non esiste.

- [ ] **Step 3: Scrivi l'implementazione**

Crea `src/lib/reconciliation/combinazioni.ts`:

```typescript
import { TOLLERANZA, type ScadenzaCandidata } from './punteggio'

/**
 * I pagamenti cumulativi: un movimento che salda più scadenze insieme.
 *
 * Modulo puro. La ricerca è deliberatamente stretta — stessa controparte,
 * al massimo quattro gambe, somma che torna al centesimo — perché senza
 * questi limiti comincia a proporre somme che quadrano per caso, e una somma
 * casuale che quadra sembra un abbinamento giusto. È il modo peggiore di
 * sbagliare.
 */

/** Oltre quattro documenti in un bonifico solo è raro, e il costo esplode. */
export const MAX_GAMBE = 4

/** Oltre questo numero di candidate si rinuncia invece di rallentare. */
const MAX_CANDIDATE = 40

export interface OpzioniCombinazioni {
  maxGambe?: number
  tolleranza?: number
}

/** Chiave d'identità della controparte: l'id se c'è, altrimenti il nome. */
function chiaveControparte(scadenza: ScadenzaCandidata): string {
  return scadenza.supplierId ?? scadenza.controparteNome ?? '(ignota)'
}

/**
 * Le combinazioni di scadenze la cui somma dei residui pareggia l'importo.
 *
 * Restituisce solo combinazioni di **almeno due** gambe: quelle di una gamba
 * sola sono già valutate coppia per coppia, e ripeterle qui produrrebbe
 * proposte doppie.
 */
export function trovaCombinazioni(
  importo: number,
  candidate: ScadenzaCandidata[],
  opzioni: OpzioniCombinazioni = {}
): ScadenzaCandidata[][] {
  const maxGambe = opzioni.maxGambe ?? MAX_GAMBE
  const tolleranza = opzioni.tolleranza ?? TOLLERANZA

  const perControparte = new Map<string, ScadenzaCandidata[]>()
  for (const scadenza of candidate) {
    if (scadenza.residuo <= tolleranza) continue
    const chiave = chiaveControparte(scadenza)
    const gruppo = perControparte.get(chiave)
    if (gruppo) gruppo.push(scadenza)
    else perControparte.set(chiave, [scadenza])
  }

  const risultati: ScadenzaCandidata[][] = []

  for (const gruppo of perControparte.values()) {
    if (gruppo.length < 2) continue

    // Le più grandi per prime: la potatura sul residuo morde subito
    const ordinate = [...gruppo]
      .sort((a, b) => b.residuo - a.residuo)
      .slice(0, MAX_CANDIDATE)

    const corrente: ScadenzaCandidata[] = []

    const esplora = (da: number, somma: number) => {
      if (somma - importo > tolleranza) return
      if (corrente.length >= 2 && Math.abs(somma - importo) <= tolleranza) {
        risultati.push([...corrente])
        return
      }
      if (corrente.length >= maxGambe) return

      for (let i = da; i < ordinate.length; i++) {
        corrente.push(ordinate[i])
        esplora(i + 1, somma + ordinate[i].residuo)
        corrente.pop()
      }
    }

    esplora(0, 0)
  }

  return risultati
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `nvm use 22 && npm run test:run -- combinazioni`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reconciliation/combinazioni.ts src/lib/reconciliation/__tests__/combinazioni.test.ts
git commit -m "feat(riconciliazione): i pagamenti cumulativi, cercati con la briglia corta"
```

---

### Task 5: L'unicità

Il sesto fattore dipende dagli altri candidati, non dalla coppia: si può
calcolare solo dopo aver valutato tutti, quindi vive in un modulo suo.

> La distinzione fra proposte **in conflitto** e proposte **complementari** —
> due acconti da 500 € su un residuo di 1.000 € non si contendono nulla — sta
> nella Fase A2, dove l'approvazione la usa per decidere cosa marcare superato.
> Scriverla qui produrrebbe una funzione esportata e mai chiamata, che il
> progetto vieta esplicitamente (`src/CLAUDE.md`: *niente codice
> irraggiungibile*).

**Files:**
- Create: `src/lib/reconciliation/unicita.ts`
- Test: `src/lib/reconciliation/__tests__/unicita.test.ts`

**Interfaces:**
- Consumes: `PESI`, `Fattori`, `Motivazione`, `Valutazione` da `./punteggio`
- Produces:
  - `applicaUnicita(valutazione: Valutazione, alternative: number): Valutata`
  - tipo `Valutata` = `{ punteggio: number; fattori: Fattori; motivazioni: Motivazione[] }`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/lib/reconciliation/__tests__/unicita.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applicaUnicita } from '../unicita'
import { PESI, type Valutazione } from '../punteggio'

function valutazione(punteggioParziale = 70): Valutazione {
  return {
    fattori: {
      importo: 30,
      riferimento: 20,
      controparte: 20,
      data: 0,
      codiceBanca: 0,
      unicita: 0,
    },
    motivazioni: [],
    punteggioParziale,
  }
}

describe('applicaUnicita', () => {
  it('dà il massimo quando è l\'unico candidato, e lo dice', () => {
    const esito = applicaUnicita(valutazione(70), 1)
    expect(esito.fattori.unicita).toBe(PESI.UNICITA)
    expect(esito.punteggio).toBe(75)
    expect(esito.motivazioni.some((m) => m.segno === '+' && /unico/i.test(m.testo))).toBe(true)
  })

  it('dà poco con due candidati', () => {
    const esito = applicaUnicita(valutazione(70), 2)
    expect(esito.fattori.unicita).toBe(2)
    expect(esito.punteggio).toBe(72)
  })

  it('non dà nulla da tre candidati in su, e lo dice come motivazione negativa', () => {
    const esito = applicaUnicita(valutazione(70), 3)
    expect(esito.fattori.unicita).toBe(0)
    expect(esito.punteggio).toBe(70)
    expect(esito.motivazioni.some((m) => m.segno === '-' && /alternative/i.test(m.testo))).toBe(true)
  })

  it('non supera mai 100', () => {
    const esito = applicaUnicita(valutazione(100), 1)
    expect(esito.punteggio).toBe(100)
  })

  it('non modifica la valutazione ricevuta', () => {
    const originale = valutazione(70)
    applicaUnicita(originale, 1)
    expect(originale.fattori.unicita).toBe(0)
    expect(originale.motivazioni).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `nvm use 22 && npm run test:run -- unicita`
Expected: FAIL — il modulo `../unicita` non esiste.

- [ ] **Step 3: Scrivi l'implementazione**

Crea `src/lib/reconciliation/unicita.ts`:

```typescript
import { PESI, type Fattori, type Motivazione, type Valutazione } from './punteggio'

/**
 * Il sesto fattore: quanto è isolato questo abbinamento.
 *
 * Modulo puro. Sta qui e non in `punteggio.ts` perché è il solo fattore che
 * non dipende dalla coppia ma dagli *altri* candidati: lo si può calcolare
 * solo dopo aver valutato tutti. La stessa rata di affitto vale di più quando
 * è l'unica candidata e di meno quando ce ne sono tre identiche — che è
 * l'unica cosa che le distingue.
 */

export interface Valutata {
  punteggio: number
  fattori: Fattori
  motivazioni: Motivazione[]
}

/**
 * Aggiunge il fattore unicità. Non modifica la valutazione ricevuta: il
 * chiamante la riusa per calcolare l'unicità di altre coppie dello stesso
 * movimento.
 */
export function applicaUnicita(valutazione: Valutazione, alternative: number): Valutata {
  const motivazioni = [...valutazione.motivazioni]
  let unicita = 0

  if (alternative <= 1) {
    unicita = PESI.UNICITA
    motivazioni.push({ testo: 'Unico abbinamento possibile', segno: '+' })
  } else if (alternative === 2) {
    unicita = 2
    motivazioni.push({ testo: 'Esiste un\'altra alternativa plausibile', segno: '-' })
  } else {
    unicita = 0
    motivazioni.push({ testo: `${alternative} alternative plausibili`, segno: '-' })
  }

  return {
    punteggio: Math.min(100, valutazione.punteggioParziale + unicita),
    fattori: { ...valutazione.fattori, unicita },
    motivazioni,
  }
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `nvm use 22 && npm run test:run -- unicita`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reconciliation/unicita.ts src/lib/reconciliation/__tests__/unicita.test.ts
git commit -m "feat(riconciliazione): il fattore unicità, che dipende dagli altri candidati"
```

---

### Task 6: Il generatore del lotto

Il primo pezzo che tocca il database. Legge movimenti, scadenze, alias ed
esclusioni; chiama le funzioni pure; scrive lotto, proposte e gambe.

**Files:**
- Create: `src/lib/services/reconciliation-batch-service.ts`
- Test: `src/lib/services/__tests__/reconciliation-batch-service.itest.ts`

**Interfaces:**
- Consumes: `valutaCoppia`, `fascia`, `SOGLIE`, `TOLLERANZA`, tipi da `@/lib/reconciliation/punteggio`; `trovaCombinazioni` da `@/lib/reconciliation/combinazioni`; `applicaUnicita` da `@/lib/reconciliation/unicita`
- Produces: `generaLotto(input: GeneraLottoInput): Promise<GeneraLottoEsito>`, tipi `GeneraLottoInput`, `GeneraLottoEsito`

- [ ] **Step 1: Scrivi il test di integrazione che fallisce**

Crea `src/lib/services/__tests__/reconciliation-batch-service.itest.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { generaLotto } from '../reconciliation-batch-service'

/**
 * La generazione del lotto su database vero.
 *
 * Il criterio che questi test difendono, e che vale più di ogni singolo caso:
 * la somma delle fasce deve fare il totale in attesa. È il difetto più visibile
 * di CashKing — "In attesa: 0" con nove abbinamenti ancora da decidere — e
 * nasce dal contare proposte in un posto e schede in un altro.
 */
setupIntegrationDb()

async function creaMovimentoBancario(
  venueId: string,
  over: Partial<{ importo: number; data: Date; causale: string; codice: string | null }> = {}
) {
  return prisma.bankTransaction.create({
    data: {
      venueId,
      transactionDate: over.data ?? new Date('2026-07-07'),
      description: over.causale ?? 'BEN ROMA GIANFRANCO SRLFT 4320 Causale: FT 4320',
      amount: over.importo ?? -846.95,
      bankTransactionCode: over.codice ?? null,
      status: 'PENDING',
    },
  })
}

describe('generaLotto', () => {
  it('propone l\'abbinamento evidente e lo mette in fascia alta', async () => {
    const venue = await venueDiTest()
    const movimento = await creaMovimentoBancario(venue.id)
    const scadenza = await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 846.95,
      dataScadenza: new Date('2026-07-07'),
      numeroDocumento: '4320',
      controparteNome: 'ROMA GIANFRANCO SRL',
      descrizione: 'Roma Gianfranco SRL — fattura 4320',
    })

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1'],
      userId: null,
    })

    expect(esito.contaProposte).toBe(1)

    const proposte = await prisma.reconciliationProposal.findMany({
      where: { batchId: esito.batchId },
      include: { gambe: true },
    })
    expect(proposte).toHaveLength(1)
    expect(proposte[0].punteggio).toBeGreaterThanOrEqual(85)
    expect(proposte[0].bankTransactionId).toBe(movimento.id)
    expect(proposte[0].gambe).toHaveLength(1)
    expect(proposte[0].gambe[0].scheduleId).toBe(scadenza.id)
  })

  it('non propone nulla sotto la soglia minima', async () => {
    const venue = await venueDiTest()
    await creaMovimentoBancario(venue.id, {
      importo: -12.34,
      causale: 'Addebito commissioni trimestrali',
    })
    await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 5000,
      dataScadenza: new Date('2026-01-01'),
      numeroDocumento: null,
      controparteNome: 'ALTRO FORNITORE SPA',
      descrizione: 'Altro fornitore',
    })

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1'],
      userId: null,
    })

    expect(esito.contaProposte).toBe(0)
  })

  it('salta le coppie escluse per sempre', async () => {
    const venue = await venueDiTest()
    const movimento = await creaMovimentoBancario(venue.id)
    const scadenza = await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 846.95,
      dataScadenza: new Date('2026-07-07'),
      numeroDocumento: '4320',
      controparteNome: 'ROMA GIANFRANCO SRL',
      descrizione: 'Roma Gianfranco SRL — fattura 4320',
    })
    await prisma.reconciliationExclusion.create({
      data: { venueId: venue.id, bankTransactionId: movimento.id, scheduleId: scadenza.id },
    })

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1'],
      userId: null,
    })

    expect(esito.contaProposte).toBe(0)
  })

  it('usa un alias appreso per riconoscere una controparte scritta diversamente', async () => {
    const venue = await venueDiTest()
    const fornitore = await prisma.supplier.create({
      data: { venueId: venue.id, name: 'Roma Gianfranco S.r.l.' },
    })
    await prisma.counterpartyAlias.create({
      data: {
        venueId: venue.id,
        testoNormalizzato: 'BEN ROMA GIANFRANCO SRLFT 4320 CAUSALE FT 4320',
        supplierId: fornitore.id,
        origine: 'manuale',
      },
    })
    await creaMovimentoBancario(venue.id)
    await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 846.95,
      dataScadenza: new Date('2026-07-07'),
      numeroDocumento: null, // niente riferimento: la controparte deve bastare
      controparteNome: 'DENOMINAZIONE INTERNA DIVERSA',
      supplierId: fornitore.id,
      descrizione: 'Fornitore',
    })

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1'],
      userId: null,
    })

    const proposte = await prisma.reconciliationProposal.findMany({
      where: { batchId: esito.batchId },
    })
    expect(proposte).toHaveLength(1)
    const fattori = proposte[0].fattori as { controparte: number }
    expect(fattori.controparte).toBe(20)
  })

  it('la somma delle fasce fa il totale in attesa', async () => {
    const venue = await venueDiTest()
    for (const n of [1, 2, 3]) {
      await creaMovimentoBancario(venue.id, {
        importo: -(100 * n),
        causale: `Bonifico a FORNITORE ${n} Causale: FT 10${n}`,
        data: new Date('2026-07-07'),
      })
      await creaScadenza({
        venueId: venue.id,
        tipo: 'passiva',
        importoTotale: 100 * n,
        dataScadenza: new Date(2026, 6, 7 + n * 3),
        numeroDocumento: `10${n}`,
        controparteNome: `FORNITORE ${n}`,
        descrizione: `Fornitore ${n}`,
      })
    }

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1'],
      userId: null,
    })

    expect(esito.perFascia.alta + esito.perFascia.media + esito.perFascia.bassa).toBe(
      esito.contaProposte
    )
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `nvm use 22 && npm run test:integration -- reconciliation-batch-service`
Expected: FAIL — il modulo `../reconciliation-batch-service` non esiste.

> Se `creaScadenza` in `src/test/integration/fixtures/scadenzario.ts` non accetta uno dei campi usati sopra (`supplierId`, `numeroDocumento`, `controparteNome`), estendila: è una fixture, e allargarla è parte di questo task.

- [ ] **Step 3: Scrivi l'implementazione**

Crea `src/lib/services/reconciliation-batch-service.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  valutaCoppia,
  fascia,
  SOGLIE,
  TOLLERANZA,
  type ContestoValutazione,
  type Fattori,
  type Motivazione,
  type MovimentoBanca,
  type ScadenzaCandidata,
} from '@/lib/reconciliation/punteggio'
import { trovaCombinazioni } from '@/lib/reconciliation/combinazioni'
import { applicaUnicita } from '@/lib/reconciliation/unicita'

/**
 * Generare un lotto di proposte.
 *
 * Il servizio legge il database, chiama le funzioni pure di
 * `@/lib/reconciliation/` e persiste. Tutta la logica di punteggio sta lì, non
 * qui: è la separazione che permette di esercitare il motore sui movimenti veri
 * degli snapshot senza montare un database.
 *
 * Nota sulla riesecuzione: si escludono i movimenti già riconciliati e le
 * scadenze già saldate, quindi rilanciare dopo aver approvato le proposte
 * facili restringe lo spazio dei candidati e fa emergere abbinamenti prima
 * nascosti. Il flusso è iterativo per disegno.
 */

/** Finestra di ricerca attorno alla data del movimento, in giorni. */
const FINESTRA_INDIETRO = 120
const FINESTRA_AVANTI = 15

export interface GeneraLottoInput {
  venueId: string
  dateFrom: Date
  dateTo: Date
  regole: string[]
  userId: string | null
  sogliaMinima?: number
}

export interface GeneraLottoEsito {
  batchId: string
  contaProposte: number
  perFascia: { alta: number; media: number; bassa: number }
}

interface CoppiaValutata {
  scadenze: ScadenzaCandidata[]
  punteggioParziale: number
  fattori: Fattori
  motivazioni: Motivazione[]
}

/** Gli alias della sede, indicizzati per testo normalizzato. */
async function leggiAlias(venueId: string): Promise<Map<string, string>> {
  const righe = await prisma.counterpartyAlias.findMany({
    where: { venueId },
    select: { testoNormalizzato: true, supplierId: true, customerId: true },
  })
  const mappa = new Map<string, string>()
  for (const riga of righe) {
    const identita = riga.supplierId ?? riga.customerId
    if (identita) mappa.set(riga.testoNormalizzato, identita)
  }
  return mappa
}

/** Le coppie che l'utente ha escluso per sempre, come chiavi `btx|sch`. */
async function leggiEsclusioni(venueId: string): Promise<Set<string>> {
  const righe = await prisma.reconciliationExclusion.findMany({
    where: { venueId },
    select: { bankTransactionId: true, scheduleId: true },
  })
  return new Set(righe.map((r) => `${r.bankTransactionId ?? ''}|${r.scheduleId ?? ''}`))
}

export async function generaLotto(input: GeneraLottoInput): Promise<GeneraLottoEsito> {
  const { venueId, dateFrom, dateTo, regole, userId } = input
  const sogliaMinima = input.sogliaMinima ?? SOGLIE.MINIMA

  const [movimentiGrezzi, scadenzeGrezze, alias, esclusioni] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        venueId,
        deletedAt: null,
        status: { in: ['PENDING', 'UNMATCHED', 'TO_REVIEW'] },
        transactionDate: { gte: dateFrom, lte: dateTo },
      },
      select: {
        id: true,
        transactionDate: true,
        description: true,
        amount: true,
        bankTransactionCode: true,
      },
      orderBy: { transactionDate: 'asc' },
    }),
    prisma.schedule.findMany({
      where: {
        venueId,
        deletedAt: null,
        stato: { in: ['aperta', 'parzialmente_pagata', 'scaduta'] },
        dataScadenza: {
          gte: new Date(dateFrom.getTime() - FINESTRA_INDIETRO * 86_400_000),
          lte: new Date(dateTo.getTime() + FINESTRA_AVANTI * 86_400_000),
        },
      },
      select: {
        id: true,
        tipo: true,
        dataScadenza: true,
        descrizione: true,
        importoTotale: true,
        importoPagato: true,
        numeroDocumento: true,
        controparteNome: true,
        controparteIban: true,
        supplierId: true,
        metodoPagamento: true,
        invoiceId: true,
        supplier: { select: { vatNumber: true } },
      },
    }),
    leggiAlias(venueId),
    leggiEsclusioni(venueId),
  ])

  const contesto: ContestoValutazione = {
    alias,
    // La mappa dei codici banca va ricavata leggendo i movimenti veri. Finché
    // è vuota il fattore vale 0 per tutti e non rompe nulla.
    mappaCodiciBanca: new Map(),
  }

  const scadenze: ScadenzaCandidata[] = scadenzeGrezze
    .map((s) => ({
      id: s.id,
      tipo: s.tipo === 'attiva' ? ('attiva' as const) : ('passiva' as const),
      dataScadenza: s.dataScadenza,
      descrizione: s.descrizione,
      residuo: Number(s.importoTotale) - Number(s.importoPagato),
      numeroDocumento: s.numeroDocumento,
      controparteNome: s.controparteNome,
      controparteIban: s.controparteIban,
      supplierId: s.supplierId,
      partitaIvaControparte: s.supplier?.vatNumber ?? null,
      metodoPagamento: s.metodoPagamento,
    }))
    .filter((s) => s.residuo > TOLLERANZA)

  // Le scadenze nate da una fattura elettronica: distinguono R1/R2 da R3
  const conFattura = new Set(
    scadenzeGrezze.filter((s) => s.invoiceId !== null).map((s) => s.id)
  )

  const lotto = await prisma.reconciliationBatch.create({
    data: {
      venueId,
      dateFrom,
      dateTo,
      regoleUsate: regole,
      sogliaMinima,
      createdById: userId,
    },
    select: { id: true },
  })

  const perFascia = { alta: 0, media: 0, bassa: 0 }
  let contaProposte = 0

  for (const grezzo of movimentiGrezzi) {
    const movimento: MovimentoBanca = {
      id: grezzo.id,
      data: grezzo.transactionDate,
      causale: grezzo.description,
      importo: Number(grezzo.amount),
      bankTransactionCode: grezzo.bankTransactionCode,
    }

    const nellaFinestra = scadenze.filter((s) => {
      const chiave = `${movimento.id}|${s.id}`
      if (esclusioni.has(chiave)) return false
      const giorni = (movimento.data.getTime() - s.dataScadenza.getTime()) / 86_400_000
      return giorni <= FINESTRA_INDIETRO && giorni >= -FINESTRA_AVANTI
    })

    const valutate: CoppiaValutata[] = []

    // Coppie singole
    for (const scadenza of nellaFinestra) {
      const esito = valutaCoppia(movimento, scadenza, contesto)
      if (!esito) continue
      valutate.push({
        scadenze: [scadenza],
        punteggioParziale: esito.punteggioParziale,
        fattori: esito.fattori,
        motivazioni: esito.motivazioni,
      })
    }

    // Combinazioni cumulative: si valutano contro la somma dei residui,
    // rappresentata da una scadenza sintetica che non viene mai persistita
    const importoAssoluto = Math.abs(movimento.importo)
    for (const combinazione of trovaCombinazioni(importoAssoluto, nellaFinestra)) {
      const sommaResidui = combinazione.reduce((totale, s) => totale + s.residuo, 0)
      const rappresentante = combinazione[0]
      const esito = valutaCoppia(
        movimento,
        { ...rappresentante, residuo: sommaResidui },
        contesto
      )
      if (!esito) continue
      valutate.push({
        scadenze: combinazione,
        punteggioParziale: esito.punteggioParziale,
        fattori: esito.fattori,
        motivazioni: [
          ...esito.motivazioni,
          {
            testo: `Pagamento cumulativo di ${combinazione.length} scadenze`,
            segno: '+' as const,
          },
        ],
      })
    }

    if (valutate.length === 0) continue

    // L'unicità si applica ora, che si conoscono le alternative sopra soglia
    const sopraSoglia = valutate.filter((v) => v.punteggioParziale >= sogliaMinima - 5)
    const alternative = sopraSoglia.length

    const finali = sopraSoglia
      .map((v) => ({
        scadenze: v.scadenze,
        ...applicaUnicita(
          { fattori: v.fattori, motivazioni: v.motivazioni, punteggioParziale: v.punteggioParziale },
          alternative
        ),
      }))
      .filter((v) => v.punteggio >= sogliaMinima)
      .sort((a, b) => b.punteggio - a.punteggio)

    for (const finale of finali) {
      const quotaPerGamba = ripartisci(importoAssoluto, finale.scadenze)

      await prisma.reconciliationProposal.create({
        data: {
          batchId: lotto.id,
          regola: regolaDi(finale.scadenze[0], conFattura),
          punteggio: finale.punteggio,
          fattori: finale.fattori as unknown as Prisma.InputJsonValue,
          motivazioni: finale.motivazioni as unknown as Prisma.InputJsonValue,
          bankTransactionId: movimento.id,
          gambe: {
            create: finale.scadenze.map((s, indice) => ({
              scheduleId: s.id,
              importo: new Prisma.Decimal(quotaPerGamba[indice].toFixed(2)),
            })),
          },
        },
      })

      contaProposte++
      perFascia[fascia(finale.punteggio)]++
    }
  }

  await prisma.reconciliationBatch.update({
    where: { id: lotto.id },
    data: { contaProposte },
  })

  return { batchId: lotto.id, contaProposte, perFascia }
}

/**
 * La sigla della regola.
 *
 * R3 è il caso senza fattura elettronica dietro — affitto, F24, ricorrenti —
 * e si distingue perché la scadenza non ha `invoiceId`. Percorre lo stesso
 * codice di R1 e R2: la sigla serve all'utente per attribuire un errore a una
 * regola precisa, non al motore per comportarsi diversamente.
 */
function regolaDi(scadenza: ScadenzaCandidata, conFattura: Set<string>): string {
  if (!conFattura.has(scadenza.id)) return 'R3'
  return scadenza.tipo === 'attiva' ? 'R2' : 'R1'
}

/**
 * Quanto imputare a ciascuna gamba.
 *
 * Ogni gamba prende il minore fra il proprio residuo e quanto resta del
 * movimento, così la somma delle quote non eccede mai l'importo mosso.
 */
function ripartisci(importo: number, scadenze: ScadenzaCandidata[]): number[] {
  let restante = importo
  return scadenze.map((s) => {
    const quota = Math.min(s.residuo, restante)
    restante -= quota
    return Math.max(0, quota)
  })
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `nvm use 22 && npm run test:integration -- reconciliation-batch-service`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/reconciliation-batch-service.ts src/lib/services/__tests__/reconciliation-batch-service.itest.ts src/test/integration/fixtures/scadenzario.ts
git commit -m "feat(riconciliazione): generare un lotto di proposte da movimenti e scadenze"
```

---

### Task 7: La lettura del lotto, col controllo di freschezza

Una proposta conservata può riferirsi a una scadenza saldata nel frattempo.
Alla rilettura si ricontrolla e, se una delle due parti è cambiata, si marca da
sé come **superata** invece di mentire.

**Files:**
- Create: `src/lib/services/reconciliation-freshness.ts`
- Test: `src/lib/services/__tests__/reconciliation-freshness.itest.ts`

**Interfaces:**
- Consumes: modelli Prisma del Task 1
- Produces: `aggiornaFreschezza(batchId: string, venueId: string): Promise<number>` — torna quante proposte ha marcato superate

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `src/lib/services/__tests__/reconciliation-freshness.itest.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { aggiornaFreschezza } from '../reconciliation-freshness'

/**
 * CashKing conserva le proposte e basta, e ha dovuto aggiungere un contatore
 * "superseded" e un triangolo di conflitto per rattoppare a valle il fatto che
 * una proposta possa riferirsi a una fattura già pagata. Qui il controllo
 * avviene alla rilettura, prima che l'utente veda qualcosa.
 */
setupIntegrationDb()

async function lottoConUnaProposta(venueId: string) {
  const movimento = await prisma.bankTransaction.create({
    data: {
      venueId,
      transactionDate: new Date('2026-07-07'),
      description: 'Bonifico',
      amount: -100,
      status: 'PENDING',
    },
  })
  const scadenza = await creaScadenza({
    venueId,
    tipo: 'passiva',
    importoTotale: 100,
    dataScadenza: new Date('2026-07-07'),
    descrizione: 'Scadenza',
  })
  const lotto = await prisma.reconciliationBatch.create({
    data: {
      venueId,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regoleUsate: ['R1'],
      contaProposte: 1,
    },
  })
  const proposta = await prisma.reconciliationProposal.create({
    data: {
      batchId: lotto.id,
      regola: 'R1',
      punteggio: 90,
      fattori: {},
      motivazioni: [],
      bankTransactionId: movimento.id,
      gambe: { create: [{ scheduleId: scadenza.id, importo: 100 }] },
    },
  })
  return { movimento, scadenza, lotto, proposta }
}

describe('aggiornaFreschezza', () => {
  it('lascia stare una proposta le cui due parti sono ancora aperte', async () => {
    const venue = await venueDiTest()
    const { lotto, proposta } = await lottoConUnaProposta(venue.id)

    expect(await aggiornaFreschezza(lotto.id, venue.id)).toBe(0)

    const dopo = await prisma.reconciliationProposal.findUniqueOrThrow({ where: { id: proposta.id } })
    expect(dopo.stato).toBe('in_attesa')
  })

  it('marca superata la proposta la cui scadenza è stata saldata altrove', async () => {
    const venue = await venueDiTest()
    const { lotto, proposta, scadenza } = await lottoConUnaProposta(venue.id)

    await prisma.schedule.update({
      where: { id: scadenza.id },
      data: { stato: 'pagata', importoPagato: 100 },
    })

    expect(await aggiornaFreschezza(lotto.id, venue.id)).toBe(1)

    const dopo = await prisma.reconciliationProposal.findUniqueOrThrow({ where: { id: proposta.id } })
    expect(dopo.stato).toBe('superata')
  })

  it('marca superata la proposta il cui movimento è già stato riconciliato', async () => {
    const venue = await venueDiTest()
    const { lotto, proposta, movimento } = await lottoConUnaProposta(venue.id)

    await prisma.bankTransaction.update({
      where: { id: movimento.id },
      data: { status: 'MATCHED' },
    })

    expect(await aggiornaFreschezza(lotto.id, venue.id)).toBe(1)

    const dopo = await prisma.reconciliationProposal.findUniqueOrThrow({ where: { id: proposta.id } })
    expect(dopo.stato).toBe('superata')
  })

  it('non tocca le proposte già decise', async () => {
    const venue = await venueDiTest()
    const { lotto, proposta, scadenza } = await lottoConUnaProposta(venue.id)

    await prisma.reconciliationProposal.update({
      where: { id: proposta.id },
      data: { stato: 'approvata' },
    })
    await prisma.schedule.update({
      where: { id: scadenza.id },
      data: { stato: 'pagata', importoPagato: 100 },
    })

    expect(await aggiornaFreschezza(lotto.id, venue.id)).toBe(0)

    const dopo = await prisma.reconciliationProposal.findUniqueOrThrow({ where: { id: proposta.id } })
    expect(dopo.stato).toBe('approvata')
  })

  it('aggiorna il contatore delle superate sul lotto', async () => {
    const venue = await venueDiTest()
    const { lotto, scadenza } = await lottoConUnaProposta(venue.id)

    await prisma.schedule.update({
      where: { id: scadenza.id },
      data: { stato: 'annullata' },
    })

    await aggiornaFreschezza(lotto.id, venue.id)

    const dopo = await prisma.reconciliationBatch.findUniqueOrThrow({ where: { id: lotto.id } })
    expect(dopo.contaSuperate).toBe(1)
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `nvm use 22 && npm run test:integration -- reconciliation-freshness`
Expected: FAIL — il modulo `../reconciliation-freshness` non esiste.

- [ ] **Step 3: Scrivi l'implementazione**

Crea `src/lib/services/reconciliation-freshness.ts`:

```typescript
import { prisma } from '@/lib/prisma'

/**
 * Il controllo di freschezza delle proposte conservate.
 *
 * Conservare le proposte serve — storico, "Riprendi", e il referto dell'AI che
 * altrimenti andrebbe ripagato a ogni apertura — ma una proposta conservata
 * invecchia: la scadenza può essere stata saldata da un pagamento manuale, il
 * movimento riconciliato altrove.
 *
 * CashKing conserva e basta, e ha dovuto aggiungere un contatore e un triangolo
 * di conflitto per rattoppare il problema a valle. Qui si ricontrolla prima che
 * l'utente veda qualcosa: una proposta che non può più essere approvata si
 * marca da sé come superata invece di mentire.
 *
 * Le proposte già decise non si toccano: la loro storia è chiusa.
 */

/** Stati in cui una proposta è ancora lavorabile. */
const STATI_APERTI = ['in_attesa']

/** Stati di scadenza che rendono la proposta impossibile. */
const STATI_SCADENZA_CHIUSI = ['pagata', 'annullata']

/** Stati di movimento che rendono la proposta impossibile. */
const STATI_MOVIMENTO_CHIUSI = ['MATCHED', 'MANUAL', 'IGNORED']

export async function aggiornaFreschezza(batchId: string, venueId: string): Promise<number> {
  const proposte = await prisma.reconciliationProposal.findMany({
    where: {
      batchId,
      stato: { in: STATI_APERTI },
      batch: { venueId },
    },
    select: {
      id: true,
      bankTransaction: { select: { status: true, deletedAt: true } },
      gambe: {
        select: {
          importo: true,
          schedule: { select: { stato: true, importoTotale: true, importoPagato: true, deletedAt: true } },
        },
      },
    },
  })

  const daSuperare: string[] = []

  for (const proposta of proposte) {
    const movimento = proposta.bankTransaction
    if (movimento && (movimento.deletedAt !== null || STATI_MOVIMENTO_CHIUSI.includes(movimento.status))) {
      daSuperare.push(proposta.id)
      continue
    }

    const gambaMorta = proposta.gambe.some((gamba) => {
      const scadenza = gamba.schedule
      if (!scadenza) return false
      if (scadenza.deletedAt !== null) return true
      if (STATI_SCADENZA_CHIUSI.includes(scadenza.stato)) return true
      // Il residuo non basta più a coprire la quota che la proposta rivendica
      const residuo = Number(scadenza.importoTotale) - Number(scadenza.importoPagato)
      return residuo + 0.01 < Number(gamba.importo)
    })

    if (gambaMorta) daSuperare.push(proposta.id)
  }

  if (daSuperare.length === 0) return 0

  await prisma.$transaction([
    prisma.reconciliationProposal.updateMany({
      where: { id: { in: daSuperare } },
      data: { stato: 'superata' },
    }),
    prisma.reconciliationBatch.update({
      where: { id: batchId },
      data: { contaSuperate: { increment: daSuperare.length } },
    }),
  ])

  return daSuperare.length
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `nvm use 22 && npm run test:integration -- reconciliation-freshness`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/reconciliation-freshness.ts src/lib/services/__tests__/reconciliation-freshness.itest.ts
git commit -m "feat(riconciliazione): il controllo di freschezza, perché una proposta conservata invecchia"
```

---

### Task 8: Le rotte dei lotti

Quattro handler. Tutti con `withAuth` e `venueScoped`: lo script
`scripts/check-route-auth.mjs --ratchet` conta gli handler che non lo usano, e
la baseline è già sforata di due.

**Files:**
- Create: `src/app/api/riconciliazione-assistita/lotti/route.ts`
- Create: `src/app/api/riconciliazione-assistita/lotti/[id]/route.ts`
- Test: `src/app/api/riconciliazione-assistita/lotti/__tests__/lotti.itest.ts`

**Interfaces:**
- Consumes: `generaLotto` da `@/lib/services/reconciliation-batch-service`; `aggiornaFreschezza` da `@/lib/services/reconciliation-freshness`; `withAuth` da `@/lib/api-utils`
- Produces:
  - `POST /api/riconciliazione-assistita/lotti` → `201 { batchId, contaProposte, perFascia }`
  - `GET /api/riconciliazione-assistita/lotti` → `200 { lotti: [...] }`
  - `GET /api/riconciliazione-assistita/lotti/[id]` → `200 { lotto, proposte, contatori }`
  - `DELETE /api/riconciliazione-assistita/lotti/[id]` → `204`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `src/app/api/riconciliazione-assistita/lotti/__tests__/lotti.itest.ts`:

> **Le firme vere, verificate prima di scrivere questo blocco.** L'aiuto si
> chiama `callRoute`, non `chiamaRotta`; la richiesta si costruisce con
> `jsonRequest`; la risposta arriva già decodificata come `{ status, body }`,
> quindi **niente `await risposta.json()`**. E la sessione si monta con
> **`entraCome`**, non con `loginAs`: `withAuth` risponde 403 a un utente che
> non ha cambiato la password iniziale, e tutti gli utenti del seed nascono in
> quello stato — con `loginAs` ogni test misurerebbe solo il cambio password
> obbligatorio.
>
> Firme:
> - `jsonRequest(url, { method?, body?, headers?, searchParams? }): NextRequest`
> - `callRoute<TCorpo, TParams>(handler, request, params?): Promise<{ status, body, headers }>`
>   — per una rotta dinamica, se tipi il corpo **devi** tipare anche i parametri:
>   `callRoute<{ error?: string }, { id: string }>(GET_UNO, req, { id })`
> - `entraCome(ruolo: 'admin' | 'manager' | 'staff'): Promise<Session>`

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { POST, GET } from '../route'
import { GET as GET_UNO, DELETE } from '../[id]/route'

/**
 * Il vincolo che questi test difendono oltre al funzionamento: i contatori
 * contano proposte, e la somma delle fasce fa il totale in attesa. Chi filtra
 * su "Media" deve vedere qualcosa quando esiste una proposta da 77 punti.
 */
setupIntegrationDb()

const PERCORSO = '/api/riconciliazione-assistita/lotti'

/**
 * Monta la sessione e restituisce la sede che la route userà.
 *
 * Le due cose devono coincidere: la route è `venueScoped`, quindi legge la sede
 * dalla sessione, e le righe seminate su un'altra sede sarebbero invisibili.
 * L'admin del seed può non avere una sede in sessione — lì `withAuth` ricade su
 * `getVenueId()`, e questo aiuto fa lo stesso.
 */
async function sedeDiSessione(): Promise<string> {
  const sessione = await entraCome('admin')
  return sessione.user.venueId ?? (await venueDiTest()).id
}

interface CorpoLotto {
  batchId?: string
  contaProposte?: number
  error?: string
}

describe('POST /api/riconciliazione-assistita/lotti', () => {
  it('rifiuta un periodo rovesciato', async () => {
    await sedeDiSessione()
    const risposta = await callRoute<CorpoLotto>(
      POST,
      jsonRequest(PERCORSO, {
        method: 'POST',
        body: { dateFrom: '2026-08-31', dateTo: '2026-05-01', regole: ['R1'] },
      })
    )
    expect(risposta.status).toBe(400)
  })

  it('rifiuta una sigla di regola sconosciuta', async () => {
    await sedeDiSessione()
    const risposta = await callRoute<CorpoLotto>(
      POST,
      jsonRequest(PERCORSO, {
        method: 'POST',
        body: { dateFrom: '2026-05-01', dateTo: '2026-08-31', regole: ['R99'] },
      })
    )
    expect(risposta.status).toBe(400)
  })

  it('crea un lotto vuoto quando non c\'è nulla da abbinare', async () => {
    await sedeDiSessione()
    const risposta = await callRoute<CorpoLotto>(
      POST,
      jsonRequest(PERCORSO, {
        method: 'POST',
        body: { dateFrom: '2026-05-01', dateTo: '2026-08-31', regole: ['R1'] },
      })
    )
    expect(risposta.status).toBe(201)
    expect(risposta.body.contaProposte).toBe(0)
    expect(risposta.body.batchId).toBeTruthy()
  })

  it('nega l\'accesso a chi non è admin né manager', async () => {
    await entraCome('staff')
    const risposta = await callRoute<CorpoLotto>(
      POST,
      jsonRequest(PERCORSO, {
        method: 'POST',
        body: { dateFrom: '2026-05-01', dateTo: '2026-08-31', regole: ['R1'] },
      })
    )
    expect(risposta.status).toBe(403)
  })
})

describe('GET /api/riconciliazione-assistita/lotti', () => {
  it('elenca i lotti della sede, dal più recente', async () => {
    const venueId = await sedeDiSessione()
    await prisma.reconciliationBatch.createMany({
      data: [
        {
          venueId,
          dateFrom: new Date('2026-05-01'),
          dateTo: new Date('2026-06-30'),
          regoleUsate: ['R1'],
          createdAt: new Date('2026-08-01'),
        },
        {
          venueId,
          dateFrom: new Date('2026-07-01'),
          dateTo: new Date('2026-08-31'),
          regoleUsate: ['R1'],
          createdAt: new Date('2026-08-10'),
        },
      ],
    })

    const risposta = await callRoute<{ lotti: Array<{ createdAt: string }> }>(
      GET,
      jsonRequest(PERCORSO)
    )
    expect(risposta.status).toBe(200)
    expect(risposta.body.lotti).toHaveLength(2)
    expect(new Date(risposta.body.lotti[0].createdAt).getTime()).toBeGreaterThan(
      new Date(risposta.body.lotti[1].createdAt).getTime()
    )
  })
})

interface Contatori {
  totali: number
  inAttesa: number
  approvate: number
  scartate: number
  superate: number
  alta: number
  media: number
  bassa: number
}

describe('GET /api/riconciliazione-assistita/lotti/[id]', () => {
  it('restituisce contatori la cui somma per fascia fa il totale in attesa', async () => {
    const venueId = await sedeDiSessione()
    const lotto = await prisma.reconciliationBatch.create({
      data: {
        venueId,
        dateFrom: new Date('2026-07-01'),
        dateTo: new Date('2026-07-31'),
        regoleUsate: ['R1'],
        contaProposte: 3,
      },
    })
    // Uno per fascia: 92 alta, 70 media, 45 bassa
    for (const punteggio of [92, 70, 45]) {
      await prisma.reconciliationProposal.create({
        data: {
          batchId: lotto.id,
          regola: 'R1',
          punteggio,
          fattori: {},
          motivazioni: [],
        },
      })
    }

    const risposta = await callRoute<{ contatori: Contatori }, { id: string }>(
      GET_UNO,
      jsonRequest(`${PERCORSO}/${lotto.id}`),
      { id: lotto.id }
    )
    expect(risposta.status).toBe(200)

    const { contatori } = risposta.body
    expect(contatori.inAttesa).toBe(3)
    expect(contatori.alta + contatori.media + contatori.bassa).toBe(contatori.inAttesa)
    expect(contatori.alta).toBe(1)
    expect(contatori.media).toBe(1)
    expect(contatori.bassa).toBe(1)
  })

  it('risponde 404 per un lotto che non esiste in questa sede', async () => {
    await sedeDiSessione()
    const risposta = await callRoute<{ error?: string }, { id: string }>(
      GET_UNO,
      jsonRequest(`${PERCORSO}/inesistente`),
      { id: 'inesistente' }
    )
    expect(risposta.status).toBe(404)
  })
})

describe('DELETE /api/riconciliazione-assistita/lotti/[id]', () => {
  it('cancella un lotto non lavorato', async () => {
    const venueId = await sedeDiSessione()
    const lotto = await prisma.reconciliationBatch.create({
      data: {
        venueId,
        dateFrom: new Date('2026-07-01'),
        dateTo: new Date('2026-07-31'),
        regoleUsate: ['R1'],
      },
    })

    const risposta = await callRoute<null, { id: string }>(
      DELETE,
      jsonRequest(`${PERCORSO}/${lotto.id}`, { method: 'DELETE' }),
      { id: lotto.id }
    )
    expect(risposta.status).toBe(204)
    expect(await prisma.reconciliationBatch.findUnique({ where: { id: lotto.id } })).toBeNull()
  })

  it('rifiuta di cancellare un lotto con proposte già approvate', async () => {
    const venueId = await sedeDiSessione()
    const lotto = await prisma.reconciliationBatch.create({
      data: {
        venueId,
        dateFrom: new Date('2026-07-01'),
        dateTo: new Date('2026-07-31'),
        regoleUsate: ['R1'],
        contaApprovate: 1,
      },
    })

    const risposta = await callRoute<{ error?: string }, { id: string }>(
      DELETE,
      jsonRequest(`${PERCORSO}/${lotto.id}`, { method: 'DELETE' }),
      { id: lotto.id }
    )
    expect(risposta.status).toBe(409)
    expect(await prisma.reconciliationBatch.findUnique({ where: { id: lotto.id } })).not.toBeNull()
  })
})
```

> `venueDiTest` va importata da `@/test/integration/fixtures/closures`: serve
> solo dentro `sedeDiSessione`, come ripiego quando la sessione dell'admin non
> porta una sede.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `nvm use 22 && npm run test:integration -- lotti`
Expected: FAIL — le rotte non esistono.

- [ ] **Step 3: Scrivi la rotta di collezione**

Crea `src/app/api/riconciliazione-assistita/lotti/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { generaLotto } from '@/lib/services/reconciliation-batch-service'
import { SOGLIE } from '@/lib/reconciliation/punteggio'

/**
 * Le regole implementate nella Fase A1. R1, R2 e R3 percorrono lo stesso
 * codice — la sigla distingue solo se dietro la scadenza c'è una fattura
 * elettronica. R4 (banca ↔ prima nota) e R5 (giroconto) hanno una forma
 * diversa e arrivano nella A2; R6-R8 nelle fasi C e D.
 */
const REGOLE_NOTE = ['R1', 'R2', 'R3'] as const

const creaSchema = z
  .object({
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
    regole: z.array(z.enum(REGOLE_NOTE)).min(1, 'Almeno una regola'),
    sogliaMinima: z.number().int().min(0).max(100).optional(),
  })
  .refine((valore) => valore.dateFrom <= valore.dateTo, {
    message: 'La data iniziale deve precedere quella finale',
    path: ['dateFrom'],
  })

/** POST — genera un lotto di proposte sul periodo indicato. */
export const POST = withAuth(
  async (request, { venueId, user }) => {
    try {
      const validato = creaSchema.safeParse(await request.json())
      if (!validato.success) {
        return NextResponse.json(
          { error: 'Dati non validi', dettagli: validato.error.issues },
          { status: 400 }
        )
      }

      const { dateFrom, dateTo, regole, sogliaMinima } = validato.data

      const esito = await generaLotto({
        venueId,
        dateFrom,
        dateTo,
        regole: [...regole],
        userId: user.id ?? null,
        sogliaMinima: sogliaMinima ?? SOGLIE.MINIMA,
      })

      // La firma è `AuditLogParams` in src/lib/audit.ts: il campo è
      // `entityType`, non `entity`, e non esiste alcun `metadata` — i dati
      // dell'evento vanno in `newValues`.
      await createAuditLog({
        action: 'CREATE',
        entityType: 'ReconciliationBatch',
        entityId: esito.batchId,
        userId: user.id ?? null,
        venueId,
        newValues: { contaProposte: esito.contaProposte, regole: [...regole] },
      })

      return NextResponse.json(esito, { status: 201 })
    } catch (errore) {
      logger.error('Generazione del lotto di riconciliazione fallita', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)

/** GET — lo storico delle analisi, dalla più recente. */
export const GET = withAuth(
  async (_request, { venueId }) => {
    try {
      const lotti = await prisma.reconciliationBatch.findMany({
        where: { venueId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          dateFrom: true,
          dateTo: true,
          stato: true,
          contaProposte: true,
          contaApprovate: true,
          contaScartate: true,
          contaSuperate: true,
          aiRefertoAt: true,
          createdAt: true,
        },
      })

      return NextResponse.json({ lotti })
    } catch (errore) {
      logger.error('Lettura dello storico dei lotti fallita', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

> Verifica la firma di `createAuditLog` in `src/lib/audit.ts` prima di usarla:
> se i nomi dei campi differiscono, adegua la chiamata invece di cambiare
> l'helper.

- [ ] **Step 4: Scrivi la rotta del singolo lotto**

Crea `src/app/api/riconciliazione-assistita/lotti/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { fascia } from '@/lib/reconciliation/punteggio'
import { aggiornaFreschezza } from '@/lib/services/reconciliation-freshness'

interface Parametri {
  id: string
}

/**
 * GET — il lotto con le sue proposte.
 *
 * Prima di rispondere si ricontrolla la freschezza: una proposta la cui
 * scadenza è stata saldata altrove si marca superata invece di comparire come
 * approvabile.
 *
 * I contatori contano **proposte**, sempre. La somma delle tre fasce deve fare
 * il totale in attesa: è il difetto più visibile di CashKing, e nasce dal
 * contare proposte in un posto e schede in un altro.
 */
export const GET = withAuth<Parametri>(
  async (_request, { venueId, params }) => {
    try {
      const lotto = await prisma.reconciliationBatch.findFirst({
        where: { id: params.id, venueId },
        select: {
          id: true,
          dateFrom: true,
          dateTo: true,
          regoleUsate: true,
          sogliaMinima: true,
          stato: true,
          contaProposte: true,
          contaApprovate: true,
          contaScartate: true,
          contaSuperate: true,
          aiReferto: true,
          aiRefertoAt: true,
          createdAt: true,
        },
      })

      if (!lotto) {
        return NextResponse.json({ error: 'Lotto non trovato' }, { status: 404 })
      }

      await aggiornaFreschezza(lotto.id, venueId)

      const proposte = await prisma.reconciliationProposal.findMany({
        where: { batchId: lotto.id },
        orderBy: [{ stato: 'asc' }, { punteggio: 'desc' }],
        select: {
          id: true,
          regola: true,
          punteggio: true,
          fattori: true,
          motivazioni: true,
          stato: true,
          bankTransaction: {
            select: { id: true, transactionDate: true, description: true, amount: true },
          },
          gambe: {
            select: {
              id: true,
              importo: true,
              schedule: {
                select: {
                  id: true,
                  descrizione: true,
                  dataScadenza: true,
                  numeroDocumento: true,
                  controparteNome: true,
                  importoTotale: true,
                  importoPagato: true,
                  invoice: { select: { id: true, invoiceNumber: true, supplierName: true } },
                },
              },
            },
          },
        },
      })

      const inAttesa = proposte.filter((p) => p.stato === 'in_attesa')
      const contatori = {
        totali: proposte.length,
        inAttesa: inAttesa.length,
        approvate: proposte.filter((p) => p.stato === 'approvata').length,
        scartate: proposte.filter((p) => p.stato === 'scartata').length,
        superate: proposte.filter((p) => p.stato === 'superata').length,
        alta: inAttesa.filter((p) => fascia(p.punteggio) === 'alta').length,
        media: inAttesa.filter((p) => fascia(p.punteggio) === 'media').length,
        bassa: inAttesa.filter((p) => fascia(p.punteggio) === 'bassa').length,
      }

      return NextResponse.json({ lotto, proposte, contatori })
    } catch (errore) {
      logger.error('Lettura del lotto fallita', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)

/** DELETE — cancella un lotto su cui non è stato deciso nulla. */
export const DELETE = withAuth<Parametri>(
  async (_request, { venueId, params }) => {
    try {
      const lotto = await prisma.reconciliationBatch.findFirst({
        where: { id: params.id, venueId },
        select: { id: true, contaApprovate: true },
      })

      if (!lotto) {
        return NextResponse.json({ error: 'Lotto non trovato' }, { status: 404 })
      }

      if (lotto.contaApprovate > 0) {
        return NextResponse.json(
          { error: 'Il lotto contiene approvazioni: cancellarlo perderebbe la traccia di cosa è stato deciso' },
          { status: 409 }
        )
      }

      // Le proposte e le gambe cadono per cascata (vedi la migrazione)
      await prisma.reconciliationBatch.delete({ where: { id: lotto.id } })

      return new NextResponse(null, { status: 204 })
    } catch (errore) {
      logger.error('Cancellazione del lotto fallita', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

- [ ] **Step 5: Esegui il test e verifica che passi**

Run: `nvm use 22 && npm run test:integration -- lotti`
Expected: PASS, 8 test.

- [ ] **Step 6: Verifica che il cricchetto delle autorizzazioni non salga**

Run: `nvm use 22 && node scripts/check-route-auth.mjs --ratchet`
Expected: il conteggio non deve aumentare rispetto a prima di questo task. Le quattro rotte nuove usano tutte `withAuth`.

- [ ] **Step 7: Verifica tipi e build**

Run: `nvm use 22 && npx tsc --noEmit && npm run build`
Expected: nessun errore. **Non usare `| tail`**: l'exit code diventerebbe quello di `tail`, e la build è l'unico controllo che vede un import da client verso Prisma.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/riconciliazione-assistita
git commit -m "feat(riconciliazione): le rotte dei lotti, coi contatori che tornano"
```

---

### Task 9: La misurazione sui 678 movimenti veri

Il collaudo che nessun test verde sostituisce. *Un log verde non distingue «non
ha trovato niente» da «ha sbagliato tutto»*, e un motore mai esposto a dati veri
assomiglia moltissimo a un motore che funziona.

**Files:**
- Create: `scripts/riconciliazione/misura-motore.ts`
- Create: `scripts/riconciliazione/README.md`

**Interfaces:**
- Consumes: gli snapshot in `scripts/gocardless/snapshots/*transactions*.json`; `valutaCoppia`, `fascia`, `SOGLIE` da `@/lib/reconciliation/punteggio`
- Produces: uno script eseguibile con `npx tsx scripts/riconciliazione/misura-motore.ts`

- [ ] **Step 1: Conferma la forma degli snapshot**

La struttura è stata verificata il 13 agosto 2026 ed è questa:

```
{ richiesta: {...}, risposta: { stato, quando, headers, corpo: {
    transactions: { booked: [...], pending: [...] }, last_updated } } }
```

Ogni movimento ha: `transactionId`, `entryReference`, `endToEndId`,
`bookingDate`, `valueDate`, `transactionAmount`, `remittanceInformationUnstructured`,
`proprietaryBankTransactionCode`, `internalTransactionId`. Un file di conto
contiene 318 movimenti *booked*; i conti sono due.

Riconfermala prima di procedere, perché se qualcuno ha rilanciato la sonda nel
frattempo il formato potrebbe essere cambiato:

```bash
nvm use 22 && node -e "
const fs=require('fs');
const f=fs.readdirSync('scripts/gocardless/snapshots').find(n=>n.includes('transactions'));
const d=JSON.parse(fs.readFileSync('scripts/gocardless/snapshots/'+f,'utf8'));
const tx=d.risposta.corpo.transactions;
console.log('booked:', tx.booked.length, 'pending:', tx.pending.length);
console.log('chiavi:', Object.keys(tx.booked[0]).join(', '));
"
```
Expected: `booked: 318 pending: 0` e l'elenco di chiavi qui sopra.

- [ ] **Step 2: Scrivi lo script**

Crea `scripts/riconciliazione/misura-motore.ts`:

```typescript
/**
 * Misura il motore di riconciliazione sui movimenti veri.
 *
 * Non è un test: è una misurazione. La differenza conta, perché un test verde
 * dice "non è esploso" mentre qui serve sapere *quante* proposte escono, in che
 * fascia, e con quale distribuzione dei fattori. Un motore che non trova niente
 * e un motore che funziona superano gli stessi test finché l'ingresso è vuoto.
 *
 * Uso:
 *   npx tsx scripts/riconciliazione/misura-motore.ts
 *   npx tsx scripts/riconciliazione/misura-motore.ts --scadenze=percorso.json
 *
 * Senza `--scadenze` misura solo la distribuzione dei fattori estraibili dalle
 * causali (riferimento e controparte), che è già il dato più utile: dice quanti
 * movimenti hanno un numero fattura leggibile e quanti nominano una controparte.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { estraiRiferimentiDocumento, estraiPartiteIva, normalizzaTesto } from '../../src/lib/reconciliation/causale'

const CARTELLA_SNAPSHOT = join(process.cwd(), 'scripts/gocardless/snapshots')

interface MovimentoSnapshot {
  transactionId?: string
  internalTransactionId?: string
  entryReference?: string
  endToEndId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount?: { amount?: string; currency?: string }
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
  proprietaryBankTransactionCode?: string
}

/**
 * Gli snapshot avvolgono la risposta: `risposta.corpo.transactions.{booked,pending}`.
 * La deduplicazione è su `internalTransactionId` e non su `transactionId`,
 * perché quest'ultimo **collide fra conti diversi** — 249 collisioni su 678
 * osservate nella Fase 0.
 */
function leggiMovimenti(): MovimentoSnapshot[] {
  const file = readdirSync(CARTELLA_SNAPSHOT).filter((n) => n.includes('transactions'))
  const perChiave = new Map<string, MovimentoSnapshot>()

  for (const nome of file) {
    const contenuto = JSON.parse(readFileSync(join(CARTELLA_SNAPSHOT, nome), 'utf8'))
    const transazioni = contenuto?.risposta?.corpo?.transactions
    if (!transazioni) continue

    for (const chiave of ['booked', 'pending'] as const) {
      const elenco = transazioni[chiave]
      if (!Array.isArray(elenco)) continue
      for (const movimento of elenco) {
        const identita =
          movimento.internalTransactionId ?? `${nome}:${movimento.transactionId ?? ''}`
        perChiave.set(identita, movimento)
      }
    }
  }

  return [...perChiave.values()]
}

function causaleDi(movimento: MovimentoSnapshot): string {
  if (movimento.remittanceInformationUnstructured) {
    return movimento.remittanceInformationUnstructured
  }
  return (movimento.remittanceInformationUnstructuredArray ?? []).join(' ')
}

function main(): void {
  const movimenti = leggiMovimenti()

  if (movimenti.length === 0) {
    console.error(
      'Nessun movimento trovato in ' + CARTELLA_SNAPSHOT + '.\n' +
      'Controlla i nomi dei campi contro un file vero prima di concludere che il motore non funziona.'
    )
    process.exit(1)
  }

  const uscite = movimenti.filter((m) => Number(m.transactionAmount?.amount ?? 0) < 0)
  const entrate = movimenti.filter((m) => Number(m.transactionAmount?.amount ?? 0) >= 0)

  const conRiferimento = (gruppo: MovimentoSnapshot[]) =>
    gruppo.filter((m) => estraiRiferimentiDocumento(causaleDi(m)).length > 0).length

  const quota = (n: number, su: number) => (su === 0 ? '—' : `${((n / su) * 100).toFixed(1)}%`)

  console.log(`\nMovimenti letti (deduplicati su internalTransactionId): ${movimenti.length}\n`)

  // **Separati per verso, e il motivo non è cosmetico.** Un incasso da SumUp o
  // da Stripe non cita una *nostra* fattura per costruzione: metterlo nello
  // stesso denominatore dei pagamenti ai fornitori produce una percentuale
  // bassa che sembra un difetto delle espressioni regolari e non lo è.
  for (const [nome, gruppo] of [
    ['USCITE', uscite],
    ['ENTRATE', entrate],
    ['TUTTI', movimenti],
  ] as const) {
    const n = conRiferimento(gruppo)
    console.log(
      `${nome.padEnd(8)} ${String(gruppo.length).padStart(4)} movimenti — con riferimento: ${String(n).padStart(3)} (${quota(n, gruppo.length)})`
    )
  }

  const conPartitaIva = movimenti.filter((m) => estraiPartiteIva(causaleDi(m)).length > 0).length
  const conCodice = movimenti.filter((m) => m.proprietaryBankTransactionCode).length
  console.log(`\nCon una partita IVA nella causale:    ${conPartitaIva} (${quota(conPartitaIva, movimenti.length)})`)
  console.log(`Con un codice operazione della banca:  ${conCodice} (${quota(conCodice, movimenti.length)})`)

  // **La tabella che conta davvero.** Non la frequenza del codice, ma il codice
  // incrociato con la presenza di un riferimento e con un esempio di causale:
  // è così che si capisce *cosa* è ciascun codice, e quindi come popolare
  // `mappaCodiciBanca`. Un codice che copre il 30% delle uscite e non ha mai un
  // riferimento non è un difetto: sono le commissioni bancarie, che una fattura
  // non ce l'hanno.
  console.log('\nCodici operazione delle USCITE — frequenza, riferimenti, e un esempio:')
  const perCodice = new Map<string, MovimentoSnapshot[]>()
  for (const m of uscite) {
    const codice = m.proprietaryBankTransactionCode ?? '(assente)'
    const gruppo = perCodice.get(codice)
    if (gruppo) gruppo.push(m)
    else perCodice.set(codice, [m])
  }
  for (const [codice, gruppo] of [...perCodice.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const n = conRiferimento(gruppo)
    const esempio = normalizzaTesto(causaleDi(gruppo[0])).slice(0, 60)
    console.log(
      `  ${codice.padEnd(10)} ${String(gruppo.length).padStart(4)} (${quota(gruppo.length, uscite.length).padStart(6)})  rif: ${String(n).padStart(3)}  ${esempio}`
    )
  }

  console.log('\nOtto uscite senza riferimento leggibile (col loro codice):')
  let mostrate = 0
  for (const m of uscite) {
    if (mostrate >= 8) break
    const causale = causaleDi(m)
    if (estraiRiferimentiDocumento(causale).length > 0) continue
    console.log(`  [${m.proprietaryBankTransactionCode}] ${normalizzaTesto(causale).slice(0, 100)}`)
    mostrate++
  }
  console.log()
}

main()
```

- [ ] **Step 3: Esegui la misurazione**

Run: `nvm use 22 && npx tsx scripts/riconciliazione/misura-motore.ts`
Expected: il rapporto. **Leggi i numeri, non limitarti a vedere che gira.**

> **Numeri attesi, misurati il 14 agosto 2026 prima di scrivere questo passo.**
> Servono da controllo: se il tuo output diverge molto, qualcosa non va nel
> codice, non nei dati.
>
> - **621 movimenti** deduplicati (il totale grezzo di 678 contiene i duplicati
>   fra i due conti — è il difetto di `transactionId` già noto dalla Fase 0)
> - USCITE 392, con riferimento **10,2%** · ENTRATE 229, con riferimento **0,4%**
> - codice operazione presente sul **100%**, partita IVA nel 2,6%
> - fra le uscite: `16//37` 31% (commissioni), `26//11` 24% (bonifici internet
>   banking), `31//22` 13%, `39//11` 4% (emolumenti)

Tre cose vanno guardate, e la prima **non è quella che sembra**:

1. **La percentuale bassa di riferimenti non è un difetto delle espressioni
   regolari.** Lo si vede dalla tabella per codice: il codice più frequente
   fra le uscite sono le **commissioni bancarie**, che una fattura non ce
   l'hanno; le entrate sono incassi SumUp e Stripe, che non citano una *nostra*
   fattura per costruzione. Il denominatore giusto non è «tutti i movimenti» ma
   «i movimenti che sono davvero pagamenti a fornitori» — e il codice della
   banca è ciò che li identifica. Guarda la percentuale di riferimenti **dentro
   `26//11`**: quello è il numero che dice se le espressioni regolari funzionano.
2. **La tabella dei codici incrociata coi riferimenti è la mappa
   `mappaCodiciBanca` in forma grezza.** Ogni codice va identificato leggendo
   l'esempio di causale accanto, e tradotto nel metodo di pagamento atteso.
3. **Se un solo codice coprisse quasi tutto**, il fattore codice banca non
   discriminerebbe e i suoi dieci punti andrebbero redistribuiti. **Non è il
   caso**: il più frequente sta al 31% e i primi quattro separano commissioni,
   bonifici, incassi e stipendi. Il fattore è buono.

- [ ] **Step 4: Scrivi il rapporto**

Crea `scripts/riconciliazione/README.md` con i numeri ottenuti, la tabella dei
codici, e la conclusione su quale delle tre cose sopra si è verificata. Questo
documento è l'ingresso della decisione sulla soglia di 85 e sulla mappa dei
codici, entrambe segnate come domande aperte nella spec.

- [ ] **Step 5: Commit**

```bash
git add scripts/riconciliazione
git commit -m "chore(riconciliazione): misurare il motore sui movimenti veri della Fase 0"
```

---

## Verifica finale della fase

- [ ] `nvm use 22 && npm run test:run` — tutti i test unitari verdi
- [ ] `nvm use 22 && npm run test:integration` — tutti i test di integrazione verdi
- [ ] `nvm use 22 && npx tsc --noEmit` — nessun errore di tipo
- [ ] `nvm use 22 && npm run lint` — nessun **errore** (i warning preesistenti restano)
- [ ] `nvm use 22 && npm run build` — **senza `| tail`**
- [ ] `nvm use 22 && node scripts/check-route-auth.mjs --ratchet` — il conteggio non è salito
- [ ] `nvm use 22 && npm run rls:check` — nessuna tabella scoperta
- [ ] Il rapporto in `scripts/riconciliazione/README.md` esiste e contiene numeri veri

## Cosa NON è in questa fase

Sono la Fase A2, e vanno pianificate a parte **dopo** aver letto il rapporto del
Task 9:

- l'approvazione, con la promozione della riga bancaria a movimento di prima nota;
- **`raggruppaConflitti`**, e con essa la distinzione fra proposte in conflitto
  e proposte complementari: serve all'approvazione per decidere cosa marcare
  superato, e prima di allora sarebbe codice esportato e mai chiamato;
- lo scarto, singolo e permanente;
- l'annullamento;
- la scrittura degli alias e la schermata che li rende ispezionabili;
- **R4** (banca ↔ prima nota, cioè il `matcher.ts` di oggi portato nella coda) e
  **R5** (giroconto banca ↔ banca): hanno una forma diversa dalle prime tre —
  non c'è una scadenza a destra — e meritano ciascuna il proprio task;
- la schermata: coda, selezione multipla, riconciliazione a mano, storico.

La ragione dell'ordine: **il Task 9 produce il numero che decide la soglia di 85**,
e la fascia Alta è quella che si approverà in blocco senza aprire le schede.
Costruire quella schermata prima di sapere se la fascia è affidabile significa
costruirla sopra un parametro non misurato.
