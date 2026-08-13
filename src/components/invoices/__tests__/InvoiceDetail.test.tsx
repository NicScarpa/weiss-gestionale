import { describe, it, expect } from 'vitest'
import { rigaBolloDaConfermare } from '../InvoiceDetail'
import { LINEA_BOLLO, LINEA_ARROTONDAMENTO } from '@/lib/sdi/righe-di-sistema'

/**
 * Task 8, round di revisione: "Accetta tutte" sul server aggiorna solo le
 * righe già in stato 'proposta' — e il bollo non ne ha mai una salvata
 * (nessun motore la scrive, vedi il report), quindi senza questa logica
 * l'azione lo ignorerebbe sempre. `rigaBolloDaConfermare` decide se e cosa
 * includere nella stessa richiesta; è pura per poter essere testata senza
 * montare `InvoiceDetail`, che avrebbe bisogno di mock per tre fetch
 * (fattura, conti, centri di costo) solo per arrivare a questa decisione.
 */
describe('rigaBolloDaConfermare', () => {
  it('bollo senza imputazione e conto trovato: propone la riga', () => {
    const righeSistema = [
      { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, imputazioni: [] },
    ]

    expect(rigaBolloDaConfermare(righeSistema, 'conto-bollo-id')).toEqual([
      { numeroLinea: LINEA_BOLLO, accountId: 'conto-bollo-id' },
    ])
  })

  it('bollo già imputato: non lo ripropone (eviterebbe di sovrascrivere una scelta esistente)', () => {
    const righeSistema = [
      {
        numeroLinea: LINEA_BOLLO,
        descrizione: 'Imposta di bollo',
        importo: 2,
        imputazioni: [
          { progressivo: 0, accountId: 'conto-scelto-a-mano', importo: 2, stato: 'proposta' as const, fonte: 'ai' },
        ],
      },
    ]

    expect(rigaBolloDaConfermare(righeSistema, 'conto-bollo-id')).toEqual([])
  })

  it('nessun bollo sulla fattura (niente riga -1 in righeSistema): niente da proporre', () => {
    const righeSistema = [
      { numeroLinea: LINEA_ARROTONDAMENTO, descrizione: 'Arrotondamento', importo: -0.01, imputazioni: [] },
    ]

    expect(rigaBolloDaConfermare(righeSistema, 'conto-bollo-id')).toEqual([])
  })

  it('conto 30.01 non trovato nella lista conti (contoBolloId undefined): niente da proporre', () => {
    const righeSistema = [
      { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, imputazioni: [] },
    ]

    expect(rigaBolloDaConfermare(righeSistema, undefined)).toEqual([])
  })

  it('righeSistema assente (fattura ancora in caricamento): niente da proporre, nessun errore', () => {
    expect(rigaBolloDaConfermare(undefined, 'conto-bollo-id')).toEqual([])
  })
})
