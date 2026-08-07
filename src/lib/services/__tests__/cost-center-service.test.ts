import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { logger } from '@/lib/logger'
import { risolviCentroDiCosto } from '../cost-center-service'

function creaDbMock() {
  return {
    costCenter: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  }
}

const STR = { id: 'cc-str', code: 'STR', name: 'Strada', isDefault: true, isActive: true }
const WEISS = { id: 'cc-weiss', code: 'WEISS', name: 'Weiss Cafè', isDefault: false, isActive: true }

/**
 * L'anagrafica completa: la findFirst risponde in base a cosa le si chiede,
 * il centro di sistema (isDefault) o quello operativo (code WEISS).
 */
function anagraficaCompleta(db: ReturnType<typeof creaDbMock>) {
  db.costCenter.findFirst.mockImplementation(
    async ({ where }: { where: { isDefault?: boolean; code?: string } }) =>
      where.code === 'WEISS' ? WEISS : where.isDefault ? STR : null
  )
}

describe('risolviCentroDiCosto', () => {
  it('centro fornito, esistente e attivo → ok con quel centro', async () => {
    const db = creaDbMock()
    db.costCenter.findUnique.mockResolvedValue({ id: 'cc-1', isActive: true })

    const esito = await risolviCentroDiCosto(db as never, { costCenterId: 'cc-1' })

    expect(esito).toEqual({ outcome: 'ok', costCenterId: 'cc-1' })
    expect(db.costCenter.findUnique).toHaveBeenCalledWith({ where: { id: 'cc-1' } })
    // Nessuna query aggiuntiva: il centro fornito è già valido.
    expect(db.account.findMany).not.toHaveBeenCalled()
    expect(db.costCenter.findFirst).not.toHaveBeenCalled()
  })

  it('centro fornito ma inesistente → invalid CENTRO_DI_COSTO_NON_VALIDO', async () => {
    const db = creaDbMock()
    db.costCenter.findUnique.mockResolvedValue(null)

    const esito = await risolviCentroDiCosto(db as never, { costCenterId: 'cc-fantasma' })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: 'Centro di costo inesistente o disattivato.',
      code: 'CENTRO_DI_COSTO_NON_VALIDO',
    })
  })

  it('centro fornito ma disattivato → invalid CENTRO_DI_COSTO_NON_VALIDO', async () => {
    const db = creaDbMock()
    db.costCenter.findUnique.mockResolvedValue({ id: 'cc-1', isActive: false })

    const esito = await risolviCentroDiCosto(db as never, { costCenterId: 'cc-1' })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: 'Centro di costo inesistente o disattivato.',
      code: 'CENTRO_DI_COSTO_NON_VALIDO',
    })
  })

  it('conto OBBLIGATORIO senza centro fornito → invalid con code e name del conto nel motivo', async () => {
    const db = creaDbMock()
    db.account.findMany.mockResolvedValue([
      { id: 'acc-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ])

    const esito = await risolviCentroDiCosto(db as never, { accountId: 'acc-1' })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: 'Il conto 620010 — Manutenzioni richiede un centro di costo.',
      code: 'CENTRO_DI_COSTO_OBBLIGATORIO',
    })
    expect(db.costCenter.findFirst).not.toHaveBeenCalled()
  })

  it('conto DEFAULT_STR senza centro fornito → ok con il centro di default (STR)', async () => {
    const db = creaDbMock()
    db.account.findMany.mockResolvedValue([
      { id: 'acc-2', code: '710010', name: 'Vendite bar', costCenterRule: 'DEFAULT_STR' },
    ])
    db.costCenter.findFirst.mockResolvedValue(STR)

    const esito = await risolviCentroDiCosto(db as never, { accountId: 'acc-2' })

    expect(esito).toEqual({ outcome: 'ok', costCenterId: 'cc-str' })
    expect(db.costCenter.findFirst).toHaveBeenCalledWith({
      where: { isDefault: true, isActive: true },
    })
  })

  it('senza conto e senza fette → ok con il centro di default (STR), nessuna query sui conti', async () => {
    const db = creaDbMock()
    db.costCenter.findFirst.mockResolvedValue(STR)

    const esito = await risolviCentroDiCosto(db as never, {})

    expect(esito).toEqual({ outcome: 'ok', costCenterId: 'cc-str' })
    expect(db.account.findMany).not.toHaveBeenCalled()
  })

  it('fette miste con una OBBLIGATORIO → invalid, citando il primo conto OBBLIGATORIO incontrato', async () => {
    const db = creaDbMock()
    db.account.findMany.mockResolvedValue([
      { id: 'acc-a', code: '710010', name: 'Vendite bar', costCenterRule: 'DEFAULT_STR' },
      { id: 'acc-b', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ])

    const esito = await risolviCentroDiCosto(db as never, {
      accountIdsFette: ['acc-a', 'acc-b'],
    })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: 'Il conto 620010 — Manutenzioni richiede un centro di costo.',
      code: 'CENTRO_DI_COSTO_OBBLIGATORIO',
    })
  })

  it('conto dominante OBBLIGATORIO citato prima di una fetta OBBLIGATORIO, rispettando l\'ordine conto poi fette', async () => {
    const db = creaDbMock()
    db.account.findMany.mockResolvedValue([
      { id: 'acc-dominante', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
      { id: 'acc-fetta', code: '620020', name: 'Riparazioni', costCenterRule: 'OBBLIGATORIO' },
    ])

    const esito = await risolviCentroDiCosto(db as never, {
      accountId: 'acc-dominante',
      accountIdsFette: ['acc-fetta'],
    })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: 'Il conto 620010 — Manutenzioni richiede un centro di costo.',
      code: 'CENTRO_DI_COSTO_OBBLIGATORIO',
    })
  })

  it('fette tutte DEFAULT_STR e conto null → ok con il centro di default (STR)', async () => {
    const db = creaDbMock()
    db.account.findMany.mockResolvedValue([
      { id: 'acc-a', code: '710010', name: 'Vendite bar', costCenterRule: 'DEFAULT_STR' },
      { id: 'acc-c', code: '710020', name: 'Vendite cucina', costCenterRule: 'DEFAULT_STR' },
    ])
    db.costCenter.findFirst.mockResolvedValue(STR)

    const esito = await risolviCentroDiCosto(db as never, {
      accountId: null,
      accountIdsFette: ['acc-a', 'acc-c'],
    })

    expect(esito).toEqual({ outcome: 'ok', costCenterId: 'cc-str' })
  })

  it('nessun centro di default configurato → throw (errore di configurazione)', async () => {
    const db = creaDbMock()
    db.costCenter.findFirst.mockResolvedValue(null)

    await expect(risolviCentroDiCosto(db as never, {})).rejects.toThrow(
      'Nessun centro di costo di default configurato'
    )
  })
})

