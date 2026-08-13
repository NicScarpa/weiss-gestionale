/**
 * Caratterizzazione dell'autorizzazione sulle cinque route di report.
 *
 * Scritta PRIMA della conversione a `withAuth` e volutamente cieca a come il
 * guard è implementato: fissa il comportamento osservabile — chi entra, chi
 * riceve 401, chi riceve 403, e con quale messaggio — così la conversione si
 * misura invece di essere creduta. Se questi test passano identici prima e
 * dopo, la conversione non ha cambiato l'autorizzazione.
 *
 * Che cosa NON coprono: il corpo del report. Qui interessa solo il guard, e il
 * mock di Prisma serve unicamente ad arrivarci oltre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
  getVenue: vi.fn().mockResolvedValue({ id: 'venue-test-123', name: 'Test' }),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Un Prisma che risponde "niente" a qualunque modello e qualunque metodo: le
// route di report ne toccano una decina diversi, ed elencarli renderebbe questo
// file un duplicato della loro implementazione — cioè qualcosa da aggiornare a
// ogni modifica, per una proprietà (il guard) che non dipende da nessuno di essi.
vi.mock('@/lib/prisma', () => {
  const metodo = () =>
    vi.fn().mockImplementation((args?: { _sum?: unknown; _count?: unknown }) =>
      // `aggregate` vuole un oggetto, tutto il resto una lista.
      args && ('_sum' in args || '_count' in args)
        ? Promise.resolve({ _sum: {}, _count: 0 })
        : Promise.resolve([])
    )
  const modello = new Proxy({}, { get: metodo })
  return { prisma: new Proxy({}, { get: () => modello }) }
})

import { auth } from '@/lib/auth'
import { contestoRotta } from '@/test/auth-unitari'

const sessione = (role: string): Session =>
  ({ user: { id: 'u1', role, email: 'x@y.z' } }) as unknown as Session

/** Le cinque route, caricate pigramente: l'import va dopo i mock. */
const ROUTE = [
  { nome: 'analisi-costi', carica: () => import('../analisi-costi/route') },
  { nome: 'confronto-annuale', carica: () => import('../confronto-annuale/route') },
  { nome: 'conto-economico', carica: () => import('../conto-economico/route') },
  { nome: 'incassi-giornalieri', carica: () => import('../incassi-giornalieri/route') },
  { nome: 'riepilogo-mensile', carica: () => import('../riepilogo-mensile/route') },
] as const

const richiesta = (nome: string) =>
  new NextRequest(`http://localhost:3000/api/report/${nome}?anno=2026`)

describe.each(ROUTE)('GET /api/report/$nome — autorizzazione', ({ nome, carica }) => {
  beforeEach(() => {
    vi.mocked(auth).mockReset()
  })

  it('senza sessione risponde 401 "Non autorizzato"', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const { GET } = await carica()

    const res = await GET(richiesta(nome), contestoRotta())

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Non autorizzato' })
  })

  it('con sessione senza utente risponde 401', async () => {
    vi.mocked(auth).mockResolvedValue({} as never)
    const { GET } = await carica()

    expect((await GET(richiesta(nome), contestoRotta())).status).toBe(401)
  })

  it.each(['staff', 'employee', ''])(
    'con ruolo "%s" risponde 403 "Accesso negato"',
    async (role) => {
      vi.mocked(auth).mockResolvedValue(sessione(role) as never)
      const { GET } = await carica()

      const res = await GET(richiesta(nome), contestoRotta())

      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ error: 'Accesso negato' })
    }
  )

  it.each(['admin', 'manager'])('con ruolo "%s" supera il guard', async (role) => {
    vi.mocked(auth).mockResolvedValue(sessione(role) as never)
    const { GET } = await carica()

    const res = await GET(richiesta(nome), contestoRotta())

    // Non si asserisce 200: oltre il guard c'è il report vero, che con un
    // Prisma finto può legittimamente inciampare. Quel che conta — e che la
    // conversione non deve cambiare — è che l'autorizzazione lasci passare.
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})
