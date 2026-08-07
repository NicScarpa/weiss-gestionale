import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    bankAccount: { findFirst: vi.fn() },
    costCenter: { findFirst: vi.fn() },
    scheduleRule: { aggregate: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@/lib/venue', () => ({ getVenueId: vi.fn() }))

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function postCon(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/scadenzario/regole', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const bodyBase = {
  direzione: 'ricevuti',
  tipoDocumento: 'TD01',
  bankAccountId: 'banca-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(getVenueId).mockResolvedValue('venue-1')
  vi.mocked(prisma.bankAccount.findFirst).mockResolvedValue({ id: 'banca-1' } as never)
  vi.mocked(prisma.scheduleRule.aggregate).mockResolvedValue({ _max: { ordine: null } } as never)
  vi.mocked(prisma.scheduleRule.create).mockResolvedValue({ id: 'regola-1' } as never)
})

describe('POST /api/scadenzario/regole - centro di costo (Task 13)', () => {
  it('crea la regola con il centro di costo quando esiste ed è attivo', async () => {
    vi.mocked(prisma.costCenter.findFirst).mockResolvedValue({ id: 'cc-weiss', isActive: true } as never)

    const response = await POST(postCon({ ...bodyBase, costCenterId: 'cc-weiss' }))

    expect(response.status).toBe(201)
    expect(prisma.scheduleRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-weiss' }),
      })
    )
  })

  it('rifiuta con 404 se il centro di costo indicato non esiste o è disattivato', async () => {
    vi.mocked(prisma.costCenter.findFirst).mockResolvedValue(null)

    const response = await POST(postCon({ ...bodyBase, costCenterId: 'cc-inesistente' }))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toContain('Centro di costo')
    expect(prisma.scheduleRule.create).not.toHaveBeenCalled()
  })

  it('senza costCenterId non verifica alcun centro e crea la regola con costCenterId null', async () => {
    const response = await POST(postCon(bodyBase))

    expect(response.status).toBe(201)
    expect(prisma.costCenter.findFirst).not.toHaveBeenCalled()
    expect(prisma.scheduleRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: null }),
      })
    )
  })
})
