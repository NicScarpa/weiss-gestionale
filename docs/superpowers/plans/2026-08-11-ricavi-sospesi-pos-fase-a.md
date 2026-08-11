# Imputazione ricavi, sospesi e incassi POS — fase A

> **Per chi esegue:** usare `superpowers:subagent-driven-development` (consigliato) o
> `superpowers:executing-plans`, un task alla volta. Gli step hanno caselle (`- [ ]`) da spuntare.

**Obiettivo:** far sì che gli incassi della chiusura di cassa nascano imputati a un conto di ricavo, che i sospesi abbiano un'anagrafica con un ciclo di vita, e che gli incassi POS sappiano da quale terminale vengono e come si riconciliano con l'accredito bancario.

**Architettura:** nessun servizio nuovo. Si estende la chiusura di cassa (`daily_closures` e le sue postazioni) con tre tabelle di dettaglio, e si arricchisce la generazione delle scritture (`src/lib/closure-journal-entries.ts`) perché produca le allocazioni sui conti di ricavo riusando `JournalEntryAllocation`, che esiste già. La riconciliazione bancaria resta quella attuale (`BankTransaction.matchedEntryId`, uno-a-uno) e le si aggiunge il calcolo delle commissioni per provider.

**Stack:** Next.js (App Router) · Prisma 7 su PostgreSQL · vitest · React 19 + shadcn/ui · Decimal.js per gli importi.

## Vincoli globali

Valgono per **ogni** task, senza ripeterli.

- **Node 22 obbligatorio**: anteporre `source ~/.nvm/nvm.sh && nvm use 22 &&` a ogni comando `npm`/`npx`/`node`, nella stessa riga di shell. Il Node di sistema è la 25 e `npm` si rifiuta con `EBADENGINE`.
- **`.env` punta alla PRODUZIONE.** Nessuno script, seed o `db execute` va eseguito contro `DATABASE_URL` del `.env`. L'ambiente isolato è `postgresql://nicolascarpa@127.0.0.1:5433/<db>`; `psql` sta in `/opt/homebrew/opt/postgresql@16/bin`, non nel PATH.
- **Test di integrazione in parallelo**: sempre `TEST_DB_SUFFIX=<nome>` (es. `TEST_DB_SUFFIX=sospesi`), altrimenti due suite si ricreano il database a vicenda.
- **Ogni route nuova usa `withAuth`** (`src/lib/api-utils.ts`). Il cricchetto `node scripts/check-route-auth.mjs --ratchet` gira in CI e **fallisce se il numero di handler senza `withAuth` sale**: una route scritta con `auth()` inline rompe la build. Le route con dati finanziari richiedono `roles: ['admin', 'manager']`.
- **Un `route.ts` esporta soltanto handler HTTP.** Qualunque simbolo condiviso va in un `condiviso.ts` accanto: webpack rifiuta gli export estranei con TS2344 mentre Turbopack li accetta, e il gate prova entrambi.
- **Importi sempre `Decimal`** in Prisma, mai `Float`. Le scritture contabili non si cancellano: `deletedAt`, mai `delete()`.
- **Sede**: sempre `getVenueId()` / `getVenue()` da `src/lib/venue.ts`.
- **Migrazioni**: si generano con `npm run db:migrate` contro il database locale (il guard blocca la produzione) e si committano insieme allo schema. In produzione `npm run db:migrate:deploy`, che riabilita anche la RLS.
- **Italiano** per le route nuove (`/api/sospesi`, `/api/terminali-pos`), coerente con `/api/pagamenti`, `/api/chiusure`, `/api/scadenzario`.
- Gate prima di ogni commit: `npx tsc --noEmit`, `npm run lint`, `npm test -- --run`.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `prisma/schema.prisma` | i tre modelli nuovi + `SuspendedCreditStatus`, `PosProvider`, `PosSettlementMode` |
| `src/lib/sospesi/anagrafica.ts` | regole pure sui crediti: residuo, transizioni di stato, validazione di un saldo |
| `src/lib/sospesi/__tests__/anagrafica.test.ts` | test delle regole pure |
| `src/app/api/sospesi/route.ts` | `GET` elenco crediti (filtri: stato, periodo) |
| `src/app/api/sospesi/[id]/route.ts` | `PATCH` (annulla / corregge), `GET` dettaglio |
| `src/lib/pos/terminali.ts` | anagrafica terminali: lettura, forma del provider, conti collegati |
| `src/lib/pos/commissioni.ts` | **puro**: estrae lordo/commissione dalla causale Axerve, deduce quella SumUp, applica la forchetta |
| `src/lib/pos/__tests__/commissioni.test.ts` | test del parser e della deduzione, coi movimenti bancari veri |
| `src/app/api/terminali-pos/route.ts` | `GET`/`POST` anagrafica terminali |
| `src/app/api/terminali-pos/[id]/route.ts` | `PATCH`/`DELETE` (disattiva) |
| `src/lib/closure-calculations.ts` | quadratura estesa: saldi sospesi nel contante, POS per terminale |
| `src/lib/closure-journal-entries.ts` | le scritture nascono con le allocazioni sui conti di ricavo |
| `src/components/chiusura/IncassoPerTerminale.tsx` | righe `{terminale, importo}` con vincolo sulla somma |
| `src/components/chiusura/ImputazioneRicavi.tsx` | ripartizione libera dell'incasso su più conti |
| `src/components/chiusura/SospesiCard.tsx` | sospesi generati + saldo di partite aperte |
| `src/app/api/riconciliazione-pos/route.ts` | `POST`: abbina un accredito, calcola la commissione, chiude il transitorio |

**Perché così**: le regole che decidono qualcosa (residuo di un credito, commissione dedotta) stanno in moduli **puri** con i loro test, separate dalle route che le usano. È il modello già adottato da `src/lib/attendance/timekeeping-engine.ts`, che il progetto considera il suo esempio riuscito.

---

## Task 1 — I tre modelli e la migrazione

