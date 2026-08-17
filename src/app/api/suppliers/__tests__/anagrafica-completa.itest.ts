import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { GET, POST, PUT } from '../route'

/**
 * L'anagrafica fornitore, allineata a quella cliente.
 *
 * Al fornitore mancavano telefono e note, che il cliente aveva; e codice
 * fiscale e paese esistevano nel database — il primo perfino cifrato, con il
 * suo hash — senza che nessuna schermata né la rotta potessero scriverli:
 * arrivavano solo dall'import delle fatture elettroniche.
 */

setupIntegrationDb()

type Corpo = {
  error?: string
  supplier?: Record<string, unknown>
  suppliers?: Array<Record<string, unknown>>
}

const FORNITORE = {
  name: 'Caffè Trieste S.p.A.',
  vatNumber: '09876543210',
  fiscalCode: 'CFFTRS80A01H501Z',
  email: 'ordini@caffetrieste.it',
  phone: '+39 040 000000',
  address: 'Via del Porto 12',
  postalCode: '34121',
  city: 'Trieste',
  province: 'TS',
  country: 'IT',
  iban: 'IT60X0542811101000000123456',
  paymentTermsDays: 30,
  notes: 'Consegna il martedì',
  isActive: true,
}

beforeEach(async () => {
  logout()
  await entraCome('admin')
})

async function crea(corpo: Record<string, unknown>) {
  return callRoute<Corpo>(
    POST,
    jsonRequest('http://localhost/api/suppliers', { method: 'POST', body: corpo })
  )
}

describe('anagrafica fornitore completa', () => {
  it('salva telefono e note, che prima non aveva', async () => {
    await crea(FORNITORE)

    const salvato = await prisma.supplier.findFirstOrThrow({ where: { name: FORNITORE.name } })
    expect(salvato.phone).toBe('+39 040 000000')
    expect(salvato.notes).toBe('Consegna il martedì')
  })

  it('salva codice fiscale e paese, che nessuna schermata poteva scrivere', async () => {
    await crea(FORNITORE)

    const salvato = await prisma.supplier.findFirstOrThrow({ where: { name: FORNITORE.name } })
    expect(salvato.fiscalCode).toBe('CFFTRS80A01H501Z')
    expect(salvato.country).toBe('IT')
  })

  it('il codice fiscale non resta in chiaro nel database', async () => {
    await crea(FORNITORE)

    const [riga] = await prisma.$queryRawUnsafe<Array<{ fiscal_code: string | null }>>(
      'SELECT fiscal_code FROM suppliers WHERE name = $1',
      FORNITORE.name
    )
    expect(riga.fiscal_code).not.toBe(FORNITORE.fiscalCode)
  })

  it('trova il fornitore cercandolo per codice fiscale', async () => {
    await crea(FORNITORE)

    const ricerca = await callRoute<Corpo>(
      GET,
      jsonRequest(`http://localhost/api/suppliers?q=${FORNITORE.fiscalCode}`)
    )

    expect(ricerca.body.suppliers?.map((s) => s.name)).toContain(FORNITORE.name)
  })

  it('la modifica aggiorna i campi nuovi', async () => {
    const creazione = await crea(FORNITORE)
    const id = (creazione.body.supplier as { id: string }).id

    await callRoute<Corpo>(
      PUT,
      jsonRequest('http://localhost/api/suppliers', {
        method: 'PUT',
        body: { id, phone: '+39 040 111111', notes: 'Consegna il giovedì', country: 'DE' },
      })
    )

    const salvato = await prisma.supplier.findUniqueOrThrow({ where: { id } })
    expect(salvato.phone).toBe('+39 040 111111')
    expect(salvato.notes).toBe('Consegna il giovedì')
    expect(salvato.country).toBe('DE')
  })

  it('la lista completa restituisce anche i campi nuovi', async () => {
    await crea(FORNITORE)

    const lista = await callRoute<Corpo>(
      GET,
      jsonRequest('http://localhost/api/suppliers?full=true')
    )
    const trovato = lista.body.suppliers?.find((s) => s.name === FORNITORE.name)

    expect(trovato).toMatchObject({
      phone: '+39 040 000000',
      notes: 'Consegna il martedì',
      country: 'IT',
      fiscalCode: 'CFFTRS80A01H501Z',
    })
  })
})
