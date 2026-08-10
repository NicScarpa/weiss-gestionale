import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { GET, POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    account: { findMany: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function postCon(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/prima-nota', {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-08-07',
      registerType: 'BANK',
      entryType: 'USCITA',
      amount: 100,
      description: 'Riparazione impianto',
      ...body,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.journalEntry.create).mockResolvedValue({
    id: 'entry-1', debitAmount: null, creditAmount: 100, vatAmount: null,
  } as never)
  vi.mocked(prisma.costCenter.findFirst).mockResolvedValue({
    id: 'cc-str', isDefault: true, isActive: true,
  } as never)
})

describe('POST /api/prima-nota - centro di costo del movimento', () => {
  it('senza conto il movimento nasce sul centro di default', async () => {
    const response = await POST(postCon({}))

    expect(response.status).toBe(201)
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-str' }),
      })
    )
    // Nessun conto da ispezionare: si va dritti al default
    expect(prisma.account.findMany).not.toHaveBeenCalled()
  })

  it('conto OBBLIGATORIO senza centro: 400 con motivo e code, nessuna scrittura', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    const response = await POST(postCon({ accountId: 'conto-1' }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Il conto 620010 — Manutenzioni richiede un centro di costo.')
    expect(body.code).toBe('CENTRO_DI_COSTO_OBBLIGATORIO')
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
  })

  it('conto OBBLIGATORIO con centro esplicito: il movimento nasce su quel centro', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-produzione', isActive: true,
    } as never)

    const response = await POST(postCon({ accountId: 'conto-1', costCenterId: 'cc-produzione' }))

    expect(response.status).toBe(201)
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'conto-1',
          costCenterId: 'cc-produzione',
        }),
      })
    )
  })

  it('centro disattivato: 400 CENTRO_DI_COSTO_NON_VALIDO', async () => {
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-chiuso', isActive: false,
    } as never)

    const response = await POST(postCon({ costCenterId: 'cc-chiuso' }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('CENTRO_DI_COSTO_NON_VALIDO')
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
  })
})

// Regressione (Task 13, fix round 1): il payload di GET aveva smesso di
// restituire costCenterId (il campo scalare arrivava da Prisma ma la riga
// in formattedEntries mancava). Se questa riga sparisse di nuovo, riaprire
// un movimento in modifica sovrascriverebbe in silenzio un centro già
// salvato con il default — il comportamento che la spec vieta.
describe('GET /api/prima-nota - costCenterId nel payload (regressione)', () => {
  function entryConCentro(overrides: Record<string, unknown> = {}) {
    return {
      id: 'entry-1',
      venueId: 'venue-test-123',
      date: new Date('2026-08-01'),
      registerType: 'BANK',
      description: 'Fattura fornitore',
      debitAmount: null,
      creditAmount: 100,
      vatAmount: null,
      accountId: 'conto-1',
      costCenterId: 'cc-vv',
      closureId: null,
      runningBalance: null,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
      verified: false,
      hiddenAt: null,
      categorizationSource: 'manual',
      counterpartName: null,
      notes: null,
      budgetCategoryId: null,
      appliedRuleId: null,
      venue: null,
      account: null,
      budgetCategory: null,
      appliedRule: null,
      closure: null,
      createdBy: null,
      allocations: [],
      ...overrides,
    }
  }

  it('ogni voce della lista include costCenterId', async () => {
    vi.mocked(prisma.journalEntry.findMany)
      // `as never`: il fixture porta i soli campi che il test guarda, non
      // tutti quelli del modello. Pattern già in uso nel resto della suite.
      .mockResolvedValueOnce([entryConCentro()] as never) // entries (con include)
      .mockResolvedValueOnce([]) // allEntries (solo per i totali)
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(1)

    const response = await GET(new NextRequest('http://localhost:3000/api/prima-nota'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toHaveLength(1)
    expect(json.data[0].costCenterId).toBe('cc-vv')
  })

  it('include la relazione costCenter (code/name) per la colonna "Centro"', async () => {
    vi.mocked(prisma.journalEntry.findMany)
      .mockResolvedValueOnce([
        entryConCentro({ costCenter: { id: 'cc-vv', code: 'VV', name: 'Villa Varda' } }),
      ] as never)
      .mockResolvedValueOnce([])
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(1)

    const response = await GET(new NextRequest('http://localhost:3000/api/prima-nota'))
    const json = await response.json()

    expect(json.data[0].costCenter).toEqual({ id: 'cc-vv', code: 'VV', name: 'Villa Varda' })
  })
})

// Task 16: filtro per centro di costo nella lista movimenti.
describe('GET /api/prima-nota - filtro ?costCenterId=', () => {
  beforeEach(() => {
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([])
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(0)
  })

  it('con costCenterId valorizzato, lo passa nel where della query', async () => {
    await GET(new NextRequest('http://localhost:3000/api/prima-nota?costCenterId=cc-vv'))

    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ costCenterId: 'cc-vv' }),
      })
    )
  })

  it('senza il parametro, il comportamento è invariato (nessun filtro sul centro)', async () => {
    await GET(new NextRequest('http://localhost:3000/api/prima-nota'))

    const callArgs = vi.mocked(prisma.journalEntry.findMany).mock.calls[0][0]
    expect(callArgs.where).not.toHaveProperty('costCenterId')
  })
})
