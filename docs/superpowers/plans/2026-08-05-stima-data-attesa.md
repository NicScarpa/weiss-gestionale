# Stima preventiva della data attesa — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** proiettare il ritardo storico di pagamento del fornitore sulla data attesa (`Schedule.dataAttesa`) delle scadenze passive aperte, con provenienza tracciata e override manuale.

**Architecture:** un modulo di stima (`src/lib/scadenzario/stima-data-attesa.ts`) con una funzione pura (mediana + soglie) e tre funzioni di servizio; gli eventi che cambiano la storia (saldo, riconciliazione, modifica date) innescano il ricalcolo best-effort. Il previsionale non cambia: legge già `dataAttesa ?? dataScadenza`.

**Tech Stack:** Next.js App Router, Prisma 7 (PostgreSQL/Supabase), Zod, Vitest, date-fns.

**Spec:** `docs/superpowers/specs/2026-08-05-stima-data-attesa-design.md` — leggerla prima di iniziare.

## Global Constraints

- **Gerarchia fonti dataAttesa:** `riconciliazione` > `manuale` > `stima`. La stima non sovrascrive mai `manuale` o `riconciliazione`.
- **Invariante:** `dataAttesa` e `dataAttesaSource` entrambe null o entrambe valorizzate.
- **Soglie stima:** campione ≥ 3, |mediana arrotondata| ≥ 2 giorni, finestra 365 giorni.
- Solo scadenze **passive** con `supplierId`, stato in `aperta | parzialmente_pagata | scaduta`.
- Ricalcoli **best-effort**: try/catch con `logger.error`, mai propagare a pagamenti/riconciliazioni.
- Route e copy in **italiano**; importi `Decimal`; venue via `getVenueId()`.
- Test: `npx vitest run <file>`. Schema: `npm run db:push` (solo modifiche additive).
- **ATTENZIONE:** il working tree contiene modifiche di UN'ALTRA sessione (file `src/lib/attendance/*`, `src/lib/timezone.ts`, `src/app/api/attendance/*`, `package.json`, `vitest.config.ts`, `prisma/migrations/enable_rls_all_tables.sql` e una parte di `prisma/schema.prisma`). **MAI `git add -A`**: staggare sempre ed esclusivamente i file elencati nel task. Per `prisma/schema.prisma` usare `git add -p prisma/schema.prisma` e staggare solo l'hunk di `dataAttesaSource`.

---

### Task 1: Colonna `dataAttesaSource` + backfill

**Files:**
- Modify: `prisma/schema.prisma` (model `Schedule`, accanto a `dataAttesa`, ~riga 513)

**Interfaces:**
- Produces: colonna `schedules.data_attesa_source` (String?, valori `'stima' | 'manuale' | 'riconciliazione'`), client Prisma rigenerato con il campo `dataAttesaSource`.

- [ ] **Step 1: Aggiungere il campo allo schema**

Dopo il campo `dataAttesa` in `model Schedule`:

```prisma
  /// Provenienza di dataAttesa: 'stima' (ritardo storico del fornitore),
  /// 'manuale' (impostata dall'utente), 'riconciliazione' (riallineata alla
  /// data del movimento che ha saldato). Null se e solo se dataAttesa è null.
  dataAttesaSource        String?                     @map("data_attesa_source")
```

- [ ] **Step 2: Push e generate**

Run: `npm run db:push && npx prisma generate`
Expected: "Your database is now in sync". Modifica additiva: nessun impatto sulla produzione che gira sul codice vecchio.

- [ ] **Step 3: Backfill dell'invariante**

Le scadenze già riallineate dalla fase 3 hanno `dataAttesa` senza source:

```bash
echo "UPDATE schedules SET data_attesa_source = 'riconciliazione' WHERE data_attesa IS NOT NULL AND data_attesa_source IS NULL;" | npx prisma db execute --stdin --schema prisma/schema.prisma
```

Expected: esecuzione senza errori (0 o poche righe toccate).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: pulito.

- [ ] **Step 5: Commit**

```bash
git add -p prisma/schema.prisma   # SOLO l'hunk dataAttesaSource
git commit -m "feat(scadenzario): colonna data_attesa_source con backfill"
```

---

### Task 2: Funzione pura `calcolaRitardoTipico`

**Files:**
- Create: `src/lib/scadenzario/stima-data-attesa.ts`
- Test: `src/lib/scadenzario/__tests__/stima-data-attesa.test.ts`

**Interfaces:**
- Produces: `calcolaRitardoTipico(ritardiGiorni: number[]): number | null`, costanti `STIMA_MIN_CAMPIONE = 3`, `STIMA_SOGLIA_GIORNI = 2`, `STIMA_FINESTRA_GIORNI = 365`.

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
import { describe, it, expect } from 'vitest'
import { calcolaRitardoTipico } from '../stima-data-attesa'

describe('calcolaRitardoTipico', () => {
  it('restituisce la mediana dei ritardi con campione dispari', () => {
    expect(calcolaRitardoTipico([5, 12, 9])).toBe(9)
  })

  it('con campione pari usa la media dei due centrali, arrotondata', () => {
    expect(calcolaRitardoTipico([4, 6, 10, 20])).toBe(8)
  })

  it('la mediana è robusta a un caso anomalo', () => {
    // la fattura contestata pagata a 90 giorni non sposta la stima
    expect(calcolaRitardoTipico([7, 8, 9, 90])).toBe(9)
  })

  it('meno di 3 osservazioni: nessuna stima', () => {
    expect(calcolaRitardoTipico([10, 12])).toBeNull()
  })

  it('ritardo mediano sotto i 2 giorni è rumore: nessuna stima', () => {
    expect(calcolaRitardoTipico([0, 1, 1])).toBeNull()
  })

  it('il fornitore pagato in anticipo produce una stima negativa', () => {
    // |−5| ≥ 2: la stima anticipata è valida quanto quella in ritardo
    expect(calcolaRitardoTipico([-5, -4, -6])).toBe(-5)
  })

  it('non muta l\'array in ingresso', () => {
    const ritardi = [9, 5, 12]
    calcolaRitardoTipico(ritardi)
    expect(ritardi).toEqual([9, 5, 12])
  })
})
```

- [ ] **Step 2: Verificare il RED**

Run: `npx vitest run src/lib/scadenzario/__tests__/stima-data-attesa.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Step 3: Implementazione minima**