**File:**
- Modifica: `prisma/schema.prisma`
- Crea: `prisma/migrations/<timestamp>_sospesi_e_terminali_pos/migration.sql` (generata)

**Interfacce prodotte:** i modelli `SuspendedCredit`, `PosTerminal`, `CashStationPos` e gli enum `SuspendedCreditStatus`, `PosProvider`, `PosSettlementMode`, usati da tutti i task successivi.

- [ ] **Step 1: aggiungere i modelli allo schema**

In `prisma/schema.prisma`, accanto agli altri modelli:

```prisma
model SuspendedCredit {
  id              String                @id @default(cuid())
  venueId         String                @map("venue_id")
  closureId       String                @map("closure_id")
  stationId       String?               @map("station_id")
  dataGenerazione DateTime              @map("data_generazione") @db.Date
  importo         Decimal               @db.Decimal(10, 2)
  descrizione     String                @db.VarChar(200)
  customerId      String?               @map("customer_id")
  stato           SuspendedCreditStatus @default(APERTO)
  saldoClosureId  String?               @map("saldo_closure_id")
  dataSaldo       DateTime?             @map("data_saldo") @db.Date
  importoSaldato  Decimal               @default(0) @map("importo_saldato") @db.Decimal(10, 2)
  note            String?
  createdById     String?               @map("created_by")
  createdAt       DateTime              @default(now()) @map("created_at")
  updatedAt       DateTime              @updatedAt @map("updated_at")

  venue        Venue         @relation(fields: [venueId], references: [id])
  closure      DailyClosure  @relation("SospesiGenerati", fields: [closureId], references: [id], onDelete: Restrict)
  saldoClosure DailyClosure? @relation("SospesiSaldati", fields: [saldoClosureId], references: [id], onDelete: SetNull)
  customer     Customer?     @relation(fields: [customerId], references: [id])

  @@index([venueId, stato])
  @@index([closureId])
  @@index([saldoClosureId])
  @@map("suspended_credits")
}

enum SuspendedCreditStatus {
  APERTO
  PARZIALE
  SALDATO
  ANNULLATO
}

model PosTerminal {
  id                  String            @id @default(cuid())
  venueId             String            @map("venue_id")
  nome                String            @db.VarChar(100)
  provider            PosProvider
  modalitaAccredito   PosSettlementMode @map("modalita_accredito")
  transitoryAccountId String?           @map("transitory_account_id")
  feeAccountId        String?           @map("fee_account_id")
  matchPattern        String?           @map("match_pattern") @db.VarChar(200)
  isActive            Boolean           @default(true) @map("is_active")
  createdAt           DateTime          @default(now()) @map("created_at")
  updatedAt           DateTime          @updatedAt @map("updated_at")

  venue             Venue            @relation(fields: [venueId], references: [id])
  transitoryAccount Account?         @relation("PosTransitorio", fields: [transitoryAccountId], references: [id])
  feeAccount        Account?         @relation("PosCommissioni", fields: [feeAccountId], references: [id])
  incassi           CashStationPos[]

  @@unique([venueId, nome])
  @@index([venueId, isActive])
  @@map("pos_terminals")
}

enum PosProvider {
  WORLDLINE
  AXERVE
  SUMUP
  ALTRO
}

enum PosSettlementMode {
  LORDO
  NETTO_DICHIARATO
  NETTO_DEDOTTO
}

model CashStationPos {
  id         String  @id @default(cuid())
  stationId  String  @map("station_id")
  terminalId String  @map("terminal_id")
  importo    Decimal @db.Decimal(10, 2)

  station  CashStation @relation(fields: [stationId], references: [id], onDelete: Cascade)
  terminal PosTerminal @relation(fields: [terminalId], references: [id], onDelete: Restrict)

  @@unique([stationId, terminalId])
  @@index([terminalId])
  @@map("cash_station_pos")
}
```

Aggiungere le relazioni inverse: su `Venue` (`suspendedCredits`, `posTerminals`), su `DailyClosure` (`sospesiGenerati SuspendedCredit[] @relation("SospesiGenerati")`, `sospesiSaldati SuspendedCredit[] @relation("SospesiSaldati")`), su `CashStation` (`incassiPos CashStationPos[]`), su `Customer` (`suspendedCredits`), su `Account` (`posTransitorio PosTerminal[] @relation("PosTransitorio")`, `posCommissioni PosTerminal[] @relation("PosCommissioni")`).

- [ ] **Step 2: verificare che lo schema sia valido**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx prisma validate
```
Atteso: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 3: generare la migrazione contro il database locale**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_dev" npm run db:migrate -- --name sospesi_e_terminali_pos
```

- [ ] **Step 4: proteggere le tabelle nuove con la RLS**

In coda al `migration.sql` generato, per **ciascuna** delle tre tabelle (`suspended_credits`, `pos_terminals`, `cash_station_pos`), sullo stampo di `20260807000000_piano_v4_centri_costo/migration.sql`:

```sql
ALTER TABLE "suspended_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suspended_credits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON "suspended_credits";
CREATE POLICY "service_role_all" ON "suspended_credits" FOR ALL TO service_role USING (true) WITH CHECK (true);
```

> Perché a mano: Prisma non modella le policy. `npm run db:migrate:deploy` esegue comunque `rls:enable` dopo le migrazioni, quindi è una cintura in più — ma senza, fra la migrazione e quel passo la tabella nasce scoperta.

- [ ] **Step 5: verificare che la migrazione sia applicabile da zero**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && \
  psql -h 127.0.0.1 -p 5433 -U nicolascarpa -d postgres -c "CREATE DATABASE prova_fase_a" && \
  DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/prova_fase_a" npm run db:migrate:deploy
```
Atteso: tutte le migrazioni applicate, e in coda `scoperte: 0` dal passo RLS.

- [ ] **Step 6: commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): anagrafica sospesi, terminali POS e incasso POS per terminale"
```

---

