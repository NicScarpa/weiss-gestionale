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

// Fix round 1 (review Task 18): l'API accettava una voce con code
// scollegato dal mastro/gruppo dichiarati (es. "99.99" dichiarata del
// mastro "20"), perché niente legava il code alla gerarchia scelta.
// L'albero e il report raggruppano per le colonne denormalizzate, non per
// il prefisso del code: una voce incoerente finirebbe silenziosamente nel
// ramo sbagliato.
describe('POST /api/accounts - coerenza code/mastro/gruppo', () => {
  beforeEach(() => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.account.create).mockResolvedValue(CONTO_V4 as never)
  })

  it('un codice coerente col mastro (senza gruppo) viene creato', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        code: '21.08',
        name: 'Nuova voce attrezzatura',
        type: 'COSTO',
        mastroCode: '21',
        mastroNome: 'Attrezzatura e beni strumentali minuti',
      }),
    })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(prisma.account.create).toHaveBeenCalled()
  })

  it('un codice che contraddice il mastro dichiarato viene rifiutato', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        code: '99.99',
        name: 'Voce incoerente',
        type: 'COSTO',
        mastroCode: '20',
        mastroNome: 'Materie prime, sussidiarie e merci',
      }),
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(prisma.account.create).not.toHaveBeenCalled()
  })

  it('un codice che contraddice il gruppo dichiarato viene rifiutato', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        code: '20.3.99',
        name: 'Voce incoerente',
        type: 'COSTO',
        mastroCode: '20',
        mastroNome: 'Materie prime, sussidiarie e merci',
        gruppoCode: '20.1',
        gruppoNome: 'Beverage alcolico',
      }),
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(prisma.account.create).not.toHaveBeenCalled()
  })

  it('un prefisso di stringa ingannevole ("201.01" col mastro "20") viene rifiutato', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        code: '201.01',
        name: 'Voce con codice ambiguo',
        type: 'COSTO',
        mastroCode: '20',
        mastroNome: 'Materie prime, sussidiarie e merci',
      }),
    })
    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(prisma.account.create).not.toHaveBeenCalled()
  })

  it('un codice noto del piano ufficiale con mastro diverso da quello reale viene rifiutato', async () => {
    // "20.1.01" è "Birra fusto" nel piano ufficiale: mastro 20, gruppo 20.1.
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        code: '20.1.01',
        name: 'Birra fusto (duplicato con mastro sbagliato)',
        type: 'COSTO',
        mastroCode: '20',
        mastroNome: 'Materie prime, sussidiarie e merci',
        // gruppo omesso: mastro coerente col prefisso ma non col piano ufficiale, che vuole 20.1.
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

  it('aggiorna mastro/gruppo/regola CdC quando presenti nel payload (con un code coerente col nuovo mastro)', async () => {
    // Il code cambia rispetto all'esistente: la route fa una seconda
    // findUnique (per codice) per la verifica di unicità. Il mock del
    // beforeEach risponderebbe con lo stesso conto per qualunque chiamata,
    // facendo fallire il test con "codice già esistente" — qui la seconda
    // chiamata deve restituire null (nessun altro conto con quel codice).
    vi.mocked(prisma.account.findUnique)
      .mockResolvedValueOnce({ id: 'conto-1', code: '20.1.01', mastroCode: '20', gruppoCode: '20.1' } as never)
      .mockResolvedValueOnce(null as never)

    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'PUT',
      body: JSON.stringify({
        id: 'conto-1',
        // Il conto esistente ha code "20.1.01": spostarlo al mastro 21 senza
        // cambiare code sarebbe proprio l'incoerenza che questo fix chiude,
        // quindi il code cambia in coppia col mastro, come farebbe il form.
        code: '21.01',
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

  it('rifiuta di cambiare il mastro senza aggiornare il code coerentemente', async () => {
    // Stesso scenario del test sopra, ma senza il nuovo code: il conto
    // risultante avrebbe code "20.1.01" (esistente) e mastro "21" (nuovo).
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'PUT',
      body: JSON.stringify({
        id: 'conto-1',
        mastroCode: '21',
        mastroNome: 'Attrezzatura e beni strumentali minuti',
        gruppoCode: null,
        gruppoNome: null,
      }),
    })
    const response = await PUT(request)

    expect(response.status).toBe(400)
    expect(prisma.account.update).not.toHaveBeenCalled()
  })

  it('rifiuta un prefisso di stringa ingannevole sullo stato risultante ("201.01" col mastro "20")', async () => {
    const request = new NextRequest('http://localhost:3000/api/accounts', {
      method: 'PUT',
      body: JSON.stringify({ id: 'conto-1', code: '201.01' }),
    })
    const response = await PUT(request)

    expect(response.status).toBe(400)
    expect(prisma.account.update).not.toHaveBeenCalled()
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