```ts
/**
 * Stima preventiva della data attesa di cassa.
 *
 * Il ritardo tipico di un fornitore è la mediana dei ritardi di pagamento
 * osservati (dataPagamento − dataScadenza) sulle sue scadenze passive pagate.
 * La mediana, non la media: la fattura contestata pagata a 90 giorni non deve
 * spostare la stima. Sotto le soglie (campione, giorni) la stima non si
 * applica: meglio la data contrattuale del rumore.
 *
 * Vedi docs/superpowers/specs/2026-08-05-stima-data-attesa-design.md.
 */

export const STIMA_MIN_CAMPIONE = 3
export const STIMA_SOGLIA_GIORNI = 2
export const STIMA_FINESTRA_GIORNI = 365

export function calcolaRitardoTipico(ritardiGiorni: number[]): number | null {
  if (ritardiGiorni.length < STIMA_MIN_CAMPIONE) return null

  const ordinati = [...ritardiGiorni].sort((a, b) => a - b)
  const mid = Math.floor(ordinati.length / 2)
  const mediana =
    ordinati.length % 2 === 0 ? (ordinati[mid - 1] + ordinati[mid]) / 2 : ordinati[mid]

  const giorni = Math.round(mediana)
  if (Math.abs(giorni) < STIMA_SOGLIA_GIORNI) return null
  return giorni
}
```

- [ ] **Step 4: Verificare il GREEN**

Run: `npx vitest run src/lib/scadenzario/__tests__/stima-data-attesa.test.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scadenzario/stima-data-attesa.ts src/lib/scadenzario/__tests__/stima-data-attesa.test.ts
git commit -m "feat(scadenzario): calcolo del ritardo tipico del fornitore"
```

---

### Task 3: `stimaRitardoFornitore` (lettura della storia)

**Files:**
- Modify: `src/lib/scadenzario/stima-data-attesa.ts`
- Test: `src/lib/scadenzario/__tests__/stima-data-attesa.test.ts`

**Interfaces:**
- Consumes: `calcolaRitardoTipico` (Task 2).
- Produces: `stimaRitardoFornitore(supplierId: string, venueId: string): Promise<number | null>`.

- [ ] **Step 1: Test che fallisce**

In testa al file di test (i test del Task 2 restano invariati — il mock di prisma non li tocca perché la funzione pura non lo usa):

```ts
import { vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { schedule: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import { stimaRitardoFornitore } from '../stima-data-attesa'
```

Nuovo describe:

```ts
describe('stimaRitardoFornitore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calcola il ritardo dalle scadenze passive pagate del fornitore', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      { dataScadenza: new Date('2026-05-01'), dataPagamento: new Date('2026-05-11') },
      { dataScadenza: new Date('2026-06-01'), dataPagamento: new Date('2026-06-09') },
      { dataScadenza: new Date('2026-07-01'), dataPagamento: new Date('2026-07-13') },
    ] as never)

    await expect(stimaRitardoFornitore('sup-1', 'venue-1')).resolves.toBe(10)

    const where = vi.mocked(prisma.schedule.findMany).mock.calls[0][0]?.where
    expect(where).toMatchObject({
      venueId: 'venue-1',
      supplierId: 'sup-1',
      tipo: 'passiva',
      stato: 'pagata',
    })
    // la finestra: solo pagamenti recenti
    expect(where?.dataPagamento).toHaveProperty('gte')
  })

  it('senza storia sufficiente restituisce null', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([] as never)
    await expect(stimaRitardoFornitore('sup-1', 'venue-1')).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Verificare il RED**

Run: `npx vitest run src/lib/scadenzario/__tests__/stima-data-attesa.test.ts`
Expected: FAIL, `stimaRitardoFornitore` non esportata.

- [ ] **Step 3: Implementazione**

```ts
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { addDays, differenceInCalendarDays, subDays } from 'date-fns'

export async function stimaRitardoFornitore(
  supplierId: string,
  venueId: string
): Promise<number | null> {
  const pagate = await prisma.schedule.findMany({
    where: {
      venueId,
      supplierId,
      tipo: 'passiva',
      stato: 'pagata',
      dataPagamento: { not: null, gte: subDays(new Date(), STIMA_FINESTRA_GIORNI) },
    },
    select: { dataScadenza: true, dataPagamento: true },
  })

  const ritardi = pagate
    .filter((s): s is typeof s & { dataPagamento: Date } => s.dataPagamento !== null)
    .map((s) => differenceInCalendarDays(s.dataPagamento, s.dataScadenza))

  return calcolaRitardoTipico(ritardi)
}
```

- [ ] **Step 4: Verificare il GREEN**

Run: `npx vitest run src/lib/scadenzario/__tests__/stima-data-attesa.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scadenzario/stima-data-attesa.ts src/lib/scadenzario/__tests__/stima-data-attesa.test.ts
git commit -m "feat(scadenzario): lettura del ritardo storico del fornitore"
```

---

### Task 4: `applicaStimaSuScadenza` e `ricalcolaStimeFornitore`

**Files:**
- Modify: `src/lib/scadenzario/stima-data-attesa.ts`
- Test: `src/lib/scadenzario/__tests__/stima-data-attesa.test.ts`

**Interfaces:**
- Consumes: `stimaRitardoFornitore` (Task 3).
- Produces (usate dai Task 5–8):
  - `applicaStimaSuScadenza(scheduleId: string, venueId: string): Promise<void>` — singola scadenza (creazione, modifica dataScadenza, svuotamento manuale, undo riconciliazione).
  - `ricalcolaStimeFornitore(supplierId: string, venueId: string): Promise<void>` — tutte le scadenze aperte del fornitore (quando una sua scadenza diventa pagata).
  - Entrambe non sollevano MAI (best-effort, log interno).

- [ ] **Step 1: Test che falliscono**

```ts
import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '../stima-data-attesa'