## Task 2 — Le regole pure dei crediti sospesi

**File:**
- Crea: `src/lib/sospesi/anagrafica.ts`
- Test: `src/lib/sospesi/__tests__/anagrafica.test.ts`

**Interfacce prodotte:**
- `residuoDi(credito: CreditoSospeso): number`
- `applicaSaldo(credito: CreditoSospeso, importo: number): EsitoSaldo`
- `type EsitoSaldo = { ok: true; stato: SuspendedCreditStatus; importoSaldato: number } | { ok: false; motivo: string }`

- [ ] **Step 1: scrivere il test che fallisce**

`src/lib/sospesi/__tests__/anagrafica.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { residuoDi, applicaSaldo } from '../anagrafica'

const credito = (over: Partial<Parameters<typeof residuoDi>[0]> = {}) => ({
  importo: 1200,
  importoSaldato: 0,
  stato: 'APERTO' as const,
  ...over,
})

describe('residuo', () => {
  it('su un credito intatto è l’importo pieno', () => {
    expect(residuoDi(credito())).toBe(1200)
  })

  it('scala di quanto è già stato saldato', () => {
    expect(residuoDi(credito({ importoSaldato: 500, stato: 'PARZIALE' }))).toBe(700)
  })

  it('è zero su un credito saldato', () => {
    expect(residuoDi(credito({ importoSaldato: 1200, stato: 'SALDATO' }))).toBe(0)
  })
})

describe('applicazione di un saldo', () => {
  it('un saldo pari al residuo chiude la partita', () => {
    const esito = applicaSaldo(credito(), 1200)
    expect(esito).toEqual({ ok: true, stato: 'SALDATO', importoSaldato: 1200 })
  })

  it('un saldo inferiore lascia la partita PARZIALE', () => {
    const esito = applicaSaldo(credito(), 500)
    expect(esito).toEqual({ ok: true, stato: 'PARZIALE', importoSaldato: 500 })
  })

  it('un secondo saldo che copre il resto chiude la partita', () => {
    const esito = applicaSaldo(credito({ importoSaldato: 500, stato: 'PARZIALE' }), 700)
    expect(esito).toEqual({ ok: true, stato: 'SALDATO', importoSaldato: 1200 })
  })

  // Il caso che protegge la cassa: incassare più del dovuto significa che
  // qualcuno ha sbagliato a digitare, e la differenza sparirebbe dentro un
  // credito senza lasciare traccia.
  it('un saldo superiore al residuo è rifiutato', () => {
    const esito = applicaSaldo(credito({ importoSaldato: 1000, stato: 'PARZIALE' }), 500)
    expect(esito).toEqual({ ok: false, motivo: 'Il saldo supera il residuo di 200,00 €' })
  })

  it('un saldo su una partita già chiusa è rifiutato', () => {
    const esito = applicaSaldo(credito({ importoSaldato: 1200, stato: 'SALDATO' }), 10)
    expect(esito).toEqual({ ok: false, motivo: 'La partita è già SALDATO' })
  })

  it('un importo non positivo è rifiutato', () => {
    expect(applicaSaldo(credito(), 0)).toEqual({ ok: false, motivo: 'Importo non valido' })
  })
})
```

- [ ] **Step 2: eseguirlo e vederlo fallire**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/sospesi/__tests__/anagrafica.test.ts
```
Atteso: FAIL, `Failed to resolve import "../anagrafica"`.

- [ ] **Step 3: scrivere l'implementazione minima**

`src/lib/sospesi/anagrafica.ts`:

```typescript
/**
 * Regole pure sui crediti da sospeso. Nessun accesso al database: qui vive
 * solo la decisione, così è verificabile senza allestire uno stato.
 */
export type StatoCredito = 'APERTO' | 'PARZIALE' | 'SALDATO' | 'ANNULLATO'

export interface CreditoSospeso {
  importo: number
  importoSaldato: number
  stato: StatoCredito
}

export type EsitoSaldo =
  | { ok: true; stato: StatoCredito; importoSaldato: number }
  | { ok: false; motivo: string }

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`

export function residuoDi(credito: CreditoSospeso): number {
  return Math.max(0, credito.importo - credito.importoSaldato)
}

export function applicaSaldo(credito: CreditoSospeso, importo: number): EsitoSaldo {
  if (!(importo > 0)) return { ok: false, motivo: 'Importo non valido' }
  if (credito.stato === 'SALDATO' || credito.stato === 'ANNULLATO') {
    return { ok: false, motivo: `La partita è già ${credito.stato}` }
  }

  const residuo = residuoDi(credito)
  if (importo > residuo) {
    return { ok: false, motivo: `Il saldo supera il residuo di ${euro(importo - residuo)}` }
  }

  const saldato = credito.importoSaldato + importo
  return { ok: true, stato: saldato >= credito.importo ? 'SALDATO' : 'PARZIALE', importoSaldato: saldato }
}
```

- [ ] **Step 4: eseguire i test e vederli passare**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/sospesi/__tests__/anagrafica.test.ts
```
Atteso: 8 test verdi.

- [ ] **Step 5: commit**

```bash
git add src/lib/sospesi/
git commit -m "feat(sospesi): le regole del residuo e del saldo, pure e provate"
```

---

## Task 3 — Commissioni POS: parser Axerve e deduzione SumUp

**File:**
- Crea: `src/lib/pos/commissioni.ts`
- Test: `src/lib/pos/__tests__/commissioni.test.ts`

**Interfacce prodotte:**
- `leggiCausaleAxerve(causale: string): { lordo: number; commissione: number } | null`
- `deduciCommissione(lordoAtteso: number, accreditato: number, forchetta?: Forchetta): EsitoDeduzione`
- `type Forchetta = { minPct: number; maxPct: number }` — default `{ minPct: 0.5, maxPct: 2.5 }`

- [ ] **Step 1: scrivere il test che fallisce**

`src/lib/pos/__tests__/commissioni.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { leggiCausaleAxerve, deduciCommissione } from '../commissioni'

