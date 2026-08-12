import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { Prisma } from '@prisma/client'
import { GET } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    electronicInvoice: { findFirst: vi.fn() },
    invoiceLineAccount: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/sdi/parser', () => ({
  parseFatturaPA: vi.fn(),
  TIPI_DOCUMENTO: { TD01: 'Fattura' },
}))

import { authDiRoute } from '@/test/auth-unitari'
import { prisma } from '@/lib/prisma'
import { parseFatturaPA } from '@/lib/sdi/parser'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

const fatturaEsistente = {
  id: 'fatt-1',
  venueId: 'venue-test-123',
  xmlContent: '<xml>contenuto</xml>',
}

function richiesta(id = 'fatt-1') {
  const request = new NextRequest(`http://localhost:3000/api/invoices/${id}`)
  return { request, context: { params: Promise.resolve({ id }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
  vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
  vi.mocked(parseFatturaPA).mockReturnValue({
    dettaglioLinee: [{ numeroLinea: 1, descrizione: 'Detersivi e tovaglioli', prezzoTotale: 100 }],
  } as never)
})

describe('GET /api/invoices/[id]: righe divise nella risposta', () => {
  it('interroga invoiceLineAccount ordinando per progressivo crescente', async () => {
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([] as never)

    const { request, context } = richiesta()
    await GET(request, context)

    expect(prisma.invoiceLineAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { progressivo: 'asc' } })
    )
  })

  it('riga divisa: imputazione resta la quota col progressivo più basso, imputazioni porta tutte le quote', async () => {
    // Il mock torna già ordinato (0, poi 1): è quello che orderBy garantisce
    // in produzione. Il codice si fida di quell'ordine, non lo ricalcola.
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      {
        numeroLinea: 1,
        progressivo: 0,
        accountId: 'conto-detersivi',
        importo: new Prisma.Decimal(60),
        stato: 'confermata',
        fonte: 'manuale',
        confidence: null,
        motivazioneAi: null,
      },
      {
        numeroLinea: 1,
        progressivo: 1,
        accountId: 'conto-tovaglioli',
        importo: new Prisma.Decimal(40),
        stato: 'confermata',
        fonte: 'manuale',
        confidence: null,
        motivazioneAi: null,
      },
    ] as never)

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    const riga = data.parsedData.dettaglioLinee[0]
    expect(riga.imputazione).toEqual(
      expect.objectContaining({ accountId: 'conto-detersivi', stato: 'confermata' })
    )
    expect(riga.imputazioni).toEqual([
      expect.objectContaining({ progressivo: 0, accountId: 'conto-detersivi', importo: 60 }),
      expect.objectContaining({ progressivo: 1, accountId: 'conto-tovaglioli', importo: 40 }),
    ])
  })

  it('riga con la sola quota al progressivo 1 (la quota 0 è stata rimossa): imputazione la usa comunque, non torna null', async () => {
    // Caso limite dopo la revisione del Task 5: una richiesta autorevole può
    // lasciare una riga con l'unica quota superstite a un progressivo diverso
    // da 0. `imputazione` deve seguirla, non sparire.
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      {
        numeroLinea: 1,
        progressivo: 1,
        accountId: 'conto-tovaglioli',
        importo: new Prisma.Decimal(100),
        stato: 'confermata',
        fonte: 'manuale',
        confidence: null,
        motivazioneAi: null,
      },
    ] as never)

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    const riga = data.parsedData.dettaglioLinee[0]
    expect(riga.imputazione).toEqual(
      expect.objectContaining({ accountId: 'conto-tovaglioli' })
    )
    expect(riga.imputazioni).toHaveLength(1)
  })

  it('riga senza imputazioni: imputazione è null, imputazioni è un array vuoto', async () => {
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([] as never)

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    const riga = data.parsedData.dettaglioLinee[0]
    expect(riga.imputazione).toBeNull()
    expect(riga.imputazioni).toEqual([])
  })
})
