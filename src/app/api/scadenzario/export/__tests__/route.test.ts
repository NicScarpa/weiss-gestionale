import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { Prisma } from '@prisma/client'
import { ScheduleSource } from '@/types/schedule'
import { GET } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/venue', () => ({ getVenueId: vi.fn().mockResolvedValue('venue-1') }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({
  prisma: { schedule: { findMany: vi.fn() } },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function scadenzaFinta(overrides: Partial<Record<string, unknown>>) {
  return {
    tipo: 'passiva',
    descrizione: 'Scadenza di test',
    controparteNome: 'Fornitore Test',
    supplier: null,
    stato: 'aperta',
    priorita: 'normale',
    dataScadenza: null,
    dataEmissione: null,
    tipoDocumento: null,
    numeroDocumento: null,
    metodoPagamento: null,
    source: ScheduleSource.MANUALE,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
})

/**
 * Rilievo di revisione (Important, giro 1/5): il totale della riga finale
 * va sommato in `Money` (`sumMoney`/`toApi`), non con un `.reduce` su
 * `number`. Questo test fissa il totale corretto, così una regressione verso
 * la somma in `number` (che sui `Prisma.Decimal` letti dal database perde
 * precisione) fa fallire l'asserzione invece di passare inosservata.
 */
describe('GET /api/scadenzario/export - riga dei totali', () => {
  it('somma importoTotale, importoPagato e residuo su tutte le scadenze', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      scadenzaFinta({
        importoTotale: new Prisma.Decimal('100.10'),
        importoPagato: new Prisma.Decimal('50.05'),
      }),
      scadenzaFinta({
        importoTotale: new Prisma.Decimal('200.20'),
        importoPagato: new Prisma.Decimal('0'),
      }),
      scadenzaFinta({
        importoTotale: new Prisma.Decimal('0.30'),
        importoPagato: new Prisma.Decimal('0.30'),
      }),
    ] as never)

    const request = new NextRequest('http://localhost:3000/api/scadenzario/export')
    const response = await GET(request)
    const csv = await response.text()
    const righe = csv.replace(/^﻿/, '').split('\n')
    const rigaTotali = righe[righe.length - 1].split(';')

    expect(rigaTotali[0]).toBe('TOTALE (3 scadenze)')
    // Colonne 4, 5, 6: Importo Totale, Importo Pagato, Residuo.
    expect(rigaTotali[3]).toBe('300,60')
    expect(rigaTotali[4]).toBe('50,35')
    expect(rigaTotali[5]).toBe('250,25')
    // Rettangolare: tante colonne quante l'intestazione.
    expect(rigaTotali).toHaveLength(14)
  })
})
