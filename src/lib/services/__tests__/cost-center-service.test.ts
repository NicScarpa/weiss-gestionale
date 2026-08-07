import { describe, it, expect, vi } from 'vitest'
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
