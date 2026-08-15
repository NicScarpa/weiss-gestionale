import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { Prisma } from '@prisma/client'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/venue', () => ({ getVenueId: vi.fn().mockResolvedValue('venue-1') }))
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findFirst: vi.fn() },
    journalEntry: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/services/cost-center-service', () => ({
  risolviCentroDiCosto: vi.fn(),
}))

vi.mock('@/lib/services/schedule-reconciliation-service', () => ({
  riconciliaInTransazione: vi.fn(),
  dopoLaRiconciliazione: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'
import {
  riconciliaInTransazione,
  dopoLaRiconciliazione,
} from '@/lib/services/schedule-reconciliation-service'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function richiesta(corpo: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/scadenzario/sc-1/paga-in-contanti', {
    method: 'POST',
    body: JSON.stringify(corpo),
  })
}

const contesto = { params: Promise.resolve({ id: 'sc-1' }) }

function scadenza(over: Record<string, unknown> = {}) {
  return {
    id: 'sc-1',
    tipo: 'passiva',
    stato: 'da_pagare',
    importoTotale: new Prisma.Decimal(100),
    importoPagato: new Prisma.Decimal(0),
    descrizione: 'Fattura 4230426800165996 - TIM S.p.A.',
    invoice: { accountId: 'conto-telefonia', invoiceNumber: '4230426800165996' },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
  vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'mov-1' } as never)
  vi.mocked(risolviCentroDiCosto).mockResolvedValue({
    outcome: 'ok',
    costCenterId: 'centro-weiss',
    origine: 'piano',
  } as never)
  vi.mocked(riconciliaInTransazione).mockResolvedValue({
    outcome: 'ok',
    reconciliationId: 'ric-1',
    quota: 100,
    stato: { stato: 'pagata', saldata: true, tipo: 'passiva', supplierId: null, importoPagato: 100 },
  } as never)
  vi.mocked(dopoLaRiconciliazione).mockResolvedValue({
    outcome: 'ok',
    reconciliationId: 'ric-1',
    scheduleStato: 'pagata',
    importoPagato: 100,
  } as never)
  vi.mocked(prisma.$transaction).mockImplementation(
    async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma) as never
  )
})

describe('POST /api/scadenzario/[id]/paga-in-contanti: il movimento che nasce', () => {
  it('è di CASSA, alla data indicata, e in uscita per una scadenza passiva', async () => {
    await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          registerType: 'CASH',
          date: new Date('2026-08-10'),
          debitAmount: null,
        }),
      })
    )
    const argomenti = vi.mocked(prisma.journalEntry.create).mock.calls[0][0] as {
      data: { creditAmount: Prisma.Decimal }
    }
    expect(argomenti.data.creditAmount.toString()).toBe('100')
  })

  it('è in ENTRATA per una scadenza attiva', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza({ tipo: 'attiva' }) as never)

    await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    // Il verso non è scritto a mano nella rotta: lo decide toDebitCredit, che
    // è l'unico posto in cui vive la convenzione dare/avere del progetto.
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditAmount: null }) })
    )
  })

  it('porta in testata il conto della fattura', async () => {
    await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    // Con le fette il conto economico ignora la testata, ma SENZA fette la
    // testata è l'unica fonte: una fattura priva di imputazione di riga
    // sparirebbe dal conto economico.
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountId: 'conto-telefonia' }),
      })
    )
  })

  it('nasce verificato', async () => {
    await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    // Qui non c'è nulla di indovinato: un umano sta dichiarando un fatto.
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verified: true }) })
    )
  })

  it('risolve il centro di costo sul conto della fattura, non sulla cassa', async () => {
    await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(risolviCentroDiCosto).toHaveBeenCalledWith(
      prisma,
      { accountId: 'conto-telefonia' },
      'interattivo'
    )
  })
})

describe('POST /api/scadenzario/[id]/paga-in-contanti: creazione e riconciliazione insieme', () => {
  it('avvengono in una sola transazione', async () => {
    const res = await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    // È il punto dell'endpoint: se la riconciliazione fallisce non deve restare
    // cassa uscita senza nulla di saldato.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(riconciliaInTransazione).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        scheduleId: 'sc-1',
        journalEntryId: 'mov-1',
        venueId: 'venue-1',
        source: 'MANUAL',
      })
    )
    expect(res.status).toBe(200)
  })

  it('salda il residuo quando l\'importo non è indicato', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({
        stato: 'parzialmente_pagata',
        importoPagato: new Prisma.Decimal(30),
      }) as never
    )

    await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    const argomenti = vi.mocked(prisma.journalEntry.create).mock.calls[0][0] as {
      data: { creditAmount: Prisma.Decimal }
    }
    expect(argomenti.data.creditAmount.toString()).toBe('70')
  })

  it('rispetta l\'importo indicato quando c\'è', async () => {
    await POST(richiesta({ dataPagamento: '2026-08-10', importo: 40 }), contesto)

    const argomenti = vi.mocked(prisma.journalEntry.create).mock.calls[0][0] as {
      data: { creditAmount: Prisma.Decimal }
    }
    expect(argomenti.data.creditAmount.toString()).toBe('40')
  })

  it('non lascia il movimento in piedi se la riconciliazione rifiuta', async () => {
    vi.mocked(riconciliaInTransazione).mockResolvedValue({
      outcome: 'amount_exceeds_capacity',
      motivo: 'La quota supera il residuo della scadenza',
    } as never)
    // La transazione vera annullerebbe la create: qui si verifica che la rotta
    // sollevi, che è ciò che la fa annullare.
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof prisma) => Promise<unknown>)(prisma) as never
    })

    const res = await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toContain('supera il residuo')
  })
})

describe('POST /api/scadenzario/[id]/paga-in-contanti: cosa rifiuta', () => {
  it('una scadenza già pagata, senza creare nulla', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ stato: 'pagata', importoPagato: new Prisma.Decimal(100) }) as never
    )

    const res = await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(res.status).toBe(409)
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
  })

  it('una scadenza di un\'altra sede', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null as never)

    const res = await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(res.status).toBe(404)
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
  })

  it('un dipendente', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u', role: 'employee' } } as never)

    const res = await POST(richiesta({ dataPagamento: '2026-08-10' }), contesto)

    expect(res.status).toBe(403)
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
  })

  it('una richiesta senza data di pagamento', async () => {
    const res = await POST(richiesta({}), contesto)

    expect(res.status).toBe(400)
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
  })
})