function scadenzaAperta(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    tipo: 'passiva',
    stato: 'aperta',
    supplierId: 'sup-1',
    dataScadenza: new Date('2026-09-01'),
    dataAttesaSource: null,
    ...overrides,
  }
}

describe('applicaStimaSuScadenza', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scrive dataAttesa = dataScadenza + ritardo con source stima', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenzaAperta() as never)
    // storia: tre pagamenti con 10 giorni di ritardo
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      { dataScadenza: new Date('2026-05-01'), dataPagamento: new Date('2026-05-11') },
      { dataScadenza: new Date('2026-06-01'), dataPagamento: new Date('2026-06-11') },
      { dataScadenza: new Date('2026-07-01'), dataPagamento: new Date('2026-07-11') },
    ] as never)

    await applicaStimaSuScadenza('sched-1', 'venue-1')

    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { dataAttesa: new Date('2026-09-11'), dataAttesaSource: 'stima' },
    })
  })

  it('non tocca una scadenza con data attesa manuale', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenzaAperta({ dataAttesaSource: 'manuale' }) as never
    )
    await applicaStimaSuScadenza('sched-1', 'venue-1')
    expect(prisma.schedule.update).not.toHaveBeenCalled()
  })

  it('non tocca le scadenze attive né quelle senza fornitore', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenzaAperta({ tipo: 'attiva' }) as never
    )
    await applicaStimaSuScadenza('sched-1', 'venue-1')
    expect(prisma.schedule.update).not.toHaveBeenCalled()

    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenzaAperta({ supplierId: null }) as never
    )
    await applicaStimaSuScadenza('sched-1', 'venue-1')
    expect(prisma.schedule.update).not.toHaveBeenCalled()
  })

  it('se la stima non è più possibile, una source stima torna a null', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenzaAperta({ dataAttesaSource: 'stima' }) as never
    )
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([] as never)

    await applicaStimaSuScadenza('sched-1', 'venue-1')

    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { dataAttesa: null, dataAttesaSource: null },
    })
  })

  it('un errore del database non si propaga: best-effort', async () => {
    vi.mocked(prisma.schedule.findFirst).mockRejectedValue(new Error('connessione persa'))
    await expect(applicaStimaSuScadenza('sched-1', 'venue-1')).resolves.toBeUndefined()
  })
})

describe('ricalcolaStimeFornitore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ricalcola le aperte del fornitore con source null o stima', async () => {
    // prima findMany: storia pagata (ritardo 10); seconda: le aperte da aggiornare
    vi.mocked(prisma.schedule.findMany)
      .mockResolvedValueOnce([
        { dataScadenza: new Date('2026-05-01'), dataPagamento: new Date('2026-05-11') },
        { dataScadenza: new Date('2026-06-01'), dataPagamento: new Date('2026-06-11') },
        { dataScadenza: new Date('2026-07-01'), dataPagamento: new Date('2026-07-11') },
      ] as never)
      .mockResolvedValueOnce([
        { id: 'a', dataScadenza: new Date('2026-09-01'), dataAttesaSource: null },
        { id: 'b', dataScadenza: new Date('2026-10-01'), dataAttesaSource: 'stima' },
      ] as never)

    await ricalcolaStimeFornitore('sup-1', 'venue-1')

    expect(prisma.schedule.update).toHaveBeenCalledTimes(2)
    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { dataAttesa: new Date('2026-09-11'), dataAttesaSource: 'stima' },
    })
    // il filtro esclude manuale e riconciliazione già in query
    const whereAperte = vi.mocked(prisma.schedule.findMany).mock.calls[1][0]?.where
    expect(whereAperte?.OR).toEqual([
      { dataAttesaSource: null },
      { dataAttesaSource: 'stima' },
    ])
  })
})
```

- [ ] **Step 2: Verificare il RED**

Run: `npx vitest run src/lib/scadenzario/__tests__/stima-data-attesa.test.ts`
Expected: FAIL, funzioni non esportate.

- [ ] **Step 3: Implementazione**

```ts
const STATI_APERTI = ['aperta', 'parzialmente_pagata', 'scaduta']

interface ScadenzaDaStimare {
  id: string
  dataScadenza: Date
  dataAttesaSource: string | null
}

/** Scrive (o azzera) la stima su una scadenza. Non controlla la source: i
 *  chiamanti filtrano prima. */
async function scriviStima(scadenza: ScadenzaDaStimare, ritardo: number | null): Promise<void> {
  if (ritardo === null) {
    // La storia non basta più: una stima precedente torna a null
    // (null = coincide con la contrattuale); il resto non si tocca
    if (scadenza.dataAttesaSource === 'stima') {
      await prisma.schedule.update({
        where: { id: scadenza.id },
        data: { dataAttesa: null, dataAttesaSource: null },
      })
    }
    return
  }
  await prisma.schedule.update({
    where: { id: scadenza.id },
    data: { dataAttesa: addDays(scadenza.dataScadenza, ritardo), dataAttesaSource: 'stima' },
  })
}

