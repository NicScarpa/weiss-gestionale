import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { GET } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { findMany: vi.fn() },
    costCenter: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { authDiRoute } from '@/test/auth-unitari'
import { prisma } from '@/lib/prisma'

const sessioneAdmin = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

const CENTRI = [
  { id: 'cc-str', code: 'STR', name: 'Strada' },
  { id: 'cc-weiss', code: 'WEISS', name: 'Weiss' },
]

const RICAVO = {
  id: 'acc-ricavo',
  code: '10.01',
  name: 'Corrispettivi',
  type: 'RICAVO',
  mastroCode: '10',
  mastroNome: 'Ricavi',
  gruppoCode: null,
  gruppoNome: null,
}

const COSTO = {
  id: 'acc-costo',
  code: '20.1.01',
  name: 'Birra',
  type: 'COSTO',
  mastroCode: '20',
  mastroNome: 'Costi',
  gruppoCode: '20.1',
  gruppoNome: 'Beverage',
}

/**
 * Fixture di quadratura: mescola movimento semplice, movimento suddiviso in
 * fette, movimento senza conto e movimento senza centro. Ogni importo è
 * calcolato a mano nel test — vedi il commento sopra l'asserzione finale.
 */
const MOVIMENTI = [
  // Ricavo semplice, colonna STR: avere 1000 - dare 0 = +1000
  {
    id: 'mov-1',
    accountId: RICAVO.id,
    account: RICAVO,
    costCenter: { code: 'STR' },
    debitAmount: null,
    creditAmount: 1000,
    allocations: [],
  },
  // Costo semplice, colonna WEISS: dare 300 - avere 0 = +300 (costo)
  {
    id: 'mov-2',
    accountId: COSTO.id,
    account: COSTO,
    costCenter: { code: 'WEISS' },
    debitAmount: 300,
    creditAmount: null,
    allocations: [],
  },
  // Movimento suddiviso in due fette (entrambe sullo stesso conto costo),
  // colonna STR ereditata dalla testata: le fette vincono, 300 + 200 = 500 = debitAmount
  {
    id: 'mov-3',
    accountId: null,
    account: null,
    costCenter: { code: 'STR' },
    debitAmount: 500,
    creditAmount: null,
    allocations: [
      { accountId: COSTO.id, account: COSTO, importo: 300 },
      { accountId: COSTO.id, account: COSTO, importo: 200 },
    ],
  },
  // Senza conto, colonna WEISS: netto avere - dare = 150 - 0 = 150
  {
    id: 'mov-4',
    accountId: null,
    account: null,
    costCenter: { code: 'WEISS' },
    debitAmount: null,
    creditAmount: 150,
    allocations: [],
  },
  // Ricavo senza centro, colonna UNASSIGNED: avere 80 - dare 0 = +80
  {
    id: 'mov-5',
    accountId: RICAVO.id,
    account: RICAVO,
    costCenter: null,
    debitAmount: null,
    creditAmount: 80,
    allocations: [],
  },
]

