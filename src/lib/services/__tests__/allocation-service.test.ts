import { describe, it, expect, vi, beforeEach } from 'vitest'

// setEntryAllocations è tutto accesso al database: si mocca prisma e si
// osserva cosa scrive. $transaction esegue la callback passando il mock
// stesso come tx (pattern di schedule-reconciliation-service.test.ts).
//
// `$queryRaw` c'è perché il movimento viene bloccato con `SELECT … FOR UPDATE`
// prima di qualunque decisione: qui la riga risulta sempre trovata, e ciò che
// il lock protegge davvero — due richieste simultanee — sta in
// `allocation-service.itest.ts`, perché su un Prisma finto non esiste nulla da
// contendere.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { findFirst: vi.fn(), update: vi.fn() },
    journalEntryAllocation: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      aggregate: vi.fn(),
    },
    account: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/accounts/mapping', () => ({
  derivaBudgetCategoryDaConto: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import { calcolaPesiDaRighe, ripartisciProQuota, setEntryAllocations } from '../allocation-service'

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

  // La funzione dichiara «la somma restituita è SEMPRE esattamente la quota».
  // Non era vero: l'ultima fetta prendeva il resto, ma se il resto era
  // negativo — perché gli arrotondamenti delle fette precedenti avevano già
  // consumato più della quota — veniva buttato via invece che sottratto, e la
  // somma superava la quota. Il codice non poteva perdere denaro, solo
  // crearne, fino a circa mezzo centesimo per conto.
  describe('la somma è esattamente la quota, sempre', () => {
    const sommaCentesimi = (fette: ReturnType<typeof ripartisciProQuota>) =>
      fette.reduce((s, f) => s + Math.round(f.importo * 100), 0)

    const pesi = (importi: number[]) =>
      importi.map((importo, k) => ({ accountId: `conto-${k}`, importo }))

    it('nove conti di peso identico su cinque centesimi', () => {
      // Ogni fetta esatta varrebbe 5/9 = 0,55… cent, che Math.round porta a 1:
      // le prime otto ne prendevano 8 su una quota che ne valeva 5, e il resto
      // di −3 spariva. 0,08 € contro 0,05 €.
      expect(sommaCentesimi(ripartisciProQuota(pesi([1, 1, 1, 1, 1, 1, 1, 1, 1]), 0.05))).toBe(5)
    })

    it('undici conti con una riga di coda da un centesimo (il caso della relazione)', () => {
      const out = ripartisciProQuota(
        pesi([835.9, 830.73, 806.77, 719.39, 694.6, 547.51, 401.33, 219.16, 214.38, 105.97, 0.01]),
        731.34
      )
      expect(sommaCentesimi(out)).toBe(73134)
    })

    it('gli stessi conti senza la riga di coda: era già a posto e resta a posto', () => {
      const out = ripartisciProQuota(
        pesi([835.9, 830.73, 806.77, 719.39, 694.6, 547.51, 401.33, 219.16, 214.38, 105.97]),
        731.34
      )
      expect(sommaCentesimi(out)).toBe(73134)
    })

    // Il difetto non si trova generando pesi tutti dello stesso ordine di
    // grandezza: serve una coda minuscola accanto a molti conti, ed è il
    // motivo per cui una ricerca su 200.000 combinazioni può dare zero. Il
    // generatore qui sotto la produce di proposito, con un seme fisso perché
    // un fallimento resti riproducibile.
    it('50.000 ripartizioni con una riga di coda: nessuno sbilancio, nessuna fetta negativa', () => {
      let seme = 20260808
      const casuale = () => {
        seme = (seme * 1103515245 + 12345) % 2147483648
        return seme / 2147483648
      }

      const sbilanci: string[] = []
      for (let i = 0; i < 50_000; i++) {
        const conti = 3 + Math.floor(casuale() * 12)
        const importi = Array.from({ length: conti }, () =>
          Math.round((5 + casuale() * 895) * 100) / 100
        )
        importi.push(Math.max(0.01, Math.round(casuale() * 100) / 100))
        const quota = Math.round((50 + casuale() * 2950) * 100) / 100

        const out = ripartisciProQuota(pesi(importi), quota)
        const scarto = sommaCentesimi(out) - Math.round(quota * 100)
        if (scarto !== 0 || out.some((f) => f.importo <= 0)) {
          sbilanci.push(`quota ${quota} su [${importi.join(', ')}] → scarto ${scarto} cent`)
        }
      }

      expect(sbilanci.slice(0, 3)).toEqual([])
    })
  })
})

describe('calcolaPesiDaRighe', () => {
  it('raggruppa per conto, scarta i totali a zero o negativi, ordina per importo decrescente', () => {
    expect(
      calcolaPesiDaRighe([
        { accountId: 'b', importo: 100 },
        { accountId: 'a', importo: 400 },
        { accountId: 'b', importo: 200 },
        { accountId: 'c', importo: 0 },
        { accountId: 'd', importo: -50 },
      ])
    ).toEqual([
      { accountId: 'a', importo: 400 },
      { accountId: 'b', importo: 300 },
    ])
  })
})

