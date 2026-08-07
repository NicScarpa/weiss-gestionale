import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { GET, POST, PUT } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
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

// Task 18: il form voce (mastro/gruppo/regola CdC) deve poter persistere
// questi campi, non solo leggerli — altrimenti la UI prometterebbe
// un'automazione (creare/modificare una voce del piano v4) che il backend
// scarterebbe silenziosamente.
describe('POST /api/accounts - gerarchia piano v4', () => {
  beforeEach(() => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.account.create).mockResolvedValue(CONTO_V4 as never)
  })

  it('crea il conto con mastro, gruppo e regola CdC dal payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        code: '20.1.06',
        name: 'Nuova voce beverage',
        type: 'COSTO',
        mastroCode: '20',
        mastroNome: 'Materie prime, sussidiarie e merci',
        gruppoCode: '20.1',
        gruppoNome: 'Beverage alcolico',
        costCenterRule: 'OBBLIGATORIO',
      }),
    })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const chiamata = vi.mocked(prisma.account.create).mock.calls[0][0]
    expect(chiamata.data).toMatchObject({
      mastroCode: '20',
      mastroNome: 'Materie prime, sussidiarie e merci',
      gruppoCode: '20.1',
      gruppoNome: 'Beverage alcolico',
      costCenterRule: 'OBBLIGATORIO',
    })
  })

  it('rifiuta un gruppo senza mastro', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        code: '99.01',
        name: 'Voce incoerente',
        type: 'COSTO',
        gruppoCode: '20.1',
        gruppoNome: 'Beverage alcolico',
      }),
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(prisma.account.create).not.toHaveBeenCalled()
  })
})

describe('PUT /api/accounts - gerarchia piano v4', () => {
  beforeEach(() => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 'conto-1',
      code: '20.1.01',
      mastroCode: '20',
      gruppoCode: '20.1',
    } as never)
    vi.mocked(prisma.account.update).mockResolvedValue(CONTO_V4 as never)
  })

  it('aggiorna mastro/gruppo/regola CdC quando presenti nel payload', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'PUT',
      body: JSON.stringify({
        id: 'conto-1',
        mastroCode: '21',
        mastroNome: 'Attrezzatura e beni strumentali minuti',
        gruppoCode: null,
        gruppoNome: null,
        costCenterRule: 'DEFAULT_STR',
      }),
    })
    const response = await PUT(request)

    expect(response.status).toBe(200)
    const chiamata = vi.mocked(prisma.account.update).mock.calls[0][0]
    expect(chiamata.data).toMatchObject({
      mastroCode: '21',
      mastroNome: 'Attrezzatura e beni strumentali minuti',
      gruppoCode: null,
      gruppoNome: null,
      costCenterRule: 'DEFAULT_STR',
    })
  })

  it('rifiuta di impostare un gruppo su un conto che resterebbe senza mastro', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 'conto-1',
      code: '100',
      mastroCode: null,
      gruppoCode: null,
    } as never)

    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'PUT',
      body: JSON.stringify({ id: 'conto-1', gruppoCode: '20.1', gruppoNome: 'Beverage alcolico' }),
    })
    const response = await PUT(request)

    expect(response.status).toBe(400)
    expect(prisma.account.update).not.toHaveBeenCalled()
  })

  it('un PUT che non tocca mastro/gruppo non li invia a Prisma', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'PUT',
      body: JSON.stringify({ id: 'conto-1', name: 'Solo rinomina' }),
    })
    await PUT(request)

    const chiamata = vi.mocked(prisma.account.update).mock.calls[0][0]
    expect(chiamata.data).not.toHaveProperty('mastroCode')
    expect(chiamata.data).not.toHaveProperty('gruppoCode')
  })
})
