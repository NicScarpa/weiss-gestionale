import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { GET, POST, PUT } from '../route'

/**
 * L'anagrafica cliente con l'insieme completo di campi.
 *
 * Il cliente non aveva paese né termini di pagamento — che il fornitore invece
 * ha — e il suo codice fiscale, cifrato dall'estensione Prisma, non aveva la
 * colonna hash di appoggio: la ricerca lo cercava con `contains` dentro il
 * testo cifrato, quindi non trovava mai nulla e non lo diceva a nessuno.
 */

setupIntegrationDb()

type Corpo = {
  error?: string
  customer?: Record<string, unknown>
  customers?: Array<Record<string, unknown>>
}

const CLIENTE = {
  denominazione: 'Bar Centrale S.r.l.',
  partitaIva: '01234567890',
  codiceFiscale: 'RSSMRA85M01H501W',
  email: 'info@barcentrale.it',
  telefono: '+39 0434 000000',
  indirizzo: 'Via Roma 1',
  cap: '33077',
  citta: 'Sacile',
  provincia: 'PN',
  paese: 'IT',
  iban: 'IT60X0542811101000000123456',
  paymentTermsDays: 60,
  note: 'Paga a 60 giorni',
  attivo: true,
}

beforeEach(async () => {
  logout()
  await entraCome('admin')
})

describe('anagrafica cliente completa', () => {
  it('salva anche paese e termini di pagamento', async () => {
    const creazione = await callRoute<Corpo>(
      POST,
      jsonRequest('http://localhost/api/customers', { method: 'POST', body: CLIENTE })
    )

    expect(creazione.status).toBe(200)

    const salvato = await prisma.customer.findFirstOrThrow({
      where: { denominazione: CLIENTE.denominazione },
    })
    expect(salvato.paese).toBe('IT')
    expect(salvato.paymentTermsDays).toBe(60)
    expect(salvato.telefono).toBe('+39 0434 000000')
  })

  it('il paese vale IT quando non lo si indica', async () => {
    await callRoute<Corpo>(
      POST,
      jsonRequest('http://localhost/api/customers', {
        method: 'POST',
        body: { denominazione: 'Cliente senza paese' },
      })
    )

    const salvato = await prisma.customer.findFirstOrThrow({
      where: { denominazione: 'Cliente senza paese' },
    })
    expect(salvato.paese).toBe('IT')
  })

  it('trova il cliente cercandolo per codice fiscale', async () => {
    await callRoute<Corpo>(
      POST,
      jsonRequest('http://localhost/api/customers', { method: 'POST', body: CLIENTE })
    )

    const ricerca = await callRoute<Corpo>(
      GET,
      jsonRequest(`http://localhost/api/customers?q=${CLIENTE.codiceFiscale}`)
    )

    expect(ricerca.status).toBe(200)
    expect(ricerca.body.customers?.map((c) => c.denominazione)).toContain(CLIENTE.denominazione)
  })

  it('il codice fiscale non resta in chiaro nel database', async () => {
    await callRoute<Corpo>(
      POST,
      jsonRequest('http://localhost/api/customers', { method: 'POST', body: CLIENTE })
    )

    const [riga] = await prisma.$queryRawUnsafe<Array<{ codice_fiscale: string | null }>>(
      'SELECT codice_fiscale FROM customers WHERE denominazione = $1',
      CLIENTE.denominazione
    )
    expect(riga.codice_fiscale).not.toBe(CLIENTE.codiceFiscale)
  })

  it('rifiuta un secondo cliente con lo stesso codice fiscale', async () => {
    // Il controllo dei duplicati confrontava il codice in chiaro con quello
    // cifrato nel database: non coincidevano mai, e lo stesso soggetto poteva
    // entrare in anagrafica quante volte si voleva.
    await callRoute<Corpo>(
      POST,
      jsonRequest('http://localhost/api/customers', { method: 'POST', body: CLIENTE })
    )

    const secondo = await callRoute<Corpo>(
      POST,
      jsonRequest('http://localhost/api/customers', {
        method: 'POST',
        body: { ...CLIENTE, denominazione: 'Stesso soggetto, altro nome', partitaIva: null },
      })
    )

    expect(secondo.status).toBe(409)
    expect(secondo.body.error).toContain('Codice Fiscale')
  })

  it('la modifica aggiorna i campi nuovi', async () => {
    const creazione = await callRoute<Corpo>(
      POST,
      jsonRequest('http://localhost/api/customers', { method: 'POST', body: CLIENTE })
    )
    const id = (creazione.body.customer as { id: string }).id

    await callRoute<Corpo>(
      PUT,
      jsonRequest('http://localhost/api/customers', {
        method: 'PUT',
        body: { ...CLIENTE, id, paymentTermsDays: 30, paese: 'DE' },
      })
    )

    const salvato = await prisma.customer.findUniqueOrThrow({ where: { id } })
    expect(salvato.paymentTermsDays).toBe(30)
    expect(salvato.paese).toBe('DE')
  })
})