export async function applicaStimaSuScadenza(scheduleId: string, venueId: string): Promise<void> {
  try {
    const scadenza = await prisma.schedule.findFirst({
      where: { id: scheduleId, venueId },
      select: {
        id: true,
        tipo: true,
        stato: true,
        supplierId: true,
        dataScadenza: true,
        dataAttesaSource: true,
      },
    })
    if (!scadenza) return
    if (scadenza.tipo !== 'passiva' || !scadenza.supplierId) return
    if (!STATI_APERTI.includes(scadenza.stato)) return
    if (scadenza.dataAttesaSource !== null && scadenza.dataAttesaSource !== 'stima') return

    const ritardo = await stimaRitardoFornitore(scadenza.supplierId, venueId)
    await scriviStima(scadenza, ritardo)
  } catch (error) {
    logger.error('Stima data attesa non applicata', error, { scheduleId })
  }
}

export async function ricalcolaStimeFornitore(supplierId: string, venueId: string): Promise<void> {
  try {
    const ritardo = await stimaRitardoFornitore(supplierId, venueId)
    const aperte = await prisma.schedule.findMany({
      where: {
        venueId,
        supplierId,
        tipo: 'passiva',
        stato: { in: STATI_APERTI },
        OR: [{ dataAttesaSource: null }, { dataAttesaSource: 'stima' }],
      },
      select: { id: true, dataScadenza: true, dataAttesaSource: true },
    })
    for (const scadenza of aperte) {
      await scriviStima(scadenza, ritardo)
    }
  } catch (error) {
    logger.error('Ricalcolo stime fornitore fallito', error, { supplierId })
  }
}
```

- [ ] **Step 4: Verificare il GREEN**

Run: `npx vitest run src/lib/scadenzario/__tests__/stima-data-attesa.test.ts`
Expected: PASS (tutti i describe).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scadenzario/stima-data-attesa.ts src/lib/scadenzario/__tests__/stima-data-attesa.test.ts
git commit -m "feat(scadenzario): applicazione e ricalcolo della stima data attesa"
```

---

### Task 5: Aggancio alla creazione delle scadenze

**Files:**
- Modify: `src/app/api/scadenzario/route.ts` (POST, ~riga 289)
- Modify: `src/app/api/invoices/route.ts` (~riga 460, dopo `generateSchedulesFromInvoice`)
- Modify: `src/app/api/scadenzario/ricorrenze/[id]/genera/route.ts` (dopo `prisma.schedule.create`)
- Modify: `src/app/api/scadenzario/[id]/genera-prossima/route.ts` (dopo `prisma.schedule.create`)
- Test: `src/app/api/scadenzario/__tests__/route.test.ts` (esistente, estendere)

**Interfaces:**
- Consumes: `applicaStimaSuScadenza`, `ricalcolaStimeFornitore` (Task 4).

Nota: il test copre il POST dello scadenzario (il file di test esiste già con il pattern dei mock). Gli altri tre agganci sono la stessa singola riga in route prive di test: si verificano con typecheck + smoke test finale (Task 9); il motore sottostante è già coperto dal Task 4. Trade-off deliberato, non dimenticanza.

- [ ] **Step 1: Test che fallisce (POST /api/scadenzario)**

In `src/app/api/scadenzario/__tests__/route.test.ts` aggiungere il mock del modulo accanto a quello dell'engine:

```ts
vi.mock('@/lib/scadenzario/stima-data-attesa', () => ({
  applicaStimaSuScadenza: vi.fn(),
}))
```

e importare `POST` accanto a `GET` e `applicaStimaSuScadenza` dal modulo mockato. Nuovo describe:

```ts
import { POST } from '../route'
import { applicaStimaSuScadenza } from '@/lib/scadenzario/stima-data-attesa'
import { applicaRegolaCreaMovimento } from '@/lib/schedule-rules/engine'

describe('POST /api/scadenzario - stima della data attesa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(applicaRegolaCreaMovimento).mockResolvedValue({ applicata: false } as never)
    vi.mocked(prisma.schedule.create).mockResolvedValue({
      id: 'sched-nuova',
      importoTotale: 100,
      importoPagato: 0,
    } as never)
    vi.mocked(prisma.schedule.findUnique).mockResolvedValue({
      id: 'sched-nuova',
      importoTotale: 100,
      importoPagato: 0,
    } as never)
  })

  it('dopo la creazione applica la stima della data attesa', async () => {
    const request = new NextRequest('http://localhost:3000/api/scadenzario', {
      method: 'POST',
      body: JSON.stringify({
        tipo: 'passiva',
        descrizione: 'Fattura HERA',
        importoTotale: 100,
        dataScadenza: '2026-09-01',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-nuova', 'venue-test-123')
  })
})
```

Il mock di prisma nel file va esteso con `create: vi.fn()` e `findUnique: vi.fn()` su `schedule`, e serve il mock di `@/lib/audit` (già presente).

- [ ] **Step 2: Verificare il RED**

Run: `npx vitest run src/app/api/scadenzario/__tests__/route.test.ts`
Expected: FAIL — `applicaStimaSuScadenza` mai chiamata.

- [ ] **Step 3: Implementare i quattro agganci**

`src/app/api/scadenzario/route.ts` — import in testa:

```ts
import { applicaStimaSuScadenza } from '@/lib/scadenzario/stima-data-attesa'
```

e nel POST, dopo la chiamata ad `applicaRegolaCreaMovimento` (la regola può saldare la scadenza: in quel caso la stima si autoesclude per stato) sostituire il blocco `const aggiornata = regola.applicata ? ... : null` con:

```ts
    // La data attesa di cassa si stima dal ritardo storico del fornitore
    await applicaStimaSuScadenza(schedule.id, venueId)

    // Le automazioni possono aver toccato la scadenza: si rilegge sempre
    const aggiornata = await prisma.schedule.findUnique({ where: { id: schedule.id } })
```

`src/app/api/invoices/route.ts` — import di `ricalcolaStimeFornitore` e, subito dopo il blocco try/catch di `generateSchedulesFromInvoice` (usare la variabile `invoice` già in scope):

```ts
    // Le nuove rate del fornitore ereditano la stima del suo ritardo storico
    if (schedulesResult?.created && invoice.supplierId) {
      await ricalcolaStimeFornitore(invoice.supplierId, invoice.venueId)
    }
```

