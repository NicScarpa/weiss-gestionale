import { vi, beforeEach, describe, it, expect } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { schedule: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import { calcolaRitardoTipico, stimaRitardoFornitore, applicaStimaSuScadenza, ricalcolaStimeFornitore } from '../stima-data-attesa'

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

function scadenzaAperta(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    tipo: 'passiva',
    stato: 'aperta',
    supplierId: 'sup-1',
    dataScadenza: new Date('2026-09-01'),
    dataAttesaSource: null,
    ...overrides,
  }
}

describe('applicaStimaSuScadenza', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scrive dataAttesa = dataScadenza + ritardo con source stima', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenzaAperta() as never)
    // storia: tre pagamenti con 10 giorni di ritardo
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      { dataScadenza: new Date('2026-05-01'), dataPagamento: new Date('2026-05-11') },
      { dataScadenza: new Date('2026-06-01'), dataPagamento: new Date('2026-06-11') },
      { dataScadenza: new Date('2026-07-01'), dataPagamento: new Date('2026-07-11') },
    ] as never)

    await applicaStimaSuScadenza('sched-1', 'venue-1')

    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { dataAttesa: new Date('2026-09-11'), dataAttesaSource: 'stima' },
    })
  })

  it('non tocca una scadenza con data attesa manuale', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenzaAperta({ dataAttesaSource: 'manuale' }) as never
    )
    await applicaStimaSuScadenza('sched-1', 'venue-1')
    expect(prisma.schedule.update).not.toHaveBeenCalled()
  })

  it('non tocca le scadenze attive né quelle senza fornitore', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenzaAperta({ tipo: 'attiva' }) as never
    )
    await applicaStimaSuScadenza('sched-1', 'venue-1')
    expect(prisma.schedule.update).not.toHaveBeenCalled()

    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenzaAperta({ supplierId: null }) as never
    )
    await applicaStimaSuScadenza('sched-1', 'venue-1')
    expect(prisma.schedule.update).not.toHaveBeenCalled()
  })

  it('se la stima non è più possibile, una source stima torna a null', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenzaAperta({ dataAttesaSource: 'stima' }) as never
    )
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([] as never)

    await applicaStimaSuScadenza('sched-1', 'venue-1')

    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { dataAttesa: null, dataAttesaSource: null },
    })
  })

  it('un errore del database non si propaga: best-effort', async () => {
    vi.mocked(prisma.schedule.findFirst).mockRejectedValue(new Error('connessione persa'))
    await expect(applicaStimaSuScadenza('sched-1', 'venue-1')).resolves.toBeUndefined()
  })
})

describe('ricalcolaStimeFornitore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ricalcola le aperte del fornitore con source null o stima', async () => {
    // prima findMany: storia pagata (ritardo 10); seconda: le aperte da aggiornare
    vi.mocked(prisma.schedule.findMany)
      .mockResolvedValueOnce([
        { dataScadenza: new Date('2026-05-01'), dataPagamento: new Date('2026-05-11') },
        { dataScadenza: new Date('2026-06-01'), dataPagamento: new Date('2026-06-11') },
        { dataScadenza: new Date('2026-07-01'), dataPagamento: new Date('2026-07-11') },
      ] as never)
      .mockResolvedValueOnce([
        { id: 'a', dataScadenza: new Date('2026-09-01'), dataAttesaSource: null },
        { id: 'b', dataScadenza: new Date('2026-10-01'), dataAttesaSource: 'stima' },
      ] as never)

    await ricalcolaStimeFornitore('sup-1', 'venue-1')

    expect(prisma.schedule.update).toHaveBeenCalledTimes(2)
    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { dataAttesa: new Date('2026-09-11'), dataAttesaSource: 'stima' },
    })
    // il filtro esclude manuale e riconciliazione già in query
    const whereAperte = vi.mocked(prisma.schedule.findMany).mock.calls[1][0]?.where
    expect(whereAperte?.OR).toEqual([
      { dataAttesaSource: null },
      { dataAttesaSource: 'stima' },
    ])
  })
})
