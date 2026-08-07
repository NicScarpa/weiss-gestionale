import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    shiftAssignment: { findMany: vi.fn() },
  },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function sessioneDi(ruolo: string) {
  return {
    user: { id: 'user-1', email: 'tizio@weisscafe.com', role: ruolo },
    expires: '2099-01-01',
  }
}

function utenteDi(ruolo: string, venueId: string | null = 'venue-1') {
  return { id: 'user-1', venueId, role: { name: ruolo } }
}

function richiesta(query = '?date=2026-08-20') {
  return new NextRequest(`http://localhost/api/attendance/daily-summary${query}`)
}

describe('GET /api/attendance/daily-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.shiftAssignment.findMany).mockResolvedValue([] as never)
  })

  it("lo staff può leggere il riepilogo: è lo staff a compilare la chiusura di cassa", async () => {
    vi.mocked(auth).mockResolvedValue(sessioneDi('staff') as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(utenteDi('staff') as never)

    const res = await GET(richiesta())

    expect(res.status).toBe(200)
  })

  it('per chi non è admin la sede resta la propria, qualunque cosa chieda', async () => {
    vi.mocked(auth).mockResolvedValue(sessioneDi('staff') as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(utenteDi('staff') as never)

    await GET(richiesta('?date=2026-08-20&venueId=venue-di-qualcun-altro'))

    const query = vi.mocked(prisma.shiftAssignment.findMany).mock.calls[0][0] as {
      where: { venueId?: string }
    }
    expect(query.where.venueId).toBe('venue-1')
  })

  it('un ruolo che non esiste non entra', async () => {
    vi.mocked(auth).mockResolvedValue(sessioneDi('ospite') as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(utenteDi('ospite') as never)

    const res = await GET(richiesta())

    expect(res.status).toBe(403)
  })

  it('senza sessione non si legge nulla', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const res = await GET(richiesta())

    expect(res.status).toBe(401)
  })
})