function getRequest(query = '') {
  return new NextRequest(`http://localhost:3000/api/report/conto-economico${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authDiRoute).mockResolvedValue(sessioneAdmin as never)
  vi.mocked(prisma.journalEntry.findMany).mockResolvedValue(MOVIMENTI as never)
  vi.mocked(prisma.costCenter.findMany).mockResolvedValue(CENTRI as never)
})

describe('GET /api/report/conto-economico - autorizzazione', () => {
  it('senza sessione risponde 401', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(null)

    const response = await GET(getRequest())

    expect(response.status).toBe(401)
    expect(prisma.journalEntry.findMany).not.toHaveBeenCalled()
  })

  it('con ruolo non ammesso risponde 403', async () => {
    vi.mocked(authDiRoute).mockResolvedValue({
      user: { id: 'user-2', role: 'staff' },
    } as unknown as Session as never)

    const response = await GET(getRequest())

    expect(response.status).toBe(403)
    expect(prisma.journalEntry.findMany).not.toHaveBeenCalled()
  })

  it('admin e manager sono entrambi ammessi', async () => {
    vi.mocked(authDiRoute).mockResolvedValue({
      user: { id: 'user-3', role: 'manager' },
    } as unknown as Session as never)

    const response = await GET(getRequest())

    expect(response.status).toBe(200)
  })
})

describe('GET /api/report/conto-economico - forma della risposta', () => {
  it('espone period, costCenters e l\'output dell\'aggregatore', async () => {
    const response = await GET(getRequest('?dateFrom=2026-01-01&dateTo=2026-12-31'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.period).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(body.costCenters).toEqual(CENTRI)
    expect(Array.isArray(body.rows)).toBe(true)
    expect(body.senzaContoNetto).toBeTypeOf('object')
    expect(body.totals).toEqual(
      expect.objectContaining({ ricavi: expect.any(Number), costi: expect.any(Number), margine: expect.any(Number) })
    )
    expect(body.totalsPerColonna).toBeTypeOf('object')
    expect(body.totalsPerColonna.STR).toEqual(
      expect.objectContaining({ ricavi: expect.any(Number), costi: expect.any(Number), margine: expect.any(Number) })
    )
  })

  it('senza dateFrom/dateTo usa l\'anno corrente come default', async () => {
    const response = await GET(getRequest())
    const body = await response.json()

    const annoCorrente = new Date().getFullYear()
    expect(response.status).toBe(200)
    expect(body.period.from).toBe(`${annoCorrente}-01-01`)
    expect(body.period.to).toBe(`${annoCorrente}-12-31`)
  })

  it('filtra i movimenti per venue, registri di cassa/banca e periodo, e passa id in select', async () => {
    await GET(getRequest('?dateFrom=2026-01-01&dateTo=2026-12-31'))

    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          venueId: 'venue-test-123',
          registerType: { in: ['CASH', 'BANK'] },
          date: expect.objectContaining({
            gte: new Date('2026-01-01'),
            lte: new Date('2026-12-31'),
          }),
        }),
        select: expect.objectContaining({
          account: expect.objectContaining({
            select: expect.objectContaining({ id: true }),
          }),
          allocations: expect.objectContaining({
            select: expect.objectContaining({
              account: expect.objectContaining({
                select: expect.objectContaining({ id: true }),
              }),
            }),
          }),
        }),
      })
    )
  })
})

describe('GET /api/report/conto-economico - quadratura', () => {
  it('margine + senzaContoNetto per colonna corrisponde al netto avere-dare dei movimenti', async () => {
    const response = await GET(getRequest('?dateFrom=2026-01-01&dateTo=2026-12-31'))
    const body = await response.json()

    // Righe attese, calcolate a mano dal fixture:
    // RICAVO 10.01: STR 1000 (mov-1), UNASSIGNED 80 (mov-5) -> total 1080
    // COSTO 20.1.01: STR 500 (fette mov-3), WEISS 300 (mov-2) -> total 800
    const ricavoRow = body.rows.find((r: { code: string }) => r.code === '10.01')
    const costoRow = body.rows.find((r: { code: string }) => r.code === '20.1.01')

    expect(ricavoRow.amounts).toEqual(expect.objectContaining({ STR: 1000, UNASSIGNED: 80 }))
    expect(ricavoRow.total).toBe(1080)
    expect(costoRow.amounts).toEqual(expect.objectContaining({ STR: 500, WEISS: 300 }))
    expect(costoRow.total).toBe(800)

    // senzaContoNetto: solo WEISS (mov-4), netto avere-dare = 150
    expect(body.senzaContoNetto).toEqual(expect.objectContaining({ WEISS: 150 }))

    // Totali generali: ricavi 1080, costi 800, margine 280
    expect(body.totals).toEqual({ ricavi: 1080, costi: 800, margine: 280 })

    // L'invariante dell'aggregatore, verificato qui end-to-end sulla route:
    // margine + Σ senzaContoNetto deve coincidere col netto avere-dare di
    // TUTTI i movimenti in ingresso (classificati e non), calcolato dal
    // fixture stesso, indipendentemente da come la route li ha aggregati.
    const nettoAttesoDaiMovimenti = MOVIMENTI.reduce((somma, m) => {
      if (m.allocations.length > 0) {
        // Le fette valgono quanto il lato valorizzato della testata: qui è
        // tutto dare, quindi contribuiscono negativamente come un costo.
        // Somma esplicita invece di `reduce`: nel fixture `allocations` è un
        // tipo unione (vuoto su alcuni movimenti, valorizzato su altri) e su
        // una unione di array TypeScript non risolve l'overload di reduce.
        let totaleFette = 0
        for (const f of m.allocations) totaleFette += f.importo
        return somma - totaleFette
      }
      return somma + (Number(m.creditAmount) || 0) - (Number(m.debitAmount) || 0)
    }, 0)
    expect(nettoAttesoDaiMovimenti).toBe(1000 - 300 - 500 + 150 + 80)

    const sommaSenzaContoNetto = Object.values(body.senzaContoNetto as Record<string, number>).reduce(
      (s, v) => s + v,
      0
    )
    expect(body.totals.margine + sommaSenzaContoNetto).toBe(nettoAttesoDaiMovimenti)

    // Anche colonna per colonna: STR e WEISS
    expect(
      body.totalsPerColonna.STR.margine + (body.senzaContoNetto.STR ?? 0)
    ).toBe(1000 - 500) // mov-1 (+1000) e le fette di mov-3 (-500), niente senzaConto su STR
    expect(
      body.totalsPerColonna.WEISS.margine + (body.senzaContoNetto.WEISS ?? 0)
    ).toBe(-300 + 150) // mov-2 (-300 come costo) e mov-4 senza conto (+150)
  })
})