/**
 * Sui percorsi automatici non c'è nessuno a cui chiedere il centro: il
 * sistema indovina, e indovina il locale (WEISS), non la struttura. Le voci
 * amministrative del piano, che portano la regola DEFAULT_STR, continuano
 * però ad andare su STR: quella non è una supposizione, è la regola
 * dell'Excel aziendale.
 */
describe('risolviCentroDiCosto — contesto automatico', () => {
  it('conto OBBLIGATORIO senza centro → ok con il centro operativo (WEISS), nessun 400 da propagare', async () => {
    const db = creaDbMock()
    db.account.findMany.mockResolvedValue([
      { id: 'acc-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ])
    anagraficaCompleta(db)

    const esito = await risolviCentroDiCosto(db as never, { accountId: 'acc-1' }, 'automatico')

    expect(esito).toEqual({ outcome: 'ok', costCenterId: 'cc-weiss' })
  })

  it('conto con regola DEFAULT_STR → resta STR anche in automatico (è il piano ufficiale, non una supposizione)', async () => {
    const db = creaDbMock()
    db.account.findMany.mockResolvedValue([
      { id: 'acc-2', code: '240010', name: 'Consulenze fiscali', costCenterRule: 'DEFAULT_STR' },
    ])
    anagraficaCompleta(db)

    const esito = await risolviCentroDiCosto(db as never, { accountId: 'acc-2' }, 'automatico')

    expect(esito).toEqual({ outcome: 'ok', costCenterId: 'cc-str' })
  })

  it('nessun conto da interrogare (movimento appena importato) → centro operativo (WEISS)', async () => {
    const db = creaDbMock()
    anagraficaCompleta(db)

    const esito = await risolviCentroDiCosto(db as never, { accountId: null }, 'automatico')

    expect(esito).toEqual({ outcome: 'ok', costCenterId: 'cc-weiss' })
    expect(db.account.findMany).not.toHaveBeenCalled()
  })

  it('centro esplicito e valido → vince anche in automatico: una scelta non si riscrive', async () => {
    const db = creaDbMock()
    db.costCenter.findUnique.mockResolvedValue({ id: 'cc-cas', isActive: true })
    anagraficaCompleta(db)

    const esito = await risolviCentroDiCosto(
      db as never,
      { accountId: 'acc-1', costCenterId: 'cc-cas' },
      'automatico'
    )

    expect(esito).toEqual({ outcome: 'ok', costCenterId: 'cc-cas' })
  })

  it('centro esplicito disattivato → invalid anche in automatico: il chiamante decide come ripiegare', async () => {
    const db = creaDbMock()
    db.costCenter.findUnique.mockResolvedValue({ id: 'cc-vecchio', isActive: false })

    const esito = await risolviCentroDiCosto(
      db as never,
      { costCenterId: 'cc-vecchio' },
      'automatico'
    )

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: 'Centro di costo inesistente o disattivato.',
      code: 'CENTRO_DI_COSTO_NON_VALIDO',
    })
  })

  it('centro operativo assente dall\'anagrafica → ripiego su STR con un warning, il movimento non si perde', async () => {
    const db = creaDbMock()
    db.account.findMany.mockResolvedValue([
      { id: 'acc-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ])
    db.costCenter.findFirst.mockImplementation(
      async ({ where }: { where: { isDefault?: boolean; code?: string } }) =>
        where.isDefault ? STR : null
    )

    const esito = await risolviCentroDiCosto(db as never, { accountId: 'acc-1' }, 'automatico')

    expect(esito).toEqual({ outcome: 'ok', costCenterId: 'cc-str' })
    expect(logger.warn).toHaveBeenCalledWith(
      'Centro operativo predefinito non disponibile: si ripiega sul centro di sistema',
      { code: 'WEISS' }
    )
  })
})
