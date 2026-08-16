# Estratto conto nella prima nota — consegna A: la lista

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** appena importate, le righe della banca si vedono e si lavorano in *Prima nota → Movimenti → Conto Bancario → Estratto conto*, in una lista ricopiata da `/transactions` di CashKing: schede Attivi/Deleghe F24/CBILL-PagoPA/Cestino coi conteggi, totali, colonne scegliibili, ordinamento lato server, filtri, selezione multipla, legenda; modifica di descrizione/causale/note con cronologia (data e importo restano della banca), Sposta in, Cestino, Nuovo movimento, Importa CSV. Nessuna scrittura contabile viene creata: quella è la consegna B.

**Architecture:** tre campi nuovi sulla riga di banca (`causale`, `descrizione`, `note`) più la `sezione` e una tabella di cronologia; una funzione pura `separaCausale` che spacca il testo grezzo della banca (mapper, import CSV, ricalcolo delle 231 righe esistenti); la rotta `GET /api/bank-transactions` estesa con ordinamento, sezione, cestino, totali, conteggi e lo stato della legenda calcolato dal server; quattro rotte nuove (`PATCH [id]`, `[id]/sezione`, `[id]/ripristina`, `azioni-in-blocco`, `[id]/cronologia`); una cartella di componenti `src/components/banca/estratto-conto/` montata da `MovimentiClient` quando `register=BANK`.

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + PostgreSQL, TanStack Query, shadcn/ui (Radix), Vitest (unit jsdom + integrazione su PostgreSQL locale 5433), zod.

**Spec:** `docs/superpowers/specs/2026-08-16-movimenti-bancari-in-prima-nota-design.md` — il piano argomenta dalla spec; chi esegue legge entrambi.

## Global Constraints

- **Node 22 via nvm, sempre**: ogni comando `npm`/`npx` va lanciato come `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx …` (il `source nvm.sh` non passa il guard del worktree).
- **Mai `prisma db push` né `prisma migrate dev`** contro il `.env` del worktree: punta alla produzione. Le migrazioni si scrivono a mano in `prisma/migrations/<timestamp>_<nome>/migration.sql`.
- **Test d'integrazione**: `TEST_DB_SUFFIX=estratto PATH=… npx vitest run --config vitest.integration.config.ts <file>` (PostgreSQL locale sul 5433, database `weiss_itest_estratto_*`; il suffisso evita di calpestare altri worktree).
- **Ogni rotta nuova passa da `withAuth`** con `{ roles: ['admin', 'manager'], venueScoped: true }`; il cricchetto `node scripts/check-route-auth.mjs --ratchet` non deve salire (baseline 254 in `scripts/check-route-auth.mjs:292`; alla fine si abbassa al numero misurato, mai si alza).
- **Data, data valuta, importo, verso, conto, codice banca, identificativo del provider sono immutabili** sulle righe non `MANUAL`: la `PATCH` li rifiuta con 400.
- **`description` è il testo grezzo della banca e non si scrive mai** dopo l'import; il testo che si legge è `descrizione ?? description`.
- **Nuove rotte sotto `/api/bank-transactions`** (esiste, in inglese): nessuna gemella in italiano.
- **Niente UI che promette ciò che non c'è**: le icone Collega/Riconcilia e la colonna Categoria arrivano con la consegna B e qui non compaiono.
- **Testi UI in italiano**, con gli accenti giusti; commenti nel codice che dicono *perché*.
- **Commit piccoli**, uno per task, con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **La build va eseguita, in entrambe le forme** (`npm run build` e `npx next build --webpack`), senza `| tail`.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/lib/banca/separa-causale.ts` (+ `__tests__/separa-causale.test.ts`) | la funzione pura testo grezzo → causale + descrizione, con la tabella dei 20 codici |
| `prisma/schema.prisma`, `prisma/migrations/20260816180000_estratto_conto_in_prima_nota/migration.sql` | campi nuovi, enum `SezioneMovimentoBancario`, tabella `bank_transaction_edits` |
| `src/lib/gocardless/mapper.ts`, `src/lib/services/bank-sync-service.ts` | il mapper produce `causale`/`descrizione`, il servizio le scrive |
| `src/app/api/bank-transactions/import/route.ts`, `src/components/reconciliation/ImportDialog.tsx` | l'import CSV riceve il conto e scrive causale/descrizione |
| `src/lib/banca/ricalcola-causali.ts` (+ itest), `scripts/banca/ricalcola-causali.ts` | il ricalcolo idempotente delle righe esistenti |
| `src/types/reconciliation.ts` | i tipi condivisi client/server (`RigaEstrattoConto`, `StatoLegenda`, `SezioneMovimentoBancario`, …) |
| `src/lib/banca/stato-legenda.ts` (+ test) | stato e residuo da riga + riconciliazioni |
| `src/lib/banca/filtri-estratto-conto.ts` (+ test) | schema zod dei filtri, lettura/scrittura dall'URL — **senza Prisma**, lo importa anche il client |
| `src/lib/banca/query-estratto-conto.ts` | `where`/`orderBy` Prisma dai filtri, la `select` della riga, `mappaRiga` |
| `src/lib/banca/cronologia.ts` | `registraModifiche` per la tabella di cronologia |
| `src/lib/validations/reconciliation.ts` | schemi zod: creazione manuale (conto obbligatorio, causale, note), `PATCH`, sezione, azioni in blocco |
| `src/app/api/bank-transactions/route.ts` | `GET` esteso; `POST` con conto obbligatorio |
| `src/app/api/bank-transactions/[id]/route.ts` | `PATCH` nuova; `DELETE` con la regola nuova |
| `src/app/api/bank-transactions/[id]/{cronologia,sezione,ripristina}/route.ts`, `src/app/api/bank-transactions/azioni-in-blocco/route.ts` | le rotte nuove |
| `src/components/banca/estratto-conto/*` | la lista e i suoi pezzi (schede, filtri, tabella, colonne, selezione, paginazione, legenda, dialoghi) |
| `src/app/(dashboard)/prima-nota/movimenti/MovimentiClient.tsx` | monta l'estratto conto su `register=BANK`, sotto-schede, cartello solo su «Tutti» |
| `src/components/settings/StatoSincronizzazione.tsx`, `ConnessioniBancarie.tsx`, `src/components/banca/MovimentiBancariInAttesa.tsx` | i link e le frasi puntano ai movimenti bancari della prima nota |
| `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx`, `src/components/reconciliation/BankTransactionTable.tsx` | via Importa CSV, freschezza e «Ignora» |
| rimossi: `src/app/api/bank-transactions/[id]/ignore/route.ts`, `ignoreTransaction` in `src/lib/reconciliation/matcher.ts`, `src/app/api/prima-nota/import/**`, `src/components/prima-nota/movimenti/CaricaMovimentiDialog.tsx` | le porte che la spec chiude |

---

## Task 1: `separaCausale`, la funzione pura

**Files:**
- Create: `src/lib/banca/separa-causale.ts`
- Test: `src/lib/banca/__tests__/separa-causale.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CausaleSeparata { causale: string | null; descrizione: string }
  export function separaCausale(testoGrezzo: string, codiceBanca: string | null): CausaleSeparata
  export const CAUSALI_PER_CODICE: Readonly<Record<string, { prefisso: string; causale: string }>>
  ```

- [ ] **Step 1: scrivere i test coi testi veri**

`src/lib/banca/__tests__/separa-causale.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { separaCausale, CAUSALI_PER_CODICE } from '../separa-causale'

// I testi sono quelli veri di Banca Della Marca (snapshot della Fase 0, 12/08):
// la regola è misurata su 335 righe su 335, e questi venti casi sono la misura.
const CASI: Array<[codice: string, grezzo: string, causale: string, descrizione: string]> = [
  ['15//10', 'Addebito rata mutuo *003/234159/057 Scad.:29/07/2026 Cap.: 1.344,70 Int.: 25,28 Spese: 2,50 Altro: 0,00 D', 'Addebito rata mutuo', '003/234159/057 Scad.:29/07/2026 Cap.: 1.344,70 Int.: 25,28 Spese: 2,50 Altro: 0,00 D'],
  ['16//00', 'Commissioni', 'Commissioni', ''],
  ['16//32', 'Comm. richiesta incasso SEPA B2B', 'Commissione richiesta incasso SEPA B2B', ''],
  ['16//33', 'Comm. richiesta incasso SEPA B2C', 'Commissione richiesta incasso SEPA B2C', ''],
  ['16//37', 'Commissioni su bonifico tramite in', 'Commissioni su bonifico tramite internet banking', ''],
  ['19//05', 'Imposta di bollo Imposta di bollo al 30/06/2026', 'Imposta di bollo', 'Imposta di bollo al 30/06/2026'],
  ['19//83', 'Imposte e tasse:Delega Unificata(p C.ATT:28334965036/73', 'Imposte e tasse: delega unificata', 'C.ATT:28334965036/73'],
  ['26//11', 'Bonifico tramite Internet Banking *INSTANT DEL 06/08/2026 ORE 14:36 ID. 0708400041647044486499064990IT BEN PICCIN FRIGORIFERI SRLFDI/0000505', 'Bonifico tramite internet banking', 'INSTANT DEL 06/08/2026 ORE 14:36 ID. 0708400041647044486499064990IT BEN PICCIN FRIGORIFERI SRLFDI/0000505'],
  ['26//20', 'Vs disposizione permanente a favor *SCARPA NICOLA RIMBORSO FINANZIAMENTO SO', 'Vs disposizione permanente a favore', 'SCARPA NICOLA RIMBORSO FINANZIAMENTO SO'],
  ['31//21', 'SDD B2B - Richiesta Incasso SEPA FATTURA N. EE01041766/2026 DEL 16-0 Segnoverde S.p.A. unipersonale 94R8812024000000042903', 'SDD B2B - Richiesta incasso SEPA', 'FATTURA N. EE01041766/2026 DEL 16-0 Segnoverde S.p.A. unipersonale 94R8812024000000042903'],
  ['31//22', 'SDD Core - Richiesta Incasso SEPA 07267377566872 AMERICAN EXPRESS PAYMENTS EUSL 7043090000007377566872', 'SDD Core - Richiesta incasso SEPA', '07267377566872 AMERICAN EXPRESS PAYMENTS EUSL 7043090000007377566872'],
  ['34//00', 'Giro conto *WEISS S.R.L. Giroconto', 'Giro conto', 'WEISS S.R.L. Giroconto'],
  ['39//11', 'Disposizione per emolumenti intern *BONIFICI DEL 20260807 QTA 8', 'Disposizione per emolumenti', 'BONIFICI DEL 20260807 QTA 8'],
  ['45//15', 'Carta del Credito Cooperativo ******************354 CCP DIRECT ISSUING', 'Carta del Credito Cooperativo', '*****************354 CCP DIRECT ISSUING'],
  ['48//00', 'Bonifico a vs favore *WORLDLINE MERCHANT SERVICES ITALIA FSCR0000003651-0000043083 059147785 OP DEL. 10082026', 'Bonifico a vs favore', 'WORLDLINE MERCHANT SERVICES ITALIA FSCR0000003651-0000043083 059147785 OP DEL. 10082026'],
  ['52//30', 'Prelevamento contante allo sportel', 'Prelevamento contante allo sportello', ''],
  ['68//00', 'Storno scritture *TESOLIN AURORA STIPENDIO MESE APRILE 2026', 'Storno scritture', 'TESOLIN AURORA STIPENDIO MESE APRILE 2026'],
  ['78//10', 'Versamento contante allo sportello', 'Versamento contante allo sportello', ''],
  ['78//50', 'Versamento contante tramite CSA - Versamento Carta: 305282 Effettuato da ATM: 01759', 'Versamento contante tramite CSA', 'Versamento Carta: 305282 Effettuato da ATM: 01759'],
  ['79//00', 'Disposizione di giro conto *WEISS SRL 626420100001 BS 190,00+ COM 1,90- BK 00+ COM 0,90-/BENEF/626420100001 BS 190,00+ COM 1,90- BK 90,00+ COM 0,90-', 'Disposizione di giro conto', 'WEISS SRL 626420100001 BS 190,00+ COM 1,90- BK 00+ COM 0,90-/BENEF/626420100001 BS 190,00+ COM 1,90- BK 90,00+ COM 0,90-'],
]

describe('separaCausale: i venti codici veri', () => {
  it.each(CASI)('%s → «%s»', (codice, grezzo, causale, descrizione) => {
    expect(separaCausale(grezzo, codice)).toEqual({ causale, descrizione })
  })

  it('la tabella copre esattamente i venti codici osservati', () => {
    expect(Object.keys(CAUSALI_PER_CODICE).sort()).toEqual(CASI.map((c) => c[0]).sort())
  })
})

describe('separaCausale: i controesempi', () => {
  it('codice ignoto con asterisco: taglia lì', () => {
    expect(separaCausale('Operazione nuova *DETTAGLIO 123', '99//99')).toEqual({
      causale: 'Operazione nuova',
      descrizione: 'DETTAGLIO 123',
    })
  })

  it('codice ignoto senza asterisco: nessuna causale, testo intero', () => {
    expect(separaCausale('Operazione nuova senza separatore', '99//99')).toEqual({
      causale: null,
      descrizione: 'Operazione nuova senza separatore',
    })
  })

  it('codice nullo (import CSV): vale la regola dell\'asterisco', () => {
    expect(separaCausale('Bonifico a vs favore *ROSSI SRL', null)).toEqual({
      causale: 'Bonifico a vs favore',
      descrizione: 'ROSSI SRL',
    })
  })

  // Il prefisso della tabella è quello della banca: un testo che, pur con un
  // codice noto, non comincia così non va spezzato a caso.
  it('codice noto ma testo che non comincia col prefisso: ripiega sull\'asterisco o sul testo intero', () => {
    expect(separaCausale('Testo inatteso della banca', '48//00')).toEqual({
      causale: null,
      descrizione: 'Testo inatteso della banca',
    })
  })

  // La carta ha il numero mascherato subito dopo la causale: si toglie UN solo
  // asterisco separatore, gli altri restano a mascherare.
  it('toglie un solo asterisco separatore', () => {
    expect(separaCausale('Carta del Credito Cooperativo ***1234 ESERCENTE', '45//15').descrizione).toBe(
      '**1234 ESERCENTE'
    )
  })

  it('confronta il prefisso senza distinguere le maiuscole', () => {
    expect(separaCausale('BONIFICO A VS FAVORE *ACME', '48//00')).toEqual({
      causale: 'Bonifico a vs favore',
      descrizione: 'ACME',
    })
  })

  it('un testo vuoto resta vuoto, senza causale', () => {
    expect(separaCausale('', '48//00')).toEqual({ causale: null, descrizione: '' })
  })
})
```

- [ ] **Step 2: eseguirli e vederli fallire**

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca/__tests__/separa-causale.test.ts`
Atteso: rosso, «Failed to resolve import "../separa-causale"».

- [ ] **Step 3: scrivere la funzione**

`src/lib/banca/separa-causale.ts`:

```ts
/**
 * Dal testo grezzo della banca a causale + descrizione.
 *
 * La banca scrive «<tipo di operazione> *<dettagli>»: `Bonifico a vs favore
 * *WORLDLINE MERCHANT SERVICES…`. CashKing mostra i due pezzi in due colonne
 * («Causale» e «Descrizione»); noi li tenevamo incollati in `description`, che
 * da questa spec resta il testo grezzo intoccabile mentre `causale` e
 * `descrizione` sono i campi che si leggono e si modificano.
 *
 * La tabella dei prefissi è **misurata** sui 335 movimenti grezzi della Fase 0
 * (spec, «separaCausale»): tutti cadono nel caso 1. La banca tronca la propria
 * causale a 34 caratteri (`Commissioni su bonifico tramite in`): la colonna
 * `causale` della tabella completa la parola. È la tabella di Banca Della
 * Marca, come `codici-banca.ts`: un secondo istituto la vorrà spezzata per
 * istituto.
 */

export interface CausaleSeparata {
  causale: string | null
  descrizione: string
}

/** Codice operazione → prefisso grezzo scritto dalla banca e causale pulita. */
export const CAUSALI_PER_CODICE: Readonly<Record<string, { prefisso: string; causale: string }>> = {
  '15//10': { prefisso: 'Addebito rata mutuo', causale: 'Addebito rata mutuo' },
  '16//00': { prefisso: 'Commissioni', causale: 'Commissioni' },
  '16//32': { prefisso: 'Comm. richiesta incasso SEPA B2B', causale: 'Commissione richiesta incasso SEPA B2B' },
  '16//33': { prefisso: 'Comm. richiesta incasso SEPA B2C', causale: 'Commissione richiesta incasso SEPA B2C' },
  '16//37': { prefisso: 'Commissioni su bonifico tramite in', causale: 'Commissioni su bonifico tramite internet banking' },
  '19//05': { prefisso: 'Imposta di bollo', causale: 'Imposta di bollo' },
  '19//83': { prefisso: 'Imposte e tasse:Delega Unificata(p', causale: 'Imposte e tasse: delega unificata' },
  '26//11': { prefisso: 'Bonifico tramite Internet Banking', causale: 'Bonifico tramite internet banking' },
  '26//20': { prefisso: 'Vs disposizione permanente a favor', causale: 'Vs disposizione permanente a favore' },
  '31//21': { prefisso: 'SDD B2B - Richiesta Incasso SEPA', causale: 'SDD B2B - Richiesta incasso SEPA' },
  '31//22': { prefisso: 'SDD Core - Richiesta Incasso SEPA', causale: 'SDD Core - Richiesta incasso SEPA' },
  '34//00': { prefisso: 'Giro conto', causale: 'Giro conto' },
  '39//11': { prefisso: 'Disposizione per emolumenti intern', causale: 'Disposizione per emolumenti' },
  '45//15': { prefisso: 'Carta del Credito Cooperativo', causale: 'Carta del Credito Cooperativo' },
  '48//00': { prefisso: 'Bonifico a vs favore', causale: 'Bonifico a vs favore' },
  '52//30': { prefisso: 'Prelevamento contante allo sportel', causale: 'Prelevamento contante allo sportello' },
  '68//00': { prefisso: 'Storno scritture', causale: 'Storno scritture' },
  '78//10': { prefisso: 'Versamento contante allo sportello', causale: 'Versamento contante allo sportello' },
  '78//50': { prefisso: 'Versamento contante tramite CSA', causale: 'Versamento contante tramite CSA' },
  '79//00': { prefisso: 'Disposizione di giro conto', causale: 'Disposizione di giro conto' },
}

/**
 * Toglie ciò che separa la causale dai dettagli: spazi, UN solo asterisco (la
 * carta ha il numero mascherato con asterischi subito dopo, e deve restare
 * mascherato), poi eventuali `-` o `:` e altri spazi.
 */
function senzaSeparatore(resto: string): string {
  return resto.replace(/^\s*\*?[\s\-:]*/, '').trim()
}

export function separaCausale(testoGrezzo: string, codiceBanca: string | null): CausaleSeparata {
  const testo = testoGrezzo.trim()
  if (testo === '') return { causale: null, descrizione: '' }

  const voce = codiceBanca ? CAUSALI_PER_CODICE[codiceBanca] : undefined
  if (voce && testo.toLowerCase().startsWith(voce.prefisso.toLowerCase())) {
    return { causale: voce.causale, descrizione: senzaSeparatore(testo.slice(voce.prefisso.length)) }
  }

  const asterisco = testo.indexOf(' *')
  if (asterisco > 0) {
    return { causale: testo.slice(0, asterisco).trim(), descrizione: senzaSeparatore(testo.slice(asterisco + 1)) }
  }

  return { causale: null, descrizione: testo }
}
```

- [ ] **Step 4: eseguire i test e vederli passare**

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca/__tests__/separa-causale.test.ts`
Atteso: 29 verdi (20 casi + 1 sulla tabella + 8 controesempi). Se il caso `45//15` fallisce sulla descrizione, controllare che `senzaSeparatore` tolga **un** asterisco: `\*?` e non `\*+`.

- [ ] **Step 5: commit**

