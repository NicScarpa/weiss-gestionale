import { describe, it, expect } from 'vitest'

import {
  GIORNI_DI_PREAVVISO,
  contrattiInScadenza,
  giorniAllaScadenza,
  richiedeDataFine,
} from '../scadenza-contratti'

/**
 * I contratti a termine che stanno per scadere.
 *
 * La data di fine non è anagrafica ornamentale: serve a farsi avvisare in
 * tempo per parlare con la persona e decidere del rinnovo. Quindici giorni di
 * preavviso — sotto, la conversazione arriva quando la decisione è già presa
 * dai fatti.
 *
 * Le date sono giorni civili, non istanti: un contratto che scade il 31 è in
 * corso per tutto il 31. Confrontare istanti farebbe scadere i contratti a
 * mezzanotte del giorno prima per chi guarda dall'Italia.
 */

const oggi = new Date('2026-08-18')

function dipendente(patch: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    firstName: 'Anna',
    lastName: 'Zamai',
    email: 'anna@esempio.it',
    contractType: 'TEMPO_DETERMINATO' as const,
    contractEndDate: new Date('2026-08-25'),
    isActive: true,
    ...patch,
  }
}

describe('quali contratti pretendono una data di fine', () => {
  it('il tempo determinato sì', () => {
    expect(richiedeDataFine('TEMPO_DETERMINATO')).toBe(true)
  })

  it('il tempo indeterminato no: non finisce', () => {
    expect(richiedeDataFine('TEMPO_INDETERMINATO')).toBe(false)
  })

  it('gli altri no: hanno una fine, ma non fissata dal contratto', () => {
    // Intermittente, occasionale e libero professionista possono avere una
    // scadenza, ma non è il contratto a dettarla: chiederla per forza
    // significherebbe farsi inventare una data.
    expect(richiedeDataFine('LAVORO_INTERMITTENTE')).toBe(false)
    expect(richiedeDataFine('LAVORATORE_OCCASIONALE')).toBe(false)
    expect(richiedeDataFine('LIBERO_PROFESSIONISTA')).toBe(false)
    expect(richiedeDataFine(null)).toBe(false)
  })
})

describe('giorni che mancano alla scadenza', () => {
  it('conta i giorni civili, non le ore', () => {
    expect(giorniAllaScadenza(new Date('2026-08-25'), oggi)).toBe(7)
  })

  it('il giorno stesso della scadenza è zero, non meno uno', () => {
    // Il contratto è in corso per tutto il suo ultimo giorno.
    expect(giorniAllaScadenza(new Date('2026-08-18'), oggi)).toBe(0)
  })

  it('un contratto già scaduto dà un numero negativo', () => {
    expect(giorniAllaScadenza(new Date('2026-08-10'), oggi)).toBe(-8)
  })
})

describe('la selezione dei contratti da segnalare', () => {
  it('prende quelli che scadono entro il preavviso', () => {
    const scelti = contrattiInScadenza([dipendente()], oggi)
    expect(scelti.map((c) => c.id)).toEqual(['u1'])
    expect(scelti[0].giorniMancanti).toBe(7)
  })

  it('lascia stare quelli ancora lontani', () => {
    const lontano = dipendente({ contractEndDate: new Date('2026-10-01') })
    expect(contrattiInScadenza([lontano], oggi)).toEqual([])
  })

  it('prende anche quello che scade oggi', () => {
    const oggiStesso = dipendente({ contractEndDate: new Date('2026-08-18') })
    expect(contrattiInScadenza([oggiStesso], oggi)).toHaveLength(1)
  })

  it('prende quelli già scaduti: se nessuno se n\'è accorto, il problema è più grave', () => {
    const scaduto = dipendente({ contractEndDate: new Date('2026-08-10') })
    const scelti = contrattiInScadenza([scaduto], oggi)
    expect(scelti).toHaveLength(1)
    expect(scelti[0].giorniMancanti).toBe(-8)
    expect(scelti[0].giaScaduto).toBe(true)
  })

  it('ignora chi non è più in forza', () => {
    const cessato = dipendente({ isActive: false })
    expect(contrattiInScadenza([cessato], oggi)).toEqual([])
  })

  it('ignora il tempo indeterminato, anche se per errore ha una data', () => {
    const fisso = dipendente({ contractType: 'TEMPO_INDETERMINATO' })
    expect(contrattiInScadenza([fisso], oggi)).toEqual([])
  })

  it('ignora chi la data non ce l\'ha', () => {
    const senzaData = dipendente({ contractEndDate: null })
    expect(contrattiInScadenza([senzaData], oggi)).toEqual([])
  })

  it('mette per primo chi scade prima', () => {
    const elenco = [
      dipendente({ id: 'tardi', contractEndDate: new Date('2026-08-30') }),
      dipendente({ id: 'subito', contractEndDate: new Date('2026-08-19') }),
      dipendente({ id: 'scaduto', contractEndDate: new Date('2026-08-01') }),
    ]
    expect(contrattiInScadenza(elenco, oggi).map((c) => c.id)).toEqual([
      'scaduto',
      'subito',
      'tardi',
    ])
  })

  it('il preavviso dichiarato è di quindici giorni', () => {
    expect(GIORNI_DI_PREAVVISO).toBe(15)
  })
})