`src/app/api/scadenzario/ricorrenze/[id]/genera/route.ts` — import di `applicaStimaSuScadenza`; dopo la `const schedule = await prisma.schedule.create({...})` (riga ~54):

```ts
    await applicaStimaSuScadenza(schedule.id, recurrence.venueId)
```

`src/app/api/scadenzario/[id]/genera-prossima/route.ts` — import di `applicaStimaSuScadenza`; dopo la `const newSchedule = await prisma.schedule.create({...})` (riga ~62):

```ts
    await applicaStimaSuScadenza(newSchedule.id, parent.venueId)
```

In entrambe la risposta JSON restituisce il record creato senza la stima appena scritta: è accettabile (la lista si ricarica), non rileggere.

- [ ] **Step 4: Verificare il GREEN e la suite**

Run: `npx vitest run src/app/api/scadenzario/__tests__/route.test.ts && npx tsc --noEmit`
Expected: PASS, typecheck pulito.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/scadenzario/route.ts src/app/api/invoices/route.ts "src/app/api/scadenzario/ricorrenze/[id]/genera/route.ts" "src/app/api/scadenzario/[id]/genera-prossima/route.ts" src/app/api/scadenzario/__tests__/route.test.ts
git commit -m "feat(scadenzario): stima della data attesa alla creazione delle scadenze"
```

---

### Task 6: Riconciliazione — provenienza, ricalcolo, undo che ristima

**Files:**
- Modify: `src/lib/services/schedule-reconciliation-service.ts`
- Test: `src/lib/services/__tests__/schedule-reconciliation-service.test.ts` (esistente, estendere)

**Interfaces:**
- Consumes: `applicaStimaSuScadenza`, `ricalcolaStimeFornitore` (Task 4).
- Produces: al saldo `dataAttesaSource = 'riconciliazione'`; dopo il saldo ricalcolo per il fornitore; dopo l'undo ristima della scadenza.

- [ ] **Step 1: Test che falliscono**

Nel file di test esistente aggiungere il mock:

```ts
vi.mock('@/lib/scadenzario/stima-data-attesa', () => ({
  applicaStimaSuScadenza: vi.fn(),
  ricalcolaStimeFornitore: vi.fn(),
}))

import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
```

La factory `scadenza()` va estesa con `supplierId: 'sup-1'` e `dataScadenza: new Date('2026-07-20')`. Nuovi test:

```ts
it('al saldo la source diventa riconciliazione e si ricalcolano le stime del fornitore', async () => {
  const entry = movimento()
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
  vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(entry as never)

  await reconcileScheduleWithEntry({
    scheduleId: 'sched-1',
    journalEntryId: 'entry-1',
    venueId: VENUE,
    userId: 'user-1',
  })

  expect(prisma.schedule.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        dataAttesa: entry.date,
        dataAttesaSource: 'riconciliazione',
      }),
    })
  )
  expect(ricalcolaStimeFornitore).toHaveBeenCalledWith('sup-1', VENUE)
})

it('su un acconto parziale non si ricalcola nulla', async () => {
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
  vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
    movimento({ creditAmount: new Prisma.Decimal(40) }) as never
  )

  await reconcileScheduleWithEntry({
    scheduleId: 'sched-1',
    journalEntryId: 'entry-1',
    venueId: VENUE,
    userId: 'user-1',
  })

  expect(ricalcolaStimeFornitore).not.toHaveBeenCalled()
})

it('l\'undo azzera la data attesa e poi la ristima', async () => {
  vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue({
    id: 'rec-1',
    scheduleId: 'sched-1',
    paymentId: 'pay-1',
    amount: new Prisma.Decimal(100),
    schedule: {
      importoTotale: new Prisma.Decimal(100),
      importoPagato: new Prisma.Decimal(100),
    },
  } as never)

  await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

  expect(prisma.schedule.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ dataAttesa: null, dataAttesaSource: null }),
    })
  )
  expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-1', VENUE)
})
```

Aggiornare il vecchio test «riallinea dataAttesa…» solo se fallisse per la source aggiunta (usa `objectContaining`: non deve fallire).

- [ ] **Step 2: Verificare il RED**

Run: `npx vitest run src/lib/services/__tests__/schedule-reconciliation-service.test.ts`
Expected: FAIL sui tre test nuovi.

- [ ] **Step 3: Implementare**

Nel service:

1. Import: `import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'`
2. Nel `select` della scadenza in `reconcileScheduleWithEntry` aggiungere `supplierId: true`.
3. Nell'update in transazione sostituire la riga della dataAttesa con:

```ts
        // La data attesa si riallinea al movimento reale, con la provenienza
        // che vince su tutto (riconciliazione > manuale > stima)
        ...(saldata ? { dataAttesa: entry.date, dataAttesaSource: 'riconciliazione' } : {}),
```

4. Dopo la transazione (accanto al blocco fattura):

```ts
  // La storia del fornitore è cambiata: le stime delle sue scadenze aperte
  // si aggiornano. Best-effort: non blocca mai la riconciliazione
  if (risultato.saldata && schedule.tipo === 'passiva' && schedule.supplierId) {
    await ricalcolaStimeFornitore(schedule.supplierId, venueId)
  }
```

5. In `undoScheduleReconciliation`, nell'update della transazione: `dataAttesa: null, dataAttesaSource: null`; dopo la transazione:

```ts
  // La scadenza è di nuovo aperta: se il fornitore ha una storia, la data
  // attesa torna a essere stimata invece di restare secca sulla contrattuale
  await applicaStimaSuScadenza(reconciliation.scheduleId, venueId)
```

- [ ] **Step 4: Verificare il GREEN**

Run: `npx vitest run src/lib/services/__tests__/schedule-reconciliation-service.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/schedule-reconciliation-service.ts src/lib/services/__tests__/schedule-reconciliation-service.test.ts
git commit -m "feat(scadenzario): riconciliazione con provenienza e ricalcolo stime"
```

