import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PATCH } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    electronicInvoice: { findFirst: vi.fn() },
    invoiceLineAccount: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    account: { findMany: vi.fn() },
    supplierProductAccount: { upsert: vi.fn() },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/sdi/parser', () => ({
  parseFatturaPA: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { parseFatturaPA } from '@/lib/sdi/parser'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

const fatturaEsistente = {
  id: 'fatt-1',
  venueId: 'venue-test-123',
  xmlContent: '<xml>contenuto</xml>',
  supplierId: 'fornitore-1',
}

const fatturaSenzaFornitore = {
  id: 'fatt-1',
  venueId: 'venue-test-123',
  xmlContent: '<xml>contenuto</xml>',
  supplierId: null,
}

const dettaglioLineeFisse = [
  {
    numeroLinea: 1,
    descrizione: 'Farina 00',
    prezzoUnitario: 25.5,
    prezzoTotale: 25.5,
    aliquotaIVA: 4,
    codiceArticolo: 'ABC123',
  },
  { numeroLinea: 2, descrizione: 'Zucchero', prezzoUnitario: 10, prezzoTotale: 10, aliquotaIVA: 4 },
]

function richiesta(body: Record<string, unknown>, id = 'fatt-1') {
  const request = new NextRequest(`http://localhost:3000/api/invoices/${id}/righe-conti`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(parseFatturaPA).mockReturnValue({
    dettaglioLinee: dettaglioLineeFisse,
  } as never)
  vi.mocked(prisma.account.findMany).mockResolvedValue([{ id: 'conto-1', type: 'COSTO' }] as never)
  vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.supplierProductAccount.upsert).mockResolvedValue({} as never)
})

