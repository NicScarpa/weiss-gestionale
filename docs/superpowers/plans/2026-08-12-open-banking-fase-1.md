# Open Banking GoCardless — Fase 1: modello dati, client, mapper, deduplicazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettere a terra le fondamenta perché i movimenti di Banca della Marca possano entrare nel gestionale senza perderne nessuno — tabelle, client HTTP, mapper e deduplicazione per conto — senza ancora accendere nessuna sincronizzazione.

**Architecture:** Tre pezzi indipendenti che si incontrano solo alla fine. Un modulo `src/lib/gocardless/` puro (tipi validati con zod, mapper, client HTTP su `fetch`) che non conosce Prisma e si testa senza database; una migrazione con DDL esplicito che aggiunge due tabelle e le colonne mancanti; una funzione di deduplicazione **per conto**, che è la ragione per cui questa fase esiste. La sonda della Fase 0 (`scripts/gocardless-probe.ts`) resta l'unico modo di parlare con l'API vera: in Fase 1 nessun codice applicativo effettua chiamate di rete.

**Tech Stack:** TypeScript, Next.js 15, Prisma + PostgreSQL (Supabase), zod 4, vitest (unit + integration), `fetch` nativo di Node 22. Nessun SDK GoCardless — non esiste un client ufficiale mantenuto.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md`
**Referto della Fase 0:** `docs/gocardless-referto-2026-08-12.md`

---

## Global Constraints

- **Node 22 obbligatorio.** Anteporre `nvm use 22 &&` a ogni `npm`/`npx`/`node`, nella stessa riga di shell. Il Node di sistema è la v25 e `.npmrc` ha `engine-strict=true`: fallisce con `EBADENGINE`.
- **Il repository è pubblico** (`github.com/NicScarpa/weiss-gestionale`). Nessun file tracciato può contenere IBAN, saldi, causali reali, nomi di fornitori o di dipendenti. Le fixture di questa fase sono **scritte a mano**: vedi *Decisione presa* qui sotto.
- **Il database Supabase è condiviso con la produzione.** Mai `prisma db push`. Le migrazioni si scrivono a mano come DDL esplicito e si applicano in locale con `npm run db:migrate` (protetto da `npm run guard:not-prod`). Il rilascio in produzione è un passo separato e successivo a questo piano, e si fa con `npm run db:migrate:deploy`, **non** con `prisma migrate deploy` nudo: lo script incatena `npm run rls:enable`, e senza quello ogni tabella nuova nasce senza Row Level Security.
- **I tre requisiti non negoziabili della spec** valgono per ogni task: l'interruttore per conto (`syncEnabled`, default `false`), la chiave di deduplicazione `(bankAccountId, providerTransactionId)`, e il divieto per qualunque automatismo di sovrascrivere una decisione dell'operatore.
- **Nomi e commenti in italiano**, come il resto del progetto. I nomi dei campi Prisma restano in camelCase inglese dove lo schema è già così (`bankAccountId`), il codice nuovo è in italiano (`mappaMovimento`, `filtraGiaPresenti`).
- **TDD**: prima il test che fallisce, poi l'implementazione minima. Un commit per task.
- **Nessuna chiamata di rete vera** in questa fase. Il client si testa con un `fetch` finto.

### Decisione presa: le fixture sono scritte a mano

La spec lasciava aperte tre strade (fixture a mano, fixture sintetizzate dai dati veri, fixture reali fuori dal repository). Questo piano sceglie la prima: **le fixture imitano la forma osservata senza copiare nulla di reale**. La forma è documentata e non è un segreto — nove campi, `transactionId` in formato `YYYYMMDD-N`, causale con separatore `*`, `proprietaryBankTransactionCode` in formato `NN//NN` — mentre i valori sono inventati. Costa mezz'ora in più e rende i test riproducibili in CI da chiunque, senza che nessun dato di WEISS esca dal disco di chi lavora.

I payload veri restano in `scripts/gocardless/snapshots/`, non versionati, e servono da riscontro quando una fixture sembra irrealistica.

---

## File Structure

**Nuovi**

| File | Responsabilità |
|---|---|
| `src/lib/gocardless/types.ts` | Schemi zod del payload dell'API e tipi TypeScript derivati. È l'unico punto che descrive cosa manda la banca. |
| `src/lib/gocardless/mapper.ts` | Traduce un movimento GoCardless nei campi di `BankTransaction`. Puro: nessun accesso al database, nessuna rete. |
| `src/lib/gocardless/client.ts` | Client HTTP: token con cache, backoff sui 5xx, errore tipizzato sul 429, cattura degli header di rate limit. |
| `src/lib/gocardless/errori.ts` | Le due eccezioni tipizzate che il client lancia. |
| `src/lib/gocardless/dedup.ts` | `filtraGiaPresenti`: separa i movimenti nuovi da quelli già in archivio, **per conto**. Unico punto che tocca Prisma. |
| `src/lib/gocardless/__tests__/fixtures/*.json` | Payload finti che imitano la forma vera. |
| `src/lib/gocardless/__tests__/*.test.ts` | Unit test di tipi, mapper e client. |
| `src/lib/gocardless/__tests__/dedup.itest.ts` | Test d'integrazione della deduplicazione, su PostgreSQL vero. |
| `prisma/migrations/20260812120000_open_banking_fase_1/migration.sql` | DDL esplicito: due tabelle, sei colonne, un valore d'enum, un indice unico parziale, un backfill condizionale. |

**Modificati**

| File | Modifica |
|---|---|
| `prisma/schema.prisma` | Modelli `BankConnection` e `BankSyncRun`; colonne su `BankAccount`, `BankTransaction` e `Venue`; valore `PSD2_GOCARDLESS` nell'enum `ImportSource`. |
| `prisma/sql/constraints.sql:172` | La dichiarazione canonica del nuovo indice unico parziale. **Obbligatoria**: vedi la nota qui sotto. |
| `src/types/reconciliation.ts:3` | Aggiunge `'PSD2_GOCARDLESS'` all'unione di tipi. |
| `src/lib/validations/reconciliation.ts:9` | Aggiunge `'PSD2_GOCARDLESS'` all'enum zod. |
| `src/components/reconciliation/TransactionDetailsDialog.tsx:53` | Aggiunge l'etichetta leggibile. |

**Fuori dal perimetro di questa fase** (per non farne un piano infinito): l'estrazione della controparte dalla causale verso `counterpartName` e la mappa `codice banca → conto` sono **Fase 4**; il wizard di collegamento e il pannello con l'interruttore sono **Fase 2**; il cron di sincronizzazione è **Fase 3**. Qui si costruisce ciò che quelle fasi useranno, e non si accende niente.

**Nota su un'istruzione della spec ormai superata**: la spec chiedeva di aggiungere `counterpartIban` a `SENSITIVE_FIELDS` in `src/lib/prisma-encryption.ts`. Non serve: Banca della Marca non manda `creditorAccount`/`debtorAccount`, quindi nessun IBAN di controparte entra nel sistema. `src/lib/prisma-encryption.ts` **non va toccato**.

### Gli indici parziali vanno scritti in due posti, non uno