// Causale reale di un accredito Axerve del 16/07/2026 (causale bancaria 79).
const CAUSALE_AXERVE =
  'Disposizione di giro conto *WEISS SRL 626420100001 BS 190,00+ COM 1,90-/BENEF/626420100001 BS 190,00+ COM 1,90-'

// Causale reale di un payout SumUp del 07/08/2026 (causale bancaria 48).
const CAUSALE_SUMUP =
  'Bonifico a vs favore *INST 16:40 Sumup Limited 2073980192 SUMUP PID1774208 PAYOUT 070826'

describe('causale Axerve', () => {
  it('estrae lordo e commissione dalla prima occorrenza', () => {
    expect(leggiCausaleAxerve(CAUSALE_AXERVE)).toEqual({ lordo: 190, commissione: 1.9 })
  })

  it('non riconosce una causale di altro provider', () => {
    expect(leggiCausaleAxerve(CAUSALE_SUMUP)).toBeNull()
  })

  it('non riconosce una causale in cui i conti non tornano', () => {
    // 190,00 - 1,90 = 188,10: se la causale dicesse 200,00 il dato è corrotto
    // e leggerlo sarebbe peggio che non leggerlo.
    const falsa = CAUSALE_AXERVE.replace('BS 190,00+', 'BS 200,00+')
    expect(leggiCausaleAxerve(falsa, 188.1)).toBeNull()
  })
})

describe('deduzione della commissione', () => {
  it('deduce la commissione come differenza fra atteso e accreditato', () => {
    expect(deduciCommissione(910, 892.22)).toEqual({
      ok: true,
      commissione: 17.78,
      percentuale: 1.95,
    })
  })

  it('rifiuta uno scarto troppo grande per essere una commissione', () => {
    const esito = deduciCommissione(1000, 800)
    expect(esito.ok).toBe(false)
    // È il presidio che impedisce a un ammanco di travestirsi da commissione.
    expect(esito).toMatchObject({ motivo: expect.stringContaining('20.00%') })
  })

  it('rifiuta uno scarto troppo piccolo, che di solito è un abbinamento sbagliato', () => {
    expect(deduciCommissione(1000, 999.9).ok).toBe(false)
  })

  it('rifiuta un accredito superiore al lordo atteso', () => {
    expect(deduciCommissione(500, 520).ok).toBe(false)
  })

  it('accetta una forchetta diversa se il provider la richiede', () => {
    expect(deduciCommissione(1000, 950, { minPct: 4, maxPct: 6 })).toMatchObject({ ok: true })
  })
})
```

- [ ] **Step 2: eseguirlo e vederlo fallire**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/pos/__tests__/commissioni.test.ts
```
Atteso: FAIL, modulo non risolto.

- [ ] **Step 3: scrivere l'implementazione**

`src/lib/pos/commissioni.ts`:

```typescript
/**
 * Come si ricava la commissione di un accredito POS, che dipende dal provider.
 *
 * Axerve la scrive nella causale del bonifico; SumUp no, e lì va dedotta come
 * differenza fra il lordo transato e quanto la banca ha portato. La deduzione
 * è comoda e pericolosa: qualunque errore di registrazione o ammanco può
 * travestirsi da commissione. Per questo esiste la forchetta, e per questo
 * fuori dalla forchetta si rifiuta invece di accettare.
 */
export interface Forchetta {
  minPct: number
  maxPct: number
}

export const FORCHETTA_PREDEFINITA: Forchetta = { minPct: 0.5, maxPct: 2.5 }

export type EsitoDeduzione =
  | { ok: true; commissione: number; percentuale: number }
  | { ok: false; motivo: string }

const numero = (testo: string) => Number(testo.replace(/\./g, '').replace(',', '.'))
const arrotonda = (n: number) => Math.round(n * 100) / 100

/**
 * `BS 190,00+ COM 1,90-` dentro la causale di un giro conto Axerve. Il pattern
 * compare due volte (la seconda dopo `/BENEF/`): si legge la prima.
 *
 * Con `accreditato` valorizzato si controlla che lordo − commissione torni:
 * una causale che non quadra è un dato corrotto, e usarlo sarebbe peggio che
 * lasciare la riconciliazione a mano.
 */
export function leggiCausaleAxerve(
  causale: string,
  accreditato?: number
): { lordo: number; commissione: number } | null {
  const m = causale.match(/BS\s+([\d.]+,\d{2})\+\s+COM\s+([\d.]+,\d{2})-/)
  if (!m) return null

  const lordo = numero(m[1])
  const commissione = numero(m[2])
  if (!Number.isFinite(lordo) || !Number.isFinite(commissione)) return null

  if (accreditato !== undefined && arrotonda(lordo - commissione) !== arrotonda(accreditato)) {
    return null
  }

  return { lordo, commissione }
}

export function deduciCommissione(
  lordoAtteso: number,
  accreditato: number,
  forchetta: Forchetta = FORCHETTA_PREDEFINITA
): EsitoDeduzione {
  if (!(lordoAtteso > 0)) return { ok: false, motivo: 'Lordo atteso non valido' }
  if (accreditato > lordoAtteso) {
    return { ok: false, motivo: 'L’accredito supera il lordo transato: abbinamento sbagliato' }
  }

  const commissione = arrotonda(lordoAtteso - accreditato)
  const percentuale = arrotonda((commissione / lordoAtteso) * 100)

  if (percentuale < forchetta.minPct || percentuale > forchetta.maxPct) {
    return {
      ok: false,
      motivo:
        `Scarto del ${percentuale.toFixed(2)}%, fuori dalla forchetta ` +
        `${forchetta.minPct}–${forchetta.maxPct}%: non è una commissione plausibile.`,
    }
  }

  return { ok: true, commissione, percentuale }
}
```

