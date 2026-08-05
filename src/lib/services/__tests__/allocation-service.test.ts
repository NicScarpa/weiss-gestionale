import { describe, it, expect, vi, beforeEach } from 'vitest'

// setEntryAllocations è tutto accesso al database: si mocca prisma e si
// osserva cosa scrive. $transaction esegue la callback passando il mock
// stesso come tx (pattern di schedule-reconciliation-service.test.ts).
vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { findFirst: vi.fn(), update: vi.fn() },
    journalEntryAllocation: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    account: { findMany: vi.fn() },
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
import { ripartisciProQuota, setEntryAllocations } from '../allocation-service'

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

describe('setEntryAllocations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.$transaction).mockImplementation(
      async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma)
    )
  })

  it('scrive le fette, il conto dominante e la source split', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
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

  it('array vuoto: rimuove le manuali e ripristina la source manual', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
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