Prisma non sa rappresentare un indice `UNIQUE ... WHERE`, quindi in questo progetto gli indici parziali vivono in `prisma/sql/constraints.sql` (l'indice storico `ux_bank_transactions_sede_riferimento` è lì, alla riga 172). Quel file non è documentazione: è eseguito da `src/test/integration/global-setup.ts:144` sul database di prova, che viene costruito con `prisma db push` e quindi **non vede le migrazioni**.

Conseguenza pratica: lo stesso `CREATE UNIQUE INDEX` va scritto **due volte**, e non è una svista.

- nel `migration.sql`, perché è così che arriva ai database veri (locale e produzione);
- in `prisma/sql/constraints.sql`, perché è così che arriva al database dei test.

Se si scrive solo nella migrazione, il test d'integrazione della Task 5 che verifica il rifiuto del duplicato **passa in verde senza che nessun vincolo esista**, ed è il modo più efficace di credersi protetti senza esserlo.

---

## Task 1: Tipi e fixture del payload

Il fondamento di tutto: una descrizione validata di cosa manda la banca, e dei payload finti su cui far girare i test delle prossime tre task. Le fixture contengono di proposito **due movimenti con lo stesso `transactionId` su conti diversi**, perché quello è il difetto che questa fase esiste per prevenire: se la fixture non lo contiene, il test della Task 5 non può dimostrare niente.

**Files:**
- Create: `src/lib/gocardless/types.ts`
- Create: `src/lib/gocardless/__tests__/fixtures/movimenti-conto-a.json`
- Create: `src/lib/gocardless/__tests__/fixtures/movimenti-conto-b.json`
- Create: `src/lib/gocardless/__tests__/fixtures/dettagli-conto.json`
- Create: `src/lib/gocardless/__tests__/fixtures/saldi-conto.json`
- Test: `src/lib/gocardless/__tests__/types.test.ts`

**Interfaces:**
- Consumes: niente (è la prima task)
- Produces: `movimentoSchema`, `rispostaMovimentiSchema`, `rispostaSaldiSchema`, `rispostaDettagliSchema` (schemi zod); tipi `Movimento`, `RispostaMovimenti`, `RispostaSaldi`, `RispostaDettagli`

- [ ] **Step 1: Scrivi le fixture**

`src/lib/gocardless/__tests__/fixtures/movimenti-conto-a.json` — sei movimenti che coprono le forme osservate: bonifico in entrata con separatore `*`, commissione senza separatore, addebito SEPA, stipendio, F24, giroconto.

```json
{
  "transactions": {
    "booked": [
      {
        "transactionId": "20260810-1",
        "entryReference": "20260810-1",
        "endToEndId": "20260810-1",
        "bookingDate": "2026-08-10",
        "valueDate": "2026-08-10",
        "transactionAmount": { "amount": "1250.00", "currency": "EUR" },
        "remittanceInformationUnstructured": "Bonifico a vs favore *ACME PAGAMENTI SPA REF0000000111-2026 099887766 OP DEL. 10082026",
        "proprietaryBankTransactionCode": "48//00",
        "internalTransactionId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"
      },
      {
        "transactionId": "20260810-2",
        "entryReference": "20260810-2",
        "endToEndId": "20260810-2",
        "bookingDate": "2026-08-10",
        "valueDate": "2026-08-10",
        "transactionAmount": { "amount": "-0.75", "currency": "EUR" },
        "remittanceInformationUnstructured": "Commissioni su bonifico tramite in",
        "proprietaryBankTransactionCode": "16//37",
        "internalTransactionId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2"
      },
      {
        "transactionId": "20260809-1",
        "entryReference": "20260809-1",
        "endToEndId": "20260809-1",
        "bookingDate": "2026-08-09",
        "valueDate": "2026-08-11",
        "transactionAmount": { "amount": "-430.50", "currency": "EUR" },
        "remittanceInformationUnstructured": "SDD Core - Richiesta Incasso SEPA saldo fattura luglio FORNITORE FINTO SRL 004321",
        "proprietaryBankTransactionCode": "31//22",
        "internalTransactionId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3"
      },
      {
        "transactionId": "20260807-4",
        "entryReference": "20260807-4",
        "endToEndId": "20260807-4",
        "bookingDate": "2026-08-07",
        "valueDate": "2026-08-07",
        "transactionAmount": { "amount": "-1800.00", "currency": "EUR" },
        "remittanceInformationUnstructured": "Disposizione per emolumenti intern *NOME FINTO STIPENDIO MESE LUGLIO 202ID.BON:0000000000000000000000000000LT",
        "proprietaryBankTransactionCode": "39//11",
        "internalTransactionId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa4"
      },
      {
        "transactionId": "20260806-2",
        "entryReference": "20260806-2",
        "endToEndId": "20260806-2",
        "bookingDate": "2026-08-06",
        "valueDate": "2026-08-06",
        "transactionAmount": { "amount": "-2140.19", "currency": "EUR" },
        "remittanceInformationUnstructured": "Imposte e tasse:Delega Unificata(p C.ATT:00000000000/99",
        "proprietaryBankTransactionCode": "19//83",
        "internalTransactionId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5"
      },
      {
        "transactionId": "20260805-9",
        "entryReference": "20260805-9",
        "endToEndId": "20260805-9",
        "bookingDate": "2026-08-05",
        "valueDate": "2026-08-05",
        "transactionAmount": { "amount": "500.00", "currency": "EUR" },
        "remittanceInformationUnstructured": "Giro conto *DITTA FINTA SRL Giroconto interno",
        "proprietaryBankTransactionCode": "34//00",
        "internalTransactionId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa6"
      }
    ],
    "pending": []
  }
}
```

`src/lib/gocardless/__tests__/fixtures/movimenti-conto-b.json` — **due movimenti che riusano gli stessi `transactionId` del conto A** con importi e causali diversi. È la collisione vera, riprodotta.

```json
{
  "transactions": {
    "booked": [
      {
        "transactionId": "20260810-1",
        "entryReference": "20260810-1",
        "endToEndId": "20260810-1",
        "bookingDate": "2026-08-10",
        "valueDate": "2026-08-10",
        "transactionAmount": { "amount": "-0.30", "currency": "EUR" },
        "remittanceInformationUnstructured": "Commissioni su bonifico tramite in",
        "proprietaryBankTransactionCode": "16//37",
        "internalTransactionId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1"
      },
      {
        "transactionId": "20260810-2",
        "entryReference": "20260810-2",
        "endToEndId": "20260810-2",
        "bookingDate": "2026-08-10",
        "valueDate": "2026-08-10",
        "transactionAmount": { "amount": "-9.90", "currency": "EUR" },
        "remittanceInformationUnstructured": "Canone mensile tenuta conto",
        "proprietaryBankTransactionCode": "16//22",
        "internalTransactionId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2"
      }
    ],
    "pending": []
  }
}
```

`src/lib/gocardless/__tests__/fixtures/dettagli-conto.json`:

```json
{
  "account": {
    "resourceId": "0000000000",
    "iban": "IT00X0000000000000000000000",
    "currency": "EUR",
    "product": "Conto corrente",
    "cashAccountType": "CACC"
  }
}
```

`src/lib/gocardless/__tests__/fixtures/saldi-conto.json`:

```json
{
  "balances": [
    { "balanceAmount": { "amount": "1234.56", "currency": "EUR" }, "balanceType": "closingBooked", "referenceDate": "2026-08-11" },
    { "balanceAmount": { "amount": "1234.56", "currency": "EUR" }, "balanceType": "interimAvailable", "referenceDate": "2026-08-11" }
  ]
}
```

- [ ] **Step 2: Scrivi il test che fallisce**

`src/lib/gocardless/__tests__/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  movimentoSchema,
  rispostaMovimentiSchema,
  rispostaSaldiSchema,
  rispostaDettagliSchema,
} from '../types'
import contoA from './fixtures/movimenti-conto-a.json'
import contoB from './fixtures/movimenti-conto-b.json'
import dettagli from './fixtures/dettagli-conto.json'
import saldi from './fixtures/saldi-conto.json'

describe('schemi del payload GoCardless', () => {
  it('accetta i movimenti di entrambe le fixture', () => {
    expect(rispostaMovimentiSchema.parse(contoA).transactions.booked).toHaveLength(6)
    expect(rispostaMovimentiSchema.parse(contoB).transactions.booked).toHaveLength(2)
  })

  it('accetta dettagli e saldi', () => {
    expect(rispostaDettagliSchema.parse(dettagli).account.currency).toBe('EUR')
    expect(rispostaSaldiSchema.parse(saldi).balances).toHaveLength(2)
  })

  it('tratta pending come facoltativo, perché la banca non lo manda sempre', () => {
    const esito = rispostaMovimentiSchema.parse({
      transactions: { booked: [] },
    })
    expect(esito.transactions.pending).toEqual([])
  })

  // Banca della Marca non manda la controparte: lo schema la dichiara
  // facoltativa perché un'altra banca potrebbe mandarla, ma nessun codice a
  // valle può darla per presente.
  it('accetta un movimento senza controparte', () => {
    const m = movimentoSchema.parse(contoA.transactions.booked[0])
    expect(m.creditorName).toBeUndefined()
    expect(m.debtorName).toBeUndefined()
  })

  it('rifiuta un movimento senza transactionId', () => {
    const rotto = { ...contoA.transactions.booked[0], transactionId: undefined }
    expect(movimentoSchema.safeParse(rotto).success).toBe(false)
  })

  it("rifiuta un importo numerico: l'API lo manda come stringa e un float qui perderebbe centesimi", () => {
    const rotto = {
      ...contoA.transactions.booked[0],
      transactionAmount: { amount: 1250.0, currency: 'EUR' },
    }
    expect(movimentoSchema.safeParse(rotto).success).toBe(false)
  })
})
```

- [ ] **Step 3: Lancia il test e verifica che fallisca**

```bash
nvm use 22 && npx vitest run src/lib/gocardless/__tests__/types.test.ts
```

Atteso: FAIL con `Failed to resolve import "../types"`.

- [ ] **Step 4: Scrivi l'implementazione minima**

`src/lib/gocardless/types.ts`:

```ts
/**
 * Cosa manda davvero GoCardless per Banca della Marca.
 *
 * Misurato sul campo il 12 agosto 2026 (referto in
 * `docs/gocardless-referto-2026-08-12.md`): dei campi previsti dallo standard
 * ne arrivano **nove**, e la controparte non è fra questi. `creditorName`,
 * `debtorName`, `creditorAccount` e `debtorAccount` sono dichiarati qui come
 * facoltativi perché un altro istituto potrebbe mandarli, ma nessun codice a
 * valle può darli per presenti: il nome della controparte, per questa banca,
 * vive dentro `remittanceInformationUnstructured`.
 */
import { z } from 'zod'

/**
 * L'importo arriva come **stringa** e come stringa deve restare fino a
 * PostgreSQL, che ha una colonna `Decimal(12,2)`. Passare da `number`
 * introdurrebbe un binario a virgola mobile fra due rappresentazioni decimali
 * esatte, ed è così che si perdono i centesimi.
 */
export const importoSchema = z.object({
  amount: z.string(),
  currency: z.string(),
})

export const movimentoSchema = z.object({
  transactionId: z.string(),
  internalTransactionId: z.string().optional(),
  entryReference: z.string().optional(),
  endToEndId: z.string().optional(),
  bookingDate: z.string(),
  valueDate: z.string().optional(),
  transactionAmount: importoSchema,
  remittanceInformationUnstructured: z.string().optional(),
  remittanceInformationUnstructuredArray: z.array(z.string()).optional(),
  proprietaryBankTransactionCode: z.string().optional(),
  bankTransactionCode: z.string().optional(),
  creditorName: z.string().optional(),
  debtorName: z.string().optional(),
})

export const rispostaMovimentiSchema = z.object({
  transactions: z.object({
    booked: z.array(movimentoSchema),
    // La banca non manda `pending`. Il default evita un ramo `?? []` in ogni
    // punto che li legge.
    pending: z.array(movimentoSchema).default([]),
  }),
})

export const saldoSchema = z.object({
  balanceAmount: importoSchema,
  balanceType: z.string(),
  referenceDate: z.string().optional(),
})

export const rispostaSaldiSchema = z.object({
  balances: z.array(saldoSchema),
})

export const rispostaDettagliSchema = z.object({
  account: z.object({
    resourceId: z.string().optional(),
    iban: z.string().optional(),
    currency: z.string().optional(),
    ownerName: z.string().optional(),
    product: z.string().optional(),
    cashAccountType: z.string().optional(),
    bic: z.string().optional(),
  }),
})

export const istituzioneSchema = z.object({
  id: z.string(),
  name: z.string(),
  bic: z.string().optional(),
  transaction_total_days: z.union([z.string(), z.number()]).optional(),
  max_access_valid_for_days: z.union([z.string(), z.number()]).optional(),
})

export type Movimento = z.infer<typeof movimentoSchema>
export type RispostaMovimenti = z.infer<typeof rispostaMovimentiSchema>
export type RispostaSaldi = z.infer<typeof rispostaSaldiSchema>
export type RispostaDettagli = z.infer<typeof rispostaDettagliSchema>
export type Istituzione = z.infer<typeof istituzioneSchema>
```

- [ ] **Step 5: Lancia il test e verifica che passi**

```bash
nvm use 22 && npx vitest run src/lib/gocardless/__tests__/types.test.ts
```

Atteso: 6 test PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gocardless/types.ts src/lib/gocardless/__tests__/
git commit -m "feat(open-banking): schemi del payload GoCardless e fixture scritte a mano"
```

---

## Task 2: Il mapper

Traduce un movimento GoCardless nei campi di `BankTransaction`. È puro — nessun database, nessuna rete — quindi si testa in millisecondi e regge il peso di tutte le decisioni sottili: dove finisce ciascun campo, cosa si fa quando la causale supera i 500 caratteri della colonna, e perché `bankReference` resta vuoto.

**Files:**
- Create: `src/lib/gocardless/mapper.ts`
- Test: `src/lib/gocardless/__tests__/mapper.test.ts`

**Interfaces:**
- Consumes: `Movimento`, `RispostaMovimenti` da `../types` (Task 1)
- Produces:
  - `interface MovimentoDaSalvare { providerTransactionId: string; transactionDate: Date; valueDate: Date | null; description: string; amount: string; bankTransactionCode: string | null }`
  - `function mappaMovimento(grezzo: Movimento): MovimentoDaSalvare`
  - `function mappaMovimenti(risposta: RispostaMovimenti): MovimentoDaSalvare[]`
  - `const LUNGHEZZA_MASSIMA_CAUSALE = 500`

- [ ] **Step 1: Scrivi il test che fallisce**

`src/lib/gocardless/__tests__/mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mappaMovimento, mappaMovimenti, LUNGHEZZA_MASSIMA_CAUSALE } from '../mapper'
import { rispostaMovimentiSchema, movimentoSchema } from '../types'
import contoA from './fixtures/movimenti-conto-a.json'

