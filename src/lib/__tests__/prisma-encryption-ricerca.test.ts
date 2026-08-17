import { describe, it, expect } from 'vitest'

import { verificaRicercaSuCifrati } from '../prisma-encryption'

/**
 * Il presidio contro le ricerche dentro un campo cifrato.
 *
 * I campi sensibili sono cifrati con AES-GCM e un IV casuale: due scritture
 * dello stesso valore danno due testi cifrati diversi, quindi confrontare il
 * campo con un valore non trova mai niente. Il guasto non ha sintomi — la
 * query riesce e restituisce zero righe — e si presenta due volte:
 *
 * - la ricerca dice «nessun risultato» e sembra che l'anagrafica sia vuota;
 * - il controllo dei duplicati non trova il gemello e lo lascia entrare.
 *
 * È esattamente quello che è successo a `Customer.codiceFiscale`, per mesi.
 * Chi ha una colonna hash affiancata deve passare da quella; chi non ce l'ha
 * ha bisogno di una migrazione, e questo errore lo dice mentre si scrive la
 * query, non sei mesi dopo.
 *
 * Ciò che invece NON è un difetto — e che il presidio deve lasciar passare —
 * è il *test di presenza*: `{ not: null }` funziona benissimo su un campo
 * cifrato, perché il testo cifrato è comunque non nullo. «Dammi i fornitori
 * che hanno la partita IVA» è una domanda legittima.
 */

const messaggio = (fn: () => void): string => {
  try {
    fn()
  } catch (errore) {
    return (errore as Error).message
  }
  return ''
}

describe('ricerche dentro un campo cifrato', () => {
  describe('le ferma', () => {
    it('il valore scritto per esteso', () => {
      expect(() =>
        verificaRicercaSuCifrati('Customer', { codiceFiscale: 'RSSMRA85M01H501W' })
      ).toThrow(/codiceFiscale/)
    })

    it('l\'uguaglianza esplicita', () => {
      expect(() =>
        verificaRicercaSuCifrati('Customer', { codiceFiscale: { equals: 'RSSMRA85M01H501W' } })
      ).toThrow(/codiceFiscale/)
    })

    it('la ricerca parziale', () => {
      expect(() =>
        verificaRicercaSuCifrati('Customer', {
          codiceFiscale: { contains: 'RSSMRA', mode: 'insensitive' },
        })
      ).toThrow(/codiceFiscale/)
    })

    it('l\'elenco di valori', () => {
      expect(() =>
        verificaRicercaSuCifrati('Supplier', { iban: { in: ['IT60X05428', 'IT02A03069'] } })
      ).toThrow(/iban/)
    })

    it('la disuguaglianza da un valore', () => {
      // `!= 'ABC'` sul cifrato è vero per ogni riga: restituisce tutto.
      expect(() =>
        verificaRicercaSuCifrati('User', { fiscalCode: { not: 'RSSMRA85M01H501W' } })
      ).toThrow(/fiscalCode/)
    })

    it('anche annidata dentro OR, AND e NOT', () => {
      expect(() =>
        verificaRicercaSuCifrati('Customer', {
          AND: [{ attivo: true }, { OR: [{ NOT: { codiceFiscale: 'RSSMRA85M01H501W' } }] }],
        })
      ).toThrow(/codiceFiscale/)
    })

    it('anche attraverso una relazione', () => {
      expect(() =>
        verificaRicercaSuCifrati('ElectronicInvoice', {
          supplier: { is: { fiscalCode: 'CFFTRS80A01H501Z' } },
        })
      ).toThrow(/fiscalCode/)
    })
  })

  describe('le lascia passare', () => {
    it('il test di presenza', () => {
      expect(() =>
        verificaRicercaSuCifrati('User', { vatNumber: { not: null }, isActive: true })
      ).not.toThrow()
    })

    it('il campo nullo', () => {
      expect(() => verificaRicercaSuCifrati('Customer', { codiceFiscale: null })).not.toThrow()
      expect(() =>
        verificaRicercaSuCifrati('Customer', { codiceFiscale: { equals: null } })
      ).not.toThrow()
    })

    it('la ricerca sull\'hash, che è il modo giusto', () => {
      expect(() =>
        verificaRicercaSuCifrati('Customer', { codiceFiscaleHash: 'abc123' })
      ).not.toThrow()
    })

    it('il ripiego sul chiaro quando l\'hash è nello stesso where', () => {
      // `sdi/matcher.ts` cerca per hash e ripiega sul valore in chiaro per i
      // record scritti prima della cifratura: è deliberato e corretto.
      expect(() =>
        verificaRicercaSuCifrati('Supplier', {
          OR: [
            { fiscalCodeHash: 'abc123' },
            { fiscalCode: { equals: 'CFFTRS80A01H501Z', mode: 'insensitive' } },
          ],
          isActive: true,
        })
      ).not.toThrow()
    })

    it('i campi non cifrati dello stesso modello', () => {
      expect(() =>
        verificaRicercaSuCifrati('Supplier', {
          name: { contains: 'Caffè' },
          vatNumber: { equals: '09876543210' },
        })
      ).not.toThrow()
    })

    it('qualunque cosa su un modello senza campi cifrati', () => {
      expect(() =>
        verificaRicercaSuCifrati('Venue', { iban: 'IT60X05428', codiceFiscale: { contains: 'X' } })
      ).not.toThrow()
    })

    it('un where assente o vuoto', () => {
      expect(() => verificaRicercaSuCifrati('Customer', undefined)).not.toThrow()
      expect(() => verificaRicercaSuCifrati('Customer', {})).not.toThrow()
    })
  })

  describe('il messaggio dice cosa fare', () => {
    it('quando la colonna hash esiste, indica quella', () => {
      const testo = messaggio(() =>
        verificaRicercaSuCifrati('Customer', { codiceFiscale: 'RSSMRA85M01H501W' })
      )

      expect(testo).toContain('Customer.codiceFiscale')
      expect(testo).toContain('codiceFiscaleHash')
      expect(testo).toContain('lookupHash')
    })

    it('quando la colonna hash non esiste, dice che serve una migrazione', () => {
      const testo = messaggio(() =>
        verificaRicercaSuCifrati('User', { fiscalCode: 'RSSMRA85M01H501W' })
      )

      expect(testo).toContain('User.fiscalCode')
      expect(testo).toContain('migrazione')
    })
  })
})
