import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'
import { MESSAGGIO_NESSUNA_DIVERGENZA, MESSAGGIO_MAI_GENERATE_FETTE, MESSAGGIO_RIALLINEATO } from '../messaggi'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { findFirst: vi.fn() },
    scheduleReconciliation: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

// `RiallineamentoNonRigenerabile` è definita QUI, non importata dal modulo
// vero: `route.ts` la usa in un `instanceof` (riga 105), quindi il mock deve
// esportare la STESSA classe che il test istanzia, non una col nome giusto
// ma un'identità diversa — altrimenti `instanceof` fallirebbe silenziosamente
// e il 422 diventerebbe un 500, il tipo di errore che un test dovrebbe
// prendere, non nascondere.
vi.mock('@/lib/invoices/riallineamento', () => {
  class RiallineamentoNonRigenerabile extends Error {
    constructor(
      readonly reconciliationId: string,
      readonly invoiceId: string
    ) {
      super(
        'Le fette non sono state rigenerate: verifica che tutte le righe della fattura siano ' +
          'confermate, che la capienza del movimento non sia superata e che le note di credito ' +
          'collegate siano imputate per intero.'
      )
      this.name = 'RiallineamentoNonRigenerabile'
    }
  }
  return {
    imputazioniDivergenti: vi.fn(),
    riallineaFette: vi.fn(),
    RiallineamentoNonRigenerabile,
  }
})

import { authDiRoute } from '@/test/auth-unitari'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { imputazioniDivergenti, riallineaFette, RiallineamentoNonRigenerabile } from '@/lib/invoices/riallineamento'

const sessioneAdmin = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function richiesta(id = 'mov-1') {
  const request = new NextRequest(`http://localhost:3000/api/prima-nota/${id}/riallinea`, {
    method: 'POST',
  })
  return { request, context: { params: Promise.resolve({ id }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authDiRoute).mockResolvedValue(sessioneAdmin as never)
  vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({ id: 'mov-1' } as never)
  // Esegue davvero la callback, come farebbe `prisma.$transaction`: i test
  // sul 200 e sul 422 dipendono dal valore di ritorno/dall'eccezione di
  // `riallineaFette`, non da questo wrapper.
  vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) =>
    Promise.resolve(callback({}))) as typeof prisma.$transaction)
})

describe('POST /api/prima-nota/[id]/riallinea: accesso', () => {
  it('rifiuta chi non è autenticato', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(null)

    const { request, context } = richiesta()
    const response = await POST(request, context)

    expect(response.status).toBe(401)
    expect(imputazioniDivergenti).not.toHaveBeenCalled()
  })

  it('rifiuta i ruoli senza accesso ai dati finanziari', async () => {
    vi.mocked(authDiRoute).mockResolvedValue({ user: { id: 'user-2', role: 'staff' } } as never)

    const { request, context } = richiesta()
    const response = await POST(request, context)

    expect(response.status).toBe(403)
    expect(imputazioniDivergenti).not.toHaveBeenCalled()
  })

  it('404 se il movimento non esiste (o non è di questa sede)', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null)

    const { request, context } = richiesta()
    const response = await POST(request, context)

    expect(response.status).toBe(404)
    expect(imputazioniDivergenti).not.toHaveBeenCalled()
  })
})

describe('POST /api/prima-nota/[id]/riallinea: 409, le due cause', () => {
  it('già allineato: nessuna riconciliazione senza fette trovata — MESSAGGIO_NESSUNA_DIVERGENZA', async () => {
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: false,
      invoiceId: null,
      modificataIl: null,
    })
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue(null)

    const { request, context } = richiesta()
    const response = await POST(request, context)
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.error).toBe(MESSAGGIO_NESSUNA_DIVERGENZA)
    expect(riallineaFette).not.toHaveBeenCalled()
  })

  it('mai coperta per intero: una riconciliazione verificata senza fette esiste — MESSAGGIO_MAI_GENERATE_FETTE', async () => {
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: false,
      invoiceId: null,
      modificataIl: null,
    })
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue({ id: 'reconciliation-1' } as never)

    const { request, context } = richiesta()
    const response = await POST(request, context)
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.error).toBe(MESSAGGIO_MAI_GENERATE_FETTE)
    expect(riallineaFette).not.toHaveBeenCalled()
  })

  it('la query di "senzaFette" filtra sul movimento, VERIFIED e sulle sole riconciliazioni legate a una fattura', async () => {
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: false,
      invoiceId: null,
      modificataIl: null,
    })
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue(null)

    const { request, context } = richiesta('mov-42')
    await POST(request, context)

    expect(prisma.scheduleReconciliation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          journalEntryId: 'mov-42',
          status: 'VERIFIED',
          schedule: { invoiceId: { not: null } },
          allocations: { none: {} },
        },
      })
    )
  })
})

describe('POST /api/prima-nota/[id]/riallinea: 200', () => {
  it('riallinea, scrive un audit per riconciliazione e risponde col conteggio e MESSAGGIO_RIALLINEATO', async () => {
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: true,
      invoiceId: 'inv-1',
      modificataIl: new Date('2026-08-01'),
    })
    vi.mocked(riallineaFette).mockResolvedValue([
      { reconciliationId: 'reconciliation-1', invoiceId: 'inv-1', fetteRimosse: 2, fetteScritte: 2 },
    ])

    const { request, context } = richiesta()
    const response = await POST(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ fette: 2, invoiceId: 'inv-1', message: MESSAGGIO_RIALLINEATO })
    expect(createAuditLog).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ entityType: 'ScheduleReconciliation', entityId: 'reconciliation-1' })
    )
  })

  it('un bonifico cumulativo riallinea più riconciliazioni: il conteggio le somma, un audit per ciascuna', async () => {
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: true,
      invoiceId: 'inv-1',
      modificataIl: new Date('2026-08-01'),
    })
    vi.mocked(riallineaFette).mockResolvedValue([
      { reconciliationId: 'reconciliation-1', invoiceId: 'inv-1', fetteRimosse: 2, fetteScritte: 2 },
      { reconciliationId: 'reconciliation-2', invoiceId: 'inv-2', fetteRimosse: 1, fetteScritte: 1 },
    ])

    const { request, context } = richiesta()
    const response = await POST(request, context)
    const data = await response.json()

    expect(data.fette).toBe(3)
    expect(createAuditLog).toHaveBeenCalledTimes(2)
  })
})

describe('POST /api/prima-nota/[id]/riallinea: 422 e 500', () => {
  it('422: RiallineamentoNonRigenerabile diventa il messaggio della guardia, non un 500', async () => {
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: true,
      invoiceId: 'inv-1',
      modificataIl: new Date('2026-08-01'),
    })
    vi.mocked(riallineaFette).mockRejectedValue(new RiallineamentoNonRigenerabile('reconciliation-1', 'inv-1'))

    const { request, context } = richiesta()
    const response = await POST(request, context)
    const data = await response.json()

    expect(response.status).toBe(422)
    expect(data.error).toBe(new RiallineamentoNonRigenerabile('x', 'y').message)
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('500: un errore imprevisto (non RiallineamentoNonRigenerabile) risponde generico e finisce nel log', async () => {
    vi.mocked(imputazioniDivergenti).mockRejectedValue(new Error('connessione al database persa'))

    const { request, context } = richiesta()
    const response = await POST(request, context)

    expect(response.status).toBe(500)
    expect(logger.error).toHaveBeenCalledWith(
      'Errore POST /api/prima-nota/[id]/riallinea',
      expect.any(Error)
    )
  })
})