- [ ] **Step 4: eseguire i test e vederli passare**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/pos/__tests__/commissioni.test.ts
```
Atteso: 9 test verdi.

- [ ] **Step 5: commit**

```bash
git add src/lib/pos/
git commit -m "feat(pos): commissione letta dalla causale Axerve, dedotta per SumUp con forchetta"
```

---

## Task 4 — Gli incassi della chiusura nascono imputati a un conto di ricavo

**File:**
- Modifica: `src/lib/closure-journal-entries.ts` (le due `entries.push` di incasso, cassa e POS)
- Test: `src/lib/__tests__/closure-journal-entries.test.ts` (esiste, si estende)

**Interfacce consumate:** `systemKey` sui conti (`CORRISPETTIVI` su `10.01`), già in produzione dal rilascio del piano v4.

**Interfacce prodotte:** `generateJournalEntriesFromClosure` crea, per ogni riga di incasso, le righe `JournalEntryAllocation` con `origine: 'chiusura'`.

- [ ] **Step 1: scrivere il test che fallisce**

In `src/lib/__tests__/closure-journal-entries.test.ts`, aggiungere in fondo. Il file mocka già `prisma`: aggiungere `journalEntryAllocation: { createMany: vi.fn() }` al mock e `account: { findUnique: vi.fn() }` se assenti.

```typescript
describe('imputazione dell’incasso a un conto di ricavo', () => {
  it('la riga di incasso in cassa nasce allocata su 10.01 per l’intero importo', async () => {
    conContiDiSistema() // helper esistente nel file: valorizza CASSA/BANCA/CORRISPETTIVI
    await generateJournalEntriesFromClosure(chiusuraCompleta, userId)

    const allocazioni = vi.mocked(prisma.journalEntryAllocation.createMany).mock.calls[0][0]
      .data as Array<{ accountId: string; importo: number; origine: string }>

    const incassoCassa = allocazioni.filter((a) => a.origine === 'chiusura')
    expect(incassoCassa.length).toBeGreaterThan(0)
    // Somma delle fette = contante incassato + POS: il denaro entrato, non i corrispettivi.
    const totale = incassoCassa.reduce((s, a) => s + a.importo, 0)
    expect(totale).toBe(1000)
  })

  it('senza il conto CORRISPETTIVI la chiusura non si blocca ma non alloca', async () => {
    // Un ambiente dove il piano v4 non c'è ancora deve continuare a funzionare:
    // meglio una scrittura non imputata che una chiusura che non si valida.
    conContiDiSistema({ corrispettivi: null })
    await expect(generateJournalEntriesFromClosure(chiusuraCompleta, userId)).resolves.not.toThrow()
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: eseguirlo e vederlo fallire**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/__tests__/closure-journal-entries.test.ts
```
Atteso: FAIL — `createMany` non chiamata.

- [ ] **Step 3: implementare**

In `src/lib/closure-journal-entries.ts`, dopo la `createMany` delle scritture (che restituisce solo un conteggio: servono gli id, quindi creare le righe con id espliciti generati da `randomUUID()` come già si fa per `transferId`):

```typescript
// Il conto su cui imputare il ricavo. Assente in un ambiente senza piano v4:
// in quel caso si generano le scritture senza allocazione, invece di rifiutare
// la validazione di una chiusura per una configurazione che non c'entra.
const contoRicavo = await client.account.findUnique({ where: { systemKey: 'CORRISPETTIVI' } })

// ... dopo aver creato le entries, se contoRicavo esiste:
if (contoRicavo) {
  const allocazioni = righeDiIncasso.map((riga) => ({
    journalEntryId: riga.id,
    accountId: contoRicavo.id,
    importo: riga.debitAmount!,
    origine: 'chiusura',
  }))
  if (allocazioni.length > 0) {
    await client.journalEntryAllocation.createMany({ data: allocazioni })
  }
}
```

`righeDiIncasso` sono le due righe con `entryType: 'INCASSO'` (cassa e POS): il versamento no, che è uno spostamento fra registri e non un ricavo.

- [ ] **Step 4: eseguire l'intero file di test**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/__tests__/closure-journal-entries.test.ts
```
Atteso: tutti verdi, compresi quelli preesistenti sulla parte contabile.

- [ ] **Step 5: verificare per inversione che il test morda**

Cambiare `origine: 'chiusura'` in `origine: 'manuale'` e rieseguire: il primo test deve fallire. Poi rimettere.

- [ ] **Step 6: commit**

```bash
git add src/lib/closure-journal-entries.ts src/lib/__tests__/closure-journal-entries.test.ts
git commit -m "feat(chiusura): l'incasso nasce imputato al conto dei corrispettivi"
```

---

## Task 5 — Incasso POS per terminale nella chiusura

**File:**
- Modifica: `src/app/api/chiusure/route.ts` e `src/app/api/chiusure/[id]/route.ts` (schema Zod delle postazioni)
- Modifica: `src/lib/closure-calculations.ts` (`buildStationCreateData`)
- Crea: `src/components/chiusura/IncassoPerTerminale.tsx`
- Test: `src/lib/__tests__/closure-calculations.test.ts`

**Interfacce consumate:** `PosTerminal`, `CashStationPos` (Task 1).

- [ ] **Step 1: scrivere il test che fallisce**

```typescript
import { describe, it, expect } from 'vitest'
import { buildStationCreateData } from '../closure-calculations'

describe('incasso POS per terminale', () => {
  it('la somma dei terminali deve fare il posAmount della postazione', () => {
    const dati = buildStationCreateData(
      { name: 'Bancone', posAmount: 400, cashAmount: 560,
        incassiPos: [{ terminalId: 't-worldline', importo: 300 }, { terminalId: 't-sumup', importo: 100 }] },
      0
    )
    expect(dati.incassiPos?.create).toHaveLength(2)
  })

  it('una somma che non torna è rifiutata', () => {
    expect(() =>
      buildStationCreateData(
        { name: 'Bancone', posAmount: 400, incassiPos: [{ terminalId: 't-worldline', importo: 250 }] },
        0
      )
    ).toThrow(/250,00.*400,00/)
  })

  it('senza dettaglio per terminale la postazione resta valida (retrocompatibilità)', () => {
    const dati = buildStationCreateData({ name: 'Bancone', posAmount: 400 }, 0)
    expect(dati.incassiPos).toBeUndefined()
    expect(dati.posAmount).toBe(400)
  })
})
```

- [ ] **Step 2: eseguirlo e vederlo fallire**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/__tests__/closure-calculations.test.ts
```

- [ ] **Step 3: implementare in `buildStationCreateData`**

```typescript
// Il dettaglio per terminale è facoltativo: le chiusure esistenti non ce
// l'hanno, e una serata con un solo POS non guadagna nulla a compilarlo.
// Ma se c'è, deve quadrare con il totale, o i due numeri divergono in silenzio.
if (station.incassiPos && station.incassiPos.length > 0) {
  const somma = station.incassiPos.reduce((s, r) => s + (r.importo || 0), 0)
  const atteso = station.posAmount || 0
  if (Math.abs(somma - atteso) > 0.005) {
    throw new Error(
      `Incassi POS per terminale: ${somma.toFixed(2).replace('.', ',')} € ` +
      `contro un totale POS di ${atteso.toFixed(2).replace('.', ',')} €`
    )
  }
}
```
e nel valore di ritorno: `incassiPos: station.incassiPos?.length ? { create: station.incassiPos } : undefined`.

- [ ] **Step 4: aggiungere il campo allo schema Zod delle due route**

```typescript
incassiPos: z.array(z.object({
  terminalId: z.string().cuid(),
  importo: z.number().nonnegative(),
})).optional(),
```

- [ ] **Step 5: test verdi + typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/__tests__/closure-calculations.test.ts && npx tsc --noEmit
```

- [ ] **Step 6: commit**

```bash
git add src/lib/closure-calculations.ts src/lib/__tests__/closure-calculations.test.ts src/app/api/chiusure/
git commit -m "feat(chiusura): l'incasso POS sa da quale terminale viene"
```

---

## Task 6 — I sospesi nascono dalla chiusura

**File:**
- Modifica: `src/app/api/chiusure/route.ts`, `src/app/api/chiusure/[id]/route.ts`
- Crea: `src/app/api/sospesi/route.ts`
- Crea: `src/components/chiusura/SospesiCard.tsx`
- Test: `src/app/api/sospesi/__tests__/sospesi.itest.ts`

**Interfacce consumate:** `SuspendedCredit` (Task 1), `residuoDi` (Task 2).

- [ ] **Step 1: scrivere il test di integrazione che fallisce**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { GET } from '@/app/api/sospesi/route'

setupIntegrationDb()
beforeEach(async () => { await loginAs('admin') })

describe('GET /api/sospesi', () => {
  it('elenca i crediti aperti col loro residuo', async () => {
    // fixture: una chiusura con un sospeso da 1200, di cui 500 già saldati
    const res = await callRoute(GET, jsonRequest('/api/sospesi?stato=APERTO'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data[0]).toMatchObject({ importo: 1200, importoSaldato: 500, residuo: 700 })
  })

  it('senza sessione risponde 401', async () => {
    await loginAs(null)
    expect((await callRoute(GET, jsonRequest('/api/sospesi'))).status).toBe(401)
  })
})
```

- [ ] **Step 2: eseguirlo e vederlo fallire**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && TEST_DB_SUFFIX=sospesi npx vitest run src/app/api/sospesi/__tests__/sospesi.itest.ts
```

- [ ] **Step 3: scrivere la route con `withAuth`**

```typescript
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { residuoDi } from '@/lib/sospesi/anagrafica'

export const GET = withAuth(async (request, { venueId }) => {
  const stato = new URL(request.url).searchParams.get('stato')
  const crediti = await prisma.suspendedCredit.findMany({
    where: { venueId, ...(stato ? { stato: stato as never } : {}) },
    orderBy: { dataGenerazione: 'desc' },
  })
  return NextResponse.json({
    data: crediti.map((c) => ({
      ...c,
      importo: Number(c.importo),
      importoSaldato: Number(c.importoSaldato),
      residuo: residuoDi({
        importo: Number(c.importo),
        importoSaldato: Number(c.importoSaldato),
        stato: c.stato,
      }),
    })),
  })
}, { roles: ['admin', 'manager'], venueScoped: true })
```

- [ ] **Step 4: generare i sospesi alla creazione della chiusura**

Nello schema Zod della postazione aggiungere `sospesi: z.array(z.object({ descrizione: z.string().min(1).max(200), importo: z.number().positive(), customerId: z.string().cuid().optional() })).optional()`, e nella transazione creare un `SuspendedCredit` per riga, con `closureId`, `stationId`, `dataGenerazione = closure.date`, `stato: 'APERTO'`.

Vincolo da applicare come per gli incassi POS: **la somma dei sospesi dichiarati deve fare `suspendedAmount`** della postazione.

- [ ] **Step 5: test verdi**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && TEST_DB_SUFFIX=sospesi npx vitest run src/app/api/sospesi/
```

- [ ] **Step 6: verificare che il cricchetto sia contento**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && node scripts/check-route-auth.mjs --ratchet
```
Atteso: exit 0. La route nuova usa `withAuth`, quindi il numero non sale.

- [ ] **Step 7: commit**

```bash
git add src/app/api/sospesi/ src/app/api/chiusure/ src/components/chiusura/SospesiCard.tsx
git commit -m "feat(sospesi): i crediti nascono dalla chiusura e hanno un'anagrafica"
```

---

## Task 7 — Il saldo di un sospeso, che entra nella cassa ma non nei ricavi del giorno

**File:**
- Modifica: `src/app/api/chiusure/route.ts` (campo `saldiSospesi` sulla postazione)
- Modifica: `src/lib/closure-calculations.ts` (quadratura del contante)
- Test: `src/app/api/chiusure/__tests__/saldo-sospesi.itest.ts`

**Interfacce consumate:** `applicaSaldo` (Task 2), `SuspendedCredit` (Task 1).

> **Il punto di tutto il piano.** Lunedì il cliente paga il compleanno di sabato: 1200 € entrano nel cassetto. Se la chiusura non li dichiara, il conteggio segnala un'eccedenza di 1200 e il controllo che serve a scoprire gli ammanchi diventa rumore. Se li dichiara come corrispettivo, le statistiche di lunedì contano due volte una vendita di sabato.

- [ ] **Step 1: scrivere il test che fallisce**

```typescript
describe('saldo di un sospeso in chiusura', () => {
  it('entra nel contante ma non nei corrispettivi del giorno', async () => {
    const sospeso = await creaSospeso({ importo: 1200, data: '2026-08-08' }) // sabato

    await validaChiusura({
      data: '2026-08-10', // lunedì
      stazioni: [{
        name: 'Bancone',
        receiptAmount: 500,       // le vendite vere di lunedì
        cashAmount: 1700,         // 500 + i 1200 del sospeso
        saldiSospesi: [{ creditoId: sospeso.id, importo: 1200 }],
      }],
    })

    const chiuso = await prisma.suspendedCredit.findUnique({ where: { id: sospeso.id } })
    expect(chiuso).toMatchObject({ stato: 'SALDATO', importoSaldato: 1200 })
    // Il ricavo contabile del giorno è il denaro entrato: 1700.
    // I corrispettivi restano 500: le statistiche di lunedì non gonfiano.
    const stazione = await prisma.cashStation.findFirst({ where: { name: 'Bancone' } })
    expect(Number(stazione!.receiptAmount)).toBe(500)
  })

  it('un saldo che supera il residuo è rifiutato con 422', async () => {
    const sospeso = await creaSospeso({ importo: 100 })
    const res = await validaChiusuraGrezza({
      stazioni: [{ name: 'Bancone', cashAmount: 500, saldiSospesi: [{ creditoId: sospeso.id, importo: 300 }] }],
    })
    expect(res.status).toBe(422)
  })

  it('un saldo su un credito di un’altra sede è rifiutato', async () => {
    const altrui = await creaSospeso({ importo: 100, venueId: 'altra-sede' })
    const res = await validaChiusuraGrezza({
      stazioni: [{ name: 'Bancone', cashAmount: 100, saldiSospesi: [{ creditoId: altrui.id, importo: 100 }] }],
    })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: eseguirlo e vederlo fallire**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && TEST_DB_SUFFIX=saldi npx vitest run src/app/api/chiusure/__tests__/saldo-sospesi.itest.ts
```

- [ ] **Step 3: implementare, dentro la transazione della chiusura**

Per ogni `saldiSospesi[]` della postazione: caricare il credito **filtrando per `venueId`** (un credito di un'altra sede è `404`), applicare `applicaSaldo`, rispondere `422` con `esito.motivo` se rifiuta, altrimenti aggiornare `stato`, `importoSaldato`, `saldoClosureId`, `dataSaldo`.

- [ ] **Step 4: test verdi, e il gate completo**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && TEST_DB_SUFFIX=saldi npx vitest run src/app/api/chiusure/ && npx tsc --noEmit && npm test -- --run
```

- [ ] **Step 5: commit**

```bash
git add src/app/api/chiusure/ src/lib/closure-calculations.ts
git commit -m "feat(chiusura): il saldo di un sospeso quadra la cassa senza toccare i corrispettivi"
```

---

## Task 8 — Ripartire l'incasso su più conti dall'interfaccia

**File:**
- Crea: `src/components/chiusura/ImputazioneRicavi.tsx`
- Modifica: `src/app/api/chiusure/route.ts` (campo `imputazioni` sulla postazione)
- Modifica: `src/lib/closure-journal-entries.ts` (usa le imputazioni dichiarate invece del solo `10.01`)
- Test: `src/lib/__tests__/closure-journal-entries.test.ts`

- [ ] **Step 1: scrivere il test che fallisce**

```typescript
it('l’incasso si ripartisce sui conti dichiarati in chiusura', async () => {
  conContiDiSistema()
  await generateJournalEntriesFromClosure(
    { ...chiusuraCompleta, stations: [{ ...postazione, imputazioni: [
      { accountId: 'acc-10-01', importo: 600 },
      { accountId: 'acc-11-01', importo: 400 },
    ] }] },
    userId
  )
  const fette = vi.mocked(prisma.journalEntryAllocation.createMany).mock.calls[0][0].data
  expect(fette).toEqual(expect.arrayContaining([
    expect.objectContaining({ accountId: 'acc-10-01', importo: 600 }),
    expect.objectContaining({ accountId: 'acc-11-01', importo: 400 }),
  ]))
})

it('imputazioni che non sommano all’incasso sono rifiutate', async () => {
  await expect(generateJournalEntriesFromClosure(
    { ...chiusuraCompleta, stations: [{ ...postazione, imputazioni: [{ accountId: 'acc-10-01', importo: 300 }] }] },
    userId
  )).rejects.toThrow(/300,00.*1000,00/)
})
```

- [ ] **Step 2: eseguirlo e vederlo fallire, poi implementare**

Se la postazione porta `imputazioni`, usarle al posto della fetta unica su `CORRISPETTIVI`; validare che sommino a `cashAmount + posAmount` della postazione. Se non le porta, resta il comportamento del Task 4.

- [ ] **Step 3: test verdi + commit**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/__tests__/closure-journal-entries.test.ts
git add src/lib/closure-journal-entries.ts src/components/chiusura/ImputazioneRicavi.tsx src/app/api/chiusure/
git commit -m "feat(chiusura): l'incasso di una postazione si ripartisce su più conti"
```

---

## Task 9 — Riconciliazione dell'accredito POS

**File:**
- Crea: `src/app/api/riconciliazione-pos/route.ts`
- Test: `src/app/api/riconciliazione-pos/__tests__/riconciliazione.itest.ts`

**Interfacce consumate:** `leggiCausaleAxerve`, `deduciCommissione` (Task 3); `PosTerminal` (Task 1).

- [ ] **Step 1: scrivere il test che fallisce**

```typescript
describe('POST /api/riconciliazione-pos', () => {
  it('Worldline: accredito lordo, nessuna commissione', async () => {
    const res = await riconcilia({ bankTransactionId: bt.id, importi: [400] })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ commissione: 0 })
  })

  it('Axerve: la commissione si legge dalla causale', async () => {
    const bt = await creaMovimento({ amount: 188.10, description: CAUSALE_AXERVE })
    const json = await (await riconcilia({ bankTransactionId: bt.id, importi: [190] })).json()
    expect(json).toMatchObject({ commissione: 1.9, fonte: 'causale' })
  })

  it('SumUp: la commissione si deduce, dentro la forchetta', async () => {
    const bt = await creaMovimento({ amount: 892.22, description: CAUSALE_SUMUP })
    const json = await (await riconcilia({ bankTransactionId: bt.id, importi: [400, 510] })).json()
    expect(json).toMatchObject({ commissione: 17.78, fonte: 'dedotta' })
  })

  it('SumUp: uno scarto fuori forchetta è rifiutato con 422', async () => {
    const bt = await creaMovimento({ amount: 800, description: CAUSALE_SUMUP })
    const res = await riconcilia({ bankTransactionId: bt.id, importi: [1000] })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('forchetta')
  })
})
```

- [ ] **Step 2: implementare la route con `withAuth`**

`POST` che riceve `{ bankTransactionId, importi: number[] }`, risolve il terminale dal `matchPattern` sulla descrizione del movimento, e a seconda di `modalitaAccredito`:
`LORDO` → commissione 0; `NETTO_DICHIARATO` → `leggiCausaleAxerve(descrizione, amount)`, e se `null` risponde 422; `NETTO_DEDOTTO` → `deduciCommissione(somma(importi), amount)`, e se `!ok` risponde 422 con il motivo.
In transazione: abbina `BankTransaction.matchedEntryId` e, se la commissione è > 0, crea la scrittura di costo sul `feeAccountId` del terminale.

- [ ] **Step 3: test verdi, gate completo, commit**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && TEST_DB_SUFFIX=riconc npx vitest run src/app/api/riconciliazione-pos/ && \
  npx tsc --noEmit && npm run lint && npm test -- --run && node scripts/check-route-auth.mjs --ratchet
git add src/app/api/riconciliazione-pos/
git commit -m "feat(pos): la riconciliazione dell'accredito calcola la commissione per provider"
```

---

## Cosa questo piano NON copre

Dichiarato per non farlo scoprire a metà strada:

- **Il transitorio POS come registro** (fase B della spec): `RegisterType` ammette solo `CASH` e `BANK`, e aggiungere `TRANSITORY` tocca ogni query che assume due registri. Qui la riga POS resta su `BANK` con la data della chiusura, **allocata al conto di ricavo**: il saldo banca anticipa quello reale di uno o due giorni, difetto noto e accettato dal committente.
- **Le API SumUp** (fase C): rendono la commissione un dato certo invece che dedotto. Senza, la forchetta del Task 3 è il presidio.
- **Il budget su base fiscalizzata o incassata**, e il campo «ricavi non attribuiti» che continuerà a dire il falso sul proprio nome finché non si decide.
- **I ricavi non fiscalizzati.**
- **`nonReceiptAmount`**, che dopo il Task 7 si può finalmente correggere: dichiarati i saldi sospesi e le fatture, la formula giusta è `(cash + pos) − receipt − invoice − saldiSospesi + spesePagateInContanti`.

---

## Come ripartire da una sessione nuova

Il prompt qui sotto è autosufficiente: non serve il contesto della sessione in cui il piano è
nato.

```
Esegui il piano docs/superpowers/plans/2026-08-11-ricavi-sospesi-pos-fase-a.md, un task
alla volta, fermandoti dopo ciascuno per mostrarmi cosa hai fatto prima di passare al
successivo.

Contesto che non è nel piano:
- Branch `conti/piano-v4`, allineato a `main` e pushato. NON mergiare in main senza
  chiedermelo: il push su main fa partire il deploy Railway.
- Il piano dei conti v4 è GIÀ IN PRODUZIONE dall'11 agosto 2026: 155 voci, 4 centri di
  costo, i conti di sistema con le loro systemKey (CASSA, BANCA, DEBITI_FORNITORI,
  CORRISPETTIVI su 10.01, e i tre transitori POS_WORLDLINE/AXERVE/SUMUP su 120/121/122).
  Il task 4 può contare sul conto CORRISPETTIVI, che esiste davvero.
- La spec che il piano implementa è docs/superpowers/specs/2026-08-10-ricavi-sospesi-pos-design.md:
  leggila prima del task 1, contiene le sette scritture caso per caso e il perché delle
  decisioni.

Regole non negoziabili (le trovi anche in testa al piano):
- `source ~/.nvm/nvm.sh && nvm use 22 &&` davanti a ogni comando npm/npx/node.
- Il `.env` punta alla PRODUZIONE: mai eseguire niente contro quel DATABASE_URL.
  L'ambiente isolato è 127.0.0.1:5433, psql in /opt/homebrew/opt/postgresql@16/bin.
- Ogni route nuova usa `withAuth`: `node scripts/check-route-auth.mjs --ratchet` gira in
  CI e fallisce se il conto sale.
- Test di integrazione sempre con TEST_DB_SUFFIX=<nome>.
- Prima di ogni commit: npx tsc --noEmit, npm run lint, npm test -- --run.

Metodo: il test si scrive PRIMA, si esegue e si guarda fallire, poi si implementa. Quando
un test passa al primo colpo, rompilo di proposito per verificare che stesse guardando la
cosa giusta.
```
