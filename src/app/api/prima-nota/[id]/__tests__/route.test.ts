import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PUT, DELETE } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { findFirst: vi.fn(), update: vi.fn() },
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
import { createAuditLog } from '@/lib/audit'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session
const sessioneManager = { user: { id: 'user-2', role: 'manager' } } as unknown as Session

function putCon(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost:3000/api/prima-nota/entry-1', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id: 'entry-1' }) } }
}

function deleteCon() {
  const request = new NextRequest('http://localhost:3000/api/prima-nota/entry-1', {
    method: 'DELETE',
  })
  return { request, context: { params: Promise.resolve({ id: 'entry-1' }) } }
}

/** Il movimento esistente: conto libero, centro di produzione */
function movimentoEsistente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    closureId: null,
    accountId: 'conto-vecchio',
    costCenterId: 'cc-produzione',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(movimentoEsistente() as never)
  vi.mocked(prisma.journalEntry.update).mockResolvedValue({
    id: 'entry-1', updatedAt: new Date('2026-08-07'),
  } as never)
  vi.mocked(prisma.costCenter.findFirst).mockResolvedValue({
    id: 'cc-str', isDefault: true, isActive: true,
  } as never)
  vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
    id: 'cc-produzione', isActive: true,
  } as never)
})

describe('PUT /api/prima-nota/[id] - rivalidazione del centro di costo', () => {
  it('senza cambio di conto né di centro non si risolve nulla', async () => {
    const { request, context } = putCon({ description: 'Nuova descrizione' })
    const response = await PUT(request, context)

    expect(response.status).toBe(200)
    expect(prisma.costCenter.findUnique).not.toHaveBeenCalled()
    expect(prisma.costCenter.findFirst).not.toHaveBeenCalled()
    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.costCenterId).toBeUndefined()
  })

  it('cambio di conto: si rivaluta col centro che il movimento ha già', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-nuovo', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    const { request, context } = putCon({ accountId: 'conto-nuovo' })
    const response = await PUT(request, context)

    expect(response.status).toBe(200)
    expect(prisma.costCenter.findUnique).toHaveBeenCalledWith({ where: { id: 'cc-produzione' } })
    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.costCenterId).toBe(
      'cc-produzione'
    )
  })

  it('conto OBBLIGATORIO su un movimento senza centro: 400 e nessuna scrittura', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimentoEsistente({ costCenterId: null }) as never
    )
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-nuovo', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    const { request, context } = putCon({ accountId: 'conto-nuovo' })
    const response = await PUT(request, context)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Il conto 620010 — Manutenzioni richiede un centro di costo.')
    expect(body.code).toBe('CENTRO_DI_COSTO_OBBLIGATORIO')
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('togliere il centro (null) su un conto che non lo pretende: torna al default', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-vecchio', code: '710010', name: 'Vendite bar', costCenterRule: 'DEFAULT_STR' },
    ] as never)

    const { request, context } = putCon({ costCenterId: null })
    const response = await PUT(request, context)

    expect(response.status).toBe(200)
    // Il conto da ispezionare è quello che il movimento ha già
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['conto-vecchio'] } } })
    )
    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.costCenterId).toBe('cc-str')
  })

})

describe('PUT /api/prima-nota/[id] - riclassifica admin dei movimenti da chiusura', () => {
  it('senza ruolo admin, la riclassifica è vietata (403) e nulla viene scritto', async () => {
    vi.mocked(auth).mockResolvedValue(sessioneManager as never)
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimentoEsistente({ closureId: 'chiusura-1' }) as never
    )

    const { request, context } = putCon({ accountId: 'conto-nuovo' })
    const response = await PUT(request, context)

    expect(response.status).toBe(403)
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('un campo fuori whitelist (es. debitAmount) è rifiutato con 400, anche da admin', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimentoEsistente({ closureId: 'chiusura-1' }) as never
    )

    const { request, context } = putCon({ accountId: 'conto-nuovo', debitAmount: 100 })
    const response = await PUT(request, context)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('MOVIMENTO_DA_CHIUSURA_SOLO_RICLASSIFICA')
    expect(body.error).toBe(
      'Sui movimenti generati da chiusura si possono modificare solo conto e centro di costo.'
    )
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('riclassifica valida: aggiorna solo conto e centro, e registra l\'audit con before/after', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimentoEsistente({
        closureId: 'chiusura-1',
        accountId: 'conto-vecchio',
        costCenterId: 'cc-produzione',
      }) as never
    )
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-nuovo', isActive: true,
    } as never)
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({
      id: 'entry-1', updatedAt: new Date('2026-08-07'),
    } as never)

    const { request, context } = putCon({ accountId: 'conto-nuovo', costCenterId: 'cc-nuovo' })
    const response = await PUT(request, context)

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { accountId: 'conto-nuovo', costCenterId: 'cc-nuovo' },
      select: { id: true, updatedAt: true },
    })
    expect(createAuditLog).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'UPDATE',
      entityType: 'JournalEntry',
      entityId: 'entry-1',
      venueId: 'venue-test-123',
      oldValues: { accountId: 'conto-vecchio', costCenterId: 'cc-produzione' },
      newValues: { accountId: 'conto-nuovo', costCenterId: 'cc-nuovo' },
    })
  })

  it('nuovo conto OBBLIGATORIO senza centro: 400 anche in riclassifica, nessuna scrittura', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimentoEsistente({ closureId: 'chiusura-1', costCenterId: null }) as never
    )
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-nuovo', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    const { request, context } = putCon({ accountId: 'conto-nuovo' })
    const response = await PUT(request, context)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('CENTRO_DI_COSTO_OBBLIGATORIO')
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/prima-nota/[id] - i movimenti da chiusura restano vietati', () => {
  it('resta vietata anche per l\'admin: la riclassifica non estende il permesso alla cancellazione', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimentoEsistente({ closureId: 'chiusura-1' }) as never
    )

    const { request, context } = deleteCon()
    const response = await DELETE(request, context)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('I movimenti generati da chiusure non sono eliminabili')
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})
