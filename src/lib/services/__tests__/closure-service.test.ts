import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateBankDeposit, validateClosure } from '../closure-service'

// Mock delle dipendenze di validateClosure: prisma (findUnique + $transaction),
// la generazione dei movimenti e gli effetti collaterali informativi (audit,
// alert budget). Stesso stile di mock di src/app/api/chiusure/__tests__/route.test.ts.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    dailyClosure: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// La classe è mockata come classe vera, non come funzione: closure-service la
// usa in un `instanceof` per distinguere «la chiusura ha già le sue scritture»
// da un guasto del server, e con un mock qualunque quel ramo non compilerebbe
// a runtime.
vi.mock('@/lib/closure-journal-entries', () => ({
  generateJournalEntriesFromClosure: vi.fn(),
  deleteJournalEntriesForClosure: vi.fn(),
  JournalEntriesAlreadyExistError: class JournalEntriesAlreadyExistError extends Error {
    constructor(
      readonly closureId: string,
      readonly existingEntries: number
    ) {
      super('già registrata')
    }
  },
}))

vi.mock('@/lib/budget/alert-generator', () => ({
  generateAlertsForVenue: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import {
  generateJournalEntriesFromClosure,
  deleteJournalEntriesForClosure,
} from '@/lib/closure-journal-entries'

/**
 * Il versamento in banca è il numero che chiude la giornata: sbagliarlo
 * significa una prima nota che non torna. Prima dell'estrazione del service
 * questa logica viveva dentro la route ed era testabile solo via HTTP.
 */
describe('calculateBankDeposit', () => {
  it('sottrae fondi cassa e uscite dal contante incassato', () => {
    const deposit = calculateBankDeposit(
      [{ cashAmount: 1000, floatAmount: 114 }],
      [{ amount: 50 }]
    )

    expect(deposit).toBe(836)
  })

  it('somma su più postazioni', () => {
    const deposit = calculateBankDeposit(
      [
        { cashAmount: 600, floatAmount: 100 },
        { cashAmount: 400, floatAmount: 50 },
      ],
      [{ amount: 30 }, { amount: 20 }]
    )

    // (600 + 400) - (100 + 50) - (30 + 20)
    expect(deposit).toBe(800)
  })

  it('non restituisce mai un versamento negativo', () => {
    const deposit = calculateBankDeposit(
      [{ cashAmount: 100, floatAmount: 114 }],
      [{ amount: 200 }]
    )

    expect(deposit).toBe(0)
  })

  it('tratta gli importi mancanti come zero', () => {
    const deposit = calculateBankDeposit(
      [
        { cashAmount: null, floatAmount: null },
        { cashAmount: 500, floatAmount: 114 },
      ],
      []
    )

    expect(deposit).toBe(386)
  })

  it('accetta i Decimal di Prisma', () => {
    // Prisma restituisce Decimal, non number: il service deve gestirli
    const decimal = (n: number) => ({ toNumber: () => n })

    const deposit = calculateBankDeposit(
      [{ cashAmount: decimal(1000), floatAmount: decimal(114) }],
      [{ amount: decimal(50) }]
    )

    expect(deposit).toBe(836)
  })

  it('gestisce una giornata senza incassi', () => {
    expect(calculateBankDeposit([], [])).toBe(0)
  })

  it('mantiene la precisione sui centesimi', () => {
    const deposit = calculateBankDeposit(
      [{ cashAmount: 1000.55, floatAmount: 114.05 }],
      [{ amount: 50.25 }]
    )

    expect(deposit).toBeCloseTo(836.25, 2)
  })
})

/**
 * Senza questo controllo, approvare una chiusura con testata vuota fa
 * ricadere in silenzio tutti i movimenti generati sul centro di default del
 * server (STR) invece che su quello scelto dal compilatore — un bug scoperto
 * in review perché né lo zod di creazione (volutamente opzionale, per le
 * bozze storiche) né il `required` di Radix (solo `aria-required`, non
 * bloccante) impediscono di arrivare qui senza un centro.
 */
describe('validateClosure — centro di costo obbligatorio in approvazione', () => {
  const baseClosure = {
    id: 'closure-1',
    status: 'SUBMITTED',
    venueId: 'venue-1',
    date: new Date('2026-08-07'),
    stations: [],
    expenses: [],
    venue: { id: 'venue-1', name: 'Weiss', vatRate: 10 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rifiuta l\'approvazione se la testata non ha un centro di costo, senza toccare la transazione', async () => {
    vi.mocked(prisma.dailyClosure.findUnique).mockResolvedValue({
      ...baseClosure,
      costCenterId: null,
    } as unknown as Awaited<ReturnType<typeof prisma.dailyClosure.findUnique>>)

    const result = await validateClosure({
      closureId: 'closure-1',
      userId: 'user-1',
      action: 'approve',
    })

    expect(result.outcome).toBe('missing_cost_center')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(generateJournalEntriesFromClosure).not.toHaveBeenCalled()
  })

  it('approva normalmente quando la testata ha un centro di costo', async () => {
    vi.mocked(prisma.dailyClosure.findUnique).mockResolvedValue({
      ...baseClosure,
      costCenterId: 'weiss-id',
    } as unknown as Awaited<ReturnType<typeof prisma.dailyClosure.findUnique>>)

    // La presa in carico è un aggiornamento condizionato allo stato INVIATA:
    // `count: 1` dice che questa richiesta ha vinto la corsa e può procedere.
    const txUpdate = vi
      .fn()
      .mockResolvedValue({ id: 'closure-1', status: 'VALIDATED', validatedAt: new Date() })
    vi.mocked(prisma.$transaction).mockImplementation((async (
      fn: (tx: unknown) => Promise<unknown>
    ) =>
      fn({
        dailyClosure: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: txUpdate,
        },
      })) as typeof prisma.$transaction)
    vi.mocked(generateJournalEntriesFromClosure).mockResolvedValue({
      entriesCreated: 5,
      totalDebits: 100,
      totalCredits: 100,
    })

    const result = await validateClosure({
      closureId: 'closure-1',
      userId: 'user-1',
      action: 'approve',
    })

    expect(result.outcome).toBe('approved')
    expect(generateJournalEntriesFromClosure).toHaveBeenCalledWith(
      expect.objectContaining({ costCenterId: 'weiss-id' }),
      'user-1',
      expect.anything()
    )
  })

  it('non blocca il rifiuto (reject) anche se la testata non ha un centro di costo', async () => {
    vi.mocked(prisma.dailyClosure.findUnique).mockResolvedValue({
      ...baseClosure,
      costCenterId: null,
    } as unknown as Awaited<ReturnType<typeof prisma.dailyClosure.findUnique>>)

    const txUpdate = vi.fn().mockResolvedValue({
      id: 'closure-1',
      status: 'DRAFT',
      rejectionNotes: 'Chiusura rifiutata',
    })
    vi.mocked(prisma.$transaction).mockImplementation((async (
      fn: (tx: unknown) => Promise<unknown>
    ) =>
      fn({
        dailyClosure: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: txUpdate,
        },
      })) as typeof prisma.$transaction)
    vi.mocked(deleteJournalEntriesForClosure).mockResolvedValue(0)

    const result = await validateClosure({
      closureId: 'closure-1',
      userId: 'user-1',
      action: 'reject',
    })

    expect(result.outcome).toBe('rejected')
  })
})