const primo = movimentoSchema.parse(contoA.transactions.booked[0])

describe('mappaMovimento', () => {
  it("porta bookingDate su transactionDate, che è la data usata dalla prima nota", () => {
    expect(mappaMovimento(primo).transactionDate).toEqual(new Date('2026-08-10T00:00:00.000Z'))
  })

  it('tiene valueDate separata, anche quando differisce', () => {
    const conValuta = movimentoSchema.parse(contoA.transactions.booked[2])
    const m = mappaMovimento(conValuta)
    expect(m.transactionDate).toEqual(new Date('2026-08-09T00:00:00.000Z'))
    expect(m.valueDate).toEqual(new Date('2026-08-11T00:00:00.000Z'))
  })

  it('mette valueDate a null quando la banca non la manda', () => {
    const senza = movimentoSchema.parse({ ...contoA.transactions.booked[0], valueDate: undefined })
    expect(mappaMovimento(senza).valueDate).toBeNull()
  })

  it("conserva l'importo come stringa, segno compreso", () => {
    expect(mappaMovimento(primo).amount).toBe('1250.00')
    const uscita = movimentoSchema.parse(contoA.transactions.booked[1])
    expect(mappaMovimento(uscita).amount).toBe('-0.75')
  })

  it('porta il codice proprietario della banca in bankTransactionCode', () => {
    expect(mappaMovimento(primo).bankTransactionCode).toBe('48//00')
  })

  it('usa transactionId come providerTransactionId', () => {
    expect(mappaMovimento(primo).providerTransactionId).toBe('20260810-1')
  })

  it('usa la causale come descrizione', () => {
    expect(mappaMovimento(primo).description).toContain('Bonifico a vs favore')
  })

  it("ricompone la causale dall'array quando il campo singolo manca", () => {
    const daArray = movimentoSchema.parse({
      ...contoA.transactions.booked[0],
      remittanceInformationUnstructured: undefined,
      remittanceInformationUnstructuredArray: ['Prima parte', 'seconda parte'],
    })
    expect(mappaMovimento(daArray).description).toBe('Prima parte seconda parte')
  })

  it('non lascia mai la descrizione vuota: la colonna a database è NOT NULL', () => {
    const muto = movimentoSchema.parse({
      ...contoA.transactions.booked[0],
      remittanceInformationUnstructured: undefined,
    })
    expect(mappaMovimento(muto).description).toBe('(movimento senza causale)')
  })

  it('tronca una causale più lunga della colonna invece di far esplodere la INSERT', () => {
    const lunga = movimentoSchema.parse({
      ...contoA.transactions.booked[0],
      remittanceInformationUnstructured: 'X'.repeat(700),
    })
    const d = mappaMovimento(lunga).description
    expect(d).toHaveLength(LUNGHEZZA_MASSIMA_CAUSALE)
    expect(d.endsWith('…')).toBe(true)
  })
})