```bash
git add src/lib/banca/separa-causale.ts src/lib/banca/__tests__/separa-causale.test.ts
git commit -m "feat(banca): separaCausale, dal testo grezzo della banca a causale e descrizione

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: schema e migrazione

**Files:**
- Modify: `prisma/schema.prisma` (modello `BankTransaction`, righe 1930-1980; un enum e un modello nuovi)
- Create: `prisma/migrations/20260816180000_estratto_conto_in_prima_nota/migration.sql`

**Interfaces:**
- Produces: `BankTransaction.causale | descrizione | note | sezione | modifiche`, `enum SezioneMovimentoBancario`, `model BankTransactionEdit` (tabella `bank_transaction_edits`).

- [ ] **Step 1: aggiungere l'enum e i campi allo schema**

In `prisma/schema.prisma`, vicino a `enum ReconciliationStatus` (riga ~2751):

```prisma
/// La scheda in cui una riga dell'estratto conto si vede: Attivi, Deleghe F24,
/// CBILL-PagoPA. Cambiarla non tocca la contabilità (spec, decisione 5).
enum SezioneMovimentoBancario {
  ATTIVI
  DELEGHE_F24
  CBILL_PAGOPA
}
```

Nel modello `BankTransaction`, dopo `bankTransactionCode`:

```prisma
  /// Il tipo di operazione (`Bonifico a vs favore`, `SDD Core - Richiesta
  /// incasso SEPA`…), separato dal testo grezzo con `separaCausale` all'import
  /// e poi modificabile. `description` resta il testo della banca, intoccato.
  causale     String? @db.VarChar(120)
  /// Il testo che si legge e si modifica; `description` è l'originale.
  descrizione String? @db.VarChar(500)
  note        String? @db.Text
  sezione     SezioneMovimentoBancario @default(ATTIVI)

  modifiche BankTransactionEdit[]
```

Dopo il modello `BankTransaction`:

```prisma
/// Una riga per ogni campo cambiato su un movimento bancario: prima/dopo/chi.
/// Alimenta il badge «Modificato» e la scheda «Cronologia modifiche». `userId`
/// non ha relazione: il nome si legge a parte, e la riga sopravvive all'utente.
model BankTransactionEdit {
  id                String   @id @default(cuid())
  bankTransactionId String   @map("bank_transaction_id")
  /// `descrizione` · `causale` · `note` · `sezione`
  campo             String   @db.VarChar(20)
  prima             String?  @db.Text
  dopo              String?  @db.Text
  userId            String?  @map("user_id")
  createdAt         DateTime @default(now()) @map("created_at")

  bankTransaction BankTransaction @relation(fields: [bankTransactionId], references: [id], onDelete: Cascade)

  @@index([bankTransactionId, createdAt])
  @@map("bank_transaction_edits")
}
```

- [ ] **Step 2: scrivere la migrazione a mano**

`prisma/migrations/20260816180000_estratto_conto_in_prima_nota/migration.sql`:

```sql
-- Estratto conto nella prima nota, consegna A.
-- Spec: docs/superpowers/specs/2026-08-16-movimenti-bancari-in-prima-nota-design.md
--
-- `description` resta il testo grezzo della banca. `causale` e `descrizione`
-- sono ciò che si legge e si modifica; `note` è dell'utente; `sezione` è la
-- scheda (Attivi / Deleghe F24 / CBILL-PagoPA). La cronologia registra
-- prima/dopo/chi per ogni campo cambiato.

CREATE TYPE "SezioneMovimentoBancario" AS ENUM ('ATTIVI', 'DELEGHE_F24', 'CBILL_PAGOPA');

ALTER TABLE "bank_transactions"
  ADD COLUMN "causale" VARCHAR(120),
  ADD COLUMN "descrizione" VARCHAR(500),
  ADD COLUMN "note" TEXT,
  ADD COLUMN "sezione" "SezioneMovimentoBancario" NOT NULL DEFAULT 'ATTIVI';

CREATE TABLE "bank_transaction_edits" (
    "id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "campo" VARCHAR(20) NOT NULL,
    "prima" TEXT,
    "dopo" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_transaction_edits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_transaction_edits_bank_transaction_id_created_at_idx"
  ON "bank_transaction_edits"("bank_transaction_id", "created_at");

ALTER TABLE "bank_transaction_edits"
  ADD CONSTRAINT "bank_transaction_edits_bank_transaction_id_fkey"
  FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

La RLS sulla tabella nuova la mette `npm run db:migrate:deploy` (che dopo `migrate deploy` lancia `rls:enable` su tutte le tabelle): è il comando che Railway esegue prima di ogni deploy (`railway.json`, `preDeployCommand`). Non serve scriverla qui.

- [ ] **Step 3: verificare che schema e migrazione concordino, su un database vuoto locale**

```bash
/opt/homebrew/opt/libpq/bin/psql "postgresql://nicolascarpa@127.0.0.1:5433/postgres" -X -c 'DROP DATABASE IF EXISTS weiss_migrazioni_prova' -c 'CREATE DATABASE weiss_migrazioni_prova'
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_migrazioni_prova" PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx prisma migrate deploy
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_migrazioni_prova" PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
```

Atteso: `migrate deploy` applica tutte le migrazioni compresa `20260816180000…` (exit 0). L'output del `diff` **non deve citare** `bank_transactions`, `bank_transaction_edits` né `SezioneMovimentoBancario` (può citare gli indici parziali di `prisma/sql/constraints.sql`, che Prisma non modella: quelli sono attesi). Se cita una colonna nostra, la migrazione e lo schema non concordano: correggere la migrazione, non lo schema.

Poi: `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx prisma generate` (exit 0) e `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit` (exit 0).

- [ ] **Step 4: pulire e committare**

```bash
/opt/homebrew/opt/libpq/bin/psql "postgresql://nicolascarpa@127.0.0.1:5433/postgres" -X -c 'DROP DATABASE IF EXISTS weiss_migrazioni_prova'
git add prisma/schema.prisma prisma/migrations/20260816180000_estratto_conto_in_prima_nota
git commit -m "feat(banca): causale, descrizione, note, sezione e cronologia sulla riga di banca

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: chi scrive le righe scrive anche causale e descrizione (mapper, sync, import CSV, creazione manuale)

**Files:**
- Modify: `src/lib/gocardless/mapper.ts` (`MovimentoDaSalvare`, `mappaMovimento`)
- Modify: `src/lib/services/bank-sync-service.ts` (la `create` dentro `sincronizzaConto`, righe ~150-165)
- Modify: `src/app/api/bank-transactions/import/route.ts` (legge `bankAccountId` dal form, scrive `causale`/`descrizione`/`bankAccountId` nel `createMany`, righe ~304-317)
- Modify: `src/components/reconciliation/ImportDialog.tsx` (select del conto, obbligatorio)
- Modify: `src/lib/validations/reconciliation.ts` (`createBankTransactionSchema`)
- Modify: `src/app/api/bank-transactions/route.ts` (`POST`, righe 155-216)
- Test: `src/lib/gocardless/__tests__/mapper.test.ts`, `src/lib/services/__tests__/bank-sync-service.itest.ts`, `src/app/api/bank-transactions/import/__tests__/import-estratto-conto.itest.ts`, nuovo `src/app/api/bank-transactions/__tests__/creazione-manuale.itest.ts`

**Interfaces:**
- Consumes: `separaCausale` (Task 1); campi del Task 2.
- Produces: `MovimentoDaSalvare.causale: string | null`, `MovimentoDaSalvare.descrizione: string`; `POST /api/bank-transactions` accetta `{ bankAccountId, transactionDate, valueDate?, amount, descrizione, causale?, note? }` (`description` = `descrizione`, testo grezzo dell'utente); l'import CSV accetta il campo form `bankAccountId` (obbligatorio).

- [ ] **Step 1: i test del mapper**

In `src/lib/gocardless/__tests__/mapper.test.ts`, dentro `describe('mappaMovimento')`:

```ts
  // Il testo grezzo resta in `description`; causale e descrizione nascono
  // separate all'import, così la lista le mostra in due colonne come CashKing.
  it('separa la causale dalla descrizione col codice della banca', () => {
    const conAsterisco = movimentoSchema.parse({
      ...contoA.transactions.booked[0],
      remittanceInformationUnstructured: 'Bonifico a vs favore *ROSSI SRL SALDO FT 12',
      proprietaryBankTransactionCode: '48//00',
    })
    const mappato = mappaMovimento(conAsterisco)
    expect(mappato.description).toBe('Bonifico a vs favore *ROSSI SRL SALDO FT 12')
    expect(mappato.causale).toBe('Bonifico a vs favore')
    expect(mappato.descrizione).toBe('ROSSI SRL SALDO FT 12')
  })

  it('senza codice noto né asterisco lascia la causale vuota', () => {
    const senza = movimentoSchema.parse({
      ...contoA.transactions.booked[0],
      remittanceInformationUnstructured: 'Testo mai visto',
      proprietaryBankTransactionCode: '99//99',
    })
    expect(mappaMovimento(senza)).toMatchObject({ causale: null, descrizione: 'Testo mai visto' })
  })
```

Eseguire: `PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/gocardless/__tests__/mapper.test.ts` → i due nuovi rossi («causale» undefined).

- [ ] **Step 2: il mapper**

In `src/lib/gocardless/mapper.ts`:

```ts
import { separaCausale } from '@/lib/banca/separa-causale'
// …
export interface MovimentoDaSalvare {
  providerTransactionId: string
  transactionDate: Date
  valueDate: Date | null
  /** Il testo grezzo della banca, com'è arrivato: non si modifica mai. */
  description: string
  /** Tipo di operazione e dettagli, separati con `separaCausale`. */
  causale: string | null
  descrizione: string
  amount: string
  bankTransactionCode: string | null
}

export function mappaMovimento(grezzo: Movimento): MovimentoDaSalvare {
  const description = causale(grezzo)
  const codice = grezzo.proprietaryBankTransactionCode ?? null
  const separata = separaCausale(description, codice)
  return {
    providerTransactionId: grezzo.transactionId,
    transactionDate: dataDaGiorno(grezzo.bookingDate),
    valueDate: grezzo.valueDate ? dataDaGiorno(grezzo.valueDate) : null,
    description,
    causale: separata.causale,
    descrizione: separata.descrizione,
    amount: grezzo.transactionAmount.amount,
    bankTransactionCode: codice,
  }
}
```

(La funzione interna `causale(m)` del mapper produce il testo grezzo: rinominarla `testoGrezzo` per non confonderla col campo nuovo.)

- [ ] **Step 3: il servizio di sincronizzazione scrive i due campi**

In `src/lib/services/bank-sync-service.ts`, nella `prisma.bankTransaction.create` di `sincronizzaConto`, dopo `description: m.description,`:

```ts
            causale: m.causale,
            descrizione: m.descrizione,
```

Test in `src/lib/services/__tests__/bank-sync-service.itest.ts`, dentro `describe('sincronizzaConti')`:

```ts
  it('scrive causale e descrizione separate, e lascia il testo grezzo in description', async () => {
    const { venueId, contoId } = await montaConto('Banca della Marca', 'acct-1')
    impostaClientPerTest(
      clientFinto([
        { ...movimento('20260810-1', '2026-08-10', '-12.50'), remittanceInformationUnstructured: 'Bonifico tramite Internet Banking *SALDO FT 7 ACME SRL' },
      ])
    )

    await sincronizzaConti({ venueId, origine: 'cron', oggi: OGGI })

    const riga = await prisma.bankTransaction.findFirstOrThrow({ where: { bankAccountId: contoId } })
    expect(riga.description).toBe('Bonifico tramite Internet Banking *SALDO FT 7 ACME SRL')
    expect(riga.causale).toBe('Bonifico tramite internet banking')
    expect(riga.descrizione).toBe('SALDO FT 7 ACME SRL')
  })
```

Eseguire: `TEST_DB_SUFFIX=estratto PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/lib/services/__tests__/bank-sync-service.itest.ts` → verde (prima di scrivere il servizio: rosso su `causale`).

- [ ] **Step 4: l'import CSV riceve il conto e separa la causale**

In `src/app/api/bank-transactions/import/route.ts`:

- dopo la lettura del file dal form: `const bankAccountId = formData.get('bankAccountId')`; se non è una stringa non vuota → `400 { error: 'Indica il conto bancario a cui appartiene l\'estratto conto' }`; verificare che esista per la sede: `prisma.bankAccount.findFirst({ where: { id: bankAccountId, venueId, accountType: 'BANK' } })` → altrimenti 404 `{ error: 'Conto bancario non trovato' }`;
- nel `createMany`, per ogni riga:

```ts
              bankAccountId,
              // Il CSV non porta il codice operazione: vale la regola dell'asterisco.
              ...separaCausale(riga.description, null),
```

(`separaCausale` restituisce `{ causale, descrizione }`, che sono esattamente i due nomi delle colonne.)

In `src/components/reconciliation/ImportDialog.tsx`: prima del campo file, un `Select` «Conto bancario» alimentato da `GET /api/bank-accounts?type=BANK` (risposta: elenco di `{ id, name }` — leggere la forma esatta in `src/app/api/bank-accounts/route.ts:23-50` prima di scrivere il fetch), obbligatorio (il pulsante «Importa» resta disabilitato finché non è scelto; se c'è un conto solo è preselezionato); nel `FormData` aggiungere `formData.append('bankAccountId', contoScelto)`.

Test, in `import-estratto-conto.itest.ts`: modificare `importa()` perché accetti `bankAccountId` e lo appenda al form; nel `beforeEach`/nei test esistenti creare un conto (`prisma.bankAccount.create({ data: { venueId, name: 'Conto prova', accountType: 'BANK' } })`, con `venueId` da `prisma.venue.findFirstOrThrow()`) e passarlo. Aggiungere:

```ts
describe('POST /api/bank-transactions/import — conto, causale e descrizione', () => {
  it('rifiuta l\'import senza conto bancario', async () => {
    await loginAs('admin')
    const r = await importa(csv(riga('15/07/2026', '-10,00', 'Commissioni')), 'estratto.csv', null)
    expect(r.status).toBe(400)
  })

  it('scrive il conto sulle righe e separa la causale dalla descrizione', async () => {
    await loginAs('admin')
    const conto = await contoDiProva()
    await importa(csv(riga('15/07/2026', '-100,00', 'Bonifico a vs favore *ROSSI SRL')), 'estratto.csv', conto.id)
    const [r] = await movimenti()
    expect(r.bankAccountId).toBe(conto.id)
    expect(r.description).toBe('Bonifico a vs favore *ROSSI SRL')
    expect(r.causale).toBe('Bonifico a vs favore')
    expect(r.descrizione).toBe('ROSSI SRL')
    // L'import non crea più scritture: la promozione è un'azione dell'utente (spec, decisione 6).
    expect(await prisma.journalEntry.count()).toBe(0)
  })
})
```

Eseguire il file: rossi i due nuovi (e i vecchi finché `importa()` non passa il conto), poi verdi.

- [ ] **Step 5: la creazione manuale vuole il conto e accetta causale e note**

In `src/lib/validations/reconciliation.ts`:

```ts
// Creazione manuale: la riga inserita a mano ha un conto come tutte le altre.
// `descrizione` è il testo dell'utente e finisce anche in `description`, che
// per le righe MANUAL non è «della banca» ma resta il testo d'origine.
export const createBankTransactionSchema = z.object({
  bankAccountId: z.string().min(1),
  transactionDate: z.string(), // ISO date
  valueDate: z.string().optional(),
  descrizione: z.string().min(1).max(500),
  causale: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
  amount: z.number().refine((n) => n !== 0, 'L\'importo non può essere zero'), // + entrata, - uscita
})
```

In `src/app/api/bank-transactions/route.ts`, `POST`: dopo il parse, verificare il conto (`prisma.bankAccount.findFirst({ where: { id: data.bankAccountId, venueId, accountType: 'BANK' } })` → 404 se manca) e creare con:

```ts
      data: {
        venueId,
        bankAccountId: data.bankAccountId,
        transactionDate: new Date(data.transactionDate),
        valueDate: data.valueDate ? new Date(data.valueDate) : null,
        description: data.descrizione,
        descrizione: data.descrizione,
        causale: data.causale?.trim() || null,
        note: data.note?.trim() || null,
        amount: data.amount,
        importSource: 'MANUAL',
        status: 'PENDING',
      },
```

(la verifica della `venue` col `findUnique` di prima non serve più: `venueId` viene da `getVenueId()`.)

Test nuovo `src/app/api/bank-transactions/__tests__/creazione-manuale.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { POST } from '../route'

setupIntegrationDb()

async function contoDiProva() {
  const venue = await prisma.venue.findFirstOrThrow()
  return prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Conto prova', accountType: 'BANK' } })
}

describe('POST /api/bank-transactions — riga manuale', () => {
  beforeEach(() => logout())

  it('senza conto risponde 400', async () => {
    await entraCome('admin')
    const r = await callRoute(POST, jsonRequest('http://localhost/api/bank-transactions', {
      method: 'POST',
      body: { transactionDate: '2026-08-10', amount: -10, descrizione: 'Prova' },
    }))
    expect(r.status).toBe(400)
  })

  it('crea la riga MANUAL col conto, la causale e le note', async () => {
    await entraCome('admin')
    const conto = await contoDiProva()
    const r = await callRoute<{ id: string }>(POST, jsonRequest('http://localhost/api/bank-transactions', {
      method: 'POST',
      body: { bankAccountId: conto.id, transactionDate: '2026-08-10', amount: -10, descrizione: 'Cancelleria', causale: 'Spesa varia', note: 'scontrino 12' },
    }))
    expect(r.status).toBe(200)
    const riga = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.body.id } })
    expect(riga).toMatchObject({ bankAccountId: conto.id, importSource: 'MANUAL', descrizione: 'Cancelleria', description: 'Cancelleria', causale: 'Spesa varia', note: 'scontrino 12', status: 'PENDING' })
  })

  it('come staff risponde 403', async () => {
    await entraCome('staff')
    const r = await callRoute(POST, jsonRequest('http://localhost/api/bank-transactions', { method: 'POST', body: {} }))
    expect(r.status).toBe(403)
  })
})
```

Eseguire: `TEST_DB_SUFFIX=estratto PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/app/api/bank-transactions/__tests__/creazione-manuale.itest.ts` → verde.

- [ ] **Step 6: tutto verde e commit**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/gocardless
TEST_DB_SUFFIX=estratto PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/lib/services/__tests__/bank-sync-service.itest.ts src/app/api/bank-transactions
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
git add -A src/lib/gocardless src/lib/services/bank-sync-service.ts src/app/api/bank-transactions src/components/reconciliation/ImportDialog.tsx src/lib/validations/reconciliation.ts
git commit -m "feat(banca): mapper, sync, import CSV e riga manuale scrivono causale e descrizione, e il conto

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: il ricalcolo delle righe esistenti

**Files:**
- Create: `src/lib/banca/ricalcola-causali.ts`
- Create: `scripts/banca/ricalcola-causali.ts`
- Test: `src/lib/banca/__tests__/ricalcola-causali.itest.ts`

**Interfaces:**
- Consumes: `separaCausale` (Task 1), `prisma` con i campi del Task 2.
- Produces:
  ```ts
  export interface EsitoRicalcolo { esaminate: number; aggiornate: number; perCodice: Record<string, number> }
  export function ricalcolaCausali(client: Pick<PrismaClient, 'bankTransaction'>, opzioni?: { dryRun?: boolean }): Promise<EsitoRicalcolo>
  ```

- [ ] **Step 1: il test d'integrazione**

`src/lib/banca/__tests__/ricalcola-causali.itest.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { ricalcolaCausali } from '../ricalcola-causali'

setupIntegrationDb()

async function rigaGrezza(description: string, codice: string | null, extra: Record<string, unknown> = {}) {
  const venue = await prisma.venue.findFirstOrThrow()
  return prisma.bankTransaction.create({
    data: {
      venueId: venue.id,
      transactionDate: new Date('2026-08-10'),
      description,
      amount: -10,
      bankTransactionCode: codice,
      importSource: 'PSD2_GOCARDLESS',
      status: 'PENDING',
      ...extra,
    },
  })
}

