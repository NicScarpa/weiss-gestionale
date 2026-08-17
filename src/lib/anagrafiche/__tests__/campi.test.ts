import { describe, it, expect } from 'vitest'

import {
  CAMPI_ANAGRAFICA,
  COLONNE,
  versoModulo,
  versoApi,
  type VarianteAnagrafica,
} from '../campi'

/**
 * L'elenco dei campi dell'anagrafica, scritto una volta sola.
 *
 * Clienti e fornitori erano nati con insiemi di campi diversi: il cliente aveva
 * telefono e note, il fornitore paese e termini di pagamento, e il codice
 * fiscale del fornitore esisteva nel database senza che nessuna schermata
 * permettesse di scriverlo. La difformità non era una scelta, era il risultato
 * di due schermate cresciute per conto proprio.
 *
 * Qui i campi vivono in un elenco unico e le due anagrafiche dichiarano solo
 * *dove* finisce ciascun campo, perché le colonne hanno nomi diversi sotto il
 * cofano (`denominazione` di qua, `name` di là). Così la difformità non si
 * scopre: non si può proprio scrivere.
 */

const VARIANTI: VarianteAnagrafica[] = ['cliente', 'fornitore']

describe('campi dell\'anagrafica', () => {
  it('ogni campo ha una colonna in entrambe le anagrafiche', () => {
    const senzaColonna: string[] = []

    for (const campo of CAMPI_ANAGRAFICA) {
      for (const variante of VARIANTI) {
        if (!COLONNE[variante][campo.chiave]) {
          senzaColonna.push(`${campo.chiave} manca in «${variante}»`)
        }
      }
    }

    expect(senzaColonna).toEqual([])
  })

  it('nessuna colonna dichiarata avanza rispetto ai campi', () => {
    const chiaviNote = new Set(CAMPI_ANAGRAFICA.map((c) => c.chiave))
    const avanzi: string[] = []

    for (const variante of VARIANTI) {
      for (const chiave of Object.keys(COLONNE[variante])) {
        if (!chiaviNote.has(chiave)) avanzi.push(`${chiave} in «${variante}»`)
      }
    }

    expect(avanzi).toEqual([])
  })

  it('la denominazione è l\'unico campo obbligatorio', () => {
    const obbligatori = CAMPI_ANAGRAFICA.filter((c) => c.obbligatorio).map((c) => c.chiave)
    expect(obbligatori).toEqual(['denominazione'])
  })

  it('copre i campi che a una delle due anagrafiche mancavano', () => {
    const chiavi = CAMPI_ANAGRAFICA.map((c) => c.chiave)
    // telefono e note mancavano al fornitore; paese e termini al cliente;
    // il codice fiscale del fornitore non era scrivibile da nessuna schermata.
    expect(chiavi).toContain('telefono')
    expect(chiavi).toContain('note')
    expect(chiavi).toContain('paese')
    expect(chiavi).toContain('terminiPagamentoGiorni')
    expect(chiavi).toContain('codiceFiscale')
  })
})

describe('traduzione fra scheda e anagrafica', () => {
  it('legge un cliente usando i nomi italiani delle sue colonne', () => {
    const valori = versoModulo('cliente', {
      denominazione: 'Bar Centrale',
      partitaIva: '01234567890',
      attivo: true,
    })

    expect(valori.denominazione).toBe('Bar Centrale')
    expect(valori.partitaIva).toBe('01234567890')
    expect(valori.attivo).toBe(true)
  })

  it('legge un fornitore, che le stesse informazioni le tiene in inglese', () => {
    const valori = versoModulo('fornitore', {
      name: 'Caffè Trieste',
      vatNumber: '09876543210',
      isActive: false,
      postalCode: '33077',
    })

    expect(valori.denominazione).toBe('Caffè Trieste')
    expect(valori.partitaIva).toBe('09876543210')
    expect(valori.attivo).toBe(false)
    expect(valori.cap).toBe('33077')
  })

  it('rimanda al fornitore i nomi di colonna che la sua rotta si aspetta', () => {
    const corpo = versoApi('fornitore', {
      denominazione: 'Caffè Trieste',
      cap: '33077',
      terminiPagamentoGiorni: 60,
      attivo: true,
    })

    expect(corpo).toMatchObject({
      name: 'Caffè Trieste',
      postalCode: '33077',
      paymentTermsDays: 60,
      isActive: true,
    })
    expect(corpo).not.toHaveProperty('denominazione')
  })

  it('un giro completo non perde né altera nulla', () => {
    const dalDatabase = {
      name: 'Caffè Trieste',
      vatNumber: '09876543210',
      fiscalCode: 'CFFTRS80A01H501Z',
      email: 'info@caffetrieste.it',
      phone: '+39 0434 000000',
      address: 'Via Roma 1',
      postalCode: '33077',
      city: 'Sacile',
      province: 'PN',
      country: 'IT',
      iban: 'IT60X0542811101000000123456',
      paymentTermsDays: 30,
      notes: 'Consegna il martedì',
      defaultAccountId: 'conto-1',
      isActive: true,
    }

    expect(versoApi('fornitore', versoModulo('fornitore', dalDatabase))).toEqual(dalDatabase)
  })

  it('il campo vuoto torna nullo, non stringa vuota', () => {
    // Una stringa vuota salvata al posto del nulla rende «senza partita IVA»
    // indistinguibile da «partita IVA cancellata», e sporca ogni ricerca.
    const corpo = versoApi('cliente', { denominazione: 'Bar Centrale', partitaIva: '   ' })
    expect(corpo.partitaIva).toBeNull()
  })
})
