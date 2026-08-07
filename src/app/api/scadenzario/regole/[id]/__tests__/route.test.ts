import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PATCH } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    scheduleRule: { findUnique: vi.fn(), update: vi.fn() },
    account: { findUnique: vi.fn() },
    costCenter: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/venue', () => ({ getVenueId: vi.fn() }))

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function esistente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'regola-1',
    venueId: 'venue-1',
    tipoDocumento: 'TD01',
    tipoPagamento: null,
    contoId: null,
    costCenterId: null,
    ...overrides,
  }
}

function patchCon(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost:3000/api/scadenzario/regole/regola-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id: 'regola-1' }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.scheduleRule.update).mockResolvedValue({ id: 'regola-1' } as never)
})

describe('PATCH /api/scadenzario/regole/[id] - centro di costo (Task 13)', () => {
  it('aggiorna il centro di costo quando il nuovo centro esiste ed è attivo', async () => {
    vi.mocked(prisma.scheduleRule.findUnique).mockResolvedValue(esistente() as never)
    vi.mocked(prisma.costCenter.findFirst).mockResolvedValue({ id: 'cc-vv', isActive: true } as never)

    const { request, context } = patchCon({ costCenterId: 'cc-vv' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.scheduleRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-vv' }),
      })
    )
  })

  it('rifiuta con 404 se il nuovo centro di costo non esiste o è disattivato', async () => {
    vi.mocked(prisma.scheduleRule.findUnique).mockResolvedValue(esistente() as never)
    vi.mocked(prisma.costCenter.findFirst).mockResolvedValue(null)

    const { request, context } = patchCon({ costCenterId: 'cc-inesistente' })
    const response = await PATCH(request, context)
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toContain('Centro di costo')
    expect(prisma.scheduleRule.update).not.toHaveBeenCalled()
  })

  it('azzerare il centro (costCenterId null) non verifica alcun centro e passa', async () => {
    vi.mocked(prisma.scheduleRule.findUnique).mockResolvedValue(esistente({ costCenterId: 'cc-vv' }) as never)

    const { request, context } = patchCon({ costCenterId: null })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.costCenter.findFirst).not.toHaveBeenCalled()
    expect(prisma.scheduleRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: null }),
      })
    )
  })

  it('se il centro indicato è lo stesso già assegnato, non lo riverifica', async () => {
    vi.mocked(prisma.scheduleRule.findUnique).mockResolvedValue(esistente({ costCenterId: 'cc-vv' }) as never)

    const { request, context } = patchCon({ costCenterId: 'cc-vv' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.costCenter.findFirst).not.toHaveBeenCalled()
  })
})
