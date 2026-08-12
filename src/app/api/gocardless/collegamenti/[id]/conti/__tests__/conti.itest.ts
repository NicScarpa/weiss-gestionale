import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { GET as leggiConti, PUT as salvaConti } from '../route'

setupIntegrationDb()
afterEach(() => impostaClientPerTest(null))

const IBAN_A = 'IT00X0000000000000000001111'
const IBAN_B = 'IT00X0000000000000000002222'

async function connessioneCollegata(conti: string[]) {
  const venue = await venueDiTest()
  const connessione = await prisma.bankConnection.create({
    data: {
      venueId: venue.id,
      institutionId: 'BANCA_FINTA_XXXX',
      institutionName: 'Banca Finta',
      requisitionId: 'req-1',
      status: 'LN',
    },
  })
  impostaClientPerTest({
    leggiRequisition: async () => ({ dati: { id: 'req-1', status: 'LN', accounts: conti, link: '' }, limiti: { restanti: null, ripresaFraSecondi: null } }),
    dettagliConto: async (id: string) => ({
      dati: { account: { iban: id === 'gc-a' ? IBAN_A : IBAN_B, currency: 'EUR' } },
      limiti: { restanti: null, ripresaFraSecondi: null },
    }),
  } as unknown as ClientGoCardless)
  return { venue, connessione }
}

async function contoDiTest(venueId: string, nome: string, iban: string) {
  return prisma.bankAccount.create({
    data: { venueId, name: nome, accountType: 'BANK', iban, currency: 'EUR' },
  })
}

describe('GET conti di un collegamento', () => {
  it('abbina i conti riconosciuti e lascia sconosciuti gli altri', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a', 'gc-b'])
    await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute<{ conti: Array<{ tipo: string; nomeConto?: string }> }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.status).toBe(200)
    expect(esito.body.conti[0]).toMatchObject({ tipo: 'riconosciuto', nomeConto: 'Conto principale' })
    expect(esito.body.conti[1]).toMatchObject({ tipo: 'sconosciuto' })
  })

  it('dice qual è il movimento più recente che gia possiede per il conto riconosciuto', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)
    await prisma.bankTransaction.create({
      data: {
        venueId: venue.id,
        bankAccountId: conto.id,
        transactionDate: new Date('2026-07-31T00:00:00.000Z'),
        description: 'Movimento da CSV',
        amount: '10.00',
      },
    })

    const esito = await callRoute<{ conti: Array<{ ultimoMovimento: string | null }> }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0].ultimoMovimento).toBe('2026-07-31')
  })

  it('per un conto senza movimenti l ultimo movimento è nullo, non una data inventata', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute<{ conti: Array<{ ultimoMovimento: string | null }> }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0].ultimoMovimento).toBeNull()
  })

  it('non chiede più un conto già ignorato', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])
    await prisma.bankConnection.update({ where: { id: connessione.id }, data: { contiIgnorati: ['gc-a'] } })

    const esito = await callRoute<{ conti: Array<{ tipo: string }> }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0].tipo).toBe('ignorato')
  })

  it('non espone il collegamento di un altra sede', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])
    // `Venue.code` è obbligatorio e unico: senza, la `create` fallisce.
    const altra = await prisma.venue.create({ data: { name: 'Altra sede', code: 'ALTRA' } })
    await prisma.bankConnection.update({ where: { id: connessione.id }, data: { venueId: altra.id } })

    const esito = await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    expect(esito.status).toBe(404)
  })
})

describe('PUT configurazione dei conti', () => {
  it('accende un conto con la sua data di taglio', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute<{ salvati: number }>(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'importa', bankAccountId: conto.id, dataTaglio: '2026-08-12' }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(200)
    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({
      providerAccountId: 'gc-a',
      connectionId: connessione.id,
      syncEnabled: true,
    })
    expect(aggiornato.syncCutoffDate?.toISOString().slice(0, 10)).toBe('2026-08-12')
  })

  // La data di taglio è l'unica cosa che impedisce di reimportare quello che
  // il CSV ha già portato dentro: senza, non si accende niente.
  it('rifiuta di accendere un conto senza data di taglio', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'importa', bankAccountId: conto.id }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(400)
    expect(await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })).toMatchObject({ syncEnabled: false })
  })

  it('un conto ignorato finisce nella lista della connessione e non accende nulla', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])

    await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'ignora' }] },
      }),
      { id: connessione.id }
    )

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiIgnorati).toEqual(['gc-a'])
  })

  it('«lascia» non tocca niente', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'lascia' }] },
      }),
      { id: connessione.id }
    )

    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({ syncEnabled: false, providerAccountId: null, connectionId: null })
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('staff')
    const { connessione } = await connessioneCollegata(['gc-a'])

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(403)
  })
})
