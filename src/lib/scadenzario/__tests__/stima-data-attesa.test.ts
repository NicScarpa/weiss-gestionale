import { vi, beforeEach, describe, it, expect } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { schedule: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import { calcolaRitardoTipico, stimaRitardoFornitore } from '../stima-data-attesa'

describe('calcolaRitardoTipico', () => {
  it('restituisce la mediana dei ritardi con campione dispari', () => {
    expect(calcolaRitardoTipico([5, 12, 9])).toBe(9)
  })

  it('con campione pari usa la media dei due centrali, arrotondata', () => {
    expect(calcolaRitardoTipico([4, 6, 10, 20])).toBe(8)
  })

  it('la mediana è robusta a un caso anomalo', () => {
    // la fattura contestata pagata a 90 giorni non sposta la stima
    expect(calcolaRitardoTipico([7, 8, 9, 90])).toBe(9)
  })

  it('meno di 3 osservazioni: nessuna stima', () => {
    expect(calcolaRitardoTipico([10, 12])).toBeNull()
  })

  it('ritardo mediano sotto i 2 giorni è rumore: nessuna stima', () => {
    expect(calcolaRitardoTipico([0, 1, 1])).toBeNull()
  })

  it('il fornitore pagato in anticipo produce una stima negativa', () => {
    // |−5| ≥ 2: la stima anticipata è valida quanto quella in ritardo
    expect(calcolaRitardoTipico([-5, -4, -6])).toBe(-5)
  })

  it('non muta l\'array in ingresso', () => {
    const ritardi = [9, 5, 12]
    calcolaRitardoTipico(ritardi)
    expect(ritardi).toEqual([9, 5, 12])
  })
})

describe('stimaRitardoFornitore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calcola il ritardo dalle scadenze passive pagate del fornitore', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      { dataScadenza: new Date('2026-05-01'), dataPagamento: new Date('2026-05-11') },
      { dataScadenza: new Date('2026-06-01'), dataPagamento: new Date('2026-06-09') },
      { dataScadenza: new Date('2026-07-01'), dataPagamento: new Date('2026-07-13') },
    ] as never)

    await expect(stimaRitardoFornitore('sup-1', 'venue-1')).resolves.toBe(10)

    const where = vi.mocked(prisma.schedule.findMany).mock.calls[0][0]?.where
    expect(where).toMatchObject({
      venueId: 'venue-1',
      supplierId: 'sup-1',
      tipo: 'passiva',
      stato: 'pagata',
    })
    // la finestra: solo pagamenti recenti
    expect(where?.dataPagamento).toHaveProperty('gte')
  })

  it('senza storia sufficiente restituisce null', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([] as never)
    await expect(stimaRitardoFornitore('sup-1', 'venue-1')).resolves.toBeNull()
  })
})