describe('ricalcolaCausali', () => {
  it('separa causale e descrizione sulle righe che non le hanno, e le conta per codice', async () => {
    const a = await rigaGrezza('Bonifico a vs favore *ROSSI SRL', '48//00')
    const b = await rigaGrezza('Commissioni', '16//00')

    const esito = await ricalcolaCausali(prisma)

    expect(esito).toEqual({ esaminate: 2, aggiornate: 2, perCodice: { '48//00': 1, '16//00': 1 } })
    expect(await prisma.bankTransaction.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
      causale: 'Bonifico a vs favore',
      descrizione: 'ROSSI SRL',
      description: 'Bonifico a vs favore *ROSSI SRL', // il grezzo non si tocca
    })
    expect(await prisma.bankTransaction.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({
      causale: 'Commissioni',
      descrizione: '',
    })
  })

  // Idempotente per costruzione: la seconda volta non trova nulla da fare.
  it('girato due volte non cambia nulla', async () => {
    await rigaGrezza('Bonifico a vs favore *ROSSI SRL', '48//00')
    await ricalcolaCausali(prisma)
    const seconda = await ricalcolaCausali(prisma)
    expect(seconda.esaminate).toBe(0)
    expect(seconda.aggiornate).toBe(0)
  })

  it('non tocca una descrizione già scritta', async () => {
    const r = await rigaGrezza('Bonifico a vs favore *ROSSI SRL', '48//00', { descrizione: 'Rossi S.r.l., saldo fattura 12', causale: 'Bonifico' })
    await ricalcolaCausali(prisma)
    expect(await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
      descrizione: 'Rossi S.r.l., saldo fattura 12',
      causale: 'Bonifico',
    })
  })

  it('in prova (dryRun) conta senza scrivere', async () => {
    const r = await rigaGrezza('Commissioni', '16//00')
    const esito = await ricalcolaCausali(prisma, { dryRun: true })
    expect(esito.aggiornate).toBe(1)
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })).causale).toBeNull()
  })

  // L'estensione soft-delete nasconde il Cestino a ogni query senza `deletedAt`
  // esplicito: senza la seconda passata queste righe resterebbero grezze.
  it('separa anche le righe nel Cestino', async () => {
    const r = await rigaGrezza('Giro conto *WEISS S.R.L. Giroconto', '34//00', { deletedAt: new Date() })
    await ricalcolaCausali(prisma)
    const riga = await prisma.bankTransaction.findFirstOrThrow({ where: { id: r.id, deletedAt: { not: null } } })
    expect(riga).toMatchObject({ causale: 'Giro conto', descrizione: 'WEISS S.R.L. Giroconto' })
  })
})
```

- [ ] **Step 2: eseguirlo e vederlo fallire**

`TEST_DB_SUFFIX=estratto PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/lib/banca/__tests__/ricalcola-causali.itest.ts` → rosso, modulo assente.

- [ ] **Step 3: la funzione**

`src/lib/banca/ricalcola-causali.ts`:

```ts
import type { PrismaClient } from '@prisma/client'
import { separaCausale } from './separa-causale'

/**
 * Applica `separaCausale` alle righe importate prima che i campi esistessero.
 *
 * Idempotente per costruzione: lavora solo le righe con `descrizione IS NULL`,
 * quindi la seconda esecuzione non trova nulla; e non passa mai sopra un
 * valore scritto dall'utente, perché una riga toccata dall'utente la
 * `descrizione` ce l'ha. Si lancia una volta in produzione dopo il deploy
 * della consegna A (script `scripts/banca/ricalcola-causali.ts`).
 */
export interface EsitoRicalcolo {
  esaminate: number
  aggiornate: number
  perCodice: Record<string, number>
}

const LOTTO = 500

/**
 * Due passate, righe vive e Cestino, con lo stesso `where` di base: il testo si
 * separa a prescindere da dove sta la riga. Servono due passate perché
 * l'estensione di `src/lib/prisma.ts` aggiunge `deletedAt: null` a ogni query
 * in cui la chiave manca; per leggere anche le righe cestinate la chiave va
 * scritta esplicitamente (`deletedAt: { not: null }`).
 */
export async function ricalcolaCausali(
  client: Pick<PrismaClient, 'bankTransaction'>,
  opzioni: { dryRun?: boolean } = {}
): Promise<EsitoRicalcolo> {
  const esito: EsitoRicalcolo = { esaminate: 0, aggiornate: 0, perCodice: {} }
  await ricalcolaLotti(client, { descrizione: null, deletedAt: null }, esito, opzioni)
  await ricalcolaLotti(client, { descrizione: null, deletedAt: { not: null } }, esito, opzioni)
  return esito
}

async function ricalcolaLotti(
  client: Pick<PrismaClient, 'bankTransaction'>,
  where: { descrizione: null; deletedAt: null | { not: null } },
  esito: EsitoRicalcolo,
  opzioni: { dryRun?: boolean }
): Promise<void> {
  // In prova nessuna riga cambia stato, quindi il cursore avanza; scrivendo,
  // le righe aggiornate escono dal `where` e si riparte sempre dall'inizio.
  let cursore: string | undefined
  for (;;) {
    const righe = await client.bankTransaction.findMany({
      where,
      select: { id: true, description: true, bankTransactionCode: true },
      orderBy: { id: 'asc' },
      take: LOTTO,
      ...(cursore ? { skip: 1, cursor: { id: cursore } } : {}),
    })
    if (righe.length === 0) break

    for (const riga of righe) {
      esito.esaminate++
      const { causale, descrizione } = separaCausale(riga.description, riga.bankTransactionCode)
      const codice = riga.bankTransactionCode ?? '(senza codice)'
      esito.perCodice[codice] = (esito.perCodice[codice] ?? 0) + 1
      esito.aggiornate++
      if (!opzioni.dryRun) {
        // `updateMany` con `deletedAt` esplicito: un `update({ where: { id } })`
        // riceverebbe `deletedAt: null` dall'estensione e sulle righe del
        // Cestino non troverebbe nulla (P2025).
        await client.bankTransaction.updateMany({
          where: { id: riga.id, deletedAt: where.deletedAt },
          data: { causale, descrizione },
        })
      }
    }
    if (opzioni.dryRun) {
      cursore = righe[righe.length - 1].id
      if (righe.length < LOTTO) break
    }
  }
}
```

- [ ] **Step 4: eseguire i test e vederli passare**

Stesso comando dello Step 2 → 5 verdi.

- [ ] **Step 5: lo script**

`scripts/banca/ricalcola-causali.ts`:

```ts
/**
 * Ricalcola causale e descrizione delle righe di banca importate prima della
 * consegna A. Idempotente. Uso:
 *
 *   PATH=… npx tsx --env-file=.env scripts/banca/ricalcola-causali.ts --dry-run
 *   PATH=… npx tsx --env-file=.env scripts/banca/ricalcola-causali.ts
 *
 * Il `.env` del repository punta alla produzione: il `--dry-run` va fatto
 * prima, e il conteggio per codice va confrontato con la tabella della spec.
 */
import { prisma } from '../../src/lib/prisma'
import { ricalcolaCausali } from '../../src/lib/banca/ricalcola-causali'

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const esito = await ricalcolaCausali(prisma, { dryRun })
  console.log(dryRun ? 'PROVA (nessuna scrittura)' : 'ESEGUITO')
  console.log(`esaminate ${esito.esaminate}, aggiornate ${esito.aggiornate}`)
  for (const [codice, n] of Object.entries(esito.perCodice).sort()) console.log(`  ${codice}  ${n}`)
}

main()
  .catch((errore) => {
    console.error(errore)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
```

Provarlo contro il database dei test appena usato (non la produzione): `DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_itest_estratto_template" PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsx scripts/banca/ricalcola-causali.ts --dry-run` → stampa «PROVA», 0 esaminate (il template è vuoto), exit 0.

- [ ] **Step 6: commit**

```bash
git add src/lib/banca/ricalcola-causali.ts src/lib/banca/__tests__/ricalcola-causali.itest.ts scripts/banca/ricalcola-causali.ts
git commit -m "feat(banca): ricalcolo idempotente di causale e descrizione sulle righe esistenti

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: la lista dal server — filtri, ordinamento, stato, totali, conteggi

**Files:**
- Modify: `src/types/reconciliation.ts`
- Create: `src/lib/banca/stato-legenda.ts` (+ `__tests__/stato-legenda.test.ts`)
- Create: `src/lib/banca/filtri-estratto-conto.ts` (+ `__tests__/filtri-estratto-conto.test.ts`) — **senza import da Prisma**: lo importa anche il client
- Create: `src/lib/banca/query-estratto-conto.ts`
- Modify: `src/app/api/bank-transactions/route.ts` (`GET`, righe 14-153)
- Test: `src/app/api/bank-transactions/__tests__/lista.itest.ts`

**Interfaces:**
- Consumes: campi del Task 2.
- Produces:
  ```ts
  // src/types/reconciliation.ts
  export type SezioneMovimentoBancario = 'ATTIVI' | 'DELEGHE_F24' | 'CBILL_PAGOPA'
  export type StatoLegenda = 'non_abbinato' | 'parziale' | 'abbinato_manualmente' | 'riconciliato'
  export interface RigaEstrattoConto extends BankTransactionWithMatch {
    descrizione: string | null; causale: string | null; note: string | null
    sezione: SezioneMovimentoBancario; bankTransactionCode: string | null
    bankAccount: { id: string; name: string } | null
    modificato: boolean; stato: StatoLegenda; residuo: number; deletedAt: Date | null
  }
  export interface TotaliEstrattoConto { entrate: number; uscite: number; saldoNetto: number }
  export interface ConteggiEstrattoConto { attivi: number; delegheF24: number; cbillPagopa: number; cestino: number }
  export interface RispostaEstrattoConto {
    data: RigaEstrattoConto[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
    totali: TotaliEstrattoConto
    conteggi: ConteggiEstrattoConto
  }
  // src/lib/banca/stato-legenda.ts
  export function statoLegenda(r: { matchedEntryId: string | null; status: string; amount: number; importiRiconciliati: number[] }): { stato: StatoLegenda; residuo: number }
  // src/lib/banca/filtri-estratto-conto.ts
  export const ORDINA = ['data', 'descrizione', 'causale', 'importo'] as const
  export type OrdinaPer = (typeof ORDINA)[number]
  export type FiltriEstrattoConto = { sezione: SezioneMovimentoBancario; cestino: boolean; tipo: 'tutti' | 'entrate' | 'uscite'; bankAccountId?: string; soloNonRiconciliati: boolean; search?: string; dateFrom?: string; dateTo?: string; ordina: OrdinaPer; verso: 'asc' | 'desc'; page: number; limit: number }
  export const FILTRI_DEFAULT: FiltriEstrattoConto
  export const filtriEstrattoContoSchema: z.ZodType<FiltriEstrattoConto, z.ZodTypeDef, unknown>
  export function filtriDaSearchParams(sp: URLSearchParams): FiltriEstrattoConto
  export function filtriInSearchParams(f: FiltriEstrattoConto, base?: URLSearchParams): URLSearchParams
  // src/lib/banca/query-estratto-conto.ts
  export function costruisciWhere(f: FiltriEstrattoConto, venueId: string): Prisma.BankTransactionWhereInput
  export function costruisciOrderBy(f: FiltriEstrattoConto): Prisma.BankTransactionOrderByWithRelationInput[]
  export const SELEZIONE_RIGA: Prisma.BankTransactionDefaultArgs
  export function mappaRiga(r: Prisma.BankTransactionGetPayload<typeof SELEZIONE_RIGA>): RigaEstrattoConto
  ```
  La `GET /api/bank-transactions` conserva **tutti** i campi di prima (`data[]` con `...tx`, `pagination`, `summary`): la pagina `/riconciliazione` la legge ancora fino alla consegna B. Aggiunge `totali`, `conteggi` e i campi nuovi per riga.

- [ ] **Step 1: i tipi**

In `src/types/reconciliation.ts`, dopo `BankTransactionWithMatch`, aggiungere i tipi dell'interfaccia qui sopra (copiarli tali e quali, con un commento: «la riga come la vede la lista dell'estratto conto: i campi in più li calcola il server, così legenda, filtro e conteggi dicono la stessa cosa»).

- [ ] **Step 2: `statoLegenda` — test, poi funzione**

`src/lib/banca/__tests__/stato-legenda.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { statoLegenda } from '../stato-legenda'

describe('statoLegenda', () => {
  it('senza scrittura è Non abbinato, e il residuo è l\'intero importo', () => {
    expect(statoLegenda({ matchedEntryId: null, status: 'PENDING', amount: -120, importiRiconciliati: [] }))
      .toEqual({ stato: 'non_abbinato', residuo: 120 })
  })

  // Una commissione categorizzata ha una scrittura e nessun documento: è chiusa.
  it('con scrittura dell\'utente e senza documenti è Abbinato manualmente, residuo zero', () => {
    expect(statoLegenda({ matchedEntryId: 'je1', status: 'MANUAL', amount: -0.75, importiRiconciliati: [] }))
      .toEqual({ stato: 'abbinato_manualmente', residuo: 0 })
  })

  it('con scrittura del motore e documenti che coprono tutto è Riconciliato', () => {
    expect(statoLegenda({ matchedEntryId: 'je1', status: 'MATCHED', amount: -100, importiRiconciliati: [60, 40] }))
      .toEqual({ stato: 'riconciliato', residuo: 0 })
  })

  it('con documenti che coprono solo una parte è Parzialmente abbinato, col residuo', () => {
    expect(statoLegenda({ matchedEntryId: 'je1', status: 'MANUAL', amount: -100, importiRiconciliati: [30.5] }))
      .toEqual({ stato: 'parziale', residuo: 69.5 })
  })

  it('un centesimo di troppo dai documenti non manda il residuo sotto zero', () => {
    expect(statoLegenda({ matchedEntryId: 'je1', status: 'MATCHED', amount: 100, importiRiconciliati: [100.01] }).residuo).toBe(0)
  })
})
```

`src/lib/banca/stato-legenda.ts`:

```ts
import type { StatoLegenda } from '@/types/reconciliation'

/**
 * La legenda di CashKing sul nostro modello (spec, «Gli stati»): «abbinato»
 * vuol dire collegata a una scrittura, con o senza documenti; il residuo è ciò
 * che i documenti non coprono. Pura, così la stessa regola vale per la lista,
 * il filtro e i conteggi.
 */
export function statoLegenda(r: {
  matchedEntryId: string | null
  status: string
  amount: number
  importiRiconciliati: number[]
}): { stato: StatoLegenda; residuo: number } {
  const coperto = r.importiRiconciliati.reduce((somma, x) => somma + x, 0)
  const residuo = Math.max(0, Math.round((Math.abs(r.amount) - coperto) * 100) / 100)
  if (!r.matchedEntryId) return { stato: 'non_abbinato', residuo }
  if (r.importiRiconciliati.length > 0 && residuo > 0) return { stato: 'parziale', residuo }
  if (r.status === 'MANUAL') return { stato: 'abbinato_manualmente', residuo: 0 }
  return { stato: 'riconciliato', residuo: 0 }
}
```

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca/__tests__/stato-legenda.test.ts` → prima rosso (modulo assente), poi 5 verdi.

- [ ] **Step 3: i filtri (client-safe) — test, poi modulo**

`src/lib/banca/__tests__/filtri-estratto-conto.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filtriDaSearchParams, filtriInSearchParams, FILTRI_DEFAULT } from '../filtri-estratto-conto'

describe('filtriDaSearchParams', () => {
  it('senza parametri dà i default: Attivi, tutti, data decrescente, pagina 1 da 100', () => {
    expect(filtriDaSearchParams(new URLSearchParams())).toEqual(FILTRI_DEFAULT)
  })

  it('legge ordinamento, sezione, tipo e flag', () => {
    const f = filtriDaSearchParams(new URLSearchParams('ordina=importo&verso=asc&sezione=DELEGHE_F24&tipo=uscite&soloNonRiconciliati=1&page=2'))
    expect(f).toMatchObject({ ordina: 'importo', verso: 'asc', sezione: 'DELEGHE_F24', tipo: 'uscite', soloNonRiconciliati: true, page: 2 })
  })

  it('cestino=1 apre il Cestino', () => {
    expect(filtriDaSearchParams(new URLSearchParams('cestino=1')).cestino).toBe(true)
  })

  // Un URL sbagliato non deve rompere la pagina: torna ai default.
  it('un valore non valido cade sul default', () => {
    expect(filtriDaSearchParams(new URLSearchParams('ordina=colore&verso=su')).ordina).toBe('data')
  })
})

describe('filtriInSearchParams', () => {
  it('scrive solo ciò che differisce dai default e conserva i parametri altrui', () => {
    const base = new URLSearchParams('register=BANK')
    const sp = filtriInSearchParams({ ...FILTRI_DEFAULT, ordina: 'importo', verso: 'asc', page: 3 }, base)
    expect(sp.toString()).toBe('register=BANK&ordina=importo&verso=asc&page=3')
  })

  it('andata e ritorno conserva i filtri', () => {
    const f = { ...FILTRI_DEFAULT, cestino: true, search: 'worldline', dateFrom: '2026-07-01', bankAccountId: 'c1' }
    expect(filtriDaSearchParams(filtriInSearchParams(f))).toEqual(f)
  })
})
```

`src/lib/banca/filtri-estratto-conto.ts`:

```ts
import { z } from 'zod'
import type { SezioneMovimentoBancario } from '@/types/reconciliation'

/**
 * I filtri della lista dell'estratto conto, letti e scritti nell'URL: così
 * `?ordina=importo&verso=desc` si incolla in una chat e ricarica la stessa
 * vista (spec, decisione 7). Nessun import da Prisma: questo modulo lo usa
 * anche il client.
 */
export const ORDINA = ['data', 'descrizione', 'causale', 'importo'] as const
export type OrdinaPer = (typeof ORDINA)[number]

const flag = z.enum(['0', '1']).default('0').transform((v) => v === '1')

export const filtriEstrattoContoSchema = z.object({
  sezione: z.enum(['ATTIVI', 'DELEGHE_F24', 'CBILL_PAGOPA']).default('ATTIVI'),
  cestino: flag,
  tipo: z.enum(['tutti', 'entrate', 'uscite']).default('tutti'),
  bankAccountId: z.string().min(1).optional(),
  soloNonRiconciliati: flag,
  search: z.string().trim().min(1).max(200).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ordina: z.enum(ORDINA).default('data'),
  verso: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
})

export type FiltriEstrattoConto = z.infer<typeof filtriEstrattoContoSchema> & { sezione: SezioneMovimentoBancario }

export const FILTRI_DEFAULT: FiltriEstrattoConto = filtriEstrattoContoSchema.parse({})

/** Un parametro non valido cade sul suo default: l'URL non deve mai rompere la pagina. */
export function filtriDaSearchParams(sp: URLSearchParams): FiltriEstrattoConto {
  const grezzi: Record<string, string> = {}
  for (const chiave of Object.keys(filtriEstrattoContoSchema.shape)) {
    const v = sp.get(chiave)
    if (v !== null && v !== '') grezzi[chiave] = v
  }
  const esito = filtriEstrattoContoSchema.safeParse(grezzi)
  if (esito.success) return esito.data
  // Riprova campo per campo, tenendo solo quelli validi.
  const validi: Record<string, string> = {}
  for (const [chiave, valore] of Object.entries(grezzi)) {
    if (filtriEstrattoContoSchema.pick({ [chiave]: true } as never).safeParse({ [chiave]: valore }).success) validi[chiave] = valore
  }
  return filtriEstrattoContoSchema.parse(validi)
}

/** Scrive solo ciò che differisce dai default; conserva ciò che c'è già in `base` (es. `register`, `vista`). */
export function filtriInSearchParams(f: FiltriEstrattoConto, base = new URLSearchParams()): URLSearchParams {
  const sp = new URLSearchParams(base)
  for (const chiave of Object.keys(filtriEstrattoContoSchema.shape)) sp.delete(chiave)
  const metti = (chiave: string, valore: string | number | boolean | undefined, def: unknown) => {
    if (valore === undefined || valore === def) return
    sp.set(chiave, typeof valore === 'boolean' ? '1' : String(valore))
  }
  metti('sezione', f.sezione, FILTRI_DEFAULT.sezione)
  metti('cestino', f.cestino, false)
  metti('tipo', f.tipo, FILTRI_DEFAULT.tipo)
  metti('bankAccountId', f.bankAccountId, undefined)
  metti('soloNonRiconciliati', f.soloNonRiconciliati, false)
  metti('search', f.search, undefined)
  metti('dateFrom', f.dateFrom, undefined)
  metti('dateTo', f.dateTo, undefined)
  metti('ordina', f.ordina, FILTRI_DEFAULT.ordina)
  metti('verso', f.verso, FILTRI_DEFAULT.verso)
  metti('page', f.page, FILTRI_DEFAULT.page)
  metti('limit', f.limit, FILTRI_DEFAULT.limit)
  return sp
}
```

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca/__tests__/filtri-estratto-conto.test.ts` → 6 verdi. Se `pick(… as never)` non compila sotto `typecheck:test`, sostituire il «riprova campo per campo» con un ciclo che costruisce `validi` provando `filtriEstrattoContoSchema.shape[chiave].safeParse(valore)` per ciascuna chiave (le forme di `shape` sono singolarmente parsabili).

- [ ] **Step 4: la query lato server**

`src/lib/banca/query-estratto-conto.ts`:

```ts
import { Prisma } from '@prisma/client'
import type { FiltriEstrattoConto } from './filtri-estratto-conto'
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
  if (f.tipo === 'entrate') where.amount = { gt: 0 }
  if (f.tipo === 'uscite') where.amount = { lt: 0 }
  if (f.bankAccountId) where.bankAccountId = f.bankAccountId
  // Consegna A: «non riconciliata» = senza scrittura. I parziali entreranno
  // con la consegna B, quando il residuo dei documenti sarà denormalizzato
  // sulla riga e filtrabile in SQL.
  if (f.soloNonRiconciliati) where.matchedEntryId = null
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
    matchedEntry: {
      select: {
        id: true,
        date: true,
        description: true,
        debitAmount: true,
        creditAmount: true,
        documentRef: true,
        scheduleReconciliations: { where: { status: 'VERIFIED' as const }, select: { amount: true } },
      },
    },
    // Il badge «Modificato» guarda solo i campi del movimento: spostare di
    // scheda non è una modifica (spec, «La cronologia»).
    _count: { select: { modifiche: { where: { campo: { in: ['descrizione', 'causale', 'note'] } } } } },
  },
} satisfies Prisma.BankTransactionDefaultArgs

export function mappaRiga(r: Prisma.BankTransactionGetPayload<typeof SELEZIONE_RIGA>): RigaEstrattoConto {
  const amount = Number(r.amount)
  const { stato, residuo } = statoLegenda({
    matchedEntryId: r.matchedEntryId,
    status: r.status,
    amount,
    importiRiconciliati: r.matchedEntry?.scheduleReconciliations.map((x) => Number(x.amount)) ?? [],
  })
  const { _count, matchedEntry, ...resto } = r
  return {
    ...resto,
    amount,
    balanceAfter: r.balanceAfter ? Number(r.balanceAfter) : null,
    matchConfidence: r.matchConfidence ? Number(r.matchConfidence) : null,
    matchedEntry: matchedEntry
      ? {
          id: matchedEntry.id,
          date: matchedEntry.date,
          description: matchedEntry.description,
          debitAmount: matchedEntry.debitAmount ? Number(matchedEntry.debitAmount) : null,
          creditAmount: matchedEntry.creditAmount ? Number(matchedEntry.creditAmount) : null,
          documentRef: matchedEntry.documentRef,
        }
      : null,
    modificato: _count.modifiche > 0,
    stato,
    residuo,
  }
}
```

- [ ] **Step 5: il test d'integrazione della `GET`**

`src/app/api/bank-transactions/__tests__/lista.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import type { RispostaEstrattoConto } from '@/types/reconciliation'
import { GET } from '../route'

setupIntegrationDb()

async function contesto() {
  const venue = await prisma.venue.findFirstOrThrow()
  const conto = await prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Weiss', accountType: 'BANK' } })
  const centro = await prisma.costCenter.findFirstOrThrow()
  return { venueId: venue.id, contoId: conto.id, centroId: centro.id }
}

async function riga(venueId: string, contoId: string, dati: { data: string; importo: number; descrizione: string; causale?: string; sezione?: 'ATTIVI' | 'DELEGHE_F24' | 'CBILL_PAGOPA'; deletedAt?: Date; matchedEntryId?: string; status?: 'PENDING' | 'MANUAL' }) {
  return prisma.bankTransaction.create({
    data: {
      venueId,
      bankAccountId: contoId,
      transactionDate: new Date(dati.data),
      description: dati.descrizione,
      descrizione: dati.descrizione,
      causale: dati.causale ?? null,
      amount: dati.importo,
      importSource: 'PSD2_GOCARDLESS',
      status: dati.status ?? 'PENDING',
      sezione: dati.sezione ?? 'ATTIVI',
      deletedAt: dati.deletedAt ?? null,
      matchedEntryId: dati.matchedEntryId ?? null,
    },
  })
}

async function lista(query: string) {
  return callRoute<RispostaEstrattoConto>(GET, jsonRequest(`http://localhost/api/bank-transactions?${query}`))
}

describe('GET /api/bank-transactions — la lista dell\'estratto conto', () => {
  beforeEach(async () => {
    logout()
    await entraCome('admin')
  })

  it('ordina lato server per importo, nei due versi', async () => {
    const { venueId, contoId } = await contesto()
    await riga(venueId, contoId, { data: '2026-08-01', importo: -50, descrizione: 'B' })
    await riga(venueId, contoId, { data: '2026-08-02', importo: 200, descrizione: 'A' })
    await riga(venueId, contoId, { data: '2026-08-03', importo: -10, descrizione: 'C' })

    const asc = await lista('ordina=importo&verso=asc')
    expect(asc.body.data.map((r) => r.amount)).toEqual([-50, -10, 200])
    const desc = await lista('ordina=importo&verso=desc')
    expect(desc.body.data.map((r) => r.amount)).toEqual([200, -10, -50])
  })

  it('i totali seguono il filtro, i conteggi delle schede no', async () => {
    const { venueId, contoId } = await contesto()
    await riga(venueId, contoId, { data: '2026-08-01', importo: 100, descrizione: 'entrata' })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -40, descrizione: 'uscita' })
    await riga(venueId, contoId, { data: '2026-08-03', importo: -5, descrizione: 'f24', sezione: 'DELEGHE_F24' })
    await riga(venueId, contoId, { data: '2026-08-04', importo: -1, descrizione: 'cestinata', deletedAt: new Date() })

    const attivi = await lista('')
    expect(attivi.body.totali).toEqual({ entrate: 100, uscite: 40, saldoNetto: 60 })
    expect(attivi.body.conteggi).toEqual({ attivi: 2, delegheF24: 1, cbillPagopa: 0, cestino: 1 })
    expect(attivi.body.data.map((r) => r.descrizione)).toEqual(['uscita', 'entrata'])

    const soloUscite = await lista('tipo=uscite')
    expect(soloUscite.body.totali).toEqual({ entrate: 0, uscite: 40, saldoNetto: -40 })
    expect(soloUscite.body.conteggi.attivi).toBe(2)

    const cestino = await lista('cestino=1')
    expect(cestino.body.data.map((r) => r.descrizione)).toEqual(['cestinata'])
  })

  it('cerca su descrizione, causale, note e testo grezzo', async () => {
    const { venueId, contoId } = await contesto()
    await riga(venueId, contoId, { data: '2026-08-01', importo: -1, descrizione: 'ROSSI SRL', causale: 'Bonifico a vs favore' })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -2, descrizione: 'altro' })
    expect((await lista('search=rossi')).body.data).toHaveLength(1)
    expect((await lista('search=bonifico')).body.data).toHaveLength(1)
    expect((await lista('search=nessuno')).body.data).toHaveLength(0)
  })

  it('calcola lo stato della legenda per riga', async () => {
    const { venueId, contoId, centroId } = await contesto()
    const scrittura = await prisma.journalEntry.create({
      data: { venueId, date: new Date('2026-08-01'), registerType: 'BANK', description: 'Commissioni', creditAmount: 0.75, costCenterId: centroId },
    })
    await riga(venueId, contoId, { data: '2026-08-01', importo: -0.75, descrizione: 'commissione', matchedEntryId: scrittura.id, status: 'MANUAL' })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -20, descrizione: 'libera' })

    const tutte = await lista('ordina=data&verso=asc')
    expect(tutte.body.data.map((r) => [r.descrizione, r.stato, r.residuo])).toEqual([
      ['commissione', 'abbinato_manualmente', 0],
      ['libera', 'non_abbinato', 20],
    ])
    expect((await lista('soloNonRiconciliati=1')).body.data.map((r) => r.descrizione)).toEqual(['libera'])
  })

  it('come staff risponde 403', async () => {
    logout()
    await entraCome('staff')
    expect((await lista('')).status).toBe(403)
  })
})
```

Eseguire → rosso su `totali`/`conteggi`/`ordina`.

- [ ] **Step 6: la `GET`**

In `src/app/api/bank-transactions/route.ts`, sostituire il corpo della `GET` (dalla lettura dei `searchParams` alla risposta) con:

```ts
    const filtri = filtriDaSearchParams(request.nextUrl.searchParams)
    const where = costruisciWhere(filtri, venueId)

    // Un `$transaction` a lista: una connessione sola. Sette query in
    // `Promise.all` prenderebbero sette connessioni su un pool da dieci.
    const [righe, totale, entrate, uscite, perSezione, cestino, perStato] = await prisma.$transaction([
      prisma.bankTransaction.findMany({
        where,
        ...SELEZIONE_RIGA,
        orderBy: costruisciOrderBy(filtri),
        skip: (filtri.page - 1) * filtri.limit,
        take: filtri.limit,
      }),
      prisma.bankTransaction.count({ where }),
      prisma.bankTransaction.aggregate({ where: { ...where, amount: { gt: 0 } }, _sum: { amount: true } }),
      prisma.bankTransaction.aggregate({ where: { ...where, amount: { lt: 0 } }, _sum: { amount: true } }),
      prisma.bankTransaction.groupBy({ by: ['sezione'], where: { venueId, deletedAt: null }, _count: { _all: true } }),
      prisma.bankTransaction.count({ where: { venueId, deletedAt: { not: null } } }),
      prisma.bankTransaction.groupBy({ by: ['status'], where: { venueId, deletedAt: null }, _count: { id: true } }),
    ])

    const conta = (sezione: string) => perSezione.find((s) => s.sezione === sezione)?._count._all ?? 0
    const sommaEntrate = Number(entrate._sum.amount ?? 0)
    const sommaUscite = Math.abs(Number(uscite._sum.amount ?? 0))
    const summaryMap = Object.fromEntries(perStato.map((s) => [s.status, s._count.id])) as Record<string, number>

    return NextResponse.json({
      data: righe.map(mappaRiga),
      pagination: { page: filtri.page, limit: filtri.limit, total: totale, totalPages: Math.ceil(totale / filtri.limit) },
      totali: { entrate: sommaEntrate, uscite: sommaUscite, saldoNetto: Math.round((sommaEntrate - sommaUscite) * 100) / 100 },
      conteggi: { attivi: conta('ATTIVI'), delegheF24: conta('DELEGHE_F24'), cbillPagopa: conta('CBILL_PAGOPA'), cestino },
      // Il riepilogo di prima, per la pagina /riconciliazione finché esiste.
      summary: {
        total: totale,
        pending: summaryMap.PENDING || 0,
        matched: summaryMap.MATCHED || 0,
        toReview: summaryMap.TO_REVIEW || 0,
        manual: summaryMap.MANUAL || 0,
        ignored: summaryMap.IGNORED || 0,
        unmatched: summaryMap.UNMATCHED || 0,
      },
    })
