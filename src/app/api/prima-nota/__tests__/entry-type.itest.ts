import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { toDateOnlyUtc } from '@/lib/timezone'
import { giornoCorrente } from '@/lib/saldi'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { POST as creaMovimento } from '../route'

/**
 * Che operazione è un movimento lo dice chi lo inserisce, e va salvato.
 *
 * Prima non esisteva come colonna: la schermata lo ricavava da registro più
 * verso, e quei due dati non lo determinano. La metà in uscita di un
 * versamento — riga cassa in avere — è identica a una spesa in contanti, e
 * infatti si presentava come «Uscita». La route riceveva il tipo dall'utente,
 * lo usava per scegliere i registri e poi lo buttava via.
 *
 * È la stessa famiglia di `getMovementDirection`, che rispondeva 'DEBIT' su
 * entrambi i lati di un giroconto «a seconda del contesto»: un contesto che i
 * dati non contenevano. Lì ogni giroconto creava denaro dal nulla.
 */
setupIntegrationDb()

const OGGI = giornoCorrente()

async function registra(corpo: Record<string, unknown>) {
  return callRoute<{ error?: string }>(
    creaMovimento,
    jsonRequest('/api/prima-nota', {
      method: 'POST',
      body: {
        date: toDateOnlyUtc(OGGI).toISOString(),
        amount: 500,
        description: 'Movimento registrato a mano',
        ...corpo,
      },
    })
  )
}

async function righeScritte(venueId: string) {
  return prisma.journalEntry.findMany({
    where: { venueId },
    select: {
      registerType: true,
      entryType: true,
      transferId: true,
      debitAmount: true,
      creditAmount: true,
    },
  })
}

describe('POST /api/prima-nota, il tipo dichiarato viene salvato', () => {
  it('salva VERSAMENTO su ENTRAMBE le righe, anche su quella in uscita dalla cassa', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()

    // `registerType` è obbligatorio nello schema anche per i trasferimenti a
    // registri impliciti: per il versamento è il registro di partenza.
    const { status } = await registra({ entryType: 'VERSAMENTO', registerType: 'CASH' })
    expect(status).toBe(201)

    const righe = await righeScritte(venue.id)
    expect(righe).toHaveLength(2)

    // È il cuore del difetto: la riga in avere sulla cassa è indistinguibile
    // da una spesa in contanti se il tipo non è scritto.
    const cassa = righe.find((r) => r.registerType === 'CASH')!
    expect(cassa.creditAmount).not.toBeNull()
    expect(cassa.entryType).toBe('VERSAMENTO')

    const banca = righe.find((r) => r.registerType === 'BANK')!
    expect(banca.entryType).toBe('VERSAMENTO')
  })

  it('salva PRELIEVO su entrambe le righe', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()

    await registra({ entryType: 'PRELIEVO', registerType: 'BANK' })

    const righe = await righeScritte(venue.id)
    expect(righe.map((r) => r.entryType)).toEqual(['PRELIEVO', 'PRELIEVO'])
  })

  it('salva GIROCONTO senza confonderlo con un versamento', async () => {
    // Le due righe di un giroconto cassa→banca sono identiche a quelle di un
    // versamento: registri, verso e importi coincidono. Senza la colonna, la
    // distinzione non esiste nei dati — ed è la ragione per cui non si può
    // ricostruire a posteriori.
    await loginAs('admin')
    const venue = await venueDiTest()

    await registra({
      entryType: 'GIROCONTO',
      registerType: 'CASH',
      counterRegisterType: 'BANK',
    })

    const righe = await righeScritte(venue.id)
    expect(righe.map((r) => r.entryType)).toEqual(['GIROCONTO', 'GIROCONTO'])
  })

  it('salva il tipo anche sul movimento a riga singola', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()

    await registra({ entryType: 'USCITA', registerType: 'CASH' })

    const righe = await righeScritte(venue.id)
    expect(righe).toHaveLength(1)
    expect(righe[0].entryType).toBe('USCITA')
  })

  it("salva INCASSO, che il verso da solo non distingue da un'entrata qualsiasi", async () => {
    await loginAs('admin')
    const venue = await venueDiTest()

    await registra({ entryType: 'INCASSO', registerType: 'CASH' })

    const righe = await righeScritte(venue.id)
    expect(righe[0].entryType).toBe('INCASSO')
  })
})