---

### Task 7: Pagamento manuale che salda → ricalcolo fornitore

**Files:**
- Modify: `src/app/api/scadenzario/[id]/pagamenti/route.ts`
- Test: `src/app/api/scadenzario/[id]/pagamenti/__tests__/route.test.ts` (nuovo)

**Interfaces:**
- Consumes: `ricalcolaStimeFornitore` (Task 4).

- [ ] **Step 1: Test che fallisce**

Nuovo file, stesso pattern di mock delle altre route (auth, prisma, audit, logger, stima). Mock prisma con `schedule: { findFirst, update, count }`, `schedulePayment: { create, aggregate }`, `electronicInvoice: { update }`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/scadenzario/stima-data-attesa', () => ({ ricalcolaStimeFornitore: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    schedulePayment: { create: vi.fn(), aggregate: vi.fn() },
    electronicInvoice: { update: vi.fn() },
  },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function pagamento(importo: number) {
  const request = new NextRequest('http://localhost:3000/api/scadenzario/sched-1/pagamenti', {
    method: 'POST',
    body: JSON.stringify({ importo, dataPagamento: '2026-08-01' }),
  })
  return { request, context: { params: Promise.resolve({ id: 'sched-1' }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
    id: 'sched-1',
    venueId: 'venue-1',
    tipo: 'passiva',
    supplierId: 'sup-1',
    importoTotale: 100,
    importoPagato: 0,
    stato: 'aperta',
    dataPagamento: null,
    invoiceId: null,
  } as never)
  vi.mocked(prisma.schedulePayment.create).mockResolvedValue({ id: 'pay-1' } as never)
  vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)
})