```

Import in testa: `filtriDaSearchParams` da `@/lib/banca/filtri-estratto-conto`, `costruisciWhere`, `costruisciOrderBy`, `SELEZIONE_RIGA`, `mappaRiga` da `@/lib/banca/query-estratto-conto`. Il vecchio `bankTransactionFiltersSchema` resta usato? Se non lo usa più nessuno, toglierlo da `validations/reconciliation.ts` (knip lo segnalerebbe). Il parametro `status` che la pagina `/riconciliazione` manda ancora (`?status=TO_REVIEW`) va conservato: aggiungere a `filtriEstrattoContoSchema` `status: reconciliationStatusSchema.optional()` e in `costruisciWhere` `if (f.status) where.status = f.status` — con un test in più in `lista.itest.ts` («filtra per stato, per la pagina di riconciliazione»).

- [ ] **Step 7: verde, tipi, commit**

```bash
TEST_DB_SUFFIX=estratto PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/app/api/bank-transactions/__tests__/lista.itest.ts
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca "src/app/(dashboard)/riconciliazione"
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test
git add src/types/reconciliation.ts src/lib/banca src/app/api/bank-transactions/route.ts src/lib/validations/reconciliation.ts
git commit -m "feat(banca): la lista dell'estratto conto dal server, con ordinamento, sezioni, cestino, totali, conteggi e stato

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Il test di `RiconciliazioneClient` scritto il 16 agosto legge `pagination` e `data`: deve restare verde.)

---

## Task 6: modificare descrizione, causale e note — con la cronologia

**Files:**
- Create: `src/lib/banca/cronologia.ts`
- Modify: `src/lib/validations/reconciliation.ts` (`patchBankTransactionSchema`)
- Modify: `src/app/api/bank-transactions/[id]/route.ts` (aggiunge `PATCH`)
- Create: `src/app/api/bank-transactions/[id]/cronologia/route.ts`
- Test: `src/app/api/bank-transactions/[id]/__tests__/modifica.itest.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/lib/banca/cronologia.ts
  export const CAMPI_BADGE = ['descrizione', 'causale', 'note'] as const
  export type CampoCronologia = 'descrizione' | 'causale' | 'note' | 'sezione'
  export interface Modifica { campo: CampoCronologia; prima: string | null; dopo: string | null }
  export function differenze(prima: Record<CampoCronologia, string | null>, dopo: Partial<Record<CampoCronologia, string | null>>): Modifica[]
  export async function registraModifiche(tx: Prisma.TransactionClient, input: { bankTransactionId: string; userId: string | null; modifiche: Modifica[] }): Promise<void>
  // PATCH /api/bank-transactions/[id]  → 200 { riga aggiornata (RigaEstrattoConto) } | 400 | 404
  // GET  /api/bank-transactions/[id]/cronologia → 200 { modifiche: Array<{ id, campo, prima, dopo, quando: string, utente: string | null }> }
  ```

- [ ] **Step 1: il test d'integrazione**

`src/app/api/bank-transactions/[id]/__tests__/modifica.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { PATCH } from '../route'
import { GET as cronologiaGET } from '../cronologia/route'

setupIntegrationDb()

async function rigaDellaBanca(importSource: 'PSD2_GOCARDLESS' | 'MANUAL' = 'PSD2_GOCARDLESS') {
  const venue = await prisma.venue.findFirstOrThrow()
  return prisma.bankTransaction.create({
    data: {
      venueId: venue.id,
      transactionDate: new Date('2026-08-10'),
      description: 'Bonifico a vs favore *ROSSI SRL',
      descrizione: 'ROSSI SRL',
      causale: 'Bonifico a vs favore',
      amount: -100,
      importSource,
      status: 'PENDING',
    },
  })
}

function patch(id: string, body: unknown) {
  return callRoute<{ error?: string; descrizione?: string; modificato?: boolean }, { id: string }>(
    PATCH,
    jsonRequest(`http://localhost/api/bank-transactions/${id}`, { method: 'PATCH', body }),
    { id }
  )
}

describe('PATCH /api/bank-transactions/[id]', () => {
  beforeEach(async () => {
    logout()
    await entraCome('admin')
  })

  it('modifica descrizione, causale e note e scrive la cronologia', async () => {
    const r = await rigaDellaBanca()
    const risposta = await patch(r.id, { descrizione: 'Rossi S.r.l., saldo fattura 12', note: 'pagata in ritardo' })
    expect(risposta.status).toBe(200)
    expect(risposta.body.descrizione).toBe('Rossi S.r.l., saldo fattura 12')
    expect(risposta.body.modificato).toBe(true)

    const dopo = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })
    expect(dopo.description).toBe('Bonifico a vs favore *ROSSI SRL') // il grezzo non si tocca
    expect(dopo.causale).toBe('Bonifico a vs favore') // non toccata: non era nel corpo

    const cronologia = await prisma.bankTransactionEdit.findMany({ where: { bankTransactionId: r.id }, orderBy: { campo: 'asc' } })
    expect(cronologia.map((c) => [c.campo, c.prima, c.dopo])).toEqual([
      ['descrizione', 'ROSSI SRL', 'Rossi S.r.l., saldo fattura 12'],
      ['note', null, 'pagata in ritardo'],
    ])
  })

  it('un valore uguale a quello di prima non produce cronologia', async () => {
    const r = await rigaDellaBanca()
    await patch(r.id, { descrizione: 'ROSSI SRL' })
    expect(await prisma.bankTransactionEdit.count({ where: { bankTransactionId: r.id } })).toBe(0)
  })

  // Data, importo e verso sono della banca: la rotta li rifiuta per forma, non per permesso.
  it('rifiuta data e importo su una riga della banca', async () => {
    const r = await rigaDellaBanca()
    expect((await patch(r.id, { amount: -50 })).status).toBe(400)
    expect((await patch(r.id, { transactionDate: '2026-08-11' })).status).toBe(400)
    expect((await patch(r.id, { status: 'MATCHED' })).status).toBe(400)
    const intatta = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })
    expect(Number(intatta.amount)).toBe(-100)
  })

  it('su una riga MANUAL accetta anche data e importo', async () => {
    const r = await rigaDellaBanca('MANUAL')
    const risposta = await patch(r.id, { amount: -80, transactionDate: '2026-08-11' })
    expect(risposta.status).toBe(200)
    const dopo = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })
    expect(Number(dopo.amount)).toBe(-80)
  })

  it('su una riga nel Cestino risponde 404', async () => {
    const r = await rigaDellaBanca()
    await prisma.bankTransaction.update({ where: { id: r.id }, data: { deletedAt: new Date() } })
    expect((await patch(r.id, { note: 'x' })).status).toBe(404)
  })

  it('come staff risponde 403', async () => {
    logout()
    await entraCome('staff')
    const r = await rigaDellaBanca()
    expect((await patch(r.id, { note: 'x' })).status).toBe(403)
  })
})

describe('GET /api/bank-transactions/[id]/cronologia', () => {
  it('elenca le modifiche, la più recente per prima, con chi le ha fatte', async () => {
    logout()
    const sessione = await entraCome('admin')
    const r = await rigaDellaBanca()
    await patch(r.id, { note: 'prima nota' })
    await patch(r.id, { note: 'seconda nota' })

    const risposta = await callRoute<{ modifiche: Array<{ campo: string; prima: string | null; dopo: string | null; utente: string | null }> }, { id: string }>(
      cronologiaGET,
      jsonRequest(`http://localhost/api/bank-transactions/${r.id}/cronologia`),
      { id: r.id }
    )
    expect(risposta.status).toBe(200)
    expect(risposta.body.modifiche.map((m) => [m.campo, m.prima, m.dopo])).toEqual([
      ['note', 'prima nota', 'seconda nota'],
      ['note', null, 'prima nota'],
    ])
    expect(risposta.body.modifiche[0].utente).toBe(sessione.user.name ?? sessione.user.email)
  })
})
```

Prima di scrivere l'asserzione su `utente`, leggere in `src/test/integration/auth-mock.ts:134-160` cosa mette `entraCome` in `session.user` (nome, email) e in `prisma.user` (firstName/lastName): l'atteso deve essere quello che la rotta ricava da `firstName + ' ' + lastName` dell'utente del seed. Adeguare la riga.

- [ ] **Step 2: eseguirlo e vederlo fallire**

`TEST_DB_SUFFIX=estratto PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts "src/app/api/bank-transactions/[id]/__tests__/modifica.itest.ts"` → rosso: `PATCH` non esportata.

- [ ] **Step 3: la cronologia come libreria**

`src/lib/banca/cronologia.ts`:

```ts
import type { Prisma } from '@prisma/client'

/**
 * La cronologia delle modifiche a un movimento bancario: una riga per campo
 * cambiato, prima/dopo/chi/quando. Il badge «Modificato» guarda i soli campi
 * del movimento (`CAMPI_BADGE`): spostare di scheda si registra ma non è una
 * modifica del movimento.
 */
export const CAMPI_BADGE = ['descrizione', 'causale', 'note'] as const
export type CampoCronologia = 'descrizione' | 'causale' | 'note' | 'sezione'

export interface Modifica {
  campo: CampoCronologia
  prima: string | null
  dopo: string | null
}

/** Solo ciò che cambia davvero: un valore uguale a prima non lascia traccia. */
export function differenze(
  prima: Record<CampoCronologia, string | null>,
  dopo: Partial<Record<CampoCronologia, string | null>>
): Modifica[] {
  const esito: Modifica[] = []
  for (const campo of Object.keys(dopo) as CampoCronologia[]) {
    const nuovo = dopo[campo] ?? null
    if (nuovo !== prima[campo]) esito.push({ campo, prima: prima[campo], dopo: nuovo })
  }
  return esito
}