describe('setEntryAllocations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.$transaction).mockImplementation(
      async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma)
    )
    // Il `SELECT … FOR UPDATE` di bloccaMovimento trova la riga: senza questo
    // il movimento risulterebbe inesistente in ogni test.
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 'entry-1' }] as never)
    // Di default il movimento non ha fette ereditate: la guardia di
    // quadratura (manuali + ereditate ≤ importo utile) è un no-op silenzioso.
    vi.mocked(prisma.journalEntryAllocation.aggregate).mockResolvedValue({
      _sum: { importo: null },
    } as never)
  })

  it('scrive le fette, il conto dominante e la source split', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // Non c'erano allocazioni manuali preesistenti
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-a', isActive: true }, { id: 'conto-b', isActive: true },
    ] as never)
    // Dentro la transazione, dopo la scrittura, si rileggono TUTTE le fette
    // rimaste: qui simuliamo che siano proprio quelle appena create.
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(700) },
      { accountId: 'conto-b', importo: new Prisma.Decimal(300) },
    ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-a')

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [
        { accountId: 'conto-a', importo: 700, note: 'quota affitto' },
        { accountId: 'conto-b', importo: 300 },
      ],
    })

    expect(esito).toEqual({ outcome: 'ok', allocazioni: 2 })
    expect(prisma.journalEntryAllocation.deleteMany).toHaveBeenCalledWith({
      where: { journalEntryId: 'entry-1', origine: 'manuale' },
    })
    expect(prisma.journalEntryAllocation.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ accountId: 'conto-a', note: 'quota affitto' }),
        expect.objectContaining({ accountId: 'conto-b', note: null }),
      ]),
    })
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

  it("somma oltre l'importo utile: invalid", async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [
        { accountId: 'conto-a', importo: 700 },
        { accountId: 'conto-b', importo: 400 },
      ],
    })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: expect.stringContaining("supera l'importo del movimento"),
    })
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.deleteMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('somma manuali nuove + fette ereditate già a DB oltre l\'importo utile: invalid', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // Il movimento ha già 700 di fette ereditate dalla riconciliazione (Fase 3):
    // da sole le fette manuali proposte (400) starebbero nel limite, ma sommate
    // alle ereditate esistenti sforano l'importo utile.
    vi.mocked(prisma.journalEntryAllocation.aggregate).mockResolvedValue({
      _sum: { importo: new Prisma.Decimal(700) },
    } as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [{ accountId: 'conto-a', importo: 400 }],
    })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: expect.stringContaining("supera l'importo del movimento"),
    })
    expect(prisma.journalEntryAllocation.aggregate).toHaveBeenCalledWith({
      where: { journalEntryId: 'entry-1', origine: 'ereditata' },
      _sum: { importo: true },
    })
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.deleteMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
  })

  it('conto inesistente o non attivo: invalid', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // Ne chiediamo 2, ne torna solo 1: uno dei due conti non esiste o non è attivo.
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-a', isActive: true },
    ] as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [
        { accountId: 'conto-a', importo: 700 },
        { accountId: 'conto-inesistente', importo: 300 },
      ],
    })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: expect.stringContaining('non esistono o non sono attivi'),
    })
    expect(prisma.journalEntryAllocation.deleteMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('array vuoto su movimento SENZA fette manuali preesistenti: no-op', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // deleteMany ritorna count: 0 perché il movimento non aveva allocazioni manuali
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 0 } as never)
    // Nemmeno allocazioni ereditate: findMany non viene nemmeno chiamato in caso di no-op
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([] as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [],
    })

    expect(esito).toEqual({ outcome: 'ok', allocazioni: 0 })
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.deleteMany).toHaveBeenCalledWith({
      where: { journalEntryId: 'entry-1', origine: 'manuale' },
    })
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    // Il movimento non aveva fette manuali, quindi NON deve fare update (no-op)
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('array vuoto: rimuove le manuali e ripristina la source manual', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // deleteMany ritorna count: 1 perché è stato rimosso 1 allocazione manuale
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 1 } as never)
    // Dopo la delete delle manuali non restano più fette (nessuna ereditata).
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([] as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [],
    })

    expect(esito).toEqual({ outcome: 'ok', allocazioni: 0 })
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.deleteMany).toHaveBeenCalledWith({
      where: { journalEntryId: 'entry-1', origine: 'manuale' },
    })
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { categorizationSource: 'manual' },
      })
    )
  })

  it('le fette ereditate non si toccano: il dominante si calcola su tutte', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // C'era una fetta manuale precedente che viene rimossa
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-a', isActive: true },
    ] as never)
    // deleteMany tocca solo le 'manuale': quella 'ereditata' resta e viene
    // riletta insieme alla nuova fetta manuale appena scritta.
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(200) },
      { accountId: 'conto-ereditato', importo: new Prisma.Decimal(800) },
    ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-ereditata')

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [{ accountId: 'conto-a', importo: 200 }],
    })

    expect(esito).toEqual({ outcome: 'ok', allocazioni: 2 })
    expect(prisma.journalEntryAllocation.deleteMany).toHaveBeenCalledWith({
      where: { journalEntryId: 'entry-1', origine: 'manuale' },
    })
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'conto-ereditato', // dominante (800 > 200), non toccata dal delete
          budgetCategoryId: 'cat-ereditata',
          categorizationSource: 'split',
        }),
      })
    )
  })
})
