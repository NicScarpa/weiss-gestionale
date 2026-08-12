import { describe, it, expect, beforeEach } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaMovimento, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { findScheduleCandidates, findEntryCandidates } from '../schedule-matcher'

/**
 * «Unico match possibile» e «N alternative» non si calcolano nella funzione
 * pura: dipendono dall'insieme dei candidati restituiti dal database, quindi
 * servono righe vere e non si possono coprire con un test unitario.
 *
 * Il terzo test di ciascun blocco è quello che conta davvero: candidati sopra
 * soglia in numero maggiore del `limit` richiesto. L'iniezione avviene dopo
 * il filtro sulla soglia minima ma prima dello `slice` sul limite — se
 * qualcuno la spostasse dopo lo slice, il conteggio mostrato all'utente
 * conterebbe solo i candidati restituiti invece di quelli davvero in gara, e
 * mentirebbe silenziosamente. Con limite 1 e tre candidati validi, l'unico
 * restituito deve comunque dire "3 alternative", non "Unico match possibile".
 */
setupIntegrationDb()

let venueId: string

beforeEach(async () => {
  venueId = (await venueDiTest()).id
})

describe('findScheduleCandidates — motivazioni sul conteggio dei candidati', () => {
  it('un solo candidato sopra soglia porta "Unico match possibile"', async () => {
    const movimento = await creaMovimento({ uscita: 500, date: new Date('2026-08-10'), venueId })
    await creaScadenza({
      tipo: 'passiva',
      importoTotale: 500,
      dataScadenza: new Date('2026-08-10'),
      venueId,
    })

    const candidati = await findScheduleCandidates(movimento.id, venueId)

    expect(candidati).toHaveLength(1)
    expect(candidati[0].motivazioni).toContain('Unico match possibile')
  })

  it('tre candidati sopra soglia portano tutti "3 alternative", nessuno "Unico match possibile"', async () => {
    const movimento = await creaMovimento({ uscita: 500, date: new Date('2026-08-10'), venueId })
    for (let i = 0; i < 3; i++) {
      await creaScadenza({
        tipo: 'passiva',
        importoTotale: 500,
        dataScadenza: new Date('2026-08-10'),
        descrizione: `Fattura fornitore ${i}`,
        venueId,
      })
    }

    const candidati = await findScheduleCandidates(movimento.id, venueId)

    expect(candidati).toHaveLength(3)
    for (const c of candidati) {
      expect(c.motivazioni).toContain('3 alternative')
      expect(c.motivazioni).not.toContain('Unico match possibile')
    }
  })

  it('con limit=1 su tre candidati validi, il conteggio resta "3 alternative"', async () => {
    const movimento = await creaMovimento({ uscita: 500, date: new Date('2026-08-10'), venueId })
    for (let i = 0; i < 3; i++) {
      await creaScadenza({
        tipo: 'passiva',
        importoTotale: 500,
        dataScadenza: new Date('2026-08-10'),
        descrizione: `Fattura fornitore ${i}`,
        venueId,
      })
    }

    const candidati = await findScheduleCandidates(movimento.id, venueId, 1)

    expect(candidati).toHaveLength(1)
    expect(candidati[0].motivazioni).toContain('3 alternative')
    expect(candidati[0].motivazioni).not.toContain('Unico match possibile')
  })
})

describe('findEntryCandidates — motivazioni sul conteggio dei candidati', () => {
  it('un solo candidato sopra soglia porta "Unico match possibile"', async () => {
    const scadenza = await creaScadenza({
      tipo: 'passiva',
      importoTotale: 500,
      dataScadenza: new Date('2026-08-10'),
      venueId,
    })
    await creaMovimento({ uscita: 500, date: new Date('2026-08-10'), venueId })

    const candidati = await findEntryCandidates(scadenza.id, venueId)

    expect(candidati).toHaveLength(1)
    expect(candidati[0].motivazioni).toContain('Unico match possibile')
  })

  it('tre candidati sopra soglia portano tutti "3 alternative", nessuno "Unico match possibile"', async () => {
    const scadenza = await creaScadenza({
      tipo: 'passiva',
      importoTotale: 500,
      dataScadenza: new Date('2026-08-10'),
      venueId,
    })
    for (let i = 0; i < 3; i++) {
      await creaMovimento({
        uscita: 500,
        date: new Date('2026-08-10'),
        description: `Bonifico ${i}`,
        venueId,
      })
    }

    const candidati = await findEntryCandidates(scadenza.id, venueId)

    expect(candidati).toHaveLength(3)
    for (const c of candidati) {
      expect(c.motivazioni).toContain('3 alternative')
      expect(c.motivazioni).not.toContain('Unico match possibile')
    }
  })

  it('con limit=1 su tre candidati validi, il conteggio resta "3 alternative"', async () => {
    const scadenza = await creaScadenza({
      tipo: 'passiva',
      importoTotale: 500,
      dataScadenza: new Date('2026-08-10'),
      venueId,
    })
    for (let i = 0; i < 3; i++) {
      await creaMovimento({
        uscita: 500,
        date: new Date('2026-08-10'),
        description: `Bonifico ${i}`,
        venueId,
      })
    }

    const candidati = await findEntryCandidates(scadenza.id, venueId, 1)

    expect(candidati).toHaveLength(1)
    expect(candidati[0].motivazioni).toContain('3 alternative')
    expect(candidati[0].motivazioni).not.toContain('Unico match possibile')
  })
})
