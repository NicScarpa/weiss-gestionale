import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    categorizationRule: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn(), update: vi.fn() },
    account: { findMany: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/accounts/mapping', () => ({
  derivaBudgetCategoryDaConto: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

/** Regola che matcha per keyword e imputa al conto indicato */
function regola(id: string, accountId: string) {
  return {
    id,
    keywords: ['affitto'],
    direction: null,
    accountId,
    budgetCategoryId: null,
    autoVerify: true,
    priority: 0,
  }
}

/** Movimento in uscita, non verificato, senza centro di costo */
function movimento(
  id: string,
  costCenterId: string | null = null,
  costCenterSource: string | null = null
) {
  return {
    id,
    description: 'Affitto locale',
    debitAmount: null,
    creditAmount: 500,
    costCenterId,
    costCenterSource,
  }
}

function richiestaPost() {
  return new NextRequest('http://localhost:3000/api/prima-nota/recategorize', {
    method: 'POST',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.categorizationRule.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as never)
})

describe('POST /api/prima-nota/recategorize - i movimenti suddivisi restano fuori dal batch', () => {
  it('il where esclude i movimenti con fette (allocations: none)', async () => {
    const response = await POST(richiestaPost())

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          allocations: { none: {} },
        }),
      })
    )
  })
})

describe('POST /api/prima-nota/recategorize - i movimenti da chiusura restano fuori dal batch', () => {
  it('il where esclude i movimenti con closureId valorizzato', async () => {
    const response = await POST(richiestaPost())

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          closureId: null,
        }),
      })
    )
  })
})

/**
 * Il batch gira senza nessuno davanti: è il sistema che indovina, come il
 * motore dello scadenzario. Prima le righe il cui conto pretendeva un centro
 * assente venivano saltate e restavano non categorizzate — cioè invisibili.
 * Ora vengono categorizzate sul centro operativo e finiscono fra quelle da
 * approvare, dove almeno si vedono.
 */
