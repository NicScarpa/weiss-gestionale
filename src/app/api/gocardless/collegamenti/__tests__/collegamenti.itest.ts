import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { POST as creaCollegamento, GET as leggiCollegamento } from '../route'

setupIntegrationDb()
afterEach(() => impostaClientPerTest(null))

/** Client finto che registra cosa gli viene chiesto. */
function clientFinto(opzioni: { fallisceRequisition?: boolean; accessValidForDaysConcessi?: number } = {}) {
  const chiamate: string[] = []
  const client = {
    istituzioni: async () => ({
      dati: [{ id: 'BANCA_FINTA_XXXX', name: 'Banca Finta', transaction_total_days: '90', max_access_valid_for_days: '180' }],
      limiti: { restanti: null, ripresaFraSecondi: null },
    }),
    creaAgreement: async () => {
      chiamate.push('agreement')
      return {
        dati: { id: 'agr-1', max_historical_days: 90, access_valid_for_days: opzioni.accessValidForDaysConcessi ?? 180 },
        limiti: { restanti: null, ripresaFraSecondi: null },
      }
    },
    creaRequisition: async () => {
      chiamate.push('requisition')
      if (opzioni.fallisceRequisition) throw new Error('la banca ha detto di no')
      return { dati: { id: 'req-1', link: 'https://banca.finta/consenso/req-1', status: 'CR' }, limiti: { restanti: null, ripresaFraSecondi: null } }
    },
  } as unknown as ClientGoCardless
  return { client, chiamate }
}

describe('POST /api/gocardless/collegamenti', () => {
  it('crea la connessione e restituisce il link', async () => {
    await entraCome('admin')
    const { client } = clientFinto()
    impostaClientPerTest(client)

    const esito = await callRoute<{ connessioneId: string; link: string }>(
      creaCollegamento,
      jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } })
    )

    expect(esito.status).toBe(201)
    expect(esito.body.link).toBe('https://banca.finta/consenso/req-1')

    const riga = await prisma.bankConnection.findUnique({ where: { id: esito.body.connessioneId } })
    expect(riga).toMatchObject({
      institutionId: 'BANCA_FINTA_XXXX',
      institutionName: 'Banca Finta',
      requisitionId: 'req-1',
      agreementId: 'agr-1',
      status: 'CR',
      contiIgnorati: [],
    })
  })

  // Il punto della fase: la riga esiste prima che l'utente possa andarsene.
  it('la riga esiste già quando il link viene restituito', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const { client } = clientFinto()
    impostaClientPerTest(client)

    await callRoute(creaCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } }))

    const quante = await prisma.bankConnection.count({ where: { venueId: venue.id, deletedAt: null } })
    expect(quante).toBe(1)
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('manager')
    impostaClientPerTest(clientFinto().client)

    const esito = await callRoute(creaCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } }))

    expect(esito.status).toBe(403)
  })

  it('rifiuta un corpo senza istituto', async () => {
    await entraCome('admin')
    impostaClientPerTest(clientFinto().client)

    const esito = await callRoute(creaCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: {} }))

    expect(esito.status).toBe(400)
  })

  // Se la requisition fallisce non deve restare una connessione orfana in
  // stato CR che il pannello mostrerebbe come «collegamento in corso» per
  // sempre.
  it('non lascia una connessione a metà se la banca rifiuta la requisition', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    impostaClientPerTest(clientFinto({ fallisceRequisition: true }).client)

    const esito = await callRoute(creaCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } }))

    expect(esito.status).toBe(502)
    expect(await prisma.bankConnection.count({ where: { venueId: venue.id, deletedAt: null } })).toBe(0)
  })

  // Il campo gemello (`maxHistoricalDays`) usa già ciò che la banca concede;
  // questo deve fare lo stesso, perché finisce all'amministratore come data
  // di scadenza su cui si baserà il banner di rinnovo.
  it('la scadenza del consenso segue ciò che la banca concede, non ciò che è stato chiesto', async () => {
    await entraCome('admin')
    const { client } = clientFinto({ accessValidForDaysConcessi: 90 })
    impostaClientPerTest(client)

    const esito = await callRoute<{ connessioneId: string }>(
      creaCollegamento,
      jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } })
    )

    const riga = await prisma.bankConnection.findUnique({ where: { id: esito.body.connessioneId } })
    const giorniAllaScadenza = Math.round((riga!.accessValidUntil!.getTime() - Date.now()) / 86_400_000)
    // L'istituto finto dichiara max_access_valid_for_days: '180' (ciò che è
    // stato chiesto), ma la banca ne concede solo 90: deve vincere il valore
    // concesso.
    expect(giorniAllaScadenza).toBeGreaterThanOrEqual(89)
    expect(giorniAllaScadenza).toBeLessThanOrEqual(90)
  })

  // Decisione del proprietario: un secondo collegamento vivo per la stessa
  // sede non si crea, si rifiuta. Scollegare resta una scelta esplicita, e
  // il controllo sta prima di ogni chiamata alla banca per non sprecarne.
  it('rifiuta un secondo collegamento se ce n è già uno vivo per la sede', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'GIA_COLLEGATA',
        institutionName: 'Banca Già Collegata',
        requisitionId: 'req-viva',
        status: 'LN',
      },
    })
    const { client, chiamate } = clientFinto()
    impostaClientPerTest(client)

    const esito = await callRoute(
      creaCollegamento,
      jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } })
    )

    expect(esito.status).toBe(409)
    expect(JSON.stringify(esito.body)).toContain('Banca Già Collegata')
    // Niente chiamate alla banca: il controllo viene prima di tutte.
    expect(chiamate).toHaveLength(0)
  })

  it('permette un nuovo collegamento se il precedente è scollegato', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'VECCHIA',
        institutionName: 'Banca Vecchia',
        requisitionId: 'req-vecchia-scollegata',
        status: 'LN',
        deletedAt: new Date(),
      },
    })
    const { client } = clientFinto()
    impostaClientPerTest(client)

    const esito = await callRoute<{ connessioneId: string }>(
      creaCollegamento,
      jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } })
    )

    expect(esito.status).toBe(201)
  })
})

describe('GET /api/gocardless/collegamenti', () => {
  it('senza connessioni restituisce null', async () => {
    await entraCome('admin')
    const esito = await callRoute<{ connessione: unknown }>(leggiCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti'))
    expect(esito.body.connessione).toBeNull()
  })

  it('restituisce la connessione con lo stato spiegato in italiano', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'BANCA_FINTA_XXXX',
        institutionName: 'Banca Finta',
        requisitionId: 'req-9',
        status: 'LN',
        accessValidUntil: new Date('2027-02-08T00:00:00.000Z'),
      },
    })

    const esito = await callRoute<{ connessione: { istitutoNome: string; stato: { sigla: string; nome: string } } }>(
      leggiCollegamento,
      jsonRequest('http://localhost/api/gocardless/collegamenti')
    )

    expect(esito.body.connessione).toMatchObject({
      istitutoNome: 'Banca Finta',
      stato: { sigla: 'LN', nome: 'Collegata' },
    })
  })

  it('non mostra una connessione scollegata', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'X',
        institutionName: 'X',
        requisitionId: 'req-vecchia',
        status: 'LN',
        deletedAt: new Date(),
      },
    })

    const esito = await callRoute<{ connessione: unknown }>(leggiCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti'))
    expect(esito.body.connessione).toBeNull()
  })
})