export async function registraModifiche(
  tx: Prisma.TransactionClient,
  input: { bankTransactionId: string; userId: string | null; modifiche: Modifica[] }
): Promise<void> {
  if (input.modifiche.length === 0) return
  await tx.bankTransactionEdit.createMany({
    data: input.modifiche.map((m) => ({
      bankTransactionId: input.bankTransactionId,
      campo: m.campo,
      prima: m.prima,
      dopo: m.dopo,
      userId: input.userId,
    })),
  })
}
```

Test unitario in `src/lib/banca/__tests__/cronologia.test.ts` per `differenze` (tre casi: campo cambiato, campo uguale, campo assente nel `dopo` → non tocca):

```ts
import { describe, it, expect } from 'vitest'
import { differenze } from '../cronologia'

const prima = { descrizione: 'ROSSI', causale: 'Bonifico', note: null, sezione: 'ATTIVI' }

describe('differenze', () => {
  it('registra solo i campi che cambiano', () => {
    expect(differenze(prima, { descrizione: 'Rossi S.r.l.', causale: 'Bonifico' })).toEqual([
      { campo: 'descrizione', prima: 'ROSSI', dopo: 'Rossi S.r.l.' },
    ])
  })
  it('un campo assente nel dopo non si tocca', () => {
    expect(differenze(prima, {})).toEqual([])
  })
  it('svuotare un campo è una modifica verso null', () => {
    expect(differenze(prima, { causale: null })).toEqual([{ campo: 'causale', prima: 'Bonifico', dopo: null }])
  })
})
```

- [ ] **Step 4: lo schema della `PATCH`**

In `src/lib/validations/reconciliation.ts`:

```ts
// Modifica di una riga: `strict()` perché la forma della rotta È il divieto —
// data, importo e verso della banca non sono campi che si possono mandare.
export const patchBankTransactionSchema = z
  .object({
    descrizione: z.string().max(500).nullable().optional(),
    causale: z.string().max(120).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    // Solo sulle righe MANUAL; sulle altre la rotta risponde 400 se compaiono.
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    amount: z.number().refine((n) => n !== 0, "L'importo non può essere zero").optional(),
  })
  .strict()
export const CAMPI_SOLO_MANUALI = ['transactionDate', 'valueDate', 'amount'] as const
```

- [ ] **Step 5: la rotta `PATCH`**

In `src/app/api/bank-transactions/[id]/route.ts`, in coda al file:

```ts
export const PATCH = withAuth<{ id: string }>(
  async (request, { venueId, user, params }) => {
    let corpo: unknown
    try {
      corpo = await request.json()
    } catch {
      return NextResponse.json({ error: 'Corpo non valido' }, { status: 400 })
    }
    const parsed = patchBankTransactionSchema.safeParse(corpo)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dati non validi', details: parsed.error.issues }, { status: 400 })
    }
    const dati = parsed.data

    const riga = await prisma.bankTransaction.findFirst({ where: { id: params.id, venueId } })
    if (!riga) return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })

    // Data, importo e verso vengono dalla banca: non è un permesso, è la forma
    // del dato (spec, decisione 2). Solo la riga inserita a mano li cambia.
    const toccaCampiDellaBanca = CAMPI_SOLO_MANUALI.some((c) => dati[c] !== undefined)
    if (toccaCampiDellaBanca && riga.importSource !== 'MANUAL') {
      return NextResponse.json(
        { error: 'Data e importo vengono dalla banca e non si modificano' },
        { status: 400 }
      )
    }

    const pulisci = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null)
    const dopo = {
      ...(dati.descrizione !== undefined ? { descrizione: pulisci(dati.descrizione) ?? null } : {}),
      ...(dati.causale !== undefined ? { causale: pulisci(dati.causale) ?? null } : {}),
      ...(dati.note !== undefined ? { note: pulisci(dati.note) ?? null } : {}),
    }
    const modifiche = differenze(
      { descrizione: riga.descrizione, causale: riga.causale, note: riga.note, sezione: riga.sezione },
      dopo
    )

    const aggiornata = await prisma.$transaction(async (tx) => {
      await tx.bankTransaction.update({
        where: { id: riga.id },
        data: {
          ...dopo,
          ...(dati.transactionDate ? { transactionDate: new Date(`${dati.transactionDate}T00:00:00.000Z`) } : {}),
          ...(dati.valueDate !== undefined
            ? { valueDate: dati.valueDate ? new Date(`${dati.valueDate}T00:00:00.000Z`) : null }
            : {}),
          ...(dati.amount !== undefined ? { amount: dati.amount } : {}),
        },
      })
      await registraModifiche(tx, { bankTransactionId: riga.id, userId: user.id ?? null, modifiche })
      return tx.bankTransaction.findUniqueOrThrow({ where: { id: riga.id }, ...SELEZIONE_RIGA })
    })

    return NextResponse.json(mappaRiga(aggiornata))
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

Import: `withAuth` da `@/lib/api-utils`, `patchBankTransactionSchema`, `CAMPI_SOLO_MANUALI` da `@/lib/validations/reconciliation`, `differenze`, `registraModifiche` da `@/lib/banca/cronologia`, `SELEZIONE_RIGA`, `mappaRiga` da `@/lib/banca/query-estratto-conto`. Il `findFirst` col solo `id, venueId` esclude da solo il Cestino (l'estensione aggiunge `deletedAt: null`): è il 404 atteso dal test.

- [ ] **Step 6: la rotta della cronologia**

`src/app/api/bank-transactions/[id]/cronologia/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'

/** La scheda «Cronologia modifiche»: prima/dopo/chi/quando, la più recente per prima. */
export const GET = withAuth<{ id: string }>(
  async (_request, { venueId, params }) => {
    // Anche dal Cestino si legge la cronologia: la seconda ricerca è per le
    // righe cestinate, che l'estensione soft-delete nasconde alla prima.
    const riga =
      (await prisma.bankTransaction.findFirst({ where: { id: params.id, venueId }, select: { id: true } })) ??
      (await prisma.bankTransaction.findFirst({ where: { id: params.id, venueId, deletedAt: { not: null } }, select: { id: true } }))
    if (!riga) return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })

    const modifiche = await prisma.bankTransactionEdit.findMany({
      where: { bankTransactionId: riga.id },
      orderBy: { createdAt: 'desc' },
    })
    const idUtenti = [...new Set(modifiche.map((m) => m.userId).filter((u): u is string => !!u))]
    const utenti = idUtenti.length
      ? await prisma.user.findMany({ where: { id: { in: idUtenti } }, select: { id: true, firstName: true, lastName: true } })
      : []
    const nome = new Map(utenti.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))

    return NextResponse.json({
      modifiche: modifiche.map((m) => ({
        id: m.id,
        campo: m.campo,
        prima: m.prima,
        dopo: m.dopo,
        quando: m.createdAt.toISOString(),
        utente: m.userId ? (nome.get(m.userId) ?? null) : null,
      })),
    })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

Aggiungere in `modifica.itest.ts` un caso: «la cronologia si legge anche dal Cestino» (riga con `deletedAt` valorizzato e una modifica registrata prima di cestinarla → 200 con la modifica).

- [ ] **Step 7: verde e commit**

```bash
TEST_DB_SUFFIX=estratto PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts "src/app/api/bank-transactions/[id]/__tests__/modifica.itest.ts"
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/banca/__tests__/cronologia.test.ts
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test
node scripts/check-route-auth.mjs --ratchet
git add src/lib/banca/cronologia.ts src/lib/banca/__tests__/cronologia.test.ts src/lib/validations/reconciliation.ts "src/app/api/bank-transactions/[id]"
git commit -m "feat(banca): modifica di descrizione, causale e note con la cronologia; data e importo restano della banca

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Sposta in, Cestino con Ripristina, azioni in blocco; via «Ignora»

**Files:**
- Modify: `src/lib/validations/reconciliation.ts` (`sezioneSchema`, `azioniInBloccoSchema`)
- Create: `src/app/api/bank-transactions/[id]/sezione/route.ts`
- Create: `src/app/api/bank-transactions/[id]/ripristina/route.ts`
- Create: `src/app/api/bank-transactions/azioni-in-blocco/route.ts`
- Modify: `src/app/api/bank-transactions/[id]/route.ts` (`DELETE`, righe 114-160: la regola del rifiuto)
- Delete: `src/app/api/bank-transactions/[id]/ignore/route.ts`; `ignoreTransaction` in `src/lib/reconciliation/matcher.ts` (~riga 407) e la sua riga in `src/lib/reconciliation/index.ts:8`; i casi su `ignoreTransaction` in `src/lib/reconciliation/__tests__/transazioni-cancellate.itest.ts`; `onIgnore`/«Ignora» in `src/components/reconciliation/BankTransactionTable.tsx` (righe 38, 60, 217-223) e `handleIgnore` in `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx`
- Test: `src/app/api/bank-transactions/__tests__/sezione-cestino-blocco.itest.ts`

**Interfaces:**
- Produces:
  ```ts
  // POST /api/bank-transactions/[id]/sezione      { sezione: SezioneMovimentoBancario } → 200 { ok: true } | 404
  // POST /api/bank-transactions/[id]/ripristina   → 200 { ok: true } | 404 (non era nel Cestino)
  // DELETE /api/bank-transactions/[id]             → 200 | 409 { error } se matchedEntryId ≠ null | 404
  // POST /api/bank-transactions/azioni-in-blocco   { azione: 'sposta' | 'cestino' | 'ripristina', sezione?, ids?: string[], filtro?: Record<string,string> }
  //                                                 → 200 { toccate: number, saltate: number }
  ```
  `filtro` è l'oggetto dei parametri di URL della lista (le stesse chiavi di `filtriEstrattoContoSchema`): il server lo rilegge con `filtriDaSearchParams(new URLSearchParams(filtro))` e ne ricava il `where` con `costruisciWhere`. Uno fra `ids` e `filtro` è obbligatorio.

- [ ] **Step 1: il test d'integrazione**

`src/app/api/bank-transactions/__tests__/sezione-cestino-blocco.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { POST as sezionePOST } from '../[id]/sezione/route'
import { POST as ripristinaPOST } from '../[id]/ripristina/route'
import { DELETE } from '../[id]/route'
import { POST as bloccoPOST } from '../azioni-in-blocco/route'

setupIntegrationDb()

async function contesto() {
  const venue = await prisma.venue.findFirstOrThrow()
  const centro = await prisma.costCenter.findFirstOrThrow()
  return { venueId: venue.id, centroId: centro.id }
}

async function riga(venueId: string, descrizione: string, extra: Record<string, unknown> = {}) {
  return prisma.bankTransaction.create({
    data: { venueId, transactionDate: new Date('2026-08-10'), description: descrizione, descrizione, amount: -10, importSource: 'PSD2_GOCARDLESS', status: 'PENDING', ...extra },
  })
}

const url = (id: string, coda = '') => `http://localhost/api/bank-transactions/${id}${coda}`

describe('sezione, cestino, ripristino', () => {
  beforeEach(async () => {
    logout()
    await entraCome('admin')
  })

  it('sposta una riga in Deleghe F24 e lo registra in cronologia', async () => {
    const { venueId } = await contesto()
    const r = await riga(venueId, 'F24')
    const risposta = await callRoute<unknown, { id: string }>(sezionePOST, jsonRequest(url(r.id, '/sezione'), { method: 'POST', body: { sezione: 'DELEGHE_F24' } }), { id: r.id })
    expect(risposta.status).toBe(200)
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })).sezione).toBe('DELEGHE_F24')
    const cronologia = await prisma.bankTransactionEdit.findMany({ where: { bankTransactionId: r.id } })
    expect(cronologia.map((c) => [c.campo, c.prima, c.dopo])).toEqual([['sezione', 'ATTIVI', 'DELEGHE_F24']])
  })

  it('il Cestino è morbido, e Ripristina lo annulla', async () => {
    const { venueId } = await contesto()
    const r = await riga(venueId, 'da cestinare')
    expect((await callRoute<unknown, { id: string }>(DELETE, jsonRequest(url(r.id), { method: 'DELETE' }), { id: r.id })).status).toBe(200)
    expect(await prisma.bankTransaction.findFirst({ where: { id: r.id, deletedAt: { not: null } } })).not.toBeNull()

    expect((await callRoute<unknown, { id: string }>(ripristinaPOST, jsonRequest(url(r.id, '/ripristina'), { method: 'POST' }), { id: r.id })).status).toBe(200)
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })).deletedAt).toBeNull()
  })

  it('ripristinare una riga che non è nel Cestino risponde 404', async () => {
    const { venueId } = await contesto()
    const r = await riga(venueId, 'viva')
    expect((await callRoute<unknown, { id: string }>(ripristinaPOST, jsonRequest(url(r.id, '/ripristina'), { method: 'POST' }), { id: r.id })).status).toBe(404)
  })

  // Una riga con una scrittura collegata non si cestina: prima si scollega (spec, «Le azioni»).
  it('rifiuta con 409 il Cestino su una riga con scrittura collegata', async () => {
    const { venueId, centroId } = await contesto()
    const scrittura = await prisma.journalEntry.create({ data: { venueId, date: new Date('2026-08-10'), registerType: 'BANK', description: 'x', creditAmount: 10, costCenterId: centroId } })
    const r = await riga(venueId, 'collegata', { matchedEntryId: scrittura.id, status: 'MANUAL' })
    const risposta = await callRoute<{ error?: string }, { id: string }>(DELETE, jsonRequest(url(r.id), { method: 'DELETE' }), { id: r.id })
    expect(risposta.status).toBe(409)
  })
})

describe('azioni in blocco', () => {
  beforeEach(async () => {
    logout()
    await entraCome('admin')
  })

  it('sposta un elenco di id, e conta le righe toccate', async () => {
    const { venueId } = await contesto()
    const a = await riga(venueId, 'a')
    const b = await riga(venueId, 'b')
    await riga(venueId, 'c')
    const risposta = await callRoute<{ toccate: number; saltate: number }>(bloccoPOST, jsonRequest('http://localhost/api/bank-transactions/azioni-in-blocco', { method: 'POST', body: { azione: 'sposta', sezione: 'CBILL_PAGOPA', ids: [a.id, b.id] } }))
    expect(risposta.status).toBe(200)
    expect(risposta.body).toEqual({ toccate: 2, saltate: 0 })
    expect(await prisma.bankTransaction.count({ where: { venueId, sezione: 'CBILL_PAGOPA' } })).toBe(2)
    expect(await prisma.bankTransactionEdit.count({ where: { campo: 'sezione' } })).toBe(2)
  })

  // «Seleziona tutte le N del filtro»: il server rilegge il filtro, non una lista costruita dal client.
  it('cestina per filtro, e salta le righe con scrittura collegata', async () => {
    const { venueId, centroId } = await contesto()
    const scrittura = await prisma.journalEntry.create({ data: { venueId, date: new Date('2026-08-10'), registerType: 'BANK', description: 'x', creditAmount: 10, costCenterId: centroId } })
    await riga(venueId, 'commissione 1', { amount: -0.75 })
    await riga(venueId, 'commissione 2', { amount: -0.75 })
    await riga(venueId, 'collegata', { amount: -0.75, matchedEntryId: scrittura.id, status: 'MANUAL' })
    await riga(venueId, 'entrata', { amount: 100 })

    const risposta = await callRoute<{ toccate: number; saltate: number }>(bloccoPOST, jsonRequest('http://localhost/api/bank-transactions/azioni-in-blocco', { method: 'POST', body: { azione: 'cestino', filtro: { tipo: 'uscite' } } }))
    expect(risposta.body).toEqual({ toccate: 2, saltate: 1 })
    expect(await prisma.bankTransaction.count({ where: { venueId, deletedAt: { not: null } } })).toBe(2)
    expect(await prisma.bankTransaction.count({ where: { venueId, deletedAt: null } })).toBe(2)
  })

  it('senza ids né filtro risponde 400', async () => {
    const risposta = await callRoute(bloccoPOST, jsonRequest('http://localhost/api/bank-transactions/azioni-in-blocco', { method: 'POST', body: { azione: 'cestino' } }))
    expect(risposta.status).toBe(400)
  })
})
```

Eseguire → rosso: moduli assenti.

- [ ] **Step 2: gli schemi**

In `src/lib/validations/reconciliation.ts`:

```ts
export const sezioneMovimentoSchema = z.enum(['ATTIVI', 'DELEGHE_F24', 'CBILL_PAGOPA'])
export const spostaSezioneSchema = z.object({ sezione: sezioneMovimentoSchema })

// Le azioni in blocco viaggiano per elenco di id **o** per filtro (le stesse
// chiavi dell'URL della lista): «seleziona tutte le 231 del filtro» non deve
// dipendere da cosa il client credeva di aver selezionato.
export const azioniInBloccoSchema = z
  .object({
    azione: z.enum(['sposta', 'cestino', 'ripristina']),
    sezione: sezioneMovimentoSchema.optional(),
    ids: z.array(z.string().min(1)).min(1).max(1000).optional(),
    filtro: z.record(z.string(), z.string()).optional(),
  })
  .refine((v) => !!v.ids !== !!v.filtro, { message: 'Indica ids oppure filtro, non entrambi' })
  .refine((v) => v.azione !== 'sposta' || !!v.sezione, { message: 'Per spostare serve la sezione' })
```

- [ ] **Step 3: le rotte**

`src/app/api/bank-transactions/[id]/sezione/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { spostaSezioneSchema } from '@/lib/validations/reconciliation'
import { registraModifiche } from '@/lib/banca/cronologia'