describe('POST /api/prima-nota/recategorize - il centro mancante non blocca più la riga', () => {
  beforeEach(() => {
    vi.mocked(prisma.costCenter.findFirst).mockImplementation(
      (async ({ where }: { where: { isDefault?: boolean; code?: string } }) =>
        where.code === 'WEISS'
          ? { id: 'cc-weiss', code: 'WEISS', isDefault: false, isActive: true }
          : where.isDefault
            ? { id: 'cc-str', code: 'STR', isDefault: true, isActive: true }
            : null) as never
    )
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)
  })

  it('la riga senza centro va sul centro operativo e resta da approvare, nonostante autoVerify', async () => {
    vi.mocked(prisma.categorizationRule.findMany).mockResolvedValue([
      regola('rule-obbligatorio', 'conto-obbligatorio'),
    ] as never)
    // Due movimenti che la stessa regola imputa a un conto OBBLIGATORIO: il
    // primo non ha un centro di costo, il secondo sì.
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      movimento('entry-senza-centro'),
      movimento('entry-con-centro', 'cc-produzione'),
    ] as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      {
        id: 'conto-obbligatorio',
        code: '620010',
        name: 'Manutenzioni',
        costCenterRule: 'OBBLIGATORIO',
      },
    ] as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-produzione', isActive: true,
    } as never)

    const response = await POST(richiestaPost())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ processed: 2, updated: 2, daApprovare: 1 })

    // Il centro supposto batte la spunta autoVerify della regola...
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-senza-centro' },
        data: expect.objectContaining({ costCenterId: 'cc-weiss', verified: false }),
      })
    )
    // ...ma dove il centro c'era già, non si è supposto nulla e autoVerify vale.
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-con-centro' },
        data: expect.objectContaining({ costCenterId: 'cc-produzione', verified: true }),
      })
    )
  })

  it('conto con regola DEFAULT_STR: il centro è dettato dal piano, non supposto, e autoVerify resta sovrano', async () => {
    vi.mocked(prisma.categorizationRule.findMany).mockResolvedValue([
      regola('rule-amministrativa', 'conto-consulenze'),
    ] as never)
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      movimento('entry-senza-centro'),
    ] as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      {
        id: 'conto-consulenze',
        code: '240010',
        name: 'Consulenze fiscali',
        costCenterRule: 'DEFAULT_STR',
      },
    ] as never)

    const response = await POST(richiestaPost())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ updated: 1, daApprovare: 0 })
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-str', verified: true }),
      })
    )
  })

  it('il centro supposto all\'import non diventa verificato passando di qui, nonostante autoVerify', async () => {
    // Il difetto che la colonna di provenienza chiude: il movimento importato
    // nasce su WEISS indovinato e non verificato, ed è proprio il candidato
    // che il where di questo batch seleziona. Senza provenienza persistita il
    // centro risulterebbe "già valido" e autoVerify lo promuoverebbe a
    // verificato senza che nessuno lo abbia guardato.
    vi.mocked(prisma.categorizationRule.findMany).mockResolvedValue([
      regola('rule-obbligatorio', 'conto-obbligatorio'),
    ] as never)
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      movimento('entry-importato', 'cc-weiss', 'supposto'),
    ] as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      {
        id: 'conto-obbligatorio',
        code: '620010',
        name: 'Manutenzioni',
        costCenterRule: 'OBBLIGATORIO',
      },
    ] as never)

    const response = await POST(richiestaPost())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ updated: 1, daApprovare: 1 })
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costCenterId: 'cc-weiss',
          costCenterSource: 'supposto',
          verified: false,
        }),
      })
    )
  })

  it('movimento storico su STR con conto obbligatorio: il centro si corregge sul locale e resta da approvare', async () => {
    // Provenienza ignota (movimento anteriore alla colonna): si ricade
    // sull'euristica, e il centro di sistema davanti a un conto operativo è
    // il ripiego di quando il conto non c'era.
    vi.mocked(prisma.categorizationRule.findMany).mockResolvedValue([
      regola('rule-obbligatorio', 'conto-obbligatorio'),
    ] as never)
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      movimento('entry-storico', 'cc-str', null),
    ] as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      {
        id: 'conto-obbligatorio',
        code: '620010',
        name: 'Manutenzioni',
        costCenterRule: 'OBBLIGATORIO',
      },
    ] as never)

    const response = await POST(richiestaPost())

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costCenterId: 'cc-weiss',
          costCenterSource: 'supposto',
          verified: false,
        }),
      })
    )
  })

  it('centro scelto da un umano: non si rivaluta e autoVerify resta valido', async () => {
    vi.mocked(prisma.categorizationRule.findMany).mockResolvedValue([
      regola('rule-obbligatorio', 'conto-obbligatorio'),
    ] as never)
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      movimento('entry-scelto', 'cc-cas', 'scelto'),
    ] as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      {
        id: 'conto-obbligatorio',
        code: '620010',
        name: 'Manutenzioni',
        costCenterRule: 'OBBLIGATORIO',
      },
    ] as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-cas', isActive: true,
    } as never)

    const response = await POST(richiestaPost())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ daApprovare: 0 })
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costCenterId: 'cc-cas',
          costCenterSource: 'scelto',
          verified: true,
        }),
      })
    )
  })

  it('centro del movimento nel frattempo disattivato: la riga si salta, il batch prosegue', async () => {
    vi.mocked(prisma.categorizationRule.findMany).mockResolvedValue([
      regola('rule-obbligatorio', 'conto-obbligatorio'),
    ] as never)
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      movimento('entry-centro-dismesso', 'cc-dismesso', 'scelto'),
    ] as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-dismesso', isActive: false,
    } as never)

    const response = await POST(richiestaPost())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ updated: 0, saltati: 1 })
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })
})
