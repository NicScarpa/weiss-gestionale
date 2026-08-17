import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { lookupHash } from '@/lib/encryption'

/**
 * Il presidio non deve solo esistere: deve stare sulla strada di ogni query.
 *
 * Qui non si prova la funzione, si prova il collegamento — le chiamate passano
 * dal client vero, con il database vero. Un presidio scritto e non innestato è
 * il caso peggiore: sembra proteggere e non protegge.
 */

setupIntegrationDb()

beforeEach(async () => {
  await prisma.customer.create({
    data: {
      denominazione: 'Bar Centrale',
      codiceFiscale: 'RSSMRA85M01H501W',
      partitaIva: '01234567890',
    },
  })
})

describe('il presidio sulle ricerche cifrate, dentro il client', () => {
  it('ferma una findMany che cerca dentro il campo cifrato', async () => {
    await expect(
      prisma.customer.findMany({ where: { codiceFiscale: 'RSSMRA85M01H501W' } })
    ).rejects.toThrow(/Customer\.codiceFiscale/)
  })

  it('ferma anche findFirst, count e deleteMany', async () => {
    await expect(
      prisma.customer.findFirst({ where: { codiceFiscale: { contains: 'RSSMRA' } } })
    ).rejects.toThrow(/codiceFiscale/)

    await expect(
      prisma.customer.count({ where: { codiceFiscale: 'RSSMRA85M01H501W' } })
    ).rejects.toThrow(/codiceFiscale/)

    await expect(
      prisma.customer.deleteMany({ where: { codiceFiscale: 'RSSMRA85M01H501W' } })
    ).rejects.toThrow(/codiceFiscale/)
  })

  it('la ricerca per hash passa e trova davvero il record', async () => {
    const trovati = await prisma.customer.findMany({
      where: { codiceFiscaleHash: lookupHash('RSSMRA85M01H501W') },
    })

    expect(trovati.map((c) => c.denominazione)).toEqual(['Bar Centrale'])
    // E il valore torna in chiaro: la cifratura resta trasparente in lettura.
    expect(trovati[0].codiceFiscale).toBe('RSSMRA85M01H501W')
  })

  it('il test di presenza passa e funziona', async () => {
    const conCodice = await prisma.customer.count({ where: { codiceFiscale: { not: null } } })
    const senzaCodice = await prisma.customer.count({ where: { codiceFiscale: null } })

    expect(conCodice).toBe(1)
    expect(senzaCodice).toBe(0)
  })

  it('le ricerche sui campi in chiaro non sono toccate', async () => {
    const trovati = await prisma.customer.findMany({
      where: { partitaIva: { contains: '0123' } },
    })

    expect(trovati).toHaveLength(1)
  })

  it('la scrittura di un campo cifrato non passa dal presidio', async () => {
    // Il divieto riguarda il *cercare*, non lo scrivere: la cifratura in
    // scrittura funziona da sempre e non deve essere disturbata.
    const creato = await prisma.customer.create({
      data: { denominazione: 'Altro Bar', codiceFiscale: 'VRDLGU90A01H501X' },
    })

    expect(creato.codiceFiscale).toBe('VRDLGU90A01H501X')
  })
})
