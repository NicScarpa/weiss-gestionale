import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { POST as rinnova } from '../route'

setupIntegrationDb()
afterEach(() => impostaClientPerTest(null))

function clientFinto() {
  return {
    istituzioni: async () => ({
      dati: [{ id: 'BANCA_FINTA_XXXX', name: 'Banca Finta', transaction_total_days: '90', max_access_valid_for_days: '180' }],
      limiti: { restanti: null, ripresaFraSecondi: null },
    }),
    creaAgreement: async () => ({ dati: { id: 'agr-2', max_historical_days: 90, access_valid_for_days: 180 }, limiti: { restanti: null, ripresaFraSecondi: null } }),
    creaRequisition: async () => ({ dati: { id: 'req-2', link: 'https://banca.finta/consenso/req-2', status: 'CR', accounts: [] }, limiti: { restanti: null, ripresaFraSecondi: null } }),
  } as unknown as ClientGoCardless
}

async function collegamentoScadutoConConto() {
  const venue = await venueDiTest()
  const connessione = await prisma.bankConnection.create({
    data: {
      venueId: venue.id,
      institutionId: 'BANCA_FINTA_XXXX',
      institutionName: 'Banca Finta',
      requisitionId: 'req-1',
      agreementId: 'agr-1',
      status: 'EX',
      accessValidUntil: new Date('2026-02-01T00:00:00.000Z'),
    },
  })
  const conto = await prisma.bankAccount.create({
    data: {
      venueId: venue.id,
      name: 'Conto principale',
      accountType: 'BANK',
      iban: 'IT00X0000000000000000001111',
      currency: 'EUR',
      connectionId: connessione.id,
      providerAccountId: 'gc-a',
      syncEnabled: true,
      syncCutoffDate: new Date('2026-05-01T00:00:00.000Z'),
    },
  })
  return { venue, connessione, conto }
}

describe('POST rinnovo del consenso', () => {
  it('restituisce un link nuovo e aggiorna la riga esistente', async () => {
    await entraCome('admin')
    const { connessione } = await collegamentoScadutoConConto()
    impostaClientPerTest(clientFinto())

    const esito = await callRoute<{ link: string }>(
      rinnova,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(200)
    expect(esito.body.link).toBe('https://banca.finta/consenso/req-2')

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga).toMatchObject({ requisitionId: 'req-2', agreementId: 'agr-2', status: 'CR' })
  })

  // È la ragione per cui questa rotta esiste invece di riusare DELETE + POST.
  it('non tocca la configurazione dei conti', async () => {
    await entraCome('admin')
    const { connessione, conto } = await collegamentoScadutoConConto()
    impostaClientPerTest(clientFinto())

    await callRoute(rinnova, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }), { id: connessione.id })

    const dopo = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(dopo).toMatchObject({ syncEnabled: true, connectionId: connessione.id, providerAccountId: 'gc-a' })
    expect(dopo.syncCutoffDate?.toISOString().slice(0, 10)).toBe('2026-05-01')
  })

  // La memoria dei conti si riferisce al consenso precedente: dopo l'SCA la
  // banca potrebbe esporre un insieme diverso, e riabbinare su dati vecchi
  // produrrebbe corrispondenze inventate.
  it('dimentica i conti letti, che appartengono al consenso vecchio', async () => {
    await entraCome('admin')
    const { connessione } = await collegamentoScadutoConConto()
    await prisma.bankConnection.update({
      where: { id: connessione.id },
      data: { contiLetti: [{ providerAccountId: 'gc-a', ibanHash: 'h', ibanMascherato: 'IT••1111', intestatario: null, valuta: 'EUR' }], contiLettiIl: new Date() },
    })
    impostaClientPerTest(clientFinto())

    await callRoute(rinnova, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }), { id: connessione.id })

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiLetti).toBeNull()
    expect(riga.contiLettiIl).toBeNull()
  })

  // Il punto del Critical della revisione finale: l'autenticazione in banca
  // è un passo fuori dal controllo del gestionale, e può non completarsi mai
  // (OTP sbagliato, app scaduta, scheda chiusa) — l'evento più ordinario di
  // tutta l'integrazione. Se questa POST spostasse già la scadenza,
  // l'avviso di rinnovo sparirebbe per un consenso mai davvero concesso, e
  // l'unica uscita rimasta sarebbe scollegare.
  it('non sposta la scadenza finché l autenticazione non è completata', async () => {
    await entraCome('admin')
    const { connessione } = await collegamentoScadutoConConto()
    const scadenzaPrimaDelRinnovo = connessione.accessValidUntil
    impostaClientPerTest(clientFinto())

    const esito = await callRoute(
      rinnova,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(200)
    // Il client finto risponde con la requisition in 'CR': l'autenticazione
    // non è ancora avvenuta.
    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.status).toBe('CR')
    expect(riga.accessValidUntil?.toISOString()).toBe(scadenzaPrimaDelRinnovo?.toISOString())
  })

  it('non rinnova il collegamento di un altra sede', async () => {
    await entraCome('admin')
    const { connessione } = await collegamentoScadutoConConto()
    const altra = await prisma.venue.create({ data: { name: 'Altra sede', code: 'ALTRA' } })
    await prisma.bankConnection.update({ where: { id: connessione.id }, data: { venueId: altra.id } })
    impostaClientPerTest(clientFinto())

    const esito = await callRoute(rinnova, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }), { id: connessione.id })

    expect(esito.status).toBe(404)
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('manager')
    const { connessione } = await collegamentoScadutoConConto()
    impostaClientPerTest(clientFinto())

    const esito = await callRoute(rinnova, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }), { id: connessione.id })

    expect(esito.status).toBe(403)
  })
})