/** «Sposta in»: cambia la scheda in cui la riga si vede, non la contabilità (spec, decisione 5). */
export const POST = withAuth<{ id: string }>(
  async (request, { venueId, user, params }) => {
    const parsed = spostaSezioneSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Sezione non valida' }, { status: 400 })

    const riga = await prisma.bankTransaction.findFirst({ where: { id: params.id, venueId }, select: { id: true, sezione: true } })
    if (!riga) return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    if (riga.sezione === parsed.data.sezione) return NextResponse.json({ ok: true })

    await prisma.$transaction(async (tx) => {
      await tx.bankTransaction.update({ where: { id: riga.id }, data: { sezione: parsed.data.sezione } })
      await registraModifiche(tx, {
        bankTransactionId: riga.id,
        userId: user.id ?? null,
        modifiche: [{ campo: 'sezione', prima: riga.sezione, dopo: parsed.data.sezione }],
      })
    })
    return NextResponse.json({ ok: true })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

`src/app/api/bank-transactions/[id]/ripristina/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'

/** Dal Cestino alla vita: `updateMany` con `deletedAt` esplicito, perché un `update({ where: { id } })` non vedrebbe la riga cestinata. */
export const POST = withAuth<{ id: string }>(
  async (_request, { venueId, params }) => {
    const esito = await prisma.bankTransaction.updateMany({
      where: { id: params.id, venueId, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null },
    })
    if (esito.count === 0) return NextResponse.json({ error: 'Il movimento non è nel Cestino' }, { status: 404 })
    return NextResponse.json({ ok: true })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

`DELETE` in `src/app/api/bank-transactions/[id]/route.ts`: sostituire il blocco «Non permettere eliminazione di transazioni già riconciliate» con:

```ts
    // Una riga con una scrittura collegata non si cestina: prima si scollega,
    // altrimenti la scrittura resterebbe appesa a un movimento invisibile.
    if (transaction.matchedEntryId) {
      return NextResponse.json(
        { error: 'Il movimento ha una scrittura collegata: prima scollegala, poi spostalo nel Cestino' },
        { status: 409 }
      )
    }
```

e nel `data` dell'update aggiungere `deletedById: session.user.id`.

`src/app/api/bank-transactions/azioni-in-blocco/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { azioniInBloccoSchema } from '@/lib/validations/reconciliation'
import { filtriDaSearchParams } from '@/lib/banca/filtri-estratto-conto'
import { costruisciWhere } from '@/lib/banca/query-estratto-conto'
import { registraModifiche } from '@/lib/banca/cronologia'

/**
 * Sposta in / Cestino / Ripristina su più righe, per elenco di id o per filtro.
 * Il filtro è lo stesso della lista: chi sceglie «tutte le 231 del filtro»
 * ottiene esattamente le 231 che vede, calcolate dal server.
 */
export const POST = withAuth(
  async (request, { venueId, user }) => {
    const parsed = azioniInBloccoSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Richiesta non valida', details: parsed.error.issues }, { status: 400 })
    const { azione, sezione, ids, filtro } = parsed.data

    const where = ids
      ? { id: { in: ids }, venueId, ...(azione === 'ripristina' ? { deletedAt: { not: null } } : { deletedAt: null }) }
      : costruisciWhere(filtriDaSearchParams(new URLSearchParams(filtro)), venueId)

    const righe = await prisma.bankTransaction.findMany({ where, select: { id: true, sezione: true, matchedEntryId: true, deletedAt: true } })

    const esito = await prisma.$transaction(async (tx) => {
      let toccate = 0
      let saltate = 0
      for (const riga of righe) {
        if (azione === 'sposta') {
          if (riga.sezione === sezione) continue
          await tx.bankTransaction.update({ where: { id: riga.id }, data: { sezione } })
          await registraModifiche(tx, { bankTransactionId: riga.id, userId: user.id ?? null, modifiche: [{ campo: 'sezione', prima: riga.sezione, dopo: sezione! }] })
          toccate++
        } else if (azione === 'cestino') {
          if (riga.matchedEntryId) { saltate++; continue }
          await tx.bankTransaction.updateMany({ where: { id: riga.id, deletedAt: null }, data: { deletedAt: new Date(), deletedById: user.id ?? null } })
          toccate++
        } else {
          const r = await tx.bankTransaction.updateMany({ where: { id: riga.id, deletedAt: { not: null } }, data: { deletedAt: null, deletedById: null } })
          toccate += r.count
        }
      }
      return { toccate, saltate }
    })

    return NextResponse.json(esito)
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

Il `findMany` con `where` da `costruisciWhere` porta `deletedAt` esplicito (Cestino o vive), quindi «ripristina per filtro» funziona solo con `filtro.cestino = '1'`, che è l'unico caso in cui la UI lo offre. Le righe già nella sezione richiesta non si contano fra le toccate.

- [ ] **Step 4: via «Ignora»**

- Cancellare `src/app/api/bank-transactions/[id]/ignore/route.ts`.
- In `src/lib/reconciliation/matcher.ts` togliere `ignoreTransaction` (e il suo commento); in `src/lib/reconciliation/index.ts` la riga che la esporta.
- In `src/lib/reconciliation/__tests__/transazioni-cancellate.itest.ts` togliere i casi che chiamano `ignoreTransaction` (restano quelli su `unmatch`); se il file resta con un solo `describe` sensato, bene; se resta vuoto, cancellarlo.
- In `src/components/reconciliation/BankTransactionTable.tsx` togliere la prop `onIgnore` e il pulsante «Ignora»; in `RiconciliazioneClient.tsx` togliere `handleIgnore` e la prop passata.
- Il valore `IGNORED` resta nell'enum, nei badge e nella scheda «Ignorati» (zero righe in produzione; sparirà con la pagina nella consegna B).

- [ ] **Step 5: verde, cricchetto, commit**

```bash
TEST_DB_SUFFIX=estratto PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts src/app/api/bank-transactions src/lib/reconciliation/__tests__/transazioni-cancellate.itest.ts
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run "src/app/(dashboard)/riconciliazione" src/components/reconciliation
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test
node scripts/check-route-auth.mjs --ratchet
git add -A src/app/api/bank-transactions src/lib/validations/reconciliation.ts src/lib/reconciliation src/components/reconciliation/BankTransactionTable.tsx "src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx"
git commit -m "feat(banca): Sposta in, Cestino con Ripristina e azioni in blocco; via l'azione Ignora

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: la lista — schede, totali, filtri, tabella ordinabile, colonne, paginazione, selezione, legenda

**Files:**
- Create: `src/components/banca/estratto-conto/colonne.ts` (+ `__tests__/colonne.test.ts`)
- Create: `src/components/banca/estratto-conto/EstrattoConto.tsx` (il contenitore: stato dei filtri, query, composizione)
- Create: `src/components/banca/estratto-conto/SchedeEstrattoConto.tsx`, `FiltriEstrattoConto.tsx`, `TabellaEstrattoConto.tsx`, `IntestazioneOrdinabile.tsx`, `IconaStato.tsx`, `SelettoreColonne.tsx`, `BarraSelezione.tsx`, `PaginazioneEstrattoConto.tsx`, `LegendaStati.tsx`, `StatoVuoto.tsx`
- Test: `src/components/banca/estratto-conto/__tests__/EstrattoConto.test.tsx`

**Interfaces:**
- Consumes: `RispostaEstrattoConto`, `RigaEstrattoConto`, `StatoLegenda` (Task 5), `FiltriEstrattoConto`, `filtriInSearchParams`, `FILTRI_DEFAULT`, `OrdinaPer` (Task 5), `FreschezzaMovimenti` (`@/components/banca/FreschezzaMovimenti`), `formatCurrency` (`@/lib/formatters`), `useDebounce` (`@/hooks/useDebounce`), le primitive di `@/components/ui/*` (button, badge, checkbox, dropdown-menu, select, popover, table, tabs, tooltip, input).
- Produces:
  ```ts
  // colonne.ts
  export type IdColonna = 'data' | 'descrizione' | 'causale' | 'conto' | 'stato' | 'importo'
  export interface Colonna { id: IdColonna; etichetta: string; ordina?: OrdinaPer; aDestra?: boolean }
  export const COLONNE: readonly Colonna[]
  export const CHIAVE_COLONNE = 'weiss.estrattoConto.colonne'
  export const CHIAVE_RIGHE = 'weiss.estrattoConto.righePerPagina'
  export const RIGHE_PER_PAGINA = [20, 50, 100] as const
  export function leggiColonneVisibili(storage: Pick<Storage, 'getItem'> | null): Set<IdColonna>
  export function salvaColonneVisibili(storage: Pick<Storage, 'setItem'> | null, visibili: Set<IdColonna>): void
  export function leggiRighePerPagina(storage: Pick<Storage, 'getItem'> | null): number
  export function salvaRighePerPagina(storage: Pick<Storage, 'setItem'> | null, n: number): void
  // EstrattoConto.tsx
  export interface EstrattoContoProps {
    venueId: string
    filtriIniziali: FiltriEstrattoConto
    /** Chiamato a ogni cambio: il montaggio in prima nota lo usa per scrivere l'URL. */
    onFiltriChange?: (filtri: FiltriEstrattoConto) => void
  }
  export function EstrattoConto(props: EstrattoContoProps): JSX.Element
  ```
  Le azioni di riga (Modifica, Sposta in, Cestino, Ripristina, Dettagli) e i pulsanti «Importa CSV» / «Nuovo movimento» arrivano col Task 9: qui la tabella espone le callback (`onModifica`, `onSposta`, `onCestino`, `onRipristina`, `onDettagli`) e il contenitore le collega ai dialoghi nel Task 9. In questo task le celle Azioni mostrano i pulsanti già cablati alle callback; il contenitore le implementa nel Task 9.

- [ ] **Step 1: `colonne.ts` — test, poi modulo**

`src/components/banca/estratto-conto/__tests__/colonne.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { leggiColonneVisibili, salvaColonneVisibili, leggiRighePerPagina, salvaRighePerPagina, COLONNE } from '../colonne'

function memoria(iniziale: Record<string, string> = {}) {
  const dati = { ...iniziale }
  return {
    getItem: (k: string) => dati[k] ?? null,
    setItem: (k: string, v: string) => { dati[k] = v },
    dati,
  }
}

describe('colonne visibili', () => {
  it('senza memoria sono tutte visibili', () => {
    expect([...leggiColonneVisibili(null)]).toEqual(COLONNE.map((c) => c.id))
  })

  it('la scelta si salva e si rilegge', () => {
    const m = memoria()
    salvaColonneVisibili(m, new Set(['data', 'importo']))
    expect([...leggiColonneVisibili(m)]).toEqual(['data', 'importo'])
  })

  // Una colonna che non esiste più (o un JSON rotto) non deve rompere la lista.
  it('ignora identificativi sconosciuti e memoria corrotta', () => {
    expect([...leggiColonneVisibili(memoria({ 'weiss.estrattoConto.colonne': '["data","fantasma"]' }))]).toEqual(['data'])
    expect([...leggiColonneVisibili(memoria({ 'weiss.estrattoConto.colonne': '{rotto' }))]).toEqual(COLONNE.map((c) => c.id))
  })
})

describe('righe per pagina', () => {
  it('parte a 100 e ricorda la scelta fra 20, 50 e 100', () => {
    const m = memoria()
    expect(leggiRighePerPagina(m)).toBe(100)
    salvaRighePerPagina(m, 50)
    expect(leggiRighePerPagina(m)).toBe(50)
    expect(leggiRighePerPagina(memoria({ 'weiss.estrattoConto.righePerPagina': '7' }))).toBe(100)
  })
})
```

`src/components/banca/estratto-conto/colonne.ts`:

```ts
import type { OrdinaPer } from '@/lib/banca/filtri-estratto-conto'

/**
 * Le colonne della lista, nell'ordine in cui compaiono. Mostrarle o nasconderle
 * è una scelta del browser (`localStorage`), come in CashKing; l'ordine invece è
 * fisso: una colonna riattivata torna al suo posto. «Azioni» non è qui perché
 * non si nasconde.
 */
export type IdColonna = 'data' | 'descrizione' | 'causale' | 'conto' | 'stato' | 'importo'

export interface Colonna {
  id: IdColonna
  etichetta: string
  /** Presente sulle colonne ordinabili lato server. */
  ordina?: OrdinaPer
  aDestra?: boolean
}

export const COLONNE: readonly Colonna[] = [
  { id: 'data', etichetta: 'Data', ordina: 'data' },
  { id: 'descrizione', etichetta: 'Descrizione', ordina: 'descrizione' },
  { id: 'causale', etichetta: 'Causale', ordina: 'causale' },
  { id: 'conto', etichetta: 'Conto Bancario' },
  { id: 'stato', etichetta: 'Stato' },
  { id: 'importo', etichetta: 'Importo', ordina: 'importo', aDestra: true },
]

export const CHIAVE_COLONNE = 'weiss.estrattoConto.colonne'
export const CHIAVE_RIGHE = 'weiss.estrattoConto.righePerPagina'
export const RIGHE_PER_PAGINA = [20, 50, 100] as const

const TUTTE = COLONNE.map((c) => c.id)

export function leggiColonneVisibili(storage: Pick<Storage, 'getItem'> | null): Set<IdColonna> {
  try {
    const grezzo = storage?.getItem(CHIAVE_COLONNE)
    if (!grezzo) return new Set(TUTTE)
    const elenco = JSON.parse(grezzo)
    if (!Array.isArray(elenco)) return new Set(TUTTE)
    const valide = TUTTE.filter((id) => elenco.includes(id))
    return new Set(valide.length > 0 ? valide : TUTTE)
  } catch {
    return new Set(TUTTE)
  }
}

export function salvaColonneVisibili(storage: Pick<Storage, 'setItem'> | null, visibili: Set<IdColonna>): void {
  storage?.setItem(CHIAVE_COLONNE, JSON.stringify(TUTTE.filter((id) => visibili.has(id))))
}

export function leggiRighePerPagina(storage: Pick<Storage, 'getItem'> | null): number {
  const n = Number(storage?.getItem(CHIAVE_RIGHE))
  return (RIGHE_PER_PAGINA as readonly number[]).includes(n) ? n : 100
}

export function salvaRighePerPagina(storage: Pick<Storage, 'setItem'> | null, n: number): void {
  storage?.setItem(CHIAVE_RIGHE, String(n))
}
```

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca/estratto-conto/__tests__/colonne.test.ts` → 5 verdi.

- [ ] **Step 2: il test del contenitore (rosso)**

`src/components/banca/estratto-conto/__tests__/EstrattoConto.test.tsx`, sul modello di `src/app/(dashboard)/riconciliazione/__tests__/RiconciliazioneClient.test.tsx` (stesso `stubFetch` per prefisso, stessi aiutanti da `@/components/scadenzario/__tests__/render-helpers`, stessa `premereScheda` col `mousedown` per le schede Radix):

```tsx
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { EstrattoConto } from '../EstrattoConto'
import { FILTRI_DEFAULT } from '@/lib/banca/filtri-estratto-conto'
import { installaStubDom, montare, smontare, attendere, cliccare, perTesto, testoDellaPagina } from '@/components/scadenzario/__tests__/render-helpers'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  installaStubDom()
})
afterEach(async () => {
  await smontare()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

async function attendiChe(condizione: () => boolean, cosa: string) {
  for (let i = 0; i < 50; i++) {
    if (condizione()) return
    await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
  }
  throw new Error(`Atteso invano: ${cosa}`)
}

async function premereScheda(el: Element | null | undefined) {
  if (!el) throw new Error('Scheda non trovata')
  await act(async () => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })) })
}

let chiamate: string[] = []
function stubFetch(risposte: Array<[string, unknown]>) {
  chiamate = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const indirizzo = String(url)
    chiamate.push(indirizzo)
    const trovata = risposte.find(([prefisso]) => indirizzo.startsWith(prefisso))
    return new Response(JSON.stringify(trovata ? trovata[1] : {}), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
}

function riga(id: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    id, venueId: 'v1', transactionDate: '2026-08-14', valueDate: null, description: `Bonifico a vs favore *DITTA ${id}`,
    descrizione: `DITTA ${id}`, causale: 'Bonifico a vs favore', note: null, amount: 907.9, balanceAfter: null, bankReference: null,
    importBatchId: null, importedAt: '2026-08-16T09:58:00.000Z', importSource: 'PSD2_GOCARDLESS', status: 'PENDING', sezione: 'ATTIVI',
    bankTransactionCode: '48//00', matchedEntryId: null, matchConfidence: null, reconciledBy: null, reconciledAt: null,
    createdAt: '2026-08-16T09:58:00.000Z', deletedAt: null, matchedEntry: null, bankAccount: { id: 'c1', name: 'Weiss' },
    modificato: false, stato: 'non_abbinato', residuo: 907.9, ...extra,
  }
}

const RISPOSTA = {
  data: [riga('1'), riga('2', { amount: -68.93, stato: 'non_abbinato', residuo: 68.93, modificato: true })],
  pagination: { page: 1, limit: 100, total: 231, totalPages: 3 },
  totali: { entrate: 138680.9, uscite: 126293.72, saldoNetto: 12387.18 },
  conteggi: { attivi: 231, delegheF24: 0, cbillPagopa: 0, cestino: 0 },
  summary: { total: 231, pending: 231, matched: 0, toReview: 0, manual: 0, ignored: 0, unmatched: 0 },
}

function stubTutto() {
  stubFetch([
    ['/api/bank-transactions', RISPOSTA],
    ['/api/bank-accounts', { data: [{ id: 'c1', name: 'Weiss' }] }],
    ['/api/banca/sincronizzazione', { conti: [] }],
  ])
}

const richiesteLista = () => chiamate.filter((u) => u.startsWith('/api/bank-transactions?'))

describe('EstrattoConto', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra schede coi conteggi, totali, righe e legenda', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')
    const testo = testoDellaPagina()
    expect(testo).toContain('Attivi (231)')
    expect(testo).toContain('Cestino (0)')
    expect(testo).toContain('138.680,90')
    expect(testo).toContain('12.387,18')
    expect(testo).toContain('Modificato')
    expect(testo).toContain('Legenda')
    expect(testo).toContain('Pagina 1 di 3')
  })

  it('cliccando «Importo» chiede l\'ordinamento al server, due stati', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    await cliccare(perTesto('Importo', 'th button'))
    await attendiChe(() => richiesteLista().some((u) => u.includes('ordina=importo') && u.includes('verso=asc')), 'la richiesta crescente')
    await cliccare(perTesto('Importo', 'th button'))
    await attendiChe(() => richiesteLista().some((u) => u.includes('ordina=importo') && u.includes('verso=desc')), 'la richiesta decrescente')
    // Il terzo clic torna crescente: due stati, mai un terzo che rovescia la lista.
    await cliccare(perTesto('Importo', 'th button'))
    await attendiChe(() => richiesteLista().filter((u) => u.includes('verso=asc')).length >= 2, 'di nuovo crescente')
  })

  it('il menu Colonne nasconde una colonna e resta aperto', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    await premereScheda(perTesto('Colonne', 'button')) // il trigger Radix apre su pointerdown
    await attendiChe(() => !!perTesto('Causale', '[role="menuitemcheckbox"]'), 'il menu')
    await cliccare(perTesto('Causale', '[role="menuitemcheckbox"]'))
    await attendiChe(() => !perTesto('Causale', 'th'), 'la colonna nascosta')
    expect(perTesto('Descrizione', '[role="menuitemcheckbox"]')).toBeTruthy() // ancora aperto
    expect(window.localStorage.getItem('weiss.estrattoConto.colonne')).toContain('"data"')
  })

  it('«Successiva» chiede la pagina 2; il cambio di scheda torna alla 1 e apre il Cestino', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('Pagina 1 di 3'), 'la paginazione')

    await cliccare(perTesto('Successiva'))
    await attendiChe(() => richiesteLista().some((u) => u.includes('page=2')), 'la seconda pagina')

    await premereScheda(perTesto('Cestino', '[role="tab"]'))
    await attendiChe(() => richiesteLista().some((u) => u.includes('cestino=1') && !u.includes('page=2')), 'il cestino dalla prima pagina')
  })

  it('selezionando una riga compare la barra con «tutte le 231 del filtro»', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    await cliccare(document.querySelector('tbody [role="checkbox"]'))
    await attendiChe(() => testoDellaPagina().includes('1 selezionato'), 'la barra')
    expect(perTesto(/tutte le 231/)).toBeTruthy()
  })
})
```

Eseguire → rosso: modulo assente.

- [ ] **Step 3: i pezzi**

`IconaStato.tsx` — l'icona della legenda, con etichetta accessibile:

```tsx
import { CheckCircle2, Clock } from 'lucide-react'
import type { StatoLegenda } from '@/types/reconciliation'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export const ETICHETTE_STATO: Record<StatoLegenda, string> = {
  riconciliato: 'Riconciliato',
  abbinato_manualmente: 'Abbinato manualmente',
  parziale: 'Parzialmente abbinato',
  non_abbinato: 'Non abbinato',
}

// Colore e forma insieme, mai il colore da solo (spec, «La pagina»).
const STILE: Record<StatoLegenda, { Icona: typeof Clock; classe: string }> = {
  riconciliato: { Icona: CheckCircle2, classe: 'bg-emerald-600 text-white' },
  abbinato_manualmente: { Icona: CheckCircle2, classe: 'bg-orange-500 text-white' },
  parziale: { Icona: Clock, classe: 'bg-orange-500 text-white' },
  non_abbinato: { Icona: Clock, classe: 'bg-violet-600 text-white' },
}

export function IconaStato({ stato, residuo }: { stato: StatoLegenda; residuo: number }) {
  const { Icona, classe } = STILE[stato]
  return (
    <span className="inline-flex items-center gap-1.5" title={ETICHETTE_STATO[stato]}>
      <span className={cn('inline-flex h-6 w-8 items-center justify-center rounded-md', classe)} aria-label={ETICHETTE_STATO[stato]}>
        <Icona className="h-3.5 w-3.5" aria-hidden />
      </span>
      {stato === 'parziale' && <span className="text-xs text-orange-600">{formatCurrency(residuo)}</span>}
    </span>
  )
}
```

`LegendaStati.tsx`: una riga `Legenda:` con le quattro `IconaStato` (residuo 0) seguite dall'etichetta e, in coda, `€123 = Residuo` in `text-orange-600`.

`IntestazioneOrdinabile.tsx` — l'affordance sempre visibile, due stati, da tastiera:

```tsx
import { ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import type { OrdinaPer } from '@/lib/banca/filtri-estratto-conto'
import { cn } from '@/lib/utils'

interface Props {
  etichetta: string
  ordina?: OrdinaPer
  attivo: OrdinaPer
  verso: 'asc' | 'desc'
  aDestra?: boolean
  onOrdina: (campo: OrdinaPer) => void
}

export function IntestazioneOrdinabile({ etichetta, ordina, attivo, verso, aDestra, onOrdina }: Props) {
  const eAttiva = ordina !== undefined && ordina === attivo
  return (
    <th
      className={cn('h-10 px-3 text-left text-sm font-medium', aDestra && 'text-right')}
      aria-sort={eAttiva ? (verso === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {ordina ? (
        <button type="button" className={cn('inline-flex items-center gap-1', aDestra && 'flex-row-reverse')} onClick={() => onOrdina(ordina)}>
          {etichetta}
          {eAttiva ? (
            verso === 'asc' ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
          )}
        </button>
      ) : (
        etichetta
      )}
    </th>
  )
}
```

`SelettoreColonne.tsx` — il menu che **resta aperto** fra una spunta e l'altra:

```tsx
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { COLONNE, type IdColonna } from './colonne'

export function SelettoreColonne({ visibili, onCambia }: { visibili: Set<IdColonna>; onCambia: (v: Set<IdColonna>) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm"><Settings2 className="mr-2 h-4 w-4" aria-hidden />Colonne</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {COLONNE.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={visibili.has(c.id)}
            // Radix chiude il menu a ogni voce scelta: qui si spuntano più
            // colonne di fila, e riaprirlo ogni volta è il difetto di CashKing
            // annotato nell'analisi.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(spuntata) => {
              const prossime = new Set(visibili)
              if (spuntata) prossime.add(c.id)
              else prossime.delete(c.id)
              if (prossime.size > 0) onCambia(prossime)
            }}
          >
            {c.etichetta}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

`SchedeEstrattoConto.tsx`: `Tabs` di `@/components/ui/tabs` con quattro `TabsTrigger` (`value`: `ATTIVI` · `DELEGHE_F24` · `CBILL_PAGOPA` · `CESTINO`), etichette «Attivi (n)», «Deleghe F24 (n)», «CBILL-PagoPA (n)», «Cestino (n)» dai `conteggi`; a destra la fascia dei totali: `Totale Entrate {formatCurrency(entrate)}` (verde, freccia ↙ `ArrowDownLeft`), `Totale Uscite {formatCurrency(uscite)}` (rosso, ↗ `ArrowUpRight`), `Saldo Netto {formatCurrency(saldoNetto)}` (verde se ≥ 0, rosso se < 0). `onValueChange` → `onCambiaScheda(valore)`: `CESTINO` → `{ cestino: true }`, altrimenti `{ cestino: false, sezione: valore }`, sempre `page: 1`.

`FiltriEstrattoConto.tsx`: `Input` di ricerca (icona `Search`, `useDebounce` a 300 ms, **mai `disabled`** durante il caricamento — la lezione dello scadenzario), `Select` Tipo (Tutti / Entrate / Uscite), `Select` Conto («Tutti i conti» + i conti da `GET /api/bank-accounts?type=BANK`; leggere la forma della risposta in `src/app/api/bank-accounts/route.ts` — se la lista è `data`, `conti = risposta.data`), `Checkbox` «Solo non riconciliati», `Popover` «Filtri» con due `Input type="date"` (Da / A) e «Cancella filtri». Ogni cambio chiama `onCambia({ ...filtri, <campo>, page: 1 })`.

`PaginazioneEstrattoConto.tsx`: a sinistra `Select` «Righe per pagina» (20 / 50 / 100 → `salvaRighePerPagina` + `onCambia({ limit, page: 1 })`), a destra `Pagina {page} di {totalPages}` con quattro `Button` outline `««` `‹` `›` `»»` (aria-label «Prima pagina», «Precedente», «Successiva», «Ultima pagina»; il testo visibile dei due centrali resta «Precedente» / «Successiva» per chi legge, come nella prima nota). Sopra la tabella il contatore «{righe in pagina} di {total}».

`BarraSelezione.tsx`: compare quando `selezionati.size > 0`; testo «{n} selezionati» («1 selezionato» al singolare); se `n < total`, un pulsante-link «seleziona tutte le {total} del filtro» che imposta `tutteDelFiltro = true` (e il testo diventa «Tutte le {total} righe del filtro sono selezionate»); poi i pulsanti «Sposta in ▾» (menu con le tre sezioni), «Cestino» (o «Ripristina» nella scheda Cestino), «Annulla». Le azioni chiamano `onAzioneInBlocco({ azione, sezione?, ids? | filtro? })`: con `tutteDelFiltro` si manda il **filtro** (`Object.fromEntries(filtriInSearchParams(filtri))`), altrimenti gli `ids`.

`StatoVuoto.tsx`: due varianti secondo `filtriAttivi` (qualunque filtro diverso dai default o ricerca): «Nessun movimento corrisponde ai filtri» + «Cancella filtri»; altrimenti «Nessun movimento bancario: collega la banca da Impostazioni → Banche e Conti, oppure importa un CSV» con i due pulsanti (link e `onImporta`).

`TabellaEstrattoConto.tsx` — la tabella:

```tsx
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ArrowDownLeft, ArrowUpRight, Pencil, Trash2, RotateCcw, MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { RigaEstrattoConto, SezioneMovimentoBancario } from '@/types/reconciliation'
import type { FiltriEstrattoConto, OrdinaPer } from '@/lib/banca/filtri-estratto-conto'
import { COLONNE, type IdColonna } from './colonne'
import { IntestazioneOrdinabile } from './IntestazioneOrdinabile'
import { IconaStato } from './IconaStato'

interface Props {
  righe: RigaEstrattoConto[]
  filtri: FiltriEstrattoConto
  colonneVisibili: Set<IdColonna>
  selezionati: Set<string>
  caricamento: boolean
  onOrdina: (campo: OrdinaPer) => void
  onSeleziona: (id: string, selezionata: boolean) => void
  onSelezionaPagina: (selezionata: boolean) => void
  onModifica: (riga: RigaEstrattoConto) => void
  onDettagli: (riga: RigaEstrattoConto) => void
  onSposta: (riga: RigaEstrattoConto, sezione: SezioneMovimentoBancario) => void
  onCestino: (riga: RigaEstrattoConto) => void
  onRipristina: (riga: RigaEstrattoConto) => void
}

const SEZIONI: Array<{ valore: SezioneMovimentoBancario; etichetta: string }> = [
  { valore: 'ATTIVI', etichetta: 'Attivi' },
  { valore: 'DELEGHE_F24', etichetta: 'Deleghe F24' },
  { valore: 'CBILL_PAGOPA', etichetta: 'CBILL-PagoPA' },
]

export function TabellaEstrattoConto(p: Props) {
  const colonne = COLONNE.filter((c) => p.colonneVisibili.has(c.id))
  const tuttePagina = p.righe.length > 0 && p.righe.every((r) => p.selezionati.has(r.id))
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="w-10 px-3"><Checkbox aria-label="Seleziona la pagina" checked={tuttePagina} onCheckedChange={(v) => p.onSelezionaPagina(v === true)} /></th>
            {colonne.map((c) => (
              <IntestazioneOrdinabile key={c.id} etichetta={c.etichetta} ordina={c.ordina} attivo={p.filtri.ordina} verso={p.filtri.verso} aDestra={c.aDestra} onOrdina={p.onOrdina} />
            ))}
            <th className="px-3 text-right">Azioni</th>
          </tr>
        </thead>
        <tbody className={cn(p.caricamento && 'opacity-60')}>
          {p.righe.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3"><Checkbox aria-label={`Seleziona ${r.descrizione ?? r.description}`} checked={p.selezionati.has(r.id)} onCheckedChange={(v) => p.onSeleziona(r.id, v === true)} /></td>
              {colonne.map((c) => <td key={c.id} className={cn('px-3 py-2 align-top', c.aDestra && 'text-right')}>{cella(c.id, r)}</td>)}
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <Button variant="ghost" size="icon" aria-label="Modifica" onClick={() => p.onModifica(r)}><Pencil className="h-4 w-4" /></Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Altre azioni"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!p.filtri.cestino && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Sposta in</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {SEZIONI.filter((s) => s.valore !== r.sezione).map((s) => (
                            <DropdownMenuItem key={s.valore} onClick={() => p.onSposta(r, s.valore)}>{s.etichetta}</DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuItem onClick={() => p.onDettagli(r)}>Vedi dettagli</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {p.filtri.cestino ? (
                  <Button variant="ghost" size="icon" aria-label="Ripristina" onClick={() => p.onRipristina(r)}><RotateCcw className="h-4 w-4" /></Button>
                ) : (
                  <Button variant="ghost" size="icon" aria-label="Sposta nel Cestino" onClick={() => p.onCestino(r)}><Trash2 className="h-4 w-4" /></Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function cella(id: IdColonna, r: RigaEstrattoConto) {
  switch (id) {
    case 'data':
      return (
        <div className="whitespace-nowrap">
          {format(new Date(r.transactionDate), 'dd/MM/yy', { locale: it })}
          <div className="mt-1 flex gap-1">
            {r.importSource === 'MANUAL' && <Badge variant="outline" className="text-[10px]">Manuale</Badge>}
            {r.modificato && <Badge variant="outline" className="border-amber-400 bg-amber-50 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">Modificato</Badge>}
          </div>
        </div>
      )
    case 'descrizione': {
      const testo = r.descrizione ?? r.description
      return <span className="block max-w-[28rem] truncate" title={testo}>{testo || '—'}</span>
    }
    case 'causale':
      return <span className="block max-w-[12rem] truncate text-muted-foreground" title={r.causale ?? ''}>{r.causale ?? '—'}</span>
    case 'conto':
      return r.bankAccount ? <Badge className="bg-violet-700 hover:bg-violet-700">{r.bankAccount.name}</Badge> : '—'
    case 'stato':
      return <IconaStato stato={r.stato} residuo={r.residuo} />
    case 'importo': {
      const entrata = r.amount > 0
      return (
        <span className={cn('inline-flex items-center gap-1 whitespace-nowrap font-medium', entrata ? 'text-emerald-600' : 'text-red-600')}>
          {entrata ? <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden /> : <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />}
          {entrata ? '+' : '−'}{formatCurrency(Math.abs(r.amount))}
        </span>
      )
    }
  }
}
```

- [ ] **Step 4: il contenitore**

`EstrattoConto.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { RispostaEstrattoConto, RigaEstrattoConto, SezioneMovimentoBancario } from '@/types/reconciliation'
import { FILTRI_DEFAULT, filtriInSearchParams, type FiltriEstrattoConto, type OrdinaPer } from '@/lib/banca/filtri-estratto-conto'
import { FreschezzaMovimenti } from '@/components/banca/FreschezzaMovimenti'
import { COLONNE, leggiColonneVisibili, salvaColonneVisibili, leggiRighePerPagina, type IdColonna } from './colonne'
import { SchedeEstrattoConto } from './SchedeEstrattoConto'
import { FiltriEstrattoConto } from './FiltriEstrattoConto'
import { SelettoreColonne } from './SelettoreColonne'
import { TabellaEstrattoConto } from './TabellaEstrattoConto'
import { BarraSelezione } from './BarraSelezione'
import { PaginazioneEstrattoConto } from './PaginazioneEstrattoConto'
import { LegendaStati } from './LegendaStati'
import { StatoVuoto } from './StatoVuoto'

export interface EstrattoContoProps {
  venueId: string
  filtriIniziali: FiltriEstrattoConto
  onFiltriChange?: (filtri: FiltriEstrattoConto) => void
}

export const CHIAVE_QUERY_ESTRATTO = ['estratto-conto'] as const

async function leggiLista(filtri: FiltriEstrattoConto): Promise<RispostaEstrattoConto> {
  const r = await fetch(`/api/bank-transactions?${filtriInSearchParams(filtri)}`)
  if (!r.ok) throw new Error('Errore nel caricamento dei movimenti')
  return r.json()
}

export function EstrattoConto({ venueId, filtriIniziali, onFiltriChange }: EstrattoContoProps) {
  const queryClient = useQueryClient()
  // Le righe per pagina vengono dal browser al primo montaggio, se l'URL non le dice.
  const [filtri, impostaFiltri] = useState<FiltriEstrattoConto>(() => ({
    ...filtriIniziali,
    limit: filtriIniziali.limit !== FILTRI_DEFAULT.limit ? filtriIniziali.limit : leggiRighePerPagina(typeof window === 'undefined' ? null : window.localStorage),
  }))
  const [colonne, impostaColonne] = useState<Set<IdColonna>>(() => leggiColonneVisibili(typeof window === 'undefined' ? null : window.localStorage))
  const [selezionati, impostaSelezionati] = useState<Set<string>>(new Set())
  const [tutteDelFiltro, impostaTutteDelFiltro] = useState(false)

  const cambiaFiltri = (parziali: Partial<FiltriEstrattoConto>) => {
    const prossimi = { ...filtri, ...parziali }
    impostaFiltri(prossimi)
    impostaSelezionati(new Set())
    impostaTutteDelFiltro(false)
    onFiltriChange?.(prossimi)
  }

  const { data, isPending, isFetching, isError } = useQuery({
    queryKey: [...CHIAVE_QUERY_ESTRATTO, venueId, filtri],
    queryFn: () => leggiLista(filtri),
    placeholderData: (precedente) => precedente,
  })
  useEffect(() => { if (isError) toast.error('Impossibile caricare i movimenti bancari') }, [isError])

  const ordina = (campo: OrdinaPer) => {
    if (filtri.ordina === campo) cambiaFiltri({ verso: filtri.verso === 'asc' ? 'desc' : 'asc', page: 1 })
    else cambiaFiltri({ ordina: campo, verso: campo === 'data' ? 'desc' : 'asc', page: 1 })
  }

  const righe = data?.data ?? []
  const filtriAttivi = useMemo(() => JSON.stringify({ ...filtri, page: 1, limit: 0, ordina: 0, verso: 0 }) !== JSON.stringify({ ...FILTRI_DEFAULT, page: 1, limit: 0, ordina: 0, verso: 0 }), [filtri])

  return (
    <div className="space-y-4">
      <SchedeEstrattoConto filtri={filtri} conteggi={data?.conteggi} totali={data?.totali} onCambia={cambiaFiltri} />
      <FreschezzaMovimenti />
      <FiltriEstrattoConto filtri={filtri} onCambia={cambiaFiltri} />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{righe.length} di {data?.pagination.total ?? 0}</span>
        <SelettoreColonne visibili={colonne} onCambia={(v) => { impostaColonne(v); salvaColonneVisibili(window.localStorage, v) }} />
      </div>
      {!isPending && righe.length === 0 ? (
        <StatoVuoto filtriAttivi={filtriAttivi} onCancellaFiltri={() => cambiaFiltri({ ...FILTRI_DEFAULT, limit: filtri.limit })} />
      ) : (
        <TabellaEstrattoConto
          righe={righe}
          filtri={filtri}
          colonneVisibili={colonne}
          selezionati={selezionati}
          caricamento={isFetching}
          onOrdina={ordina}
          onSeleziona={(id, s) => { const p = new Set(selezionati); if (s) p.add(id); else p.delete(id); impostaSelezionati(p); impostaTutteDelFiltro(false) }}
          onSelezionaPagina={(s) => { impostaSelezionati(s ? new Set(righe.map((r) => r.id)) : new Set()); impostaTutteDelFiltro(false) }}
          onModifica={() => {}}
          onDettagli={() => {}}
          onSposta={() => {}}
          onCestino={() => {}}
          onRipristina={() => {}}
        />
      )}
      {selezionati.size > 0 && (
        <BarraSelezione
          selezionati={selezionati.size}
          totale={data?.pagination.total ?? 0}
          tutteDelFiltro={tutteDelFiltro}
          nelCestino={filtri.cestino}
          onTutteDelFiltro={() => impostaTutteDelFiltro(true)}
          onAnnulla={() => { impostaSelezionati(new Set()); impostaTutteDelFiltro(false) }}
          onAzione={() => {}}
        />
      )}
      {(data?.pagination.totalPages ?? 0) > 1 && (
        <PaginazioneEstrattoConto pagina={filtri.page} totalePagine={data?.pagination.totalPages ?? 1} righePerPagina={filtri.limit} onCambia={cambiaFiltri} />
      )}
      <LegendaStati />
    </div>
  )
}
```

(Le cinque callback vuote e `onAzione` si riempiono nel Task 9; qui basta che la lista sia completa e provata. `queryClient` serve nel Task 9 per invalidare `CHIAVE_QUERY_ESTRATTO` dopo ogni azione: lasciarlo.)

- [ ] **Step 5: verde**

`PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca/estratto-conto` → 5 + 5 verdi. Se il clic sull'intestazione non parte, controllare che `perTesto('Importo', 'th button')` trovi il pulsante (il testo contiene «Importo»); se il menu Colonne non si apre con `mousedown`, provare `pointerdown` (`new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })`): Radix apre il `DropdownMenuTrigger` su `pointerdown`.

- [ ] **Step 6: commit**

```bash
git add src/components/banca/estratto-conto
git commit -m "feat(banca): la lista dell'estratto conto — schede, totali, filtri, tabella ordinabile, colonne, paginazione, selezione, legenda

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: le azioni — Modifica con cronologia, Nuovo movimento, Sposta in, Cestino/Ripristina, dettagli, Importa CSV, azioni in blocco

**Files:**
- Create: `src/components/banca/estratto-conto/ModificaMovimentoDialog.tsx` (+ `__tests__/ModificaMovimentoDialog.test.tsx`)
- Create: `src/components/banca/estratto-conto/NuovoMovimentoDialog.tsx`
- Create: `src/components/banca/estratto-conto/CronologiaModifiche.tsx`
- Modify: `src/components/reconciliation/TransactionDetailsDialog.tsx` (testo grezzo, codice, identificativo, lotto, cronologia)
- Modify: `src/components/banca/estratto-conto/EstrattoConto.tsx` (cabla le callback, i pulsanti «Importa CSV» e «Nuovo movimento», le azioni in blocco)
- Modify: `src/components/banca/estratto-conto/__tests__/EstrattoConto.test.tsx` (le azioni chiamano le rotte giuste)

**Interfaces:**
- Consumes: `PATCH /api/bank-transactions/[id]`, `GET …/cronologia`, `POST …/sezione`, `POST …/ripristina`, `DELETE …/[id]`, `POST /api/bank-transactions/azioni-in-blocco`, `POST /api/bank-transactions` (Task 3, 6, 7); `ImportDialog` (`@/components/reconciliation`, con il conto del Task 3); `TransactionDetailsDialog`.
- Produces:
  ```ts
  export function ModificaMovimentoDialog(p: { riga: RigaEstrattoConto | null; open: boolean; onOpenChange: (o: boolean) => void; onSalvata: () => void }): JSX.Element
  export function NuovoMovimentoDialog(p: { open: boolean; onOpenChange: (o: boolean) => void; onCreato: () => void }): JSX.Element
  export function CronologiaModifiche(p: { bankTransactionId: string }): JSX.Element
  ```

- [ ] **Step 1: il test del dialogo di modifica**

`src/components/banca/estratto-conto/__tests__/ModificaMovimentoDialog.test.tsx` (con `@testing-library/react`, come `StatoSincronizzazione.test.tsx`):

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModificaMovimentoDialog } from '../ModificaMovimentoDialog'
import type { RigaEstrattoConto } from '@/types/reconciliation'

const RIGA = {
  id: 't1', venueId: 'v1', transactionDate: '2026-08-14', valueDate: null, description: 'Bonifico a vs favore *DITTA', descrizione: 'DITTA',
  causale: 'Bonifico a vs favore', note: null, amount: 907.9, balanceAfter: null, bankReference: null, importBatchId: null,
  importedAt: '2026-08-16T09:58:00.000Z', importSource: 'PSD2_GOCARDLESS', status: 'PENDING', sezione: 'ATTIVI', bankTransactionCode: '48//00',
  matchedEntryId: null, matchConfidence: null, reconciledBy: null, reconciledAt: null, createdAt: '2026-08-16T09:58:00.000Z', deletedAt: null,
  matchedEntry: null, bankAccount: { id: 'c1', name: 'Weiss' }, modificato: false, stato: 'non_abbinato', residuo: 907.9,
} as unknown as RigaEstrattoConto

let chiamate: Array<{ url: string; init?: RequestInit }> = []
function monta(riga: RigaEstrattoConto) {
  chiamate = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    chiamate.push({ url: String(url), init })
    if (String(url).endsWith('/cronologia')) return { ok: true, json: async () => ({ modifiche: [] }) }
    return { ok: true, json: async () => ({ ...riga, descrizione: 'x' }) }
  }) as unknown as typeof fetch
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ModificaMovimentoDialog riga={riga} open onOpenChange={() => {}} onSalvata={() => {}} />
    </QueryClientProvider>
  )
}

describe('ModificaMovimentoDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  // Data e importo vengono dalla banca: si vedono, non si toccano (spec, decisione 2).
  it('su una riga della banca data e importo sono in sola lettura, descrizione causale e note no', () => {
    monta(RIGA)
    expect(screen.getByLabelText('Data')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Importo')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Descrizione')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Causale')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Note')).not.toHaveAttribute('readonly')
    expect(screen.getAllByText(/dalla banca/).length).toBeGreaterThan(0)
  })

  it('su una riga manuale anche data e importo si modificano', () => {
    monta({ ...RIGA, importSource: 'MANUAL' } as RigaEstrattoConto)
    expect(screen.getByLabelText('Data')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Importo')).not.toHaveAttribute('readonly')
  })

  it('salva mandando solo i campi modificati alla PATCH', async () => {
    monta(RIGA)
    fireEvent.change(screen.getByLabelText('Descrizione'), { target: { value: 'Ditta S.r.l., saldo fattura 12' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'pagata in ritardo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(chiamate.some((c) => c.init?.method === 'PATCH')).toBe(true))
    const patch = chiamate.find((c) => c.init?.method === 'PATCH')!
    expect(patch.url).toBe('/api/bank-transactions/t1')
    expect(JSON.parse(String(patch.init?.body))).toEqual({ descrizione: 'Ditta S.r.l., saldo fattura 12', note: 'pagata in ritardo' })
  })

  it('ha la scheda «Cronologia modifiche»', () => {
    monta(RIGA)
    expect(screen.getByRole('tab', { name: /Cronologia modifiche/ })).toBeInTheDocument()
  })
})
```

Eseguire → rosso: modulo assente.

- [ ] **Step 2: il dialogo di modifica e la cronologia**

`ModificaMovimentoDialog.tsx`: `Dialog` con `Tabs` («Descrizione» | «Cronologia modifiche»). Nella prima scheda, campi con `Label` collegate agli `Input` (`htmlFor`/`id`, così `getByLabelText` li trova):

- **Data** (`Input type="date"`, `readOnly` se non `MANUAL`), **Data valuta** (idem), **Tipo** («Entrata (Accredito)» / «Uscita (Addebito)»: testo se sola lettura, `Select` se `MANUAL`), **Importo** (`Input type="number" step="0.01"`, valore assoluto, `readOnly` se non `MANUAL`), **Conto** (testo), ciascuno seguito, in sola lettura, da un `<span className="text-xs text-muted-foreground">dalla banca</span>`;
- **Descrizione** (`Input`, valore iniziale `riga.descrizione ?? riga.description`), **Causale** (`Input`), **Note** (`Textarea`);
- sotto, in `text-xs text-muted-foreground`, il testo grezzo: «Testo della banca: {riga.description}»;
- pulsanti «Annulla» e «Salva». Al salvataggio: costruire il corpo con i **soli campi cambiati** rispetto alla riga (`descrizione`, `causale`, `note`; più `transactionDate`, `valueDate`, `amount` con segno se `MANUAL` e cambiati); se il corpo è vuoto chiudere senza chiamare; altrimenti `fetch(`/api/bank-transactions/${riga.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })`; su `!ok` `toast.error(json.error ?? 'Modifica non riuscita')`; su ok `toast.success('Movimento aggiornato')`, `onSalvata()`, chiudere.
- Nessun interruttore «Riconciliato» (spec: lo stato lo decidono i collegamenti).

`CronologiaModifiche.tsx`: `useQuery(['estratto-conto', 'cronologia', id])` su `GET /api/bank-transactions/${id}/cronologia`; lista di righe «{quando, formatDateShort + ora} · {utente ?? 'sistema'} · {ETICHETTA[campo]}: «{prima ?? '—'}» → «{dopo ?? '—'}»»; vuota: «Nessuna modifica: il movimento è com'è arrivato dalla banca». Etichette: descrizione → «Descrizione», causale → «Causale», note → «Note», sezione → «Sezione».

- [ ] **Step 3: «Nuovo movimento»**

`NuovoMovimentoDialog.tsx`: `Dialog` con `Select` Conto (da `GET /api/bank-accounts?type=BANK`, obbligatorio, preselezionato se uno solo), `Input type="date"` Data (obbligatoria, default oggi), `Select` Tipo (Entrata / Uscita, default Uscita), `Input type="number"` Importo (> 0), `Input` Descrizione (obbligatoria), `Input` Causale, `Textarea` Note. «Crea» → `POST /api/bank-transactions` con `{ bankAccountId, transactionDate, amount: tipo === 'uscita' ? -importo : importo, descrizione, causale, note }`; su ok `toast.success('Movimento creato')`, `onCreato()`, chiudere. Il pulsante «Crea» resta disabilitato finché conto, data, importo e descrizione non sono validi.

- [ ] **Step 4: i dettagli**

In `src/components/reconciliation/TransactionDetailsDialog.tsx` aggiungere, dopo le righe già presenti, quattro `DetailRow`: «Testo della banca» (`description`), «Codice operazione» (`bankTransactionCode ?? '—'`), «Identificativo banca» (`providerTransactionId ?? bankReference ?? '—'`), «Origine» (`importSource`, con `importBatchId` fra parentesi se c'è), e in fondo `<CronologiaModifiche bankTransactionId={id} />`. La `GET /api/bank-transactions/[id]` che alimenta il dialogo restituisce già la transazione intera (`...transaction`): verificare che `providerTransactionId` e `bankTransactionCode` arrivino; se la `select` li esclude, aggiungerli.

- [ ] **Step 5: cablare tutto nel contenitore**

In `EstrattoConto.tsx`:

- stato: `const [inModifica, setInModifica] = useState<RigaEstrattoConto | null>(null)`, `const [dettagliId, setDettagliId] = useState<string | null>(null)`, `const [nuovoAperto, setNuovoAperto] = useState(false)`, `const [importaAperto, setImportaAperto] = useState(false)`;
- `const ricarica = () => queryClient.invalidateQueries({ queryKey: CHIAVE_QUERY_ESTRATTO })`;
- `chiama(url, init, ok, ko)`: `fetch` → su `!r.ok` `toast.error((await r.json().catch(() => ({}))).error ?? ko)`; su ok `toast.success(ok)`, `ricarica()`;
- `onModifica={setInModifica}`, `onDettagli={(r) => setDettagliId(r.id)}`;
- `onSposta={(r, sezione) => chiama(`/api/bank-transactions/${r.id}/sezione`, { method: 'POST', headers: json, body: JSON.stringify({ sezione }) }, 'Movimento spostato', 'Spostamento non riuscito')}`;
- `onCestino={(r) => chiama(`/api/bank-transactions/${r.id}`, { method: 'DELETE' }, 'Movimento nel Cestino', 'Non è stato possibile cestinare il movimento')}` — il 409 arriva col suo `error` («ha una scrittura collegata») e finisce nel toast;
- `onRipristina={(r) => chiama(`/api/bank-transactions/${r.id}/ripristina`, { method: 'POST' }, 'Movimento ripristinato', 'Ripristino non riuscito')}`;
- `onAzione` della barra: `chiama('/api/bank-transactions/azioni-in-blocco', { method: 'POST', headers: json, body: JSON.stringify(tutteDelFiltro ? { azione, sezione, filtro: Object.fromEntries(filtriInSearchParams(filtri)) } : { azione, sezione, ids: [...selezionati] }) }, …)`; il toast di successo dice «{toccate} movimenti {spostati|nel Cestino|ripristinati}» e, se `saltate > 0`, «{saltate} saltati perché collegati a una scrittura»; poi svuotare la selezione;
- barra dei pulsanti sopra i filtri, a destra: «Importa CSV» (`ImportDialog` con `onSuccess={ricarica}`) e «Nuovo movimento» (`NuovoMovimentoDialog` con `onCreato={ricarica}`);
- montare `ModificaMovimentoDialog` (`riga={inModifica}`, `open={!!inModifica}`, `onSalvata={ricarica}`), `TransactionDetailsDialog` (`transactionId={dettagliId}`).

Nel test `EstrattoConto.test.tsx` aggiungere:

```tsx
  it('il cestino sulla riga chiama la DELETE e ricarica', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')
    await cliccare(document.querySelector('tbody button[aria-label="Sposta nel Cestino"]'))
    await attendiChe(() => chiamate.some((u) => u === '/api/bank-transactions/1'), 'la DELETE')
  })

  it('l\'azione in blocco su «tutte del filtro» manda il filtro, non gli id', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')
    await cliccare(document.querySelector('tbody [role="checkbox"]'))
    await cliccare(perTesto(/tutte le 231/))
    await cliccare(perTesto('Cestino', 'button:not([role="tab"])'))
    await attendiChe(() => chiamate.some((u) => u.endsWith('/azioni-in-blocco')), 'la richiesta in blocco')
  })
```

Per leggere il corpo mandato, ampliare `stubFetch` perché registri anche `init` (come nel test del dialogo) e asserire `JSON.parse(body).filtro` presente e `ids` assente. Il pulsante «Cestino» nella barra e la scheda «Cestino» hanno lo stesso testo: il selettore `button:not([role="tab"])` distingue.

- [ ] **Step 6: verde, tipi, commit**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca src/components/reconciliation
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test
git add src/components/banca/estratto-conto src/components/reconciliation/TransactionDetailsDialog.tsx
git commit -m "feat(banca): modifica con cronologia, nuovo movimento, sposta in, cestino e ripristina, azioni in blocco, dettagli

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: dentro la prima nota — sotto-schede, cartello, testi e link; via «Carica movimenti»

**Files:**
- Create: `src/components/banca/estratto-conto/EstrattoContoInPrimaNota.tsx` (legge e scrive l'URL)
- Modify: `src/app/(dashboard)/prima-nota/movimenti/MovimentiClient.tsx` (sotto-schede su `register=BANK`, cartello solo su «Tutti», via «Carica movimenti»)
- Delete: `src/components/prima-nota/movimenti/CaricaMovimentiDialog.tsx`, `src/app/api/prima-nota/import/route.ts`, `src/app/api/prima-nota/import/__tests__/route.test.ts`
- Modify: `src/components/banca/MovimentiBancariInAttesa.tsx` (+ test), `src/components/settings/StatoSincronizzazione.tsx` (+ test), `src/components/settings/ConnessioniBancarie.tsx` (+ test)
- Modify: `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx` (via Importa CSV e la freschezza; il test scritto il 16 agosto resta verde perché non li asserisce)

**Interfaces:**
- Consumes: `EstrattoConto` (Task 8-9), `filtriDaSearchParams`, `filtriInSearchParams` (Task 5).

- [ ] **Step 1: il montaggio con l'URL**

`EstrattoContoInPrimaNota.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { filtriDaSearchParams, filtriInSearchParams } from '@/lib/banca/filtri-estratto-conto'
import { EstrattoConto } from './EstrattoConto'

/**
 * L'estratto conto dentro la prima nota: i filtri vivono nell'URL accanto a
 * `register=BANK`, così la vista si incolla e si ricarica uguale (spec,
 * decisione 7). `replace`, non `push`: ogni clic su un'intestazione non deve
 * diventare una voce della cronologia del browser.
 */
export function EstrattoContoInPrimaNota({ venueId }: { venueId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  return (
    <EstrattoConto
      venueId={venueId}
      filtriIniziali={filtriDaSearchParams(new URLSearchParams(searchParams.toString()))}
      onFiltriChange={(filtri) => {
        const sp = filtriInSearchParams(filtri, new URLSearchParams(searchParams.toString()))
        router.replace(`?${sp.toString()}`, { scroll: false })
      }}
    />
  )
}
```

- [ ] **Step 2: le sotto-schede in `MovimentiClient`**

In `MovimentiClient.tsx`:

- leggere `const vista = searchParams.get('vista') === 'scritture' ? 'scritture' : 'estratto'`;
- `const estrattoConto = filters.registerType === 'BANK' && vista === 'estratto'`;
- sotto il titolo, quando `filters.registerType === 'BANK'`, un selettore a due voci (stesso stile della `AccountSelectorToggle`, `aria-pressed`): «Estratto conto ({conteggio})» e «Scritture ({total})». Il conteggio dell'estratto conto viene da `useQuery(['estratto-conto', 'conteggio', venueId])` su `/api/bank-transactions?limit=1` → `pagination.total`; quello delle scritture è il `total` che la pagina già calcola. Cliccando: `router.replace` con `vista=scritture` (o senza `vista`) conservando gli altri parametri;
- quando `estrattoConto` è vero: nascondere la barra «Esporta / Nuovo» della pagina (appartiene alle scritture), i `MovimentiFilters`, la `MovimentiTable` e la sua paginazione, e montare `<EstrattoContoInPrimaNota venueId={venueId} />`;
- il cartello `MovimentiBancariInAttesa` si monta solo quando `!filters.registerType` (la scheda «Tutti»);
- togliere la voce «Carica movimenti» dal menu «Nuovo», lo stato `importDialogOpen`, l'import di `CaricaMovimentiDialog` e il suo `<CaricaMovimentiDialog …/>`. Cancellare il componente e la rotta `/api/prima-nota/import` col suo test.

- [ ] **Step 3: il cartello punta ai movimenti bancari**

In `MovimentiBancariInAttesa.tsx`: il link diventa `href="/prima-nota/movimenti?register=BANK"` con testo «Vai ai movimenti bancari»; nel test cambiare l'atteso in `toHaveAttribute('href', '/prima-nota/movimenti?register=BANK')` e il nome del link in `/movimenti bancari/i`.

- [ ] **Step 4: pannello Banche e Conti**

`StatoSincronizzazione.tsx`: «Vai ai movimenti bancari» → `href="/prima-nota/movimenti?register=BANK"`; nel test: `getByRole('link', { name: /movimenti bancari/i })` con quell'`href`, e il caso «senza offrire un link verso il vuoto» con lo stesso nome.
`ConnessioniBancarie.tsx`: la frase diventa «Qui si sceglie soltanto quali conti importare. I movimenti scaricati dalla banca si trovano nei movimenti bancari della prima nota (Conto Bancario → Estratto conto).»; nel test `expect(testo).toContain('movimenti bancari della prima nota')` al posto di `'nella Riconciliazione'`.

- [ ] **Step 5: `/riconciliazione` cede Importa CSV e la freschezza**

In `RiconciliazioneClient.tsx` togliere il pulsante «Importa CSV», lo stato `importOpen`, `<ImportDialog …/>` e `<FreschezzaMovimenti />` (che ora sta nell'estratto conto). Il sottotitolo diventa «Riconcilia i movimenti bancari con la prima nota». Il test `RiconciliazioneClient.test.tsx` continua a passare (non asserisce nulla di questo).

- [ ] **Step 6: verde e commit**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/banca src/components/settings "src/app/(dashboard)"
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run knip
git add -A "src/app/(dashboard)/prima-nota" src/components/banca src/components/settings src/components/prima-nota/movimenti src/app/api/prima-nota "src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx"
git commit -m "feat(prima-nota): l'estratto conto apre su Conto Bancario; scritture in sotto-scheda; via Carica movimenti

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

`knip` non deve segnalare export nuovi inutilizzati (in particolare `CHIAVE_QUERY_ESTRATTO` se non la usa nessuno fuori dal file: in quel caso togliere l'`export`).

---

## Task 11: verifica finale, prova a occhio, PR

- [ ] **Step 1: le suite intere**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run
TEST_DB_SUFFIX=estratto PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run --config vitest.integration.config.ts
```

Attese: unit tutti verdi (1870 + i nuovi); integrazione tutta verde. Un rosso in un file non toccato va indagato, non ignorato: può essere una collisione col carico (rilanciare quel file da solo) o una conseguenza vera (la `GET` ha cambiato forma).

- [ ] **Step 2: i cancelli**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run lint
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run knip
node scripts/check-route-auth.mjs
```

Il cricchetto: sono spariti due handler «inline» (`/ignore` e `/api/prima-nota/import`) e ne sono nati solo di `withAuth`: il numero da convertire scende (atteso 252). Riportarlo in `scripts/check-route-auth.mjs:292` (`const BASELINE = 252`) — solo verso il basso, come dice il file — e includere il file nel commit.

- [ ] **Step 3: entrambe le build**

```bash
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx next build --webpack
```

Entrambe exit 0, senza `| tail`.

- [ ] **Step 4: la prova a occhio su un database locale**

Come il 16 agosto (vedi memoria «movimenti-sincronizzati-dove-sono»): copiare il template dei test in un DB di prova, caricarci un conto sincronizzato e 231 righe finte **grezze** (solo `description`, con codici veri: 70 × `48//00 Bonifico a vs favore *…`, 62 × `16//37 Commissioni su bonifico tramite in`, ecc.), poi:

```bash
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_prova_estratto" PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsx scripts/banca/ricalcola-causali.ts --dry-run
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_prova_estratto" PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsx scripts/banca/ricalcola-causali.ts
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_prova_estratto" ENCRYPTION_KEY="dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktdGVzdCE=" NEXTAUTH_URL="http://localhost:3200" AUTH_URL="http://localhost:3200" APP_URL="http://localhost:3200" PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npx next start -p 3200
```

(la porta 3100 è occupata da un altro worktree; `admin@weisscafe.it` / `admin123` con `must_change_password = false` sul DB di prova.) Nel browser Playwright: `/prima-nota/movimenti?register=BANK` → l'estratto conto con le schede coi conteggi, i totali, la tabella con Causale e Descrizione separate; cliccare «Importo» due volte; nascondere «Causale» dal menu Colonne e ricaricare (resta nascosta); modificare una descrizione e vedere «Modificato» e la cronologia; spostare una riga in Deleghe F24 e vederla nella scheda; cestinare e ripristinare; selezionare tutto → «tutte le 231» → Sposta in; «Scritture» mostra la tabella di prima; `?register=CASH` e «Tutti» invariati (col cartello solo su «Tutti»); Banche e Conti con la frase e il link nuovi. Salvare gli screenshot nello scratchpad. Spegnere il server e cancellare il DB di prova.

- [ ] **Step 5: la nota di ripresa e la PR**

Aggiungere a `docs/RIPRESA-16-AGOSTO.md` (Parte 1) una sezione «1.6 Consegna A dell'estratto conto» con: cosa c'è, i numeri delle verifiche, e i due passi da fare **dopo il deploy**: (1) `npx tsx --env-file=.env scripts/banca/ricalcola-causali.ts --dry-run` poi senza `--dry-run`, contro la produzione, e confrontare i conteggi per codice con la tabella della spec; (2) aprire `?register=BANK` in produzione e guardare le 231 righe.

```bash
git push -u origin HEAD:refs/heads/banca/estratto-conto-in-prima-nota
gh pr create --base main --head banca/estratto-conto-in-prima-nota --title "feat(banca): l'estratto conto nella prima nota, consegna A — la lista" --body-file <corpo>
```

Il corpo della PR: sintomo e decisione (con il rimando alla spec), la tabella causale/descrizione per codice controllata a occhio sulla prova locale, l'elenco delle rotte nuove e rimosse, le verifiche (suite, cancelli, build, prova a occhio), i due passi post-deploy. Chiude con `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Aspettare i 5 job della CI; mergiare solo su richiesta.

---

## Autoverifica del piano (fatta scrivendolo)

- **Copertura della spec (consegna A)**: modello dati → Task 2; `separaCausale` e tabella dei 20 codici → Task 1; chi scrive le righe → Task 3; ricalcolo idempotente → Task 4; stato/residuo, filtri nell'URL, ordinamento a due stati, totali sul filtro, conteggi fissi → Task 5; `PATCH` con divieto per forma e cronologia → Task 6; sezione, Cestino/Ripristina, azioni in blocco per id o filtro, 409 su riga collegata, via Ignora → Task 7; la pagina (schede, totali, filtri, colonne che restano aperte, ordinamento da tastiera, paginazione, selezione con «tutte le N», legenda, stati vuoti) → Task 8; Modifica con «dalla banca», Nuovo movimento, dettagli arricchiti, Importa CSV col conto → Task 9 (e 3); sotto-schede, cartello solo su «Tutti», testi del pannello, via «Carica movimenti» e `/api/prima-nota/import`, `/riconciliazione` cede Importa CSV e freschezza → Task 10; cancelli, build, prova a occhio, passi post-deploy → Task 11.
- **Fuori da questa consegna, di proposito**: colonna Categoria, Collega/Scollega/Riconcilia, `promuoviRigaBancaria`, il residuo denormalizzato per il filtro «Solo non riconciliati» sui parziali (consegna B).
- **Nomi coerenti fra i task**: `separaCausale`, `CAUSALI_PER_CODICE`, `statoLegenda`, `filtriEstrattoContoSchema` / `filtriDaSearchParams` / `filtriInSearchParams` / `FILTRI_DEFAULT` / `ORDINA` / `OrdinaPer`, `costruisciWhere` / `costruisciOrderBy` / `SELEZIONE_RIGA` / `mappaRiga`, `registraModifiche` / `differenze` / `CAMPI_BADGE`, `patchBankTransactionSchema` / `CAMPI_SOLO_MANUALI` / `spostaSezioneSchema` / `azioniInBloccoSchema`, `RigaEstrattoConto` / `RispostaEstrattoConto` / `StatoLegenda` / `SezioneMovimentoBancario`, `COLONNE` / `IdColonna` / `leggiColonneVisibili` / `salvaColonneVisibili` / `leggiRighePerPagina` / `salvaRighePerPagina`, `EstrattoConto` / `EstrattoContoInPrimaNota` / `CHIAVE_QUERY_ESTRATTO`.