describe('POST /api/scadenzario/[id]/pagamenti - ricalcolo stime', () => {
  it('quando il pagamento salda una passiva con fornitore, ricalcola le stime', async () => {
    vi.mocked(prisma.schedulePayment.aggregate).mockResolvedValue({
      _sum: { importo: 100 },
    } as never)

    const { request, context } = pagamento(100)
    const response = await POST(request, context)

    expect(response.status).toBe(200)
    expect(ricalcolaStimeFornitore).toHaveBeenCalledWith('sup-1', 'venue-1')
  })

  it('un acconto parziale non ricalcola nulla', async () => {
    vi.mocked(prisma.schedulePayment.aggregate).mockResolvedValue({
      _sum: { importo: 40 },
    } as never)

    const { request, context } = pagamento(40)
    await POST(request, context)

    expect(ricalcolaStimeFornitore).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verificare il RED**

Run: `npx vitest run "src/app/api/scadenzario/[id]/pagamenti/__tests__/route.test.ts"`
Expected: FAIL — `ricalcolaStimeFornitore` mai chiamata (il primo test; il secondo passa già).

- [ ] **Step 3: Implementare**

Nella route: aggiungere `tipo: true, supplierId: true` al `select` della scadenza; import di `ricalcolaStimeFornitore`; dopo l'update dello schedule (accanto al blocco fattura):

```ts
    // La storia del fornitore è cambiata: aggiorna le stime delle sue
    // scadenze aperte. Best-effort: non blocca la registrazione
    if (
      nuovoStato === ScheduleStatus.PAGATA &&
      schedule.tipo === 'passiva' &&
      schedule.supplierId
    ) {
      await ricalcolaStimeFornitore(schedule.supplierId, schedule.venueId)
    }
```

- [ ] **Step 4: Verificare il GREEN**

Run: `npx vitest run "src/app/api/scadenzario/[id]/pagamenti/__tests__/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/scadenzario/[id]/pagamenti/route.ts" "src/app/api/scadenzario/[id]/pagamenti/__tests__/route.test.ts"
git commit -m "feat(scadenzario): il pagamento che salda aggiorna le stime del fornitore"
```

---

### Task 8: PATCH — data attesa manuale, svuotamento, 400 sulle attive, ristima su dataScadenza

**Files:**
- Modify: `src/app/api/scadenzario/[id]/route.ts`
- Test: `src/app/api/scadenzario/[id]/__tests__/route.test.ts` (nuovo)

**Interfaces:**
- Consumes: `applicaStimaSuScadenza` (Task 4).
- Produces: `updateScheduleSchema` accetta `dataAttesa` (date | null); regole di source come da spec.

- [ ] **Step 1: Test che falliscono**

Nuovo file di test, pattern solito (mock auth, prisma `schedule: { findFirst, findUnique, update }`, `supplier: { findFirst }`, audit, logger, stima). Il `findFirst` esistente della route va mockato con:

```ts
function esistente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    venueId: 'venue-1',
    tipo: 'passiva',
    dataAttesaSource: null,
    ...overrides,
  }
}
```

Test:

```ts
it('impostare la data attesa la marca come manuale', async () => {
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue(esistente() as never)
  vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)

  const { request, context } = patchCon({ dataAttesa: '2026-09-15' })
  const response = await PATCH(request, context)

  expect(response.status).toBe(200)
  expect(prisma.schedule.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        dataAttesa: new Date('2026-09-15'),
        dataAttesaSource: 'manuale',
      }),
    })
  )
  expect(applicaStimaSuScadenza).not.toHaveBeenCalled()
})

it('svuotare la data attesa torna alla stima automatica', async () => {
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
    esistente({ dataAttesaSource: 'manuale' }) as never
  )
  vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)

  const { request, context } = patchCon({ dataAttesa: null })
  await PATCH(request, context)

  expect(prisma.schedule.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ dataAttesa: null, dataAttesaSource: null }),
    })
  )
  expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-1', 'venue-1')
})

it('sulle scadenze attive la data attesa è rifiutata', async () => {
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
    esistente({ tipo: 'attiva' }) as never
  )

  const { request, context } = patchCon({ dataAttesa: '2026-09-15' })
  const response = await PATCH(request, context)

  expect(response.status).toBe(400)
  expect(prisma.schedule.update).not.toHaveBeenCalled()
})

it('cambiare dataScadenza su una scadenza con source stima la ristima', async () => {
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
    esistente({ dataAttesaSource: 'stima' }) as never
  )
  vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)

  const { request, context } = patchCon({ dataScadenza: '2026-10-01' })
  await PATCH(request, context)

  expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-1', 'venue-1')
})

it('cambiare dataScadenza con una data attesa manuale non la tocca', async () => {
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
    esistente({ dataAttesaSource: 'manuale' }) as never
  )
  vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)

  const { request, context } = patchCon({ dataScadenza: '2026-10-01' })
  await PATCH(request, context)

  expect(applicaStimaSuScadenza).not.toHaveBeenCalled()
})
```

con l'helper:

```ts
function patchCon(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost:3000/api/scadenzario/sched-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id: 'sched-1' }) } }
}
```

- [ ] **Step 2: Verificare il RED**

Run: `npx vitest run "src/app/api/scadenzario/[id]/__tests__/route.test.ts"`
Expected: FAIL (dataAttesa scartata da Zod / stima mai chiamata).

- [ ] **Step 3: Implementare**

In `src/app/api/scadenzario/[id]/route.ts`:

1. Schema: `dataAttesa: z.coerce.date().or(z.string()).nullable().optional(),`
2. Import di `applicaStimaSuScadenza`.
3. Il `findFirst` di verifica seleziona anche `tipo: true, dataAttesaSource: true`.
4. Dopo la validazione:

```ts
    const { dataAttesa: dataAttesaInput, ...datiScadenza } = validatedData
    const updateData: Prisma.ScheduleUpdateInput = { ...datiScadenza }
    if (validatedData.dataPagamento && !validatedData.stato) {
      updateData.stato = ScheduleStatus.PAGATA
    }

    if (dataAttesaInput !== undefined) {
      if (existing.tipo !== 'passiva') {
        return NextResponse.json(
          { error: 'La data attesa si imposta solo sulle scadenze passive' },
          { status: 400 }
        )
      }
      if (dataAttesaInput === null) {
        // Svuotare = tornare alla stima automatica (ricalcolo dopo l'update)
        updateData.dataAttesa = null
        updateData.dataAttesaSource = null
      } else {
        updateData.dataAttesa = new Date(dataAttesaInput)
        updateData.dataAttesaSource = 'manuale'
      }
    }
```

5. Dopo `prisma.schedule.update` (prima della risposta):

```ts
    // La stima si riapplica se la data attesa è stata svuotata, o se è
    // cambiata la scadenza contrattuale di una scadenza non gestita a mano
    const daRistimare =
      dataAttesaInput === null ||
      (validatedData.dataScadenza !== undefined &&
        dataAttesaInput === undefined &&
        (existing.dataAttesaSource === null || existing.dataAttesaSource === 'stima'))

    if (daRistimare) {
      await applicaStimaSuScadenza(id, existing.venueId)
    }
```

6. Se `daRistimare`, rileggere la scadenza prima di costruire la risposta, così il client vede la stima fresca:

```ts
    const finale = daRistimare
      ? (await prisma.schedule.findUnique({
          where: { id },
          include: {
            supplier: { select: { id: true, name: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
            payments: { orderBy: { dataPagamento: 'desc' }, take: 5 },
          },
        })) ?? schedule
      : schedule
```

e usare `finale` al posto di `schedule` nella risposta.

- [ ] **Step 4: Verificare il GREEN**

Run: `npx vitest run "src/app/api/scadenzario/[id]/__tests__/route.test.ts" && npx tsc --noEmit`
Expected: PASS, typecheck pulito.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/scadenzario/[id]/route.ts" "src/app/api/scadenzario/[id]/__tests__/route.test.ts"
git commit -m "feat(scadenzario): data attesa manuale con ritorno alla stima"
```

---

### Task 9: Tipi + UI del dettaglio + campo nel form di modifica

**Files:**
- Modify: `src/types/schedule.ts` (interfacce `Schedule`, `CreateScheduleInput`)
- Modify: `src/app/(dashboard)/scadenzario/[id]/page.tsx` (tab Informazioni, ~riga 470; `initialData` del dialog, ~riga 832)
- Modify: `src/components/scadenzario/create-schedule-sheet.tsx` (campo in edit, sezione avanzata)

La UI non ha test automatici nel progetto: la verifica è typecheck + smoke test (Task 10).

- [ ] **Step 1: Tipi**

In `Schedule` (dopo `dataAttesa`):

```ts
  /** Provenienza di dataAttesa; null se e solo se dataAttesa è null */
  dataAttesaSource: 'stima' | 'manuale' | 'riconciliazione' | null
```

In `CreateScheduleInput` (in coda ai campi opzionali):

```ts
  /** Solo in modifica di scadenze passive: null esplicito = torna alla stima */
  dataAttesa?: Date | null
```

- [ ] **Step 2: Riga "Data attesa" nel dettaglio**

In `src/app/(dashboard)/scadenzario/[id]/page.tsx`, dopo la `DetailRow` "Data scadenza":

```tsx
                <DetailRow label="Data attesa" value={
                  schedule.dataAttesa
                    ? `${format(new Date(schedule.dataAttesa), 'dd/MM/yyyy', { locale: it })} — ${
                        schedule.dataAttesaSource === 'stima'
                          ? descriviStima(schedule)
                          : schedule.dataAttesaSource === 'manuale'
                            ? 'impostata manualmente'
                            : 'riallineata al pagamento'
                      }`
                    : 'coincide con la scadenza'
                } />
```

con l'helper (fuori dal componente, accanto a `SortIcon`-style helpers):

```tsx
function descriviStima(schedule: { dataAttesa: Date | string | null; dataScadenza: Date | string }) {
  const giorni = differenceInCalendarDays(
    new Date(schedule.dataAttesa as Date | string),
    new Date(schedule.dataScadenza)
  )
  if (giorni >= 0) return `stimata: il fornitore paga con ~${giorni} giorni di ritardo`
  return `stimata: il fornitore paga con ~${Math.abs(giorni)} giorni di anticipo`
}
```

(import di `differenceInCalendarDays` da date-fns).

- [ ] **Step 3: Campo nel form di modifica**

In `create-schedule-sheet.tsx`:

1. Stato (accanto agli altri campi avanzati):

```tsx
  const [dataAttesa, setDataAttesa] = useState<Date | undefined>(
    initialData?.dataAttesa ? new Date(initialData.dataAttesa) : undefined
  )
  const [dataAttesaTouched, setDataAttesaTouched] = useState(false)
```

2. Nel `useEffect` che risincronizza da `initialData` (riga ~139): aggiungere il reset di entrambi (`setDataAttesa(initialData.dataAttesa ? new Date(initialData.dataAttesa) : undefined)`, `setDataAttesaTouched(false)`).
3. Nella sezione avanzata visibile solo in edit (`{isEdit && (` riga ~459), per `tipo === ScheduleType.PASSIVA`, replicare il pattern Calendar+Popover di `ricorrenzaFine` (riga ~532), con uno stato `dataAttesaPopoverOpen` dedicato:

```tsx
                        {tipo === ScheduleType.PASSIVA && (
                          <div className="space-y-2">
                            <Label>Data attesa di pagamento</Label>
                            <div className="flex items-center gap-2">
                              <Popover open={dataAttesaPopoverOpen} onOpenChange={setDataAttesaPopoverOpen}>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" className="justify-start font-normal flex-1">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dataAttesa ? format(dataAttesa, 'dd/MM/yyyy') : 'Stimata automaticamente'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={dataAttesa}
                                    onSelect={(d) => {
                                      setDataAttesa(d || undefined)
                                      setDataAttesaTouched(true)
                                      setDataAttesaPopoverOpen(false)
                                    }}
                                    initialFocus
                                    locale={it}
                                  />
                                </PopoverContent>
                              </Popover>
                              {dataAttesa && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setDataAttesa(undefined)
                                    setDataAttesaTouched(true)
                                  }}
                                >
                                  ×
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Se vuota, viene stimata dal ritardo storico del fornitore.
                            </p>
                          </div>
                        )}
```

(riusare le icone/componenti già importati nel file; aggiungere lo stato `const [dataAttesaPopoverOpen, setDataAttesaPopoverOpen] = useState(false)` accanto agli altri popover).
4. Nel submit (`onSubmit`, ~riga 199): includere il campo SOLO se toccato — altrimenti una modifica qualunque marcherebbe come manuale una stima mai toccata:

```ts
        ...(isEdit && dataAttesaTouched
          ? { dataAttesa: dataAttesa ?? null }
          : {}),
```

5. In `[id]/page.tsx`, `initialData` del `CreateScheduleDialog`: aggiungere

```tsx
            dataAttesa: schedule.dataAttesa ? new Date(schedule.dataAttesa) : undefined,
```

e verificare che `handleEditSchedule` inoltri il body così com'è alla PATCH (se filtra i campi, aggiungere `dataAttesa`).

- [ ] **Step 4: Typecheck e suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: puliti. Se `Schedule.dataAttesaSource` obbligatorio rompe fixture di test esistenti, aggiungere il campo alle fixture (mai renderlo opzionale nel tipo).

- [ ] **Step 5: Commit**

```bash
git add src/types/schedule.ts "src/app/(dashboard)/scadenzario/[id]/page.tsx" src/components/scadenzario/create-schedule-sheet.tsx
git commit -m "feat(scadenzario): data attesa visibile e modificabile nel dettaglio"
```

---

### Task 10: Chiusura — suite completa, smoke test, documentazione

**Files:**
- Modify: `docs/Ciclo_Tesoreria_Modello_Sibill.md` (sezione Fase 3)
- Modify: memoria `ciclo-tesoreria-sibill.md` (fuori repo: `/Users/nicolascarpa/.claude/projects/-Users-nicolascarpa-Desktop-accounting/memory/`)

- [ ] **Step 1: Suite completa, typecheck, lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/lib/scadenzario src/app/api/scadenzario src/components/scadenzario "src/app/(dashboard)/scadenzario"`
Expected: tutto verde, zero errori eslint nuovi.

- [ ] **Step 2: Smoke test degli agganci senza copertura**

Con `npm run dev` (o l'app di produzione locale): creare una scadenza passiva per un fornitore con almeno 3 scadenze pagate in ritardo negli ultimi 12 mesi e verificare nel dettaglio la riga "Data attesa … stimata"; generare un'occorrenza da una ricorrenza dello stesso fornitore e rivedere la stima. Se non esistono dati adatti, verificare almeno che la creazione non dia errori (la stima si autoesclude in silenzio).

- [ ] **Step 3: Aggiornare la documentazione**

In `docs/Ciclo_Tesoreria_Modello_Sibill.md`, sezione "Fase 3", sostituire la nota finale («Nota: oggi `dataAttesa` diverge solo alla riconciliazione; la stima preventiva … è il naturale passo successivo, insieme all'esposizione in UI.») con un paragrafo che descrive la stima implementata (mediana ultimi 12 mesi, soglie 3/2, `dataAttesaSource` con gerarchia riconciliazione > manuale > stima, trigger, UI nel dettaglio) e il rimando alla spec. Aggiornare la memoria `ciclo-tesoreria-sibill.md` allo stesso modo.

- [ ] **Step 4: Commit finale**

```bash
git add docs/Ciclo_Tesoreria_Modello_Sibill.md
git commit -m "docs(scadenzario): la stima preventiva della data attesa è implementata"
```

NON pushare: chiedere all'utente.
