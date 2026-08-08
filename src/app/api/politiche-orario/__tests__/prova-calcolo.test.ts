import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { authDiRoute } from '@/test/auth-unitari'
import { POST } from '../prova-calcolo/route'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

const regolaBase = {
  name: 'Full time',
  isDefault: false,
  isActive: true,
  dayStartMinutes: 9 * 60,
  dayEndMinutes: 18 * 60,
  lunchStartMinutes: 13 * 60,
  lunchEndMinutes: 14 * 60,
  lunchWindowMinutes: 30,
  flexMinutes: 0,
  roundingMinutes: 1,
  roundingToleranceMinutes: 0,
  roundingOutMinutes: null,
  roundingOutToleranceMinutes: null,
  maxDailyMinutes: null,
  contractWeeklyHours: null,
  saturdayAsOvertime: false,
  blockSunday: false,
  singlePunchMode: false,
  extraBreaks: [],
}

function richiesta(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/politiche-orario/prova-calcolo', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authDiRoute).mockResolvedValue(sessione)
})

describe('POST /api/politiche-orario/prova-calcolo', () => {
  it('restituisce le ore riconosciute con i passaggi del calcolo', async () => {
    const response = await POST(
      richiesta({
        policy: regolaBase,
        clockInMinutes: 9 * 60,
        clockOutMinutes: 18 * 60,
      })
    )
    const { data } = await response.json()

    expect(response.status).toBe(200)
    expect(data.workedMinutes).toBe(8 * 60)
    expect(data.steps.length).toBeGreaterThan(0)
  })

  it('interpreta come turno serale l uscita che precede l entrata', async () => {
    const response = await POST(
      richiesta({
        policy: {
          ...regolaBase,
          dayStartMinutes: 18 * 60,
          dayEndMinutes: 3 * 60,
          lunchStartMinutes: null,
          lunchEndMinutes: null,
        },
        clockInMinutes: 21 * 60,
        clockOutMinutes: 2 * 60,
      })
    )
    const { data } = await response.json()

    expect(data.workedMinutes).toBe(5 * 60)
    expect(data.nightMinutes).toBe(4 * 60)
  })

  it('applica gli arrotondamenti configurati nella bozza', async () => {
    const response = await POST(
      richiesta({
        policy: {
          ...regolaBase,
          flexMinutes: 30,
          roundingMinutes: 30,
          roundingToleranceMinutes: 5,
        },
        clockInMinutes: 9 * 60 + 6,
        clockOutMinutes: 18 * 60,
      })
    )
    const { data } = await response.json()

    expect(data.clockIn).toBe(9 * 60 + 30)
    expect(data.workedMinutes).toBe(7 * 60 + 30)
  })

  it('rifiuta una bozza con la tolleranza più grande dell intervallo', async () => {
    const response = await POST(
      richiesta({
        policy: { ...regolaBase, roundingMinutes: 15, roundingToleranceMinutes: 20 },
        clockInMinutes: 9 * 60,
        clockOutMinutes: 18 * 60,
      })
    )

    expect(response.status).toBe(400)
  })

  it('nega l accesso a chi non è amministratore', async () => {
    vi.mocked(authDiRoute).mockResolvedValue({
      user: { id: 'user-2', role: 'staff' },
    } as unknown as Session)

    const response = await POST(
      richiesta({
        policy: regolaBase,
        clockInMinutes: 9 * 60,
        clockOutMinutes: 18 * 60,
      })
    )

    expect(response.status).toBe(403)
  })
})