describe('mappaMovimenti', () => {
  it('mappa contabilizzati e in sospeso insieme', () => {
    const risposta = rispostaMovimentiSchema.parse(contoA)
    expect(mappaMovimenti(risposta)).toHaveLength(6)
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
nvm use 22 && npx vitest run src/lib/gocardless/__tests__/mapper.test.ts
```

Atteso: FAIL con `Failed to resolve import "../mapper"`.

- [ ] **Step 3: Scrivi l'implementazione minima**

`src/lib/gocardless/mapper.ts`:

```ts
/**
 * Da movimento GoCardless a riga di `bank_transactions`.
 *
 * Puro di proposito: niente Prisma, niente rete, niente data corrente. Tutte
 * le decisioni discutibili di questa integrazione passano di qui, e qui si
 * possono verificare in millisecondi.
 */
import type { Movimento, RispostaMovimenti } from './types'

/** `BankTransaction.description` è `VarChar(500)`. */
export const LUNGHEZZA_MASSIMA_CAUSALE = 500

export interface MovimentoDaSalvare {
  /**
   * L'identificativo della banca. **Non** finisce in `bankReference`: quel
   * campo ha un indice unico su `(venue_id, bank_reference)` che non contiene
   * il conto, e l'identificativo di GoCardless è un contatore per giorno *e
   * per conto* — `20260810-6` esiste su ogni conto. Scriverlo lì farebbe
   * scartare come duplicati dei movimenti veri. Vedi il difetto 2 della spec.
   */
  providerTransactionId: string
  transactionDate: Date
  valueDate: Date | null
  description: string
  /** Stringa fino a PostgreSQL: vedi la nota su `importoSchema`. */
  amount: string
  bankTransactionCode: string | null
}

/**
 * `2026-08-10` → mezzanotte UTC.
 *
 * La colonna è `@db.Date`, senza fuso: costruire la data con il costruttore
 * locale la sposterebbe di un giorno per chi lavora a est di Greenwich, che
 * è esattamente il nostro caso da fine marzo a fine ottobre.
 */
function dataDaGiorno(giorno: string): Date {
  return new Date(`${giorno}T00:00:00.000Z`)
}

function causale(m: Movimento): string {
  const testo =
    m.remittanceInformationUnstructured?.trim() ||
    m.remittanceInformationUnstructuredArray?.join(' ').trim() ||
    ''

  if (testo === '') return '(movimento senza causale)'
  if (testo.length <= LUNGHEZZA_MASSIMA_CAUSALE) return testo
  // Troncare è meglio che far fallire l'inserimento dell'intero blocco, ma il
  // taglio deve restare visibile: una causale che finisce a metà senza dirlo
  // sembra un dato della banca, e qualcuno ci costruirebbe sopra una regola.
  return testo.slice(0, LUNGHEZZA_MASSIMA_CAUSALE - 1) + '…'
}

export function mappaMovimento(grezzo: Movimento): MovimentoDaSalvare {
  return {
    providerTransactionId: grezzo.transactionId,
    transactionDate: dataDaGiorno(grezzo.bookingDate),
    valueDate: grezzo.valueDate ? dataDaGiorno(grezzo.valueDate) : null,
    description: causale(grezzo),
    amount: grezzo.transactionAmount.amount,
    bankTransactionCode: grezzo.proprietaryBankTransactionCode ?? null,
  }
}

export function mappaMovimenti(risposta: RispostaMovimenti): MovimentoDaSalvare[] {
  return [...risposta.transactions.booked, ...risposta.transactions.pending].map(mappaMovimento)
}
```

- [ ] **Step 4: Lancia il test e verifica che passi**

```bash
nvm use 22 && npx vitest run src/lib/gocardless/__tests__/mapper.test.ts
```

Atteso: 11 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gocardless/mapper.ts src/lib/gocardless/__tests__/mapper.test.ts
git commit -m "feat(open-banking): mapper dal payload GoCardless a bank_transactions"
```

---

## Task 3: Il client HTTP

Il wrapper su `fetch` con token, backoff e gestione del 429. Nel repository non esiste nulla del genere e **non esiste nemmeno un mock di `fetch` nei test**: questa task ne introduce uno, e va scritto in modo che le prossime possano riusarlo.

La regola sui tentativi è la parte che conta: sui 5xx e sugli errori di rete si riprova con attesa crescente, sul **429 non si riprova mai**. Il limite di Banca della Marca è di 4 chiamate al giorno per conto e per endpoint: un ritentativo automatico non aspetterebbe mai abbastanza e brucerebbe le chiamate rimaste per niente.

**Files:**
- Create: `src/lib/gocardless/errori.ts`
- Create: `src/lib/gocardless/client.ts`
- Test: `src/lib/gocardless/__tests__/client.test.ts`

**Interfaces:**
- Consumes: gli schemi zod di `../types` (Task 1)
- Produces:
  - `class ErroreGoCardless extends Error { readonly stato: number; readonly corpo: unknown }`
  - `class LimiteRaggiunto extends ErroreGoCardless { readonly secondiAllaRipresa: number | null }`
  - `interface Limiti { restanti: number | null; ripresaFraSecondi: number | null }`
  - `interface Risposta<T> { dati: T; limiti: Limiti }`
  - `interface OpzioniClient { secretId: string; secretKey: string; fetchImpl?: typeof fetch; attesa?: (ms: number) => Promise<void> }`
  - `function creaClient(o: OpzioniClient)` che espone `istituzioni(paese)`, `dettagliConto(id)`, `saldiConto(id)`, `movimentiConto(id, filtro?)`

- [ ] **Step 1: Scrivi gli errori tipizzati**

`src/lib/gocardless/errori.ts`:

```ts
/**
 * Le due eccezioni del client.
 *
 * `LimiteRaggiunto` è separata perché chi chiama deve poterla distinguere
 * senza leggere un codice numerico: un 429 dalla banca non è un errore
 * transitorio da ritentare, è un «ripassa domani», e va registrato come tale
 * in `bank_sync_runs` invece di finire nel calderone dei fallimenti.
 */
export class ErroreGoCardless extends Error {
  constructor(
    message: string,
    readonly stato: number,
    readonly corpo: unknown
  ) {
    super(message)
    this.name = 'ErroreGoCardless'
  }
}

export class LimiteRaggiunto extends ErroreGoCardless {
  constructor(
    message: string,
    corpo: unknown,
    readonly secondiAllaRipresa: number | null
  ) {
    super(message, 429, corpo)
    this.name = 'LimiteRaggiunto'
  }
}
```

- [ ] **Step 2: Scrivi il test che fallisce**

`src/lib/gocardless/__tests__/client.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { creaClient } from '../client'
import { ErroreGoCardless, LimiteRaggiunto } from '../errori'
import contoA from './fixtures/movimenti-conto-a.json'
import saldi from './fixtures/saldi-conto.json'

/** Risposta finta con corpo JSON e header a piacere. */
function risposta(corpo: unknown, stato = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status: stato, headers })
}

const TOKEN = { access: 'finto-access', access_expires: 86400, refresh: 'finto-refresh', refresh_expires: 2592000 }

/** Un `fetch` finto che risponde in sequenza e registra le chiamate. */
function fetchFinto(...risposte: Response[]) {
  const chiamate: { url: string; init?: RequestInit }[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chiamate.push({ url: String(url), init })
    const prossima = risposte.shift()
    if (!prossima) throw new Error('fetch finto: chiamate più del previsto')
    return prossima
  })
  return { impl: impl as unknown as typeof fetch, chiamate }
}

const CREDENZIALI = { secretId: 'id-finto', secretKey: 'chiave-finta' }
const senzaAttesa = async () => {}

describe('client GoCardless', () => {
  it('chiede il token una volta sola e lo riusa per le chiamate successive', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta(TOKEN),
      risposta(saldi),
      risposta(saldi)
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    await c.saldiConto('conto-1')
    await c.saldiConto('conto-1')

    expect(chiamate).toHaveLength(3)
    expect(chiamate[0].url).toContain('/token/new/')
    expect(chiamate[1].url).toContain('/accounts/conto-1/balances/')
    expect(chiamate[2].url).toContain('/accounts/conto-1/balances/')
  })

  it('manda il token come Bearer e non manda mai le credenziali oltre il token', async () => {
    const { impl, chiamate } = fetchFinto(risposta(TOKEN), risposta(saldi))
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    await c.saldiConto('conto-1')

    const intestazioni = chiamate[1].init?.headers as Record<string, string>
    expect(intestazioni.authorization).toBe('Bearer finto-access')
    expect(JSON.stringify(chiamate[1])).not.toContain('chiave-finta')
  })

  it('valida la risposta con lo schema e restituisce i dati tipizzati', async () => {
    const { impl } = fetchFinto(risposta(TOKEN), risposta(contoA))
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const esito = await c.movimentiConto('conto-1')

    expect(esito.dati.transactions.booked).toHaveLength(6)
  })

  it('estrae i limiti dagli header, che sono la fonte di verità sul contingente', async () => {
    const { impl } = fetchFinto(
      risposta(TOKEN),
      risposta(contoA, 200, {
        'http_x_ratelimit_account_success_remaining': '2',
        'http_x_ratelimit_account_success_reset': '86395',
      })
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const esito = await c.movimentiConto('conto-1')

    expect(esito.limiti.restanti).toBe(2)
    expect(esito.limiti.ripresaFraSecondi).toBe(86395)
  })

  it('riprova due volte su un 503 e poi riesce', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta(TOKEN),
      risposta({ detail: 'guasto' }, 503),
      risposta({ detail: 'guasto' }, 503),
      risposta(saldi)
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const esito = await c.saldiConto('conto-1')

    expect(esito.dati.balances).toHaveLength(2)
    expect(chiamate).toHaveLength(4)
  })

  it('si arrende dopo i tentativi previsti e lancia ErroreGoCardless', async () => {
    const { impl } = fetchFinto(
      risposta(TOKEN),
      risposta({ detail: 'guasto' }, 503),
      risposta({ detail: 'guasto' }, 503),
      risposta({ detail: 'guasto' }, 503)
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    await expect(c.saldiConto('conto-1')).rejects.toBeInstanceOf(ErroreGoCardless)
  })

  // Il limite della banca è giornaliero: ritentare non lo sblocca e consuma
  // le chiamate che restano.
  it('NON riprova su un 429 e lancia LimiteRaggiunto con i secondi alla ripresa', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta(TOKEN),
      risposta({ detail: 'limite giornaliero' }, 429, {
        'http_x_ratelimit_account_success_reset': '3600',
      })
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const errore = await c.movimentiConto('conto-1').catch((e) => e)

    expect(errore).toBeInstanceOf(LimiteRaggiunto)
    expect(errore.secondiAllaRipresa).toBe(3600)
    expect(chiamate).toHaveLength(2)
  })

  it('non riprova su un 400: una richiesta sbagliata resta sbagliata', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta(TOKEN),
      risposta({ detail: 'conto inesistente' }, 400)
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    await expect(c.saldiConto('conto-1')).rejects.toBeInstanceOf(ErroreGoCardless)
    expect(chiamate).toHaveLength(2)
  })

  it('passa date_from e date_to quando richiesti', async () => {
    const { impl, chiamate } = fetchFinto(risposta(TOKEN), risposta(contoA))
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    await c.movimentiConto('conto-1', { da: '2026-05-01', a: '2026-08-01' })

    expect(chiamate[1].url).toContain('date_from=2026-05-01')
    expect(chiamate[1].url).toContain('date_to=2026-08-01')
  })
})
```

- [ ] **Step 3: Lancia il test e verifica che fallisca**

```bash
nvm use 22 && npx vitest run src/lib/gocardless/__tests__/client.test.ts
```

Atteso: FAIL con `Failed to resolve import "../client"`.

- [ ] **Step 4: Scrivi l'implementazione minima**

`src/lib/gocardless/client.ts`:

```ts
/**
 * Client HTTP per GoCardless Bank Account Data.
 *
 * Scritto in casa su `fetch`: non esiste un SDK ufficiale mantenuto per questa
 * API (`nordigen-node` è fermo ad aprile 2025 ed è CommonJS).
 *
 * `fetchImpl` e `attesa` sono iniettabili perché i test non devono toccare la
 * rete né aspettare davvero i backoff.
 */
import { z } from 'zod'

import { ErroreGoCardless, LimiteRaggiunto } from './errori'
import {
  istituzioneSchema,
  rispostaDettagliSchema,
  rispostaMovimentiSchema,
  rispostaSaldiSchema,
} from './types'

const BASE = 'https://bankaccountdata.gocardless.com/api/v2'

/** Tentativi oltre il primo, per gli errori che ha senso ritentare. */
const RITENTATIVI = 2
const ATTESA_BASE_MS = 500

export interface Limiti {
  restanti: number | null
  ripresaFraSecondi: number | null
}

export interface Risposta<T> {
  dati: T
  limiti: Limiti
}

export interface OpzioniClient {
  secretId: string
  secretKey: string
  fetchImpl?: typeof fetch
  attesa?: (ms: number) => Promise<void>
}

const tokenSchema = z.object({
  access: z.string(),
  access_expires: z.number().optional(),
})

/**
 * Gli header del contingente per conto. GoCardless li manda in stile Django
 * (`http_x_ratelimit_...`); si cerca per sottostringa invece che per nome
 * esatto, così un cambio di forma non li fa sparire in silenzio.
 */
function leggiLimiti(headers: Headers): Limiti {
  let restanti: number | null = null
  let ripresa: number | null = null
  headers.forEach((valore, nome) => {
    const n = nome.toLowerCase()
    if (!n.includes('ratelimit')) return
    const numero = Number.parseInt(valore, 10)
    if (!Number.isFinite(numero)) return
    if (n.includes('account') && n.includes('remaining')) restanti = numero
    if (n.includes('account') && n.includes('reset')) ripresa = numero
  })
  return { restanti, ripresaFraSecondi: ripresa }
}

export function creaClient(opzioni: OpzioniClient) {
  const eseguiFetch = opzioni.fetchImpl ?? fetch
  const attendi = opzioni.attesa ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))

  let token: { valore: string; scadenza: number } | null = null

  async function corpoDi(r: Response): Promise<unknown> {
    const testo = await r.text()
    if (testo === '') return null
    try {
      return JSON.parse(testo)
    } catch {
      return testo
    }
  }

  async function ottieniToken(): Promise<string> {
    const margine = 5 * 60 * 1000
    if (token && token.scadenza - margine > Date.now()) return token.valore

    const r = await eseguiFetch(`${BASE}/token/new/`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ secret_id: opzioni.secretId, secret_key: opzioni.secretKey }),
    })
    const corpo = await corpoDi(r)
    if (!r.ok) {
      throw new ErroreGoCardless('Autenticazione GoCardless fallita', r.status, corpo)
    }
    const dati = tokenSchema.parse(corpo)
    token = {
      valore: dati.access,
      scadenza: Date.now() + (dati.access_expires ?? 3600) * 1000,
    }
    return token.valore
  }

  async function chiama<T>(percorso: string, schema: z.ZodType<T>): Promise<Risposta<T>> {
    let ultimo: ErroreGoCardless | null = null

    for (let tentativo = 0; tentativo <= RITENTATIVI; tentativo++) {
      const accesso = await ottieniToken()
      const r = await eseguiFetch(`${BASE}${percorso}`, {
        method: 'GET',
        headers: { accept: 'application/json', authorization: `Bearer ${accesso}` },
      })
      const limiti = leggiLimiti(r.headers)
      const corpo = await corpoDi(r)

      if (r.ok) return { dati: schema.parse(corpo), limiti }

      // Il 429 non si ritenta: il contingente della banca è giornaliero, un
      // backoff da mezzo secondo non lo sblocca e le chiamate che restano
      // servono altrove.
      if (r.status === 429) {
        throw new LimiteRaggiunto(
          'Limite di chiamate raggiunto per questo conto',
          corpo,
          limiti.ripresaFraSecondi
        )
      }

      ultimo = new ErroreGoCardless(`GoCardless ha risposto ${r.status}`, r.status, corpo)

      // Un 4xx diverso dal 429 è una richiesta sbagliata: ripeterla identica
      // darebbe identico esito.
      if (r.status < 500) throw ultimo

      if (tentativo < RITENTATIVI) await attendi(ATTESA_BASE_MS * 2 ** tentativo)
    }

    throw ultimo ?? new ErroreGoCardless('Chiamata fallita', 0, null)
  }

  return {
    istituzioni: (paese = 'it') =>
      chiama(`/institutions/?country=${encodeURIComponent(paese)}`, z.array(istituzioneSchema)),

    dettagliConto: (conto: string) =>
      chiama(`/accounts/${encodeURIComponent(conto)}/details/`, rispostaDettagliSchema),

    saldiConto: (conto: string) =>
      chiama(`/accounts/${encodeURIComponent(conto)}/balances/`, rispostaSaldiSchema),

    movimentiConto: (conto: string, filtro?: { da?: string; a?: string }) => {
      const query: string[] = []
      if (filtro?.da) query.push(`date_from=${encodeURIComponent(filtro.da)}`)
      if (filtro?.a) query.push(`date_to=${encodeURIComponent(filtro.a)}`)
      const coda = query.length > 0 ? `?${query.join('&')}` : ''
      return chiama(`/accounts/${encodeURIComponent(conto)}/transactions/${coda}`, rispostaMovimentiSchema)
    },
  }
}

export type ClientGoCardless = ReturnType<typeof creaClient>
```

- [ ] **Step 5: Lancia il test e verifica che passi**

```bash
nvm use 22 && npx vitest run src/lib/gocardless/__tests__/client.test.ts
```

Atteso: 9 test PASS.

- [ ] **Step 6: Verifica che il tipo regga**

```bash
nvm use 22 && npx tsc --noEmit
```

Atteso: exit 0, nessun output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/gocardless/client.ts src/lib/gocardless/errori.ts src/lib/gocardless/__tests__/client.test.ts
git commit -m "feat(open-banking): client HTTP con backoff sui 5xx e 429 non ritentato"
```

---

## Task 4: La migrazione

Due tabelle nuove, sei colonne, un valore d'enum e un indice unico parziale. È il passo irreversibile del piano: si applica **solo in locale**, e il rilascio in produzione è una decisione separata, da prendere dopo.

Attenzione a tre trappole, tutte già costate tempo in questo progetto:
1. `ALTER TYPE ... ADD VALUE` va **prima** di tutto il resto e da solo: PostgreSQL vieta di usare un valore d'enum nella stessa transazione in cui lo si aggiunge.
2. Prisma non sa rappresentare gli indici **parziali**, quindi l'indice unico va scritto a mano nel `migration.sql` e nello schema resta solo un `@@index` normale, con un commento che dice dov'è quello vero. È già così per `ux_bank_transactions_sede_riferimento`.
3. Le tabelle nuove nascono **senza Row Level Security**: `prisma migrate deploy` non ne sa nulla. Per questo il rilascio si fa con `npm run db:migrate:deploy`, che incatena `npm run rls:enable`.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260812120000_open_banking_fase_1/migration.sql`
- Modify: `src/types/reconciliation.ts:3`
- Modify: `src/lib/validations/reconciliation.ts:9`
- Modify: `src/components/reconciliation/TransactionDetailsDialog.tsx:53`

**Interfaces:**
- Consumes: niente
- Produces: modelli Prisma `BankConnection` e `BankSyncRun`; su `BankAccount` i campi `connectionId`, `providerAccountId`, `syncEnabled`, `syncCutoffDate`, `lastSyncAt`; su `BankTransaction` i campi `bankAccountId`, `providerTransactionId`, `bankTransactionCode`; valore d'enum `ImportSource.PSD2_GOCARDLESS`

- [ ] **Step 1: Aggiungi i modelli allo schema**

In `prisma/schema.prisma`, aggiungi il valore all'enum esistente:

```prisma
enum ImportSource {
  CSV
  XLSX
  PSD2_FABRICK
  PSD2_TINK
  PSD2_GOCARDLESS
  MANUAL
  CBI_XML
  CBI_TXT
}
```

Aggiungi i due modelli nuovi:

```prisma
/// Un consenso PSD2 verso un istituto. Copre TUTTI i conti dell'home banking
/// con cui è stata fatta l'autenticazione: quali di quei conti si importano
/// davvero lo decide `BankAccount.syncEnabled`, non questo record.
model BankConnection {
  id                String    @id @default(cuid())
  venueId           String    @map("venue_id")
  provider          String    @default("gocardless")
  institutionId     String    @map("institution_id")
  institutionName   String    @map("institution_name")
  requisitionId     String    @unique @map("requisition_id")
  agreementId       String?   @map("agreement_id")
  /// Stato della requisition come lo riporta GoCardless: CR, GC, UA, RJ, SA, GA, LN, EX.
  status            String
  accessValidUntil  DateTime? @map("access_valid_until")
  maxHistoricalDays Int?      @map("max_historical_days")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  deletedAt         DateTime? @map("deleted_at")

  venue        Venue         @relation(fields: [venueId], references: [id])
  bankAccounts BankAccount[]
  syncRuns     BankSyncRun[]

  @@index([venueId])
  @@map("bank_connections")
}

/// Una lettura verso la banca. Serve a due cose: capire perché un giorno non
/// sono arrivati movimenti, e riallineare il contatore anti-rate-limit sugli
/// header che la banca restituisce.
model BankSyncRun {
  id                 String    @id @default(cuid())
  venueId            String    @map("venue_id")
  connectionId       String    @map("connection_id")
  bankAccountId      String?   @map("bank_account_id")
  startedAt          DateTime  @default(now()) @map("started_at")
  finishedAt         DateTime? @map("finished_at")
  /// OK | ERRORE | LIMITE
  esito              String
  httpStatus         Int?      @map("http_status")
  movimentiLetti     Int       @default(0) @map("movimenti_letti")
  movimentiNuovi     Int       @default(0) @map("movimenti_nuovi")
  movimentiDuplicati Int       @default(0) @map("movimenti_duplicati")
  rateLimitRemaining Int?      @map("rate_limit_remaining")
  rateLimitResetAt   DateTime? @map("rate_limit_reset_at")
  errore             String?

  venue       Venue          @relation(fields: [venueId], references: [id])
  connection  BankConnection @relation(fields: [connectionId], references: [id])
  bankAccount BankAccount?   @relation(fields: [bankAccountId], references: [id])

  @@index([venueId, startedAt])
  @@index([bankAccountId, startedAt])
  @@map("bank_sync_runs")
}
```

Nel modello `BankAccount`, aggiungi i campi e le relazioni:

```prisma
  connectionId      String?   @map("connection_id")
  /// L'id del conto presso GoCardless (UUID). Unico globalmente: è lui a
  /// distinguere due conti, non l'IBAN, che a database è cifrato.
  providerAccountId String?   @unique @map("provider_account_id")
  /// L'INTERRUTTORE. Default `false`: un conto che compare per la prima volta
  /// non viene letto finché qualcuno non lo accende dalle impostazioni.
  /// Spento significa che la chiamata non parte, non che il conto è nascosto.
  syncEnabled       Boolean   @default(false) @map("sync_enabled")
  /// Data di taglio: non si importa nulla di antecedente. Evita di duplicare
  /// in prima nota ciò che è già entrato da CSV.
  syncCutoffDate    DateTime? @map("sync_cutoff_date") @db.Date
  lastSyncAt        DateTime? @map("last_sync_at")

  connection       BankConnection?   @relation(fields: [connectionId], references: [id])
  syncRuns         BankSyncRun[]
  bankTransactions BankTransaction[]
```

Nel modello `BankTransaction`, aggiungi i campi, la relazione e l'indice:

```prisma
  bankAccountId         String?  @map("bank_account_id")
  /// L'identificativo dato dalla banca. Unico per conto, NON fra conti: la
  /// deduplicazione va fatta su `(bankAccountId, providerTransactionId)`.
  /// L'indice UNIQUE parziale che lo impone è dichiarato in
  /// `prisma/sql/constraints.sql` e replicato nel migration.sql della
  /// migrazione `20260812120000_open_banking_fase_1`, perché Prisma non sa
  /// rappresentare gli indici parziali. Vedi `ux_bank_transactions_conto_provider`.
  providerTransactionId String?  @map("provider_transaction_id") @db.VarChar(100)
  /// `proprietaryBankTransactionCode`, formato `NN//NN`. Presente sul 100% dei
  /// movimenti: è il segnale di categorizzazione più forte di cui disponiamo.
  bankTransactionCode   String?  @map("bank_transaction_code") @db.VarChar(20)

  bankAccount BankAccount? @relation(fields: [bankAccountId], references: [id])
```

e fra gli indici del modello:

```prisma
  @@index([bankAccountId, transactionDate])
```

Nel modello `Venue`, aggiungi le due relazioni inverse (senza, `prisma validate` fallisce):

```prisma
  bankConnections BankConnection[]
  bankSyncRuns    BankSyncRun[]
```

- [ ] **Step 2: Verifica che lo schema sia valido**

```bash
nvm use 22 && npx prisma validate && npx prisma format
```

Atteso: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Scrivi la migrazione a mano**

Crea `prisma/migrations/20260812120000_open_banking_fase_1/migration.sql`:

```sql
-- Fase 1 dell'integrazione open banking GoCardless.
-- Spec: docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md
-- Referto della sonda: docs/gocardless-referto-2026-08-12.md

-- Va per primo e da solo: PostgreSQL vieta di USARE un valore d'enum nella
-- stessa transazione in cui lo si aggiunge. Qui non lo usiamo, ma tenerlo in
-- testa rende la regola visibile a chi modificherà questo file.
ALTER TYPE "ImportSource" ADD VALUE IF NOT EXISTS 'PSD2_GOCARDLESS';

-- CreateTable
CREATE TABLE "bank_connections" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'gocardless',
    "institution_id" TEXT NOT NULL,
    "institution_name" TEXT NOT NULL,
    "requisition_id" TEXT NOT NULL,
    "agreement_id" TEXT,
    "status" TEXT NOT NULL,
    "access_valid_until" TIMESTAMP(3),
    "max_historical_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_connections_requisition_id_key" ON "bank_connections"("requisition_id");
CREATE INDEX "bank_connections_venue_id_idx" ON "bank_connections"("venue_id");

ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "bank_sync_runs" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "bank_account_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "esito" TEXT NOT NULL,
    "http_status" INTEGER,
    "movimenti_letti" INTEGER NOT NULL DEFAULT 0,
    "movimenti_nuovi" INTEGER NOT NULL DEFAULT 0,
    "movimenti_duplicati" INTEGER NOT NULL DEFAULT 0,
    "rate_limit_remaining" INTEGER,
    "rate_limit_reset_at" TIMESTAMP(3),
    "errore" TEXT,
    CONSTRAINT "bank_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_sync_runs_venue_id_started_at_idx" ON "bank_sync_runs"("venue_id", "started_at");
CREATE INDEX "bank_sync_runs_bank_account_id_started_at_idx" ON "bank_sync_runs"("bank_account_id", "started_at");

ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "bank_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: i conti
ALTER TABLE "bank_accounts"
    ADD COLUMN "connection_id" TEXT,
    ADD COLUMN "provider_account_id" TEXT,
    ADD COLUMN "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "sync_cutoff_date" DATE,
    ADD COLUMN "last_sync_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "bank_accounts_provider_account_id_key" ON "bank_accounts"("provider_account_id");

ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "bank_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: i movimenti
ALTER TABLE "bank_transactions"
    ADD COLUMN "bank_account_id" TEXT,
    ADD COLUMN "provider_transaction_id" VARCHAR(100),
    ADD COLUMN "bank_transaction_code" VARCHAR(20);

CREATE INDEX "bank_transactions_bank_account_id_transaction_date_idx"
    ON "bank_transactions"("bank_account_id", "transaction_date");

ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- La chiave di deduplicazione dei movimenti che arrivano dalla banca.
--
-- Perché il conto è dentro: l'identificativo di GoCardless è un contatore per
-- giorno E per conto (`20260810-6`), quindi lo stesso valore compare su conti
-- diversi riferito a movimenti diversi — misurato: 244 valori su 653 movimenti
-- di due soli conti. L'indice storico `ux_bank_transactions_sede_riferimento`
-- è su `(venue_id, bank_reference)` e non contiene il conto: da solo farebbe
-- scartare come duplicati dei movimenti veri.
--
-- Parziale perché i movimenti importati da CSV non hanno né conto né
-- identificativo del provider, e non devono collidere fra loro su NULL.
CREATE UNIQUE INDEX "ux_bank_transactions_conto_provider"
    ON "bank_transactions"("bank_account_id", "provider_transaction_id")
    WHERE "deleted_at" IS NULL
      AND "bank_account_id" IS NOT NULL
      AND "provider_transaction_id" IS NOT NULL;

-- Backfill prudente dei movimenti storici.
--
-- Assegna il conto SOLO alle sedi che ne hanno esattamente uno attivo: lì
-- l'attribuzione è certa. Dove i conti sono più d'uno, `bank_account_id`
-- resta NULL, perché indovinare a quale conto appartenga un movimento
-- importato da CSV due mesi fa produrrebbe dati falsi che nessuno saprebbe
-- più distinguere da quelli veri.
UPDATE "bank_transactions" bt
SET "bank_account_id" = unico."id"
FROM (
    SELECT "venue_id", MIN("id") AS "id", COUNT(*) AS n
    FROM "bank_accounts"
    WHERE "is_active" = true
    GROUP BY "venue_id"
) unico
WHERE bt."venue_id" = unico."venue_id"
  AND unico.n = 1
  AND bt."bank_account_id" IS NULL;
```

- [ ] **Step 4: Dichiara lo stesso indice in `prisma/sql/constraints.sql`**

Senza questo passo il database dei test non avrà il vincolo, e il test che verifica il rifiuto del duplicato passerà senza provare nulla. In coda alla sezione `5c`, subito prima del blocco `-- 6. Indici di performance`, aggiungi:

```sql
-- 5d. bank_transactions — un movimento per conto e per identificativo del
--     provider, fra quelli vivi.
--
--     Perché il conto è nella chiave: l'identificativo che GoCardless
--     restituisce è un contatore per giorno E per conto (`20260810-6`), non
--     un identificativo globale. Misurato l'11 agosto 2026 su Banca della
--     Marca: 244 valori su 653 movimenti comparivano su entrambi i conti,
--     riferiti a operazioni diverse.
--
--     Bug che impedisce: con la sola chiave `(venue_id, bank_reference)` il
--     secondo di due movimenti omonimi su conti diversi verrebbe scartato
--     come duplicato — un movimento vero, perso in silenzio.
--
--     I filtri NOT NULL tengono fuori i movimenti importati da CSV, che non
--     hanno né conto né identificativo del provider e in un unique
--     collidevano su NULL.
CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_transactions_conto_provider
  ON bank_transactions (bank_account_id, provider_transaction_id)
  WHERE deleted_at IS NULL
    AND bank_account_id IS NOT NULL
    AND provider_transaction_id IS NOT NULL;
```

- [ ] **Step 5: Applica la migrazione su un database locale usa-e-getta**

> **Non lanciare `npm run db:migrate` così com'è.** Il `.env` di questo progetto punta a **Supabase di produzione**, e `npm run guard:not-prod` lo blocca — giustamente. Il guard non va aggirato: gli si dà un bersaglio locale. Le variabili già presenti nell'ambiente vincono sul `.env`, sia per il guard sia per Prisma, quindi basta anteporre `DATABASE_URL` alla riga di comando.
>
> In locale gira PostgreSQL 16 su `127.0.0.1:5433` con l'utente `nicolascarpa` (è lo stesso server che usano i test di integrazione, vedi `src/test/integration/env-guard.ts:63`).

Crea il database di prova — `createdb` non è disponibile, il client `libpq` non è installato:

```bash
nvm use 22 && node -e "
const {Client}=require('pg');
(async()=>{
  const c=new Client({host:'127.0.0.1',port:5433,user:'nicolascarpa',database:'postgres'});
  await c.connect();
  await c.query('DROP DATABASE IF EXISTS weiss_ob_fase1');
  await c.query('CREATE DATABASE weiss_ob_fase1');
  console.log('creato weiss_ob_fase1');
  await c.end();
})()"
```

Applica **tutte** le migrazioni in sequenza, dalla baseline alla nuova. Si usa `migrate deploy` e non `migrate dev`: su un database vergine `dev` proporrebbe di ribattezzare o ricreare la migrazione appena scritta a mano, e la riscriverebbe.

```bash
nvm use 22 && DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_ob_fase1" npx prisma migrate deploy
```

Atteso: l'elenco delle migrazioni applicate si chiude con `20260812120000_open_banking_fase_1`, senza errori. Se PostgreSQL si lamenta dell'`ALTER TYPE`, è finito nella stessa transazione di qualcosa che usa il valore nuovo: va spostato in testa al file.

Poi rigenera il client Prisma, che le task successive useranno per i tipi:

```bash
nvm use 22 && npx prisma generate
```

- [ ] **Step 6: Verifica a mano che l'indice sia davvero parziale**

```bash
nvm use 22 && DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_ob_fase1" node -e "
const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(\"SELECT indexdef FROM pg_indexes WHERE indexname='ux_bank_transactions_conto_provider'\")
 .then(r=>{console.log(r.rows[0]?.indexdef ?? 'INDICE ASSENTE');return p.end()});
"
```

Atteso: la definizione contiene `UNIQUE` e la clausola `WHERE`. Se manca la `WHERE`, l'indice è sbagliato e i movimenti da CSV collideranno fra loro su NULL. Se stampa `INDICE ASSENTE`, la migrazione non è stata applicata.

- [ ] **Step 7: Allinea i tre punti che duplicano l'enum fuori dallo schema**

`src/types/reconciliation.ts:3`:

```ts
export type ImportSource = 'CSV' | 'XLSX' | 'CBI_XML' | 'CBI_TXT' | 'PSD2_FABRICK' | 'PSD2_TINK' | 'PSD2_GOCARDLESS' | 'MANUAL'
```

`src/lib/validations/reconciliation.ts`, nell'enum zod, dopo `'PSD2_TINK',`:

```ts
  'PSD2_GOCARDLESS',
```

`src/components/reconciliation/TransactionDetailsDialog.tsx`, nella mappa delle etichette, dopo la riga `PSD2_FABRICK`:

```tsx
  PSD2_GOCARDLESS: 'Open Banking',
```

- [ ] **Step 8: Verifica che tutto compili e che i test esistenti reggano**

```bash
nvm use 22 && npx tsc --noEmit && npm run lint && npm run test:run
```

Atteso: `tsc` exit 0; lint 0 errori (i warning preesistenti restano); la suite unit tutta verde.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260812120000_open_banking_fase_1/ prisma/sql/constraints.sql src/types/reconciliation.ts src/lib/validations/reconciliation.ts src/components/reconciliation/TransactionDetailsDialog.tsx
git commit -m "feat(open-banking): tabelle connessione e sync, conto sui movimenti, chiave di deduplica per conto"
```

---

## Task 5: La deduplicazione per conto

Il motivo per cui questa fase esiste. `filtraGiaPresenti` separa i movimenti nuovi da quelli già in archivio guardando **la coppia conto + identificativo**, e il test lo dimostra sul caso che rompe tutto: due movimenti diversi, su due conti diversi, con lo stesso identificativo.

Il test è d'integrazione e non unitario di proposito. Un mock di Prisma direbbe soltanto che la funzione fa la query che le abbiamo detto di fare; qui va dimostrato che **PostgreSQL** accetta l'una e rifiuta l'altra, e questo lo può dire solo PostgreSQL.

**Nota su un difetto della spec già chiuso:** la spec descriveva la deduplicazione dell'import CSV come rotta, perché cercava i duplicati su `data+importo+descrizione` mentre il vincolo a database era su `bankReference`. Nel frattempo la route è stata sistemata: calcola un'impronta e cerca su `bank_reference`, coerente col vincolo. Quel difetto **non va più corretto**; resta solo l'aggiunta del conto, che riguarda il flusso del provider e non il CSV.

**Files:**
- Create: `src/lib/gocardless/dedup.ts`
- Test: `src/lib/gocardless/__tests__/dedup.itest.ts`

**Interfaces:**
- Consumes: `MovimentoDaSalvare` da `./mapper` (Task 2); le colonne create nella Task 4
- Produces:
  - `interface EsitoDeduplica { nuovi: MovimentoDaSalvare[]; duplicati: number }`
  - `function filtraGiaPresenti(db: PrismaClient | Prisma.TransactionClient, p: { bankAccountId: string; movimenti: MovimentoDaSalvare[] }): Promise<EsitoDeduplica>`

- [ ] **Step 1: Scrivi il test che fallisce**

`src/lib/gocardless/__tests__/dedup.itest.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { filtraGiaPresenti } from '../dedup'
import { mappaMovimenti } from '../mapper'
import { rispostaMovimentiSchema } from '../types'
import contoA from './fixtures/movimenti-conto-a.json'
import contoB from './fixtures/movimenti-conto-b.json'

setupIntegrationDb()

/** Un conto bancario di prova, con IBAN diverso a ogni chiamata. */
async function contoDiTest(nome: string) {
  const venue = await venueDiTest()
  return prisma.bankAccount.create({
    data: {
      venueId: venue.id,
      name: nome,
      accountType: 'BANK',
      iban: `IT00X000000000000000000${Math.floor(Math.random() * 9000 + 1000)}`,
      currency: 'EUR',
    },
  })
}

async function salva(bankAccountId: string, venueId: string, movimenti: ReturnType<typeof mappaMovimenti>) {
  await prisma.bankTransaction.createMany({
    data: movimenti.map((m) => ({
      venueId,
      bankAccountId,
      providerTransactionId: m.providerTransactionId,
      transactionDate: m.transactionDate,
      valueDate: m.valueDate,
      description: m.description,
      amount: m.amount,
      bankTransactionCode: m.bankTransactionCode,
      importSource: 'PSD2_GOCARDLESS' as const,
    })),
  })
}

describe('deduplicazione dei movimenti del provider', () => {
  it('al primo giro sono tutti nuovi', async () => {
    const conto = await contoDiTest('Conto A')
    const movimenti = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))

    const esito = await filtraGiaPresenti(prisma, { bankAccountId: conto.id, movimenti })

    expect(esito.nuovi).toHaveLength(6)
    expect(esito.duplicati).toBe(0)
  })

  it('al secondo giro sono tutti duplicati', async () => {
    const conto = await contoDiTest('Conto A')
    const movimenti = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))
    await salva(conto.id, conto.venueId, movimenti)

    const esito = await filtraGiaPresenti(prisma, { bankAccountId: conto.id, movimenti })

    expect(esito.nuovi).toHaveLength(0)
    expect(esito.duplicati).toBe(6)
  })

  // IL TEST CHE CONTA. `20260810-1` e `20260810-2` esistono su entrambi i
  // conti riferiti a movimenti diversi. Con una chiave che non contiene il
  // conto, questi due sparirebbero.
  it('non confonde due movimenti diversi che condividono l\'identificativo su conti diversi', async () => {
    const a = await contoDiTest('Conto A')
    const b = await contoDiTest('Conto B')
    const movimentiA = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))
    const movimentiB = mappaMovimenti(rispostaMovimentiSchema.parse(contoB))

    // Gli identificativi si sovrappongono davvero: se questa asserzione cade,
    // le fixture sono state cambiate e il test non prova più niente.
    const idA = new Set(movimentiA.map((m) => m.providerTransactionId))
    expect(movimentiB.every((m) => idA.has(m.providerTransactionId))).toBe(true)

    await salva(a.id, a.venueId, movimentiA)
    const esito = await filtraGiaPresenti(prisma, { bankAccountId: b.id, movimenti: movimentiB })

    expect(esito.nuovi).toHaveLength(2)
    expect(esito.duplicati).toBe(0)
  })

  it('PostgreSQL accetta lo stesso identificativo su conti diversi', async () => {
    const a = await contoDiTest('Conto A')
    const b = await contoDiTest('Conto B')
    const movimentiA = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))
    const movimentiB = mappaMovimenti(rispostaMovimentiSchema.parse(contoB))

    await salva(a.id, a.venueId, movimentiA)
    await expect(salva(b.id, b.venueId, movimentiB)).resolves.not.toThrow()

    const quanti = await prisma.bankTransaction.count({
      where: { providerTransactionId: '20260810-1' },
    })
    expect(quanti).toBe(2)
  })

  it('PostgreSQL rifiuta lo stesso identificativo sullo stesso conto', async () => {
    const a = await contoDiTest('Conto A')
    const movimenti = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))
    await salva(a.id, a.venueId, movimenti)

    await expect(salva(a.id, a.venueId, movimenti)).rejects.toThrow()
  })

  it('non tocca i movimenti degli altri conti quando non trova nulla', async () => {
    const a = await contoDiTest('Conto A')
    const movimenti = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))

    const esito = await filtraGiaPresenti(prisma, { bankAccountId: a.id, movimenti: [] })

    expect(esito.nuovi).toHaveLength(0)
    expect(esito.duplicati).toBe(0)
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
nvm use 22 && npm run test:integration -- src/lib/gocardless/__tests__/dedup.itest.ts
```

Atteso: FAIL con `Failed to resolve import "../dedup"`.

- [ ] **Step 3: Scrivi l'implementazione minima**

`src/lib/gocardless/dedup.ts`:

```ts
/**
 * Deduplicazione dei movimenti che arrivano dalla banca.
 *
 * La chiave è `(bankAccountId, providerTransactionId)` e il conto non è un
 * dettaglio: l'identificativo di GoCardless è un contatore per giorno e per
 * conto, quindi `20260810-6` esiste su ogni conto riferito a un movimento
 * diverso. Misurato sul campo: 244 valori condivisi su 653 movimenti di due
 * conti. Una deduplica senza il conto scarterebbe quei movimenti come
 * duplicati, in silenzio.
 *
 * Si interroga il database invece di affidarsi a `skipDuplicates`: il vincolo
 * è un indice UNIQUE **parziale**, e Prisma non rappresenta gli indici
 * parziali — `skipDuplicates` non saprebbe su cosa appoggiarsi. L'indice resta
 * comunque la rete di sicurezza contro due sincronizzazioni in parallelo.
 */
import type { Prisma, PrismaClient } from '@prisma/client'

import type { MovimentoDaSalvare } from './mapper'

export interface EsitoDeduplica {
  nuovi: MovimentoDaSalvare[]
  duplicati: number
}

export async function filtraGiaPresenti(
  db: PrismaClient | Prisma.TransactionClient,
  parametri: { bankAccountId: string; movimenti: MovimentoDaSalvare[] }
): Promise<EsitoDeduplica> {
  const { bankAccountId, movimenti } = parametri
  if (movimenti.length === 0) return { nuovi: [], duplicati: 0 }

  const presenti = new Set(
    (
      await db.bankTransaction.findMany({
        where: {
          bankAccountId,
          providerTransactionId: { in: movimenti.map((m) => m.providerTransactionId) },
          deletedAt: null,
        },
        select: { providerTransactionId: true },
      })
    ).map((r) => r.providerTransactionId)
  )

  const nuovi: MovimentoDaSalvare[] = []
  let duplicati = 0

  for (const m of movimenti) {
    if (presenti.has(m.providerTransactionId)) {
      duplicati++
      continue
    }
    nuovi.push(m)
    // Lo stesso identificativo ripetuto dentro una sola risposta è la stessa
    // operazione elencata due volte: la seconda comparsa è un duplicato, e
    // senza questo passerebbe il filtro per poi far esplodere la INSERT.
    presenti.add(m.providerTransactionId)
  }

  return { nuovi, duplicati }
}
```

- [ ] **Step 4: Lancia il test e verifica che passi**

```bash
nvm use 22 && npm run test:integration -- src/lib/gocardless/__tests__/dedup.itest.ts
```

Atteso: 6 test PASS.

Se fallisce **solo** `PostgreSQL rifiuta lo stesso identificativo sullo stesso conto`, la funzione è a posto e manca il vincolo nel database di prova: torna alla Task 4, Step 4, e verifica di aver aggiunto l'indice in `prisma/sql/constraints.sql` e non soltanto nel `migration.sql`.

- [ ] **Step 5: Verifica per inversione che il test serva davvero**

Togli temporaneamente `bankAccountId` dalla `where` di `filtraGiaPresenti` e rilancia il test.

Atteso: il terzo test (`non confonde due movimenti diversi…`) **fallisce**, riportando 0 movimenti nuovi invece di 2. Se passa lo stesso, il test non sta misurando ciò che dice e va corretto prima di andare avanti. Rimetti `bankAccountId` e rilancia: torna verde.

- [ ] **Step 6: Verifica finale dell'intera fase**

```bash
nvm use 22 && npx tsc --noEmit && npm run lint && npm run test:run && npm run test:integration
```

Atteso: `tsc` exit 0; lint 0 errori; entrambe le suite verdi.

- [ ] **Step 7: Commit**

```bash
git add src/lib/gocardless/dedup.ts src/lib/gocardless/__tests__/dedup.itest.ts
git commit -m "feat(open-banking): deduplicazione per conto, con la prova che due conti non collidono"
```

---

## Dopo il piano: cosa NON è stato fatto, e va deciso

1. **La migrazione non è in produzione.** Questo piano la applica solo in locale. Il rilascio si fa con `npm run db:migrate:deploy` (che incatena `rls:enable`) ed è una decisione da prendere a parte, dopo aver guardato su una copia della produzione **quanti conti bancari ha ciascuna sede, contando anche quelli disattivati** — che è l'insieme su cui il backfill decide. Le tre configurazioni da distinguere: una sede con un solo conto bancario riceve l'assegnazione; una sede che ne ha chiuso uno e aperto un altro non riceve nulla e resta a NULL; una sede il cui unico conto bancario è disattivato riceve comunque quello. Guardare i soli conti *attivi* mostrerebbe l'insieme sbagliato e nasconderebbe proprio il secondo caso.
2. **La verifica della stabilità degli identificativi è ancora aperta.** Serve un secondo `nvm use 22 && npx tsx scripts/gocardless-probe.ts --step=fetch` a qualche giorno dallo spike, poi `--step=report`. Se gli identificativi non fossero stabili, `filtraGiaPresenti` andrebbe cambiata per lavorare su una chiave di contenuto — `(bankAccountId, bookingDate, amount, hash della causale)` — e l'indice unico andrebbe rifatto di conseguenza. Tutto il resto di questa fase resterebbe valido.
3. **Nessuna sincronizzazione è accesa.** Non esiste una rotta che chiami il client, e il cron è Fase 3.
4. **`counterpartName` resta vuoto.** L'estrazione della controparte dalla causale è Fase 4, insieme alla mappa `codice banca → conto`.
5. **Il contatore anti-rate-limit deve contare le chiamate HTTP reali, non le sincronizzazioni.** I due meccanismi di ritentativo si compongono: il ritentativo sul 401 avvolge l'intero ciclo di backoff sui 5xx. Misurato su copia isolata con la sequenza `503, 503, 401` → nuovo token → `503, 503, 503`: sei chiamate sull'endpoint dati più due sul token, in una sola invocazione di `movimentiConto()`. Sei su un contingente giornaliero di quattro — il 150% della quota, esaurita da una sola sincronizzazione sfortunata. Il punto naturale dove contarle è dentro `eseguiClassificato`, l'unica funzione per cui passano tutte.
6. **`syncCutoffDate` esiste, è documentato e nessun codice lo legge.** La chiave del flusso CSV è `bank_reference`, quella del provider è `provider_transaction_id`, ed entrambi gli indici sono parziali: nessuno dei due vede le righe dell'altro. L'unica cosa che impedisce allo stesso movimento di entrare due volte — una dal CSV, una dal primo scarico di 90 giorni — è quella colonna. Criterio di accettazione per la Fase 3: nessuna chiamata a `movimentiConto` senza `date_from` derivato da `syncCutoffDate`. Se salta, il sintomo è un trimestre di prima nota duplicata.
7. **Un movimento cancellato dall'operatore tornerebbe al sync successivo.** `DELETE /api/bank-transactions/[id]` fa una cancellazione logica sui movimenti non ancora riconciliati. `filtraGiaPresenti` filtra `deletedAt: null` e l'indice unico parziale ha `WHERE deleted_at IS NULL`: entrambi considerano assente ciò che l'operatore ha cancellato, quindi rientrerebbe e l'indice non si opporrebbe. È il requisito non negoziabile 3 nella sua forma più letterale. Le due uscite sono: interrogare anche i cancellati e contarli fra i duplicati (una riga, e l'unica coerente col requisito), oppure accettare la resurrezione e scrivere nel piano perché. Non esiste una terza via che sia «non decidere» — oggi non risorge nulla solo perché non gira nulla.
8. **La `ZodError` grezza su un corpo 200 non conforme va incapsulata prima che la Fase 3 colleghi un chiamante.** `booked: z.array(movimentoSchema)` è tutto-o-niente, quindi un solo movimento di forma inattesa su 653 fa perdere l'intera risposta e la giornata di contingente, e l'errore che esce non è nessuno dei due tipi che il piano dichiara. Non blocca questa fase, che non chiama nessuno.
