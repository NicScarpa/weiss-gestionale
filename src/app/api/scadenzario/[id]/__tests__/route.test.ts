import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PATCH } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    supplier: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/scadenzario/stima-data-attesa', () => ({
  applicaStimaSuScadenza: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applicaStimaSuScadenza } from '@/lib/scadenzario/stima-data-attesa'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function esistente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    venueId: 'venue-1',
    tipo: 'passiva',
    dataAttesaSource: null,
    ...overrides,
  }
}

function patchCon(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost:3000/api/scadenzario/sched-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id: 'sched-1' }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
})

describe('PATCH /api/scadenzario/[id] - data attesa manuale', () => {
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
})
