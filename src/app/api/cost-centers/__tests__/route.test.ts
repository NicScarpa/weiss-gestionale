import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Session } from 'next-auth'
import { GET } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    costCenter: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessioneSenzaRuolo = { user: { id: 'user-1', role: 'employee' } } as unknown as Session

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/cost-centers', () => {
  it('senza sessione risponde 401', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
    expect(prisma.costCenter.findMany).not.toHaveBeenCalled()
  })

  it('non richiede un ruolo particolare: un utente non admin riceve comunque la lista', async () => {
    vi.mocked(auth).mockResolvedValue(sessioneSenzaRuolo as never)
    vi.mocked(prisma.costCenter.findMany).mockResolvedValue([] as never)

    const response = await GET()

    expect(response.status).toBe(200)
  })

  it('filtra solo i centri attivi, ordinati per code, e restituisce { costCenters }', async () => {
    vi.mocked(auth).mockResolvedValue(sessioneSenzaRuolo as never)
    vi.mocked(prisma.costCenter.findMany).mockResolvedValue([
      { id: 'cc-str', code: 'STR', name: 'Struttura', isDefault: true },
      { id: 'cc-weiss', code: 'WEISS', name: 'Weiss', isDefault: false },
    ] as never)

    const response = await GET()
    const body = await response.json()

    expect(prisma.costCenter.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, code: true, name: true, isDefault: true },
      orderBy: { code: 'asc' },
    })
    expect(body).toEqual({
      costCenters: [
        { id: 'cc-str', code: 'STR', name: 'Struttura', isDefault: true },
        { id: 'cc-weiss', code: 'WEISS', name: 'Weiss', isDefault: false },
      ],
    })
  })
})
