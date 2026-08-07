import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { GET } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

const CONTO_V4 = {
  id: 'conto-1',
  code: '20.1.01',
  name: 'Birra fusto',
  type: 'COSTO',
  mastroCode: '20',
  mastroNome: 'Materie prime, sussidiarie e merci',
  gruppoCode: '20.1',
  gruppoNome: 'Beverage alcolico',
  costCenterRule: 'DEFAULT_STR',
  budgetMapping: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.account.findMany).mockResolvedValue([CONTO_V4] as never)
})

describe('GET /api/accounts - retrocompatibilità', () => {
  it('senza parametri restituisce il comportamento invariato: solo isActive nel where', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts')
    await GET(request)

    const chiamata = vi.mocked(prisma.account.findMany).mock.calls[0][0]
    expect(chiamata?.where).toEqual({ isActive: true })
  })

  it('senza parametri il payload include ancora budgetCategory (piattito da budgetMapping)', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts')
    const response = await GET(request)
    const body = await response.json()

    expect(body.accounts[0]).toMatchObject({
      id: 'conto-1',
      code: '20.1.01',
      budgetCategory: null,
    })
    expect(body.accounts[0]).not.toHaveProperty('budgetMapping')
  })

  it('?type= singolo continua a filtrare per tipo esatto', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts?type=COSTO')
    await GET(request)

    const chiamata = vi.mocked(prisma.account.findMany).mock.calls[0][0]
    expect(chiamata?.where).toEqual({ isActive: true, type: 'COSTO' })
  })
})

describe('GET /api/accounts - nuovi parametri', () => {
  it('?types= CSV filtra con un OR sui tipi elencati', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts?types=COSTO,RICAVO')
    await GET(request)

    const chiamata = vi.mocked(prisma.account.findMany).mock.calls[0][0]
    expect(chiamata?.where).toEqual({
      isActive: true,
      type: { in: ['COSTO', 'RICAVO'] },
    })
  })

  it('?types= ha precedenza su ?type= se entrambi presenti', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts?type=ATTIVO&types=COSTO,RICAVO')
    await GET(request)

    const chiamata = vi.mocked(prisma.account.findMany).mock.calls[0][0]
    expect(chiamata?.where).toEqual({
      isActive: true,
      type: { in: ['COSTO', 'RICAVO'] },
    })
  })

  it('?imputable=true filtra solo i conti con mastroCode valorizzato', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts?imputable=true')
    await GET(request)

    const chiamata = vi.mocked(prisma.account.findMany).mock.calls[0][0]
    expect(chiamata?.where).toEqual({
      isActive: true,
      mastroCode: { not: null },
    })
  })

  it('senza ?imputable= il filtro su mastroCode non viene applicato', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts')
    await GET(request)

    const chiamata = vi.mocked(prisma.account.findMany).mock.calls[0][0]
    expect(chiamata?.where).not.toHaveProperty('mastroCode')
  })

  it('il select include sempre i campi di gerarchia e costCenterRule', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts')
    await GET(request)

    const chiamata = vi.mocked(prisma.account.findMany).mock.calls[0][0]
    expect(chiamata?.select).toMatchObject({
      mastroCode: true,
      mastroNome: true,
      gruppoCode: true,
      gruppoNome: true,
      costCenterRule: true,
    })
  })

  it('il payload espone la gerarchia del piano v4', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts?imputable=true')
    const response = await GET(request)
    const body = await response.json()

    expect(body.accounts[0]).toMatchObject({
      mastroCode: '20',
      mastroNome: 'Materie prime, sussidiarie e merci',
      gruppoCode: '20.1',
      gruppoNome: 'Beverage alcolico',
      costCenterRule: 'DEFAULT_STR',
    })
  })
})