describe('PATCH /api/invoices/[id]/righe-conti', () => {
  it('rifiuta chi non è autenticato', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 1, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(401)
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
  })

  it('rifiuta i ruoli senza accesso ai dati finanziari', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-2', role: 'staff' } } as never)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 1, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(403)
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
  })

  it('404 se la fattura non esiste nella sede', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(null)

    const { request, context } = richiesta(
      { righe: [{ numeroLinea: 1, accountId: 'conto-1' }] },
      'inesistente'
    )
    const response = await PATCH(request, context)

    expect(response.status).toBe(404)
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
  })

  it('conferma una riga: upsert con snapshot dall\'XML e stato confermata', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.upsert).mockResolvedValue({} as never)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 1, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.invoiceLineAccount.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.invoiceLineAccount.upsert).toHaveBeenCalledWith({
      where: { invoiceId_numeroLinea: { invoiceId: 'fatt-1', numeroLinea: 1 } },
      create: expect.objectContaining({
        invoiceId: 'fatt-1',
        numeroLinea: 1,
        descrizione: 'Farina 00',
        codiceArticolo: 'ABC123',
        importo: 25.5,
        accountId: 'conto-1',
        stato: 'confermata',
        fonte: 'manuale',
        confirmedById: 'user-1',
        confirmedAt: expect.any(Date),
      }),
      update: expect.objectContaining({
        descrizione: 'Farina 00',
        codiceArticolo: 'ABC123',
        importo: 25.5,
        accountId: 'conto-1',
        stato: 'confermata',
        fonte: 'manuale',
        confirmedById: 'user-1',
        confirmedAt: expect.any(Date),
      }),
    })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'UPDATE',
        entityType: 'ElectronicInvoice',
        entityId: 'fatt-1',
      })
    )
  })

  it('accountId inesistente o non attivo → 400 senza upsert', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([])

    const { request, context } = richiesta({
      righe: [{ numeroLinea: 1, accountId: 'conto-inesistente' }],
    })
    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Uno o più conti non esistono, non sono attivi o non sono di tipo COSTO')
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('conto esistente e attivo ma non di tipo COSTO → 400 senza upsert (la validazione filtra per type)', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    // Il conto esiste ed è attivo, ma è di tipo RICAVO: la query di
    // validazione filtra per type COSTO, quindi non lo trova.
    vi.mocked(prisma.account.findMany).mockResolvedValue([])

    const { request, context } = richiesta({
      righe: [{ numeroLinea: 1, accountId: 'conto-ricavo' }],
    })
    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Uno o più conti non esistono, non sono attivi o non sono di tipo COSTO')
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'COSTO' }),
      })
    )
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('numeroLinea inesistente nell\'XML → 400 senza scritture', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 99, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
    expect(prisma.invoiceLineAccount.updateMany).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('riga confermata manualmente con fornitore: upsert della memoria fornitore-prodotto', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.upsert).mockResolvedValue({} as never)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 1, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.supplierProductAccount.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.supplierProductAccount.upsert).toHaveBeenCalledWith({
      where: {
        venueId_supplierId_nomeNormalizzato: {
          venueId: 'venue-test-123',
          supplierId: 'fornitore-1',
          nomeNormalizzato: 'farina 00',
        },
      },
      create: {
        venueId: 'venue-test-123',
        supplierId: 'fornitore-1',
        nomeNormalizzato: 'farina 00',
        codiceArticolo: 'ABC123',
        accountId: 'conto-1',
        conferme: 1,
      },
      update: {
        accountId: 'conto-1',
        codiceArticolo: 'ABC123',
        conferme: { increment: 1 },
      },
    })
  })

  it('riconfermando una riga senza codice articolo, il codice già memorizzato non viene azzerato', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.upsert).mockResolvedValue({} as never)

    // La riga 2 (Zucchero) non porta codiceArticolo: la memoria potrebbe
    // averne uno, imparato da una fattura precedente in cui c'era.
    const { request, context } = richiesta({ righe: [{ numeroLinea: 2, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    const chiamata = vi.mocked(prisma.supplierProductAccount.upsert).mock.calls[0][0]
    expect(chiamata.create).toMatchObject({ codiceArticolo: null })
    // Il ramo update non deve nominare il campo: nominarlo significherebbe
    // sovrascrivere con null il codice appreso in passato.
    expect(chiamata.update).not.toHaveProperty('codiceArticolo')
  })

  it('riga confermata manualmente senza fornitore sulla fattura: non scrive memoria', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaSenzaFornitore as never)
    vi.mocked(prisma.invoiceLineAccount.upsert).mockResolvedValue({} as never)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 1, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.supplierProductAccount.upsert).not.toHaveBeenCalled()
  })

  it('riga confermata manualmente con descrizione vuota/solo simboli: non scrive memoria (la riga è comunque confermata)', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.upsert).mockResolvedValue({} as never)
    vi.mocked(parseFatturaPA).mockReturnValue({
      dettaglioLinee: [
        { numeroLinea: 1, descrizione: '---', prezzoUnitario: 5, prezzoTotale: 5, aliquotaIVA: 4 },
      ],
    } as never)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 1, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.righeConfermate).toBe(1)
    expect(prisma.invoiceLineAccount.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.supplierProductAccount.upsert).not.toHaveBeenCalled()
  })

  it('memoria fornitore-prodotto: un errore nella scrittura non fa fallire la PATCH (best-effort)', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.upsert).mockResolvedValue({} as never)
    vi.mocked(prisma.supplierProductAccount.upsert).mockRejectedValue(new Error('db down'))

    const { request, context } = richiesta({ righe: [{ numeroLinea: 1, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.righeConfermate).toBe(1)
  })

  it('confermaTutte: aggiorna tutte le righe in stato proposta con updateMany', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.updateMany).mockResolvedValue({ count: 3 } as never)

    const { request, context } = richiesta({ confermaTutte: true })
    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(prisma.invoiceLineAccount.updateMany).toHaveBeenCalledWith({
      where: { invoiceId: 'fatt-1', stato: 'proposta' },
      data: expect.objectContaining({
        stato: 'confermata',
        confirmedById: 'user-1',
        confirmedAt: expect.any(Date),
      }),
    })
    expect(data.tutteConfermate).toBe(3)
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'UPDATE',
        entityType: 'ElectronicInvoice',
        entityId: 'fatt-1',
      })
    )
  })

  it('confermaTutte alimenta la memoria fornitore-prodotto come la conferma riga per riga', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { numeroLinea: 1, descrizione: 'Farina 00', codiceArticolo: 'ABC123', accountId: 'conto-1' },
      { numeroLinea: 2, descrizione: 'Zucchero', codiceArticolo: null, accountId: 'conto-2' },
    ] as never)
    vi.mocked(prisma.invoiceLineAccount.updateMany).mockResolvedValue({ count: 2 } as never)

    const { request, context } = richiesta({ confermaTutte: true })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    // Le proposte si leggono PRIMA dell'updateMany: dopo non sono più
    // 'proposta' e non ci sarebbe più modo di sapere quali erano.
    expect(prisma.invoiceLineAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceId: 'fatt-1', stato: 'proposta' } })
    )
    expect(prisma.supplierProductAccount.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.supplierProductAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          venueId_supplierId_nomeNormalizzato: {
            venueId: 'venue-test-123',
            supplierId: 'fornitore-1',
            nomeNormalizzato: 'farina 00',
          },
        },
        create: expect.objectContaining({ accountId: 'conto-1', codiceArticolo: 'ABC123' }),
        update: expect.objectContaining({ accountId: 'conto-1', conferme: { increment: 1 } }),
      })
    )
  })

  it('confermaTutte senza fornitore sulla fattura: conferma le righe e non scrive memoria', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaSenzaFornitore as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { numeroLinea: 1, descrizione: 'Farina 00', codiceArticolo: 'ABC123', accountId: 'conto-1' },
    ] as never)
    vi.mocked(prisma.invoiceLineAccount.updateMany).mockResolvedValue({ count: 1 } as never)

    const { request, context } = richiesta({ confermaTutte: true })
    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.tutteConfermate).toBe(1)
    expect(prisma.supplierProductAccount.upsert).not.toHaveBeenCalled()
  })

  it('confermaTutte: un errore sulla memoria non fa fallire la conferma già scritta', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { numeroLinea: 1, descrizione: 'Farina 00', codiceArticolo: 'ABC123', accountId: 'conto-1' },
    ] as never)
    vi.mocked(prisma.invoiceLineAccount.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.supplierProductAccount.upsert).mockRejectedValue(new Error('db down'))

    const { request, context } = richiesta({ confermaTutte: true })
    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.tutteConfermate).toBe(1)
  })

  it('no-op (nessuna riga, confermaTutte assente o senza righe in proposta): non scrive audit', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)

    const { request, context } = richiesta({})
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
    expect(prisma.invoiceLineAccount.updateMany).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('no-op: confermaTutte:true ma updateMany non trova righe in proposta (count 0) → non scrive audit', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.updateMany).mockResolvedValue({ count: 0 } as never)

    const { request, context } = richiesta({ righe: [], confermaTutte: true })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})
